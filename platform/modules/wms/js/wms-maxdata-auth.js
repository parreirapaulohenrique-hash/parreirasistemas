// =============================================================
// WmsMaxdataAuth — token JWT único do MaxData para todo o WMS
// (WMS Desktop e WMS Coletor)
// -------------------------------------------------------------
// O token gerado em POST /auth vale 1 hora. Regras:
//  1. Cache em localStorage (connectorConfig._maxdataToken) com a
//     expiração REAL lida do JWT (campo expiresAt).
//  2. Renovação preventiva: faltando < 3 min, gera um novo token.
//  3. Rede de segurança: se a API responder HTTP 401, descarta o
//     token, autentica de novo e repete a chamada uma vez.
//  4. Token amarrado a empId + terminal + URL: trocar de filial
//     nunca reaproveita o token de outra filial.
//  5. Renovações simultâneas são deduplicadas (1 só POST /auth).
// Usado pelo conector 'maxdata' e WmsMaxdataPoller
// (wms-integration.js) e pelo wms-procedures.js.
// Deve ser carregado ANTES desses arquivos.
// =============================================================
window.WmsMaxdataAuth = (function () {
    'use strict';

    // Chaves oficiais do integrador (CENTRALROLAMENTOS)
    const APP = {
        name: '5ca47be1-418b-4051-b490-830486f27f05',
        key:  'fa2314d0-4a4d-4133-b577-34b14bb9d85d75471f51-0855-4e50-aa36-3c8ad5d8a0a1',
        desc: 'CENTRALROLAMENTOS'
    };
    const SAFETY_MS   = 3 * 60 * 1000;   // renova faltando 3 min
    const FALLBACK_MS = 50 * 60 * 1000;  // se o JWT não informar a validade
    let _inflight = null;

    function _icKey() {
        if (window.getTenantSuffix && window.getTenantSuffix()) return 'wms_integration_config' + window.getTenantSuffix();
        let t = 'centralpecas';
        try {
            const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
            t = sess?.tenant || sess?.tenantId || t;
        } catch (_) {}
        return 'wms_integration_config_' + String(t).replace('_hml', '');
    }
    function _readIc() {
        try { return JSON.parse(localStorage.getItem(_icKey()) || '{}'); } catch (_) { return {}; }
    }
    function _writeToken(cache) {
        const ic = _readIc();
        if (!ic.connectorConfig) ic.connectorConfig = {};
        if (cache) ic.connectorConfig._maxdataToken = cache;
        else delete ic.connectorConfig._maxdataToken;
        localStorage.setItem(_icKey(), JSON.stringify(ic));
    }

    /** Config efetiva (salva), opcionalmente sobreposta por valores do formulário. */
    function cfg(override = {}) {
        const cc = { ...(_readIc().connectorConfig || {}), ...override };
        return {
            baseUrl:        String(cc.baseUrl || 'http://rds.skytins.com.br:8720/v2').trim()
                                .replace(/\.con\.br/gi, '.com.br').replace(/\/+$/, ''),
            empId:          Number(cc.empId || 1),
            terminal:       String(cc.terminal || '364F64E6539974C1D75C8A46C14B2D3D').trim(),
            appName:        cc.appName        || APP.name,
            appKey:         cc.appKey         || APP.key,
            appDescription: cc.appDescription || APP.desc,
            token:          cc._maxdataToken  || null
        };
    }

    /** Em página HTTPS com API HTTP, passa pelo proxy /api/maxdata (evita mixed content/CORS). */
    function buildUrl(endpoint, params = {}, override = {}) {
        const base = cfg(override).baseUrl;
        const ep   = String(endpoint).replace(/^\/+/, '');
        if (typeof location !== 'undefined' && location.protocol === 'https:' && base.startsWith('http://')) {
            return '/api/maxdata?' + new URLSearchParams({ _path: ep, _apiUrl: base, ...params }).toString();
        }
        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
        return `${base}/${ep}${qs}`;
    }

    // O MaxData envia nanossegundos (16:33:20.747474302-03:00) — reduz para ms antes do parse.
    function _parseDate(v) {
        const d = new Date(typeof v === 'string' ? v.replace(/(\.\d{3})\d+/, '$1') : v);
        return isNaN(d.getTime()) ? null : d;
    }
    function _expiry(token, data) {
        try {
            const b64  = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(atob(b64).split('').map(ch =>
                '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2)).join(''));
            const p = JSON.parse(json);
            const d = p.expiresAt ? _parseDate(p.expiresAt) : (p.exp ? new Date(p.exp * 1000) : null);
            if (d) return d;
        } catch (_) {}
        return _parseDate(data.expiresAt) || _parseDate(data.expiration) || new Date(Date.now() + FALLBACK_MS);
    }
    function _isValid(t, c) {
        return !!(t && t.value && t.empId === c.empId && t.terminal === c.terminal && t.baseUrl === c.baseUrl &&
                  new Date(t.expiresAt).getTime() - Date.now() > SAFETY_MS);
    }

    async function _requestToken(c, persist) {
        const resp = await fetch(buildUrl('auth', {}, { baseUrl: c.baseUrl }), {
            method: 'POST',
            headers: {
                'Content-Type':            'application/json',
                'application_name':        c.appName,
                'application_key':         c.appKey,
                'application_description': c.appDescription
            },
            body:   JSON.stringify({ empId: c.empId, terminal: c.terminal, idUser: 0 }),
            signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
        });
        if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            throw new Error(`MaxData Auth HTTP ${resp.status}${txt ? ': ' + txt : ''}`);
        }
        const data = await resp.json();
        if (!data.token) throw new Error('Token não retornado pelo MaxData.');
        const cache = {
            value:     data.token,
            expiresAt: _expiry(data.token, data).toISOString(),
            empId:     c.empId,
            terminal:  c.terminal,
            baseUrl:   c.baseUrl
        };
        if (persist) _writeToken(cache);
        console.log(`[WmsMaxdataAuth] Token renovado — empId ${c.empId}, válido até ${new Date(cache.expiresAt).toLocaleTimeString('pt-BR')}`);
        return data.token;
    }

    /**
     * Retorna um token válido. force=true ignora o cache.
     * override: valores ainda não salvos (ex.: botão "Testar Conexão") — nesse caso o token não é persistido.
     */
    async function getToken(force = false, override = null) {
        const c = cfg(override || {});
        if (!c.baseUrl || !c.empId || !c.terminal)
            throw new Error('Maxdata não configurado. Acesse Configurações → Integração.');
        if (override) return _requestToken(c, false);
        if (!force && _isValid(c.token, c)) return c.token.value;
        if (!_inflight) _inflight = _requestToken(c, true).finally(() => { _inflight = null; });
        return _inflight;
    }

    function invalidate() { _writeToken(null); }

    /** fetch autenticado: injeta o Bearer atual e, em HTTP 401, renova o token e repete 1 vez. */
    async function request(url, options = {}) {
        const extra = { ...(options.headers || {}) };
        delete extra.Authorization;
        delete extra.authorization;
        const send = (tk) => fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...extra, 'Authorization': `Bearer ${tk}` }
        });
        let resp = await send(await getToken());
        if (resp.status === 401) {
            console.warn('[WmsMaxdataAuth] HTTP 401 — token expirado/rejeitado. Renovando e repetindo a chamada...');
            invalidate();
            resp = await send(await getToken(true));
        }
        return resp;
    }

    return { cfg, buildUrl, getToken, invalidate, fetch: request };
})();

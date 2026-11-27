// =============================================================
// WmsErpCatalog — produtos, saldos e clientes do ERP dentro do WMS
// -------------------------------------------------------------
// • Produtos do ERP (~19 mil) ficam num catálogo local no navegador
//   (IndexedDB), porque não cabem no localStorage (~5 MB).
//   Alimentado pelo botão "Sincronizar Produtos" (Configurações →
//   Integrações) e lido pelo Cadastro de Produtos e pela Consulta
//   de Estoque.
// • Saldo ERP: o MaxData informa saldo por PRODUTO (sem endereço).
//   - Exibido como "Saldo ERP" informativo.
//   - Carga inicial: vira saldo "SEM ENDEREÇO" (= saldo ERP − saldo
//     já endereçado no WMS), distribuído depois pela Transferência
//     de Endereço com origem "SEM ENDEREÇO".
// • Clientes do ERP → Cadastro de Clientes do WMS (wms_cadastros).
// Edições locais do WMS (curva ABC, lote, validade, EAN...) são
// preservadas: a sincronização só sobrescreve os campos do ERP.
// =============================================================
window.WmsErpCatalog = (function () {
    'use strict';

    const DB_VERSION   = 1;
    const ST_PROD      = 'produtos';
    const ST_SEM       = 'semEndereco';
    const ST_META      = 'meta';
    const SEM_ENDERECO = 'SEM ENDEREÇO';
    const CAD_KEY      = 'wms_cadastros';   // mesma chave usada por cadastros.js

    let _dbPromise = null;
    let _cache     = null;   // array de produtos em memória (invalidado a cada sync)

    // ─── Infra IndexedDB ─────────────────────────────────────────
    function _suffix() {
        if (window.getTenantSuffix && window.getTenantSuffix()) return window.getTenantSuffix();
        try {
            const s = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
            const t = s?.tenant || s?.tenantId;
            if (t) return '_' + String(t).replace('_hml', '');
        } catch (_) {}
        return '_centralpecas';
    }

    function _open() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) { reject(new Error('IndexedDB indisponível neste navegador.')); return; }
            const req = indexedDB.open('wms_erp_catalog' + _suffix(), DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(ST_PROD)) {
                    const s = db.createObjectStore(ST_PROD, { keyPath: 'sku' });
                    s.createIndex('codigoFab', 'codigoFab', { unique: false });
                    s.createIndex('ean', 'ean', { unique: false });
                }
                if (!db.objectStoreNames.contains(ST_SEM))  db.createObjectStore(ST_SEM,  { keyPath: 'sku' });
                if (!db.objectStoreNames.contains(ST_META)) db.createObjectStore(ST_META, { keyPath: 'k' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => { _dbPromise = null; reject(req.error); };
        });
        return _dbPromise;
    }

    const _req  = (r)  => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const _done = (tx) => new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror    = () => rej(tx.error);
        tx.onabort    = () => rej(tx.error || new Error('Transação abortada.'));
    });
    const _norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

    async function _getAll(store) {
        const db = await _open();
        return _req(db.transaction(store).objectStore(store).getAll());
    }
    async function _produtos() {
        if (!_cache) _cache = await _getAll(ST_PROD);
        return _cache;
    }
    async function getMeta(k) {
        const db = await _open();
        const r  = await _req(db.transaction(ST_META).objectStore(ST_META).get(k));
        return r ? r.v : null;
    }
    async function _setMeta(k, v) {
        const db = await _open();
        const tx = db.transaction(ST_META, 'readwrite');
        tx.objectStore(ST_META).put({ k, v });
        return _done(tx);
    }

    // ─── Produtos ────────────────────────────────────────────────
    /** GET /v2/product → registro do catálogo. SKU = ID do produto no MaxData (o mesmo usado nas NFs de entrada). */
    function mapProduct(raw, syncId) {
        return {
            sku:            String(raw.id),
            codigoErp:      raw.id,
            descricao:      String(raw.descricao || '').trim(),
            codigoFab:      String(raw.codigoFab || '').trim(),
            grupo:          raw.grupo || '',
            subGrupo:       raw.subGrupo || '',
            fabricante:     raw.fabricante || '',
            unidade:        raw.un || 'UN',
            pesoBruto:      Number(raw.peso || 0),
            pesoLiquido:    Number(raw.pesoLiq || 0),
            altura:         Number(raw.altura || 0),
            largura:        Number(raw.largura || 0),
            profundidade:   Number(raw.comprimento || 0),
            estoqueMinimo:  Number(raw.estoqueMinimo || 0),
            saldoErp:       Number(raw.estoque || 0),
            localizadorErp: raw.localizador || '',
            empIdErp:       raw.empId ?? null,
            ativo:          !(raw.desativado === true || raw.desativado === 'true'),
            _busca:         _norm([raw.id, raw.codigoFab, raw.descricao, raw.fabricante, raw.aplicacao].join(' ')),
            _source:        'maxdata',
            _syncId:        syncId,
            _syncedAt:      new Date().toISOString()
        };
    }

    async function _defaultFetchJson(path, params) {
        if (!window.WmsMaxdataAuth) throw new Error('Integração MaxData não carregada.');
        const r = await window.WmsMaxdataAuth.fetch(window.WmsMaxdataAuth.buildUrl(path, params), {
            method: 'GET', signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined
        });
        if (!r.ok) throw new Error(`GET /${path}: HTTP ${r.status}`);
        return r.json();
    }

    async function _withRetry(fn, tentativas = 3) {
        let ultimo;
        for (let i = 0; i < tentativas; i++) {
            try { return await fn(); } catch (e) { ultimo = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
        }
        throw ultimo;
    }

    /**
     * Baixa todos os produtos do ERP (GET /v2/product paginado) para o catálogo local.
     * opts.fetchJson(path, params) → JSON (padrão: WmsMaxdataAuth). opts.onLog(tipo, msg). opts.onProgress(salvos, total).
     */
    async function syncProducts(opts = {}) {
        const log       = opts.onLog || ((t, m) => console.log('[WmsErpCatalog]', m));
        const fetchJson = opts.fetchJson || _defaultFetchJson;
        const limit     = opts.limit || 500;
        const syncId    = 'S' + Date.now();
        const inicio    = Date.now();
        let page = 1, pages = 1, total = 0, salvos = 0, novos = 0;

        log('info', '📦 Sincronizando produtos do ERP para o catálogo do WMS...');
        while (true) {
            const data  = await _withRetry(() => fetchJson('product', { page, limit }));
            const items = Array.isArray(data) ? data : (data.docs || data.data || []);
            if (page === 1) {
                total = Number(data.total || items.length);
                pages = Math.max(1, Math.ceil(total / limit));
                log('info', `${total.toLocaleString('pt-BR')} produtos no ERP — ${pages} página(s).`);
            }
            if (!items.length) break;

            const db = await _open();
            const tx = db.transaction(ST_PROD, 'readwrite');
            const st = tx.objectStore(ST_PROD);
            for (const raw of items) {
                if (!raw || raw.id == null) continue;
                const rec = mapProduct(raw, syncId);
                const g = st.get(rec.sku);
                g.onsuccess = () => {
                    const prev = g.result;
                    if (!prev) novos++;
                    st.put(prev ? { ...prev, ...rec } : rec);   // preserva campos editados no WMS
                };
            }
            await _done(tx);
            salvos += items.length;

            if (opts.onProgress) { try { opts.onProgress(salvos, total); } catch (_) {} }
            if (page % 5 === 0 || page >= pages) log('info', `Página ${page}/${pages} — ${salvos.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} produtos`);
            if (page >= pages || items.length < limit) break;
            page++;
        }

        // Remove o que sumiu do ERP — só se a sincronização veio completa
        let removidos = 0;
        if (total > 0 && salvos >= total * 0.98) {
            const db  = await _open();
            const tx  = db.transaction(ST_PROD, 'readwrite');
            const cur = tx.objectStore(ST_PROD).openCursor();
            cur.onsuccess = () => {
                const c = cur.result;
                if (!c) return;
                if (c.value._source === 'maxdata' && c.value._syncId !== syncId) { c.delete(); removidos++; }
                c.continue();
            };
            await _done(tx);
        }

        _cache = null;
        await _setMeta('lastSync', { at: new Date().toISOString(), total: salvos });
        const dur = ((Date.now() - inicio) / 1000).toFixed(1);
        log('success', `✅ ${salvos.toLocaleString('pt-BR')} produtos no catálogo do WMS (${novos} novos, ${removidos} removidos) em ${dur}s.`);
        try { window.dispatchEvent(new CustomEvent('wms:catalogo-atualizado', { detail: { total: salvos } })); } catch (_) {}
        return { added: novos, updated: salvos - novos, errors: 0, total: salvos, removed: removidos, duration: dur };
    }

    async function count() {
        const db = await _open();
        return _req(db.transaction(ST_PROD).objectStore(ST_PROD).count());
    }

    async function get(sku) {
        if (sku == null || sku === '') return null;
        const db = await _open();
        return (await _req(db.transaction(ST_PROD).objectStore(ST_PROD).get(String(sku)))) || null;
    }

    /** Busca paginada. Todos os termos precisam aparecer em SKU, ref. fabricante, descrição, fabricante ou aplicação. */
    async function list({ search = '', page = 1, pageSize = 50, somenteComSaldo = false } = {}) {
        const termos = _norm(search).split(/\s+/).filter(Boolean);
        const todos  = await _produtos();
        const filtrados = todos.filter(p =>
            (!somenteComSaldo || Number(p.saldoErp) > 0) &&
            termos.every(t => (p._busca || '').includes(t)));
        filtrados.sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'));
        const pages = Math.max(1, Math.ceil(filtrados.length / pageSize));
        const pg    = Math.min(Math.max(1, page), pages);
        return { total: filtrados.length, page: pg, pages, pageSize, items: filtrados.slice((pg - 1) * pageSize, pg * pageSize) };
    }

    /** Map sku → { saldoErp, descricao, unidade } */
    async function saldoMap() {
        const m = new Map();
        (await _produtos()).forEach(p => m.set(p.sku, { saldoErp: Number(p.saldoErp || 0), descricao: p.descricao, unidade: p.unidade }));
        return m;
    }

    /**
     * Identifica um código lido (SKU/ID MaxData, ref. fabricante ou EAN).
     * Procura no catálogo local; se não achar e parecer EAN, consulta GET /v2/product/ean/{ean}.
     */
    async function findByCode(code) {
        const c = String(code || '').trim();
        if (!c) return null;
        try {
            const porSku = await get(c);
            if (porSku) return porSku;
            const db = await _open();
            const st = db.transaction(ST_PROD).objectStore(ST_PROD);
            const porRef = await _req(st.index('codigoFab').get(c));
            if (porRef) return porRef;
            const porEan = await _req(st.index('ean').get(c));
            if (porEan) return porEan;
        } catch (_) {}

        if (/^\d{8,14}$/.test(c) && window.WmsMaxdataAuth) {
            try {
                const r = await window.WmsMaxdataAuth.fetch(window.WmsMaxdataAuth.buildUrl(`product/ean/${encodeURIComponent(c)}`), {
                    method: 'GET', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
                });
                if (r.ok) {
                    const raw = await r.json();
                    const p   = Array.isArray(raw) ? raw[0] : (raw?.docs ? raw.docs[0] : raw);
                    if (p && p.id != null) {
                        const prev = await get(String(p.id));
                        const rec  = { ...(prev || {}), ...mapProduct(p, prev?._syncId || 'EAN'), ean: c };
                        const db = await _open();
                        const tx = db.transaction(ST_PROD, 'readwrite');
                        tx.objectStore(ST_PROD).put(rec);
                        await _done(tx);
                        _cache = null;
                        return rec;
                    }
                }
            } catch (_) {}
        }
        return null;
    }

    // ─── Saldo SEM ENDEREÇO (carga inicial a partir do ERP) ──────
    async function listSemEndereco() { return _getAll(ST_SEM); }

    /**
     * Recalcula o saldo SEM ENDEREÇO: saldo ERP − saldo já endereçado no WMS (por SKU).
     * saldoEnderecado: { [sku]: qtd }
     */
    async function carregarSaldoInicial({ saldoEnderecado = {} } = {}) {
        const prods = await _produtos();
        if (!prods.length) throw new Error('Catálogo vazio. Sincronize os produtos do ERP primeiro (Configurações → Integrações).');
        const agora = new Date().toISOString();
        const db = await _open();
        const tx = db.transaction(ST_SEM, 'readwrite');
        const st = tx.objectStore(ST_SEM);
        st.clear();
        let linhas = 0, qtdTotal = 0;
        for (const p of prods) {
            const qtd = Math.max(0, Number(p.saldoErp || 0) - Number(saldoEnderecado[p.sku] || 0));
            if (qtd > 0) {
                st.put({ sku: p.sku, descricao: p.descricao, unidade: p.unidade || 'UN', qtd, origem: 'CARGA_INICIAL_ERP', data: agora });
                linhas++; qtdTotal += qtd;
            }
        }
        await _done(tx);
        await _setMeta('cargaInicial', { at: agora, linhas, qtdTotal });
        return { linhas, qtdTotal };
    }

    /** Soma (delta > 0) ou baixa (delta < 0) saldo SEM ENDEREÇO de um SKU. Baixa maior que o saldo é recusada. */
    function _ajustarSemEndereco(sku, delta, info = {}) {
        return _open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(ST_SEM, 'readwrite');
            const st = tx.objectStore(ST_SEM);
            let erro = null, restante = 0;
            const g = st.get(String(sku));
            g.onsuccess = () => {
                const cur  = g.result;
                const novo = Number(cur?.qtd || 0) + Number(delta);
                if (novo < 0) {
                    erro = new Error(`Saldo ${SEM_ENDERECO} insuficiente para o SKU ${sku} (disponível: ${Number(cur?.qtd || 0)}).`);
                    tx.abort();
                    return;
                }
                restante = novo;
                if (novo > 0) st.put({ ...(cur || { sku: String(sku), origem: 'AJUSTE', data: new Date().toISOString() }), ...info, sku: String(sku), qtd: novo });
                else if (cur) st.delete(String(sku));
            };
            tx.oncomplete = () => resolve({ sku: String(sku), restante });
            tx.onabort = tx.onerror = () => reject(erro || tx.error);
        }));
    }
    const baixarSemEndereco   = (sku, qtd)       => _ajustarSemEndereco(sku, -Math.abs(Number(qtd) || 0));
    const devolverSemEndereco = (sku, qtd, info) => _ajustarSemEndereco(sku,  Math.abs(Number(qtd) || 0), info);

    // ─── Clientes → Cadastro de Clientes do WMS ──────────────────
    /** clients: formato do MaxDataAdapter._mapClient ({ codigo, nome, fantasia, cnpj, cidade, uf, telefone, email }). */
    function importClients(clients = []) {
        const data    = JSON.parse(localStorage.getItem(CAD_KEY) || '{}');
        const atuais  = Array.isArray(data.clientes) ? data.clientes : [];
        const manuais = atuais.filter(c => c._source !== 'maxdata');
        const prevMap = new Map(atuais.filter(c => c._source === 'maxdata').map(c => [String(c.codigo), c]));
        const agora   = new Date().toISOString();
        let novos = 0;
        const doErp = (clients || []).filter(c => c && c.codigo).map(c => {
            const prev = prevMap.get(String(c.codigo));
            if (!prev) novos++;
            return {
                ...(prev || {}),
                codigo:      String(c.codigo),
                razaoSocial: c.nome || c.razaoSocial || '',
                fantasia:    c.fantasia || '',
                cnpjCpf:     c.cnpj || c.cpfCnpj || '',
                cidade:      [c.cidade, c.uf].filter(Boolean).join('/'),
                telefone:    c.telefone || '',
                email:       c.email || '',
                _source:     'maxdata',
                _syncedAt:   agora
            };
        });
        data.clientes = [...manuais, ...doErp];
        localStorage.setItem(CAD_KEY, JSON.stringify(data));
        return { total: doErp.length, novos, manuais: manuais.length };
    }

    return {
        SEM_ENDERECO,
        syncProducts, count, get, list, saldoMap, findByCode, getMeta,
        listSemEndereco, carregarSaldoInicial, baixarSemEndereco, devolverSemEndereco,
        importClients, mapProduct
    };
})();

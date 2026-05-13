// =============================================================================
// wms-sync.js — Sincronização Automática localStorage ↔ Firestore (WMS)
// Parreira Sistemas
// =============================================================================
// Como funciona:
//   1. Intercepta TODOS os localStorage.setItem com prefixo wms_
//   2. Espelha assincronamente no Firestore: tenants/{tid}/wms_snapshots/{colName}
//   3. No init, hidrata o localStorage a partir do Firestore (dados de outros dispositivos)
//   4. Listener onSnapshot: quando outro dispositivo salva, localStorage local é atualizado
//      e o evento 'wms-data-updated' é disparado para que a UI se atualize.
// =============================================================================

window.WmsSync = (function () {
    'use strict';

    // ─── Mapeamento: prefixo da chave localStorage → nome da coleção Firestore ──
    const COLLECTIONS = {
        'wms_docas':          'docas',
        'wms_agendamentos':   'agendamentos',
        'wms_conferencias':   'conferencias',
        'wms_inventarios':    'inventarios',
        'wms_transferencias': 'transferencias',
        'wms_bloqueios':      'bloqueios',
        'wms_ajustes':        'ajustes',
        'wms_kardex':         'kardex',
        'wms_ondas':          'ondas',
        'wms_picking':        'picking',
        'wms_volumes':        'volumes',
        'wms_cargas':         'cargas',
        'wms_expedicoes':     'expedicoes',
        'wms_tarefas':        'tarefas',
        'wms_estoque':        'estoque',
        'wms_receipts':       'receipts_snap',  // snap = snapshot simples (receipts complexos → WmsStore.receipts)
    };

    // Referência ao setItem original (antes de qualquer interceptor)
    const _origSet = localStorage.setItem.bind(localStorage);
    let   _interceptorAtivo = false;
    let   _unsubscribe      = null;
    let   _tenantId         = null;
    let   _ts               = '';

    // ─── Helper Firestore ─────────────────────────────────────────────────────
    function _db()  { return firebase.firestore(); }
    function _col() { return _db().collection('tenants').doc(_tenantId).collection('wms_snapshots'); }
    const _TS = () => firebase.firestore.FieldValue.serverTimestamp();

    // Retorna o nome da coleção dado o key completo do localStorage (com sufixo de tenant)
    function _colName(key) {
        for (const [prefix, col] of Object.entries(COLLECTIONS)) {
            if (key === prefix + _ts) return col;
        }
        return null;
    }

    // ─── Escreve snapshot no Firestore (fire-and-forget) ─────────────────────
    function _push(colName, data) {
        if (!_tenantId || typeof firebase === 'undefined') return;
        _col().doc(colName).set({
            items:        data,
            atualizadoEm: _TS(),
            atualizadoPor: window.ParreiraAuth?.getUser?.()?.login || 'system',
            tenantId:     _tenantId
        }).catch(e => console.warn(`[WmsSync] push ${colName}:`, e.message));
    }

    // ─── Interceptor ─────────────────────────────────────────────────────────
    function _instalarInterceptor() {
        if (_interceptorAtivo) return;
        _interceptorAtivo = true;

        localStorage.setItem = function (key, value) {
            // Sempre salva localmente primeiro (síncrono, não bloqueia)
            _origSet(key, value);

            // Espelha no Firestore se for chave WMS rastreada
            const col = _colName(key);
            if (col) {
                try { _push(col, JSON.parse(value)); }
                catch(e) { /* valor não é JSON, ignora */ }
            }
        };

        console.log('🔁 [WmsSync] Interceptor localStorage instalado.');
    }

    // ─── Hidratação: Firestore → localStorage ────────────────────────────────
    async function hidratar() {
        if (!_tenantId || typeof firebase === 'undefined') return;
        try {
            const snap = await _col().get();
            if (snap.empty) {
                console.log('[WmsSync] Firestore sem snapshots — dispositivo primário ou novo tenant.');
                return;
            }
            let count = 0;
            snap.docs.forEach(doc => {
                const colName = doc.id;
                const items   = doc.data()?.items;
                if (!Array.isArray(items)) return;
                // Encontra o prefixo correspondente
                const prefix = Object.keys(COLLECTIONS).find(k => COLLECTIONS[k] === colName);
                if (!prefix) return;
                const lsKey = prefix + _ts;
                const local = JSON.parse(localStorage.getItem(lsKey) || 'null');
                const fsTime = doc.data()?.atualizadoEm?.toMillis?.() || 0;
                // Firestore ganha se for mais novo ou se não tiver dados locais
                if (!local || fsTime > 0) {
                    _origSet(lsKey, JSON.stringify(items));
                    count++;
                }
            });
            if (count > 0) console.log(`☁️ [WmsSync] ${count} coleção(ões) hidratada(s) do Firestore.`);
        } catch(e) {
            console.warn('[WmsSync] hidratar falhou:', e.message);
        }
    }

    // ─── Listener em tempo real: propaga mudanças de outros dispositivos ──────
    function _ativarListener() {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        if (!_tenantId || typeof firebase === 'undefined') return;

        _unsubscribe = _col().onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type !== 'modified' && change.type !== 'added') return;
                const colName = change.doc.id;
                const items   = change.doc.data()?.items;
                if (!Array.isArray(items)) return;
                const prefix = Object.keys(COLLECTIONS).find(k => COLLECTIONS[k] === colName);
                if (!prefix) return;
                const lsKey = prefix + _ts;

                // Atualiza localStorage SEM acionar o interceptor (usa _origSet)
                _origSet(lsKey, JSON.stringify(items));

                // Avisa a UI
                window.dispatchEvent(new CustomEvent('wms-data-updated', {
                    detail: { collection: colName, prefix, key: lsKey, items }
                }));

                console.log(`🔄 [WmsSync] '${colName}' atualizado por outro dispositivo (${items.length} item(s)).`);
            });
        }, err => {
            console.warn('[WmsSync] onSnapshot erro:', err.message);
        });

        console.log('📡 [WmsSync] Listener em tempo real ativo.');
    }

    // ─── Migração única: localStorage existente → Firestore ─────────────────
    async function migrar() {
        if (!_tenantId || typeof firebase === 'undefined') return { ok: 0, skip: 0 };
        let ok = 0, skip = 0;
        for (const [prefix, colName] of Object.entries(COLLECTIONS)) {
            const lsKey = prefix + _ts;
            const raw   = localStorage.getItem(lsKey);
            if (!raw) { skip++; continue; }
            try {
                const data   = JSON.parse(raw);
                const exists = await _col().doc(colName).get();
                if (exists.exists) { skip++; continue; } // não sobrescreve Firestore com dados antigos
                _push(colName, data);
                ok++;
            } catch(e) { skip++; }
        }
        console.log(`🔼 [WmsSync] Migração: ${ok} coleção(ões) enviada(s), ${skip} ignorada(s).`);
        return { ok, skip };
    }

    // ─── API Pública ──────────────────────────────────────────────────────────
    return {
        /**
         * Inicializa o WmsSync.
         * Deve ser chamado após o login do usuário (quando tenantId estiver disponível).
         */
        async init() {
            try {
                _tenantId = window.ParreiraAuth?.getTenantId?.() || null;
                if (!_tenantId) {
                    const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
                    _tenantId = sess?.tenantId || null;
                }
                if (!_tenantId) { console.warn('[WmsSync] tenantId não disponível — sync desativado.'); return; }
                _ts = window.getTenantSuffix ? window.getTenantSuffix() : `_${_tenantId}`;

                _instalarInterceptor();
                await hidratar();
                _ativarListener();

                console.log(`✅ [WmsSync] Inicializado para tenant: ${_tenantId}`);
            } catch(e) {
                console.warn('[WmsSync] init falhou:', e.message);
            }
        },

        /** Força migração dos dados locais para o Firestore (run once). */
        migrar,

        /** Força re-hidratação do Firestore para localStorage. */
        hidratar,

        /** Desativa o listener em tempo real. */
        desativar() {
            if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        },

        /** Retorna se o sync está ativo. */
        get ativo() { return !!_tenantId && _interceptorAtivo; },

        /** Lista os prefixos rastreados. */
        get colecoes() { return { ...COLLECTIONS }; }
    };
})();

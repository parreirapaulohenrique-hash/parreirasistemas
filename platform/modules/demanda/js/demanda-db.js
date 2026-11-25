/**
 * demanda-db.js — Camada de Persistência Firestore
 * =================================================
 * Toda operação de leitura/escrita no Firestore passa por aqui.
 * Nenhuma tela ou componente acessa o Firestore diretamente.
 *
 * Namespace: tenants/centralpecas/demanda/
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaDB = (() => {

    // ── Configuração Multi-Tenant Dinâmica ───────────────────
    function _sanitizeTenant(raw) {
        if (!raw) return null;
        if (typeof raw === 'object') {
            if (raw.id && typeof raw.id === 'string') return _sanitizeTenant(raw.id);
            return null;
        }
        const s = String(raw).trim();
        if (!s || s === '[object Object]' || s === 'undefined' || s === 'null') return null;
        return s;
    }

    function _getTenantId() {
        try {
            if (window.ParreiraAuth) {
                if (typeof ParreiraAuth.getTenantId === 'function') {
                    const tid = _sanitizeTenant(ParreiraAuth.getTenantId());
                    if (tid) return tid;
                }
                if (typeof ParreiraAuth.getTenant === 'function') {
                    const t = ParreiraAuth.getTenant();
                    const tid = _sanitizeTenant(t);
                    if (tid) return tid;
                }
            }
            if (window.sessionManager && typeof sessionManager.getTenantId === 'function') {
                const tid = _sanitizeTenant(sessionManager.getTenantId());
                if (tid) return tid;
            }
            const s = JSON.parse(sessionStorage.getItem('parreira_session') || localStorage.getItem('parreira_session_ls') || 'null');
            if (s && s.tenantId) {
                const tid = _sanitizeTenant(s.tenantId);
                if (tid) return tid;
            }
        } catch (_) {}
        const ls = _sanitizeTenant(localStorage.getItem('app_tenant_id'));
        if (ls) return ls;
        return 'centralpecas';
    }

    const _basePath   = () => 'tenants/' + _getTenantId() + '/demanda';
    const _demandsCol = () => _basePath() + '/data/demands';
    const _configCol  = () => _basePath() + '/config';
    const _catalogCol = () => _basePath() + '/techbase/catalogos';
    const DEMANDS_COL = { toString: () => _demandsCol(), valueOf: () => _demandsCol() };

    // Contador sequencial (persistido no Firestore)
    let _sequenceCache = null;

    function _db() {
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('[DemandaDB] Firebase Firestore não disponível.');
        }
        return firebase.firestore();
    }

    // ═════════════════════════════════════════════════════════
    // OTIMIZAÇÃO DE COTA FIRESTORE
    //  - Cache em memória com TTL (listas, demandas e itens)
    //  - Deduplicação de requisições simultâneas (in-flight)
    //  - Cache versionado de itens (só relê quando a demanda mudou)
    //  - Caminhos legados consultados apenas no tenant histórico e
    //    somente enquanto ainda possuírem dados (sondagem memorizada)
    // ═════════════════════════════════════════════════════════
    const TTL_LIST    = 60 * 1000;
    const TTL_DEMANDA = 60 * 1000;
    const TTL_ITENS   = 3 * 60 * 1000;
    const TTL_FILA    = 60 * 1000;
    const TTL_LEGACY  = 24 * 60 * 60 * 1000;

    const _MEM = {
        list:    new Map(),  // key -> { ts, limit, data }
        demanda: new Map(),  // id  -> { ts, data }
        itens:   new Map(),  // id  -> { ts, versao, data }
        fila:    null,       // { ts, tid, data }
        inflight: new Map()  // key -> Promise
    };
    const _stats = { firestoreQueries: 0, cacheHits: 0 };

    function _hit() { _stats.cacheHits++; }
    function _q()   { _stats.firestoreQueries++; }

    function _dedupe(key, factory) {
        if (_MEM.inflight.has(key)) return _MEM.inflight.get(key);
        const p = Promise.resolve().then(factory).finally(() => _MEM.inflight.delete(key));
        _MEM.inflight.set(key, p);
        return p;
    }

    function _ms(ts) {
        if (!ts) return 0;
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (typeof ts.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
        if (ts instanceof Date) return ts.getTime();
        const n = new Date(ts).getTime();
        return isNaN(n) ? 0 : n;
    }

    /** Assinatura de versão dos itens de uma demanda (muda a cada escrita). */
    function _versaoDe(d) {
        if (!d) return null;
        const v = Number(d.itensVersao || 0);
        const t = _ms(d.atualizadoEm);
        if (!v && !t) return null;
        return v + ':' + t;
    }

    const _META_KEY = (did) => 'demanda_cache_itens_meta_' + did;
    function _getItensMeta(did) {
        try { return localStorage.getItem(_META_KEY(did)); } catch (_) { return null; }
    }
    function _setItensMeta(did, versao) {
        try {
            if (versao) localStorage.setItem(_META_KEY(did), versao);
            else localStorage.removeItem(_META_KEY(did));
        } catch (_) {}
    }

    // ── Caminhos legados (somente tenant histórico 'centralpecas') ──
    const _LEGACY_DEMAND_COLS = [
        'tenants/centralpecas/demandas',
        'tenants/[object Object]/demanda/data/demands',
        'tenants/[object Object]/demandas'
    ];
    const _LEGACY_KEY = 'demanda_legacy_probe_v1';

    function _isLegacyTenant() { return _getTenantId() === 'centralpecas'; }

    function _legacyState() {
        try {
            const s = JSON.parse(localStorage.getItem(_LEGACY_KEY) || 'null');
            if (s && s.paths && (Date.now() - (s.ts || 0)) < TTL_LEGACY) return s;
        } catch (_) {}
        return null;
    }

    function _saveLegacyState(paths) {
        try { localStorage.setItem(_LEGACY_KEY, JSON.stringify({ ts: Date.now(), paths })); } catch (_) {}
    }

    /** Caminhos legados que ainda devem ser consultados (desconhecidos ou com dados). */
    function _legacyColsAtivas() {
        if (!_isLegacyTenant()) return [];
        const st = _legacyState();
        if (!st) return _LEGACY_DEMAND_COLS.slice();
        return _LEGACY_DEMAND_COLS.filter(p => st.paths[p] !== false);
    }

    /** Caminho de origem de uma demanda (legado ou principal). */
    function _colDaDemanda(demandaId) {
        const mem = _MEM.demanda.get(demandaId);
        const d = (mem && mem.data) || _getDemandaLocal(demandaId);
        if (d && d._srcPath && _isLegacyTenant() && _LEGACY_DEMAND_COLS.indexOf(d._srcPath) >= 0) return d._srcPath;
        return _demandsCol();
    }

    function _invalidateItens(did) {
        if (!did) return;
        _MEM.itens.delete(did);
        _MEM.fila = null;
        _setItensMeta(did, null);
    }

    function _patchMemDemanda(did, fields) {
        const m = _MEM.demanda.get(did);
        if (m && m.data) m.data = { ...m.data, ...fields };
        _MEM.list.forEach(entry => {
            const i = entry.data.findIndex(x => x && x.id === did);
            if (i >= 0) entry.data[i] = { ...entry.data[i], ...fields };
        });
    }

    function _removeMemDemanda(did) {
        _MEM.demanda.delete(did);
        _MEM.itens.delete(did);
        _MEM.fila = null;
        _MEM.list.forEach(entry => { entry.data = entry.data.filter(x => x && x.id !== did); });
    }

    /** Sinaliza no documento pai que os itens mudaram (permite cache versionado nos outros clientes). */
    function _bumpItensVersao(demandaId) {
        try {
            return _db().doc(`${_demandsCol()}/${demandaId}`).update({
                itensVersao:  firebase.firestore.FieldValue.increment(1),
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        } catch (_) { return Promise.resolve(); }
    }

    function invalidateCache(scope) {
        if (!scope || scope === 'all') {
            _MEM.list.clear(); _MEM.demanda.clear(); _MEM.itens.clear(); _MEM.fila = null;
            return;
        }
        if (scope === 'list') _MEM.list.clear();
    }

    function getCacheStats() {
        return { ..._stats, listas: _MEM.list.size, demandas: _MEM.demanda.size, itens: _MEM.itens.size };
    }

    // ── Geração de código sequencial legível (transacional) ──
    async function _nextCodigo() {
        const db   = _db();
        const ref  = db.doc(_configCol());  // 4 segmentos — documento valido
        const year = new Date().getFullYear();
        let next;
        try {
            next = await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const val  = ((snap.exists ? snap.data().lastDemanda : 0) || 0) + 1;
                tx.set(ref, { lastDemanda: val }, { merge: true });
                return val;
            });
        } catch (txErr) {
            // Fallback offline caso o Firestore rejeite transaction sem conexão
            const snap = await ref.get();
            next = ((snap.exists ? snap.data().lastDemanda : 0) || 0) + 1;
            await ref.set({ lastDemanda: next }, { merge: true });
        }
        return `CTR-${year}-${String(next).padStart(4, '0')}`;
    }

    // ── DEMANDAS ──────────────────────────────────────────────

    /**
     * Cria uma nova demanda com itens opcionais.
     * @param {object} data - Campos da demanda (clienteId, vendedorId, filialId, origem, obs, etc.)
     * @param {Array}  itens - Itens iniciais (opcional)
     * @returns {Promise<string>} ID do documento criado
     */
    async function createDemanda(data, itens = []) {
        const db     = _db();
        const codigo = await _nextCodigo();
        const now    = firebase.firestore.FieldValue.serverTimestamp();

        const demandaRef = db.collection(_demandsCol()).doc();
        const demandaId  = demandaRef.id;

        // Calcula totalizadores reais com base nos itens passados
        const totalItens = Array.isArray(itens) ? itens.length : 0;
        let totalIdentificados = 0;
        let totalComEstoque = 0;
        let totalPerdidos = 0;

        if (totalItens > 0) {
            itens.forEach(it => {
                const temId = !!(it.erpProdutoId || it.parteMestreId);
                if (temId) totalIdentificados++;

                const st = it.status || (it.erpProdutoId ? (Number(it.estoqueFilial || 0) > 0 ? 'estoque_disponivel' : 'sem_estoque') : 'demanda_recebida');
                const temEstoque = ['estoque_disponivel', 'estoque_parcial'].includes(st) || (it.estoqueFilial != null && Number(it.estoqueFilial) > 0);
                if (temEstoque) {
                    totalComEstoque++;
                } else if (st === 'venda_perdida') {
                    totalPerdidos++;
                }
            });
        }
        const totalSemEstoque = Math.max(0, totalItens - totalComEstoque);

        const demandaDoc = {
            id:                demandaId,
            tenantId:          _getTenantId(),
            codigo,
            status:            'aberta',
            origem:            data.origem     || 'manual',
            canalOrigem:       data.canalOrigem || '',
            clienteId:         data.clienteId  || null,
            clienteNome:       data.clienteNome || '',
            clienteCnpj:       data.clienteCnpj || '',
            vendedorId:        data.vendedorId  || null,
            vendedorNome:      data.vendedorNome || '',
            concorrenteNome:   data.concorrenteNome || null,
            isConcorrente:     !!(data.isConcorrente || data.concorrenteNome),
            filialId:          data.filialId    || 1,
            filialNome:        data.filialNome  || '',
            obs:               data.obs        || '',
            documentos:        [],
            totalItens:        totalItens,
            totalIdentificados: totalIdentificados,
            totalComEstoque:   totalComEstoque,
            totalSemEstoque:   totalSemEstoque,
            totalPerdidos:     totalPerdidos,
            erpSaleId:         null,
            quoteId:           null,
            criadoEm:          now,
            atualizadoEm:      now,
            criadoPor:         data.criadoPor  || 'sistema',
        };

        const batch = db.batch();
        batch.set(demandaRef, demandaDoc);

        // Adiciona itens na sub-coleção se houver
        const itensComDoc = [];
        for (let i = 0; i < itens.length; i++) {
            const itemRef = demandaRef.collection('items').doc();
            const itDoc = _buildItemDoc(itemRef.id, demandaId, itens[i], i + 1, now);
            batch.set(itemRef, itDoc);
            itensComDoc.push(itDoc);
        }

        demandaDoc.itens = itensComDoc;
        _salvarItensLocal(demandaId, itensComDoc);
        _salvarDemandaLocal(demandaDoc);
        // Nova cotação: listas em memória precisam incluir o novo documento
        _MEM.list.clear();
        _MEM.fila = null;
        _MEM.itens.set(demandaId, { ts: Date.now(), versao: null, data: itensComDoc.slice() });

        await batch.commit().catch(e => {
            console.warn('[DemandaDB] commit Firestore falhou (salvo no cache local):', e.message || e);
        });
        return demandaId;
    }

    const _CACHE_KEY_DEMANDAS = () => 'demanda_cache_demandas_' + _getTenantId();
    const _CACHE_KEY_ITENS = (did) => 'demanda_cache_itens_' + did;

    function _withTimeout(promise, ms = 2000) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Firestore')), ms))
        ]);
    }

    function _getDemandaLocal(demandaId) {
        if (!demandaId || typeof localStorage === 'undefined') return null;
        const tid = _getTenantId();

        // 1. Chave direta
        try {
            const rawDirect = localStorage.getItem('demanda_cache_demanda_' + demandaId);
            if (rawDirect) {
                const d = JSON.parse(rawDirect);
                if (d && (d.id === demandaId || !d.id)) return { ...d, id: demandaId };
            }
        } catch (_) {}

        // 2. Chaves de listas conhecidas
        const keys = [
            _CACHE_KEY_DEMANDAS(),
            'demanda_cache_demandas_centralpecas',
            'demanda_cache_demandas_' + tid,
            'demanda_cache_demandas_[object Object]',
            'demanda_demandas_backup',
            'demanda_lista_demandas'
        ];
        for (let i = 0; i < keys.length; i++) {
            try {
                const raw = localStorage.getItem(keys[i]);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) {
                        const d = arr.find(x => x && x.id === demandaId);
                        if (d) return { ...d };
                    }
                }
            } catch (_) {}
        }

        // 3. Reconstrução de emergência a partir de subcoleções de itens em cache
        try {
            const rawIt = localStorage.getItem(_CACHE_KEY_ITENS(demandaId));
            if (rawIt) {
                const itens = JSON.parse(rawIt);
                if (Array.isArray(itens) && itens.length > 0) {
                    const totalComEstoque = itens.filter(x => ['estoque_disponivel','estoque_parcial'].includes(x.status) || (x.estoqueFilial > 0)).length;
                    const totalSemEstoque = itens.filter(x => x.status === 'sem_estoque' || (!x.estoqueFilial || x.estoqueFilial <= 0)).length;
                    const totalNaoEncontrados = itens.filter(x => ['nao_encontrado', 'demanda_recebida', 'em_identificacao'].includes(x.status)).length;
                    return {
                        id: demandaId,
                        codigo: 'CTR-' + demandaId.slice(0, 8).toUpperCase(),
                        clienteNome: 'Cotação (' + itens.length + ' itens)',
                        totalItens: itens.length,
                        totalComEstoque: totalComEstoque,
                        totalSemEstoque: totalSemEstoque,
                        totalNaoEncontrados: totalNaoEncontrados,
                        status: 'aberta',
                        filialId: 1,
                        criadoEm: new Date(),
                        itens: itens,
                        _origemFallback: 'cache_local_itens'
                    };
                }
            }
        } catch (_) {}

        return null;
    }

    function _salvarDemandaLocal(d) {
        if (!d || !d.id || typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(_CACHE_KEY_DEMANDAS());
            let arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) arr = [];
            const idx = arr.findIndex(x => x && x.id === d.id);
            if (idx >= 0) arr[idx] = { ...arr[idx], ...d };
            else arr.unshift(d);
            localStorage.setItem(_CACHE_KEY_DEMANDAS(), JSON.stringify(arr));
            localStorage.setItem('demanda_cache_demandas_centralpecas', JSON.stringify(arr));
            localStorage.setItem('demanda_cache_demanda_' + d.id, JSON.stringify(d));
        } catch (_) {}
    }

    function _getItensLocal(demandaId) {
        if (!demandaId || typeof localStorage === 'undefined') return [];
        try {
            const raw = localStorage.getItem(_CACHE_KEY_ITENS(demandaId));
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length > 0) return arr;
            }
            const d = _getDemandaLocal(demandaId);
            if (d && Array.isArray(d.itens) && d.itens.length > 0) return d.itens;
        } catch (_) {}
        return [];
    }

    function _salvarItensLocal(demandaId, itens) {
        if (!demandaId || !Array.isArray(itens) || typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(_CACHE_KEY_ITENS(demandaId), JSON.stringify(itens));
        } catch (_) {}
    }

    /**
     * Busca uma demanda pelo ID com busca resiliente em múltiplos caminhos e fallback.
     * Retorna null se não encontrada ou se for documento fantasma sem dados.
     */
    async function getDemanda(demandaId, opts = {}) {
        if (!demandaId) return null;
        const local = _getDemandaLocal(demandaId);

        if (!opts.force) {
            const mem = _MEM.demanda.get(demandaId);
            if (mem && (Date.now() - mem.ts) < TTL_DEMANDA) { _hit(); return { ...mem.data }; }
        }

        return _dedupe('demanda:' + demandaId, async () => {
            try {
                const db = _db();
                const paths = [`${_demandsCol()}/${demandaId}`];
                if (_isLegacyTenant()) {
                    const src = local && local._srcPath;
                    if (src && _LEGACY_DEMAND_COLS.indexOf(src) >= 0) paths.unshift(`${src}/${demandaId}`);
                    _legacyColsAtivas().forEach(c => {
                        const p = `${c}/${demandaId}`;
                        if (paths.indexOf(p) < 0) paths.push(p);
                    });
                }
                for (const p of paths) {
                    _q();
                    const snap = await _withTimeout(db.doc(p).get()).catch(() => ({ exists: false }));
                    if (snap && snap.exists) {
                        const data = snap.data();
                        if (data && (data.codigo || data.clienteNome || data.totalItens)) {
                            const srcCol = p.slice(0, p.lastIndexOf('/'));
                            const ret = { id: snap.id, ...data };
                            if (srcCol !== _demandsCol()) ret._srcPath = srcCol;
                            _salvarDemandaLocal(ret);
                            _MEM.demanda.set(demandaId, { ts: Date.now(), data: ret });
                            return ret;
                        }
                    }
                }
            } catch (e) {
                console.warn('[DemandaDB] getDemanda Firestore indisponível/cota excedida, usando cache local:', e.message || e);
            }
            if (local) return local;
            return null;
        });
    }

    /**
     * Atualiza campos da demanda.
     */
    async function updateDemanda(demandaId, fields) {
        try {
            const d = _getDemandaLocal(demandaId);
            if (d) _salvarDemandaLocal({ ...d, ...fields });
        } catch (_) {}
        _patchMemDemanda(demandaId, fields);

        try {
            await _withTimeout(_db().doc(`${_demandsCol()}/${demandaId}`).update({
                ...fields,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            }));
        } catch (e) {
            console.warn('[DemandaDB] updateDemanda Firestore falhou (salvo no cache local):', e.message || e);
        }
    }

    /**
     * Lista demandas do tenant com filtros opcionais.
     * Suporta fallback para o tenant histórico 'centralpecas', tenants legados '[object Object]' e cache local resiliente.
     * @param {object} filters - { vendedorId, status, filialId, limit }
     * @returns {Promise<Array>}
     */
    // Filial da cotação (cotações antigas sem filialId contam como filial 1)
    function _filialDe(d) { return Number((d && d.filialId) || 1); }
    function _filtrarFilial(lista, filialId) {
        const f = Number(filialId || 0);
        return f > 0 ? lista.filter(d => _filialDe(d) === f) : lista;
    }

    function _recuperarTodasDemandasLocais() {
        const mapLocais = new Map();
        if (typeof localStorage === 'undefined') return [];

        // 1. Chaves de listas conhecidas
        const chavesLista = [
            _CACHE_KEY_DEMANDAS(),
            'demanda_cache_demandas_centralpecas',
            'demanda_cache_demandas_[object Object]',
            'demanda_demandas_backup',
            'demanda_lista_demandas'
        ];
        chavesLista.forEach(k => {
            try {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) {
                        arr.forEach(d => {
                            if (d && d.id) {
                                mapLocais.set(d.id, { ...(mapLocais.get(d.id) || {}), ...d });
                            }
                        });
                    }
                }
            } catch (_) {}
        });

        // 2. Scan exaustivo de todas as chaves do localStorage para recuperar cotações órfãs
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;

                // Demandas salvas individualmente
                if (k.startsWith('demanda_cache_demanda_') || k.startsWith('demanda_doc_')) {
                    try {
                        const rawDoc = localStorage.getItem(k);
                        if (rawDoc) {
                            const d = JSON.parse(rawDoc);
                            if (d && d.id) {
                                mapLocais.set(d.id, { ...(mapLocais.get(d.id) || {}), ...d });
                            }
                        }
                    } catch (_) {}
                }

                // Subcoleções de itens salvas localmente (especialmente cotações com 200+ itens)
                if (k.startsWith('demanda_cache_itens_')) {
                    try {
                        const did = k.replace('demanda_cache_itens_', '');
                        if (did) {
                            const rawIt = localStorage.getItem(k);
                            if (rawIt) {
                                const itens = JSON.parse(rawIt);
                                if (Array.isArray(itens) && itens.length > 0) {
                                    const existente = mapLocais.get(did) || {};
                                    const totalComEstoque = itens.filter(x => ['estoque_disponivel','estoque_parcial'].includes(x.status) || (x.estoqueFilial > 0)).length;
                                    const totalSemEstoque = itens.filter(x => x.status === 'sem_estoque' || (!x.estoqueFilial || x.estoqueFilial <= 0)).length;
                                    const totalNaoEncontrados = itens.filter(x => ['nao_encontrado', 'demanda_recebida', 'em_identificacao'].includes(x.status)).length;

                                    const dRecup = {
                                        id: did,
                                        codigo: existente.codigo || ('CTR-' + did.slice(0, 8).toUpperCase()),
                                        clienteNome: existente.clienteNome || ('Cotação (' + itens.length + ' itens)'),
                                        clienteId: existente.clienteId || null,
                                        totalItens: Math.max(existente.totalItens || 0, itens.length),
                                        totalComEstoque: existente.totalComEstoque != null ? existente.totalComEstoque : totalComEstoque,
                                        totalSemEstoque: existente.totalSemEstoque != null ? existente.totalSemEstoque : totalSemEstoque,
                                        totalNaoEncontrados: existente.totalNaoEncontrados != null ? existente.totalNaoEncontrados : totalNaoEncontrados,
                                        status: existente.status || 'aberta',
                                        filialId: existente.filialId || 1,
                                        criadoEm: existente.criadoEm || new Date(),
                                        itens: itens,
                                        _origemFallback: 'cache_local_itens'
                                    };
                                    mapLocais.set(did, dRecup);
                                }
                            }
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}

        return Array.from(mapLocais.values());
    }

    async function listDemandas(filters = {}) {
        const limitCount = filters.limit || 500;
        const cacheKey = (filters.status && filters.status !== 'todas' ? filters.status : '*') + '|' + (filters.vendedorId || '*');

        const _posFiltro = (lista) => {
            let out = lista.slice();
            if (filters.status && filters.status !== 'todas') {
                out = out.filter(d => d.status === filters.status);
            }
            return _filtrarFilial(out, filters.filialId);
        };

        // 0. Cache em memória (evita reler até 500 documentos a cada troca de aba)
        if (!filters.force) {
            const mem = _MEM.list.get(cacheKey);
            if (mem && (Date.now() - mem.ts) < TTL_LIST && mem.limit >= limitCount) {
                _hit();
                return _posFiltro(mem.data);
            }
        }

        const lista = await _dedupe('list:' + cacheKey + ':' + limitCount, async () => {
            const mapIds = new Map();

            // 1. Carrega todas as cotações já conhecidas localmente (0ms)
            const locais = _recuperarTodasDemandasLocais();
            locais.forEach(d => { if (d && d.id) mapIds.set(d.id, d); });

            try {
                const db = _db();
                const mainCol = _demandsCol();
                const legacyCols = _legacyColsAtivas().filter(c => c !== mainCol);
                const colsUnicas = [mainCol].concat(legacyCols);
                const probe = {};

                const promessas = colsUnicas.map(async colPath => {
                    try {
                        let colRef = db.collection(colPath);
                        if (filters.status && filters.status !== 'todas') {
                            colRef = colRef.where('status', '==', filters.status);
                        }
                        if (filters.vendedorId) {
                            colRef = colRef.where('vendedorId', '==', filters.vendedorId);
                        }

                        _q();
                        let erro = false;
                        let snap = await _withTimeout(colRef.orderBy('criadoEm', 'desc').limit(limitCount).get(), 3000)
                            .catch(() => { erro = true; return null; });

                        // Fallback somente se a consulta ordenada falhar ou vier vazia
                        // (documentos legados sem criadoEm não aparecem no orderBy)
                        if (erro || !snap || snap.empty) {
                            _q();
                            snap = await _withTimeout(colRef.limit(limitCount).get(), 2500).catch(() => null);
                        }

                        const temDados = !!(snap && snap.docs && snap.docs.length > 0);
                        if (colPath !== mainCol && snap) probe[colPath] = temDados;

                        if (temDados) {
                            snap.docs.forEach(docSnap => {
                                const dData = docSnap.data();
                                if (dData) {
                                    const exist = mapIds.get(docSnap.id) || {};
                                    const merged = { ...exist, ...dData, id: docSnap.id };
                                    if (colPath !== mainCol) merged._srcPath = colPath;
                                    else delete merged._srcPath;
                                    mapIds.set(docSnap.id, merged);
                                }
                            });
                        }
                    } catch (_) {}
                });

                await Promise.all(promessas).catch(() => {});

                // Memoriza quais caminhos legados ainda possuem dados (os vazios deixam de ser consultados)
                if (_isLegacyTenant() && Object.keys(probe).length > 0) {
                    const st = _legacyState();
                    const paths = Object.assign({}, st ? st.paths : {}, probe);
                    _saveLegacyState(paths);
                }
            } catch (err) {
                console.warn('[DemandaDB] listDemandas nuvem (usando dados locais consolidados):', err.message || err);
            }

            const out = Array.from(mapIds.values()).filter(d => d && d.id && (d.codigo || d.clienteNome || (d.totalItens && d.totalItens > 0)));

            // Ordena lista combinada por criadoEm decrescente
            out.sort((a, b) => _ms(b.criadoEm) - _ms(a.criadoEm));

            // Salva lista consolidada no cache local resiliente (sem o array de itens para poupar o localStorage)
            try {
                const leve = out.map(d => { if (!d.itens) return d; const c = { ...d }; delete c.itens; return c; });
                localStorage.setItem(_CACHE_KEY_DEMANDAS(), JSON.stringify(leve));
                if (_isLegacyTenant()) localStorage.setItem('demanda_cache_demandas_centralpecas', JSON.stringify(leve));
            } catch (_) {}

            _MEM.list.set(cacheKey, { ts: Date.now(), limit: limitCount, data: out });
            return out;
        });

        return _posFiltro(lista);
    }

    // ── ITENS ─────────────────────────────────────────────────

    /**
     * Constrói o documento de um item com todos os campos default.
     */
    // ── Catálogos Externos de Peças (OEM e Fabricantes) ─────
    async function saveCatalogoItem(item) {
        const db = _db();
        const id = (item.marca + "_" + (item.codigoNorm || item.codigo || "")).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 60);
        await db.collection(_catalogCol()).doc(id).set(item, { merge: true });
        return id;
    }

    async function listCatalogoItems(limit = 300) {
        const db = _db();
        const snap = await db.collection(_catalogCol()).limit(limit).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * Constrói o documento de um item com todos os campos default.
     */
    function _buildItemDoc(itemId, demandaId, raw, seq, timestamp) {

        return {
            id:            itemId,
            demandaId,
            seq,
            // Dado original (imutável)
            refOriginal:   raw.refOriginal   || raw.ref  || '',
            descOriginal:  raw.descOriginal  || raw.desc || '',
            qtdeSolicitada: Number(raw.qtdeSolicitada || raw.qtde || 1),
            unidadeOriginal: raw.unidade || 'UN',
            obsCliente:    raw.obs || '',
            // Identificação
            status:        raw.status || (raw.erpProdutoId ? (Number(raw.estoqueFilial || 0) > 0 ? 'estoque_disponivel' : 'sem_estoque') : 'demanda_recebida'),
            parteMestreId: raw.parteMestreId || null,
            erpProdutoId:  raw.erpProdutoId  || null,
            erpProdutoDesc: raw.erpProdutoDesc || '',
            erpCodigoFab:  raw.erpCodigoFab  || '',
            erpGrupo:      raw.erpGrupo      || '',
            fabricante:    raw.fabricante    || '',
            confidenciaIdentificacao: raw.confidenciaIdentificacao || (raw.erpProdutoId ? 'alta' : 'pendente'),
            identificadoPor:  raw.identificadoPor || (raw.erpProdutoId ? 'automatch' : null),
            identificadoEm:   raw.identificadoEm || (raw.erpProdutoId ? timestamp : null),
            // Estoque
            estoqueFilial:    raw.estoqueFilial != null ? Number(raw.estoqueFilial) : null,
            estoqueOutrasFiliais: raw.estoqueOutrasFiliais || [],
            estoqueVerificadoEm:  raw.estoqueVerificadoEm || (raw.estoqueFilial != null ? timestamp : null),
            // Quantidades
            qtdeDisponivel:  raw.qtdeDisponivel || (raw.estoqueFilial != null ? Math.min(Number(raw.qtdeSolicitada || 1), Math.max(0, Number(raw.estoqueFilial))) : 0),
            qtdeFaltante:    raw.qtdeFaltante || (raw.estoqueFilial != null ? Math.max(0, Number(raw.qtdeSolicitada || 1) - Math.max(0, Number(raw.estoqueFilial))) : 0),
            qtdeTransferencia: raw.qtdeTransferencia || 0,
            qtdeCompra:      raw.qtdeCompra || 0,
            qtdeAprovada:    raw.qtdeAprovada || 0,
            qtdeVendida:     raw.qtdeVendida || 0,
            qtdePerdida:     raw.qtdePerdida || 0,
            // Preço
            precoUnitario:   raw.precoUnitario != null ? Number(raw.precoUnitario) : (raw.preco != null ? Number(raw.preco) : null),
            precoConcorrente: (() => {
                let pc = (raw.precoConcorrente != null && !isNaN(Number(raw.precoConcorrente))) ? Number(raw.precoConcorrente) : null;
                if (pc === null && (raw.obs || raw.obsCliente)) {
                    const m = String(raw.obs || raw.obsCliente).match(/pre[cç]o\s*conc\.?:\s*r\$\s*([\d\.,]+)/i);
                    if (m) {
                        const pv = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
                        if (!isNaN(pv) && pv > 0) pc = pv;
                    }
                }
                return pc;
            })(),
            tabelaPrecoId:   null,
            desconto:        0,
            valorTotal:      null,
            // Vínculo ERP
            erpSaleItemId:   null,
            erpSaleId:       null,
            // Venda perdida
            vendaPerdida:    false,
            motivoPerda:     null,
            motivoPerdaDetalhe: '',
            // Timeline
            timeline: [{
                evento: raw.erpProdutoId ? 'produto_vinculado' : 'item_criado',
                de:     null,
                para:   raw.status || (raw.erpProdutoId ? (Number(raw.estoqueFilial || 0) > 0 ? 'estoque_disponivel' : 'sem_estoque') : 'demanda_recebida'),
                por:    raw.criadoPor || 'sistema',
                em:     new Date().toISOString(),
                obs:    raw.erpProdutoId ? ('Auto-match Central Peças: ' + (raw.erpCodigoFab || raw.erpProdutoId)) : 'Item registrado na demanda.'
            }],
            criadoEm:     timestamp,
            atualizadoEm: timestamp,
        };
    }

    /**
     * Adiciona um ou mais itens a uma demanda existente.
     * @param {string} demandaId
     * @param {Array}  itens - Array de objetos com refOriginal, descOriginal, qtdeSolicitada, etc.
     * @returns {Promise<Array<string>>} IDs dos itens criados
     */
    async function addItens(demandaId, itens) {
        const db  = _db();
        const now = firebase.firestore.FieldValue.serverTimestamp();

        // Descobre o seq atual
        const existSnap = await db.collection(`${DEMANDS_COL}/${demandaId}/items`)
            .orderBy('seq', 'desc').limit(1).get();
        let lastSeq = existSnap.empty ? 0 : (existSnap.docs[0].data().seq || 0);

        const batch   = db.batch();
        const itemIds = [];

        for (const item of itens) {
            const ref = db.collection(`${DEMANDS_COL}/${demandaId}/items`).doc();
            itemIds.push(ref.id);
            lastSeq++;
            batch.set(ref, _buildItemDoc(ref.id, demandaId, item, lastSeq, now));
        }

        // Atualiza totalItens na demanda
        batch.update(db.doc(`${DEMANDS_COL}/${demandaId}`), {
            totalItens:    firebase.firestore.FieldValue.increment(itens.length),
            itensVersao:   firebase.firestore.FieldValue.increment(1),
            atualizadoEm:  now,
        });

        await batch.commit();
        _invalidateItens(demandaId);
        await recalcTotals(demandaId).catch(() => {});
        return itemIds;
    }

    /**
     * Busca os itens de uma demanda com cache em memória, cache versionado e fallback offline.
     * @param {string} demandaId
     * @param {object} [opts] - { force: boolean, versao: string } — se `versao` coincidir com a
     *                           versão do cache local, os itens são servidos sem ler o Firestore.
     */
    async function getItens(demandaId, opts = {}) {
        if (!demandaId) return [];
        const versao = opts.versao || null;

        if (!opts.force) {
            const mem = _MEM.itens.get(demandaId);
            if (mem && (Date.now() - mem.ts) < TTL_ITENS && (!versao || !mem.versao || mem.versao === versao)) {
                _hit();
                return mem.data.slice();
            }
            if (versao && _getItensMeta(demandaId) === versao) {
                const cached = _getItensLocal(demandaId);
                if (cached.length > 0) {
                    _hit();
                    _MEM.itens.set(demandaId, { ts: Date.now(), versao, data: cached });
                    return cached.slice();
                }
            }
        }

        return _dedupe('itens:' + demandaId, async () => {
            const local = _getItensLocal(demandaId);
            // Versão conhecida antes da leitura (nunca mais nova que os dados lidos a seguir)
            const versaoAntes = versao || _versaoDe((_MEM.demanda.get(demandaId) || {}).data || _getDemandaLocal(demandaId));
            try {
                const db = _db();
                const colPrincipal = _colDaDemanda(demandaId);
                _q();
                let snap = await _withTimeout(
                    db.collection(`${colPrincipal}/${demandaId}/items`).orderBy('seq', 'asc').get()
                ).catch(() => ({ empty: true }));

                // Caminhos legados: apenas no tenant histórico e enquanto ainda tiverem dados
                if (snap.empty && _isLegacyTenant()) {
                    const legados = ['tenants/[object Object]/demanda/data/demands']
                        .filter(c => c !== colPrincipal && _legacyColsAtivas().indexOf(c) >= 0);
                    for (const c of legados) {
                        _q();
                        const s2 = await _withTimeout(db.collection(`${c}/${demandaId}/items`).orderBy('seq', 'asc').get()).catch(() => ({ empty: true }));
                        if (!s2.empty) { snap = s2; break; }
                    }
                }
                if (snap && !snap.empty) {
                    const itens = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                    _salvarItensLocal(demandaId, itens);
                    _setItensMeta(demandaId, versaoAntes);
                    _MEM.itens.set(demandaId, { ts: Date.now(), versao: versaoAntes, data: itens });
                    return itens.slice();
                }
                if (snap && snap.empty && snap.docs) {
                    // Demanda sem itens na nuvem: memoriza vazio para não reler a cada tela
                    _MEM.itens.set(demandaId, { ts: Date.now(), versao: versaoAntes, data: local.length ? local : [] });
                }
            } catch (err) {
                console.warn('[DemandaDB] getItens Firestore indisponível/cota excedida, usando cache local:', err.message || err);
            }

            if (local && local.length > 0) return local;
            return [];
        });
    }

    /** Itens de uma demanda usando a versão do documento pai (0 leituras se nada mudou). */
    function getItensFor(demanda, opts = {}) {
        if (!demanda || !demanda.id) return Promise.resolve([]);
        return getItens(demanda.id, { ...opts, versao: _versaoDe(demanda) });
    }

    /**
     * Carrega itens de várias demandas com concorrência limitada e cache versionado.
     * @returns {Promise<Array<{demanda, itens}>>}
     */
    async function getItensMany(demandas, concurrency = 6) {
        const lista = (demandas || []).filter(d => d && d.id);
        const out = new Array(lista.length);
        let idx = 0;
        async function worker() {
            while (idx < lista.length) {
                const i = idx++;
                const d = lista[i];
                const itens = await getItensFor(d).catch(() => _getItensLocal(d.id));
                out[i] = { demanda: d, itens: itens || [] };
            }
        }
        const n = Math.max(1, Math.min(concurrency, lista.length));
        await Promise.all(Array.from({ length: n }, worker));
        return out;
    }

    /**
     * Grava a lista completa de itens de uma demanda (somente os novos/alterados são escritos).
     */
    async function updateItens(demandaId, itens, timelineEntry = null) {
        if (!demandaId || !Array.isArray(itens)) return;
        const db = _db();
        const anteriores = _getItensLocal(demandaId);
        const porId = {};
        anteriores.forEach(it => { if (it && it.id) porId[it.id] = JSON.stringify(it); });

        const alterados = itens.filter(it => it && it.id && porId[it.id] !== JSON.stringify(it));
        const now = firebase.firestore.FieldValue.serverTimestamp();

        for (let i = 0; i < alterados.length; i += 400) {
            const batch = db.batch();
            alterados.slice(i, i + 400).forEach(it => {
                const ref = db.doc(`${DEMANDS_COL}/${demandaId}/items/${it.id}`);
                const doc = { ...it, demandaId, atualizadoEm: now };
                if (!porId[it.id]) {
                    doc.criadoEm = now;
                    if (timelineEntry) doc.timeline = [{ ...timelineEntry, em: new Date().toISOString() }];
                } else {
                    delete doc.timeline;
                }
                batch.set(ref, doc, { merge: true });
            });
            await batch.commit();
        }

        _salvarItensLocal(demandaId, itens);
        _invalidateItens(demandaId);
        _MEM.itens.set(demandaId, { ts: Date.now(), versao: null, data: itens.slice() });
        await _bumpItensVersao(demandaId);
        await recalcTotals(demandaId).catch(() => {});
    }

    /**
     * Atualiza campos de um item específico.
     * Acrescenta entrada na timeline se houver mudança de status.
     */
    async function updateItem(demandaId, itemId, fields, timelineEntry = null) {
        try {
            const itens = _getItensLocal(demandaId);
            const idx = itens.findIndex(it => (it.id === itemId || it._itemId === itemId));
            if (idx >= 0) {
                itens[idx] = { ...itens[idx], ...fields };
                _salvarItensLocal(demandaId, itens);
            }
            const mem = _MEM.itens.get(demandaId);
            if (mem) {
                const mi = mem.data.findIndex(it => (it.id === itemId || it._itemId === itemId));
                if (mi >= 0) mem.data[mi] = { ...mem.data[mi], ...fields };
            }
            _MEM.fila = null;
        } catch (_) {}

        try {
            const ref    = _db().doc(`${DEMANDS_COL}/${demandaId}/items/${itemId}`);
            const update = {
                ...fields,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (timelineEntry) {
                update.timeline = firebase.firestore.FieldValue.arrayUnion({
                    ...timelineEntry,
                    em: new Date().toISOString()
                });
            }

            await _withTimeout(ref.update(update));
            _bumpItensVersao(demandaId);
        } catch (e) {
            console.warn('[DemandaDB] updateItem Firestore falhou (salvo no cache local):', e.message || e);
        }
    }

    /**
     * Atualiza o status de um item isolado e registra na timeline.
     */
    async function updateItemStatus(demandaId, itemId, novoStatus, por = 'sistema', obs = '') {
        const tl = {
            evento: 'status_changed',
            para: novoStatus,
            por: por,
            obs: obs,
            em: new Date().toISOString()
        };
        await updateItem(demandaId, itemId, { status: novoStatus }, tl);
        await recalcTotals(demandaId).catch(() => {});
    }

    /**
     * Atualiza múltiplos itens em lote (batch) de uma mesma demanda.
     */
    async function updateItensBatch(demandaId, itemIds, fields, timelineEntry = null) {
        if (!demandaId || !itemIds || itemIds.length === 0) return;
        const db = _db();
        const batch = db.batch();
        const updateData = {
            ...fields,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (timelineEntry) {
            updateData.timeline = firebase.firestore.FieldValue.arrayUnion({
                ...timelineEntry,
                em: new Date().toISOString()
            });
        }
        itemIds.forEach(id => {
            const ref = db.doc(`${DEMANDS_COL}/${demandaId}/items/${id}`);
            batch.update(ref, updateData);
        });
        await batch.commit();
        // Mantém os caches coerentes sem precisar reler os itens
        try {
            const setIds = new Set(itemIds);
            const itensLoc = _getItensLocal(demandaId).map(it => setIds.has(it.id) ? { ...it, ...fields } : it);
            if (itensLoc.length) _salvarItensLocal(demandaId, itensLoc);
            const mem = _MEM.itens.get(demandaId);
            if (mem) mem.data = mem.data.map(it => setIds.has(it.id) ? { ...it, ...fields } : it);
            _MEM.fila = null;
        } catch (_) {}
        _bumpItensVersao(demandaId);
        await recalcTotals(demandaId).catch(() => {});
    }

    /**
     * Remove um item de uma demanda (só permite se status = demanda_recebida).
     */
    async function deleteItem(demandaId, itemId) {
        const db  = _db();
        const ref = db.doc(`${DEMANDS_COL}/${demandaId}/items/${itemId}`);
        const snap = await ref.get();
        if (!snap.exists) throw new Error(`Item ${itemId} não encontrado.`);
        if (!['demanda_recebida', 'em_identificacao'].includes(snap.data().status)) {
            throw new Error('Só é possível remover itens no estado inicial.');
        }
        await ref.delete();
        _invalidateItens(demandaId);
        _bumpItensVersao(demandaId);
        await recalcTotals(demandaId).catch(() => {});
    }

    /**
     * Remove uma demanda e todos os itens de sua subcoleção items em todos os caminhos conhecidos.
     * Limpa também o cache local do navegador para que a cotação não continue aparecendo no resumo.
     */
    async function deleteDemanda(demandaId) {
        if (!demandaId) return;
        const db = _db();

        // 1. Remove de todos os caches locais do navegador imediatamente
        _purgeLocalDemandCache(demandaId);
        _removeMemDemanda(demandaId);
        _setItensMeta(demandaId, null);

        // 2. Caminhos possíveis de onde a demanda pode ter sido criada/persistida
        //    (legados somente no tenant histórico e enquanto possuírem dados)
        const candidatePaths = [`${DEMANDS_COL}/${demandaId}`]
            .concat(_legacyColsAtivas().map(c => `${c}/${demandaId}`));

        for (const p of Array.from(new Set(candidatePaths))) {
            try {
                const docRef = db.doc(p);
                const snap = await docRef.get().catch(() => ({ exists: false }));
                if (snap.exists) {
                    const itemsSnap = await docRef.collection('items').get().catch(() => ({ docs: [] }));
                    const refs = (itemsSnap.docs || []).map(doc => doc.ref);
                    refs.push(docRef);
                    for (let i = 0; i < refs.length; i += 450) {
                        const batch = db.batch();
                        refs.slice(i, i + 450).forEach(r => batch.delete(r));
                        await batch.commit().catch(() => {});
                    }
                }
            } catch (_) {}
        }
    }

    function _purgeLocalDemandCache(demandaId) {
        if (!demandaId || typeof localStorage === 'undefined') return;
        try {
            const cacheKeys = [
                _CACHE_KEY_DEMANDAS(),
                'demanda_cache_demandas_centralpecas',
                'demanda_cache_demandas_[object Object]',
                'demanda_backup_demandas'
            ];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('demanda_cache_demandas')) {
                    if (!cacheKeys.includes(k)) cacheKeys.push(k);
                }
            }
            cacheKeys.forEach(k => {
                const raw = localStorage.getItem(k);
                if (raw) {
                    try {
                        const arr = JSON.parse(raw);
                        if (Array.isArray(arr)) {
                            const filtered = arr.filter(d => d && d.id !== demandaId);
                            localStorage.setItem(k, JSON.stringify(filtered));
                        }
                    } catch (_) {}
                }
            });
        } catch (_) {}
    }

    /**
     * Recalcula e salva os totalizadores de uma demanda.
     */
    async function recalcTotals(demandaId) {
        if (!demandaId) return { totalItens: 0, totalIdentificados: 0, totalComEstoque: 0, totalSemEstoque: 0, totalNaoEncontrados: 0, totalPerdidos: 0 };
        const itens = await getItens(demandaId);
        const totalItens = itens.length;
        let totalComEstoque = 0;
        let totalSemEstoque = 0;
        let totalNaoEncontrados = 0;
        let totalIdentificados = 0;
        let totalPerdidos = 0;

        itens.forEach(i => {
            const st = i.status || 'nao_encontrado';
            if (['estoque_disponivel', 'estoque_parcial'].includes(st) || (i.estoqueFilial != null && Number(i.estoqueFilial) > 0)) {
                totalComEstoque++;
                totalIdentificados++;
            } else if (st === 'sem_estoque') {
                totalSemEstoque++;
                totalIdentificados++;
            } else if (['demanda_recebida', 'nao_encontrado', 'nao_cadastrado', 'em_identificacao', 'identificado'].includes(st)) {
                totalNaoEncontrados++;
            } else if (st === 'venda_perdida' || st === 'cancelado') {
                totalPerdidos++;
            } else if (i.erpProdutoId || i.parteMestreId) {
                totalIdentificados++;
                totalSemEstoque++;
            } else {
                totalNaoEncontrados++;
            }
        });

        const totals = {
            totalItens,
            totalIdentificados,
            totalComEstoque,
            totalSemEstoque,
            totalNaoEncontrados,
            totalPerdidos,
        };

        // Só grava se algum totalizador mudou (evita escritas inúteis e invalidação de caches)
        const atual = (_MEM.demanda.get(demandaId) || {}).data || _getDemandaLocal(demandaId);
        const igual = atual && Object.keys(totals).every(k => Number(atual[k] || 0) === totals[k]);
        if (igual && !atual._origemFallback) return totals;

        await updateDemanda(demandaId, totals);
        return totals;
    }

    /**
     * Divide um item em dois: o original com qtdeAtendida, e um novo com qtdeFaltante.
     * Útil para atendimento parcial de estoque.
     */
    async function splitItem(demandaId, itemId, qtdeAtendida, qtdeFaltante) {
        const db   = _db();
        const snap = await db.doc(`${DEMANDS_COL}/${demandaId}/items/${itemId}`).get();
        if (!snap.exists) throw new Error(`Item ${itemId} não encontrado.`);
        const original = snap.data();

        // Atualiza o item original com a quantidade atendida
        await db.doc(`${DEMANDS_COL}/${demandaId}/items/${itemId}`).update({
            qtdeSolicitada: qtdeAtendida,
            atualizadoEm:   firebase.firestore.FieldValue.serverTimestamp()
        });

        // Cria novo item com a quantidade faltante, voltando para demanda_recebida
        const novoId  = `${itemId}_split_${Date.now()}`;
        const novoSeq = (original.seq || 0) + 0.5;
        const novoItem = {
            id:             novoId,
            demandaId:      demandaId,
            seq:            novoSeq,
            refOriginal:    original.refOriginal || '',
            descOriginal:   original.descOriginal || '',
            qtdeSolicitada: qtdeFaltante,
            status:         'demanda_recebida',
            origemSplit:    itemId,
            criadoEm:       firebase.firestore.FieldValue.serverTimestamp(),
            atualizadoEm:   firebase.firestore.FieldValue.serverTimestamp(),
            timeline:       [{
                evento: 'split_criado',
                para:   'demanda_recebida',
                por:    'sistema',
                obs:    `Item criado por split de ${itemId} (${qtdeFaltante} unidades restantes)`,
                em:     new Date().toISOString()
            }]
        };
        await db.doc(`${DEMANDS_COL}/${demandaId}/items/${novoId}`).set(novoItem);

        // Incrementa o contador de itens da demanda
        await db.doc(`${DEMANDS_COL}/${demandaId}`).update({
            totalItens:   firebase.firestore.FieldValue.increment(1),
            itensVersao:  firebase.firestore.FieldValue.increment(1),
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        _invalidateItens(demandaId);

        return novoId;
    }


    // ── OUVINTE REALTIME ─────────────────────────────────────

    /**
     * Escuta mudanças nos itens de uma demanda em tempo real.
     * @returns {function} unsubscribe
     */
    function onItensChanged(demandaId, callback) {
        return _db()
            .collection(`${DEMANDS_COL}/${demandaId}/items`)
            .orderBy('seq', 'asc')
            .onSnapshot(snap => {
                callback(snap.docs.map(d => d.data()));
            });
    }

    // ── SESSÃO LOCAL (cache leve) ─────────────────────────────

    function _sessionKey(key) { return `_demanda_${key}`; }

    function saveSession(key, value) {
        try { sessionStorage.setItem(_sessionKey(key), JSON.stringify(value)); } catch (_) {}
    }

    function loadSession(key) {
        try {
            const v = sessionStorage.getItem(_sessionKey(key));
            return v ? JSON.parse(v) : null;
        } catch (_) { return null; }
    }

    function clearSession(key) {
        try { sessionStorage.removeItem(_sessionKey(key)); } catch (_) {}
    }



    /**
     * Busca itens da fila de compras.
     * 1) collectionGroup('items') filtrado pelo tenant atual (isolamento entre empresas);
     * 2) se a consulta não for permitida/indexada, usa as demandas em cache + cache versionado
     *    de itens (praticamente 0 leituras após a primeira carga).
     * Estados: sem_estoque, encaminhado_compras, cotacao_fornecedor, compra_possivel
     * @returns {Promise<Array>}
     */
    const _FILA_CG_KEY = 'demanda_fila_cg_off';
    async function listItensFila(limit = 80) {
        const FILA_STATES = ['sem_estoque', 'encaminhado_compras', 'cotacao_fornecedor', 'compra_possivel'];
        const ORDER = { sem_estoque: 0, encaminhado_compras: 1, cotacao_fornecedor: 2, compra_possivel: 3 };
        const tid = _getTenantId();

        if (_MEM.fila && _MEM.fila.tid === tid && (Date.now() - _MEM.fila.ts) < TTL_FILA) {
            _hit();
            return _MEM.fila.data.slice();
        }

        return _dedupe('fila:' + tid, async () => {
            const results = [];
            const seen    = new Set();
            const prefix  = 'tenants/' + tid + '/';
            let cgDesligado = false;
            try { cgDesligado = sessionStorage.getItem(_FILA_CG_KEY) === '1'; } catch (_) {}

            if (!cgDesligado) {
                let falhas = 0;
                const db = _db();
                await Promise.all(FILA_STATES.map(async (status) => {
                    try {
                        _q();
                        const snap = await db.collectionGroup('items')
                            .where('status', '==', status)
                            .where('demandaId', '!=', null)
                            .limit(limit)
                            .get();
                        snap.docs.forEach(d => {
                            // Isolamento multi-tenant: descarta itens de outras empresas
                            if (!d.ref || !d.ref.path || d.ref.path.indexOf(prefix) !== 0) return;
                            if (!seen.has(d.ref.path)) {
                                seen.add(d.ref.path);
                                results.push({ ...d.data(), id: d.id });
                            }
                        });
                    } catch (e) {
                        falhas++;
                        console.warn('[DemandaDB] listItensFila status=' + status + ':', e.message);
                    }
                }));
                if (falhas === FILA_STATES.length) {
                    cgDesligado = true;
                    try { sessionStorage.setItem(_FILA_CG_KEY, '1'); } catch (_) {}
                }
            }

            if (cgDesligado) {
                // Fallback: usa demandas abertas + cache versionado de itens
                const demandas = await listDemandas({ limit: 200 }).catch(() => []);
                const abertas = demandas
                    .filter(d => d.status !== 'cancelada' && d.status !== 'fechada' && d.status !== 'concluida')
                    .slice(0, 60);
                const pares = await getItensMany(abertas, 6);
                pares.forEach(p => {
                    (p.itens || []).forEach(it => {
                        const chave = (it.demandaId || p.demanda.id) + '/' + it.id;
                        if (FILA_STATES.indexOf(it.status) < 0 || seen.has(chave)) return;
                        seen.add(chave);
                        results.push({ ...it, demandaId: it.demandaId || p.demanda.id });
                    });
                });
            }

            const ordenados = results.sort((a, b) => (ORDER[a.status] || 9) - (ORDER[b.status] || 9));
            _MEM.fila = { ts: Date.now(), tid, data: ordenados };
            return ordenados.slice();
        });
    }

    /**
     * Contagem de documentos via agregação count() (1 leitura a cada 1.000 entradas de índice),
     * com cache local de 30 minutos. Retorna null se a agregação não estiver disponível.
     */
    async function countDocs(colPath, field, value, opts = {}) {
        const key = 'demanda_count_' + colPath + '|' + (field || '') + '|' + (value == null ? '' : String(value));
        if (!opts.force) {
            try {
                const c = JSON.parse(localStorage.getItem(key) || 'null');
                if (c && (Date.now() - c.ts) < 30 * 60 * 1000) { _hit(); return c.n; }
            } catch (_) {}
        }
        try {
            let q = _db().collection(colPath);
            if (field) q = q.where(field, '==', value);
            if (typeof q.count !== 'function') return null;
            _q();
            const s = await q.count().get();
            const n = Number((s.data() || {}).count || 0);
            try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), n })); } catch (_) {}
            return n;
        } catch (e) {
            console.warn('[DemandaDB] countDocs falhou:', e.message || e);
            return null;
        }
    }

    /**
     * Agrega KPIs do dashboard a partir dos totalizadores das demandas.
     * @returns {Promise<object>}
     */
    async function getDashboardStats(filialId) {
        const demandas = await listDemandas({ limit: 200, filialId: filialId || null });
        const stats = {
            totalDemandas:      demandas.length,
            porStatus:          {},
            totalItens:         0,
            totalIdentificados: 0,
            totalComEstoque:    0,
            totalSemEstoque:    0,
            totalPerdidos:      0,
        };
        demandas.forEach(d => {
            stats.porStatus[d.status] = (stats.porStatus[d.status] || 0) + 1;
            stats.totalItens         += (d.totalItens         || 0);
            stats.totalIdentificados += (d.totalIdentificados || 0);
            stats.totalComEstoque    += (d.totalComEstoque    || 0);
            stats.totalSemEstoque    += (d.totalSemEstoque    || 0);
            stats.totalPerdidos      += (d.totalPerdidos      || 0);
        });
        stats.taxaIdentificacao = stats.totalItens > 0
            ? Math.round((stats.totalIdentificados / stats.totalItens) * 100) : 0;
        stats.taxaEstoque = stats.totalIdentificados > 0
            ? Math.round((stats.totalComEstoque / stats.totalIdentificados) * 100) : 0;
        stats.taxaPerda = stats.totalItens > 0
            ? Math.round((stats.totalPerdidos / stats.totalItens) * 100) : 0;
        return stats;
    }

    return {
        createDemanda, getDemanda, updateDemanda, deleteDemanda, listDemandas,
        addItens, getItens, getItensFor, getItensMany, updateItens,
        updateItem, updateItemStatus, updateItensBatch, deleteItem, recalcTotals, splitItem,
        onItensChanged, listItensFila, getDashboardStats, countDocs,
        invalidateCache, getCacheStats,
        saveSession, loadSession, clearSession, saveCatalogoItem, listCatalogoItems,
        getDemandaLocal: _getDemandaLocal,
        getItensLocal: _getItensLocal,
        purgeLocalCache: function(did) { _purgeLocalDemandCache(did); _removeMemDemanda(did); },
        get TENANT_ID()   { return _getTenantId(); },
        get BASE_PATH()   { return _basePath(); },
        get DEMANDS_COL() { return _demandsCol(); },
        get CONFIG_COL()  { return _configCol(); },
        get CATALOG_COL() { return _catalogCol(); },
        getTenantId: _getTenantId
    };

})();

if (typeof window !== 'undefined') window.DemandaDB = DemandaDB;

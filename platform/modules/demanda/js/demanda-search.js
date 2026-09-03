/**
 * demanda-search.js — Motor de Busca de Produtos
 * ================================================
 * Centraliza toda busca de produtos para o módulo de demanda.
 * Consulta o MaxDataAdapter (ERP) e a base técnica (Firestore).
 *
 * NUNCA chama a API MaxData diretamente — passa sempre pelo adapter.
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaSearch = (() => {

    // Configuração do tenant Central Peças
    const TENANT_ID   = 'centralpecas';
    const TECHBASE    = `tenants/${TENANT_ID}/demanda/techbase`;

    // Cache simples para resultados recentes (5 min TTL, não para estoque)
    const _cache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    function _getCached(key) {
        const entry = _cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
        return entry.data;
    }

    function _setCache(key, data) {
        _cache.set(key, { ts: Date.now(), data });
    }

    // ── Obtém o adapter MaxData ───────────────────────────────
    function _getAdapter() {
        // Tenta via ErpIntegration (sistema de registro central)
        if (window.ErpIntegration && ErpIntegration.getActive) {
            return ErpIntegration.getActive();
        }
        // Fallback: instancia direto com config do sessionStorage
        if (window.MaxDataAdapter) {
            const cfg = JSON.parse(sessionStorage.getItem('_demanda_erp_config') || '{}');
            if (!cfg.baseUrl) throw new Error('ERP não configurado. Faça login primeiro.');
            return new MaxDataAdapter(TENANT_ID, cfg);
        }
        throw new Error('MaxDataAdapter não encontrado. Verifique os scripts carregados.');
    }

    // ── Busca principal (rota multi-camada) ───────────────────
    /**
     * Busca um produto por qualquer informação disponível.
     * Tenta em cascata: ERP exato → base técnica → ERP textual → fuzzy.
     *
     * @param {string} query - Texto digitado pelo vendedor
     * @param {object} opts  - { filialId, limit, forceRefresh }
     * @returns {Promise<Array<ResultadoBusca>>}
     */
    async function search(query, opts = {}) {
        const q     = (query || '').trim();
        if (!q || q.length < 2) return [];

        const { filialId = 1, limit = 25, forceRefresh = false } = opts;
        const cacheKey = `search:${q}:${filialId}`;

        if (!forceRefresh) {
            const cached = _getCached(cacheKey);
            if (cached) return cached;
        }

        const results = [];
        const seen    = new Set(); // evita duplicatas por erpProdutoId ou techbaseId

        // Camada 1: Busca exata no ERP por referência normalizada
        try {
            const erpRef = await _searchErpByRef(q, filialId);
            for (const r of erpRef) {
                if (!seen.has(`erp:${r.erpProdutoId}`)) {
                    seen.add(`erp:${r.erpProdutoId}`);
                    results.push({ ...r, _fonte: 'erp_ref_exata', _rank: 100 });
                }
            }
        } catch (e) { console.warn('[DemandaSearch] ERP ref exata falhou:', e.message); }

        // Camada 2: Busca por EAN
        if (results.length === 0 && /^\d{8,14}$/.test(q.replace(/\s/g, ''))) {
            try {
                const erpEan = await _searchErpByEAN(q.replace(/\s/g, ''), filialId);
                for (const r of erpEan) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_ean', _rank: 95 });
                    }
                }
            } catch (e) { /* silencioso */ }
        }

        // Camada 3: Base técnica (referências cruzadas)
        try {
            const techResults = await _searchTechbase(q, filialId);
            for (const r of techResults) {
                const key = r.erpProdutoId ? `erp:${r.erpProdutoId}` : `tb:${r.parteMestreId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ ...r, _fonte: 'base_tecnica', _rank: r._rank || 80 });
                }
            }
        } catch (e) { console.warn('[DemandaSearch] Base técnica falhou:', e.message); }

        // Camada 4: Busca textual no ERP por descrição
        if (results.length < 5) {
            try {
                const erpText = await _searchErpByText(q, filialId, limit);
                for (const r of erpText) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_texto', _rank: 60 });
                    }
                }
            } catch (e) { console.warn('[DemandaSearch] ERP texto falhou:', e.message); }
        }

        // Ordena por rank e limita
        const sorted = results.sort((a, b) => b._rank - a._rank).slice(0, limit);
        _setCache(cacheKey, sorted);
        return sorted;
    }

    // ── Busca por referência exata no ERP ─────────────────────
    async function _searchErpByRef(query, filialId) {
        const adapter  = _getAdapter();
        const normRef  = DemandaImport ? DemandaImport.normalizeRef(query) : query.toUpperCase().replace(/[\s\-]/g, '');

        // Tenta /product?codigoFab=X (código do fabricante)
        const headers = await adapter._authHeaders();
        const results = [];

        const attempts = [
            adapter._buildUrl('product', { codigoFab: normRef, limit: 10 }),
            adapter._buildUrl('product', { codigoFab: query.toUpperCase(), limit: 10 }),
        ];

        for (const url of attempts) {
            try {
                const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const data  = await resp.json();
                const items = Array.isArray(data) ? data : (data.docs || data.data || []);
                for (const item of items) {
                    results.push(_mapErpProduct(item, filialId));
                }
                if (results.length > 0) break;
            } catch (_) { continue; }
        }

        return results;
    }

    // ── Busca por EAN ─────────────────────────────────────────
    async function _searchErpByEAN(ean, filialId) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl(`product/ean/${ean}`);
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return [];
        const data  = await resp.json();
        const items = Array.isArray(data) ? data : [data];
        return items.filter(Boolean).map(i => _mapErpProduct(i, filialId));
    }

    // ── Busca textual no ERP ──────────────────────────────────
    async function _searchErpByText(query, filialId, limit = 25) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl('product', { descricao: query, limit });
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return [];
        const data  = await resp.json();
        const items = Array.isArray(data) ? data : (data.docs || data.data || []);
        return items.map(i => _mapErpProduct(i, filialId));
    }

    // ── Busca na base técnica ─────────────────────────────────
    async function _searchTechbase(query, filialId) {
        if (typeof firebase === 'undefined') return [];

        const db  = firebase.firestore();
        const ref = DemandaImport ? DemandaImport.normalizeRef(query) : query.toUpperCase();
        const results = [];

        // Busca por referência normalizada na coleção references
        const refsSnap = await db.collection(`${TECHBASE}/references`)
            .where('refNorm', '==', ref)
            .limit(10)
            .get();

        for (const doc of refsSnap.docs) {
            const r = doc.data();
            results.push({
                parteMestreId:   r.parteMestreId,
                erpProdutoId:    r.erpProdutoId || null,
                erpProdutoDesc:  r.descricao || '',
                erpCodigoFab:    r.ref,
                fabricante:      r.fabricante || '',
                confidencia:     r.confidencia || 'sugerida',
                estoqueFilial:   null, // será buscado sob demanda
                _rank:           _rankByConfianca(r.confidencia),
                _isTechbase:     true,
            });
        }

        return results;
    }

    function _rankByConfianca(c) {
        const ranks = { oficial: 95, catalogo: 85, confirmada: 80, historica: 70, sugerida: 55, pendente: 40 };
        return ranks[c] || 50;
    }

    // ── Mapeamento de produto ERP → ResultadoBusca ────────────
    function _mapErpProduct(raw, filialId) {
        // Extrai estoque da filial solicitada via multiloja[]
        const multiloja  = raw.multiloja || [];
        const filialData = multiloja.find(f => f.empId === filialId) || multiloja[0] || {};
        const estoqueFilial = Number(filialData.qtde ?? filialData.estoque ?? raw.qtde ?? 0);

        // Estoque em outras filiais
        const outrasFiliaisMap = {
            1: 'CTR MATRIZ PALMAS ATACADO',
            2: 'CTR FILIAL PALMAS VAREJO',
            4: 'CTR PORTO VAREJO',
            5: 'CTR REDENÇÃO',
        };

        const estoqueOutrasFiliais = multiloja
            .filter(f => f.empId !== filialId)
            .map(f => ({
                empId:   f.empId,
                nome:    outrasFiliaisMap[f.empId] || `Filial ${f.empId}`,
                estoque: Number(f.qtde ?? f.estoque ?? 0),
            }));

        // Preço: usa valorVenda como padrão
        const preco = Number(raw.valorVenda || raw.preco || raw.valor || 0);

        return {
            erpProdutoId:    raw.id,
            erpProdutoDesc:  (raw.descricao || raw.nome || '').trim(),
            erpCodigoFab:    (raw.codigoFab || raw.referencia || raw.codigo || '').trim(),
            erpGrupo:        (raw.grupo?.descricao || raw.grupoDesc || '').trim(),
            fabricante:      (raw.marcaDesc || raw.marca || raw.fabricante || '').trim(),
            unidade:         raw.un || raw.unidade || 'UN',
            ean:             raw.ean || raw.codigoBarras || '',
            estoqueFilial,
            estoqueOutrasFiliais,
            estoqueTotal:    Number(raw.qtde || 0),
            preco,
            confidencia:     'erp', // produto no ERP = dado confirmado
            parteMestreId:   null,
            _temEstoque:     estoqueFilial > 0,
            _temEstoqueOutro: estoqueOutrasFiliais.some(f => f.estoque > 0),
        };
    }

    // ── Busca de detalhes de produto ERP (com estoque atualizado) ──
    /**
     * Busca dados completos de um produto ERP por ID.
     * Não usa cache — sempre busca em tempo real (estoque pode mudar).
     */
    async function getProductDetails(erpProdutoId, filialId = 1) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl(`product/${erpProdutoId}`);
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`Produto #${erpProdutoId}: HTTP ${resp.status}`);
        const raw = await resp.json();
        return _mapErpProduct(raw, filialId);
    }

    // ── Busca de clientes ERP ─────────────────────────────────
    /**
     * Busca clientes do sessionStorage (sincronizados pelo adapter).
     * Filtragem local por nome, fantasia ou CNPJ.
     */
    function searchClients(query) {
        const q = (query || '').trim().toLowerCase();
        if (q.length < 2) return [];

        // Tenta sessionStorage (_erp_clients_maxdata) primeiro
        let clients = [];
        try {
            const ss = sessionStorage.getItem('_erp_clients_maxdata');
            if (ss) clients = JSON.parse(ss);
        } catch (_) {}

        // Fallback: Utils.getStorage
        if (clients.length === 0 && typeof Utils !== 'undefined' && Utils.getStorage) {
            clients = Utils.getStorage('clients') || [];
        }

        return clients
            .filter(c => {
                const nome     = (c.nome || '').toLowerCase();
                const fantasia = (c.fantasia || '').toLowerCase();
                const cnpj     = (c.cnpj || '').replace(/\D/g, '');
                return nome.includes(q) || fantasia.includes(q) || cnpj.includes(q);
            })
            .slice(0, 15);
    }

    // ── Limpar cache ──────────────────────────────────────────
    function clearCache() { _cache.clear(); }

    return {
        search,
        getProductDetails,
        searchClients,
        clearCache,
    };

})();

if (typeof window !== 'undefined') window.DemandaSearch = DemandaSearch;

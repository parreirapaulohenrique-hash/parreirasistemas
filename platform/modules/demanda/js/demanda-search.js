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
     * Cascata: Firestore synced → base técnica → ERP (opcional)
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
        const seen    = new Set();

        // CAMADA 0 (PRIMÁRIA): Produtos sincronizados no Firestore (maxdata_sync.py)
        // Sempre funciona, independente de acesso ao ERP.
        try {
            const fsProducts = await _searchFirestoreProducts(q, filialId);
            for (const r of fsProducts) {
                const key = `fs:${r.erpProdutoId || r._firestoreId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ ...r, _fonte: 'firestore_sync', _rank: r._rank || 90 });
                }
            }
        } catch (e) { console.warn('[DemandaSearch] Firestore products falhou:', e.message); }

        // CAMADA 1: Base técnica Firestore (referências cruzadas OEM)
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

        // CAMADA 2: ERP em tempo real (opcional — falha silenciosa se inacessível)
        if (results.length < 5) {
            try {
                const erpRef = await _searchErpByRef(q, filialId);
                for (const r of erpRef) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_ref_exata', _rank: 100 });
                    }
                }
            } catch (_) { /* ERP inacessível — ignora */ }
        }

        // CAMADA 3: Busca textual ERP (última opção)
        if (results.length < 3) {
            try {
                const erpText = await _searchErpByText(q, filialId, limit);
                for (const r of erpText) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_texto', _rank: 60 });
                    }
                }
            } catch (_) { /* ERP inacessível — ignora */ }
        }

        const sorted = results.sort((a, b) => b._rank - a._rank).slice(0, limit);
        _setCache(cacheKey, sorted);
        return sorted;
    }

    // ── Busca no Firestore (techbase/products — coleção sincronizada) ─────
    /**
     * Busca produtos no Firestore usando prefix range queries.
     * Funciona para: código exato, prefixo de referência, prefixo de descrição.
     */
    // ── Busca no Firestore (techbase/products — coleção sincronizada) ─────
    /**
     * Busca produtos no Firestore usando referências exatas, referências cruzadas e texto.
     * Funciona para: código exato, referências cruzadas (similares), prefixo de referência e descrição.
     */
    async function _searchFirestoreProducts(query, filialId) {
        if (typeof firebase === 'undefined') return [];
        const db  = firebase.firestore();
        const col = `tenants/${TENANT_ID}/demanda/techbase/products`;

        const qUp = query.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const qNorm = qUp.replace(/[\s\-\.\/]/g, '');
        const end = qUp + '\uf8ff';
        const results = [];
        const seen = new Set();

        const addItem = (doc) => {
            if (seen.has(doc.id)) return;
            seen.add(doc.id);
            const d = doc.data();
            results.push(_mapFirestoreProduct(d, doc.id, filialId, qUp, qNorm));
        };

        // 1. Busca por código de fábrica / referência
        try {
            const refSnap = await db.collection(col)
                .where('referencia', '>=', qUp).where('referencia', '<=', end)
                .where('ativo', '==', true).limit(15).get();
            refSnap.docs.forEach(d => addItem(d));
        } catch (_) {}

        // 2. Busca por referências cruzadas (similares indexados via array-contains)
        if (qNorm.length >= 3) {
            try {
                const crossSnap = await db.collection(col)
                    .where('referenciasCruzadas', 'array-contains', qNorm)
                    .where('ativo', '==', true).limit(15).get();
                crossSnap.docs.forEach(d => addItem(d));
            } catch (_) {}
        }

        // 3. Busca por código ERP exato (numérico)
        if (/^\d+$/.test(query)) {
            try {
                const codeSnap = await db.collection(col)
                    .where('codigoErp', '==', query)
                    .limit(5).get();
                codeSnap.docs.forEach(d => addItem(d));
            } catch (_) {}
        }

        // 4. Busca por descrição (prefix) — complementa referência
        if (results.length < 15) {
            try {
                const descSnap = await db.collection(col)
                    .where('descNorm', '>=', qUp).where('descNorm', '<=', end)
                    .where('ativo', '==', true).limit(15).get();
                descSnap.docs.forEach(d => addItem(d));
            } catch (_) {
                try {
                    const descSnap2 = await db.collection(col)
                        .where('descricao', '>=', query).where('descricao', '<=', query + '\uf8ff')
                        .where('ativo', '==', true).limit(10).get();
                    descSnap2.docs.forEach(d => addItem(d));
                } catch (_2) {}
            }
        }

        return results;
    }

    // ── Mapeamento Firestore product → ResultadoBusca ─────────
    function _mapFirestoreProduct(d, docId, filialId, queryNorm, queryClean) {
        const ref  = (d.referencia || '').toUpperCase();
        const refClean = (d.codigoNorm || ref.replace(/[\s\-\.\/]/g, ''));
        const desc = (d.descricao  || '').toUpperCase();
        const descClean = desc.replace(/[\s\-\.\/]/g, '');
        const aplicacao = (d.aplicacao || '').toUpperCase();
        const aplicacaoClean = aplicacao.replace(/[\s\-\.\/]/g, '');
        const cross = Array.isArray(d.referenciasCruzadas) ? d.referenciasCruzadas : [];

        // Novos campos tecnicos
        const equipamento    = (d.equipamento || '').trim();
        const similarGenuino = (d.similarGenuino || '').trim();
        const similar1       = (d.similar1 || '').trim();
        const similar2       = (d.similar2 || '').trim();
        const similar3       = (d.similar3 || '').trim();
        const similar4       = (d.similar4 || '').trim();
        const refFornecedor  = (d.refFornecedor || '').trim();
        const fotoProduto    = (d.fotoProduto || '').trim();
        const fonte          = (d.fonte || '').trim();
        const statusPesquisa = (d.statusPesquisa || '').trim();

        const simGenuinoClean = similarGenuino.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim1Clean       = similar1.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim2Clean       = similar2.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim3Clean       = similar3.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim4Clean       = similar4.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const refFornClean    = refFornecedor.toUpperCase().replace(/[\s\-\.\/]/g, '');

        let tipoMatch = 'descricao';
        let motivoMatch = 'Encontrado por descricao';
        let rank = 70;

        if (refClean === queryClean || ref === queryNorm) {
            tipoMatch = 'exato';
            motivoMatch = 'Codigo Exato';
            rank = 100;
        } else if (simGenuinoClean && (simGenuinoClean === queryClean || simGenuinoClean === queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Similar Genuino / OEM (' + similarGenuino + ')';
            rank = 98;
        } else if ([sim1Clean, sim2Clean, sim3Clean, sim4Clean].filter(Boolean).includes(queryClean)) {
            tipoMatch = 'similar';
            motivoMatch = 'Peca Similar de Mercado';
            rank = 96;
        } else if (refFornClean && (refFornClean === queryClean || refFornClean === queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Ref. Fornecedor (' + refFornecedor + ')';
            rank = 95;
        } else if (cross.includes(queryClean)) {
            tipoMatch = 'similar';
            motivoMatch = 'Similar / Ref. Cruzada (' + (queryNorm || queryClean) + ')';
            rank = 94;
        } else if (refClean.startsWith(queryClean) || ref.startsWith(queryNorm)) {
            tipoMatch = 'exato';
            motivoMatch = 'Prefixo do Codigo';
            rank = 90;
        } else if (aplicacaoClean.includes(queryClean) || aplicacao.includes(queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Codigo citado na Aplicacao Tecnica';
            rank = 88;
        } else if (descClean.includes(queryClean) || desc.includes(queryNorm)) {
            tipoMatch = 'descricao';
            motivoMatch = 'Descricao do produto';
            rank = 75;
        }

        return {
            _firestoreId:         docId,
            erpProdutoId:         d.codigoErp || null,
            erpProdutoDesc:       (d.descricao || d.descPdv || '').trim(),
            erpCodigoFab:         (d.referencia || '').trim(),
            erpCodigoOriginal:    (d.referencia || '').trim(),
            erpGrupo:             (d.grupo || '').trim(),
            erpSubGrupo:          '',
            fabricante:           (d.fabricante || d.marca || '').trim(),
            marca:                (d.marca || d.fabricante || '').trim(),
            fabricanteId:         null,
            unidade:              d.unidade || d.un || 'UN',
            aplicacao:            (d.aplicacao || '').trim(),
            equipamento:          equipamento,
            similarGenuino:       similarGenuino,
            similar1:             similar1,
            similar2:             similar2,
            similar3:             similar3,
            similar4:             similar4,
            refFornecedor:        refFornecedor,
            fotoProduto:          fotoProduto,
            fonte:                fonte,
            statusPesquisa:       statusPesquisa,
            referenciasCruzadas:  cross,
            tipoMatch:            tipoMatch,
            motivoMatch:          motivoMatch,
            localizador:          '',
            ean:                  (d.barcode || '').trim(),
            estoqueFilial:        Number(d.estoque || 0),
            estoqueOutrasFiliais: [],
            estoqueTotal:         Number(d.estoque || 0),
            preco:                Number(d.preco || 0),
            valorAtacado:         0,
            valorCusto:           0,
            confidencia:          'erp',
            parteMestreId:        null,
            _temEstoque:          Number(d.estoque || 0) > 0,
            _temEstoqueOutro:     false,
            _source:              'firestore',
            _rank:                rank,
        };
    }

    // async function _searchErpByRef(query, filialId) {
        const adapter = _getAdapter();
        const normRef = DemandaImport ? DemandaImport.normalizeRef(query) : query.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const headers = await adapter._authHeaders();
        const results = [];

        // Maxdata GET /product aceita: codigoFab, codigoBarras (barcode) e descricao (texto)
        const attempts = [
            adapter._buildUrl('product', { codigoFab: query.trim(), limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { codigoFab: normRef, limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { codigoBarras: normRef, limit: 15, sincronizacao: true }),
            adapter._buildUrl('product', { codigoBarras: query.toUpperCase(), limit: 15, sincronizacao: true }),
            adapter._buildUrl('product', { descricao: normRef, limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { descricao: query, limit: 30, sincronizacao: true }),
        ];

        for (const url of attempts) {
            try {
                const resp  = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const data  = await resp.json();
                const items = Array.isArray(data) ? data : (data.docs || data.data || []);
                for (const item of items) {
                    const fab = (item.codigoFab || item.codigoOriginal || '').toUpperCase().replace(/[\s\-\.\/]/g, '');
                    const app = (item.aplicacao || '').toUpperCase().replace(/[\s\-\.\/]/g, '');
                    const desc = (item.descricao || '').toUpperCase().replace(/[\s\-\.\/]/g, '');

                    let matchType = null;
                    let matchMotivo = '';
                    if (fab === normRef || fab.includes(normRef) || normRef.includes(fab)) {
                        matchType = (fab === normRef) ? 'exato' : 'exato';
                        matchMotivo = 'Código correspondente no ERP';
                    } else if (app.includes(normRef)) {
                        matchType = 'similar';
                        matchMotivo = 'Similar encontrado na aplicação do produto (' + query + ')';
                    } else if (desc.includes(normRef)) {
                        matchType = 'descricao';
                        matchMotivo = 'Código na descrição';
                    }

                    if (matchType) {
                        results.push(_mapErpProduct(item, filialId, matchType, matchMotivo));
                    }
                }
                if (results.length === 0 && items.length > 0) {
                    items.slice(0, 5).forEach(item => results.push(_mapErpProduct(item, filialId, 'descricao', 'Busca aproximada')));
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
        const url     = adapter._buildUrl('product', { descricao: query, limit, sincronizacao: true });
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
    function _mapErpProduct(raw, filialId, tipoMatch = 'exato', motivoMatch = 'Encontrado no ERP') {
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
                estoque: Number(f.estoque ?? 0),
                preco:   Number(f.valorVenda ?? 0),
            }));

        // Preço: prefere preço da filial via multiloja, fallback no produto
        const preco = Number(
            filialData.valorVenda ??
            raw.valorVenda ??
            raw.valorAtacado ??
            raw.valorCusto ??
            0
        );

        // Barcodes: codBarras é array no schema Maxdata
        const barcodes = Array.isArray(raw.codBarras) ? raw.codBarras.join(', ') : (raw.codBarras || '');

        // Extrai referências cruzadas da aplicação e descrição
        const cross = new Set();
        if (raw.codigoFab) cross.add(String(raw.codigoFab).toUpperCase().replace(/[\s\-\.\/]/g, ''));
        if (raw.codigoOriginal) cross.add(String(raw.codigoOriginal).toUpperCase().replace(/[\s\-\.\/]/g, ''));
        const textTokens = ((raw.aplicacao || '') + ' ' + (raw.descricao || '')).toUpperCase().split(/[\s,;\/\+\|]+/);
        for (const tok of textTokens) {
            const clean = tok.replace(/[\s\-\.\/]/g, '');
            if (clean.length >= 3 && /\d/.test(clean)) cross.add(clean);
        }

        return {
            erpProdutoId:         raw.id,
            erpProdutoDesc:       (raw.descricao || raw.descPdv || '').trim(),
            erpCodigoFab:         (raw.codigoFab  || raw.codigoOriginal || '').trim(),
            erpCodigoOriginal:    (raw.codigoOriginal || '').trim(),
            erpGrupo:             (raw.grupo    || '').trim(),
            erpSubGrupo:          (raw.subGrupo || '').trim(),
            fabricante:           (raw.fabricante || '').trim(),
            fabricanteId:         raw.fabricanteId || null,
            unidade:              raw.un || 'UN',
            aplicacao:            (raw.aplicacao || '').trim(),    // equipamento compatível / referências
            referenciasCruzadas:  Array.from(cross),
            tipoMatch:            tipoMatch,
            motivoMatch:          motivoMatch,
            localizador:          (raw.localizador || raw.prateleira || '').trim(),
            ean:                  barcodes,
            estoqueFilial,
            estoqueOutrasFiliais,
            estoqueTotal:         Number(raw.estoque ?? 0),
            preco,
            valorAtacado:         Number(raw.valorAtacado ?? 0),
            valorCusto:           Number(raw.valorCusto ?? 0),
            confidencia:          'erp',
            parteMestreId:        null,
            _temEstoque:          estoqueFilial > 0,
            _temEstoqueOutro:     estoqueOutrasFiliais.some(f => f.estoque > 0),
            _source:              'erp',
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

    // ── Busca de clientes ──────────────────────────────────────
    /**
     * Busca clientes. Usa Firestore (DemandaClientes) como fonte primária.
     * Fallback: sessionStorage (sincronização legada).
     */
    async function searchClients(query) {
        const q = (query || '').trim();
        if (q.length < 2) return [];

        // PRIMÁRIO: Firestore via DemandaClientes (767 clientes sincronizados)
        if (typeof DemandaClientes !== 'undefined') {
            try {
                const fsClients = await DemandaClientes.buscar(q);
                if (fsClients.length > 0) return fsClients.slice(0, 15);
            } catch (_) {}
        }

        // FALLBACK: sessionStorage (legado)
        let clients = [];
        try {
            const ss = sessionStorage.getItem('_erp_clients_maxdata');
            if (ss) clients = JSON.parse(ss);
        } catch (_) {}

        if (clients.length === 0 && typeof Utils !== 'undefined' && Utils.getStorage) {
            clients = Utils.getStorage('clients') || [];
        }

        const qLow = q.toLowerCase();
        return clients.filter(c => {
            const nome     = (c.nome || '').toLowerCase();
            const fantasia = (c.fantasia || c.nomeFantasia || '').toLowerCase();
            const cnpj     = (c.cnpj || c.documento || '').replace(/\D/g, '');
            return nome.includes(qLow) || fantasia.includes(qLow) || cnpj.includes(qLow);
        }).slice(0, 15);
    }

    // ── Limpar cache ──────────────────────────────────────────
    function clearCache() { _cache.clear(); }

    return {
        search,
        getProductDetails,
        searchClients,
        clearCache,
        getAdapter: _getAdapter,   // exposto para DemandaLookup.syncMaxdataToTechbase
    };

})();

if (typeof window !== 'undefined') window.DemandaSearch = DemandaSearch;

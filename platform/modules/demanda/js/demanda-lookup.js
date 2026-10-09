/**
 * demanda-lookup.js — Motor de Lookup e Base Técnica de Peças
 * ============================================================
 * Verifica se cada peça de uma demanda existe no ERP (Maxdata)
 * e na base técnica (Firestore), classificando-as em:
 *
 *   🟢 em_estoque   — no Maxdata com estoque disponível
 *   🟡 sem_estoque  — no Maxdata, mas sem estoque na filial
 *   🔵 catalogado   — na base técnica / PDF, não cadastrado no ERP
 *   🔴 novo         — peça desconhecida, precisa cadastro e cotação
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v2.4.0
 */

const DemandaLookup = (() => {

    function _getTenantId() {
        try {
            if (window.ParreiraAuth) {
                if (typeof ParreiraAuth.getTenantId === 'function') {
                    const tid = ParreiraAuth.getTenantId();
                    if (tid) return String(tid);
                }
                if (typeof ParreiraAuth.getTenant === 'function') {
                    const t = ParreiraAuth.getTenant();
                    if (t && typeof t === 'object' && t.id) return String(t.id);
                    if (t && typeof t === 'string') return t;
                }
            }
            if (window.sessionManager && typeof sessionManager.getTenantId === 'function') {
                const t = sessionManager.getTenantId();
                if (t) return String(t);
            }
            const s = JSON.parse(sessionStorage.getItem('parreira_session') || localStorage.getItem('parreira_session_ls') || 'null');
            if (s && s.tenantId) return String(s.tenantId);
        } catch (_) {}
        return String(localStorage.getItem('app_tenant_id') || 'centralpecas');
    }
    const TECHBASE     = () => `tenants/${_getTenantId()}/demanda/techbase`;
    const _productsCol = () => `${TECHBASE()}/products`;

    // ── Status ────────────────────────────────────────────────
    const STATUS = {
        EM_ESTOQUE:  'em_estoque',
        SEM_ESTOQUE: 'sem_estoque',
        CATALOGADO:  'catalogado',
        NOVO:        'novo',
        BUSCANDO:    'buscando',
    };

    const STATUS_LABEL = {
        em_estoque:  '🟢 Em Estoque',
        sem_estoque: '🟡 Sem Estoque',
        catalogado:  '🔵 Catalogado',
        novo:        '🔴 Nova Peça',
        buscando:    '⏳ Buscando...',
    };

    const STATUS_COLOR = {
        em_estoque:  'var(--accent-success)',
        sem_estoque: '#f59e0b',
        catalogado:  '#60a5fa',
        novo:        'var(--accent-danger)',
        buscando:    'var(--text-secondary)',
    };

    const STATUS_DESC = {
        em_estoque:  'Produto em estoque — pode cotar e vender imediatamente.',
        sem_estoque: 'Produto cadastrado no ERP, mas sem estoque. Precisa comprar.',
        catalogado:  'Peça conhecida (catálogo), ainda não cadastrada no ERP. Precisa cadastrar e cotar.',
        novo:        'Peça desconhecida. Precisa cadastro, pesquisa de fornecedor e cotação.',
        buscando:    'Verificando na base de dados...',
    };

    function _db() {
        if (typeof firebase === 'undefined') throw new Error('Firebase não disponível');
        return firebase.firestore();
    }

    function _normalizeRef(ref) {
        return (ref || '').toUpperCase().replace(/[\s\-\.\/]/g, '');
    }

    // ── Lookup de item único ───────────────────────────────────
    /**
     * @param {string} refOriginal - Referência original da peça
     * @param {string} descOriginal - Descrição (fallback de busca)
     * @param {number} filialId - ID da filial para verificar estoque
     * @returns {Promise<{status, erpData, techbaseData}>}
     */
    async function lookupItem(refOriginal, descOriginal, filialId = 1) {
        const refNorm = _normalizeRef(refOriginal);
        const query   = refOriginal || descOriginal || '';

        if (!query.trim()) return { status: STATUS.NOVO, erpData: null, techbaseData: null };

        // ── 1. Tenta Maxdata via DemandaSearch ──────────────────
        if (typeof DemandaSearch !== 'undefined') {
            try {
                const results = await DemandaSearch.search(query, { filialId, limit: 5 });
                if (results && results.length > 0) {
                    // Prefere resultado com codigoFab que bate com a ref
                    const exato = results.find(r => _normalizeRef(r.erpCodigoFab) === refNorm);
                    const erpData = exato || results[0];
                    const temEstoque = (erpData.estoqueFilial || 0) > 0 || erpData._temEstoqueOutro;
                    return {
                        status:       temEstoque ? STATUS.EM_ESTOQUE : STATUS.SEM_ESTOQUE,
                        erpData,
                        techbaseData: null,
                    };
                }
            } catch (_) { /* ERP offline ou não configurado — fallback para techbase */ }
        }

        // ── 2. Tenta Firestore techbase ──────────────────────────
        if (refNorm && typeof firebase !== 'undefined') {
            try {
                let snap = await _db().collection(_productsCol()).doc(refNorm).get();
                if (!snap.exists) {
                    const qSnap = await _db().collection(_productsCol()).where('codigoNorm', '==', refNorm).limit(1).get();
                    if (!qSnap.empty) snap = qSnap.docs[0];
                }
                if (snap.exists) {
                    return {
                        status:       STATUS.CATALOGADO,
                        erpData:      null,
                        techbaseData: snap.data(),
                    };
                }
            } catch (_) { /* Firestore offline */ }
        }

        return { status: STATUS.NOVO, erpData: null, techbaseData: null };
    }

    // ── Lookup em lote ─────────────────────────────────────────
    /**
     * @param {Array} itens - Itens da demanda
     * @param {number} filialId
     * @param {function} onProgress - (itemIdx, total, result) => void
     */
    async function lookupAll(itens, filialId = 1, onProgress) {
        const results = [];
        for (let i = 0; i < itens.length; i++) {
            const item = itens[i];
            try {
                const result = await lookupItem(item.refOriginal, item.descOriginal, filialId);
                const enriched = { ...item, _lookup: result };
                results.push(enriched);
                if (onProgress) onProgress(i + 1, itens.length, enriched);
            } catch (_) {
                const enriched = { ...item, _lookup: { status: STATUS.NOVO, erpData: null, techbaseData: null } };
                results.push(enriched);
                if (onProgress) onProgress(i + 1, itens.length, enriched);
            }
        }
        return results;
    }

    // ── Salvar produto na base técnica ─────────────────────────
    async function saveToTechbase(produto, origem = 'manual') {
        if (!produto.codigoFab && !produto.erpCodigoFab) return;
        const code = produto.codigoFab || produto.erpCodigoFab;
        const key  = _normalizeRef(code);
        if (!key) return;

        await _db().collection(_productsCol()).doc(key).set({
            codigoFab:    code,
            codigoNorm:   key,
            descricao:    (produto.descricao || produto.erpProdutoDesc || produto.descPdv || '').trim(),
            fabricante:   (produto.fabricante || '').toUpperCase().trim(),
            aplicacao:    (produto.aplicacao  || '').trim(),
            grupo:        (produto.grupo      || produto.erpGrupo    || '').trim(),
            subGrupo:     (produto.subGrupo   || produto.erpSubGrupo || '').trim(),
            erpProdutoId: produto.erpProdutoId || produto.id || null,
            hasErpRecord: !!(produto.erpProdutoId || produto.id),
            origem,
            updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    // ── Salvar lote (sync Maxdata / PDF) ───────────────────────
    async function saveBatchToTechbase(produtos, origem = 'maxdata', onProgress) {
        const db         = _db();
        const BATCH_MAX  = 450;  // limite Firestore é 500
        let   batch      = db.batch();
        let   count      = 0;
        let   savedTotal = 0;

        for (const p of produtos) {
            const code = p.codigoFab || p.codigoOriginal || p.erpCodigoFab;
            if (!code) continue;
            const key = _normalizeRef(code);
            if (!key || key.length < 3) continue;

            const ref = db.collection(_productsCol()).doc(key);
            batch.set(ref, {
                codigoFab:    code,
                codigoNorm:   key,
                descricao:    (p.descricao || p.erpProdutoDesc || p.descPdv || '').trim(),
                fabricante:   (p.fabricante || '').toUpperCase().trim(),
                aplicacao:    (p.aplicacao  || '').trim(),
                grupo:        (p.grupo      || p.erpGrupo    || '').trim(),
                subGrupo:     (p.subGrupo   || p.erpSubGrupo || '').trim(),
                erpProdutoId: p.id          || p.erpProdutoId || null,
                hasErpRecord: !!(p.id       || p.erpProdutoId),
                origem,
                updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            count++;
            savedTotal++;

            if (count >= BATCH_MAX) {
                await batch.commit();
                batch = db.batch();
                count = 0;
                if (onProgress) onProgress(savedTotal, null);
            }
        }

        if (count > 0) await batch.commit();
        if (onProgress) onProgress(savedTotal, null);
        return savedTotal;
    }

    // ── Sync Maxdata → Firestore Techbase ─────────────────────
    /**
     * Baixa todos os produtos do Maxdata com paginação
     * e salva na base técnica Firestore, filtrando pelas
     * marcas agrícolas definidas em MARCAS_AGRI.
     *
     * @param {number} filialId
     * @param {function} onProgress - (totalSalvo, pagina, itensNaPagina) => void
     * @returns {Promise<number>} Total de produtos salvos
     */
    const MARCAS_AGRI = [
        // Máquinas agrícolas (Prompt 2 — Seção 5.2)
        'JOHN DEERE', 'DEERE',
        'NEW HOLLAND', 'CNH',
        'CASE', 'CASE IH',
        'MASSEY FERGUSON', 'AGCO', 'VALTRA',
        // Implementos e equipamentos agrícolas (Prompt 2 — Seção 5.2)
        'KUHN',
        'JAN',
        'VENCE TUDO',
        'JUMIL',
        'TATU', 'MARCHESAN', 'TATU MARCHESAN',
        'JACTO',
        'STARA',
        'BALDAN',
        'SEMEATO',
        'PICCIN',
        // Fabricantes de transmissões e componentes críticos
        'ZF', 'EATON', 'SPICER'
    ];

    async function syncMaxdataToTechbase(filialId = 1, onProgress) {
        if (typeof DemandaSearch === 'undefined') throw new Error('DemandaSearch não disponível.');
        const adapter = DemandaSearch.getAdapter();
        if (!adapter) throw new Error('ERP não configurado. Acesse Integração ERP → Configurar.');

        if (typeof adapter.syncProducts === 'function') {
            const res = await adapter.syncProducts({
                onProgress: (salvo, pagina, totalPaginas) => {
                    if (onProgress) onProgress(salvo, pagina, 200);
                }
            });
            return res.added || res.total || 0;
        }

        const headers   = await adapter._authHeaders();
        const limit     = 200;
        let   pagina    = 1;
        let   totalSalvo = 0;
        let   continuar  = true;

        while (continuar) {
            const url  = adapter._buildUrl('product', { page: pagina, limit, desativado: 'false' });
            const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(30000) });
            if (!resp.ok) break;

            const data  = await resp.json();
            const items = Array.isArray(data) ? data : (data.docs || data.data || []);
            if (items.length === 0) break;

            const ativos = items.filter(p => !p.desativado && p.desativado !== true);
            if (ativos.length > 0) {
                await saveBatchToTechbase(ativos, 'maxdata');
                totalSalvo += ativos.length;
                if (onProgress) onProgress(totalSalvo, pagina, ativos.length);
            }

            continuar = items.length >= limit;
            pagina++;
        }

        return totalSalvo;
    }

    // ── Buscar produtos da base técnica ────────────────────────
    async function searchTechbase(query, limit = 20) {
        if (typeof firebase === 'undefined') return [];
        const db      = _db();
        const refNorm = _normalizeRef(query);

        // Busca exata por código normalizado
        if (refNorm) {
            const snap = await db.collection(_productsCol()).doc(refNorm).get();
            if (snap.exists) return [snap.data()];
            const q = await db.collection(_productsCol()).where('codigoNorm', '==', refNorm).limit(limit).get();
            if (!q.empty) return q.docs.map(d => d.data());
        }

        // Busca por prefixo de código (range query)
        if (refNorm.length >= 3) {
            const snap = await db.collection(_productsCol())
                .where('codigoNorm', '>=', refNorm)
                .where('codigoNorm', '<=', refNorm + '\uf8ff')
                .limit(limit)
                .get();
            return snap.docs.map(d => d.data());
        }

        return [];
    }

    // ── Inteligência de Equivalências OEM e Similares (Lote B - Prompt 2) ──
    const TIERS_CONF = {
        OEM:   ['JOHN DEERE', 'CASE', 'CASE IH', 'NEW HOLLAND', 'MASSEY FERGUSON', 'VALTRA', 'AGCO', 'KUHN', 'JACTO', 'STARA'],
        TIER1: ['TIMKEN', 'SKF', 'NSK', 'FAG', 'INA', 'KOYO', 'NTN', 'ZF', 'EATON', 'SPICER', 'DANA', 'BOSCH', 'PARKER'],
        TIER2: ['SABO', 'FREUDENBERG', 'TARANTO', 'CORTECO', 'FRAS-LE', 'COBREQ', 'DAYCO', 'GATES', 'CONTINENTAL', 'MAHLE']
    };

    /**
     * Busca equivalências OEM e similares técnicos para uma referência.
     * @param {string} codigo - Código ou referência do produto
     * @param {string} marcaOriginal - Marca/fabricante original
     * @returns {Promise<Array>} Lista ordenada de equivalências com confiança e status de estoque
     */
    async function getEquivalencias(codigo, marcaOriginal = '') {
        const norm = _normalizeRef(codigo);
        if (!norm) return [];

        const equivalencias = [];
        const seen = new Set([norm]);

        // 1. Busca na base técnica (Firestore)
        try {
            const produtosTech = await searchTechbase(codigo, 5);
            for (const p of produtosTech) {
                // Similar Genuíno OEM
                if (p.similarGenuino && !_isSame(p.similarGenuino, norm)) {
                    _addEquiv(equivalencias, seen, p.similarGenuino, p.fabricante || 'OEM', 'Genuíno OEM', 98, p.descricao, p.aplicacao);
                }
                // Similares 1 a 4
                for (let k = 1; k <= 4; k++) {
                    const sim = p['similar' + k] || p['similares' + k];
                    if (sim && !_isSame(sim, norm)) {
                        _addEquiv(equivalencias, seen, sim, p.fabricante || 'Similar', 'Similar Técnico', 85, p.descricao, p.aplicacao);
                    }
                }
                if (Array.isArray(p.similares)) {
                    p.similares.forEach(sim => {
                        if (sim && !_isSame(sim, norm)) {
                            _addEquiv(equivalencias, seen, sim, p.fabricante || 'Similar', 'Similar Técnico', 85, p.descricao, p.aplicacao);
                        }
                    });
                }
            }
        } catch (_) {}

        // 2. Busca no catálogo/ERP MaxData via DemandaSearch para obter saldo de estoque real das equivalências
        if (typeof DemandaSearch !== 'undefined' && equivalencias.length > 0) {
            await Promise.all(equivalencias.map(async eq => {
                try {
                    const res = await DemandaSearch.search(eq.codigo, { limit: 1 });
                    if (res && res.length > 0) {
                        const erpItem = res[0];
                        eq.estoque = erpItem.estoqueFilial || 0;
                        eq.preco = erpItem.precoVenda || erpItem.preco || 0;
                        eq.erpProdutoId = erpItem.erpProdutoId || erpItem.id;
                        eq.temEstoque = eq.estoque > 0;
                    }
                } catch (_) {}
            }));
        }

        // Ordena: primeiro os que têm estoque, depois pela maior confiança técnica
        return equivalencias.sort((a, b) => {
            if (a.temEstoque && !b.temEstoque) return -1;
            if (!a.temEstoque && b.temEstoque) return 1;
            return b.confianca - a.confianca;
        });
    }

    function _isSame(a, b) {
        return _normalizeRef(a) === _normalizeRef(b);
    }

    function _addEquiv(list, seen, ref, marca, tipo, confPadrao, desc, aplicacao) {
        const n = _normalizeRef(ref);
        if (!n || seen.has(n)) return;
        seen.add(n);

        let conf = confPadrao;
        let badgeTipo = tipo;
        const mUpper = (marca || '').toUpperCase();

        if (TIERS_CONF.OEM.some(oem => mUpper.includes(oem))) {
            conf = 100;
            badgeTipo = 'Genuíno OEM';
        } else if (TIERS_CONF.TIER1.some(t1 => mUpper.includes(t1))) {
            conf = Math.max(conf, 95);
            badgeTipo = 'Fabricante Original (Tier-1)';
        } else if (TIERS_CONF.TIER2.some(t2 => mUpper.includes(t2))) {
            conf = Math.max(conf, 88);
            badgeTipo = 'Reposição Certificada';
        }

        list.push({
            codigo: ref,
            marca: marca || 'Original',
            tipo: badgeTipo,
            confianca: conf,
            confiancaLabel: conf + '% Confiança',
            descricao: desc || 'Peça Técnica Equivalente',
            aplicacao: aplicacao || 'Linha Agrícola',
            estoque: 0,
            preco: 0,
            temEstoque: false
        });
    }

    return {
        STATUS,
        STATUS_LABEL,
        STATUS_COLOR,
        STATUS_DESC,
        lookupItem,
        lookupAll,
        saveToTechbase,
        saveBatchToTechbase,
        syncMaxdataToTechbase,
        searchTechbase,
        getEquivalencias,
    };

})();

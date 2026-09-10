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

    const TENANT_ID    = 'centralpecas';
    const TECHBASE     = `tenants/${TENANT_ID}/demanda/techbase`;
    const PRODUCTS_COL = `${TECHBASE}/products`;   // 5 segmentos = coleção válida

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
                let snap = await _db().collection(PRODUCTS_COL).doc(refNorm).get();
                if (!snap.exists) {
                    const qSnap = await _db().collection(PRODUCTS_COL).where('codigoNorm', '==', refNorm).limit(1).get();
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

        await _db().collection(PRODUCTS_COL).doc(key).set({
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

            const ref = db.collection(PRODUCTS_COL).doc(key);
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
        'JOHN DEERE', 'DEERE',
        'NEW HOLLAND', 'CNH',
        'CASE', 'CASE IH',
        'MASSEY FERGUSON', 'AGCO', 'VALTRA',
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
            const snap = await db.collection(PRODUCTS_COL).doc(refNorm).get();
            if (snap.exists) return [snap.data()];
            const q = await db.collection(PRODUCTS_COL).where('codigoNorm', '==', refNorm).limit(limit).get();
            if (!q.empty) return q.docs.map(d => d.data());
        }

        // Busca por prefixo de código (range query)
        if (refNorm.length >= 3) {
            const snap = await db.collection(PRODUCTS_COL)
                .where('codigoNorm', '>=', refNorm)
                .where('codigoNorm', '<=', refNorm + '\uf8ff')
                .limit(limit)
                .get();
            return snap.docs.map(d => d.data());
        }

        return [];
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
    };

})();

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

    // ── Geração de código sequencial legível ─────────────────
    async function _nextCodigo() {
        const db    = _db();
        const ref   = db.doc(_configCol());  // 4 segmentos — documento valido
        const snap  = await ref.get();
        const next  = ((snap.exists ? snap.data().lastDemanda : 0) || 0) + 1;
        await ref.set({ lastDemanda: next }, { merge: true });
        const year  = new Date().getFullYear();
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
        for (let i = 0; i < itens.length; i++) {
            const itemRef = demandaRef.collection('items').doc();
            batch.set(itemRef, _buildItemDoc(itemRef.id, demandaId, itens[i], i + 1, now));
        }

        await batch.commit();
        return demandaId;
    }

    /**
     * Busca uma demanda pelo ID com busca resiliente em múltiplos caminhos e fallback.
     * Retorna null se não encontrada ou se for documento fantasma sem dados.
     */
    async function getDemanda(demandaId) {
        if (!demandaId) return null;
        const db = _db();
        let snap = await db.doc(`${_demandsCol()}/${demandaId}`).get().catch(() => ({ exists: false }));
        if (!snap.exists) {
            // Tenta em centralpecas
            snap = await db.doc(`tenants/centralpecas/demanda/data/demands/${demandaId}`).get().catch(() => ({ exists: false }));
        }
        if (!snap.exists) {
            // Tenta em [object Object]
            snap = await db.doc(`tenants/[object Object]/demanda/data/demands/${demandaId}`).get().catch(() => ({ exists: false }));
        }
        if (!snap.exists) {
            // Tenta em demandas legado
            snap = await db.doc(`tenants/centralpecas/demandas/${demandaId}`).get().catch(() => ({ exists: false }));
        }
        if (!snap.exists) return null;
        const data = snap.data();
        if (!data || (!data.codigo && !data.clienteNome && !data.totalItens)) return null;
        return { id: snap.id, ...data };
    }

    /**
     * Atualiza campos da demanda.
     */
    async function updateDemanda(demandaId, fields) {
        await _db().doc(`${_demandsCol()}/${demandaId}`).update({
            ...fields,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    const _CACHE_KEY_DEMANDAS = () => 'demanda_cache_demandas_' + _getTenantId();

    /**
     * Lista demandas do tenant com filtros opcionais.
     * Suporta fallback para o tenant histórico 'centralpecas', tenants legados '[object Object]' e cache local resiliente.
     * @param {object} filters - { vendedorId, status, filialId, limit }
     * @returns {Promise<Array>}
     */
    async function listDemandas(filters = {}) {
        const tid = _getTenantId();
        try {
            let q = _db().collection(_demandsCol()).orderBy('criadoEm', 'desc');

            if (filters.vendedorId) q = q.where('vendedorId', '==', filters.vendedorId);
            if (filters.filialId)   q = q.where('filialId',   '==', filters.filialId);
            if (filters.status && filters.status !== 'todas') q = q.where('status', '==', filters.status);
            q = q.limit(filters.limit || 60);

            const snap = await q.get();
            let lista = snap.docs.map(d => ({ ...d.data(), id: d.id }));

            // Fallback histórico transparente 1: se tenant atual for diferente de 'centralpecas'
            // consulta também o histórico de 'centralpecas'
            const mapIds = new Map();
            lista.forEach(item => mapIds.set(item.id, item));

            if (tid !== 'centralpecas') {
                try {
                    let qFallback = _db().collection(`tenants/centralpecas/demanda/data/demands`).orderBy('criadoEm', 'desc').limit(filters.limit || 60);
                    if (filters.status && filters.status !== 'todas') qFallback = qFallback.where('status', '==', filters.status);
                    const snapFallback = await qFallback.get();
                    snapFallback.docs.forEach(d => {
                        if (!mapIds.has(d.id)) {
                            mapIds.set(d.id, { ...d.data(), id: d.id, _origemFallback: 'centralpecas' });
                        }
                    });
                } catch (_) { /* Ignora se permissão ou cota */ }
            }

            // Fallback histórico transparente 2: consulta também tenants/[object Object] caso existam cotações não migradas
            try {
                let qObj = _db().collection(`tenants/[object Object]/demanda/data/demands`).orderBy('criadoEm', 'desc').limit(filters.limit || 60);
                if (filters.status && filters.status !== 'todas') qObj = qObj.where('status', '==', filters.status);
                const snapObj = await qObj.get();
                snapObj.docs.forEach(d => {
                    if (!mapIds.has(d.id)) {
                        mapIds.set(d.id, { ...d.data(), id: d.id, _origemFallback: 'legado_obj' });
                    }
                });
            } catch (_) { /* Ignora se não existir */ }

            lista = Array.from(mapIds.values()).filter(d => d && d.id && (d.codigo || d.clienteNome || (d.totalItens && d.totalItens > 0)));

            // Ordena lista combinada por criadoEm decrescente
            lista.sort((a, b) => {
                const ta = a.criadoEm ? (a.criadoEm.toMillis ? a.criadoEm.toMillis() : new Date(a.criadoEm).getTime()) : 0;
                const tb = b.criadoEm ? (b.criadoEm.toMillis ? b.criadoEm.toMillis() : new Date(b.criadoEm).getTime()) : 0;
                return tb - ta;
            });

            // Salva no cache local resiliente
            try {
                localStorage.setItem(_CACHE_KEY_DEMANDAS(), JSON.stringify(lista));
                localStorage.setItem('demanda_cache_demandas_centralpecas', JSON.stringify(lista));
            } catch (_) {}

            return lista;
        } catch (err) {
            console.warn('[DemandaDB] listDemandas aviso/erro:', err.message || err);
            // Se cota excedida (429) ou offline, restaura do cache local
            const rawCache = localStorage.getItem(_CACHE_KEY_DEMANDAS()) || localStorage.getItem('demanda_cache_demandas_centralpecas');
            if (rawCache) {
                try {
                    const cached = JSON.parse(rawCache);
                    if (Array.isArray(cached) && cached.length > 0) {
                        if (typeof window !== 'undefined' && window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('demanda:quota_warning', { detail: { msg: 'Exibindo dados do cache local (Cota do Firestore atingida).' } }));
                        }
                        return cached;
                    }
                } catch (_) {}
            }
            throw err;
        }
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
            atualizadoEm:  now,
        });

        await batch.commit();
        await recalcTotals(demandaId).catch(() => {});
        return itemIds;
    }

    /**
     * Busca os itens de uma demanda com busca resiliente caso o documento tenha sido gravado sob caminho legado.
     */
    async function getItens(demandaId) {
        const db = _db();
        let snap = await db
            .collection(`${DEMANDS_COL}/${demandaId}/items`)
            .orderBy('seq', 'asc')
            .get();
        if (snap.empty) {
            // Tenta em centralpecas
            const s2 = await db.collection(`tenants/centralpecas/demanda/data/demands/${demandaId}/items`).orderBy('seq', 'asc').get();
            if (!s2.empty) return s2.docs.map(d => d.data());
            // Tenta em [object Object]
            const s3 = await db.collection(`tenants/[object Object]/demanda/data/demands/${demandaId}/items`).orderBy('seq', 'asc').get();
            if (!s3.empty) return s3.docs.map(d => d.data());
        }
        return snap.docs.map(d => d.data());
    }

    /**
     * Atualiza campos de um item específico.
     * Acrescenta entrada na timeline se houver mudança de status.
     */
    async function updateItem(demandaId, itemId, fields, timelineEntry = null) {
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

        await ref.update(update);
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

        // 2. Caminhos possíveis de onde a demanda pode ter sido criada/persistida
        const candidatePaths = [
            `${DEMANDS_COL}/${demandaId}`,
            `tenants/centralpecas/demanda/data/demands/${demandaId}`,
            `tenants/[object Object]/demanda/data/demands/${demandaId}`,
            `tenants/centralpecas/demandas/${demandaId}`
        ];

        for (const p of candidatePaths) {
            try {
                const docRef = db.doc(p);
                const snap = await docRef.get().catch(() => ({ exists: false }));
                if (snap.exists) {
                    const itemsSnap = await docRef.collection('items').get().catch(() => ({ docs: [] }));
                    const batch = db.batch();
                    if (itemsSnap.docs && itemsSnap.docs.length > 0) {
                        itemsSnap.docs.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                    }
                    batch.delete(docRef);
                    await batch.commit().catch(() => {});
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
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

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
     * Busca itens da fila de compras usando collectionGroup.
     * Estados: sem_estoque, encaminhado_compras, cotacao_fornecedor, compra_possivel
     * @returns {Promise<Array>}
     */
    async function listItensFila(limit = 80) {
        const FILA_STATES = ['sem_estoque', 'encaminhado_compras', 'cotacao_fornecedor', 'compra_possivel'];
        const db      = _db();
        const results = [];
        const seen    = new Set();

        await Promise.all(FILA_STATES.map(async (status) => {
            try {
                const snap = await db.collectionGroup('items')
                    .where('status', '==', status)
                    .where('demandaId', '!=', null)
                    .limit(limit)
                    .get();
                snap.docs.forEach(d => {
                    if (!seen.has(d.id)) {
                        seen.add(d.id);
                        results.push(d.data());
                    }
                });
            } catch (e) {
                console.warn('[DemandaDB] listItensFila status=' + status + ':', e.message);
            }
        }));

        // Ordena: sem_estoque primeiro, depois compra_possivel (mais urgente)
        const ORDER = { sem_estoque: 0, encaminhado_compras: 1, cotacao_fornecedor: 2, compra_possivel: 3 };
        return results.sort((a, b) => (ORDER[a.status] || 9) - (ORDER[b.status] || 9));
    }

    /**
     * Agrega KPIs do dashboard a partir dos totalizadores das demandas.
     * @returns {Promise<object>}
     */
    async function getDashboardStats() {
        const demandas = await listDemandas({ limit: 200 });
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
        addItens, getItens, updateItem, updateItemStatus, updateItensBatch, deleteItem, recalcTotals, splitItem,
        onItensChanged, listItensFila, getDashboardStats,
        saveSession, loadSession, clearSession, saveCatalogoItem, listCatalogoItems,
        purgeLocalCache: _purgeLocalDemandCache,
        get TENANT_ID()   { return _getTenantId(); },
        get BASE_PATH()   { return _basePath(); },
        get DEMANDS_COL() { return _demandsCol(); },
        get CONFIG_COL()  { return _configCol(); },
        get CATALOG_COL() { return _catalogCol(); },
        getTenantId: _getTenantId
    };

})();

if (typeof window !== 'undefined') window.DemandaDB = DemandaDB;

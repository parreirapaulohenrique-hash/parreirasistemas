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

    // ── Configuração ─────────────────────────────────────────
    const TENANT_ID   = 'centralpecas';
    const BASE_PATH   = `tenants/${TENANT_ID}/demanda`;          // 3 segs — subcoleção valida
    const DEMANDS_COL = `${BASE_PATH}/data/demands`;             // 5 segs — coleção valida (ímpar) ✅
    const CONFIG_COL  = `${BASE_PATH}/config`;                   // 4 segs — documento valido (par)  ✅

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
        const ref   = db.doc(`${CONFIG_COL}`);  // 4 segmentos — documento valido
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

        const demandaRef = db.collection(DEMANDS_COL).doc();
        const demandaId  = demandaRef.id;

        const demandaDoc = {
            id:                demandaId,
            tenantId:          TENANT_ID,
            codigo,
            status:            'aberta',
            origem:            data.origem     || 'manual',
            canalOrigem:       data.canalOrigem || '',
            clienteId:         data.clienteId  || null,
            clienteNome:       data.clienteNome || '',
            clienteCnpj:       data.clienteCnpj || '',
            vendedorId:        data.vendedorId  || null,
            vendedorNome:      data.vendedorNome || '',
            filialId:          data.filialId    || 1,
            filialNome:        data.filialNome  || '',
            obs:               data.obs        || '',
            documentos:        [],
            totalItens:        0,
            totalIdentificados: 0,
            totalComEstoque:   0,
            totalSemEstoque:   0,
            totalPerdidos:     0,
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
     * Busca uma demanda pelo ID (sem itens).
     */
    async function getDemanda(demandaId) {
        const snap = await _db().doc(`${DEMANDS_COL}/${demandaId}`).get();
        if (!snap.exists) throw new Error(`Cotação ${demandaId} não encontrada.`);
        return snap.data();
    }

    /**
     * Atualiza campos da demanda.
     */
    async function updateDemanda(demandaId, fields) {
        await _db().doc(`${DEMANDS_COL}/${demandaId}`).update({
            ...fields,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    /**
     * Lista demandas do tenant com filtros opcionais.
     * @param {object} filters - { vendedorId, status, filialId, limit }
     * @returns {Promise<Array>}
     */
    async function listDemandas(filters = {}) {
        let q = _db().collection(DEMANDS_COL).orderBy('criadoEm', 'desc');

        if (filters.vendedorId) q = q.where('vendedorId', '==', filters.vendedorId);
        if (filters.filialId)   q = q.where('filialId',   '==', filters.filialId);
        if (filters.status)     q = q.where('status',     '==', filters.status);
        q = q.limit(filters.limit || 50);

        const snap = await q.get();
        return snap.docs.map(d => d.data());
    }

    /**
     * Exclui uma demanda e todos os seus itens permanentemente.
     */
    async function deleteDemanda(demandaId) {
        const db = _db();
        const itemsSnap = await db.collection(`${DEMANDS_COL}/${demandaId}/items`).get();
        const batch = db.batch();
        itemsSnap.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.doc(`${DEMANDS_COL}/${demandaId}`));
        await batch.commit();
        return true;
    }

    /**
     * Estorna (cancela) uma cotação e seus itens pendentes.
     */
    async function estornarDemanda(demandaId, motivo = '', usuario = 'sistema') {
        const db = _db();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        
        await db.doc(`${DEMANDS_COL}/${demandaId}`).update({
            status: 'cancelada',
            estornadoEm: now,
            estornadoPor: usuario,
            motivoEstorno: motivo || 'Cotação estornada',
            canceladoEm: now,
            atualizadoEm: now
        });

        const itemsSnap = await db.collection(`${DEMANDS_COL}/${demandaId}/items`).get();
        const batch = db.batch();
        itemsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'faturado' && data.status !== 'venda_perdida') {
                batch.update(doc.ref, {
                    status: 'cancelado',
                    motivoCancelamento: motivo || 'Demanda estornada',
                    atualizadoEm: now
                });
            }
        });
        await batch.commit();
        return true;
    }

    /**
     * Reabre uma cotação previamente cancelada/estornada.
     */
    async function reabrirDemanda(demandaId, usuario = 'sistema') {
        const db = _db();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        
        await db.doc(`${DEMANDS_COL}/${demandaId}`).update({
            status: 'aberta',
            reabertoEm: now,
            reabertoPor: usuario,
            atualizadoEm: now
        });

        const itemsSnap = await db.collection(`${DEMANDS_COL}/${demandaId}/items`).get();
        const batch = db.batch();
        itemsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'cancelado') {
                batch.update(doc.ref, {
                    status: 'demanda_recebida',
                    atualizadoEm: now
                });
            }
        });
        await batch.commit();
        return true;
    }

    // ── ITENS ─────────────────────────────────────────────────

    /**
     * Constrói o documento de um item com todos os campos default e classificação inteligente.
     */
    function _buildItemDoc(itemId, demandaId, raw, seq, timestamp) {
        const qtde = Number(raw.qtdeSolicitada || raw.qtde || 1);
        const preco = Number(raw.preco || raw.valor || raw.precoUnitario || 0);
        const erpId = raw.erpProdutoId || raw.codigoErp || null;
        const estoque = (raw.estoqueFilial !== undefined && raw.estoqueFilial !== null)
            ? Number(raw.estoqueFilial)
            : (raw.estoque !== undefined && raw.estoque !== null ? Number(raw.estoque) : null);

        // Classificação inteligente de status inicial:
        let initialStatus = raw.status || 'demanda_recebida';
        let initialObs    = 'Item registrado na cotação.';

        if (!raw.status) {
            if (erpId) {
                if (estoque !== null && estoque >= qtde && estoque > 0) {
                    initialStatus = 'estoque_disponivel';
                    initialObs = `Identificado no ERP com estoque disponível (${estoque} un).`;
                } else if (estoque !== null && estoque > 0 && estoque < qtde) {
                    initialStatus = 'estoque_parcial';
                    initialObs = `Estoque parcial no ERP: ${estoque} un disponíveis de ${qtde} un solicitadas.`;
                } else if (estoque !== null && estoque <= 0) {
                    initialStatus = 'sem_estoque';
                    initialObs = 'Produto cadastrado no ERP, porém sem estoque imediato. Encaminhado para Compras.';
                } else {
                    initialStatus = 'identificado';
                    initialObs = 'Produto identificado no ERP.';
                }
            } else if (raw.refOriginal || raw.descOriginal) {
                initialStatus = 'demanda_recebida';
                initialObs = 'Item recebido. Em pesquisa e identificação.';
            }
        }

        return {
            id:            itemId,
            demandaId,
            seq,
            // Dado original (imutável)
            refOriginal:   raw.refOriginal   || raw.ref  || raw.codigoFab || '',
            descOriginal:  raw.descOriginal  || raw.desc || raw.descricao || '',
            qtdeSolicitada: qtde,
            unidadeOriginal: raw.unidade || raw.un || 'UN',
            obsCliente:    raw.obs || '',
            // Identificação ERP / Base Técnica
            status:        initialStatus,
            parteMestreId: raw.parteMestreId || null,
            erpProdutoId:  erpId ? String(erpId) : null,
            erpProdutoDesc: raw.erpProdutoDesc || raw.descPdv || raw.descricao || '',
            erpCodigoFab:  raw.erpCodigoFab || raw.codigoFab || raw.referencia || '',
            erpGrupo:      raw.erpGrupo || raw.grupo || '',
            fabricante:    raw.fabricante || '',
            confidenciaIdentificacao: raw.confidencia || (erpId ? 'erp' : 'pendente'),
            identificadoPor:  raw.identificadoPor || null,
            identificadoEm:   raw.identificadoEm  || null,
            // Estoque
            estoqueFilial:    estoque,
            estoqueOutrasFiliais: raw.estoqueOutrasFiliais || [],
            estoqueVerificadoEm:  new Date().toISOString(),
            // Quantidades
            qtdeDisponivel:  estoque !== null ? Math.min(qtde, Math.max(0, estoque)) : 0,
            qtdeFaltante:    estoque !== null ? Math.max(0, qtde - Math.max(0, estoque)) : 0,
            qtdeTransferencia: 0,
            qtdeCompra:      estoque !== null && estoque < qtde ? Math.max(0, qtde - Math.max(0, estoque)) : 0,
            qtdeAprovada:    0,
            qtdeVendida:     0,
            qtdePerdida:     0,
            // Preço
            precoUnitario:   preco > 0 ? preco : null,
            preco:           preco > 0 ? preco : null,
            tabelaPrecoId:   raw.tabelaPrecoId || null,
            desconto:        Number(raw.desconto || 0),
            valorTotal:      preco > 0 ? Number((preco * qtde).toFixed(2)) : null,
            // Fila de Compras / Fornecedor
            compraFornecedor: raw.compraFornecedor || null,
            compraMarca:      raw.compraMarca      || null,
            compraCusto:      Number(raw.compraCusto || 0),
            compraQtde:       Number(raw.compraQtde || 0),
            compraPrazoDias:  Number(raw.compraPrazo || raw.compraPrazoDias || 0),
            compraObs:        raw.compraObs || '',
            // Vínculo ERP
            erpSaleItemId:   null,
            erpSaleId:       raw.erpSaleId || null,
            // Venda perdida estruturada
            vendaPerdida:    initialStatus === 'venda_perdida',
            tipoPerda:       raw.tipoPerda || null,
            motivoPerda:     raw.motivoPerda || null,
            motivoPerdaDetalhe: raw.motivoPerdaDetalhe || raw.obsPerda || '',
            valorPerdido:    Number(raw.valorPerdido || 0),
            // Timeline
            timeline: [{
                evento: 'item_criado',
                de:     null,
                para:   initialStatus,
                por:    raw.criadoPor || 'sistema',
                em:     new Date().toISOString(),
                obs:    initialObs
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
        return itemIds;
    }

    /**
     * Busca os itens de uma demanda.
     */
    async function getItens(demandaId) {
        const snap = await _db()
            .collection(`${DEMANDS_COL}/${demandaId}/items`)
            .orderBy('seq', 'asc')
            .get();
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
        await db.doc(`${DEMANDS_COL}/${demandaId}`).update({
            totalItens:   firebase.firestore.FieldValue.increment(-1),
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    /**
     * Recalcula e salva os totalizadores de uma demanda.
     */
    async function recalcTotals(demandaId) {
        const itens = await getItens(demandaId);
        const totals = {
            totalItens:         itens.length,
            totalIdentificados: itens.filter(i => i.erpProdutoId || i.parteMestreId).length,
            totalComEstoque:    itens.filter(i => ['estoque_disponivel', 'estoque_parcial'].includes(i.status)).length,
            totalSemEstoque:    itens.filter(i => i.status === 'sem_estoque').length,
            totalPerdidos:      itens.filter(i => i.status === 'venda_perdida').length,
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
     * Carrega uma demanda por ID, incluindo seus itens da subcoleção.
     * @param {string} id - ID do documento da demanda
     * @returns {Promise<object|null>}
     */
    async function getDemanda(id) {
        const db   = _db();
        const snap = await db.doc(`${DEMANDS_COL}/${id}`).get();
        if (!snap.exists) return null;

        const data = { id: snap.id, ...snap.data() };

        // Carrega itens da subcoleção (se existir)
        try {
            const itensSnap = await db
                .collection(`${DEMANDS_COL}/${id}/items`)
                .orderBy('seq', 'asc')
                .get();
            data.itens = itensSnap.docs.map(d => d.data());
        } catch (_) {
            // Pode ser que itens estejam embutidos no documento (modo flat)
            if (!data.itens) data.itens = [];
        }

        return data;
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

    /**
     * Agrega dados completos para os Relatórios Gerenciais de Inteligência Comercial (Prompt 2).
     * @param {number|null} dias - Filtro de dias (ex: 7, 30, 0 para este mês, null para tudo)
     * @returns {Promise<object>}
     */
    async function getRelatoriosData(dias = null) {
        const db = _db();
        let q = db.collection(DEMANDS_COL).orderBy('criadoEm', 'desc').limit(300);

        if (dias && dias > 0) {
            const cutoff = new Date(Date.now() - dias * 86400000);
            q = q.where('criadoEm', '>=', cutoff);
        }

        const snap = await q.get();
        const demandas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Carrega todos os itens em paralelo
        const itensPorDemanda = await Promise.all(demandas.map(async (d) => {
            const itensSnap = await db.collection(`${DEMANDS_COL}/${d.id}/items`).get();
            return {
                demanda: d,
                itens: itensSnap.docs.map(doc => ({ id: doc.id, demandaId: d.id, ...doc.data() }))
            };
        }));

        // Estruturas de agregação
        const perdas = {
            totalValor: 0,
            totalItens: 0,
            porMotivo: {},
            porTipo: {},
            lista: []
        };

        const demandaReprimidaMap = new Map();
        const novosSkusMap         = new Map();
        const performanceVendedores = {};
        const performanceFiliais    = {};

        let totalCotacoes = demandas.length;
        let cotacoesAprovadas = 0;
        let cotacoesPerdidas  = 0;
        let valorTotalCotado  = 0;
        let valorTotalVendido = 0;

        itensPorDemanda.forEach(({ demanda: d, itens }) => {
            const vNome = d.vendedorNome || d.vendedorId || 'Não informado';
            const fNome = d.filialNome || `Filial ${d.filialId || 1}`;

            if (!performanceVendedores[vNome]) {
                performanceVendedores[vNome] = { nome: vNome, total: 0, aprovadas: 0, perdidas: 0, valorVendido: 0, valorPerdido: 0 };
            }
            if (!performanceFiliais[fNome]) {
                performanceFiliais[fNome] = { nome: fNome, total: 0, aprovadas: 0, perdidas: 0, valorVendido: 0, valorPerdido: 0 };
            }

            performanceVendedores[vNome].total++;
            performanceFiliais[fNome].total++;

            let hasApproved = false;
            let hasLost = false;

            itens.forEach(it => {
                const qtde = Number(it.qtdeSolicitada || it.qtde || 1);
                const preco = Number(it.preco || it.precoUnitario || it.valor || 0);
                const valTotal = preco > 0 ? (qtde * preco) : 0;
                valorTotalCotado += valTotal;

                // 1. Vendas Perdidas
                if (it.status === 'venda_perdida' || it.vendaPerdida === true) {
                    hasLost = true;
                    perdas.totalItens++;
                    const valP = Number(it.valorPerdido || valTotal || 0);
                    perdas.totalValor += valP;

                    const mot = it.motivoPerda || 'motivo_desconhecido';
                    const tip = it.tipoPerda || 'tipo2';

                    if (!perdas.porMotivo[mot]) perdas.porMotivo[mot] = { count: 0, valor: 0 };
                    perdas.porMotivo[mot].count++;
                    perdas.porMotivo[mot].valor += valP;

                    if (!perdas.porTipo[tip]) perdas.porTipo[tip] = { count: 0, valor: 0 };
                    perdas.porTipo[tip].count++;
                    perdas.porTipo[tip].valor += valP;

                    performanceVendedores[vNome].valorPerdido += valP;
                    performanceFiliais[fNome].valorPerdido += valP;

                    perdas.lista.push({
                        id: it.id,
                        demandaId: d.id,
                        demandaCodigo: d.codigo,
                        cliente: d.clienteNome || 'Avulso',
                        vendedor: vNome,
                        referencia: it.refOriginal || it.erpCodigoFab || '—',
                        descricao: it.descOriginal || it.erpProdutoDesc || '—',
                        qtde,
                        valor: valP,
                        motivo: mot,
                        tipo: tip,
                        obs: it.motivoPerdaDetalhe || it.obs || '',
                        data: d.criadoEm && d.criadoEm.toDate ? d.criadoEm.toDate().toLocaleDateString('pt-BR') : '—'
                    });
                }

                // 2. Vendas Aprovadas / Pedido ERP
                if (['venda_aprovada', 'pedido_criado_erp', 'faturado'].includes(it.status)) {
                    hasApproved = true;
                    valorTotalVendido += valTotal;
                    performanceVendedores[vNome].valorVendido += valTotal;
                    performanceFiliais[fNome].valorVendido += valTotal;
                }

                // 3. Demanda Reprimida (itens com falta de estoque imediato ou em fila de compras)
                if (['sem_estoque', 'estoque_parcial', 'encaminhado_compras', 'cotacao_fornecedor', 'compra_possivel'].includes(it.status) || (it.status === 'venda_perdida' && ['sem_estoque', 'tipo2', 'prazo'].includes(it.motivoPerda || it.tipoPerda))) {
                    const key = (it.erpCodigoFab || it.refOriginal || it.descOriginal || 'OUTROS').toUpperCase().trim();
                    if (!demandaReprimidaMap.has(key)) {
                        demandaReprimidaMap.set(key, {
                            referencia: it.erpCodigoFab || it.refOriginal || key,
                            descricao: it.erpProdutoDesc || it.descOriginal || '—',
                            fabricante: it.fabricante || '—',
                            pedidosCount: 0,
                            qtdeTotal: 0,
                            valorEstimado: 0,
                            statusMaisComum: it.status
                        });
                    }
                    const entry = demandaReprimidaMap.get(key);
                    entry.pedidosCount++;
                    entry.qtdeTotal += qtde;
                    entry.valorEstimado += valTotal;
                }

                // 4. Novos SKUs (itens sem cadastro no ERP pedidos pelos clientes)
                if (!it.erpProdutoId && !it.codigoErp) {
                    const key = (it.refOriginal || it.descOriginal || 'SEM_REF').toUpperCase().trim();
                    if (key && key !== 'SEM_REF') {
                        if (!novosSkusMap.has(key)) {
                            novosSkusMap.set(key, {
                                referencia: it.refOriginal || key,
                                descricao: it.descOriginal || '—',
                                cotacoesCount: 0,
                                qtdeSolicitada: 0,
                                clientes: new Set()
                            });
                        }
                        const entry = novosSkusMap.get(key);
                        entry.cotacoesCount++;
                        entry.qtdeSolicitada += qtde;
                        if (d.clienteNome) entry.clientes.add(d.clienteNome);
                    }
                }
            });

            if (hasApproved) {
                cotacoesAprovadas++;
                performanceVendedores[vNome].aprovadas++;
                performanceFiliais[fNome].aprovadas++;
            }
            if (hasLost) {
                cotacoesPerdidas++;
                performanceVendedores[vNome].perdidas++;
                performanceFiliais[fNome].perdidas++;
            }
        });

        // Ordena listas
        const demandaReprimida = Array.from(demandaReprimidaMap.values())
            .sort((a, b) => b.pedidosCount - a.pedidosCount)
            .slice(0, 50);

        const novosSkus = Array.from(novosSkusMap.values())
            .map(s => ({ ...s, clientesCount: s.clientes.size, clientes: Array.from(s.clientes).slice(0, 3).join(', ') }))
            .sort((a, b) => b.cotacoesCount - a.cotacoesCount)
            .slice(0, 50);

        const taxaConversao = totalCotacoes > 0 ? Math.round((cotacoesAprovadas / totalCotacoes) * 100) : 0;
        const taxaPerda     = totalCotacoes > 0 ? Math.round((cotacoesPerdidas / totalCotacoes) * 100) : 0;

        return {
            resumo: {
                totalCotacoes,
                cotacoesAprovadas,
                cotacoesPerdidas,
                taxaConversao,
                taxaPerda,
                valorTotalCotado,
                valorTotalVendido,
                valorTotalPerdido: perdas.totalValor,
                totalItensPerdidos: perdas.totalItens
            },
            perdas,
            demandaReprimida,
            novosSkus,
            vendedores: Object.values(performanceVendedores),
            filiais: Object.values(performanceFiliais)
        };
    }

    return {
        createDemanda, getDemanda, updateDemanda, listDemandas, deleteDemanda, estornarDemanda, reabrirDemanda,
        addItens, getItens, updateItem, deleteItem, recalcTotals, splitItem,
        onItensChanged, listItensFila, getDashboardStats, getRelatoriosData,
        saveSession, loadSession, clearSession,
        TENANT_ID, DEMANDS_COL
    };

})();

if (typeof window !== 'undefined') window.DemandaDB = DemandaDB;

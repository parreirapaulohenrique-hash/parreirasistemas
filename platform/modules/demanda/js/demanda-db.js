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
    const BASE_PATH   = `tenants/${TENANT_ID}/demanda`;
    const DEMANDS_COL = `${BASE_PATH}/demands`;
    const CONFIG_COL  = `${BASE_PATH}/config`;

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
        const ref   = db.doc(`${CONFIG_COL}/sequence`);
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
        if (!snap.exists) throw new Error(`Demanda ${demandaId} não encontrada.`);
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

    // ── ITENS ─────────────────────────────────────────────────

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
            status:        'demanda_recebida',
            parteMestreId: null,
            erpProdutoId:  null,
            erpProdutoDesc: '',
            erpCodigoFab:  '',
            erpGrupo:      '',
            confidenciaIdentificacao: 'pendente',
            identificadoPor:  null,
            identificadoEm:   null,
            // Estoque
            estoqueFilial:    null,
            estoqueOutrasFiliais: [],
            estoqueVerificadoEm:  null,
            // Quantidades
            qtdeDisponivel:  0,
            qtdeFaltante:    0,
            qtdeTransferencia: 0,
            qtdeCompra:      0,
            qtdeAprovada:    0,
            qtdeVendida:     0,
            qtdePerdida:     0,
            // Preço
            precoUnitario:   null,
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
                evento: 'item_criado',
                de:     null,
                para:   'demanda_recebida',
                por:    raw.criadoPor || 'sistema',
                em:     new Date().toISOString(),
                obs:    'Item registrado na demanda.'
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

    return {
        createDemanda, getDemanda, updateDemanda, listDemandas,
        addItens, getItens, updateItem, deleteItem, recalcTotals,
        onItensChanged,
        saveSession, loadSession, clearSession,
        TENANT_ID, DEMANDS_COL
    };

})();

if (typeof window !== 'undefined') window.DemandaDB = DemandaDB;

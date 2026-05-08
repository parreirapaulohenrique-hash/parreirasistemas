// =============================================================================
// wms-store.js — Camada de Dados Firestore para o WMS
// Parreira Sistemas
// =============================================================================
// Substitui localStorage.wms_receipts_v2 pelo Firestore multi-tenant.
// Usado por: WMS (inbound.js) e WMS Coletor (coletor-inbound.js / coletor-conferencia.js)
// =============================================================================

window.WmsStore = (function () {

    // ─── DB helper ───────────────────────────────────────────────────────────
    function _db() { return firebase.firestore(); }
    function _tid() {
        const tid = window.ParreiraAuth?.getTenantId?.();
        if (!tid) throw new Error('WmsStore: usuário não autenticado.');
        return tid;
    }
    function _receiptsCol(tid) {
        return _db().collection('tenants').doc(tid).collection('receipts');
    }
    function _putawayCol(tid) {
        return _db().collection('tenants').doc(tid).collection('putaway');
    }
    const TS = () => firebase.firestore.FieldValue.serverTimestamp();

    // ─── RECEBIMENTOS ─────────────────────────────────────────────────────────

    /** Verifica se uma chave NF-e já existe no tenant. Retorna o doc ou null. */
    async function verificarNfDuplicada(chaveNfe) {
        const snap = await _receiptsCol(_tid())
            .where('chaveNfe', '==', chaveNfe)
            .limit(1).get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    /** Cria um novo recebimento no Firestore. */
    async function criarRecebimento(dados) {
        const tid = _tid();
        const id  = dados.id || ('REC-' + Date.now());
        await _receiptsCol(tid).doc(id).set({
            ...dados,
            id,
            tenantId:     tid,
            criadoEm:     TS(),
            atualizadoEm: TS()
        });
        return id;
    }

    /** Busca um recebimento por ID. */
    async function buscarRecebimento(id) {
        const doc = await _receiptsCol(_tid()).doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }

    /** Lista recebimentos com filtros opcionais. */
    async function listarRecebimentos(filtros = {}) {
        let q = _receiptsCol(_tid()).orderBy('criadoEm', 'desc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        if (filtros.limite) q = q.limit(filtros.limite);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /** Atualiza campos de um recebimento. */
    async function atualizarRecebimento(id, update) {
        await _receiptsCol(_tid()).doc(id).update({
            ...update,
            atualizadoEm: TS()
        });
    }

    /**
     * Atualiza _leituras (mapa sku→contagem) de um recebimento ativo.
     * Chamado durante a conferência — usa update parcial para performance.
     */
    async function salvarLeituras(id, leituras) {
        await _receiptsCol(_tid()).doc(id).update({
            _leituras:    leituras,
            atualizadoEm: TS()
        });
    }

    /** Finaliza a conferência: atualiza status e grava itens conferidos. */
    async function finalizarConferencia(id, { status, itensConferidos, operador, inicio, fim }) {
        await _receiptsCol(_tid()).doc(id).update({
            status,
            itensConferidos,
            operadorConferencia: operador,
            conferenciaInicio:   inicio,
            conferenciaFim:      fim,
            atualizadoEm:        TS()
        });
    }

    // ─── PUTAWAY ──────────────────────────────────────────────────────────────

    /** Cria tarefas de putaway para os itens conferidos. */
    async function criarPutaway(tasks) {
        const tid   = _tid();
        const batch = _db().batch();
        tasks.forEach(t => {
            const ref = _putawayCol(tid).doc(t.id || ('PUT-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)));
            batch.set(ref, { ...t, tenantId: tid, criadoEm: TS() });
        });
        await batch.commit();
    }

    // ─── LISTENER TEMPO REAL (WMS dashboard) ─────────────────────────────────

    /**
     * Escuta mudanças nos recebimentos em tempo real.
     * Retorna a função de cancelamento (unsubscribe).
     */
    function ouvirRecebimentos(callback, filtros = {}) {
        let q = _receiptsCol(_tid()).orderBy('criadoEm', 'desc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        return q.onSnapshot(snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }

    // ─── UTIL ─────────────────────────────────────────────────────────────────

    /** Converte timestamp Firestore ou string ISO para Date. */
    function toDate(val) {
        if (!val) return null;
        if (val?.toDate) return val.toDate();
        return new Date(val);
    }

    /** Formata data para exibição. */
    function fmtData(val) {
        const d = toDate(val);
        if (!d) return '—';
        return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    return {
        verificarNfDuplicada,
        criarRecebimento,
        buscarRecebimento,
        listarRecebimentos,
        atualizarRecebimento,
        salvarLeituras,
        finalizarConferencia,
        criarPutaway,
        ouvirRecebimentos,
        toDate, fmtData
    };
})();

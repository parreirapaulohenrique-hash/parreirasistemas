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

    /** Lista tarefas de putaway com filtros opcionais. */
    async function listarPutaway(filtros = {}) {
        let q = _putawayCol(_tid()).orderBy('criadoEm', 'asc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        if (filtros.sku)    q = q.where('sku',    '==', filtros.sku);
        if (filtros.limite) q = q.limit(filtros.limite);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /** Atualiza campos de uma tarefa de putaway. */
    async function atualizarPutaway(id, update) {
        await _putawayCol(_tid()).doc(id).update({ ...update, atualizadoEm: TS() });
    }

    /** Listener em tempo real das tarefas de putaway. */
    function ouvirPutaway(callback, filtros = {}) {
        let q = _putawayCol(_tid()).orderBy('criadoEm', 'asc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        return q.onSnapshot(snap =>
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }

    // ─── ACESSOS DE PICKING (base da Curva ABCD) ─────────────────────────────

    function _acessosCol(tid) {
        return _db().collection('tenants').doc(tid).collection('pickingAcessos');
    }

    /**
     * Registra um acesso de picking para um SKU.
     * Chamado toda vez que o operador conclui uma coleta — independente da qtd.
     */
    async function registrarAcessoPicking(sku) {
        const tid = _tid();
        const ref = _acessosCol(tid).doc(sku);
        await ref.set({
            sku,
            totalAcessos: firebase.firestore.FieldValue.increment(1),
            ultimoAcesso: new Date().toISOString(),
            tenantId: tid
        }, { merge: true });
    }

    /** Retorna todos os acessos de picking, ordenados por totalAcessos DESC. */
    async function listarAcessosPicking() {
        const snap = await _acessosCol(_tid()).orderBy('totalAcessos', 'desc').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * Calcula a curva ABCD de todos os SKUs com acessos registrados
     * e persiste a classificação de volta em cada documento.
     * Cortes definidos em wms_config.putaway.cortesABC (% do total de SKUs).
     * Retorna array classificado.
     */
    async function calcularEPersistirCurva() {
        const cfg       = JSON.parse(localStorage.getItem('wms_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
        const cortes    = cfg.putaway?.cortesABC || { a: 10, b: 30, c: 70 };
        const acessos   = await listarAcessosPicking();
        const total     = acessos.length;

        const tid   = _tid();
        const batch = _db().batch();

        acessos.forEach((item, idx) => {
            const pct  = total > 0 ? ((idx + 1) / total) * 100 : 100;
            let curva = 'D';
            if (pct <= cortes.a)                        curva = 'A';
            else if (pct <= cortes.a + cortes.b)        curva = 'B';
            else if (pct <= cortes.a + cortes.b + cortes.c) curva = 'C';

            const ref = _acessosCol(tid).doc(item.sku);
            batch.update(ref, { curva, atualizadoEm: TS() });
        });

        await batch.commit();
        return acessos;
    }

    /** Retorna a curva atual de um SKU (A/B/C/D). Retorna 'D' se não classificado. */
    async function buscarCurvaSku(sku) {
        const doc = await _acessosCol(_tid()).doc(sku).get();
        return doc.exists ? (doc.data().curva || 'D') : 'D';
    }

    // ─── LISTENER TEMPO REAL (WMS dashboard) ─────────────────────────────────

    function ouvirRecebimentos(callback, filtros = {}) {
        let q = _receiptsCol(_tid()).orderBy('criadoEm', 'desc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        return q.onSnapshot(snap =>
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }

    // ─── DIVERGÊNCIAS ─────────────────────────────────────────────────────────

    function _divCol(tid) {
        return _db().collection('tenants').doc(tid).collection('divergencias');
    }

    /** Cria um registro de divergência originado de uma conferência. */
    async function criarDivergencia(dados) {
        const tid = _tid();
        const id  = dados.id || ('DIV-' + Date.now());
        await _divCol(tid).doc(id).set({
            ...dados, id, tenantId: tid,
            criadoEm: TS(), atualizadoEm: TS()
        });
        return id;
    }

    /** Lista divergências com filtros opcionais (status, recebimentoId). */
    async function listarDivergencias(filtros = {}) {
        let q = _divCol(_tid()).orderBy('criadoEm', 'desc');
        if (filtros.status)        q = q.where('status', '==', filtros.status);
        if (filtros.recebimentoId) q = q.where('recebimentoId', '==', filtros.recebimentoId);
        if (filtros.limite)        q = q.limit(filtros.limite);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /** Atualiza campos de uma divergência (status, tratativas, etc.). */
    async function atualizarDivergencia(id, update) {
        await _divCol(_tid()).doc(id).update({ ...update, atualizadoEm: TS() });
    }

    /** Adiciona uma nova tratativa ao array de tratativas da divergência. */
    async function adicionarTratativa(id, tratativa) {
        await _divCol(_tid()).doc(id).update({
            tratativas:   firebase.firestore.FieldValue.arrayUnion({
                ...tratativa,
                dataHora: new Date().toISOString()
            }),
            atualizadoEm: TS()
        });
    }

    /** Listener em tempo real das divergências. */
    function ouvirDivergencias(callback, filtros = {}) {
        let q = _divCol(_tid()).orderBy('criadoEm', 'desc');
        if (filtros.status) q = q.where('status', '==', filtros.status);
        return q.onSnapshot(snap =>
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }

    // ─── ENDEREÇOS (Estrutura Física do Armazém) ────────────────────────────────────────

    function _enderecosCol(tid) {
        return _db().collection('tenants').doc(tid).collection('enderecos');
    }

    /**
     * Grava um array de endereços no Firestore em batches de 400.
     * Retorna o total de documentos gravados.
     */
    async function salvarEnderecosBatch(addrs) {
        const tid = _tid();
        const col = _enderecosCol(tid);
        const db  = _db();
        const BATCH_SIZE = 400;
        let total = 0;
        for (let i = 0; i < addrs.length; i += BATCH_SIZE) {
            const chunk = addrs.slice(i, i + BATCH_SIZE);
            const batch = db.batch();
            chunk.forEach(a => {
                const ref = col.doc(String(a.id));
                batch.set(ref, { ...a, tenantId: tid, atualizadoEm: TS() }, { merge: true });
            });
            await batch.commit();
            total += chunk.length;
        }
        return total;
    }

    /** Atualiza (merge) um único endereço no Firestore. Falha silenciosamente. */
    async function atualizarEndereco(id, update) {
        try {
            await _enderecosCol(_tid()).doc(String(id)).set(
                { ...update, atualizadoEm: TS() },
                { merge: true }
            );
        } catch(e) {
            console.warn('[WmsStore] atualizarEndereco falhou:', e);
        }
    }

    /** Remove um endereço do Firestore. Falha silenciosamente. */
    async function excluirEndereco(id) {
        try {
            await _enderecosCol(_tid()).doc(String(id)).delete();
        } catch(e) {
            console.warn('[WmsStore] excluirEndereco falhou:', e);
        }
    }

    /** Retorna todos os endereços do Firestore para o tenant. */
    async function listarEnderecos() {
        const snap = await _enderecosCol(_tid()).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /**
     * Listener em tempo real dos endereços.
     * Retorna função unsubscribe.
     */
    function ouvirEnderecos(callback) {
        try {
            const tid = _tid();
            return _enderecosCol(tid).onSnapshot(
                snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
                err  => console.warn('[WmsStore] ouvirEnderecos erro:', err)
            );
        } catch(e) {
            console.warn('[WmsStore] ouvirEnderecos init falhou:', e);
            return () => {};
        }
    }

    /**
     * Sincroniza Firestore → localStorage.
     * Retorna: N > 0 (N end. sincronizados) | 0 (Firestore vazio) | -1 (erro).
     */
    async function sincronizarEnderecos() {
        try {
            const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
            const key = 'wms_mock_data' + suf;
            const snap = await _enderecosCol(_tid()).get();
            if (snap.empty) return 0;
            const addrs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // So sobrescreve localStorage se Firestore tiver >= dados que o local
            // Evita apagar 12k enderecos locais com batch parcial do Firestore
            const localLen = JSON.parse(localStorage.getItem(key) || '[]').length;
            // Só sobrescreve se Firestore tem MAIS endereços que o local
            // (evita QuotaExceededError ao tentar regravar dados identicos)
            if (addrs.length > localLen) {
                try {
                    localStorage.setItem(key, JSON.stringify(addrs));
                    console.log('[WmsStore] ' + addrs.length + ' enderecos sincronizados do Firestore');
                } catch(qe) {
                    console.warn('[WmsStore] localStorage cheio, dados mantidos do local (' + localLen + ' end.)');
                }
            } else {
                console.log('[WmsStore] Firestore (' + addrs.length + ') <= local (' + localLen + '), mantendo local.');
            }
            return addrs.length;
        } catch(e) {
            console.warn('[WmsStore] sincronizarEnderecos falhou:', e);
            return -1;
        }
    }

    /**
     * Migração única: envia endereços do localStorage ao Firestore,
     * somente se o Firestore ainda estiver vazio para o tenant.
     */
    async function migrarEnderecos() {
        try {
            const check = await _enderecosCol(_tid()).limit(1).get();
            if (!check.empty) return { status: 'skip', message: 'Firestore já tem dados.' };
            const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
            const localAddrs = JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
            if (localAddrs.length === 0) return { status: 'empty', message: 'localStorage sem endereços.' };
            const count = await salvarEnderecosBatch(localAddrs);
            console.log(`🔼 [WmsStore] Migração: ${count} endereços enviados ao Firestore`);
            return { status: 'ok', count };
        } catch(e) {
            console.warn('[WmsStore] migrarEnderecos falhou:', e);
            return { status: 'error', message: e.message };
        }
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
        // Putaway
        criarPutaway,
        listarPutaway,
        atualizarPutaway,
        ouvirPutaway,
        // Curva ABCD
        registrarAcessoPicking,
        listarAcessosPicking,
        calcularEPersistirCurva,
        buscarCurvaSku,
        // Recebimentos listener
        ouvirRecebimentos,
        // Divergências
        criarDivergencia,
        listarDivergencias,
        atualizarDivergencia,
        adicionarTratativa,
        ouvirDivergencias,
        // Endereços (Estrutura Física)
        salvarEnderecosBatch,
        atualizarEndereco,
        excluirEndereco,
        listarEnderecos,
        ouvirEnderecos,
        sincronizarEnderecos,
        migrarEnderecos,
        toDate, fmtData
    };
})();


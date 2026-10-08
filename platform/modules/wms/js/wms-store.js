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
        // Tenta getTenantId primeiro; fallback para sessão (timing issue no carregamento inicial)
        const tid = window.ParreiraAuth?.getTenantId?.()
                 || window.ParreiraAuth?.getSessao?.()?.tenantId
                 || null;
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
        let q = _receiptsCol(_tid());
        if (filtros.status) q = q.where('status', '==', filtros.status);
        if (filtros.limite) q = q.limit(filtros.limite);
        const snap = await q.get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.criadoEm || b.dataCheckin || 0) - new Date(a.criadoEm || a.dataCheckin || 0));
        return list;
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
        let q = _putawayCol(_tid());
        if (filtros.status) q = q.where('status', '==', filtros.status);
        if (filtros.sku)    q = q.where('sku',    '==', filtros.sku);
        if (filtros.limite) q = q.limit(filtros.limite);
        const snap = await q.get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0));
        return list;
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
        let q = _divCol(_tid());
        if (filtros.status)        q = q.where('status', '==', filtros.status);
        if (filtros.recebimentoId) q = q.where('recebimentoId', '==', filtros.recebimentoId);
        if (filtros.limite)        q = q.limit(filtros.limite);
        const snap = await q.get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
        return list;
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

    /** Remove TODOS os endereços do Firestore em batches para não travar. */
    async function excluirTodosEnderecos() {
        const tid = _tid();
        const col = _enderecosCol(tid);
        const db  = _db();
        const snap = await col.get();
        if (snap.empty) return 0;
        
        const docs = snap.docs;
        const BATCH_SIZE = 400;
        let total = 0;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
            const chunk = docs.slice(i, i + BATCH_SIZE);
            const batch = db.batch();
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
            total += chunk.length;
        }
        return total;
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
            if (window.locationsState) {
                window.locationsState.gridData = addrs;
            }
            try {
                localStorage.setItem(key, JSON.stringify(addrs));
                console.log('[WmsStore] ' + addrs.length + ' enderecos sincronizados para local/memoria.');
            } catch(qe) {
                console.warn('[WmsStore] localStorage cheio, salvando apenas em memoria (' + addrs.length + ' end.)');
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

    
    // ═════════════════════════════════════════════════════════════════════════════
    // REGRAS DE ARMAZENAGEM & INVENTÁRIO
    // ═════════════════════════════════════════════════════════════════════════════

    function getRegrasArmazenagem() {
        try {
            const raw = localStorage.getItem('wms_config' + (window.getTenantSuffix ? window.getTenantSuffix() : ''));
            const cfg = raw ? JSON.parse(raw) : {};
            return {
                modo:                cfg.putaway?.modo || 'PICKING_PULMAO',
                tipoEnderec:         cfg.putaway?.tipoEnderec || 'FLUTUANTE', // 'FLUTUANTE' (dinamico) ou 'FIXO'
                limitePickingPorSku: cfg.putaway?.limitePickingPorSku || 'UNICO', // 'UNICO' ou 'MULTIPLO'
                acaoDivergencia:     cfg.putaway?.acaoDivergencia || 'ALERTAR', // 'ALERTAR', 'BLOQUEAR', 'ATUALIZAR'
                permiteMisturaSku:   cfg.putaway?.permiteMisturaSku !== false,
                enderecosFixos:      cfg.enderecoFixo || {}
            };
        } catch(e) {
            return {
                modo: 'PICKING_PULMAO', tipoEnderec: 'FLUTUANTE', limitePickingPorSku: 'UNICO',
                acaoDivergencia: 'ALERTAR', permiteMisturaSku: true, enderecosFixos: {}
            };
        }
    }

    /** Valida se a alocação de um SKU em determinado endereço cumpre as regras ativas */
    function validarAlocacaoArmazenagem(sku, enderecoAlvo, tipoEnderecoAlvo = 'PICKING') {
        const regras = getRegrasArmazenagem();
        const skuNorm = (sku || '').trim().toUpperCase();
        const endNorm = (enderecoAlvo || '').trim().toUpperCase();
        const tipoNorm = (tipoEnderecoAlvo || '').toUpperCase();

        const resultado = {
            valido: true,
            status: 'OK',
            mensagem: '',
            regras: regras,
            enderecoFixo: null,
            outrosPickings: []
        };

        // 1. Validar Endereço Fixo
        const fixoInfo = regras.enderecosFixos[skuNorm];
        if (fixoInfo && fixoInfo.endereco) {
            resultado.enderecoFixo = fixoInfo.endereco;
            if (regras.tipoEnderec === 'FIXO' && fixoInfo.endereco !== endNorm) {
                if (regras.acaoDivergencia === 'BLOQUEAR') {
                    resultado.valido = false;
                    resultado.status = 'BLOQUEADO_FIXO';
                    resultado.mensagem = `BLOQUEADO: O produto ${skuNorm} tem endereço fixo obrigatório em ${fixoInfo.endereco}.`;
                    return resultado;
                } else if (regras.acaoDivergencia === 'ATUALIZAR') {
                    resultado.status = 'SUGERIR_ATUALIZAR_FIXO';
                    resultado.mensagem = `O produto ${skuNorm} possui fixo em ${fixoInfo.endereco}. Deseja atualizar o endereço fixo para ${endNorm}?`;
                } else {
                    resultado.status = 'AVISO_FIXO_DIVERGENTE';
                    resultado.mensagem = `Atenção: Endereço fixo cadastrado deste produto é ${fixoInfo.endereco}.`;
                }
            }
        }

        // 2. Validar Política de Picking (Único vs Múltiplo)
        if (regras.limitePickingPorSku === 'UNICO' && tipoNorm === 'PICKING') {
            try {
                const stockData = window.StockManager ? window.StockManager.getData() : { addresses: [] };
                const outros = [];
                (stockData.addresses || []).forEach(a => {
                    const aEnd = (a.id || a.address || '').trim().toUpperCase();
                    if (aEnd && aEnd !== endNorm && (a.sku || '').toUpperCase() === skuNorm && (a.qty || 0) > 0) {
                        const aTipo = (a.type || a.tipo || 'PICKING').toUpperCase();
                        if (aTipo === 'PICKING') outros.push(aEnd);
                    }
                });

                if (outros.length > 0) {
                    resultado.outrosPickings = outros;
                    resultado.status = 'AVISO_PICKING_DUPLICADO';
                    resultado.mensagem = `Atenção: Este SKU já possui Picking ativo no endereço ${outros.join(', ')}. (Regra de Picking Único)`;
                }
            } catch(e) { console.warn('Erro ao validar outros pickings:', e); }
        }

        return resultado;
    }

    /** Grava item inventariado no estoque de endereço (Local + Firestore) */
    async function salvarItemInventariado(endereco, produto, quantidade, operador = 'Operador') {
        const endNorm = (endereco || '').trim().toUpperCase();
        const qty = Number(quantidade) || 0;
        const sku = (produto.referencia || produto.sku || produto.codigoFab || produto.codigoErp || '').trim();
        const desc = produto.descricao || produto.desc || sku;
        const unit = produto.un || produto.unidade || 'UN';
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';

        // 1. Atualiza StockManager (Local) se disponível
        if (window.StockManager) {
            window.StockManager.add(sku, qty, endNorm, desc, unit, 'INVENTARIO-WMS');
            window.StockManager.logTransaction('AJUSTE', sku, qty, 'INVENTARIO', `Inventário no endereço ${endNorm}`);
        }

        // 2. Atualiza wms_mock_data localmente para resposta imediata da UI
        try {
            const rawMock = JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
            const isArr = Array.isArray(rawMock);
            const addrs = isArr ? rawMock : (rawMock.addresses || []);
            const addr = addrs.find(a => (a.id || a.address || '').trim().toUpperCase() === endNorm);
            if (addr) {
                addr.status = qty > 0 ? 'OCUPADO' : 'LIVRE';
                if (qty > 0) {
                    addr.sku = sku;
                    addr.product = desc;
                    addr.descricao = desc;
                    addr.qty = qty;
                    addr.unit = unit;
                    addr.lote = produto.lote || addr.lote || `INV-${new Date().getFullYear()}`;
                } else {
                    delete addr.sku;
                    delete addr.product;
                    delete addr.descricao;
                    addr.qty = 0;
                }
                localStorage.setItem('wms_mock_data' + suf, JSON.stringify(isArr ? addrs : { addresses: addrs }));
            }
        } catch(errMock) {
            console.warn('[WmsStore] Erro ao atualizar cache wms_mock_data local:', errMock);
        }

        // 3. Atualiza wms_estoque local
        try {
            const estoque = JSON.parse(localStorage.getItem('wms_estoque' + suf) || '[]');
            const itemEst = estoque.find(e => (e.endereco || '').toUpperCase() === endNorm && e.sku === sku);
            if (itemEst) {
                itemEst.qtd = qty;
            } else if (qty > 0) {
                estoque.push({ sku, desc, endereco: endNorm, qtd: qty, lote: produto.lote || '', status: 'NORMAL' });
            }
            localStorage.setItem('wms_estoque' + suf, JSON.stringify(estoque));
        } catch(_) {}

        // 4. Grava registro no histórico de inventário (localStorage)
        try {
            const histKey = 'wms_inventario_logs' + suf;
            const logs = JSON.parse(localStorage.getItem(histKey) || '[]');
            logs.unshift({
                data: new Date().toISOString(),
                endereco: endNorm,
                sku: sku,
                descricao: desc,
                quantidade: qty,
                operador: operador
            });
            if (logs.length > 500) logs.pop();
            localStorage.setItem(histKey, JSON.stringify(logs));
        } catch(_) {}

        // 5. PERSISTÊNCIA FIRESTORE (Nuvem em Tempo Real)
        try {
            const tid = _tid();
            const timestampNow = new Date().toISOString();

            // 5a. Atualiza documento do Endereço no Firestore
            const endUpdate = {
                status: qty > 0 ? 'OCUPADO' : 'LIVRE',
                atualizadoEm: TS(),
                ultimoInventario: timestampNow,
                inventariadoPor: operador
            };
            if (qty > 0) {
                endUpdate.sku = sku;
                endUpdate.produto = desc;
                endUpdate.descricao = desc;
                endUpdate.qty = qty;
                endUpdate.quantidade = qty;
                endUpdate.unit = unit;
            } else {
                endUpdate.sku = null;
                endUpdate.produto = null;
                endUpdate.descricao = null;
                endUpdate.qty = 0;
                endUpdate.quantidade = 0;
            }
            await atualizarEndereco(endNorm, endUpdate);

            // 5b. Registra log de inventário no Firestore do tenant
            await _db().collection('tenants').doc(tid).collection('inventarios').add({
                data: timestampNow,
                endereco: endNorm,
                sku: sku,
                descricao: desc,
                quantidade: qty,
                operador: operador,
                criadoEm: TS(),
                tenantId: tid
            }).catch(e => console.warn('[WmsStore] Falha ao gravar log no Firestore:', e.message));

            console.log(`☁️ [WmsStore] Inventário do vão ${endNorm} (${sku}: ${qty} un) sincronizado no Firestore!`);
        } catch(fsErr) {
            console.warn('[WmsStore] Não foi possível sincronizar inventário no Firestore agora (salvo localmente):', fsErr.message);
        }

        return { sucesso: true, endereco: endNorm, sku, quantidade: qty };
    }

    // ─── ONDAS E PICKING (OUTBOUND) ───────────────────────────────────────────
    function _ondasCol(tid) {
        return _db().collection('tenants').doc(tid).collection('ondas');
    }
    function _pickingCol(tid) {
        return _db().collection('tenants').doc(tid).collection('picking');
    }

    async function criarOnda(onda) {
        const tid = _tid();
        const id = onda.id || ('ONDA-' + Date.now());
        await _ondasCol(tid).doc(id).set({
            ...onda,
            id,
            tenantId: tid,
            criadoEm: TS(),
            atualizadoEm: TS()
        }, { merge: true });
        return id;
    }

    async function listarOndas(filtros = {}) {
        let q = _ondasCol(_tid());
        if (filtros.status) q = q.where('status', '==', filtros.status);
        const snap = await q.get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.criadoEm || b.created || 0) - new Date(a.criadoEm || a.created || 0));
        return list;
    }

    async function atualizarOnda(id, update) {
        await _ondasCol(_tid()).doc(id).update({
            ...update,
            atualizadoEm: TS()
        });
    }

    function ouvirOndas(callback) {
        return _ondasCol(_tid()).onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => new Date(b.criadoEm || b.created || 0) - new Date(a.criadoEm || a.created || 0));
            callback(list);
        }, err => console.warn('[WmsStore] ouvirOndas:', err));
    }

    async function criarPickingTasks(tasks) {
        const tid = _tid();
        const batch = _db().batch();
        tasks.forEach(t => {
            const id = t.id || ('PICK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
            const ref = _pickingCol(tid).doc(id);
            batch.set(ref, {
                ...t,
                id,
                tenantId: tid,
                criadoEm: TS(),
                atualizadoEm: TS()
            }, { merge: true });
        });
        await batch.commit();
        return true;
    }

    async function listarPickingTasks(filtros = {}) {
        let q = _pickingCol(_tid());
        if (filtros.onda) q = q.where('onda', '==', filtros.onda);
        if (filtros.status) q = q.where('status', '==', filtros.status);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async function atualizarPickingTask(id, update) {
        await _pickingCol(_tid()).doc(id).update({
            ...update,
            atualizadoEm: TS()
        });
    }

    function ouvirPickingTasks(filtros, callback) {
        let q = _pickingCol(_tid());
        if (filtros && filtros.onda) q = q.where('onda', '==', filtros.onda);
        return q.onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(list);
        }, err => console.warn('[WmsStore] ouvirPickingTasks:', err));
    }

    // ─── CUBÔMETRO myCUBI-50 & CADASTRO DIMENSIONAL ───────────────────────────
    function calcularCubagem({ pesoKg = 0, alturaCm = 0, larguraCm = 0, comprimentoCm = 0, fatorCubagem = 300 }) {
        const hM = Number(alturaCm) / 100;
        const wM = Number(larguraCm) / 100;
        const lM = Number(comprimentoCm) / 100;
        const volumeM3 = +(hM * wM * lM).toFixed(4);
        const pesoCubadoKg = +(volumeM3 * Number(fatorCubagem)).toFixed(2);
        const pesoRealKg = +Number(pesoKg).toFixed(2);
        const pesoCobradoKg = Math.max(pesoRealKg, pesoCubadoKg);
        return {
            pesoRealKg,
            alturaCm: Number(alturaCm),
            larguraCm: Number(larguraCm),
            comprimentoCm: Number(comprimentoCm),
            volumeM3,
            pesoCubadoKg,
            pesoCobradoKg,
            fatorCubagem
        };
    }

    async function registrarCubagem(sku, cubagem) {
        const tid = _tid();
        const skuNorm = (sku || '').trim();
        if (!skuNorm) throw new Error('SKU é obrigatório para registrar cubagem.');
        const dados = calcularCubagem(cubagem);
        await _db().collection('tenants').doc(tid).collection('cubagens').doc(skuNorm).set({
            sku: skuNorm,
            ...dados,
            capturadoPor: cubagem.operador || 'Operador',
            dispositivo: cubagem.dispositivo || 'myCUBI-50',
            atualizadoEm: TS()
        }, { merge: true });
        return dados;
    }

    // ─── KARDEX DE AUDITORIA EM NUVEM ─────────────────────────────────────────
    function _kardexCol(tid) {
        return _db().collection('tenants').doc(tid).collection('kardex');
    }

    async function registrarKardex(transacao) {
        try {
            const tid = _tid();
            const id = transacao.id || ('KDX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
            const logEntry = {
                id,
                tipo: (transacao.tipo || 'AJUSTE').toUpperCase(), // ENTRADA, SAIDA, AJUSTE, PICKING, REABASTECIMENTO
                sku: (transacao.sku || '').trim().toUpperCase(),
                descricao: transacao.descricao || transacao.desc || '',
                qtd: Number(transacao.qtd) || 0,
                saldoAnterior: Number(transacao.saldoAnterior) || 0,
                saldoNovo: Number(transacao.saldoNovo) || 0,
                endereco: (transacao.endereco || '-').trim().toUpperCase(),
                doc: transacao.doc || transacao.documento || '-',
                motivo: transacao.motivo || transacao.reason || '-',
                usuario: transacao.usuario || transacao.operador || 'system',
                data: transacao.data || new Date().toISOString(),
                criadoEm: TS(),
                tenantId: tid
            };
            await _kardexCol(tid).doc(id).set(logEntry);
            return id;
        } catch (e) {
            console.warn('[WmsStore] registrarKardex fallback local:', e.message);
            return null;
        }
    }

    async function listarKardex(filtros = {}) {
        let q = _kardexCol(_tid());
        if (filtros.sku) q = q.where('sku', '==', filtros.sku.toUpperCase());
        if (filtros.tipo) q = q.where('tipo', '==', filtros.tipo.toUpperCase());
        const snap = await q.limit(filtros.limite || 100).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.data || b.criadoEm || 0) - new Date(a.data || a.criadoEm || 0));
        return list;
    }

    // ─── RESERVAS E CONCORRÊNCIA DE ESTOQUE ──────────────────────────────────
    function _estoqueCol(tid) {
        return _db().collection('tenants').doc(tid).collection('estoque');
    }

    async function consultarSaldoEstoque(sku) {
        const doc = await _estoqueCol(_tid()).doc(sku.toUpperCase()).get();
        if (!doc.exists) return { sku, qtdFisica: 0, qtdReservada: 0, qtdDisponivel: 0 };
        const d = doc.data();
        const qtdFisica = d.qtdFisica || d.qtd || 0;
        const qtdReservada = d.qtdReservada || 0;
        return {
            sku,
            qtdFisica,
            qtdReservada,
            qtdDisponivel: Math.max(0, qtdFisica - qtdReservada)
        };
    }

    async function reservarEstoque(sku, qtd, pedidoId = '') {
        const tid = _tid();
        const ref = _estoqueCol(tid).doc(sku.toUpperCase());
        return await _db().runTransaction(async tx => {
            const doc = await tx.get(ref);
            let qtdFisica = 0, qtdReservada = 0;
            if (doc.exists) {
                const d = doc.data();
                qtdFisica = d.qtdFisica || d.qtd || 0;
                qtdReservada = d.qtdReservada || 0;
            }
            const disponivel = qtdFisica - qtdReservada;
            if (disponivel < qtd) {
                throw new Error(`Saldo insuficiente para reserva do SKU ${sku}. Disponível: ${disponivel}, Solicitado: ${qtd}`);
            }
            const novaReserva = qtdReservada + qtd;
            tx.set(ref, {
                sku: sku.toUpperCase(),
                qtdFisica,
                qtdReservada: novaReserva,
                atualizadoEm: TS()
            }, { merge: true });
            return { sucesso: true, sku, qtdReservada: novaReserva, disponivel: qtdFisica - novaReserva };
        });
    }

    async function efetivarBaixaEstoque(sku, qtd, pedidoId = '') {
        const tid = _tid();
        const ref = _estoqueCol(tid).doc(sku.toUpperCase());
        return await _db().runTransaction(async tx => {
            const doc = await tx.get(ref);
            let qtdFisica = 0, qtdReservada = 0;
            if (doc.exists) {
                const d = doc.data();
                qtdFisica = d.qtdFisica || d.qtd || 0;
                qtdReservada = d.qtdReservada || 0;
            }
            const novaFisica = Math.max(0, qtdFisica - qtd);
            const novaReserva = Math.max(0, qtdReservada - qtd);
            tx.set(ref, {
                sku: sku.toUpperCase(),
                qtdFisica: novaFisica,
                qtdReservada: novaReserva,
                atualizadoEm: TS()
            }, { merge: true });
            return { sucesso: true, sku, qtdFisica: novaFisica, qtdReservada: novaReserva };
        });
    }

    async function estornarReservaEstoque(sku, qtd, pedidoId = '') {
        const tid = _tid();
        const ref = _estoqueCol(tid).doc(sku.toUpperCase());
        return await _db().runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists) return { sucesso: false };
            const d = doc.data();
            const novaReserva = Math.max(0, (d.qtdReservada || 0) - qtd);
            tx.set(ref, { qtdReservada: novaReserva, atualizadoEm: TS() }, { merge: true });
            return { sucesso: true, sku, qtdReservada: novaReserva };
        });
    }

    // ─── MOTOR DE REABASTECIMENTO AUTOMÁTICO (PULMÃO ➔ PICKING) ─────────────
    function _reabastCol(tid) {
        return _db().collection('tenants').doc(tid).collection('reabastecimentos');
    }

    async function criarOrdemReabastecimento(ordem) {
        const tid = _tid();
        const id = ordem.id || ('REAB-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
        const payload = {
            ...ordem,
            id,
            status: ordem.status || 'PENDENTE',
            prioridade: ordem.prioridade || 'ALTA',
            criadoEm: TS(),
            atualizadoEm: TS(),
            tenantId: tid
        };
        await _reabastCol(tid).doc(id).set(payload, { merge: true });
        return id;
    }

    async function listarOrdensReabastecimento(filtros = {}) {
        let q = _reabastCol(_tid());
        if (filtros.status) q = q.where('status', '==', filtros.status);
        const snap = await q.get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
        return list;
    }

    async function atualizarOrdemReabastecimento(id, update) {
        await _reabastCol(_tid()).doc(id).update({
            ...update,
            atualizadoEm: TS()
        });
    }

    function ouvirOrdensReabastecimento(callback) {
        return _reabastCol(_tid()).onSnapshot(snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
            callback(list);
        }, err => console.warn('[WmsStore] ouvirOrdensReabastecimento:', err));
    }

    /**
     * Inspeciona endereços e gera ordens automáticas de descida de palete
     * quando saldo do picking estiver abaixo do mínimo e houver pulmão disponível.
     */
    async function verificarGatilhosReabastecimento() {
        const tid = _tid();
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const rawMock = JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
        const addrs = Array.isArray(rawMock) ? rawMock : (rawMock.addresses || []);

        const pickings = addrs.filter(a => (a.tipo === 'PICKING' || a.nivel === '1' || a.nivel === 1) && a.sku);
        const pulmoes = addrs.filter(a => (a.tipo === 'PULMAO' || +a.nivel > 1) && a.status === 'OCUPADO');

        const ordensGeradas = [];

        for (const pick of pickings) {
            const qtyAtual = Number(pick.qty || pick.quantidade) || 0;
            const min = Number(pick.qtdMin || pick.minimo) || 10;

            if (qtyAtual <= min) {
                // Procura palete compatível no Pulmão
                const pulmaoOrigem = pulmoes.find(p => p.sku === pick.sku && (p.qty || p.quantidade) > 0);
                if (pulmaoOrigem) {
                    const id = `REAB-${pick.sku}-${pick.id}`;
                    const ordem = {
                        id,
                        sku: pick.sku,
                        produto: pick.product || pick.descricao || pick.sku,
                        qtdSugerida: Math.min(Number(pulmaoOrigem.qty || pulmaoOrigem.quantidade), 50),
                        origemEndereco: pulmaoOrigem.id || pulmaoOrigem.address,
                        destinoEndereco: pick.id || pick.address,
                        motivo: `Estoque de Picking crítico (${qtyAtual} un <= mín ${min})`,
                        prioridade: qtyAtual === 0 ? 'URGENTE' : 'ALTA',
                        status: 'PENDENTE'
                    };
                    await criarOrdemReabastecimento(ordem);
                    ordensGeradas.push(ordem);
                }
            }
        }

        return ordensGeradas;
    }

    // ─── INVENTÁRIO CÍCLICO AUTOMÁTICO E IRA ──────────────────────────────────
    async function gerarInventarioCiclico(maxVaos = 8) {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const rawMock = JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
        const addrs = Array.isArray(rawMock) ? rawMock : (rawMock.addresses || []);

        // Prioriza vãos ocupados que não foram inventariados recentemente
        const ocupados = addrs.filter(a => a.status === 'OCUPADO' && a.sku);
        ocupados.sort((a, b) => new Date(a.ultimoInventario || 0) - new Date(b.ultimoInventario || 0));

        const selecionados = ocupados.slice(0, maxVaos).map(a => ({
            endereco: a.id || a.address,
            skuEsperado: a.sku,
            produto: a.product || a.descricao || a.sku,
            qtdContabil: Number(a.qty || a.quantidade) || 0,
            status: 'PENDENTE',
            dataAgendada: new Date().toISOString()
        }));

        const id = `CICLICO-${new Date().toISOString().slice(0, 10)}`;
        await _db().collection('tenants').doc(_tid()).collection('inventarios_ciclicos').doc(id).set({
            id,
            data: new Date().toISOString(),
            vaos: selecionados,
            status: 'ABERTO',
            criadoEm: TS()
        }, { merge: true });

        return { id, vaos: selecionados };
    }

    async function calcularAcuraciaIRA() {
        const snap = await _db().collection('tenants').doc(_tid()).collection('inventarios').limit(200).get();
        if (snap.empty) return { totalContagens: 0, acuraciaPct: 100, divergencias: 0 };
        const docs = snap.docs.map(d => d.data());
        let semDiv = 0;
        docs.forEach(d => {
            if (!d.divergencia || d.divergencia === 0) semDiv++;
        });
        const pct = docs.length > 0 ? +((semDiv / docs.length) * 100).toFixed(1) : 100;
        return {
            totalContagens: docs.length,
            conformes: semDiv,
            divergencias: docs.length - semDiv,
            acuraciaPct: pct
        };
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
        excluirTodosEnderecos,
        listarEnderecos,
        ouvirEnderecos,
        sincronizarEnderecos,
        migrarEnderecos,
        getRegrasArmazenagem,
        validarAlocacaoArmazenagem,
        salvarItemInventariado,
        // Ondas e Picking (Outbound)
        criarOnda,
        listarOndas,
        atualizarOnda,
        ouvirOndas,
        criarPickingTasks,
        listarPickingTasks,
        atualizarPickingTask,
        ouvirPickingTasks,
        // Cubômetro myCUBI-50
        calcularCubagem,
        registrarCubagem,
        // Fase P4: Kardex em Nuvem
        registrarKardex,
        listarKardex,
        // Fase P4: Reservas Concorrentes
        consultarSaldoEstoque,
        reservarEstoque,
        efetivarBaixaEstoque,
        estornarReservaEstoque,
        // Fase P4: Reabastecimento Automático
        criarOrdemReabastecimento,
        listarOrdensReabastecimento,
        atualizarOrdemReabastecimento,
        ouvirOrdensReabastecimento,
        verificarGatilhosReabastecimento,
        // Fase P4: Inventário Cíclico & IRA
        gerarInventarioCiclico,
        calcularAcuraciaIRA,
        toDate, fmtData
    };
})();


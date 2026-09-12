/**
 * maxcrm-sync.js — Sincronização IndexedDB → Firestore
 * ======================================================
 * Responsável por enviar dados locais para a nuvem quando houver conexão.
 * Funciona em background sem bloquear a UX.
 *
 * Estrutura Firestore:
 *   tenants/parreira/prospeccao/empresas/{id}
 *   tenants/parreira/prospeccao/visitas/{id}
 *   tenants/parreira/prospeccao/contatos/{id}
 *
 * Parreira Sistemas — MAXCRM Campo v1.0.0
 */

const MaxCRMSync = (() => {

    const TENANT_ID  = 'parreira';
    const BASE_PATH  = `tenants/${TENANT_ID}`;

    let _syncRunning = false;
    let _onStatusChange = null;

    // ── Referência Firestore ────────────────────────────────────────────────
    function _db() {
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('[MaxCRMSync] Firebase Firestore não disponível.');
        }
        return firebase.firestore();
    }

    // ── Status de conectividade ─────────────────────────────────────────────
    function isOnline() {
        return navigator.onLine;
    }

    // ── Callback de status (atualiza a UI) ──────────────────────────────────
    function _emitStatus(status, detalhes) {
        if (typeof _onStatusChange === 'function') {
            _onStatusChange(status, detalhes);
        }
        // Atualiza badge na tela se existir
        const bar = document.getElementById('syncStatusBar');
        if (bar) {
            bar.className = 'sync-status-bar';
            const msgs = {
                synced:   '✅ Sincronizado',
                pending:  `⏳ ${detalhes || 0} visita(s) pendente(s)`,
                syncing:  '🔄 Sincronizando...',
                error:    '❌ Erro de sincronização',
                offline:  '📴 Sem conexão — dados salvos localmente'
            };
            bar.textContent = msgs[status] || status;
            bar.classList.add(status === 'offline' ? 'pending' : status);
        }
    }

    // ── Upload de uma empresa ───────────────────────────────────────────────
    async function _syncEmpresa(empresaId) {
        const empresa = await MaxCRMDB.getEmpresa(empresaId);
        if (!empresa) return;

        const db  = _db();
        const ref = db.doc(`${BASE_PATH}/empresas/${empresa.id}`);
        await ref.set({
            ...empresa,
            _localOnly:    firebase.firestore.FieldValue.delete(),
            atualizadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
            sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // ── Upload de uma visita ────────────────────────────────────────────────
    async function _syncVisita(visitaId) {
        const visita = await MaxCRMDB.getVisita(visitaId);
        if (!visita) return;

        const db  = _db();
        const ref = db.doc(`${BASE_PATH}/visitas/${visita.id}`);
        await ref.set({
            ...visita,
            atualizadoEm:   firebase.firestore.FieldValue.serverTimestamp(),
            sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // ── Upload de um contato ────────────────────────────────────────────────
    async function _syncContato(contatoId) {
        const contatos = await MaxCRMDB.getContatosEmpresa('');
        // Busca contato por id (getAll e filtra)
        const db  = _db();
        const ref = db.doc(`${BASE_PATH}/contatos/${contatoId}`);
        // Lê do IDB
        const all = await MaxCRMDB.getContatosEmpresa('');
        // IDB não tem getById para contatos diretamente, então fazemos getAll e filtramos
        // (na prática o volume é pequeno)
        const contato = (await indexedDB_getContato(contatoId));
        if (!contato) return;
        await ref.set({
            ...contato,
            sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // Helper para buscar contato por ID diretamente
    function indexedDB_getContato(id) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('maxcrm_campo', 1);
            req.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction(['contatos'], 'readonly');
                const r  = tx.objectStore('contatos').get(id);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror   = (err) => reject(err);
            };
            req.onerror = (e) => reject(e);
        });
    }

    // ── Executor principal da fila ──────────────────────────────────────────
    async function processar() {
        if (_syncRunning || !isOnline()) {
            if (!isOnline()) _emitStatus('offline');
            return { ok: 0, erros: 0 };
        }

        _syncRunning = true;
        _emitStatus('syncing');

        const fila = await MaxCRMDB.getFilaSync();
        if (fila.length === 0) {
            _syncRunning = false;
            _emitStatus('synced');
            return { ok: 0, erros: 0 };
        }

        let ok = 0, erros = 0;

        for (const item of fila) {
            try {
                if (item.tipo === 'visita')  await _syncVisita(item.referenciaId);
                if (item.tipo === 'empresa') await _syncEmpresa(item.referenciaId);
                if (item.tipo === 'contato') await _syncContato(item.referenciaId);

                const storeMap = { visita: 'visitas', empresa: 'empresas', contato: 'contatos' };
                await MaxCRMDB.marcarSyncOk(item.id, item.referenciaId, storeMap[item.tipo]);
                ok++;
            } catch (e) {
                console.error('[MaxCRMSync] Erro ao sincronizar', item.tipo, item.referenciaId, e);
                await MaxCRMDB.marcarSyncErro(item.id, e.message);
                erros++;
            }
        }

        _syncRunning = false;

        if (erros > 0) {
            _emitStatus('error');
        } else {
            _emitStatus('synced');
        }

        console.log(`[MaxCRMSync] Fila processada: ${ok} ok, ${erros} erros`);
        return { ok, erros };
    }

    // ── Sincronização ao reconectar ─────────────────────────────────────────
    function iniciarListeners() {
        window.addEventListener('online', () => {
            console.log('[MaxCRMSync] Online — iniciando sync automático...');
            processar();
            pullEmpresas();
        });
        window.addEventListener('offline', () => {
            _emitStatus('offline');
        });

        // Sincroniza ao carregar se online
        if (isOnline()) {
            setTimeout(processar, 1500);                       // Processa fila
            setTimeout(sincronizarVisitasPendentes, 3000);    // Sobe visitas órfãs
            setTimeout(pullEmpresas, 4500);                   // Baixa empresas atualizadas
        }
    }

    // ── Sincronizar visitas "órfãs" (pending no IDB mas não na fila de sync) ──
    // Isso garante que visitas criadas antes do fix de enqueueSync na iniciarVisita
    // sejam enviadas ao Firestore.
    async function sincronizarVisitasPendentes() {
        if (!isOnline()) return;
        try {
            const db = _db();
            const visitas = await MaxCRMDB.listarVisitas(200);
            const pendentes = visitas.filter(v => v.syncStatus === 'pending');
            if (pendentes.length === 0) return;
            console.log(`[MaxCRMSync] Sincronizando ${pendentes.length} visita(s) pendente(s) órfãs...`);
            for (const visita of pendentes) {
                try {
                    const ref = db.doc(`${BASE_PATH}/visitas/${visita.id}`);
                    await ref.set({
                        ...visita,
                        atualizadoEm:   firebase.firestore.FieldValue.serverTimestamp(),
                        sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    // Marca como synced no IDB
                    await MaxCRMDB.salvarProgresso(visita.id, { syncStatus: 'synced' });
                    console.log('[MaxCRMSync] Visita sincronizada (órfã):', visita.id, visita.empresaNome);
                } catch(e) {
                    console.warn('[MaxCRMSync] Erro ao sincronizar visita órfã:', visita.id, e.message);
                }
            }
        } catch(e) {
            console.warn('[MaxCRMSync] sincronizarVisitasPendentes falhou:', e.message);
        }
    }

    // ── Baixar dados da nuvem (pull) ─────────────────────────────────────────
    async function pullEmpresas() {
        if (!isOnline()) return;
        try {
            const db   = _db();
            const snap = await db.collection(`${BASE_PATH}/empresas`).limit(1000).get();
            const empresasSalvar = [];
            snap.forEach(doc => {
                const data = doc.data();
                empresasSalvar.push({
                    ...data,
                    id: doc.id,
                    syncStatus: 'synced'
                });
            });

            if (empresasSalvar.length > 0) {
                if (typeof MaxCRMDB.salvarEmpresasEmLote === 'function') {
                    await MaxCRMDB.salvarEmpresasEmLote(empresasSalvar);
                } else {
                    for (const emp of empresasSalvar) {
                        await MaxCRMDB.salvarEmpresaLocalSemSync(emp);
                    }
                }
                console.log(`[MaxCRMSync] Pull empresas: ${empresasSalvar.length} registros baixados com sucesso para IndexedDB`);
                if (typeof window.refreshListaEmpresas === 'function') {
                    window.refreshListaEmpresas();
                }
            }
        } catch (e) {
            console.warn('[MaxCRMSync] Erro no pull de empresas:', e.message);
        }
    }

    // ── Contar pendentes (para UI) ──────────────────────────────────────────
    async function contarPendentes() {
        const fila = await MaxCRMDB.getFilaSync();
        return fila.length;
    }

    async function atualizarStatusUI() {
        const pendentes = await contarPendentes();
        if (!isOnline()) {
            _emitStatus('offline');
        } else if (pendentes > 0) {
            _emitStatus('pending', pendentes);
        } else {
            _emitStatus('synced');
        }
        return pendentes;
    }

    function onStatusChange(fn) {
        _onStatusChange = fn;
    }

    return {
        processar,
        iniciarListeners,
        pullEmpresas,
        sincronizarVisitasPendentes,
        contarPendentes,
        atualizarStatusUI,
        isOnline,
        onStatusChange
    };

})();

window.MaxCRMSync = MaxCRMSync;
console.log('✅ MaxCRMSync (Firestore Sync) carregado');
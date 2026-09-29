/**
 * maxcrm-sync.js — Sincronização IndexedDB ↔ Firestore (bidirecional)
 * =====================================================================
 * Responsável por enviar dados locais para a nuvem (push) e baixar
 * dados da nuvem para o dispositivo (pull) quando houver conexão.
 * Funciona em background sem bloquear a UX.
 *
 * Estrutura Firestore:
 *   tenants/parreira/visitas/{id}
 *   tenants/parreira/empresas/{id}
 *   tenants/parreira/contatos/{id}
 *
 * Parreira Sistemas — MAXCRM Campo v1.3.0
 */

const MaxCRMSync = (() => {

    const TENANT_ID  = 'parreira';
    const BASE_PATH  = `tenants/${TENANT_ID}`;

    let _syncRunning = false;
    let _onStatusChange = null;

    const FIREBASE_CONFIG = {
        apiKey:            "AIzaSyDzatCQ8zmH4aQftznf7Y5wdYPwFYSiARc",
        authDomain:        "parreiralog-91904.firebaseapp.com",
        projectId:         "parreiralog-91904",
        messagingSenderId: "527633267616",
        appId:             "1:527633267616:web:3567e883b31f7fa02882c5"
    };

    function _ensureFirebase() {
        if (typeof firebase === 'undefined') {
            throw new Error('[MaxCRMSync] Firebase SDK não disponível.');
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(window.FIREBASE_CONFIG || FIREBASE_CONFIG);
        }
        return firebase;
    }

    // ── Referência Firestore ────────────────────────────────────────────────
    function _db() {
        _ensureFirebase();
        if (!firebase.firestore) {
            throw new Error('[MaxCRMSync] Firebase Firestore não disponível.');
        }
        return firebase.firestore();
    }

    // ── Garantir autenticação anônima para regras do Firestore ──────────────
    async function _ensureAuth() {
        try {
            _ensureFirebase();
            if (typeof firebase !== 'undefined' && firebase.auth) {
                const auth = firebase.auth();
                if (auth.currentUser) return auth.currentUser;
                return await new Promise((resolve) => {
                    let resolved = false;
                    const timer = setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            if (!auth.currentUser) auth.signInAnonymously().then(resolve).catch(resolve);
                            else resolve(auth.currentUser);
                        }
                    }, 1200);
                    const unsub = auth.onAuthStateChanged(user => {
                        if (resolved) return;
                        unsub();
                        clearTimeout(timer);
                        resolved = true;
                        if (user) resolve(user);
                        else auth.signInAnonymously().then(resolve).catch(resolve);
                    });
                });
            }
        } catch(e) {
            console.warn('[MaxCRMSync] Falha ao verificar auth:', e.message);
        }
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

    // ── Helper para limpar campos undefined (Firestore rejeita undefined) ────
    function _sanitizeForFirestore(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
    }

    // ── Executor principal da fila ──────────────────────────────────────────
    async function processar() {
        if (_syncRunning || !isOnline()) {
            if (!isOnline()) _emitStatus('offline');
            return { ok: 0, erros: 0 };
        }

        _syncRunning = true;
        _emitStatus('syncing');

        try {
            await _ensureAuth();
        } catch(e) {
            console.warn('[MaxCRMSync] Auth warning:', e.message);
        }

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
            forcarSincronizacaoTotal();
            pullEmpresas();
        });
        window.addEventListener('offline', () => {
            _emitStatus('offline');
        });

        // Sincroniza ao carregar se online
        if (isOnline()) {
            setTimeout(processar, 1500);                       // Processa fila (push)
            setTimeout(forcarSincronizacaoTotal, 2800);        // Garante envio de TODAS as visitas locais (órfãs e finalizadas)
            setTimeout(pullEmpresas, 5000);                   // Baixa empresas atualizadas
            setTimeout(pullVisitas, 6000);                    // Baixa visitas do Firestore
        }
    }

    // ── Forçar envio de TODAS as visitas locais para o Firestore ─────────────
    // Varre todas as visitas no IndexedDB local e faz upsert no Firestore,
    // garantindo que visitas salvas apenas no dispositivo do promotor subam
    // para a nuvem mesmo que syncStatus não esteja 'pending' ou a fila falhou.
    async function forcarSincronizacaoTotal() {
        if (!isOnline()) {
            _emitStatus('offline');
            return { ok: 0, erros: 0, total: 0, offline: true };
        }
        _emitStatus('syncing');
        try {
            await _ensureAuth();
            const db = _db();
            const visitas = await MaxCRMDB.listarVisitas(500);
            if (!visitas || visitas.length === 0) {
                console.log('[MaxCRMSync] Nenhuma visita local para sincronizar.');
                await processar();
                await atualizarStatusUI();
                return { ok: 0, erros: 0, total: 0 };
            }

            console.log(`[MaxCRMSync] Verificando e enviando ${visitas.length} visita(s) locais para Firestore...`);
            let ok = 0, erros = 0;
            for (const visita of visitas) {
                try {
                    const sanitized = _sanitizeForFirestore(visita);
                    const ref = db.doc(`${BASE_PATH}/visitas/${visita.id}`);
                    await ref.set({
                        ...sanitized,
                        atualizadoEm:   firebase.firestore.FieldValue.serverTimestamp(),
                        sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    // Marca como synced no IDB local
                    await MaxCRMDB.salvarProgresso(visita.id, { syncStatus: 'synced' });
                    ok++;
                    console.log('[MaxCRMSync] Visita enviada à nuvem:', visita.id, visita.empresaNome);
                } catch(e) {
                    console.warn('[MaxCRMSync] Falha ao enviar visita', visita.id, e.message);
                    erros++;
                }
            }

            await processar();
            await pullVisitas();
            await atualizarStatusUI();

            console.log(`[MaxCRMSync] Sincronização forçada concluída: ${ok} enviadas, ${erros} erros de ${visitas.length} totais.`);
            return { ok, erros, total: visitas.length };
        } catch(e) {
            console.warn('[MaxCRMSync] forcarSincronizacaoTotal falhou:', e.message);
            return { ok: 0, erros: 1, total: 0, erro: e.message };
        }
    }

    async function sincronizarVisitasPendentes() {
        return forcarSincronizacaoTotal();
    }

    // ── Baixar dados da nuvem (pull) ─────────────────────────────────────────
    async function pullEmpresas() {
        if (!isOnline()) return;
        try {
            await _ensureAuth();
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

    // ── Baixar visitas da nuvem (pull) ─────────────────────────────────────────
    async function pullVisitas() {
        if (!isOnline()) return;
        try {
            await _ensureAuth();
            const db   = _db();
            // Busca visitas do tenant SEM orderBy (evita hang por indice)
            const queryPromise = db.collection(`${BASE_PATH}/visitas`)
                .limit(500)
                .get();
            // Timeout de 10s
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT pullVisitas')), 10000)
            );
            const snap = await Promise.race([queryPromise, timeoutPromise]);

            if (snap.empty) {
                console.log('[MaxCRMSync] Pull visitas: nenhuma visita no Firestore');
                return;
            }

            const idb = await MaxCRMDB.open();
            let importadas = 0;
            let atualizadas = 0;

            for (const doc of snap.docs) {
                const remota = doc.data();
                remota.id = doc.id;

                // Verifica se já existe localmente
                const local = await MaxCRMDB.getVisita(doc.id);

                if (!local) {
                    // Visita não existe localmente → importar do Firestore
                    remota.syncStatus = 'synced';
                    // Converter Firestore Timestamps para ISO strings
                    if (remota.criadoEm && remota.criadoEm.toDate) remota.criadoEm = remota.criadoEm.toDate().toISOString();
                    if (remota.atualizadoEm && remota.atualizadoEm.toDate) remota.atualizadoEm = remota.atualizadoEm.toDate().toISOString();
                    if (remota.sincronizadoEm && remota.sincronizadoEm.toDate) remota.sincronizadoEm = remota.sincronizadoEm.toDate().toISOString();
                    if (remota.inicioTs && remota.inicioTs.toDate) remota.inicioTs = remota.inicioTs.toDate().toISOString();
                    if (remota.fimTs && remota.fimTs.toDate) remota.fimTs = remota.fimTs.toDate().toISOString();
                    await MaxCRMDB.salvarVisitaLocal(remota);
                    importadas++;
                } else if (local.syncStatus === 'synced') {
                    // Visita existe e já está sincronizada → atualizar com versão mais recente da nuvem
                    const remotaTs = remota.atualizadoEm?.toDate ? remota.atualizadoEm.toDate().getTime() : new Date(remota.atualizadoEm || 0).getTime();
                    const localTs  = new Date(local.atualizadoEm || 0).getTime();
                    if (remotaTs > localTs) {
                        remota.syncStatus = 'synced';
                        if (remota.criadoEm && remota.criadoEm.toDate) remota.criadoEm = remota.criadoEm.toDate().toISOString();
                        if (remota.atualizadoEm && remota.atualizadoEm.toDate) remota.atualizadoEm = remota.atualizadoEm.toDate().toISOString();
                        if (remota.sincronizadoEm && remota.sincronizadoEm.toDate) remota.sincronizadoEm = remota.sincronizadoEm.toDate().toISOString();
                        if (remota.inicioTs && remota.inicioTs.toDate) remota.inicioTs = remota.inicioTs.toDate().toISOString();
                        if (remota.fimTs && remota.fimTs.toDate) remota.fimTs = remota.fimTs.toDate().toISOString();
                        await MaxCRMDB.salvarVisitaLocal(remota);
                        atualizadas++;
                    }
                }
                // Se local.syncStatus === 'pending' → não sobrescrever (local tem mudanças não enviadas)
            }

            console.log(`[MaxCRMSync] Pull visitas: ${importadas} importadas, ${atualizadas} atualizadas (total Firestore: ${snap.size})`);
        } catch (e) {
            console.warn('[MaxCRMSync] Erro no pull de visitas:', e.message);
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
        pullVisitas,
        sincronizarVisitasPendentes,
        forcarSincronizacaoTotal,
        contarPendentes,
        atualizarStatusUI,
        isOnline,
        onStatusChange
    };

})();

window.MaxCRMSync = MaxCRMSync;
console.log('✅ MaxCRMSync (Firestore Sync) carregado');
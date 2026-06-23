const Utils = {
    // Armazenamento em memória para dados grandes (>localStorage quota)
    _memStore: {},

    // Chaves sensíveis ao tenant — isoladas por prefixo no localStorage
    _TENANT_KEYS: ['freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users',
        'carrier_info_v2', 'invoice_history', 'app_sellers', 'app_settings', 'app_romaneios',
        'delivery_history', 'dispatches', 'clients'],

    // Retorna a chave com prefixo de tenant quando aplicável
    _storageKey(key) {
        const tenantId = (Utils.Cloud && Utils.Cloud.tenantId)
            || localStorage.getItem('app_tenant_id');
        if (tenantId && tenantId !== 'null' && tenantId !== 'undefined'
                && Utils._TENANT_KEYS.includes(key)) {
            return `tenant_${tenantId}_${key}`;
        }
        return key;
    },
    formatCurrency: (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    },

    parseCurrency: (str) => {
        if (!str) return 0;
        if (typeof str === 'number') return str;
        return parseFloat(str.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
    },

    // Normalização de strings (remove acentos, converte para maiúsculas)
    normalizeString: (str) => {
        if (!str) return '';
        return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    },

    getStorage: (key) => {
        // Verifica memória primeiro (para dados grandes como clients)
        if (Utils._memStore[key] !== undefined) return Utils._memStore[key];
        try {
            const storageKey = Utils._storageKey(key);
            const data = localStorage.getItem(storageKey);
            if (!data) return [];
            try {
                const parsed = JSON.parse(data);
                return Array.isArray(parsed) ? parsed : (typeof parsed === 'object' && parsed !== null ? parsed : []);
            } catch (e) { return []; }
        } catch (e) {
            console.error('Error reading storage', e);
            return [];
        }
    },

    // Timestamp da última escrita local (Echo suppression)
    lastWriteTime: {},

    // v3.11.64: Persiste/restaura lastWriteTime no localStorage para sobreviver reloads
    _persistLastWriteTime() {
        try {
            localStorage.setItem('_lwt_persist', JSON.stringify(Utils.lastWriteTime));
        } catch (e) {}
    },
    _restoreLastWriteTime() {
        try {
            const saved = localStorage.getItem('_lwt_persist');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Só restaurar timestamps recentes (últimos 10 minutos)
                const cutoff = Date.now() - 600000;
                Object.keys(parsed).forEach(k => {
                    if (parsed[k] > cutoff) Utils.lastWriteTime[k] = parsed[k];
                });
                console.log(`⏱️ [lastWriteTime] Restaurado:`, Utils.lastWriteTime);
            }
        } catch (e) {}
    },

    saveRaw: (key, stringData) => {
        localStorage.setItem(Utils._storageKey(key), stringData);
        Utils.lastWriteTime[key] = Date.now();
        Utils._persistLastWriteTime(); // v3.11.64
        try {
            const data = JSON.parse(stringData);
            Utils._memStore[key] = data; // Keep memory store in sync!
            if (Utils.Cloud) {
                // PROTEÇÃO: Não enviar arrays vazios para a nuvem
                if (Array.isArray(data) && data.length === 0) {
                    console.warn(`⚠️ [Proteção] saveRaw: Não enviando array vazio para nuvem: ${key}`);
                } else {
                    // Se Firebase indisponível, enfileira para sync posterior
                    if (!window.db || typeof firebase === 'undefined') {
                        Utils._pendingSync = Utils._pendingSync || {};
                        Utils._pendingSync[key] = data;
                        Utils.Cloud._showOfflineBadge();
                        console.warn(`⚠️ [saveRaw] Firebase indisponível. ${key} enfileirado para sync.`);
                    } else {
                        Utils.Cloud.save(key, data);
                    }
                }
            }
        } catch (e) { console.error('[saveRaw] Erro:', e); }
    },

    addToStorage: (key, item) => {
        try {
            const list = Utils.getStorage(key);
            list.push(item);
            const str = JSON.stringify(list);
            localStorage.setItem(Utils._storageKey(key), str);
            Utils.lastWriteTime[key] = Date.now();
            Utils._persistLastWriteTime(); // v3.11.64
            if (Utils.Cloud) Utils.Cloud.save(key, list);
        } catch (e) { console.error(e); }
    },

    setStorage: (key, data) => {
        try {
            localStorage.setItem(Utils._storageKey(key), JSON.stringify(data));
            Utils._memStore[key] = data; // Keep memory store in sync!
            Utils.lastWriteTime[key] = Date.now();
            Utils._persistLastWriteTime(); // v3.11.64
            // PROTEÇÃO: Não enviar arrays vazios para a nuvem (evita sobrescrever dados existentes)
            if (Utils.Cloud) {
                if (Array.isArray(data) && data.length === 0) {
                    console.warn(`⚠️ [Proteção] Não enviando array vazio para nuvem: ${key}`);
                } else {
                    Utils.Cloud.save(key, data);
                }
            }
        } catch (e) { console.error(e); }
    },

    Cloud: {
        // CRÍTICO: Não usar tenant padrão! Cada cliente deve ter seu próprio tenant.
        tenantId: localStorage.getItem('app_tenant_id') || null,

        setTenantId(id) {
            console.log(`🏢 [Cloud] setTenantId: ${id}`);
            this.tenantId = id;
            localStorage.setItem('app_tenant_id', id);
            window.hasAttachedListeners = false;
        },

        // Verificar se tenant está definido
        hasTenant() {
            return !!this.tenantId && this.tenantId !== 'null' && this.tenantId !== 'undefined';
        },

        // --- SAVE LOGIC (Direct to TenantID) ---
        async save(key, data) {
            // --- FIREBASE MODE ---
            if (typeof firebase !== 'undefined' && window.db) {
                try {
                    const jsonContent = JSON.stringify(data);
                    const size = jsonContent.length;

                    if (size < 1000000) { // Limite de 1MB do Firestore
                        console.log(`[Cloud] Salvando ${key} (${size} bytes)...`);
                        await window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).set({
                            content: jsonContent,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            isChunked: false
                        });
                        console.log(`✅ [Cloud] ${key} salvo com sucesso.`);
                        // Remove da fila pendente se estava lá
                        if (Utils._pendingSync && Utils._pendingSync[key]) {
                            delete Utils._pendingSync[key];
                        }
                        this._hideOfflineBadge();
                        return true;
                    } else {
                        // v3.11.65: Auto-Chunking — divide em pedaços de 800KB e salva separado
                        const kb = (size/1024).toFixed(1);
                        console.warn(`⚠️ [Cloud] ${key} grande (${kb}KB). Ativando chunking automático...`);

                        const CHUNK_SIZE = 800000; // 800KB por chunk
                        const items = Array.isArray(data) ? data : [data];
                        const chunks = [];
                        let current = [];
                        let currentSize = 0;

                        for (const item of items) {
                            const itemStr = JSON.stringify(item);
                            if (currentSize + itemStr.length > CHUNK_SIZE && current.length > 0) {
                                chunks.push(current);
                                current = [];
                                currentSize = 0;
                            }
                            current.push(item);
                            currentSize += itemStr.length;
                        }
                        if (current.length > 0) chunks.push(current);

                        console.log(`📦 [Chunk] ${key}: ${items.length} itens → ${chunks.length} chunk(s)`);

                        // Salva cada chunk
                        const batch = [];
                        for (let i = 0; i < chunks.length; i++) {
                            batch.push(
                                window.db.collection('tenants').doc(this.tenantId)
                                    .collection('legacy_store').doc(`${key}_chunk_${i}`)
                                    .set({
                                        content: JSON.stringify(chunks[i]),
                                        chunkIndex: i,
                                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                                    })
                            );
                        }
                        await Promise.all(batch);

                        // Salva doc principal como referência (isChunked = true)
                        await window.db.collection('tenants').doc(this.tenantId)
                            .collection('legacy_store').doc(key).set({
                                isChunked: true,
                                chunkCount: chunks.length,
                                totalCount: items.length,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });

                        console.log(`✅ [Cloud] ${key} salvo em ${chunks.length} chunk(s).`);
                        if (Utils._pendingSync && Utils._pendingSync[key]) delete Utils._pendingSync[key];
                        this._hideOfflineBadge();
                        return true;
                    }
                } catch (e) {
                    console.error('❌ [Cloud] Erro ao salvar no Firestore:', key, e);
                    // CORRIGIDO: Mostrar alerta para QUALQUER chave crítica, não só clients/freight_tables
                    const chavesCriticas = ['dispatches', 'delivery_history', 'clients', 'freight_tables', 'invoice_history'];
                    if (chavesCriticas.includes(key)) {
                        const userMsg = `❌ ERRO DE SINCRONIZAÇÃO\n\nNão foi possível salvar "${key}" no banco de dados.\n\nErro: ${e.message}\n\nOs dados foram salvos localmente. Avise o suporte ou recarregue o sistema.`;
                        console.error(userMsg);
                        // Enfileira para retry
                        Utils._pendingSync = Utils._pendingSync || {};
                        Utils._pendingSync[key] = data;
                        this._showOfflineBadge('ERRO SYNC');
                        // Não usar alert() para não travar o operador — usa toast se disponível
                        if (window.showToast) {
                            window.showToast(`❌ Falha ao sincronizar "${key}" com o banco. Dados salvos localmente.`);
                        } else {
                            alert(userMsg);
                        }
                    }
                    return false;
                }
            }

            // --- LOCAL SIMULATION MODE (Firebase não disponível) ---
            this._showOfflineBadge();
            if (this.hasTenant()) {
                const simKey = `tenant_${this.tenantId}_${key}`;
                try {
                    localStorage.setItem(simKey, JSON.stringify(data));
                    console.warn(`⚠️ [OFFLINE] Salvo localmente (Firebase off): ${simKey}`);
                    // Marca como pendente
                    Utils._pendingSync = Utils._pendingSync || {};
                    Utils._pendingSync[key] = data;
                } catch (e) {
                    console.error('❌ [SimCloud] Erro ao salvar:', e);
                }
            }
        },

        // Mostra badge de OFFLINE no topo da tela
        _offlineBadgeVisible: false,
        _showOfflineBadge(label) {
            label = label || 'OFFLINE - Dados NÃO sincronizados';
            if (!document.getElementById('_cloudStatusBadge')) {
                const badge = document.createElement('div');
                badge.id = '_cloudStatusBadge';
                badge.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#dc2626;color:#fff;text-align:center;font-size:0.8rem;font-weight:700;padding:6px 12px;z-index:99999;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
                badge.innerHTML = `
                    <span>⚠️ ${label} — Firebase não conectado na máquina de <strong>${localStorage.getItem('app_tenant_id')||'?'}</strong></span>
                    <button onclick="Utils.Cloud.forceSyncPending()" style="background:#fff;color:#dc2626;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-weight:700;font-size:0.75rem;">🔄 Tentar Sincronizar</button>
                `;
                document.body.insertBefore(badge, document.body.firstChild);
                // Ajusta o body para não sobrepor conteúdo
                document.body.style.paddingTop = ((parseFloat(document.body.style.paddingTop)||0) + 36) + 'px';
            } else {
                const lbl = document.getElementById('_cloudStatusBadge')?.querySelector('span');
                if (lbl) lbl.innerHTML = `⚠️ ${label} — Firebase não conectado`;
            }
            this._offlineBadgeVisible = true;
        },

        _hideOfflineBadge() {
            const badge = document.getElementById('_cloudStatusBadge');
            if (badge) {
                badge.style.background = '#059669';
                badge.innerHTML = '✅ Sincronizado com sucesso! Conectado ao banco de dados.';
                setTimeout(() => { badge.remove(); document.body.style.paddingTop = ''; }, 3000);
            }
            this._offlineBadgeVisible = false;
        },

        // Tenta sincronizar todos os itens pendentes com o Firebase
        async forceSyncPending() {
            const pending = Utils._pendingSync || {};
            const keys = Object.keys(pending);
            if (keys.length === 0) {
                if (window.showToast) window.showToast('✅ Nenhum dado pendente de sincronização.');
                return;
            }

            if (!window.db || typeof firebase === 'undefined') {
                alert('❌ Firebase ainda não está disponível.\n\nVerifique a conexão com a internet e recarregue a página.');
                return;
            }

            if (window.showToast) window.showToast(`🔄 Sincronizando ${keys.length} item(ns) pendente(s)...`);
            let ok = 0, fail = 0;
            for (const key of keys) {
                const result = await this.save(key, pending[key]);
                if (result) ok++; else fail++;
            }

            const msg = `Sincronização concluída: ${ok} ok, ${fail} falhou(aram).`;
            if (window.showToast) window.showToast(msg);
            else alert(msg);
            console.log('[ForceSyncPending]', msg);
        },


        // --- LOAD WITH AUTO-MIGRATION (Copy-On-Read) ---
        
        // --- BACKGROUND SYNC PARA DESPACHOS (QUEUE) ---
        async startBackgroundSync() {
            if (!this.hasTenant()) return;
            
            setInterval(async () => {
                if (typeof firebase === 'undefined' || !window.db) return; // Offline
                
                let dispatches = Utils.getStorage('dispatches') || [];
                if (dispatches.length === 0) return;
                
                let modified = false;
                const now = Date.now();
                const TWELVE_HOURS = 12 * 60 * 60 * 1000;
                
                for (let i = dispatches.length - 1; i >= 0; i--) {
                    const d = dispatches[i];
                    const dTime = d.timestamp || d.createdAt || 0;
                    
                    if ((d.status === 'Despachado' || d.status === 'Cancelado') && (now - dTime > TWELVE_HOURS)) {
                        try {
                            const docId = String(d.id || d.codigo || Date.now() + Math.random().toString().substr(2,5));
                            await window.db.collection('tenants').doc(this.tenantId).collection('dispatches_db').doc(docId).set(d);
                            console.log(`✅ [BackgroundSync] Despacho ${docId} salvo no banco e removido da fila local.`);
                            dispatches.splice(i, 1);
                            modified = true;
                        } catch (e) {
                            console.error(`❌ [BackgroundSync] Erro ao salvar despacho ${d.id}:`, e);
                        }
                    }
                }
                
                if (modified) {
                    localStorage.setItem(`tenant_${this.tenantId}_dispatches`, JSON.stringify(dispatches));
                    Utils.lastWriteTime['dispatches'] = Date.now();
                }
            }, 30000);
        },


        async getFullDispatchesHistory(filters = {}) {
            let local = Utils.getStorage('dispatches') || [];
            let cloud = [];

            if (this.hasTenant() && window.db) {
                try {
                    // SEM orderBy: evita necessidade de índice Firestore
                    // Ordenação feita 100% em memória usando d.id (= Date.now() no momento do despacho)
                    const ref = window.db.collection('tenants').doc(this.tenantId).collection('dispatches_db');
                    const snapshot = await ref.get();
                    snapshot.forEach(doc => cloud.push(doc.data()));
                    console.log(`[Cloud] ${cloud.length} despachos carregados do Firestore.`);
                } catch(e) {
                    console.error("Erro ao buscar histórico do banco:", e);
                }
            }

            // PRIORIDADE: Firestore é a fonte verdadeira
            // Firestore ganha quando há duplicata (o estorno altera lá, e não queremos o local sobrescrevendo)
            const map = new Map();

            // 1. Insere os locais primeiro (menor prioridade)
            local.forEach(d => {
                const id = String(d.id || d.codigo);
                if (!map.has(id)) map.set(id, d);
            });

            // 2. Firestore sobrescreve sempre (maior prioridade)
            cloud.forEach(d => {
                const id = String(d.id || d.codigo);
                map.set(id, d); // <-- sobrescreve o local, garantindo que o Firestore vença
            });

            let all = Array.from(map.values());

            // v3.11.51: Normaliza status legado 'concluido' → 'Despachado' em memória
            // (registros antigos do Firestore não passaram pela migração do localStorage)
            all.forEach(d => {
                if (d.status === 'concluido') d.status = 'Despachado';
                if (d.status === 'pendente')  d.status = 'Pendente Despacho';
                if (d.status === 'cancelado') d.status = 'Cancelado';
            });

            // Ordena em memória: d.id é Date.now() (mais confiável), d.date como fallback
            all.sort((a, b) => {
                const da = Number(a.id) || (a.date ? new Date(a.date).getTime() : 0);
                const db2 = Number(b.id) || (b.date ? new Date(b.date).getTime() : 0);
                return db2 - da;
            });

            // Aplica filtros de data em memória (sem depender de índice Firestore)
            if (filters.start) all = all.filter(d => (d.date || '') >= new Date(filters.start).toISOString());
            if (filters.end)   all = all.filter(d => (d.date || '') <= new Date(filters.end).toISOString());

            return all;
        },

        async loadAll() {
            console.log(`🔄 [Cloud] loadAll() chamado. TenantId: ${this.tenantId}`);
            if (!this.hasTenant()) return false;

            const keys = ['freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history', 'app_sellers', 'app_settings', 'app_romaneios', 'delivery_history', 'dispatches'];

            // --- FIREBASE MODE ---
            if (typeof firebase !== 'undefined' && window.db) {
                try {
                    // 1. Try Load from Current Tenant
                    const promises = keys.map(key =>
                        window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).get()
                    );
                    const docs = await Promise.all(promises);

                    for (let i = 0; i < docs.length; i++) {
                        const doc = docs[i];
                        const key = keys[i];

                        // --- CLIENTS: sempre verifica chunks PRIMEIRO (clients__meta tem prioridade) ---
                        if (key === 'clients') {
                            try {
                                const metaDoc = await window.db.collection('tenants').doc(this.tenantId)
                                    .collection('legacy_store').doc('clients__meta').get();
                                if (metaDoc.exists) {
                                    const meta = metaDoc.data();
                                    const totalChunks = meta.totalChunks || 0;
                                    if (totalChunks > 0) {
                                        console.log(`[Cloud] clients chunked: ${totalChunks} chunk(s), ${meta.totalCount} registros.`);
                                        const fullArray = await this._loadChunkedKey('clients', totalChunks);
                                        if (fullArray.length > 0) {
                                            // Guarda em memória (evita QuotaExceededError do localStorage)
                                            Utils._memStore.clients = fullArray;
                                            console.log(`[Cloud] clients: ${fullArray.length} registros em memória (sem localStorage).`);
                                            // Remove doc legado se ainda existir (ele shadowa os chunks)
                                            if (doc.exists) {
                                                window.db.collection('tenants').doc(this.tenantId)
                                                    .collection('legacy_store').doc('clients').delete()
                                                    .then(() => console.log('[Cloud] Doc legado clients deletado automaticamente.'))
                                                    .catch(() => {});
                                            }
                                            if (window.renderClientsList) window.renderClientsList();
                                        }
                                        continue; // pula o processamento normal deste key
                                    }
                                }
                            } catch (chunkErr) {
                                console.warn('[Cloud] Erro ao carregar chunks de clients:', chunkErr);
                            }
                            // Se não tem chunks, cai no fluxo normal abaixo
                        }

                        if (doc.exists) {
                            // v3.11.70 FIX: loadAll() sempre salva direto no localStorage,
                            // BYPASSANDO o Anti-Echo. O Anti-Echo é apenas para listeners
                            // onSnapshot em tempo real — não para carga explícita de login.
                            const data = doc.data();
                            const dataKeys = Object.keys(data);
                            console.log(`[loadAll] ${key}: doc EXISTE. Campos: [${dataKeys.join(', ')}]. isChunked=${data.isChunked}. content=${data.content ? data.content.length + ' chars' : 'AUSENTE'}`);
                            if (data.isChunked) {
                                if (this.loadChunks) {
                                    const fullArray = await this.loadChunks(key, data.chunkCount);
                                    const tenantKey = `tenant_${this.tenantId}_${key}`;
                                    localStorage.setItem(tenantKey, JSON.stringify(fullArray));
                                    console.log(`[loadAll] ${key} (chunked): ${fullArray.length} itens carregados diretamente.`);
                                }
                            } else {
                                // v3.11.70: Salvar DIRETO no localStorage (bypass Anti-Echo)
                                if (data.content && data.content.length >= 2) {
                                    const tenantKey = `tenant_${this.tenantId}_${key}`;
                                    localStorage.setItem(tenantKey, data.content);
                                    console.log(`[loadAll] ✅ ${key}: ${data.content.length} chars salvos no localStorage (key: ${tenantKey}).`);
                                    // Não atualizar lastWriteTime — queremos que o listener onSnapshot
                                    // possa sobrescrever com dados ainda mais recentes se necessário.

                                    // v3.11.82: Notificar UI via evento, incluindo dados já parseados
                                    // para evitar race condition de re-leitura do localStorage
                                    try {
                                        const parsedData = JSON.parse(data.content);
                                        window.dispatchEvent(new CustomEvent('cloudDataLoaded', {
                                            detail: { key, data: parsedData }
                                        }));
                                        console.log(`[loadAll] 📡 Evento cloudDataLoaded disparado para: ${key}`);
                                    } catch(parseErr) {
                                        // Se falhar o parse, dispara sem dados
                                        window.dispatchEvent(new CustomEvent('cloudDataLoaded', { detail: { key } }));
                                    }
                                } else {
                                    console.warn(`[loadAll] ⚠️ ${key}: doc existe mas sem campo 'content' válido. data.content=${JSON.stringify(data.content)}`);
                                    // v3.11.82: Tenta verificar se há outros campos (formato legado)
                                    const allFields = Object.keys(data);
                                    console.warn(`[loadAll] Campos disponíveis no doc '${key}': [${allFields.join(', ')}]`);
                                    // Se o doc tem campos diretos (formato muito antigo), tenta recuperar
                                    const legacyKeys = allFields.filter(f => !['isChunked','chunkCount','updatedAt','createdAt'].includes(f));
                                    if (legacyKeys.length > 0) {
                                        console.warn(`[loadAll] 🔍 Possível formato legado. Campos: [${legacyKeys.join(', ')}]`);
                                    }
                                }
                            }
                        } else {
                            console.warn(`[loadAll] ❌ ${key}: documento NÃO EXISTE no Firestore para tenant ${this.tenantId}.`);
                            if (this.tenantId === 'ltdistribuidora') {
                            // --- MIGRATION CHECK: If missing in 'ltdistribuidora', check 'parreiralog' ---
                            console.log(`🕵️ [Migration] ${key} não encontrado em ${this.tenantId}. Buscando em parreiralog...`);
                            try {
                                const oldDoc = await window.db.collection('tenants').doc('parreiralog').collection('legacy_store').doc(key).get();
                                if (oldDoc.exists) {
                                    const oldData = oldDoc.data();
                                    console.log(`📦 [Migration] Conteúdo encontrado em parreiralog. MIGRANDO...`);

                                    // 1. Save to New Location (Async)
                                    window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).set(oldData);

                                    // 2. Use Data Now
                                    if (oldData.isChunked) {
                                        console.warn('Skipping chunked migration auto-copy');
                                    } else {
                                        if (oldData.content) localStorage.setItem(`tenant_${this.tenantId}_${key}`, oldData.content);
                                    }
                                }
                            } catch (migErr) { console.warn('Migration check failed', migErr); }
                            } // end if ltdistribuidora
                        } // end else (doc does not exist)
                    } // end for loop
                    setTimeout(() => { if (window.renderAppHistory) window.renderAppHistory(); }, 100);
                } catch (error) { console.error('Cloud Load Error', error); }

                this.listen();
                this.startBackgroundSync();
                return true;
            }

            // --- LOCAL SIMULATION MODE (Fallback) ---
            if (!window.db) {
                console.log('⚠️ [Cloud] Sem Firebase. Usando Simulação Local.');
                
                // Real-time listener for dispatches_db (Sync across PCs)
                window.db.collection('tenants').doc(this.tenantId).collection('dispatches_db')
                    .where('status', '==', 'Pendente Despacho')
                    .onSnapshot((snapshot) => {
                        let local = Utils.getStorage('dispatches') || [];
                        let modified = false;
                        
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            const idx = local.findIndex(d => (d.id === data.id || d.codigo === data.codigo));
                            if (idx === -1) {
                                local.push(data);
                                modified = true;
                            } else {
                                // If cloud is newer or different, we update (simplification: just overwrite)
                                local[idx] = data;
                                modified = true;
                            }
                        });
                        
                        // Also remove from local if they were marked as "Despachado" by another PC and disappeared from query
                        // This is tricky because the snapshot only contains Pendente. 
                        // It's better handled by the background sync archiving old finished ones anyway.

                        if (modified) {
                            localStorage.setItem(`tenant_${this.tenantId}_dispatches`, JSON.stringify(local));
                            if (window.renderDashboard) window.renderDashboard();
                        }
                    });

                keys.forEach(key => {
                    const simKey = `tenant_${this.tenantId}_${key}`;
                    const existingData = localStorage.getItem(simKey);

                    if (!existingData) {
                        // Migration Fallback Local: parreiralog → ltdistribuidora
                        if (this.tenantId === 'ltdistribuidora') {
                            const oldKey = `tenant_parreiralog_${key}`;
                            const oldData = localStorage.getItem(oldKey);
                            if (oldData) {
                                console.log(`📦 [LocalMigration] Migrando ${key} para ltdistribuidora`);
                                localStorage.setItem(simKey, oldData);
                            }
                        }
                    }
                });

                setTimeout(() => {
                    if (window.renderUserList) window.renderUserList();
                    if (window.renderClientsList) window.renderClientsList();
                    if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                    if (window.renderRulesList) window.renderRulesList();
                    if (window.renderAppHistory) window.renderAppHistory();
                }, 100);

                this.listen();
                this.startBackgroundSync();
                return true;
            }
            return true;
        },


        // --- HELPER: Puxar partes e remontar ---
        async loadChunks(key, count) {
            console.log(`📥 Baixando ${count} partes de ${key}...`);
            let fullData = [];
            const promises = [];

            for (let i = 0; i < count; i++) {
                promises.push(
                    window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(`${key}_chunk_${i}`).get()
                );
            }

            try {
                const docs = await Promise.all(promises);
                // Ordenar por índice só por garantia (mas Promise.all mantem ordem do array de promises)
                docs.forEach(d => {
                    if (d.exists) {
                        const chunkData = JSON.parse(d.data().content);
                        fullData = fullData.concat(chunkData);
                    }
                });
                console.log(`✅ ${key} reconstruído: ${fullData.length} itens.`);
                return fullData;
            } catch (e) {
                console.error("Erro ao baixar chunks", e);
                return [];
            }
        },

        // --- HELPER: Carrega chunks no formato key__N (double underscore) ---
        async _loadChunkedKey(key, totalChunks) {
            const promises = [];
            for (let i = 0; i < totalChunks; i++) {
                promises.push(
                    window.db.collection('tenants').doc(this.tenantId || Utils.Cloud.tenantId)
                        .collection('legacy_store').doc(`${key}__${i}`).get()
                );
            }
            try {
                const docs = await Promise.all(promises);
                let fullData = [];
                docs.forEach(d => {
                    if (d.exists && d.data().content) {
                        try { fullData = fullData.concat(JSON.parse(d.data().content)); }
                        catch(e) { console.warn('[Cloud] Erro ao parsear chunk:', d.id, e); }
                    }
                });
                console.log(`[Cloud] _loadChunkedKey(${key}): ${fullData.length} itens reconstruídos de ${totalChunks} chunks.`);
                return fullData;
            } catch (e) {
                console.error('[Cloud] Falha ao carregar chunks:', e);
                return [];
            }
        },

        // --- LÓGICA CENTRAL DE RECEBIMENTO DE DADOS ---
        processIncomingData(key, cloudContentString) {
            console.log(`📩 [Cloud] Recebendo ${key}: ${cloudContentString ? cloudContentString.length + ' chars' : 'null'}`);
            const storageKey = `tenant_${this.tenantId}_${key}`;
            const localContent = localStorage.getItem(storageKey);

            // 1. Anti-Echo (60s) - Proteção contra sobrescrita após importação/limpeza
            const lastWrite = Utils.lastWriteTime[key] || 0;
            const timeSinceWrite = Date.now() - lastWrite;
            if (timeSinceWrite < 60000) {
                console.log(`🛡️ [Anti-Echo] Ignorando nuvem para ${key} (escrita há ${Math.round(timeSinceWrite / 1000)}s).`);
                return;
            }

            // 2. Anti-Rollback (Tamanho) - Ajustado para PERMITIR zerar dados ([] = 2 chars)
            // Se veio da nuvem valido, a gente confia.
            if (cloudContentString && cloudContentString.length >= 2) {
                if (cloudContentString !== localContent) {
                    console.log(`🔄 [SaaS] Atualizando local: ${key}`);

                    // clients vai para memória, não localStorage (evita QuotaExceededError)
                    if (key === 'clients') {
                        try {
                            Utils._memStore.clients = JSON.parse(cloudContentString);
                            if (window.renderClientsList) window.renderClientsList();
                        } catch(e) { console.warn('[Cloud] Erro ao parsear clients da nuvem:', e); }
                    } else {
                        localStorage.setItem(storageKey, cloudContentString);
                        // UI Refresh
                        if (key === 'dispatches') {
                            if (window.renderDashboard) window.renderDashboard();
                            if (window.renderAppHistory) window.renderAppHistory();
                            console.log(`📡 [SaaS] Despachos sincronizados de outra máquina: ${JSON.parse(cloudContentString).length} itens.`);
                        }
                        if (key === 'freight_tables' && window.renderRulesList) window.renderRulesList();
                        if (key === 'carrier_configs' && window.renderCarrierConfigs) window.renderCarrierConfigs();
                        if (key === 'app_users' && window.renderUserList) window.renderUserList();
                        if (key === 'carrier_list') {
                            console.log(`📡 [SaaS] carrier_list atualizada via onSnapshot: ${cloudContentString.length} chars.`);
                            if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                            if (window.populateCarrierSelect) window.populateCarrierSelect();
                        }
                        if (key === 'app_sellers' && window.renderSellersList) {
                            window.renderSellersList();
                            if (window.populateSellersSelector) window.populateSellersSelector();
                        }
                        if (key === 'app_settings' && window.loadAppSettings) window.loadAppSettings();
                        if (key === 'app_romaneios' && window.renderBaixaRomaneios) window.renderBaixaRomaneios();
                        // v3.11.80: Notificar UI via evento
                        window.dispatchEvent(new CustomEvent('cloudDataLoaded', { detail: { key } }));
                    }
                }
            } else {
                // Nuvem realmente vazia/nula (menos de 2 chars)
                // Proteção: Só apagar local se realmente quisermos (por enquanto, PROTEÇÃO ATIVA: não apaga)
                if (localContent) {
                    console.warn(`⚠️ [SaaS] Nuvem inválida para ${key}, mas local existe. Mantendo local.`);
                }
            }
        },

        listen() {
            // --- FIREBASE MODE ---
            if (typeof firebase !== 'undefined' && window.db && !window.hasAttachedListeners) {
                window.hasAttachedListeners = true;
                const keys = ['freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history', 'app_sellers', 'app_settings', 'app_romaneios', 'delivery_history', 'dispatches'];
                console.log(`📡 Iniciando Sync SaaS (Firestore) para: ${this.tenantId}`);

                
                // Real-time listener for dispatches_db (Sync across PCs)
                window.db.collection('tenants').doc(this.tenantId).collection('dispatches_db')
                    .where('status', '==', 'Pendente Despacho')
                    .onSnapshot((snapshot) => {
                        let local = Utils.getStorage('dispatches') || [];
                        let modified = false;
                        
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            const idx = local.findIndex(d => (d.id === data.id || d.codigo === data.codigo));
                            if (idx === -1) {
                                local.push(data);
                                modified = true;
                            } else {
                                // If cloud is newer or different, we update (simplification: just overwrite)
                                local[idx] = data;
                                modified = true;
                            }
                        });
                        
                        // Also remove from local if they were marked as "Despachado" by another PC and disappeared from query
                        // This is tricky because the snapshot only contains Pendente. 
                        // It's better handled by the background sync archiving old finished ones anyway.

                        if (modified) {
                            localStorage.setItem(`tenant_${this.tenantId}_dispatches`, JSON.stringify(local));
                            if (window.renderDashboard) window.renderDashboard();
                        }
                    });

                keys.forEach(key => {
                    window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).onSnapshot(async (doc) => {
                        if (doc.exists) {
                            const data = doc.data();
                            if (data.isChunked) {
                                console.log(`[onSnapshot] Chunks detectados para ${key}. Carregando...`);
                                const fullArray = await this.loadChunks(key, data.chunkCount);
                                if (fullArray.length > 0) {
                                    this.processIncomingData(key, JSON.stringify(fullArray));
                                }
                            } else {
                                this.processIncomingData(key, data.content);
                            }
                        } else {
                            this.processIncomingData(key, null); // Clear if deleted
                        }
                    });
                });
                return;
            }

            // --- SIMULATED CLOUD MODE ---
            if (!window.db && !window.hasAttachedListeners) {
                window.hasAttachedListeners = true;
                console.log(`📡 Iniciando Sync SaaS (Simulado) para: ${this.tenantId}`);

                window.addEventListener('storage', (e) => {
                    if (e.key && e.key.startsWith(`tenant_${this.tenantId}_`)) {
                        const internalKey = e.key.replace(`tenant_${this.tenantId}_`, '');
                        console.log(`📥 [SimCloud] Update de outra aba: ${internalKey}`);
                        // Dado já está na chave prefixada — apenas atualiza a UI
                        if (internalKey === 'dispatches') {
                            if (window.renderDashboard) window.renderDashboard();
                            if (window.renderAppHistory) window.renderAppHistory();
                        }
                        if (internalKey === 'freight_tables' && window.renderRulesList) window.renderRulesList();
                        if (internalKey === 'carrier_list' && window.renderCarrierConfigs) window.renderCarrierConfigs();
                        if (internalKey === 'app_settings' && window.loadAppSettings) window.loadAppSettings();
                        if (internalKey === 'app_sellers' && window.renderSellersList) window.renderSellersList();
                        if (internalKey === 'app_users' && window.renderUserList) window.renderUserList();
                    }
                });
            }
        },

        listenToCloudChanges: (keys) => { }, // Legacy stub

        normalizeString: (str) => {
            if (!str) return '';
            return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
        }
    }
};

// ----------  UI HELPERS (Mantidos) ----------
// ----------  UI HELPERS (User Management) ----------

window.renderUserList = function () {
    const tbody = document.getElementById('userListBody');
    if (!tbody) {
        console.warn('renderUserList: userListBody not found.');
        return;
    }

    tbody.innerHTML = '';
    let users = Utils.getStorage('app_users') || [];

    // Sort: Admin/Supervisor first
    users.sort((a, b) => {
        const roles = { 'supervisor': 1, 'admin': 1, 'user': 2, 'motoboy': 3, 'motorista': 3 };
        return (roles[a.role] || 9) - (roles[b.role] || 9);
    });

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 1.5rem; color: var(--text-secondary); font-style: italic;">Nenhum usuário cadastrado.</td></tr>`;
        return;
    }

    users.forEach((u, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';

        let roleBadge = '';
        switch (u.role) {
            case 'supervisor': roleBadge = '<span style="background: rgba(59,130,246,0.1); color: var(--primary-color); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Supervisor</span>'; break;
            case 'motoboy': roleBadge = '<span style="background: rgba(245, 158, 11, 0.1); color: #d97706; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">🏍️ Motoboy</span>'; break;
            case 'motorista': roleBadge = '<span style="background: rgba(16, 185, 129, 0.1); color: #059669; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">🚗 Motorista</span>'; break;
            default: roleBadge = '<span style="background: rgba(107, 114, 128, 0.1); color: var(--text-secondary); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Operacional</span>';
        }

        const isMe = false; // TODO: Check logged user

        tr.innerHTML = `
            <td style="padding: 0.8rem 0.6rem;">
                <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${u.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Login: <code style="background:rgba(0,0,0,0.05); padding:1px 4px; border-radius:4px;">${u.login}</code></div>
            </td>
            <td style="padding: 0.8rem 0.6rem; vertical-align: middle;">
                ${roleBadge}
            </td>
            <td style="padding: 0.8rem 0.6rem; text-align: center; vertical-align: middle;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn btn-secondary" onclick="window.openUserEditModal('${u.login}')" title="Editar Usuário" style="padding: 4px 6px; height: 32px; display: flex; align-items: center; gap: 2px;">
                        <span class="material-icons-round" style="font-size: 1rem;">edit</span>
                        <span style="font-size: 0.75rem; font-weight: 600;">Editar</span>
                    </button>
                    ${u.login === 'admin' ? '' : `
                    <button class="btn btn-danger" onclick="window.deleteUser('${u.login}')" title="Excluir Usuário" style="padding: 4px 6px; height: 32px; background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); border: none; display: flex; align-items: center; gap: 2px;">
                        <span class="material-icons-round" style="font-size: 1rem;">delete</span>
                        <span style="font-size: 0.75rem; font-weight: 600;">Excluir</span>
                    </button>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.deleteUser = function (userLogin) {
    let users = Utils.getStorage('app_users') || [];
    const idx = users.findIndex(u => u.login === userLogin);
    if (idx < 0) return;
    const user = users[idx];
    if (user && confirm(`Tem certeza que deseja remover o usuário "${user.name}"?`)) {
        users.splice(idx, 1);
        Utils.saveRaw('app_users', JSON.stringify(users));
        window.renderUserList();
        window.showToast('Usuário removido com sucesso.');
    }
};

window.openUserEditModal = function (userLogin) {
    const users = Utils.getStorage('app_users');
    const idx = users.findIndex(u => u.login === userLogin);
    if (idx < 0) return;
    const user = users[idx];

    // Supports new IDs
    const nameEl = document.getElementById('newUserName');
    const loginEl = document.getElementById('newUserLogin');
    const passEl = document.getElementById('newUserPass');
    const roleEl = document.getElementById('newUserRole');

    // Fallback/Legacy IDs just in case
    const nameEl2 = document.getElementById('regUserName');

    const targetName = nameEl || nameEl2;
    const targetLogin = loginEl || document.getElementById('regUserLogin');
    const targetPass = passEl || document.getElementById('regUserPass');
    const targetRole = roleEl || document.getElementById('regUserRole');

    if (targetName) targetName.value = user.name;
    if (targetLogin) targetLogin.value = user.login;
    if (targetPass) targetPass.value = user.pass;
    if (targetRole) targetRole.value = user.role;

    // Save the original login for reference (as index is frail to re-ordering)
    window.__editingUserLogin = user.login;
    window.__editingUserIdx = idx; // Keep for backward compatibility with app.js

    // Change button text
    const form = document.getElementById('formNewUser');
    if (form) {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 1.2rem; margin-right:5px;">save</span> ATUALIZAR USUÁRIO';
            btn.classList.add('btn-warning');
        }
    }

    window.showToast(`✏️ Editando: ${user.name}. Altere os dados no formulário ao lado.`);

    if (targetName) targetName.focus();
    
    // Smooth scroll to the form so the user sees it (helps UX)
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Handle Form Submit (Call this from app.js or attach here if possible, but app.js usually handles events)
// We will export a handler to be used
window.handleUserFormSubmit = function (e) {
    e.preventDefault();
    const nameEl = document.getElementById('newUserName');
    const loginEl = document.getElementById('newUserLogin');
    const passEl = document.getElementById('newUserPass');
    const roleEl = document.getElementById('newUserRole');

    if (!nameEl || !loginEl || !passEl) return;

    const name = nameEl.value.trim();
    const login = loginEl.value.trim();
    const pass = passEl.value.trim();
    const role = roleEl.value;

    if (!name || !login || !pass) {
        alert('Preencha todos os campos.');
        return;
    }

    let users = Utils.getStorage('app_users') || [];

    const editLogin = window.__editingUserLogin;
    const isEditing = typeof editLogin === 'string' && editLogin.trim() !== '';

    if (isEditing) {
        // Modo Edição
        const realIdx = users.findIndex(u => u.login === editLogin);
        if (realIdx >= 0) {
            // Check if they tried to change their login to an EXISTING one (other than theirs)
            if (login !== editLogin && users.some(u => u.login === login)) {
                alert('Este novo login já está sendo usado por outro usuário.');
                return;
            }
            users[realIdx] = { name, login, pass, role };
        }
        window.__editingUserLogin = null;
        window.__editingUserIdx = -1; // Reset flag
        window.showToast('Usuário atualizado!');

        // Reset Button
        const btn = e.target.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 1.2rem; margin-right:5px;">person_add</span> CADASTRAR';
            btn.classList.remove('btn-warning');
        }

    } else {
        // Create
        if (users.find(u => u.login === login)) {
            alert('Login já existe. Escolha outro.');
            return;
        }
        users.push({ name, login, pass, role });
        window.showToast('Usuário cadastrado com sucesso!');
    }

    Utils.saveRaw('app_users', JSON.stringify(users));
    window.renderUserList();

    // Clear form
    nameEl.value = '';
    loginEl.value = '';
    passEl.value = '';
    roleEl.value = 'user';
    nameEl.focus();
};

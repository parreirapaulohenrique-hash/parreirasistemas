const Utils = {
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
        try {
            const data = localStorage.getItem(key);
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

    saveRaw: (key, stringData) => {
        localStorage.setItem(key, stringData);
        Utils.lastWriteTime[key] = Date.now();
        if (Utils.Cloud) {
            try {
                const data = JSON.parse(stringData);
                // PROTEÇÃO: Não enviar arrays vazios para a nuvem
                if (Array.isArray(data) && data.length === 0) {
                    console.warn(`⚠️ [Proteção] saveRaw: Não enviando array vazio para nuvem: ${key}`);
                } else {
                    Utils.Cloud.save(key, data);
                }
            } catch (e) { }
        }
    },

    addToStorage: (key, item) => {
        try {
            const list = Utils.getStorage(key);
            list.push(item);
            const str = JSON.stringify(list);
            localStorage.setItem(key, str);
            Utils.lastWriteTime[key] = Date.now();
            if (Utils.Cloud) Utils.Cloud.save(key, list);
        } catch (e) { console.error(e); }
    },

    setStorage: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            Utils.lastWriteTime[key] = Date.now();

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
                        console.log(`[Cloud] ${key} salvo com sucesso.`);
                        return true;
                    } else {
                        const errorMsg = `[Cloud] Erro: O arquivo de ${key} é muito grande (${(size/1024).toFixed(1)}KB) e excede o limite do banco de dados.`;
                        console.error(errorMsg);
                        alert(errorMsg);
                        return false;
                    }
                } catch (e) { 
                    console.error("Cloud Save Error", e);
                    if (key === 'clients' || key === 'freight_tables') {
                        alert(`Erro ao sincronizar ${key} com a nuvem: ` + e.message);
                    }
                    return false;
                }
            }

            // --- LOCAL SIMULATION MODE ---
            if (this.hasTenant()) {
                const simKey = `tenant_${this.tenantId}_${key}`;
                try {
                    localStorage.setItem(simKey, JSON.stringify(data));
                    console.log(`💾 [SimCloud] Salvo localmente: ${simKey}`);
                } catch (e) {
                    console.error('❌ [SimCloud] Erro ao salvar:', e);
                }
            }
        },

        // --- LOAD WITH AUTO-MIGRATION (Copy-On-Read) ---
        async loadAll() {
            console.log(`🔄 [Cloud] loadAll() chamado. TenantId: ${this.tenantId}`);
            if (!this.hasTenant()) return false;

            const keys = ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history', 'app_sellers', 'app_settings', 'app_romaneios', 'delivery_history'];

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

                        if (doc.exists) {
                            // Normal Load
                            const data = doc.data();
                            if (data.isChunked) {
                                if (this.loadChunks) {
                                    const fullArray = await this.loadChunks(key, data.chunkCount);
                                    localStorage.setItem(key, JSON.stringify(fullArray));
                                }
                            } else {
                                if (data.content && data.content.length >= 2) localStorage.setItem(key, data.content);
                            }
                        } else if (this.tenantId === 'ltdistribuidora') {
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
                                        if (oldData.content) localStorage.setItem(key, oldData.content);
                                    }
                                }
                            } catch (migErr) { console.warn('Migration check failed', migErr); }
                        }
                    }
                    setTimeout(() => { if (window.renderAppHistory) window.renderAppHistory(); }, 100);
                } catch (error) { console.error('Cloud Load Error', error); }

                this.listen();
                return true;
            }

            // --- LOCAL SIMULATION MODE (Fallback) ---
            if (!window.db) {
                console.log('⚠️ [Cloud] Sem Firebase. Usando Simulação Local.');
                keys.forEach(key => {
                    const simKey = `tenant_${this.tenantId}_${key}`;
                    const customData = localStorage.getItem(simKey);

                    if (customData) {
                        localStorage.setItem(key, customData);
                    } else {
                        // Migration Fallback Local
                        if (this.tenantId === 'ltdistribuidora') {
                            const oldKey = `tenant_parreiralog_${key}`;
                            const oldData = localStorage.getItem(oldKey);
                            if (oldData) {
                                console.log(`📦 [LocalMigration] Migrando ${key} para ltdistribuidora`);
                                localStorage.setItem(simKey, oldData);
                                localStorage.setItem(key, oldData);
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

        // --- LÓGICA CENTRAL DE RECEBIMENTO DE DADOS ---
        processIncomingData(key, cloudContentString) {
            console.log(`📩 [Cloud] Recebendo ${key}: ${cloudContentString ? cloudContentString.length + ' chars' : 'null'}`);
            const localContent = localStorage.getItem(key);

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
                    localStorage.setItem(key, cloudContentString);

                    // UI Refresh
                    if (key === 'dispatches' && window.renderAppHistory) window.renderAppHistory();
                    if (key === 'freight_tables' && window.renderRulesList) window.renderRulesList();
                    if (key === 'carrier_configs' && window.renderCarrierConfigs) window.renderCarrierConfigs();
                    if (key === 'app_users' && window.renderUserList) window.renderUserList();
                    if (key === 'clients' && window.renderClientsList) window.renderClientsList();
                    if (key === 'carrier_list' && window.renderCarrierConfigs) window.renderCarrierConfigs();
                    if (key === 'app_sellers' && window.renderSellersList) {
                        window.renderSellersList();
                        if (window.populateSellersSelector) window.populateSellersSelector();
                    }
                    if (key === 'app_settings' && window.loadAppSettings) window.loadAppSettings();
                    if (key === 'app_romaneios' && window.renderBaixaRomaneios) window.renderBaixaRomaneios();
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
                const keys = ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history', 'app_sellers', 'app_settings', 'app_romaneios', 'delivery_history'];
                console.log(`📡 Iniciando Sync SaaS (Firestore) para: ${this.tenantId}`);

                keys.forEach(key => {
                    window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).onSnapshot((doc) => {
                        if (doc.exists) {
                            const data = doc.data();
                            this.processIncomingData(key, data.content);
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
                        localStorage.setItem(internalKey, e.newValue);
                        // Refresh UI if needed
                        if (internalKey === 'dispatches' && window.renderAppHistory) window.renderAppHistory();
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

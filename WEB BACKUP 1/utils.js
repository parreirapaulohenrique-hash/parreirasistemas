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

        // --- SAVE WITH CHUNKING SUPPORT ---
        async save(key, data) {
            if (!window.db && typeof firebase !== 'undefined') window.db = firebase.firestore();
            if (!window.db) return;

            try {
                const jsonContent = JSON.stringify(data);

                // Limite aprox 800KB para segurança (Firestore suporta 1MB)
                // Se OK, salva modo Legacy (Simples)
                if (jsonContent.length < 800000) {
                    await window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).set({
                        content: jsonContent,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        isChunked: false
                    });
                    return;
                }

                // --- CHUNKING MODE ---
                console.log(`📦 Payload grande (${(jsonContent.length / 1024).toFixed(0)}kb). Iniciando particionamento...`);

                if (!Array.isArray(data)) {
                    window.showToast('❌ Erro: Dado muito grande e não particionável. Contate suporte.');
                    return;
                }

                // Chunk Size: 1000 itens (freight rows costumam ser leves)
                // Se cada row tem 200 bytes, 1000 = 200kb. Seguro.
                const chunkSize = 1000;
                const chunks = [];
                for (let i = 0; i < data.length; i += chunkSize) {
                    chunks.push(data.slice(i, i + chunkSize));
                }

                const batch = window.db.batch();

                // Salvar chunks: key_chunk_0, key_chunk_1...
                chunks.forEach((chunkData, index) => {
                    const chunkRef = window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(`${key}_chunk_${index}`);
                    batch.set(chunkRef, {
                        content: JSON.stringify(chunkData),
                        parentKey: key,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                // Commit chunks
                await batch.commit();

                // Atualizar Documento Mestre
                await window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).set({
                    content: '[]', // Placeholder
                    isChunked: true,
                    chunkCount: chunks.length,
                    totalItems: data.length,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log(`✅ Salvo na nuvem em ${chunks.length} partes.`);
                if (window.showToast) window.showToast(`☁️ Dados grandes sincronizados em ${chunks.length} partes.`);

            } catch (e) {
                console.error("Cloud Save Error", e);
                if (window.showToast) window.showToast('❌ FALHA AO SALVAR NA NUVEM: ' + e.message);
            }
        },

        async loadAll() {
            console.log(`🔄 [Cloud] loadAll() chamado. TenantId: ${this.tenantId}`);

            // CRÍTICO: Não carregar dados sem tenant definido!
            if (!this.hasTenant()) {
                console.warn('⚠️ [Cloud] Nenhum tenant definido! Aguardando login...');
                return false;
            }

            if (!window.db) {
                console.error('❌ [Cloud] window.db não existe!');
                return false;
            }

            // Fazer carga inicial ANTES de iniciar listeners
            const keys = ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history'];

            console.log(`📥 [Cloud] Carregando dados do tenant: ${this.tenantId}...`);

            try {
                const promises = keys.map(key =>
                    window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).get()
                );

                const docs = await Promise.all(promises);

                for (let i = 0; i < docs.length; i++) {
                    const doc = docs[i];
                    const key = keys[i];

                    if (doc.exists) {
                        const data = doc.data();

                        // SE FOR CHUNKED (Grande)
                        if (data.isChunked) {
                            console.log(`🧩 [Cloud] Arquivo particionado: ${key} (${data.chunkCount} partes)`);
                            const fullArray = await this.loadChunks(key, data.chunkCount);
                            const content = JSON.stringify(fullArray);
                            localStorage.setItem(key, content);
                            console.log(`✅ [Cloud] ${key} carregado: ${fullArray.length} itens`);
                        } else {
                            // NORMAL
                            const content = data.content;
                            if (content && content.length >= 2) {
                                localStorage.setItem(key, content);
                                try {
                                    const parsed = JSON.parse(content);
                                    console.log(`✅ [Cloud] ${key} carregado: ${Array.isArray(parsed) ? parsed.length + ' itens' : 'objeto'}`);
                                } catch (e) {
                                    console.log(`✅ [Cloud] ${key} carregado: ${content.length} chars`);
                                }
                            } else if (content === '[]') {
                                // Array vazio na nuvem - salvar localmente também
                                localStorage.setItem(key, '[]');
                                console.log(`✅ [Cloud] ${key} carregado: vazio (array vazio)`);
                            } else if (content === '{}') {
                                // Objeto vazio na nuvem - salvar localmente também
                                localStorage.setItem(key, '{}');
                                console.log(`✅ [Cloud] ${key} carregado: vazio (objeto vazio)`);
                            }
                        }
                    } else {
                        // Documento não existe na nuvem - inicializar com valor vazio apropriado
                        const isObjectType = ['company_data', 'carrier_info_v2', 'carrier_configs'].includes(key);
                        const emptyValue = isObjectType ? '{}' : '[]';
                        localStorage.setItem(key, emptyValue);
                        console.log(`⚠️ [Cloud] ${key} não existe na nuvem - inicializando vazio`);
                    }
                }

                console.log('✅ [Cloud] Carga inicial concluída!');

                // Atualizar UI imediatamente após carga
                setTimeout(() => {
                    console.log('🔄 [Cloud] Atualizando UI após carga inicial...');
                    if (window.renderUserList) window.renderUserList();
                    if (window.renderClientsList) window.renderClientsList();
                    if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                    if (window.renderRulesList) window.renderRulesList();
                    if (window.renderAppHistory) window.renderAppHistory();
                    if (window.populateLoginSelect) window.populateLoginSelect();
                }, 100);

            } catch (error) {
                console.error('❌ [Cloud] Erro na carga inicial:', error);
            }

            // Agora inicia os listeners para atualizações em tempo real
            this.listen();
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
            if (!window.db || window.hasAttachedListeners) return;
            window.hasAttachedListeners = true;

            const keys = ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients', 'invoice_history'];
            console.log(`📡 Iniciando Sync SaaS para Tenant: ${this.tenantId}`);

            keys.forEach(key => {
                window.db.collection('tenants').doc(this.tenantId).collection('legacy_store').doc(key).onSnapshot((doc) => {
                    if (doc.exists) {
                        const data = doc.data();

                        // SE FOR CHUNKED (Grande)
                        if (data.isChunked) {
                            console.log(`🧩 Detectado arquivo grande particionado: ${key}`);
                            this.loadChunks(key, data.chunkCount).then(fullArray => {
                                // Temos o array completo remontado. Converter para string para salvar.
                                this.processIncomingData(key, JSON.stringify(fullArray));
                            });
                            return;
                        }

                        // SE FOR NORMAL
                        const cloudContent = data.content;
                        this.processIncomingData(key, cloudContent);

                    } else {
                        // Doc Missing -> Tenta limpar local? (Desativado proteção)
                        this.processIncomingData(key, null);
                    }
                });
            });
            console.log("✅ SaaS: Listeners Ativos.");
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
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-secondary" onclick="window.openUserEditModal(${idx})" title="Editar" style="padding: 4px 8px; min-width: auto; height: 32px;">
                        <span class="material-icons-round" style="font-size: 1.1rem;">edit</span>
                    </button>
                    ${u.login === 'admin' ? '' : `
                    <button class="btn btn-danger" onclick="window.deleteUser(${idx})" title="Excluir" style="padding: 4px 8px; min-width: auto; height: 32px; background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); border: none;">
                        <span class="material-icons-round" style="font-size: 1.1rem;">delete</span>
                    </button>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.deleteUser = function (idx) {
    let users = Utils.getStorage('app_users') || [];
    const user = users[idx];
    if (user && confirm(`Tem certeza que deseja remover o usuário "${user.name}"?`)) {
        users.splice(idx, 1);
        Utils.saveRaw('app_users', JSON.stringify(users));
        window.renderUserList();
        window.showToast('Usuário removido com sucesso.');
    }
};

window.openUserEditModal = function (idx) {
    const users = Utils.getStorage('app_users');
    const user = users[idx];
    if (!user) return;

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

    window.__editingUserIdx = idx;

    // Change button text
    const form = document.getElementById('formNewUser');
    if (form) {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 1.2rem; margin-right:5px;">save</span> ATUALIZAR';
            btn.classList.add('btn-warning');
        }
    }

    if (targetName) targetName.focus();
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

    if (window.__editingUserIdx !== undefined && window.__editingUserIdx !== -1) {
        // Edit
        users[window.__editingUserIdx] = { name, login, pass, role };
        window.__editingUserIdx = -1;
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

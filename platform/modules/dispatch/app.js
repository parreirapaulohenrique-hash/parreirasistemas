document.addEventListener('DOMContentLoaded', async () => {
    try {
        // GLOBAL UI UTILS
        window.showToast = (msg) => {

            const toast = document.createElement('div');
            toast.style = "position:fixed;bottom:20px;right:20px;background:var(--primary-color);color:white;padding:10px 20px;border-radius:8px;z-index:1000000;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-size:0.9rem;animation:slideIn 0.3s ease-out;";
            toast.innerText = msg;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = "slideOut 0.3s ease-in";
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        };

        // Função global para normalizar texto (remover acentos e caracteres corrompidos)
        window.normalizeText = (str) => {
            if (!str) return '';

            // Mapa de substituição para caracteres acentuados (português)
            const accentMap = {
                'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
                'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
                'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
                'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
                'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
                'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
                'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
                'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
                'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
                'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
                'ç': 'c', 'Ç': 'C',
                'ñ': 'n', 'Ñ': 'N'
            };

            // Primeiro aplica o mapa de substituição
            let result = '';
            for (let char of String(str)) {
                result += accentMap[char] || char;
            }

            // Depois tenta normalizar acentos que não estavam no mapa
            result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            // Remove caracteres não-imprimíveis e corrompidos, mas mantém espaços e pontuação básica
            result = result.replace(/[^\x20-\x7E]/g, '');

            return result.trim();
        };

        // SYNC OVERLAY
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'syncOverlay';
        loadingOverlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;font-family:sans-serif;";
        loadingOverlay.innerHTML = '<div style="font-size:3rem;">☁️</div><h2 style="margin-top:20px;color:#333;">Sincronizando Dados...</h2><p>Conectando ao Banco de Dados Seguro</p>';
        document.body.appendChild(loadingOverlay);

        // Cloud Sync
        try {
            if (Utils.Cloud) {
                await Utils.Cloud.loadAll();
            }
        } catch (e) {
            console.error("Erro ao sincronizar dados:", e);
        } finally {
            // Remove Overlay
            if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
        }

        // --- DATA MIGRATION ---
        // State
        const migrateData = () => {
            let history = Utils.getStorage('dispatches');
            let modified = false;
            history.forEach(d => {
                // Normal migrations
                if (d.status === 'pendente') { d.status = 'Pendente Despacho'; modified = true; }
                if (d.status === 'concluido') { d.status = 'Despachado'; modified = true; }
                if (d.status === 'cancelado') { d.status = 'Cancelado'; modified = true; }
                if (!d.status) { d.status = 'Pendente Despacho'; modified = true; }
            });
            if (modified) Utils.saveRaw('dispatches', JSON.stringify(history));
        };
        migrateData();

        // State
        // Clients: Load from Storage (Cloud)
        let clients = Utils.getStorage('clients') || [];

        // Tabelas de Frete
        let rules = Utils.getStorage('freight_tables') || [];

        // Removido inicialização automática de dados de exemplo para evitar sobrescrever dados do usuário
        // if (rules.length === 0 && window.initialTabelas) { ... }

        let carrierConfigs = Utils.getStorage('carrier_configs');
        if (Object.keys(carrierConfigs).length === 0) {
            // Initial empty state, will be populated based on existing carriers
            carrierConfigs = {};
        }

        // CARRIER LIST - MULTI-TENANT READY (v1.8.21)
        // Load from storage - starts empty for new clients
        let carrierList = Utils.getStorage('carrier_list');

        // CORREÇÃO: Não sobrescrever dados da nuvem
        const carrierListRaw = localStorage.getItem('carrier_list');
        if (!carrierListRaw || carrierListRaw === 'null' || carrierListRaw === 'undefined') {
            // Cliente NOVO - começa com lista vazia (mas não envia para nuvem!)
            carrierList = [];
            localStorage.setItem('carrier_list', JSON.stringify(carrierList));
            console.log('🆕 Novo cliente: carrier_list inicializada vazia.');
        } else if (carrierListRaw === '[]') {
            // Lista vazia no local - mas pode ter dados na nuvem, não sobrescrever
            carrierList = [];
            console.log('📦 carrier_list vazia localmente');
        } else {
            console.log('📦 carrier_list carregada:', carrierList?.length || 0, 'transportadoras');
        }


        let carrierInfo = Utils.getStorage('carrier_info_v2');
        if (Array.isArray(carrierInfo)) carrierInfo = {}; // Ensure it's an object for string keys

        const companyData = Utils.getStorage('company_data'); // Dispatcher data

        let selectedClient = null;

        // Users and Session State
        let users = Utils.getStorage('app_users');
        // CORREÇÃO: Só cria admin padrão se REALMENTE não houver nada salvo (nem local nem nuvem)
        // Verifica se o localStorage está vazio E não existe nada salvo
        const rawUsers = localStorage.getItem('app_users');
        if (!rawUsers || rawUsers === 'null' || rawUsers === '[]' || rawUsers === 'undefined') {
            // Verificar se há algo na nuvem antes de criar default
            // Se acabamos de carregar da nuvem e está vazio, criamos o admin
            if (!users || !Array.isArray(users) || users.length === 0) {
                console.log('👤 Criando usuário admin padrão (nenhum usuário encontrado)');
                users = [{ name: 'Administrador', login: 'admin', pass: 'admin', role: 'supervisor' }];
                // Salvar localmente, mas NÃO enviar para nuvem (para não sobrescrever dados de outras sessões)
                localStorage.setItem('app_users', JSON.stringify(users));
            }
        } else {
            // Já existem usuários salvos, usar eles
            users = Utils.getStorage('app_users') || [];
            console.log(`👥 ${users.length} usuários carregados`);
        }
        let currentUser = null; // Default: Require Login

        // --- AUTHENTICATION RECOVERED ---
        const loginOverlay = document.getElementById('loginOverlay');
        const btnLogin = document.getElementById('btnLogin');
        const loginUserSelect = document.getElementById('loginUserSelect');
        const loginPassInput = document.getElementById('loginPassInput');

        if (btnLogin) {
            btnLogin.style.setProperty('pointer-events', 'auto', 'important');
            btnLogin.style.setProperty('cursor', 'pointer', 'important');
        }



        // Define checkAuth function inside scope
        window.checkAuth = () => {
            const storedUser = Utils.getStorage('logged_user');
            if (storedUser && storedUser.login) {
                const users = Utils.getStorage('app_users');
                // Allow admin/admin bypass check if not found
                let valid = users.find(u => u.login === storedUser.login && u.pass === storedUser.pass);
                if (!valid && storedUser.login === 'admin' && storedUser.pass === 'admin') valid = storedUser;

                if (valid) {
                    currentUser = valid;
                    if (loginOverlay) loginOverlay.style.display = 'none';
                    return;
                }
            }
            // No session
            currentUser = null;
            if (loginOverlay) {
                loginOverlay.style.display = 'flex';
                const users = Utils.getStorage('app_users');
                if (loginUserSelect) loginUserSelect.innerHTML = users.map(u => `<option value="${u.login}">${u.name}</option>`).join('');
            }
        };

        window.logoutUser = () => {
            if (confirm('Deseja realmente sair do sistema?')) {
                localStorage.removeItem('logged_user');
                location.reload();
            }
        };

        // Helper: Check if current user is supervisor
        window.isSupervisor = () => {
            const storedUser = Utils.getStorage('logged_user');
            return storedUser && storedUser.role === 'supervisor';
        };

        // Apply role-based UI restrictions
        window.applyRoleRestrictions = () => {
            // Get logged user - handle both object and array
            let storedUser = Utils.getStorage('logged_user');

            // Utils.getStorage returns array by default, so handle that
            if (Array.isArray(storedUser)) {
                storedUser = storedUser.length > 0 ? storedUser[0] : null;
            }

            const userRole = storedUser ? (storedUser.role || '').toLowerCase().trim() : '';

            console.log('🔐 [Role Check] User:', storedUser);
            console.log('🔐 [Role Check] Role detected:', userRole);

            const isSup = userRole === 'supervisor' || userRole === 'admin';
            const isMotoboy = userRole === 'motoboy';
            const isMotorista = userRole === 'motorista';
            const isDeliveryUser = isMotoboy || isMotorista;

            console.log('🔐 [Role Check] isMotoboy:', isMotoboy, '| isMotorista:', isMotorista);

            // All navigation items
            const allNavItems = {
                dashboard: document.querySelector('a[href="#dashboard"]'),
                quote: document.querySelector('a[href="#quote"]'),
                dispatch: document.querySelector('a[href="#dispatch"]'),
                invoice: document.querySelector('a[href="#invoice"]'),
                moto: document.querySelector('a[href="#moto"]'),
                carro: document.querySelector('a[href="#carro"]'),
                rules: document.querySelector('a[href="#rules"]'),
                reports: document.querySelector('a[href="#reports"]'),
                configs: document.querySelector('a[href="#configs"]'),
                acontec: document.querySelector('a[href="#acontec"]'),
                system: document.querySelector('a[href="#system"]')
            };

            // MOTOBOY: Show ONLY Moto Entrega
            if (isMotoboy) {
                console.log('🏍️ Aplicando restrições de MOTOBOY');
                Object.entries(allNavItems).forEach(([key, el]) => {
                    if (el) el.style.display = (key === 'moto') ? 'flex' : 'none';
                });
                // Auto-show moto section
                setTimeout(() => window.showSection('moto'), 100);
                // Add body class
                document.body.classList.add('is-motoboy', 'is-delivery-user');
                document.body.classList.remove('is-supervisor', 'is-user', 'is-motorista');
                return;
            }

            // MOTORISTA: Show ONLY Carro Entrega
            if (isMotorista) {
                console.log('🚗 Aplicando restrições de MOTORISTA');
                Object.entries(allNavItems).forEach(([key, el]) => {
                    if (el) el.style.display = (key === 'carro') ? 'flex' : 'none';
                });
                // Auto-show carro section
                setTimeout(() => window.showSection('carro'), 100);
                // Add body class
                document.body.classList.add('is-motorista', 'is-delivery-user');
                document.body.classList.remove('is-supervisor', 'is-user', 'is-motoboy');
                return;
            }

            // SUPERVISOR/ADMIN: Show all
            if (isSup) {
                Object.values(allNavItems).forEach(el => {
                    if (el) el.style.display = 'flex';
                });
                document.body.classList.add('is-supervisor');
                document.body.classList.remove('is-user', 'is-motoboy', 'is-motorista', 'is-delivery-user');
                // Show all cards including admin-only
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
                return;
            }

            // REGULAR USER (Operacional): Hide admin menus, but show moto, carro and system (for client registration)
            if (allNavItems.reports) allNavItems.reports.style.display = 'none';
            if (allNavItems.configs) allNavItems.configs.style.display = 'none';
            if (allNavItems.system) allNavItems.system.style.display = 'flex'; // Show system for client registration
            if (allNavItems.acontec) allNavItems.acontec.style.display = 'none';
            // Moto e Carro agora visíveis para Operacional
            if (allNavItems.moto) allNavItems.moto.style.display = 'flex';
            if (allNavItems.carro) allNavItems.carro.style.display = 'flex';

            // Show remaining menus
            if (allNavItems.dashboard) allNavItems.dashboard.style.display = 'flex';
            if (allNavItems.quote) allNavItems.quote.style.display = 'flex';
            if (allNavItems.dispatch) allNavItems.dispatch.style.display = 'flex';
            if (allNavItems.invoice) allNavItems.invoice.style.display = 'flex'; // Invoice for all users
            if (allNavItems.rules) allNavItems.rules.style.display = 'flex';

            // Hide admin-only cards (Company Data, User Management) for regular users
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');

            document.body.classList.add('is-user');
            document.body.classList.remove('is-supervisor', 'is-motoboy', 'is-motorista', 'is-delivery-user');
        };



        if (loginPassInput) {
            loginPassInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') btnLogin.click();
            });
        }

        // === CARREGAR USUÁRIOS AO DIGITAR TENANT ===
        // Quando o usuário digitar o tenant e sair do campo, busca os usuários desse tenant
        const tenantInput = document.getElementById('loginTenantInput');
        if (tenantInput) {
            // Função que busca usuários do tenant
            const loadUsersForTenant = async () => {
                const tenantId = tenantInput.value.trim().toLowerCase();
                if (!tenantId) return;

                // Verificar se Firebase está disponível
                if (!window.db && typeof firebase !== 'undefined') {
                    window.db = firebase.firestore();
                }
                if (!window.db) {
                    console.warn('Firebase não disponível para carregar usuários');
                    return;
                }

                console.log(`👥 [Login] Buscando usuários do tenant: ${tenantId}...`);

                try {
                    const doc = await window.db.collection('tenants').doc(tenantId).collection('legacy_store').doc('app_users').get();

                    if (doc.exists) {
                        const data = doc.data();
                        let usersFromCloud = [];

                        if (data.content) {
                            usersFromCloud = JSON.parse(data.content);
                        }

                        if (usersFromCloud.length > 0) {
                            // Popular dropdown com usuários encontrados
                            loginUserSelect.innerHTML = usersFromCloud.map(u =>
                                `<option value="${u.login}">${u.name} (${u.login})</option>`
                            ).join('');
                            console.log(`✅ [Login] ${usersFromCloud.length} usuários carregados para o dropdown`);
                        } else {
                            // Se não tem usuários, mantém só admin padrão
                            loginUserSelect.innerHTML = '<option value="admin">Administrador (admin)</option>';
                            console.log('⚠️ [Login] Nenhum usuário encontrado, usando admin padrão');
                        }
                    } else {
                        // Tenant existe mas sem usuários cadastrados
                        loginUserSelect.innerHTML = '<option value="admin">Administrador (admin)</option>';
                        console.log('⚠️ [Login] Documento app_users não existe no tenant');
                    }
                } catch (error) {
                    console.error('❌ [Login] Erro ao carregar usuários:', error);
                    // Em caso de erro, mantém admin padrão
                    loginUserSelect.innerHTML = '<option value="admin">Administrador (admin)</option>';
                }
            };

            // Executar ao sair do campo (blur)
            tenantInput.addEventListener('blur', loadUsersForTenant);

            // Também executar se usuário pressionar Enter no campo de tenant
            tenantInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadUsersForTenant();
                    loginPassInput.focus();
                }
            });

            // Se já tem valor no campo (ex: value="parreiralog"), carregar automaticamente
            if (tenantInput.value.trim()) {
                // Pequeno delay para garantir que Firebase esteja pronto
                setTimeout(loadUsersForTenant, 500);
            }
        }

        if (btnLogin) {


            btnLogin.addEventListener('click', async () => {
                const login = loginUserSelect.value;
                const pass = loginPassInput.value;
                const tenantInput = document.getElementById('loginTenantInput');
                const tenantId = tenantInput ? tenantInput.value.trim().toLowerCase() : '';

                if (!tenantId) {
                    alert('Informe o ID da Empresa.');
                    return;
                }

                // Security: Whitelist of Allowed Tenants to prevent typos creating orphan environments
                const ALLOWED_TENANTS = ['parreiralog', 'centralpecas', 'ltdistribuidora']; // Add new clients here manually

                if (!ALLOWED_TENANTS.includes(tenantId)) {
                    alert(`A empresa '${tenantId}' não está habilitada no sistema.\n\nVerifique a grafia ou entre em contato com o suporte para liberar o acesso.`);
                    return;
                }

                // Mostrar loading durante login
                btnLogin.disabled = true;
                btnLogin.innerHTML = '⏳ Carregando...';

                // Check if tenant changed
                const currentTenant = localStorage.getItem('app_tenant_id');
                const tenantChanged = currentTenant && currentTenant !== tenantId;

                if (tenantChanged) {
                    if (confirm(`Troca de empresa detectada (de ${currentTenant} para ${tenantId}).\n\nIsso carregará o ambiente da nova empresa e limpará os dados da tela atual.\n\nDeseja continuar?`)) {
                        // Clear Business Data
                        ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients'].forEach(k => {
                            localStorage.removeItem(k);
                        });

                        Utils.Cloud.setTenantId(tenantId);
                        localStorage.removeItem('logged_user');
                        location.reload();
                        return;
                    } else {
                        return; // Abort login
                    }
                }

                // CRÍTICO: Definir tenant ANTES de qualquer operação
                const needsSync = !currentTenant || currentTenant !== tenantId;

                if (needsSync) {
                    console.log(`🏢 Configurando tenant: ${tenantId}`);

                    // CRÍTICO: Limpar TODOS os dados locais antes de carregar novo tenant
                    // Isso garante que dados de outro tenant não vazem
                    const keysToClean = ['dispatches', 'freight_tables', 'carrier_list', 'carrier_configs', 'company_data', 'app_users', 'carrier_info_v2', 'clients'];
                    keysToClean.forEach(k => {
                        localStorage.removeItem(k);
                        console.log(`🧹 Limpando local: ${k}`);
                    });

                    // Definir novo tenant
                    Utils.Cloud.setTenantId(tenantId);

                    // Carregar dados DESTE tenant da nuvem
                    if (Utils.Cloud && Utils.Cloud.hasTenant()) {
                        console.log(`📥 Carregando dados do tenant: ${tenantId}...`);
                        await Utils.Cloud.loadAll();
                    }
                }

                // Re-read users from storage (agora já com dados do tenant correto)
                users = Utils.getStorage('app_users') || [];

                // Login Logic
                let user = users.find(u => u.login === login);

                // Admin Fallback always active for setup
                if (!user && login === 'admin' && pass === 'admin') {
                    user = { name: 'Administrador (Setup)', login: 'admin', pass: 'admin', role: 'supervisor' };
                }

                if (user && user.pass === pass) {
                    currentUser = user;
                    Utils.saveRaw('logged_user', JSON.stringify(user));

                    if (loginOverlay) loginOverlay.style.display = 'none';
                    showToast(`Bem-vindo, ${user.name}! [${tenantId}]`);

                    // Apply role-based UI restrictions
                    if (window.applyRoleRestrictions) window.applyRoleRestrictions();

                    // Iniciar listeners de sync em tempo real
                    if (Utils.Cloud && Utils.Cloud.hasTenant()) {
                        Utils.Cloud.listen();
                    }

                    // Force Dashboard Render after Login
                    if (window.showSection) window.showSection('dashboard');
                    else if (window.renderDashboard) window.renderDashboard();


                } else {

                    // Restaurar botão de login
                    btnLogin.disabled = false;
                    btnLogin.innerHTML = 'ENTRAR';
                    alert('Credenciais inválidas ou usuário não cadastrado nesta empresa.');
                }
            });
        }

        // Elements

        const inputClient = document.getElementById('inputClient');
        const btnSearch = document.getElementById('btnSearchClient');
        const clientResult = document.getElementById('clientResult');

        // Central Normalization Utility
        const norm = (s) => String(s || '')
            .replace(/‚/g, 'Ç')
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim();

        const inputValue = document.getElementById('inputValue');
        const inputWeight = document.getElementById('inputWeight');
        const resultsArea = document.getElementById('resultsArea');

        // Init calls moved to the end of the script


        // --- Actions ---

        let focusedClientIndex = -1;
        let currentSearchMatches = [];

        btnSearch.addEventListener('click', () => {
            const term = norm(inputClient.value);
            if (!term) return;

            currentSearchMatches = clients.filter(c => norm(c.codigo) === term || norm(c.nome).includes(term));
            focusedClientIndex = -1;

            clientResult.innerHTML = '';
            clientResult.style.display = 'none';
            selectedClient = null;

            if (currentSearchMatches.length === 0) {
                clientResult.innerHTML = `
                <div style="font-weight: 600; color: var(--accent-danger)">Cliente não encontrado</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">Verifique o termo ou carregue o CSV atualizado.</div>
            `;
                clientResult.style.display = 'block';
                clientResult.style.borderLeft = '4px solid var(--accent-danger)';
            } else if (currentSearchMatches.length === 1) {
                selectClient(currentSearchMatches[0]);
                inputValue.focus(); // Go to next field
            } else {
                focusedClientIndex = 0; // Pre-focus first item
                renderClientMatches();
            }
        });

        function renderClientMatches() {
            let html = `<div style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-primary)">Encontrados ${currentSearchMatches.length} clientes:</div>`;
            html += `<div id="clientSearchList" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">`;

            currentSearchMatches.forEach((match, index) => {
                const isFocused = index === focusedClientIndex;
                html += `
            <div class="client-option ${isFocused ? 'focused' : ''}" 
                id="client-opt-${index}"
                style="
                padding: 0.5rem; 
                background: ${isFocused ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)'}; 
                border-radius: 4px; 
                cursor: pointer; 
                border: 1px solid ${isFocused ? 'var(--primary-color)' : 'transparent'};
                transition: all 0.2s"
                onclick="selectSearchResult('${match.codigo}')"
            >
                <div style="font-weight: 600; font-size: 0.9rem">${match.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary)">${match.cidade} - ${match.bairro}</div>
            </div>`;
            });
            html += `</div>`;

            clientResult.innerHTML = html;
            clientResult.style.display = 'block';
            clientResult.style.borderLeft = '4px solid var(--primary-color)';

            if (focusedClientIndex >= 0) {
                const el = document.getElementById(`client-opt-${focusedClientIndex}`);
                if (el) el.scrollIntoView({ block: 'nearest' });
            }
        }

        inputClient.addEventListener('keydown', (e) => {
            // If results are visible and no client is selected yet
            if (currentSearchMatches.length > 1 && clientResult.style.display === 'block' && !selectedClient) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    focusedClientIndex = Math.min(focusedClientIndex + 1, currentSearchMatches.length - 1);
                    renderClientMatches();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    focusedClientIndex = Math.max(focusedClientIndex - 1, 0);
                    renderClientMatches();
                } else if (e.key === 'Enter') {
                    if (focusedClientIndex >= 0) {
                        e.preventDefault();
                        selectClient(currentSearchMatches[focusedClientIndex]);
                        inputValue.focus(); // Focus next field
                    } else {
                        // Try to search if not already searching
                        btnSearch.click();
                    }
                } else if (e.key === 'Escape') {
                    clientResult.style.display = 'none';
                    currentSearchMatches = [];
                }
            } else if (e.key === 'Enter') {
                // Normal search trigger if no list is shown
                if (!selectedClient) {
                    e.preventDefault();
                    btnSearch.click();
                }
            }
        });

        window.selectSearchResult = (code) => {
            const found = clients.find(c => c.codigo === code);
            if (found) selectClient(found);
        };

        // Função auxiliar para verificar cobertura (dentro do escopo para acessar 'rules')
        const checkLogisticsCoverage = (clientCity, clientNeighborhood) => {
            const norm = (s) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
            const targetCity = norm(clientCity);
            const n1 = norm(clientNeighborhood);

            if (!targetCity) return false;

            // Usa a variável 'rules' do escopo global do init
            if (!rules || rules.length === 0) return false;

            return rules.some(r => {
                const ruleCity = norm(r.cidade);
                const ruleRedespCity = norm(r.cidadeRedespacho || '');

                if (ruleCity === targetCity) return true;

                if (ruleRedespCity) {
                    if (ruleRedespCity === targetCity) return true;
                    if (n1 && ruleRedespCity === n1) return true;
                }
                return false;
            });
        };

        function selectClient(client) {
            selectedClient = client;
            focusedClientIndex = -1;
            currentSearchMatches = [];

            // Verificar cobertura logística
            const hasCoverage = checkLogisticsCoverage(client.cidade, client.bairro);

            let statusHtml = '';
            let borderStyle = '';

            if (hasCoverage) {
                statusHtml = `<div style="margin-top: 5px; font-size: 0.75rem; color: var(--accent-success);">✓ Cliente Selecionado</div>`;
                borderStyle = '4px solid var(--accent-success)';
            } else {
                statusHtml = `
                    <div style="margin-top: 8px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; color: var(--accent-danger);">
                        <div style="display:flex; gap:6px; align-items:center; font-weight:700; margin-bottom:4px;">
                            <span class="material-icons-round" style="font-size: 1.1rem;">warning</span>
                            SEM COBERTURA LOGÍSTICA
                        </div>
                        <div style="font-size: 0.75rem; line-height: 1.3;">
                            Nenhuma transportadora atende <strong>${client.cidade}</strong> ou o bairro <strong>${client.bairro || ''}</strong> (Redespacho).
                            <br>Verifique o cadastro ou cadastre uma nova Rota/Tabela.
                        </div>
                    </div>
                `;
                borderStyle = '4px solid var(--accent-danger)';
                // Opcional: Toast Alert
                window.showToast(`⚠️ Atenção: Cliente sem cobertura de transporte cadastrada!`);
            }

            clientResult.innerHTML = `
            <div style="font-weight: 600;" id="resClientName">${client.nome}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                <span id="resCity">${client.cidade}</span> - <span id="resNeighborhood">${client.bairro || '-'}</span>
            </div>
            ${statusHtml}
        `;
            clientResult.style.display = 'block';
            clientResult.style.borderLeft = borderStyle;
        }

        window.resetQuote = () => {
            // Clear all inputs
            document.getElementById('inputInvoiceNumber').value = '';
            document.getElementById('inputIsComplement').value = 'nao';
            document.getElementById('inputMainNF').value = '';
            document.getElementById('divMainNF').style.display = 'none';
            document.getElementById('inputClient').value = '';
            document.getElementById('inputValue').value = '';
            document.getElementById('inputWeight').value = '';

            // Reset results area
            document.getElementById('resultsArea').innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">calculate</span>
                <p>Aguardando dados para calcular o frete...</p>
            </div>
        `;

            // Reset state
            selectedClient = null;
            clientResult.style.display = 'none';

            // Focus first field
            document.getElementById('inputInvoiceNumber').focus();
        };

        const triggerCalc = () => {
            if (selectedClient && inputValue.value && inputWeight.value) {
                calculateAndSave(true);
            }
        };

        inputValue.addEventListener('input', triggerCalc);
        inputWeight.addEventListener('input', triggerCalc);

        const inputVolume = document.getElementById('inputVolume');
        if (inputVolume) inputVolume.addEventListener('input', triggerCalc);


        const navItems = document.querySelectorAll('.nav-item');
        const sections = document.querySelectorAll('.view-section');

        function checkLateDispatchesAndAlert() {
            const history = Utils.getStorage('dispatches');
            const now = new Date();
            const hasLate = history.some(d => {
                if (d.status !== 'Pendente Despacho') return false;
                // Verifica se tem horário definido
                if (!d.horarios || d.horarios === '-') {
                    // Se não tem horário, mas é data passada, consideramos atraso? 
                    // A lógica anterior só considerava se tivesse horário. Manter consistencia.
                    // Mas se for data passada, deveria ter despachado. Vamos ser estritos apenas se tiver horário cadastrado por enquanto, ou mudar logica?
                    // O usuário pediu vinculado aos ícones vermelhos. Na lista, o ícone vermelho aparece se tiver horarios e verificação falhar.
                    // Na lógica do renderAppHistory (que corrigimos), só entra no IF se tiver horarios.
                    // Porém, se for data passada, o ideal é alertar.
                    // Vamos seguir a lógica corrigida: Só entra se d.horarios existe.
                    return false;
                }

                const dDateStart = new Date(d.date); dDateStart.setHours(0, 0, 0, 0);
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

                // 1. Data passada
                if (dDateStart < todayStart) return true;

                // 2. Hoje + Horário Limite
                if (dDateStart.getTime() === todayStart.getTime()) {
                    const timeMatch = d.horarios.match(/(\d{2}):(\d{2})/);
                    if (timeMatch) {
                        const [_, h, m] = timeMatch;
                        const deadline = new Date();
                        deadline.setHours(parseInt(h), parseInt(m), 0);
                        if (now > deadline) return true;
                    }
                }
                return false;
            });

            if (hasLate) {
                const existingModal = document.getElementById('dispatchAlertModal');
                if (!existingModal) {
                    const modal = document.createElement('div');
                    modal.id = 'dispatchAlertModal';
                    modal.className = 'login-overlay';
                    modal.style.zIndex = '9999';
                    modal.innerHTML = `
                    <div class="login-card" style="text-align: center; max-width: 400px; animation: fadeIn 0.3s ease; border: 1px solid var(--accent-danger);">
                        <span class="material-icons-round" style="font-size: 3rem; color: var(--accent-danger); margin-bottom: 1rem;">priority_high</span>
                        <h3 style="margin: 0 0 1rem 0; color: var(--accent-danger);">Atenção: Atrasos Detectados</h3>
                        <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">
                            Existem notas fiscais na lista de montagem que <strong>excederam o horário limite</strong> de saída.<br><br>
                            Verifique os itens com ícone <span class="material-icons-round" style="font-size:1.2rem; vertical-align:middle; color:var(--accent-danger);">alarm_off</span> na coluna de Status.
                        </p>
                        <button class="btn btn-primary" onclick="document.getElementById('dispatchAlertModal').style.display='none'" style="width: 100%; justify-content: center; background: var(--accent-danger); border-color: var(--accent-danger);">
                            Entendido
                        </button>
                    </div>
                `;
                    document.body.appendChild(modal);
                } else {
                    existingModal.style.display = 'flex';
                }
            }
        }

        function showSection(id) {

            navItems.forEach(nav => {
                if (nav.getAttribute('href') === `#${id}`) nav.classList.add('active');
                else nav.classList.remove('active');
            });

            // Update breadcrumb label
            const breadLabel = document.querySelector('.breadcrumb .current');
            if (breadLabel) {
                const labels = {
                    'dashboard': 'Painel',
                    'quote': 'Cotação Rápida',
                    'dispatch': 'Montagem de Carga',
                    'rules': 'Tabelas de Frete',
                    'reports': 'Relatórios & KPIs',
                    'configs': 'Config. Transportadoras',
                    'system': 'Configurações'
                };
                breadLabel.innerText = labels[id] || id;
            }


            sections.forEach(sec => {
                sec.style.display = sec.id === `view-${id}` ? 'block' : 'none';
            });

            if (id === 'dashboard') {
                renderDashboard();
            }
            if (id === 'dispatch' && window.renderAppHistory) {
                window.renderAppHistory();
                checkLateDispatchesAndAlert(); // Alert logic linked to this tab
                // Atualizar seletor de motoristas dinamicamente
                if (window.populateDriverSelector) window.populateDriverSelector();
            }
            if (id === 'rules') {
                renderRulesList();
            }
            if (id === 'configs') {
                renderCarrierConfigs();
                // Pequeno delay para garantir que o container esteja renderizável/visível se houver transições
                setTimeout(() => {
                    if (window.renderUserList) window.renderUserList();
                }, 50);
            }
            if (id === 'system') {
                // Renderizar clientes quando abrir Configurações
                setTimeout(() => {
                    if (window.renderClientsList) window.renderClientsList();
                }, 50);
            }
            if (id === 'driver') {
                renderDriverView();
            }
            if (id === 'invoice' && window.initInvoiceSection) {
                window.initInvoiceSection();
            }
        }

        window.showSection = showSection;

        // Preenche o seletor de motoristas no Modal de Despacho
        window.populateDriverSelector = function () {
            const select = document.getElementById('deliveryTypeSelector');
            if (!select) return;

            // Opção padrão (Direto/Próprio)
            // Salva o valor atual caso esteja re-renderizando para não perder seleção
            const currentVal = select.value;

            let optionsHtml = '<option value="direto">📦 Direto (Próprio)</option>';

            const users = Utils.getStorage('app_users') || [];

            // Filtra Motoboys
            users.filter(u => u.role === 'motoboy').forEach(u => {
                optionsHtml += `<option value="moto_${u.login}">🏍️ ${u.name}</option>`;
            });

            // Filtra Motoristas
            users.filter(u => u.role === 'motorista').forEach(u => {
                optionsHtml += `<option value="carro_${u.login}">🚗 ${u.name}</option>`;
            });

            select.innerHTML = optionsHtml;

            // Tenta restaurar
            if (currentVal && (currentVal.startsWith('moto_') || currentVal.startsWith('carro_'))) {
                select.value = currentVal;
            }
        };

        // Driver view rendering (for motoboy / motorista)
        // NOVA LÓGICA: Agrupar por motorista em vez de filtrar
        function renderDriverView() {

            const container = document.getElementById('driverDeliveriesList');
            const history = Utils.getStorage('dispatches');

            // Buscar todas as entregas com deliveryStatus === 'em_entrega'
            const allDeliveries = history.filter(d => d.deliveryStatus === 'em_entrega');

            console.log('📋 [DriverView] Total entregas em_entrega:', allDeliveries.length);

            // --- ESTILOS MOBILE ESPECÍFICOS ---
            const styleId = 'driver-mobile-style';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                    .driver-mode-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        padding: 0 10px !important;
                        box-sizing: border-box !important;
                    }
                    .driver-section {
                        margin-bottom: 30px;
                        border: 2px solid #e5e7eb;
                        border-radius: 16px;
                        overflow: hidden;
                    }
                    .driver-section-header {
                        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                        color: white;
                        padding: 15px 20px;
                        font-size: 1.3rem;
                        font-weight: 700;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .driver-section-header .count {
                        background: rgba(255,255,255,0.2);
                        padding: 5px 12px;
                        border-radius: 20px;
                        font-size: 1rem;
                    }
                    .driver-section-body {
                        padding: 15px;
                        background: #f9fafb;
                    }
                    .driver-card {
                        background: #fff;
                        border-radius: 12px;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                        border: 1px solid #e0e0e0;
                        margin-bottom: 15px;
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .driver-client-name {
                        font-size: 1.5rem !important;
                        line-height: 1.2;
                        font-weight: 800;
                        color: #1f2937;
                    }
                    .driver-nf {
                        font-size: 1.3rem !important;
                        color: #2563eb;
                        font-weight: 700;
                        margin-top: 3px;
                    }
                    .driver-address {
                        font-size: 1.1rem !important;
                        color: #4b5563;
                        border-top: 2px solid #f3f4f6;
                        padding-top: 12px;
                        margin-top: 8px;
                    }
                    .driver-btn {
                        width: 100%;
                        padding: 16px !important;
                        font-size: 1.2rem !important;
                        font-weight: 700 !important;
                        border-radius: 12px !important;
                        background: #10b981 !important;
                        color: white !important;
                        border: none !important;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 10px;
                        text-transform: uppercase;
                        box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);
                    }
                    .driver-btn:active {
                        transform: scale(0.98);
                    }
                    #view-moto, #view-carro {
                        padding: 10px !important;
                    }
                `;
                document.head.appendChild(style);
            }

            if (allDeliveries.length === 0) {
                container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:3rem;font-size:1.2rem;">
                    <span class="material-icons-round" style="font-size:5rem;color:#e5e7eb;display:block;margin-bottom:1rem;">check_circle</span>
                    <strong style="font-size: 1.5rem; color: #374151;">Nenhuma entrega pendente!</strong>
                </div>`;
                return;
            }

            container.className = 'driver-mode-container';

            // --- AGRUPAR POR MOTORISTA ---
            const grouped = {};
            allDeliveries.forEach(d => {
                const driverKey = d.driverName || 'Não Atribuído';
                if (!grouped[driverKey]) grouped[driverKey] = [];
                grouped[driverKey].push(d);
            });

            let html = '';

            Object.keys(grouped).sort().forEach(driverName => {
                const items = grouped[driverName];
                const icon = items[0]?.deliveryType === 'carro' ? '🚗' : '🏍️';

                html += `
                <div class="driver-section">
                    <div class="driver-section-header">
                        <span>${icon} ${driverName}</span>
                        <span class="count">${items.length} entrega(s)</span>
                    </div>
                    <div class="driver-section-body">
                        ${items.map(d => {
                    const shortId = d.id.toString().slice(-4);
                    return `
                            <div class="driver-card">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div style="flex: 1;">
                                        <div class="driver-client-name">${d.client}</div>
                                        <div class="driver-nf">NF: ${d.invoice}</div>
                                    </div>
                                    <div style="background: #eff6ff; color: #2563eb; padding: 5px 10px; border-radius: 6px; font-weight: bold; font-size: 1rem;">
                                        #${shortId}
                                    </div>
                                </div>

                                <div class="driver-address">
                                    <span class="material-icons-round" style="vertical-align: bottom; font-size: 1.3rem; color: #ef4444;">location_on</span>
                                    ${d.city}
                                    <div style="font-size: 1rem; color: #6b7280; margin-left: 26px;">
                                        ${d.neighborhood ? d.neighborhood : ''}
                                    </div>
                                </div>

                                <button class="driver-btn" onclick="window.confirmDelivery(${d.id})">
                                    <span class="material-icons-round" style="font-size: 1.6rem;">check_circle</span>    
                                    CONFIRMAR ENTREGA
                                </button>
                            </div>`;
                }).join('')}
                    </div>
                </div>`;
            });

            container.innerHTML = html;

            document.getElementById('driverNameDisplay').innerText = currentUser ? currentUser.name : 'Entregador';
        }

        // Confirm delivery with geolocation
        window.confirmDelivery = (id) => {
            const all = Utils.getStorage('dispatches');
            const idx = all.findIndex(d => d.id === id);

            if (idx === -1) {
                alert('Entrega não encontrada.');
                return;
            }

            if (!navigator.geolocation) {
                alert('Geolocalização não suportada neste dispositivo.');
                return;
            }

            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords;

                // Atualizar o item diretamente no array
                all[idx].deliveryStatus = 'entregue';
                all[idx].deliveryCompletedAt = new Date().toISOString();
                all[idx].deliveryLocation = { lat: latitude, lng: longitude };
                all[idx].deliveredBy = currentUser ? currentUser.login : 'desconhecido';

                // Salvar
                Utils.saveRaw('dispatches', JSON.stringify(all));

                showToast('✅ Entrega confirmada!');
                renderDriverView();
                if (window.renderAppHistory) window.renderAppHistory();

            }, err => {
                console.error('Erro geolocalização:', err);
                alert('Não foi possível obter localização. Permita o acesso à localização.');
            });
        };

        navItems.forEach(nav => {
            nav.addEventListener('click', (e) => {
                e.preventDefault();
                const id = nav.getAttribute('href').replace('#', '');
                showSection(id);
            });
        });


        window.showSection = showSection;

        document.getElementById('inputInvoiceNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') inputClient.focus();
        });

        // Keyboard handling is now centralized in the 'keydown' listener above

        inputValue.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') inputWeight.focus();
        });

        inputWeight.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') calculateAndSave();
        });

        const inputIsComplement = document.getElementById('inputIsComplement');
        const inputMainNF = document.getElementById('inputMainNF');
        const divMainNF = document.getElementById('divMainNF');

        if (inputIsComplement) {
            inputIsComplement.addEventListener('change', () => {
                divMainNF.style.display = inputIsComplement.value === 'sim' ? 'block' : 'none';
                if (inputIsComplement.value === 'nao') inputMainNF.value = '';
                calculateAndSave(true);
            });
        }

        if (inputMainNF) {
            inputMainNF.addEventListener('input', () => {
                const mainNF = inputMainNF.value.trim();
                if (mainNF) {
                    const history = Utils.getStorage('dispatches');
                    const originalDispatch = history.find(d => d.invoice === mainNF);
                    if (originalDispatch) {
                        // Try to find the actual client object in our list to maintain consistency
                        const foundClient = clients.find(c => c.nome === originalDispatch.client);
                        if (foundClient) {
                            selectClient(foundClient);
                        } else {
                            // If not in current list (maybe imported later), create a temporary one
                            selectClient({
                                nome: originalDispatch.client,
                                cidade: originalDispatch.city,
                                bairro: originalDispatch.neighborhood || '-'
                            });
                        }
                    }
                }
                calculateAndSave(true);
            });
        }

        function calculateAndSave(silent = false) {
            const norm = Utils.normalizeString;
            if (!selectedClient) {

                if (!silent) alert('Por favor, selecione um cliente primeiro.');
                return;
            }

            const nfValue = parseFloat(inputValue.value);
            const weight = parseFloat(inputWeight.value);

            if (isNaN(nfValue) || isNaN(weight)) {
                if (!silent) alert('Preencha os campos Valor da NF e Peso para ver as opções.');
                return;
            }

            const isComplement = document.getElementById('inputIsComplement').value === 'sim';
            const mainNF = document.getElementById('inputMainNF').value.trim();

            let targetCarrier = null;
            if (isComplement) {
                if (!mainNF) {
                    resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                    <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">link</span>
                    <p>Informe a NF Principal para filtrar a transportadora original.</p>
                </div>`;
                    return;
                }
                const history = Utils.getStorage('dispatches');
                const originalDispatch = history.find(d => d.invoice === mainNF);

                if (originalDispatch) {
                    targetCarrier = norm(originalDispatch.carrier);

                    // Enforce the client from the original dispatch!
                    if (norm(selectedClient.nome) !== norm(originalDispatch.client)) {
                        // Automatically re-select the correct client if they mismatch
                        const foundCorrect = clients.find(c => norm(c.nome) === norm(originalDispatch.client));
                        if (foundCorrect) {
                            selectClient(foundCorrect);
                        } else {
                            // Create temp client if not found in current list
                            selectClient({
                                nome: originalDispatch.client,
                                cidade: originalDispatch.city,
                                bairro: originalDispatch.neighborhood || '-'
                            });
                        }
                    }
                } else {
                    resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                    <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">search_off</span>
                    <p>NF Principal "${mainNF}" não encontrada no histórico de despachos.</p>
                </div>`;
                    return;
                }
            }

            const cityInput = document.getElementById('inputCity');
            const city = norm(cityInput ? cityInput.value : (selectedClient ? (selectedClient.cidade || selectedClient.City || selectedClient.city) : ''));


            let cityRules = rules.filter(r => {
                const targetCity = city;
                const ruleCity = norm(r.cidade);
                const ruleRedespCity = norm(r.cidadeRedespacho || '');

                if (ruleCity === targetCity) return true;

                if (ruleRedespCity) {
                    if (ruleRedespCity === targetCity) return true;
                    if (selectedClient) {
                        const n1 = norm(selectedClient.Neighborhood || selectedClient.neighborhood || '');
                        const n2 = norm(selectedClient.Bairro || selectedClient.bairro || '');
                        if (n1 && ruleRedespCity === n1) return true;
                        if (n2 && ruleRedespCity === n2) return true;
                    }

                }
                return false;
            });



            if (targetCarrier) {
                cityRules = cityRules.filter(r => norm(r.transportadora) === targetCarrier);
            }

            if (cityRules.length === 0) {
                if (!silent) {
                    if (targetCarrier) alert(`A transportadora ${targetCarrier} não possui tabela para a cidade ${city}.`);
                    else alert(`Nenhuma tabela de frete encontrada para ${city}.`);
                }
                resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">error_outline</span>
                <p>${targetCarrier ? `A transportadora ${targetCarrier} (da NF ${mainNF}) não possui tabela para esta cidade.` : 'Nenhuma opção de frete disponível.'}</p>
            </div>`;
                return;
            }

            const options = cityRules.map(rule => {
                const carrier = rule.transportadora;
                const config = carrierConfigs[carrier] || { taxaFixa: 0, gris: 0, icms: 0, valorVolume: 0 };
                const isComplement = document.getElementById('inputIsComplement').value === 'sim';
                const volume = parseInt(document.getElementById('inputVolume').value) || 1;

                // 1. Base Freight (City rules)
                let baseVal = nfValue * (rule.percentual / 100);
                // Ignore minimum if it's a complement
                if (!isComplement && baseVal < rule.minimo) baseVal = rule.minimo;

                const tollVal = rule.pedagio || 0;

                // 2. Weight Excess
                let excessCost = 0;
                if (rule.limitePeso > 0 && weight > rule.limitePeso) {
                    const excessKg = weight - rule.limitePeso;
                    excessCost = excessKg * rule.valorExcedente;
                }

                // 3. Volume Cost (all volumes)
                let volumeCost = 0;
                if (volume >= 1 && config.valorVolume > 0) {
                    volumeCost = volume * config.valorVolume;
                }


                // 4. Adicionais (Global)
                const grisVal = nfValue * (config.gris / 100);

                // 4.1 Redispatch Cost
                let redispatchCost = 0;
                if (rule.redespacho) {
                    let shouldCharge = true;
                    // Check if conditional redispatch applies
                    const rRedespCity = norm(rule.cidadeRedespacho || '');

                    if (rRedespCity) {
                        // Conditional Charge: Only if client matches redispatch city/neighborhood
                        shouldCharge = false;
                        const cityInput = document.getElementById('inputCity');
                        const targetCity = norm(cityInput ? cityInput.value : (selectedClient ? (selectedClient.cidade || selectedClient.City || selectedClient.city) : ''));


                        if (rRedespCity === targetCity) shouldCharge = true;
                        else if (selectedClient) {
                            const n1 = norm(selectedClient.Neighborhood || selectedClient.neighborhood || '');
                            const n2 = norm(selectedClient.Bairro || selectedClient.bairro || '');
                            if (n1 && rRedespCity === n1) shouldCharge = true;
                            if (n2 && rRedespCity === n2) shouldCharge = true;
                        }

                    }


                    if (shouldCharge) {
                        // 1. Ad Valorem (% Redispatch)
                        let rValPercent = 0;
                        if (rule.percentualRedespacho > 0) {
                            rValPercent = nfValue * (rule.percentualRedespacho / 100);
                        }

                        // 2. Weight/Volume (Carrier Config for Redispatch Carrier)
                        let rValVol = 0;
                        const redespConfig = carrierConfigs[rule.redespacho] || {};

                        if (redespConfig.valorVolume > 0 && volume >= 1) {
                            rValVol = volume * redespConfig.valorVolume;
                        }

                        // Max of both strategies (Percent vs Volume)
                        let rVal = Math.max(rValPercent, rValVol);

                        // Apply minimum redispatch if configured
                        const rMin = rule.minimoRedespacho || 0;
                        if (rVal < rMin) rVal = rMin;

                        redispatchCost = rVal;
                    }

                }


                const subtotal = baseVal + config.taxaFixa + grisVal + excessCost + tollVal + volumeCost + redispatchCost;

                // 5. ICMS (Calculo por dentro)
                const factor = 1 - (config.icms / 100);
                const total = factor > 0 ? subtotal / factor : subtotal;

                return {
                    carrier: carrier,
                    total: total,
                    details: {
                        base: baseVal,
                        excess: excessCost,
                        volume: volumeCost,
                        fixed: config.taxaFixa,
                        gris: grisVal,
                        toll: tollVal,
                        redispatch: redispatchCost,
                        icms: total - subtotal,
                        ruleUsed: rule
                    }


                };
            });

            const validOptions = options.filter(opt => opt.total > 0);
            validOptions.sort((a, b) => {
                // 1. Preço (Menor é melhor) - Use epsilon for float comparison
                if (Math.abs(a.total - b.total) > 0.01) return a.total - b.total;

                // 2. Confiabilidade (Maior é melhor)
                const relA = (carrierInfo[a.carrier] && carrierInfo[a.carrier].reliability) || 3;
                const relB = (carrierInfo[b.carrier] && carrierInfo[b.carrier].reliability) || 3;
                if (relA !== relB) return relB - relA; // Descending

                // 3. Sem Redespacho (Preferência para quem NÃO tem redespacho)
                const hasRedesA = !!(a.details.ruleUsed.redespacho);
                const hasRedesB = !!(b.details.ruleUsed.redespacho);
                if (hasRedesA !== hasRedesB) return hasRedesA ? 1 : -1; // Se A tem (true) e B nao (false), A vem depois (1)

                // 4. Prazo (Menor é melhor)
                const leadA = parseInt((a.details.ruleUsed.leadTime || '').replace(/\D/g, '')) || 999;
                const leadB = parseInt((b.details.ruleUsed.leadTime || '').replace(/\D/g, '')) || 999;
                return leadA - leadB;
            });

            renderResults(validOptions);
        }

        // --- VAN Calculation Logic ---
        window.calcVanDiff = (index, originalTotal) => {
            const input = document.getElementById(`van-input-${index}`);
            const diffSpan = document.getElementById(`van-diff-${index}`);
            if (!input || !diffSpan) return;

            const val = parseFloat(input.value);
            if (isNaN(val)) {
                diffSpan.innerHTML = '';
                return;
            }

            const diff = originalTotal - val;
            const color = diff >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
            const label = diff >= 0 ? 'Economia' : 'Acréscimo';

            diffSpan.innerHTML = `<span style="color: ${color}">${label}: ${Utils.formatCurrency(Math.abs(diff))}</span>`;
        };

        function renderResults(options) {
            resultsArea.innerHTML = options.map((opt, index) => {
                const d = opt.details;
                const rule = d.ruleUsed;
                const isVan = opt.carrier.toUpperCase().includes('VAN');

                // Extra variables per rules (NOT global configs)
                const extraParts = [];
                if (d.excess > 0) extraParts.push(`Excedente: ${Utils.formatCurrency(d.excess)}`);
                if (d.toll > 0) extraParts.push(`Pedágio: ${Utils.formatCurrency(d.toll)}`);
                // Redespacho removido do extraParts pois terá destaque próprio

                const extraText = extraParts.length > 0 ? `<div style="color: var(--primary-color); font-weight: 500; margin-top: 4px;">+ ${extraParts.join(' | ')}</div>` : '';

                let cardClass = index === 0 ? 'best-option' : (options.length > 3 && index === options.length - 1 ? 'worst-option' : 'standard-option');

                const redispatchHtml = rule.redespacho ? `<div style="margin-top:4px; font-size:0.75rem;"><span style="color:var(--text-secondary)">⚓ Redespacho:</span> <strong style="color: var(--accent-warning);">${rule.redespacho}</strong></div>` : '';

                // Create a line for estimated time and hours
                const timeParts = [];
                if (rule.horarios) timeParts.push(`<span style="color:var(--text-secondary)">🚚 Saídas:</span> <strong style="color: var(--primary-color);">${rule.horarios}</strong>`);
                if (rule.leadTime) timeParts.push(`<span style="color:var(--text-secondary)">🕒 Entrega:</span> <strong style="color: var(--text-primary);">${rule.leadTime}</strong>`);
                const timeInfoHtml = timeParts.length > 0 ? `<div style="margin-top:6px; font-size:0.75rem; display: flex; align-items: center; gap: 12px;">${timeParts.join(' <span style="opacity:0.3">|</span> ')}</div>` : '';

                // VAN Specific Input
                const vanInputHtml = isVan ? `
                <div class="van-adjustment" style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 8px;" onclick="event.stopPropagation()">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label style="font-size: 0.75rem; color: var(--text-secondary);">Valor Negociado (VAN):</label>
                        <span id="van-diff-${index}" style="font-size: 0.75rem; font-weight: bold;"></span>
                    </div>
                    <input type="number" id="van-input-${index}" class="form-input" 
                        style="padding: 4px 8px; font-size: 0.9rem; width: 100%; height: 32px;" 
                        placeholder="Informe valor final..." 
                        oninput="window.calcVanDiff(${index}, ${opt.total})">
                </div>
            ` : '';

                // Price Breakdown Logic - EXIBIÇÃO SEPARADA TRANSP + REDESPACHO
                let priceHtml;
                if (d.redispatch > 0) {
                    // Calcular proporcionalmente com ICMS
                    const subtotal = d.base + d.fixed + d.gris + d.excess + d.toll + d.volume + d.redispatch;
                    const factor = opt.total > 0 ? subtotal / opt.total : 1;
                    const redespVal = d.redispatch / factor;
                    const transpVal = opt.total - redespVal;

                    priceHtml = `
                     <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between; width: 100%; gap: 8px;">
                            <span style="color: var(--text-secondary);">Transp:</span>
                            <span style="color: var(--text-primary); font-weight: 600;">${Utils.formatCurrency(transpVal)}</span>
                        </div>
                        <div style="font-size: 0.8rem; display: flex; justify-content: space-between; width: 100%; gap: 8px;">
                            <span style="color: var(--accent-warning);">Redesp:</span>
                            <span style="color: var(--accent-warning); font-weight: 600;">${Utils.formatCurrency(redespVal)}</span>
                        </div>
                        <div style="border-top: 2px solid var(--primary-color); padding-top: 4px; margin-top: 4px; width: 100%; display: flex; justify-content: space-between; gap: 8px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Total:</span>
                            <span class="result-value" style="font-size: 1.3rem; color: var(--primary-color); font-weight: 700;">${Utils.formatCurrency(opt.total)}</span>
                        </div>
                     </div>`;
                } else {
                    priceHtml = `<div class="result-value" style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color);">${Utils.formatCurrency(opt.total)}</div>`;
                }

                return `
            <div class="result-card ${cardClass}" onclick="window.confirmDispatch(${index})">
                <div style="flex: 1;">
                    <div class="carrier-name">${opt.carrier}</div>
                    <div class="carrier-details">
                        ${rule.percentual.toLocaleString('pt-BR')}% Frete (min. ${Utils.formatCurrency(rule.minimo)})
                        ${extraText}
                    </div>
                    ${timeInfoHtml}
                    ${redispatchHtml}
                    ${vanInputHtml}
                </div>
                <div style="text-align: right; min-width: 120px; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start;">
                    ${priceHtml}

                    ${isVan ? '<div style="font-size: 0.7rem; color: var(--text-secondary); margin-top:2px;">(Sugerido)</div>' : ''}
                </div>
            </div>`;
            }).join('');
            window.currentOptions = options;
        }

        window.confirmDispatch = (index) => {
            const option = window.currentOptions[index];
            if (!option) return;

            // Check for VAN negotiated value
            let finalTotal = option.total;
            let vanDiff = 0;
            let isNegotiated = false;

            const vanInput = document.getElementById(`van-input-${index}`);
            if (vanInput && vanInput.value) {
                const negociado = parseFloat(vanInput.value);
                if (!isNaN(negociado) && negociado > 0) {
                    finalTotal = negociado;
                    vanDiff = option.total - finalTotal; // Positive = Saving
                    isNegotiated = true;
                }
            }

            const msgPrice = isNegotiated
                ? `${Utils.formatCurrency(finalTotal)} (Negociado) \n[Original: ${Utils.formatCurrency(option.total)}]`
                : `${Utils.formatCurrency(option.total)}`;

            if (!confirm(`Confirmar despacho com ${option.carrier} por ${msgPrice}?`)) return;

            const clientName = document.getElementById('resClientName').innerText;
            const resCity = document.getElementById('resCity').innerText;
            const resNeighborhood = document.getElementById('resNeighborhood').innerText;
            const val = parseFloat(document.getElementById('inputValue').value) || 0;
            const weight = parseFloat(document.getElementById('inputWeight').value) || 0;
            const volume = parseInt(document.getElementById('inputVolume').value) || 1;
            const invoice = document.getElementById('inputInvoiceNumber').value.trim();
            const isComp = document.getElementById('inputIsComplement').value === 'sim';
            const mainInv = isComp ? document.getElementById('inputMainNF').value.trim() : '';


            if (!invoice) {
                alert('Por favor, informe o número da Nota Fiscal para confirmar o despacho.');
                document.getElementById('inputInvoiceNumber').focus();
                return;
            }

            if (isComp && !mainInv) {
                alert('Por favor, informe o número da NF Principal (Paga) para registrar o complemento.');
                return;
            }

            // Block repeated NF (unless it's a complement or empty)
            if (invoice && invoice !== 'S/N' && !isComp) {
                const history = Utils.getStorage('dispatches');
                const duplicate = history.find(d => d.invoice === invoice);
                if (duplicate) {
                    alert(`⚠️ Atenção: A Nota Fiscal nº ${invoice} já foi despachada anteriormente para o cliente "${duplicate.client}" em ${new Date(duplicate.date).toLocaleDateString()}.`);
                    return;
                }
            }

            const ruleUsed = option.details.ruleUsed;

            const dispatch = {
                id: Date.now(),
                date: new Date().toISOString(),
                client: clientName !== 'Name' ? clientName : 'Consumidor',
                city: resCity,
                neighborhood: resNeighborhood,
                carrier: String(option.carrier || '').trim().toUpperCase(),
                total: finalTotal, // Use negotiated price if available
                originalTotal: option.total, // Keep original for records
                vanDiff: isNegotiated ? vanDiff : 0, // Save difference
                nfValue: val,
                weight: weight,
                volume: volume,
                invoice: invoice || 'S/N',

                isComplement: isComp,
                mainInvoice: mainInv,
                status: 'Pendente Despacho', // Novo status padrão
                percentual: ruleUsed.percentual,
                minimo: ruleUsed.minimo,
                redespacho: ruleUsed.redespacho || '-',
                horarios: ruleUsed.horarios || '-',
                leadTime: ruleUsed.leadTime || '-',
                baseCalculada: option.details.base,
                excessoCalculado: option.details.excess,
                pedagio: option.details.toll,
                gris: option.details.gris,
                taxaFixa: option.details.fixed,
                icms: option.details.icms,
                capturedBy: currentUser ? currentUser.name : 'Sistema'
            };

            Utils.addToStorage('dispatches', dispatch);
            showToast('✅ Carga montada com sucesso!');

            // Reset form for next input, but stay on Quote screen
            document.getElementById('inputInvoiceNumber').value = '';
            document.getElementById('inputWeight').value = '';
            document.getElementById('inputValue').value = '';
            document.getElementById('inputVolume').value = '';

            document.getElementById('inputIsComplement').value = 'nao';

            const grp = document.getElementById('mainNFGroup');
            if (grp) grp.style.display = 'none';
            document.getElementById('inputMainNF').value = '';

            // Focus back to invoice number for rapid entry
            document.getElementById('inputInvoiceNumber').focus();

            // Clear results to avoid confusion
            document.getElementById('resultsArea').innerHTML = '';
            const resContainer = document.getElementById('quoteResults');
            if (resContainer) resContainer.style.display = 'none';

            // But keeping it might be better for reference. Let's just scroll up.
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        function showToast(message) {
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.backgroundColor = 'var(--accent-success)';
            toast.style.color = 'white';
            toast.style.padding = '12px 24px';
            toast.style.borderRadius = 'var(--radius-md)';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            toast.style.zIndex = '9999';
            toast.style.fontWeight = '600';
            toast.style.display = 'flex';
            toast.style.alignItems = 'center';
            toast.style.gap = '8px';
            toast.style.animation = 'slideIn 0.3s ease-out';
            toast.innerHTML = `<span class="material-icons-round">check_circle</span> ${message}`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, 1500);
        }
        window.showToast = showToast;

        // --- GERENCIAMENTO DE TABELAS DE FRETE ---

        let activeCarrier = '';
        window.rulesFilters = { cidade: '', redespacho: '' };

        const renderRulesList = () => {
            populateCityDatalist();
            const body = document.getElementById('rulesListBody');
            const tabContainer = document.getElementById('carrierTabs');
            if (!body || !tabContainer) return;

            // Group by Carrier
            const groups = {};
            rules.forEach(r => {
                if (!groups[r.transportadora]) groups[r.transportadora] = [];
                groups[r.transportadora].push(r);
            });

            // Sorted Carriers
            const carriers = Object.keys(groups).sort((a, b) => a.localeCompare(b));

            if (carriers.length === 0) {
                tabContainer.innerHTML = '';
                body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 3rem; color: var(--text-secondary);">Nenhuma tabela cadastrada.</td></tr>';
                return;
            }

            // Default to first carrier if activeCarrier is invalid
            if (!activeCarrier || !groups[activeCarrier]) activeCarrier = carriers[0];

            // Render Tabs
            tabContainer.innerHTML = carriers.map(c => `
            <button class="tab-btn ${c === activeCarrier ? 'active' : ''}" onclick="window.setActiveCarrier('${c}')">
                ${c} (${groups[c].length})
            </button>
        `).join('');

            // Filter and Sort rules of active carrier
            let activeRules = [...groups[activeCarrier]];

            if (window.rulesFilters.cidade) {
                const f = window.rulesFilters.cidade.toLowerCase();
                activeRules = activeRules.filter(r => r.cidade.toLowerCase().includes(f));
            }
            if (window.rulesFilters.cidadeRedespacho) {
                const f = window.rulesFilters.cidadeRedespacho.toLowerCase();
                activeRules = activeRules.filter(r => (r.cidadeRedespacho || '').toLowerCase().includes(f));
            }

            activeRules.sort((a, b) => a.cidade.localeCompare(b.cidade));

            body.innerHTML = activeRules.map((r) => {
                const originalIndex = rules.indexOf(r);
                return `
            <tr>
                <td><strong>${r.cidade}</strong></td>
                <td>${r.percentual}%</td>
                <td>${Utils.formatCurrency(r.minimo)}</td>
                <td>${r.limitePeso > 0 ? r.limitePeso + ' Kg' : '-'}</td>
                <td>${r.limitePeso > 0 ? Utils.formatCurrency(r.valorExcedente) : '-'}</td>
                <td>${r.cidadeRedespacho || '-'}</td>
                <td>${r.redespacho || '-'}</td>
                <td>${r.percentualRedespacho > 0 ? r.percentualRedespacho + '%' : '-'}</td>
                <td>${r.minimoRedespacho > 0 ? Utils.formatCurrency(r.minimoRedespacho) : '-'}</td>
                <td>${r.pedagio > 0 ? Utils.formatCurrency(r.pedagio) : '-'}</td>
                <td style="color: var(--primary-color); font-weight: 500;">${r.leadTime || '-'}</td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">${r.horarios || '-'}</td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="window.editRule(${originalIndex})" style="padding: 0.3rem; min-width: auto; background: rgba(0,123,255,0.1); color: #007bff; border: none;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">edit</span>
                    </button>
                    <button class="btn btn-secondary btn-delete-rule" onclick="window.deleteRule(${originalIndex})" style="padding: 0.3rem; min-width: auto; background: rgba(255,0,0,0.1); color: var(--accent-danger); border: none;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">delete_outline</span>
                    </button>

                </td>
            </tr>
        `}).join('');

            // Re-apply column visibility
            if (window.hiddenCols && window.hiddenCols.length > 0) {
                window.hiddenCols.forEach(colIndex => window.toggleCol(colIndex, false));
            }
        };

        // Função para remover UMA transportadora específica (incluindo da nuvem)
        window.removeCarrierCompletely = async (carrierName) => {
            if (!carrierName) return;

            const confirm1 = confirm(`⚠️ REMOVER TRANSPORTADORA: ${carrierName}\n\nIsso vai excluir:\n• A transportadora da lista\n• TODAS as ${rules.filter(r => r.transportadora === carrierName).length} tabelas de frete dela\n\nConfirmar?`);
            if (!confirm1) return;

            try {
                // 1. Remover da lista de transportadoras
                carrierList = carrierList.filter(c => c !== carrierName);

                // 2. Remover todas as regras dessa transportadora
                const beforeCount = rules.length;
                rules = rules.filter(r => r.transportadora !== carrierName);
                const removedCount = beforeCount - rules.length;

                // 3. Marcar timestamps anti-rollback
                Utils.lastWriteTime['freight_tables'] = Date.now();
                Utils.lastWriteTime['carrier_list'] = Date.now();

                // 4. Salvar localmente
                localStorage.setItem('freight_tables', JSON.stringify(rules));
                localStorage.setItem('carrier_list', JSON.stringify(carrierList));

                // 5. Forçar envio para nuvem
                if (Utils.Cloud && Utils.Cloud.tenantId) {
                    await Utils.Cloud.save('freight_tables', rules);
                    await Utils.Cloud.save('carrier_list', carrierList);
                }

                // 6. Re-renderizar
                activeCarrier = carrierList[0] || '';
                renderRulesList();
                renderCarrierConfigs();
                populateCarrierSelect();

                showToast(`🗑️ ${carrierName} removida! ${removedCount} tabelas excluídas.`);

            } catch (error) {
                console.error('Erro ao remover transportadora:', error);
                showToast('❌ Erro: ' + error.message);
            }
        };

        // Função para detectar e mesclar transportadoras duplicadas por acento
        window.fixDuplicateCarriers = async () => {
            const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

            // Agrupar por nome normalizado
            const groups = {};
            carrierList.forEach(c => {
                const key = normalize(c);
                if (!groups[key]) groups[key] = [];
                groups[key].push(c);
            });

            // Encontrar duplicatas
            const duplicates = Object.entries(groups).filter(([key, names]) => names.length > 1);

            if (duplicates.length === 0) {
                showToast('✅ Nenhuma duplicata encontrada!');
                return;
            }

            let message = `🔍 Encontradas ${duplicates.length} duplicatas:\n\n`;
            duplicates.forEach(([key, names]) => {
                message += `• ${names.join(' / ')}\n`;
            });
            message += `\nDeseja mesclar para o primeiro nome de cada grupo?`;

            if (!confirm(message)) return;

            try {
                // Para cada grupo de duplicatas
                for (const [key, names] of duplicates) {
                    const keepName = names[0]; // Manter o primeiro
                    const removeNames = names.slice(1); // Remover os outros

                    // Atualizar regras para usar o nome principal
                    rules.forEach(r => {
                        if (removeNames.includes(r.transportadora)) {
                            r.transportadora = keepName;
                        }
                    });

                    // Remover nomes duplicados da lista
                    removeNames.forEach(n => {
                        const idx = carrierList.indexOf(n);
                        if (idx !== -1) carrierList.splice(idx, 1);
                    });
                }

                // Salvar
                Utils.lastWriteTime['freight_tables'] = Date.now();
                Utils.lastWriteTime['carrier_list'] = Date.now();

                localStorage.setItem('freight_tables', JSON.stringify(rules));
                localStorage.setItem('carrier_list', JSON.stringify(carrierList));

                if (Utils.Cloud && Utils.Cloud.tenantId) {
                    await Utils.Cloud.save('freight_tables', rules);
                    await Utils.Cloud.save('carrier_list', carrierList);
                }

                renderRulesList();
                renderCarrierConfigs();
                populateCarrierSelect();

                showToast(`✅ ${duplicates.length} duplicatas mescladas com sucesso!`);

            } catch (error) {
                console.error('Erro ao mesclar duplicatas:', error);
                showToast('❌ Erro: ' + error.message);
            }
        };

        window.wipeAllFreightTables = async () => {
            if (confirm('PERIGO: Isso vai apagar TODAS as tabelas de frete da nuvem e do computador.\n\nUse isso se as tabelas antigas estiverem "voltando" sozinhas.\n\nConfirmar limpeza total?')) {
                try {
                    // 1. Limpar memória local
                    rules = [];

                    // 2. Marcar timestamp anti-rollback forte (60 segundos)
                    Utils.lastWriteTime['freight_tables'] = Date.now();

                    // 3. Limpar localStorage
                    localStorage.setItem('freight_tables', JSON.stringify([]));

                    // 4. Limpar nuvem - documento principal + TODOS os chunks possíveis
                    if (window.db && Utils.Cloud && Utils.Cloud.tenantId) {
                        const tenantId = Utils.Cloud.tenantId;
                        const legacyStore = window.db.collection('tenants').doc(tenantId).collection('legacy_store');
                        const docRef = legacyStore.doc('freight_tables');

                        // Verificar se há chunks para deletar
                        const doc = await docRef.get();
                        const chunkCount = doc.exists && doc.data().chunkCount ? doc.data().chunkCount : 0;

                        // Deletar até 50 chunks (mais do que o necessário, por segurança)
                        const maxChunks = Math.max(chunkCount, 50);
                        console.log(`🧹 Tentando deletar até ${maxChunks} chunks de freight_tables...`);

                        for (let i = 0; i < maxChunks; i++) {
                            try {
                                await legacyStore.doc(`freight_tables_chunk_${i}`).delete();
                                console.log(`✅ Chunk ${i} deletado`);
                            } catch (e) {
                                // Ignora se não existe
                            }
                        }

                        // Resetar documento principal para vazio e não-chunked
                        await docRef.set({
                            content: '[]',
                            isChunked: false,
                            chunkCount: 0,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        console.log('✅ Nuvem limpa com sucesso!');
                    }

                    // 5. Também limpar carrier_list se não há mais regras
                    if (confirm('Deseja também limpar a lista de transportadoras cadastradas?')) {
                        carrierList = [];
                        localStorage.setItem('carrier_list', JSON.stringify([]));
                        Utils.lastWriteTime['carrier_list'] = Date.now();

                        if (window.db && Utils.Cloud && Utils.Cloud.tenantId) {
                            await window.db.collection('tenants').doc(Utils.Cloud.tenantId).collection('legacy_store').doc('carrier_list').set({
                                content: '[]',
                                isChunked: false,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }

                        renderCarrierConfigs();
                        populateCarrierSelect();
                    }

                    renderRulesList();
                    showToast('💥 Tabelas exterminadas! Nuvem e chunks limpos. Agora você pode importar novos dados.');

                } catch (error) {
                    console.error('Erro na limpeza:', error);
                    showToast('❌ Erro ao limpar: ' + error.message);
                }
            }
        };

        // Função para reconstruir lista de transportadoras a partir das tabelas de frete
        window.rebuildCarrierList = () => {
            const currentRules = Utils.getStorage('freight_tables') || [];
            if (currentRules.length === 0) {
                showToast('❌ Nenhuma tabela de frete encontrada para extrair transportadoras');
                return;
            }

            const extractedCarriers = [...new Set(currentRules.map(r => r.transportadora))].filter(c => c).sort();

            if (extractedCarriers.length === 0) {
                showToast('❌ Nenhuma transportadora encontrada nas tabelas');
                return;
            }

            if (confirm(`Encontradas ${extractedCarriers.length} transportadoras nas tabelas de frete:\n\n${extractedCarriers.join(', ')}\n\nReconstruir a lista?`)) {
                carrierList = extractedCarriers;
                Utils.lastWriteTime['carrier_list'] = Date.now();
                localStorage.setItem('carrier_list', JSON.stringify(carrierList));

                // Forçar envio para nuvem (bypass da proteção de array vazio)
                if (Utils.Cloud && carrierList.length > 0) {
                    Utils.Cloud.save('carrier_list', carrierList);
                }

                renderCarrierConfigs();
                populateCarrierSelect();
                showToast(`✅ Lista reconstruída com ${extractedCarriers.length} transportadoras!`);
            }
        };

        window.renderCarrierConfigs = () => {
            const body = document.getElementById('carrierConfigsBody');
            if (!body) return;

            // Inject Admin Tools if container exists above table, or prepend to table container
            // Vamos hackear e injetar antes da tabela se não existir
            let tools = document.getElementById('admin-danger-tools');
            if (!tools) {
                tools = document.createElement('div');
                tools.id = 'admin-danger-tools';
                tools.style = "margin-bottom: 20px; padding: 15px; background: #fff5f5; border: 1px solid #fc8181; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;";
                tools.innerHTML = `
                    <div>
                        <strong style="color: #c53030;">Problemas com tabelas voltando?</strong>
                        <p style="margin:0; font-size: 0.85rem; color: #c53030;">Clique aqui para zerar a memória da nuvem antes de importar o novo arquivo.</p>
                    </div>
                    <button class="btn btn-danger" onclick="window.wipeAllFreightTables()">
                        🗑️ FORÇAR LIMPEZA DA NUVEM
                    </button>
                `;
                // Tenta inserir antes da tabela wrapper
                const tableRef = body.parentElement;
                if (tableRef && tableRef.parentElement) {
                    tableRef.parentElement.insertBefore(tools, tableRef);
                }
            }

            const carriers = [...carrierList].sort();

            body.innerHTML = carriers.map(c => {
                const config = carrierConfigs[c] || { taxaFixa: 0, gris: 0, icms: 0 };
                const info = carrierInfo[c] || { cnpj: '-', ie: '-', address: '-', city: '-' };
                const safeC = c.replace(/'/g, "\\'");

                return `
            <tr style="border-bottom: 2px solid var(--border-color);">
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${c}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">CNPJ: ${info.cnpj}</div>
                </td>
                <td>
                    <input type="number" step="0.01" value="${config.taxaFixa}" 
                        id="taxaFixa_${c}" class="form-input" style="padding: 0.4rem; max-width: 100px;">
                </td>
                <td>
                    <input type="number" step="0.01" value="${config.gris}" 
                        id="gris_${c}" class="form-input" style="padding: 0.4rem; max-width: 80px;">
                </td>
                <td>
                    <input type="number" step="0.01" value="${config.icms}" 
                        id="icms_${c}" class="form-input" style="padding: 0.4rem; max-width: 80px;">
                </td>
                <td>
                    <input type="number" step="0.01" value="${config.valorVolume || 0}" 
                        id="valorVolume_${c}" class="form-input" style="padding: 0.4rem; max-width: 80px;">
                </td>
                <td style="text-align: right; display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center;">
                    <button class="btn btn-secondary" onclick="window.editCarrier('${safeC}')" style="padding: 0.3rem; min-width: auto; background: rgba(0,123,255,0.1); color: #007bff; border: none;" title="Editar Cadastro">
                        <span class="material-icons-round" style="font-size: 1.2rem;">edit</span>
                    </button>


                    <button class="btn btn-primary" onclick="window.updateCarrierConfig('${safeC}')" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;">
                        SALVAR
                    </button>

                    <button class="btn btn-secondary" onclick="window.removeCarrier('${safeC}')" style="padding: 0.4rem; min-width: auto; background: rgba(255,0,0,0.1); color: var(--accent-danger); border: none;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">delete_outline</span>
                    </button>
                </td>
            </tr>
            `;


            }).join('');
        };

        window.removeCarrier = (name) => {
            const hasRules = rules.some(r => r.transportadora === name);
            if (hasRules) {
                alert(`❌ Não é possível excluir "${name}" porque existem tabelas cadastradas para ela. Remova as tabelas primeiro.`);
                return;
            }

            if (confirm(`Tem certeza que deseja excluir a transportadora "${name}"?`)) {
                carrierList = carrierList.filter(c => c !== name);
                delete carrierConfigs[name];
                Utils.saveRaw('carrier_list', JSON.stringify(carrierList));
                Utils.saveRaw('carrier_configs', JSON.stringify(carrierConfigs));
                renderCarrierConfigs();
                populateCarrierSelect();
                showToast('🗑️ Transportadora removida.');
            }
        };

        window.editCarrier = (name) => {
            // Use fallback if info is missing (legacy carriers)
            const info = carrierInfo[name] || {};

            // Populate Form

            document.getElementById('newCarrierName').value = name;
            document.getElementById('newCarrierName').readOnly = true; // Cannot change ID
            document.getElementById('newCarrierCNPJ').value = info.cnpj || '';
            document.getElementById('newCarrierIE').value = info.ie || '';
            document.getElementById('newCarrierAddress').value = info.address || '';
            document.getElementById('newCarrierCity').value = info.city || '';
            document.getElementById('newCarrierReliability').value = info.reliability || '3';
            document.getElementById('newCarrierIsRedespacho').checked = info.isRedespacho === true;


            // Set Edit Mode
            document.getElementById('editingCarrierMode').value = 'true';

            const btnSubmit = document.getElementById('btnSubmitCarrier');
            btnSubmit.innerHTML = 'ATUALIZAR CADASTRO';
            btnSubmit.classList.remove('btn-primary');
            btnSubmit.classList.add('btn-success');

            document.getElementById('btnCancelEditCarrier').style.display = 'block';

            // Scroll to form
            document.getElementById('formNewCarrier').scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('✏️ Editando cadastro de transportadora');
        };

        window.resetCarrierForm = () => {
            const form = document.getElementById('formNewCarrier');
            form.reset();
            document.getElementById('newCarrierName').readOnly = false;
            document.getElementById('editingCarrierMode').value = 'false';

            const btnSubmit = document.getElementById('btnSubmitCarrier');
            btnSubmit.innerHTML = 'CADASTRAR TRANSPORTADORA';
            btnSubmit.classList.add('btn-primary');
            btnSubmit.classList.remove('btn-success');

            document.getElementById('btnCancelEditCarrier').style.display = 'none';
        }

        function populateCarrierSelect() {

            // Now populates datalist instead of select
            const datalist = document.getElementById('carrierList');
            const input = document.getElementById('ruleCarrier');
            if (datalist) {
                datalist.innerHTML = carrierList.sort().map(c => `<option value="${c}">`).join('');
            }
            populateRedispatchSelect();

            // Add Input Listener for Validation (if not added yet)

            if (input && !input.dataset.validationListener) {
                input.dataset.validationListener = 'true';
                input.addEventListener('input', () => {
                    validateRuleCarrierInput();
                });
                input.addEventListener('blur', () => {
                    validateRuleCarrierInput();
                });
            }
        }

        function populateRedispatchSelect() {
            const select = document.getElementById('ruleRedispatch');
            if (!select) return;

            // Save current selection if exists
            const currentVal = select.value;

            // Filter carriers flagged as redespacho
            const redespachoCarriers = carrierList.filter(c => {
                const info = carrierInfo[c];
                return info && info.isRedespacho === true;
            }).sort();

            let optionsHtml = '<option value="">Sem Redespacho</option>';
            redespachoCarriers.forEach(c => {
                optionsHtml += `<option value="${c}">${c}</option>`;
            });

            select.innerHTML = optionsHtml;
            select.value = currentVal; // Restore selection if possible
        }


        function validateRuleCarrierInput() {
            const input = document.getElementById('ruleCarrier');
            const errorMsg = document.getElementById('carrierErrorAlert');
            if (!input || !errorMsg) return false;

            const val = input.value.trim().toUpperCase();
            if (!val) {
                errorMsg.style.display = 'none';
                input.setCustomValidity('');
                return false;
            }

            if (carrierList.includes(val)) {
                errorMsg.style.display = 'none';
                input.setCustomValidity(''); // Valid
                return true;
            } else {
                errorMsg.style.display = 'block';
                input.setCustomValidity('Transportadora não cadastrada'); // Prevents submit
                return false;
            }
        }

        function populateCityDatalist() {
            const dl = document.getElementById('cityList');
            if (!dl) return;

            // Extract unique cities from existing rules
            const cities = [...new Set(rules.map(r => r.cidade ? r.cidade.trim().toUpperCase() : ''))].filter(c => c).sort();

            dl.innerHTML = cities.map(city => `<option value="${city}">`).join('');
        }

        const formNewCarrier = document.getElementById('formNewCarrier');
        if (formNewCarrier) {
            const btnCancel = document.getElementById('btnCancelEditCarrier');
            if (btnCancel) {
                btnCancel.addEventListener('click', () => {
                    window.resetCarrierForm();
                });
            }

            // Botão de busca por CNPJ
            const btnSearchCNPJ = document.getElementById('btnSearchCarrierCNPJ');
            if (btnSearchCNPJ && window.CNPJLookup) {
                btnSearchCNPJ.addEventListener('click', () => {
                    const cnpjInput = document.getElementById('newCarrierCNPJ');
                    const cnpj = cnpjInput.value.trim();

                    if (cnpj && window.CNPJLookup.isValidFormat(cnpj)) {
                        // Buscar diretamente se já tem CNPJ válido
                        btnSearchCNPJ.disabled = true;
                        btnSearchCNPJ.innerHTML = '⏳';

                        window.CNPJLookup.lookup(cnpj).then(data => {
                            // Preencher formulário
                            document.getElementById('newCarrierName').value = data.nomeFantasia || data.razaoSocial;
                            document.getElementById('newCarrierCNPJ').value = data.cnpj;
                            document.getElementById('newCarrierAddress').value =
                                `${data.logradouro}${data.numero ? ', ' + data.numero : ''}${data.complemento ? ' - ' + data.complemento : ''} - ${data.bairro}`;
                            document.getElementById('newCarrierCity').value = `${data.cidade} - ${data.uf}`;

                            showToast(`✅ Dados carregados: ${data.nomeFantasia || data.razaoSocial}`);
                        }).catch(err => {
                            showToast(`❌ ${err.message}`);
                        }).finally(() => {
                            btnSearchCNPJ.disabled = false;
                            btnSearchCNPJ.innerHTML = '🔍 Buscar';
                        });
                    } else {
                        // Abrir modal de busca
                        window.CNPJLookup.showLookupModal((data) => {
                            // Preencher formulário com dados selecionados
                            document.getElementById('newCarrierName').value = data.nomeFantasia || data.razaoSocial;
                            document.getElementById('newCarrierCNPJ').value = data.cnpj;
                            document.getElementById('newCarrierAddress').value =
                                `${data.logradouro}${data.numero ? ', ' + data.numero : ''}${data.complemento ? ' - ' + data.complemento : ''} - ${data.bairro}`;
                            document.getElementById('newCarrierCity').value = `${data.cidade} - ${data.uf}`;

                            showToast(`✅ Dados preenchidos: ${data.nomeFantasia || data.razaoSocial}`);
                        }, 'Buscar Transportadora por CNPJ');
                    }
                });
            }

            formNewCarrier.addEventListener('submit', (e) => {
                e.preventDefault();
                const isEditing = document.getElementById('editingCarrierMode').value === 'true';

                const nameInput = document.getElementById('newCarrierName');
                const cnpjInput = document.getElementById('newCarrierCNPJ');
                const ieInput = document.getElementById('newCarrierIE');
                const addrInput = document.getElementById('newCarrierAddress');
                const cityInput = document.getElementById('newCarrierCity');
                const isRedespachoInput = document.getElementById('newCarrierIsRedespacho');
                const reliabilityInput = document.getElementById('newCarrierReliability');

                const name = nameInput.value.trim().toUpperCase();

                if (!name) return;

                if (!isEditing && carrierList.includes(name)) {
                    alert('Esta transportadora já está cadastrada.');
                    return;
                }

                if (!isEditing) {
                    carrierList.push(name);
                }

                carrierInfo[name] = {
                    cnpj: cnpjInput.value.trim() || '-',
                    ie: ieInput.value.trim() || '-',
                    address: addrInput.value.trim() || '-',
                    city: cityInput.value.trim() || '-',
                    reliability: parseInt(reliabilityInput.value) || 3,
                    isRedespacho: isRedespachoInput ? isRedespachoInput.checked : false
                };

                Utils.saveRaw('carrier_list', JSON.stringify(carrierList));
                Utils.saveRaw('carrier_info_v2', JSON.stringify(carrierInfo));

                window.resetCarrierForm();
                renderCarrierConfigs();
                populateCarrierSelect();
                showToast(isEditing ? '✅ Cadastro atualizado!' : '✅ Transportadora cadastrada com sucesso!');
            });
        }



        // --- COMPANY DATA LOGIC ---
        window.toggleCompanyEdit = (enable) => {
            const inputs = ['compName', 'compCNPJ', 'compAddress'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !enable;
            });

            const btnEdit = document.getElementById('btnEditCompany');
            const btnSave = document.getElementById('btnSaveCompany');

            if (enable) {
                if (btnEdit) btnEdit.style.display = 'none';
                if (btnSave) btnSave.style.display = 'block';
            } else {
                if (btnEdit) btnEdit.style.display = 'block';
                if (btnSave) btnSave.style.display = 'none';
            }
        };

        const formCompanyData = document.getElementById('formCompanyData');
        if (formCompanyData) {
            // Load initial
            const currentComp = Utils.getStorage('company_data');
            if (currentComp.name) document.getElementById('compName').value = currentComp.name;
            if (currentComp.cnpj) document.getElementById('compCNPJ').value = currentComp.cnpj;
            if (currentComp.address) document.getElementById('compAddress').value = currentComp.address;

            // If data exists, lock it
            if (currentComp.name && currentComp.name.length > 2) {
                window.toggleCompanyEdit(false);
            } else {
                window.toggleCompanyEdit(true);
            }

            formCompanyData.addEventListener('submit', (e) => {
                e.preventDefault();
                const data = {
                    name: document.getElementById('compName').value.trim(),
                    cnpj: document.getElementById('compCNPJ').value.trim(),
                    address: document.getElementById('compAddress').value.trim(),
                };
                Utils.saveRaw('company_data', JSON.stringify(data));
                showToast('✅ Dados da empresa salvos!');
                window.toggleCompanyEdit(false); // Lock again
            });
        }

        window.updateCarrierConfig = (carrier) => {
            const taxaFixa = parseFloat(document.getElementById(`taxaFixa_${carrier}`).value) || 0;
            const gris = parseFloat(document.getElementById(`gris_${carrier}`).value) || 0;
            const icms = parseFloat(document.getElementById(`icms_${carrier}`).value) || 0;
            const valorVolume = parseFloat(document.getElementById(`valorVolume_${carrier}`).value) || 0;

            carrierConfigs[carrier] = { taxaFixa, gris, icms, valorVolume };
            Utils.saveRaw('carrier_configs', JSON.stringify(carrierConfigs));

            // ENSURE carrier is in permanent list (v1.7.1 fix)
            if (!carrierList.includes(carrier)) {
                carrierList.push(carrier);
                carrierList.sort();
                Utils.saveRaw('carrier_list', JSON.stringify(carrierList));
                console.log(`✅ Transportadora ${carrier} adicionada permanentemente à lista`);

                // Save to cloud
                if (Utils.Cloud && Utils.Cloud.save) {
                    Utils.Cloud.save('carrier_list', carrierList);
                }
            }

            showToast(`✅ Configuração de ${carrier} salva!`);
        };


        window.updateRuleFilter = (field, val) => {
            window.rulesFilters[field] = val;
            renderRulesList();
        };

        window.setActiveCarrier = (carrier) => {
            activeCarrier = carrier;
            renderRulesList();
        };

        window.editRule = (index) => {
            const r = rules[index];
            if (!r) {
                console.error('Regra não encontrada para o índice:', index);
                return;
            }

            console.log('Editando regra:', r);

            document.getElementById('editingRuleIndex').value = index;
            document.getElementById('ruleCarrier').value = r.transportadora; // Ensure populates correctly
            // Trigger change event if needed for dependencies, though select usually doesn't need it

            document.getElementById('ruleCity').value = r.cidade;
            document.getElementById('ruleRedispatchCity').value = r.cidadeRedespacho || '';
            document.getElementById('rulePercent').value = r.percentual;

            document.getElementById('ruleMin').value = r.minimo;
            document.getElementById('ruleWeightLimit').value = r.limitePeso;
            document.getElementById('ruleExcess').value = r.valorExcedente;
            document.getElementById('ruleToll').value = r.pedagio || 0;
            document.getElementById('ruleRedispatch').value = r.redespacho || '';
            document.getElementById('ruleRedispatchPercent').value = r.percentualRedespacho || '';
            document.getElementById('ruleRedispatchMin').value = r.minimoRedespacho || '';
            document.getElementById('ruleLeadTime').value = (r.leadTime || '').replace(/^D\+/i, '');


            const hParts = (r.horarios || '').split(' | ');
            document.getElementById('ruleHour1').value = hParts[0] || '';
            document.getElementById('ruleHour2').value = hParts[1] || '';
            document.getElementById('ruleHour3').value = hParts[2] || '';

            // UI Feedback
            const form = document.getElementById('formNewRule');
            const submitBtn = document.getElementById('btnSubmitRule');
            const cancelBtn = document.getElementById('btnCancelEdit');

            submitBtn.innerHTML = '<span class="material-icons-round">save</span> ATUALIZAR TABELA';
            submitBtn.classList.remove('btn-primary');
            submitBtn.classList.add('btn-success'); // Make it green or distinct

            cancelBtn.style.display = 'block';

            form.style.backgroundColor = 'rgba(var(--primary-rgb), 0.05)';
            form.style.border = '1px dashed var(--primary-color)';
            form.style.padding = '1rem';
            form.style.borderRadius = '8px';

            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('✏️ Modo de Edição Ativado');
        };

        const btnCancelEdit = document.getElementById('btnCancelEdit');
        if (btnCancelEdit) {
            btnCancelEdit.addEventListener('click', () => resetRuleForm());
        }

        function resetRuleForm() {
            const form = document.getElementById('formNewRule');
            form.reset();
            document.getElementById('editingRuleIndex').value = '-1';

            const submitBtn = document.getElementById('btnSubmitRule');
            submitBtn.innerHTML = 'SALVAR TABELA';
            submitBtn.classList.add('btn-primary');
            submitBtn.classList.remove('btn-success');

            document.getElementById('btnCancelEdit').style.display = 'none';

            // Reset UI styles
            form.style.backgroundColor = 'transparent';
            form.style.border = 'none';
            form.style.padding = '0';
        }

        window.deleteRule = (index) => {
            if (!confirm('Tem certeza que deseja excluir esta tabela?')) return;
            rules.splice(index, 1);
            Utils.saveRaw('freight_tables', JSON.stringify(rules));
            renderRulesList();
            showToast('🗑️ Tabela removida com sucesso');
        };

        const formNewRule = document.getElementById('formNewRule');
        if (formNewRule) {
            // --- NEW CITY ALERT LISTENER ---
            const inputRuleCity = document.getElementById('ruleCity');
            const alertNewCity = document.getElementById('cityNewAlert');

            if (inputRuleCity && alertNewCity) {
                inputRuleCity.addEventListener('input', () => {
                    const val = inputRuleCity.value.trim().toUpperCase();
                    const dl = document.getElementById('cityList');
                    if (!dl) return;

                    const options = Array.from(dl.options).map(o => o.value);

                    if (val && !options.includes(val)) {
                        alertNewCity.style.display = 'block';
                        alertNewCity.innerHTML = `<span class="material-icons-round" style="font-size: 0.8rem; vertical-align: middle;">add_circle</span> Nova cidade: <strong>${val}</strong> será cadastrada.`;
                    } else {
                        alertNewCity.style.display = 'none';
                    }
                });
            }

            formNewRule.addEventListener('submit', (e) => {
                if (!validateRuleCarrierInput()) {
                    e.preventDefault();
                    document.getElementById('ruleCarrier').focus();
                    showToast('⚠️ Transportadora inválida!');
                    return;
                }
                e.preventDefault();
                const editIdx = parseInt(document.getElementById('editingRuleIndex').value);

                const newRule = {
                    transportadora: window.normalizeText(document.getElementById('ruleCarrier').value).toUpperCase(),
                    cidade: window.normalizeText(document.getElementById('ruleCity').value).toUpperCase(),
                    cidadeRedespacho: window.normalizeText(document.getElementById('ruleRedispatchCity').value).toUpperCase(),
                    percentual: parseFloat(document.getElementById('rulePercent').value),

                    minimo: parseFloat(document.getElementById('ruleMin').value),
                    limitePeso: parseFloat(document.getElementById('ruleWeightLimit').value),
                    valorExcedente: parseFloat(document.getElementById('ruleExcess').value),
                    pedagio: parseFloat(document.getElementById('ruleToll').value) || 0,
                    redespacho: window.normalizeText(document.getElementById('ruleRedispatch').value),
                    percentualRedespacho: parseFloat(document.getElementById('ruleRedispatchPercent').value) || 0,
                    minimoRedespacho: parseFloat(document.getElementById('ruleRedispatchMin').value) || 0,
                    leadTime: (() => {

                        const val = document.getElementById('ruleLeadTime').value.trim();
                        if (!val) return '';
                        return val.toUpperCase().startsWith('D+') ? val.toUpperCase() : 'D+' + val.toUpperCase();
                    })(),
                    horarios: [
                        document.getElementById('ruleHour1').value.trim(),
                        document.getElementById('ruleHour2').value.trim(),
                        document.getElementById('ruleHour3').value.trim()
                    ].filter(h => h !== '').join(' | ')
                };

                if (editIdx > -1) {
                    rules[editIdx] = newRule;
                    showToast('✅ Tabela atualizada com sucesso!');
                } else {
                    rules.unshift(newRule);
                    showToast('✅ Tabela cadastrada com sucesso!');
                }

                // ENSURE carrier is in permanent list (v1.7.1 fix)
                const carrierName = newRule.transportadora;
                if (!carrierList.includes(carrierName)) {
                    carrierList.push(carrierName);
                    carrierList.sort();
                    Utils.saveRaw('carrier_list', JSON.stringify(carrierList));
                    console.log(`✅ Transportadora ${carrierName} adicionada permanentemente à lista (via regra de frete)`);

                    // Save to cloud
                    if (Utils.Cloud && Utils.Cloud.save) {
                        Utils.Cloud.save('carrier_list', carrierList);
                    }
                }

                activeCarrier = newRule.transportadora;
                Utils.saveRaw('freight_tables', JSON.stringify(rules));
                renderRulesList();
                resetRuleForm();
            });
        }

        const btnSyncData = document.getElementById('btnSyncData');
        const fileRulesInput = document.getElementById('fileRules');

        if (btnSyncData && fileRulesInput) {
            // Remover handler antigo e resetar input
            fileRulesInput.value = '';

            // Botão Importar abre o seletor de arquivo
            btnSyncData.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Botão Importar clicado');
                fileRulesInput.value = ''; // Limpar seleção anterior
                fileRulesInput.click();
            };

            // Handler para importação de CSV
            fileRulesInput.onchange = (e) => {
                const file = e.target.files[0];
                console.log('📂 Evento change disparado, arquivo:', file);
                if (!file) {
                    console.log('⚠️ Nenhum arquivo na seleção');
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        let csvContent = event.target.result;

                        // Normalizar quebras de linha
                        csvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

                        const lines = csvContent.split('\n').filter(l => l.trim());
                        console.log('📄 Linhas no arquivo:', lines.length);

                        if (lines.length < 2) {
                            showToast('❌ Arquivo CSV vazio ou inválido (menos de 2 linhas)');
                            return;
                        }

                        // Detectar separador (vírgula, ponto-e-vírgula ou tab)
                        const firstLine = lines[0];
                        let separator = ';';
                        if (firstLine.split(';').length < 3) {
                            if (firstLine.split(',').length >= 3) separator = ',';
                            else if (firstLine.split('\t').length >= 3) separator = '\t';
                        }
                        console.log('🔍 Separador detectado:', separator === '\t' ? 'TAB' : separator);

                        // Normalizar headers (remover acentos, BOM, aspas)
                        const normalizeStr = (s) => s.trim()
                            .toLowerCase()
                            .replace(/"/g, '')
                            .replace(/^\ufeff/, '')
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                        const headers = firstLine.split(separator).map(normalizeStr);
                        console.log('📥 Headers detectados:', headers);

                        // Função para encontrar coluna
                        const findCol = (...patterns) => {
                            for (const pattern of patterns) {
                                const idx = headers.findIndex(h => h.includes(pattern));
                                if (idx !== -1) return idx;
                            }
                            return -1;
                        };

                        // Mapear índices das colunas (baseado no formato do Excel do usuário)
                        // Headers da planilha: Transportadora, Cidade, Percentual, Mínimo, Limite Peso, Valor Excedente, 
                        // Pedágio, Cidade Redespacho, Transp. Redespacho, % Red., Min. Redesp., Prazo, Horários
                        const colMap = {
                            transportadora: findCol('transportadora', 'transp'),
                            cidade: headers.findIndex(h => h.includes('cidade') && !h.includes('redesp') && !h.includes('bairro')),
                            percentual: findCol('percentual', 'percentua', '% frete', 'perc'),
                            minimo: headers.findIndex(h => h.includes('minimo') && !h.includes('redesp') && !h.includes('rede')),
                            limitePeso: findCol('limite peso', 'limite', 'peso'),
                            valorExcedente: findCol('valor exce', 'excedente', 'valor kg', 'vlr kg'),
                            // Pedágio/Taxa Fixa - coluna G
                            pedagio: findCol('pedagio', 'taxa fixa', 'taxa'),
                            // Cidade Redespacho - coluna H
                            cidadeRedespacho: headers.findIndex(h => h.includes('cidade') && h.includes('redesp')),
                            // Transp. Redespacho - coluna I (busca por "transp" + "redesp")
                            redespacho: headers.findIndex(h => h.includes('transp') && h.includes('redesp')),
                            // % Redespacho - coluna J
                            percentualRedespacho: findCol('% red', '%red', '% redesp'),
                            // Min. Redespacho - coluna K
                            minimoRedespacho: findCol('min. rede', 'min rede', 'min. redesp', 'min redesp'),
                            // Prazo - coluna L
                            leadTime: findCol('prazo', 'lead', 'd+'),
                            // Horários - coluna M
                            horarios: findCol('horarios', 'horario')
                        };

                        console.log('📊 Mapeamento de colunas:', colMap);

                        // Validar colunas essenciais
                        if (colMap.transportadora === -1 || colMap.cidade === -1) {
                            showToast('❌ Colunas "Transportadora" e/ou "Cidade" não encontradas no CSV');
                            console.error('Headers encontrados:', headers);
                            console.log('Primeira linha de dados:', lines[1]);
                            return;
                        }

                        const parseNum = (val) => {
                            if (!val || val === undefined) return 0;
                            const str = String(val).trim();
                            return parseFloat(str.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
                        };

                        // Função para remover acentos e caracteres corrompidos
                        const removeAccents = (str) => {
                            if (!str) return '';

                            // Mapa de substituição para caracteres acentuados (português)
                            const accentMap = {
                                'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
                                'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
                                'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
                                'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
                                'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
                                'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
                                'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
                                'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
                                'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
                                'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
                                'ç': 'c', 'Ç': 'C',
                                'ñ': 'n', 'Ñ': 'N'
                            };

                            // Primeiro aplica o mapa de substituição
                            let result = '';
                            for (let char of str) {
                                result += accentMap[char] || char;
                            }

                            // Depois tenta normalizar acentos que não estavam no mapa
                            result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                            // Remove caracteres não-imprimíveis e corrompidos, mas mantém espaços e pontuação básica
                            result = result.replace(/[^\x20-\x7E]/g, '');

                            return result.trim();
                        };

                        const getValue = (values, idx) => {
                            if (idx === -1 || idx >= values.length) return '';
                            let val = (values[idx] || '').trim().replace(/"/g, '');
                            // Remover acentos e caracteres corrompidos para padronizar
                            return removeAccents(val);
                        };

                        const newRules = [];
                        const newCarriers = new Set();

                        let skippedRows = 0;
                        for (let i = 1; i < lines.length; i++) {
                            const values = lines[i].split(separator);

                            const transportadora = getValue(values, colMap.transportadora).toUpperCase();
                            const cidade = getValue(values, colMap.cidade).toUpperCase();

                            if (!transportadora || !cidade) {
                                skippedRows++;
                                continue;
                            }

                            newCarriers.add(transportadora);

                            newRules.push({
                                transportadora,
                                cidade,
                                percentual: parseNum(getValue(values, colMap.percentual)),
                                minimo: parseNum(getValue(values, colMap.minimo)),
                                limitePeso: parseNum(getValue(values, colMap.limitePeso)),
                                valorExcedente: parseNum(getValue(values, colMap.valorExcedente)),
                                redespacho: getValue(values, colMap.redespacho),
                                horarios: getValue(values, colMap.horarios),
                                leadTime: getValue(values, colMap.leadTime),
                                percentualRedespacho: parseNum(getValue(values, colMap.percentualRedespacho)),
                                minimoRedespacho: parseNum(getValue(values, colMap.minimoRedespacho)),
                                pedagio: parseNum(getValue(values, colMap.pedagio)),
                                cidadeRedespacho: getValue(values, colMap.cidadeRedespacho)
                            });
                        }

                        console.log(`✅ Processadas ${newRules.length} regras, ${skippedRows} linhas ignoradas`);

                        if (newRules.length === 0) {
                            showToast('❌ Nenhuma tabela válida encontrada no CSV. Verifique o formato.');
                            console.log('Primeira linha de dados:', lines[1]);
                            return;
                        }

                        // Confirmar importação (sem opção de substituir)
                        const existingCount = rules.length;

                        const confirmMsg = existingCount > 0
                            ? `📦 Encontradas ${newRules.length} tabelas de ${newCarriers.size} transportadoras.\n\n` +
                            `Você já tem ${existingCount} tabelas cadastradas.\n\n` +
                            `A importação irá:\n` +
                            `• ADICIONAR novas cidades/transportadoras\n` +
                            `• ATUALIZAR valores de cidades já existentes\n` +
                            `• NÃO EXCLUIR nada (exclusão é manual)\n\n` +
                            `Deseja continuar?`
                            : `Importar ${newRules.length} tabelas de ${newCarriers.size} transportadoras?`;

                        if (!confirm(confirmMsg)) {
                            showToast('❌ Importação cancelada');
                            return;
                        }

                        // Marcar timestamp anti-rollback
                        Utils.lastWriteTime['freight_tables'] = Date.now();
                        Utils.lastWriteTime['carrier_list'] = Date.now();

                        // Sempre usar modo ADICIONAR/ATUALIZAR (nunca substitui tudo)
                        let addedCount = 0;
                        let updatedCount = 0;

                        newRules.forEach(newRule => {
                            // Verificar se já existe uma regra para mesma cidade + transportadora + cidade de redespacho
                            // Isso permite múltiplas linhas para a mesma cidade com diferentes destinos de redespacho
                            const existingIndex = rules.findIndex(r =>
                                r.cidade === newRule.cidade &&
                                r.transportadora === newRule.transportadora &&
                                (r.cidadeRedespacho || '') === (newRule.cidadeRedespacho || '')
                            );

                            if (existingIndex !== -1) {
                                // Atualizar existente
                                rules[existingIndex] = newRule;
                                updatedCount++;
                            } else {
                                // Adicionar nova
                                rules.push(newRule);
                                addedCount++;
                            }
                        });

                        showToast(`✅ Importação concluída: ${addedCount} adicionadas, ${updatedCount} atualizadas`);

                        // Adicionar novas transportadoras à lista
                        newCarriers.forEach(c => {
                            if (!carrierList.includes(c)) {
                                carrierList.push(c);
                            }
                        });
                        carrierList.sort();

                        // Salvar tudo
                        Utils.saveRaw('freight_tables', JSON.stringify(rules));
                        Utils.saveRaw('carrier_list', JSON.stringify(carrierList));

                        activeCarrier = '';
                        renderRulesList();
                        renderCarrierConfigs();
                        populateCarrierSelect();

                    } catch (err) {
                        console.error('Erro ao importar CSV:', err);
                        showToast('❌ Erro ao processar CSV: ' + err.message);
                    }
                };

                reader.readAsText(file, 'windows-1252'); // Codificação do Excel brasileiro
            };

            // Função auxiliar para tentar diferentes codificações
            const tryReadWithEncoding = (file, encodings, callback) => {
                let currentIndex = 0;

                const tryNext = () => {
                    if (currentIndex >= encodings.length) {
                        showToast('❌ Não foi possível ler o arquivo com nenhuma codificação');
                        return;
                    }

                    const encoding = encodings[currentIndex];
                    const reader = new FileReader();

                    reader.onload = (event) => {
                        const content = event.target.result;
                        // Verificar se há muitos caracteres corrompidos (indicador de codificação errada)
                        const corruptedChars = (content.match(/[\uFFFD�]/g) || []).length;
                        const totalChars = content.length;

                        if (corruptedChars > totalChars * 0.01 && currentIndex < encodings.length - 1) {
                            // Mais de 1% de caracteres corrompidos, tentar próxima codificação
                            console.log(`⚠️ Codificação ${encoding} produziu ${corruptedChars} caracteres corrompidos, tentando próxima...`);
                            currentIndex++;
                            tryNext();
                        } else {
                            console.log(`✅ Usando codificação: ${encoding}`);
                            callback(content);
                        }
                    };

                    reader.onerror = () => {
                        currentIndex++;
                        tryNext();
                    };

                    reader.readAsText(file, encoding);
                };

                tryNext();
            };
        }

        // --- EXPORTAR TABELAS ---
        const btnExportTables = document.getElementById('btnExportTables');
        if (btnExportTables) {
            btnExportTables.addEventListener('click', () => {
                if (rules.length === 0) { showToast('❌ Nenhuma tabela para exportar.'); return; }

                const headers = ['Transportadora', 'Cidade', 'Percentual', 'Minimo', 'Limite Peso', 'Valor Excedente', 'Redespacho', 'Horarios', 'LeadTime', '% Redespacho', 'Pedagio'];
                let csv = headers.join(';') + '\n';

                rules.forEach(r => {
                    const row = [
                        r.transportadora,
                        r.cidade,
                        String(r.percentual).replace('.', ','),
                        String(r.minimo).replace('.', ','),
                        String(r.limitePeso).replace('.', ','),
                        String(r.valorExcedente).replace('.', ','),
                        r.redespacho || '',
                        r.horarios || '',
                        r.leadTime || '',
                        String(r.percentualRedespacho || 0).replace('.', ','),
                        String(r.pedagio || 0).replace('.', ',')
                    ];
                    csv += row.join(';') + '\n';
                });

                const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `tabelas_frete_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                showToast('📂 Tabelas exportadas!');
            });
        }

        // --- TOGGLE COLUMNS ---
        window.toggleCol = (colIndex, show) => {
            const table = document.getElementById('tableRules');
            if (!table) return;

            // Hide Header
            const th = table.querySelector(`thead tr th:nth-child(${colIndex})`);
            if (th) th.style.display = show ? 'table-cell' : 'none';

            // Hide/Show Cells in Body (we need to re-render or iterate)
            // Since we re-render constantly, better to store this pref or iterate current rows
            // For simplicity, let's iterate current table rows
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const td = row.querySelector(`td:nth-child(${colIndex})`);
                if (td) td.style.display = show ? 'table-cell' : 'none';
            });

            // Store preference properly if we want persistence, 
            // but for now, we just rely on the immediate action.
            // NOTE: If renderRulesList is called again, these changes are lost!
            // We need to inject this logic into renderRulesList or save state.
            if (!window.hiddenCols) window.hiddenCols = [];
            if (!show) {
                if (!window.hiddenCols.includes(colIndex)) window.hiddenCols.push(colIndex);
            } else {
                window.hiddenCols = window.hiddenCols.filter(c => c !== colIndex);
            }
        };

        const btnExportCSV = document.getElementById('btnExportCSV');
        if (btnExportCSV) {
            btnExportCSV.addEventListener('click', () => {
                const data = Utils.getStorage('dispatches');
                if (data.length === 0) {
                    showToast('❌ Nenhum despacho para exportar.');
                    return;
                }

                // Define columns for export
                const cols = ['date', 'invoice', 'client', 'city', 'carrier', 'nfValue', 'total'];
                const headers = ['Data', 'Nota Fiscal', 'Cliente', 'Cidade', 'Transportadora', 'Valor NF', 'Frete'];

                let csv = headers.join(';') + '\n';


                data.forEach(item => {
                    const row = [
                        new Date(item.date).toLocaleDateString(),
                        item.invoice,
                        item.client,
                        item.city,
                        item.carrier,
                        item.nfValue.toString().replace('.', ','),
                        item.total.toString().replace('.', ',')
                    ];
                    csv += row.join(';') + '\n';
                });

                const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `despachos_parreiralog_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
                showToast('📂 Exportação concluída!');
            });
        }


        const columnMap = {
            status: 'Status',
            date: 'Data', invoice: 'NF',
            client: 'Cliente', city: 'Cidade',
            neighborhood: 'Bairro', carrier: 'Transp.', percentual: '%',
            minimo: 'Mín.', redespacho: 'Redesp.', horarios: 'Hora',
            leadTime: 'Prazo',
            nfValue: 'Vlr NF', weight: 'Peso', volume: 'Vol.', total: 'Frete',
            isComplement: 'Comp.', mainInvoice: 'Ref.',
            createdTime: 'Hr Cot.', dispatchedTime: 'Hr Desp.',
            actions: 'Ações'
        };


        // State for filters
        window.dispatchFilters = {};

        window.renderAppHistory = () => {
            let list = Utils.getStorage('dispatches');
            const container = document.getElementById('dispatchListContainer');
            if (!container) {
                console.error('dispatchListContainer não encontrado no DOM');
                return;
            }
            container.innerHTML = '';


            if (!list || list.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 3rem;">Nenhum despacho registrado ainda.</div>';
                return;
            }

            const checkboxes = document.querySelectorAll('#columnFilterBody input[type="checkbox"]');
            checkboxes.forEach(cb => {
                if (!cb.dataset.listener) {
                    cb.addEventListener('change', () => window.renderAppHistory());
                    cb.dataset.listener = 'true';
                }
            });
            const activeCols = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.col);

            // Apply filters
            Object.keys(window.dispatchFilters).forEach(key => {
                const val = window.dispatchFilters[key].toLowerCase();
                if (val) {
                    list = list.filter(item => {
                        let fieldVal = String(item[key] || '').toLowerCase();
                        if (key === 'date') fieldVal = new Date(item.date).toLocaleDateString();
                        return fieldVal.includes(val);
                    });
                }
            });

            list.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Group by Month
            const monthlyGroups = {};
            list.forEach(item => {
                const date = new Date(item.date);
                const monthKey = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                if (!monthlyGroups[monthKey]) monthlyGroups[monthKey] = [];
                monthlyGroups[monthKey].push(item);
            });

            Object.keys(monthlyGroups).forEach(month => {
                const mItems = monthlyGroups[month];
                const mTotal = mItems.reduce((acc, curr) => acc + curr.total, 0);

                const mDiv = document.createElement('div');
                mDiv.className = 'dispatch-month-group';

                // Header for Month
                const mHeader = document.createElement('div');
                mHeader.className = 'month-header';
                mHeader.innerHTML = `
                <span class="month-title">${month.charAt(0).toUpperCase() + month.slice(1)}</span>
                <span class="month-total">Total Mensal: ${Utils.formatCurrency(mTotal)}</span>
            `;
                mDiv.appendChild(mHeader);

                const mContent = document.createElement('div');
                mContent.className = 'month-content';

                // Group by Day within Month
                const dailyGroups = {};
                const todayKey = new Date().toLocaleDateString('pt-BR'); // key for today's date
                mItems.forEach(item => {
                    const dayKey = new Date(item.date).toLocaleDateString('pt-BR');
                    if (!dailyGroups[dayKey]) dailyGroups[dayKey] = [];
                    dailyGroups[dayKey].push(item);
                });

                Object.keys(dailyGroups).forEach(day => {
                    const dItems = dailyGroups[day];
                    const dTotal = dItems.reduce((acc, curr) => acc + curr.total, 0);

                    const dDiv = document.createElement('div');
                    dDiv.className = 'day-group';

                    const dHeader = document.createElement('div');
                    dHeader.className = 'day-header';
                    dHeader.onclick = () => {
                        const tbl = dDiv.querySelector('.day-table-container');
                        tbl.hidden = !tbl.hidden;
                    };
                    dHeader.innerHTML = `
                    <div class="day-title">${day} (${dItems.length} despachos)</div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--accent-success);">Subtotal: ${Utils.formatCurrency(dTotal)}</span>
                    </div>
                `;
                    dDiv.appendChild(dHeader);

                    const dTableContainer = document.createElement('div');
                    dTableContainer.className = 'day-table-container';
                    dTableContainer.style.overflowX = 'auto';
                    dTableContainer.hidden = day !== todayKey; // open today, hide others
                    dTableContainer.innerHTML = `
                    <table class="dispatch-table">
                        <thead>
                            <tr>
                                ${activeCols.map(col => {
                        let style = 'padding: 8px 5px;'; // Reduced padding
                        // Custom Column Widths - Optimized for 100% zoom
                        if (col === 'status') style += 'width: 40px; min-width: 40px; text-align: center;';
                        else if (col === 'invoice') style += 'width: 55px; min-width: 50px;';
                        else if (col === 'leadTime') style += 'width: 50px; min-width: 45px; text-align: center;';
                        else if (col === 'total') style += 'width: 75px; min-width: 70px; text-align: right;';
                        else if (col === 'client') style += 'width: 180px; min-width: 140px; max-width: 220px;';
                        else if (col === 'city') style += 'min-width: 75px; width: 85px;';
                        else if (col === 'carrier') style += 'min-width: 75px; width: 85px; max-width: 100px;';
                        else if (col === 'createdTime' || col === 'dispatchedTime') style += 'width: 50px; min-width: 45px; text-align: center;';
                        else if (col === 'actions') style += 'width: 120px; min-width: 115px; text-align: center;';


                        return `
                                    <th style="${style}">
                                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">${columnMap[col]}</div>
                                        <input type="text" class="filter-input" placeholder="🔎" 
                                            value="${window.dispatchFilters[col] || ''}"
                                            onkeyup="window.updateDispatchFilter('${col}', this.value)"
                                            style="width: 100%;">
                                    </th>
                                `}).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${dItems.map(d => {
                            try {
                                return `<tr>${activeCols.map(col => {
                                    if (col === 'status') {
                                        const s = d.status || 'Pendente Despacho';
                                        let icon = 'schedule', cls = 'status-pending', title = 'Pendente Despacho';

                                        if (s === 'Despachado') {
                                            icon = 'check_circle';
                                            cls = 'status-shipped';
                                            title = 'Despachado';
                                        } else if (s === 'Cancelado') {
                                            icon = 'cancel';
                                            cls = 'status-cancelled';
                                            title = 'Cancelado';
                                        } else if (s === 'Pendente Despacho') {
                                            // Check Time Logic
                                            // Lógica de Tempo Revisada
                                            if (d.horarios && d.horarios !== '-') {
                                                // Expecting format like "14:00" or descriptions containing times
                                                const now = new Date();

                                                // Check Past Dates FIRST
                                                const dDateStart = new Date(d.date); dDateStart.setHours(0, 0, 0, 0);
                                                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                                                if (dDateStart < todayStart) {
                                                    icon = 'alarm_off';
                                                    cls = 'status-late';
                                                    title = `Atrasado (Data Passada)`;
                                                }

                                                const timeMatch = d.horarios.match(/(\d{2}):(\d{2})/);
                                                if (timeMatch) {
                                                    const [_, h, m] = timeMatch;
                                                    const deadline = new Date();
                                                    deadline.setHours(parseInt(h), parseInt(m), 0);

                                                    // Only consider it "Late" if it's the SAME DAY and NOW > DEADLINE
                                                    // Assuming dispatch creation date is delivery date logic or similar
                                                    const dispatchDate = new Date(d.date);
                                                    const isToday = dispatchDate.toDateString() === now.toDateString();

                                                    if (isToday && now > deadline) {
                                                        icon = 'alarm_off';
                                                        cls = 'status-late'; // Will need CSS
                                                        title = `Atrasado (Limite: ${h}:${m})`;
                                                        // We don't change d.status in DB, just visual representation
                                                    }
                                                }
                                            }
                                        }
                                        return `<td style="text-align: center; width: 40px;" title="${title}"><span class="material-icons-round ${cls}" style="font-size: 1.2rem; vertical-align: middle; color: ${cls === 'status-late' ? 'var(--accent-danger)' : ''}">${icon}</span></td>`;
                                    }
                                    let val = d[col] || '-';
                                    if (col === 'date') val = new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                                    if (['total', 'nfValue', 'minimo'].includes(col)) val = Utils.formatCurrency(val);
                                    if (col === 'percentual' && val !== '-') val = val + '%';
                                    if (col === 'isComplement') val = val === true ? 'Sim' : 'Não';
                                    if (col === 'volume') val = d.volume || 1;
                                    // Time Columns

                                    if (col === 'createdTime') {
                                        val = d.date ? new Date(d.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                                    }
                                    if (col === 'dispatchedTime') {
                                        val = d.dispatchedAt ? new Date(d.dispatchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                                    }
                                    if (col === 'actions') {
                                        return `<td style="text-align: center; width: 120px; min-width: 115px;">
                                            <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
                                                ${d.status === 'Despachado' ? `
                                                <button class="btn btn-secondary whatsapp-btn" onclick="window.sendWhatsApp(${d.id}); this.classList.add('sent')" title="WhatsApp">
                                                    <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                                                </button>
                                                <button class="btn btn-secondary btn-return-dashboard" onclick="window.returnToDashboard(${d.id})" title="Voltar para Painel (Estornar)" style="padding: 0.3rem; min-width: auto; color: var(--primary-color); border: 1px solid var(--border-color);">
                                                    <span class="material-icons-round" style="font-size: 1.1rem;">replay</span>
                                                </button>` : ''}
                                                <button class="btn btn-secondary btn-delete-dispatch" onclick="window.removeDispatch(${d.id})" style="padding: 0.3rem; min-width: auto; background: rgba(255,0,0,0.1); color: var(--accent-danger); border: none;" title="Excluir Permanentemente">
                                                    <span class="material-icons-round" style="font-size: 1.1rem;">delete_outline</span>
                                                </button>
                                            </div>
                                        </td>`;
                                    }


                                    let style = '';
                                    if (col === 'total') style += 'font-weight:600;color:var(--accent-success); text-align: right;';
                                    else if (col === 'invoice') style += 'font-weight:600;';
                                    else if (col === 'capturedBy') style += 'font-size: 0.75rem; color: var(--text-secondary);';

                                    let displayVal = val;
                                    // Widths matching Header - Optimized for 100% zoom
                                    if (col === 'invoice') style += 'width: 55px; min-width: 50px;';
                                    else if (col === 'leadTime') style += 'width: 50px; min-width: 45px; text-align: center;';
                                    else if (col === 'total') style += 'width: 75px; min-width: 70px;';
                                    else if (col === 'city') {
                                        style += 'min-width: 75px; width: 85px; max-width: 90px;';
                                        displayVal = `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${val}</div>`;
                                    }
                                    else if (col === 'carrier') {
                                        style += 'min-width: 75px; width: 85px; max-width: 100px;';
                                        displayVal = `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${val}</div>`;
                                    }
                                    else if (col === 'client') {
                                        style += 'max-width: 220px; min-width: 140px; width: 180px;';
                                        displayVal = `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${val}</div>`;
                                    }
                                    else if (col === 'createdTime' || col === 'dispatchedTime') style += 'width: 50px; min-width: 45px; text-align: center;';

                                    return `<td style="${style}" title="${String(val).replace(/"/g, '&quot;')}">${displayVal}</td>`;
                                }).join('')}</tr>`;
                            } catch (err) {
                                console.error('Row render error', err);
                                return '';
                            }
                        }).join('')}
                        </tbody>
                    </table>
                `;
                    dDiv.appendChild(dTableContainer);
                    mContent.appendChild(dDiv);
                });

                mDiv.appendChild(mContent);
                container.appendChild(mDiv);
            });
        };

        window.updateDispatchFilter = (col, val) => {
            window.dispatchFilters[col] = val;
            // Debounce render
            if (window.filterTimeout) clearTimeout(window.filterTimeout);
            window.filterTimeout = setTimeout(() => window.renderAppHistory(), 400);
        };

        // ==========================================
        // CONFERÊNCIA DE FATURA - INVOICE CHECK
        // ==========================================

        // State for invoice check
        window.invoiceSelectedNFs = new Set();
        window.invoiceCurrentCarrier = '';

        // Initialize invoice section when shown
        window.initInvoiceSection = () => {
            const select = document.getElementById('invoiceCarrierFilter');
            if (!select) return;

            // Get unique carriers from dispatched items (status = Despachado, not Pago)
            const dispatches = Utils.getStorage('dispatches') || [];
            const carriers = [...new Set(dispatches
                .filter(d => d.status === 'Despachado' && d.carrier)
                .map(d => d.carrier.toUpperCase().trim())
            )].sort();

            select.innerHTML = '<option value="">-- Selecione --</option>';
            carriers.forEach(carrier => {
                select.innerHTML += `<option value="${carrier}">${carrier}</option>`;
            });

            // Clear state
            window.invoiceSelectedNFs.clear();
            window.invoiceCurrentCarrier = '';
            window.updateInvoiceComparison();
        };

        // Filter NFs by carrier
        window.filterInvoiceByCarrier = (carrier) => {
            window.invoiceCurrentCarrier = carrier;
            window.invoiceSelectedNFs.clear();

            const tbody = document.getElementById('invoiceNFsBody');
            if (!tbody) return;

            if (!carrier) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Selecione uma transportadora para ver as NFs disponíveis.</td></tr>`;
                document.getElementById('invoiceNFsCount').textContent = '0 notas';
                window.updateInvoiceComparison();
                return;
            }

            // Get dispatched NFs for this carrier
            const dispatches = Utils.getStorage('dispatches') || [];
            const filtered = dispatches.filter(d =>
                d.status === 'Despachado' &&
                d.carrier &&
                d.carrier.toUpperCase().trim() === carrier.toUpperCase().trim()
            );

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma NF despachada encontrada para esta transportadora.</td></tr>`;
                document.getElementById('invoiceNFsCount').textContent = '0 notas';
                window.updateInvoiceComparison();
                return;
            }

            // Sort by dispatch date (most recent first)
            filtered.sort((a, b) => new Date(b.dispatchedAt || b.date) - new Date(a.dispatchedAt || a.date));

            tbody.innerHTML = filtered.map(d => {
                const dispatchDate = d.dispatchedAt ? new Date(d.dispatchedAt) : new Date(d.date);
                return `
                    <tr data-id="${d.id}">
                        <td style="text-align: center;">
                            <input type="checkbox" class="invoice-nf-checkbox" data-id="${d.id}" data-value="${d.total || 0}" onchange="window.toggleInvoiceNF(${d.id}, this.checked, ${d.total || 0})">
                        </td>
                        <td style="font-weight: 600;">${d.invoice || '-'}</td>
                        <td><div style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.client}">${d.client || '-'}</div></td>
                        <td>${d.city || '-'}</td>
                        <td>${dispatchDate.toLocaleDateString('pt-BR')}</td>
                        <td style="text-align: right; font-weight: 600; color: var(--accent-success);">${Utils.formatCurrency(d.total || 0)}</td>
                    </tr>
                `;
            }).join('');

            document.getElementById('invoiceNFsCount').textContent = `${filtered.length} notas`;
            window.updateInvoiceComparison();
        };

        // Toggle single NF selection
        window.toggleInvoiceNF = (id, checked, value) => {
            if (checked) {
                window.invoiceSelectedNFs.add(id);
            } else {
                window.invoiceSelectedNFs.delete(id);
            }
            window.updateInvoiceComparison();
        };

        // Select/deselect all NFs
        window.selectAllInvoiceNFs = (selectAll) => {
            const checkboxes = document.querySelectorAll('.invoice-nf-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = selectAll;
                const id = parseInt(cb.dataset.id);
                if (selectAll) {
                    window.invoiceSelectedNFs.add(id);
                } else {
                    window.invoiceSelectedNFs.delete(id);
                }
            });

            const selectAllCb = document.getElementById('invoiceSelectAll');
            if (selectAllCb) selectAllCb.checked = selectAll;

            window.updateInvoiceComparison();
        };

        // Update comparison display
        window.updateInvoiceComparison = () => {
            const dispatches = Utils.getStorage('dispatches') || [];

            // Calculate selected total
            let selectedTotal = 0;
            window.invoiceSelectedNFs.forEach(id => {
                const d = dispatches.find(x => x.id === id);
                if (d) selectedTotal += (d.total || 0);
            });

            // Parse invoice value
            const invoiceInput = document.getElementById('invoiceValue');
            let invoiceValue = 0;
            if (invoiceInput && invoiceInput.value) {
                invoiceValue = parseFloat(invoiceInput.value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            }

            // Update displays
            document.getElementById('invoiceSelectedCount').textContent = window.invoiceSelectedNFs.size;
            document.getElementById('invoiceCalculatedTotal').textContent = Utils.formatCurrency(selectedTotal);
            document.getElementById('invoiceValueDisplay').textContent = Utils.formatCurrency(invoiceValue);

            // Calculate difference
            const difference = selectedTotal - invoiceValue;
            const diffEl = document.getElementById('invoiceDifference');
            const diffCard = document.getElementById('invoiceDifferenceCard');

            if (difference === 0 && window.invoiceSelectedNFs.size > 0 && invoiceValue > 0) {
                diffEl.textContent = '✅ OK';
                diffEl.style.color = '#10b981';
                diffCard.style.background = 'rgba(16, 185, 129, 0.1)';
                diffCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            } else if (difference !== 0 && window.invoiceSelectedNFs.size > 0 && invoiceValue > 0) {
                const sign = difference > 0 ? '+' : '';
                diffEl.textContent = `${sign}${Utils.formatCurrency(difference)}`;
                diffEl.style.color = '#ef4444';
                diffCard.style.background = 'rgba(239, 68, 68, 0.1)';
                diffCard.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            } else {
                diffEl.textContent = 'R$ 0,00';
                diffEl.style.color = 'var(--text-secondary)';
                diffCard.style.background = 'rgba(107, 114, 128, 0.1)';
                diffCard.style.borderColor = 'rgba(107, 114, 128, 0.3)';
            }

            // Enable/disable confirm button
            const btnConfirm = document.getElementById('btnConfirmInvoice');
            if (btnConfirm) {
                btnConfirm.disabled = !(window.invoiceSelectedNFs.size > 0 && invoiceValue > 0);
            }
        };

        // Clear form
        window.clearInvoiceForm = () => {
            document.getElementById('invoiceCarrierFilter').value = '';
            document.getElementById('invoiceValue').value = '';
            document.getElementById('invoiceRef').value = '';
            window.invoiceSelectedNFs.clear();
            window.invoiceCurrentCarrier = '';
            window.filterInvoiceByCarrier('');
        };

        // Confirm payment
        window.confirmInvoicePayment = () => {
            const dispatches = Utils.getStorage('dispatches') || [];

            // Calculate totals
            let selectedTotal = 0;
            window.invoiceSelectedNFs.forEach(id => {
                const d = dispatches.find(x => x.id === id);
                if (d) selectedTotal += (d.total || 0);
            });

            const invoiceValue = parseFloat(document.getElementById('invoiceValue').value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            const difference = selectedTotal - invoiceValue;

            // If difference exists, require supervisor password
            if (difference !== 0) {
                // Show supervisor modal
                const modal = document.getElementById('invoiceSupervisorModal');
                const details = document.getElementById('invoiceDiffDetails');
                details.innerHTML = `
                    <div style="font-size: 0.9rem;">
                        <div>Total NFs: <strong>${Utils.formatCurrency(selectedTotal)}</strong></div>
                        <div>Valor Fatura: <strong>${Utils.formatCurrency(invoiceValue)}</strong></div>
                        <div style="margin-top: 0.5rem; font-size: 1.2rem; color: #ef4444;">
                            Diferença: <strong>${difference > 0 ? '+' : ''}${Utils.formatCurrency(difference)}</strong>
                        </div>
                    </div>
                `;
                document.getElementById('invoiceSupervisorPass').value = '';
                document.getElementById('invoiceJustification').value = '';
                modal.style.display = 'flex';
                return;
            }

            // No difference - proceed directly
            window.processInvoicePayment();
        };

        // Force payment with supervisor password
        window.forceInvoicePayment = () => {
            const pass = document.getElementById('invoiceSupervisorPass').value;
            const justification = document.getElementById('invoiceJustification').value.trim();

            if (!justification) {
                showToast('Por favor, informe a justificativa.', 'error');
                return;
            }

            // Verify supervisor password - CORRIGIDO: usar app_users (não users)
            const users = Utils.getStorage('app_users') || [];
            console.log('🔐 [Invoice] Verificando senha de supervisor. Usuários:', users.length);
            const supervisor = users.find(u => u.role === 'supervisor' && u.pass === pass);

            if (!supervisor) {
                showToast('Senha de supervisor inválida.', 'error');
                console.log('❌ [Invoice] Supervisor não encontrado ou senha incorreta');
                return;
            }

            console.log('✅ [Invoice] Supervisor autenticado:', supervisor.name);
            document.getElementById('invoiceSupervisorModal').style.display = 'none';
            window.processInvoicePayment(justification, supervisor.name);
        };

        // Process the payment (mark NFs as paid)
        window.processInvoicePayment = (justification = '', authorizedBy = '') => {
            console.log('💳 [Invoice] Iniciando processamento de pagamento...');
            console.log('💳 [Invoice] NFs selecionadas:', [...window.invoiceSelectedNFs]);

            const dispatches = Utils.getStorage('dispatches') || [];
            console.log('💳 [Invoice] Total de despachos carregados:', dispatches.length);

            const invoiceRef = document.getElementById('invoiceRef').value.trim() || 'N/A';
            const invoiceValue = parseFloat(document.getElementById('invoiceValue').value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            const carrier = window.invoiceCurrentCarrier;
            const loggedUser = Utils.getStorage('logged_user');
            const userName = loggedUser ? (loggedUser.name || loggedUser.login) : 'Sistema';

            // Mark selected NFs as paid
            let paidCount = 0;
            let totalPaid = 0;
            const paidNFs = [];

            dispatches.forEach(d => {
                if (window.invoiceSelectedNFs.has(d.id)) {
                    console.log(`💳 [Invoice] Marcando NF ${d.invoice} (ID: ${d.id}) como PAGA`);
                    d.status = 'Pago';
                    d.paidAt = new Date().toISOString();
                    d.invoiceRef = invoiceRef;
                    d.paidBy = userName;
                    if (justification) d.paymentNote = justification;
                    if (authorizedBy) d.authorizedBy = authorizedBy;
                    paidCount++;
                    totalPaid += (d.total || 0);
                    paidNFs.push(d.invoice);
                }
            });

            console.log(`💳 [Invoice] NFs marcadas como pagas: ${paidCount}`);
            console.log('💳 [Invoice] Salvando dispatches no storage...');
            Utils.setStorage('dispatches', dispatches);
            console.log('💳 [Invoice] Dispatches salvos!');

            // Save to invoice history
            const invoiceHistory = Utils.getStorage('invoice_history') || [];
            invoiceHistory.push({
                id: Date.now(),
                date: new Date().toISOString(),
                carrier: carrier,
                invoiceRef: invoiceRef,
                invoiceValue: invoiceValue,
                calculatedValue: totalPaid,
                difference: totalPaid - invoiceValue,
                nfCount: paidCount,
                nfList: paidNFs,
                confirmedBy: userName,
                authorizedBy: authorizedBy || null,
                justification: justification || null
            });
            Utils.setStorage('invoice_history', invoiceHistory);
            console.log('💳 [Invoice] Histórico de faturas salvo!');

            showToast(`✅ ${paidCount} NFs marcadas como PAGAS!`, 'success');

            // Clear form and refresh
            window.clearInvoiceForm();
            window.initInvoiceSection();

            // Atualizar também a tabela de Montagem de Carga se estiver visível
            if (window.renderAppHistory) {
                console.log('💳 [Invoice] Atualizando tabela de Montagem de Carga...');
                window.renderAppHistory();
            }

            console.log('💳 [Invoice] Processamento concluído!');
        };

        // Show invoice history modal
        window.showInvoiceHistory = () => {
            const history = Utils.getStorage('invoice_history') || [];
            const tbody = document.getElementById('invoiceHistoryBody');

            if (history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma fatura conferida ainda.</td></tr>`;
            } else {
                history.sort((a, b) => new Date(b.date) - new Date(a.date));
                tbody.innerHTML = history.map(h => {
                    const date = new Date(h.date);
                    const hasJustification = h.justification ? `<span title="${h.justification}" style="color: var(--accent-warning);">⚠️</span>` : '';
                    return `
                        <tr>
                            <td>${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>${h.carrier}</td>
                            <td>${h.invoiceRef} ${hasJustification}</td>
                            <td>${h.nfCount}</td>
                            <td style="text-align: right; font-weight: 600;">${Utils.formatCurrency(h.invoiceValue)}</td>
                            <td>${h.confirmedBy}${h.authorizedBy ? ` (${h.authorizedBy})` : ''}</td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('invoiceHistoryModal').style.display = 'flex';
        };

        window.sendWhatsApp = (id) => {
            const history = Utils.getStorage('dispatches');
            const item = history.find(d => d.id === id);
            if (!item) return;

            // Try to find client phone (Normalize names)
            const clients = Utils.getStorage('clients');
            const client = clients.find(c => c.nome.toUpperCase().trim() === item.client.toUpperCase().trim());

            // If phone not found in client list, prompt user
            let phone = client ? (client.telefone || '') : '';

            // Clean phone first
            phone = phone.replace(/\D/g, '');

            // If empty or short (likely missing DDD), ask user
            if (!phone || phone.length < 10) {
                let manualPhone = prompt(`Telefone inválido ou não encontrado para "${item.client}".\n\nDigite o número COMPLETO com DDD (Ex: 11999999999):`, phone);
                if (!manualPhone) return;
                phone = manualPhone.replace(/\D/g, '');
            }

            // Add 55 if missing (assuming Brazil)
            if (phone.length >= 10 && phone.length <= 11) {
                // Case: 11999999999 (11 chars) -> Add 55
                phone = '55' + phone;
            }

            // Final check
            if (phone.length < 12) {
                alert('Número parece inválido (muito curto). Verifique o DDD.');
                return;
            }

            const msg = `Olá ${item.client}! Seu pedido com NF ${item.invoice} foi despachado pela transportadora ${item.carrier}.\n\nPrevisão de entrega é de ${item.leadTime}.\n\nAtenciosamente,\nLT Distribuidora`;

            // Use web.whatsapp.com for direct text injection
            const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');
        };

        window.printDayManifest = (day) => {
            const list = Utils.getStorage('dispatches');
            let updated = false;

            // Filter items for the day (Use pt-BR to match UI keys)
            const dayItems = list.filter(item => new Date(item.date).toLocaleDateString('pt-BR') === day);

            if (dayItems.length === 0) return;

            // Auto-dispatch logic
            let dispatchCount = 0;
            dayItems.forEach(item => {
                let changed = false;
                if (item.status !== 'Despachado') {
                    item.status = 'Despachado';
                    changed = true;
                }
                if (!item.dispatchedAt) {
                    item.dispatchedAt = new Date().toISOString();
                    changed = true;
                }

                if (changed) {
                    updated = true;
                    dispatchCount++;
                }
            });

            if (updated) {
                Utils.saveRaw('dispatches', JSON.stringify(list));
                renderAppHistory();
                if (dispatchCount > 0) showToast(`✅ ${dispatchCount} pedidos marcados como despachados!`);
            }

            const printArea = document.getElementById('print-area');
            printArea.innerHTML = '';

            const totalWeight = dayItems.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
            const totalFreight = dayItems.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

            // Create 2 copies
            for (let i = 0; i < 2; i++) {
                const page = document.createElement('div');
                page.className = 'manifest-page';
                const cellStyle = 'border: 1px solid #777; padding: 3px 5px; font-size: 11px; color: #000;';
                const headStyle = 'border: 1px solid #777; padding: 5px; font-size: 11px; background: #e0e0e0; font-weight: bold; text-align: center; color: #000;';

                page.innerHTML = `
                <div class="manifest-header" style="border: 1px solid #000; padding: 10px; margin-bottom: 10px; font-family: Arial, sans-serif; text-align: center;">
                    <h2 style="margin:0; font-size: 16px; font-weight: bold; text-transform: uppercase;">Relatório Geral de Despacho</h2>
                    <div style="font-size: 12px; margin-top: 5px;">DATA: <strong>${day}</strong></div>
                    <div style="font-size: 10px;">Emissão: ${new Date().toLocaleString()} | Via ${i + 1}</div>
                </div>

                <table class="manifest-table" style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
                    <thead>
                        <tr style="background: #e0e0e0;">
                            <th style="${headStyle} width: 70px;">NF</th>
                            <th style="${headStyle}">Cliente</th>
                            <th style="${headStyle}">Destino / Bairro</th>
                            <th style="${headStyle}">Transp.</th>
                            <th style="${headStyle} width: 60px;">Peso (kg)</th>
                            <th style="${headStyle} width: 70px;">Valor (R$)</th>
                            <th style="${headStyle} width: 100px;">Assinatura</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dayItems.map(item => `
                            <tr>
                                <td style="${cellStyle} text-align: center; font-weight: bold;">${item.invoice}</td>
                                <td style="${cellStyle}">${item.client}</td>
                                <td style="${cellStyle}">${item.city} ${item.neighborhood ? '/ ' + item.neighborhood : ''}</td>
                                <td style="${cellStyle} font-size: 10px;">${item.carrier}</td>
                                <td style="${cellStyle} text-align: right;">${parseFloat(item.weight).toFixed(2)}</td>
                                <td style="${cellStyle} text-align: right;">${Utils.formatCurrency(item.total)}</td>
                                <td style="${cellStyle}"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f9f9f9; font-weight: bold;">
                            <td colspan="4" style="${cellStyle} text-align: right;">TOTAIS:</td>
                            <td style="${cellStyle} text-align: right;">${totalWeight.toFixed(2)}</td>
                            <td style="${cellStyle} text-align: right;">${Utils.formatCurrency(totalFreight)}</td>
                            <td style="${cellStyle}"></td>
                        </tr>
                    </tfoot>
                </table>

                <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-family: Arial, sans-serif;">
                    <div style="border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px;">
                        Responsável Expedição
                    </div>
                    <div style="border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px;">
                        Motorista / Conferente
                    </div>
                </div>
                ${i === 0 ? '<div style="margin-top: 30px; border-bottom: 2px dashed #999;"></div>' : ''}
            `;
                printArea.appendChild(page);
            }

            setTimeout(() => window.print(), 1000); // Wait for UI update if any
        };

        setTimeout(() => {
            const filters = document.querySelectorAll('#columnFilterBody input');
            filters.forEach(i => i.addEventListener('change', () => window.renderAppHistory()));
        }, 1000);

        // --- EXPORTAR TABELAS (CSV) ---
        const btnDownloadFreightTable = document.getElementById('btnDownloadFreightTable');
        if (btnDownloadFreightTable) {
            btnDownloadFreightTable.addEventListener('click', () => {
                const rules = Utils.getStorage('freight_tables') || [];
                // NEW ORDER (Matches Grid): 
                // 0:Transp, 1:Cidade, 2:Percentual, 3:Minimo, 4:LimPeso, 5:Excedente, 6:Redespacho, 7:%Red, 8:Pedagio, 9:LeadTime, 10:Horarios
                const headers = ['Transportadora', 'Cidade', 'Percentual', 'Minimo', 'Limite Peso', 'Valor Excedente', 'Redespacho', '% Redespacho', 'Pedagio', 'LeadTime', 'Horarios'];
                let csv = headers.join(';') + '\n';

                rules.forEach(r => {
                    const row = [
                        r.transportadora,
                        r.cidade,
                        String(r.percentual).replace('.', ','),
                        String(r.minimo).replace('.', ','),
                        String(r.limitePeso).replace('.', ','),
                        String(r.valorExcedente).replace('.', ','),
                        r.redespacho || '',
                        String(r.percentualRedespacho || 0).replace('.', ','), // Now at index 7
                        String(r.pedagio || 0).replace('.', ','),             // Now at index 8
                        r.leadTime || '',                                     // Now at index 9
                        r.horarios || ''                                      // Now at index 10
                    ];
                    csv += row.join(';') + '\n';
                });

                // ... (blob logic remains same)
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `tabelas_frete_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link); // Required for FF
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            });
        }

        // --- IMPORT BUTTON CLICK HANDLER ---
        // --- IMPORT BUTTON CLICK HANDLER ---
        const btnImportTrigger = document.getElementById('btnSyncData');
        const fileImportInput = document.getElementById('fileRules');
        if (btnImportTrigger && fileImportInput) {
            btnImportTrigger.addEventListener('click', () => {
                console.log('Import button clicked, opening file dialog...');
                fileImportInput.click();
            });
        }

        // Import CSV de Tabelas de Frete (DINÂMICO v2)
        document.getElementById('fileRules').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader(); // UTF-8 Default
            reader.onload = (evt) => {
                const text = evt.target.result;
                const lines = text.split(/\r\n|\n/);

                if (lines.length < 2) {
                    showToast('⚠️ Arquivo vazio ou sem cabeçalho.');
                    return;
                }

                // Detect Separator based on header
                let separator = ';';
                if (lines[0].indexOf(',') > -1 && lines[0].indexOf(';') === -1) separator = ',';

                // Parse Headers
                const headers = lines[0].toUpperCase().replace(/"/g, '').split(separator).map(h => h.trim());
                console.log('📋 Cabeçalhos:', headers);

                // Map Indices Dynamically
                const idx = {
                    transp: headers.findIndex(h => h.includes('TRANSPORTA') || h.includes('CARRIER')),
                    cidade: headers.findIndex(h => h === 'CIDADE' || h === 'CITY' || h === 'DESTINO'),
                    pct: headers.findIndex(h => h === 'PERCENTUAL' || h === '%' || h.includes('AD VALOREM')),
                    min: headers.findIndex(h => h === 'MINIMO' || h === 'MÍNIMO'),
                    peso: headers.findIndex(h => h.includes('LIMITE') || h.includes('PESO')),
                    exce: headers.findIndex(h => h.includes('EXCED') || h.includes('KG EX')),
                    ped: headers.findIndex(h => h.includes('PEDAGI') || h.includes('PEDÁGI')),
                    prazo: headers.findIndex(h => h.includes('PRAZO') || h.includes('LEAD') || h.includes('TIME')),
                    hora: headers.findIndex(h => h.includes('HORA') || h.includes('HORÁRI')),

                    // Redespacho Specifics
                    red_nome: headers.findIndex(h => h === 'REDESPACHO' || h === 'RED' || h.includes('NOME RED')),
                    red_pct: headers.findIndex(h => h.includes('% RED') || h.includes('PERCENTUAL RED')),
                    red_min: headers.findIndex(h => h.includes('MIN. RED') || h.includes('MINIMO RED'))
                };

                // Fallback for messy headers
                if (idx.transp === -1) idx.transp = 0;
                if (idx.cidade === -1) idx.cidade = 1;
                // If specific Redispatch Name column not found, but we see column 8 (generic common pos), careful not to force it

                console.log('📌 Índices mapeados:', idx);

                let added = 0;
                let updated = 0;

                lines.forEach((line, index) => {
                    if (index === 0 || !line.trim()) return;
                    const cols = line.replace(/"/g, '').split(separator);

                    const getVal = (i) => (i > -1 && cols[i]) ? cols[i].trim() : '';

                    const getNum = (i) => {
                        let val = getVal(i);
                        if (!val || val === '-') return 0;
                        val = val.replace('R$', '').replace('%', '').trim();
                        // Handle formatting: 1.200,50 (BR) vs 1200.50 (US)
                        if (val.includes(',') && val.includes('.')) {
                            // Complex case: assume . is thousands separador if comes before ,
                            if (val.indexOf('.') < val.indexOf(',')) {
                                val = val.replace(/\./g, '').replace(',', '.');
                            }
                        } else if (val.includes(',')) {
                            val = val.replace(',', '.');
                        }
                        return parseFloat(val) || 0;
                    };

                    const carrier = getVal(idx.transp).toUpperCase();
                    const city = getVal(idx.cidade).toUpperCase();

                    if (!carrier || !city) return;

                    const newRule = {
                        transportadora: carrier,
                        cidade: city,
                        percentual: getNum(idx.pct),
                        minimo: getNum(idx.min),
                        limitePeso: getNum(idx.peso),
                        valorExcedente: getNum(idx.exce),
                        pedagio: getNum(idx.ped),
                        leadTime: getVal(idx.prazo) || 'D+0',
                        horarios: getVal(idx.hora),

                        // Redespacho
                        redespacho: getVal(idx.red_nome),
                        percentualRedespacho: getNum(idx.red_pct),
                        minimoRedespacho: getNum(idx.red_min)
                    };

                    // Find existing rule
                    const existingIdx = rules.findIndex(r =>
                        r.transportadora === carrier && r.cidade === city
                    );

                    if (existingIdx > -1) {
                        // Merge com dados existentes para não perder campos não mapeados? 
                        // Não, CSV deve ser autoridade. Mas cuidado com campos opcionais.
                        rules[existingIdx] = { ...rules[existingIdx], ...newRule };
                        updated++;
                    } else {
                        rules.push(newRule);
                        added++;
                    }
                });

                if (added > 0 || updated > 0) {
                    Utils.saveRaw('freight_tables', JSON.stringify(rules));

                    // Update Carrier List
                    const importedCarriers = [...new Set(rules.map(r => r.transportadora))];
                    let listChanged = false;
                    importedCarriers.forEach(c => {
                        if (!carrierList.includes(c)) {
                            carrierList.push(c);
                            listChanged = true;
                        }
                    });
                    if (listChanged) {
                        carrierList.sort();
                        Utils.saveRaw('carrier_list', JSON.stringify(carrierList));
                        populateCarrierSelect();
                    }

                    renderRulesList();
                    showToast(`✅ Importação: ${added} novas, ${updated} atualizadas.`);
                } else {
                    showToast('⚠️ Nenhuma regra válida processada.');
                }

                e.target.value = ''; // Reset input
            };
            // Read as UTF-8 default (removes explicit ISO-8859-1)
            reader.readAsText(file);
        });

        document.getElementById('fileClient').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // alert('Lendo arquivo...'); // Debug

            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result;
                const lines = text.split('\n');

                // Auto-detect separator from header (line 0)
                let separator = ';';
                if (lines[0] && lines[0].includes(',')) separator = ',';
                if (lines[0] && lines[0].includes(';')) separator = ';';

                // Detect indices from Header (Line 0)
                const headers = lines[0].split(separator).map(h => h.trim().toUpperCase());
                const findIdx = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

                let idxCode = findIdx(['CODIGO', 'CÓDIGO', 'COD']);
                let idxName = findIdx(['NOME', 'RAZAO', 'RAZÃO', 'CLIENTE', 'SOCIAL']);
                let idxPhone = findIdx(['TELEFON', 'CELULAR', 'FONE', 'WHATS', 'TEL']);
                let idxCity = findIdx(['CIDADE', 'MUNICÍPIO', 'MUNICIPIO', 'MUN']);
                let idxNeigh = findIdx(['BAIRRO', 'ENDERECO', 'ENDEREÇO', 'BAI']);

                if (idxCode === -1) idxCode = 0;
                if (idxName === -1) idxName = 1;



                let count = 0;
                let errors = 0;

                lines.forEach((line, index) => {
                    if (index === 0 || !line.trim()) return;
                    const cols = line.split(separator);
                    if (cols.length < 2) return;

                    const getVal = (idx) => (idx > -1 && cols[idx]) ? cols[idx].trim().toUpperCase() : '';

                    let phone = getVal(idxPhone).replace(/\D/g, '');
                    let city = getVal(idxCity) || 'N/I';
                    let neighborhood = getVal(idxNeigh) || '-';

                    const client = {
                        codigo: getVal(idxCode),
                        nome: getVal(idxName),
                        cidade: city,
                        bairro: neighborhood,
                        telefone: phone
                    };
                    const lineUpper = line.toUpperCase();
                    if (client.cidade === 'N/I') {
                        if (lineUpper.includes('REDENCAO')) client.cidade = 'REDENCAO';
                        else if (lineUpper.includes('XINGUARA')) client.cidade = 'XINGUARA';
                        else if (lineUpper.includes('ALTAMIRA')) client.cidade = 'ALTAMIRA';
                        else if (lineUpper.includes('MARABA')) client.cidade = 'MARABA';
                    }
                    // Avoid duplicates
                    const existingIdx = clients.findIndex(c => c.codigo === client.codigo);
                    if (existingIdx >= 0) clients[existingIdx] = client;
                    else clients.push(client);

                    count++;
                });

                // Save locally and suggest sync
                Utils.saveRaw('clients', JSON.stringify(clients));

                if (count > 0) {
                    const msg = `✅ Sucesso! ${count} clientes importados.\n(Separador: "${separator}")`;
                    // Try cloud save
                    if (typeof Utils.Cloud !== 'undefined' && Utils.Cloud.save) {
                        Utils.Cloud.save('clients', clients);
                    }
                    alert(msg);
                } else {
                    alert('⚠️ Nenhum cliente válido encontrado.\nVerifique se o CSV usa ";" ou "," e tem pelo menos Código e Nome.');
                }

                e.target.value = ''; // Reset input
            };
            reader.readAsText(file, 'ISO-8859-1');
        });

        const dispatchTab = document.querySelector('a[href="#dispatch"]');
        if (dispatchTab) {
            dispatchTab.addEventListener('click', () => {
                if (window.renderAppHistory) window.renderAppHistory();
            });
        }

        // --- SISTEMA: BACKUP & RESTAURAR ---
        const btnDownloadBackup = document.getElementById('btnDownloadBackup');
        if (btnDownloadBackup) {
            btnDownloadBackup.addEventListener('click', () => {
                try {
                    // Gather ALL relevant data keys
                    const backup = {
                        dispatches: Utils.getStorage('dispatches'),
                        freight_tables: Utils.getStorage('freight_tables'),
                        carrier_list: Utils.getStorage('carrier_list'),
                        carrier_configs: Utils.getStorage('carrier_configs'),
                        carrier_info_v2: Utils.getStorage('carrier_info_v2'),
                        app_users: Utils.getStorage('app_users'),
                        company_data: Utils.getStorage('company_data'),
                        version: '1.2',
                        createdAt: new Date().toISOString()
                    };

                    const jsonStr = JSON.stringify(backup, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const link = document.createElement('a');
                    link.href = url;
                    // Format filename: backup_parreiralog_YYYY-MM-DD.json
                    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
                    link.download = `backup_parreiralog_${dateStr}.json`;

                    // Append to body is required for Firefox
                    document.body.appendChild(link);
                    link.click();

                    // Cleanup
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);

                    showToast('✅ Backup completo gerado com sucesso!');
                } catch (err) {
                    console.error('Falha no backup:', err);
                    alert('Erro ao gerar arquivo de backup: ' + err.message);
                }
            });
        }

        const btnTriggerRestore = document.getElementById('btnTriggerRestore');
        const fileRestore = document.getElementById('fileRestore');
        if (btnTriggerRestore && fileRestore) {
            btnTriggerRestore.addEventListener('click', () => fileRestore.click());
            fileRestore.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const data = JSON.parse(evt.target.result);
                        if (!data.dispatches || !data.freight_tables) {
                            throw new Error('Arquivo de backup inválido.');
                        }
                        if (confirm('Atenção! Isso substituirá todos os seus dados atuais. Deseja continuar?')) {
                            Utils.saveRaw('dispatches', JSON.stringify(data.dispatches));
                            Utils.saveRaw('freight_tables', JSON.stringify(data.freight_tables));
                            showToast('🔄 Dados restaurados! Recarregando...');
                            setTimeout(() => location.reload(), 2000);
                        }
                    } catch (err) {
                        alert('Erro ao restaurar: ' + err.message);
                    }
                };
                reader.readAsText(file);
            });
        }

        function checkAuth() {
            // Bypassed
        }

        // --- LOGIN & AUTH ---
        window.handleLogin = (e) => {
            if (e) e.preventDefault();
            const loginInput = document.getElementById('loginUser');
            const passInput = document.getElementById('loginPass');

            if (!loginInput || !passInput) return;

            const login = loginInput.value.trim().toLowerCase();
            const pass = passInput.value.trim();

            // Final fallback to ensure 'admin' works even if the users list is somehow corrupted
            if (login === 'admin' && pass === 'admin') {
                const adminUser = users.find(u => u.login === 'admin') || { name: 'Administrador', login: 'admin', pass: 'admin', role: 'supervisor' };
                currentUser = adminUser;
                sessionStorage.setItem('logged_user', JSON.stringify(adminUser));
                checkAuth();
                showSection('quote');
                showToast(`Bem - vindo, Administrador!`);
                return;
            }

            const user = users.find(u => u.login.toLowerCase() === login && u.pass === pass);
            if (user) {
                currentUser = user;
                sessionStorage.setItem('logged_user', JSON.stringify(user));
                checkAuth();
                showSection('quote');
                showToast(`Bem - vindo, ${user.name} !`);
            } else {
                alert('Usuário ou senha incorretos.');
            }
        };

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.onsubmit = window.handleLogin;
        }

        window.logout = () => {
            if (confirm('Deseja sair do sistema?')) {
                currentUser = null;
                sessionStorage.removeItem('logged_user');
                checkAuth();
            }
        };

        window.emergencyReset = () => {
            const pin = prompt('Para resetar os usuários para o padrão (admin/admin), digite o código de segurança:\n\n9999');
            if (pin === '9999') {
                localStorage.removeItem('app_users');
                sessionStorage.removeItem('logged_user');
                alert('Acessos resetados com sucesso!\n\nUsuário: admin\nSenha: admin\n\nO sistema será recarregado.');
                location.reload();
            } else if (pin !== null) {
                alert('Código incorreto.');
            }
        };

        // --- USER MANAGEMENT ---
        window.renderUserList = () => {
            const body = document.getElementById('userListBody');
            if (!body) return;

            // RELOAD users from storage to ensure we have latest data
            users = Utils.getStorage('app_users') || [];
            if (!Array.isArray(users) || users.length === 0) {
                users = [{ name: 'Administrador', login: 'admin', pass: 'admin', role: 'supervisor' }];
            }

            console.log('📋 Renderizando lista de usuários:', users.length, 'usuários');

            // Map roles to display names and badge classes
            const roleMap = {
                'supervisor': { label: 'SUPERVISOR', badgeClass: 'admin', color: '#3b82f6' },
                'admin': { label: 'SUPERVISOR', badgeClass: 'admin', color: '#3b82f6' },
                'user': { label: 'OPERACIONAL', badgeClass: 'user', color: '#94a3b8' },
                'motoboy': { label: '🏍️ MOTOBOY', badgeClass: 'motoboy', color: '#f59e0b' },
                'motorista': { label: '🚗 MOTORISTA', badgeClass: 'motorista', color: '#10b981' }
            };

            if (users.length === 0) {
                body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding: 2rem;">Nenhum usuário cadastrado</td></tr>';
                return;
            }

            body.innerHTML = users.map((u, idx) => {
                const roleInfo = roleMap[u.role] || roleMap['user'];
                return `
                    <tr>
                        <td style="padding: 0.6rem;"><strong>${u.name}</strong><br><small style="color: var(--text-secondary);">${u.login}</small></td>
                        <td style="padding: 0.6rem;"><span style="background: ${roleInfo.color}20; color: ${roleInfo.color}; padding: 0.2rem 0.5rem; border-radius: 0.8rem; font-size: 0.7rem; font-weight: 600; white-space: nowrap;">${roleInfo.label}</span></td>
                        <td style="padding: 0.6rem; text-align: center;">
                            ${u.login === 'admin' ? '—' : `
                                <button onclick="window.removeUser(${idx})" style="padding: 0.3rem 0.5rem; background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 4px; cursor: pointer;" title="Excluir">
                                    <span class="material-icons-round" style="font-size: 0.9rem;">delete</span>
                                </button>
                            `}
                        </td>
                    </tr>
                `;
            }).join('');
        };

        const formNewUser = document.getElementById('formNewUser');
        if (formNewUser) {
            formNewUser.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = document.getElementById('newUserName').value.trim();
                const login = document.getElementById('newUserLogin').value.trim();
                const pass = document.getElementById('newUserPass').value.trim();
                const role = document.getElementById('newUserRole').value;

                if (users.some(u => u.login === login)) {
                    alert('Este login já está em uso.');
                    return;
                }

                users.push({ name, login, pass, role });
                Utils.saveRaw('app_users', JSON.stringify(users));
                document.getElementById('formNewUser').reset();
                renderUserList();
                showToast('✅ Funcionário cadastrado!');
            });
        }

        window.removeUser = (idx) => {
            if (confirm(`Remover usuário "${users[idx].name}" ? `)) {
                users.splice(idx, 1);
                Utils.saveRaw('app_users', JSON.stringify(users));
                renderUserList();
            }
        };

        // Update delete logic with supervisor password
        window.removeDispatch = (id) => {
            const pass = prompt('AÇÃO RESTRITA: Digite a SENHA DE SUPERVISOR para excluir este lançamento:');
            if (pass === null) return;

            const supervisor = users.find(u => u.role === 'supervisor' && u.pass === pass);
            if (!supervisor) {
                alert('Senha incorreta ou usuário sem permissão de supervisor.');
                return;
            }

            let history = Utils.getStorage('dispatches');
            history = history.filter(d => d.id !== id);
            Utils.saveRaw('dispatches', JSON.stringify(history));
            window.renderAppHistory();
            showToast('🗑️ Lançamento excluído com sucesso.');
        };

        // --- DASHBOARD LOGIC ---
        window.renderDashboard = () => {

            const history = Utils.getStorage('dispatches');
            const pending = (Array.isArray(history) ? history : []).filter(d => d.status === 'Pendente Despacho');
            const grid = document.getElementById('carrierDashboardGrid');
            if (!grid) return;

            grid.innerHTML = '';

            // Update Totals
            const totalWeight = pending.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
            const totalFreight = pending.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

            document.getElementById('dashTotalInvoices').innerText = pending.length;
            document.getElementById('dashTotalWeight').innerText = `${totalWeight.toFixed(2)} kg`;
            document.getElementById('dashTotalFreight').innerText = Utils.formatCurrency(totalFreight);

            // Removed early return for empty pending to separate Empty State from Dashboard Grid
            // if (pending.length === 0) { ... }

            // All registered carriers
            const allCarriers = Utils.getStorage('carrier_list');

            // Group pending items by Carrier
            const pendingByCarrier = {};
            pending.forEach(p => {
                const carrierKey = String(p.carrier || '').trim().toUpperCase();
                if (!pendingByCarrier[carrierKey]) pendingByCarrier[carrierKey] = [];
                pendingByCarrier[carrierKey].push(p);
            });

            // Show all carriers (fixed cards)
            allCarriers.forEach(carrier => {
                const cleanCarrier = String(carrier || '').trim().toUpperCase();
                const items = pendingByCarrier[cleanCarrier] || [];
                const weight = items.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
                const total = items.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);
                const hasItems = items.length > 0;

                const card = document.createElement('div');
                card.className = 'card';
                if (hasItems) {
                    card.style.cursor = 'pointer';
                    card.style.opacity = '1';
                    card.onclick = (e) => {
                        try {
                            console.log('Clicou no card:', cleanCarrier);
                            window.openShipmentModal(cleanCarrier);
                        } catch (err) {
                            console.error('Erro ao abrir modal:', err);
                            alert('Erro ao abrir despacho: ' + err.message);
                        }
                    };
                } else {
                    card.style.cursor = 'default';
                    card.style.opacity = '0.6';
                }

                // Retrieve Schedules for relevant cities
                let scheduleHtml = '';
                if (hasItems) {
                    const pendingCities = [...new Set(items.map(i => i.city))]; // Unique cities in this batch
                    const rules = Utils.getStorage('freight_tables');

                    // Find rules for this carrier and these cities to get times
                    const schedules = [];
                    pendingCities.forEach(city => {
                        const rule = rules.find(r =>
                            String(r.transportadora || '').trim().toUpperCase() === cleanCarrier &&
                            String(r.cidade || '').trim().toUpperCase() === String(city || '').trim().toUpperCase()
                        );
                        if (rule && rule.horarios && rule.horarios.trim()) {
                            // Clean pipes if they exist '10:00 | 15:00' -> '10:00, 15:00'
                            const times = rule.horarios.replace(/\|/g, ',').replace(/\s+/g, ' ').trim();
                            if (times) schedules.push(`<div style="font-size: 0.75rem; margin-top: 2px;"><strong>${city}:</strong> <span style="color: var(--text-primary);">${times}</span></div>`);
                        }
                    });

                    if (schedules.length > 0) {
                        scheduleHtml = `
                        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color); color: var(--text-secondary);">
                            <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">⏰ Horários de Despacho</div>
                            ${schedules.join('')}
                        </div>
                    `;
                    }
                }

                card.innerHTML = `
                    <div class="card-body" style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 700; font-size: 1.1rem; color: ${hasItems ? 'var(--text-primary)' : 'var(--text-secondary)'}; margin-bottom: 0.5rem;">${carrier}</div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; gap: 1rem;">
                                    <span>📦 ${items.length} notas</span>
                                    <span>⚖️ ${weight.toFixed(2)} kg</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1.25rem; font-weight: 700; color: ${hasItems ? 'var(--accent-success)' : 'var(--border-color)'};">${Utils.formatCurrency(total)}</div>
                                <div style="font-size: 0.7rem; color: ${hasItems ? 'var(--primary-color)' : 'var(--text-secondary)'}; font-weight: 600; text-transform: uppercase; margin-top: 4px;">
                                    ${hasItems ? 'Abrir Carga' : 'Carga Vazia'}
                                </div>
                            </div>
                        </div>
                        ${scheduleHtml}
                    </div>
                    `;
                grid.appendChild(card);
            });
        }


        // Initial call to render dashboard if possible
        if (window.renderDashboard) window.renderDashboard();


        // --- GLOBAL SCOPE FUNCTIONS (Modal & Print) ---

        let currentModalCarrier = '';
        let selectedNFIds = [];

        window.openShipmentModal = (carrier) => {
            try {
                const cleanCarrier = String(carrier || '').trim().toUpperCase();
                console.log('openShipmentModal executando para:', cleanCarrier);
                currentModalCarrier = cleanCarrier;

                const history = Utils.getStorage('dispatches');
                const items = (Array.isArray(history) ? history : []).filter(d => {
                    const dCarrier = String(d.carrier || '').trim().toUpperCase();
                    return dCarrier === cleanCarrier && d.status === 'Pendente Despacho';
                });

                if (items.length === 0) {
                    console.warn('Nenhum item pendente (Pendente Despacho) para:', cleanCarrier);
                }

                selectedNFIds = items.map(i => i.id);

                const titleEl = document.getElementById('modalCarrierTitle');
                if (titleEl) titleEl.innerText = `Itens Pendentes: ${cleanCarrier}`;

                const modalEl = document.getElementById('shipmentModal');
                if (modalEl) {
                    modalEl.style.display = 'flex';
                    renderModalItems(items);

                    // IMPORTANTE: Atualizar dropdown de motoristas
                    if (window.populateDriverSelector) window.populateDriverSelector();
                } else {
                    console.error('Elemento #shipmentModal não encontrado no DOM!');
                    alert('Erro crítico: Modal de despacho não encontrado na página.');
                }
            } catch (err) {
                console.error('Falha no openShipmentModal:', err);
                alert('Erro ao processar modal: ' + err.message);
            }
        };

        function renderModalItems(items) {
            const body = document.getElementById('shipmentModalBody');
            if (!body) return;

            // Pre-fetch rules for performance
            const rules = Utils.getStorage('freight_tables') || [];

            // Helper to check delay
            const isLate = (carrier, city) => {
                const rulesFound = rules.filter(r =>
                    String(r.transportadora || '').trim().toUpperCase() === String(carrier || '').trim().toUpperCase() &&
                    String(r.cidade || '').trim().toUpperCase() === String(city || '').trim().toUpperCase()
                );
                if (rulesFound.length === 0) return false;

                // Use the first matching rule
                const rule = rulesFound[0];
                if (!rule.horarios) return false;

                const times = rule.horarios.match(/(\d{1,2}:\d{2})/g);
                if (!times || times.length === 0) return false;

                const now = new Date();
                const currentMins = now.getHours() * 60 + now.getMinutes();

                // Find LAST schedule of the day (max minutes)
                let maxMins = -1;
                times.forEach(t => {
                    const [h, m] = t.split(':').map(Number);
                    const mins = h * 60 + m;
                    if (mins > maxMins) maxMins = mins;
                });

                // If current time > last schedule time => LATE
                return currentMins > maxMins;
            };

            body.innerHTML = items.map(item => {
                const delayed = isLate(item.carrier, item.city);
                const iconHtml = delayed
                    ? `<span class="material-icons-round" style="color: var(--accent-danger); font-size: 1.1rem; vertical-align: middle; margin-left: 4px;" title="⚠️ Horário limite de despacho excedido!">alarm_off</span>`
                    : '';

                return `
        <tr>
            <td><input type="checkbox" ${selectedNFIds.includes(item.id) ? 'checked' : ''} onchange="window.toggleNFSelection(${item.id})"></td>
            <td style="font-weight: 600; display: flex; align-items: center;">
                ${item.invoice}
                ${iconHtml}
            </td>
            <td>${item.client}</td>
            <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${item.city}</span></td>
            <td>${item.weight} kg</td>
            <td style="font-weight: 600; color: var(--accent-success);">${Utils.formatCurrency(item.total)}</td>
            <td style="text-align: right;">
                <button onclick="window.undoDispatch(${item.id})" class="btn btn-secondary" style="padding: 0.3rem; min-width: auto; background: rgba(255,0,0,0.05); color: var(--accent-danger); border: none;" title="Estornar/Remover da Fila">
                    <span class="material-icons-round" style="font-size: 1.1rem;">undo</span>
                </button>
            </td>
        </tr>
    `}).join('');

            updateModalTotals(items);
        }

        window.toggleNFSelection = (id) => {
            if (selectedNFIds.includes(id)) {
                selectedNFIds = selectedNFIds.filter(i => i !== id);
            } else {
                selectedNFIds.push(id);
            }

            const history = Utils.getStorage('dispatches');
            const items = history.filter(d => {
                const dCarrier = String(d.carrier || '').trim().toUpperCase();
                return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
            });
            updateModalTotals(items);
        };

        function updateModalTotals(allPending) {
            const selectedItems = allPending.filter(i => selectedNFIds.includes(i.id));
            const total = selectedItems.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

            const countEl = document.getElementById('modalSelectedCount');
            const totalEl = document.getElementById('modalSelectedTotal');

            if (countEl) countEl.innerText = selectedItems.length;
            if (totalEl) totalEl.innerText = Utils.formatCurrency(total);
        }

        window.undoDispatch = (id) => {
            if (confirm('Deseja estornar este lançamento? Ele sairá desta lista de despacho e voltará para o histórico como cancelado.')) {
                let history = Utils.getStorage('dispatches');
                const idx = history.findIndex(d => d.id === id);
                if (idx !== -1) {
                    history[idx].status = 'Cancelado';
                    Utils.saveRaw('dispatches', JSON.stringify(history));

                    // Refresh modal
                    const remaining = history.filter(d => {
                        const dCarrier = String(d.carrier || '').trim().toUpperCase();
                        return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
                    });

                    if (remaining.length === 0) {
                        document.getElementById('shipmentModal').style.display = 'none';
                        location.reload();
                    } else {
                        selectedNFIds = selectedNFIds.filter(i => i !== id);
                        renderModalItems(remaining);
                    }
                    showToast('🔄 Lançamento estornado!');
                }
            }
        };

        window.generateRomaneioAction = () => {
            try {
                console.log('Tentando gerar romaneio...');
                if (selectedNFIds.length === 0) {
                    alert('Selecione ao menos uma nota fiscal para gerar o romaneio.');
                    return;
                }

                const history = Utils.getStorage('dispatches');
                const toDispatch = history.filter(d => selectedNFIds.includes(d.id));

                if (toDispatch.length === 0) {
                    alert('Erro: Notas selecionadas não encontradas no histórico.');
                    return;
                }

                // Get delivery type selection
                const deliveryTypeEl = document.getElementById('deliveryTypeSelector');
                let rawType = deliveryTypeEl ? deliveryTypeEl.value : 'direto';

                console.log('🔍 [DEBUG] Valor do seletor (rawType):', rawType);
                console.log('🔍 [DEBUG] Elemento seletor:', deliveryTypeEl);

                let deliveryType = rawType;
                let assignedDriverLogin = null;
                let assignedDriverName = null;

                // Parse "type_login" format (e.g. moto_andre)
                if (rawType.startsWith('moto_') || rawType.startsWith('carro_')) {
                    const parts = rawType.split('_');
                    deliveryType = parts[0]; // 'moto' or 'carro'
                    assignedDriverLogin = parts.slice(1).join('_'); // login

                    // Try to find name for display
                    const allUsers = Utils.getStorage('app_users') || [];
                    const uObj = allUsers.find(u => u.login === assignedDriverLogin);
                    if (uObj) assignedDriverName = uObj.name;
                }

                console.log('📦 Tipo de despacho:', deliveryType, '| Motorista:', assignedDriverName || 'N/A');

                // Get logged user info
                const loggedUser = Utils.getStorage('logged_user');
                const dispatchedBy = (Array.isArray(loggedUser) ? loggedUser[0]?.login : loggedUser?.login) || 'sistema';

                // Mark as dispatched and set delivery type
                history.forEach(d => {
                    if (selectedNFIds.includes(d.id)) {
                        d.status = 'Despachado';
                        d.dispatchedAt = new Date().toISOString();
                        d.dispatchedBy = dispatchedBy;

                        // If moto or carro, configure for delivery
                        if (deliveryType === 'moto' || deliveryType === 'carro') {
                            d.deliveryType = deliveryType;
                            d.deliveryStatus = 'em_entrega';
                            d.deliveryDispatchedAt = new Date().toISOString();
                            d.deliveryDispatchedBy = dispatchedBy;
                            d.deliveryDestination = d.carrier; // Going to carrier

                            // NEW: Assign specific driver
                            if (assignedDriverLogin) {
                                d.driverLogin = assignedDriverLogin;
                                d.driverName = assignedDriverName;
                                d.deliveryPerson = assignedDriverName; // Para compatibilidade com DeliveryModule
                            }

                            console.log(`🚚 NF ${d.invoice} enviada para ${deliveryType === 'moto' ? '🏍️ Moto' : '🚗 Carro'} Entrega (${assignedDriverName})`);
                        }
                    }
                });
                Utils.saveRaw('dispatches', JSON.stringify(history));

                // Open print manifest
                window.printSpecificRomaneio(currentModalCarrier, toDispatch);

                // Show appropriate toast
                if (deliveryType === 'moto') {
                    showToast('🏍️ Romaneio gerado! NFs enviadas para Moto Entrega.');
                } else if (deliveryType === 'carro') {
                    showToast('🚗 Romaneio gerado! NFs enviadas para Carro Entrega.');
                } else {
                    showToast('🚚 Romaneio gerado com sucesso!');
                }

                // Hide modal immediately
                const modal = document.getElementById('shipmentModal');
                if (modal) modal.style.display = 'none';

                // Refresh delivery modules if available
                if (window.DeliveryModule) {
                    window.DeliveryModule.renderMotoEntregas();
                    window.DeliveryModule.renderCarroEntregas();
                }

                // Reset delivery type selector for next use
                if (deliveryTypeEl) deliveryTypeEl.value = 'direto';

            } catch (err) {
                console.error('Erro em generateRomaneioAction:', err);
                alert('Erro ao gerar romaneio: ' + err.message);
            }
        };

        window.printSpecificRomaneio = (carrierName, items) => {
            try {

                const carrierInfo = Utils.getStorage('carrier_info_v2') || {};
                const company = Utils.getStorage('company_data');
                const cleanName = String(carrierName || '').trim().toUpperCase();
                const cInfo = carrierInfo[cleanName] || { cnpj: '-', address: '-', city: '-' };
                const printArea = document.getElementById('print-area');
                printArea.innerHTML = '';

                const totalWeight = items.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
                const totalFreight = items.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);
                const cellStyle = 'border: 1px solid #777; padding: 3px 5px; font-size: 11px; color: #000;';

                // Create 2 copies
                for (let i = 0; i < 2; i++) {
                    const page = document.createElement('div');
                    page.className = 'manifest-page';
                    page.innerHTML = `
            <div class="manifest-header" style="display: grid; grid-template-columns: 1fr 1fr; border: 2px solid #000; padding: 10px; margin-bottom: 20px;">
                <div>
                    <h3 style="margin:0; font-size: 1rem;">DESPACHANTE (REMETENTE)</h3>
                    <div style="font-size: 0.9rem; font-weight: bold; margin-top: 5px;">${company.name || 'EMPRESA NÃO CONFIGURADA'}</div>
                    <div style="font-size: 0.8rem;">CNPJ: ${company.cnpj || '-'}</div>
                    <div style="font-size: 0.8rem;">END: ${company.address || '-'}</div>
                </div>
                <div style="border-left: 2px solid #000; padding-left: 15px;">
                    <h3 style="margin:0; font-size: 1rem;">TRANSPORTADORA</h3>
                    <div style="font-size: 0.9rem; font-weight: bold; margin-top: 5px;">${cleanName}</div>
                    <div style="font-size: 0.8rem;">CNPJ: ${cInfo.cnpj}</div>
                    <div style="font-size: 0.8rem;">END: ${cInfo.address}</div>
                </div>
            </div>

            <div style="text-align: center; margin-bottom: 15px;">
                <h2 style="margin:0; text-decoration: underline;">ROMANEIO DE ENTREGA</h2>
                <div style="font-size: 0.8rem;">Emissão: ${new Date().toLocaleString()} | Via ${i + 1}</div>
            </div>

            <table class="manifest-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background: #ddd; font-weight: bold;">
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px;">NF</th>
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px;">Cliente</th>
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px;">Destino / Bairro</th>
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px; width: 60px;">Peso</th>
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px; width: 80px;">Valor</th>
                        <th style="border: 1px solid #777; padding: 5px; font-size: 11px; width: 100px;">Assinatura</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td style="${cellStyle} text-align: center; font-weight: bold;">${item.invoice}</td>
                            <td style="${cellStyle}">${item.client}</td>
                            <td style="${cellStyle}">${item.city} ${item.neighborhood ? '/ ' + item.neighborhood : ''}</td>
                            <td style="${cellStyle} text-align: right;">${parseFloat(item.weight).toFixed(2)}</td>
                            <td style="${cellStyle} text-align: right;">${Utils.formatCurrency(item.total)}</td>
                            <td style="${cellStyle}"></td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr style="font-weight: bold; background: #f9f9f9;">
                        <td colspan="3" style="${cellStyle} text-align: right;">TOTAIS:</td>
                        <td style="${cellStyle} text-align: right;">${totalWeight.toFixed(2)}</td>
                        <td style="${cellStyle} text-align: right;">${Utils.formatCurrency(totalFreight)}</td>
                        <td style="${cellStyle}"></td>
                    </tr>
                </tfoot>
            </table>

            <div class="signature-row" style="margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; padding-bottom: 20px;">
                <div style="border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 0.8rem;">
                    Responsável Expedição
                </div>
                <div style="border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 0.8rem;">
                    Motorista / Conferente
                </div>
            </div>
        `;
                    printArea.appendChild(page);
                }

                window.print();
            } catch (err) {
                console.error('Erro ao gerar romaneio:', err);
                alert('Falha ao gerar impressão: ' + err.message);
            }
        };


        window.returnToDashboard = (id) => {
            if (confirm('Deseja retornar este despacho para o Painel de Pendências?')) {
                let history = Utils.getStorage('dispatches');
                const idx = history.findIndex(d => d.id === id);
                if (idx !== -1) {
                    history[idx].status = 'Pendente Despacho';
                    localStorage.setItem('dispatches', JSON.stringify(history));
                    showToast('✅ Despacho devolvido para o painel de pendências!');

                    // Refresh logic
                    if (window.renderAppHistory) window.renderAppHistory();

                    // Ask user if they want to go to dashboard
                    if (confirm('Ir para o Painel agora para reimprimir?')) {
                        window.location.hash = '#dashboard';
                        // Force reload if already on dashboard to refresh
                        if (window.showSection) window.showSection('dashboard');
                    }
                }
            }
        };

        // --- REPORTS LOGIC ---
        window.showReportDetail = (reportType) => {
            const menu = document.getElementById('reports-menu');
            const container = document.getElementById('report-detail-container');
            const content = document.getElementById('report-content-area');

            if (reportType === 'van-performance') {
                renderVanPerformanceReport(content);
            } else if (reportType === 'late-dispatches') {
                renderLateDispatchesReport(content);
            } else if (reportType === 'delivery-report') {
                renderDeliveryReport(content);
            }
            // Add other reports here

            menu.style.display = 'none';
            container.style.display = 'block';
        };

        window.closeReportDetail = () => {
            const menu = document.getElementById('reports-menu');
            const container = document.getElementById('report-detail-container');
            menu.style.display = 'grid'; // Restore grid
            container.style.display = 'none';
        };

        // --- FUNÇÕES UTILITÁRIAS DE EXPORTAÇÃO ---

        // Exportar tabela para Excel (CSV)
        window.exportReportToExcel = (tableId, filename) => {
            const table = document.getElementById(tableId);
            if (!table) {
                showToast('❌ Tabela não encontrada para exportação.');
                return;
            }

            let csv = [];
            const rows = table.querySelectorAll('tr');

            rows.forEach(row => {
                const cols = row.querySelectorAll('th, td');
                const rowData = [];
                cols.forEach(col => {
                    // Limpar texto e escapar aspas
                    let text = col.innerText.replace(/"/g, '""').trim();
                    rowData.push(`"${text}"`);
                });
                csv.push(rowData.join(';'));
            });

            const csvContent = csv.join('\n');
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast('📥 Arquivo Excel gerado com sucesso!');
        };

        // Imprimir relatório
        window.printReport = (containerId, title) => {
            const container = document.getElementById(containerId) || document.getElementById('report-content-area');
            if (!container) {
                showToast('❌ Conteúdo não encontrado para impressão.');
                return;
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background: #f5f5f5; font-weight: bold; }
                        h1, h2, h3 { color: #333; }
                        .card { border: 1px solid #ddd; margin: 15px 0; padding: 15px; border-radius: 8px; }
                        .card-header { font-weight: bold; margin-bottom: 10px; }
                        .no-print { display: none !important; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <h1>${title}</h1>
                    <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                    <hr>
                    ${container.innerHTML}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
            }, 500);
        };

        // Gera botões de ação para relatórios
        window.getReportActionButtons = (tableId, reportName) => {
            return `
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1rem;" class="no-print">
                    <button class="btn btn-secondary" onclick="window.exportReportToExcel('${tableId}', '${reportName}')" style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">download</span>
                        Baixar Excel
                    </button>
                    <button class="btn btn-secondary" onclick="window.printReport(null, '${reportName}')" style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">print</span>
                        Imprimir
                    </button>
                </div>
            `;
        };

        function renderLateDispatchesReport(container) {
            const history = Utils.getStorage('dispatches');
            const lateItems = [];
            const now = new Date();

            history.forEach(d => {
                // Must have defined schedule
                if (!d.horarios || d.horarios === '-') return;

                const timeMatch = d.horarios.match(/(\d{2}):(\d{2})/);
                if (!timeMatch) return;

                const [_, h, m] = timeMatch;

                // Deadline based on Planned Date (Creation Date)
                // Fix timezone issue: Parse YYYY-MM-DD to Local Time explicitly
                const ymd = d.date.split('T')[0].split('-');
                const deadline = new Date(parseInt(ymd[0]), parseInt(ymd[1]) - 1, parseInt(ymd[2]), parseInt(h), parseInt(m), 0);


                if (d.status === 'Pendente Despacho') {
                    // Late Logic for Active Items: Is it late NOW?
                    const dDateStart = new Date(d.date); dDateStart.setHours(0, 0, 0, 0);
                    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

                    if (dDateStart < todayStart) {
                        lateItems.push({ ...d, reason: 'Pendente (Data Passada)' });
                    } else if (now > deadline) {
                        lateItems.push({ ...d, reason: `Pendente (Estourado ${h}:${m})` });
                    }
                } else if (d.status === 'Despachado' && d.dispatchedAt) {
                    // Late Logic for History: Was it late THEN?
                    const dispatchedTime = new Date(d.dispatchedAt);
                    // Calculate delay
                    const diffMs = dispatchedTime - deadline;
                    // Only consider significant delays (> 5 mins tolerance)
                    if (diffMs > 300000) {
                        const diffMin = Math.floor(diffMs / 60000);
                        lateItems.push({ ...d, reason: `Despachado (+${diffMin}min)` });
                    }
                }
            });

            if (lateItems.length === 0) {
                container.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
                <span class="material-icons-round" style="font-size: 4rem; color: var(--accent-success);">check_circle</span>
                <h3 style="margin-top: 1rem; color: var(--text-primary);">Tudo no Prazo!</h3>
                <p style="color: var(--text-secondary);">Nenhum despacho pendente perdeu o horário de corte.</p>
            </div>
        `;
                return;
            }

            container.innerHTML = `
        <div class="welcome-banner" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-danger);">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span class="material-icons-round" style="font-size: 2rem; color: var(--accent-danger);">warning</span>
                <div>
                    <h2 style="color: var(--accent-danger);">Despachos Atrasados</h2>
                    <p style="color: var(--text-secondary);">Foram encontrados <strong>${lateItems.length}</strong> despachos que excederam o horário limite de saída.</p>
                </div>
            </div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1rem;" class="no-print">
            <button class="btn btn-secondary" onclick="window.exportReportToExcel('lateDispatchesTable', 'Relatorio_Atrasos')" style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="material-icons-round" style="font-size: 1.2rem;">download</span>
                Baixar Excel
            </button>
            <button class="btn btn-secondary" onclick="window.printReport(null, 'Relatório de Atrasos')" style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="material-icons-round" style="font-size: 1.2rem;">print</span>
                Imprimir
            </button>
        </div>

        <div class="card" style="margin-top: 1rem;">
            <div class="card-body" style="padding: 0; overflow-x: auto;">
                <table class="dispatch-table" id="lateDispatchesTable">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>NF</th>
                            <th>Cliente</th>
                            <th>Transportadora</th>
                            <th>Horário Saída</th>
                            <th>Motivo Atraso</th>
                            <th style="text-align: right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lateItems.map(d => `
                            <tr>
                                <td>${new Date(d.date).toLocaleDateString()}</td>
                                <td style="font-weight: bold;">${d.invoice}</td>
                                <td>${d.client}</td>
                                <td>${d.carrier}</td>
                                <td>${d.horarios}</td>
                                <td style="color: var(--accent-danger); font-weight: bold;">${d.reason}</td>
                                <td style="text-align: right;">
                                    <button class="btn btn-secondary" onclick="window.sendWhatsApp(${d.id}); this.classList.add('sent')" title="Alertar Supervisor" style="padding: 4px;">
                                        <span class="material-icons-round" style="font-size: 1rem;">share</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
        }

        function renderVanPerformanceReport(container) {
            const history = Utils.getStorage('dispatches');
            // Filter only VAN dispatches that were negotiated (vanDiff != 0 or total != originalTotal)
            // Or simply all VAN carriers to show overview
            const vanItems = history.filter(d =>
                (d.carrier && d.carrier.toUpperCase().includes('VAN')) &&
                (d.status === 'Despachado' || d.status === 'concluido')
            );

            if (vanItems.length === 0) {
                container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Nenhum despacho via VAN encontrado no histórico.</div>`;
                return;
            }

            // Calculate Totals
            let totalSavings = 0;
            let totalExtra = 0;
            let totalOriginal = 0;
            let totalFinal = 0;

            vanItems.forEach(d => {
                const orig = d.originalTotal || d.total; // Fallback if old data
                const final = d.total;
                const diff = (d.vanDiff !== undefined) ? d.vanDiff : (orig - final);

                totalOriginal += orig;
                totalFinal += final;

                if (diff > 0) totalSavings += diff;
                else if (diff < 0) totalExtra += Math.abs(diff);
            });

            const netResult = totalSavings - totalExtra;
            const netColor = netResult >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';

            container.innerHTML = `
        <div class="grid-3-col" style="margin-bottom: 2rem; gap: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
            <div class="card" style="padding: 1.5rem; text-align: center;">
                <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Economia Gerada</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-success); margin-top: 0.5rem;">${Utils.formatCurrency(totalSavings)}</div>
            </div>
            <div class="card" style="padding: 1.5rem; text-align: center;">
                <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Custo Extra (Acima da Tabela)</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-danger); margin-top: 0.5rem;">${Utils.formatCurrency(totalExtra)}</div>
            </div>
            <div class="card" style="padding: 1.5rem; text-align: center; border: 1px solid ${netColor};">
                <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Saldo Líquido</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${netColor}; margin-top: 0.5rem;">${Utils.formatCurrency(netResult)}</div>
            </div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1rem;" class="no-print">
            <button class="btn btn-secondary" onclick="window.exportReportToExcel('vanPerformanceTable', 'Relatorio_VAN')" style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="material-icons-round" style="font-size: 1.2rem;">download</span>
                Baixar Excel
            </button>
            <button class="btn btn-secondary" onclick="window.printReport(null, 'Relatório Performance VAN')" style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="material-icons-round" style="font-size: 1.2rem;">print</span>
                Imprimir
            </button>
        </div>

        <div class="card">
            <div class="card-header">
                <h3>Detalhamento de Despachos (VAN)</h3>
            </div>
            <div class="card-body" style="padding: 0; overflow-x: auto;">
                <table class="dispatch-table" id="vanPerformanceTable">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>NF</th>
                            <th>Cliente</th>
                            <th>Transportadora</th>
                            <th style="text-align: right;">Valor Tabela</th>
                            <th style="text-align: right;">Valor Negociado</th>
                            <th style="text-align: right;">Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vanItems.map(d => {
                const orig = d.originalTotal || d.total;
                const final = d.total;
                const diff = (d.vanDiff !== undefined) ? d.vanDiff : (orig - final);

                let resColor = 'var(--text-secondary)';
                let resSignal = '';
                if (diff > 0.01) { resColor = 'var(--accent-success)'; resSignal = '+'; }
                else if (diff < -0.01) { resColor = 'var(--accent-danger)'; resSignal = ''; } // value is negative

                return `
                            <tr>
                                <td>${new Date(d.date).toLocaleDateString()}</td>
                                <td>${d.invoice}</td>
                                <td>${d.client}</td>
                                <td>${d.carrier}</td>
                                <td style="text-align: right;">${Utils.formatCurrency(orig)}</td>
                                <td style="text-align: right; font-weight: bold;">${Utils.formatCurrency(final)}</td>
                                <td style="text-align: right; color: ${resColor}; font-weight: bold;">
                                    ${resSignal}${Utils.formatCurrency(diff)}
                                </td>
                            </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

            window.markAsDispatched = (id) => {
                const list = Utils.getStorage('dispatches');
                const idx = list.findIndex(d => d.id === id);
                if (idx !== -1) {
                    if (confirm('Confirmar despacho desta mercadoria?')) {
                        list[idx].status = 'Despachado';
                        list[idx].dispatchedAt = new Date().toISOString();
                        Utils.saveRaw('dispatches', JSON.stringify(list));
                        showToast('✅ Mercadoria marcada como despachada!');
                        renderAppHistory();
                    }
                }
            };
        }

        // --- RELATÓRIO DE ENTREGAS (Motoboy/Motorista) ---
        function renderDeliveryReport(container) {
            // Buscar histórico de entregas
            const deliveryHistory = Utils.getStorage('delivery_history') || [];
            const dispatches = Utils.getStorage('dispatches') || [];

            // Combinar entregas finalizadas (do histórico) e pendentes (dos dispatches)
            const allDeliveries = [
                ...deliveryHistory,
                ...dispatches.filter(d => d.deliveryStatus === 'entregue' || d.deliveryStatus === 'devolvido')
            ];

            // Obter lista única de entregadores
            const deliveryPersons = [...new Set(allDeliveries.map(d => d.deliveryPerson || d.driverName || 'Não Atribuído'))].sort();

            // Gerar opções de filtro
            const filterOptions = deliveryPersons.map(p => `<option value="${p}">${p}</option>`).join('');

            // HTML do relatório
            container.innerHTML = `
                <div class="welcome-banner" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.1)); border: 1px solid #f59e0b;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span class="material-icons-round" style="font-size: 2rem; color: #f59e0b;">two_wheeler</span>
                        <div>
                            <h2 style="color: var(--text-primary); margin: 0;">Relatório de Entregas</h2>
                            <p style="color: var(--text-secondary); margin: 0.5rem 0 0;">Acompanhe o desempenho dos entregadores (Motoboy e Motorista).</p>
                        </div>
                    </div>
                </div>

                <div class="card" style="margin-top: 1.5rem;">
                    <div class="card-header">
                        <h3 style="margin: 0;">Filtros</h3>
                    </div>
                    <div class="card-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label">Data Inicial</label>
                            <input type="date" id="deliveryReportStartDate" class="form-input" value="${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Data Final</label>
                            <input type="date" id="deliveryReportEndDate" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Entregador</label>
                            <select id="deliveryReportPerson" class="form-input">
                                <option value="">Todos</option>
                                ${filterOptions}
                            </select>
                        </div>
                        <div class="form-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-primary" onclick="window.applyDeliveryReportFilter()" style="width: 100%;">
                                <span class="material-icons-round">search</span>
                                Filtrar
                            </button>
                        </div>
                    </div>
                </div>

                <div id="deliveryReportResults" style="margin-top: 1.5rem;">
                    <!-- Resultados serão inseridos aqui -->
                </div>
            `;

            // Aplicar filtro inicial
            window.applyDeliveryReportFilter();
        }

        // Função de filtro do relatório
        window.applyDeliveryReportFilter = function () {
            const startDate = document.getElementById('deliveryReportStartDate').value;
            const endDate = document.getElementById('deliveryReportEndDate').value;
            const personFilter = document.getElementById('deliveryReportPerson').value;
            const resultsContainer = document.getElementById('deliveryReportResults');

            // Buscar dados
            const deliveryHistory = Utils.getStorage('delivery_history') || [];
            const dispatches = Utils.getStorage('dispatches') || [];

            // Combinar e filtrar
            let allDeliveries = [
                ...deliveryHistory,
                ...dispatches.filter(d => d.deliveryStatus === 'entregue' || d.deliveryStatus === 'devolvido')
            ];

            // Filtrar por data
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                allDeliveries = allDeliveries.filter(d => {
                    const dDate = new Date(d.deliveryCompletedAt || d.finalizedAt || d.date);
                    return dDate >= start;
                });
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                allDeliveries = allDeliveries.filter(d => {
                    const dDate = new Date(d.deliveryCompletedAt || d.finalizedAt || d.date);
                    return dDate <= end;
                });
            }

            // Filtrar por entregador
            if (personFilter) {
                allDeliveries = allDeliveries.filter(d =>
                    (d.deliveryPerson || d.driverName || 'Não Atribuído') === personFilter
                );
            }

            // Helper para formatar duração
            const formatDuration = (ms) => {
                if (ms < 0) ms = 0;
                const minutes = Math.floor(ms / 60000);
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                if (hours > 0) return `${hours}h ${mins}min`;
                return `${mins}min`;
            };

            // Calcular estatísticas por entregador
            const stats = {};

            // 1. Agrupar
            allDeliveries.forEach(d => {
                const person = d.deliveryPerson || d.driverName || 'Não Atribuído';
                if (!stats[person]) {
                    stats[person] = {
                        total: 0,
                        entregues: 0,
                        devolvidas: 0,
                        items: []
                    };
                }
                stats[person].items.push(d);
            });

            // 2. Processar tempos (Ordenação e Cálculo)
            Object.keys(stats).forEach(person => {
                // Ordenar itens cronologicamente pela data de conclusão
                stats[person].items.sort((a, b) => {
                    const dA = new Date(a.deliveryCompletedAt || a.finalizedAt || a.date).getTime();
                    const dB = new Date(b.deliveryCompletedAt || b.finalizedAt || b.date).getTime();
                    return dA - dB;
                });

                // Calcular totais e tempos
                stats[person].items.forEach((item, index) => {
                    stats[person].total++;
                    if (item.deliveryStatus === 'entregue' || item.result === 'entregue') {
                        stats[person].entregues++;
                    } else {
                        stats[person].devolvidas++;
                    }

                    // Lógica de Tempo de Percurso
                    const deliveredTime = new Date(item.deliveryCompletedAt || item.finalizedAt || item.date).getTime();
                    const dispatchTime = new Date(item.date).getTime(); // Assumindo item.date como hora do despacho

                    let startTime = dispatchTime;
                    let originLabel = 'Despacho';

                    // Se não é a primeira entrega do lote...
                    if (index > 0) {
                        const prevItem = stats[person].items[index - 1];
                        const prevDeliveredTime = new Date(prevItem.deliveryCompletedAt || prevItem.finalizedAt || prevItem.date).getTime();

                        // Se o despacho atual foi ANTES da entrega anterior, é mesmo lote
                        if (dispatchTime < prevDeliveredTime) {
                            startTime = prevDeliveredTime;
                            originLabel = 'Entrega Anterior';
                        }
                    }

                    item.calculatedDuration = deliveredTime - startTime;
                    item.durationLabel = formatDuration(item.calculatedDuration);
                    item.timeOrigin = originLabel;
                });
            });

            // Totais gerais
            const totalEntregas = allDeliveries.length;
            const totalEntregues = allDeliveries.filter(d => d.deliveryStatus === 'entregue' || d.result === 'entregue').length;
            const totalDevolvidas = totalEntregas - totalEntregues;
            const taxaSucesso = totalEntregas > 0 ? ((totalEntregues / totalEntregas) * 100).toFixed(1) : 0;

            // Renderizar resultados
            let html = `
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1rem;" class="no-print">
                    <button class="btn btn-secondary" onclick="window.exportReportToExcel('deliveryReportExportTable', 'Relatorio_Entregas')" style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">download</span>
                        Baixar Excel
                    </button>
                    <button class="btn btn-secondary" onclick="window.printReport(null, 'Relatório de Entregas')" style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-icons-round" style="font-size: 1.2rem;">print</span>
                        Imprimir
                    </button>
                </div>

                <div class="grid-4-col" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="card" style="padding: 1rem; text-align: center;">
                        <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Total</div>
                        <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${totalEntregas}</div>
                    </div>
                    <div class="card" style="padding: 1rem; text-align: center;">
                        <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Entregues</div>
                        <div style="font-size: 1.8rem; font-weight: 700; color: var(--accent-success);">${totalEntregues}</div>
                    </div>
                    <div class="card" style="padding: 1rem; text-align: center;">
                        <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Devolvidas</div>
                        <div style="font-size: 1.8rem; font-weight: 700; color: var(--accent-danger);">${totalDevolvidas}</div>
                    </div>
                    <div class="card" style="padding: 1rem; text-align: center;">
                        <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">Taxa Sucesso</div>
                        <div style="font-size: 1.8rem; font-weight: 700; color: ${parseFloat(taxaSucesso) >= 90 ? 'var(--accent-success)' : 'var(--accent-warning)'};">${taxaSucesso}%</div>
                    </div>
                </div>
            `;

            if (totalEntregas === 0) {
                html += `
                    <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <span class="material-icons-round" style="font-size: 4rem; opacity: 0.3;">search_off</span>
                        <h3 style="margin: 1rem 0 0.5rem;">Nenhuma entrega encontrada</h3>
                        <p style="margin: 0;">Ajuste os filtros para ver os resultados.</p>
                    </div>
                `;
            }

            // Cards por entregador
            Object.keys(stats).sort().forEach(person => {
                const s = stats[person];
                const successRate = s.total > 0 ? ((s.entregues / s.total) * 100).toFixed(1) : 0;
                const isMoto = s.items[0]?.deliveryType === 'moto';
                const icon = isMoto ? 'two_wheeler' : 'directions_car';
                const color = isMoto ? '#f59e0b' : '#10b981';

                html += `
                    <div class="card" style="margin-bottom: 2rem; border-left: 4px solid ${color};">
                        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.02);">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="material-icons-round" style="color: ${color};">${icon}</span>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.1rem;">${person}</h3>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal;">Performance: ${successRate}%</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 1rem; font-size: 0.9rem;">
                                <div style="text-align: right;">
                                    <div style="font-size: 0.7rem; color: var(--text-secondary);">Entregues</div>
                                    <div style="font-weight: 700; color: var(--accent-success);">${s.entregues}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 0.7rem; color: var(--text-secondary);">Devoluções</div>
                                    <div style="font-weight: 700; color: var(--accent-danger);">${s.devolvidas}</div>
                                </div>
                            </div>
                        </div>
                        <div class="card-body" style="padding: 0; overflow-x: auto;">
                            <table class="dispatch-table" style="width: 100%;">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>NF</th>
                                        <th>Cliente</th>
                                        <th>Bairro</th>
                                        <th style="white-space:nowrap; text-align: center;">H. Despacho</th>
                                        <th style="white-space:nowrap; text-align: center;">H. Baixa</th>
                                        <th style="white-space:nowrap; text-align: center;">Tempo Gasto</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${s.items.map(d => {
                    const date = new Date(d.deliveryCompletedAt || d.finalizedAt || d.date);
                    const dispatchDate = new Date(d.date);
                    const status = (d.deliveryStatus === 'entregue' || d.result === 'entregue') ? 'Entregue' : 'Devolvida';
                    const statusColor = status === 'Entregue' ? 'var(--accent-success)' : 'var(--accent-danger)';
                    const formatTime = (dateObj) => dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    return `
                                            <tr>
                                                <td>${date.toLocaleDateString('pt-BR')}</td>
                                                <td style="font-weight: bold;">${d.invoice}</td>
                                                <td>${d.client}</td>
                                                <td>${d.neighborhood || d.bairro || '-'}</td>
                                                <td style="font-family: monospace; color: var(--text-secondary); text-align: center;">${formatTime(dispatchDate)}</td>
                                                <td style="font-family: monospace; font-weight: bold; text-align: center;">${formatTime(date)}</td>
                                                <td style="font-family: monospace; color: var(--primary-color); text-align: center;" title="Contado a partir de: ${d.timeOrigin}">
                                                    ${d.durationLabel}
                                                </td>
                                                <td><span class="status-badge" style="background: ${status === 'Entregue' ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)'}; color: ${statusColor}">${status}</span></td>
                                            </tr>
                                        `;
                }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });

            // Tabela consolidada oculta para exportação
            html += `
                <table id="deliveryReportExportTable" style="display: none;">
                    <thead>
                        <tr>
                            <th>Entregador</th>
                            <th>Data</th>
                            <th>NF</th>
                            <th>Cliente</th>
                            <th>Bairro</th>
                            <th>H. Despacho</th>
                            <th>H. Baixa</th>
                            <th>Tempo Gasto</th>
                            <th>Status (Origem Tempo)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.keys(stats).sort().map(person => {
                return stats[person].items.map(d => {
                    const date = new Date(d.deliveryCompletedAt || d.finalizedAt || d.date);
                    const dispatchDate = new Date(d.date);
                    const status = (d.deliveryStatus === 'entregue' || d.result === 'entregue') ? 'Entregue' : 'Devolvida';
                    const formatTime = (dateObj) => dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    return `
                                <tr>
                                    <td>${person}</td>
                                    <td>${date.toLocaleDateString('pt-BR')}</td>
                                    <td>${d.invoice}</td>
                                    <td>${d.client}</td>
                                    <td>${d.city || '-'} - ${d.neighborhood || d.bairro || '-'}</td>
                                    <td>${formatTime(dispatchDate)}</td>
                                    <td>${formatTime(date)}</td>
                                    <td>${d.durationLabel}</td>
                                    <td>${status} (${d.timeOrigin})</td>
                                </tr>`;
                }).join('');
            }).join('')}
                    </tbody>
                </table>
            `;

            resultsContainer.innerHTML = html;
        };

        // --- FINAL INITIALIZATION ---

        populateCarrierSelect();
        if (typeof window.checkAuth === 'function') {
            window.checkAuth();
        }
        // Apply role-based restrictions after auth check
        if (typeof window.applyRoleRestrictions === 'function') {
            window.applyRoleRestrictions();
        }
        // --- WHATSAPP FIX (v1.6.3) ---
        window.sendWhatsApp = (id) => {
            const history = Utils.getStorage('dispatches');
            const d = history.find(item => item.id === id);
            if (!d) return;

            let phone = '';
            const cList = Utils.getStorage('clients');
            // Helper to normalize
            const norm = (s) => s ? s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() : '';

            const clientObj = cList.find(c => norm(c.nome) === norm(d.client));

            if (clientObj && clientObj.telefone) {
                phone = clientObj.telefone.replace(/\D/g, '');
            }

            if (!phone) {
                alert('Telefone do cliente não encontrado para envio do WhatsApp.\nVerifique o cadastro do cliente.');
                return;
            }

            // Format Lead Time: "D+X dias."
            const rawLead = (d.leadTime || '').replace(/\D/g, '');

            // User Request: Full Name and NO asterisks.
            let fullName = d.client || 'Cliente';
            if (typeof clientObj !== 'undefined' && clientObj && clientObj.nome) fullName = clientObj.nome;

            const msg = `Olá ${fullName}!\nInformamos que seu pedido NF: ${d.invoice} foi despachado via ${d.carrier}.\nPrevisão de Entrega: D+${rawLead} dias.\nLT Distribuidora agradece!\nQualquer dúvida, estamos à disposição!`;

            // Force WhatsApp Web
            const url = `https://web.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');


        };

        if (window.renderDashboard) window.renderDashboard();


        const vEl = document.getElementById('systemVersion');
        if (vEl) {
            // FORCE NO CACHE
            fetch('version.json?t=' + new Date().getTime())
                .then(r => r.json())
                .then(data => {
                    console.log('✅ SYSTEM VERSION:', data.version);
                    // Formata a data YYYY-MM-DD para DD/MM/YYYY manualmente
                    const dateParts = data.date.split('-');
                    const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    vEl.innerText = `v${data.version} • ${dateFormatted}`;
                })
                .catch(e => {
                    console.error('Erro ao carregar versão:', e);
                    vEl.innerText = 'v1.8.x (Error)';
                });
        }






































        // --- GESTÃO DE USUÁRIOS (Lógica) ---
        window.saveUserAction = () => {
            const name = document.getElementById('regUserName').value.trim();
            const login = document.getElementById('regUserLogin').value.trim();
            const pass = document.getElementById('regUserPass').value.trim();
            const role = document.getElementById('regUserRole').value;

            if (!name || !login || !pass) {
                alert('Preencha todos os campos obrigatórios.');
                return;
            }

            let users = Utils.getStorage('app_users');
            if (!Array.isArray(users)) users = [];

            const isEditing = typeof window.__editingUserIdx === 'number' && window.__editingUserIdx >= 0;

            if (isEditing) {
                // Modo Edição
                users[window.__editingUserIdx] = { name, login, pass, role };
                window.__editingUserIdx = -1; // Reset flag
            } else {
                // Modo Novo Cadastro
                // Verificar duplicidade de login
                if (users.some(u => u.login === login)) {
                    alert('Este login já está em uso por outro usuário.');
                    return;
                }
                users.push({ name, login, pass, role });
            }

            Utils.saveRaw('app_users', JSON.stringify(users));
            window.clearUserForm();

            // Atualiza UI
            if (window.renderUserList) window.renderUserList();

            showToast(isEditing ? '✅ Usuário atualizado!' : '✅ Usuário cadastrado!');
        };

        window.clearUserForm = () => {
            document.getElementById('formNewUser').reset();
            window.__editingUserIdx = -1;
            const btn = document.getElementById('btnSaveUser');
            if (btn) btn.innerHTML = '<span class="material-icons-round">save</span> Salvar Usuário';
        };

        // ========== GERENCIAMENTO DE CLIENTES ==========

        // Renderizar lista de clientes
        window.renderClientsList = (filterParam = '') => {
            const tbody = document.getElementById('clientListBody');
            const countSpan = document.getElementById('clientCount');
            const searchInput = document.getElementById('searchClientInput');
            const noCoverageCheck = document.getElementById('filterNoCoverage');

            if (!tbody) return;

            // Se filterParam for um evento (onchange do checkbox), ignora e pega do input
            let term = (typeof filterParam === 'string' ? filterParam : (searchInput?.value || '')).toLowerCase();
            const onlyNoCoverage = noCoverageCheck ? noCoverageCheck.checked : false;

            let filteredClients = clients.filter(c => {
                // Filtro de Texto
                const matchesText = !term || (
                    (c.nome || '').toLowerCase().includes(term) ||
                    (c.codigo || '').toLowerCase().includes(term) ||
                    (c.cidade || '').toLowerCase().includes(term)
                );

                if (!matchesText) return false;

                // Filtro de Cobertura
                if (onlyNoCoverage) {
                    const hasCoverage = typeof checkLogisticsCoverage === 'function' ? checkLogisticsCoverage(c.cidade, c.bairro) : true;
                    if (hasCoverage) return false; // Se tem cobertura, esconde
                }

                return true;
            });

            if (countSpan) {
                countSpan.textContent = `(${filteredClients.length} de ${clients.length})`;
            }

            if (filteredClients.length === 0) {
                tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    ${term || onlyNoCoverage ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado.'}
                </td>
            </tr>
        `;
                return;
            }

            tbody.innerHTML = filteredClients.slice(0, 100).map((c, idx) => {
                // Verifica cobertura 
                const hasCoverage = typeof checkLogisticsCoverage === 'function' ? checkLogisticsCoverage(c.cidade, c.bairro) : true;

                // Botão de Alerta na coluna de Ações
                const alertBtn = !hasCoverage ? `
            <button onclick="window.goToTableRegistration('${(c.cidade || '').replace(/'/g, "\\'")}')" 
                class="btn" 
                style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 4px; background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); border: 1px solid var(--accent-danger);" 
                title="SEM COBERTURA: Clique para cadastrar rota para ${c.cidade}">
                ⚠️ Rota
            </button>
        ` : '';

                return `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.6rem;">${c.codigo || '-'}</td>
            <td style="padding: 0.6rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.nome}">${c.nome || '-'}</td>
            <td style="padding: 0.6rem;">${c.cidade || '-'}</td>
            <td style="padding: 0.6rem; text-align: center;">
                <div style="display: flex; justify-content: center; align-items: center;">
                    ${alertBtn}
                    <button onclick="window.editClient(${clients.indexOf(c)})" class="btn btn-secondary" 
                        style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 4px;" title="Editar">✏️</button>
                    <button onclick="window.deleteClient(${clients.indexOf(c)})" class="btn btn-danger" 
                        style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>
    `}).join('');

            if (filteredClients.length > 100) {
                tbody.innerHTML += `
            <tr>
                <td colspan="4" style="text-align: center; padding: 0.5rem; color: var(--text-secondary); font-size: 0.8rem;">
                    ... e mais ${filteredClients.length - 100} clientes. Use a busca para filtrar.
                </td>
            </tr>
        `;
            }
        };

        window.goToTableRegistration = (city) => {
            if (!city) return;

            // Navegar para aba de regras
            window.showSection('rules');

            // Preencher campo cidade e focar
            setTimeout(() => {
                const cityInput = document.getElementById('ruleCity');
                if (cityInput) {
                    cityInput.value = city;
                    cityInput.focus();
                    window.showToast(`📍 Preenchendo cadastro para: ${city}`);

                    // Opcional: Filtrar a lista de tabelas para mostrar se já existe algo parcial
                    if (window.updateRuleFilter) {
                        const searchInput = document.querySelector('#tableRules .filter-input');
                        if (searchInput) searchInput.value = city;
                        window.updateRuleFilter('cidade', city);
                    }
                }
            }, 300); // Delay para garantir transição da aba
        };

        // Editar cliente
        window.editClient = (idx) => {
            const client = clients[idx];
            if (!client) return;

            document.getElementById('newClientCNPJ').value = client.cnpj || '';
            document.getElementById('newClientName').value = client.nome || '';
            document.getElementById('newClientCode').value = client.codigo || '';
            document.getElementById('newClientCity').value = client.cidade || '';
            document.getElementById('newClientNeighborhood').value = client.bairro || '';
            document.getElementById('newClientAddress').value = client.endereco || '';
            document.getElementById('newClientPhone').value = client.telefone || '';
            document.getElementById('editingClientMode').value = 'true';
            document.getElementById('editingClientId').value = idx;

            const btnSubmit = document.getElementById('btnSubmitClient');
            btnSubmit.innerHTML = 'ATUALIZAR';
            document.getElementById('btnCancelEditClient').style.display = 'block';

            document.getElementById('formNewClient').scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('✏️ Editando cliente');
        };

        // Excluir cliente
        window.deleteClient = (idx) => {
            const client = clients[idx];
            if (!client) return;

            if (confirm(`Tem certeza que deseja excluir o cliente "${client.nome}"?`)) {
                clients.splice(idx, 1);
                Utils.setStorage('clients', clients);
                window.renderClientsList();
                showToast('🗑️ Cliente excluído');
            }
        };

        // Resetar formulário de cliente
        window.resetClientForm = () => {
            document.getElementById('formNewClient').reset();
            document.getElementById('editingClientMode').value = 'false';
            document.getElementById('editingClientId').value = '';
            const btnSubmit = document.getElementById('btnSubmitClient');
            btnSubmit.innerHTML = '<span class="material-icons-round" style="font-size: 1.2rem;">add_business</span> CADASTRAR';
            document.getElementById('btnCancelEditClient').style.display = 'none';
        };

        // Formulário de cliente
        const formNewClient = document.getElementById('formNewClient');
        if (formNewClient) {
            // Cancelar edição
            document.getElementById('btnCancelEditClient').addEventListener('click', window.resetClientForm);

            // Buscar por CNPJ
            const btnSearchClientCNPJ = document.getElementById('btnSearchClientCNPJ');
            if (btnSearchClientCNPJ && window.CNPJLookup) {
                btnSearchClientCNPJ.addEventListener('click', () => {
                    const cnpjInput = document.getElementById('newClientCNPJ');
                    const cnpj = cnpjInput.value.trim();

                    if (cnpj && window.CNPJLookup.isValidFormat(cnpj)) {
                        // Buscar diretamente
                        btnSearchClientCNPJ.disabled = true;
                        btnSearchClientCNPJ.innerHTML = '⏳';

                        window.CNPJLookup.lookup(cnpj).then(data => {
                            document.getElementById('newClientName').value = data.nomeFantasia || data.razaoSocial;
                            document.getElementById('newClientCNPJ').value = data.cnpj;
                            document.getElementById('newClientCity').value = `${data.cidade} - ${data.uf}`;
                            document.getElementById('newClientNeighborhood').value = data.bairro || '';
                            document.getElementById('newClientAddress').value =
                                `${data.logradouro}${data.numero ? ', ' + data.numero : ''}`;
                            document.getElementById('newClientPhone').value = data.telefone || '';

                            showToast(`✅ Dados carregados: ${data.nomeFantasia || data.razaoSocial}`);
                        }).catch(err => {
                            showToast(`❌ ${err.message}`);
                        }).finally(() => {
                            btnSearchClientCNPJ.disabled = false;
                            btnSearchClientCNPJ.innerHTML = '🔍';
                        });
                    } else {
                        // Abrir modal
                        window.CNPJLookup.showLookupModal((data) => {
                            document.getElementById('newClientName').value = data.nomeFantasia || data.razaoSocial;
                            document.getElementById('newClientCNPJ').value = data.cnpj;
                            document.getElementById('newClientCity').value = `${data.cidade} - ${data.uf}`;
                            document.getElementById('newClientNeighborhood').value = data.bairro || '';
                            document.getElementById('newClientAddress').value =
                                `${data.logradouro}${data.numero ? ', ' + data.numero : ''}`;
                            document.getElementById('newClientPhone').value = data.telefone || '';

                            showToast(`✅ Dados preenchidos: ${data.nomeFantasia || data.razaoSocial}`);
                        }, 'Buscar Cliente por CNPJ');
                    }
                });
            }

            // Busca de clientes na lista
            const searchClientInput = document.getElementById('searchClientInput');
            if (searchClientInput) {
                searchClientInput.addEventListener('input', (e) => {
                    window.renderClientsList(e.target.value);
                });
            }

            // Submit do formulário
            formNewClient.addEventListener('submit', (e) => {
                e.preventDefault();

                const isEditing = document.getElementById('editingClientMode').value === 'true';
                const editIdx = parseInt(document.getElementById('editingClientId').value) || -1;

                const nome = document.getElementById('newClientName').value.trim();
                if (!nome) {
                    showToast('❌ Nome é obrigatório');
                    return;
                }

                const clientData = {
                    cnpj: document.getElementById('newClientCNPJ').value.trim(),
                    nome: nome.toUpperCase(),
                    codigo: document.getElementById('newClientCode').value.trim().toUpperCase() ||
                        nome.substring(0, 10).toUpperCase().replace(/\s+/g, ''),
                    cidade: document.getElementById('newClientCity').value.trim().toUpperCase(),
                    bairro: document.getElementById('newClientNeighborhood').value.trim().toUpperCase(),
                    endereco: document.getElementById('newClientAddress').value.trim(),
                    telefone: document.getElementById('newClientPhone').value.trim()
                };

                if (isEditing && editIdx >= 0) {
                    clients[editIdx] = { ...clients[editIdx], ...clientData };
                    showToast('✅ Cliente atualizado!');
                } else {
                    // Verificar duplicado
                    const exists = clients.find(c => c.codigo === clientData.codigo ||
                        (clientData.cnpj && c.cnpj === clientData.cnpj));
                    if (exists) {
                        if (!confirm('Já existe um cliente com esse código ou CNPJ. Cadastrar mesmo assim?')) {
                            return;
                        }
                    }
                    clients.push(clientData);
                    showToast('✅ Cliente cadastrado!');
                }

                Utils.setStorage('clients', clients);
                window.resetClientForm();
                window.renderClientsList();
            });
        }

        // Renderizar clientes na abertura da seção system
        if (document.getElementById('clientListBody')) {
            window.renderClientsList();
        }

    } catch (err) {
        console.error("FATAL ERROR IN APP.JS:", err);
    }
});

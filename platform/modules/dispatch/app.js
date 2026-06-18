// v3.11.71 FIX: Registra _doDispatchLogin NO TOPO DO ARQUIVO, fora do DOMContentLoaded.
// O app.js tem 483KB. O browser exibe o HTML (com o botão visível) ANTES de terminar
// de baixar+executar o app.js. Se o _doDispatchLogin só fosse definido dentro do
// DOMContentLoaded, o usuário que clica cedo receberia o alert 'Sistema ainda carregando'.
// Agora o placeholder fica disponível assim que o script começa a executar.
(function() {
    var _loginQueue = null;
    window._doDispatchLogin = function() {
        var btn = document.getElementById('btnLogin');
        if (window._doDispatchLoginReal) {
            // Handler real já disponível — executa imediatamente
            return window._doDispatchLoginReal();
        }
        // Handler real ainda não carregado — aguarda com polling (máx 15s)
        if (btn) { btn.disabled = true; btn.innerHTML = '\u23F3 Carregando...'; }
        if (_loginQueue) return; // evita duplo click
        _loginQueue = true;
        var t0 = Date.now();
        var id = setInterval(function() {
            if (window._doDispatchLoginReal || (Date.now() - t0) > 15000) {
                clearInterval(id);
                _loginQueue = null;
                if (btn) { btn.disabled = false; btn.innerHTML = 'ACESSAR SISTEMA'; }
                if (window._doDispatchLoginReal) {
                    window._doDispatchLoginReal();
                } else {
                    alert('Erro ao carregar o sistema. Recarregue a p\u00E1gina (Ctrl+Shift+R).');
                }
            }
        }, 100);
    };
})();

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // GLOBAL UI UTILS
        // showToast — versão unificada (v3.12.2)
        // Suporta duração customizada: showToast('msg', 5000)
        window.showToast = (message, duration) => {
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.backgroundColor = 'var(--accent-success, #22c55e)';
            toast.style.color = 'white';
            toast.style.padding = '12px 24px';
            toast.style.borderRadius = 'var(--radius-md, 8px)';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            toast.style.zIndex = '1000000';
            toast.style.fontWeight = '600';
            toast.style.display = 'flex';
            toast.style.alignItems = 'center';
            toast.style.gap = '8px';
            toast.style.fontSize = '0.9rem';
            toast.style.animation = 'slideIn 0.3s ease-out';
            toast.innerHTML = `<span class="material-icons-round">check_circle</span> ${message}`;
            document.body.appendChild(toast);
            const ms = duration || 3000;
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, ms);
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

        // _appReady: flag interna para controle de sincronização
        let _appReady = false;

        // SYNC OVERLAY
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'syncOverlay';
        loadingOverlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;font-family:sans-serif;";
        loadingOverlay.innerHTML = '<div style="font-size:3rem;">☁️</div><h2 style="margin-top:20px;color:#333;">Sincronizando Dados...</h2><p>Conectando ao Banco de Dados Seguro</p>';
        document.body.appendChild(loadingOverlay);

        // Cloud Sync — com timeout de 8s para não travar o app
        try {
            if (Utils.Cloud) {
                const _syncTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('loadAll timeout 8s')), 8000)
                );
                await Promise.race([Utils.Cloud.loadAll(), _syncTimeout]);
            }
        } catch (e) {
            console.warn('[App] Cloud.loadAll falhou ou timeout — continuando offline:', e.message);
        } finally {
            // Remove Overlay e SEMPRE libera _appReady
            _appReady = true;
            if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
        }

        // ── VERIFICAÇÃO DE CONECTIVIDADE FIREBASE ───────────────────────────
        // Se Firebase não inicializou, avisa imediatamente
        setTimeout(() => {
            if (!window.db || typeof firebase === 'undefined') {
                console.error('❌ [App] Firebase NÃO inicializou! Modo offline ativo.');
                if (Utils.Cloud && Utils.Cloud._showOfflineBadge) {
                    Utils.Cloud._showOfflineBadge('FIREBASE NÃO CONECTADO — Dados ficando apenas locais!');
                }
            } else {
                // Firebase OK — verifica tamanho dos dispatches
                const dispatchesRaw = localStorage.getItem(Utils._storageKey('dispatches')) || '[]';
                const dispSize = dispatchesRaw.length;
                if (dispSize > 800000) { // 80% do limite — alerta preventivo
                    const kb = (dispSize/1024).toFixed(0);
                    const msg = `⚠️ ATENÇÃO: Histórico de despachos está grande (${kb}KB de máximo 1000KB).\n\nRecomenda-se arquivar os registros antigos em Relatórios antes de atingir o limite e bloquear o sincronismo.`;
                    console.warn(msg);
                    if (window.showToast) window.showToast(`⚠️ Histórico de despachos grande: ${kb}KB. Arquive os dados antigos.`);
                }
                console.log(`✅ [App] Firebase conectado. Dispatches: ${(dispSize/1024).toFixed(1)}KB`);
            }
        }, 1500);

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

        // Fallback: se os clientes sumirem (localStorage limpo), restaura do backup do data.js
        if (clients.length === 0 && typeof window.initialClientes !== 'undefined') {
            console.log("Restaurando clientes do backup estático...");
            clients = window.initialClientes;
            Utils.setStorage('clients', clients);
        }
        let rules = Utils.getStorage('freight_tables') || [];

        // Removido inicialização automática de dados de exemplo para evitar sobrescrever dados do usuário
        // if (rules.length === 0 && window.initialTabelas) { ... }

        let carrierConfigs = Utils.getStorage('carrier_configs');
        // v3.11.57: fix TypeError — getStorage pode retornar null quando a chave não existe
        if (!carrierConfigs || typeof carrierConfigs !== 'object' || Array.isArray(carrierConfigs) || Object.keys(carrierConfigs).length === 0) {
            // Initial empty state, will be populated based on existing carriers
            carrierConfigs = {};
        }

        // CARRIER LIST - MULTI-TENANT READY (v1.8.21)
        // Load from storage - starts empty for new clients
        let carrierList = Utils.getStorage('carrier_list');

        // CORREÇÃO: Não sobrescrever dados da nuvem
        const carrierListRaw = localStorage.getItem(Utils._storageKey('carrier_list'));
        if (!carrierListRaw || carrierListRaw === 'null' || carrierListRaw === 'undefined') {
            // Cliente NOVO - começa com lista vazia (mas não envia para nuvem!)
            carrierList = [];
            localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));
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
        const rawUsers = localStorage.getItem(Utils._storageKey('app_users'));
        if (!rawUsers || rawUsers === 'null' || rawUsers === '[]' || rawUsers === 'undefined') {
            // Verificar se há algo na nuvem antes de criar default
            // Se acabamos de carregar da nuvem e está vazio, criamos o admin
            if (!users || !Array.isArray(users) || users.length === 0) {
                console.log('👤 Criando usuário admin padrão (nenhum usuário encontrado)');
                users = [{ name: 'Administrador', login: 'admin', pass: 'admin', role: 'supervisor' }];
                // Salvar localmente, mas NÃO enviar para nuvem (para não sobrescrever dados de outras sessões)
                localStorage.setItem(Utils._storageKey('app_users'), JSON.stringify(users));
            }
            // Já existem usuários salvos, usar eles
            users = Utils.getStorage('app_users') || [];
            console.log(`👥 ${users.length} usuários carregados`);
        }

        // Sellers: Load from Storage
        let sellers = Utils.getStorage('app_sellers') || [];
        console.log(`👤 ${sellers.length} vendedores carregados`);

        // App Settings: Load and Parametrize
        window.loadAppSettings = function() {
            const settings = Utils.getStorage('app_settings') || {
                wa_auto_seller: true,
                wa_auto_client: false
            };
            const chkSeller = document.getElementById('cfg_wa_auto_seller');
            const chkClient = document.getElementById('cfg_wa_auto_client');
            if (chkSeller) chkSeller.checked = settings.wa_auto_seller;
            if (chkClient) chkClient.checked = settings.wa_auto_client;
            window.app_settings = settings;
        };
        window.saveAppSettings = function() {
            const settings = {
                wa_auto_seller: document.getElementById('cfg_wa_auto_seller').checked,
                wa_auto_client: document.getElementById('cfg_wa_auto_client').checked
            };
            Utils.setStorage('app_settings', settings);
            window.app_settings = settings;
            window.showToast('✅ Configurações salvas com sucesso!');
        };
        window.loadAppSettings();

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
                    // Etapa 3: sincroniza AppState com a sessão restaurada
                    if (typeof AppState !== 'undefined') AppState.set('currentUser', valid);
                    if (loginOverlay) loginOverlay.style.display = 'none';
                    return;
                }
            }
            // No session
            currentUser = null;
            if (typeof AppState !== 'undefined') AppState.set('currentUser', null);
            if (loginOverlay) {
                loginOverlay.style.display = 'flex';
                const users = Utils.getStorage('app_users');
                if (loginUserSelect) loginUserSelect.innerHTML = users.map(u => `<option value="${u.login}">${u.name}</option>`).join('');
            }
        };

        window.logoutUser = () => {
            if (confirm('Deseja realmente sair do sistema?')) {
                // Etapa 3: limpa AppState na saída
                if (typeof AppState !== 'undefined') {
                    AppState.set('currentUser', null);
                    AppState.set('appReady', false);
                }
                localStorage.removeItem('logged_user');
                localStorage.removeItem('platform_user_logged');
                localStorage.removeItem('app_tenant_id');
                sessionStorage.removeItem('parreira_session');
                sessionStorage.clear();
                location.reload();
            }
        };

        // Helper: Check if current user is supervisor
        window.isSupervisor = () => {
            const storedUser = Utils.getStorage('logged_user');
            return storedUser && storedUser.role === 'supervisor';
        };

        // ──────────────────────────────────────────────────────────────────────────────
        // Helper: Modal de senha de supervisor com input mascarado (type=password)
        // Uso: window.requestSupervisorPassword('Título da ação', (supervisor) => { ... })
        // ──────────────────────────────────────────────────────────────────────────────
        window.requestSupervisorPassword = (title, onConfirm) => {
            // Injeta o modal na primeira chamada
            if (!document.getElementById('supPassModal')) {
                const overlay = document.createElement('div');
                overlay.id = 'supPassModal';
                overlay.style.cssText = [
                    'display:none; position:fixed; inset:0; z-index:9999;',
                    'background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);',
                    'align-items:center; justify-content:center;'
                ].join('');
                overlay.innerHTML = `
                    <div style="background:#1e293b; border:1px solid #334155; border-radius:12px;
                                padding:28px 32px; min-width:320px; max-width:420px; width:90%;
                                box-shadow:0 20px 60px rgba(0,0,0,0.5); font-family:inherit;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                            <span style="font-size:1.4rem;">🔐</span>
                            <div>
                                <div style="font-size:0.7rem; color:#ef4444; font-weight:700;
                                            letter-spacing:0.08em; text-transform:uppercase;
                                            margin-bottom:2px;">AÇÃO RESTRITA</div>
                                <div id="supPassTitle" style="font-size:1rem; font-weight:600;
                                            color:#f1f5f9;"></div>
                            </div>
                        </div>
                        <label style="display:block; font-size:0.82rem; color:#94a3b8;
                                     margin-bottom:6px;">Senha de Supervisor</label>
                        <div style="position:relative;">
                            <input id="supPassInput" type="password" autocomplete="current-password"
                                placeholder="Digite a senha..."
                                style="width:100%; box-sizing:border-box; padding:10px 40px 10px 12px;
                                       background:#0f172a; border:1px solid #475569; border-radius:8px;
                                       color:#f1f5f9; font-size:0.95rem; outline:none;
                                       font-family:inherit; letter-spacing:0.1em;"/>
                            <button id="supPassToggle" type="button"
                                onclick="(function(){var i=document.getElementById('supPassInput');
                                    var b=document.getElementById('supPassToggle');
                                    if(i.type==='password'){i.type='text';b.textContent='🙈';}
                                    else{i.type='password';b.textContent='👁';}})()"
                                style="position:absolute; right:10px; top:50%; transform:translateY(-50%);
                                       background:none; border:none; cursor:pointer; font-size:1rem;
                                       color:#94a3b8; padding:0; line-height:1;">👁</button>
                        </div>
                        <div id="supPassError" style="color:#ef4444; font-size:0.8rem;
                                     min-height:18px; margin-top:6px;"></div>
                        <div style="display:flex; gap:10px; margin-top:18px; justify-content:flex-end;">
                            <button id="supPassCancel"
                                style="padding:8px 20px; border-radius:8px; border:1px solid #475569;
                                       background:transparent; color:#94a3b8; cursor:pointer;
                                       font-size:0.9rem; font-family:inherit;">
                                Cancelar
                            </button>
                            <button id="supPassConfirm"
                                style="padding:8px 20px; border-radius:8px; border:none;
                                       background:#3b82f6; color:#fff; cursor:pointer;
                                       font-size:0.9rem; font-weight:600; font-family:inherit;">
                                Confirmar
                            </button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);
            }

            const modal   = document.getElementById('supPassModal');
            const input   = document.getElementById('supPassInput');
            const errEl   = document.getElementById('supPassError');
            const titleEl = document.getElementById('supPassTitle');
            const btnOk   = document.getElementById('supPassConfirm');
            const btnCan  = document.getElementById('supPassCancel');

            // Prepara o modal
            titleEl.textContent = title;
            input.value = '';
            input.type  = 'password';
            document.getElementById('supPassToggle').textContent = '👁';
            errEl.textContent = '';
            modal.style.display = 'flex';
            setTimeout(() => input.focus(), 80);

            const close = () => { modal.style.display = 'none'; };

            // Clona botões para limpar listeners antigos
            const newOk  = btnOk.cloneNode(true);
            const newCan = btnCan.cloneNode(true);
            btnOk.parentNode.replaceChild(newOk, btnOk);
            btnCan.parentNode.replaceChild(newCan, btnCan);

            const doConfirm = () => {
                const pass = input.value;
                const allUsers = Utils.getStorage('app_users') || [];
                const supervisor = allUsers.find(u => u.role === 'supervisor' && u.pass === pass);
                if (!supervisor) {
                    errEl.textContent = '❌ Senha incorreta ou sem permissão de supervisor.';
                    input.focus();
                    return;
                }
                close();
                onConfirm(supervisor);
            };

            document.getElementById('supPassConfirm').addEventListener('click', doConfirm);
            document.getElementById('supPassCancel').addEventListener('click', close);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConfirm(); });
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
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
                system: document.querySelector('a[href="#system"]'),
                appSettings: document.querySelector('a[href="#app-settings"]'),
                occurrences: document.querySelector('a[href="#occurrences"]')
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
                // Ocorrências: visível para supervisor/admin
                if (allNavItems.occurrences) allNavItems.occurrences.style.display = 'flex';
                return;
            }

            // REGULAR USER (Operacional): Hide admin menus, but show moto, carro and system (for client registration)
            if (allNavItems.reports) allNavItems.reports.style.display = 'none';
            if (allNavItems.configs) allNavItems.configs.style.display = 'none';
            if (allNavItems.appSettings) allNavItems.appSettings.style.display = 'none';
            if (allNavItems.system) allNavItems.system.style.display = 'flex'; // Show system for client registration
            if (allNavItems.acontec) allNavItems.acontec.style.display = 'none';
            if (allNavItems.occurrences) allNavItems.occurrences.style.display = 'none'; // Ocorrências: apenas supervisor
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
            // Função que busca usuários do tenant no Firestore
            const loadUsersForTenant = async () => {
                const tenantId = tenantInput.value.trim().toLowerCase();
                if (!tenantId) return;

                // Garantir que window.db está disponível — com retry se Firebase ainda carregando
                let db = window.db;
                if (!db && typeof firebase !== 'undefined') {
                    try { db = window.db = firebase.firestore(); } catch(e) { db = null; }
                }
                if (!db) {
                    // Firebase ainda não pronto — tenta novamente em 1s (máx 3 tentativas)
                    if (!(loadUsersForTenant._retries >= 3)) {
                        loadUsersForTenant._retries = (loadUsersForTenant._retries || 0) + 1;
                        console.warn(`[Login] Firebase não disponível ainda. Tentativa ${loadUsersForTenant._retries}/3 em 1s...`);
                        setTimeout(loadUsersForTenant, 1000);
                    } else {
                        console.warn('[Login] Firebase indisponível após 3 tentativas — usando admin padrão.');
                    }
                    return;
                }
                loadUsersForTenant._retries = 0; // reset para próxima chamada

                console.log(`👥 [Login] Buscando usuários do tenant: ${tenantId}...`);

                // v3.11.67: Busca do sistema novo (tenants/{id}/users) com fallback para legacy
                try {
                    let usersFromCloud = [];

                    // Tenta sistema novo primeiro
                    const usersSnap = await db.collection('tenants').doc(tenantId).collection('users').get();
                    if (!usersSnap.empty) {
                        usersFromCloud = usersSnap.docs
                            .filter(d => d.data().ativo !== false)
                            .map(d => {
                                const u = d.data();
                                return {
                                    name:      u.nome || u.name || d.id,
                                    login:     u.login || d.id,
                                    senhaHash: u.senhaHash || '',
                                    role:      u.role || 'operator',
                                    ativo:     u.ativo !== false
                                };
                            });
                        console.log(`✅ [Login] ${usersFromCloud.length} usuário(s) carregado(s) do sistema novo`);
                    } else {
                        // Fallback: sistema legado (legacy_store/app_users)
                        const doc = await db.collection('tenants').doc(tenantId).collection('legacy_store').doc('app_users').get();
                        if (doc.exists && doc.data().content) {
                            usersFromCloud = JSON.parse(doc.data().content);
                            console.log(`⚠️ [Login] Usando sistema legado (${usersFromCloud.length} usuários)`);
                        }
                    }

                    if (usersFromCloud.length > 0) {
                        // v3.11.86 FIX: Salva com namespace de tenant para evitar contaminação cross-tenant
                        // NÃO usar Utils.saveRaw('app_users') sem prefixo — isso vaza para outros tenants
                        localStorage.setItem(`_app_users_${tenantId}`, JSON.stringify(usersFromCloud));
                        loginUserSelect.innerHTML = usersFromCloud.map(u => {
                            // Sistema novo usa 'nome', legado usa 'name' — suportar ambos
                            const displayName = u.nome || u.name || u.login;
                            return `<option value="${u.login}">${displayName} (${u.login})</option>`;
                        }).join('');
                        console.log(`✅ [Login] Dropdown populado com ${usersFromCloud.length} usuário(s) [tenant=${tenantId}]`);
                    } else {
                        loginUserSelect.innerHTML = '<option value="admin">Administrador (admin)</option>';
                        console.log('⚠️ [Login] Nenhum usuário encontrado, usando admin padrão');
                    }
                } catch (error) {
                    console.error('❌ [Login] Erro ao carregar usuários:', error);
                    loginUserSelect.innerHTML = '<option value="admin">Administrador (admin)</option>';
                }
            };

            // Executar ao sair do campo (blur)
            tenantInput.addEventListener('blur', loadUsersForTenant);

            // Também executar enquanto digita (com debounce de 600ms)
            let _tenantDebounce = null;
            tenantInput.addEventListener('input', () => {
                clearTimeout(_tenantDebounce);
                _tenantDebounce = setTimeout(loadUsersForTenant, 600);
            });

            // Também executar se usuário pressionar Enter no campo de tenant
            tenantInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(_tenantDebounce);
                    loadUsersForTenant();
                    loginPassInput.focus();
                }
            });

            // Se já tem valor no campo (ex: value="ltdistribuidora"), carregar automaticamente
            // Usa delay maior e retry interno para garantir que Firebase já inicializou
            if (tenantInput.value.trim()) {
                setTimeout(loadUsersForTenant, 800);
            }
        }

        if (btnLogin) {

            // v3.11.59: Handler real — substitui o placeholder registrado no início
            window._doDispatchLoginReal = async () => {
            _appReady = true; // libera o placeholder ao entrar no handler real
            window._doDispatchLogin = window._doDispatchLoginReal; // alias para compatibilidade

            // GARANTIA: botão SEMPRE é restaurado ao final (try/finally)
            try {
                const login = loginUserSelect.value;
                const pass = loginPassInput.value;
                const tenantInput = document.getElementById('loginTenantInput');
                const tenantId = tenantInput ? tenantInput.value.trim().toLowerCase() : '';

                if (!tenantId) {
                    alert('Informe o ID da Empresa.');
                    return;
                }

                // Mostrar loading durante validação
                btnLogin.disabled = true;
                btnLogin.innerHTML = '⏳ Verificando empresa...';

                // Security: Valida tenant consultando o Firestore
                // (substitui whitelist hardcoded — qualquer tenant cadastrado no painel master
                //  com { ativo: true } é automaticamente aceito, sem necessidade de novo deploy)
                try {
                    if (window.db) {
                        const tenantDoc = await window.db.collection('tenants').doc(tenantId).get();
                        if (!tenantDoc.exists || tenantDoc.data().ativo === false) {
                            btnLogin.disabled = false;
                            btnLogin.innerHTML = 'ACESSAR SISTEMA';
                            alert(`A empresa '${tenantId}' não está habilitada no sistema.\n\nVerifique a grafia ou entre em contato com o suporte.`);
                            return;
                        }
                        console.log(`✅ [Login] Tenant validado no Firestore: ${tenantId}`);
                    } else {
                        // Firebase offline: fallback para whitelist local
                        const storedTenants = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');
                        const dynamicIds = storedTenants.map(t => t.id);
                        const ALLOWED_TENANTS = ['parreiralog', 'centralpecas', 'ltdistribuidora', 'parreira', ...dynamicIds];
                        if (!ALLOWED_TENANTS.includes(tenantId)) {
                            btnLogin.disabled = false;
                            btnLogin.innerHTML = 'ACESSAR SISTEMA';
                            alert(`A empresa '${tenantId}' não está habilitada.\n\nVerifique a grafia ou contate o suporte.`);
                            return;
                        }
                        console.warn('[Login] Firebase indisponível — validação via whitelist local.');
                    }
                } catch (tenantCheckErr) {
                    console.warn('[Login] Erro ao validar tenant no Firestore:', tenantCheckErr.message);
                    // Em caso de erro de rede, permite continuar (fail-open para não bloquear clientes)
                }

                // Continua o loading para o processo de login
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

                    // Definir novo tenant ANTES de usar _storageKey
                    Utils.Cloud.setTenantId(tenantId);
                    localStorage.setItem('app_tenant_id', tenantId);

                    keysToClean.forEach(k => {
                        localStorage.removeItem(k);
                        localStorage.removeItem(Utils._storageKey(k));
                        console.log(`🧹 Limpando local: ${k}`);
                    });

                    // v3.11.84: Resetar Anti-Echo para permitir carga da nuvem no login
                    keysToClean.forEach(k => { delete Utils.lastWriteTime[k]; });
                    localStorage.removeItem('_lwt_persist');
                    console.log('🔓 [Login] Anti-Echo resetado para carga inicial do tenant.');
                } else {
                    // Mesmo tenant — garante que tenant está configurado e reseta Anti-Echo
                    Utils.Cloud.setTenantId(tenantId);
                    localStorage.setItem('app_tenant_id', tenantId);
                    // v3.11.84: Resetar Anti-Echo para garantir leitura atual da nuvem
                    const syncKeys = ['carrier_list', 'carrier_configs', 'carrier_info_v2', 'freight_tables', 'app_users'];
                    syncKeys.forEach(k => { delete Utils.lastWriteTime[k]; });
                    localStorage.removeItem('_lwt_persist');
                }

                // v3.11.75 FIX: loadAll() agora tem Fase 1 (chaves críticas de transportadora)
                // que completa em paralelo ANTES das demais.
                if (Utils.Cloud && Utils.Cloud.hasTenant()) {
                    console.log(`📥 [Login] Carregando dados frescos do tenant: ${tenantId}...`);
                    try {
                        await Utils.Cloud.loadAll();
                    } catch (loadErr) {
                        console.warn('[Login] loadAll falhou:', loadErr.message, '— continuando com dados locais.');
                    }
                }

                // Re-read users from storage (agora já com dados do tenant correto)
                users = Utils.getStorage('app_users') || [];

                // v3.11.67: Login — sistema novo (SHA-256) com fallback para legado (texto puro)
                let user = null;

                // Tenta validar direto no Firestore (sistema novo)
                if (window.db) {
                    try {
                        const _uDoc = await window.db.collection('tenants').doc(tenantId).collection('users').doc(login).get();
                        if (_uDoc.exists && _uDoc.data().ativo !== false) {
                            const _ud = _uDoc.data();
                            const _hBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
                            const _hHex = Array.from(new Uint8Array(_hBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
                            if (_hHex === _ud.senhaHash) {
                                user = { name: _ud.nome || _ud.login || login, login: _ud.login || login, role: _ud.role || 'operator' };
                                console.log(`✅ [Login] Validado no sistema novo: ${login}`);
                            }
                        }
                    } catch (_e) { console.warn('[Login] Erro ao validar no sistema novo:', _e.message); }
                }

                // Fallback: sistema legado (senha texto puro em localStorage)
                if (!user) {
                    const _lu = users.find(u => u.login === login);
                    if (_lu && _lu.pass === pass) {
                        user = _lu;
                        console.log(`⚠️ [Login] Validado no sistema legado: ${login}`);
                    }
                }

                // Admin Fallback always active for setup
                if (!user && login === 'admin' && pass === 'admin') {
                    user = { name: 'Administrador (Setup)', login: 'admin', pass: 'admin', role: 'supervisor' };
                }

                if (user) {
                    currentUser = user;
                    Utils.saveRaw('logged_user', JSON.stringify(user));

                    // Etapa 3: sincroniza AppState com usuário logado
                    if (typeof AppState !== 'undefined') AppState.set('currentUser', user);

                    if (loginOverlay) loginOverlay.style.display = 'none';
                    showToast(`Bem-vindo, ${user.name}! [${tenantId}]`);

                    // v3.11.72 FIX: Re-ler variáveis de closure do localStorage após loadAll().
                    // renderCarrierConfigs() e outras funções usam as variáveis locais
                    // (carrierList, carrierConfigs, carrierInfo, rules) — não re-lêem do storage.
                    // Sem este bloco, mesmo com loadAll() salvando no localStorage, a UI
                    // continuava mostrando os valores stale lidos na inicialização do app.
                    carrierList = Utils.getStorage('carrier_list') || [];
                    carrierConfigs = Utils.getStorage('carrier_configs') || {};
                    if (!carrierConfigs || typeof carrierConfigs !== 'object' || Array.isArray(carrierConfigs)) carrierConfigs = {};
                    carrierInfo = Utils.getStorage('carrier_info_v2') || {};
                    if (Array.isArray(carrierInfo)) carrierInfo = {};
                    rules = Utils.getStorage('freight_tables') || [];
                    console.log(`🔄 [Login] Variáveis recarregadas: ${carrierList.length} transportadoras, ${rules.length} tabelas.`);

                    // v3.11.74 AUTO-REBUILD: Se carrier_list está vazia ou incompleta,
                    // reconstrói silenciosamente a partir das tabelas de frete.
                    // Isso corrige o caso onde o Firestore tem carrier_list corrompida/apagada
                    // mas freight_tables contém todas as transportadoras reais.
                    if (rules.length > 0) {
                        const carriersInTables = [...new Set(rules.map(r => r.transportadora))].filter(c => c).sort();
                        if (carriersInTables.length > carrierList.length) {
                            console.warn(`🔧 [Auto-Rebuild] carrier_list tem ${carrierList.length} itens, mas freight_tables tem ${carriersInTables.length} transportadoras únicas. Reconstruindo...`);
                            carrierList = carriersInTables;
                            // Salva localmente (sem atualizar lastWriteTime para não bloquear sync)
                            localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));
                            // Envia para nuvem para corrigir o Firestore corrompido
                            if (Utils.Cloud && Utils.Cloud.hasTenant()) {
                                Utils.Cloud.save('carrier_list', carrierList);
                            }
                            showToast(`🔧 Lista de transportadoras reconstruída automaticamente (${carrierList.length} transportadoras).`);
                            console.log(`✅ [Auto-Rebuild] carrier_list reconstruída: ${carrierList.join(', ')}`);
                        }
                    }

                    // Apply role-based UI restrictions
                    if (window.applyRoleRestrictions) window.applyRoleRestrictions();

                    // Iniciar listeners de sync em tempo real
                    if (Utils.Cloud && Utils.Cloud.hasTenant()) {
                        Utils.Cloud.listen();
                    }

                    // Etapa 3: sincroniza AppState completo após loadAll
                    if (typeof AppState !== 'undefined') {
                        AppState.syncFromStorage();
                        AppState.set('appReady', true);
                    }

                    // Force Dashboard Render after Login
                    if (window.showSection) window.showSection('dashboard');
                    else if (window.renderDashboard) window.renderDashboard();

                    // v3.11.84: Render imediato de transportadoras após loadAll
                    const _diag = {
                        carrierListLen: carrierList.length,
                        lsKey: Utils._storageKey('carrier_list'),
                        lsRaw: localStorage.getItem(Utils._storageKey('carrier_list'))
                    };
                    console.log('[Login] Diagnóstico pós-loadAll:', JSON.stringify(_diag));
                    if (carrierList.length === 0) {
                        console.warn('[Login] ⚠️ carrier_list VAZIA após loadAll. Verificar Firestore para tenant:', tenantId);
                        const _lsRaw = localStorage.getItem(`tenant_${tenantId}_carrier_list`);
                        console.warn('[Login] localStorage tenant_'+tenantId+'_carrier_list:', _lsRaw ? _lsRaw.substring(0,200) : 'NULL/VAZIO');
                    }
                    if (window.populateCarrierSelect) window.populateCarrierSelect();
                    if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                    if (window.renderRulesList) window.renderRulesList();
                    console.log('[Login] UI de transportadoras re-renderizada. Lista:', carrierList.length, 'itens.');

                    // v3.11.84: Segundo render delayed para capturar dados que chegam via onSnapshot
                    setTimeout(() => {
                        const _cl2 = Utils.getStorage('carrier_list') || [];
                        console.log('[Login+2s] Re-render transportadoras. Lista agora:', _cl2.length, 'itens.');
                        if (_cl2.length > carrierList.length || carrierList.length === 0) {
                            carrierList = _cl2;
                            if (window.populateCarrierSelect) window.populateCarrierSelect();
                            if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                            if (window.renderRulesList) window.renderRulesList();
                        }
                    }, 2000);

                    // v3.11.84: Diagnóstico final — alerta visual se após 10s ainda não há transportadoras
                    setTimeout(() => {
                        const _cl10 = Utils.getStorage('carrier_list') || [];
                        console.log('[Login+10s] Diagnóstico final. Lista agora:', _cl10.length, 'itens.');
                        if (_cl10.length > 0) {
                            if (_cl10.length > carrierList.length || carrierList.length === 0) {
                                carrierList = _cl10;
                                if (window.populateCarrierSelect) window.populateCarrierSelect();
                                if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                                if (window.renderRulesList) window.renderRulesList();
                            }
                        } else {
                            console.error('[Login+10s] ❌ ZERO transportadoras. Possível problema no Firestore para tenant:', tenantId);
                            showToast('⚠️ Transportadoras não carregadas. Abra F12 e execute diagCarriers() para diagnóstico.', 8000);
                        }
                    }, 10000);

                    // v3.11.84: Função global para recarregar transportadoras manualmente
                    window.reloadCarriers = async () => {
                        showToast('🔄 Recarregando transportadoras da nuvem...');
                        if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
                            try {
                                const tid = Utils.Cloud.tenantId;
                                const doc = await window.db.collection('tenants').doc(tid)
                                    .collection('legacy_store').doc('carrier_list').get();
                                if (doc.exists) {
                                    const d = doc.data();
                                    console.log('[reloadCarriers] Firestore carrier_list campos:', Object.keys(d));
                                    if (d.content && d.content.length >= 2) {
                                        const parsed = JSON.parse(d.content);
                                        carrierList = Array.isArray(parsed) ? parsed : [];
                                        localStorage.setItem(Utils._storageKey('carrier_list'), d.content);
                                        console.log('[reloadCarriers] ✅ carrier_list carregada do Firestore:', carrierList.length, 'itens.');
                                    } else {
                                        console.warn('[reloadCarriers] ⚠️ Doc existe mas sem campo content. Campos:', Object.keys(d));
                                    }
                                } else {
                                    console.warn('[reloadCarriers] ❌ Doc carrier_list NÃO existe no Firestore para tenant:', Utils.Cloud.tenantId);
                                }
                            } catch(e) {
                                console.error('[reloadCarriers] Erro Firestore:', e);
                                await Utils.Cloud.loadAll();
                                carrierList = Utils.getStorage('carrier_list') || [];
                            }
                        } else {
                            await Utils.Cloud.loadAll();
                            carrierList = Utils.getStorage('carrier_list') || [];
                        }
                        if (window.populateCarrierSelect) window.populateCarrierSelect();
                        if (window.renderCarrierConfigs) window.renderCarrierConfigs();
                        if (window.renderRulesList) window.renderRulesList();
                        showToast(`✅ Transportadoras: ${carrierList.length} encontradas.`);
                        console.log('[reloadCarriers] Concluído:', carrierList.length, 'transportadoras.');
                    };

                    // v3.11.84: Diagnóstico completo acessível via console (F12) → diagCarriers()
                    window.diagCarriers = async () => {
                        const tid = (Utils.Cloud && Utils.Cloud.tenantId) || localStorage.getItem('app_tenant_id') || '?';
                        const lsKey = `tenant_${tid}_carrier_list`;
                        const lsVal = localStorage.getItem(lsKey);
                        console.group('🔍 DIAGNÓSTICO TRANSPORTADORAS');
                        console.log('Tenant ID:', tid);
                        console.log('Utils.Cloud.tenantId:', Utils.Cloud && Utils.Cloud.tenantId);
                        console.log('localStorage key:', lsKey);
                        console.log('localStorage value:', lsVal ? lsVal.substring(0, 200) : 'NULL/VAZIO');
                        console.log('carrierList em memória:', carrierList.length, 'itens', carrierList);
                        console.log('Utils.getStorage(carrier_list):', Utils.getStorage('carrier_list'));
                        if (window.db) {
                            try {
                                const doc = await window.db.collection('tenants').doc(tid)
                                    .collection('legacy_store').doc('carrier_list').get();
                                if (doc.exists) {
                                    const d = doc.data();
                                    console.log('✅ Firestore doc EXISTS. Campos:', Object.keys(d));
                                    console.log('Firestore content (200 chars):', d.content ? d.content.substring(0, 200) : 'AUSENTE');
                                    if (d.content) {
                                        try {
                                            const arr = JSON.parse(d.content);
                                            console.log('✅ Parse OK. Array com', arr.length, 'itens:', arr);
                                        } catch(pe) { console.error('❌ Parse falhou:', pe); }
                                    }
                                } else {
                                    console.error('❌ Firestore doc NÃO EXISTE para tenant:', tid);
                                    const col = await window.db.collection('tenants').doc(tid)
                                        .collection('legacy_store').get();
                                    console.log('Docs em legacy_store:', col.docs.map(d => d.id));
                                }
                            } catch(e) { console.error('Erro ao buscar Firestore:', e); }
                        } else {
                            console.warn('Firebase não conectado.');
                        }
                        console.groupEnd();
                        return { tid, lsVal, carrierCount: carrierList.length };
                    };
                    console.log('💡 [v3.11.84] Digite diagCarriers() no console (F12) para diagnóstico completo.');
                    console.log('💡 [v3.11.84] Digite reloadCarriers() no console (F12) para recarregar da nuvem.');

                    // Inicializa módulo de Ocorrências
                    if (window.OcorrenciasModule && window.db && tenantId) {
                        window.OcorrenciasModule.init(window.db, tenantId, user);
                    }

                } else {
                    alert('Credenciais inválidas ou usuário não cadastrado nesta empresa.');
                }
            } catch (loginErr) {
                console.error('[Login] Erro inesperado:', loginErr);
                alert('Erro ao fazer login. Tente novamente.');
            } finally {
                // SEMPRE restaura o botão — independente de sucesso ou falha
                if (btnLogin && loginOverlay && loginOverlay.style.display !== 'none') {
                    btnLogin.disabled = false;
                    btnLogin.innerHTML = 'ACESSAR SISTEMA';
                }
            }
            };

            btnLogin.addEventListener('click', window._doDispatchLogin);
        }

        // Marca app como pronto — libera o placeholder
        _appReady = true;

        // v3.11.75: Callback global para sincronizar variáveis de closure quando dados de
        // transportadora chegam do Firestore (via loadAll Fase 1 ou onSnapshot).
        // Isso garante que carrierList, carrierConfigs, rules e carrierInfo sempre reflitam
        // o que está no localStorage — independentemente de quando o Firestore responde.
        window._refreshCarrierVars = (source) => {
            const prevLen = Array.isArray(carrierList) ? carrierList.length : 0;
            carrierList = Utils.getStorage('carrier_list') || [];
            carrierConfigs = Utils.getStorage('carrier_configs') || {};
            if (!carrierConfigs || typeof carrierConfigs !== 'object' || Array.isArray(carrierConfigs)) carrierConfigs = {};
            carrierInfo = Utils.getStorage('carrier_info_v2') || {};
            if (Array.isArray(carrierInfo)) carrierInfo = {};
            rules = Utils.getStorage('freight_tables') || [];
            console.log(`🔄 [_refreshCarrierVars:${source}] carrierList=${carrierList.length}, rules=${rules.length} (era ${prevLen})`);

            // Etapa 3: mantém AppState sincronizado quando Firestore atualiza
            if (typeof AppState !== 'undefined') {
                AppState.set('carrierList',    carrierList);
                AppState.set('carrierConfigs', carrierConfigs);
                AppState.set('carrierInfo',    carrierInfo);
                AppState.set('rules',          rules);
            }

            // Auto-rebuild: se carrier_list ainda vazia mas freight_tables tem dados, reconstrói
            if (carrierList.length === 0 && rules.length > 0) {
                const carriersInTables = [...new Set(rules.map(r => r.transportadora))].filter(c => c).sort();
                if (carriersInTables.length > 0) {
                    console.warn(`🔧 [_refreshCarrierVars] Auto-rebuild: ${carriersInTables.length} transportadoras de freight_tables.`);
                    carrierList = carriersInTables;
                    localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));
                    if (Utils.Cloud && Utils.Cloud.hasTenant()) Utils.Cloud.save('carrier_list', carrierList);
                    if (typeof AppState !== 'undefined') AppState.set('carrierList', carrierList);
                }
            }
        };

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
            <div style="font-weight: 600;" id="resClientName">${client.nome || client.razaoSocial || client.nomeFantasia || 'Cliente'}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                <span id="resCity">${(!client.cidade || client.cidade === 'undefined' || client.cidade === 'null' || String(client.cidade).trim() === '') ? ((!client.city || client.city === 'undefined') ? '-' : client.city) : client.cidade}</span> - <span id="resNeighborhood">${(!client.bairro || client.bairro === 'undefined' || client.bairro === 'null' || String(client.bairro).trim() === '') ? '-' : client.bairro}</span>
            </div>
            ${statusHtml}
        `;
            clientResult.style.display = 'block';
            clientResult.style.borderLeft = borderStyle;


            // Focar no Vendedor após selecionar o cliente (v3.7.1)
            setTimeout(() => {
                const sellerEl = document.getElementById('inputSeller');
                if (sellerEl) sellerEl.focus();
            }, 100);
        }

        window.resetQuote = () => {
            // Clear all inputs
            document.getElementById('inputInvoiceNumber').value = '';
            document.getElementById('inputIsComplement').value = 'nao';
            document.getElementById('inputMainNF').value = '';
            document.getElementById('divMainNF').style.display = 'none';
            document.getElementById('inputClient').value = '';
            document.getElementById('inputSeller').value = '';
            document.getElementById('inputValue').value = '';
            document.getElementById('inputWeight').value = '';
            if (document.getElementById('inputVolume')) {
                document.getElementById('inputVolume').value = '';
            }

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

            // Reset date field to today and hide retroative warning
            const _dateEl = document.getElementById('inputDate');
            const _retWarn = document.getElementById('retroDateWarning');
            if (_dateEl) {
                const _today = new Date();
                _dateEl.value = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
            }
            if (_retWarn) _retWarn.style.display = 'none';

            // Focus first field
            document.getElementById('inputInvoiceNumber').focus();
        };

        // === DATA DO LANÇAMENTO (v3.11.29) ===
        // Retorna 'YYYY-MM-DD' no fuso horário local
        function getTodayLocalStr() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        // Inicializa o campo de data com a data de hoje
        function initDateField() {
            const el = document.getElementById('inputDate');
            if (el && !el.value) el.value = getTodayLocalStr();
        }
        initDateField(); // garante data de hoje no carregamento

        // Exibe / esconde o aviso retroativo ao mudar a data
        window.checkRetroativeDate = function(input) {
            const warn = document.getElementById('retroDateWarning');
            if (!warn) return;
            const today = getTodayLocalStr();
            if (input.value && input.value < today) {
                warn.style.display = 'flex';
            } else {
                warn.style.display = 'none';
            }
        };

        const inputVolume = document.getElementById('inputVolume');

        const triggerCalc = () => {
            const sellerEl = document.getElementById('inputSeller');
            if (selectedClient && inputValue.value && inputWeight.value && inputVolume && inputVolume.value && sellerEl && sellerEl.value) {
                calculateAndSave(true);
            }
        };

        inputValue.addEventListener('input', triggerCalc);
        inputWeight.addEventListener('input', triggerCalc);
        if (inputVolume) inputVolume.addEventListener('input', triggerCalc);
        document.getElementById('inputSeller').addEventListener('change', triggerCalc);

        // Recalcular automaticamente ao mudar cidade manual, tipo complemento ou NF principal
        const _qCityEl = document.getElementById('inputCity');
        if (_qCityEl) _qCityEl.addEventListener('input', triggerCalc);
        const _qComplementEl = document.getElementById('inputIsComplement');
        if (_qComplementEl) _qComplementEl.addEventListener('change', triggerCalc);
        const _qMainNFEl = document.getElementById('inputMainNF');
        if (_qMainNFEl) _qMainNFEl.addEventListener('input', triggerCalc);

        // Expor triggerCalc globalmente para uso no botão Recalcular
        window._triggerQuoteCalc = () => calculateAndSave(false);


        const navItems = document.querySelectorAll('.nav-item');
        const sections = document.querySelectorAll('.view-section');

        window.getDispatchDelayInfo = function(d) {
            if (d.status !== 'Pendente Despacho') return { isLate: false };
            if (!d.horarios || d.horarios === '-') return { isLate: false };

            const now = new Date();
            const launchDate = new Date(d.date);
            const launchDayStart = new Date(launchDate); launchDayStart.setHours(0, 0, 0, 0);
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

            // 1. Data passada
            if (launchDayStart < todayStart) {
                return { isLate: true, reason: 'Atrasado (Data Passada)' };
            }

            // 2. Mesma data
            if (launchDayStart.getTime() === todayStart.getTime()) {
                const matches = Array.from(d.horarios.matchAll(/(\d{2}):(\d{2})/g));
                if (matches.length > 0) {
                    const times = matches.map(m => {
                        const dl = new Date(now);
                        dl.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
                        return { dl, label: m[0] };
                    }).sort((a, b) => a.dl - b.dl);
                    
                    // Encontra o PRIMEIRO horário aplicável, ou seja, onde o pacote foi lançado ANTES do horário de saída
                    const eligibleDeadline = times.find(t => launchDate <= t.dl);
                    
                    if (eligibleDeadline) {
                        // O pacote tinha chance de pegar ESSE carro, confirmamos se o carro já foi embora (now > dl)
                        if (now > eligibleDeadline.dl) {
                            return { isLate: true, reason: `Atrasado (Limite: ${eligibleDeadline.label})` };
                        }
                    }
                    // Se não tiver nenhum eligibleDeadline, ele foi postado DEPOIS de todos os despachos do dia.
                    // Portanto, não está atrasado. Espera o carro do dia seguinte pacificamente.
                }
            }
            return { isLate: false };
        };

        async function checkLateDispatchesAndAlert() {
            const history = await Utils.Cloud.getFullDispatchesHistory();
            const hasLate = history.some(d => window.getDispatchDelayInfo(d).isLate);

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
                    'system': 'Cadastros',
                    'app-settings': 'Configurações'
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
            if (id === 'baixa') {
                if (window.renderBaixaRomaneios) window.renderBaixaRomaneios();
            }
            if (id === 'rules') {
                renderRulesList();
            }
            if (id === 'configs') {
                renderCarrierConfigs();
            }
            if (id === 'system') {
                // Renderizar atributos assíncronos pequenos delay para transição visível
                setTimeout(() => {
                    if (window.renderUserList) window.renderUserList();
                    if (window.renderClientsList) window.renderClientsList();
                    if (window.renderSellersList) window.renderSellersList();
                }, 50);
            }
            if (id === 'driver') {
                renderDriverView();
            }
            if (id === 'invoice' && window.initInvoiceSection) {
                window.initInvoiceSection();
            }
            if (id === 'occurrences') {
                if (window.OcorrenciasModule) window.OcorrenciasModule.renderView();
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

        document.getElementById('inputSeller').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('inputValue').focus();
            }
        });

        // Keyboard handling is now centralized in the 'keydown' listener above

        inputValue.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') inputWeight.focus();
        });

        inputWeight.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const volEl = document.getElementById('inputVolume');
                if (volEl) volEl.focus();
                else calculateAndSave();
            }
        });

        const volEl = document.getElementById('inputVolume');
        if (volEl) {
            volEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') calculateAndSave();
            });
        }
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
            inputMainNF.addEventListener('input', async () => {
                const mainNF = inputMainNF.value.trim();
                if (mainNF) {
                    // Busca no cache local primeiro, depois no Firestore
                    const localHistory = Utils.getStorage('dispatches') || [];
                    let allHistory = window._dispatchesFullCache || localHistory;
                    let originalDispatch = allHistory.find(d => d.invoice === mainNF);

                    // Se não achou e o cache não foi carregado, busca no Firestore
                    if (!originalDispatch && !window._dispatchesFullCache) {
                        try {
                            console.log('[Complemento] NF não encontrada localmente. Buscando no Firestore...');
                            const fullHistory = await Utils.Cloud.getFullDispatchesHistory();
                            window._dispatchesFullCache = fullHistory;
                            originalDispatch = fullHistory.find(d => d.invoice === mainNF);
                        } catch(e) {
                            console.error('[Complemento] Erro ao buscar NF no Firestore:', e);
                        }
                    }

                    if (originalDispatch) {
                        const foundClient = clients.find(c => c.nome === originalDispatch.client);
                        if (foundClient) {
                            selectClient(foundClient);
                        } else {
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
            const sellerId = document.getElementById('inputSeller').value;
            if (!sellerId) {
                if (!silent) {
                    alert('Por favor, selecione o Vendedor Responsável.');
                } else {
                    document.getElementById('resultsArea').innerHTML = `
                        <div style="text-align: center; color: var(--accent-danger); margin-top: 4rem;">
                            <span class="material-icons-round" style="font-size: 3rem; opacity: 0.5;">support_agent</span>
                            <p style="font-weight: 600;">Selecione o Vendedor Responsável para calcular.</p>
                        </div>
                    `;
                }
                return;
            }
            const norm = Utils.normalizeString;
            if (!selectedClient) {

                if (!silent) alert('Por favor, selecione um cliente primeiro.');
                return;
            }

            const nfValue = parseFloat(inputValue.value) || 0;
            const weight = parseFloat(inputWeight.value) || 0;
            const volEl = document.getElementById('inputVolume');
            const volume = volEl ? (parseFloat(volEl.value) || 0) : 1;

            if (nfValue <= 0 || weight <= 0 || volume <= 0) {
                if (!silent) alert('Preencha Valor da NF, Peso e Volume (devem ser maiores que zero).');
                else {
                    document.getElementById('resultsArea').innerHTML = `
                        <div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                            <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">local_shipping</span>
                            <p>Informe Valor, Peso e Volume maiores que zero para ver as opções.</p>
                        </div>
                    `;
                }
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
                // Busca no cache completo (localStorage + Firestore) para encontrar NF principal
                const localHist = Utils.getStorage('dispatches') || [];
                const allHist = window._dispatchesFullCache || localHist;
                const originalDispatch = allHist.find(d => d.invoice === mainNF);

                if (originalDispatch) {
                    targetCarrier = norm(originalDispatch.carrier);

                    // Garante que o cliente do complemento é o mesmo da NF principal
                    const clienteNomeAtual = selectedClient ? (selectedClient.nome || selectedClient.razaoSocial || '') : '';
                    if (norm(clienteNomeAtual) !== norm(originalDispatch.client)) {
                        const foundCorrect = clients.find(c => norm(c.nome) === norm(originalDispatch.client));
                        if (foundCorrect) {
                            selectClient(foundCorrect);
                        } else {
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
                    <p>NF Principal "${mainNF}" não encontrada. Aguarde o carregamento do histórico ou acesse a aba Montagem de Carga primeiro.</p>
                </div>`;
                    return;
                }
            }

            const cityInput = document.getElementById('inputCity');
            const city = norm(cityInput ? cityInput.value : (selectedClient ? (selectedClient.cidade || selectedClient.City || selectedClient.city) : ''));

            // Bairro do cliente (campo bairro/neighborhood do cadastro)
            const clientBairro = selectedClient
                ? norm(selectedClient.bairro || selectedClient.Bairro || selectedClient.neighborhood || selectedClient.Neighborhood || '')
                : '';

            // ── v3.11.35: nova ordem de busca ─────────────────────────────────────────
            // 1ª: BAIRRO — se bairro do cliente bater com r.cidade de alguma tabela,
            //     usa essas regras (inclui redespacho, pois é busca específica por bairro).
            // 2ª: CIDADE — apenas match direto r.cidade === city.
            //     NÃO usa r.cidadeRedespacho para evitar trazer tabelas de outras cidades
            //     que têm TUCUMA (ou qualquer cidade) apenas como destino de redespacho.
            // ─────────────────────────────────────────────────────────────────────────

            let cityRules = [];
            let usedBairroFallback = false;

            // ── 1ª tentativa: BAIRRO ──────────────────────────────────────────────────
            if (clientBairro) {
                const bairroRules = rules.filter(r => norm(r.cidade) === clientBairro);
                if (bairroRules.length > 0) {
                    cityRules = bairroRules;
                    usedBairroFallback = true;
                }
            }

            // ── v3.11.39: lógica de busca em 3 etapas ────────────────────────────────
            // 1ª: BAIRRO          → r.cidade === bairroDoCliente (já feito acima)
            // 2ª: CIDADE direta   → r.cidade === city
            //     Prefere tabelas SEM redespacho (tabela direta da cidade).
            //     Resolve TUCUMA: mostra só a tabela direta, não as 4 variantes VAN.
            // 3ª: cidadeRedespacho → r.cidadeRedespacho === city  [SEMPRE, aditivo]
            //     Adiciona transportadoras que servem esta cidade via redespacho de outro hub.
            //     Resolve DOM ELISEU: VIOPEX só tem r.cidade="MARABA" + r.cidadeRedespacho="DOM ELISEU".
            //     Não reintroduz o bug do TUCUMA pois o problema lá era r.cidade=TUCUMA (5 rows),
            //     não r.cidadeRedespacho=TUCUMA.
            // ─────────────────────────────────────────────────────────────────────────

            // ── 2ª tentativa: CIDADE direta (só executa se bairro não achou nada) ────
            if (cityRules.length === 0) {
                const allCidadeRules = rules.filter(r => norm(r.cidade) === city);

                if (allCidadeRules.length > 0) {
                    // Prefere tabelas SEM redespacho; usa com redespacho só se não houver direta
                    const semRedespacho = allCidadeRules.filter(r => {
                        const temRedesp = r.redespacho && r.redespacho !== '-' && r.redespacho !== '';
                        const temCidadeRedesp = r.cidadeRedespacho && r.cidadeRedespacho !== '-' && r.cidadeRedespacho !== '';
                        return !temRedesp && !temCidadeRedesp;
                    });
                    cityRules = semRedespacho.length > 0 ? semRedespacho : allCidadeRules;
                }
            }

            // ── 3ª etapa: cidadeRedespacho [SEMPRE aditiva — merge] ───────────────────
            // Transportadoras que atendem esta cidade partindo de outro hub via redespacho.
            // Ex: VIOPEX tem r.cidade="MARABA" e r.cidadeRedespacho="DOM ELISEU".
            // Para clientes de DOM ELISEU, BOA ESPERANCA e TNORTE já foram encontradas na
            // etapa 2, mas VIOPEX só aparece aqui. Rodamos SEMPRE e fazemos merge.
            // Evitamos duplicatas verificando se a regra já está em cityRules.
            if (!usedBairroFallback) {
                const redespRules = rules.filter(r => norm(r.cidadeRedespacho) === city);
                redespRules.forEach(r => {
                    if (!cityRules.includes(r)) cityRules.push(r);
                });
            }


            if (targetCarrier) {
                cityRules = cityRules.filter(r => norm(r.transportadora) === targetCarrier);
            }

            if (cityRules.length === 0) {
                if (!silent) {
                    if (targetCarrier) alert(`A transportadora ${targetCarrier} não possui tabela para a cidade ${city}.`);
                    else alert(`Nenhuma tabela de frete encontrada para ${city}${clientBairro ? ' nem para o bairro ' + clientBairro : ''}.`);
                }
                resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-secondary); margin-top: 4rem;">
                <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">error_outline</span>
                <p>${targetCarrier ? `A transportadora ${targetCarrier} (da NF ${mainNF}) não possui tabela para esta cidade.` : `Nenhuma opção de frete para <strong>${city}</strong>${clientBairro ? ` nem para o bairro <strong>${clientBairro}</strong>` : ''}.`}</p>
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

                // v3.11.66: taxa fixa por volume — multiplica pedagio pelo numero de volumes se flag ativa
                const tollVal = (rule.pedagio || 0) * (rule.taxaFixaPorVolume ? volume : 1);

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

            let validOptions = options.filter(opt => opt.total > 0);
            
            // v3.7.9 - Sempre mostrar opção FOB como uma das opções de cotação (última)
            if (!validOptions.some(opt => opt.carrier === 'FOB')) {
                validOptions.push({
                    carrier: 'FOB',
                    total: 0,
                    details: {
                        base: 0, excess: 0, volume: 0, fixed: 0, gris: 0, toll: 0, redispatch: 0, icms: 0,
                        ruleUsed: { 
                            percentual: 0, minimo: 0, leadTime: '', horarios: '',
                            transportadora: 'FOB'
                        }
                    }
                });
            }

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

            // v3.7.9 - Garante que FOB seja sempre a última opção
            const fobIdx = validOptions.findIndex(o => o.carrier === 'FOB');
            if (fobIdx !== -1 && validOptions.length > 1) {
                const fobItem = validOptions.splice(fobIdx, 1)[0];
                validOptions.push(fobItem);
            }

            renderResults(validOptions, usedBairroFallback ? clientBairro : null);
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

        function renderResults(options, bairroFallback) {
            const fallbackBanner = bairroFallback ? `
                <div style="background: rgba(255,165,0,0.12); border: 1px solid rgba(255,165,0,0.4); border-radius: 8px; padding: 8px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: #ffb347;">
                    <span class="material-icons-round" style="font-size: 1rem;">info</span>
                    <span>Nenhuma tabela para a cidade — cotação feita pelo <strong>bairro: ${bairroFallback}</strong></span>
                </div>` : '';
            resultsArea.innerHTML = fallbackBanner + options.map((opt, index) => {
                const d = opt.details;
                const rule = d.ruleUsed;
                const isVan = !!(carrierInfo[opt.carrier] && carrierInfo[opt.carrier].freteNegociado === true);

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
                        <label style="font-size: 0.75rem; color: var(--text-secondary);">Valor Negociado:</label>
                        <span id="van-diff-${index}" style="font-size: 0.75rem; font-weight: bold;"></span>
                    </div>
                    <input type="number" id="van-input-${index}" class="form-input" 
                        style="padding: 4px 8px; font-size: 0.9rem; width: 100%; height: 32px;" 
                        placeholder="Informe valor final..." 
                        oninput="window.calcVanDiff(${index}, ${opt.total})">
                </div>
            ` : '';

                // v3.7.9/v3.8.4 - Seletor de transportadora para FOB com consulta automática de horários
                const isFob = opt.carrier === 'FOB';
                const fobSelectorHtml = isFob ? `
                <div class="fob-carrier-selector" style="margin-top: 10px; border-top: 1px dashed var(--border-color); padding-top: 8px;" onclick="event.stopPropagation()">
                    <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">Transportadora da Coleta:</label>
                    <select id="fob-carrier-${index}" class="form-input" style="padding: 4px 8px; font-size: 0.9rem; width: 100%; height: 32px;" onchange="window.onFobCarrierChange(${index})">
                        <option value="">-- Selecione --</option>
                        ${carrierList.sort().map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div id="fob-info-${index}" style="margin-top: 6px; font-size: 0.8rem; padding: 6px 10px; background: rgba(59,130,246,0.07); border-radius: 8px; border: 1px solid rgba(59,130,246,0.15); display: none;">
                        <span id="fob-horario-${index}" style="color: var(--primary-color);"></span>
                        <span id="fob-prazo-${index}" style="color: var(--text-secondary); margin-left: 12px;"></span>
                    </div>
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
                    ${fobSelectorHtml}
                </div>
                <div style="text-align: right; min-width: 120px; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start;">
                    ${priceHtml}

                    ${isVan ? '<div style="font-size: 0.7rem; color: var(--text-secondary); margin-top:2px;">(Sugerido)</div>' : ''}
                </div>
            </div>`;
            }).join('');

            // Botão Recalcular — aparece sempre que há resultado na tela
            resultsArea.innerHTML += `
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: center;" onclick="event.stopPropagation()">
                <button id="btnRecalcular" onclick="window._triggerQuoteCalc()" style="
                    display: flex; align-items: center; gap: 8px;
                    background: transparent;
                    color: var(--text-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    padding: 8px 22px;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: all 0.18s ease;
                    font-family: inherit;
                " onmouseover="this.style.color='var(--primary-color)';this.style.borderColor='var(--primary-color)';this.style.background='rgba(var(--primary-rgb,59,130,246),0.07)'"
                   onmouseout="this.style.color='var(--text-secondary)';this.style.borderColor='var(--border-color)';this.style.background='transparent'">
                    <span class="material-icons-round" style="font-size:1.1rem;">refresh</span>
                    Recalcular
                </button>
            </div>`;

            window.currentOptions = options;
        }

        // v3.8.4 - Consulta hor\u00e1rios e prazo da transportadora FOB selecionada
        window.onFobCarrierChange = (index) => {
            const select = document.getElementById(`fob-carrier-${index}`);
            const infoBox = document.getElementById(`fob-info-${index}`);
            const horarioEl = document.getElementById(`fob-horario-${index}`);
            const prazoEl = document.getElementById(`fob-prazo-${index}`);

            if (!select || !infoBox) return;

            const selectedCarrier = String(select.value || '').trim().toUpperCase();
            if (!selectedCarrier) {
                infoBox.style.display = 'none';
                return;
            }

            // Pega a cidade de destino do despacho atual
            const cityEl = document.getElementById('resCity');
            const destCity = String(cityEl ? cityEl.innerText : '').trim().toUpperCase();

            // Consulta a tabela de frete
            const freightRules = Utils.getStorage('freight_tables') || [];
            const rule = freightRules.find(r =>
                String(r.transportadora || '').trim().toUpperCase() === selectedCarrier &&
                String(r.cidade || '').trim().toUpperCase() === destCity
            );

            infoBox.style.display = 'block';
            if (rule) {
                const horario = rule.horarios || rule.horario || '-';
                const prazo = rule.leadTime || rule.prazo || '-';
                if (horarioEl) horarioEl.innerHTML = `🚚 Sa\u00edda: <strong>${horario}</strong>`;
                if (prazoEl) prazoEl.innerHTML = `🕒 Prazo: <strong>${prazo} dias</strong>`;
            } else {
                if (horarioEl) horarioEl.innerHTML = `<span style="color:var(--accent-warning);">⚠️ Sem regra cadastrada para ${selectedCarrier} → ${destCity || 'cidade n\u00e3o informada'}</span>`;
                if (prazoEl) prazoEl.innerHTML = '';
            }
        };

        window.confirmDispatch = async (index) => {
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

            // v3.7.9 - Validação de transportadora para FOB
            if (option.carrier === 'FOB') {
                const fobSelect = document.getElementById(`fob-carrier-${index}`);
                if (!fobSelect || !fobSelect.value) {
                    alert('Por favor, selecione a transportadora que realizará a coleta FOB.');
                    if (fobSelect) fobSelect.focus();
                    return;
                }
                option.selectedFobCarrier = fobSelect.value;
            }

            if (!confirm(`Confirmar despacho com ${option.carrier} per ${msgPrice}?`)) return;

            const clientName = document.getElementById('resClientName').innerText;
            // v3.11.33: _sanDom — sanitiza innerText antes de salvar (previne string 'undefined' herdada do DOM)
            const _sanDom = (v, fb) => (!v || v === 'undefined' || v === 'null' || String(v).trim() === '') ? fb : String(v).trim();
            const resCity = _sanDom(document.getElementById('resCity').innerText, '-');
            const resNeighborhood = _sanDom(document.getElementById('resNeighborhood').innerText, '-');
            const val = parseFloat(document.getElementById('inputValue').value) || 0;
            const weight = parseFloat(document.getElementById('inputWeight').value) || 0;
            const volume = parseInt(document.getElementById('inputVolume').value) || 1;
            const invoice = document.getElementById('inputInvoiceNumber').value.trim();
            const isComp = document.getElementById('inputIsComplement').value === 'sim';
            const mainInv = isComp ? document.getElementById('inputMainNF').value.trim() : '';
            const sellerId = document.getElementById('inputSeller').value;

            let sellerName = '-';
            let sellerPhone = '';
            
            if (sellerId) {
                const sellers = Utils.getStorage('app_sellers') || [];
                const sObj = sellers.find(s => s.id === sellerId);
                if (sObj) {
                    sellerName = sObj.name;
                    sellerPhone = sObj.phone;
                }
            }


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
            // ✅ FIX v3.11.45: busca no histórico completo (localStorage + Firestore)
            // A versão anterior usava apenas Utils.getStorage('dispatches') — NFs arquivadas
            // (>12h no Firestore) não eram encontradas e a trava não funcionava.
            if (invoice && invoice !== 'S/N' && !isComp) {
                const fullHistory = (await Utils.Cloud.getFullDispatchesHistory()) || [];
                const duplicate = fullHistory.find(d => d.invoice === invoice);
                if (duplicate) {
                    const dupDate = duplicate.date
                        ? new Date(duplicate.date).toLocaleDateString('pt-BR')
                        : (duplicate.dispatchedAt ? new Date(duplicate.dispatchedAt).toLocaleDateString('pt-BR') : '?');
                    alert(`⚠️ Atenção: A Nota Fiscal nº ${invoice} já foi despachada anteriormente para o cliente "${duplicate.client}" em ${dupDate}.`);
                    return;
                }
            }

            const ruleUsed = option.details.ruleUsed;

            // Captura data escolhida pelo operador (pode ser retroativa)
            const _dateInputEl = document.getElementById('inputDate');
            const _todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
            const _chosenDateStr = (_dateInputEl && _dateInputEl.value) ? _dateInputEl.value : _todayStr;
            const _isRetroativo = _chosenDateStr < _todayStr;
            const _dispatchDate = new Date(_chosenDateStr + 'T12:00:00').toISOString();

            const dispatch = {
                id: Date.now(),
                date: _dispatchDate,
                isRetroativo: _isRetroativo,
                registradoEm: new Date().toISOString(), // data/hora real do lançamento
                client: (clientName && clientName !== 'Name' && clientName !== 'undefined') ? clientName : 'Consumidor',
                city: resCity || '-',
                neighborhood: resNeighborhood || '-',
                carrier: option.selectedFobCarrier ? `FOB - ${option.selectedFobCarrier}` : String(option.carrier || '').trim().toUpperCase(),
                total: finalTotal, // Use negotiated price if available
                originalTotal: option.total, // Keep original for records
                vanDiff: isNegotiated ? vanDiff : 0, // Save difference
                nfValue: val,
                weight: weight,
                volume: volume,
                invoice: invoice || 'S/N',
                sellerId: sellerId || null,
                sellerName: sellerName,
                sellerPhone: sellerPhone,

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
                capturedBy: currentUser ? currentUser.name : 'Sistema',
                // Redespacho: salva transportadora e valor separados para faturamento correto
                redespCarrier: (ruleUsed.redespacho && ruleUsed.redespacho !== '-') ? String(ruleUsed.redespacho).toUpperCase().trim() : null,
                redespTotal: option.details.redispatch || 0,
                mainTotal: finalTotal - (option.details.redispatch || 0)
            };

            Utils.addToStorage('dispatches', dispatch);
            showToast('✅ Carga montada com sucesso!');

            // Reset form for next input, but stay on Quote screen
            if (window.resetQuote) {
                window.resetQuote();
            } else {
                document.getElementById('inputInvoiceNumber').value = '';
                document.getElementById('inputWeight').value = '';
                document.getElementById('inputValue').value = '';
                document.getElementById('inputVolume').value = '';
                document.getElementById('inputIsComplement').value = 'nao';
                document.getElementById('inputClient').value = '';
                document.getElementById('inputSeller').value = '';
                const grp = document.getElementById('mainNFGroup');
                if (grp) grp.style.display = 'none';
                document.getElementById('inputMainNF').value = '';
                document.getElementById('resultsArea').innerHTML = '';
                if(window.selectedClient) window.selectedClient = null;
                const clientResult = document.getElementById('clientResult');
                if(clientResult) clientResult.style.display = 'none';
            }

            const resContainer = document.getElementById('quoteResults');
            if (resContainer) resContainer.style.display = 'none';

            // But keeping it might be better for reference. Let's just scroll up.
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        // showToast — já definida no topo do arquivo (L37, versão unificada v3.12.2)
        // Esta duplicata foi removida na refatoração Etapa 2.
        const showToast = window.showToast;

        // --- GERENCIAMENTO DE TABELAS DE FRETE ---

        let activeCarrier = '';
        window.rulesFilters = { cidade: '', redespacho: '' };

        const renderRulesList = () => {
            // CRÍTICO: Sempre re-ler do storage (pode ter sido atualizado pelo Cloud listener)
            rules = Utils.getStorage('freight_tables') || [];
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
                // Exibe taxa fixa com badge "× vol" se for por volume
                const taxaFixaDisplay = r.pedagio > 0
                    ? Utils.formatCurrency(r.pedagio) + (r.taxaFixaPorVolume ? ' <span title="Taxa por volume" style="font-size:0.65rem;background:rgba(var(--primary-rgb),0.15);color:var(--primary-color);border-radius:10px;padding:1px 5px;font-weight:700;vertical-align:middle;">×vol</span>' : '')
                    : '-';
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
                <td>${taxaFixaDisplay}</td>
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

        // Expor globalmente para o Cloud listener (utils.js linha 598) poder chamar após sync do Firestore
        // SEM isso, tabelas de frete nunca aparecem em computadores novos (ex: Altafix)
        window.renderRulesList = renderRulesList;

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

                // 3. Marcar timestamps anti-rollback + PERSISTIR (v3.11.64: sobrevive refresh)
                Utils.lastWriteTime['freight_tables'] = Date.now();
                Utils.lastWriteTime['carrier_list'] = Date.now();
                Utils._persistLastWriteTime();

                // 4. Salvar localmente
                localStorage.setItem(Utils._storageKey('freight_tables'), JSON.stringify(rules));
                localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));

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

                localStorage.setItem(Utils._storageKey('freight_tables'), JSON.stringify(rules));
                localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));

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
                Utils._persistLastWriteTime(); // v3.11.64: garante sobrevivência ao refresh
                localStorage.setItem(Utils._storageKey('carrier_list'), JSON.stringify(carrierList));

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

            // v3.11.73 FIX: Reler do storage antes de renderizar.
            // Garante dados frescos mesmo quando os listeners onSnapshot atualizam o
            // localStorage mas não recarregam as variáveis de closure do app.js.
            carrierList = Utils.getStorage('carrier_list') || [];
            if (!Array.isArray(carrierList)) carrierList = [];
            carrierConfigs = Utils.getStorage('carrier_configs') || {};
            if (!carrierConfigs || typeof carrierConfigs !== 'object' || Array.isArray(carrierConfigs)) carrierConfigs = {};
            carrierInfo = Utils.getStorage('carrier_info_v2') || {};
            if (Array.isArray(carrierInfo)) carrierInfo = {};

            const carriers = [...carrierList].sort();

            // v3.11.84: Estado vazio — mostra aviso com botão de recarga
            if (carriers.length === 0) {
                const tenantId = (Utils.Cloud && Utils.Cloud.tenantId) || localStorage.getItem('app_tenant_id') || '?';
                body.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 2rem; text-align: center;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem; color: var(--text-secondary);">
                            <span class="material-icons-round" style="font-size: 3rem; color: var(--accent-warning, #f59e0b);">local_shipping</span>
                            <div>
                                <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary); margin-bottom: 0.25rem;">Nenhuma transportadora carregada</div>
                                <div style="font-size: 0.8rem;">Empresa: <strong>${tenantId}</strong> &bull; Verifique se há transportadoras cadastradas no sistema.</div>
                            </div>
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center;">
                                <button class="btn btn-primary" onclick="window.reloadCarriers && window.reloadCarriers()" style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span class="material-icons-round" style="font-size: 1.1rem;">refresh</span> Recarregar da Nuvem
                                </button>
                                <button class="btn btn-secondary" onclick="window.rebuildCarrierList && window.rebuildCarrierList()" style="display: flex; align-items: center; gap: 0.4rem;">
                                    <span class="material-icons-round" style="font-size: 1.1rem;">build</span> Reconstruir das Tabelas
                                </button>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); background: rgba(0,0,0,0.1); padding: 0.5rem 1rem; border-radius: 6px;">
                                💡 Dica: Abra o console (F12) e execute <em>diagCarriers()</em> para diagnóstico completo.
                            </div>
                        </div>
                    </td>
                </tr>`;
                return;
            }

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
            document.getElementById('newCarrierFreteNegociado').checked = info.freteNegociado === true;


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

                const freteNegociadoInput = document.getElementById('newCarrierFreteNegociado');
                carrierInfo[name] = {
                    cnpj: cnpjInput.value.trim() || '-',
                    ie: ieInput.value.trim() || '-',
                    address: addrInput.value.trim() || '-',
                    city: cityInput.value.trim() || '-',
                    reliability: parseInt(reliabilityInput.value) || 3,
                    isRedespacho: isRedespachoInput ? isRedespachoInput.checked : false,
                    freteNegociado: freteNegociadoInput ? freteNegociadoInput.checked : false
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
            const chkVol = document.getElementById('ruleTaxaFixaPorVolume');
            if (chkVol) {
                chkVol.checked = r.taxaFixaPorVolume || false;
                const hint = document.getElementById('taxaFixaVolHint');
                const lbl = document.getElementById('taxaFixaVolLabel');
                if (hint) hint.style.display = chkVol.checked ? 'block' : 'none';
                if (lbl) lbl.style.background = chkVol.checked ? 'rgba(var(--primary-rgb),0.18)' : 'rgba(var(--primary-rgb),0.08)';
            }
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

            // Reset flag taxa fixa por volume
            const chkVol = document.getElementById('ruleTaxaFixaPorVolume');
            if (chkVol) { chkVol.checked = false; }
            const hint = document.getElementById('taxaFixaVolHint');
            if (hint) hint.style.display = 'none';
            const lbl = document.getElementById('taxaFixaVolLabel');
            if (lbl) lbl.style.background = 'rgba(var(--primary-rgb),0.08)';

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

        // --- Toggle hint para taxa fixa por volume ---
        const chkVolToggle = document.getElementById('ruleTaxaFixaPorVolume');
        if (chkVolToggle) {
            chkVolToggle.addEventListener('change', () => {
                const hint = document.getElementById('taxaFixaVolHint');
                const lbl = document.getElementById('taxaFixaVolLabel');
                if (hint) hint.style.display = chkVolToggle.checked ? 'block' : 'none';
                if (lbl) lbl.style.background = chkVolToggle.checked
                    ? 'rgba(var(--primary-rgb),0.18)'
                    : 'rgba(var(--primary-rgb),0.08)';
            });
        }

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
                    taxaFixaPorVolume: document.getElementById('ruleTaxaFixaPorVolume')?.checked || false,
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
            btnExportCSV.addEventListener('click', async () => {
                const data = await Utils.Cloud.getFullDispatchesHistory();
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
            deliveryConfirm: 'Conf. Entrega',
            actions: 'Ações'
        };


        // State for filters
        window.dispatchFilters = {};

        window.renderAppHistory = async () => {
            let list = await Utils.Cloud.getFullDispatchesHistory();
            window._dispatchesFullCache = list; // Cache para busca de complementos
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
                        else if (col === 'deliveryConfirm') style += 'width: 90px; min-width: 84px; text-align: center;';


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
                                const _retroStyle = d.isRetroativo ? ' style="background: rgba(245, 158, 11, 0.12); border-left: 3px solid #f59e0b;" title="⚠️ Lançamento retroativo"' : '';
                                return `<tr${_retroStyle}>${activeCols.map(col => {
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
                                            const delayInfo = window.getDispatchDelayInfo(d);
                                            if (delayInfo.isLate) {
                                                icon = 'alarm_off';
                                                cls = 'status-late';
                                                title = delayInfo.reason;
                                            }
                                        }
                                        return `<td style="text-align: center; width: 40px;" title="${title}"><span class="material-icons-round ${cls}" style="font-size: 1.2rem; vertical-align: middle; color: ${cls === 'status-late' ? 'var(--accent-danger)' : ''}">${icon}</span></td>`;
                                    }
                                    // v3.11.33 — sanitiza string "undefined"/"null" herdadas de dados corrompidos
                                    const _rawVal = d[col];
                                    let val = (_rawVal === undefined || _rawVal === null || String(_rawVal).trim() === '' || String(_rawVal).trim() === 'undefined' || String(_rawVal).trim() === 'null') ? '-' : _rawVal;
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
                                    if (col === 'deliveryConfirm') {
                                        if (d.deliveryConfirmed) {
                                            const mIcons = { whatsapp: '💬', presencial: '🤝', audio: '🎙️', telefone: '📞', vendedor: '🧑‍💼' };
                                            const mLabels = { whatsapp: 'WhatsApp', presencial: 'Presencial', audio: 'Áudio', telefone: 'Telefone', vendedor: 'Vendedor' };
                                            const icon  = mIcons[d.deliveryConfirmMethod]  || '✅';
                                            const label = mLabels[d.deliveryConfirmMethod] || d.deliveryConfirmMethod || '';
                                            const at = d.deliveryConfirmedAt ? new Date(d.deliveryConfirmedAt).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
                                            return `<td style="width:90px;min-width:84px;text-align:center;padding:3px 2px;">
                                                <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:7px;padding:4px 5px;display:flex;flex-direction:column;align-items:center;gap:1px;">
                                                    <span style="font-size:0.75rem;">${icon} <strong style="color:#22c55e;">${label}</strong></span>
                                                    <span style="font-size:0.63rem;color:var(--text-secondary);max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${d.deliveryConfirmedBy || ''}">${d.deliveryConfirmedBy || ''}</span>
                                                    <span style="font-size:0.58rem;color:var(--text-secondary);">${at}</span>
                                                    <button onclick="window.desfazerConfirmacaoEntrega(${d.id})" title="Desfazer confirmação" style="background:none;border:none;cursor:pointer;color:rgba(239,68,68,0.7);font-size:0.6rem;padding:0;margin-top:1px;display:flex;align-items:center;gap:2px;font-family:inherit;">
                                                        <span class="material-icons-round" style="font-size:0.7rem;">undo</span> Desfazer
                                                    </button>
                                                </div>
                                            </td>`;
                                        }
                                        return `<td style="width:90px;min-width:84px;text-align:center;padding:3px 2px;">
                                            <button class="btn btn-secondary" onclick="window.confirmarEntrega(${d.id})"
                                                style="padding:3px 7px;font-size:0.72rem;color:#22c55e;border-color:rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);display:flex;align-items:center;gap:3px;margin:auto;white-space:nowrap;">
                                                <span class="material-icons-round" style="font-size:0.9rem;">verified</span> Confirmar
                                            </button>
                                        </td>`;
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
                                                </button>
                                                ${d.sellerPhone ? `
                                                <button class="btn btn-secondary whatsapp-seller-btn" onclick="window.sendWhatsAppVendedor(${d.id}); this.classList.add('sent')" title="Avisar Vendedor" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); padding: 0.3rem; min-width: auto;">
                                                    <span class="material-icons-round" style="font-size: 1.1rem;">support_agent</span>
                                                </button>` : ''}
                                                ` : ''}
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
                                    else if (col === 'deliveryConfirm') style += 'width: 90px; min-width: 84px; text-align: center;';

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

        // v3.11.30 — Parser robusto de datas para todos os formatos do banco
        // Suporta: Firestore Timestamp, timestamp numérico ms, string ISO, fallback pelo id
        window._parseDispatchDate = (d) => {
            const candidates = [d.dispatchedAt, d.date, d.createdAt, d.timestamp];
            for (const raw of candidates) {
                if (raw == null) continue;
                let dt;
                if (typeof raw === 'number') {
                    dt = new Date(raw);
                } else if (typeof raw === 'object' && typeof raw.toDate === 'function') {
                    // Firestore Timestamp
                    dt = raw.toDate();
                } else if (typeof raw === 'object' && raw.seconds) {
                    // Firestore Timestamp serializado: {seconds, nanoseconds}
                    dt = new Date(raw.seconds * 1000);
                } else {
                    dt = new Date(raw);
                }
                if (dt && !isNaN(dt.getTime())) return dt;
            }
            // Fallback: extrai data do id (Date.now() em ms)
            if (d.id && String(d.id).length >= 13) {
                const dt = new Date(Number(String(d.id).substring(0, 13)));
                if (!isNaN(dt.getTime())) return dt;
            }
            return null;
        };

        // State for invoice check
        // v3.11.30: Map<id, invoiceValue> para cálculo correto por transportadora (evita usar d.total bruto)
        window.invoiceSelectedNFs = new Map();
        window.invoiceCurrentCarrier = '';

        // === MULTI-MONTH PICKER HELPERS v3.11.48 ===
        // Helper: posiciona o dropdown com position:fixed para escapar de overflow:hidden
        const _positionMonthDropdown = () => {
            const trigger  = document.getElementById('invoiceMonthTrigger');
            const dropdown = document.getElementById('invoiceMonthOptions');
            if (!trigger || !dropdown) return;
            const r = trigger.getBoundingClientRect();
            dropdown.style.top   = `${r.bottom + 4}px`;
            dropdown.style.left  = `${r.left}px`;
            dropdown.style.width = `${r.width}px`;
        };

        window.toggleMonthDropdown = () => {
            const trigger  = document.getElementById('invoiceMonthTrigger');
            const dropdown = document.getElementById('invoiceMonthOptions');
            if (!trigger || !dropdown) return;
            const isOpen = dropdown.classList.contains('open');
            if (!isOpen) {
                _positionMonthDropdown(); // calcula coords antes de mostrar
                dropdown.classList.add('open');
                trigger.classList.add('open');
            } else {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            }
        };

        // Fecha ao clicar fora
        document.addEventListener('click', (e) => {
            const trigger  = document.getElementById('invoiceMonthTrigger');
            const dropdown = document.getElementById('invoiceMonthOptions');
            if (!trigger || !dropdown) return;
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            }
        }, true); // capture=true para pegar antes de toggleMonthDropdown

        // Reposiciona ao rolar / redimensionar (o dropdown segue o trigger)
        const _closeMonthDropdown = () => {
            document.getElementById('invoiceMonthOptions')?.classList.remove('open');
            document.getElementById('invoiceMonthTrigger')?.classList.remove('open');
        };
        window.addEventListener('scroll', _closeMonthDropdown, true);
        window.addEventListener('resize', _closeMonthDropdown);
        // Retorna array de strings "YYYY-MM" dos meses individualmente selecionados.
        // Array vazio = "Todos os meses" (sem filtro).
        window.getSelectedInvoiceMonths = () => {
            const allCb = document.getElementById('invoiceMonthAll');
            if (allCb && allCb.checked) return [];
            return Array.from(
                document.querySelectorAll('#invoiceMonthOptions input[type="checkbox"]:not(#invoiceMonthAll):checked')
            ).map(cb => cb.value);
        };
        window.updateMonthDropdownLabel = () => {
            const label = document.getElementById('invoiceMonthLabel');
            if (!label) return;
            const sel = window.getSelectedInvoiceMonths();
            if (!sel.length) {
                label.textContent = 'Todos os meses';
            } else if (sel.length === 1) {
                const [y, m] = sel[0].split('-');
                const s = new Date(Number(y), Number(m) - 1, 1)
                    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                label.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            } else {
                label.textContent = `${sel.length} meses selecionados`;
            }
        };
        // Clique no checkbox "Todos os meses"
        window.toggleAllMonths = (checked) => {
            const allCb = document.getElementById('invoiceMonthAll');
            if (checked) {
                // Desmarca todos os individuais; mantém "Todos" marcado
                document.querySelectorAll('#invoiceMonthOptions input[type="checkbox"]:not(#invoiceMonthAll)')
                    .forEach(cb => { cb.checked = false; });
                if (allCb) allCb.checked = true;
            }
            window.updateMonthDropdownLabel();
            window.filterInvoiceByCarrier();
        };
        // Clique em qualquer mês individual
        window.onMonthOptionChange = () => {
            const allCb = document.getElementById('invoiceMonthAll');
            const cbs = Array.from(
                document.querySelectorAll('#invoiceMonthOptions input[type="checkbox"]:not(#invoiceMonthAll)')
            );
            if (allCb) {
                // "Todos" fica marcado SOMENTE quando nenhum mês individual está selecionado
                allCb.checked = cbs.every(c => !c.checked);
            }
            window.updateMonthDropdownLabel();
            window.filterInvoiceByCarrier();
        };
        // Reconstrói as opções do dropdown com os meses presentes em `dispatches`.
        // `reset=true` limpa a seleção (muda de transportadora).
        window.populateMonthDropdown = (dispatches, reset) => {
            const dropdown = document.getElementById('invoiceMonthOptions');
            if (!dropdown) return;
            const prevSelected = new Set(reset ? [] : window.getSelectedInvoiceMonths());
            const monthsSet = new Set();
            dispatches.forEach(d => {
                // v3.11.52: usa _parseDispatchDate que suporta todos os formatos
                // (ISO, Firestore Timestamp, {seconds}, número, fallback d.id)
                const dt = window._parseDispatchDate ? window._parseDispatchDate(d) : null;
                if (!dt || isNaN(dt.getTime())) return;
                monthsSet.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
            });
            const months = [...monthsSet].sort().reverse(); // mais recente primeiro
            const noneSelected = prevSelected.size === 0;
            dropdown.innerHTML =
                `<label class="month-multi-option all-option"><input type="checkbox" id="invoiceMonthAll" ${noneSelected ? 'checked' : ''} onchange="window.toggleAllMonths(this.checked)">Todos os meses</label>` +
                (months.length === 0
                    ? `<div style="padding:0.6rem 0.75rem;font-size:0.82rem;color:var(--text-secondary);">Nenhum mês disponível</div>`
                    : months.map(key => {
                        const [y, m] = key.split('-');
                        const s = new Date(Number(y), Number(m) - 1, 1)
                            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                        const lbl = s.charAt(0).toUpperCase() + s.slice(1);
                        const chk = prevSelected.has(key) ? ' checked' : '';
                        return `<label class="month-multi-option"><input type="checkbox" value="${key}"${chk} onchange="window.onMonthOptionChange(this)">${lbl}</label>`;
                    }).join(''));
            console.log(`[MonthDropdown v3.11.47] ${months.length} meses populados. Reset=${reset}`, months);
            window.updateMonthDropdownLabel();
        };

        // Initialize invoice section when shown
        window.initInvoiceSection = async () => {
            const select = document.getElementById('invoiceCarrierFilter');
            if (!select) return;

            // v3.11.30: inclui transportadoras de NFs PAGAS também (evita sumiço de registros antigos)
            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];
            const VALID_STATUSES = ['Despachado', 'Pago', 'concluido']; // v3.11.51: inclui legado Firestore


            // Coleta transportadoras principais
            const mainCarriers = dispatches
                .filter(d => VALID_STATUSES.includes(d.status) && d.carrier)
                .map(d => d.carrier.toUpperCase().trim());

            // Coleta transportadoras de redespacho (somente as que têm valor real)
            const redespCarriers = dispatches
                .filter(d => VALID_STATUSES.includes(d.status) && d.redespCarrier && d.redespTotal > 0)
                .map(d => d.redespCarrier.toUpperCase().trim());

            // v3.11.62: suporte ao campo legado d.redespacho (NFs antigas sem redespCarrier)
            const legacyRedespCarriers = dispatches
                .filter(d => VALID_STATUSES.includes(d.status) && d.redespacho && d.redespacho !== '-' && d.redespacho !== '' && !d.redespCarrier)
                .map(d => d.redespacho.toUpperCase().trim());

            const allCarriers = [...new Set([...mainCarriers, ...redespCarriers, ...legacyRedespCarriers])].sort();

            select.innerHTML = '<option value="">-- Selecione --</option>';
            allCarriers.forEach(carrier => {
                select.innerHTML += `<option value="${carrier}">${carrier}</option>`;
            });

            // Clear state
            window.invoiceSelectedNFs = new Map();
            window.invoiceCurrentCarrier = '';
            window.updateInvoiceComparison();

            // ✅ v3.11.47: pré-popula o dropdown de meses com TODOS os despachos válidos
            // O usuário pode filtrar o mês ANTES de selecionar a transportadora
            const allValid = dispatches.filter(d => VALID_STATUSES.includes(d.status));
            window.populateMonthDropdown(allValid, true);
        };

        // Filter NFs by carrier
        window.filterInvoiceByCarrier = async (carrier) => {
            if (typeof carrier === 'undefined' || carrier instanceof Event) {
                carrier = document.getElementById('invoiceCarrierFilter') ? document.getElementById('invoiceCarrierFilter').value : '';
            }
            // v3.11.46: detecta troca de transportadora para resetar seleção de meses
            const _carrierChanged = carrier !== window.invoiceCurrentCarrier;
            window.invoiceCurrentCarrier = carrier;
            window.invoiceSelectedNFs = new Map();

            const tbody = document.getElementById('invoiceNFsBody');
            if (!tbody) return;
            


            if (!carrier) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Selecione uma transportadora para ver as NFs disponíveis.</td></tr>`;
                document.getElementById('invoiceNFsCount').textContent = '0 notas';
                window.updateInvoiceComparison();
                return;
            }

            // v3.11.30: inclui Despachado E Pago — NFs já pagas não somem mais da conferência
            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];
            const carrierNorm = carrier.toUpperCase().trim();
            const carrierNormNoSpace = carrierNorm.replace(/\s+/g, ''); // v3.11.54: sem espaços para fuzzy match
            const VALID_STATUSES_FILTER = ['Despachado', 'Pago', 'concluido'];

            // v3.11.54: helper de comparação — remove espaços de ambos os lados antes de comparar
            // Resolve: "RA" (dropdown) !== "R A TRANSPORTES" (Firestore) → agora bate "RA" === "RATRANSPORTES".startsWith("RA") ✓
            const _carrierMatch = (nfCarrier) => {
                if (!nfCarrier) return false;
                const n = nfCarrier.toUpperCase().trim();
                const nNoSpace = n.replace(/\s+/g, '');
                return n === carrierNorm || nNoSpace === carrierNormNoSpace ||
                       nNoSpace.startsWith(carrierNormNoSpace) || carrierNormNoSpace.startsWith(nNoSpace);
            };

            console.log(`[InvoiceFilter v3.11.54] Buscando NFs para ${carrierNorm} (semEspaço: ${carrierNormNoSpace}). Total despachos: ${dispatches.length}`);

            let filtered = dispatches
                .filter(d => VALID_STATUSES_FILTER.includes(d.status) && (
                    _carrierMatch(d.carrier) ||
                    (_carrierMatch(d.redespCarrier) && d.redespTotal > 0) ||
                    // v3.11.62: suporte ao campo legado d.redespacho (NFs antigas)
                    (_carrierMatch(d.redespacho) && !d.redespCarrier && d.redespacho && d.redespacho !== '-')
                ))
                .map(d => {
                    // v3.11.62: detecta redespacho tanto pelo campo novo quanto pelo legado
                    const isRedespNew = _carrierMatch(d.redespCarrier) && !_carrierMatch(d.carrier);
                    const isRedespLegacy = !d.redespCarrier && _carrierMatch(d.redespacho) && !_carrierMatch(d.carrier)
                                         && d.redespacho && d.redespacho !== '-';
                    const isRedesp = isRedespNew || isRedespLegacy;
                    // Calcula o valor correto para esta transportadora
                    let invoiceValue;
                    if (isRedespNew) {
                        // Redespacho novo: usa apenas o valor do redespacho
                        invoiceValue = d.redespTotal || 0;
                    } else if (isRedespLegacy) {
                        // Redespacho legado: usa redespTotal se existir, senão tenta calcular
                        // (NFs antigas podem ter o valor em d.total e não ter mainTotal/redespTotal)
                        invoiceValue = d.redespTotal || 0;
                        // Se redespTotal não foi salvo, tenta extrair do percentualRedespacho
                        if (!invoiceValue && d.percentualRedespacho && d.nfValue) {
                            invoiceValue = Math.round(d.nfValue * (d.percentualRedespacho / 100) * 100) / 100;
                        }
                    } else {
                        // Principal: usa o total menos o redespacho (evita dupla contagem)
                        // ✅ FIX v3.11.43: Math.round para evitar resíduo float na subtração
                        // Ex: 200.10 - 65.33 = 134.77000000000001 sem arredondamento
                        const raw = d.mainTotal != null ? d.mainTotal : (d.total - (d.redespTotal || 0));
                        invoiceValue = Math.round(raw * 100) / 100;
                    }
                    return { ...d, _invoiceValue: invoiceValue, _isRedesp: isRedesp, _isPago: d.status === 'Pago' };
                });

            console.log(`[InvoiceFilter v3.11.46] Antes do filtro de mês: ${filtered.length} NFs (Despachadas + Pagas)`);

            // Popula o dropdown de mêses (reseta seleção só quando transportadora muda)
            window.populateMonthDropdown(filtered, _carrierChanged);

            // Aplica filtro de mêses selecionados (array vazio = sem filtro = todos)
            const _selectedMonths = window.getSelectedInvoiceMonths();
            if (_selectedMonths.length > 0) {
                filtered = filtered.filter(d => {
                    // v3.11.52: usa _parseDispatchDate (robusta) para obter mês correto
                    const dispatchDate = window._parseDispatchDate(d);
                    if (!dispatchDate || isNaN(dispatchDate.getTime())) return false;
                    const key = `${dispatchDate.getFullYear()}-${String(dispatchDate.getMonth() + 1).padStart(2, '0')}`;
                    return _selectedMonths.includes(key);
                });
                console.log(`[InvoiceFilter v3.11.46] Após filtro meses [${_selectedMonths.join(', ')}]: ${filtered.length} NFs para ${carrierNorm}`);
            }

            if (filtered.length === 0) {
                const _mSel = window.getSelectedInvoiceMonths ? window.getSelectedInvoiceMonths() : [];
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhuma NF encontrada para esta transportadora${_mSel.length ? ` nos meses selecionados (${_mSel.length})` : ''}.</td></tr>`;
                document.getElementById('invoiceNFsCount').textContent = '0 notas';
                window.updateInvoiceComparison();
                return;
            }

            // ✅ FIX v3.11.44: helper que prioriza d.date (data retroativa/intencional)
            // em vez de dispatchedAt (timestamp real do registro) para exibir mês correto
            const _getEffectiveDate = (d) => {
                if (d.date) {
                    const dt = new Date(d.date);
                    if (!isNaN(dt.getTime())) return dt;
                }
                return window._parseDispatchDate(d) || new Date();
            };

            // Sort by effective dispatch date (most recent first)
            filtered.sort((a, b) => {
                const da = _getEffectiveDate(a);
                const db2 = _getEffectiveDate(b);
                return (db2 ? db2.getTime() : 0) - (da ? da.getTime() : 0);
            });

            tbody.innerHTML = filtered.map(d => {
                const dispatchDate = _getEffectiveDate(d);
                const invoiceValue = d._invoiceValue != null ? d._invoiceValue : (d.total || 0);
                const redespBadge = d._isRedesp ? `<span style="font-size:0.65rem;background:var(--accent-warning,#f59e0b);color:#000;border-radius:4px;padding:1px 4px;margin-left:4px;">REDESP</span>` : '';
                // v3.11.30: badge visual para NFs já pagas — visível mas diferenciado
                const pagoBadge = d._isPago ? `<span style="font-size:0.62rem;background:rgba(16,185,129,0.18);color:#10b981;border:1px solid rgba(16,185,129,0.35);border-radius:4px;padding:1px 5px;margin-left:4px;font-weight:600;">PAGO</span>` : '';
                const rowStyle = d._isPago ? ' style="opacity:0.7;background:rgba(16,185,129,0.04);"' : '';
                return `
                    <tr data-id="${d.id}"${rowStyle}>
                        <td style="text-align: center;">
                            <input type="checkbox" class="invoice-nf-checkbox" data-id="${d.id}" data-value="${invoiceValue}" onchange="window.toggleInvoiceNF(${d.id}, this.checked, ${invoiceValue})"${d._isPago ? ' title="NF já paga — marque apenas para reconferência"' : ''}>
                        </td>
                        <td style="font-weight: 600;">${d.invoice || '-'}${redespBadge}${pagoBadge}</td>
                        <td><div style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${d.client || ''}">${d.client || '-'}</div></td>
                        <td>${d.city || '-'}</td>
                        <td>${dispatchDate.toLocaleDateString('pt-BR')}</td>
                        <td style="text-align: right; font-weight: 600; color: var(--accent-success);">${Utils.formatCurrency(invoiceValue)}</td>
                    </tr>
                `;
            }).join('');

            const total = filtered.length;
            const pagas = filtered.filter(d => d._isPago).length;
            document.getElementById('invoiceNFsCount').textContent = pagas > 0
                ? `${total} notas (${pagas} já pagas)`
                : `${total} notas`;
            window.updateInvoiceComparison();
        };

        // v3.8.6 - Filtros por coluna na tabela de NFs da Conferência Fatura
        window.applyInvoiceColumnFilters = () => {
            const fNf     = (document.getElementById('invF_nf')?.value     || '').toLowerCase();
            const fClient = (document.getElementById('invF_client')?.value || '').toLowerCase();
            const fCity   = (document.getElementById('invF_city')?.value   || '').toLowerCase();
            const fDate   = (document.getElementById('invF_date')?.value   || '').toLowerCase();
            const fFrete  = (document.getElementById('invF_frete')?.value  || '').toLowerCase();

            const rows = document.querySelectorAll('#invoiceNFsBody tr[data-id]');
            let visible = 0;
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 6) { row.style.display = ''; return; }
                const nf    = (cells[1].textContent || '').toLowerCase();
                const cli   = (cells[2].textContent || '').toLowerCase();
                const city  = (cells[3].textContent || '').toLowerCase();
                const date  = (cells[4].textContent || '').toLowerCase();
                const frete = (cells[5].textContent || '').toLowerCase();

                const match =
                    (!fNf     || nf.includes(fNf))     &&
                    (!fClient || cli.includes(fClient)) &&
                    (!fCity   || city.includes(fCity))  &&
                    (!fDate   || date.includes(fDate))  &&
                    (!fFrete  || frete.includes(fFrete));

                row.style.display = match ? '' : 'none';
                if (match) visible++;
            });

            // Atualiza contador de notas visíveis
            const countEl = document.getElementById('invoiceNFsCount');
            if (countEl) {
                const total = rows.length;
                countEl.textContent = visible < total ? `${visible} de ${total} notas` : `${total} notas`;
            }
        };

        // Toggle single NF selection
        // v3.11.30: armazena o invoiceValue (valor por transportadora) junto com o ID
        window.toggleInvoiceNF = (id, checked, value) => {
            if (checked) {
                window.invoiceSelectedNFs.set(id, value || 0);
            } else {
                window.invoiceSelectedNFs.delete(id);
            }
            window.updateInvoiceComparison();
        };

        // Select/deselect all NFs
        // v3.11.30: armazena invoiceValue de cada NF ao selecionar todas
        window.selectAllInvoiceNFs = (selectAll) => {
            const checkboxes = document.querySelectorAll('.invoice-nf-checkbox');
            if (!selectAll) {
                window.invoiceSelectedNFs = new Map();
            }
            checkboxes.forEach(cb => {
                cb.checked = selectAll;
                const id = parseInt(cb.dataset.id);
                if (selectAll) {
                    window.invoiceSelectedNFs.set(id, parseFloat(cb.dataset.value || 0) || 0);
                }
            });

            const selectAllCb = document.getElementById('invoiceSelectAll');
            if (selectAllCb) selectAllCb.checked = selectAll;

            window.updateInvoiceComparison();
        };

        // Update comparison display
        // v3.11.30: usa Map<id,invoiceValue> para total correto por transportadora (sem dupla contagem de redespacho)
        window.updateInvoiceComparison = async () => {
            // Calculate selected total direto do Map — sem precisar recarregar dispatches
            let selectedTotal = 0;
            window.invoiceSelectedNFs.forEach((value, id) => {
                selectedTotal += (value || 0);
            });

            // Parse invoice value
            const invoiceInput = document.getElementById('invoiceValue');
            let invoiceValue = 0;
            if (invoiceInput && invoiceInput.value) {
                invoiceValue = parseFloat(invoiceInput.value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
            }

            // Update displays
            document.getElementById('invoiceSelectedCount').textContent = window.invoiceSelectedNFs.size || 0;
            document.getElementById('invoiceCalculatedTotal').textContent = Utils.formatCurrency(selectedTotal);
            document.getElementById('invoiceValueDisplay').textContent = Utils.formatCurrency(invoiceValue);

            // Calculate difference
            // ✅ FIX v3.11.43: arredondar antes de comparar para evitar float fantasma
            // Ex: 134.77000000000001 - 134.77 = 0.0000000001 → aparecia como "+R$ 0,00" vermelho
            const selRounded = Math.round(selectedTotal * 100) / 100;
            const invRounded = Math.round(invoiceValue  * 100) / 100;
            const difference = selRounded - invRounded;
            const diffEl = document.getElementById('invoiceDifference');
            const diffCard = document.getElementById('invoiceDifferenceCard');

            if (Math.abs(difference) < 0.01 && window.invoiceSelectedNFs.size > 0 && invoiceValue > 0) {
                diffEl.textContent = '✅ OK';
                diffEl.style.color = '#10b981';
                diffCard.style.background = 'rgba(16, 185, 129, 0.1)';
                diffCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            } else if (Math.abs(difference) >= 0.01 && window.invoiceSelectedNFs.size > 0 && invoiceValue > 0) {
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
                btnConfirm.disabled = !((window.invoiceSelectedNFs.size || 0) > 0 && invoiceValue > 0);
            }
        };

        // Clear form
        window.clearInvoiceForm = () => {
            document.getElementById('invoiceCarrierFilter').value = '';
            document.getElementById('invoiceValue').value = '';
            document.getElementById('invoiceRef').value = '';
            window.invoiceSelectedNFs = new Map();
            window.invoiceCurrentCarrier = '';
            window.filterInvoiceByCarrier('');
        };

        // ═══════════════════════════════════════════════════════════════
        // v3.11.50 — FERRAMENTA DE RECÁLCULO RETROATIVO TNORTE
        // ═══════════════════════════════════════════════════════════════
        function _recalcFreightPure(dispatch, rulesArr, cfgNorm) {
            const norm = Utils.normalizeString;
            const city    = norm(dispatch.city || '');
            const bairro  = norm(dispatch.neighborhood || '');
            const nfValue = parseFloat(dispatch.nfValue) || 0;
            const weight  = parseFloat(dispatch.weight)  || 0;
            const volume  = parseInt(dispatch.volume)    || 1;
            const isComp  = !!dispatch.isComplement;
            if (nfValue <= 0 || weight <= 0) return null;
            let cityRules = [], usedBairro = false;
            if (bairro) { const br = rulesArr.filter(r => norm(r.transportadora) === 'tnorte' && norm(r.cidade) === bairro); if (br.length) { cityRules = br; usedBairro = true; } }
            if (!cityRules.length) { const all = rulesArr.filter(r => norm(r.transportadora) === 'tnorte' && norm(r.cidade) === city); if (all.length) { const sem = all.filter(r => !r.redespacho || r.redespacho === '-'); cityRules = sem.length ? sem : all; } }
            if (!usedBairro) rulesArr.filter(r => norm(r.transportadora) === 'tnorte' && norm(r.cidadeRedespacho || '') === city).forEach(r => { if (!cityRules.includes(r)) cityRules.push(r); });
            if (!cityRules.length) return null;
            const rule   = cityRules[0];
            const config = cfgNorm['TNORTE'] || {};
            let baseVal  = nfValue * (rule.percentual / 100);
            if (!isComp && baseVal < rule.minimo) baseVal = rule.minimo;
            const tollVal    = rule.pedagio || 0;
            const grisVal    = nfValue * ((config.gris || 0) / 100);
            const volumeCost = (config.valorVolume > 0 && volume >= 1) ? volume * config.valorVolume : 0;
            let excessCost = 0;
            if (rule.limitePeso > 0 && weight > rule.limitePeso) excessCost = (weight - rule.limitePeso) * (rule.valorExcedente || 0);
            let redispatchCost = 0;
            if (rule.redespacho && rule.redespacho !== '-') {
                const rCity = norm(rule.cidadeRedespacho || '');
                if (!rCity || rCity === city || rCity === bairro) {
                    let rPct = rule.percentualRedespacho > 0 ? nfValue * (rule.percentualRedespacho / 100) : 0;
                    const rCfg = cfgNorm[(rule.redespacho || '').toUpperCase().trim()] || {};
                    let rVol   = (rCfg.valorVolume > 0 && volume >= 1) ? volume * rCfg.valorVolume : 0;
                    let rVal   = Math.max(rPct, rVol);
                    if (rVal < (rule.minimoRedespacho || 0)) rVal = rule.minimoRedespacho;
                    redispatchCost = rVal;
                }
            }
            const subtotal = baseVal + (config.taxaFixa || 0) + grisVal + excessCost + tollVal + volumeCost + redispatchCost;
            const factor   = 1 - ((config.icms || 0) / 100);
            const total    = factor > 0 ? subtotal / factor : subtotal;
            const R = v => Math.round(v * 100) / 100;
            return { total: R(total), mainTotal: R(total - redispatchCost), redespTotal: R(redispatchCost),
                baseCalculada: R(baseVal), excessoCalculado: R(excessCost), pedagio: R(tollVal),
                gris: R(grisVal), taxaFixa: R(config.taxaFixa || 0), icms: R(total - subtotal),
                percentual: rule.percentual, minimo: rule.minimo };
        }

        window._tnorteRecalcPreview = null;

        window.openTNorteRecalcTool = async () => {
            const modal = document.getElementById('tnorteRecalcModal');
            if (!modal) return;
            modal.style.display = 'flex';
            document.getElementById('tnorteRecalcBody').innerHTML =
                '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><span class="material-icons-round" style="font-size:3rem;display:block;animation:spin 1s linear infinite;">sync</span><p style="margin-top:1rem;">Carregando histórico de despachos...</p></div>';
            document.getElementById('btnApplyTNorteRecalc').style.display = 'none';

            // v3.11.56: sempre re-ler regras do storage ANTES de calcular
            // (evita "Sem Regra" quando as tabelas chegaram do Firestore após o init)
            rules = Utils.getStorage('freight_tables') || [];
            console.log(`[RecalcTNORTE v3.11.56] rules carregadas: ${rules.length} total`);
            const tnorteRules = rules.filter(r => (r.transportadora || '').toUpperCase().trim() === 'TNORTE');
            console.log(`[RecalcTNORTE v3.11.56] regras TNORTE: ${tnorteRules.length}`);
            if (tnorteRules.length > 0) {
                const cidades = [...new Set(tnorteRules.map(r => r.cidade))].slice(0, 8);
                console.log(`[RecalcTNORTE v3.11.56] cidades TNORTE (amostra): ${JSON.stringify(cidades)}`);
            }

            const allDispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];
            const cutoff = new Date(); cutoff.setHours(23, 59, 59, 999);
            const tnorteDispatches = allDispatches.filter(d => {
                const cn = (d.carrier || '').trim().toUpperCase();
                const dt = d.date ? new Date(d.date) : (d.dispatchedAt ? new Date(d.dispatchedAt) : null);
                return cn === 'TNORTE' && (!dt || dt <= cutoff);
            });
            if (!tnorteDispatches.length) {
                document.getElementById('tnorteRecalcBody').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2.5rem;">search_off</span><p>Nenhum despacho da TNORTE encontrado no histórico.</p></div>';
                return;
            }

            // v3.11.56: se ainda não tem regras, mostrar aviso claro
            if (tnorteRules.length === 0) {
                document.getElementById('tnorteRecalcBody').innerHTML = `
                    <div style="text-align:center;padding:2rem;">
                        <span class="material-icons-round" style="font-size:2.5rem;color:#f59e0b;">warning</span>
                        <p style="margin-top:1rem;font-weight:600;">Nenhuma regra da TNORTE encontrada na tabela de fretes.</p>
                        <p style="font-size:.85rem;color:var(--text-secondary);">Acesse <strong>Tabelas de Frete</strong> e verifique se as regras da TNORTE estão cadastradas antes de recalcular.</p>
                        <p style="font-size:.8rem;color:var(--text-secondary);margin-top:.5rem;">Total de regras carregadas: <strong>${rules.length}</strong></p>
                    </div>`;
                return;
            }

            // v3.11.56: também re-ler carrierConfigs do storage
            carrierConfigs = Utils.getStorage('carrier_configs') || {};
            const cfgNorm = {};
            Object.keys(carrierConfigs).forEach(k => { cfgNorm[k.toUpperCase().trim()] = carrierConfigs[k]; });
            const results = tnorteDispatches.map(d => {
                const newCalc = _recalcFreightPure(d, rules, cfgNorm);
                const oldTotal = parseFloat(d.total) || 0;
                const newTotal = newCalc ? newCalc.total : null;
                const diff = newTotal !== null ? Math.round((newTotal - oldTotal) * 100) / 100 : null;
                return { dispatch: d, newCalc, oldTotal, newTotal, diff };
            });
            window._tnorteRecalcPreview = results;
            const fmt  = v => Utils.formatCurrency(v);
            const dc   = d => d > 0 ? '#ef4444' : d < 0 ? '#10b981' : 'var(--text-secondary)';
            const sign = d => d > 0 ? '+' : '';
            const withRule  = results.filter(r => r.newCalc);
            const noRule    = results.filter(r => !r.newCalc);
            const changed   = withRule.filter(r => Math.abs(r.diff) >= 0.01);
            const unchanged = withRule.filter(r => Math.abs(r.diff) < 0.01);
            const totalDiff = changed.reduce((s, r) => s + r.diff, 0);
            const rows = results.map(r => {
                const d = r.dispatch;
                const rawDate = d.date || d.dispatchedAt;
                const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('pt-BR') : '?';
                const pagoBadge = (d.status||'').toLowerCase().includes('pago') ? '<span style="font-size:.6rem;background:rgba(16,185,129,.15);color:#10b981;padding:1px 5px;border-radius:4px;margin-left:3px;">PAGO</span>' : '';
                if (!r.newCalc) return `<tr style="opacity:.5;"><td>${d.invoice||'S/N'}</td><td style="font-size:.8rem;">${d.client||'-'}</td><td style="font-size:.8rem;">${d.city||'-'}</td><td style="font-size:.8rem;">${dateStr}</td><td style="text-align:right;">${fmt(r.oldTotal)}</td><td style="text-align:right;color:var(--text-secondary);">—</td><td style="text-align:right;color:#f59e0b;font-size:.78rem;">Sem regra${pagoBadge}</td></tr>`;
                const diffCell = Math.abs(r.diff) < 0.01 ? '<span style="color:var(--text-secondary);">≈ igual</span>' : `<span style="color:${dc(r.diff)};font-weight:700;">${sign(r.diff)}${fmt(r.diff)}</span>`;
                return `<tr><td>${d.invoice||'S/N'}${pagoBadge}</td><td style="font-size:.8rem;">${d.client||'-'}</td><td style="font-size:.8rem;">${d.city||'-'}</td><td style="font-size:.8rem;">${dateStr}</td><td style="text-align:right;">${fmt(r.oldTotal)}</td><td style="text-align:right;font-weight:600;color:#3b82f6;">${fmt(r.newTotal)}</td><td style="text-align:right;">${diffCell}</td></tr>`;
            }).join('');
            document.getElementById('tnorteRecalcBody').innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.25rem;">
                    <div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:.75rem;text-align:center;"><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Total NFs</div><div style="font-size:1.4rem;font-weight:700;color:#3b82f6;">${results.length}</div></div>
                    <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.75rem;text-align:center;"><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Com Mudança</div><div style="font-size:1.4rem;font-weight:700;color:#f59e0b;">${changed.length}</div></div>
                    <div style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:8px;padding:.75rem;text-align:center;"><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Sem Mudança</div><div style="font-size:1.4rem;font-weight:700;color:#10b981;">${unchanged.length}</div></div>
                    <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:.75rem;text-align:center;"><div style="font-size:.68rem;color:var(--text-secondary);text-transform:uppercase;">Sem Regra</div><div style="font-size:1.4rem;font-weight:700;color:#ef4444;">${noRule.length}</div></div>
                </div>
                ${changed.length > 0 ? `<div style="background:rgba(59,130,246,.07);border:1px solid rgba(59,130,246,.2);border-radius:8px;padding:.6rem 1rem;margin-bottom:1rem;font-size:.84rem;">Impacto total em <strong>${changed.length} NFs</strong>: <strong style="color:${dc(totalDiff)};margin-left:6px;">${sign(totalDiff)}${fmt(totalDiff)}</strong> <span style="color:var(--text-secondary);font-size:.74rem;margin-left:8px;">(+ = frete aumentou, − = diminuiu)</span></div>` : ''}
                <div style="overflow-x:auto;max-height:380px;overflow-y:auto;border-radius:8px;border:1px solid var(--border-color);">
                    <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
                        <thead><tr style="background:var(--card-bg);position:sticky;top:0;z-index:1;">
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">NF</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">Cliente</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">Cidade</th>
                            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">Data</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">Frete Atual</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border-color);font-size:.72rem;color:#3b82f6;">Frete Novo</th>
                            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid var(--border-color);font-size:.72rem;color:var(--text-secondary);">Diferença</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
            if (changed.length > 0) {
                const btn = document.getElementById('btnApplyTNorteRecalc');
                btn.style.display = 'inline-flex'; btn.textContent = 'Aplicar Recálculo (' + changed.length + ' NFs)'; btn.disabled = false;
            }
        };

        window.applyTNorteRecalc = () => {
            const preview = window._tnorteRecalcPreview;
            if (!preview) return;
            const toChange = preview.filter(r => r.newCalc && Math.abs(r.diff) >= 0.01);
            if (!toChange.length) return;
            window.requestSupervisorPassword('Recálculo Retroativo TNORTE — ' + toChange.length + ' NFs', async () => {
                const recalcAt = new Date().toISOString();
                let ok = 0, fail = 0;
                document.getElementById('btnApplyTNorteRecalc').disabled = true;
                document.getElementById('btnApplyTNorteRecalc').textContent = 'Aplicando...';
                for (const r of toChange) {
                    const d = r.dispatch; const numId = Number(d.id); const c = r.newCalc;
                    const update = { total: c.total, mainTotal: c.mainTotal, redespTotal: c.redespTotal,
                        baseCalculada: c.baseCalculada, excessoCalculado: c.excessoCalculado,
                        pedagio: c.pedagio, gris: c.gris, taxaFixa: c.taxaFixa,
                        icms: c.icms, percentual: c.percentual, minimo: c.minimo,
                        _recalcAt: recalcAt, _totalAntes: r.oldTotal,
                        _mainTotalAntes: parseFloat(d.mainTotal) || r.oldTotal, _recalcVersion: '3.11.50' };
                    try {
                        const local = Utils.getStorage('dispatches') || [];
                        const li = local.findIndex(x => Number(x.id) === numId);
                        if (li !== -1) { Object.assign(local[li], update); Utils.setStorage('dispatches', local); }
                        if (Utils.Cloud.hasTenant() && window.db)
                            await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                                .collection('dispatches_db').doc(String(numId)).update(update);
                        if (window._dispatchesFullCache) { const ci = window._dispatchesFullCache.findIndex(x => Number(x.id) === numId); if (ci !== -1) Object.assign(window._dispatchesFullCache[ci], update); }
                        ok++;
                    } catch (e) { console.error('[RecalcTNORTE] NF ' + d.invoice + ':', e); fail++; }
                }
                window._tnorteRecalcPreview = null;
                document.getElementById('tnorteRecalcModal').style.display = 'none';
                Utils.showToast(fail === 0 ? ('✅ Recálculo concluído! ' + ok + ' NFs da TNORTE atualizadas.') : ('⚠️ ' + ok + ' atualizadas, ' + fail + ' com erro.'), fail === 0 ? 'success' : 'error');
                if (typeof window.renderAppHistory === 'function') window.renderAppHistory();
            });
        };

        // === v3.11.49: Validação de campos obrigatórios da Conferência ===
        const _invoiceFields = () => [
            {
                id: 'invFieldCarrier',
                valid: () => {
                    const v = document.getElementById('invoiceCarrierFilter')?.value || '';
                    return v.trim() !== '';
                }
            },
            {
                id: 'invFieldMonth',
                valid: () => {
                    // válido: "Todos os meses" marcado OU ao menos um mês específico selecionado
                    const allCb = document.getElementById('invoiceMonthAll');
                    if (allCb && allCb.checked) return true;
                    const any = document.querySelectorAll('#invoiceMonthOptions input[type="checkbox"]:not(#invoiceMonthAll):checked');
                    return any.length > 0;
                }
            },
            {
                id: 'invFieldValue',
                valid: () => {
                    const raw = document.getElementById('invoiceValue')?.value || '';
                    const num = parseFloat(raw.replace(/[^\d,.-]/g, '').replace(',', '.'));
                    return !isNaN(num) && num > 0;
                }
            },
            {
                id: 'invFieldRef',
                valid: () => {
                    const v = document.getElementById('invoiceRef')?.value || '';
                    return v.trim() !== '';
                }
            }
        ];

        window._validateInvoiceFields = () => {
            let ok = true;
            _invoiceFields().forEach(f => {
                const el = document.getElementById(f.id);
                if (!el) return;
                if (f.valid()) {
                    el.classList.remove('invoice-field-error');
                } else {
                    el.classList.add('invoice-field-error');
                    ok = false;
                }
            });
            return ok;
        };

        // Limpa erro de cada campo quando o usuário interage com ele
        (() => {
            const clearErr = (fieldId) => {
                document.getElementById(fieldId)?.classList.remove('invoice-field-error');
            };
            document.getElementById('invoiceCarrierFilter')?.addEventListener('change', () => clearErr('invFieldCarrier'));
            document.getElementById('invoiceValue')?.addEventListener('input', () => clearErr('invFieldValue'));
            document.getElementById('invoiceRef')?.addEventListener('input', () => clearErr('invFieldRef'));
            // Mês: limpa ao fechar o dropdown
            document.getElementById('invoiceMonthTrigger')?.addEventListener('click', () => {
                setTimeout(() => {
                    if (_invoiceFields()[1].valid()) clearErr('invFieldMonth');
                }, 200);
            });
        })();

        // Confirm payment
        // v3.11.30: usa valores do Map (por transportadora) para cálculo correto
        window.confirmInvoicePayment = async () => {
            // v3.11.49: Valida campos obrigatórios antes de prosseguir
            if (!window._validateInvoiceFields()) {
                Utils.showToast('Preencha todos os campos obrigatórios (marcados com *)', 'error');
                return;
            }

            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];

            // Calculate totals usando valores armazenados no Map (invoiceValue por transportadora)
            let selectedTotal = 0;
            window.invoiceSelectedNFs.forEach((value, id) => {
                selectedTotal += (value || 0);
            });

            const invoiceValue = parseFloat(document.getElementById('invoiceValue').value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;

            // ✅ FIX v3.11.42: Arredondar para 2 casas decimais antes de comparar.
            // A soma de floats pode gerar imprecisão (ex: 134.77000000001 vs 134.77)
            // que aparece como R$ 0,00 na tela mas !== 0 na comparação exata.
            const selectedTotalRounded = Math.round(selectedTotal * 100) / 100;
            const invoiceValueRounded  = Math.round(invoiceValue  * 100) / 100;
            const difference = selectedTotalRounded - invoiceValueRounded;

            // Tolerância: só exige supervisor se diferença >= R$ 0,01
            if (Math.abs(difference) >= 0.01) {
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
        window.processInvoicePayment = async (justification = '', authorizedBy = '') => {
            console.log('💳 [Invoice] Iniciando processamento de pagamento...');
            console.log('💳 [Invoice] NFs selecionadas:', [...window.invoiceSelectedNFs]);

            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];
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

            const paidUpdate = {
                status: 'Pago',
                paidAt: new Date().toISOString(),
                invoiceRef: invoiceRef,
                paidBy: userName,
                ...(justification ? { paymentNote: justification } : {}),
                ...(authorizedBy ? { authorizedBy: authorizedBy } : {})
            };

            dispatches.forEach(d => {
                if (window.invoiceSelectedNFs.has(d.id)) {
                    const invoiceVal = window.invoiceSelectedNFs.get(d.id) || 0;
                    console.log(`💳 [Invoice] Marcando NF ${d.invoice} (ID: ${d.id}) como PAGA - valor conferência: ${invoiceVal}`);
                    Object.assign(d, paidUpdate);
                    paidCount++;
                    totalPaid += invoiceVal;
                    paidNFs.push(d.invoice);
                }
            });

            console.log(`💳 [Invoice] NFs marcadas como pagas: ${paidCount}`);

            // 1. localStorage
            console.log('💳 [Invoice] Salvando dispatches no localStorage...');
            Utils.setStorage('dispatches', dispatches);

            // 2. Firestore — persiste status 'Pago' em cada dispatch individual
            // v3.11.30 FIX: usa set({merge:true}) em vez de update() para criar o doc se não existir
            // (registros antigos podem estar apenas no localStorage, nunca migrados para dispatches_db)
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                const batch = window.db.batch();
                let batchCount = 0;
                dispatches.forEach(d => {
                    if (window.invoiceSelectedNFs.has(d.id)) {
                        const docRef = window.db
                            .collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(d.id));
                        // set({merge:true}) cria o doc se não existir, ou mescla se já existir
                        // Isso resolve o caso de NFs que estavam apenas no localStorage
                        batch.set(docRef, { ...d, ...paidUpdate }, { merge: true });
                        batchCount++;
                    }
                });
                if (batchCount > 0) {
                    try {
                        await batch.commit();
                        console.log(`💳 [Invoice] ${batchCount} NFs persistidas como PAGAS no Firestore dispatches_db (set+merge)!`);
                    } catch (e) {
                        console.error('[Invoice] Falha ao persistir status Pago no Firestore:', e);
                        showToast('⚠️ Aviso: falha ao salvar no servidor. Os dados podem não persistir após recarregar.', 'warning');
                    }
                }
            }

            // 3. Cache em memória
            if (window._dispatchesFullCache) {
                dispatches.forEach(d => {
                    if (window.invoiceSelectedNFs.has(d.id)) {
                        const ci = window._dispatchesFullCache.findIndex(x => Number(x.id) === Number(d.id));
                        if (ci !== -1) Object.assign(window._dispatchesFullCache[ci], paidUpdate);
                    }
                });
            }
            // Limpa o Map após pagamento
            window.invoiceSelectedNFs = new Map();

            console.log('💳 [Invoice] Dispatches salvos (localStorage + Firestore + cache)!');

            // Save to invoice history
            const invoiceHistory = Utils.getStorage('invoice_history') || [];
            const newHistoryEntry = {
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
            };
            invoiceHistory.push(newHistoryEntry);
            Utils.setStorage('invoice_history', invoiceHistory);

            // Persiste também no Firestore para sobreviver a reloads
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                try {
                    await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('invoice_history_db').doc(String(newHistoryEntry.id))
                        .set(newHistoryEntry);
                    console.log('💳 [Invoice] Histórico de faturas salvo no Firestore!');
                } catch (e) {
                    console.warn('[Invoice] Falha ao salvar histórico no Firestore:', e);
                }
            }
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

        // ==========================================
        // ANÁLISE DE FATURAS CONFERIDAS - v3.11.20
        // ==========================================

        // Alterna entre sub-abas da seção de Conferência de Fatura
        window.showInvoiceTab = (tab) => {
            const tabConferir = document.getElementById('invoice-tab-conferir');
            const tabAnalysis = document.getElementById('invoice-tab-analysis');
            const btnConferir = document.getElementById('btnTabConferir');
            const btnAnalysis = document.getElementById('btnTabAnalysis');

            if (tab === 'conferir') {
                if (tabConferir) tabConferir.style.display = '';
                if (tabAnalysis) tabAnalysis.style.display = 'none';
                if (btnConferir) {
                    btnConferir.style.borderBottom = '2.5px solid var(--primary-color)';
                    btnConferir.style.color = 'var(--primary-color)';
                    btnConferir.style.background = 'rgba(59,130,246,0.08)';
                }
                if (btnAnalysis) {
                    btnAnalysis.style.borderBottom = '2.5px solid transparent';
                    btnAnalysis.style.color = 'var(--text-secondary)';
                    btnAnalysis.style.background = 'transparent';
                }
            } else {
                if (tabConferir) tabConferir.style.display = 'none';
                if (tabAnalysis) tabAnalysis.style.display = '';
                if (btnAnalysis) {
                    btnAnalysis.style.borderBottom = '2.5px solid var(--primary-color)';
                    btnAnalysis.style.color = 'var(--primary-color)';
                    btnAnalysis.style.background = 'rgba(59,130,246,0.08)';
                }
                if (btnConferir) {
                    btnConferir.style.borderBottom = '2.5px solid transparent';
                    btnConferir.style.color = 'var(--text-secondary)';
                    btnConferir.style.background = 'transparent';
                }
                window.renderInvoiceAnalysis();
            }
        };

        // Carrega dados e popula os filtros da aba de análise
        window.renderInvoiceAnalysis = async () => {
            // Sempre tenta sincronizar do Firestore antes de renderizar
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                try {
                    const snap = await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('invoice_history_db').get();
                    if (!snap.empty) {
                        const fsHistory = snap.docs.map(d => d.data());
                        Utils.setStorage('invoice_history', fsHistory);
                        console.log(`🔄 [Invoice Analysis] invoice_history sincronizado do Firestore: ${fsHistory.length} registros`);
                    }
                } catch (e) {
                    console.warn('[Invoice Analysis] Falha ao sincronizar do Firestore:', e);
                }
            }

            const history = Utils.getStorage('invoice_history') || [];

            // Popula o select de transportadoras com base no histórico
            const carriers = [...new Set(history.map(h => h.carrier).filter(Boolean))].sort();
            const carrierFilter = document.getElementById('analysisCarrierFilter');
            if (carrierFilter) {
                const currentVal = carrierFilter.value;
                carrierFilter.innerHTML = '<option value="">Todas</option>';
                carriers.forEach(c => {
                    carrierFilter.innerHTML += `<option value="${c}"${currentVal === c ? ' selected' : ''}>${c}</option>`;
                });
            }

            window.filterInvoiceAnalysis();
        };

        // Aplica filtros e renderiza todas as seções da aba de análise
        window.filterInvoiceAnalysis = () => {
            const history = Utils.getStorage('invoice_history') || [];

            const carrierVal = document.getElementById('analysisCarrierFilter')?.value || '';
            const monthVal   = document.getElementById('analysisMonthFilter')?.value   || '';
            const statusVal  = document.getElementById('analysisStatusFilter')?.value  || '';

            // Filtra o histórico
            let filtered = history.filter(h => {
                if (carrierVal && h.carrier !== carrierVal) return false;
                if (monthVal) {
                    const [yr, mo] = monthVal.split('-');
                    const d = new Date(h.date);
                    if (d.getFullYear().toString() !== yr ||
                        (d.getMonth() + 1).toString().padStart(2, '0') !== mo) return false;
                }
                if (statusVal === 'conforme'     && h.difference !== 0) return false;
                if (statusVal === 'nao-conforme' && h.difference === 0) return false;
                return true;
            });

            // Ordena por data decrescente
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

            // ── CARDS DE RESUMO ──────────────────────────────
            const total        = filtered.length;
            const conformes    = filtered.filter(h => h.difference === 0).length;
            const naoConformes = total - conformes;
            const divTot       = filtered
                .filter(h => h.difference !== 0)
                .reduce((s, h) => s + Math.abs(h.difference || 0), 0);

            const safeSet = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            safeSet('analysisCardTotal',           total);
            safeSet('analysisCardConformes',       conformes);
            safeSet('analysisCardConformesPct',    total > 0 ? `${Math.round(conformes    / total * 100)}% do total` : '—');
            safeSet('analysisCardNaoConformes',    naoConformes);
            safeSet('analysisCardNaoConformesPct', total > 0 ? `${Math.round(naoConformes / total * 100)}% do total` : '—');
            safeSet('analysisCardDivergencia',     Utils.formatCurrency(divTot));

            const countEl = document.getElementById('analysisInvoiceCount');
            if (countEl) countEl.textContent = `${total} fatura${total !== 1 ? 's' : ''}`;

            // ── TABELA DE FATURAS CONFERIDAS ─────────────────
            const tbody = document.getElementById('analysisInvoiceBody');
            if (tbody) {
                if (filtered.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhuma fatura encontrada com os filtros selecionados.</td></tr>`;
                } else {
                    tbody.innerHTML = filtered.map(h => {
                        const isConf    = h.difference === 0;
                        const diffAbs   = Math.abs(h.difference || 0);
                        const diffColor = isConf ? '#10b981' : (h.difference < 0 ? '#ef4444' : '#3b82f6');
                        const diffSign  = (h.difference || 0) > 0 ? '+' : '';
                        const badge     = isConf
                            ? `<span style="background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:5px;padding:2px 9px;font-size:0.73rem;font-weight:700;white-space:nowrap;">✅ Conforme</span>`
                            : `<span style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:5px;padding:2px 9px;font-size:0.73rem;font-weight:700;white-space:nowrap;">⚠️ Não Conforme</span>`;
                        const authInfo  = h.authorizedBy
                            ? `<br><span style="font-size:0.7rem;color:var(--accent-warning);">Auth: ${h.authorizedBy}</span>` : '';
                        const justTitle = h.justification ? ` title="Justif.: ${h.justification}"` : '';
                        return `
                            <tr${justTitle}>
                                <td style="font-size:0.82rem;">${new Date(h.date).toLocaleDateString('pt-BR')}</td>
                                <td style="font-weight:600;">${h.carrier || '—'}</td>
                                <td style="font-size:0.82rem;">${h.invoiceRef || '—'}</td>
                                <td style="text-align:center;">${h.nfCount || 0}</td>
                                <td style="text-align:right;font-weight:600;color:#10b981;">${Utils.formatCurrency(h.calculatedValue || 0)}</td>
                                <td style="text-align:right;font-weight:600;color:#f59e0b;">${Utils.formatCurrency(h.invoiceValue || 0)}</td>
                                <td style="text-align:right;font-weight:700;color:${diffColor};">${isConf ? '—' : diffSign + Utils.formatCurrency(diffAbs)}</td>
                                <td style="text-align:center;">${badge}</td>
                                <td style="font-size:0.8rem;">${h.confirmedBy || '—'}${authInfo}</td>
                                <td style="text-align:center;">
                                    <button class="btn-estornar" data-hid="${h.id}" title="Estornar fatura"
                                        style="background:none;border:1px solid rgba(239,68,68,0.4);border-radius:6px;padding:3px 8px;cursor:pointer;color:#ef4444;font-size:0.75rem;font-family:inherit;display:inline-flex;align-items:center;gap:2px;transition:all 0.15s;white-space:nowrap;">
                                        <span class="material-icons-round" style="font-size:0.9rem;">undo</span>Estornar
                                    </button>
                                </td>
                            </tr>`;
                    }).join('');

                    // Event delegation: captura clique nos botões Estornar
                    tbody.addEventListener('click', function estornoDelegate(e) {
                        const btn = e.target.closest('.btn-estornar');
                        if (!btn) return;
                        const hid = btn.getAttribute('data-hid');
                        window.showEstornoModal(hid);
                    });
                }
            }

            // ── RELATÓRIO DE DIVERGÊNCIA POR TRANSPORTADORA ──
            const naoConformesArr = filtered.filter(h => h.difference !== 0);
            const divSection = document.getElementById('analysisDivergenceSection');
            if (divSection) divSection.style.display = naoConformesArr.length > 0 ? '' : 'none';

            // Agrupa não-conformes filtrados por transportadora
            const byCarrier = {};
            naoConformesArr.forEach(h => {
                const c = h.carrier || 'Sem transportadora';
                if (!byCarrier[c]) {
                    byCarrier[c] = { carrier: c, count: 0, totalDiff: 0, maxDiff: 0, faturas: [] };
                }
                byCarrier[c].count++;
                byCarrier[c].totalDiff += (h.difference || 0);
                byCarrier[c].maxDiff    = Math.max(byCarrier[c].maxDiff, Math.abs(h.difference || 0));
                byCarrier[c].faturas.push(h);
            });

            // Conta o total de faturas por transportadora no histórico completo (para o %)
            const totalByCarrier = {};
            history.forEach(h => {
                const c = h.carrier || 'Sem transportadora';
                totalByCarrier[c] = (totalByCarrier[c] || 0) + 1;
            });

            const divBody = document.getElementById('analysisDivergenceBody');
            if (divBody) {
                const rows = Object.values(byCarrier).sort((a, b) => Math.abs(b.totalDiff) - Math.abs(a.totalDiff));

                divBody.innerHTML = rows.map((r, idx) => {
                    const totalFat  = totalByCarrier[r.carrier] || r.count;
                    const pct       = Math.round(r.count / totalFat * 100);
                    const diffColor = r.totalDiff > 0 ? '#3b82f6' : '#ef4444';
                    const diffLabel = r.totalDiff > 0 ? '🔵 Cobrado a menos' : '🔴 Cobrado a mais';
                    const diffSign  = r.totalDiff > 0 ? '+' : '';
                    const pctColor  = pct >= 50 ? '#ef4444' : (pct >= 25 ? '#f59e0b' : '#10b981');

                    // Linhas de detalhe (faturas individuais desta transportadora)
                    const detailRows = r.faturas.map(f => `
                        <tr style="border-top:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:5px 10px;font-size:0.79rem;">${new Date(f.date).toLocaleDateString('pt-BR')}</td>
                            <td style="padding:5px 10px;font-size:0.79rem;">${f.invoiceRef || '—'}</td>
                            <td style="padding:5px 10px;text-align:center;font-size:0.79rem;">${f.nfCount || 0}</td>
                            <td style="padding:5px 10px;text-align:right;color:#10b981;font-size:0.79rem;">${Utils.formatCurrency(f.calculatedValue || 0)}</td>
                            <td style="padding:5px 10px;text-align:right;color:#f59e0b;font-size:0.79rem;">${Utils.formatCurrency(f.invoiceValue || 0)}</td>
                            <td style="padding:5px 10px;text-align:right;font-weight:700;font-size:0.79rem;color:${(f.difference||0) < 0 ? '#ef4444' : '#3b82f6'};">  ${(f.difference||0) > 0 ? '+' : ''}${Utils.formatCurrency(f.difference || 0)}</td>
                            <td style="padding:5px 10px;font-size:0.75rem;color:var(--text-secondary);" title="${f.justification || ''}">${f.justification ? f.justification.substring(0, 40) + (f.justification.length > 40 ? '…' : '') : '—'}</td>
                        </tr>`).join('');

                    return `
                        <tr>
                            <td style="font-weight:700;font-size:0.95rem;">${r.carrier}</td>
                            <td style="text-align:center;">
                                <span style="font-size:1.1rem;font-weight:700;color:#ef4444;">${r.count}</span>
                                <span style="font-size:0.75rem;color:var(--text-secondary);"> / ${totalFat}</span>
                            </td>
                            <td style="text-align:right;font-weight:700;color:${diffColor};">${diffSign}${Utils.formatCurrency(r.totalDiff)}</td>
                            <td style="text-align:right;color:var(--text-secondary);">${Utils.formatCurrency(r.maxDiff)}</td>
                            <td style="text-align:center;">
                                <span style="display:inline-block;background:rgba(239,68,68,0.1);border-radius:20px;padding:2px 12px;font-size:0.82rem;color:${pctColor};font-weight:700;">${pct}%</span>
                            </td>
                            <td style="text-align:center;font-size:0.82rem;color:${diffColor};font-weight:600;">${diffLabel}</td>
                            <td style="text-align:center;">
                                <button id="btnDetail_${idx}" onclick="window.toggleCarrierDetail(${idx})"
                                    style="background:none;border:1px solid var(--border-color);border-radius:6px;padding:3px 10px;cursor:pointer;color:var(--text-secondary);font-size:0.78rem;font-family:inherit;display:inline-flex;align-items:center;gap:3px;transition:all 0.15s;">
                                    <span class="material-icons-round" style="font-size:0.95rem;">expand_more</span>Ver
                                </button>
                            </td>
                        </tr>
                        <tr id="carrierDetail_${idx}" style="display:none;">
                            <td colspan="7" style="padding:0;">
                                <div style="background:rgba(0,0,0,0.2);border-left:3px solid ${diffColor};padding:0.4rem 0;">
                                    <table style="width:100%;border-collapse:collapse;">
                                        <thead>
                                            <tr style="color:var(--text-secondary);font-size:0.75rem;">
                                                <th style="padding:4px 10px;text-align:left;font-weight:500;">Data</th>
                                                <th style="padding:4px 10px;text-align:left;font-weight:500;">Ref. Fatura</th>
                                                <th style="padding:4px 10px;text-align:center;font-weight:500;">NFs</th>
                                                <th style="padding:4px 10px;text-align:right;font-weight:500;">Calculado</th>
                                                <th style="padding:4px 10px;text-align:right;font-weight:500;">Fatura</th>
                                                <th style="padding:4px 10px;text-align:right;font-weight:500;">Diferença</th>
                                                <th style="padding:4px 10px;text-align:left;font-weight:500;">Justificativa</th>
                                            </tr>
                                        </thead>
                                        <tbody>${detailRows}</tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>`;
                }).join('');
            }
        };

        // Expande/recolhe o detalhe de uma transportadora no relatório
        window.toggleCarrierDetail = (idx) => {
            const detail = document.getElementById(`carrierDetail_${idx}`);
            const btn    = document.getElementById(`btnDetail_${idx}`);
            if (!detail) return;
            const isOpen = detail.style.display !== 'none';
            detail.style.display = isOpen ? 'none' : '';
            if (btn) {
                const icon = btn.querySelector('.material-icons-round');
                if (icon) icon.textContent = isOpen ? 'expand_more' : 'expand_less';
                btn.style.color           = isOpen ? 'var(--text-secondary)' : 'var(--primary-color)';
                btn.style.borderColor     = isOpen ? 'var(--border-color)'   : 'var(--primary-color)';
            }
        };

        // ── ESTORNO DE FATURA ─────────────────────────────
        // Referência do histórico que será estornado (salvo entre modal open → confirm)
        let _pendingEstornoId = null;

        window.showEstornoModal = async (historyId) => {
            let history = [];
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                try {
                    const snap = await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('invoice_history_db').get();
                    if (!snap.empty) {
                        history = snap.docs.map(d => d.data());
                        Utils.setStorage('invoice_history', history);
                    }
                } catch (e) {
                    console.warn('[Estorno Modal] Falha ao carregar do Firestore, usando localStorage:', e);
                }
            }
            if (history.length === 0) {
                history = Utils.getStorage('invoice_history') || [];
            }
            // Compara como string pois o id pode ser número (Date.now())
            const entry = history.find(h => String(h.id) === String(historyId));
            if (!entry) {
                showToast('❌ Fatura não encontrada no histórico.');
                return;
            }

            _pendingEstornoId = historyId;

            const details = document.getElementById('estornoDetails');
            if (details) {
                details.innerHTML = `
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="color:var(--text-secondary);padding:2px 0;width:140px;">Transportadora:</td><td style="font-weight:700;">${entry.carrier || '—'}</td></tr>
                        <tr><td style="color:var(--text-secondary);padding:2px 0;">Ref. Fatura:</td><td style="font-weight:600;">${entry.invoiceRef || '—'}</td></tr>
                        <tr><td style="color:var(--text-secondary);padding:2px 0;">Data Conferência:</td><td>${new Date(entry.date).toLocaleDateString('pt-BR')}</td></tr>
                        <tr><td style="color:var(--text-secondary);padding:2px 0;">Qtd de NFs:</td><td>${entry.nfCount || 0} NFs</td></tr>
                        <tr><td style="color:var(--text-secondary);padding:2px 0;">Valor Fatura:</td><td style="color:#f59e0b;font-weight:700;">${Utils.formatCurrency(entry.invoiceValue || 0)}</td></tr>
                        <tr><td style="color:var(--text-secondary);padding:2px 0;">Conferido por:</td><td>${entry.confirmedBy || '—'}</td></tr>
                    </table>`;
            }

            const justEl = document.getElementById('estornoJustification');
            const passEl = document.getElementById('estornoSupervisorPass');
            if (justEl) justEl.value = '';
            if (passEl) passEl.value = '';

            document.getElementById('invoiceEstornoModal').style.display = 'flex';
            setTimeout(() => { if (justEl) justEl.focus(); }, 100);
        };

        window.closeEstornoModal = () => {
            document.getElementById('invoiceEstornoModal').style.display = 'none';
            _pendingEstornoId = null;
        };

        window.confirmEstorno = () => {
            const justification = document.getElementById('estornoJustification')?.value?.trim();
            const supervisorPass = document.getElementById('estornoSupervisorPass')?.value?.trim();

            if (!justification) {
                showToast('⚠️ Informe o motivo do estorno.');
                document.getElementById('estornoJustification').focus();
                return;
            }

            if (!supervisorPass) {
                showToast('⚠️ Informe a senha do supervisor.');
                document.getElementById('estornoSupervisorPass').focus();
                return;
            }

            // Valida a senha do supervisor (mesmo sistema do modal de autorização)
            const users = Utils.getStorage('app_users') || [];
            const supervisor = users.find(u =>
                (u.role === 'supervisor' || u.role === 'admin') &&
                u.pass === supervisorPass
            );

            if (!supervisor) {
                showToast('❌ Senha de supervisor incorreta.');
                document.getElementById('estornoSupervisorPass').value = '';
                document.getElementById('estornoSupervisorPass').focus();
                return;
            }

            window.processEstornoInvoice(_pendingEstornoId, justification, supervisor.name);
        };

        window.processEstornoInvoice = async (historyId, justification, supervisorName) => {
            // 1. Carrega histórico — tenta Firestore primeiro (fonte verdadeira)
            let history = [];
            let historyFromFirestore = false;
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                try {
                    const snap = await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('invoice_history_db').get();
                    if (!snap.empty) {
                        history = snap.docs.map(d => d.data());
                        historyFromFirestore = true;
                        console.log(`🔄 [Estorno] invoice_history carregado do Firestore: ${history.length} registros`);
                    }
                } catch (e) {
                    console.warn('[Estorno] Falha ao carregar invoice_history do Firestore, usando localStorage:', e);
                }
            }
            if (!historyFromFirestore) {
                history = Utils.getStorage('invoice_history') || [];
            }
            const entry = history.find(h => String(h.id) === String(historyId));
            if (!entry) {
                showToast('❌ Registro não encontrado. Tente recarregar a página.');
                return;
            }

            // 2. Identifica quais NFs/despachos reverter
            const nfList = Array.isArray(entry.nfList) ? entry.nfList : [];

            // CRÍTICO: carrega do Firebase (fonte verdadeira), não do localStorage
            // O processInvoicePayment salva no Firebase; o localStorage pode estar desatualizado
            let dispatches = [];
            try {
                dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];
                console.log(`🔄 [Estorno] Carregados ${dispatches.length} despachos do Firebase`);
            } catch (e) {
                console.warn('[Estorno] Falha ao carregar do Firebase, usando localStorage:', e);
                dispatches = Utils.getStorage('dispatches') || [];
            }

            // Campos a remover no estorno
            const revertFirestoreFields = {
                status: 'Despachado',
                paidAt:               firebase.firestore.FieldValue.delete(),
                invoiceRef:           firebase.firestore.FieldValue.delete(),
                paidBy:               firebase.firestore.FieldValue.delete(),
                paymentNote:          firebase.firestore.FieldValue.delete(),
                authorizedBy:         firebase.firestore.FieldValue.delete(),
                invoiceConfirmedAt:   firebase.firestore.FieldValue.delete()
            };

            let revertedCount = 0;
            const idsToRevert = []; // IDs dos despachos a reverter no Firestore

            // 2a. Coleta IDs para reverter e prepara versão local atualizada
            const updatedDispatches = dispatches.map(d => {
                const nfMatch = nfList.length > 0
                    ? nfList.includes(d.invoice)
                    : (d.carrier === entry.carrier && d.invoiceRef === entry.invoiceRef);

                if (nfMatch && d.status === 'Pago') {
                    revertedCount++;
                    idsToRevert.push(d.id);
                    const updated = { ...d, status: 'Despachado' };
                    delete updated.paidAt;
                    delete updated.invoiceRef;
                    delete updated.paidBy;
                    delete updated.paymentNote;
                    delete updated.authorizedBy;
                    delete updated.invoiceConfirmedAt;
                    return updated;
                }
                return d;
            });

            console.log(`🔄 [Estorno] ${revertedCount} NFs encontradas com status 'Pago'. IDs: ${idsToRevert.join(', ')}`);

            // Atualiza localStorage com a lista completa e corrigida
            // CRÍTICO: Usa localStorage DIRETAMENTE (sem Cloud.save) para evitar o SYNC BLOQUEADO
            // O Firestore já foi/será atualizado individualmente via dispatches_db (abaixo)
            try {
                const storageKey = Utils._storageKey('dispatches');
                localStorage.setItem(storageKey, JSON.stringify(updatedDispatches));
                Utils.lastWriteTime['dispatches'] = Date.now();
            } catch (e) {
                console.warn('[Estorno] Não foi possível atualizar localStorage de dispatches:', e);
            }

            // 2b. Persiste no Firestore
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                for (const did of idsToRevert) {
                    try {
                        await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(did))
                            .update(revertFirestoreFields);
                        console.log(`🔄 [Estorno] Firestore OK: despacho ${did} → Despachado`);
                    } catch (e) {
                        console.warn(`[Estorno] Firestore erro (despacho ${did}):`, e);
                    }
                }
            } else {
                console.warn('[Estorno] Firebase indisponível — alteração apenas no localStorage.');
            }

            // 2c. Atualiza cache em memória (_dispatchesFullCache)
            if (window._dispatchesFullCache) {
                window._dispatchesFullCache = window._dispatchesFullCache.map(d => {
                    if (idsToRevert.includes(d.id)) {
                        const updated = { ...d, status: 'Despachado' };
                        delete updated.paidAt;
                        delete updated.invoiceRef;
                        delete updated.paidBy;
                        delete updated.paymentNote;
                        delete updated.authorizedBy;
                        delete updated.invoiceConfirmedAt;
                        return updated;
                    }
                    return d;
                });
            }

            // 3. Remove entrada do histórico
            history = history.filter(h => String(h.id) !== String(historyId));
            Utils.setStorage('invoice_history', history);

            // Remove também do Firestore
            if (Utils.Cloud && Utils.Cloud.hasTenant && Utils.Cloud.hasTenant() && window.db) {
                try {
                    await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('invoice_history_db').doc(String(historyId)).delete();
                    console.log(`🔄 [Estorno] invoice_history_db/${historyId} removido do Firestore`);
                } catch (e) {
                    console.warn('[Estorno] Falha ao remover histórico do Firestore:', e);
                }
            }

            // 4. Registra log do estorno
            const estornoLog = Utils.getStorage('estorno_log') || [];
            estornoLog.push({
                date: new Date().toISOString(),
                historyId,
                carrier: entry.carrier,
                invoiceRef: entry.invoiceRef,
                invoiceValue: entry.invoiceValue,
                nfCount: entry.nfCount,
                originalConfirmedBy: entry.confirmedBy,
                reversedBy: supervisorName,
                justification,
                revertedCount
            });
            Utils.setStorage('estorno_log', estornoLog);

            // 5. Fecha modal e atualiza a tela
            window.closeEstornoModal();

            showToast(`✅ Estorno concluído! ${revertedCount} NF${revertedCount !== 1 ? 's' : ''} revertida${revertedCount !== 1 ? 's' : ''} para "Despachado".`);

            // Recarrega a tela de análise e a tabela principal de despachos
            window.filterInvoiceAnalysis();
            if (typeof window.loadDispatches === 'function') window.loadDispatches();
            if (typeof window.updateInvoiceComparison === 'function') window.updateInvoiceComparison();

            console.log(`🔄 [Estorno] Fatura ${entry.invoiceRef} estornada por ${supervisorName}. ${revertedCount} NFs revertidas.`);
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

        // window.sendWhatsApp — versão completa definida em linha ~8023 (usa _dispatchesFullCache + painel WA)
        // Esta versão simplificada foi removida na refatoração Etapa 2 para evitar sobrescrita silenciosa.

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

        // Import CSV de Tabelas de Frete (DINÂMICO v2) — REMOVIDO na refatoração Etapa 2.
        // O handler principal (com detecção automática de encoding windows-1252/UTF-8)
        // já está registrado acima (~L3370). Ter dois handlers no mesmo evento causava
        // importação dupla de regras. Apenas o handler original (L3370) permanece ativo.
        // document.getElementById('fileRules').addEventListener('change', (e) => { ... });
        if (false) { // bloco desativado — mantido para referência até próxima limpeza
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
        }); } // fim bloco desativado (CSV v2 duplicado)

        document.getElementById('fileClient').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    // Processa Excel (.xlsx, .xls) e CSV de forma unificada
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Transforma em Matriz 2D de linhas/colunas
                    const lines = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false, defval: ''});

                    if (lines.length === 0) {
                        alert('⚠️ Arquivo vazio ou inválido.');
                        return;
                    }

                    // Detecta cabeçalhos (Linha 0)
                    const headers = (lines[0] || []).map(h => String(h).trim().toUpperCase());
                    const findIdx = (keywords) => headers.findIndex(h => keywords.some(k => String(h).includes(k)));

                    let idxCode = findIdx(['CODIGO', 'CÓDIGO', 'COD']);
                    let idxName = findIdx(['NOME', 'RAZAO', 'RAZÃO', 'CLIENTE', 'SOCIAL']);
                    let idxPhone = findIdx(['TELEFON', 'CELULAR', 'FONE', 'WHATS', 'TEL']);
                    let idxCity = findIdx(['CIDADE', 'MUNICÍPIO', 'MUNICIPIO', 'MUN']);
                    let idxNeigh = findIdx(['BAIRRO', 'ENDERECO', 'ENDEREÇO', 'BAI']);

                    if (idxCode === -1) idxCode = 0;
                    if (idxName === -1) idxName = 1;

                    let clients = Utils.getStorage('clients') || [];
                    const formatType = file.name.endsWith('.csv') ? 'CSV' : 'Excel';
                    let count = 0;

                    lines.forEach((cols, index) => {
                        // Ignora cabeçalho e linhas vazias
                        if (index === 0 || !cols || cols.length < 2) return; 

                        const getVal = (idx) => (idx > -1 && cols[idx]) ? String(cols[idx]).trim().toUpperCase() : '';

                        let phone = getVal(idxPhone).replace(/\D/g, '');
                        let city = getVal(idxCity) || 'N/I';
                        let neighborhood = getVal(idxNeigh) || '-';
                        let code = getVal(idxCode);
                        let name = getVal(idxName);
                        
                        if (!name) return; // Se não tem nome, ignora a linha

                        const client = {
                            codigo: code,
                            nome: name,
                            cidade: city,
                            bairro: neighborhood,
                            telefone: phone
                        };

                        const lineUpper = Object.values(cols).join(' ').toUpperCase();
                        
                        if (client.cidade === 'N/I') {
                            if (lineUpper.includes('REDENCAO')) client.cidade = 'REDENCAO';
                            else if (lineUpper.includes('XINGUARA')) client.cidade = 'XINGUARA';
                            else if (lineUpper.includes('ALTAMIRA')) client.cidade = 'ALTAMIRA';
                            else if (lineUpper.includes('MARABA')) client.cidade = 'MARABA';
                        }

                        // Evita duplicatas, atualizando existente
                        const existingIdx = clients.findIndex(c => c.codigo === client.codigo);
                        if (existingIdx >= 0) clients[existingIdx] = client;
                        else clients.push(client);

                        count++;
                    });

                    Utils.saveRaw('clients', JSON.stringify(clients));

                    if (count > 0) {
                        const msg = `✅ Sucesso! ${count} clientes importados.\n(Formato: ${formatType})`;
                        if (typeof Utils.Cloud !== 'undefined' && Utils.Cloud.save) {
                            Utils.Cloud.save('clients', clients).then(success => {
                                if(success) {
                                    alert(msg + "\n\n✅ Sincronizado com a nuvem com sucesso!");
                                } else {
                                    alert(msg + "\n\n⚠️ Atenção: Falha ao subir para a nuvem. Verifique o limite de 1MB.");
                                }
                            });
                        } else {
                            alert(msg);
                        }
                    } else {
                        alert('⚠️ Nenhum cliente válido encontrado.\nVerifique se a planilha tem as colunas corretas.');
                    }
                } catch(error) {
                    console.error('Erro ao processar arquivo:', error);
                    alert('❌ Erro crítico ao processar o arquivo. Verifique se o arquivo não está corrompido e é um Excel/CSV válido.');
                }
                
                e.target.value = ''; // Limpa o input
            };
            
            // ArrayBuffer lê o binário do Excel perfeitamente
            reader.readAsArrayBuffer(file);
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
                localStorage.removeItem(Utils._storageKey('app_users'));
                sessionStorage.removeItem('logged_user');
                alert('Acessos resetados com sucesso!\n\nUsuário: admin\nSenha: admin\n\nO sistema será recarregado.');
                location.reload();
            } else if (pin !== null) {
                alert('Código incorreto.');
            }
        };

        // --- USER MANAGEMENT foi migrado unicamente para o utils.js ---

        // Update delete logic with supervisor password
        window.removeDispatch = (id) => {
            window.requestSupervisorPassword('Excluir Lançamento', async () => {
                const numId = Number(id);

                // 1. Remove do localStorage
                let history = Utils.getStorage('dispatches') || [];
                history = history.filter(d => Number(d.id) !== numId);
                Utils.saveRaw('dispatches', JSON.stringify(history));

                // 2. Remove do Firestore (se existir lá)
                if (Utils.Cloud.hasTenant() && window.db) {
                    try {
                        await window.db
                            .collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(numId))
                            .delete();
                        console.log(`🗑️ [RemoveDispatch] Despacho ${numId} excluído do Firestore.`);
                    } catch(e) {
                        console.warn('[RemoveDispatch] Erro ao excluir do Firestore:', e);
                    }
                }

                // 3. Remove do cache
                if (window._dispatchesFullCache) {
                    window._dispatchesFullCache = window._dispatchesFullCache.filter(d => Number(d.id) !== numId);
                }

                window.renderAppHistory();
                showToast('🗑️ Lançamento excluído com sucesso.');
            });
        };

        // ─── CONFIRMAÇÃO DE ENTREGA AO CLIENTE (v3.11.16) ──────────────────────────
        window.confirmarEntrega = (id) => {
            // Injeta o modal apenas uma vez no DOM
            if (!document.getElementById('delivConfirmModal')) {
                const overlay = document.createElement('div');
                overlay.id = 'delivConfirmModal';
                overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);align-items:center;justify-content:center;';
                overlay.innerHTML = `
                    <div id="delivConfirmCard" style="background:#1e293b;border:1px solid #334155;border-radius:14px;padding:28px 30px;min-width:340px;max-width:450px;width:92%;box-shadow:0 24px 64px rgba(0,0,0,0.55);font-family:inherit;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
                            <span style="font-size:1.8rem;">📦</span>
                            <div>
                                <div style="font-size:0.68rem;color:#22c55e;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;margin-bottom:3px;">CONFIRMAÇÃO DE ENTREGA</div>
                                <div style="font-size:1rem;font-weight:600;color:#f1f5f9;">Mercadoria chegou ao cliente?</div>
                            </div>
                        </div>
                        <input type="hidden" id="delivConfirmId">

                        <div style="margin-bottom:18px;">
                            <label style="display:block;font-size:0.82rem;color:#94a3b8;margin-bottom:10px;font-weight:500;">Como foi confirmada a entrega?</label>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                                <div class="deliv-method-opt" data-val="whatsapp"
                                    style="border:2px solid #334155;border-radius:9px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.18s;color:#94a3b8;font-size:0.8rem;user-select:none;">
                                    💬<br><span style="margin-top:3px;display:block;">WhatsApp</span>
                                </div>
                                <div class="deliv-method-opt" data-val="presencial"
                                    style="border:2px solid #334155;border-radius:9px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.18s;color:#94a3b8;font-size:0.8rem;user-select:none;">
                                    🤝<br><span style="margin-top:3px;display:block;">Presencial</span>
                                </div>
                                <div class="deliv-method-opt" data-val="audio"
                                    style="border:2px solid #334155;border-radius:9px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.18s;color:#94a3b8;font-size:0.8rem;user-select:none;">
                                    🎙️<br><span style="margin-top:3px;display:block;">Áudio</span>
                                </div>
                                <div class="deliv-method-opt" data-val="telefone"
                                    style="border:2px solid #334155;border-radius:9px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.18s;color:#94a3b8;font-size:0.8rem;user-select:none;">
                                    📞<br><span style="margin-top:3px;display:block;">Telefone</span>
                                </div>
                                <div class="deliv-method-opt" data-val="vendedor"
                                    style="border:2px solid #334155;border-radius:9px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.18s;color:#94a3b8;font-size:0.8rem;user-select:none;">
                                    🧑‍💼<br><span style="margin-top:3px;display:block;">Vendedor</span>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom:4px;">
                            <label style="display:block;font-size:0.82rem;color:#94a3b8;margin-bottom:6px;font-weight:500;">Quem confirmou?</label>
                            <input id="delivConfirmedBy" type="text" placeholder="Nome do responsável..." autocomplete="off"
                                style="width:100%;box-sizing:border-box;padding:10px 13px;background:#0f172a;border:1px solid #475569;border-radius:8px;color:#f1f5f9;font-size:0.9rem;outline:none;font-family:inherit;transition:border-color 0.15s;">
                        </div>
                        <div id="delivConfirmError" style="color:#ef4444;font-size:0.78rem;min-height:18px;margin-top:5px;"></div>

                        <div style="display:flex;gap:10px;margin-top:22px;justify-content:flex-end;">
                            <button id="delivConfirmCancel"
                                style="padding:9px 22px;border-radius:8px;border:1px solid #475569;background:transparent;color:#94a3b8;cursor:pointer;font-size:0.9rem;font-family:inherit;">
                                Cancelar
                            </button>
                            <button id="delivConfirmOk"
                                style="padding:9px 22px;border-radius:8px;border:none;background:#22c55e;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:700;font-family:inherit;display:flex;align-items:center;gap:6px;">
                                <span class="material-icons-round" style="font-size:1.05rem;">check_circle</span> Confirmar
                            </button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);

                // Seleção visual dos métodos
                overlay.addEventListener('click', (e) => {
                    const opt = e.target.closest('.deliv-method-opt');
                    if (opt) {
                        overlay.querySelectorAll('.deliv-method-opt').forEach(b => {
                            b.style.borderColor = '#334155';
                            b.style.color = '#94a3b8';
                            b.style.background = 'transparent';
                        });
                        opt.style.borderColor = '#22c55e';
                        opt.style.color = '#22c55e';
                        opt.style.background = 'rgba(34,197,94,0.1)';
                        overlay.dataset.selectedMethod = opt.dataset.val;
                    }
                    if (e.target === overlay) overlay.style.display = 'none';
                });

                // Fechar com Escape
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && document.getElementById('delivConfirmModal')?.style.display === 'flex')
                        document.getElementById('delivConfirmModal').style.display = 'none';
                });
            }

            const modal = document.getElementById('delivConfirmModal');

            // Resetar estado
            modal.querySelectorAll('.deliv-method-opt').forEach(b => {
                b.style.borderColor = '#334155';
                b.style.color = '#94a3b8';
                b.style.background = 'transparent';
            });
            delete modal.dataset.selectedMethod;
            document.getElementById('delivConfirmError').textContent = '';
            document.getElementById('delivConfirmId').value = id;

            // Pré-preencher com o nome real do usuário logado
            let _delivUserName = '';
            if (currentUser && currentUser.name) {
                _delivUserName = currentUser.name;
            } else if (currentUser && currentUser.login) {
                _delivUserName = currentUser.login;
            } else {
                try {
                    const _sess = JSON.parse(sessionStorage.getItem('logged_user') || 'null');
                    if (_sess && _sess.name) _delivUserName = _sess.name;
                    else if (_sess && _sess.login) _delivUserName = _sess.login;
                } catch(e) {}
            }
            document.getElementById('delivConfirmedBy').value = _delivUserName;

            modal.style.display = 'flex';
            setTimeout(() => document.getElementById('delivConfirmedBy').focus(), 80);

            // Substituir botões para limpar listeners antigos
            ['delivConfirmOk','delivConfirmCancel'].forEach(bid => {
                const el = document.getElementById(bid);
                const clone = el.cloneNode(true);
                el.parentNode.replaceChild(clone, el);
            });

            document.getElementById('delivConfirmCancel').addEventListener('click', () => {
                modal.style.display = 'none';
            });

            document.getElementById('delivConfirmOk').addEventListener('click', async () => {
                const method      = modal.dataset.selectedMethod;
                const confirmedBy = document.getElementById('delivConfirmedBy').value.trim();
                const errEl       = document.getElementById('delivConfirmError');

                if (!method)      { errEl.textContent = '❌ Selecione a forma de confirmação.'; return; }
                if (!confirmedBy) { errEl.textContent = '❌ Informe quem confirmou a entrega.'; return; }

                const numId = Number(document.getElementById('delivConfirmId').value);
                const now   = new Date().toISOString();
                const update = {
                    deliveryConfirmed: true,
                    deliveryConfirmedAt: now,
                    deliveryConfirmMethod: method,
                    deliveryConfirmedBy: confirmedBy
                };

                // 1. localStorage
                let dispatches = Utils.getStorage('dispatches') || [];
                const idx = dispatches.findIndex(d => Number(d.id) === numId);
                if (idx !== -1) { Object.assign(dispatches[idx], update); Utils.setStorage('dispatches', dispatches); }

                // 2. Firestore
                if (Utils.Cloud.hasTenant() && window.db) {
                    try {
                        await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(numId)).update(update);
                    } catch(e) { console.warn('[ConfirmarEntrega] Firestore:', e); }
                }

                // 3. Cache em memória
                if (window._dispatchesFullCache) {
                    const ci = window._dispatchesFullCache.findIndex(d => Number(d.id) === numId);
                    if (ci !== -1) Object.assign(window._dispatchesFullCache[ci], update);
                }

                modal.style.display = 'none';
                showToast('✅ Entrega confirmada com sucesso!');
                window.renderAppHistory();
            });
        };

        window.desfazerConfirmacaoEntrega = (id) => {
            window.requestSupervisorPassword('Desfazer Confirmação de Entrega', async () => {
                const numId = Number(id);

                // 1. localStorage
                let dispatches = Utils.getStorage('dispatches') || [];
                const idx = dispatches.findIndex(d => Number(d.id) === numId);
                if (idx !== -1) {
                    delete dispatches[idx].deliveryConfirmed;
                    delete dispatches[idx].deliveryConfirmedAt;
                    delete dispatches[idx].deliveryConfirmMethod;
                    delete dispatches[idx].deliveryConfirmedBy;
                    Utils.setStorage('dispatches', dispatches);
                }

                // 2. Firestore
                if (Utils.Cloud.hasTenant() && window.db) {
                    try {
                        const fv = firebase.firestore.FieldValue.delete;
                        await window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(numId))
                            .update({
                                deliveryConfirmed:     firebase.firestore.FieldValue.delete(),
                                deliveryConfirmedAt:   firebase.firestore.FieldValue.delete(),
                                deliveryConfirmMethod: firebase.firestore.FieldValue.delete(),
                                deliveryConfirmedBy:   firebase.firestore.FieldValue.delete()
                            });
                    } catch(e) { console.warn('[DesfazerConfirmacao] Firestore:', e); }
                }

                // 3. Cache em memória
                if (window._dispatchesFullCache) {
                    const ci = window._dispatchesFullCache.findIndex(d => Number(d.id) === numId);
                    if (ci !== -1) {
                        const c = window._dispatchesFullCache[ci];
                        delete c.deliveryConfirmed;
                        delete c.deliveryConfirmedAt;
                        delete c.deliveryConfirmMethod;
                        delete c.deliveryConfirmedBy;
                    }
                }

                showToast('↩️ Confirmação de entrega desfeita.');
                window.renderAppHistory();
            });
        };
        // ───────────────────────────────────────────────────────────────────────────

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
            const allCarriers = Utils.getStorage('carrier_list') || [];

            // Group pending items by Carrier
            const pendingByCarrier = {};
            pending.forEach(p => {
                let carrierKey = String(p.carrier || '').trim().toUpperCase();
                
                // v3.8.2 - Agrupar itens FOB na transportadora principal para alimentar o card
                if (carrierKey.startsWith('FOB - ')) {
                    carrierKey = carrierKey.replace('FOB - ', '').trim();
                }

                if (!pendingByCarrier[carrierKey]) pendingByCarrier[carrierKey] = [];
                pendingByCarrier[carrierKey].push(p);
            });

            // NOVO: Ordenar transportadoras por quantidade de itens pendentes (v3.7.3)
            allCarriers.sort((a, b) => {
                const countA = (pendingByCarrier[String(a || '').trim().toUpperCase()] || []).length;
                const countB = (pendingByCarrier[String(b || '').trim().toUpperCase()] || []).length;
                if (countA !== countB) return countB - countA; // Quem tem carga sobe
                return String(a).localeCompare(String(b));     // Ordem alfabética para empate/vazios
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
                    // v3.8.2 - Incluir itens FOB na listagem da transportadora no modal
                    const isSameCarrier = dCarrier === cleanCarrier || dCarrier === 'FOB - ' + cleanCarrier;
                    return isSameCarrier && d.status === 'Pendente Despacho';
                });

                if (items.length === 0) {
                    console.warn('Nenhum item pendente (Pendente Despacho) para:', cleanCarrier);
                }

                selectedNFIds = [...new Set(items.map(i => i.id))]; // ✅ deduplicado por segurança

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
                        setTimeout(() => location.reload(), 800); // Dá tempo do Firebase Sync salvar na nuvem
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
                const toDispatchRaw = history.filter(d => selectedNFIds.includes(d.id));
                // ✅ Deduplicar por id para evitar NFs duplicadas no romaneio
                const toDispatch = toDispatchRaw.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
                if (toDispatchRaw.length !== toDispatch.length) {
                    console.warn(`[Romaneio] ⚠️ ${toDispatchRaw.length - toDispatch.length} NF(s) duplicada(s) removida(s) antes de imprimir.`);
                }

                if (toDispatch.length === 0) {
                    alert('Erro: Notas selecionadas não encontradas no histórico.');
                    return;
                }

                // v3.11.29 — Sanitizar campos undefined/null antes de gerar romaneio
                // Evita que a string literal "undefined" apareça no PDF impresso
                const _san = (v, fb) => (!v || v === 'undefined' || v === 'null' || String(v).trim() === '') ? fb : v;
                toDispatch.forEach(d => {
                    d.client       = _san(d.client,       'NÃO INFORMADO');
                    d.city         = _san(d.city,         'NÃO INFORMADO');
                    d.neighborhood = _san(d.neighborhood, '-');
                    d.carrier      = _san(d.carrier,      currentModalCarrier || 'NÃO INFORMADO');
                    d.invoice      = _san(d.invoice,      'S/N');
                    if (d.total  == null || isNaN(d.total))   d.total   = 0;
                    if (d.nfValue == null || isNaN(d.nfValue)) d.nfValue = 0;
                    if (d.weight == null || isNaN(d.weight))   d.weight  = 0;
                    console.warn(`[v3.11.29] NF ${d.invoice} — cliente: "${d.client}", cidade: "${d.city}"`);
                });

                const totalWeight = toDispatch.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
                const totalFreight = toDispatch.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

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

                // ✅ v3.11.40: Gera o ID do romaneio ANTES de carimbar nos despachos
                const randomId = 'ROM-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 100);

                // Mark as dispatched and set delivery type
                history.forEach(d => {
                    if (selectedNFIds.includes(d.id)) {
                        d.status = 'Despachado';
                        d.dispatchedAt = new Date().toISOString();
                        d.dispatchedBy = dispatchedBy;
                        d.romaneioId = randomId; // ✅ Vincula despacho ao romaneio para rastreamento

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

                // NOVO: Notificar Vendedores automaticamente (Parametrizável v3.7)
                const settings = window.app_settings || { wa_auto_seller: true };
                const sellersToNotify = {};
                if (settings.wa_auto_seller) {
                    toDispatch.forEach(d => {
                        if (d.sellerId && d.sellerPhone) {
                            if (!sellersToNotify[d.sellerId]) {
                                sellersToNotify[d.sellerId] = d.id;
                            }
                        }
                    });
                }

                // ======= SALVAMENTO DA ENTIDADE ROMANEIO =======
                const romaneios = Utils.getStorage('app_romaneios') || [];
                // ✅ randomId já foi gerado acima (e carimbado nos despachos)
                const novoRomaneio = {
                    id: randomId,
                    createdAt: new Date().toISOString(),
                    createdBy: dispatchedBy,
                    carrier: currentModalCarrier,
                    driverName: assignedDriverName || '-',
                    vehicle: deliveryType, // moto, carro, direto
                    totalWeight: totalWeight,
                    totalFreight: totalFreight,
                    invoiceCount: toDispatch.length,
                    items: toDispatch.map(d => ({
                        id: d.id, invoice: d.invoice,
                        client: d.client, city: d.city, neighborhood: d.neighborhood,
                        carrier: d.carrier, total: d.total, weight: d.weight,
                        volume: d.volume, nfValue: d.nfValue,
                        redespacho: d.redespacho, isComplement: d.isComplement
                    })),
                    status: 'em_rota', // 'em_rota', 'baixado'
                    baixadoAt: null
                };
                romaneios.push(novoRomaneio);
                Utils.saveRaw('app_romaneios', JSON.stringify(romaneios));
                // ===============================================

                // Disparo Automático de WhatsApp para CLIENTES + VENDEDORES (Parametrizável v3.7)
                // IMPORTANTE: O painel de WA deve ser mostrado ANTES de printSpecificRomaneio,
                // pois window.open() da impressão consome o token de gesto do usuário,
                // impedindo qualquer abertura subsequente de abas (bloqueio do browser).
                if (settings.wa_auto_client || settings.wa_auto_seller) {
                    // Coleta todas as URLs a enviar
                    const waQueue = [];

                    // Clientes
                    if (settings.wa_auto_client) {
                        const cList = Utils.getStorage('clients') || [];
                        const norm = (s) => s ? s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() : '';
                        const ignoredNames = ['DIVERSOS', 'CONSUMIDOR FINAL'];
                        toDispatch.forEach(d => {
                            if (ignoredNames.includes(norm(d.client))) return;
                            const clientObj = cList.find(c => norm(c.nome) === norm(d.client));
                            const phone = clientObj && clientObj.telefone ? clientObj.telefone.replace(/\D/g, '') : '';
                            if (!phone || phone.length < 10) {
                                console.warn(`[WA Auto] Sem telefone para ${d.client} (NF ${d.invoice})`);
                                return;
                            }
                            const rawLead = (d.leadTime || '').replace(/\D/g, '');
                            const fullName = (clientObj && clientObj.nome) ? clientObj.nome : d.client;
                            const msg = `Olá ${fullName}!\nInformamos que seu pedido NF: ${d.invoice} foi despachado via ${d.carrier}.\nPrevisão de Entrega: D+${rawLead} dias.\nLT Distribuidora agradece!\nQualquer dúvida, estamos à disposição!`;
                            waQueue.push({
                                label: `📦 ${d.client} (NF ${d.invoice})`,
                                url: `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
                            });
                        });
                    }

                    // Vendedores
                    if (settings.wa_auto_seller) {
                        Object.values(sellersToNotify).forEach(dispatchId => {
                            const numId = Number(dispatchId);
                            const localH = Utils.getStorage('dispatches') || [];
                            const allH = window._dispatchesFullCache || localH;
                            const d = allH.find(item => Number(item.id) === numId);
                            if (!d || !d.sellerPhone) return;
                            const phone = d.sellerPhone.replace(/\D/g, '');
                            const dispatchDate = new Date(d.dispatchedAt || d.date || new Date()).toLocaleDateString('pt-BR');
                            const msg = window._buildVendorWAMsg(d, dispatchDate);
                            waQueue.push({
                                label: `🧑‍💼 Vendedor: ${d.sellerName}`,
                                url: `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
                            });
                        });
                    }

                    if (waQueue.length > 0) {
                        window._showWaPanel(waQueue);
                    }
                }

                // Open print manifest (called AFTER WA panel to preserve user gesture for WA)
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

                // NOVO: Atualizar o Painel imediatamente após finalizar o despacho (v3.7.6)
                if (window.renderDashboard) window.renderDashboard();

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
                // v3.11.33: protege company_data nulo — evita crash se empresa não configurada
                const _companyRaw = Utils.getStorage('company_data');
                const company = (_companyRaw && typeof _companyRaw === 'object') ? _companyRaw : {};
                const cleanName = String(carrierName || '').trim().toUpperCase();
                const cInfo = carrierInfo[cleanName] || { cnpj: '-', address: '-', city: '-' };
                
                const printArea = document.getElementById('print-area');
                printArea.innerHTML = '';

                const totalWeight = items.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
                const totalFreight = items.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

                // Ajustamos as celulas para caber em Retrato (A4 normal) usando fonte menor e padding restrito, 
                // para que não falte espaço e não quebre a palavra verticalmente.
                const cellStyle = 'border: 1px solid #000; padding: 2px; font-size: 10px; color: #000; font-family: Arial, sans-serif; font-weight: bold; text-align: left; white-space: nowrap;';

                // Create 2 copies
                for (let i = 0; i < 2; i++) {
                    const page = document.createElement('div');
                    page.className = 'manifest-page';
                    page.style.cssText = 'page-break-inside: avoid; margin-bottom: 40px;'; // Assegura que a segunda via não seja cortada no meio
                    
                    page.innerHTML = `
            <div class="manifest-header" style="display: grid !important; grid-template-columns: 1fr 1fr !important; border: 2px solid #000; padding: 10px; margin-bottom: 15px;">
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

            <div style="display: grid !important; grid-template-columns: 45px 1fr 75px 1fr 28px 70px 40px 38px 45px 55px 55px !important; width: 100%; margin-bottom: 20px; font-family: Arial, sans-serif; font-weight: bold; font-size: 9px; color: #000; border: 1px solid #000;">
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">Nº NF</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">CLIENTE</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">TELEFONE</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">CIDADE</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">RED.</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">TRANSP. REDESP.</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">COMPL.</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">PESO</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">QTD VOL.</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">VALOR NF</div>
                <div style="border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0;">FRETE</div>
                ${items.map(item => {
                    // v3.11.33: sanitização on-the-fly — corrige TODOS os campos com 'undefined' string no localStorage
                    const _s = (v, fb) => (!v || v === 'undefined' || v === 'null' || String(v).trim() === '') ? fb : String(v);
                    item.client       = _s(item.client,       'NÃO INFORMADO');
                    item.city         = _s(item.city,         'NÃO INFORMADO');
                    item.carrier      = _s(item.carrier,      carrierName || 'NÃO INFORMADO');
                    item.invoice      = _s(item.invoice,      'S/N');
                    item.neighborhood = _s(item.neighborhood, '-');
                    // v3.11.33: redespacho — sanitiza antes de checar hasRedesp (previne 'UNDEFINED' no campo)
                    item.redespacho   = _s(item.redespacho,   '-');
                    if (item.total  == null || isNaN(item.total))   item.total   = 0;
                    if (item.nfValue == null || isNaN(item.nfValue)) item.nfValue = 0;
                    if (item.weight == null || isNaN(item.weight))   item.weight  = 0;

                    const cList = Utils.getStorage('clients') || [];
                    const norm = (s) => s ? s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() : '';
                    const clientObj = cList.find(c => norm(c.nome) === norm(item.client));
                    let rawPhone = clientObj && clientObj.telefone ? clientObj.telefone.replace(/\D/g,'') : '';
                    let phone = rawPhone || '';
                    if (phone.length > 20) phone = phone.substring(0, 20);
                    // redespacho já sanitizado acima — '-' significa sem redespacho
                    const hasRedesp = item.redespacho !== '-';
                    const redespLabel = hasRedesp ? 'SIM' : 'NÃO';
                    const redespNF = hasRedesp ? item.redespacho.toUpperCase() : '';
                    const isCompl = item.isComplement ? 'SIM' : 'NÃO';
                    const pesoValue = parseFloat(item.weight) || 0;
                    const pesoDisplay = pesoValue % 1 === 0 ? pesoValue.toString() : pesoValue.toFixed(2);
                    const nfValueDisplay = parseFloat(item.nfValue) > 0 ? parseFloat(item.nfValue).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : 'R$ 0,00';
                    const valorDisplay = parseFloat(item.total) > 0 ? parseFloat(item.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : 'R$ 0,00';
                    return `
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${item.invoice}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; overflow: hidden; text-overflow: ellipsis;">${item.client}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${phone}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; overflow: hidden; text-overflow: ellipsis;">${item.city}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${redespLabel}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; overflow: hidden; text-overflow: ellipsis;">${redespNF}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${isCompl}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${pesoDisplay}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${item.volume || 1}</div>
                <div style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px;">${nfValueDisplay}</div>
                <div style="border-bottom: 1px solid #000; padding: 2px;">${valorDisplay}</div>`;
                }).join('')}
                <div style="grid-column: 1 / 8; border-right: 1px solid #000; padding: 2px; text-align: right;">TOTAIS</div>
                <div style="border-right: 1px solid #000; padding: 2px;">${totalWeight % 1 === 0 ? totalWeight.toString() : totalWeight.toFixed(2)}</div>
                <div style="border-right: 1px solid #000; padding: 2px;">${items.reduce((acc, curr) => acc + (parseInt(curr.volume) || 1), 0)}</div>
                <div style="border-right: 1px solid #000; padding: 2px;">${items.reduce((acc, curr) => acc + (parseFloat(curr.nfValue) || 0), 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</div>
                <div style="padding: 2px;">${totalFreight > 0 ? totalFreight.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : 'R$ 0,00'}</div>
            </div>

            <div style="margin-top: 25px; display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 50px;">
                <div style="border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 0.8rem; font-weight: bold; font-family: Arial, sans-serif;">
                    Responsável Expedição
                </div>
                <div style="border-top: 1px solid #000; text-align: center; padding-top: 5px; font-size: 0.8rem; font-weight: bold; font-family: Arial, sans-serif;">
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


        // ─── HELPER UNIFICADO: reverte despachos de um romaneio para um status ───────
        window._reverterDespachosDoRomaneio = async (items, novoStatus) => {
            if (!items || !items.length) return 0;
            const idsParaReverter = items.map(item => Number(item.id));
            let history = Utils.getStorage('dispatches') || [];
            let revertidos = 0;

            for (const dispId of idsParaReverter) {
                let idx = history.findIndex(d => Number(d.id) === dispId);
                if (idx !== -1) {
                    history[idx].status = novoStatus;
                    if (novoStatus === 'Pendente Despacho') {
                        delete history[idx].dispatchedAt; delete history[idx].deliveryType;
                        delete history[idx].deliveryStatus; delete history[idx].deliveryPerson;
                    }
                    delete history[idx].paidAt; delete history[idx].invoiceRef;
                    delete history[idx].paidBy; delete history[idx].paymentNote;
                    delete history[idx].authorizedBy;
                    revertidos++;
                } else {
                    // ── Dispatch não está no localStorage (possivelmente arquivada pelo BackgroundSync) ──
                    // Tentativa 1: _dispatchesFullCache (histórico em memória)
                    const allHistory = window._dispatchesFullCache || [];
                    const cachedDispatch = allHistory.find(d => Number(d.id) === dispId);
                    if (cachedDispatch) {
                        const reverted = { ...cachedDispatch, status: novoStatus };
                        if (novoStatus === 'Pendente Despacho') {
                            delete reverted.dispatchedAt; delete reverted.deliveryType;
                            delete reverted.deliveryStatus; delete reverted.deliveryPerson;
                        }
                        delete reverted.paidAt; delete reverted.invoiceRef;
                        delete reverted.paidBy; delete reverted.paymentNote;
                        delete reverted.authorizedBy;
                        history.push(reverted);
                        if (window._dispatchesFullCache) {
                            const ci = window._dispatchesFullCache.findIndex(d => Number(d.id) === dispId);
                            if (ci !== -1) window._dispatchesFullCache[ci].status = novoStatus;
                        }
                        revertidos++;
                        console.log(`[Extorno] Dispatch ${dispId} restaurada do _dispatchesFullCache`);
                    } else if (Utils.Cloud.hasTenant() && window.db) {
                        // ✅ FIX v3.11.41: Tentativa 2 — buscar direto do Firestore dispatches_db
                        // Isso resolve o caso onde a NF foi arquivada pelo BackgroundSync (>12h)
                        // e removida do localStorage, mas ainda existe no Firestore.
                        try {
                            const snap = await window.db
                                .collection('tenants').doc(Utils.Cloud.tenantId)
                                .collection('dispatches_db').doc(String(dispId))
                                .get();
                            if (snap.exists) {
                                const firestoreDispatch = snap.data();
                                const reverted = { ...firestoreDispatch, status: novoStatus };
                                if (novoStatus === 'Pendente Despacho') {
                                    delete reverted.dispatchedAt; delete reverted.deliveryType;
                                    delete reverted.deliveryStatus; delete reverted.deliveryPerson;
                                }
                                delete reverted.paidAt; delete reverted.invoiceRef;
                                delete reverted.paidBy; delete reverted.paymentNote;
                                delete reverted.authorizedBy;
                                history.push(reverted);
                                revertidos++;
                                console.log(`[Extorno] ✅ Dispatch ${dispId} (NF ${firestoreDispatch.invoice}) resgatada do Firestore dispatches_db`);
                            } else {
                                console.warn(`[Extorno] Dispatch ${dispId} não encontrada em nenhuma fonte (local, cache ou Firestore)`);
                            }
                        } catch(fetchErr) {
                            console.warn(`[Extorno] Falha ao buscar dispatch ${dispId} do Firestore:`, fetchErr);
                        }
                    }
                }

            }

            // ✅ FIX v3.11.40: Usar saveRaw em vez de localStorage.setItem direto.
            // O setItem direto não atualizava Utils.lastWriteTime['dispatches'], causando
            // o listener do Firestore (processIncomingData) sobrescrever o status revertido
            // em milissegundos (anti-echo de 60s não era ativado). saveRaw corrige isso.
            Utils.saveRaw('dispatches', JSON.stringify(history));

            // Auto-limpa invoice_history vinculados às NFs revertidas
            if (novoStatus === 'Pendente Despacho') {
                const nfsAfetadas = items.map(item => item.invoice).filter(Boolean);
                if (nfsAfetadas.length > 0) {
                    let invoiceHist = Utils.getStorage('invoice_history') || [];
                    const antesLen = invoiceHist.length;
                    invoiceHist = invoiceHist.filter(h => {
                        const nfList = h.nfList || [];
                        return !nfList.some(nf => nfsAfetadas.includes(nf));
                    });
                    if (invoiceHist.length < antesLen) {
                        Utils.setStorage('invoice_history', invoiceHist);
                        console.log(`[Extorno] ${antesLen - invoiceHist.length} lançamento(s) de fatura removido(s) automaticamente.`);
                    }
                }
            }

            // Firestore sync
            if (Utils.Cloud.hasTenant() && window.db) {
                for (const dispId of idsParaReverter) {
                    try {
                        await window.db
                            .collection('tenants').doc(Utils.Cloud.tenantId)
                            .collection('dispatches_db').doc(String(dispId))
                            .update({ status: novoStatus });
                    } catch(e) {
                        console.warn('[_reverterDespachosDoRomaneio] Firestore erro para dispatch', dispId, e);
                    }
                }
            }
            return revertidos;
        };
        // ─────────────────────────────────────────────────────────────────────────────

        window.returnToDashboard = async (id) => {
            const numId = Number(id);

            // Localiza o romaneio que contém este despacho
            let romaneios = Utils.getStorage('app_romaneios') || [];
            const romaneioIdx = romaneios.findIndex(r => r.items && r.items.some(item => Number(item.id) === numId));
            const romaneioAfetado = romaneioIdx !== -1 ? romaneios[romaneioIdx] : null;
            const idsNoRomaneio = romaneioAfetado ? romaneioAfetado.items : [{ id: numId }];
            const qtd = idsNoRomaneio.length;

            // ✅ v3.11.40: Lista as NFs afetadas no diálogo para evitar confusão
            const nfList = idsNoRomaneio.map(i => 'NF ' + (i.invoice || ('#' + i.id))).join(', ');
            const msg = romaneioAfetado
                ? `Deseja retornar para o Painel de Pendências?\n\nRomaneio: ${romaneioAfetado.id}\nNFs afetadas (${qtd}): ${nfList}\n\nTodos voltarão para \'Pendente Despacho\'.`
                : `Deseja retornar este despacho para o Painel de Pendências?\n\n${nfList}`;

            if (!confirm(msg)) return;

            // Remove o romaneio vinculado
            if (romaneioAfetado) {
                romaneios.splice(romaneioIdx, 1);
                Utils.saveRaw('app_romaneios', JSON.stringify(romaneios));
            }

            // Reverte TODOS os despachos do romaneio (ou só este, se não havia romaneio)
            const revertidos = await window._reverterDespachosDoRomaneio(idsNoRomaneio, 'Pendente Despacho');

            showToast(`✅ ${revertidos} despacho(s) devolvido(s) para o painel de pendências!`);

            if (window.renderAppHistory) window.renderAppHistory();
            if (window.renderDashboard) window.renderDashboard();
            if (window.renderBaixaRomaneios) window.renderBaixaRomaneios();

            if (confirm('Ir para o Painel agora?')) {
                if (window.showSection) window.showSection('dashboard');
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

        async function renderLateDispatchesReport(container) {
            const history = await Utils.Cloud.getFullDispatchesHistory();
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

        async function renderVanPerformanceReport(container) {
            const history = await Utils.Cloud.getFullDispatchesHistory();
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
        async function renderDeliveryReport(container) {
            // Buscar histórico de entregas
            const deliveryHistory = Utils.getStorage('delivery_history') || [];
            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];

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
        window.applyDeliveryReportFilter = async function () {
            const startDate = document.getElementById('deliveryReportStartDate').value;
            const endDate = document.getElementById('deliveryReportEndDate').value;
            const personFilter = document.getElementById('deliveryReportPerson').value;
            const resultsContainer = document.getElementById('deliveryReportResults');

            // Buscar dados
            const deliveryHistory = Utils.getStorage('delivery_history') || [];
            const dispatches = (await Utils.Cloud.getFullDispatchesHistory()) || [];

            // Combinar e filtrar
            let allDeliveries = [
                ...deliveryHistory,
                ...dispatches.filter(d => d.deliveryStatus === 'entregue' || d.deliveryStatus === 'devolvido')
            ];

            // Filtrar por data
            if (startDate) {
                const parts = startDate.split('-');
                const start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
                allDeliveries = allDeliveries.filter(d => {
                    const dDate = new Date(d.deliveryCompletedAt || d.finalizedAt || d.date);
                    return dDate >= start;
                });
            }
            if (endDate) {
                const parts = endDate.split('-');
                const end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
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
                    const dispatchTime = new Date(item.deliveryDispatchedAt || item.date).getTime(); // Assumindo item.deliveryDispatchedAt como hora do despacho

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
                    const dispatchDate = new Date(d.deliveryDispatchedAt || d.date);
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
                    const dispatchDate = new Date(d.deliveryDispatchedAt || d.date);
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
        // --- WHATSAPP FIX (v1.6.4) ---
        window._showWaPanel = (queue) => {
            const existing = document.getElementById('_waPanelOverlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = '_waPanelOverlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px;';

            const panel = document.createElement('div');
            panel.style.cssText = 'background:var(--bg-card,#1e2533);border-radius:16px;padding:24px;max-width:500px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);';

            const sentSet = new Set();

            const openAll = () => {
                queue.forEach((item, i) => {
                    if (!sentSet.has(i)) {
                        window.open(item.url, '_blank');
                        sentSet.add(i);
                        document.getElementById(`_waStatus_${i}`).textContent = '✅ Enviado';
                        document.getElementById(`_waLink_${i}`).style.background = 'rgba(37,211,102,0.1)';
                        document.getElementById(`_waLink_${i}`).style.borderColor = 'rgba(37,211,102,0.35)';
                    }
                });
                renderPanel();
            };

            const renderPanel = () => {
                const allSent = queue.every((_, i) => sentSet.has(i));
                const pending = queue.length - sentSet.size;
                panel.innerHTML = `
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                        <span style="font-size:2rem;">💬</span>
                        <div>
                            <div style="font-weight:700;font-size:1.1rem;">Envio WhatsApp</div>
                            <div style="font-size:0.85rem;color:var(--text-secondary);">${sentSet.size}/${queue.length} enviado${queue.length !== 1 ? 's' : ''}</div>
                        </div>
                        <button onclick="document.getElementById('_waPanelOverlay').remove()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1.2rem;">✕</button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:20px;">
                        ${queue.map((item, i) => `
                            <a href="${item.url}" target="_blank" rel="noopener noreferrer"
                               id="_waLink_${i}"
                               style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-radius:10px;background:${sentSet.has(i) ? 'rgba(37,211,102,0.1)' : 'rgba(255,255,255,0.05)'};border:1px solid ${sentSet.has(i) ? 'rgba(37,211,102,0.35)' : 'rgba(255,255,255,0.08)'};text-decoration:none;color:var(--text-primary,#e2e8f0);transition:all 0.2s;">
                                <span style="font-size:0.85rem;font-weight:500;">${item.label}</span>
                                <span id="_waStatus_${i}" style="font-size:0.75rem;color:${sentSet.has(i) ? '#25D366' : '#94a3b8'};white-space:nowrap;">${sentSet.has(i) ? '✅ Enviado' : '📤 Abrir'}</span>
                            </a>
                        `).join('')}
                    </div>
                    ${allSent
                        ? '<div style="text-align:center;color:#25D366;font-weight:600;font-size:0.95rem;">✅ Todos os WhatsApps foram enviados!</div>'
                        : `<button id="_waOpenAllBtn" style="width:100%;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;border-radius:10px;padding:12px;font-size:0.9rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                            📲 Abrir Todos (${pending} pendente${pending !== 1 ? 's' : ''})
                           </button>
                           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-secondary,#94a3b8);text-align:center;">💡 Ou clique individualmente em cada contato</div>`
                    }
                `;

                const btn = panel.querySelector('#_waOpenAllBtn');
                if (btn) btn.addEventListener('click', openAll);

                // Attach click listener to each individual link
                queue.forEach((item, i) => {
                    const link = panel.querySelector(`#_waLink_${i}`);
                    if (link) {
                        link.addEventListener('click', () => {
                            sentSet.add(i);
                            // Re-render after a short tick so the new tab opens first
                            setTimeout(renderPanel, 300);
                        });
                    }
                });
            };

            renderPanel();
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            // Nota: Não há auto-click via setTimeout — browsers modernos bloqueiam window.open()
            // fora de um gesto direto do usuário. Use o botão "Abrir Todos" no painel.
        };
        // ────────────────────────────────────────────────────────────────────────

        window.sendWhatsApp = (id, silent = false) => {
            const numId = Number(id);
            const localHistory = Utils.getStorage('dispatches') || [];
            const allHistory = window._dispatchesFullCache || localHistory;
            const d = allHistory.find(item => Number(item.id) === numId);
            if (!d) {
                if (!silent) alert('Despacho não encontrado. Abra a aba "Montagem de Carga" primeiro.');
                return;
            }

            let phone = '';
            const cList = Utils.getStorage('clients');
            const norm = (s) => s ? s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() : '';

            const clientObj = cList.find(c => norm(c.nome) === norm(d.client));

            if (clientObj && clientObj.telefone) {
                phone = clientObj.telefone.replace(/\D/g, '');
            }

            const ignoredNames = ['DIVERSOS', 'CONSUMIDOR FINAL'];
            if (ignoredNames.includes(norm(d.client))) {
                if(!silent) alert('Cliente genérico selecionado. Não é possível enviar WhatsApp Automático.');
                return;
            }

            if (!phone || phone.length < 10) {
                if (!silent) {
                    alert('Telefone do cliente não encontrado para envio do WhatsApp.\nVerifique o cadastro do cliente.');
                } else {
                    console.warn(`[WA Auto] Telefone inválido/inexistente para o cliente ${d.client} da NF ${d.invoice}`);
                }
                return;
            }

            const rawLead = (d.leadTime || '').replace(/\D/g, '');
            let fullName = d.client || 'Cliente';
            if (typeof clientObj !== 'undefined' && clientObj && clientObj.nome) fullName = clientObj.nome;

            const msg = `Olá ${fullName}!\nInformamos que seu pedido NF: ${d.invoice} foi despachado via ${d.carrier}.\nPrevisão de Entrega: D+${rawLead} dias.\nLT Distribuidora agradece!\nQualquer dúvida, estamos à disposição!`;
            const url = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
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
                    const rawDate = data.date || data.lastUpdate || '';
                    let dateFormatted = rawDate;
                    if (rawDate && rawDate.includes('-')) {
                        const dateParts = rawDate.split('-');
                        dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                    }
                    vEl.innerText = `v${data.version}${dateFormatted ? ' • ' + dateFormatted : ''}`;
                })
                .catch(e => {
                    console.error('Erro ao carregar versão:', e);
                    vEl.innerText = 'v? (Erro ao carregar)';
                });
        }






































        // --- GESTÃO DE USUÁRIOS (Lógica) ---
        // --- GESTÃO DE USUÁRIOS (Lógica) ---
        window.saveUserAction = async () => {
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

            // Edit by login instead of index
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
                window.__editingUserIdx = -1; // Reset legacy flag
            } else {
                // Modo Novo Cadastro
                // Verificar duplicidade de login
                if (users.some(u => u.login === login)) {
                    alert('Este login já está em uso por outro usuário.');
                    return;
                }
                users.push({ name, login, pass, role });

                // v3.11.67: Sincroniza para o sistema novo (Firestore tenants/users)
                if (window.db && Utils.Cloud && Utils.Cloud.tenantId) {
                    try {
                        const _hBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
                        const _hHex = Array.from(new Uint8Array(_hBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
                        const _tid  = Utils.Cloud.tenantId;
                        await window.db.collection('tenants').doc(_tid).collection('users').doc(login).set({
                            nome: name, login, senhaHash: _hHex, role,
                            ativo: true, criadoEm: new Date().toISOString(), modulos: []
                        });
                        await window.db.collection('users_index').doc(login).set({ tenantId: _tid });
                        console.log(`✅ [saveUser] Sincronizado para sistema novo: ${login}`);
                    } catch (_e) {
                        console.warn('[saveUser] Falha ao sincronizar para sistema novo:', _e.message);
                    }
                }
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
            window.__editingUserLogin = null;
            const btn = document.getElementById('btnSaveUser');
            if (btn) {
                btn.innerHTML = '<span class="material-icons-round">save</span> Salvar Usuário';
                btn.classList.remove('btn-warning');
            }
        };

        // ========== GERENCIAMENTO DE CLIENTES ==========

        // Renderizar lista de clientes
        window.renderClientsList = (filterParam = '') => {
            const tbody = document.getElementById('clientListBody');
            const countSpan = document.getElementById('clientCount');
            const searchInput = document.getElementById('searchClientInput');
            const noCoverageCheck = document.getElementById('filterNoCoverage');

            if (!tbody) return;

            // Relê sempre do localStorage para capturar dados carregados via chunks do Firestore
            clients = Utils.getStorage('clients') || clients;

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
                            document.getElementById('newClientCity').value = data.cidade;
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
                            document.getElementById('newClientCity').value = data.cidade;
                            document.getElementById('newClientNeighborhood').value = data.bairro || '';
                            document.getElementById('newClientAddress').value =
                                `${data.logradouro}${data.numero ? ', ' + data.numero : ''}`;
                            document.getElementById('newClientPhone').value = data.telefone || '';

                            showToast(`✅ Dados preenchidos: ${data.nomeFantasia || data.razaoSocial || 'CPF inserido'}`);
                        }, 'Buscar Cliente por CNPJ/CPF');
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

        // --- FUNÇÕES DE BAIXA DE ROMANEIO ---
        window.reimprimirRomaneio = async (romaneioId) => {
            const romaneios = Utils.getStorage('app_romaneios') || [];
            const manifest = romaneios.find(r => r.id === romaneioId);
            if(!manifest) {
                alert('Romaneio não encontrado.');
                return;
            }

            const manifestItemIds = [...new Set(manifest.items.map(item => item.id))];
            const expectedCount = manifestItemIds.length;
            const dispatches = Utils.getStorage('dispatches') || [];
            let localItems = dispatches.filter(d => manifestItemIds.includes(d.id));

            const missingIds = manifestItemIds.filter(id => !localItems.find(d => d.id === id));
            let fullItems = [...localItems];

            if (missingIds.length > 0) {
                try {
                    console.log(`[Reimprimir] ${missingIds.length} NF(s) não encontradas no localStorage. Buscando no Firestore...`, missingIds);
                    const history = await Utils.Cloud.getFullDispatchesHistory();
                    const firestoreItems = history.filter(d => missingIds.includes(d.id));
                    fullItems = [...localItems, ...firestoreItems];
                    if (firestoreItems.length > 0) {
                        console.log(`[Reimprimir] ✅ ${firestoreItems.length} NF(s) recuperadas do Firestore. Total: ${fullItems.length}/${expectedCount}`);
                    } else {
                        console.warn(`[Reimprimir] ⚠️ NFs não encontradas no Firestore também:`, missingIds);
                    }
                } catch(e) {
                    console.error('[Reimprimir] Erro ao buscar no Firestore:', e);
                }
            }

            // 3. Fallback final: usa dados salvos dentro do próprio romaneio
            if(fullItems.length === 0 && manifest.items && manifest.items.length > 0) {
                console.warn(`[Reimprimir] Usando dados internos do romaneio ${romaneioId}.`);
                fullItems = manifest.items;
            }

            // 4. Se ainda faltar alguma, usa os dados do manifest como fallback parcial
            if (fullItems.length < expectedCount && manifest.items && manifest.items.length > 0) {
                const stillMissing = manifestItemIds.filter(id => !fullItems.find(d => d.id === id));
                const fromManifest = manifest.items.filter(item => stillMissing.includes(item.id));
                if (fromManifest.length > 0) {
                    console.warn(`[Reimprimir] Usando ${fromManifest.length} item(s) do snapshot do romaneio como fallback.`);
                    fullItems = [...fullItems, ...fromManifest];
                }
            }

            if(fullItems.length === 0) {
                alert('Erro: Notas do romaneio não encontradas no histórico para impressão.');
                return;
            }

            if (fullItems.length < expectedCount) {
                console.warn(`[Reimprimir] ⚠️ Imprimindo com ${fullItems.length} de ${expectedCount} NFs. Algumas podem estar faltando.`);
            }

            if(window.printSpecificRomaneio) {
                window.printSpecificRomaneio(manifest.carrier, fullItems);
            } else {
                alert('Erro: Função de impressão não carregada.');
            }
        };


        window.renderBaixaRomaneios = () => {
            const pendentesBody = document.getElementById('romaneioBaixaBody');
            const arquivadosBody = document.getElementById('romaneioArquivadoBody');
            const countPendentes = document.getElementById('countPendentesBaixa');
            if(!pendentesBody) return;

            let romaneios = Utils.getStorage('app_romaneios') || [];
            
            // Separar Pendentes (em_rota) de Arquivados (baixado)
            const pendentes = romaneios.filter(r => r.status === 'em_rota').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            const arquivados = romaneios.filter(r => r.status === 'baixado').sort((a,b) => new Date(b.baixadoAt) - new Date(a.baixadoAt)).slice(0, 50); // Mostra os 50 últimos

            if(countPendentes) countPendentes.innerText = pendentes.length;

            if(pendentes.length === 0) {
                pendentesBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-secondary);">Nenhum romaneio pendente de baixa.</td></tr>`;
            } else {
                pendentesBody.innerHTML = pendentes.map(r => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 1rem; font-weight: 600;">${r.id}</td>
                        <td style="padding: 1rem;">${new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                        <td style="padding: 1rem;">
                            <strong>${r.carrier}</strong>
                            ${r.driverName && r.driverName !== '-' ? `<br><small style="color:var(--text-secondary);">Motorista: ${r.driverName}</small>` : ''}
                        </td>
                        <td style="padding: 1rem; text-align: center;"><span style="background: rgba(59,130,246,0.1); color: var(--primary-color); padding: 4px 10px; border-radius: 12px; font-weight: bold;">${r.invoiceCount} NFs</span></td>
                        <td style="padding: 1rem; text-align: center;">
                            <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-secondary" onclick="window.reimprimirRomaneio('${r.id}')" title="Reimprimir Romaneio" style="padding: 6px 10px;">
                                    <span class="material-icons-round">print</span>
                                </button>
                                <button class="btn btn-primary" onclick="window.confirmarBaixaRomaneio('${r.id}')" style="background: var(--accent-success); border-color: var(--accent-success); display: flex; align-items: center; gap: 5px;">
                                    <span class="material-icons-round">check_circle</span>
                                    Arquivar / Baixa
                                </button>
                                <button class="btn btn-secondary" onclick="window.cancelarRomaneio('${r.id}')" title="Estornar / Cancelar este romaneio" style="padding: 6px 10px; display:flex; align-items:center; gap:4px; background: rgba(234,179,8,0.12); color: #d97706; border-color: rgba(234,179,8,0.3);">
                                    <span class="material-icons-round" style="font-size:1rem;">undo</span> Estornar
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }

            if(arquivados.length === 0) {
                arquivadosBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-secondary);">Nenhum histórico recente.</td></tr>`;
            } else {
                arquivadosBody.innerHTML = arquivados.map(r => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 1rem; font-weight: 600;">${r.id}</td>
                        <td style="padding: 1rem; color: var(--accent-success); font-weight: 500;">
                            ${new Date(r.baixadoAt).toLocaleString('pt-BR')}
                            <br><small style="color:var(--text-secondary);">Emissão: ${new Date(r.createdAt).toLocaleDateString('pt-BR')}</small>
                        </td>
                        <td style="padding: 1rem;">
                            <strong>${r.carrier}</strong>
                            ${r.driverName && r.driverName !== '-' ? `<br><small style="color:var(--text-secondary);">Motorista: ${r.driverName}</small>` : ''}
                        </td>
                        <td style="padding: 1rem; text-align: center;"><span style="background: rgba(107,114,128,0.1); color: var(--text-secondary); padding: 4px 10px; border-radius: 12px; font-weight: bold;">${r.invoiceCount} NFs</span></td>
                        <td style="padding: 1rem; text-align: center;">
                            <span style="color: var(--accent-success); display: flex; align-items: center; justify-content: center; gap: 5px; font-weight: 600;">
                                <span class="material-icons-round" style="font-size: 1.2rem;">done_all</span> Arquivado
                            </span>
                        </td>
                        <td style="padding: 1rem; text-align: center;">
                            <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-secondary" onclick="window.reimprimirRomaneio('${r.id}')" title="Reimprimir Romaneio" style="padding: 6px 10px; display:flex; align-items:center; gap:4px;">
                                    <span class="material-icons-round" style="font-size:1rem;">print</span> Reimprimir
                                </button>
                                <button class="btn btn-secondary" onclick="window.estornarBaixaRomaneio('${r.id}')" title="Estornar: Devolver para Em Rota" style="padding: 6px 10px; display:flex; align-items:center; gap:4px; background: rgba(234,179,8,0.12); color: #d97706; border-color: rgba(234,179,8,0.3);">
                                    <span class="material-icons-round" style="font-size:1rem;">undo</span> Estornar
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        };

        window.confirmarBaixaRomaneio = (romaneioId) => {
            if(!confirm(`Tem certeza que o canhoto/romaneio físico do código ${romaneioId} retornou e deseja arquivá-lo no sistema?`)) return;

            let romaneios = Utils.getStorage('app_romaneios') || [];
            const idx = romaneios.findIndex(r => r.id === romaneioId);
            if(idx !== -1) {
                romaneios[idx].status = 'baixado';
                romaneios[idx].baixadoAt = new Date().toISOString();
                Utils.saveRaw('app_romaneios', JSON.stringify(romaneios));
                showToast('✅ Romaneio baixado e arquivado com sucesso!');
                if (window.renderBaixaRomaneios) window.renderBaixaRomaneios();
            }
        };

        window.estornarBaixaRomaneio = (romaneioId) => {
            window.requestSupervisorPassword(`Estornar Romaneio ${romaneioId}`, () => {
                if (!confirm(`Confirma o ESTORNO do romaneio ${romaneioId}?\n\nEle voltará para status "Em Rota" e poderá ser baixado novamente.`)) return;

                let romaneios = Utils.getStorage('app_romaneios') || [];
                const idx = romaneios.findIndex(r => r.id === romaneioId);
                if (idx !== -1) {
                    romaneios[idx].status = 'em_rota';
                    delete romaneios[idx].baixadoAt;
                    Utils.saveRaw('app_romaneios', JSON.stringify(romaneios));
                    showToast('↩️ Romaneio estornado! Voltou para "Em Rota".');
                    if (window.renderBaixaRomaneios) window.renderBaixaRomaneios();
                } else {
                    alert('❌ Romaneio não encontrado.');
                }
            });
        };

        window.cancelarRomaneio = (romaneioId) => {
            window.requestSupervisorPassword(`Cancelar Romaneio ${romaneioId}`, () => {
                let romaneios = Utils.getStorage('app_romaneios') || [];
                const romaneio = romaneios.find(r => r.id === romaneioId);
                if (!romaneio) { alert('❌ Romaneio não encontrado.'); return; }

                const qtd = romaneio.items ? romaneio.items.length : 0;
                if (!confirm(`Confirma o CANCELAMENTO do romaneio ${romaneioId}?\n\n${qtd} despacho(s) voltarão para "Pendente Despacho" automaticamente.`)) return;

                // Remove o romaneio
                Utils.saveRaw('app_romaneios', JSON.stringify(romaneios.filter(r => r.id !== romaneioId)));

                // Reverte os despachos para Pendente
                const items = romaneio.items || [];
                window._reverterDespachosDoRomaneio(items, 'Pendente Despacho').then(revertidos => {
                    showToast(`↩️ Romaneio cancelado! ${revertidos} despacho(s) voltaram para pendentes.`);
                    if (window.renderBaixaRomaneios) window.renderBaixaRomaneios();
                    if (window.renderDashboard) window.renderDashboard();
                    if (window.renderAppHistory) window.renderAppHistory();
                });
            });
        };

        // ─── ESTORNO DE PAGAMENTO DE FATURA ───────────────────────────────────────────
        window.estornarPagamentoFatura = (invoiceHistoryId) => {
            window.requestSupervisorPassword('Estornar Pagamento de Fatura', () => {
                let invoiceHistory = Utils.getStorage('invoice_history') || [];
                const registro = invoiceHistory.find(h => String(h.id) === String(invoiceHistoryId));
                if (!registro) { alert('❌ Lançamento de fatura não encontrado.'); return; }

                if (!confirm(`Confirma o ESTORNO do lançamento de fatura "${registro.invoiceRef}" (${registro.carrier})?\n\n${registro.nfCount} NF(s) voltarão para status "Despachado".`)) return;

                // Remove o registro do histórico de faturas
                invoiceHistory = invoiceHistory.filter(h => String(h.id) !== String(invoiceHistoryId));
                Utils.setStorage('invoice_history', invoiceHistory);

                // Reverte os despachos (por número de NF) de 'Pago' para 'Despachado'
                let dispatches = Utils.getStorage('dispatches') || [];
                const nfList = registro.nfList || [];
                let revertidos = 0;
                dispatches.forEach(d => {
                    if (nfList.includes(d.invoice) && d.status === 'Pago') {
                        d.status = 'Despachado';
                        delete d.paidAt; delete d.invoiceRef;
                        delete d.paidBy; delete d.paymentNote;
                        delete d.authorizedBy;
                        revertidos++;
                    }
                });
                Utils.setStorage('dispatches', dispatches);

                showToast(`↩️ Fatura estornada! ${revertidos} NF(s) voltaram para "Despachado".`);
                if (window.showInvoiceHistory) window.showInvoiceHistory();
                if (window.renderAppHistory) window.renderAppHistory();
            });
        };
        // ─────────────────────────────────────────────────────────────────────────────


        // --- FUNÇÕES DE VENDEDORES (v3.6) ---
        window.renderSellersList = function () {
            const tbody = document.getElementById('sellerListBody');
            if (!tbody) return;
            tbody.innerHTML = '';
            let sellers = Utils.getStorage('app_sellers') || [];
            
            if (sellers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color: var(--text-secondary); font-style: italic;">Nenhum vendedor cadastrado.</td></tr>`;
                return;
            }

            // Exibir em ordem alfabética
            sellers.sort((a,b) => a.name.localeCompare(b.name)).forEach((s) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border-color)';
                tr.innerHTML = `
                    <td style="padding: 0.8rem 0.6rem; font-weight: 500; color: var(--text-secondary);">${s.id || '-'}</td>
                    <td style="padding: 0.8rem 0.6rem; font-weight: 600; color: var(--text-primary); text-transform: uppercase;">${s.name}</td>
                    <td style="padding: 0.8rem 0.6rem; font-family: monospace; font-size: 0.9rem;">${s.phone}</td>
                    <td style="padding: 0.8rem 0.6rem; text-align: center; vertical-align: middle;">
                        <div style="display: flex; gap: 4px; justify-content: center;">
                            <button class="btn btn-secondary" onclick="window.openEditSellerModal('${s.id}')" title="Editar Vendedor" style="padding: 4px 6px; height: 32px; display: flex; align-items: center; gap: 2px;">
                                <span class="material-icons-round" style="font-size: 1rem;">edit</span>
                                <span style="font-size: 0.75rem; font-weight: 600;">Editar</span>
                            </button>
                            <button class="btn btn-danger" onclick="window.deleteSeller('${s.id}')" title="Excluir Vendedor" style="padding: 4px 6px; height: 32px; background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); border: none; display: flex; align-items: center; gap: 2px;">
                                <span class="material-icons-round" style="font-size: 1rem;">delete</span>
                                <span style="font-size: 0.75rem; font-weight: 600;">Excluir</span>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        };

        window.openNewSellerModal = function () {
            document.getElementById('sellerModalTitle').innerHTML = '<span class="material-icons-round" style="color: var(--primary-color);">support_agent</span><span>Novo Vendedor</span>';
            document.getElementById('sellerEditId').value = '';
            document.getElementById('sellerName').value = '';
            document.getElementById('sellerPhone').value = '';
            document.getElementById('sellerModal').style.display = 'flex';
        };

        window.openEditSellerModal = function (id) {
            let sellers = Utils.getStorage('app_sellers') || [];
            const seller = sellers.find(s => s.id === id);
            if (!seller) return;

            document.getElementById('sellerModalTitle').innerHTML = '<span class="material-icons-round" style="color: var(--primary-color);">edit</span><span>Editar Vendedor</span>';
            document.getElementById('sellerEditId').value = seller.id;
            document.getElementById('sellerName').value = seller.name;
            document.getElementById('sellerPhone').value = seller.phone;
            document.getElementById('sellerModal').style.display = 'flex';
        };

        window.saveSellerAction = function () {
            const idInput = document.getElementById('sellerEditId').value;
            const name = document.getElementById('sellerName').value.trim().toUpperCase();
            const phone = document.getElementById('sellerPhone').value.trim().replace(/\D/g, '');

            if (!name || !phone) {
                window.showToast('❌ Nome e WhatsApp são obrigatórios!');
                return;
            }
            if (phone.length < 10) {
                window.showToast('❌ O WhatsApp precisa DDD e Número válidos!');
                return;
            }

            let sellers = Utils.getStorage('app_sellers') || [];

            if (idInput) {
                // Modo Edição
                const idx = sellers.findIndex(s => s.id === idInput);
                if (idx > -1) {
                    sellers[idx].name = name;
                    sellers[idx].phone = phone;
                    window.showToast('✅ Vendedor atualizado!');
                }
            } else {
                // Modo Criação
                const newId = 'V' + Date.now().toString().substring(7); // ID Curto
                sellers.push({ id: newId, name, phone });
                window.showToast('✅ Novo Vendedor cadastrado!');
            }

            Utils.setStorage('app_sellers', sellers);
            document.getElementById('sellerModal').style.display = 'none';
            if (window.renderSellersList) window.renderSellersList();
            if (window.populateSellersSelector) window.populateSellersSelector(); // Refresca dropdown da Cotação
        };

        window.deleteSeller = function (id) {
            let sellers = Utils.getStorage('app_sellers') || [];
            const seller = sellers.find(s => s.id === id);
            if (!seller) return;
            if (confirm(`Tem certeza que deseja remover o vendedor "${seller.name}"?`)) {
                sellers = sellers.filter(s => s.id !== id);
                Utils.setStorage('app_sellers', sellers);
                if (window.renderSellersList) window.renderSellersList();
                if (window.populateSellersSelector) window.populateSellersSelector();
                window.showToast('🗑️ Vendedor removido.');
            }
        };

        window.populateSellersSelector = function () {
            const select = document.getElementById('inputSeller');
            if (!select) return;

            const sellers = Utils.getStorage('app_sellers') || [];
            const currentVal = select.value;

            select.innerHTML = '<option value="">-- Selecione o Vendedor --</option>';
            sellers.sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.innerText = s.name;
                select.appendChild(opt);
            });

            if (currentVal) select.value = currentVal;
        };

        // ─── Mensagem do WhatsApp do Vendedor — personalizada por tenant ───────────────────
        // Para adicionar um novo tenant, basta incluir um novo `case` abaixo.
        window._buildVendorWAMsg = function (d, dispatchDate) {
            const tenant = (Utils.Cloud && Utils.Cloud.tenantId) || localStorage.getItem('app_tenant_id') || '';
            const sellerName  = d.sellerName  || 'Vendedor';
            const client      = d.client      || '';
            const invoice     = d.invoice     || '';
            const volume      = d.volume      || '';
            const nfValue     = Utils.formatCurrency(d.nfValue || 0);
            const carrier     = d.carrier     || '';
            const leadTime    = d.leadTime    || '';
            const date        = dispatchDate  || new Date().toLocaleDateString('pt-BR');

            switch (tenant) {
                case 'altafix':
                    return `Olá ${sellerName}!\nInformamos que o pedido do cliente ${client}, com nº de NF: ${invoice}, com ${volume} volumes, no valor de ${nfValue}, foi despachado em ${date} via ${carrier}.\nPrevisão de entrega: ${leadTime} dias.\nAlta Fix Distribuidora de Peças agradece!\nQualquer dúvida, estamos à disposição.`;

                case 'ltdistribuidora':
                default:
                    return `Olá ${sellerName}!\nInformamos que o pedido do cliente ${client}, com nº de NF: ${invoice}, com ${volume} volumes, no valor de ${nfValue}, foi despachado em ${date} via ${carrier}.\nPrevisão de entrega: ${leadTime} dias.\nLT Distribuidora agradece!\nQualquer dúvida, estamos à disposição.`;
            }
        };
        // ──────────────────────────────────────────────────────────────────────────────────────

        window.sendWhatsAppVendedor = function (dispatchId, silent = false) {
            const numId = Number(dispatchId);
            const localHistory = Utils.getStorage('dispatches') || [];
            const allHistory = window._dispatchesFullCache || localHistory;
            const d = allHistory.find(item => Number(item.id) === numId);

            if (!d) {
                if (!silent) alert('Nota Fiscal não encontrada! Abra a aba "Montagem de Carga" primeiro.');
                return;
            }

            if (!d.sellerPhone) {
                if (!silent) console.log(`Vendedor sem telefone para NF ${d.invoice}`);
                return;
            }

            const phone = d.sellerPhone.replace(/\D/g, '');
            const dispatchDate = new Date(d.dispatchedAt || d.date || new Date()).toLocaleDateString('pt-BR');
            const msg = window._buildVendorWAMsg(d, dispatchDate);

            const url = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
            window.open(url, '_blank');
        };

        // Hook para popular seletor no carregamento da seção
        const originalShowSection = window.showSection;
        window.showSection = (id) => {
            // Segurança: Bloqueio de acesso via URL/Console para Perfis de Entrega (v3.7.5)
            const storedUser = Utils.getStorage('logged_user');
            const userRole = storedUser ? (storedUser.role || '').toLowerCase().trim() : '';

            if (userRole === 'motoboy' && id !== 'moto') {
                if (originalShowSection) originalShowSection('moto');
                return;
            }
            if (userRole === 'motorista' && id !== 'carro') {
                if (originalShowSection) originalShowSection('carro');
                return;
            }

            if (id === 'system' || id === 'quote') {
                setTimeout(() => {
                    if (window.populateSellersSelector) window.populateSellersSelector();
                }, 100);
            }
            if (originalShowSection) originalShowSection(id);
        };

    } catch (err) {
        // v3.11.58: Exibe erro visível na tela além do console
        console.error("FATAL ERROR IN APP.JS:", err);
        _appReady = true; // libera o placeholder mesmo em caso de erro
        const btnErr = document.getElementById('btnLogin');
        if (btnErr) {
            btnErr.style.background = '#dc2626';
            btnErr.textContent = '⚠ ERRO: ' + (err && err.message ? err.message.substring(0,60) : 'Recarregue a página');
        }
    }
});

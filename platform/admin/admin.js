// ════════════════════════════════════════════════════════════
// ParreiraLog — Super Admin Panel (admin.js)
// Gestão de tenants, módulos e usuários da plataforma
// ════════════════════════════════════════════════════════════

// ── Firebase config (mesmo projeto do sistema principal) ──
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDzatCQ8zmH4aQftznf7Y5wdYPwFYSiARc",
    authDomain: "parreiralog-91904.firebaseapp.com",
    projectId: "parreiralog-91904",
    messagingSenderId: "527633267616",
    appId: "1:527633267616:web:3567e883b31f7fa02882c5",
    measurementId: "G-CQC6HKZ4V1"
};

// Módulos disponíveis na plataforma
const ALL_MODULES = [
    { id: 'dashboard',      label: 'Painel de Despacho',   icon: 'dashboard' },
    { id: 'quote',          label: 'Cotação de Fretes',    icon: 'request_quote' },
    { id: 'dispatch',       label: 'Montagem de Carga',    icon: 'local_shipping' },
    { id: 'invoice',        label: 'Conferência Fatura',   icon: 'receipt_long' },
    { id: 'delivery_moto',  label: 'Moto Entrega',         icon: 'two_wheeler' },
    { id: 'delivery_carro', label: 'Carro Entrega',        icon: 'directions_car' },
    { id: 'romaneio',       label: 'Baixa de Romaneio',    icon: 'assignment_turned_in' },
    { id: 'freight_tables', label: 'Tabelas de Frete',     icon: 'table_chart' },
    { id: 'reports',        label: 'Relatórios & KPIs',    icon: 'bar_chart' },
    { id: 'registrations',  label: 'Cadastros',            icon: 'people' },
    { id: 'settings',       label: 'Configurações',        icon: 'settings' },
    { id: 'acontec',        label: 'Integração Acontec',   icon: 'link' },
];

// ── Estado ──
let db = null;
let _currentTenantId = null; // tenant sendo editado (null = novo)
let _tenants = [];
let _editingUsers = []; // usuários do tenant atual no modal

// ── Init Firebase ──
(function initFirebase() {
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        firebase.auth().signInAnonymously().catch(() => {});
    } catch (e) {
        console.error('Firebase init error:', e);
    }
})();

// ════════════════════════════════════════════════════════════
// AUTH — Super Admin
// ════════════════════════════════════════════════════════════
async function adminLogin() {
    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value;
    showLoginError('');

    if (!user || !pass) { showLoginError('Preencha usuário e senha.'); return; }

    if (!db) {
        showLoginError('Erro: Firebase não inicializado. Recarregue a página (Ctrl+Shift+R).');
        return;
    }

    try {
        const doc = await db.collection('super_admin').doc('credentials').get();
        if (!doc.exists) { showLoginError('Credenciais não configuradas. Acesse /admin/setup.html primeiro.'); return; }

        const data = doc.data();
        if (data.login === user && data.password === pass) {
            sessionStorage.setItem('_sa_auth', btoa(user + ':' + Date.now()));
            showApp();
        } else {
            showLoginError('Usuário ou senha incorretos.');
        }
    } catch (e) {
        showLoginError('Erro: ' + e.message);
        console.error('[Admin] Erro no login:', e);
    }
}

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function adminLogout() {
    sessionStorage.removeItem('_sa_auth');
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    loadTenants();
}

// ── Expor funções globalmente ──
window.adminLogin  = adminLogin;
window.adminLogout = adminLogout;
window.showApp     = showApp;
window.loadTenants = loadTenants;

// ── Registrar eventos diretamente (script está no final do body, DOM já existe) ──
(function bindEvents() {
    const btnLogin = document.getElementById('btnAdminLogin');
    const passInput = document.getElementById('adminPass');
    const userInput = document.getElementById('adminUser');

    if (btnLogin)  btnLogin.addEventListener('click', adminLogin);
    if (passInput) passInput.addEventListener('keypress', e => { if (e.key === 'Enter') adminLogin(); });
    if (userInput) userInput.addEventListener('keypress', e => { if (e.key === 'Enter') adminLogin(); });

    console.log('[Admin] Eventos registrados. btnLogin:', !!btnLogin);

    // Manter sessão entre reloads
    if (sessionStorage.getItem('_sa_auth')) showApp();
})();


// ════════════════════════════════════════════════════════════
// TENANTS — Listagem
// ════════════════════════════════════════════════════════════
async function loadTenants() {
    const grid = document.getElementById('tenantGrid');
    grid.innerHTML = '<div class="loading"><span class="material-icons-round spin">sync</span><br>Carregando...</div>';

    try {
        const snap = await db.collection('tenants').get();
        _tenants = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                name: data.nome || data.name || d.id,
                modules: data.modulos || data.modules || [],
                status: data.ativo !== undefined ? (data.ativo ? 'active' : 'inactive') : (data.status || 'active'),
                ...data
            };
        });
        renderTenantGrid();
    } catch (e) {
        grid.innerHTML = `<div class="loading" style="color:#ef4444;">Erro ao carregar: ${e.message}</div>`;
    }
}

function renderTenantGrid() {
    const grid = document.getElementById('tenantGrid');

    // Separar tenants de produção dos de homologação (_hml)
    const prodTenants = _tenants.filter(t => !t.id.endsWith('_hml'));
    const hmlMap = {};
    _tenants.filter(t => t.id.endsWith('_hml')).forEach(t => {
        hmlMap[t.id.replace(/_hml$/, '')] = t;
    });

    // Tenants HML sem produção correspondente (orphans)
    const hmlOrphans = _tenants.filter(t => t.id.endsWith('_hml') && !_tenants.find(p => p.id === t.id.replace(/_hml$/, '')));

    const active   = prodTenants.filter(t => t.status === 'active').length;
    const inactive = prodTenants.filter(t => t.status !== 'active').length;

    document.getElementById('statTotal').textContent   = prodTenants.length;
    document.getElementById('statActive').textContent  = active;
    document.getElementById('statInactive').textContent = inactive;

    if (_tenants.length === 0) {
        grid.innerHTML = '<div class="loading">Nenhuma empresa cadastrada. Clique em "Nova Empresa".</div>';
        return;
    }

    const PROD_URL  = 'parreirasistemas.vercel.app';
    const HML_URL   = 'parreirasistemas-git-staging-paulo-h-parreiras-projects.vercel.app';

    const renderCard = (t, hmlTenant) => {
        const statusClass = t.status === 'active' ? 'status-active' : t.status === 'suspended' ? 'status-suspended' : 'status-inactive';
        const statusLabel = t.status === 'active' ? 'Ativa' : t.status === 'suspended' ? 'Suspenso' : 'Inativa';
        const mods = (t.modules || []).length;
        const slug = t.slug || t.id;
        const prodUrl  = `${PROD_URL}/${slug}`;
        const hmlSlug  = hmlTenant ? (hmlTenant.slug || hmlTenant.id) : `${slug}_hml`;
        const hmlUrlFull = `${HML_URL}/${hmlSlug}`;
        const hasHml = !!hmlTenant;

        return `
        <div class="tenant-card" onclick="openEditTenantModal('${t.id}')">
            <div class="tenant-card-head">
                <div>
                    <div class="tenant-name">${t.name || t.id}</div>
                    <div class="tenant-slug">/${slug}</div>
                </div>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="tenant-meta">
                <span><span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;">apps</span> ${mods} módulo${mods !== 1 ? 's' : ''}</span>
                ${t.contactPhone ? `<span><span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;">phone</span> ${t.contactPhone}</span>` : ''}
            </div>

            <!-- Link PRODUÇÃO -->
            <div class="tenant-url" style="margin-top:12px; border-color:rgba(34,197,94,0.3); background:rgba(34,197,94,0.06);">
                <div class="url-text" style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="font-size:0.65rem;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.15);padding:2px 6px;border-radius:4px;letter-spacing:.04em;flex-shrink:0;">PROD</span>
                    <span class="url-text" style="color:#22c55e;font-size:0.73rem;" title="${prodUrl}">${prodUrl}</span>
                </div>
                <div class="url-actions">
                    <span class="material-icons-round" style="font-size:.9rem;cursor:pointer;color:#22c55e;" title="Copiar" onclick="event.stopPropagation();copyUrl('${prodUrl}')">content_copy</span>
                    <a href="https://${prodUrl}" target="_blank" onclick="event.stopPropagation()" style="color:#22c55e;"><span class="material-icons-round" style="font-size:.9rem;">open_in_new</span></a>
                </div>
            </div>

            <!-- Link HOMOLOGAÇÃO -->
            <div class="tenant-url" style="margin-top:6px; border-color:rgba(245,158,11,${hasHml ? '0.3' : '0.1'}); background:rgba(245,158,11,${hasHml ? '0.06' : '0.02'});">
                <div class="url-text" style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="font-size:0.65rem;font-weight:700;color:${hasHml ? '#f59e0b' : '#64748b'};background:rgba(245,158,11,${hasHml ? '0.15' : '0.05'});padding:2px 6px;border-radius:4px;letter-spacing:.04em;flex-shrink:0;">HML</span>
                    <span class="url-text" style="color:${hasHml ? '#f59e0b' : '#475569'};font-size:0.73rem;" title="${hmlUrlFull}">${hmlUrlFull}</span>
                </div>
                ${hasHml ? `<div class="url-actions">
                    <span class="material-icons-round" style="font-size:.9rem;cursor:pointer;color:#f59e0b;" title="Copiar" onclick="event.stopPropagation();copyUrl('${hmlUrlFull}')">content_copy</span>
                    <a href="https://${hmlUrlFull}" target="_blank" onclick="event.stopPropagation()" style="color:#f59e0b;"><span class="material-icons-round" style="font-size:.9rem;">open_in_new</span></a>
                </div>` : `<span style="font-size:0.7rem;color:#475569;font-style:italic;flex-shrink:0;">não criado</span>`}
            </div>

            ${!hasHml ? `<button class="btn" style="margin-top:10px;width:100%;justify-content:center;font-size:0.78rem;padding:7px;background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.25);" onclick="event.stopPropagation();createHmlTenant('${t.id}','${t.name || t.id}')"><span class="material-icons-round" style="font-size:.9rem;">science</span> Criar Ambiente HML</button>` : ''}
        </div>`;

    };

    const renderHmlOrphan = (t) => {
        const slug = t.slug || t.id;
        const hmlUrl = `${HML_URL}/${slug}`;
        return `
        <div class="tenant-card" style="border-color:rgba(245,158,11,0.3);" onclick="openEditTenantModal('${t.id}')">
            <div class="tenant-card-head">
                <div>
                    <div class="tenant-name">${t.name || t.id}</div>
                    <div class="tenant-slug">/${slug}</div>
                </div>
                <span class="status-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;">Apenas HML</span>
            </div>
            <div class="tenant-url" style="border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
                <div class="url-text" style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="font-size:0.65rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.15);padding:2px 6px;border-radius:4px;flex-shrink:0;">HML</span>
                    <span class="url-text" style="color:#f59e0b;font-size:0.73rem;" title="${hmlUrl}">${hmlUrl}</span>
                </div>
                <div class="url-actions">
                    <span class="material-icons-round" style="font-size:.9rem;cursor:pointer;color:#f59e0b;" onclick="event.stopPropagation();copyUrl('${hmlUrl}')">content_copy</span>
                    <a href="https://${hmlUrl}" target="_blank" onclick="event.stopPropagation()" style="color:#f59e0b;"><span class="material-icons-round" style="font-size:.9rem;">open_in_new</span></a>
                </div>
            </div>
        </div>`;
    };

    grid.innerHTML = [
        ...prodTenants.map(t => renderCard(t, hmlMap[t.id])),
        ...hmlOrphans.map(t => renderHmlOrphan(t))
    ].join('');
}


function copyUrl(url) {
    navigator.clipboard.writeText('https://' + url).then(() => toast('URL copiada!', 'success'));
}

// Garante que o Firebase Auth está pronto (signInAnonymously concluído)
function _ensureAuth() {
    return new Promise((resolve, reject) => {
        const currentUser = firebase.auth().currentUser;
        if (currentUser) { resolve(currentUser); return; }
        // Aguarda o onAuthStateChanged disparar (ou faz signIn se necessário)
        const unsubscribe = firebase.auth().onAuthStateChanged(user => {
            unsubscribe();
            if (user) { resolve(user); return; }
            // Sem usuário: faz signInAnonymously agora e aguarda
            firebase.auth().signInAnonymously()
                .then(cred => resolve(cred.user))
                .catch(reject);
        });
        // Timeout de segurança: 8 segundos
        setTimeout(() => reject(new Error('Timeout aguardando autenticação Firebase.')), 8000);
    });
}

// Cria automaticamente o tenant _hml a partir do tenant de produção
window.createHmlTenant = async function(prodId, prodName) {
    const hmlId   = prodId + '_hml';
    const hmlName = prodName + ' (HML)';
    if (!confirm(`Criar ambiente de homologação "${hmlId}" para ${prodName}?\n\nIsso criará um tenant separado.\nOs usuários e configurações de frete serão copiados da produção.`)) return;
    try {
        // Garante autenticação Firebase antes de qualquer escrita no Firestore
        await _ensureAuth();

        // 1. Lê dados do tenant de produção
        const prodDoc  = await db.collection('tenants').doc(prodId).get();
        const prodData = prodDoc.exists ? prodDoc.data() : {};

        // 2. Cria o documento do tenant HML
        await db.collection('tenants').doc(hmlId).set({
            nome: hmlName,
            name: hmlName,
            slug: hmlId,
            ativo: true,
            status: 'active',
            modulos: prodData.modulos || prodData.modules || [],
            modules: prodData.modulos || prodData.modules || [],
            isHml: true,
            prodTenantRef: prodId,
            createdAt: new Date().toISOString()
        });

        // 3. Copia documentos essenciais do legacy_store de produção → HML
        //    (usuários, tabelas de frete, transportadoras, dados da empresa)
        const DOCS_TO_COPY = ['app_users', 'freight_tables', 'carrier_list',
                              'carrier_configs', 'company_data', 'carrier_info_v2'];
        let copiedCount = 0;
        for (const docName of DOCS_TO_COPY) {
            try {
                const snap = await db.collection('tenants').doc(prodId)
                                     .collection('legacy_store').doc(docName).get();
                if (snap.exists) {
                    await db.collection('tenants').doc(hmlId)
                            .collection('legacy_store').doc(docName).set(snap.data());
                    copiedCount++;
                }
            } catch(e) {
                console.warn(`[HML] Falha ao copiar ${docName}:`, e.message);
            }
        }

        toast(`✅ Ambiente HML "${hmlId}" criado! ${copiedCount} config(s) copiada(s) da produção.`, 'success');
        await loadTenants();
    } catch (e) {
        toast('Erro ao criar HML: ' + e.message, 'error');
    }
};


// ════════════════════════════════════════════════════════════
// MODAL — Novo / Editar Tenant
// ════════════════════════════════════════════════════════════
function openNewTenantModal() {
    _currentTenantId = null;
    _editingUsers = [];
    document.getElementById('modalTitle').textContent = 'Nova Empresa';
    document.getElementById('btnDeleteTenant').style.display = 'none';
    renderModalBody(null, []);
    document.getElementById('tenantModal').classList.add('open');
}

async function openEditTenantModal(tenantId) {
    _currentTenantId = tenantId;
    const tenant = _tenants.find(t => t.id === tenantId);
    document.getElementById('modalTitle').textContent = `Editar — ${tenant?.name || tenantId}`;
    document.getElementById('btnDeleteTenant').style.display = 'inline-flex';

    // Carrega usuários do tenant
    try {
        const usersSnap = await db.collection('tenants').doc(tenantId).collection('users').get();
        _editingUsers = usersSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    } catch (e) {
        _editingUsers = [];
    }

    renderModalBody(tenant, _editingUsers);
    document.getElementById('tenantModal').classList.add('open');
}

function renderModalBody(tenant, users) {
    const activeMods = tenant?.modules || [];
    const body = document.getElementById('modalBody');

    body.innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label class="form-label">Nome da Empresa *</label>
                <input type="text" id="fName" class="form-input" placeholder="Ex: LT Distribuidora" value="${escHtml(tenant?.name || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Slug (URL) *</label>
                <input type="text" id="fSlug" class="form-input" placeholder="ltdistribuidora" value="${escHtml(tenant?.slug || tenant?.id || '')}"
                    oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9]/g,'')">
            </div>
            <div class="form-group">
                <label class="form-label">E-mail de Contato</label>
                <input type="email" id="fEmail" class="form-input" placeholder="contato@empresa.com" value="${escHtml(tenant?.contactEmail || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Telefone</label>
                <input type="text" id="fPhone" class="form-input" placeholder="(11) 99999-9999" value="${escHtml(tenant?.contactPhone || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select id="fStatus" class="form-input">
                    <option value="active"    ${(tenant?.status||'active')==='active'    ?'selected':''}>✅ Ativa</option>
                    <option value="inactive"  ${(tenant?.status||'')==='inactive'  ?'selected':''}>🔴 Inativa</option>
                    <option value="suspended" ${(tenant?.status||'')==='suspended' ?'selected':''}>⚠️ Suspensa</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <input type="text" id="fNotes" class="form-input" placeholder="Notas internas" value="${escHtml(tenant?.notes || '')}">
            </div>
        </div>

        <hr class="section-sep">
        <div class="modules-title">Módulos Disponíveis para este Tenant</div>
        <div class="modules-grid">
            ${ALL_MODULES.map(m => `
                <div class="module-toggle ${activeMods.includes(m.id) ? 'active' : ''}" id="mod_${m.id}" onclick="toggleModule('${m.id}')">
                    <div class="toggle-check">
                        ${activeMods.includes(m.id) ? '<span class="material-icons-round" style="font-size:.85rem;color:#fff;">check</span>' : ''}
                    </div>
                    <span class="material-icons-round" style="font-size:1rem;color:var(--text-muted);">${m.icon}</span>
                    <span class="toggle-name">${m.label}</span>
                </div>
            `).join('')}
        </div>

        <hr class="section-sep">
        <div class="users-section">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div class="modules-title" style="margin:0;">Usuários</div>
                <button class="btn btn-ghost" style="font-size:0.78rem;padding:6px 12px;" onclick="toggleAddUserForm()">
                    <span class="material-icons-round" style="font-size:.9rem;">person_add</span> Adicionar
                </button>
            </div>

            <div class="add-user-form" id="addUserForm">
                <div class="form-grid" style="margin-bottom:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Nome</label>
                        <input type="text" id="newUserName" class="form-input" placeholder="Nome completo">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Login</label>
                        <input type="text" id="newUserLogin" class="form-input" placeholder="login.usuario">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Senha</label>
                        <input type="text" id="newUserPass" class="form-input" placeholder="senha inicial">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Perfil</label>
                        <select id="newUserRole" class="form-input">
                            <option value="admin">Administrador</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="operator" selected>Operador</option>
                        </select>
                    </div>
                </div>
                <button class="btn btn-success" style="font-size:0.8rem;" onclick="addUserToList()">
                    <span class="material-icons-round" style="font-size:.9rem;">check</span> Confirmar Usuário
                </button>
            </div>

            ${users.length === 0
                ? '<div style="color:var(--text-muted);font-size:0.82rem;padding:12px 0;">Nenhum usuário cadastrado.</div>'
                : `<table class="users-table">
                    <thead><tr>
                        <th>Nome</th><th>Login</th><th>Perfil</th><th>Status</th><th></th>
                    </tr></thead>
                    <tbody id="usersTableBody">
                        ${users.map((u, idx) => renderUserRow(u, idx)).join('')}
                    </tbody>
                </table>`
            }
            ${users.length > 0 ? '' : '<table class="users-table" style="display:none;"><tbody id="usersTableBody"></tbody></table>'}
        </div>
    `;
}

function renderUserRow(u, idx) {
    const roleClass = u.role === 'admin' ? 'role-admin' : u.role === 'supervisor' ? 'role-supervisor' : 'role-operator';
    const roleLabel = u.role === 'admin' ? 'Admin' : u.role === 'supervisor' ? 'Supervisor' : 'Operador';
    return `<tr id="uRow_${idx}">
        <td>${escHtml(u.nome || u.name || '—')}</td>
        <td style="font-family:monospace;font-size:0.78rem;">${escHtml(u.login || '—')}</td>
        <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
        <td style="color:${u.ativo !== false ? 'var(--success)' : 'var(--danger)'};">${u.ativo !== false ? '● Ativo' : '● Inativo'}</td>
        <td><button class="btn btn-ghost" style="padding:4px 8px;font-size:0.75rem;" onclick="removeUserFromList(${idx})">
            <span class="material-icons-round" style="font-size:.9rem;">delete</span>
        </button></td>
    </tr>`;
}

function toggleAddUserForm() {
    document.getElementById('addUserForm').classList.toggle('open');
}

function addUserToList() {
    const name  = document.getElementById('newUserName').value.trim();
    const login = document.getElementById('newUserLogin').value.trim().toLowerCase();
    const pass  = document.getElementById('newUserPass').value.trim();
    const role  = document.getElementById('newUserRole').value;

    if (!name || !login || !pass) { toast('Preencha nome, login e senha.', 'error'); return; }
    if (_editingUsers.find(u => u.login === login)) { toast('Login já existe neste tenant.', 'error'); return; }

    _editingUsers.push({ nome: name, login, pass, role, ativo: true, _isNew: true });

    // Reexibe a tabela
    const tbody = document.getElementById('usersTableBody');
    const table = tbody?.closest('table');
    if (table) { table.style.display = ''; }
    if (!tbody) return;
    tbody.innerHTML = _editingUsers.map((u, i) => renderUserRow(u, i)).join('');

    // Limpa o form
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserLogin').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('addUserForm').classList.remove('open');
    toast(`Usuário "${name}" adicionado. Salve para confirmar.`, 'info');
}

function removeUserFromList(idx) {
    _editingUsers.splice(idx, 1);
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = _editingUsers.map((u, i) => renderUserRow(u, i)).join('');
}

function toggleModule(moduleId) {
    const el = document.getElementById(`mod_${moduleId}`);
    el.classList.toggle('active');
    const isActive = el.classList.contains('active');
    el.querySelector('.toggle-check').innerHTML = isActive
        ? '<span class="material-icons-round" style="font-size:.85rem;color:#fff;">check</span>'
        : '';
}

function closeModal() {
    document.getElementById('tenantModal').classList.remove('open');
    _currentTenantId = null;
    _editingUsers = [];
}

// ════════════════════════════════════════════════════════════
// SAVE / DELETE TENANT
// ════════════════════════════════════════════════════════════
async function saveTenant() {
    const name   = document.getElementById('fName').value.trim();
    const slug   = document.getElementById('fSlug').value.trim().toLowerCase();
    const email  = document.getElementById('fEmail').value.trim();
    const phone  = document.getElementById('fPhone').value.trim();
    const status = document.getElementById('fStatus').value;
    const notes  = document.getElementById('fNotes').value.trim();

    if (!name || !slug) { toast('Nome e Slug são obrigatórios.', 'error'); return; }
    if (!/^[a-z0-9]+$/.test(slug)) { toast('Slug deve conter apenas letras minúsculas e números.', 'error'); return; }

    // Coleta módulos selecionados
    const modules = ALL_MODULES.filter(m => document.getElementById(`mod_${m.id}`)?.classList.contains('active')).map(m => m.id);

    const data = { 
        name, 
        nome: name, 
        slug, 
        status, 
        ativo: status === 'active', 
        contactEmail: email, 
        contactPhone: phone, 
        notes, 
        modules, 
        modulos: modules, 
        updatedAt: new Date().toISOString() 
    };

    try {
        const docId = _currentTenantId || slug;

        if (!_currentTenantId) {
            // Verifica se slug já existe
            const existing = await db.collection('tenants').doc(docId).get();
            if (existing.exists) { toast(`Slug "${slug}" já está em uso. Escolha outro.`, 'error'); return; }
            data.createdAt = new Date().toISOString();
        }

        await db.collection('tenants').doc(docId).set(data, { merge: true });

        // Salva novos usuários
        for (const u of _editingUsers.filter(u => u._isNew)) {
            const userDoc = { nome: u.nome, login: u.login, pass: u.pass, role: u.role, ativo: true, createdAt: new Date().toISOString() };
            await db.collection('tenants').doc(docId).collection('users').doc(u.login).set(userDoc);
        }

        toast(`Empresa "${name}" salva com sucesso!`, 'success');
        closeModal();
        loadTenants();
    } catch (e) {
        toast('Erro ao salvar: ' + e.message, 'error');
    }
}

async function deleteTenant() {
    if (!_currentTenantId) return;
    const tenant = _tenants.find(t => t.id === _currentTenantId);
    if (!confirm(`Excluir a empresa "${tenant?.name || _currentTenantId}"?\n\nIsso remove os dados do tenant. Usuários e dados de despacho não são apagados automaticamente.`)) return;

    try {
        await db.collection('tenants').doc(_currentTenantId).update({ 
            status: 'inactive', 
            ativo: false, 
            deletedAt: new Date().toISOString() 
        });
        toast('Empresa desativada.', 'info');
        closeModal();
        loadTenants();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

// ════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════
function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

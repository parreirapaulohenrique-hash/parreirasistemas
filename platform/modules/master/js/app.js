// app.js Ã¢â‚¬â€ Painel Admin | Parreira Sistemas
// (usa window.mockTenants definido em data.js)
const mockTenants = window.mockTenants || [];


// State
let dynamicTenants = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');
let platformUsers  = JSON.parse(localStorage.getItem('platform_users_registry')  || '[]');

// MIGRAÃ‡ÃƒO v3.17.5: remove IDs depreciados do localStorage
// (substituÃ­dos, duplicados ou criados por erro no Firestore)
const _DEPRECATED = ['altsfix', 'login.html', '01', 'contrapecas'];
if (dynamicTenants.some(t => _DEPRECATED.includes(t.id))) {
    dynamicTenants = dynamicTenants.filter(t => !_DEPRECATED.includes(t.id));
    localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));
    console.log('[Master] MigraÃ§Ã£o: IDs depreciados removidos do localStorage');
}

// SEED: garante que os tenants base do sistema existam em dynamicTenants (source of truth Ãºnica)
;(function seedAndDedup() {
    // SEMPRE garante que os mockTenants (clientes base) estÃ£o presentes
    mockTenants.forEach(mock => {
        if (!dynamicTenants.find(t => t.id === mock.id)) {
            dynamicTenants.push({ ...mock, isDynamic: false });
        }
    });
    // Dedup: mantÃ©m a Ãºltima entrada de cada ID
    const seen = new Map();
    dynamicTenants.forEach(t => seen.set(t.id, t));
    dynamicTenants = [...seen.values()];
    localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));
    console.log(`[Master] Seed concluÃ­do: ${dynamicTenants.length} tenants carregados.`);
})();


// Recarrega tenants do Firestore (para recuperar clientes cadastrados dinamicamente
// caso o localStorage tenha sido limpo no browser)
async function reloadTenantsFromFirestore() {
    try {
        const db = ParreiraAuth.getDB();
        if (!db) return;
        const snap = await db.collection('tenants').get();
        if (snap.empty) return;

        let updated = false;
        // IDs depreciados: existem no Firestore mas foram substituÃ­dos por IDs corretos
        const DEPRECATED_IDS = ['altsfix', 'login.html', '01', 'contrapecas'];

        snap.forEach(doc => {
            if (DEPRECATED_IDS.includes(doc.id)) {
                console.log(`[Master] Firestore: ignorando tenant depreciado '${doc.id}'`);
                return;
            }
            const data = doc.data();
            const isAtivo = data.ativo !== undefined ? data.ativo : (data.status === 'active');
            if (!isAtivo) return; // Ignora tenants inativos

            const firestoreData = {
                id:        doc.id,
                name:      data.nome || data.name || doc.id,
                cnpj:      data.cnpj || '',
                modules:   data.modulos || data.modules || [],
                status:    'active',
                slug:      data.slug || doc.id,
                isDynamic: true
            };

            const existingIdx = dynamicTenants.findIndex(t => t.id === doc.id);
            if (existingIdx >= 0) {
                // MERGE: atualiza dados existentes com informaÃ§Ãµes do Firestore
                // Firestore tem precedÃªncia sobre data.js para nome, CNPJ e mÃ³dulos
                const existing = dynamicTenants[existingIdx];
                const merged = {
                    ...existing,
                    name:    (data.nome || data.name) || existing.name,
                    cnpj:    data.cnpj || existing.cnpj || '',
                    modules: (data.modulos || data.modules)?.length ? (data.modulos || data.modules) : existing.modules,
                    slug:    data.slug || existing.slug || doc.id
                };
                // SÃ³ marca como updated se algo mudou de fato
                if (JSON.stringify(merged) !== JSON.stringify(existing)) {
                    dynamicTenants[existingIdx] = merged;
                    updated = true;
                }
            } else {
                // Novo tenant: adiciona do Firestore
                dynamicTenants.push(firestoreData);
                updated = true;
                console.log(`[Master] Tenant restaurado do Firestore: ${doc.id}`);
            }
        });

        if (updated) {
            localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));
            renderTenants(); // Re-renderiza com os dados atualizados
        }
    } catch(e) {
        console.warn('[Master] Falha ao recarregar tenants do Firestore:', e.message);

        // v3.17.0: Seeds com senhas hardcoded removidos â€” usuÃ¡rios gerenciados via Firestore (ParreiraAuth)
        // Para criar/editar usuÃ¡rios, usar o Firebase Console ou o mÃ³dulo de gestÃ£o de usuÃ¡rios.

        // v3.17.0: Bloco SECURITY_KEY removido â€” sem mais senhas hardcoded no cÃ³digo.
        // UsuÃ¡rios gerenciados exclusivamente via Firestore (ParreiraAuth).
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Expor globais para onclick inline no HTML
    window.openModal  = openModal;
    window.closeModal = closeModal;
    window.editTenant = editTenant;
    window.editUser   = editUser;
    window.switchView = switchView;

    renderTenants();
    renderUsers();
    setupForms();
    loadVersion();

    // Recupera tenants dinÃ¢micos do Firestore (caso localStorage tenha sido limpo)
    // Executa apÃ³s um pequeno delay para garantir que Firebase esteja pronto
    setTimeout(() => reloadTenantsFromFirestore(), 1500);

    // Listener do form de editar liberaÃ§Ãµes de mÃ³dulos
    const editTenantForm = document.getElementById('editTenantForm');
    if (editTenantForm) {
        editTenantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id      = document.getElementById('editTenantIdField').value;
            const modules = Array.from(document.querySelectorAll('input[name="editModules"]:checked')).map(cb => cb.value);

            // Atualiza localStorage
            const idx = dynamicTenants.findIndex(t => t.id === id);
            if (idx >= 0) {
                dynamicTenants[idx].modules = modules;
            } else {
                const base = getAllTenants().find(t => t.id === id);
                if (base) dynamicTenants.push({ ...base, modules, isDynamic: true });
            }
            localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));

            // Atualiza Firestore: modulos do tenant (para auth.js refletir modulos corretos no login)
            try {
                const tenant = getAllTenants().find(t => t.id === id);
                const db = ParreiraAuth.getDB();
                db.collection('tenants').doc(id).set({
                    nome:    tenant?.name || id,
                    modulos: modules,
                    ativo:   true
                }, { merge: true }).catch(e => console.warn('[Master] Firestore edit tenant:', e.message));
            } catch(e) { console.warn('[Master] Firebase nao disponivel:', e.message); }

            closeModal('editTenantModal');
            renderTenants();
        });
    }
});

function loadVersion() {
    fetch('version.json')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('masterVersion');
            if (el) el.textContent = `v${data.version}`;
        })
        .catch(e => console.warn('Master version load failed', e));
}

// View Navigation
window.switchView = (viewName) => {
    // Hide all
    document.querySelectorAll('.main-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Show chosen
    const viewEl = document.getElementById(`view-${viewName}`);
    if (viewEl) viewEl.style.display = 'block';

    // Active Nav Item
    const navIndex = { tenants: 0, users: 1, licencas: 2, ambientes: 3 }[viewName] ?? 0;
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[navIndex]) navItems[navIndex].classList.add('active');

    // Loaders
    if (viewName === 'licencas' && window.LicencasManager) {
        window.LicencasManager.renderView();
    }
    if (viewName === 'ambientes') {
        renderAmbientes();
    }
};


// Modal Control
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex'; // FORCE VISIBILITY

        // Refresh selects if needed
        if (modalId === 'userModal') {
            populateTenantSelect();
        }
    } else {
        console.error('Modal not found:', modalId);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none'; // FORCE HIDE

        const form = modal.querySelector('form');
        if (form) form.reset();
    }
}

// ÃƒÅ¡nica fonte de verdade Ã¢â‚¬â€ tudo estÃ¡ em dynamicTenants
function getAllTenants() {
    return dynamicTenants;
}

function populateTenantSelect() {
    const select = document.getElementById('userTenant');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a empresa...</option>';
    getAllTenants().forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.name} (${t.id})`;
        select.appendChild(option);
    });
}
// (Globals exposed at top)


// --- Tenants Logic ---

function renderTenants() {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const allTenants = getAllTenants();

    if (allTenants.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding:2rem;">
            <span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem;opacity:.4;">business_off</span>
            Nenhum cliente cadastrado.<br>
            <small style="opacity:.6;">Se os clientes sumiram, recarregue a pÃ¡gina (F5).</small>
        </td></tr>`;
        return;
    }

    allTenants.forEach(tenant => {
        const tr = document.createElement('tr');
        const isDynamic = tenant.isDynamic;
        const statusClass = tenant.status === 'active' ? 'active' : 'inactive';
        const modules = tenant.modules || []; // ProteÃ§Ã£o: evita crash se modules for undefined

        tr.innerHTML = `
            <td>
                <div class="cell-info">
                    <span class="cell-title">${tenant.name || tenant.id} ${isDynamic ? '<span style="font-size:0.65em; background:var(--primary-color); color:white; padding:1px 5px; border-radius:4px; vertical-align:middle;">NOVO</span>' : ''}</span>
                    <span class="cell-subtitle">ID: ${tenant.id}</span>
                </div>
            </td>
            <td><span style="font-family:monospace; color:var(--text-secondary);">${tenant.cnpj || '-'}</span></td>
            <td>
                ${modules.length > 0
                    ? modules.map(mod => `<span class="module-tag">${formatModuleName(mod)}</span>`).join('')
                    : '<span style="color:var(--text-secondary);font-size:.8rem;">â€”</span>'
                }
            </td>
            <td>
                <span class="status-badge ${statusClass}">Ativo</span>
            </td>
            <td style="text-align: right; display:flex; gap:.5rem; justify-content:flex-end;">
                <button class="action-btn" title="Editar LiberaÃ§Ãµes" onclick="window.editTenant('${tenant.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
                ${modules.includes('dispatch') ? `
                <button class="action-btn" title="Configurar Despacho / Provisionar Admin" onclick="window.abrirWmsConfig('${tenant.id}')"
                    style="background:rgba(16,185,129,.15);color:#10b981;">
                    <span class="material-icons-round">admin_panel_settings</span>
                </button>` : ''}
                ${modules.includes('wms') ? `
                <button class="action-btn" title="Configurar WMS" onclick="window.abrirWmsConfig('${tenant.id}')"
                    style="background:rgba(99,102,241,.15);color:#6366f1;">
                    <span class="material-icons-round">warehouse</span>
                </button>` : ''}
            </td>
        `;
        tableBody.appendChild(tr);
    });
}



// --- Users Logic ---

function renderUsers() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    platformUsers.forEach(user => {
        const tr = document.createElement('tr');
        const roleClass = user.role === 'admin' ? 'admin' : '';
        tr.innerHTML = `
            <td>
                <div class="cell-info">
                    <span class="cell-title">${user.name}</span>
                    <span class="cell-subtitle">@${user.login}</span>
                </div>
            </td>
            <td><span class="module-tag" style="background:transparent; border:1px solid var(--border);">${user.tenant}</span></td>
            <td><span class="role-badge ${roleClass}">${formatRole(user.role)}</span></td>
            <td style="text-align: right;">
                <button class="action-btn" title="Editar" onclick="window.editUser('${user.login}', '${user.tenant}')">
                    <span class="material-icons-round">edit</span>
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function setupForms() {
    // Tenant Form
    const tenantForm = document.getElementById('tenantForm');
    if (tenantForm) {
        tenantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const idInput = document.getElementById('tenantId');
            const id = idInput.value.trim().toLowerCase();

            if (getAllTenants().find(t => t.id === id)) {
                alert('ID jÃ¡ existe!');
                return;
            }

            const newTenant = {
                id: id,
                name: document.getElementById('tenantName').value,
                cnpj: document.getElementById('tenantCnpj').value,
                adminEmail: document.getElementById('tenantEmail').value,
                modules: Array.from(document.querySelectorAll('input[name="modules"]:checked')).map(cb => cb.value),
                status: 'active',
                isDynamic: true
            };

            dynamicTenants.push(newTenant);
            localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));

            // Provisiona no Firestore: tenants/{id} (necessario para auth.js no login)
            try {
                const db = ParreiraAuth.getDB();
                db.collection('tenants').doc(id).set({
                    nome:      newTenant.name,
                    modulos:   newTenant.modules || [],
                    cnpj:      newTenant.cnpj    || '',
                    email:     newTenant.adminEmail || '',
                    ativo:     true,
                    criadoEm:  new Date().toISOString()
                }, { merge: true }).then(() => {
                    console.log('[Master] Tenant provisionado no Firestore:', id);
                }).catch(e => console.warn('[Master] Firestore tenant:', e.message));
            } catch(e) { console.warn('[Master] Firebase nao disponivel:', e.message); }

            // Cria entrada de licenca automaticamente
            if (window.LicencasManager) {
                window.LicencasManager.registrarTenant(newTenant.id, newTenant.name);
            }

            alert('Cliente cadastrado com sucesso! A licenca foi criada em "Controle de Licencas".');
            closeModal('tenantModal');
            renderTenants();
        });
    }

    // User Form
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const login = document.getElementById('userLogin').value.trim();
            const pass = document.getElementById('userPass').value;
            const tenant = document.getElementById('userTenant').value;

            const newUser = {
                login,
                pass,
                tenant,
                name: document.getElementById('userNameInput').value,
                role: document.getElementById('userRole').value
            };

            // Check if edit mode
            const form = document.getElementById('userForm');
            const isEdit = form.getAttribute('data-edit-mode') === 'true';

            if (isEdit) {
                const editLogin = form.getAttribute('data-edit-login');
                const editTenant = form.getAttribute('data-edit-tenant');
                const idx = platformUsers.findIndex(u => u.login === editLogin && u.tenant === editTenant);
                if (idx !== -1) {
                    platformUsers[idx] = { ...platformUsers[idx], ...newUser };
                }
                form.removeAttribute('data-edit-mode');
                form.removeAttribute('data-edit-login');
                form.removeAttribute('data-edit-tenant');
                document.getElementById('userLogin').removeAttribute('readonly');
            } else {
                if (platformUsers.find(u => u.login === login && u.tenant === tenant)) {
                    alert('UsuÃ¡rio jÃ¡ existe nesta empresa!');
                    return;
                }
                platformUsers.push(newUser);
            }

            localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));
            alert(isEdit ? 'UsuÃ¡rio atualizado com sucesso!' : 'UsuÃ¡rio cadastrado com sucesso!');
            closeModal('userModal');
            renderUsers();
        });
    }
}

function formatModuleName(code) {
    const names = { 'dispatch': 'Despacho', 'erp': 'ERP', 'wms': 'WMS', 'sales-force': 'Vendas', 'master': 'Master', 'erp-consultoria': 'Consultoria', 'wms-coletor': 'WMS Coletor' };
    return names[code] || code.toUpperCase();
}

function formatRole(role) {
    const roles = { 'admin': 'Administrador', 'supervisor': 'Gerente', 'operacional': 'Operacional' };
    return roles[role] || role;
}

// --- Edit Tenant (Module Releases) ---
function editTenant(tenantId) {
    const allTenants = getAllTenants();
    const tenant = allTenants.find(t => t.id === tenantId);
    if (!tenant) {
        alert('Tenant nÃ£o encontrado!');
        return;
    }

    // Fill display
    document.getElementById('editTenantDisplay').value = `${tenant.name} (${tenant.id})`;
    document.getElementById('editTenantIdField').value = tenant.id;

    // Pre-check modules
    const checkboxes = document.querySelectorAll('input[name="editModules"]');
    checkboxes.forEach(cb => {
        cb.checked = (tenant.modules || []).includes(cb.value);
    });

    openModal('editTenantModal');
}

// (editTenantForm listener moved to DOMContentLoaded above)

// --- Edit User ---
function editUser(login, tenant) {
    const user = platformUsers.find(u => u.login === login && u.tenant === tenant);
    if (!user) {
        alert('UsuÃ¡rio nÃ£o encontrado!');
        return;
    }

    // Fill user modal with existing data
    populateTenantSelect();
    document.getElementById('userNameInput').value = user.name || '';
    document.getElementById('userLogin').value = user.login;
    document.getElementById('userPass').value = user.pass || '';
    document.getElementById('userTenant').value = user.tenant;
    document.getElementById('userRole').value = user.role || 'operacional';

    // Mark login as readonly during edit
    document.getElementById('userLogin').setAttribute('readonly', true);

    // Set edit mode flag
    document.getElementById('userForm').setAttribute('data-edit-mode', 'true');
    document.getElementById('userForm').setAttribute('data-edit-login', login);
    document.getElementById('userForm').setAttribute('data-edit-tenant', tenant);

    openModal('userModal');
}

// ============================================================
// PROVISIONING Ã¢â‚¬â€ Admin Master provisiona cada tenant
// Duas seÃ§Ãµes independentes:
//   1) ConfiguraÃ§Ã£o WMS (Maxdata + CNPJs)
//   2) Acesso do Tenant (1 usuÃ¡rio admin para todos os mÃ³dulos)
// ============================================================

window.abrirWmsConfig = async function (tenantId) {
    const old = document.getElementById('prov-panel');
    if (old) old.remove();

    const tenant = getAllTenants().find(t => t.id === tenantId);
    if (!tenant) { alert('Tenant nÃ£o encontrado.'); return; }

    // MÃ³dulos habilitados com nome amigÃ¡vel
    const modNames = { wms:'WMS', dispatch:'Despacho', erp:'ERP', 'sales-force':'Vendas', master:'Master', 'erp-consultoria': 'Consultoria', 'wms-coletor': 'WMS Coletor' };
    const enabledMods = (tenant.modules || []).map(m => modNames[m] || m);

    // Carrega configs existentes do Firestore
    let wmsInt = {}, wmsCfg = {}, tenantAdmin = null;
    try {
        const db = ParreiraAuth.getDB();
        if (db) {
            const [intSnap, cfgSnap, usersSnap] = await Promise.all([
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').get(),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('config').get(),
                db.collection('tenants').doc(tenantId).collection('users').where('role','==','admin').limit(1).get()
            ]);
            if (intSnap.exists)  wmsInt    = intSnap.data();
            if (cfgSnap.exists)  wmsCfg    = cfgSnap.data();
            if (!usersSnap.empty) tenantAdmin = usersSnap.docs[0].data();
        }
    } catch(e) { console.warn('[Prov] Firestore read:', e.message); }

    // Procura admin local se nÃ£o achou no Firestore
    if (!tenantAdmin) {
        tenantAdmin = platformUsers.find(u => u.tenant === tenantId && u.role === 'admin') || null;
    }

    const hasWms = (tenant.modules || []).includes('wms');

    // Ã¢â€â‚¬Ã¢â€â‚¬ painel lateral Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const panel = document.createElement('div');
    panel.id = 'prov-panel';
    panel.style.cssText = [
        'position:fixed;top:0;right:0;width:500px;height:100vh',
        'background:var(--bg-card,#1e293b)',
        'border-left:1px solid var(--border,#334155)',
        'z-index:9999;overflow-y:auto;padding:0',
        'box-shadow:-8px 0 40px rgba(0,0,0,.5)',
        'display:flex;flex-direction:column'
    ].join(';');

    panel.innerHTML = `
    <!-- Header -->
    <div style="padding:1.5rem 1.75rem 1rem;border-bottom:1px solid var(--border,#334155);
        background:var(--bg-dark,#0f172a);position:sticky;top:0;z-index:10;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
                <h2 style="font-size:1.05rem;font-weight:700;margin:0 0 .25rem;">
                    ${tenant.name}
                </h2>
                <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem;">
                    ${enabledMods.map(m => `
                        <span style="font-size:.68rem;padding:.15rem .5rem;border-radius:4px;
                            background:rgba(99,102,241,.18);color:#a5b4fc;font-weight:600;">${m}</span>
                    `).join('')}
                </div>
            </div>
            <button onclick="document.getElementById('prov-panel').remove()"
                style="background:none;border:none;cursor:pointer;color:var(--text-secondary,#94a3b8);margin-top:-.25rem;">
                <span class="material-icons-round" style="font-size:1.4rem;">close</span>
            </button>
        </div>
    </div>

    <!-- Corpo rolÃ¡vel -->
    <div style="padding:1.5rem 1.75rem;display:flex;flex-direction:column;gap:1.75rem;flex:1;">

        <!-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SEÃ‡ÃƒÆ’O 1: ACESSO DO TENANT Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â -->
        <section>
            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.9rem;">
                <span class="material-icons-round" style="font-size:1.2rem;color:#f59e0b;">admin_panel_settings</span>
                <div>
                    <h3 style="font-size:.9rem;font-weight:700;margin:0;">Acesso do Tenant</h3>
                    <p style="font-size:.72rem;color:var(--text-secondary,#94a3b8);margin:.1rem 0 0;">
                        1 usuÃ¡rio administrador Ã¢â‚¬â€ acessa todos os mÃ³dulos liberados
                    </p>
                </div>
            </div>

            ${tenantAdmin ? `
            <!-- Admin jÃ¡ existe -->
            <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);
                border-radius:10px;padding:1rem;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <span class="material-icons-round" style="color:#10b981;font-size:1.6rem;">verified_user</span>
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:.9rem;">${tenantAdmin.name}</div>
                        <div style="font-size:.75rem;color:var(--text-secondary,#94a3b8);font-family:monospace;">@${tenantAdmin.login}</div>
                    </div>
                    <button onclick="window._provEditarAdmin('${tenantId}')"
                        style="background:none;border:1px solid var(--border,#334155);border-radius:6px;
                            padding:.35rem .7rem;cursor:pointer;color:var(--text-secondary,#94a3b8);font-size:.78rem;">
                        Editar
                    </button>
                </div>
                <div style="margin-top:.6rem;padding-top:.6rem;border-top:1px solid rgba(255,255,255,.06);
                    font-size:.72rem;color:var(--text-secondary,#94a3b8);">
                    Ã¢Å“â€œ Acesso habilitado para: <strong>${enabledMods.join(', ')}</strong>
                </div>
            </div>
            <div id="prov-admin-form" style="display:none;">` : `
            <!-- Admin nÃ£o existe ainda -->
            <div id="prov-admin-form">`}
                <div style="background:rgba(255,255,255,.03);border:1px solid var(--border,#334155);
                    border-radius:10px;padding:1rem;display:flex;flex-direction:column;gap:.7rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;">
                        <div>
                            <label class="prov-label">Nome completo</label>
                            <input id="prov-admin-name" type="text"
                                value="${tenantAdmin?.name || ''}" placeholder="Ex: JoÃ£o Silva"
                                class="prov-input">
                        </div>
                        <div>
                            <label class="prov-label">Login</label>
                            <input id="prov-admin-login" type="text"
                                value="${tenantAdmin?.login || ''}" placeholder="Ex: joao.silva"
                                ${tenantAdmin ? 'readonly style="opacity:.6;"' : ''}
                                class="prov-input">
                        </div>
                    </div>
                    <div>
                        <label class="prov-label">Senha</label>
                        <input id="prov-admin-pass" type="text"
                            value="${tenantAdmin?.pass || ''}" placeholder="Senha de acesso"
                            class="prov-input" style="width:100%;box-sizing:border-box;">
                    </div>
                    <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);
                        border-radius:6px;padding:.6rem .75rem;font-size:.75rem;color:#fbbf24;
                        display:flex;align-items:center;gap:.4rem;">
                        <span class="material-icons-round" style="font-size:.95rem;">info</span>
                        Demais usuÃ¡rios (operadores, supervisores) sÃ£o gerenciados dentro do mÃ³dulo.
                    </div>
                    <button onclick="window._provSalvarAdmin('${tenantId}')"
                        style="padding:.6rem 1rem;background:#f59e0b;border:none;color:#0f172a;
                            border-radius:7px;cursor:pointer;font-weight:700;font-size:.85rem;
                            display:flex;align-items:center;justify-content:center;gap:.4rem;align-self:flex-start;">
                        <span class="material-icons-round" style="font-size:1rem;">save</span>
                        Salvar Acesso
                    </button>
                    <div id="prov-admin-feedback" style="font-size:.78rem;min-height:1rem;"></div>
                </div>
            </div>
        </section>

        <!-- Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â SEÃ‡ÃƒÆ’O 2: CONFIGURAÃ‡ÃƒÆ’O WMS Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â -->
        ${hasWms ? `
        <section>
            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.9rem;">
                <span class="material-icons-round" style="font-size:1.2rem;color:#6366f1;">integration_instructions</span>
                <div>
                    <h3 style="font-size:.9rem;font-weight:700;margin:0;">ConfiguraÃ§Ã£o WMS</h3>
                    <p style="font-size:.72rem;color:var(--text-secondary,#94a3b8);margin:.1rem 0 0;">
                        IntegraÃ§Ã£o Maxdata ERP e CNPJs destinatÃ¡rios
                    </p>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:1rem;">

                <!-- Maxdata -->
                <div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);
                    border-radius:10px;padding:1rem;display:flex;flex-direction:column;gap:.7rem;">
                    <div style="font-size:.78rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:.05em;">
                        Maxdata ERP
                    </div>
                    <div>
                        <label class="prov-label">URL Base da API</label>
                        <input id="wms-baseUrl" type="text" value="${wmsInt.baseUrl || ''}"
                            placeholder="http://servidor:porta/v2" class="prov-input"
                            style="width:100%;box-sizing:border-box;">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;">
                        <div>
                            <label class="prov-label">Empresa (empId)</label>
                            <input id="wms-empId" type="number" value="${wmsInt.empId || ''}"
                                placeholder="1" class="prov-input">
                        </div>
                        <div>
                            <label class="prov-label">Conector</label>
                            <select id="wms-connector" class="prov-input">
                                <option value="maxdata" ${(wmsInt.connectorId||'maxdata')==='maxdata'?'selected':''}>Maxdata ERP</option>
                                <option value="rest-api" ${wmsInt.connectorId==='rest-api'?'selected':''}>REST API GenÃ©rica</option>
                                <option value="standalone" ${wmsInt.connectorId==='standalone'?'selected':''}>Standalone</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="prov-label">Terminal</label>
                        <input id="wms-terminal" type="text" value="${wmsInt.terminal || ''}"
                            placeholder="CÃ³digo do terminal no Maxdata Manager"
                            class="prov-input" style="width:100%;box-sizing:border-box;">
                    </div>
                    <div style="display:flex;align-items:center;gap:.6rem;">
                        <button onclick="window.testarWmsConexao('${tenantId}')"
                            style="padding:.45rem .9rem;background:none;border:1px solid #6366f1;color:#6366f1;
                                border-radius:6px;cursor:pointer;font-size:.8rem;display:flex;align-items:center;gap:.35rem;">
                            <span class="material-icons-round" style="font-size:.95rem;">wifi</span>Testar ConexÃ£o
                        </button>
                        <span id="wms-test-result" style="font-size:.78rem;"></span>
                    </div>
                </div>

                <!-- CNPJs -->
                <div style="background:rgba(255,255,255,.03);border:1px solid var(--border,#334155);
                    border-radius:10px;padding:1rem;display:flex;flex-direction:column;gap:.6rem;">
                    <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">
                        CNPJs DestinatÃ¡rios
                    </div>
                    <div style="display:flex;">
                        <input id="wms-cnpj-input" type="text" placeholder="CNPJ Ã¢â‚¬â€ ex: 12.345.678/0001-90"
                            style="flex:1;padding:.55rem .75rem;background:var(--bg-dark,#0f172a);
                                border:1px solid var(--border,#334155);border-radius:6px 0 0 6px;
                                color:inherit;font-size:.82rem;">
                        <button onclick="window._wmsAddCnpj()"
                            style="padding:.55rem .9rem;background:#6366f1;border:none;color:white;
                                border-radius:0 6px 6px 0;cursor:pointer;font-size:.82rem;white-space:nowrap;">
                            + Adicionar
                        </button>
                    </div>
                    <div id="wms-cnpjs-list" style="display:flex;flex-direction:column;gap:.35rem;min-height:36px;"></div>
                </div>

                <!-- BotÃ£o salvar WMS -->
                <button onclick="window.salvarWmsConfig('${tenantId}')"
                    style="padding:.7rem 1rem;background:#6366f1;border:none;color:white;border-radius:8px;
                        cursor:pointer;font-weight:700;font-size:.88rem;display:flex;align-items:center;
                        justify-content:center;gap:.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;">save</span>Salvar ConfiguraÃ§Ã£o WMS
                </button>
                <div id="wms-save-feedback" style="font-size:.78rem;min-height:1rem;text-align:center;"></div>
            </div>
        </section>
        ` : `
        <div style="background:rgba(255,255,255,.03);border:1px dashed var(--border,#334155);
            border-radius:10px;padding:1.25rem;text-align:center;color:var(--text-secondary,#94a3b8);font-size:.82rem;">
            <span class="material-icons-round" style="font-size:1.5rem;display:block;margin-bottom:.4rem;">warehouse</span>
            MÃ³dulo WMS nÃ£o estÃ¡ habilitado para este tenant.<br>
            <a onclick="window.editTenant('${tenantId}')" style="color:#6366f1;cursor:pointer;font-size:.78rem;">
                Clique aqui para habilitar Ã¢â€ â€™
            </a>
        </div>
        `}

    </div><!-- fim corpo -->

    <style>
        .prov-label {
            font-size:.68rem;color:var(--text-secondary,#94a3b8);font-weight:600;
            display:block;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.04em;
        }
        .prov-input {
            width:100%;padding:.55rem .75rem;background:var(--bg-dark,#0f172a);
            border:1px solid var(--border,#334155);border-radius:6px;
            color:inherit;font-size:.83rem;box-sizing:border-box;
        }
        .prov-input:focus { outline:none;border-color:#6366f1; }
    </style>
    `;

    document.body.appendChild(panel);

    // Ã¢â€â‚¬Ã¢â€â‚¬ Inicializa CNPJs Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const cnpjs = wmsCfg.cnpjs || [];
    _wmsCnpjs = [...cnpjs];
    _renderWmsCnpjs();
};

// Mostra o form de ediÃ§Ã£o quando o admin jÃ¡ existe
window._provEditarAdmin = function(tenantId) {
    const form = document.getElementById('prov-admin-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
};

// Salva o admin do tenant - provisiona tenant no Firestore + cria usuario admin
window._provSalvarAdmin = async function(tenantId) {
    const feedback = document.getElementById('prov-admin-feedback');
    const nome  = (document.getElementById('prov-admin-name')?.value  || '').trim();
    const login = (document.getElementById('prov-admin-login')?.value || '').trim().toLowerCase();
    const senha = (document.getElementById('prov-admin-pass')?.value  || '').trim();

    if (!nome || !login || !senha) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent='Preencha nome, login e senha.'; }
        return;
    }
    if (feedback) { feedback.style.color='#94a3b8'; feedback.textContent='Provisionando...'; }

    try {
        const db        = ParreiraAuth.getDB();
        const senhaHash = await ParreiraAuth._hash(senha);
        const tenant    = getAllTenants().find(t => t.id === tenantId);

        // 1. Garante que o documento tenants/{tenantId} existe no Firestore
        //    (auth.js le este doc durante o login para validar empresa + modulos)
        await db.collection('tenants').doc(tenantId).set({
            nome:      tenant?.name || tenantId,
            modulos:   tenant?.modules || [],
            cnpj:      tenant?.cnpj   || '',
            ativo:     true,
            provisionadoEm: new Date().toISOString()
        }, { merge: true });

        // 2. Cria/atualiza users_index e o usuario admin com .set() atomico
        const batch = db.batch();
        batch.set(db.collection('users_index').doc(login), { tenantId });
        batch.set(db.collection('tenants').doc(tenantId).collection('users').doc(login), {
            nome, login, senhaHash, role: 'admin', pin: '', ativo: true,
            atualizadoEm: new Date().toISOString()
        });
        await batch.commit();

        // 3. Escreve tambÃ©m no formato legado (legacy_store/app_users)
        //    para que o mÃ³dulo Despacho consiga autenticar no primeiro login
        //    (dispatch usa plain-text pass lido deste caminho via Utils.Cloud.loadAll)
        const usersLegacy = [{ name: nome, login, pass: senha, role: 'supervisor' }];
        await db.collection('tenants').doc(tenantId)
            .collection('legacy_store').doc('app_users')
            .set({ content: JSON.stringify(usersLegacy) });
        console.log('[Master] legacy_store/app_users provisionado para dispatch:', tenantId);

        if (feedback) { feedback.style.color='#10b981'; feedback.textContent='Acesso de @' + login + ' provisionado!'; }
        renderUsers();
        setTimeout(() => { if (feedback) feedback.textContent = ''; }, 4000);
    } catch(e) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent='Erro: ' + e.message; }
        console.error('[Prov] salvarAdmin:', e);
    }
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helpers CNPJs Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

let _wmsCnpjs = [];
function _renderWmsCnpjs() {
    const el = document.getElementById('wms-cnpjs-list');
    if (!el) return;
    if (_wmsCnpjs.length === 0) {
        el.innerHTML = '<span style="font-size:.76rem;color:var(--text-secondary,#94a3b8);">Nenhum CNPJ cadastrado.</span>';
        return;
    }
    el.innerHTML = _wmsCnpjs.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:.45rem .7rem;background:var(--bg-dark,#0f172a);border-radius:6px;font-size:.8rem;">
            <span style="font-family:monospace;">${c.cnpj}</span>
            <span style="color:var(--text-secondary,#94a3b8);font-size:.73rem;flex:1;margin:0 .6rem;">${c.razaoSocial || ''}</span>
            ${c.principal ? '<span style="background:rgba(16,185,129,.15);color:#10b981;font-size:.68rem;padding:.1rem .4rem;border-radius:4px;">PRINCIPAL</span>' : ''}
            <button onclick="_wmsCnpjs.splice(${i},1);_renderWmsCnpjs()"
                style="background:none;border:none;cursor:pointer;color:#ef4444;margin-left:.4rem;padding:0;">
                <span class="material-icons-round" style="font-size:.95rem;">delete</span>
            </button>
        </div>
    `).join('');
}

window._wmsAddCnpj = function() {
    const input = document.getElementById('wms-cnpj-input');
    const val = (input?.value || '').trim();
    if (!val) return;
    const razao    = prompt('RazÃ£o Social (opcional):') || '';
    const principal = _wmsCnpjs.length === 0;
    _wmsCnpjs.push({ cnpj: val, razaoSocial: razao, principal });
    input.value = '';
    _renderWmsCnpjs();
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Testar conexÃ£o Maxdata Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

window.testarWmsConexao = async function() {
    const result  = document.getElementById('wms-test-result');
    const baseUrl = (document.getElementById('wms-baseUrl')?.value  || '').trim();
    const empId   = Number(document.getElementById('wms-empId')?.value || 0);
    const terminal= (document.getElementById('wms-terminal')?.value || '').trim();
    if (!baseUrl || !empId || !terminal) {
        if (result) { result.style.color='#ef4444'; result.textContent='⚠ Preencha URL, empId e Terminal.'; } return;
    }
    if (result) { result.style.color='#94a3b8'; result.textContent='Testando...'; }
    try {
        const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/auth`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, terminal }),
            signal: AbortSignal.timeout(10000)
        });
        const data = resp.ok ? await resp.json() : null;
        if (result) {
            result.style.color = data?.token ? '#10b981' : '#ef4444';
            result.textContent = data?.token ? 'âœ… Autenticação OK!' : `âš  HTTP ${resp.status}`;
        }
    } catch(e) {
        if (result) { result.style.color='#ef4444'; result.textContent=`âš  ${e.message}`; }
    }
};

// â”€â”€â”€ Salvar configuração WMS (integração + CNPJs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.salvarWmsConfig = async function(tenantId) {
    const feedback  = document.getElementById('wms-save-feedback');
    const baseUrl   = (document.getElementById('wms-baseUrl')?.value   || '').trim();
    const empId     = Number(document.getElementById('wms-empId')?.value || 0);
    const terminal  = (document.getElementById('wms-terminal')?.value  || '').trim();
    const connector = document.getElementById('wms-connector')?.value  || 'maxdata';

    const integrationData = { connectorId: connector, baseUrl, empId, terminal, updatedAt: new Date().toISOString() };
    const configData      = { cnpjs: _wmsCnpjs, updatedAt: new Date().toISOString() };

    if (feedback) { feedback.style.color='#94a3b8'; feedback.textContent='SalvandoÃ¢â‚¬Â¦'; }
    try {
        const db = ParreiraAuth.getDB();
        if (db) {
            await Promise.all([
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').set(integrationData),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('config').set(configData)
            ]);
            if (feedback) { feedback.style.color='#10b981'; feedback.textContent='Ã¢Å“â€¦ ConfiguraÃ§Ã£o WMS salva no Firestore!'; }
        } else {
            const ts = `_${tenantId}`;
            localStorage.setItem('wms_integration_config' + ts, JSON.stringify({ connectorId: connector, connectorConfig: { baseUrl, empId, terminal } }));
            if (feedback) { feedback.style.color='#f59e0b'; feedback.textContent='âš ï¸ Salvo localmente (Firebase indisponÃ­vel).'; }
        }
    } catch(e) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent=`âŒ Erro: ${e.message}`; }
    }
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// renderAmbientes â€” Aba de Ambientes: cards com acesso direto por mÃ³dulo
// Design: baseado no BÃºssola Log (paleta slate, classes .amb-*)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.renderAmbientes = function renderAmbientes() {
    const grid = document.getElementById('ambientesGrid');
    if (!grid) return;

    const PROD = 'https://parreirasistemas.vercel.app';
    const HML  = 'https://parreirasistemas-git-staging-paulo-h-parreiras-projects.vercel.app';

    const MODULE_CONFIG = {
        'dispatch':        { label: 'B\u00FAassola Log',    icon: 'local_shipping',       color: '#3b82f6', prodUrl: (s) => `${PROD}/${s}`,                   hmlUrl: (s) => `${HML}/${s}` },
        'master':          { label: 'Painel Admin',    icon: 'admin_panel_settings', color: '#8b5cf6', prodUrl: ()  => `${PROD}/platform/modules/master/`,hmlUrl: ()  => `${HML}/platform/modules/master/` },
        'erp':             { label: 'ERP',              icon: 'account_balance',      color: '#f59e0b', prodUrl: ()  => `${PROD}/erp`,                    hmlUrl: ()  => `${HML}/erp` },
        'wms':             { label: 'WMS',              icon: 'warehouse',            color: '#10b981', prodUrl: (s) => `${PROD}/wms/${s}`,                    hmlUrl: (s) => `${HML}/wms/${s}` },
        'wms-coletor':     { label: 'WMS Coletor',     icon: 'phone_android',        color: '#06b6d4', prodUrl: (s) => `${PROD}/apk/${s}`,                    hmlUrl: (s) => `${HML}/apk/${s}` },
        'sales-force':     { label: 'For\u00E7a de Vendas', icon: 'storefront',       color: '#ec4899', prodUrl: ()  => `${PROD}/sales`,                  hmlUrl: ()  => `${HML}/sales` },
        'erp-consultoria': { label: 'Consultoria',     icon: 'savings',              color: '#14b8a6', prodUrl: ()  => PROD + '/erp-consultoria',             hmlUrl: ()  => HML + '/erp-consultoria_hml' },
    };

    const allTenants  = getAllTenants();
    const prodTenants = allTenants.filter(t => !t.id.endsWith('_hml'));
    const active      = prodTenants.filter(t => t.status === 'active');

    const el = (id) => document.getElementById(id);
    if (el('amb-stat-total'))  el('amb-stat-total').textContent  = prodTenants.length;
    if (el('amb-stat-active')) el('amb-stat-active').textContent = active.length;
    if (el('amb-stat-hml'))    el('amb-stat-hml').textContent    = active.length;

    if (!prodTenants.length) {
        grid.innerHTML = '<div class="empty-state"><span class="material-icons-round" style="font-size:2.5rem;color:var(--text-secondary);margin-bottom:.5rem;">cloud_off</span><p>Nenhum cliente encontrado.</p></div>';
        return;
    }

    grid.innerHTML = prodTenants.map(t => {
        const slug    = t.slug || t.id;
        const hmlSlug = `${slug}_hml`;
        const status  = t.status === 'active' ? 'active' : t.status === 'suspended' ? 'suspended' : 'inactive';
        const statusLabel = { active: 'Ativo', suspended: 'Suspenso', inactive: 'Inativo' }[status];
        const modules = t.modules || [];

        const moduleRows = modules.map(modId => {
            const cfg = MODULE_CONFIG[modId];
            if (!cfg) return '';
            const pUrl = cfg.prodUrl(slug);
            const hUrl = cfg.hmlUrl(hmlSlug);
            return `
            <div class="amb-module-row">
                <div class="amb-mod-label">
                    <span class="material-icons-round amb-mod-icon" style="color:${cfg.color};">${cfg.icon}</span>
                    ${cfg.label}
                </div>
                <div class="amb-mod-actions">
                    <a href="${pUrl}" target="_blank" class="amb-btn amb-btn-prod" title="Abrir em Produ\u00E7\u00E3o">
                        <span class="material-icons-round">open_in_new</span> PROD
                    </a>
                    <a href="${hUrl}" target="_blank" class="amb-btn amb-btn-hml" title="Abrir em Homologa\u00E7\u00E3o">
                        <span class="material-icons-round">science</span> HML
                    </a>
                    <button class="amb-btn-copy" onclick="navigator.clipboard.writeText('${pUrl}').then(()=>showToast('\u2705 URL copiada!'))" title="Copiar URL de Produ\u00E7\u00E3o">
                        <span class="material-icons-round">content_copy</span>
                    </button>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="amb-tenant-card">
            <div class="amb-card-header">
                <div>
                    <div class="amb-card-name">${t.name || t.id}</div>
                    <div class="amb-card-slug">
                        <span class="material-icons-round">link</span>
                        ${slug}${t.cnpj ? ` <span style="opacity:.4;margin-left:.3rem;">\u00B7 ${t.cnpj}</span>` : ''}
                    </div>
                </div>
                <div class="amb-card-meta">
                    <span class="amb-status-badge amb-status-${status}">${statusLabel}</span>
                    <span class="amb-mod-count">${modules.length} m\u00F3dulo${modules.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="amb-modules-list">
                ${moduleRows || '<p style="font-size:.8rem;color:var(--text-secondary);padding:.25rem .5rem;">Nenhum m\u00F3dulo configurado</p>'}
            </div>
        </div>`;
    }).join('');
};

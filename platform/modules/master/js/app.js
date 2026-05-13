// app.js — Painel Admin | Parreira Sistemas
// (usa window.mockTenants definido em data.js)
const mockTenants = window.mockTenants || [];


// State
let dynamicTenants = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');
let platformUsers  = JSON.parse(localStorage.getItem('platform_users_registry')  || '[]');

// SEED: garante que os tenants base do sistema existam em dynamicTenants (source of truth única)
;(function seedAndDedup() {
    // Seed mockTenants que ainda não existem em dynamicTenants
    mockTenants.forEach(mock => {
        if (!dynamicTenants.find(t => t.id === mock.id)) {
            dynamicTenants.push({ ...mock, isDynamic: false });
        }
    });
    // Dedup: mantém a última entrada de cada ID
    const seen = new Map();
    dynamicTenants.forEach(t => seen.set(t.id, t));
    dynamicTenants = [...seen.values()];
    localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));
})();

// --- SECURITY UPDATE (Ensure Owner Access, Remove Generic Admin) ---
const SECURITY_KEY = 'sec_v1_paulo_only';
if (!localStorage.getItem(SECURITY_KEY)) {
    console.log('🔒 Aplicando atualização de segurança...');

    // 1. Remove insecure 'admin'
    platformUsers = platformUsers.filter(u => u.login !== 'admin');

    // 2. Add/Update Owner 'paulo'
    const ownerUser = {
        login: 'paulo',
        pass: 'master@2026',
        name: 'Paulo Parreira',
        tenant: 'parreira',
        role: 'admin'
    };

    // Remove existing 'paulo' or 'parreira' (legacy owner) to avoid duplicates
    platformUsers = platformUsers.filter(u => u.login !== 'paulo' && u.login !== 'parreira');

    // Add new definitive owner
    platformUsers.unshift(ownerUser);

    localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));
    localStorage.setItem(SECURITY_KEY, 'true');
    console.log('🔒 Usuário Admin configurado: paulo / master@2026');
}

// --- Fallback Seeds ---
if (platformUsers.length === 0) {
    platformUsers = [
        { login: 'paulo', pass: 'master@2026', name: 'Paulo Parreira', tenant: 'parreira', role: 'admin' },
        { login: 'alessandro', pass: '123456', name: 'Alessandro', tenant: 'centralpecas', role: 'supervisor' },
        { login: 'fernando', pass: '123456', name: 'Fernando Masson', tenant: 'centralpecas', role: 'supervisor' }
    ];
    localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));
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

    // Listener do form de editar liberações de módulos
    const editTenantForm = document.getElementById('editTenantForm');
    if (editTenantForm) {
        editTenantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const tenantId  = document.getElementById('editTenantIdField').value;
            const newModules = Array.from(
                document.querySelectorAll('input[name="editModules"]:checked')
            ).map(cb => cb.value);

            const existingIdx = dynamicTenants.findIndex(t => t.id === tenantId);
            if (existingIdx >= 0) {
                dynamicTenants[existingIdx] = { ...dynamicTenants[existingIdx], modules: newModules };
            } else {
                const base = getAllTenants().find(t => t.id === tenantId);
                if (base) dynamicTenants.push({ ...base, modules: newModules, isDynamic: true });
            }
            localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));
            alert('Libeções atualizadas com sucesso!');
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
    const navIndex = { tenants: 0, users: 1, licencas: 2 }[viewName] ?? 0;
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[navIndex]) navItems[navIndex].classList.add('active');

    // Loaders
    if (viewName === 'licencas' && window.LicencasManager) {
        window.LicencasManager.renderView();
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

// Única fonte de verdade — tudo está em dynamicTenants
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

    getAllTenants().forEach(tenant => {
        const tr = document.createElement('tr');
        const isDynamic = tenant.isDynamic;
        const statusClass = tenant.status === 'active' ? 'active' : 'inactive';

        tr.innerHTML = `
            <td>
                <div class="cell-info">
                    <span class="cell-title">${tenant.name} ${isDynamic ? '<span style="font-size:0.65em; background:var(--primary-color); color:white; padding:1px 5px; border-radius:4px; vertical-align:middle;">NOVO</span>' : ''}</span>
                    <span class="cell-subtitle">ID: ${tenant.id}</span>
                </div>
            </td>
            <td><span style="font-family:monospace; color:var(--text-secondary);">${tenant.cnpj || '-'}</span></td>
            <td>
                ${tenant.modules.map(mod => `<span class="module-tag">${formatModuleName(mod)}</span>`).join('')}
            </td>
            <td>
                <span class="status-badge ${statusClass}">Ativo</span>
            </td>
            <td style="text-align: right; display:flex; gap:.5rem; justify-content:flex-end;">
                <button class="action-btn" title="Editar Liberações" onclick="window.editTenant('${tenant.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
                ${(tenant.modules || []).includes('wms') ? `
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
                alert('ID já existe!');
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

            // Cria entrada de licença automaticamente
            if (window.LicencasManager) {
                window.LicencasManager.registrarTenant(newTenant.id, newTenant.name);
            }

            alert('Cliente cadastrado com sucesso! A licença foi criada em "Controle de Licenças".');
            closeModal('tenantModal'); // Revert to Modal Close
            renderTenants(); // Refresh Table
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
                    alert('Usuário já existe nesta empresa!');
                    return;
                }
                platformUsers.push(newUser);
            }

            localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));
            alert(isEdit ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!');
            closeModal('userModal');
            renderUsers();
        });
    }
}

function formatModuleName(code) {
    const names = { 'dispatch': 'Despacho', 'erp': 'ERP', 'wms': 'WMS', 'sales-force': 'Vendas', 'master': 'Master' };
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
        alert('Tenant não encontrado!');
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
        alert('Usuário não encontrado!');
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

// =============================================================
// WMS PROVISIONING — Admin Master configura WMS de cada tenant
// =============================================================

window.abrirWmsConfig = async function (tenantId) {
    // Remove painel anterior se existir
    const old = document.getElementById('wms-provisioning-panel');
    if (old) old.remove();

    const tenant = getAllTenants().find(t => t.id === tenantId);
    if (!tenant) { alert('Tenant não encontrado.'); return; }

    // Carrega config existente do Firestore
    let wmsInt = {}, wmsCfg = {};
    try {
        if (typeof firebase !== 'undefined') {
            const db = firebase.firestore();
            const [intSnap, cfgSnap] = await Promise.all([
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').get(),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('config').get()
            ]);
            if (intSnap.exists) wmsInt = intSnap.data();
            if (cfgSnap.exists) wmsCfg = cfgSnap.data();
        }
    } catch(e) { console.warn('Firestore read:', e.message); }

    // Cria painel lateral
    const panel = document.createElement('div');
    panel.id = 'wms-provisioning-panel';
    panel.style.cssText = `position:fixed;top:0;right:0;width:480px;height:100vh;background:var(--bg-card,#1e293b);
        border-left:1px solid var(--border,#334155);z-index:9999;overflow-y:auto;padding:2rem;
        box-shadow:-8px 0 32px rgba(0,0,0,.4);display:flex;flex-direction:column;gap:1.5rem;`;

    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <span class="material-icons-round" style="color:#6366f1;font-size:1.5rem;">warehouse</span>
                    <h2 style="font-size:1.1rem;font-weight:700;margin:0;">Configurar WMS</h2>
                </div>
                <p style="font-size:.78rem;color:var(--text-secondary,#94a3b8);margin:.25rem 0 0 2.3rem;">${tenant.name} (${tenantId})</p>
            </div>
            <button onclick="document.getElementById('wms-provisioning-panel').remove()"
                style="background:none;border:none;cursor:pointer;color:var(--text-secondary,#94a3b8);">
                <span class="material-icons-round" style="font-size:1.5rem;">close</span>
            </button>
        </div>

        <!-- Maxdata Integration -->
        <div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:1.25rem;">
            <h3 style="font-size:.85rem;font-weight:700;margin:0 0 1rem;color:#6366f1;
                display:flex;align-items:center;gap:.5rem;">
                <span class="material-icons-round" style="font-size:1rem;">integration_instructions</span>
                Integração Maxdata ERP
            </h3>
            <div style="display:flex;flex-direction:column;gap:.75rem;">
                <div>
                    <label style="font-size:.72rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.3rem;text-transform:uppercase;">URL Base da API</label>
                    <input id="wms-baseUrl" type="text" value="${wmsInt.baseUrl || ''}"
                        placeholder="http://servidor:porta/v2"
                        style="width:100%;padding:.6rem .8rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.85rem;box-sizing:border-box;">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                    <div>
                        <label style="font-size:.72rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.3rem;text-transform:uppercase;">Empresa (empId)</label>
                        <input id="wms-empId" type="number" value="${wmsInt.empId || ''}" placeholder="1"
                            style="width:100%;padding:.6rem .8rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.85rem;box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:.72rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.3rem;text-transform:uppercase;">Conector</label>
                        <select id="wms-connector" style="width:100%;padding:.6rem .8rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.85rem;box-sizing:border-box;">
                            <option value="maxdata" ${(wmsInt.connectorId||'maxdata')==='maxdata'?'selected':''}>Maxdata ERP</option>
                            <option value="rest-api" ${wmsInt.connectorId==='rest-api'?'selected':''}>REST API Genérica</option>
                            <option value="standalone" ${wmsInt.connectorId==='standalone'?'selected':''}>Standalone</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label style="font-size:.72rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.3rem;text-transform:uppercase;">Terminal (código)</label>
                    <input id="wms-terminal" type="text" value="${wmsInt.terminal || ''}"
                        placeholder="Código do terminal cadastrado no Maxdata Manager"
                        style="width:100%;padding:.6rem .8rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.85rem;box-sizing:border-box;">
                </div>
                <div style="display:flex;gap:.5rem;align-items:center;">
                    <button onclick="window.testarWmsConexao('${tenantId}')"
                        style="padding:.5rem 1rem;background:none;border:1px solid #6366f1;color:#6366f1;border-radius:6px;cursor:pointer;font-size:.82rem;display:flex;align-items:center;gap:.4rem;">
                        <span class="material-icons-round" style="font-size:1rem;">wifi</span> Testar Conexão
                    </button>
                    <span id="wms-test-result" style="font-size:.78rem;"></span>
                </div>
            </div>
        </div>

        <!-- CNPJs -->
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border,#334155);border-radius:10px;padding:1.25rem;">
            <h3 style="font-size:.85rem;font-weight:700;margin:0 0 1rem;display:flex;align-items:center;gap:.5rem;">
                <span class="material-icons-round" style="font-size:1rem;">business</span>
                CNPJs Destinatários
            </h3>
            <div style="margin-bottom:.75rem;">
                <input id="wms-cnpj-input" type="text" placeholder="CNPJ — ex: 12.345.678/0001-90"
                    style="width:calc(100% - 90px);padding:.6rem .8rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px 0 0 6px;color:inherit;font-size:.85rem;box-sizing:border-box;">
                <button onclick="window._wmsAddCnpj()"
                    style="width:82px;padding:.6rem;background:#6366f1;border:none;color:white;border-radius:0 6px 6px 0;cursor:pointer;font-size:.82rem;">
                    + Adicionar
                </button>
            </div>
            <div id="wms-cnpjs-list" style="display:flex;flex-direction:column;gap:.4rem;min-height:40px;"></div>
        </div>

        <!-- Usuários WMS -->
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border,#334155);border-radius:10px;padding:1.25rem;">
            <h3 style="font-size:.85rem;font-weight:700;margin:0 0 1rem;display:flex;align-items:center;gap:.5rem;">
                <span class="material-icons-round" style="font-size:1rem;">group</span>
                Usuários do WMS
            </h3>
            <!-- Lista de usuários existentes -->
            <div id="wms-users-list" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;min-height:32px;"></div>
            <!-- Formulário de novo usuário -->
            <details style="border:1px solid var(--border,#334155);border-radius:8px;overflow:hidden;">
                <summary style="padding:.6rem .75rem;cursor:pointer;font-size:.82rem;font-weight:600;
                    background:rgba(255,255,255,.03);list-style:none;display:flex;align-items:center;gap:.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;color:#6366f1;">person_add</span>
                    Adicionar novo usuário
                </summary>
                <div style="padding:.9rem;display:flex;flex-direction:column;gap:.6rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
                        <div>
                            <label style="font-size:.68rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.25rem;text-transform:uppercase;">Nome completo</label>
                            <input id="wms-user-name" type="text" placeholder="Ex: João Silva"
                                style="width:100%;padding:.5rem .7rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.82rem;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:.68rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.25rem;text-transform:uppercase;">Login</label>
                            <input id="wms-user-login" type="text" placeholder="Ex: joao.silva"
                                style="width:100%;padding:.5rem .7rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.82rem;box-sizing:border-box;">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;">
                        <div>
                            <label style="font-size:.68rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.25rem;text-transform:uppercase;">Senha inicial</label>
                            <input id="wms-user-pass" type="text" placeholder="Senha"
                                style="width:100%;padding:.5rem .7rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.82rem;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="font-size:.68rem;color:var(--text-secondary,#94a3b8);font-weight:600;display:block;margin-bottom:.25rem;text-transform:uppercase;">Perfil</label>
                            <select id="wms-user-role"
                                style="width:100%;padding:.5rem .7rem;background:var(--bg-dark,#0f172a);border:1px solid var(--border,#334155);border-radius:6px;color:inherit;font-size:.82rem;box-sizing:border-box;">
                                <option value="admin">Admin WMS</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="operacional" selected>Operacional</option>
                            </select>
                        </div>
                    </div>
                    <button onclick="window._wmsAdicionarUsuario('${tenantId}')"
                        style="padding:.5rem 1rem;background:#6366f1;border:none;color:white;border-radius:6px;cursor:pointer;font-size:.82rem;font-weight:600;align-self:flex-start;">
                        + Criar Usuário
                    </button>
                    <div id="wms-user-feedback" style="font-size:.75rem;min-height:1rem;"></div>
                </div>
            </details>
        </div>

        <!-- Ações -->
        <div style="display:flex;gap:.75rem;margin-top:auto;">
            <button onclick="window.salvarWmsConfig('${tenantId}')"
                style="flex:1;padding:.75rem;background:#6366f1;border:none;color:white;border-radius:8px;cursor:pointer;font-weight:600;font-size:.9rem;display:flex;align-items:center;justify-content:center;gap:.5rem;">
                <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar Integração
            </button>
            <button onclick="document.getElementById('wms-provisioning-panel').remove()"
                style="padding:.75rem 1.25rem;background:none;border:1px solid var(--border,#334155);color:var(--text-secondary,#94a3b8);border-radius:8px;cursor:pointer;font-size:.9rem;">
                Fechar
            </button>
        </div>
        <div id="wms-save-feedback" style="font-size:.8rem;min-height:1rem;text-align:center;"></div>
    `;

    document.body.appendChild(panel);

    // Carrega CNPJs existentes
    const cnpjs = wmsCfg.cnpjs || [];
    _wmsCnpjs = [...cnpjs];
    _renderWmsCnpjs();

    // Carrega usuários existentes do tenant
    _renderWmsUsuarios(tenantId);
};

let _wmsCnpjs = [];
function _renderWmsCnpjs() {
    const el = document.getElementById('wms-cnpjs-list');
    if (!el) return;
    if (_wmsCnpjs.length === 0) {
        el.innerHTML = '<span style="font-size:.78rem;color:var(--text-secondary,#94a3b8);">Nenhum CNPJ cadastrado.</span>';
        return;
    }
    el.innerHTML = _wmsCnpjs.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .75rem;
            background:var(--bg-dark,#0f172a);border-radius:6px;font-size:.82rem;">
            <span style="font-family:monospace;">${c.cnpj}</span>
            <span style="color:var(--text-secondary,#94a3b8);font-size:.75rem;flex:1;margin-left:.75rem;">${c.razaoSocial || ''}</span>
            ${c.principal ? '<span style="background:rgba(16,185,129,.15);color:#10b981;font-size:.7rem;padding:.1rem .4rem;border-radius:4px;">PRINCIPAL</span>' : ''}
            <button onclick="_wmsCnpjs.splice(${i},1);_renderWmsCnpjs()"
                style="background:none;border:none;cursor:pointer;color:#ef4444;margin-left:.5rem;padding:0;">
                <span class="material-icons-round" style="font-size:1rem;">delete</span>
            </button>
        </div>
    `).join('');
}

window._wmsAddCnpj = function() {
    const input = document.getElementById('wms-cnpj-input');
    const val = input.value.trim();
    if (!val) return;
    const razao = prompt('Razão Social (opcional):') || '';
    const principal = _wmsCnpjs.length === 0;
    _wmsCnpjs.push({ cnpj: val, razaoSocial: razao, principal });
    input.value = '';
    _renderWmsCnpjs();
};

window.testarWmsConexao = async function(tenantId) {
    const result = document.getElementById('wms-test-result');
    const baseUrl  = (document.getElementById('wms-baseUrl')?.value  || '').trim();
    const empId    = Number(document.getElementById('wms-empId')?.value  || 0);
    const terminal = (document.getElementById('wms-terminal')?.value || '').trim();
    if (!baseUrl || !empId || !terminal) {
        if (result) { result.style.color='#ef4444'; result.textContent='❌ Preencha URL, empId e Terminal.'; } return;
    }
    if (result) { result.style.color='#94a3b8'; result.textContent='Testando...'; }
    try {
        const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, terminal }),
            signal: AbortSignal.timeout(10000)
        });
        const data = resp.ok ? await resp.json() : null;
        if (data?.token) {
            if (result) { result.style.color='#10b981'; result.textContent='✅ Autenticação Maxdata OK!'; }
        } else {
            if (result) { result.style.color='#ef4444'; result.textContent=`❌ HTTP ${resp.status}`; }
        }
    } catch(e) {
        if (result) { result.style.color='#ef4444'; result.textContent=`❌ ${e.message}`; }
    }
};

window.salvarWmsConfig = async function(tenantId) {
    const feedback = document.getElementById('wms-save-feedback');
    const baseUrl   = (document.getElementById('wms-baseUrl')?.value   || '').trim();
    const empId     = Number(document.getElementById('wms-empId')?.value  || 0);
    const terminal  = (document.getElementById('wms-terminal')?.value  || '').trim();
    const connector = document.getElementById('wms-connector')?.value  || 'maxdata';

    const integrationData = { connectorId: connector, baseUrl, empId, terminal, updatedAt: new Date().toISOString() };
    const configData      = { cnpjs: _wmsCnpjs, updatedAt: new Date().toISOString() };

    if (feedback) { feedback.style.color='#94a3b8'; feedback.textContent='Salvando...'; }

    try {
        if (typeof firebase !== 'undefined') {
            const db = firebase.firestore();
            await Promise.all([
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').set(integrationData),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('config').set(configData)
            ]);
            if (feedback) { feedback.style.color='#10b981'; feedback.textContent='✅ Salvo no Firestore com sucesso!'; }
        } else {
            // Fallback localStorage (dev sem Firebase)
            const ts = `_${tenantId}`;
            localStorage.setItem('wms_integration_config' + ts, JSON.stringify({ connectorId: connector, connectorConfig: { baseUrl, empId, terminal } }));
            if (feedback) { feedback.style.color='#f59e0b'; feedback.textContent='⚠️ Salvo localmente (Firebase indisponível).'; }
        }
    } catch(e) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent=`❌ Erro: ${e.message}`; }
    }
};

// ─── Usuários WMS por tenant ─────────────────────────────────────────────────

function _renderWmsUsuarios(tenantId) {
    const el = document.getElementById('wms-users-list');
    if (!el) return;

    // Filtra usuários do platformUsers para este tenant
    const tenantUsers = platformUsers.filter(u => u.tenant === tenantId);

    if (tenantUsers.length === 0) {
        el.innerHTML = `<span style="font-size:.78rem;color:var(--text-secondary,#94a3b8);">
            Nenhum usuário cadastrado para este tenant.</span>`;
        return;
    }

    const roleLabel = { admin: 'Admin WMS', supervisor: 'Supervisor', operacional: 'Operacional' };
    const roleColor = { admin: '#6366f1', supervisor: '#f59e0b', operacional: '#10b981' };

    el.innerHTML = tenantUsers.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:.5rem .75rem;background:var(--bg-dark,#0f172a);border-radius:6px;">
            <div style="display:flex;flex-direction:column;gap:.1rem;">
                <span style="font-size:.82rem;font-weight:600;">${u.name}</span>
                <span style="font-size:.72rem;color:var(--text-secondary,#94a3b8);font-family:monospace;">@${u.login}</span>
            </div>
            <span style="font-size:.72rem;padding:.15rem .5rem;border-radius:4px;
                background:rgba(99,102,241,.12);color:${roleColor[u.role] || '#94a3b8'};">
                ${roleLabel[u.role] || u.role}
            </span>
        </div>
    `).join('');
}

window._wmsAdicionarUsuario = async function(tenantId) {
    const feedback = document.getElementById('wms-user-feedback');
    const name  = (document.getElementById('wms-user-name')?.value  || '').trim();
    const login = (document.getElementById('wms-user-login')?.value || '').trim().toLowerCase();
    const pass  = (document.getElementById('wms-user-pass')?.value  || '').trim();
    const role  = document.getElementById('wms-user-role')?.value   || 'operacional';

    if (!name || !login || !pass) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent='❌ Preencha nome, login e senha.'; }
        return;
    }
    if (platformUsers.find(u => u.login === login && u.tenant === tenantId)) {
        if (feedback) { feedback.style.color='#ef4444'; feedback.textContent=`❌ Login "@${login}" já existe neste tenant.`; }
        return;
    }

    const novoUsuario = { login, pass, name, tenant: tenantId, role, modulo: 'wms', criadoEm: new Date().toISOString() };

    // 1. Salva em platformUsers (localStorage)
    platformUsers.push(novoUsuario);
    localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));

    // 2. Salva no Firestore: tenants/{tenantId}/users/{login}
    try {
        if (typeof firebase !== 'undefined') {
            await firebase.firestore()
                .collection('tenants').doc(tenantId)
                .collection('users').doc(login)
                .set({ ...novoUsuario, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        }
    } catch(e) {
        console.warn('[WMS] Firestore user save:', e.message);
    }

    if (feedback) { feedback.style.color='#10b981'; feedback.textContent=`✅ Usuário @${login} criado com sucesso!`; }

    // Limpa o formulário e atualiza a lista
    document.getElementById('wms-user-name').value  = '';
    document.getElementById('wms-user-login').value = '';
    document.getElementById('wms-user-pass').value  = '';
    setTimeout(() => { if (feedback) feedback.textContent = ''; }, 3000);

    _renderWmsUsuarios(tenantId);
    renderUsers(); // atualiza a tabela principal de usuários do master admin
};

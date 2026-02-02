import { mockTenants } from './data.js';

// State
let dynamicTenants = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');
let platformUsers = JSON.parse(localStorage.getItem('platform_users_registry') || '[]');

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
    // Basic init
    renderTenants();
    renderUsers();
    setupForms();
    loadVersion();

    // NOTE: Modal events are handled via inline onclick="window.openModal(...)" 
    // for maximum reliability after module loading issues.
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
    document.getElementById(`view-${viewName}`).style.display = 'block';

    // Active Nav Item
    const navIndex = viewName === 'tenants' ? 0 : 1;
    document.querySelectorAll('.nav-item')[navIndex].classList.add('active');
};

// Modal Control
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // Refresh selects if needed
        if (modalId === 'userModal') {
            populateTenantSelect();
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        const form = modal.querySelector('form');
        if (form) form.reset();
    }
}

function getAllTenants() {
    return [...mockTenants, ...dynamicTenants];
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

// Global exposure for potential inline usage (backup)
window.openModal = openModal;
window.closeModal = closeModal;

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
            <td style="text-align: right;">
                <button class="action-btn" title="Editar" onclick="alert('Editar: ${tenant.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
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
                <button class="action-btn" title="Editar">
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

            // Success Feedback
            alert('Cliente cadastrado com sucesso!');
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

            if (platformUsers.find(u => u.login === login && u.tenant === tenant)) {
                alert('Usuário já existe nesta empresa!');
                return;
            }

            const newUser = {
                login,
                pass,
                tenant,
                name: document.getElementById('userNameInput').value,
                role: document.getElementById('userRole').value
            };

            platformUsers.push(newUser);
            localStorage.setItem('platform_users_registry', JSON.stringify(platformUsers));
            alert('Usuário cadastrado com sucesso!');
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

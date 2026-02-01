import { mockTenants } from './data.js';

// State: Dynamic Tenants from LocalStorage
let dynamicTenants = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');

document.addEventListener('DOMContentLoaded', () => {
    renderTenants();
    setupForm();
});

// Window Exports for HTML
window.openModal = () => {
    const modal = document.getElementById('tenantModal');
    if (modal) modal.classList.add('active');
};

window.closeModal = () => {
    const modal = document.getElementById('tenantModal');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('tenantForm').reset();
    }
};

function getAllTenants() {
    return [...mockTenants, ...dynamicTenants];
}

function renderTenants() {
    const tableBody = document.getElementById('tenantsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    getAllTenants().forEach(tenant => {
        const tr = document.createElement('tr');
        const isDynamic = tenant.isDynamic;

        // Determine Status Style
        const statusClass = tenant.status === 'active' ? 'active' : 'inactive';
        const statusLabel = tenant.status === 'active' ? 'Ativo' : 'Pendente';

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500; display:flex; align-items:center; gap:6px;">
                    ${tenant.name} 
                    ${isDynamic ? '<span style="font-size:0.65em; background:var(--primary-color); color:white; padding:2px 6px; border-radius:4px;">NOVO</span>' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${tenant.id} | ${tenant.adminEmail || '-'}</div>
            </td>
            <td>${tenant.cnpj || '-'}</td>
            <td>
                ${tenant.modules.map(mod => `<span class="module-tag">${formatModuleName(mod)}</span>`).join('')}
            </td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${statusLabel}
                </span>
            </td>
            <td>
                <button class="action-btn" title="Editar" onclick="alert('Editar: ${tenant.id}')">
                    <span class="material-icons-round" style="font-size: 18px;">edit</span>
                </button>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

function setupForm() {
    const form = document.getElementById('tenantForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const idInput = document.getElementById('tenantId');
        const id = idInput.value.trim().toLowerCase();

        // Validation
        if (!/^[a-z0-9]+$/.test(id)) {
            alert('ID da Empresa inválido. Use apenas letras minúsculas e números, sem espaços.');
            return;
        }

        if (getAllTenants().find(t => t.id === id)) {
            alert('Este ID de Empresa já está em uso!');
            return;
        }

        const newTenant = {
            id: id,
            name: document.getElementById('tenantName').value,
            cnpj: document.getElementById('tenantCnpj').value,
            adminEmail: document.getElementById('tenantEmail').value,
            modules: Array.from(document.querySelectorAll('input[name="modules"]:checked')).map(cb => cb.value),
            status: 'active',
            createdAt: new Date().toISOString().split('T')[0],
            isDynamic: true
        };

        // Save
        dynamicTenants.push(newTenant);
        localStorage.setItem('platform_tenants_registry', JSON.stringify(dynamicTenants));

        // Create Default Admin User for this Tenant (Optional but helpful)
        // We can't write to 'app_users' here easily because it might overwrite current session users if keys collide
        // But the Login logic allows 'admin'/'admin' fallback if tenant is valid. So no need to force 'app_users'.

        alert('Cliente cadastrado com sucesso! \n\nLogin liberado imediatamente.');
        window.closeModal();
        renderTenants();
    });
}

function formatModuleName(code) {
    const names = {
        'dispatch': 'Despacho',
        'erp': 'ERP',
        'wms': 'WMS',
        'sales-force': 'Vendas',
        'master': 'Master'
    };
    return names[code] || code.toUpperCase();
}

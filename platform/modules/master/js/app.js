import { mockTenants } from './data.js';

document.addEventListener('DOMContentLoaded', () => {
    renderTenants();
});

function renderTenants() {
    const tableBody = document.getElementById('tenantsTableBody');
    tableBody.innerHTML = '';

    mockTenants.forEach(tenant => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${tenant.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${tenant.adminEmail}</div>
            </td>
            <td>${tenant.cnpj}</td>
            <td>
                ${tenant.modules.map(mod => `<span class="module-tag">${formatModuleName(mod)}</span>`).join('')}
            </td>
            <td>
                <span class="status-badge ${tenant.status}">
                    ${tenant.status === 'active' ? 'Ativo' : 'Pendente'}
                </span>
            </td>
            <td>
                <button class="action-btn" title="Editar">
                    <span class="material-icons-round" style="font-size: 18px;">edit</span>
                </button>
                <button class="action-btn" title="Acessar como Admin">
                    <span class="material-icons-round" style="font-size: 18px;">login</span>
                </button>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

function formatModuleName(code) {
    const names = {
        'dispatch': 'Despacho',
        'erp': 'ERP',
        'wms': 'WMS',
        'sales-force': 'Vendas'
    };
    return names[code] || code.toUpperCase();
}

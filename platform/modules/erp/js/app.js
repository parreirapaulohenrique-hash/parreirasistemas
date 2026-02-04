// Parreira ERP Core Logic

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Parreira ERP Inicializado');

    // Load Version
    fetch('version.json?v=' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            const versionEl = document.getElementById('systemVersion');
            if (versionEl) {
                versionEl.textContent = `v${data.version} • ${data.date}`;
                versionEl.title = `Build: ${data.build} | ${data.last_change}`;
            }
        })
        .catch(err => console.error('Error loading version:', err));

    // Check Auth/Tenant
    const user = JSON.parse(localStorage.getItem('platform_user_logged'));
    if (!user) {
        // window.location.href = '../../index.html'; // Uncomment in prod
    } else {
        document.getElementById('userName').textContent = user.name || 'Usuário';
        document.getElementById('userTenant').textContent = user.tenant || 'Tenant';
    }

    // Default View
    switchView('dashboard');
});



// Toggle Sidebar Submenus
window.toggleSubmenu = function (id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = (el.style.display === 'flex' || el.style.display === 'block') ? 'none' : 'flex';
    }
}

// Generic Modal Open/Close
window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';

        // Render grids for cadastros modals
        if (modalId === 'finGroupModal' && typeof renderGruposGrid === 'function') {
            renderGruposGrid();
        }
    }
}

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Event delegation for modal buttons - handles clicks that might be blocked
document.addEventListener('click', function (e) {
    // Handle save button clicks
    if (e.target.id === 'btnSaveGroup' || e.target.closest('#btnSaveGroup')) {
        alert('Grupo salvo!');
        closeModal('finGroupModal');
    }
}, true); // Use capture phase to get events before they're blocked

// Navigation
window.switchView = (viewName) => {
    // Hide all views
    document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');

    // Show selected
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.style.display = 'block';

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Find link with matching onclick (simple heuristic for now)
    const link = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick')?.includes(viewName));
    if (link) link.classList.add('active');

    // Update Header
    const titles = {
        'dashboard': 'Visão Geral',
        'products': 'Gestão de Produtos',
        'entities': 'Gestão de Clientes',
        'suppliers': 'Gestão de Fornecedores',
        'employees': 'Gestão de Funcionários',
        'sales': 'Vendas',
        'purchases': 'Compras',
        'finance': 'Financeiro',
        'fiscal': 'Fiscal',
        'groups': 'Gestão de Grupos',
        'accountPlans': 'Plano de Contas',
        'billing': 'Cadastro de Cobrança',
        'paymentPlans': 'Planos de Pagamento',
        'banks': 'Caixas e Bancos',
        'cfop': 'Cadastro de CFOP',
        'icmsParams': 'Parâmetros de ICMS',
        'pisCofins': 'PIS/COFINS'
    };
    document.getElementById('pageTitle').textContent = titles[viewName] || 'ERP';

    // Load Data on View Switch
    if (viewName === 'entities') renderEntities();
    if (viewName === 'suppliers') renderSuppliers();
    if (viewName === 'employees') renderEmployees();

    // Cadastros Financeiros/Fiscais
    if (viewName === 'groups' && typeof renderGruposGrid === 'function') renderGruposGrid();
};

// --- Product Modal Logic ---
window.openProductModal = () => {
    document.getElementById('productModal').style.display = 'flex';
};

window.closeProductModal = () => {
    document.getElementById('productModal').style.display = 'none';
};


window.toggleSalesTab = () => {
    const isSeller = document.getElementById('empIsSeller').checked;
    const tabBtn = document.getElementById('tabBtnSales');
    const tabContent = document.getElementById('tab-emp-sales');

    if (isSeller) {
        tabBtn.style.display = 'block';
        // Auto-switch to tab if needed, or just warn
        tabBtn.classList.add('pulse-anim'); // Optional visual cue
    } else {
        tabBtn.style.display = 'none';
        tabBtn.classList.remove('active');
        tabContent.classList.remove('active');
        // Switch back to main if sales tab was active
        if (tabContent.classList.contains('active')) {
            switchTab(document.querySelectorAll('.tab-btn')[0], 'tab-emp-main');
        }
        // Also clear fields? Maybe not, to preserve data if accidentally unchecked
    }
};

window.switchTab = (btn, tabId) => {
    // 1. Reset Tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // 2. Activate
    btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
};

// --- Product Data Logic ---
let products = [
    { sku: 'COD001', name: 'Óleo de Motor 5W30', log: '1kg / 20x10x10', price: 45.00, stock: 120 },
    { sku: 'COD002', name: 'Filtro de Ar Esportivo', log: '0.5kg / 15x15x15', price: 89.90, stock: 50 },
    { sku: 'COD003', name: 'Pneu Aro 16 Michellin', log: '8kg / 60x60x20', price: 650.00, stock: 12 }
];

function renderProducts(filter = '') {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        p.sku.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum produto encontrado.</td></tr>';
        return;
    }

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${p.sku}</td>
            <td>${p.name}</td>
            <td style="font-size:0.85rem; color:var(--text-secondary)">${p.log}</td>
            <td style="font-weight:600; color:var(--accent-success)">R$ ${p.price.toFixed(2)}</td>
            <td>${p.stock} un</td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.filterProducts = () => {
    const term = document.getElementById('productSearch').value;
    renderProducts(term);
};

// Initialize
renderProducts();

// --- Entities (Clients) Logic ---
window.openEntityModal = () => {
    document.getElementById('entityModal').style.display = 'flex';
};

window.closeEntityModal = () => {
    document.getElementById('entityModal').style.display = 'none';
};

// --- CNPJ Search Integration ---
window.openCNPJSearch = (context = 'client') => {
    if (!window.CNPJLookup) {
        alert('Módulo de consulta não carregado. Recarregue a página.');
        return;
    }

    CNPJLookup.showLookupModal((data) => {
        if (context === 'client') {
            // Map fields BrasilAPI -> ERP Form (Clients)
            document.getElementById('cliDoc').value = data.cnpj;
            document.getElementById('cliName').value = data.razaoSocial;
            document.getElementById('cliFantasy').value = data.nomeFantasia;

            document.getElementById('cliZip').value = data.cep;
            document.getElementById('cliStreet').value = data.logradouro;
            document.getElementById('cliNumber').value = data.numero;
            document.getElementById('cliComp').value = data.complemento;
            document.getElementById('cliDistrict').value = data.bairro;
            document.getElementById('cliCity').value = data.cidade;
            document.getElementById('cliState').value = data.uf;

            document.getElementById('cliEmail').value = data.email;
            if (data.telefone) document.getElementById('cliContact').value = data.telefone;

            if (data.optanteSimples) {
                document.getElementById('cliSimples').value = 'sim';
            } else {
                document.getElementById('cliSimples').value = 'nao';
            }
            document.getElementById('cliType').value = 'J';

        } else if (context === 'supplier') {
            // Map fields BrasilAPI -> ERP Form (Suppliers)
            document.getElementById('supDoc').value = data.cnpj;
            document.getElementById('supName').value = data.razaoSocial;
            document.getElementById('supFantasy').value = data.nomeFantasia;

            document.getElementById('supZip').value = data.cep;
            document.getElementById('supStreet').value = data.logradouro;
            document.getElementById('supNumber').value = data.numero;
            document.getElementById('supDistrict').value = data.bairro;
            document.getElementById('supCity').value = data.cidade;
            document.getElementById('supState').value = data.uf;

            document.getElementById('supEmail').value = data.email;
            if (data.telefone) document.getElementById('supPhone').value = data.telefone;
            document.getElementById('supType').value = 'J';
        }

        alert('✅ Dados preenchidos com sucesso!');
    });
};

let entities = [
    { code: 1355, name: 'SIMAO MEIRELES FURTADO', fantasy: 'SF PECAS', cnpj: '52.352.619/0001-69', city: 'Belém/PA', seller: '32 - ABNAEL', status: 'active' },
    { code: 1356, name: 'AUTO CENTER PARREIRA', fantasy: 'PARREIRA AUTO', cnpj: '00.000.000/0001-91', city: 'Ananindeua/PA', seller: '1 - INTERNO', status: 'active' }
];

window.renderEntities = (filter = '') => {
    const tbody = document.getElementById('entitiesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = entities.filter(e =>
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.fantasy.toLowerCase().includes(filter.toLowerCase()) ||
        e.cnpj.includes(filter)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    filtered.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${e.code}</td>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${e.name}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary)">${e.fantasy}</div>
            </td>
            <td>${e.cnpj}</td>
            <td>${e.city}</td>
            <td><span class="status-badge status-pending" style="color:var(--primary-color)">${e.seller}</span></td>
            <td><span class="status-badge status-shipped">ATIVO</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// --- Suppliers Logic ---
window.openSupplierModal = () => {
    document.getElementById('supplierModal').style.display = 'flex';
};

window.closeSupplierModal = () => {
    document.getElementById('supplierModal').style.display = 'none';
};

let suppliers = [
    { code: 451, name: 'LUBRIFICANTES DO BRASIL LTDA', fantasy: 'LUBRAX', cnpj: '33.000.167/0001-01', city: 'Rio de Janeiro/RJ', type: 'Revenda' },
    { code: 452, name: 'MICHELIN PNEUS S/A', fantasy: 'MICHELIN', cnpj: '00.000.000/0002-00', city: 'São Paulo/SP', type: 'Indústria' }
];

window.renderSuppliers = (filter = '') => {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = suppliers.filter(s =>
        s.name.toLowerCase().includes(filter.toLowerCase()) ||
        s.cnpj.includes(filter)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum fornecedor encontrado.</td></tr>';
        return;
    }

    filtered.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${s.code}</td>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${s.name}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary)">${s.fantasy}</div>
            </td>
            <td>${s.cnpj}</td>
            <td>${s.city}</td>
            <td><span class="status-badge status-pending" style="color:var(--text-primary); background:rgba(255,255,255,0.1)">${s.type}</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.filterSuppliers = () => {
    const term = document.getElementById('supplierSearch').value;
    renderSuppliers(term);
};

// Update CNPJ Search to handle both Contexts
// --- Employees Logic ---
window.openEmployeeModal = () => {
    document.getElementById('employeeModal').style.display = 'flex';
};

window.closeEmployeeModal = () => {
    document.getElementById('employeeModal').style.display = 'none';
};

let employees = [
    { code: 62, name: 'PAULO HENRIQUE PARREIRA', role: 'Diretor', sector: 'Administrativo', cpf: '000.000.000-00', status: 'Ativo' },
    { code: 63, name: 'VENDEDOR INTERNO', role: 'Vendedor', sector: 'Comercial', cpf: '111.111.111-11', status: 'Ativo' }
];

window.renderEmployees = (filter = '') => {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.code.toString().includes(filter)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum funcionário encontrado.</td></tr>';
        return;
    }

    filtered.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${e.code}</td>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${e.name}</div>
            </td>
            <td>${e.role} / ${e.sector}</td>
            <td>${e.cpf}</td>
            <td><span class="status-badge status-shipped">${e.status}</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.filterEmployees = () => {
    const term = document.getElementById('employeeSearch').value;
    renderEmployees(term);
};

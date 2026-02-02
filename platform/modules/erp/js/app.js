// Parreira ERP Core Logic
// v2.0.0

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Parreira ERP Inicializado');

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
        'entities': 'Entidades (CRM)',
        'sales': 'Vendas',
        'finance': 'Financeiro',
        'fiscal': 'Fiscal'
    };
    document.getElementById('pageTitle').textContent = titles[viewName] || 'ERP';
};

// --- Product Modal Logic ---
window.openProductModal = () => {
    document.getElementById('productModal').style.display = 'flex';
};

window.closeProductModal = () => {
    document.getElementById('productModal').style.display = 'none';
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

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

// Mock Data Load (Products)
window.openProductModal = () => {
    alert('Formulário de Produto será implementado a seguir.\nIntegração: WMS (Peso/Medidas) + Vendas (Preço/Fotos)');
};

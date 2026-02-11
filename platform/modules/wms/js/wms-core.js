// WMS Core Logic
// Shared functionality for WMS module

const WMS_VERSION = '3.0.0-alpha';

// --- Auth & Tenant Check ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in via localStorage (fast check)
    const savedUser = localStorage.getItem('logged_user');
    if (!savedUser) {
        window.location.href = '../../index.html'; // Redirect to login
        return;
    }

    const user = JSON.parse(savedUser);
    document.getElementById('userName').textContent = user.name || user.login;
    document.getElementById('userTenant').textContent = user.tenantId || 'Tenant';

    // Highlight active menu
    const currentView = localStorage.getItem('wmsLastView') || 'dashboard';
    switchView(currentView);
});

// --- Navigation ---
function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');

    // Show target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = 'block';

        // Update styling
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        // Try to find nav item that calls this view
        const navItem = document.querySelector(`.nav-item[onclick="switchView('${viewId}')"]`);
        if (navItem) navItem.classList.add('active');

        // Update Breadcrumb/Title
        const pageTitle = navItem ? navItem.querySelector('span:last-child').textContent : 'WMS';
        document.getElementById('pageTitle').textContent = pageTitle;

        // Persist state
        localStorage.setItem('wmsLastView', viewId);

        // Trigger specific view loaders
        if (viewId === 'locations' && window.loadLocationsView) {
            window.loadLocationsView();
        }
        if (viewId === 'inbound' && window.loadInboundView) {
            window.loadInboundView();
        }
    }
}

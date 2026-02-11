// WMS Coletor — Core Logic
// Navigation, Auth, Scanner, Shared Data Access

const COLETOR_VERSION = '1.0.0';

// ===== Auth Check =====
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('logged_user');
    if (!savedUser) {
        window.location.href = '../../index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    const initials = (user.name || user.login || 'OP').substring(0, 2).toUpperCase();
    document.getElementById('userBadge').textContent = initials;

    // Load home stats
    updateHomeStats();
});

// ===== Navigation =====
let currentScreen = 'home';

function navigateTo(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // Show target
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        target.classList.add('active');
        currentScreen = screenId;

        // Inject placeholder content if screen is empty
        if (target.innerHTML.trim() === '' && screenId !== 'home') {
            injectPlaceholder(screenId, target);
        }

        // Update bottom nav
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        const tabs = document.querySelectorAll('.nav-tab');
        const tabMap = ['home', 'recebimento', 'armazenar', 'separar', 'inventario'];
        const idx = tabMap.indexOf(screenId);
        if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');

        // Update top bar title
        const titles = {
            home: 'WMS Coletor',
            recebimento: 'Recebimento',
            armazenar: 'Armazenagem',
            separar: 'Separação',
            inventario: 'Inventário'
        };
        document.getElementById('screenTitle').textContent = titles[screenId] || 'WMS Coletor';

        // Show/hide scanner bar (hide on home)
        document.getElementById('scannerBar').style.display = screenId === 'home' ? 'none' : 'flex';

        // Focus scanner input automatically
        if (screenId !== 'home') {
            setTimeout(() => {
                const input = document.getElementById('scannerInput');
                if (input) input.focus();
            }, 200);
        }
    }
}

// ===== Placeholder Injection =====
function injectPlaceholder(screenId, container) {
    const icons = {
        recebimento: 'move_to_inbox',
        armazenar: 'system_update_alt',
        separar: 'shopping_basket',
        inventario: 'inventory_2'
    };
    const labels = {
        recebimento: 'Recebimento',
        armazenar: 'Armazenagem',
        separar: 'Separação',
        inventario: 'Inventário'
    };

    container.innerHTML = `
        <div class="screen-placeholder">
            <span class="material-icons-round">${icons[screenId] || 'info'}</span>
            <h3 style="margin-bottom:0.5rem;">${labels[screenId] || screenId}</h3>
            <p style="font-size:0.85rem;">Tela em construção.<br>Use o scanner para iniciar.</p>
        </div>
    `;
}

// ===== Scanner =====
function processScan() {
    const input = document.getElementById('scannerInput');
    const code = input.value.trim();
    if (!code) return;

    console.log(`[SCAN] Screen: ${currentScreen}, Code: ${code}`);

    // Dispatch to active screen handler
    switch (currentScreen) {
        case 'recebimento':
            if (window.handleScanRecebimento) window.handleScanRecebimento(code);
            break;
        case 'armazenar':
            if (window.handleScanArmazenar) window.handleScanArmazenar(code);
            break;
        case 'separar':
            if (window.handleScanSeparar) window.handleScanSeparar(code);
            break;
        case 'inventario':
            if (window.handleScanInventario) window.handleScanInventario(code);
            break;
    }

    // Clear input for next scan
    input.value = '';
    input.focus();
}

// Handle Enter key on scanner input
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.id === 'scannerInput') {
        e.preventDefault();
        processScan();
    }
});

// ===== Home Stats =====
function updateHomeStats() {
    const locations = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');

    // Stats
    const el = (id) => document.getElementById(id);
    if (el('statEnderecos')) el('statEnderecos').textContent = locations.length;
    if (el('statOcupados')) el('statOcupados').textContent = locations.filter(l => l.status === 'OCUPADO').length;
    if (el('statPendentes')) el('statPendentes').textContent = receipts.filter(r => r.status === 'AGUARDANDO').length;

    // Badges
    const pendingReceipts = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA').length;
    if (el('badgeReceber')) {
        el('badgeReceber').textContent = pendingReceipts;
        el('badgeReceber').style.display = pendingReceipts > 0 ? 'flex' : 'none';
    }

    // Hide other badges for now (no data yet)
    ['badgeArmazenar', 'badgeSeparar', 'badgeInventario'].forEach(id => {
        if (el(id)) el(id).style.display = 'none';
    });
}

// ===== Shared Data Helpers =====
window.wmsData = {
    getLocations: () => JSON.parse(localStorage.getItem('wms_mock_data') || '[]'),
    saveLocations: (data) => localStorage.setItem('wms_mock_data', JSON.stringify(data)),
    getReceipts: () => JSON.parse(localStorage.getItem('wms_receipts') || '[]'),
    saveReceipts: (data) => localStorage.setItem('wms_receipts', JSON.stringify(data)),
    findLocation: (id) => {
        const locs = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
        return locs.find(l => l.id === id);
    }
};

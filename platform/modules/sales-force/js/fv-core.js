// ===========================================
// Força de Vendas — Core Logic
// Login, Navigation, Data Layer, Sync
// ===========================================

// ---- State ----
let fvUser = null;
let fvData = {
    clientes: [],
    produtos: [],
    pedidos: [],
    metas: { mensal: 50000, realizado: 0 },
    rotas: []
};

const FV_STORAGE_KEY = 'fv_data';
const FV_SYNC_KEY = 'fv_last_sync';
const FV_USER_KEY = 'fv_user';

// ---- Default Data ----
const DEFAULT_CLIENTES = [
    { id: 'c1', codigo: 1355, nome: 'SIMAO MEIRELES FURTADO', fantasia: 'SF PEÇAS', cnpj: '52.352.619/0001-69', cidade: 'Belém/PA', telefone: '(91) 3222-0001', email: 'simao@sfpecas.com', ultimaVisita: '2026-02-05', status: 'ativo' },
    { id: 'c2', codigo: 1356, nome: 'AUTO CENTER PARREIRA', fantasia: 'PARREIRA AUTO', cnpj: '00.000.000/0001-91', cidade: 'Ananindeua/PA', telefone: '(91) 3333-5555', email: 'contato@parreira.com', ultimaVisita: '2026-02-10', status: 'ativo' },
    { id: 'c3', codigo: 1401, nome: 'LUBRIFICANTES NORTE LTDA', fantasia: 'LUBRINORTE', cnpj: '11.222.333/0001-44', cidade: 'Marituba/PA', telefone: '(91) 3277-8080', email: 'compras@lubrinorte.com', ultimaVisita: '2026-01-28', status: 'ativo' },
    { id: 'c4', codigo: 1422, nome: 'MOTO SHOP BELEM', fantasia: 'MOTO SHOP', cnpj: '22.333.444/0001-55', cidade: 'Belém/PA', telefone: '(91) 3244-1010', email: '', ultimaVisita: '', status: 'prospecto' },
    { id: 'c5', codigo: 1460, nome: 'DISTRIBUIDORA AMAZONIA AUTO', fantasia: 'AMAZONIA AUTO', cnpj: '33.444.555/0001-66', cidade: 'Castanhal/PA', telefone: '(91) 3721-2020', email: 'vendas@amazoniaauto.com', ultimaVisita: '2026-02-08', status: 'ativo' }
];

const DEFAULT_PRODUTOS = [
    { sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', grupo: 'Lubrificantes', preco: 45.00, estoque: 120, unidade: 'UN', imagem: '🛢️' },
    { sku: 'COD002', nome: 'Filtro de Ar Esportivo K\u0026N', grupo: 'Filtros', preco: 89.90, estoque: 50, unidade: 'UN', imagem: '🔧' },
    { sku: 'COD003', nome: 'Pneu Aro 16 Michelin 205/55', grupo: 'Pneus', preco: 650.00, estoque: 12, unidade: 'UN', imagem: '⚫' },
    { sku: 'COD004', nome: 'Pastilha de Freio Dianteira', grupo: 'Freios', preco: 120.00, estoque: 80, unidade: 'JG', imagem: '🔴' },
    { sku: 'COD005', nome: 'Bateria 60Ah Moura', grupo: 'Elétrica', preco: 499.90, estoque: 25, unidade: 'UN', imagem: '🔋' },
    { sku: 'COD006', nome: 'Amortecedor Dianteiro Monroe', grupo: 'Suspensão', preco: 310.00, estoque: 18, unidade: 'UN', imagem: '🔩' },
    { sku: 'COD007', nome: 'Vela de Ignição NGK Iridium', grupo: 'Motor', preco: 38.50, estoque: 200, unidade: 'UN', imagem: '⚡' },
    { sku: 'COD008', nome: 'Fluido de Freio DOT4 500ml', grupo: 'Fluidos', preco: 28.90, estoque: 150, unidade: 'UN', imagem: '💧' }
];

const DEFAULT_PEDIDOS = [
    { id: 'p1', numero: 5001, data: '2026-02-10', cliente: { codigo: 1355, fantasia: 'SF PEÇAS' }, itens: [{ sku: 'COD001', nome: 'Óleo 5W30', qtd: 24, preco: 45.00 }, { sku: 'COD004', nome: 'Pastilha Freio', qtd: 6, preco: 120.00 }], total: 1800.00, status: 'enviado', syncedAt: '2026-02-10T14:30:00' },
    { id: 'p2', numero: 5002, data: '2026-02-11', cliente: { codigo: 1356, fantasia: 'PARREIRA AUTO' }, itens: [{ sku: 'COD003', nome: 'Pneu Aro 16', qtd: 4, preco: 650.00 }], total: 2600.00, status: 'pendente', syncedAt: null },
    { id: 'p3', numero: 5003, data: '2026-02-08', cliente: { codigo: 1460, fantasia: 'AMAZONIA AUTO' }, itens: [{ sku: 'COD005', nome: 'Bateria 60Ah', qtd: 10, preco: 499.90 }, { sku: 'COD007', nome: 'Vela NGK', qtd: 50, preco: 38.50 }], total: 6924.00, status: 'faturado', syncedAt: '2026-02-08T16:00:00' }
];

const DEFAULT_ROTAS = [
    { id: 'r1', dia: 'Segunda', clientes: [1355, 1401], zona: 'Belém Centro' },
    { id: 'r2', dia: 'Terça', clientes: [1356, 1422], zona: 'Ananindeua' },
    { id: 'r3', dia: 'Quarta', clientes: [1460], zona: 'Castanhal' },
    { id: 'r4', dia: 'Quinta', clientes: [1355, 1356, 1401], zona: 'Belém/Anan.' },
    { id: 'r5', dia: 'Sexta', clientes: [1422, 1460], zona: 'Anan./Castanhal' }
];

// ---- Init ----
function initFV() {
    const stored = localStorage.getItem(FV_STORAGE_KEY);
    if (stored) {
        fvData = JSON.parse(stored);
    } else {
        fvData.clientes = DEFAULT_CLIENTES;
        fvData.produtos = DEFAULT_PRODUTOS;
        fvData.pedidos = DEFAULT_PEDIDOS;
        fvData.rotas = DEFAULT_ROTAS;
        fvData.metas = { mensal: 50000, realizado: 11324 };
        saveFVData();
    }

    // Check login
    const savedUser = localStorage.getItem(FV_USER_KEY);
    if (savedUser) {
        fvUser = JSON.parse(savedUser);
        showMainApp();
    }
}

function saveFVData() {
    localStorage.setItem(FV_STORAGE_KEY, JSON.stringify(fvData));
}

// ---- Login ----
window.doLogin = function () {
    const code = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (!code) { showToast('Informe o código do vendedor'); return; }
    if (pass !== '1234' && pass !== '') { showToast('Senha incorreta'); return; }

    fvUser = { codigo: code, nome: 'Vendedor ' + code, avatar: code.charAt(0).toUpperCase() };
    localStorage.setItem(FV_USER_KEY, JSON.stringify(fvUser));
    showMainApp();
    showToast('Bem-vindo, Vendedor ' + code + '!');
};

window.doLogout = function () {
    localStorage.removeItem(FV_USER_KEY);
    fvUser = null;
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('mainApp').classList.remove('active');
    toggleDrawer(true);
};

function showMainApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    document.getElementById('userAvatar').textContent = fvUser.avatar;
    document.getElementById('drawerName').textContent = fvUser.nome;
    document.querySelector('.drawer-avatar').textContent = fvUser.avatar;
    navigateTo('dashboard');
    updateBadges();
}

// ---- Navigation ----
window.navigateTo = function (viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard', clientes: 'Clientes', catalogo: 'Catálogo',
        pedidos: 'Pedidos', novoPedido: 'Novo Pedido', metas: 'Metas', rotas: 'Roteiro'
    };
    document.getElementById('screenTitle').textContent = titles[viewName] || 'Força de Vendas';

    // Update bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    const navMap = { dashboard: 0, clientes: 1, novoPedido: 2, pedidos: 3, metas: 4 };
    if (navMap[viewName] !== undefined) {
        document.querySelectorAll('.bottom-nav-item')[navMap[viewName]].classList.add('active');
    }

    // Update drawer
    document.querySelectorAll('.drawer-item').forEach(d => d.classList.remove('active'));
    const drawerBtn = Array.from(document.querySelectorAll('.drawer-item')).find(d => d.getAttribute('onclick')?.includes(viewName));
    if (drawerBtn) drawerBtn.classList.add('active');

    // Close drawer
    toggleDrawer(true);

    // Render screen
    if (typeof renderScreen === 'function') renderScreen(viewName);
};

// ---- Drawer ----
window.toggleDrawer = function (forceClose) {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');
    if (forceClose || drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
};

// ---- Toast ----
window.showToast = function (msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
};

// ---- Badges ----
function updateBadges() {
    const pendentes = fvData.pedidos.filter(p => p.status === 'pendente').length;
    const badgeP = document.getElementById('badgePedidos');
    if (pendentes > 0) { badgeP.textContent = pendentes; badgeP.classList.add('show'); }
    else { badgeP.classList.remove('show'); }

    const prospectos = fvData.clientes.filter(c => c.status === 'prospecto').length;
    const badgeC = document.getElementById('badgeClientes');
    if (prospectos > 0) { badgeC.textContent = prospectos; badgeC.classList.add('show'); }
    else { badgeC.classList.remove('show'); }
}

// ---- Sync ----
// ---- Sync ----
window.forceSync = function () {
    const indicator = document.getElementById('syncIndicator');
    indicator.classList.add('syncing');
    indicator.querySelector('.material-icons-round').textContent = 'sync';

    setTimeout(() => {
        // 1. PUSH: Send 'pendente' orders to WMS (Simulation of ERP integration)
        // In a real scenario, FV -> ERP -> WMS.

        let pushedCount = 0;

        fvData.pedidos.forEach(p => {
            if (p.status === 'pendente') {

                // 1. ERP DATA UPDATE (Independent)
                // Deduct from ERP Stock (fvData.produtos)
                p.itens.forEach(item => {
                    const prod = fvData.produtos.find(pr => pr.sku === item.sku);
                    if (prod) {
                        prod.estoque = (prod.estoque || 0) - item.qtd;
                    }
                });

                // 2. SEND TO ERP BACKEND (Integration)
                if (typeof window.onErpReceberPedidoFV === 'function') {
                    try {
                        window.onErpReceberPedidoFV(p);
                        pushedCount++;
                        console.log(`[Sync] Sent order ${p.numero} to ERP.`);
                    } catch (e) {
                        console.error('[Sync] Error sending to ERP:', e);
                    }
                } else {
                    console.warn('[Sync] ERP Integration module not found. Operating in Standalone mode.');
                }

                // Update local status
                p.status = 'enviado'; // Sent to ERP/WMS
                p.syncedAt = new Date().toISOString();
            }
        });



        // Save ERP Data (updated stock)
        saveFVData();

        // 2. PULL: Update status from WMS/ERP
        // Check wms_pedidos, wms_ondas, wms_expedicoes
        const ondas = JSON.parse(localStorage.getItem('wms_ondas') || '[]');
        // We can infer status from wmsPedidos status or if it's in a specific wave
        // Re-read wmsPedidos in case we didn't push anything but need updates
        const currentWms = JSON.parse(localStorage.getItem('wms_pedidos') || '[]');

        fvData.pedidos.forEach(p => {
            if (p.status === 'pendente') return; // Ignore drafts

            const wmsOrder = currentWms.find(wp => wp.id === `PED-${p.numero}`);
            if (wmsOrder) {
                // Map WMS Status -> FV Status
                let newStatus = p.status;
                const ws = wmsOrder.status; // PENDENTE, EM ONDA, SEPARANDO, CONFERIDO?

                if (ws === 'PENDENTE') newStatus = 'aguardando'; // WMS received
                else if (ws === 'EM ONDA') newStatus = 'separando';
                else if (ws === 'SEPARANDO') newStatus = 'separando';

                // Check if Wave is Conferida
                // In saida.js, orders don't explicitly change to CONFERIDO, but the ONDA does.
                // We need to find which wave this order belongs to.
                const onda = ondas.find(o => o.pedidos.includes(wmsOrder.id));
                if (onda) {
                    if (onda.status === 'PRONTA' || onda.conferido) newStatus = 'conferido';
                    else newStatus = 'separando';
                }

                // Check Expedicao (Despachado)
                // Need to check wms_expedicoes? not implemented fully in saida.js logic for individual orders logic yet
                // But let's assume 'conferido' is the milestone for now.

                if (newStatus !== p.status) {
                    console.log(`[Sync] Order ${p.numero} updated: ${p.status} -> ${newStatus}`);
                    p.status = newStatus;
                }
            }
        });

        saveFVData();
        updateBadges();

        indicator.classList.remove('syncing');
        indicator.querySelector('.material-icons-round').textContent = 'cloud_done';
        localStorage.setItem(FV_SYNC_KEY, new Date().toISOString());
        showToast(pushedCount > 0 ? `${pushedCount} pedidos enviados!` : 'Sincronizado com sucesso');

        // Re-render current view
        const activeView = document.querySelector('.view.active');
        if (activeView) {
            const viewName = activeView.id.replace('view-', '');
            if (typeof renderScreen === 'function') renderScreen(viewName);
        }
    }, 1000);
};

// ---- Online/Offline ----
window.addEventListener('online', () => {
    document.getElementById('syncIndicator').classList.remove('offline');
    showToast('Conexão restaurada');
});
window.addEventListener('offline', () => {
    const indicator = document.getElementById('syncIndicator');
    indicator.classList.add('offline');
    indicator.querySelector('.material-icons-round').textContent = 'cloud_off';
    showToast('Modo offline ativado');
});

// ---- Helpers ----
window.fmtMoney = function (v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ---- Init on DOM Ready ----
document.addEventListener('DOMContentLoaded', initFV);

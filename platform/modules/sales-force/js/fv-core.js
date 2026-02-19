// ===========================================
// Força de Vendas 2.0 — Core Logic
// Login, Navigation, Data Layer, Sync
// ===========================================

// ---- State ----
let fvUser = null;
let fvData = {
    clientes: [],
    produtos: [],
    pedidos: [],
    tabelasPreco: [],    // tabelas por grupo (rota + praça)
    transportadoras: [],
    planosPagamento: [],
    titulosAbertos: [],  // contas a receber vencidas
    configEmpresa: { nome: 'Parreira Distribuidora', cnpj: '00.000.000/0001-00' },
    lastSync: null
};

const FV_STORAGE_KEY = 'fv_data';
const FV_USER_KEY = 'fv_user';

// ---- Default Data ----
const DEFAULT_CLIENTES = [
    { id: 1, codigo: '1001', nome: 'AUTO PEÇAS SILVA', nomeFantasia: 'AP Silva', tipo: 'PJ', cpfCnpj: '12.345.678/0001-90', ie: '123456789', cidade: 'CASTANHAL', bairro: 'CENTRO', uf: 'PA', cep: '68740-000', endereco: 'Av. Barão do Rio Branco, 450', telefone: '(91) 3721-1234', email: 'contato@apsilva.com', rota: 'ROTA 01', praca: 'CASTANHAL', grupo: 'A', status: 'ativo', bloqueado: false, limiteTotal: 15000, limiteDisponivel: 8500, diasAtraso: 0, ultimaCompra: '2026-02-10' },
    { id: 2, codigo: '1002', nome: 'MOTO CENTER LTDA', nomeFantasia: 'Moto Center', tipo: 'PJ', cpfCnpj: '23.456.789/0001-01', ie: '234567890', cidade: 'MARABA', bairro: 'NOVA MARABA', uf: 'PA', cep: '68501-000', endereco: 'Rua Transamazônica, 120', telefone: '(94) 3322-5678', email: 'vendas@motocenter.com', rota: 'ROTA 02', praca: 'MARABA', grupo: 'A', status: 'ativo', bloqueado: false, limiteTotal: 25000, limiteDisponivel: 12000, diasAtraso: 0, ultimaCompra: '2026-02-15' },
    { id: 3, codigo: '1003', nome: 'PEÇAS E SERVIÇOS NORTE', nomeFantasia: 'PS Norte', tipo: 'PJ', cpfCnpj: '34.567.890/0001-12', ie: '345678901', cidade: 'BELEM', bairro: 'MARCO', uf: 'PA', cep: '66093-000', endereco: 'Tv. Dr. Moraes, 890', telefone: '(91) 3233-9012', email: 'psnorte@email.com', rota: 'ROTA 03', praca: 'BELEM', grupo: 'B', status: 'ativo', bloqueado: false, limiteTotal: 10000, limiteDisponivel: 10000, diasAtraso: 0, ultimaCompra: '2026-01-28' },
    { id: 4, codigo: '1004', nome: 'BICICLETARIA AMAZONIA', nomeFantasia: 'Bici Amazônia', tipo: 'PJ', cpfCnpj: '45.678.901/0001-23', ie: '456789012', cidade: 'ANANINDEUA', bairro: 'CENTRO', uf: 'PA', cep: '67030-000', endereco: 'Rod. Augusto Montenegro, km 8', telefone: '(91) 3255-3456', email: 'amazonia@bike.com', rota: 'ROTA 03', praca: 'BELEM', grupo: 'B', status: 'ativo', bloqueado: true, limiteTotal: 8000, limiteDisponivel: 0, diasAtraso: 45, ultimaCompra: '2025-12-15' },
    { id: 5, codigo: '1005', nome: 'COMERCIAL ARAGUAIA', nomeFantasia: 'Com. Araguaia', tipo: 'PJ', cpfCnpj: '56.789.012/0001-34', ie: '567890123', cidade: 'REDENCAO', bairro: 'CENTRO', uf: 'PA', cep: '68550-000', endereco: 'Av. Brasil, 567', telefone: '(94) 3423-7890', email: 'araguaia@com.br', rota: 'ROTA 02', praca: 'REDENCAO', grupo: 'C', status: 'ativo', bloqueado: false, limiteTotal: 5000, limiteDisponivel: 3200, diasAtraso: 0, ultimaCompra: '2026-02-12' },
    { id: 6, codigo: '1006', nome: 'PECAS XINGU ME', nomeFantasia: 'Xingu Peças', tipo: 'PJ', cpfCnpj: '67.890.123/0001-45', ie: '678901234', cidade: 'ALTAMIRA', bairro: 'CENTRO', uf: 'PA', cep: '68372-000', endereco: 'Rua Coronel José Porfírio, 200', telefone: '(93) 3515-1234', email: 'xingu@pecas.com', rota: 'ROTA 04', praca: 'ALTAMIRA', grupo: 'C', status: 'inativo', bloqueado: false, limiteTotal: 3000, limiteDisponivel: 3000, diasAtraso: 0, ultimaCompra: '2025-10-20' },
    { id: 7, codigo: '1007', nome: 'LUBRIFICANTES PARA LTDA', nomeFantasia: 'Lubri Pará', tipo: 'PJ', cpfCnpj: '78.901.234/0001-56', ie: '789012345', cidade: 'SANTAREM', bairro: 'SAO RAIMUNDO', uf: 'PA', cep: '68005-000', endereco: 'Av. Cuiabá, 1200', telefone: '(93) 3522-5678', email: 'lubripara@email.com', rota: 'ROTA 05', praca: 'SANTAREM', grupo: 'A', status: 'ativo', bloqueado: false, limiteTotal: 20000, limiteDisponivel: 15000, diasAtraso: 0, ultimaCompra: '2026-02-14' },
    { id: 8, codigo: '1008', nome: 'JOAO SILVA MOTOS', nomeFantasia: 'JS Motos', tipo: 'PF', cpfCnpj: '123.456.789-00', ie: '', cidade: 'TUCURUI', bairro: 'CENTRO', uf: 'PA', cep: '68455-000', endereco: 'Rua Lauro Sodré, 89', telefone: '(94) 3787-9012', email: 'jsmotos@email.com', rota: 'ROTA 04', praca: 'TUCURUI', grupo: 'C', status: 'ativo', bloqueado: true, limiteTotal: 2000, limiteDisponivel: 0, diasAtraso: 90, ultimaCompra: '2025-11-01' }
];

const DEFAULT_PRODUTOS = [
    { sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', grupo: 'Lubrificantes', precoBase: 45.00, estoque: 120, unidade: 'UN' },
    { sku: 'COD002', nome: 'Filtro de Óleo Universal', grupo: 'Filtros', precoBase: 18.50, estoque: 200, unidade: 'UN' },
    { sku: 'COD003', nome: 'Pastilha de Freio Dianteira', grupo: 'Freios', precoBase: 65.00, estoque: 85, unidade: 'JG' },
    { sku: 'COD004', nome: 'Correia Dentada Motor 1.0', grupo: 'Motor', precoBase: 32.00, estoque: 45, unidade: 'UN' },
    { sku: 'COD005', nome: 'Amortecedor Dianteiro Par', grupo: 'Suspensão', precoBase: 189.00, estoque: 30, unidade: 'PAR' },
    { sku: 'COD006', nome: 'Kit Embreagem Completo', grupo: 'Transmissão', precoBase: 320.00, estoque: 15, unidade: 'KIT' },
    { sku: 'COD007', nome: 'Vela de Ignição NGK', grupo: 'Elétrica', precoBase: 22.00, estoque: 300, unidade: 'UN' },
    { sku: 'COD008', nome: 'Fluido de Freio DOT4 500ml', grupo: 'Fluidos', precoBase: 28.90, estoque: 150, unidade: 'UN' },
    { sku: 'COD009', nome: 'Bateria 60Ah 18 Meses', grupo: 'Elétrica', precoBase: 380.00, estoque: 25, unidade: 'UN' },
    { sku: 'COD010', nome: 'Jogo de Juntas Motor', grupo: 'Motor', precoBase: 145.00, estoque: 40, unidade: 'JG' },
    { sku: 'COD011', nome: 'Radiador Completo', grupo: 'Arrefecimento', precoBase: 420.00, estoque: 12, unidade: 'UN' },
    { sku: 'COD012', nome: 'Palheta Limpador Par', grupo: 'Acessórios', precoBase: 35.00, estoque: 90, unidade: 'PAR' }
];

const DEFAULT_TABELAS_PRECO = [
    { id: 'TAB-A', nome: 'Tabela Grupo A', grupo: 'A', desconto: 0, markup: 1.0 },
    { id: 'TAB-B', nome: 'Tabela Grupo B', grupo: 'B', desconto: 0, markup: 1.05 },
    { id: 'TAB-C', nome: 'Tabela Grupo C', grupo: 'C', desconto: 0, markup: 1.10 }
];

const DEFAULT_TRANSPORTADORAS = [
    { id: 1, nome: 'Transporte Rápido PA', uf: 'PA' },
    { id: 2, nome: 'Expresso Norte', uf: 'PA' },
    { id: 3, nome: 'Logística Amazônia', uf: 'PA' },
    { id: 4, nome: 'Retira (Cliente)', uf: '' }
];

const DEFAULT_PLANOS_PAGAMENTO = [
    { id: 1, nome: '30 dias', codigo: '30', parcelas: 1, prazos: [30] },
    { id: 2, nome: '30/60 dias', codigo: '30/60', parcelas: 2, prazos: [30, 60] },
    { id: 3, nome: '30/60/90 dias', codigo: '30/60/90', parcelas: 3, prazos: [30, 60, 90] },
    { id: 4, nome: 'À Vista', codigo: 'AV', parcelas: 1, prazos: [0] },
    { id: 5, nome: '28 dias', codigo: '28', parcelas: 1, prazos: [28] }
];

const DEFAULT_PEDIDOS = [
    { id: 'PED-001', data: '2026-02-18', clienteId: 1, clienteNome: 'AUTO PEÇAS SILVA', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Transporte Rápido PA', planoPagamento: '30/60 dias', status: 'orcamento', itens: [{ sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', qtd: 10, preco: 45.00, desconto: 0 }, { sku: 'COD002', nome: 'Filtro de Óleo Universal', qtd: 20, preco: 18.50, desconto: 0 }], obs: '', valorTotal: 820.00 },
    { id: 'PED-002', data: '2026-02-17', clienteId: 2, clienteNome: 'MOTO CENTER LTDA', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Expresso Norte', planoPagamento: '30/60/90 dias', status: 'venda', itens: [{ sku: 'COD005', nome: 'Amortecedor Dianteiro Par', qtd: 5, preco: 189.00, desconto: 0 }], obs: 'Entregar pela manhã', valorTotal: 945.00 },
    { id: 'PED-003', data: '2026-02-16', clienteId: 5, clienteNome: 'COMERCIAL ARAGUAIA', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Logística Amazônia', planoPagamento: '30 dias', status: 'enviado', itens: [{ sku: 'COD003', nome: 'Pastilha de Freio Dianteira', qtd: 8, preco: 65.00, desconto: 5 }], obs: '', valorTotal: 494.00 },
    { id: 'PED-004', data: '2026-02-15', clienteId: 7, clienteNome: 'LUBRIFICANTES PARA LTDA', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Transporte Rápido PA', planoPagamento: '30/60 dias', status: 'separado', itens: [{ sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', qtd: 50, preco: 45.00, desconto: 3 }], obs: '', valorTotal: 2182.50 },
    { id: 'PED-005', data: '2026-02-14', clienteId: 3, clienteNome: 'PEÇAS E SERVIÇOS NORTE', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Retira (Cliente)', planoPagamento: 'À Vista', status: 'faturado', itens: [{ sku: 'COD007', nome: 'Vela de Ignição NGK', qtd: 30, preco: 22.00, desconto: 0 }], obs: '', valorTotal: 660.00 },
    { id: 'PED-006', data: '2026-02-10', clienteId: 1, clienteNome: 'AUTO PEÇAS SILVA', tipo: 'PJ', empresa: 'Parreira Distribuidora', transportadora: 'Transporte Rápido PA', planoPagamento: '30 dias', status: 'despachado', itens: [{ sku: 'COD008', nome: 'Fluido de Freio DOT4 500ml', qtd: 15, preco: 28.90, desconto: 0 }], obs: '', valorTotal: 433.50 }
];

// ---- Init ----
function initFV() {
    const savedUser = localStorage.getItem(FV_USER_KEY);
    if (savedUser) {
        fvUser = JSON.parse(savedUser);
    }

    const savedData = localStorage.getItem(FV_STORAGE_KEY);
    if (savedData) {
        const parsed = JSON.parse(savedData);
        fvData = { ...fvData, ...parsed };
    }

    // Init defaults if empty
    if (!fvData.clientes.length) fvData.clientes = DEFAULT_CLIENTES;
    if (!fvData.produtos.length) fvData.produtos = DEFAULT_PRODUTOS;
    if (!fvData.pedidos.length) fvData.pedidos = DEFAULT_PEDIDOS;
    if (!fvData.tabelasPreco.length) fvData.tabelasPreco = DEFAULT_TABELAS_PRECO;
    if (!fvData.transportadoras.length) fvData.transportadoras = DEFAULT_TRANSPORTADORAS;
    if (!fvData.planosPagamento.length) fvData.planosPagamento = DEFAULT_PLANOS_PAGAMENTO;

    saveFVData();

    if (fvUser) {
        showMainApp();
    }
}

function saveFVData() {
    localStorage.setItem(FV_STORAGE_KEY, JSON.stringify(fvData));
}

// ---- Login ----
function doLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if (user === '32' && pass === '1234') {
        fvUser = { codigo: '32', nome: 'Paulo Vendedor', iniciais: 'PV' };
        localStorage.setItem(FV_USER_KEY, JSON.stringify(fvUser));
        showMainApp();
    } else {
        showToast('Usuário ou senha inválidos');
    }
}

function doLogout() {
    fvUser = null;
    localStorage.removeItem(FV_USER_KEY);
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    toggleDrawer(true);
}

function showMainApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    const avatar = fvUser.iniciais || fvUser.nome.charAt(0);
    document.getElementById('userAvatar').textContent = avatar;
    document.querySelectorAll('.drawer-avatar').forEach(el => el.textContent = avatar);
    document.getElementById('drawerName').textContent = fvUser.nome;
    updateBadges();
    navigateTo('dashboard');
}

// ---- Navigation ----
let currentView = 'dashboard';

function navigateTo(viewName) {
    currentView = viewName;

    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Show target
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Home',
        pedidos: 'Pedidos',
        clientes: 'Clientes',
        clienteDetalhe: 'Detalhe do Cliente',
        novoPedido: 'Novo Pedido',
        sync: 'Sincronização'
    };
    document.getElementById('screenTitle').textContent = titles[viewName] || viewName;

    // Update bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) btn.classList.add('active');
    });

    // Update drawer
    document.querySelectorAll('.drawer-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) btn.classList.add('active');
    });

    toggleDrawer(true);

    // Render screen
    renderScreen(viewName);
}

// ---- Drawer ----
function toggleDrawer(forceClose) {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');
    if (forceClose || drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
}

// ---- Toast ----
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- Badges ----
function updateBadges() {
    const pendentes = fvData.pedidos.filter(p => p.status === 'orcamento').length;
    const badgeP = document.getElementById('badgePedidos');
    if (badgeP) {
        if (pendentes > 0) {
            badgeP.textContent = pendentes;
            badgeP.classList.add('show');
        } else {
            badgeP.classList.remove('show');
        }
    }

    const totalClientes = fvData.clientes.length;
    const badgeC = document.getElementById('badgeClientes');
    if (badgeC) {
        badgeC.textContent = totalClientes;
        badgeC.classList.add('show');
    }
}

// ---- Helpers ----
function fmtMoney(v) {
    return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function getPrecoCliente(produto, cliente) {
    // Busca tabela de preço pelo grupo do cliente
    const tabela = fvData.tabelasPreco.find(t => t.grupo === (cliente?.grupo || 'C'));
    const markup = tabela ? tabela.markup : 1.10;
    return +(produto.precoBase * markup).toFixed(2);
}

function gerarNumeroPedido() {
    const max = fvData.pedidos.reduce((m, p) => {
        const num = parseInt(p.id.replace('PED-', ''), 10);
        return num > m ? num : m;
    }, 0);
    return 'PED-' + String(max + 1).padStart(3, '0');
}

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

// ---- Init on DOM Ready ----
document.addEventListener('DOMContentLoaded', initFV);

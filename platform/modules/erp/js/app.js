// Parreira ERP Core Logic

window.getTenantSuffix = function () {
    try {
        const user = JSON.parse(localStorage.getItem('platform_user_logged'));
        return user && user.tenant ? '_' + user.tenant : '';
    } catch (e) {
        return '';
    }
};
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

    const empForm = document.getElementById('employeeForm');
    if (empForm) {
        empForm.addEventListener('submit', window.saveEmployee);
    }
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

// ─── View Hooks Registry (modules register here) ─────────
window._viewHooks = window._viewHooks || [];

// Navigation
window.switchView = (viewName) => {
    // Hide all views
    document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');

    // Show selected
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        if (target.style.flexDirection || target.classList.contains('flex-view')) {
            target.style.display = 'flex';
        } else {
            target.style.display = 'block';
        }
    }

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
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
        'nfeTransmissao': 'Transmissão de NF-e',
        'logisticaMapa': 'Emissão de Mapa de Separação',
        'logisticaConferenciaLista': 'Lista de Conferência',
        'logisticaConferenciaDetalhe': 'Execução de Conferência',
        'acertoCaixaLista': 'Acerto de Caixas (Interno / Externo)',
        'acertoCaixaDetalhe': 'Acerto de Caixas (Detalhe)',
        'groups': 'Gestão de Grupos',
        'accountPlans': 'Plano de Contas',
        'billing': 'Cadastro de Cobrança',
        'paymentPlans': 'Planos de Pagamento',
        'banks': 'Caixas e Bancos',
        'cfop': 'Cadastro de CFOP',
        'icmsParams': 'Parâmetros de ICMS',
        'pisCofins': 'PIS/COFINS',
        'cbsIbs': 'Tributos CBS/IBS',
        'pdv': 'Cadastro de PDV',
        'cancelamento': 'Cancelamento de Pedidos',
        'frenteCaixa': 'Frente de Caixa',
        'devolucaoLista': 'Devolução de Vendas',
        'consultaDevolucao': 'Consulta Devolução de Cliente',
        'consultaPedidos': 'Consulta Pedidos de Venda',
        'biVendas': 'Inteligência de Vendas',
        'biFinanceiro': 'Painel Financeiro',
        // ── Fase 10 — CRM ──
        'crmFunil': 'CRM - Funil de Vendas',
        'crmLeads': 'CRM - Leads e Contatos',
        'crmDashboard': 'CRM - Dashboard',
        // ── Fase 11 — RH ──
        'rhPonto': 'RH - Controle de Ponto',
        'rhFolha': 'RH - Folha de Pagamento',
        'rhFerias': 'RH - Férias e Licenças',
        // ── Fase 12 — Novos títulos ──
        'vendedores': 'Vendedores / RCA',
        'transportadoras': 'Transportadoras',
        'marcas': 'Marcas',
        'regioes': 'Regiões / Praças',
        'rotas': 'Rotas',
        'tabelasPreco': 'Tabelas de Preço',
        'sugestaoCompra': 'Sugestão de Compra',
        'pedidoCompra': 'Pedido de Compra',
        'cotacao': 'Cotação',
        'entradaNf': 'Entrada NF / XML',
        'consultaEntradas': 'Consulta de Entradas',
        'posicaoEstoque': 'Posição de Estoque',
        'ajusteEstoque': 'Ajuste de Estoque',
        'transferenciaEstoque': 'Transferência de Estoque',
        'inventario': 'Inventário',
        'giroEstoque': 'Giro / Cobertura de Estoque',
        'localizacao': 'Localização / WMS',
        'reclassificacao': 'Reclassificação',
        'orcamento': 'Orçamento',
        'faturamento': 'Faturamento / NF-e',
        'liberacaoCredito': 'Liberação de Crédito',
        'romaneio': 'Romaneio de Carga',
        'comissoes': 'Comissões',
        'fluxoCaixa': 'ERP Consultoria',
        'boletos': 'Boletos',
        'conciliacao': 'Conciliação Bancária',
        'inadimplencia': 'Inadimplência',
        'cte': 'CT-e — Conhec. de Transporte',
        'apuracaoIcms': 'Apuração ICMS / IPI',
        'spedFiscal': 'SPED Fiscal',
        'spedContribuicoes': 'SPED Contribuições',
        'livrosFiscais': 'Livros Fiscais',
        'dashboardExecutivo': 'Dashboard Executivo',
        'curvaAbc': 'Curva ABC',
        'analiseMargem': 'Análise de Margem',
        'indicadores': 'Indicadores KPIs'
    };
    document.getElementById('pageTitle').textContent = titles[viewName] || 'ERP';

    // Load Data on View Switch
    if (viewName === 'entities') renderEntities();
    if (viewName === 'suppliers') renderSuppliers();
    if (viewName === 'employees') renderEmployees();
    if (viewName === 'products') renderProducts();
    if (viewName === 'cad-produtos' && typeof renderProdutosGrid === 'function') renderProdutosGrid();

    // Cadastros Financeiros/Fiscais
    if (viewName === 'groups' && typeof renderGruposGrid === 'function') renderGruposGrid();

    // Cadastros Comerciais (Fase 12.1)
    if (typeof CadComercial !== 'undefined' && CadComercial.renderEntity) {
        const cadEntities = ['vendedores', 'transportadoras', 'marcas', 'regioes', 'rotas', 'tabelasPreco'];
        if (cadEntities.includes(viewName)) CadComercial.renderEntity(viewName);
    }

    // Dashboard
    if (viewName === 'dashboard') renderDashboard();

    // ── Vendas Avançado (chamada direta) ──
    if (typeof VendasAvancado !== 'undefined') {
        const vaMap = {
            orcamento: 'renderOrcamento',
            faturamento: 'renderFaturamento',
            liberacaoCredito: 'renderLiberacaoCredito',
            romaneio: 'renderRomaneio',
            comissoes: 'renderComissoes',
            consultaPedidos: 'renderConsultaPedidos'
        };
        if (vaMap[viewName] && typeof VendasAvancado[vaMap[viewName]] === 'function') {
            VendasAvancado[vaMap[viewName]]();
        }
    }

    // ── Fire registered view hooks ──
    if (window._viewHooks) window._viewHooks.forEach(fn => { try { fn(viewName); } catch (e) { console.warn('viewHook error:', e); } });
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

function renderProducts(filter = '') {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Load from actual localStorage
    const tenantSuffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    const realProducts = JSON.parse(localStorage.getItem('erp_products' + tenantSuffix) || '[]');

    const filtered = realProducts.filter(p =>
        (p.nome || '').toLowerCase().includes(filter.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum produto encontrado.</td></tr>';
        return;
    }

    filtered.forEach(p => {
        const pNome = p.nome || '-';
        const pSku = p.sku || '-';
        const pPrice = parseFloat(p.preco || 0);
        const pStock = parseFloat(p.estoque || 0);
        const pLog = `${p.pesoLiq || 0}kg / ${p.unidade || 'UN'}`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${pSku}</td>
            <td>${pNome}</td>
            <td style="font-size:0.85rem; color:var(--text-secondary)">${pLog}</td>
            <td style="font-weight:600; color:var(--accent-success)">R$ ${pPrice.toFixed(2)}</td>
            <td>${pStock} un</td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="typeof editProduto === 'function' ? editProduto('${p.id}') : null">
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

let entities = JSON.parse(localStorage.getItem('erp_clientes' + window.getTenantSuffix()) || 'null') || [
    { code: 1355, name: 'SIMAO MEIRELES FURTADO', fantasy: 'SF PECAS', cnpj: '52.352.619/0001-69', ie: '', tipoCliente: 'PJ', cidade: 'Belém', uf: 'PA', bairro: 'CENTRO', cep: '66000-000', endereco: 'Av. Nazaré, 100', telefone: '(91) 3000-0000', celular: '', email: '', comprador: '', seller: '32 - ABNAEL', grupo: 'A', rota: 1, praca: 'BELEM', regiao: 1, codEmpresa: '01', limiteTotal: 15000, limiteDisponivel: 8500, pedidoNaoFaturado: 6500, diasAtraso: 0, ultimaCompra: '2026-02-10', visita: '', bloqueado: false, status: 'ativo' },
    { code: 1356, name: 'AUTO CENTER PARREIRA', fantasy: 'PARREIRA AUTO', cnpj: '00.000.000/0001-91', ie: '123456789', tipoCliente: 'PJ', cidade: 'Ananindeua', uf: 'PA', bairro: 'CENTRO', cep: '67030-000', endereco: 'Rod. Augusto Montenegro, km 8', telefone: '(91) 3255-0000', celular: '', email: '', comprador: '', seller: '1 - INTERNO', grupo: 'B', rota: 3, praca: 'BELEM', regiao: 3, codEmpresa: '01', limiteTotal: 8000, limiteDisponivel: 5000, pedidoNaoFaturado: 3000, diasAtraso: 0, ultimaCompra: '2026-02-15', visita: '', bloqueado: false, status: 'ativo' }
];

window.renderEntities = (filter = '') => {
    const tbody = document.getElementById('entitiesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = entities.filter(e =>
        (e.name || '').toLowerCase().includes(filter.toLowerCase()) ||
        (e.fantasy || '').toLowerCase().includes(filter.toLowerCase()) ||
        (e.cnpj || '').includes(filter)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum cliente encontrado.</td></tr>';
        return;
    }

    filtered.forEach(e => {
        const limFmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const statusClass = e.bloqueado ? 'status-overdue' : 'status-shipped';
        const statusText = e.bloqueado ? 'BLOQUEADO' : (e.status === 'ativo' ? 'ATIVO' : 'INATIVO');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${e.code}</td>
            <td>
                <div style="font-weight:600; color:var(--text-primary)">${e.name}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary)">${e.fantasy || ''}</div>
            </td>
            <td>${e.cnpj || ''}</td>
            <td>${e.cidade || ''}/${e.uf || ''}</td>
            <td style="text-align:right">${limFmt(e.limiteDisponivel)}</td>
            <td><span class="status-badge status-pending" style="color:var(--primary-color)">${e.seller || ''}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="editCliente(${e.code})">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// Export Clientes ERP → FV Format
window.exportClientesParaFV = function () {
    return entities.map(e => ({
        id: e.code,
        codigo: String(e.code),
        cnpjCpf: e.cnpj || '',
        tipoCliente: e.tipoCliente || 'PJ',
        razaoSocial: e.name || '',
        fantasia: e.fantasy || '',
        nome: e.name || '',
        nomeFantasia: e.fantasy || '',
        inscEstadual: e.ie || '',
        cidade: e.cidade || '',
        bairro: e.bairro || '',
        uf: e.uf || '',
        cep: e.cep || '',
        endereco: e.endereco || '',
        telefone: e.telefone || '',
        celular: e.celular || '',
        email: e.email || '',
        comprador: e.comprador || '',
        rota: e.rota || 0,
        praca: e.praca || '',
        grupo: e.grupo || 'C',
        regiao: e.regiao || 0,
        status: e.status || 'ativo',
        bloqueado: e.bloqueado || false,
        limiteTotal: e.limiteTotal || 0,
        limiteDisponivel: e.limiteDisponivel || 0,
        pedidoNaoFaturado: e.pedidoNaoFaturado || 0,
        diasAtraso: e.diasAtraso || 0,
        ultimaCompra: e.ultimaCompra || '',
        codEmpresa: e.codEmpresa || '01',
        visita: e.visita || '',
        flagNovo: 'N',
        flagAlter: 'N',
        sincronizar: 0
    }));
};

// Editar cliente (placeholder — abre modal se existir)
window.editCliente = function (code) {
    const c = entities.find(e => e.code === code);
    if (!c) return;

    // Map existing data to form for editing
    document.getElementById('cliCode').value = c.code;
    document.getElementById('cliName').value = c.name || '';
    document.getElementById('cliFantasy').value = c.fantasy || '';
    document.getElementById('cliDoc').value = c.cnpj || '';
    document.getElementById('cliType').value = c.tipoCliente || 'J';
    document.getElementById('cliZip').value = c.cep || '';
    document.getElementById('cliStreet').value = c.endereco || '';
    document.getElementById('cliDistrict').value = c.bairro || '';
    document.getElementById('cliCity').value = c.cidade || '';
    document.getElementById('cliState').value = c.uf || '';
    document.getElementById('cliContact').value = c.telefone || '';
    document.getElementById('cliEmail').value = c.email || '';
    document.getElementById('cliSimples').value = c.simples ? 'sim' : 'nao';
    document.getElementById('cliSeller1').value = (c.seller && c.seller.includes('1')) ? '1' : '32';
    document.getElementById('cliCreditLimit').value = c.limiteTotal || 0;

    openEntityModal();
};

window.saveEntity = function (e) {
    if (e) e.preventDefault();

    const codeEl = document.getElementById('cliCode');
    const isEdit = codeEl.value && codeEl.value !== 'Auto' && codeEl.value !== '';
    const code = isEdit ? parseInt(codeEl.value) : Math.floor(Math.random() * 100000) + 2000;

    const newClient = {
        code: code,
        name: document.getElementById('cliName').value,
        fantasy: document.getElementById('cliFantasy').value,
        cnpj: document.getElementById('cliDoc').value,
        tipoCliente: document.getElementById('cliType').value,
        cidade: document.getElementById('cliCity').value,
        uf: document.getElementById('cliState').value,
        bairro: document.getElementById('cliDistrict').value,
        cep: document.getElementById('cliZip').value,
        endereco: document.getElementById('cliStreet').value,
        telefone: document.getElementById('cliContact').value,
        email: document.getElementById('cliEmail').value,
        simples: document.getElementById('cliSimples').value === 'sim',
        seller: document.getElementById('cliSeller1').value === '1' ? '1 - INTERNO' : '32 - ABNAEL',
        limiteTotal: parseFloat(document.getElementById('cliCreditLimit').value) || 0,
        limiteDisponivel: parseFloat(document.getElementById('cliCreditLimit').value) || 0,
        bloqueado: document.getElementById('cliBlocked').value === 'sim',
        status: 'ativo'
    };

    if (isEdit) {
        const idx = entities.findIndex(el => el.code === code);
        if (idx >= 0) entities[idx] = { ...entities[idx], ...newClient };
    } else {
        entities.push(newClient);
    }

    localStorage.setItem('erp_clientes' + window.getTenantSuffix(), JSON.stringify(entities));

    // Dispara sincronização para a nuvem do Força de Vendas
    if (typeof window.syncERPToFVFirestore === 'function') {
        window.syncERPToFVFirestore();
    }

    alert('Cliente salvo com sucesso!');
    closeEntityModal();
    renderEntities();
};

// Listen to the form
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('entityForm');
    if (form) form.addEventListener('submit', window.saveEntity);
});
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

let employees = JSON.parse(localStorage.getItem('erp_employees' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

window.renderEmployees = (filter = '') => {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const filtered = employees.filter(e =>
        (e.name || '').toLowerCase().includes(filter.toLowerCase()) ||
        (e.code || '').toString().includes(filter)
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
                <div style="font-weight:600; color:var(--text-primary)">${e.name || ''}</div>
            </td>
            <td>${e.role || ''} / ${e.sector || ''}</td>
            <td>${e.cpf || ''}</td>
            <td><span class="status-badge status-shipped">${e.status || 'Ativo'}</span></td>
            <td style="text-align:right">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="window.editEmployee('${e.code}')">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.editEmployee = function (code) {
    const emp = employees.find(e => e.code == code);
    if (!emp) return;

    document.getElementById('empCode').value = emp.code;
    document.getElementById('empName').value = emp.name || '';
    document.getElementById('empDate').value = emp.date || '';
    document.getElementById('empCpf').value = emp.cpf || '';
    document.getElementById('empRg').value = emp.rg || '';
    document.getElementById('empSector').value = emp.sector || '';
    document.getElementById('empRole').value = emp.role || '';
    document.getElementById('empIsSeller').checked = !!emp.isSeller;
    document.getElementById('empStreet').value = emp.street || '';
    document.getElementById('empDistrict').value = emp.district || '';
    document.getElementById('empZip').value = emp.zip || '';
    document.getElementById('empCity').value = emp.city || '';
    document.getElementById('empState').value = emp.state || '';
    document.getElementById('empCell').value = emp.cell || '';
    document.getElementById('empLogin').value = emp.login || '';
    document.getElementById('empPass').value = ''; // clear password field for security
    document.getElementById('empDismissDate').value = emp.dismissDate || '';
    document.getElementById('empDismissReason').value = emp.dismissReason || '';

    openEmployeeModal();
};

window.saveEmployee = async function (e) {
    if (e) e.preventDefault();

    const codeEl = document.getElementById('empCode');
    const isEdit = codeEl.value && codeEl.value !== 'Auto' && codeEl.value !== '';
    const code = isEdit ? parseInt(codeEl.value) : Math.floor(Math.random() * 100000) + 2000;

    const tenantSuffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    const tenantId = ParreiraAuth.getTenantId() || 'parreira';

    const loginVal = document.getElementById('empLogin').value.trim().toLowerCase();
    const passVal = document.getElementById('empPass').value;
    const nameVal = document.getElementById('empName').value.trim();

    const newEmployee = {
        code: code,
        name: nameVal,
        date: document.getElementById('empDate').value,
        cpf: document.getElementById('empCpf').value.trim(),
        rg: document.getElementById('empRg').value.trim(),
        sector: document.getElementById('empSector').value.trim(),
        role: document.getElementById('empRole').value.trim(),
        isSeller: document.getElementById('empIsSeller').checked,
        street: document.getElementById('empStreet').value.trim(),
        district: document.getElementById('empDistrict').value.trim(),
        zip: document.getElementById('empZip').value.trim(),
        city: document.getElementById('empCity').value.trim(),
        state: document.getElementById('empState').value.trim(),
        cell: document.getElementById('empCell').value.trim(),
        login: loginVal,
        dismissDate: document.getElementById('empDismissDate').value,
        dismissReason: document.getElementById('empDismissReason').value.trim(),
        status: 'Ativo'
    };

    if (loginVal && passVal) {
        try {
            const db = ParreiraAuth.getDB();
            const existDoc = await db.collection('users_index').doc(loginVal).get();
            if (existDoc.exists) {
                const senhaHash = await ParreiraAuth._hash(passVal);
                await db.collection('tenants').doc(tenantId).collection('users').doc(loginVal).set({
                    nome: nameVal,
                    login: loginVal,
                    senhaHash: senhaHash,
                    role: 'supervisor',
                    pin: '',
                    modulos: ["wms", "wms-coletor", "dispatch", "erp", "sales-force", "erp-consultoria"],
                    ativo: true,
                    atualizadoEm: new Date().toISOString()
                }, { merge: true });
                console.log(`Updated user ${loginVal} in Firestore`);
            } else {
                await ParreiraAuth.criarUsuario(tenantId, {
                    nome: nameVal,
                    login: loginVal,
                    senha: passVal,
                    role: 'supervisor',
                    pin: '',
                    modulos: ["wms", "wms-coletor", "dispatch", "erp", "sales-force", "erp-consultoria"]
                });
            // Sincroniza com platform_users_registry para permitir login no portal
            const storedUsers = JSON.parse(localStorage.getItem('platform_users_registry') || '[]');
            const uIdx = storedUsers.findIndex(u => u.login === loginVal);
            const userObj = {
                login: loginVal,
                pass: passVal,
                name: nameVal,
                role: 'supervisor',
                tenant: tenantId
            };
            if (uIdx >= 0) {
                storedUsers[uIdx] = { ...storedUsers[uIdx], ...userObj };
            } else {
                storedUsers.push(userObj);
            }
            localStorage.setItem('platform_users_registry', JSON.stringify(storedUsers));

            alert(`Usuário de login "${loginVal}" foi registrado com sucesso no Firebase e localmente.`);
        } catch (err) {
            console.error('Erro ao provisionar usuário no Firestore:', err);
            alert('Atenção: Funcionário salvo localmente, mas houve um erro ao criar o login no Firebase: ' + err.message);
        }
    }

    const storageKey = 'erp_employees' + tenantSuffix;
    const localEmployees = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (isEdit) {
        const idx = localEmployees.findIndex(el => el.code === code);
        if (idx >= 0) localEmployees[idx] = { ...localEmployees[idx], ...newEmployee };
    } else {
        localEmployees.push(newEmployee);
    }

    localStorage.setItem(storageKey, JSON.stringify(localEmployees));
    employees = localEmployees;

    alert('Funcionário salvo com sucesso!');
    closeEmployeeModal();
    renderEmployees();
};

window.filterEmployees = () => {
    const term = document.getElementById('employeeSearch').value;
    renderEmployees(term);
};

// --- Dashboard Logic ---
window.renderDashboard = function () {
    // 1. Produtos
    const prods = JSON.parse(localStorage.getItem('erp_products' + window.getTenantSuffix()) || '[]'); // Fallback if mocking used erp_products
    const kpiProds = document.getElementById('kpiProdutosAtivos');
    // If erp_products is empty, maybe check products variable from app.js if it was used for mocking
    // But app.js defined 'let products = [...]' locally (line 179).
    // We should prefer localStorage if available, or fallback to local var length?
    // The local var 'products' is used by renderProducts.
    // Let's use the localStorage 'erp_products' because that's what Vendas uses.
    if (kpiProds) kpiProds.textContent = prods.length || (typeof products !== 'undefined' ? products.length : 0);

    // 2. Vendas
    const vendas = JSON.parse(localStorage.getItem('erp_vendas' + window.getTenantSuffix()) || '[]');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const totalMes = vendas.reduce((acc, v) => {
        const d = new Date(v.data || v.createdAt); // Handle different date fields
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && v.status !== 'cancelado') {
            return acc + (Number(v.totais?.totalNF || v.total || 0));
        }
        return acc;
    }, 0);

    const kpiVendas = document.getElementById('kpiVendasMes');
    if (kpiVendas) kpiVendas.textContent = totalMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

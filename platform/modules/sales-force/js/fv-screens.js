// ===========================================
// Força de Vendas 2.0 — Screen Renderers
// Dashboard CRM, Pedidos, Clientes, Novo Pedido, Sync
// ===========================================

// ---- Order State ----
let novoPedidoState = { cliente: null, itens: [], obs: '', transportadora: '', planoPagamento: '', step: 'cabecalho' };
let chartVendasFV = null;

// ---- Main Screen Router ----
function renderScreen(viewName) {
    switch (viewName) {
        case 'dashboard': renderDashboard(); break;
        case 'pedidos': renderPedidos(); break;
        case 'clientes': renderClientes(); break;
        case 'clienteDetalhe': break; // rendered directly
        case 'novoPedido': renderNovoPedido(); break;
        case 'sync': renderSync(); break;
    }
}

// ===========================================
// 1. DASHBOARD CRM
// ===========================================
function renderDashboard() {
    const el = document.getElementById('view-dashboard');
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    // Cálculos
    const totalClientes = fvData.clientes.length;
    const ativos = fvData.clientes.filter(c => c.status === 'ativo' && !c.bloqueado).length;
    const bloqueados = fvData.clientes.filter(c => c.bloqueado).length;

    const pedidosMes = fvData.pedidos.filter(p => {
        const d = new Date(p.data + 'T00:00:00');
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });
    const vendasMes = pedidosMes.reduce((s, p) => s + (p.valorTotal || 0), 0);

    const pedidosHoje = fvData.pedidos.filter(p => p.data === hojeStr);
    const vendasHoje = pedidosHoje.reduce((s, p) => s + (p.valorTotal || 0), 0);

    // Positivação: % de clientes ativos com pedido no mês
    const clientesAtivos = fvData.clientes.filter(c => c.status === 'ativo');
    const clientesComPedido = new Set(pedidosMes.map(p => p.clienteId));
    const positivacao = clientesAtivos.length > 0
        ? ((clientesComPedido.size / clientesAtivos.length) * 100).toFixed(0)
        : 0;

    el.innerHTML = `
        <div class="section-title">
            <span class="material-icons-round" style="vertical-align:middle;margin-right:6px;color:var(--primary)">insights</span>
            Painel CRM
        </div>

        <!-- KPI Grid 2x3 -->
        <div class="kpi-grid kpi-grid-3">
            <div class="kpi-card">
                <div class="kpi-icon-mini blue"><span class="material-icons-round">groups</span></div>
                <div class="kpi-label">Clientes Total</div>
                <div class="kpi-value">${totalClientes}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-icon-mini green"><span class="material-icons-round">check_circle</span></div>
                <div class="kpi-label">Ativos</div>
                <div class="kpi-value" style="color:var(--success)">${ativos}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-icon-mini red"><span class="material-icons-round">block</span></div>
                <div class="kpi-label">Bloqueados</div>
                <div class="kpi-value" style="color:var(--danger)">${bloqueados}</div>
            </div>
            <div class="kpi-card accent">
                <div class="kpi-icon-mini amber"><span class="material-icons-round">trending_up</span></div>
                <div class="kpi-label">Vendas Mês</div>
                <div class="kpi-value">${fmtMoney(vendasMes)}</div>
                <div class="kpi-sub">${pedidosMes.length} pedidos</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-icon-mini blue"><span class="material-icons-round">today</span></div>
                <div class="kpi-label">Vendas Hoje</div>
                <div class="kpi-value">${fmtMoney(vendasHoje)}</div>
                <div class="kpi-sub">${pedidosHoje.length} pedidos</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-icon-mini green"><span class="material-icons-round">storefront</span></div>
                <div class="kpi-label">Positivação</div>
                <div class="kpi-value" style="color:${positivacao >= 70 ? 'var(--success)' : positivacao >= 40 ? 'var(--warning)' : 'var(--danger)'}">${positivacao}%</div>
                <div class="kpi-sub">${clientesComPedido.size} de ${clientesAtivos.length} clientes</div>
            </div>
        </div>

        <!-- Gráfico de Vendas -->
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Evolução de Vendas</h3>
                <select id="chartPeriodo" class="select-mini" onchange="renderChartVendas()">
                    <option value="7">7 dias</option>
                    <option value="15">15 dias</option>
                    <option value="30" selected>30 dias</option>
                    <option value="90">3 meses</option>
                </select>
            </div>
            <div class="card-fv-body">
                <div style="height:220px;"><canvas id="chartVendasFV"></canvas></div>
            </div>
        </div>

        <!-- Últimos Pedidos -->
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Últimos Pedidos</h3>
                <button class="btn-sm btn-outline" onclick="navigateTo('pedidos')">Ver todos</button>
            </div>
            <div class="card-fv-body" style="padding:0">
                ${renderPedidosMini(fvData.pedidos.slice(0, 5))}
            </div>
        </div>
    `;

    renderChartVendas();
}

function renderChartVendas() {
    const ctx = document.getElementById('chartVendasFV');
    if (!ctx) return;

    const dias = parseInt(document.getElementById('chartPeriodo')?.value || '30', 10);
    const labels = [];
    const data = [];
    const hoje = new Date();

    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const label = dias <= 15
            ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : d.toLocaleDateString('pt-BR', { day: '2-digit' });
        labels.push(label);

        const total = fvData.pedidos
            .filter(p => p.data === key)
            .reduce((s, p) => s + (p.valorTotal || 0), 0);
        data.push(total);
    }

    if (chartVendasFV) chartVendasFV.destroy();
    chartVendasFV = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Vendas (R$)',
                data,
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245,158,11,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: dias <= 15 ? 4 : 2,
                pointBackgroundColor: '#f59e0b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => fmtMoney(c.raw) } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#94a3b8', callback: v => 'R$' + v, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderPedidosMini(pedidos) {
    if (!pedidos.length) return '<div class="empty-state" style="padding:1.5rem"><span class="material-icons-round">receipt_long</span><p>Nenhum pedido</p></div>';
    return pedidos.map(p => `
        <div class="list-item" onclick="viewPedido('${p.id}')" style="padding:0.75rem 1rem">
            <div class="list-icon ${getStatusColor(p.status)}"><span class="material-icons-round">receipt_long</span></div>
            <div class="list-info">
                <div class="list-title">${p.clienteNome}</div>
                <div class="list-sub">${p.id} · ${fmtDate(p.data)}</div>
            </div>
            <div class="list-right">
                <div class="list-amount">${fmtMoney(p.valorTotal)}</div>
                <span class="list-status ${p.status}">${getStatusLabel(p.status)}</span>
            </div>
        </div>
    `).join('');
}

// ===========================================
// 2. PEDIDOS
// ===========================================
function renderPedidos(filterStatus = '') {
    const el = document.getElementById('view-pedidos');

    const statusList = ['', 'orcamento', 'venda', 'enviado', 'separado', 'faturado', 'despachado'];
    const statusLabels = ['Todos', 'Orçamento', 'Venda', 'Enviado', 'Separado', 'Faturado', 'Despachado'];

    const filtered = filterStatus
        ? fvData.pedidos.filter(p => p.status === filterStatus)
        : fvData.pedidos;

    el.innerHTML = `
        <div class="tabs-scroll">
            ${statusList.map((s, i) => `
                <button class="tab-pill ${s === filterStatus ? 'active' : ''}" onclick="renderPedidos('${s}')">${statusLabels[i]}
                    <span class="tab-count">${s ? fvData.pedidos.filter(p => p.status === s).length : fvData.pedidos.length}</span>
                </button>
            `).join('')}
        </div>

        <div class="pedidos-list">
            ${filtered.length === 0
            ? '<div class="empty-state"><span class="material-icons-round">search_off</span><p>Nenhum pedido neste status</p></div>'
            : filtered.map(p => `
                    <div class="card-pedido" onclick="viewPedido('${p.id}')">
                        <div class="card-pedido-header">
                            <div>
                                <div class="card-pedido-num">${p.id}</div>
                                <div class="card-pedido-data">${fmtDate(p.data)}</div>
                            </div>
                            <span class="list-status ${p.status}">${getStatusLabel(p.status)}</span>
                        </div>
                        <div class="card-pedido-body">
                            <div class="card-pedido-cliente">
                                <span class="material-icons-round" style="font-size:1rem;color:var(--text-secondary)">person</span>
                                ${p.clienteNome}
                            </div>
                            <div class="card-pedido-info">
                                <span>${p.itens.length} ite${p.itens.length === 1 ? 'm' : 'ns'}</span>
                                <span>${p.planoPagamento}</span>
                            </div>
                        </div>
                        <div class="card-pedido-footer">
                            <span class="card-pedido-transp"><span class="material-icons-round" style="font-size:0.85rem">local_shipping</span> ${p.transportadora}</span>
                            <span class="card-pedido-total">${fmtMoney(p.valorTotal)}</span>
                        </div>
                    </div>
                `).join('')
        }
        </div>
    `;
}

function viewPedido(id) {
    const pedido = fvData.pedidos.find(p => p.id === id);
    if (!pedido) return;

    const el = document.getElementById('view-pedidos');
    el.innerHTML = `
        <button class="btn-back" onclick="renderPedidos()">
            <span class="material-icons-round">arrow_back</span> Voltar
        </button>

        <div class="card-fv" style="margin-top:0.75rem">
            <div class="card-fv-header">
                <h3>${pedido.id}</h3>
                <span class="list-status ${pedido.status}">${getStatusLabel(pedido.status)}</span>
            </div>
            <div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Cliente</span><span class="detail-value">${pedido.clienteNome}</span></div>
                    <div class="detail-item"><span class="detail-label">Tipo</span><span class="detail-value">${pedido.tipo}</span></div>
                    <div class="detail-item"><span class="detail-label">Data</span><span class="detail-value">${fmtDate(pedido.data)}</span></div>
                    <div class="detail-item"><span class="detail-label">Empresa</span><span class="detail-value">${pedido.empresa}</span></div>
                    <div class="detail-item"><span class="detail-label">Pagamento</span><span class="detail-value">${pedido.planoPagamento}</span></div>
                    <div class="detail-item"><span class="detail-label">Transportadora</span><span class="detail-value">${pedido.transportadora}</span></div>
                </div>
                ${pedido.obs ? `<div style="margin-top:0.75rem;padding:0.5rem;background:rgba(245,158,11,0.08);border-radius:8px;font-size:0.8rem;color:var(--text-secondary)"><strong>Obs:</strong> ${pedido.obs}</div>` : ''}
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-header"><h3>Itens (${pedido.itens.length})</h3></div>
            <div class="card-fv-body" style="padding:0">
                ${pedido.itens.map(item => `
                    <div class="list-item" style="padding:0.75rem 1rem">
                        <div class="list-info">
                            <div class="list-title">${item.nome}</div>
                            <div class="list-sub">${item.sku} · ${item.qtd} × ${fmtMoney(item.preco)}${item.desconto ? ' (-' + item.desconto + '%)' : ''}</div>
                        </div>
                        <div class="list-right">
                            <div class="list-amount">${fmtMoney(item.qtd * item.preco * (1 - (item.desconto || 0) / 100))}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="totalizer-bar">
            <span>Total do Pedido</span>
            <span class="totalizer-value">${fmtMoney(pedido.valorTotal)}</span>
        </div>
    `;
}

// ===========================================
// 3. CLIENTES
// ===========================================
function renderClientes(filter = '') {
    const el = document.getElementById('view-clientes');
    const term = (filter || '').toUpperCase();
    const filtered = term
        ? fvData.clientes.filter(c =>
            c.nome.toUpperCase().includes(term) ||
            c.codigo.includes(term) ||
            c.cidade.toUpperCase().includes(term) ||
            (c.rota || '').toUpperCase().includes(term)
        )
        : fvData.clientes;

    el.innerHTML = `
        <div class="search-bar">
            <span class="material-icons-round">search</span>
            <input type="text" placeholder="Buscar por nome, código, cidade ou rota..." value="${filter}" oninput="renderClientes(this.value)">
        </div>

        <div class="clientes-summary">
            <span class="summary-item"><span class="dot green"></span> ${fvData.clientes.filter(c => c.status === 'ativo' && !c.bloqueado).length} ativos</span>
            <span class="summary-item"><span class="dot red"></span> ${fvData.clientes.filter(c => c.bloqueado).length} bloqueados</span>
            <span class="summary-item"><span class="dot gray"></span> ${fvData.clientes.filter(c => c.status === 'inativo').length} inativos</span>
        </div>

        ${filtered.length === 0
            ? '<div class="empty-state"><span class="material-icons-round">search_off</span><p>Nenhum cliente encontrado</p></div>'
            : filtered.map(c => `
                <div class="card-cliente" onclick="viewCliente(${c.id})">
                    <div class="card-cliente-top">
                        <div class="cliente-avatar ${c.bloqueado ? 'blocked' : c.status === 'ativo' ? 'active' : 'inactive'}">${c.nome.charAt(0)}</div>
                        <div class="cliente-info">
                            <div class="cliente-nome">${c.nome}</div>
                            <div class="cliente-sub">${c.codigo} · ${c.cidade}/${c.uf}</div>
                        </div>
                        ${c.bloqueado ? '<span class="badge-status danger">Bloqueado</span>' : c.status === 'inativo' ? '<span class="badge-status gray">Inativo</span>' : ''}
                    </div>
                    <div class="card-cliente-bottom">
                        <span><span class="material-icons-round" style="font-size:0.8rem">route</span> ${c.rota || '-'}</span>
                        <span><span class="material-icons-round" style="font-size:0.8rem">place</span> ${c.praca || '-'}</span>
                        <span><span class="material-icons-round" style="font-size:0.8rem">payments</span> Disp: ${fmtMoney(c.limiteDisponivel)}</span>
                    </div>
                </div>
            `).join('')
        }
    `;
}

function viewCliente(id) {
    const c = fvData.clientes.find(cl => cl.id === id);
    if (!c) return;

    const pedidosCliente = fvData.pedidos.filter(p => p.clienteId === c.id);
    const totalCompras = pedidosCliente.reduce((s, p) => s + (p.valorTotal || 0), 0);

    navigateTo('clienteDetalhe');
    const el = document.getElementById('view-clienteDetalhe');

    el.innerHTML = `
        <button class="btn-back" onclick="navigateTo('clientes')">
            <span class="material-icons-round">arrow_back</span> Voltar
        </button>

        <!-- Header do Cliente -->
        <div class="cliente-header-card">
            <div class="cliente-header-top">
                <div class="cliente-avatar-lg ${c.bloqueado ? 'blocked' : 'active'}">${c.nome.charAt(0)}</div>
                <div>
                    <h3>${c.nome}</h3>
                    <p>${c.nomeFantasia || ''} · ${c.codigo}</p>
                    ${c.bloqueado ? '<span class="badge-status danger">Bloqueado - Inadimplência</span>' : '<span class="badge-status success">Ativo</span>'}
                </div>
            </div>
            <div class="cliente-header-actions">
                <button class="btn-primary btn-sm" onclick="iniciarPedidoCliente(${c.id})" ${c.bloqueado ? 'disabled style="opacity:0.5"' : ''}>
                    <span class="material-icons-round">add_shopping_cart</span> Novo Pedido
                </button>
                <a href="tel:${c.telefone}" class="btn-outline btn-sm"><span class="material-icons-round">call</span> Ligar</a>
            </div>
        </div>

        <!-- Tabs de Info -->
        <div class="tabs-scroll" style="margin-bottom:1rem">
            <button class="tab-pill active" onclick="showClienteTab('cadastro', this)">Cadastro</button>
            <button class="tab-pill" onclick="showClienteTab('comercial', this)">Comercial</button>
            <button class="tab-pill" onclick="showClienteTab('financeiro', this)">Financeiro</button>
            <button class="tab-pill" onclick="showClienteTab('historico', this)">Histórico</button>
        </div>

        <!-- Tab: Cadastro -->
        <div class="cliente-tab active" id="clienteTab-cadastro">
            <div class="card-fv"><div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Razão Social</span><span class="detail-value">${c.nome}</span></div>
                    <div class="detail-item"><span class="detail-label">Nome Fantasia</span><span class="detail-value">${c.nomeFantasia || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">${c.tipo === 'PJ' ? 'CNPJ' : 'CPF'}</span><span class="detail-value">${c.cpfCnpj}</span></div>
                    <div class="detail-item"><span class="detail-label">IE</span><span class="detail-value">${c.ie || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Endereço</span><span class="detail-value">${c.endereco}</span></div>
                    <div class="detail-item"><span class="detail-label">Cidade/UF</span><span class="detail-value">${c.cidade}/${c.uf}</span></div>
                    <div class="detail-item"><span class="detail-label">CEP</span><span class="detail-value">${c.cep}</span></div>
                    <div class="detail-item"><span class="detail-label">Telefone</span><span class="detail-value">${c.telefone}</span></div>
                    <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${c.email || '-'}</span></div>
                </div>
            </div></div>
        </div>

        <!-- Tab: Comercial -->
        <div class="cliente-tab" id="clienteTab-comercial">
            <div class="card-fv"><div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Tipo</span><span class="detail-value">${c.tipo}</span></div>
                    <div class="detail-item"><span class="detail-label">Grupo</span><span class="detail-value">${c.grupo}</span></div>
                    <div class="detail-item"><span class="detail-label">Rota</span><span class="detail-value">${c.rota || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Praça</span><span class="detail-value">${c.praca || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Tabela de Preço</span><span class="detail-value">Tabela Grupo ${c.grupo}</span></div>
                    <div class="detail-item"><span class="detail-label">Última Compra</span><span class="detail-value">${fmtDate(c.ultimaCompra)}</span></div>
                    <div class="detail-item"><span class="detail-label">Período Ativo</span><span class="detail-value">${c.status === 'ativo' ? 'Sim' : 'Não'}</span></div>
                </div>
            </div></div>
        </div>

        <!-- Tab: Financeiro -->
        <div class="cliente-tab" id="clienteTab-financeiro">
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Limite Total</div>
                    <div class="kpi-value" style="font-size:1.1rem">${fmtMoney(c.limiteTotal)}</div>
                </div>
                <div class="kpi-card ${c.limiteDisponivel <= 0 ? 'danger-bg' : ''}">
                    <div class="kpi-label">Disponível</div>
                    <div class="kpi-value" style="font-size:1.1rem;color:${c.limiteDisponivel > 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(c.limiteDisponivel)}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Dias Atraso</div>
                    <div class="kpi-value" style="font-size:1.1rem;color:${c.diasAtraso > 0 ? 'var(--danger)' : 'var(--success)'}">${c.diasAtraso}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Total Compras</div>
                    <div class="kpi-value" style="font-size:1.1rem">${fmtMoney(totalCompras)}</div>
                    <div class="kpi-sub">${pedidosCliente.length} pedidos</div>
                </div>
            </div>
            ${c.bloqueado ? '<div class="alert-danger"><span class="material-icons-round">warning</span> Cliente bloqueado por inadimplência (' + c.diasAtraso + ' dias)</div>' : ''}
        </div>

        <!-- Tab: Histórico -->
        <div class="cliente-tab" id="clienteTab-historico">
            <div class="card-fv">
                <div class="card-fv-header"><h3>Pedidos (${pedidosCliente.length})</h3></div>
                <div class="card-fv-body" style="padding:0">
                    ${pedidosCliente.length === 0
            ? '<div class="empty-state" style="padding:1.5rem"><span class="material-icons-round">receipt_long</span><p>Nenhum pedido registrado</p></div>'
            : renderPedidosMini(pedidosCliente)
        }
                </div>
            </div>
        </div>
    `;
}

function showClienteTab(tab, btn) {
    document.querySelectorAll('.cliente-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('clienteTab-' + tab)?.classList.add('active');
    if (btn) {
        btn.closest('.tabs-scroll').querySelectorAll('.tab-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

// ===========================================
// 4. NOVO PEDIDO — 3 Passos
// ===========================================
function iniciarNovoPedido() {
    novoPedidoState = { cliente: null, itens: [], obs: '', transportadora: '', planoPagamento: '', step: 'cabecalho' };
    navigateTo('novoPedido');
}

function iniciarPedidoCliente(clienteId) {
    const c = fvData.clientes.find(cl => cl.id === clienteId);
    novoPedidoState = { cliente: c, itens: [], obs: '', transportadora: '', planoPagamento: '', step: 'cabecalho' };
    navigateTo('novoPedido');
}

function renderNovoPedido() {
    const el = document.getElementById('view-novoPedido');
    const s = novoPedidoState;

    // Stepper
    const steps = ['cabecalho', 'itens', 'totais'];
    const stepLabels = ['Cabeçalho', 'Itens', 'Totais'];
    const currentIdx = steps.indexOf(s.step);

    const stepperHTML = `
        <div class="stepper">
            ${steps.map((st, i) => `
                <div class="stepper-step ${i <= currentIdx ? 'active' : ''} ${i < currentIdx ? 'done' : ''}" onclick="${i < currentIdx ? 'goToStep(\'' + st + '\')' : ''}">
                    <div class="stepper-num">${i < currentIdx ? '✓' : i + 1}</div>
                    <span>${stepLabels[i]}</span>
                </div>
                ${i < steps.length - 1 ? '<div class="stepper-line ' + (i < currentIdx ? 'active' : '') + '"></div>' : ''}
            `).join('')}
        </div>
    `;

    let bodyHTML = '';

    if (s.step === 'cabecalho') {
        bodyHTML = renderPedidoCabecalho();
    } else if (s.step === 'itens') {
        bodyHTML = renderPedidoItens();
    } else if (s.step === 'totais') {
        bodyHTML = renderPedidoTotais();
    }

    el.innerHTML = stepperHTML + bodyHTML;
}

function renderPedidoCabecalho() {
    const s = novoPedidoState;
    const c = s.cliente;

    return `
        <div class="card-fv">
            <div class="card-fv-header"><h3>Dados do Pedido</h3></div>
            <div class="card-fv-body">
                <div class="form-group">
                    <label class="form-label">Nº Pedido</label>
                    <input class="form-control" value="${gerarNumeroPedido()}" readonly style="opacity:0.6">
                </div>

                <div class="form-group">
                    <label class="form-label">Empresa</label>
                    <input class="form-control" value="${fvData.configEmpresa.nome}" readonly style="opacity:0.6">
                </div>

                <div class="form-group">
                    <label class="form-label">Cliente *</label>
                    ${c
            ? `<div class="selected-cliente">
                                <div><strong>${c.nome}</strong></div>
                                <div style="font-size:0.8rem;color:var(--text-secondary)">${c.codigo} · ${c.cidade}/${c.uf} · ${c.tipo}</div>
                                <button class="btn-sm btn-outline" style="margin-top:0.5rem" onclick="novoPedidoState.cliente=null;renderNovoPedido()">Alterar</button>
                           </div>`
            : `<div class="search-bar" style="margin-bottom:0">
                                <span class="material-icons-round">search</span>
                                <input type="text" id="npClienteSearch" placeholder="Buscar cliente..." oninput="searchClienteNP(this.value)">
                           </div>
                           <div id="npClienteResults" style="max-height:200px;overflow-y:auto"></div>`
        }
                </div>

                ${c ? `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Tipo Cliente</label>
                        <input class="form-control" value="${c.tipo}" readonly style="opacity:0.6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Grupo</label>
                        <input class="form-control" value="${c.grupo} (${c.rota})" readonly style="opacity:0.6">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Limite Total</label>
                        <input class="form-control" value="${fmtMoney(c.limiteTotal)}" readonly style="opacity:0.6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Limite Disponível</label>
                        <input class="form-control" value="${fmtMoney(c.limiteDisponivel)}" readonly style="opacity:0.6;color:${c.limiteDisponivel > 0 ? 'var(--success)' : 'var(--danger)'}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Prazo de Pagamento *</label>
                    <select class="form-control" id="npPrazoPag" onchange="novoPedidoState.planoPagamento=this.options[this.selectedIndex].text">
                        <option value="">Selecione...</option>
                        ${fvData.planosPagamento.map(pp => `<option value="${pp.id}" ${s.planoPagamento === pp.nome ? 'selected' : ''}>${pp.nome}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Transportadora *</label>
                    <select class="form-control" id="npTransp" onchange="novoPedidoState.transportadora=this.options[this.selectedIndex].text">
                        <option value="">Selecione...</option>
                        ${fvData.transportadoras.map(t => `<option value="${t.id}" ${s.transportadora === t.nome ? 'selected' : ''}>${t.nome}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Observações</label>
                    <textarea class="form-control" id="npObs" rows="2" placeholder="Observações do pedido..." oninput="novoPedidoState.obs=this.value">${s.obs}</textarea>
                </div>

                ${c.bloqueado ? '<div class="alert-danger"><span class="material-icons-round">warning</span> Cliente bloqueado! Pedido será enviado como orçamento para aprovação.</div>' : ''}

                <button class="btn-primary" onclick="avancarParaItens()" style="margin-top:1rem">
                    Incluir Itens <span class="material-icons-round">arrow_forward</span>
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

function renderPedidoItens() {
    const s = novoPedidoState;
    const c = s.cliente;
    const subtotal = s.itens.reduce((sum, item) => sum + (item.qtd * item.preco * (1 - (item.desconto || 0) / 100)), 0);

    return `
        <div class="card-fv" style="margin-bottom:0.75rem">
            <div class="card-fv-header">
                <h3>Adicionar Produto</h3>
                <span style="font-size:0.8rem;color:var(--text-secondary)">${s.itens.length} ite${s.itens.length === 1 ? 'm' : 'ns'}</span>
            </div>
            <div class="card-fv-body">
                <div class="search-bar" style="margin-bottom:0.5rem">
                    <span class="material-icons-round">search</span>
                    <input type="text" id="npProdSearch" placeholder="Buscar produto por código ou nome..." oninput="searchProdutoNP(this.value)">
                </div>
                <div id="npProdResults" style="max-height:200px;overflow-y:auto"></div>
            </div>
        </div>

        <!-- Itens Adicionados -->
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Itens do Pedido</h3>
                <span style="font-size:0.85rem;font-weight:600;color:var(--primary)">${fmtMoney(subtotal)}</span>
            </div>
            <div class="card-fv-body" style="padding:0">
                ${s.itens.length === 0
            ? '<div class="empty-state" style="padding:1.5rem"><span class="material-icons-round">shopping_cart</span><p>Nenhum item adicionado</p></div>'
            : s.itens.map((item, idx) => `
                        <div class="item-pedido">
                            <div class="item-pedido-info">
                                <div class="list-title">${item.nome}</div>
                                <div class="list-sub">${item.sku} · ${fmtMoney(item.preco)} / ${item.unidade}</div>
                            </div>
                            <div class="item-pedido-controls">
                                <button class="btn-qty" onclick="changeQtdNP(${idx}, -1)">−</button>
                                <span class="item-qty">${item.qtd}</span>
                                <button class="btn-qty" onclick="changeQtdNP(${idx}, 1)">+</button>
                                <button class="btn-qty danger" onclick="removeItemNP(${idx})"><span class="material-icons-round" style="font-size:1rem">delete</span></button>
                            </div>
                            <div class="item-pedido-total">${fmtMoney(item.qtd * item.preco * (1 - (item.desconto || 0) / 100))}</div>
                        </div>
                    `).join('')
        }
            </div>
        </div>

        <div style="display:flex;gap:0.75rem;margin-top:1rem">
            <button class="btn-outline" style="flex:1" onclick="goToStep('cabecalho')">
                <span class="material-icons-round">arrow_back</span> Cabeçalho
            </button>
            <button class="btn-primary" style="flex:1" onclick="avancarParaTotais()" ${s.itens.length === 0 ? 'disabled style="opacity:0.5;flex:1"' : ''}>
                Totais <span class="material-icons-round">arrow_forward</span>
            </button>
        </div>
    `;
}

function renderPedidoTotais() {
    const s = novoPedidoState;
    const c = s.cliente;
    const subtotal = s.itens.reduce((sum, item) => sum + (item.qtd * item.preco * (1 - (item.desconto || 0) / 100)), 0);
    const totalItens = s.itens.reduce((sum, item) => sum + item.qtd, 0);

    return `
        <div class="card-fv">
            <div class="card-fv-header"><h3>Resumo do Pedido</h3></div>
            <div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Cliente</span><span class="detail-value">${c.nome}</span></div>
                    <div class="detail-item"><span class="detail-label">Pagamento</span><span class="detail-value">${s.planoPagamento || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Transportadora</span><span class="detail-value">${s.transportadora || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Qtd Itens</span><span class="detail-value">${totalItens} un (${s.itens.length} produtos)</span></div>
                </div>
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-body">
                <div class="totalizer-row"><span>Subtotal Produtos</span><span>${fmtMoney(subtotal)}</span></div>
                <div class="totalizer-row"><span>Desconto</span><span style="color:var(--success)">R$ 0,00</span></div>
                <div class="totalizer-row"><span>Frete</span><span>A calcular</span></div>
                <div class="totalizer-divider"></div>
                <div class="totalizer-row total"><span>TOTAL DO PEDIDO</span><span>${fmtMoney(subtotal)}</span></div>
            </div>
        </div>

        ${c.bloqueado ? '<div class="alert-danger" style="margin-bottom:1rem"><span class="material-icons-round">warning</span> Pedido será salvo como <strong>Orçamento</strong> (cliente bloqueado)</div>' : ''}

        <div style="display:flex;gap:0.75rem">
            <button class="btn-outline" style="flex:1" onclick="goToStep('itens')">
                <span class="material-icons-round">arrow_back</span> Itens
            </button>
            <button class="btn-primary" style="flex:1" onclick="finalizarPedido()">
                <span class="material-icons-round">check</span> Enviar Pedido
            </button>
        </div>
    `;
}

// ---- Pedido Helpers ----
function goToStep(step) {
    novoPedidoState.step = step;
    renderNovoPedido();
}

function searchClienteNP(query) {
    const res = document.getElementById('npClienteResults');
    if (!res) return;
    const term = query.toUpperCase().trim();
    if (!term) { res.innerHTML = ''; return; }

    const matches = fvData.clientes.filter(c =>
        c.nome.toUpperCase().includes(term) || c.codigo.includes(term)
    ).slice(0, 8);

    res.innerHTML = matches.map(c => `
        <div class="list-item" onclick="selectClienteNP(${c.id})" style="padding:0.6rem 0">
            <div class="list-info">
                <div class="list-title">${c.nome}</div>
                <div class="list-sub">${c.codigo} · ${c.cidade} · ${c.rota}</div>
            </div>
            ${c.bloqueado ? '<span class="badge-status danger" style="font-size:0.65rem">Bloq.</span>' : ''}
        </div>
    `).join('');
}

function selectClienteNP(id) {
    novoPedidoState.cliente = fvData.clientes.find(c => c.id === id);
    renderNovoPedido();
}

function avancarParaItens() {
    const s = novoPedidoState;
    if (!s.cliente) { showToast('Selecione um cliente'); return; }

    // Capturar valores dos selects
    const ppEl = document.getElementById('npPrazoPag');
    const trEl = document.getElementById('npTransp');
    if (ppEl && ppEl.value) s.planoPagamento = ppEl.options[ppEl.selectedIndex].text;
    if (trEl && trEl.value) s.transportadora = trEl.options[trEl.selectedIndex].text;

    if (!s.planoPagamento) { showToast('Selecione o prazo de pagamento'); return; }
    if (!s.transportadora) { showToast('Selecione a transportadora'); return; }

    const obsEl = document.getElementById('npObs');
    if (obsEl) s.obs = obsEl.value;

    s.step = 'itens';
    renderNovoPedido();
}

function searchProdutoNP(query) {
    const res = document.getElementById('npProdResults');
    if (!res) return;
    const term = query.toUpperCase().trim();
    if (!term) { res.innerHTML = ''; return; }

    const c = novoPedidoState.cliente;
    const matches = fvData.produtos.filter(p =>
        p.nome.toUpperCase().includes(term) || p.sku.toUpperCase().includes(term)
    ).slice(0, 8);

    res.innerHTML = matches.map(p => {
        const preco = getPrecoCliente(p, c);
        const jaAdicionado = novoPedidoState.itens.some(i => i.sku === p.sku);
        return `
            <div class="list-item" onclick="${jaAdicionado ? '' : 'addProdutoNP(\'' + p.sku + '\')'}" style="padding:0.6rem 0;${jaAdicionado ? 'opacity:0.5' : ''}">
                <div class="list-info">
                    <div class="list-title">${p.nome}</div>
                    <div class="list-sub">${p.sku} · Est: ${p.estoque} ${p.unidade} · ${p.grupo}</div>
                </div>
                <div class="list-right">
                    <div class="list-amount">${fmtMoney(preco)}</div>
                    ${jaAdicionado ? '<span style="font-size:0.7rem;color:var(--success)">Adicionado</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function addProdutoNP(sku) {
    const p = fvData.produtos.find(pr => pr.sku === sku);
    if (!p) return;
    const c = novoPedidoState.cliente;
    const preco = getPrecoCliente(p, c);
    novoPedidoState.itens.push({ sku: p.sku, nome: p.nome, unidade: p.unidade, qtd: 1, preco, desconto: 0 });
    showToast(p.nome + ' adicionado');
    renderNovoPedido();
}

function changeQtdNP(idx, delta) {
    const item = novoPedidoState.itens[idx];
    if (!item) return;
    item.qtd = Math.max(1, item.qtd + delta);
    renderNovoPedido();
}

function removeItemNP(idx) {
    novoPedidoState.itens.splice(idx, 1);
    renderNovoPedido();
}

function avancarParaTotais() {
    if (novoPedidoState.itens.length === 0) { showToast('Adicione pelo menos um item'); return; }
    novoPedidoState.step = 'totais';
    renderNovoPedido();
}

function finalizarPedido() {
    const s = novoPedidoState;
    const subtotal = s.itens.reduce((sum, item) => sum + (item.qtd * item.preco * (1 - (item.desconto || 0) / 100)), 0);

    const pedido = {
        id: gerarNumeroPedido(),
        data: new Date().toISOString().split('T')[0],
        clienteId: s.cliente.id,
        clienteNome: s.cliente.nome,
        tipo: s.cliente.tipo,
        empresa: fvData.configEmpresa.nome,
        transportadora: s.transportadora,
        planoPagamento: s.planoPagamento,
        status: s.cliente.bloqueado ? 'orcamento' : 'venda',
        itens: [...s.itens],
        obs: s.obs,
        valorTotal: +subtotal.toFixed(2)
    };

    fvData.pedidos.unshift(pedido);
    saveFVData();
    updateBadges();

    showToast('Pedido ' + pedido.id + ' criado com sucesso!');
    navigateTo('pedidos');
}

// ===========================================
// 5. SINCRONIZAÇÃO
// ===========================================
function renderSync() {
    const el = document.getElementById('view-sync');
    const lastSync = fvData.lastSync ? new Date(fvData.lastSync).toLocaleString('pt-BR') : 'Nunca sincronizado';

    el.innerHTML = `
        <div class="sync-status-card">
            <span class="material-icons-round" style="font-size:3rem;color:${fvData.lastSync ? 'var(--success)' : 'var(--warning)'}">
                ${fvData.lastSync ? 'cloud_done' : 'cloud_off'}
            </span>
            <h3>Status da Sincronização</h3>
            <p>Última sync: <strong>${lastSync}</strong></p>
        </div>

        <!-- Sync Total -->
        <div class="card-fv">
            <div class="card-fv-header"><h3>Sincronização Completa</h3></div>
            <div class="card-fv-body">
                <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem">Sincroniza todos os dados de uma vez: clientes, produtos, preços, financeiro, pedidos.</p>
                <button class="btn-primary" onclick="doSyncTotal()">
                    <span class="material-icons-round">sync</span> Sincronizar Tudo
                </button>
            </div>
        </div>

        <!-- Sync Parcial -->
        <div class="card-fv">
            <div class="card-fv-header"><h3>Sincronização por Setor</h3></div>
            <div class="card-fv-body">
                <div class="sync-sectors">
                    <button class="sync-sector-btn" onclick="doSyncSetor('comercial')">
                        <span class="material-icons-round">storefront</span>
                        <span>Comercial</span>
                        <span class="sync-sector-sub">Clientes, Tabelas de Preço, Produtos</span>
                    </button>
                    <button class="sync-sector-btn" onclick="doSyncSetor('financeiro')">
                        <span class="material-icons-round">account_balance</span>
                        <span>Financeiro</span>
                        <span class="sync-sector-sub">Limites, Títulos Abertos, Planos Pgto</span>
                    </button>
                    <button class="sync-sector-btn" onclick="doSyncSetor('logistico')">
                        <span class="material-icons-round">local_shipping</span>
                        <span>Logístico</span>
                        <span class="sync-sector-sub">Transportadoras, Rotas, Praças</span>
                    </button>
                    <button class="sync-sector-btn" onclick="doSyncSetor('pedidos')">
                        <span class="material-icons-round">receipt_long</span>
                        <span>Pedidos</span>
                        <span class="sync-sector-sub">Status atualizado dos pedidos enviados</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function doSyncTotal() {
    showToast('Sincronizando todos os dados...');
    const indicator = document.getElementById('syncIndicator');
    indicator.classList.add('syncing');
    indicator.querySelector('.material-icons-round').textContent = 'sync';

    setTimeout(() => {
        fvData.lastSync = new Date().toISOString();
        saveFVData();
        indicator.classList.remove('syncing');
        indicator.querySelector('.material-icons-round').textContent = 'cloud_done';
        showToast('✅ Sincronização completa realizada!');
        renderSync();
    }, 2000);
}

function doSyncSetor(setor) {
    const labels = { comercial: 'Comercial', financeiro: 'Financeiro', logistico: 'Logístico', pedidos: 'Pedidos' };
    showToast('Sincronizando ' + labels[setor] + '...');

    setTimeout(() => {
        fvData.lastSync = new Date().toISOString();
        saveFVData();
        showToast('✅ ' + labels[setor] + ' sincronizado!');
        renderSync();
    }, 1500);
}

// ===========================================
// HELPERS
// ===========================================
function getStatusLabel(status) {
    const map = {
        orcamento: 'Orçamento',
        venda: 'Venda',
        enviado: 'Enviado',
        separado: 'Separado',
        faturado: 'Faturado',
        despachado: 'Despachado',
        cancelado: 'Cancelado'
    };
    return map[status] || status;
}

function getStatusColor(status) {
    const map = {
        orcamento: 'amber',
        venda: 'blue',
        enviado: 'blue',
        separado: 'blue',
        faturado: 'green',
        despachado: 'green',
        cancelado: 'red'
    };
    return map[status] || 'gray';
}

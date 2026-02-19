// ===========================================
// Força de Vendas 2.1 — Screen Renderers
// Dashboard CRM, Pedidos, Clientes, Novo Pedido, Sync
// Multi-Empresa, IPI, Fila Offline
// ===========================================

// ---- Order State ----
let novoPedidoState = { cliente: null, itens: [], obs: '', transportadora: '', planoPagamento: '', codEmpresa: '01', stpPedido: 'Pre-Venda', idFormPg: 0, codfornecTransp: 0, step: 'cabecalho' };
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

    // Meta do vendedor
    const meta = fvUser?.valorMeta || 50000;
    const metaPct = meta > 0 ? Math.min(100, ((vendasMes / meta) * 100)).toFixed(0) : 0;
    const metaColor = metaPct >= 100 ? 'var(--success)' : metaPct >= 60 ? 'var(--warning)' : 'var(--danger)';

    // Sync queue
    const queueCount = fvData.syncQueueCount || 0;

    el.innerHTML = `
        <div class="section-title">
            <span class="material-icons-round" style="vertical-align:middle;margin-right:6px;color:var(--primary)">insights</span>
            Painel CRM
            ${queueCount > 0 ? `<span class="sync-queue-badge" onclick="navigateTo('sync')" title="${queueCount} pendente(s)">
                <span class="material-icons-round" style="font-size:0.85rem">cloud_upload</span> ${queueCount}
            </span>` : ''}
        </div>

        <!-- Meta do Vendedor -->
        <div class="card-fv meta-card">
            <div class="card-fv-body" style="padding:0.75rem 1rem">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                        <span class="material-icons-round" style="color:var(--primary);font-size:1.2rem">flag</span>
                        <span style="font-weight:600;font-size:0.85rem">Meta Mensal</span>
                    </div>
                    <span style="font-size:0.8rem;color:var(--text-secondary)">${fmtMoney(vendasMes)} / ${fmtMoney(meta)}</span>
                </div>
                <div class="meta-progress-bar">
                    <div class="meta-progress-fill" style="width:${metaPct}%;background:${metaColor}"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:0.35rem">
                    <span style="font-size:0.75rem;color:var(--text-secondary)">${metaPct}% atingido</span>
                    <span style="font-size:0.75rem;font-weight:600;color:${metaColor}">${metaPct >= 100 ? '🎯 Meta batida!' : 'Faltam ' + fmtMoney(Math.max(0, meta - vendasMes))}</span>
                </div>
            </div>
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
    const tipoLabel = pedido.stpPedido || 'Pre-Venda';
    const syncLabel = pedido.sincronizado === 'E' ? '<span style="color:var(--success)">Enviado</span>' : '<span style="color:var(--warning)">Pendente</span>';

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
                    <div class="detail-item"><span class="detail-label">CNPJ/CPF</span><span class="detail-value">${pedido.clienteCnpjCpf || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Tipo Pedido</span><span class="detail-value">${tipoLabel}</span></div>
                    <div class="detail-item"><span class="detail-label">Data</span><span class="detail-value">${fmtDate(pedido.data)}</span></div>
                    <div class="detail-item"><span class="detail-label">Empresa</span><span class="detail-value">${pedido.empresa} (${pedido.codEmpresa || '01'})</span></div>
                    <div class="detail-item"><span class="detail-label">Pagamento</span><span class="detail-value">${pedido.planoPagamento}</span></div>
                    <div class="detail-item"><span class="detail-label">Transportadora</span><span class="detail-value">${pedido.transportadora}</span></div>
                    <div class="detail-item"><span class="detail-label">Sync</span><span class="detail-value">${syncLabel}</span></div>
                    ${pedido.statusNota ? `<div class="detail-item"><span class="detail-label">Nota Fiscal</span><span class="detail-value">${pedido.statusNota}</span></div>` : ''}
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
                            <div class="list-sub">${item.sku} · ${item.qtd} × ${fmtMoney(item.preco)}${item.desconto ? ' (-' + item.desconto + '%)' : ''}${item.ipi ? ' +IPI ' + item.ipi + '%' : ''}</div>
                        </div>
                        <div class="list-right">
                            <div class="list-amount">${fmtMoney(item.qtd * item.preco * (1 - (item.desconto || 0) / 100))}</div>
                            ${item.valorIpi ? `<div style="font-size:0.7rem;color:var(--text-secondary)">IPI: ${fmtMoney(item.valorIpi)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-body">
                <div class="totalizer-row"><span>Subtotal Produtos</span><span>${fmtMoney(pedido.valorTotal)}</span></div>
                ${pedido.totalIpi ? `<div class="totalizer-row"><span>Total IPI</span><span style="color:var(--warning)">${fmtMoney(pedido.totalIpi)}</span></div>` : ''}
                ${pedido.porDesconto ? `<div class="totalizer-row"><span>Desconto (${pedido.porDesconto}%)</span><span style="color:var(--success)">-${fmtMoney(pedido.valorTotal * pedido.porDesconto / 100)}</span></div>` : ''}
                <div class="totalizer-divider"></div>
                <div class="totalizer-row total"><span>TOTAL + IPI</span><span>${fmtMoney((pedido.valorTotal || 0) + (pedido.totalIpi || 0))}</span></div>
            </div>
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
            (c.cnpjCpf || '').includes(term) ||
            String(c.rota || '').includes(term)
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
                        <span><span class="material-icons-round" style="font-size:0.8rem">route</span> Rota ${c.rota || '-'}</span>
                        <span><span class="material-icons-round" style="font-size:0.8rem">place</span> ${c.praca || '-'}</span>
                        <span><span class="material-icons-round" style="font-size:0.8rem">payments</span> Disp: ${fmtMoney(getLimiteCreditoDisponivel ? getLimiteCreditoDisponivel(c) : c.limiteDisponivel)}</span>
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
    const limiteDinamico = getLimiteCreditoDisponivel ? getLimiteCreditoDisponivel(c) : c.limiteDisponivel;
    const empresaNome = fvData.empresas?.find(e => e.codEmpresa === c.codEmpresa)?.nome || c.codEmpresa || '-';

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
                    <p>${c.fantasia || c.nomeFantasia || ''} · ${c.codigo}</p>
                    ${c.bloqueado ? '<span class="badge-status danger">Bloqueado - Inadimplência</span>' : '<span class="badge-status success">Ativo</span>'}
                </div>
            </div>
            <div class="cliente-header-actions">
                <button class="btn-primary btn-sm" onclick="iniciarPedidoCliente(${c.id})" ${c.bloqueado ? 'disabled style="opacity:0.5"' : ''}>
                    <span class="material-icons-round">add_shopping_cart</span> Novo Pedido
                </button>
                <a href="tel:${c.telefone}" class="btn-outline btn-sm"><span class="material-icons-round">call</span> Ligar</a>
                ${c.celular ? `<a href="https://wa.me/55${(c.celular || '').replace(/\D/g, '')}" class="btn-outline btn-sm" style="color:#25D366"><span class="material-icons-round">chat</span> WhatsApp</a>` : ''}
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
                    <div class="detail-item"><span class="detail-label">Razão Social</span><span class="detail-value">${c.razaoSocial || c.nome}</span></div>
                    <div class="detail-item"><span class="detail-label">Nome Fantasia</span><span class="detail-value">${c.fantasia || c.nomeFantasia || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">${c.tipoCliente === 'JURIDICA' || c.tipo === 'PJ' ? 'CNPJ' : 'CPF'}</span><span class="detail-value">${c.cnpjCpf || c.cpfCnpj || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">I.E.</span><span class="detail-value">${c.inscEstadual || c.ie || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Endereço</span><span class="detail-value">${c.endereco}, ${c.bairro || ''}</span></div>
                    <div class="detail-item"><span class="detail-label">Cidade/UF</span><span class="detail-value">${c.cidade}/${c.uf}</span></div>
                    <div class="detail-item"><span class="detail-label">CEP</span><span class="detail-value">${c.cep}</span></div>
                    <div class="detail-item"><span class="detail-label">Telefone</span><span class="detail-value">${c.telefone}</span></div>
                    <div class="detail-item"><span class="detail-label">Celular</span><span class="detail-value">${c.celular || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${c.email || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Comprador</span><span class="detail-value">${c.comprador || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Empresa</span><span class="detail-value">${empresaNome}</span></div>
                </div>
            </div></div>
        </div>

        <!-- Tab: Comercial -->
        <div class="cliente-tab" id="clienteTab-comercial">
            <div class="card-fv"><div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Tipo</span><span class="detail-value">${c.tipoCliente || c.tipo}</span></div>
                    <div class="detail-item"><span class="detail-label">Grupo</span><span class="detail-value">${c.grupo}</span></div>
                    <div class="detail-item"><span class="detail-label">Rota</span><span class="detail-value">Rota ${c.rota || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Região</span><span class="detail-value">${c.regiao || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Praça</span><span class="detail-value">${c.praca || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Tabela de Preço</span><span class="detail-value">Tabela Grupo ${c.grupo}</span></div>
                    <div class="detail-item"><span class="detail-label">Forma Pgto Pref.</span><span class="detail-value">${fvData.planosPagamento?.find(p => p.id === c.idFormPg)?.nome || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Última Compra</span><span class="detail-value">${fmtDate(c.ultimaCompra)}</span></div>
                    <div class="detail-item"><span class="detail-label">Dia de Visita</span><span class="detail-value">${c.visita || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${c.status === 'ativo' ? '✅ Ativo' : '❌ Inativo'}</span></div>
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
                <div class="kpi-card ${limiteDinamico <= 0 ? 'danger-bg' : ''}">
                    <div class="kpi-label">Disponível</div>
                    <div class="kpi-value" style="font-size:1.1rem;color:${limiteDinamico > 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(limiteDinamico)}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Ped. Não Fatur.</div>
                    <div class="kpi-value" style="font-size:1.1rem;color:var(--warning)">${fmtMoney(c.pedidoNaoFaturado || 0)}</div>
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
    const defaultEmpresa = fvData.empresas?.[0]?.codEmpresa || '01';
    novoPedidoState = { cliente: null, itens: [], obs: '', transportadora: '', planoPagamento: '', codEmpresa: defaultEmpresa, stpPedido: 'Pre-Venda', idFormPg: 0, codfornecTransp: 0, step: 'cabecalho' };
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
    const limiteDinamico = c && getLimiteCreditoDisponivel ? getLimiteCreditoDisponivel(c) : (c?.limiteDisponivel || 0);
    const empresas = fvData.empresas || [{ codEmpresa: '01', nome: fvData.configEmpresa?.nome || 'Empresa 01' }];

    return `
        <div class="card-fv">
            <div class="card-fv-header"><h3>Dados do Pedido</h3></div>
            <div class="card-fv-body">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Nº Pedido</label>
                        <input class="form-control" value="${gerarNumeroPedido()}" readonly style="opacity:0.6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo Pedido *</label>
                        <select class="form-control" id="npTipoPedido" onchange="novoPedidoState.stpPedido=this.value">
                            <option value="Pre-Venda" ${s.stpPedido === 'Pre-Venda' ? 'selected' : ''}>Pré-Venda</option>
                            <option value="Venda" ${s.stpPedido === 'Venda' ? 'selected' : ''}>Venda</option>
                            <option value="Bonificacao" ${s.stpPedido === 'Bonificacao' ? 'selected' : ''}>Bonificação</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Empresa *</label>
                    <select class="form-control" id="npEmpresa" onchange="novoPedidoState.codEmpresa=this.value">
                        ${empresas.map(e => `<option value="${e.codEmpresa}" ${s.codEmpresa === e.codEmpresa ? 'selected' : ''}>${e.nome} (${e.codEmpresa})</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Cliente *</label>
                    ${c
            ? `<div class="selected-cliente">
                                <div><strong>${c.nome}</strong></div>
                                <div style="font-size:0.8rem;color:var(--text-secondary)">${c.cnpjCpf || c.cpfCnpj || '-'} · ${c.codigo} · ${c.cidade}/${c.uf}</div>
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
                        <input class="form-control" value="${c.tipoCliente || c.tipo}" readonly style="opacity:0.6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Grupo / Rota</label>
                        <input class="form-control" value="${c.grupo} / Rota ${c.rota}" readonly style="opacity:0.6">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Limite Total</label>
                        <input class="form-control" value="${fmtMoney(c.limiteTotal)}" readonly style="opacity:0.6">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Limite Disponível</label>
                        <input class="form-control" value="${fmtMoney(limiteDinamico)}" readonly style="opacity:0.6;color:${limiteDinamico > 0 ? 'var(--success)' : 'var(--danger)'}">
                    </div>
                </div>

                ${c.pedidoNaoFaturado ? `
                <div class="alert-warning" style="margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;background:rgba(245,158,11,0.1);border-radius:8px;font-size:0.8rem">
                    <span class="material-icons-round" style="font-size:1rem;color:var(--warning)">info</span>
                    Ped. Não Faturado: ${fmtMoney(c.pedidoNaoFaturado)}
                </div>
                ` : ''}

                <div class="form-group">
                    <label class="form-label">Prazo de Pagamento *</label>
                    <select class="form-control" id="npPrazoPag" onchange="novoPedidoState.planoPagamento=this.options[this.selectedIndex].text;novoPedidoState.idFormPg=parseInt(this.value)">
                        <option value="">Selecione...</option>
                        ${fvData.planosPagamento.map(pp => `<option value="${pp.id}" ${s.planoPagamento === pp.nome ? 'selected' : ''}>${pp.nome}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label">Transportadora *</label>
                    <select class="form-control" id="npTransp" onchange="novoPedidoState.transportadora=this.options[this.selectedIndex].text;novoPedidoState.codfornecTransp=parseInt(this.value)">
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
    const totalIpi = s.itens.reduce((sum, item) => sum + (item.valorIpi || 0), 0);

    return `
        <div class="card-fv" style="margin-bottom:0.75rem">
            <div class="card-fv-header">
                <h3>Adicionar Produto</h3>
                <span style="font-size:0.8rem;color:var(--text-secondary)">${s.itens.length} ite${s.itens.length === 1 ? 'm' : 'ns'}</span>
            </div>
            <div class="card-fv-body">
                <div class="search-bar" style="margin-bottom:0.5rem">
                    <span class="material-icons-round">search</span>
                    <input type="text" id="npProdSearch" placeholder="Buscar produto por código, nome ou EAN..." oninput="searchProdutoNP(this.value)">
                </div>
                <div id="npProdResults" style="max-height:200px;overflow-y:auto"></div>
            </div>
        </div>

        <!-- Itens Adicionados -->
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Itens do Pedido</h3>
                <div style="text-align:right">
                    <div style="font-size:0.85rem;font-weight:600;color:var(--primary)">${fmtMoney(subtotal)}</div>
                    ${totalIpi > 0 ? `<div style="font-size:0.7rem;color:var(--text-secondary)">+IPI: ${fmtMoney(totalIpi)}</div>` : ''}
                </div>
            </div>
            <div class="card-fv-body" style="padding:0">
                ${s.itens.length === 0
            ? '<div class="empty-state" style="padding:1.5rem"><span class="material-icons-round">shopping_cart</span><p>Nenhum item adicionado</p></div>'
            : s.itens.map((item, idx) => `
                        <div class="item-pedido">
                            <div class="item-pedido-info">
                                <div class="list-title">${item.nome}</div>
                                <div class="list-sub">${item.sku} · ${fmtMoney(item.preco)} / ${item.unidade}${item.ipi ? ' · IPI ' + item.ipi + '%' : ''}${item.descontoMax ? ' · Desc.Max ' + item.descontoMax + '%' : ''}</div>
                            </div>
                            <div class="item-pedido-controls">
                                <button class="btn-qty" onclick="changeQtdNP(${idx}, -1)">−</button>
                                <span class="item-qty">${item.qtd}</span>
                                <button class="btn-qty" onclick="changeQtdNP(${idx}, 1)">+</button>
                                <button class="btn-qty danger" onclick="removeItemNP(${idx})"><span class="material-icons-round" style="font-size:1rem">delete</span></button>
                            </div>
                            <div class="item-pedido-total">
                                <div>${fmtMoney(item.qtd * item.preco * (1 - (item.desconto || 0) / 100))}</div>
                                ${item.valorIpi ? `<div style="font-size:0.65rem;color:var(--text-secondary)">IPI: ${fmtMoney(item.valorIpi)}</div>` : ''}
                            </div>
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
    const totalIpi = s.itens.reduce((sum, item) => sum + (item.valorIpi || 0), 0);
    const totalGeral = subtotal + totalIpi;
    const empresaNome = fvData.empresas?.find(e => e.codEmpresa === s.codEmpresa)?.nome || s.codEmpresa;

    return `
        <div class="card-fv">
            <div class="card-fv-header"><h3>Resumo do Pedido</h3></div>
            <div class="card-fv-body">
                <div class="detail-grid">
                    <div class="detail-item"><span class="detail-label">Cliente</span><span class="detail-value">${c.nome}</span></div>
                    <div class="detail-item"><span class="detail-label">CNPJ/CPF</span><span class="detail-value">${c.cnpjCpf || c.cpfCnpj || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Tipo Pedido</span><span class="detail-value">${s.stpPedido}</span></div>
                    <div class="detail-item"><span class="detail-label">Empresa</span><span class="detail-value">${empresaNome} (${s.codEmpresa})</span></div>
                    <div class="detail-item"><span class="detail-label">Pagamento</span><span class="detail-value">${s.planoPagamento || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Transportadora</span><span class="detail-value">${s.transportadora || '-'}</span></div>
                    <div class="detail-item"><span class="detail-label">Qtd Itens</span><span class="detail-value">${totalItens} un (${s.itens.length} produtos)</span></div>
                </div>
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-body">
                <div class="totalizer-row"><span>Subtotal Produtos</span><span>${fmtMoney(subtotal)}</span></div>
                ${totalIpi > 0 ? `<div class="totalizer-row"><span>Total IPI</span><span style="color:var(--warning)">${fmtMoney(totalIpi)}</span></div>` : ''}
                <div class="totalizer-row"><span>Desconto</span><span style="color:var(--success)">R$ 0,00</span></div>
                <div class="totalizer-row"><span>Frete</span><span>A calcular</span></div>
                <div class="totalizer-divider"></div>
                <div class="totalizer-row total"><span>TOTAL DO PEDIDO</span><span>${fmtMoney(totalGeral)}</span></div>
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
        p.nome.toUpperCase().includes(term) || p.sku.toUpperCase().includes(term) || (p.ean13 || '').includes(term)
    ).slice(0, 8);

    res.innerHTML = matches.map(p => {
        const preco = getPrecoCliente(p, c);
        const jaAdicionado = novoPedidoState.itens.some(i => i.sku === p.sku);
        return `
            <div class="list-item" onclick="${jaAdicionado ? '' : 'addProdutoNP(\'' + p.sku + '\')'}" style="padding:0.6rem 0;${jaAdicionado ? 'opacity:0.5' : ''}">
                <div class="list-info">
                    <div class="list-title">${p.nome}</div>
                    <div class="list-sub">${p.sku}${p.ean13 ? ' · EAN ' + p.ean13 : ''} · Est: ${p.estoque} ${p.unidade}${p.ipi ? ' · IPI ' + p.ipi + '%' : ''}</div>
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
    const ipi = p.ipi || 0;
    const descontoMax = getDescontoMaxPermitido ? getDescontoMaxPermitido(p) : (p.descontoMaxProd || 0);
    const netValue = preco;
    const valorIpi = ipi > 0 ? +(netValue * ipi / 100).toFixed(2) : 0;
    novoPedidoState.itens.push({ sku: p.sku, nome: p.nome, unidade: p.unidade, qtd: 1, preco, desconto: 0, ipi, descontoMax, valorIpi });
    showToast(p.nome + ' adicionado');
    renderNovoPedido();
}

function changeQtdNP(idx, delta) {
    const item = novoPedidoState.itens[idx];
    if (!item) return;
    item.qtd = Math.max(1, item.qtd + delta);
    // Recalculate IPI
    if (item.ipi > 0) {
        const netValue = item.qtd * item.preco * (1 - (item.desconto || 0) / 100);
        item.valorIpi = +(netValue * item.ipi / 100).toFixed(2);
    }
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
    const totalIpi = s.itens.reduce((sum, item) => sum + (item.valorIpi || 0), 0);
    const empresaNome = fvData.empresas?.find(e => e.codEmpresa === s.codEmpresa)?.nome || fvData.configEmpresa?.nome || s.codEmpresa;

    const pedido = {
        id: gerarNumeroPedido(),
        data: new Date().toISOString().split('T')[0],
        clienteId: s.cliente.id,
        clienteNome: s.cliente.nome,
        clienteCnpjCpf: s.cliente.cnpjCpf || s.cliente.cpfCnpj || '',
        tipo: s.cliente.tipoCliente || s.cliente.tipo,
        stpPedido: s.stpPedido,
        codEmpresa: s.codEmpresa,
        empresa: empresaNome,
        transportadora: s.transportadora,
        codfornecTransp: s.codfornecTransp,
        planoPagamento: s.planoPagamento,
        idFormPg: s.idFormPg,
        status: s.cliente.bloqueado ? 'orcamento' : 'venda',
        itens: [...s.itens],
        obs: s.obs,
        valorTotal: +subtotal.toFixed(2),
        totalIpi: +totalIpi.toFixed(2),
        sincronizado: 'N'
    };

    fvData.pedidos.unshift(pedido);

    // Use savePedido if available (enqueues sync), otherwise saveFVData
    if (typeof savePedido === 'function') {
        savePedido(pedido);
    } else {
        saveFVData();
    }
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
    const queueCount = fvData.syncQueueCount || 0;

    el.innerHTML = `
        <div class="sync-status-card">
            <span class="material-icons-round" style="font-size:3rem;color:${fvData.lastSync ? 'var(--success)' : 'var(--warning)'}">
                ${fvData.lastSync ? 'cloud_done' : 'cloud_off'}
            </span>
            <h3>Status da Sincronização</h3>
            <p>Última sync: <strong>${lastSync}</strong></p>
        </div>

        <!-- Fila Offline -->
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Fila Offline</h3>
                <span class="sync-queue-count ${queueCount > 0 ? 'has-items' : ''}">${queueCount} pendente${queueCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="card-fv-body">
                ${queueCount > 0
            ? `<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem">
                        Existem <strong>${queueCount}</strong> operações aguardando envio ao servidor. Essas operações foram salvas localmente (IndexedDB) e serão enviadas automaticamente quando houver conexão.
                      </p>
                      <div class="sync-queue-info">
                          <div class="sync-queue-item">
                              <span class="material-icons-round" style="color:var(--warning);font-size:1.1rem">pending</span>
                              <span>Pedidos, clientes e alterações aguardando sync</span>
                          </div>
                      </div>`
            : `<div style="display:flex;align-items:center;gap:0.5rem;color:var(--success);font-size:0.85rem">
                          <span class="material-icons-round">check_circle</span>
                          Nenhuma operação pendente. Tudo sincronizado!
                      </div>`
        }
            </div>
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

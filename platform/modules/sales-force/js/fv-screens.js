// ===========================================
// Força de Vendas — Screen Renderers
// Dashboard, Clientes, Catálogo, Pedidos,
// Novo Pedido, Metas, Rotas
// ===========================================

// ---- Current order state ----
let novoPedidoState = { cliente: null, itens: [], obs: '' };

// ---- Main Screen Router ----
window.renderScreen = function (viewName) {
    switch (viewName) {
        case 'dashboard': renderDashboard(); break;
        case 'clientes': renderClientes(); break;
        case 'catalogo': renderCatalogo(); break;
        case 'pedidos': renderPedidos(); break;
        case 'novoPedido': renderNovoPedido(); break;
        case 'metas': renderMetas(); break;
        case 'rotas': renderRotas(); break;
    }
};

// ===========================================
// 1. DASHBOARD
// ===========================================
function renderDashboard() {
    const v = document.getElementById('view-dashboard');
    const pedidos = fvData.pedidos;
    const hoje = new Date().toISOString().split('T')[0];
    const mesAtual = hoje.substring(0, 7);

    const pedidosMes = pedidos.filter(p => p.data.startsWith(mesAtual));
    const totalMes = pedidosMes.reduce((a, p) => a + (p.total || 0), 0);
    const pendentes = pedidos.filter(p => p.status === 'pendente').length;
    const ticketMedio = pedidosMes.length > 0 ? totalMes / pedidosMes.length : 0;
    const meta = fvData.metas?.mensal || 50000;
    const pctMeta = Math.min((totalMes / meta) * 100, 100);

    const lastSync = localStorage.getItem(FV_SYNC_KEY);
    const syncText = lastSync ? new Date(lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca';

    v.innerHTML = `
        <div class="kpi-grid">
            <div class="kpi-card accent">
                <span class="kpi-label">Vendas Mês</span>
                <span class="kpi-value">${fmtMoney(totalMes)}</span>
                <span class="kpi-sub">${pedidosMes.length} pedidos</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Meta Mensal</span>
                <span class="kpi-value">${pctMeta.toFixed(0)}%</span>
                <div class="progress-bar"><div class="progress-fill ${pctMeta >= 80 ? 'green' : pctMeta >= 50 ? 'amber' : 'red'}" style="width:${pctMeta}%"></div></div>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Ticket Médio</span>
                <span class="kpi-value">${fmtMoney(ticketMedio)}</span>
                <span class="kpi-sub">por pedido</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Pendentes</span>
                <span class="kpi-value" style="color:${pendentes > 0 ? 'var(--warning)' : 'var(--success)'}">${pendentes}</span>
                <span class="kpi-sub">não sincronizados</span>
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-header">
                <h3>Últimos Pedidos</h3>
                <button class="btn-outline" onclick="navigateTo('pedidos')">Ver todos</button>
            </div>
            <div class="card-fv-body" style="padding:0;">
                ${pedidos.slice(-3).reverse().map(p => {
        let icon = 'schedule';
        let color = 'amber';
        switch (p.status) {
            case 'faturado': icon = 'check_circle'; color = 'green'; break;
            case 'conferido': icon = 'done_all'; color = 'green'; break;
            case 'despachado': icon = 'local_shipping'; color = 'blue'; break;
            case 'separando': icon = 'shopping_basket'; color = 'blue'; break;
            case 'aguardando': icon = 'hourglass_empty'; color = 'amber'; break;
            case 'enviado': icon = 'cloud_upload'; color = 'blue'; break;
            case 'pendente': icon = 'edit'; color = 'amber'; break;
            case 'cancelado': icon = 'block'; color = 'red'; break;
        }
        return `
                    <div class="list-item" style="padding: 0.85rem 1rem;">
                        <div class="list-icon ${color}">
                            <span class="material-icons-round">${icon}</span>
                        </div>
                        <div class="list-info">
                            <div class="list-title">#${p.numero} - ${p.cliente?.fantasia || '-'}</div>
                            <div class="list-sub">${p.data} · ${p.itens?.length || 0} itens</div>
                        </div>
                        <div class="list-right">
                            <div class="list-amount">${fmtMoney(p.total)}</div>
                            <span class="list-status ${p.status}">${p.status}</span>
                        </div>
                    </div>
                `;
    }).join('')}
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-body" style="display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Última Sincronização</div>
                    <div style="font-size:0.9rem; font-weight:500;">${syncText}</div>
                </div>
                <button class="btn-outline" onclick="forceSync()">
                    <span class="material-icons-round" style="font-size:1rem;">sync</span> Sincronizar
                </button>
            </div>
        </div>
    `;
}

// ===========================================
// 2. CLIENTES
// ===========================================
function renderClientes(filter = '') {
    const v = document.getElementById('view-clientes');
    let clientes = fvData.clientes;
    if (filter) {
        const s = filter.toLowerCase();
        clientes = clientes.filter(c => (c.nome + ' ' + c.fantasia + ' ' + c.cidade + ' ' + c.cnpj).toLowerCase().includes(s));
    }

    v.innerHTML = `
        <div class="search-bar">
            <span class="material-icons-round">search</span>
            <input type="text" placeholder="Buscar cliente..." oninput="renderClientes(this.value)" value="${filter}">
        </div>
        ${clientes.length === 0 ? `<div class="empty-state"><span class="material-icons-round">person_search</span><p>Nenhum cliente encontrado</p></div>` :
            clientes.map(c => `
            <div class="list-item" onclick="viewCliente('${c.id}')">
                <div class="list-icon ${c.status === 'prospecto' ? 'amber' : 'blue'}">
                    <span class="material-icons-round">${c.status === 'prospecto' ? 'person_add' : 'store'}</span>
                </div>
                <div class="list-info">
                    <div class="list-title">${c.fantasia || c.nome}</div>
                    <div class="list-sub">${c.cidade} · ${c.cnpj}</div>
                </div>
                <div class="list-right">
                    <span class="list-status ${c.status === 'prospecto' ? 'pendente' : 'faturado'}">${c.status}</span>
                </div>
            </div>
        `).join('')}
    `;
}

window.viewCliente = function (id) {
    const c = fvData.clientes.find(cl => cl.id === id);
    if (!c) return;

    const v = document.getElementById('view-clientes');
    const pedidosCliente = fvData.pedidos.filter(p => p.cliente?.codigo === c.codigo);
    const totalCompras = pedidosCliente.reduce((a, p) => a + (p.total || 0), 0);

    v.innerHTML = `
        <button class="btn-outline" onclick="renderClientes()" style="margin-bottom:1rem;">
            <span class="material-icons-round" style="font-size:1rem;">arrow_back</span> Voltar
        </button>
        <div class="card-fv">
            <div class="card-fv-body">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
                    <div class="list-icon blue" style="width:48px;height:48px;border-radius:12px;">
                        <span class="material-icons-round" style="font-size:1.5rem;">store</span>
                    </div>
                    <div>
                        <h3 style="font-size:1rem;">${c.fantasia || c.nome}</h3>
                        <div style="font-size:0.75rem;color:var(--text-secondary);">${c.cnpj}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                    ${[['Razão Social', c.nome], ['Cidade', c.cidade], ['Telefone', c.telefone || '—'], ['E-mail', c.email || '—'], ['Última Visita', c.ultimaVisita || '—'], ['Status', c.status]].map(([l, val]) =>
        `<div><div class="form-label">${l}</div><div style="font-size:0.9rem;">${val}</div></div>`
    ).join('')}
                </div>
            </div>
        </div>
        <div class="kpi-grid">
            <div class="kpi-card accent"><span class="kpi-label">Total Compras</span><span class="kpi-value">${fmtMoney(totalCompras)}</span></div>
            <div class="kpi-card"><span class="kpi-label">Pedidos</span><span class="kpi-value">${pedidosCliente.length}</span></div>
        </div>
        <button class="btn-primary" onclick="startPedidoParaCliente('${c.id}')" style="margin-bottom:0.75rem;">
            <span class="material-icons-round">add_shopping_cart</span> Novo Pedido
        </button>
        ${pedidosCliente.length > 0 ? `
            <p class="section-title">Histórico</p>
            ${pedidosCliente.map(p => `
                <div class="list-item">
                    <div class="list-icon ${p.status === 'faturado' ? 'green' : 'blue'}"><span class="material-icons-round">receipt</span></div>
                    <div class="list-info"><div class="list-title">#${p.numero}</div><div class="list-sub">${p.data}</div></div>
                    <div class="list-right"><div class="list-amount">${fmtMoney(p.total)}</div><span class="list-status ${p.status}">${p.status}</span></div>
                </div>
            `).join('')}
        ` : ''}
    `;
};

window.startPedidoParaCliente = function (clienteId) {
    const c = fvData.clientes.find(cl => cl.id === clienteId);
    if (c) {
        novoPedidoState.cliente = c;
        navigateTo('novoPedido');
    }
};

// ===========================================
// 3. CATÁLOGO
// ===========================================
function renderCatalogo(filter = '') {
    const v = document.getElementById('view-catalogo');
    let prods = fvData.produtos;
    if (filter) {
        const s = filter.toLowerCase();
        prods = prods.filter(p => (p.sku + ' ' + p.nome + ' ' + p.grupo).toLowerCase().includes(s));
    }

    v.innerHTML = `
        <div class="search-bar">
            <span class="material-icons-round">search</span>
            <input type="text" placeholder="Buscar produto..." oninput="renderCatalogo(this.value)" value="${filter}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
            ${prods.map(p => `
                <div class="card-fv" onclick="addProdutoAoPedido('${p.sku}')" style="cursor:pointer;">
                    <div class="card-fv-body" style="text-align:center; padding:0.85rem;">
                        <div style="font-size:2rem; margin-bottom:0.25rem;">${p.imagem || '📦'}</div>
                        <div style="font-size:0.8rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nome}</div>
                        <div style="font-size:0.7rem; color:var(--text-secondary);">${p.sku} · Est: ${p.estoque}</div>
                        <div style="font-size:1rem; font-weight:700; color:var(--primary); margin-top:0.25rem;">${fmtMoney(p.preco)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

window.addProdutoAoPedido = function (sku) {
    if (!novoPedidoState.cliente) {
        showToast('Selecione um cliente primeiro no Novo Pedido');
        return;
    }
    const p = fvData.produtos.find(pr => pr.sku === sku);
    if (!p) return;

    const existing = novoPedidoState.itens.find(i => i.sku === sku);
    if (existing) {
        existing.qtd++;
    } else {
        novoPedidoState.itens.push({ sku: p.sku, nome: p.nome, qtd: 1, preco: p.preco });
    }
    showToast(`${p.nome} adicionado ao pedido`);
};

// ===========================================
// 4. PEDIDOS
// ===========================================
function renderPedidos(filter = '') {
    const v = document.getElementById('view-pedidos');
    let pedidos = [...fvData.pedidos].reverse();
    if (filter) {
        const s = filter.toLowerCase();
        pedidos = pedidos.filter(p => (String(p.numero) + ' ' + (p.cliente?.fantasia || '') + ' ' + p.status).toLowerCase().includes(s));
    }

    v.innerHTML = `
        <div class="search-bar">
            <span class="material-icons-round">search</span>
            <input type="text" placeholder="Buscar pedido..." oninput="renderPedidos(this.value)" value="${filter}">
        </div>
        <div class="tab-bar">
            <button class="tab-btn active" onclick="filterPedidosTab('todos', this)">Todos</button>
            <button class="tab-btn" onclick="filterPedidosTab('pendente', this)">Pendentes</button>
            <button class="tab-btn" onclick="filterPedidosTab('enviado', this)">Enviados</button>
            <button class="tab-btn" onclick="filterPedidosTab('faturado', this)">Faturados</button>
        </div>
        <div id="pedidosList">
            ${renderPedidosList(pedidos)}
        </div>
    `;
}

function renderPedidosList(pedidos) {
    if (!pedidos.length) return `<div class="empty-state"><span class="material-icons-round">receipt_long</span><p>Nenhum pedido encontrado</p></div>`;
    return pedidos.map(p => {
        let icon = 'schedule';
        let color = 'amber';

        switch (p.status) {
            case 'faturado': icon = 'check_circle'; color = 'green'; break;
            case 'conferido': icon = 'done_all'; color = 'green'; break;
            case 'despachado': icon = 'local_shipping'; color = 'blue'; break;
            case 'separando': icon = 'shopping_basket'; color = 'blue'; break;
            case 'aguardando': icon = 'hourglass_empty'; color = 'amber'; break;
            case 'enviado': icon = 'cloud_upload'; color = 'blue'; break;
            case 'pendente': icon = 'edit'; color = 'amber'; break;
            case 'cancelado': icon = 'block'; color = 'red'; break;
        }

        return `
        <div class="list-item">
            <div class="list-icon ${color}">
                <span class="material-icons-round">${icon}</span>
            </div>
            <div class="list-info">
                <div class="list-title">#${p.numero} - ${p.cliente?.fantasia || '-'}</div>
                <div class="list-sub">${p.data} · ${p.itens?.length || 0} itens</div>
            </div>
            <div class="list-right">
                <div class="list-amount">${fmtMoney(p.total)}</div>
                <span class="list-status ${p.status}">${p.status}</span>
            </div>
        </div>
    `;
    }).join('');
}

window.filterPedidosTab = function (status, btn) {
    document.querySelectorAll('#view-pedidos .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    let pedidos = [...fvData.pedidos].reverse();
    if (status !== 'todos') pedidos = pedidos.filter(p => p.status === status);
    document.getElementById('pedidosList').innerHTML = renderPedidosList(pedidos);
};

// ===========================================
// 5. NOVO PEDIDO
// ===========================================
function renderNovoPedido() {
    const v = document.getElementById('view-novoPedido');
    const c = novoPedidoState.cliente;
    const totalPedido = novoPedidoState.itens.reduce((a, i) => a + (i.qtd * i.preco), 0);

    v.innerHTML = `
        <div class="card-fv">
            <div class="card-fv-header"><h3>1. Cliente</h3></div>
            <div class="card-fv-body">
                ${c ? `
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div class="list-icon blue"><span class="material-icons-round">store</span></div>
                        <div>
                            <div style="font-weight:600;">${c.fantasia || c.nome}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${c.cnpj} · ${c.cidade}</div>
                        </div>
                        <button class="btn-outline" style="margin-left:auto;" onclick="novoPedidoState.cliente=null; renderNovoPedido();">
                            <span class="material-icons-round" style="font-size:1rem;">close</span>
                        </button>
                    </div>
                ` : `
                    <div class="search-bar" style="margin-bottom:0;">
                        <span class="material-icons-round">search</span>
                        <input type="text" placeholder="Buscar cliente..." id="npClienteSearch" oninput="searchClienteNP(this.value)">
                    </div>
                    <div id="npClienteResults"></div>
                `}
            </div>
        </div>

        ${c ? `
        <div class="card-fv">
            <div class="card-fv-header">
                <h3>2. Itens (${novoPedidoState.itens.length})</h3>
                <button class="btn-outline" onclick="navigateTo('catalogo')">
                    <span class="material-icons-round" style="font-size:1rem;">add</span> Catálogo
                </button>
            </div>
            <div class="card-fv-body" style="padding:0;">
                ${novoPedidoState.itens.length === 0 ? `
                    <div class="empty-state" style="padding:1.5rem;"><span class="material-icons-round">shopping_cart</span><p>Adicione itens do catálogo</p></div>
                ` : novoPedidoState.itens.map((item, idx) => `
                    <div class="list-item" style="padding:0.75rem 1rem;">
                        <div class="list-info">
                            <div class="list-title">${item.nome}</div>
                            <div class="list-sub">${item.sku} · ${fmtMoney(item.preco)}/un</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <button class="btn-outline" style="padding:0.3rem 0.5rem;" onclick="changeQtdNP(${idx},-1)">−</button>
                            <span style="font-weight:600;min-width:24px;text-align:center;">${item.qtd}</span>
                            <button class="btn-outline" style="padding:0.3rem 0.5rem;" onclick="changeQtdNP(${idx},1)">+</button>
                        </div>
                        <div class="list-right">
                            <div class="list-amount">${fmtMoney(item.qtd * item.preco)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="card-fv">
            <div class="card-fv-body" style="display:flex; align-items:center; justify-content:space-between;">
                <div><span class="kpi-label">TOTAL DO PEDIDO</span><div class="kpi-value" style="color:var(--primary);">${fmtMoney(totalPedido)}</div></div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Observações</label>
            <textarea class="form-control" rows="2" id="npObs" placeholder="Observações do pedido...">${novoPedidoState.obs || ''}</textarea>
        </div>

        <button class="btn-primary btn-lg" onclick="finalizarPedido()" ${novoPedidoState.itens.length === 0 ? 'disabled style="opacity:0.5"' : ''}>
            <span class="material-icons-round">check_circle</span> Finalizar Pedido
        </button>
        <button class="btn-outline" style="width:100%;margin-top:0.5rem;justify-content:center;" onclick="limparPedido()">
            <span class="material-icons-round" style="font-size:1rem;">delete</span> Limpar Pedido
        </button>
        ` : ''}
    `;
}

window.searchClienteNP = function (query) {
    const results = document.getElementById('npClienteResults');
    if (!query || query.length < 2) { results.innerHTML = ''; return; }
    const s = query.toLowerCase();
    const clientes = fvData.clientes.filter(c => (c.nome + ' ' + c.fantasia + ' ' + c.cnpj).toLowerCase().includes(s));
    results.innerHTML = clientes.map(c => `
        <div class="list-item" onclick="selectClienteNP('${c.id}')">
            <div class="list-icon blue"><span class="material-icons-round">store</span></div>
            <div class="list-info"><div class="list-title">${c.fantasia || c.nome}</div><div class="list-sub">${c.cidade}</div></div>
        </div>
    `).join('');
};

window.selectClienteNP = function (id) {
    novoPedidoState.cliente = fvData.clientes.find(c => c.id === id);
    renderNovoPedido();
};

window.changeQtdNP = function (idx, delta) {
    novoPedidoState.itens[idx].qtd += delta;
    if (novoPedidoState.itens[idx].qtd <= 0) novoPedidoState.itens.splice(idx, 1);
    renderNovoPedido();
};

window.finalizarPedido = function () {
    if (!novoPedidoState.cliente || novoPedidoState.itens.length === 0) {
        showToast('Selecione cliente e adicione itens');
        return;
    }

    const total = novoPedidoState.itens.reduce((a, i) => a + (i.qtd * i.preco), 0);
    const numero = fvData.pedidos.length > 0 ? Math.max(...fvData.pedidos.map(p => p.numero)) + 1 : 5001;

    const pedido = {
        id: 'p_' + Date.now(),
        numero: numero,
        data: new Date().toISOString().split('T')[0],
        cliente: { codigo: novoPedidoState.cliente.codigo, fantasia: novoPedidoState.cliente.fantasia || novoPedidoState.cliente.nome },
        itens: [...novoPedidoState.itens],
        total: total,
        obs: document.getElementById('npObs')?.value || '',
        status: 'pendente',
        syncedAt: null
    };

    fvData.pedidos.push(pedido);

    // Update metas
    fvData.metas.realizado = fvData.pedidos.filter(p => p.data.startsWith(new Date().toISOString().substring(0, 7))).reduce((a, p) => a + (p.total || 0), 0);

    saveFVData();
    limparPedido();

    showToast(`Pedido #${numero} criado!`);
    navigateTo('pedidos');
};

window.limparPedido = function () {
    novoPedidoState = { cliente: null, itens: [], obs: '' };
    renderNovoPedido();
};

// ===========================================
// 6. METAS
// ===========================================
function renderMetas() {
    const v = document.getElementById('view-metas');
    const meta = fvData.metas?.mensal || 50000;
    const mesAtual = new Date().toISOString().substring(0, 7);
    const pedidosMes = fvData.pedidos.filter(p => p.data.startsWith(mesAtual));
    const totalMes = pedidosMes.reduce((a, p) => a + (p.total || 0), 0);
    const pct = Math.min((totalMes / meta) * 100, 100);
    const falta = Math.max(meta - totalMes, 0);

    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const diasPassados = new Date().getDate();
    const diasRestantes = diasMes - diasPassados;
    const mediaDiariaNecessaria = diasRestantes > 0 ? falta / diasRestantes : 0;

    // Weekly breakdown
    const semanas = [0, 0, 0, 0, 0];
    pedidosMes.forEach(p => {
        const dia = parseInt(p.data.split('-')[2]);
        const sem = Math.min(Math.floor((dia - 1) / 7), 4);
        semanas[sem] += p.total || 0;
    });
    const maxSemana = Math.max(...semanas, 1);

    v.innerHTML = `
        <div class="card-fv">
            <div class="card-fv-body" style="text-align:center;">
                <div style="font-size:0.8rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem;">Meta Mensal</div>
                <div style="font-size:2rem;font-weight:700;color:var(--primary);">${pct.toFixed(1)}%</div>
                <div class="progress-bar" style="height:12px;margin:0.75rem 0;">
                    <div class="progress-fill ${pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red'}" style="width:${pct}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;">
                    <span style="color:var(--text-secondary);">Realizado: <strong>${fmtMoney(totalMes)}</strong></span>
                    <span style="color:var(--text-secondary);">Meta: <strong>${fmtMoney(meta)}</strong></span>
                </div>
            </div>
        </div>

        <div class="kpi-grid">
            <div class="kpi-card"><span class="kpi-label">Falta</span><span class="kpi-value">${fmtMoney(falta)}</span></div>
            <div class="kpi-card"><span class="kpi-label">Média/Dia Necessária</span><span class="kpi-value">${fmtMoney(mediaDiariaNecessaria)}</span><span class="kpi-sub">${diasRestantes} dias restantes</span></div>
        </div>

        <div class="card-fv">
            <div class="card-fv-header"><h3>Desempenho Semanal</h3></div>
            <div class="card-fv-body">
                ${semanas.map((val, i) => `
                    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                        <span style="font-size:0.75rem;color:var(--text-secondary);min-width:50px;">Sem ${i + 1}</span>
                        <div style="flex:1;height:24px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">
                            <div style="width:${(val / maxSemana) * 100}%;height:100%;background:var(--primary);border-radius:4px;transition:width 0.5s;"></div>
                        </div>
                        <span style="font-size:0.8rem;font-weight:600;min-width:80px;text-align:right;">${fmtMoney(val)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ===========================================
// 7. ROTAS / ROTEIRO
// ===========================================
function renderRotas() {
    const v = document.getElementById('view-rotas');
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const hoje = dias[new Date().getDay()];

    v.innerHTML = `
        <p class="section-title">Roteiro Semanal</p>
        ${fvData.rotas.map(r => {
        const isHoje = r.dia === hoje;
        const clientesRota = r.clientes.map(cod => fvData.clientes.find(c => c.codigo === cod)).filter(Boolean);
        return `
                <div class="card-fv" style="${isHoje ? 'border-color:var(--primary);' : ''}">
                    <div class="card-fv-header" style="${isHoje ? 'background:var(--primary-light);' : ''}">
                        <h3>${isHoje ? '📍 ' : ''}${r.dia}</h3>
                        <span style="font-size:0.75rem;color:var(--text-secondary);">${r.zona} · ${clientesRota.length} clientes</span>
                    </div>
                    <div class="card-fv-body" style="padding:0;">
                        ${clientesRota.map(c => `
                            <div class="list-item" style="padding:0.75rem 1rem;" onclick="viewCliente('${c.id}')">
                                <div class="list-icon blue"><span class="material-icons-round">store</span></div>
                                <div class="list-info">
                                    <div class="list-title">${c.fantasia || c.nome}</div>
                                    <div class="list-sub">${c.cidade} · Últ.: ${c.ultimaVisita || 'nunca'}</div>
                                </div>
                                <span class="material-icons-round" style="font-size:1rem;color:var(--text-secondary);">chevron_right</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
    }).join('')}
    `;
}

// ---- Navigate to client view from rotas ----
// (viewCliente is already defined in Clientes section)

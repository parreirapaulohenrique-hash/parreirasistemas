// WMS Saída de Produtos - Outbound Flow
// sai-ondas: Wave formation
// sai-separacao: Picking
// sai-conferencia: Outbound conference
// sai-embalagem, sai-romaneio, sai-expedicao: placeholder-enriched

window.loadSaidaView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        case 'sai-ondas': renderOndas(container); break;
        case 'sai-separacao': renderSeparacao(container); break;
        case 'sai-conferencia': renderConfSaida(container); break;
        case 'sai-embalagem': renderPlaceholderSaida(container, 'Embalagem (Packing)', 'package_2', 'Montagem de caixas, pesagem e etiquetagem dos volumes.'); break;
        case 'sai-romaneio': renderPlaceholderSaida(container, 'Romaneio', 'receipt_long', 'Listagem de volumes por carga para conferência de embarque.'); break;
        case 'sai-expedicao': renderPlaceholderSaida(container, 'Expedição', 'local_shipping', 'Liberação de carga e registro de saída do veículo.'); break;
    }
};

// ========================
// MOCK DATA
// ========================
function getPedidosMock() {
    let pedidos = JSON.parse(localStorage.getItem('wms_pedidos') || 'null');
    if (!pedidos) {
        pedidos = [
            {
                id: 'PED-001', cliente: 'Auto Peças Central', prioridade: 'URGENTE', itens: [
                    { sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', qtd: 100, endereco: '01-01-0101' },
                    { sku: 'SKU-0002', desc: 'Porca Sextavada M6', qtd: 50, endereco: '01-01-0102' },
                ], status: 'PENDENTE', created: new Date().toISOString()
            },
            {
                id: 'PED-002', cliente: 'Constrular Material', prioridade: 'NORMAL', itens: [
                    { sku: 'SKU-0010', desc: 'Cimento Cola AC-III 20kg', qtd: 10, endereco: '03-01-0101' },
                    { sku: 'SKU-0011', desc: 'Tinta Acrílica Branca 18L', qtd: 5, endereco: '03-01-0201' },
                    { sku: 'SKU-0008', desc: 'Lixa d\'água 220 Norton', qtd: 50, endereco: '02-02-0101' },
                ], status: 'PENDENTE', created: new Date().toISOString()
            },
            {
                id: 'PED-003', cliente: 'Ferr. Industrial ME', prioridade: 'NORMAL', itens: [
                    { sku: 'SKU-0006', desc: 'Chave Allen 5mm Tramontina', qtd: 20, endereco: '02-01-0101' },
                    { sku: 'SKU-0009', desc: 'Disco de Corte 7" DeWalt', qtd: 15, endereco: '02-02-0301' },
                ], status: 'PENDENTE', created: new Date().toISOString()
            },
            {
                id: 'PED-004', cliente: 'Mega Fixações Ltda', prioridade: 'BAIXA', itens: [
                    { sku: 'SKU-0003', desc: 'Arruela Lisa 1/4"', qtd: 300, endereco: '01-02-0201' },
                ], status: 'PENDENTE', created: new Date().toISOString()
            },
        ];
        localStorage.setItem('wms_pedidos', JSON.stringify(pedidos));
    }
    return pedidos;
}

function getOndasMock() {
    return JSON.parse(localStorage.getItem('wms_ondas') || '[]');
}

function getPickingTasksMock() {
    return JSON.parse(localStorage.getItem('wms_picking') || '[]');
}

// ========================
// 1. FORMAÇÃO DE ONDAS
// ========================
function renderOndas(container) {
    const pedidos = getPedidosMock();
    const ondas = getOndasMock();
    const pendentes = pedidos.filter(p => p.status === 'PENDENTE');
    const emOnda = pedidos.filter(p => p.status === 'EM ONDA' || p.status === 'SEPARANDO');

    container.innerHTML = `
        <!-- Summary -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Pedidos Pendentes</div>
                <div style="font-size:1.5rem; font-weight:700; color:#f59e0b;">${pendentes.length}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Ondas Formadas</div>
                <div style="font-size:1.5rem; font-weight:700; color:#3b82f6;">${ondas.length}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Em Separação</div>
                <div style="font-size:1.5rem; font-weight:700; color:#10b981;">${emOnda.length}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Total Itens (Pend.)</div>
                <div style="font-size:1.5rem; font-weight:700;">${pendentes.reduce((s, p) => s + p.itens.length, 0)}</div>
            </div>
        </div>

        <!-- Pending orders to form wave -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">waves</span>
                    Pedidos Pendentes
                </h3>
                ${pendentes.length > 0 ? `
                <button onclick="formarOnda()" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">
                    <span class="material-icons-round" style="font-size:1rem;">playlist_add</span> Formar Onda
                </button>` : ''}
            </div>
            ${pendentes.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="check-all-ped" onchange="toggleAllPedidos(this)"></th>
                            <th>Pedido</th>
                            <th>Cliente</th>
                            <th>Itens</th>
                            <th>Prioridade</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendentes.map(p => {
        const pc = p.prioridade === 'URGENTE' ? '#ef4444' : p.prioridade === 'NORMAL' ? '#3b82f6' : '#94a3b8';
        return `<tr>
                                <td><input type="checkbox" class="ped-check" value="${p.id}"></td>
                                <td style="font-weight:600; font-family:monospace;">${p.id}</td>
                                <td>${p.cliente}</td>
                                <td style="text-align:center;">${p.itens.length} (${p.itens.reduce((s, i) => s + i.qtd, 0)} un)</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                    background:${pc}18; color:${pc};">${p.prioridade}</span></td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                    background:rgba(148,163,184,0.12); color:#94a3b8;">PENDENTE</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Todos os pedidos já possuem onda formada.
            </div>`}
        </div>

        <!-- Existing waves -->
        ${ondas.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Ondas Formadas</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>Onda</th><th>Pedidos</th><th>Itens</th><th>Qtd Total</th><th>Status</th><th>Ação</th></tr>
                    </thead>
                    <tbody>
                        ${ondas.map(o => {
        const sc = o.status === 'SEPARANDO' ? '#f59e0b' : o.status === 'PRONTA' ? '#10b981' : '#3b82f6';
        return `<tr>
                                <td style="font-weight:600; font-family:monospace;">${o.id}</td>
                                <td>${o.pedidos.join(', ')}</td>
                                <td style="text-align:center;">${o.totalItens}</td>
                                <td style="text-align:right; font-weight:600;">${o.totalQtd.toLocaleString('pt-BR')}</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${o.status}</span></td>
                                <td>${o.status === 'FORMADA' ? `
                                    <button onclick="liberarOnda('${o.id}')" class="btn btn-primary" style="padding:0.3rem 0.8rem; font-size:0.75rem;">
                                        <span class="material-icons-round" style="font-size:0.9rem;">play_arrow</span> Liberar
                                    </button>` : '<span style="font-size:0.75rem; color:var(--text-secondary);">-</span>'}
                                </td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.toggleAllPedidos = function (el) {
    document.querySelectorAll('.ped-check').forEach(cb => cb.checked = el.checked);
};

window.formarOnda = function () {
    const checked = [...document.querySelectorAll('.ped-check:checked')].map(cb => cb.value);
    if (checked.length === 0) return alert('Selecione pelo menos um pedido.');

    const pedidos = getPedidosMock();
    const ondas = getOndasMock();
    let totalItens = 0, totalQtd = 0;

    checked.forEach(pid => {
        const ped = pedidos.find(p => p.id === pid);
        if (ped) {
            ped.status = 'EM ONDA';
            totalItens += ped.itens.length;
            totalQtd += ped.itens.reduce((s, i) => s + i.qtd, 0);
        }
    });

    const ondaId = `ONDA-${String(ondas.length + 1).padStart(3, '0')}`;
    ondas.push({ id: ondaId, pedidos: checked, totalItens, totalQtd, status: 'FORMADA', created: new Date().toISOString() });

    localStorage.setItem('wms_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('wms_ondas', JSON.stringify(ondas));
    renderOndas(document.getElementById('view-dynamic'));
};

window.liberarOnda = function (ondaId) {
    const ondas = getOndasMock();
    const onda = ondas.find(o => o.id === ondaId);
    if (!onda) return;

    onda.status = 'SEPARANDO';

    // Generate picking tasks
    const pedidos = getPedidosMock();
    let picking = getPickingTasksMock();
    let seq = picking.length + 1;

    onda.pedidos.forEach(pid => {
        const ped = pedidos.find(p => p.id === pid);
        if (ped) {
            ped.status = 'SEPARANDO';
            ped.itens.forEach(item => {
                picking.push({
                    id: `PICK-${String(seq++).padStart(4, '0')}`,
                    onda: ondaId,
                    pedido: pid,
                    sku: item.sku,
                    desc: item.desc,
                    qtd: item.qtd,
                    endereco: item.endereco,
                    status: 'PENDENTE'
                });
            });
        }
    });

    localStorage.setItem('wms_ondas', JSON.stringify(ondas));
    localStorage.setItem('wms_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('wms_picking', JSON.stringify(picking));
    renderOndas(document.getElementById('view-dynamic'));
};

// ========================
// 2. SEPARAÇÃO (PICKING)
// ========================
function renderSeparacao(container) {
    const tasks = getPickingTasksMock();
    const pendentes = tasks.filter(t => t.status === 'PENDENTE');
    const coletados = tasks.filter(t => t.status === 'COLETADO');

    container.innerHTML = `
        <!-- Summary -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#f59e0b,#d97706);
                    display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white; font-size:1.2rem;">shopping_basket</span>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Pendentes</div>
                    <div style="font-size:1.3rem; font-weight:700;">${pendentes.length}</div>
                </div>
            </div>
            <div class="card" style="padding:1.25rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#10b981,#059669);
                    display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white; font-size:1.2rem;">check_circle</span>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Coletados</div>
                    <div style="font-size:1.3rem; font-weight:700;">${coletados.length}</div>
                </div>
            </div>
            <div class="card" style="padding:1.25rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#3b82f6,#2563eb);
                    display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white; font-size:1.2rem;">inventory</span>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Qtd Total Pend.</div>
                    <div style="font-size:1.3rem; font-weight:700;">${pendentes.reduce((s, t) => s + t.qtd, 0).toLocaleString('pt-BR')}</div>
                </div>
            </div>
        </div>

        <!-- Picking Tasks -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">shopping_basket</span>
                    Tarefas de Separação
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${tasks.length} tarefas</span>
            </div>
            ${pendentes.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Tarefa</th>
                            <th>Onda</th>
                            <th>Pedido</th>
                            <th>SKU</th>
                            <th>Descrição</th>
                            <th style="text-align:right;">Qtd</th>
                            <th>Endereço</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendentes.map(t => `<tr>
                            <td style="font-weight:600; font-family:monospace;">${t.id}</td>
                            <td style="font-size:0.8rem;">${t.onda}</td>
                            <td style="font-size:0.8rem;">${t.pedido}</td>
                            <td style="font-family:monospace;">${t.sku}</td>
                            <td>${t.desc}</td>
                            <td style="text-align:right; font-weight:600;">${t.qtd}</td>
                            <td style="font-weight:700; font-family:monospace; color:var(--primary-color);">${t.endereco}</td>
                            <td>
                                <button onclick="confirmarPicking('${t.id}')" class="btn btn-primary" style="padding:0.3rem 0.8rem; font-size:0.75rem;">
                                    <span class="material-icons-round" style="font-size:0.9rem;">check</span> Coletar
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Nenhuma tarefa de picking pendente.<br>
                <span style="font-size:0.8rem;">Libere uma onda em "Formação de Ondas" para gerar tarefas.</span>
            </div>`}
        </div>

        <!-- Completed -->
        ${coletados.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Coletados</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Tarefa</th><th>Pedido</th><th>SKU</th><th>Descrição</th><th style="text-align:right;">Qtd</th><th>Status</th></tr></thead>
                    <tbody>
                        ${coletados.map(t => `<tr style="opacity:0.7;">
                            <td style="font-family:monospace;">${t.id}</td>
                            <td style="font-size:0.8rem;">${t.pedido}</td>
                            <td style="font-family:monospace;">${t.sku}</td>
                            <td>${t.desc}</td>
                            <td style="text-align:right;">${t.qtd}</td>
                            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                background:rgba(16,185,129,0.12); color:#10b981;">COLETADO</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.confirmarPicking = function (taskId) {
    const tasks = getPickingTasksMock();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'COLETADO';
        localStorage.setItem('wms_picking', JSON.stringify(tasks));
        renderSeparacao(document.getElementById('view-dynamic'));
    }
};

// ========================
// 3. CONFERÊNCIA DE SAÍDA
// ========================
function renderConfSaida(container) {
    const pedidos = getPedidosMock();
    const picking = getPickingTasksMock();

    // Find orders where all picks are done
    const ondas = getOndasMock();
    const confData = ondas.map(o => {
        const tasks = picking.filter(t => t.onda === o.id);
        const allDone = tasks.length > 0 && tasks.every(t => t.status === 'COLETADO');
        const totalQtd = tasks.reduce((s, t) => s + t.qtd, 0);
        return { ...o, tasks, allDone, totalQtd, conferido: o.conferido || false };
    }).filter(o => o.tasks.length > 0);

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">fact_check</span>
                    Conferência de Saída
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${confData.length} ondas</span>
            </div>

            ${confData.length > 0 ? `
            <div id="conf-saida-list" style="padding:0;">
                ${confData.map(o => {
        const pctDone = o.tasks.length > 0 ? Math.round((o.tasks.filter(t => t.status === 'COLETADO').length / o.tasks.length) * 100) : 0;
        const statusText = o.conferido ? 'CONFERIDO' : o.allDone ? 'PRONTO P/ CONFERÊNCIA' : 'SEPARANDO';
        const sc = o.conferido ? '#10b981' : o.allDone ? '#3b82f6' : '#f59e0b';

        return `
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <span style="font-weight:700; font-family:monospace;">${o.id}</span>
                                <span style="color:var(--text-secondary); font-size:0.8rem;">Pedidos: ${o.pedidos.join(', ')}</span>
                            </div>
                            <span style="padding:2px 10px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                background:${sc}18; color:${sc};">${statusText}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem;">
                            <div style="flex:1; background:rgba(255,255,255,0.05); border-radius:4px; height:6px; overflow:hidden;">
                                <div style="width:${pctDone}%; height:100%; background:${sc}; border-radius:4px;"></div>
                            </div>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">${pctDone}% separado • ${o.totalQtd} un</span>
                        </div>
                        ${o.allDone && !o.conferido ? `
                        <button onclick="conferirOnda('${o.id}')" class="btn btn-primary" style="padding:0.35rem 1rem; font-size:0.8rem; margin-top:0.5rem;">
                            <span class="material-icons-round" style="font-size:0.9rem;">check</span> Conferir e Liberar
                        </button>` : ''}
                    </div>`;
    }).join('')}
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">inbox</span>
                Nenhuma onda para conferência.<br>
                <span style="font-size:0.8rem;">Forme e libere ondas em "Formação de Ondas" primeiro.</span>
            </div>`}
        </div>
    `;
}

window.conferirOnda = function (ondaId) {
    const ondas = getOndasMock();
    const onda = ondas.find(o => o.id === ondaId);
    if (onda) {
        onda.conferido = true;
        onda.status = 'PRONTA';
        localStorage.setItem('wms_ondas', JSON.stringify(ondas));
        renderConfSaida(document.getElementById('view-dynamic'));
    }
};

// ========================
// PLACEHOLDER ENRICHED
// ========================
function renderPlaceholderSaida(container, title, icon, desc) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">${icon}</span>
                    ${title}
                </h3>
            </div>
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem; opacity:0.25; display:block; margin-bottom:1rem;">${icon}</span>
                <h3 style="color:var(--text-primary); margin-bottom:0.5rem;">Em Construção</h3>
                <p style="font-size:0.85rem;">${desc}</p>
            </div>
        </div>
    `;
}

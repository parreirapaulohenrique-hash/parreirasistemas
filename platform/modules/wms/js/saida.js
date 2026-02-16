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
        case 'sai-embalagem': renderEmbalagem(container); break;
        case 'sai-romaneio': renderRomaneio(container); break;
        case 'sai-expedicao': renderExpedicao(container); break;
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

            // Validate Stock for Order
            if (window.StockManager) {
                const missing = ped.itens.some(item => window.StockManager.getAvailable(item.sku) < item.qtd);
                if (missing) {
                    alert(`⚠️ Pedido ${pid} possui itens sem estoque disponível! A onda não será liberada parciais nesta versão.`);
                    return; // Skip this order? Or abort whole function? Aborting is safer.
                }
            }

            ped.status = 'SEPARANDO';
            ped.itens.forEach(item => {

                // Reserve Stock
                if (window.StockManager) {
                    window.StockManager.reserve(item.sku, item.qtd);
                }

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

        // Commit Stock (Decrement)
        if (window.StockManager) {
            window.StockManager.commit(task.sku, task.qtd);
        }

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
    // Modo Simplificado (para teste rápido)
    // const ondas = getOndasMock();
    // const onda = ondas.find(o => o.id === ondaId);
    // if (onda) {
    //     onda.conferido = true;
    //     onda.status = 'PRONTA';
    //     localStorage.setItem('wms_ondas', JSON.stringify(ondas));
    //     renderConfSaida(document.getElementById('view-dynamic'));
    // }

    // Modo Avançado (Bancada)
    openConferenceModal(ondaId);
};

// ========================
// CONFERENCE STATION (BANCADA)
// ========================
let currentConferenceWave = null;
let currentConferenceItems = [];
let currentConferenceScanned = {}; // sku: qty

function openConferenceModal(ondaId) {
    const ondas = getOndasMock();
    const picking = getPickingTasksMock();
    currentConferenceWave = ondas.find(o => o.id === ondaId);

    // Aggregate items from picking tasks
    const tasks = picking.filter(t => t.onda === ondaId);
    currentConferenceItems = [];
    currentConferenceScanned = {};

    tasks.forEach(t => {
        const existing = currentConferenceItems.find(i => i.sku === t.sku);
        if (existing) existing.qtd += t.qtd;
        else currentConferenceItems.push({ sku: t.sku, desc: t.desc, qtd: t.qtd });

        if (!currentConferenceScanned[t.sku]) currentConferenceScanned[t.sku] = 0;
    });

    // Render Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'confModal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    document.body.appendChild(overlay);

    renderConferenceScreen();
}

function renderConferenceScreen() {
    const overlay = document.getElementById('confModal');
    if (!overlay) return;

    const totalQtd = currentConferenceItems.reduce((s, i) => s + i.qtd, 0);
    const scannedQtd = Object.values(currentConferenceScanned).reduce((s, q) => s + q, 0);
    const pct = Math.round((scannedQtd / totalQtd) * 100);

    overlay.innerHTML = `
        <div class="modal-content" style="max-width:90%; width:1000px; height:80vh; display:flex; flex-direction:column;">
            <div class="modal-header" style="background:var(--bg-card); border-bottom:1px solid var(--border-color); padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h2 style="margin:0;">Conferência de Onda: ${currentConferenceWave.id}</h2>
                        <span style="color:var(--text-secondary);">Bipe os produtos para validar a separação.</span>
                    </div>
                    <button class="btn-icon" onclick="closeConferenceModal()"><span class="material-icons-round">close</span></button>
                </div>
                <div style="margin-top:1rem; background:rgba(255,255,255,0.05); height:8px; border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; background:var(--success); height:100%; transition:width 0.3s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:0.5rem; font-size:0.9rem; font-weight:600;">
                    <span>Progresso: ${pct}%</span>
                    <span>${scannedQtd} / ${totalQtd} itens</span>
                </div>
            </div>

            <div class="modal-body" style="flex:1; display:flex; gap:1rem; padding:1rem; overflow:hidden;">
                <!-- Left: Scanner & Log -->
                <div style="flex:1; display:flex; flex-direction:column; gap:1rem;">
                    <div style="display:flex; gap:0.5rem;">
                        <input type="text" id="confScanner" class="form-input" placeholder="Bipe o código de barras (EAN/SKU)..." 
                            style="font-size:1.2rem; padding:1rem;" autofocus onkeydown="handleConfInput(event)">
                        <button class="btn btn-primary" onclick="simulateConfScan()">
                            <span class="material-icons-round">qr_code_scanner</span>
                        </button>
                    </div>
                    
                    <div class="card" style="flex:1; overflow-y:auto; padding:0;">
                         <table class="data-table">
                            <thead><tr><th>SKU</th><th>Produto</th><th>Qtd</th><th>Conferido</th><th>Status</th></tr></thead>
                            <tbody>
                                ${currentConferenceItems.map(item => {
        const scanned = currentConferenceScanned[item.sku] || 0;
        const status = scanned === item.qtd ? 'ok' : scanned > item.qtd ? 'excess' : 'pending';
        const rowColor = status === 'ok' ? 'rgba(16,185,129,0.1)' : status === 'excess' ? 'rgba(239,68,68,0.1)' : 'transparent';
        const icon = status === 'ok' ? 'check_circle' : status === 'excess' ? 'warning' : 'radio_button_unchecked';
        const iconColor = status === 'ok' ? 'var(--success)' : status === 'excess' ? 'var(--danger)' : 'var(--text-secondary)';

        return `<tr style="background:${rowColor}">
                                        <td style="font-family:monospace; font-weight:600;">${item.sku}</td>
                                        <td>${item.desc}</td>
                                        <td style="text-align:center;">${item.qtd}</td>
                                        <td style="text-align:center; font-weight:bold;">${scanned}</td>
                                        <td style="text-align:center;"><span class="material-icons-round" style="color:${iconColor}; font-size:1.2rem;">${icon}</span></td>
                                    </tr>`;
    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Right: Actions -->
                <div style="width:250px; display:flex; flex-direction:column; gap:1rem;">
                    <div class="card" style="padding:1rem; text-align:center;">
                        <span class="material-icons-round" style="font-size:3rem; color:var(--wms-primary);">package_2</span>
                        <h3>Volumes</h3>
                        <p style="color:var(--text-secondary); font-size:0.9rem;">Gere etiquetas de volume conforme fecha as caixas.</p>
                        <button class="btn btn-secondary" onclick="window.criarVolume(currentConferenceWave.id)" style="width:100%; margin-top:0.5rem;">
                            Gerar Etiqueta
                        </button>
                    </div>

                    <div style="margin-top:auto;">
                        <button class="btn btn-success" style="width:100%; padding:1rem;" onclick="finishConference()" ${pct < 100 ? 'disabled' : ''}>
                            Finalizar Conferência
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => document.getElementById('confScanner').focus(), 100);
}

window.handleConfInput = function (e) {
    if (e.key === 'Enter') {
        processConfScan(e.target.value);
        e.target.value = '';
    }
};

window.simulateConfScan = function () {
    const input = document.getElementById('confScanner');
    processConfScan(input.value);
    input.value = '';
    input.focus();
};

function processConfScan(code) {
    if (!code) return;

    // Find item
    const item = currentConferenceItems.find(i => i.sku === code || code.includes(i.sku)); // Simple match

    if (item) {
        if (currentConferenceScanned[item.sku] < item.qtd) {
            currentConferenceScanned[item.sku]++;
            // Sound Success
        } else {
            alert(`⚠️ Item ${item.sku} já foi totalmente conferido! Verifique excesso.`);
            // Sound Error
        }
    } else {
        alert(`❌ Item ${code} não pertence a esta onda!`);
        // Sound Error
    }
    renderConferenceScreen();
}

window.closeConferenceModal = function () {
    const overlay = document.getElementById('confModal');
    if (overlay) overlay.remove();
};

window.finishConference = function () {
    const ondas = getOndasMock();
    const onda = ondas.find(o => o.id === currentConferenceWave.id);
    if (onda) {
        onda.conferido = true;
        onda.status = 'PRONTA'; // Pronta para Expedição/Romaneio
        localStorage.setItem('wms_ondas', JSON.stringify(ondas));
        closeConferenceModal();
        renderConfSaida(document.getElementById('view-dynamic'));
        alert('✅ Conferência Finalizada com Sucesso!');
    }
};

// ========================
// 4. EMBALAGEM (PACKING)
// ========================
function renderEmbalagem(container) {
    const ondas = getOndasMock().filter(o => o.status === 'separada' || o.status === 'conferida');
    const volumes = JSON.parse(localStorage.getItem('wms_volumes') || '[]');

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">package_2</span>
                    Embalagem (Packing)
                </h3>
                <span class="badge badge-info">${ondas.length} ondas prontas</span>
            </div>
            <div style="padding:1rem;">
                ${ondas.length === 0 ? '<p style="text-align:center; color:var(--text-secondary); padding:2rem;">Nenhuma onda aguardando embalagem</p>' :
            ondas.map(o => `
                    <div class="card" style="margin-bottom:0.75rem; border-left:3px solid var(--wms-primary);">
                        <div style="padding:1rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                            <div>
                                <strong>Onda ${o.id}</strong>
                                <span style="font-size:0.8rem; color:var(--text-secondary);"> · ${o.itens?.length || 0} itens · ${o.pedidos?.length || 0} pedidos</span>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-secondary" onclick="criarVolume('${o.id}')">
                                    <span class="material-icons-round" style="font-size:1rem;">add_box</span> Criar Volume
                                </button>
                                <button class="btn btn-primary" onclick="finalizarEmbalagem('${o.id}')">
                                    <span class="material-icons-round" style="font-size:1rem;">check</span> Finalizar
                                </button>
                            </div>
                        </div>
                        <div id="volumes-${o.id}" style="padding:0 1rem 1rem;">
                            ${(volumes.filter(v => v.ondaId === o.id)).map((v, i) => `
                                <div style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem; background:var(--bg-hover); border-radius:6px; margin-bottom:0.25rem;">
                                    <span class="material-icons-round" style="font-size:1.2rem; color:var(--wms-primary);">inventory_2</span>
                                    <div style="flex:1;">
                                        <strong style="font-size:0.85rem;">Vol. ${v.numero}</strong>
                                        <span style="font-size:0.75rem; color:var(--text-secondary);"> · ${v.peso || 0}kg · ${v.lacre || 'Sem lacre'}</span>
                                    </div>
                                    <span class="badge ${v.status === 'fechado' ? 'badge-success' : 'badge-warning'}">${v.status}</span>
                                </div>
                            `).join('') || '<p style="font-size:0.8rem; color:var(--text-secondary);">Nenhum volume criado</p>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

window.criarVolume = function (ondaId) {
    const volumes = JSON.parse(localStorage.getItem('wms_volumes') || '[]');
    const nextNum = volumes.filter(v => v.ondaId === ondaId).length + 1;
    volumes.push({
        id: 'vol_' + Date.now(),
        ondaId: ondaId,
        numero: nextNum,
        peso: Math.round(Math.random() * 20 + 5),
        largura: 40, altura: 30, profundidade: 50,
        lacre: 'LC-' + (1000 + volumes.length),
        status: 'aberto',
        createdAt: new Date().toISOString()
    });
    localStorage.setItem('wms_volumes', JSON.stringify(volumes));
    renderEmbalagem(document.getElementById('view-dynamic'));
};

window.finalizarEmbalagem = function (ondaId) {
    const volumes = JSON.parse(localStorage.getItem('wms_volumes') || '[]');
    volumes.filter(v => v.ondaId === ondaId).forEach(v => v.status = 'fechado');
    localStorage.setItem('wms_volumes', JSON.stringify(volumes));
    alert('✅ Embalagem finalizada! Volumes lacrados.');
    renderEmbalagem(document.getElementById('view-dynamic'));
};

// ========================
// 5. ROMANEIO
// ========================
function renderRomaneio(container) {
    const ondas = getOndasMock();
    const volumes = JSON.parse(localStorage.getItem('wms_volumes') || '[]');
    const cargas = JSON.parse(localStorage.getItem('wms_cargas') || '[]');
    const romaneios = cargas.length > 0 ? cargas : [
        { id: 'CRG-001', data: new Date().toISOString().split('T')[0], transportadora: 'Trans. São Paulo Express', placa: 'ABC-1234', ondas: ondas.slice(0, 2).map(o => o.id), totalVolumes: 8, pesoTotal: 145.5, status: 'gerado' },
        { id: 'CRG-002', data: new Date().toISOString().split('T')[0], transportadora: 'Log Norte LTDA', placa: 'DEF-5678', ondas: ondas.slice(2).map(o => o.id), totalVolumes: 4, pesoTotal: 72.3, status: 'conferido' }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">receipt_long</span>
                    Romaneio de Carga
                </h3>
                <button class="btn btn-primary" onclick="gerarRomaneio()">
                    <span class="material-icons-round" style="font-size:1rem;">note_add</span> Gerar Romaneio
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr>
                        <th>Carga</th><th>Data</th><th>Transportadora</th><th>Placa</th>
                        <th>Volumes</th><th>Peso (kg)</th><th>Status</th><th>Ações</th>
                    </tr></thead>
                    <tbody>
                        ${romaneios.map(r => `
                            <tr>
                                <td><strong>${r.id}</strong></td>
                                <td>${r.data}</td>
                                <td>${r.transportadora}</td>
                                <td>${r.placa}</td>
                                <td style="text-align:center;">${r.totalVolumes}</td>
                                <td style="text-align:center;">${r.pesoTotal}</td>
                                <td><span class="badge ${r.status === 'conferido' ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
                                <td>
                                    <button class="btn btn-secondary btn-icon" onclick="imprimirRomaneio('${r.id}')" title="Imprimir" style="padding:0.3rem;">
                                        <span class="material-icons-round" style="font-size:1rem;">print</span>
                                    </button>
                                    <button class="btn btn-secondary btn-icon" onclick="conferirRomaneio('${r.id}')" title="Conferir" style="padding:0.3rem;">
                                        <span class="material-icons-round" style="font-size:1rem;">fact_check</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.gerarRomaneio = function () {
    const cargas = JSON.parse(localStorage.getItem('wms_cargas') || '[]');
    const novo = {
        id: 'CRG-' + String(cargas.length + 3).padStart(3, '0'),
        data: new Date().toISOString().split('T')[0],
        transportadora: 'Nova Transportadora',
        placa: 'XXX-0000',
        ondas: [],
        totalVolumes: 0,
        pesoTotal: 0,
        status: 'gerado'
    };
    cargas.push(novo);
    localStorage.setItem('wms_cargas', JSON.stringify(cargas));
    alert(`✅ Romaneio ${novo.id} gerado!`);
    renderRomaneio(document.getElementById('view-dynamic'));
};

window.imprimirRomaneio = function (id) {
    alert(`🖨️ Imprimindo romaneio ${id}...`);
};

window.conferirRomaneio = function (id) {
    const cargas = JSON.parse(localStorage.getItem('wms_cargas') || '[]');
    const c = cargas.find(c => c.id === id);
    if (c) { c.status = 'conferido'; localStorage.setItem('wms_cargas', JSON.stringify(cargas)); }
    renderRomaneio(document.getElementById('view-dynamic'));
};

// ========================
// 6. EXPEDIÇÃO
// ========================
function renderExpedicao(container) {
    const cargas = JSON.parse(localStorage.getItem('wms_cargas') || '[]');
    const expedições = JSON.parse(localStorage.getItem('wms_expedicoes') || '[]');
    const todas = expedições.length > 0 ? expedições : [
        { id: 'EXP-001', cargaId: 'CRG-001', doca: 'Doca 03', motorista: 'José da Silva', cpfMotorista: '123.456.789-00', placa: 'ABC-1234', horaSaida: '', status: 'aguardando' },
        { id: 'EXP-002', cargaId: 'CRG-002', doca: 'Doca 01', motorista: 'Carlos Oliveira', cpfMotorista: '987.654.321-00', placa: 'DEF-5678', horaSaida: '14:35', status: 'liberado' }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">local_shipping</span>
                    Expedição
                </h3>
                <span class="badge badge-info">${todas.filter(e => e.status === 'aguardando').length} aguardando</span>
            </div>
            <div style="padding:1rem;">
                ${todas.map(exp => `
                    <div class="card" style="margin-bottom:0.75rem; border-left:3px solid ${exp.status === 'liberado' ? 'var(--success)' : exp.status === 'em_doca' ? 'var(--wms-primary)' : 'var(--warning)'};">
                        <div style="padding:1rem;">
                            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
                                <div>
                                    <strong style="font-size:1rem;">${exp.id}</strong>
                                    <span class="badge ${exp.status === 'liberado' ? 'badge-success' : exp.status === 'em_doca' ? 'badge-info' : 'badge-warning'}" style="margin-left:0.5rem;">
                                        ${exp.status === 'liberado' ? 'Liberado' : exp.status === 'em_doca' ? 'Na Doca' : 'Aguardando'}
                                    </span>
                                </div>
                                ${exp.status !== 'liberado' ? `
                                    <button class="btn btn-primary" onclick="liberarExpedicao('${exp.id}')">
                                        <span class="material-icons-round" style="font-size:1rem;">check_circle</span> Liberar
                                    </button>
                                ` : ''}
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:0.5rem; font-size:0.85rem;">
                                <div><span style="color:var(--text-secondary); font-size:0.75rem;">Carga</span><br><strong>${exp.cargaId}</strong></div>
                                <div><span style="color:var(--text-secondary); font-size:0.75rem;">Doca</span><br><strong>${exp.doca}</strong></div>
                                <div><span style="color:var(--text-secondary); font-size:0.75rem;">Motorista</span><br><strong>${exp.motorista}</strong></div>
                                <div><span style="color:var(--text-secondary); font-size:0.75rem;">Placa</span><br><strong>${exp.placa}</strong></div>
                                <div><span style="color:var(--text-secondary); font-size:0.75rem;">Hora Saída</span><br><strong>${exp.horaSaida || '—'}</strong></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

window.liberarExpedicao = function (expId) {
    const exps = JSON.parse(localStorage.getItem('wms_expedicoes') || '[]');
    let exp = exps.find(e => e.id === expId);
    if (!exp) {
        // default data
        exp = { id: expId, status: 'liberado', horaSaida: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
        exps.push(exp);
    } else {
        exp.status = 'liberado';
        exp.horaSaida = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    localStorage.setItem('wms_expedicoes', JSON.stringify(exps));

    // Integration Hook
    if (window.WmsIntegration) {
        window.WmsIntegration.push('shipments', exp);
    }

    alert(`✅ Expedição ${expId} liberada! Veículo autorizado para saída.`);
    renderExpedicao(document.getElementById('view-dynamic'));
};

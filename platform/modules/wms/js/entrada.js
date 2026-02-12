// WMS Entrada de Produtos - Inbound Flow
// ent-agendamento: Dock scheduling
// ent-conferencia: Goods receiving conference
// ent-armazenagem: Putaway assignment
// (ent-recebimento already handled by inbound.js)

window.loadEntradaView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        case 'ent-agendamento': renderAgendamentoDoca(container); break;
        case 'ent-conferencia': renderConferencia(container); break;
        case 'ent-armazenagem': renderArmazenagem(container); break;
        case 'ent-devolucao': renderDevolucao(container); break;
    }
};

// ========================
// MOCK DATA HELPERS
// ========================
function getDocasMock() {
    let docas = JSON.parse(localStorage.getItem('wms_docas') || 'null');
    if (!docas) {
        docas = [
            { id: 'DOCA-01', name: 'Doca 01 - Recebimento', type: 'RECEBIMENTO', status: 'LIVRE' },
            { id: 'DOCA-02', name: 'Doca 02 - Recebimento', type: 'RECEBIMENTO', status: 'LIVRE' },
            { id: 'DOCA-03', name: 'Doca 03 - Expedição', type: 'EXPEDIÇÃO', status: 'LIVRE' },
            { id: 'DOCA-04', name: 'Doca 04 - Mista', type: 'MISTA', status: 'LIVRE' },
        ];
        localStorage.setItem('wms_docas', JSON.stringify(docas));
    }
    return docas;
}

function getAgendamentosMock() {
    let agendamentos = JSON.parse(localStorage.getItem('wms_agendamentos') || 'null');
    if (!agendamentos) {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        agendamentos = [
            { id: 'AG-001', doca: 'DOCA-01', fornecedor: 'Distribuidora ABC Ltda', nf: '12345', data: today, hora: '08:00', status: 'CONFIRMADO', itens: 15, tipo: 'RECEBIMENTO' },
            { id: 'AG-002', doca: 'DOCA-02', fornecedor: 'Metalúrgica São Paulo', nf: '67890', data: today, hora: '10:30', status: 'EM OPERAÇÃO', itens: 8, tipo: 'RECEBIMENTO' },
            { id: 'AG-003', doca: 'DOCA-01', fornecedor: 'Ferramentas Nacional', nf: '11223', data: today, hora: '14:00', status: 'PENDENTE', itens: 22, tipo: 'RECEBIMENTO' },
            { id: 'AG-004', doca: 'DOCA-03', fornecedor: 'Cliente Final S.A.', nf: '99001', data: today, hora: '09:00', status: 'CONCLUÍDO', itens: 5, tipo: 'EXPEDIÇÃO' },
            { id: 'AG-005', doca: 'DOCA-02', fornecedor: 'Insumos Industriais ME', nf: '44556', data: tomorrow, hora: '08:00', status: 'PENDENTE', itens: 30, tipo: 'RECEBIMENTO' },
            { id: 'AG-006', doca: 'DOCA-04', fornecedor: 'Auto Peças Rápido', nf: '77889', data: tomorrow, hora: '11:00', status: 'PENDENTE', itens: 12, tipo: 'RECEBIMENTO' },
        ];
        localStorage.setItem('wms_agendamentos', JSON.stringify(agendamentos));
    }
    return agendamentos;
}

function getConferenciasMock() {
    let conferencias = JSON.parse(localStorage.getItem('wms_conferencias') || 'null');
    if (!conferencias) {
        conferencias = [
            {
                id: 'CONF-001', nf: '12345', fornecedor: 'Distribuidora ABC Ltda', dataRecebimento: new Date().toISOString(),
                status: 'EM CONFERÊNCIA', conferente: 'João Silva',
                itens: [
                    { sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', qtdNF: 500, qtdFisica: 500, status: 'OK' },
                    { sku: 'SKU-0002', desc: 'Porca Sextavada M6', qtdNF: 200, qtdFisica: 195, status: 'DIVERGENTE' },
                    { sku: 'SKU-0003', desc: 'Arruela Lisa 1/4"', qtdNF: 1000, qtdFisica: null, status: 'PENDENTE' },
                ]
            },
            {
                id: 'CONF-002', nf: '67890', fornecedor: 'Metalúrgica São Paulo', dataRecebimento: new Date().toISOString(),
                status: 'CONCLUÍDA', conferente: 'Maria Souza',
                itens: [
                    { sku: 'SKU-0006', desc: 'Chave Allen 5mm Tramontina', qtdNF: 50, qtdFisica: 50, status: 'OK' },
                    { sku: 'SKU-0007', desc: 'Broca HSS 8mm Bosch', qtdNF: 100, qtdFisica: 100, status: 'OK' },
                ]
            },
            {
                id: 'CONF-003', nf: '11223', fornecedor: 'Ferramentas Nacional', dataRecebimento: new Date().toISOString(),
                status: 'PENDENTE', conferente: '',
                itens: [
                    { sku: 'SKU-0004', desc: 'Óleo Lubrificante WD-40 300ml', qtdNF: 48, qtdFisica: null, status: 'PENDENTE' },
                    { sku: 'SKU-0005', desc: 'Fita Isolante 3M 20m', qtdNF: 200, qtdFisica: null, status: 'PENDENTE' },
                    { sku: 'SKU-0009', desc: 'Disco de Corte 7" DeWalt', qtdNF: 30, qtdFisica: null, status: 'PENDENTE' },
                ]
            }
        ];
        localStorage.setItem('wms_conferencias', JSON.stringify(conferencias));
    }
    return conferencias;
}

function getPutawayTasksMock() {
    let tasks = JSON.parse(localStorage.getItem('wms_putaway') || 'null');
    if (!tasks) {
        tasks = [
            { id: 'PUT-001', sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', qtd: 500, lote: 'L2026-050', nf: '12345', enderecoSugerido: '01-01-0101', status: 'PENDENTE', prioridade: 'ALTA' },
            { id: 'PUT-002', sku: 'SKU-0002', desc: 'Porca Sextavada M6', qtd: 195, lote: 'L2026-051', nf: '12345', enderecoSugerido: '01-01-0102', status: 'PENDENTE', prioridade: 'ALTA' },
            { id: 'PUT-003', sku: 'SKU-0006', desc: 'Chave Allen 5mm Tramontina', qtd: 50, lote: 'L2026-052', nf: '67890', enderecoSugerido: '02-01-0101', status: 'ARMAZENADO', prioridade: 'NORMAL' },
            { id: 'PUT-004', sku: 'SKU-0007', desc: 'Broca HSS 8mm Bosch', qtd: 100, lote: 'L2026-053', nf: '67890', enderecoSugerido: '02-01-0201', status: 'ARMAZENADO', prioridade: 'NORMAL' },
            { id: 'PUT-005', sku: 'SKU-0010', desc: 'Cimento Cola AC-III 20kg', qtd: 40, lote: 'L2026-060', nf: '44556', enderecoSugerido: '03-01-0101', status: 'PENDENTE', prioridade: 'BAIXA' },
        ];
        localStorage.setItem('wms_putaway', JSON.stringify(tasks));
    }
    return tasks;
}

// ========================
// 1. AGENDAMENTO DE DOCA
// ========================
function renderAgendamentoDoca(container) {
    const docas = getDocasMock();
    const agendamentos = getAgendamentosMock();
    const today = new Date().toISOString().split('T')[0];

    const todayAg = agendamentos.filter(a => a.data === today);
    const futureAg = agendamentos.filter(a => a.data > today);

    container.innerHTML = `
        <!-- Doca Status Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            ${docas.map(d => {
        const activeAg = todayAg.find(a => a.doca === d.id && (a.status === 'EM OPERAÇÃO' || a.status === 'CONFIRMADO'));
        const statusColor = activeAg ? (activeAg.status === 'EM OPERAÇÃO' ? '#f59e0b' : '#3b82f6') : '#10b981';
        const statusText = activeAg ? activeAg.status : 'LIVRE';
        return `
                <div class="card" style="padding:1.25rem; border-top:3px solid ${statusColor};">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
                        <span style="font-weight:700; font-size:0.9rem;">${d.id}</span>
                        <span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                            background:${statusColor}20; color:${statusColor};">${statusText}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${d.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">Tipo: ${d.type}</div>
                    ${activeAg ? `<div style="font-size:0.75rem; margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border-color);">
                        <strong>${activeAg.fornecedor}</strong><br>NF ${activeAg.nf} • ${activeAg.hora}
                    </div>` : ''}
                </div>`;
    }).join('')}
        </div>

        <!-- Today's Schedule -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">today</span>
                    Agendamentos de Hoje
                </h3>
                <button onclick="openNovoAgendamento()" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">
                    <span class="material-icons-round" style="font-size:1rem;">add</span> Novo
                </button>
            </div>
            ${todayAg.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Hora</th>
                            <th>Doca</th>
                            <th>Fornecedor</th>
                            <th>NF</th>
                            <th>Itens</th>
                            <th>Tipo</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${todayAg.map(a => {
        const sc = a.status === 'CONCLUÍDO' ? '#10b981' : a.status === 'EM OPERAÇÃO' ? '#f59e0b' : a.status === 'CONFIRMADO' ? '#3b82f6' : '#94a3b8';
        return `<tr>
                                <td style="font-weight:600; font-family:monospace;">${a.id}</td>
                                <td style="font-weight:600;">${a.hora}</td>
                                <td>${a.doca}</td>
                                <td>${a.fornecedor}</td>
                                <td style="font-family:monospace;">${a.nf}</td>
                                <td style="text-align:center;">${a.itens}</td>
                                <td><span style="font-size:0.75rem;">${a.tipo}</span></td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                    background:${sc}15; color:${sc};">${a.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">event_available</span>
                Nenhum agendamento para hoje.
            </div>`}
        </div>

        <!-- Future Schedule -->
        ${futureAg.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Próximos Agendamentos</h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${futureAg.length} agendamentos</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>ID</th><th>Data</th><th>Hora</th><th>Doca</th><th>Fornecedor</th><th>NF</th><th>Itens</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${futureAg.map(a => `<tr>
                            <td style="font-weight:600; font-family:monospace;">${a.id}</td>
                            <td>${new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style="font-weight:600;">${a.hora}</td>
                            <td>${a.doca}</td>
                            <td>${a.fornecedor}</td>
                            <td style="font-family:monospace;">${a.nf}</td>
                            <td style="text-align:center;">${a.itens}</td>
                            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                background:rgba(148,163,184,0.15); color:#94a3b8;">${a.status}</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.openNovoAgendamento = function () {
    const docas = getDocasMock();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="modal-card" style="width:500px;">
            <div class="modal-header">
                <h3 style="font-size:1rem; font-weight:600;">Novo Agendamento de Doca</h3>
                <span class="material-icons-round" style="cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">close</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Doca</label>
                    <select id="ag-doca" class="form-input">
                        ${docas.map(d => `<option value="${d.id}">${d.id} - ${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Fornecedor / Destinatário</label>
                    <input id="ag-fornecedor" class="form-input" placeholder="Nome do fornecedor">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div class="form-group">
                        <label class="form-label">Nota Fiscal</label>
                        <input id="ag-nf" class="form-input" placeholder="Nº da NF">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Qtd. Itens (est.)</label>
                        <input id="ag-itens" type="number" class="form-input" value="1" min="1">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div class="form-group">
                        <label class="form-label">Data</label>
                        <input id="ag-data" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Hora</label>
                        <input id="ag-hora" type="time" class="form-input" value="08:00">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select id="ag-tipo" class="form-input">
                        <option value="RECEBIMENTO">Recebimento</option>
                        <option value="EXPEDIÇÃO">Expedição</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="salvarAgendamento()">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.salvarAgendamento = function () {
    const ag = {
        id: `AG-${String(Date.now()).slice(-6)}`,
        doca: document.getElementById('ag-doca').value,
        fornecedor: document.getElementById('ag-fornecedor').value || 'Fornecedor não informado',
        nf: document.getElementById('ag-nf').value || '-',
        data: document.getElementById('ag-data').value,
        hora: document.getElementById('ag-hora').value,
        itens: parseInt(document.getElementById('ag-itens').value) || 1,
        tipo: document.getElementById('ag-tipo').value,
        status: 'PENDENTE'
    };

    const agendamentos = getAgendamentosMock();
    agendamentos.push(ag);
    localStorage.setItem('wms_agendamentos', JSON.stringify(agendamentos));

    document.querySelector('.modal-overlay').remove();
    renderAgendamentoDoca(document.getElementById('view-dynamic'));
};

// ========================
// 2. CONFERÊNCIA
// ========================
function renderConferencia(container) {
    const conferencias = getConferenciasMock();

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">fact_check</span>
                    Conferência de Recebimento
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${conferencias.length} notas</span>
            </div>

            <!-- Summary badges -->
            <div style="padding:1rem 1.5rem; display:flex; gap:1rem; border-bottom:1px solid var(--border-color);">
                <span style="padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;
                    background:rgba(148,163,184,0.12); color:#94a3b8;">
                    Pendentes: ${conferencias.filter(c => c.status === 'PENDENTE').length}
                </span>
                <span style="padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;
                    background:rgba(245,158,11,0.12); color:#f59e0b;">
                    Em Conferência: ${conferencias.filter(c => c.status === 'EM CONFERÊNCIA').length}
                </span>
                <span style="padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;
                    background:rgba(16,185,129,0.12); color:#10b981;">
                    Concluídas: ${conferencias.filter(c => c.status === 'CONCLUÍDA').length}
                </span>
            </div>

            <!-- Conference list -->
            <div id="conf-list" style="padding:0;">
                ${conferencias.map(c => {
        const sc = c.status === 'CONCLUÍDA' ? '#10b981' : c.status === 'EM CONFERÊNCIA' ? '#f59e0b' : '#94a3b8';
        const totalItens = c.itens.length;
        const conferidos = c.itens.filter(i => i.status !== 'PENDENTE').length;
        const divergentes = c.itens.filter(i => i.status === 'DIVERGENTE').length;
        const pct = totalItens > 0 ? Math.round((conferidos / totalItens) * 100) : 0;

        return `
                    <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-color); cursor:pointer; transition:background 0.15s;"
                         onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'"
                         onclick="openConferenciaDetalhe('${c.id}')">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <span style="font-weight:700; font-family:monospace;">${c.id}</span>
                                <span style="color:var(--text-secondary); font-size:0.85rem;">NF ${c.nf}</span>
                                <span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${c.status}</span>
                            </div>
                            <span class="material-icons-round" style="font-size:1.2rem; color:var(--text-secondary);">chevron_right</span>
                        </div>
                        <div style="font-size:0.85rem; margin-bottom:0.5rem;">${c.fornecedor}</div>
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div style="flex:1; background:rgba(255,255,255,0.05); border-radius:4px; height:6px; overflow:hidden;">
                                <div style="width:${pct}%; height:100%; background:${divergentes > 0 ? '#f59e0b' : '#10b981'}; border-radius:4px;"></div>
                            </div>
                            <span style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap;">
                                ${conferidos}/${totalItens} itens${divergentes > 0 ? ` • <span style="color:#f59e0b;">${divergentes} diverg.</span>` : ''}
                            </span>
                        </div>
                    </div>`;
    }).join('')}
            </div>
        </div>
    `;
}

window.openConferenciaDetalhe = function (confId) {
    const conferencias = getConferenciasMock();
    const conf = conferencias.find(c => c.id === confId);
    if (!conf) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.id = 'modal-conferencia';

    overlay.innerHTML = `
        <div class="modal-card" style="width:750px; max-width:95vw;">
            <div class="modal-header">
                <div>
                    <h3 style="font-size:1rem; font-weight:600;">Conferência ${conf.id} — NF ${conf.nf}</h3>
                    <span style="font-size:0.8rem; color:var(--text-secondary);">${conf.fornecedor}</span>
                </div>
                <span class="material-icons-round" style="cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">close</span>
            </div>
            <div class="modal-body" style="padding:0;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Descrição</th>
                            <th style="text-align:right;">Qtd NF</th>
                            <th style="text-align:right;">Qtd Física</th>
                            <th>Diferença</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${conf.itens.map((item, idx) => {
        const diff = item.qtdFisica !== null ? item.qtdFisica - item.qtdNF : null;
        const diffStr = diff !== null ? (diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`)) : '-';
        const diffColor = diff === null ? '#94a3b8' : diff === 0 ? '#10b981' : '#ef4444';
        const sc = item.status === 'OK' ? '#10b981' : item.status === 'DIVERGENTE' ? '#f59e0b' : '#94a3b8';

        return `<tr>
                                <td style="font-weight:600; font-family:monospace;">${item.sku}</td>
                                <td>${item.desc}</td>
                                <td style="text-align:right; font-weight:600;">${item.qtdNF}</td>
                                <td style="text-align:right;">
                                    ${item.qtdFisica !== null ? `<span style="font-weight:600;">${item.qtdFisica}</span>` :
                `<input type="number" min="0" id="conf-qtd-${idx}" placeholder="Qtd"
                                        style="width:80px; padding:0.3rem 0.5rem; border:1px solid var(--border-color);
                                        border-radius:4px; background:var(--bg-body); color:var(--text-primary);
                                        text-align:right; font-size:0.85rem;">`}
                                </td>
                                <td style="font-weight:600; color:${diffColor};">${diffStr}</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${item.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                ${conf.status !== 'CONCLUÍDA' ? `
                <button class="btn btn-primary" onclick="confirmarConferencia('${conf.id}')">
                    <span class="material-icons-round" style="font-size:1rem;">check</span> Confirmar Itens
                </button>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.confirmarConferencia = function (confId) {
    const conferencias = getConferenciasMock();
    const conf = conferencias.find(c => c.id === confId);
    if (!conf) return;

    let updated = false;
    conf.itens.forEach((item, idx) => {
        if (item.status === 'PENDENTE') {
            const input = document.getElementById(`conf-qtd-${idx}`);
            if (input && input.value !== '') {
                item.qtdFisica = parseInt(input.value);
                item.status = item.qtdFisica === item.qtdNF ? 'OK' : 'DIVERGENTE';
                updated = true;
            }
        }
    });

    if (updated) {
        const allDone = conf.itens.every(i => i.status !== 'PENDENTE');
        if (allDone) conf.status = 'CONCLUÍDA';
        else conf.status = 'EM CONFERÊNCIA';

        localStorage.setItem('wms_conferencias', JSON.stringify(conferencias));
        document.getElementById('modal-conferencia')?.remove();
        renderConferencia(document.getElementById('view-dynamic'));
    }
};

// ========================
// 3. ARMAZENAGEM (PUTAWAY)
// ========================
function renderArmazenagem(container) {
    const tasks = getPutawayTasksMock();
    const pendentes = tasks.filter(t => t.status === 'PENDENTE');
    const armazenados = tasks.filter(t => t.status === 'ARMAZENADO');

    container.innerHTML = `
        <!-- Summary -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#f59e0b,#d97706);
                    display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white; font-size:1.2rem;">pending_actions</span>
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
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Armazenados</div>
                    <div style="font-size:1.3rem; font-weight:700;">${armazenados.length}</div>
                </div>
            </div>
            <div class="card" style="padding:1.25rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#3b82f6,#2563eb);
                    display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white; font-size:1.2rem;">inventory</span>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Total Qtd</div>
                    <div style="font-size:1.3rem; font-weight:700;">${tasks.reduce((s, t) => s + t.qtd, 0).toLocaleString('pt-BR')}</div>
                </div>
            </div>
        </div>

        <!-- Pending Tasks -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">system_update_alt</span>
                    Tarefas de Armazenagem Pendentes
                </h3>
            </div>
            ${pendentes.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Tarefa</th>
                            <th>SKU</th>
                            <th>Descrição</th>
                            <th style="text-align:right;">Qtd</th>
                            <th>Lote</th>
                            <th>NF</th>
                            <th>Endereço Sugerido</th>
                            <th>Prioridade</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendentes.map(t => {
        const pc = t.prioridade === 'ALTA' ? '#ef4444' : t.prioridade === 'NORMAL' ? '#3b82f6' : '#94a3b8';
        return `<tr>
                                <td style="font-weight:600; font-family:monospace;">${t.id}</td>
                                <td style="font-family:monospace;">${t.sku}</td>
                                <td>${t.desc}</td>
                                <td style="text-align:right; font-weight:600;">${t.qtd.toLocaleString('pt-BR')}</td>
                                <td style="font-size:0.8rem;">${t.lote}</td>
                                <td style="font-family:monospace; font-size:0.8rem;">${t.nf}</td>
                                <td style="font-weight:700; font-family:monospace; color:var(--primary-color);">${t.enderecoSugerido}</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                    background:${pc}18; color:${pc};">${t.prioridade}</span></td>
                                <td>
                                    <button onclick="confirmarPutaway('${t.id}')" class="btn btn-primary" style="padding:0.3rem 0.8rem; font-size:0.75rem;">
                                        <span class="material-icons-round" style="font-size:0.9rem;">check</span> Armazenar
                                    </button>
                                </td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Todas as tarefas de armazenagem foram concluídas!
            </div>`}
        </div>

        <!-- Completed Tasks -->
        ${armazenados.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Armazenados Recentes</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>Tarefa</th><th>SKU</th><th>Descrição</th><th style="text-align:right;">Qtd</th><th>Endereço</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${armazenados.map(t => `<tr style="opacity:0.7;">
                            <td style="font-family:monospace;">${t.id}</td>
                            <td style="font-family:monospace;">${t.sku}</td>
                            <td>${t.desc}</td>
                            <td style="text-align:right;">${t.qtd.toLocaleString('pt-BR')}</td>
                            <td style="font-family:monospace;">${t.enderecoSugerido}</td>
                            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                background:rgba(16,185,129,0.12); color:#10b981;">ARMAZENADO</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.confirmarPutaway = function (taskId) {
    const tasks = getPutawayTasksMock();
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'ARMAZENADO';
        localStorage.setItem('wms_putaway', JSON.stringify(tasks));
        renderArmazenagem(document.getElementById('view-dynamic'));
    }
};

// ========================
// 4. DEVOLUÇÃO (placeholder enriched)
// ========================
function renderDevolucao(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">assignment_return</span>
                    Devolução de Cliente
                </h3>
            </div>
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem; opacity:0.25; display:block; margin-bottom:1rem;">assignment_return</span>
                <h3 style="color:var(--text-primary); margin-bottom:0.5rem;">Em Construção</h3>
                <p style="font-size:0.85rem;">Registro de devoluções de clientes com conferência e reestoque.</p>
            </div>
        </div>
    `;
}

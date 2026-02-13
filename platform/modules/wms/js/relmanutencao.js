// WMS Relatórios de Manutenção & Operação
// relm-*: Maintenance reports
// relo-*: Operational reports

window.loadRelManutencaoView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        // Manutenção
        case 'relm-endereco-vazio': renderRelmEnderecoVazio(container); break;
        case 'relm-endereco-bloqueado': renderRelmEnderecoBloqueado(container); break;
        case 'relm-produto-sem-end': renderRelmProdutoSemEnd(container); break;
        case 'relm-curva-abc': renderRelmCurvaABC(container); break;
        case 'relm-ocupacao': renderRelmOcupacao(container); break;
        case 'relm-parametros': renderRelmParametros(container); break;
        case 'relm-auditoria-cadastro': renderRelmAuditoriaCadastro(container); break;
        // Operação
        case 'relo-recebimento': renderReloRecebimento(container); break;
        case 'relo-armazenagem': renderReloArmazenagem(container); break;
        case 'relo-separacao': renderReloSeparacao(container); break;
        case 'relo-expedicao': renderReloExpedicao(container); break;
        case 'relo-produtividade': renderReloProdutividade(container); break;
        case 'relo-divergencias': renderReloDivergencias(container); break;
        case 'relo-movimentacao': renderReloMovimentacao(container); break;
    }
};

// ===================================================================
// RELATÓRIOS DE MANUTENÇÃO
// ===================================================================

// --- 1. Endereços Vazios ---
function renderRelmEnderecoVazio(container) {
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const addresses = mockData.addresses || [];
    const vazios = addresses.filter(a => a.status === 'LIVRE');
    const mock = vazios.length > 0 ? vazios : [
        { id: 'A-01-01-01', rua: 'Rua A', predio: '01', andar: '01', tipo: 'Picking', ultimaMovimentacao: '08/02/2026' },
        { id: 'A-01-02-03', rua: 'Rua A', predio: '01', andar: '02', tipo: 'Pulmão', ultimaMovimentacao: '05/02/2026' },
        { id: 'B-02-01-01', rua: 'Rua B', predio: '02', andar: '01', tipo: 'Picking', ultimaMovimentacao: '10/02/2026' },
        { id: 'C-03-03-02', rua: 'Rua C', predio: '03', andar: '03', tipo: 'Blocado', ultimaMovimentacao: '01/02/2026' },
        { id: 'D-01-01-04', rua: 'Rua D', predio: '01', andar: '01', tipo: 'Picking', ultimaMovimentacao: '12/02/2026' },
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">check_box_outline_blank</span> Endereços Vazios</h3>
                <span class="badge badge-success">${mock.length} livres</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Endereço</th><th>Rua</th><th>Prédio</th><th>Andar</th><th>Tipo</th><th>Última Movimentação</th></tr></thead>
                    <tbody>
                        ${mock.map(a => `<tr>
                            <td style="font-family:monospace; font-weight:600;">${a.id}</td>
                            <td>${a.rua || '-'}</td>
                            <td style="text-align:center;">${a.predio || '-'}</td>
                            <td style="text-align:center;">${a.andar || '-'}</td>
                            <td>${a.tipo || 'Padrão'}</td>
                            <td style="color:var(--text-secondary);">${a.ultimaMovimentacao || '-'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 2. Endereços Bloqueados ---
function renderRelmEnderecoBloqueado(container) {
    const bloqueios = JSON.parse(localStorage.getItem('wms_bloqueios') || '[]');
    const ativos = bloqueios.filter(b => b.status !== 'LIBERADO');
    const mock = ativos.length > 0 ? ativos : [
        { id: 'BLQ-001', ref: '02-01-0201', tipo: 'ENDEREÇO', motivo: 'Conferência pendente', status: 'BLOQUEADO', data: new Date().toISOString() },
        { id: 'BLQ-002', ref: 'SKU-0012', tipo: 'SKU', motivo: 'Produto vencido', status: 'QUARENTENA', data: new Date(Date.now() - 86400000).toISOString() },
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">block</span> Endereços/SKUs Bloqueados</h3>
                <span class="badge badge-danger">${mock.length} bloqueados</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Tipo</th><th>Referência</th><th>Motivo</th><th>Status</th><th>Data</th></tr></thead>
                    <tbody>
                        ${mock.map(b => {
        const sc = b.status === 'BLOQUEADO' ? '#ef4444' : '#f59e0b';
        return `<tr>
                                <td><strong>${b.id}</strong></td>
                                <td>${b.tipo}</td>
                                <td style="font-family:monospace; font-weight:600;">${b.ref}</td>
                                <td>${b.motivo}</td>
                                <td><span style="padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:${sc}18;color:${sc};">${b.status}</span></td>
                                <td>${new Date(b.data).toLocaleDateString('pt-BR')}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 3. Produtos sem Endereço ---
function renderRelmProdutoSemEnd(container) {
    const prods = [
        { sku: 'SKU-9001', descricao: 'Rolamento 6205 ZZ', grupo: 'Rolamentos', estoque: 150, status: 'sem_endereço' },
        { sku: 'SKU-9002', descricao: 'Graxa Azul 500g', grupo: 'Lubrificantes', estoque: 80, status: 'sem_endereço' },
        { sku: 'SKU-9003', descricao: 'Disco Flap 4.5"', grupo: 'Abrasivos', estoque: 200, status: 'sem_endereço' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">warning</span> Produtos sem Endereço</h3>
                <span class="badge badge-warning">${prods.length} pendentes</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>SKU</th><th>Descrição</th><th>Grupo</th><th>Estoque</th><th>Status</th></tr></thead>
                    <tbody>
                        ${prods.map(p => `<tr>
                            <td style="font-family:monospace; font-weight:600;">${p.sku}</td>
                            <td>${p.descricao}</td>
                            <td>${p.grupo}</td>
                            <td style="text-align:center; font-weight:600;">${p.estoque}</td>
                            <td><span class="badge badge-warning">Sem Endereço</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 4. Curva ABC ---
function renderRelmCurvaABC(container) {
    const curva = [
        { classe: 'A', qtdSKUs: 45, pctSKU: '15%', pctFaturamento: '80%', color: '#22c55e' },
        { classe: 'B', qtdSKUs: 90, pctSKU: '30%', pctFaturamento: '15%', color: '#f59e0b' },
        { classe: 'C', qtdSKUs: 165, pctSKU: '55%', pctFaturamento: '5%', color: '#ef4444' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">bar_chart</span> Curva ABC</h3>
            </div>
            <div style="padding:1rem;">
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.5rem;">
                    ${curva.map(c => `
                        <div class="card" style="padding:1.25rem; text-align:center; border-top:3px solid ${c.color};">
                            <div style="font-size:2rem; font-weight:700; color:${c.color};">Classe ${c.classe}</div>
                            <div style="font-size:0.85rem; margin-top:0.5rem;"><strong>${c.qtdSKUs}</strong> SKUs (${c.pctSKU})</div>
                            <div style="font-size:0.85rem; color:var(--text-secondary);">Faturamento: <strong>${c.pctFaturamento}</strong></div>
                        </div>
                    `).join('')}
                </div>
                <table class="data-table">
                    <thead><tr><th>Classe</th><th>Qtd SKUs</th><th>% SKUs</th><th>% Faturamento</th><th>Distribuição</th></tr></thead>
                    <tbody>
                        ${curva.map(c => `<tr>
                            <td><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:${c.color};color:#fff;text-align:center;line-height:24px;font-weight:700;font-size:0.8rem;">${c.classe}</span></td>
                            <td style="text-align:center; font-weight:600;">${c.qtdSKUs}</td>
                            <td style="text-align:center;">${c.pctSKU}</td>
                            <td style="text-align:center; font-weight:600;">${c.pctFaturamento}</td>
                            <td><div style="background:var(--bg-hover);border-radius:3px;height:8px;"><div style="width:${parseInt(c.pctFaturamento)}%;height:100%;background:${c.color};border-radius:3px;"></div></div></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 5. Ocupação por Rua ---
function renderRelmOcupacao(container) {
    const ruas = [
        { nome: 'Rua A', total: 120, ocupados: 95, bloqueados: 3 },
        { nome: 'Rua B', total: 100, ocupados: 62, bloqueados: 5 },
        { nome: 'Rua C', total: 80, ocupados: 45, bloqueados: 0 },
        { nome: 'Blocado', total: 40, ocupados: 35, bloqueados: 2 },
        { nome: 'Picking', total: 60, ocupados: 58, bloqueados: 0 },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">grid_view</span> Ocupação por Rua</h3>
            </div>
            <div style="padding:1rem;">
                ${ruas.map(r => {
        const pct = Math.round(r.ocupados / r.total * 100);
        const barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';
        return `
                    <div style="margin-bottom:1rem;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                            <strong style="font-size:0.85rem;">${r.nome}</strong>
                            <span style="font-size:0.8rem;color:var(--text-secondary);">${r.ocupados}/${r.total} (${pct}%) — ${r.bloqueados} bloqueados</span>
                        </div>
                        <div style="display:flex;height:20px;border-radius:6px;overflow:hidden;">
                            <div style="width:${pct}%;background:${barColor};" title="Ocupado"></div>
                            <div style="width:${Math.round(r.bloqueados / r.total * 100)}%;background:#ef4444;" title="Bloqueado"></div>
                            <div style="flex:1;background:var(--bg-hover);" title="Livre"></div>
                        </div>
                    </div>`;
    }).join('')}
            </div>
        </div>
    `;
}

// --- 6. Parâmetros de Armazenagem ---
function renderRelmParametros(container) {
    const params = [
        { param: 'Estratégia Padrão', valor: 'FIFO', descricao: 'First In, First Out' },
        { param: 'Tipo de Endereço', valor: 'Misto', descricao: 'Picking + Pulmão' },
        { param: 'Contagem Cega', valor: 'Ativo', descricao: 'Conferência sem visualizar saldo' },
        { param: 'Gerar LPN Automático', valor: 'Sim', descricao: 'Etiqueta de palete auto' },
        { param: 'Cross-Docking', valor: 'Desabilitado', descricao: 'Direto doca-expedição' },
        { param: 'Wave Picking', valor: 'Ativo', descricao: 'Separação por onda' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">tune</span> Parâmetros de Armazenagem</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Parâmetro</th><th>Valor</th><th>Descrição</th></tr></thead>
                    <tbody>
                        ${params.map(p => `<tr>
                            <td><strong>${p.param}</strong></td>
                            <td><span class="badge ${p.valor === 'Ativo' || p.valor === 'Sim' || p.valor === 'FIFO' ? 'badge-success' : p.valor === 'Desabilitado' ? 'badge-secondary' : 'badge-info'}">${p.valor}</span></td>
                            <td style="color:var(--text-secondary); font-size:0.85rem;">${p.descricao}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 7. Auditoria de Cadastros ---
function renderRelmAuditoriaCadastro(container) {
    const logs = [
        { data: '12/02 10:15', entidade: 'Produto', acao: 'Criação', ref: 'SKU-1001', usuario: 'admin', detalhe: 'Parafuso M8x30 adicionado' },
        { data: '12/02 11:00', entidade: 'Cliente', acao: 'Edição', ref: 'CLI-015', usuario: 'supervisor1', detalhe: 'Endereço atualizado' },
        { data: '11/02 14:30', entidade: 'Transportadora', acao: 'Criação', ref: 'TRP-003', usuario: 'admin', detalhe: 'Nova transportadora: Rápido Express' },
        { data: '11/02 09:00', entidade: 'Fornecedor', acao: 'Exclusão', ref: 'FORN-008', usuario: 'admin', detalhe: 'Fornecedor inativo removido' },
    ];
    const acaoColor = { 'Criação': '#22c55e', 'Edição': '#f59e0b', 'Exclusão': '#ef4444' };
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">history</span> Auditoria de Cadastros</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Data/Hora</th><th>Entidade</th><th>Ação</th><th>Referência</th><th>Usuário</th><th>Detalhe</th></tr></thead>
                    <tbody>
                        ${logs.map(l => `<tr>
                            <td>${l.data}</td>
                            <td>${l.entidade}</td>
                            <td><span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${acaoColor[l.acao] || 'gray'};"></span>${l.acao}</span></td>
                            <td style="font-family:monospace; font-weight:600;">${l.ref}</td>
                            <td>${l.usuario}</td>
                            <td style="color:var(--text-secondary); font-size:0.85rem;">${l.detalhe}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ===================================================================
// RELATÓRIOS DE OPERAÇÃO
// ===================================================================

// --- 1. Recebimentos do Dia ---
function renderReloRecebimento(container) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const today = new Date().toISOString().split('T')[0];
    const todayR = receipts.filter(r => r.createdAt?.startsWith(today));
    const data = todayR.length > 0 ? todayR : [
        { nf: 'NF-12345', fornecedor: 'Auto Peças Brasil', dock: 'Doca 02', totalItems: 5, totalQty: 500, status: 'FINALIZADO', createdAt: new Date().toISOString() },
        { nf: 'NF-12346', fornecedor: 'Ferraguista Central', dock: 'Doca 01', totalItems: 3, totalQty: 150, status: 'CONFERENCIA', createdAt: new Date().toISOString() },
        { nf: 'NF-12347', fornecedor: 'Lubrificantes SA', dock: '-', totalItems: 2, totalQty: 80, status: 'AGUARDANDO', createdAt: new Date().toISOString() },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">inbox</span> Recebimentos do Dia</h3>
                <span class="badge badge-info">${data.length} NFs</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>NF</th><th>Fornecedor</th><th>Doca</th><th>Itens</th><th>Qtd Total</th><th>Status</th><th>Hora</th></tr></thead>
                    <tbody>
                        ${data.map(r => {
        const sc = r.status === 'FINALIZADO' ? '#10b981' : r.status === 'CONFERENCIA' ? '#f59e0b' : '#3b82f6';
        return `<tr>
                                <td style="font-weight:600;">${r.nf || r.id}</td>
                                <td>${r.fornecedor || r.supplier || '-'}</td>
                                <td>${r.dock || '-'}</td>
                                <td style="text-align:center;">${r.totalItems || 0}</td>
                                <td style="text-align:right; font-weight:600;">${(r.totalQty || 0).toLocaleString('pt-BR')}</td>
                                <td><span style="padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:${sc}18;color:${sc};">${r.status}</span></td>
                                <td style="font-size:0.8rem;">${r.createdAt ? new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 2. Armazenagens Pendentes ---
function renderReloArmazenagem(container) {
    const tasks = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const pendentes = tasks.filter(t => t.status === 'PENDENTE');
    const data = pendentes.length > 0 ? pendentes : [
        { id: 'PUT-001', sku: 'SKU-1001', desc: 'Parafuso M8x30', qtd: 500, destino: 'A-01-01-01', prioridade: 'Alta' },
        { id: 'PUT-002', sku: 'SKU-2015', desc: 'Óleo 15W40', qtd: 80, destino: 'B-02-03-02', prioridade: 'Normal' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">vertical_align_bottom</span> Armazenagens Pendentes</h3>
                <span class="badge badge-warning">${data.length} pendentes</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Task</th><th>SKU</th><th>Descrição</th><th>Qtd</th><th>Destino</th><th>Prioridade</th></tr></thead>
                    <tbody>
                        ${data.map(t => `<tr>
                            <td style="font-family:monospace; font-weight:600;">${t.id}</td>
                            <td style="font-family:monospace;">${t.sku}</td>
                            <td>${t.desc || t.descricao || '-'}</td>
                            <td style="text-align:center; font-weight:600;">${t.qtd || t.qty || 0}</td>
                            <td style="font-family:monospace;">${t.destino || t.address || '-'}</td>
                            <td>${t.prioridade || 'Normal'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 3. Separações do Dia ---
function renderReloSeparacao(container) {
    const picking = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const today = new Date().toISOString().split('T')[0];
    const data = picking.length > 0 ? picking : [
        { onda: 'OND-003', pedidos: 5, itens: 18, status: 'EM SEPARAÇÃO', operador: 'separador1', inicio: '10:30' },
        { onda: 'OND-004', pedidos: 3, itens: 12, status: 'CONCLUÍDA', operador: 'separador2', inicio: '09:00' },
        { onda: 'OND-005', pedidos: 8, itens: 35, status: 'PENDENTE', operador: '-', inicio: '-' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">shopping_cart</span> Separações do Dia</h3>
                <span class="badge badge-info">${data.length} ondas</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Onda</th><th>Pedidos</th><th>Itens</th><th>Status</th><th>Operador</th><th>Início</th></tr></thead>
                    <tbody>
                        ${data.map(d => {
        const sc = d.status === 'CONCLUÍDA' ? '#10b981' : d.status === 'EM SEPARAÇÃO' ? '#f59e0b' : '#3b82f6';
        return `<tr>
                                <td style="font-family:monospace; font-weight:600;">${d.onda || d.id || '-'}</td>
                                <td style="text-align:center;">${d.pedidos || 0}</td>
                                <td style="text-align:center;">${d.itens || 0}</td>
                                <td><span style="padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:${sc}18;color:${sc};">${d.status}</span></td>
                                <td>${d.operador || '-'}</td>
                                <td>${d.inicio || '-'}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 4. Expedições do Dia ---
function renderReloExpedicao(container) {
    const cargas = [
        { id: 'CRG-001', transportadora: 'Rápido Express', placa: 'ABC-1234', doca: 'Doca 03', volumes: 12, peso: '450 kg', status: 'LIBERADO', hora: '14:35' },
        { id: 'CRG-002', transportadora: 'TransLog', placa: 'DEF-5678', doca: 'Doca 01', volumes: 8, peso: '280 kg', status: 'EM DOCA', hora: '15:00' },
        { id: 'CRG-003', transportadora: 'Expresso Sul', placa: '-', doca: '-', volumes: 15, peso: '600 kg', status: 'AGUARDANDO', hora: '-' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">local_shipping</span> Expedições do Dia</h3>
                <span class="badge badge-info">${cargas.length} cargas</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Carga</th><th>Transportadora</th><th>Placa</th><th>Doca</th><th>Volumes</th><th>Peso</th><th>Status</th><th>Hora</th></tr></thead>
                    <tbody>
                        ${cargas.map(c => {
        const sc = c.status === 'LIBERADO' ? '#10b981' : c.status === 'EM DOCA' ? '#f59e0b' : '#3b82f6';
        return `<tr>
                                <td style="font-weight:600;">${c.id}</td>
                                <td>${c.transportadora}</td>
                                <td style="font-family:monospace;">${c.placa}</td>
                                <td>${c.doca}</td>
                                <td style="text-align:center;">${c.volumes}</td>
                                <td style="text-align:right;">${c.peso}</td>
                                <td><span style="padding:2px 8px;border-radius:12px;font-size:0.65rem;font-weight:600;background:${sc}18;color:${sc};">${c.status}</span></td>
                                <td>${c.hora}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 5. Produtividade Operador ---
function renderReloProdutividade(container) {
    const ops = [
        { nome: 'operador1', funcao: 'Recebimento', tarefas: 45, media: '12 un/h', eficiencia: 95 },
        { nome: 'operador2', funcao: 'Separação', tarefas: 62, media: '18 un/h', eficiencia: 88 },
        { nome: 'separador1', funcao: 'Separação', tarefas: 55, media: '15 un/h', eficiencia: 82 },
        { nome: 'operador3', funcao: 'Armazenagem', tarefas: 38, media: '10 un/h', eficiencia: 91 },
        { nome: 'auditor1', funcao: 'Inventário', tarefas: 28, media: '22 end/h', eficiencia: 97 },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">person</span> Produtividade por Operador</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Operador</th><th>Função</th><th>Tarefas</th><th>Média</th><th>Eficiência</th><th></th></tr></thead>
                    <tbody>
                        ${ops.map(o => {
        const color = o.eficiencia >= 90 ? '#10b981' : o.eficiencia >= 75 ? '#f59e0b' : '#ef4444';
        return `<tr>
                                <td><strong>${o.nome}</strong></td>
                                <td>${o.funcao}</td>
                                <td style="text-align:center; font-weight:600;">${o.tarefas}</td>
                                <td>${o.media}</td>
                                <td style="text-align:center; font-weight:600; color:${color};">${o.eficiencia}%</td>
                                <td style="width:100px;"><div style="background:var(--bg-hover);border-radius:3px;height:6px;"><div style="width:${o.eficiencia}%;height:100%;background:${color};border-radius:3px;"></div></div></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 6. Divergências ---
function renderReloDivergencias(container) {
    const divs = [
        { id: 'DIV-001', data: '12/02', origem: 'Conferência NF', sku: 'SKU-1001', esperado: 100, encontrado: 98, severity: 'baixa', status: 'resolvido' },
        { id: 'DIV-002', data: '12/02', origem: 'Inventário', sku: 'SKU-2015', esperado: 120, encontrado: 125, severity: 'media', status: 'pendente' },
        { id: 'DIV-004', data: '11/02', origem: 'Conferência NF', sku: 'SKU-4088', esperado: 200, encontrado: 180, severity: 'alta', status: 'pendente' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">difference</span> Divergências Operacionais</h3>
                <span class="badge badge-warning">${divs.filter(d => d.status === 'pendente').length} pendentes</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Data</th><th>Origem</th><th>SKU</th><th>Esperado</th><th>Encontrado</th><th>Diff</th><th>Sev.</th><th>Status</th></tr></thead>
                    <tbody>
                        ${divs.map(d => {
        const diff = d.encontrado - d.esperado;
        const sevColor = d.severity === 'alta' ? '#ef4444' : d.severity === 'media' ? '#f59e0b' : '#10b981';
        return `<tr>
                                <td><strong>${d.id}</strong></td>
                                <td>${d.data}</td>
                                <td>${d.origem}</td>
                                <td style="font-family:monospace;">${d.sku}</td>
                                <td style="text-align:center;">${d.esperado}</td>
                                <td style="text-align:center;">${d.encontrado}</td>
                                <td style="text-align:center;color:${diff >= 0 ? '#10b981' : '#ef4444'};font-weight:bold;">${diff >= 0 ? '+' : ''}${diff}</td>
                                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevColor};margin-right:4px;"></span>${d.severity}</td>
                                <td><span class="badge ${d.status === 'resolvido' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- 7. Movimentação (Kardex) ---
function renderReloMovimentacao(container) {
    const movs = [
        { data: '12/02 10:15', tipo: 'Entrada NF', ref: 'NF-12345', sku: 'SKU-1001', qtd: 500, de: 'Doca 02', para: 'A-01-01-01' },
        { data: '12/02 11:30', tipo: 'Transferência', ref: 'TRF-088', sku: 'SKU-1001', qtd: 100, de: 'A-01-01-01', para: 'A-01-02-03' },
        { data: '12/02 14:00', tipo: 'Separação', ref: 'OND-003', sku: 'SKU-1001', qtd: -50, de: 'A-01-02-03', para: 'Expedição' },
        { data: '12/02 15:20', tipo: 'Ajuste', ref: 'AJ-002', sku: 'SKU-2015', qtd: -5, de: 'B-02-03-02', para: '-' },
    ];
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">swap_vert</span> Movimentação do Dia (Kardex)</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Data/Hora</th><th>Tipo</th><th>Referência</th><th>SKU</th><th>Qtd</th><th>Origem</th><th>Destino</th></tr></thead>
                    <tbody>
                        ${movs.map(m => {
        const color = m.qtd >= 0 ? '#10b981' : '#ef4444';
        return `<tr>
                                <td>${m.data}</td><td>${m.tipo}</td><td><strong>${m.ref}</strong></td><td style="font-family:monospace;">${m.sku}</td>
                                <td style="text-align:center;color:${color};font-weight:bold;">${m.qtd >= 0 ? '+' : ''}${m.qtd}</td>
                                <td>${m.de}</td><td>${m.para}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

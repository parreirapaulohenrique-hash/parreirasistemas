// WMS Controle & Auditoria
// aud-inventario: Cyclic inventory
// est-transferencia: Address transfer
// est-bloqueio: Block/quarantine
// aud-contagem, aud-divergencias, aud-rastreio, aud-log: enriched placeholders

window.loadControleView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        case 'aud-inventario': renderInventarioCiclico(container); break;
        case 'est-transferencia': renderTransferencia(container); break;
        case 'est-bloqueio': renderBloqueio(container); break;
        case 'est-ajuste': renderAjusteEstoque(container); break;
        case 'aud-contagem': renderContagemRotativa(container); break;
        case 'aud-divergencias': renderDivergencias(container); break;
        case 'aud-rastreio': renderRastreabilidade(container); break;
        case 'aud-log': renderLogOperacoes(container); break;
    }
};

// ========================
// MOCK DATA
// ========================
function getInventariosMock() {
    let inv = JSON.parse(localStorage.getItem('wms_inventarios') || 'null');
    if (!inv) {
        inv = [
            {
                id: 'INV-001', tipo: 'CÍCLICO', data: new Date().toISOString().split('T')[0], status: 'EM ANDAMENTO',
                enderecos: [
                    { endereco: '01-01-0101', sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', saldoSistema: 250, contagem: null, status: 'PENDENTE' },
                    { endereco: '01-01-0102', sku: 'SKU-0002', desc: 'Porca Sextavada M6', saldoSistema: 480, contagem: 475, status: 'DIVERGENTE' },
                    { endereco: '01-02-0201', sku: 'SKU-0003', desc: 'Arruela Lisa 1/4"', saldoSistema: 1200, contagem: 1200, status: 'OK' },
                ]
            },
            {
                id: 'INV-002', tipo: 'CÍCLICO', data: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0], status: 'FINALIZADO',
                enderecos: [
                    { endereco: '02-01-0101', sku: 'SKU-0006', desc: 'Chave Allen 5mm', saldoSistema: 42, contagem: 42, status: 'OK' },
                    { endereco: '02-01-0201', sku: 'SKU-0007', desc: 'Broca HSS 8mm', saldoSistema: 80, contagem: 80, status: 'OK' },
                ]
            }
        ];
        localStorage.setItem('wms_inventarios', JSON.stringify(inv));
    }
    return inv;
}

// ========================
// 1. INVENTÁRIO CÍCLICO
// ========================
function renderInventarioCiclico(container) {
    const inventarios = getInventariosMock();
    const emAndamento = inventarios.filter(i => i.status === 'EM ANDAMENTO');
    const finalizados = inventarios.filter(i => i.status === 'FINALIZADO');

    container.innerHTML = `
        <!-- Summary -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Em Andamento</div>
                <div style="font-size:1.5rem; font-weight:700; color:#f59e0b;">${emAndamento.length}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Finalizados</div>
                <div style="font-size:1.5rem; font-weight:700; color:#10b981;">${finalizados.length}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">End. Contados (Hoje)</div>
                <div style="font-size:1.5rem; font-weight:700;">
                    ${emAndamento.reduce((s, i) => s + i.enderecos.filter(e => e.status !== 'PENDENTE').length, 0)}
                </div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Divergências</div>
                <div style="font-size:1.5rem; font-weight:700; color:#ef4444;">
                    ${inventarios.reduce((s, i) => s + i.enderecos.filter(e => e.status === 'DIVERGENTE').length, 0)}
                </div>
            </div>
        </div>

        <!-- Active inventories -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">inventory</span>
                    Inventários em Andamento
                </h3>
                <button onclick="criarInventario()" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">
                    <span class="material-icons-round" style="font-size:1rem;">add</span> Novo Inventário
                </button>
            </div>

            ${emAndamento.length > 0 ? emAndamento.map(inv => {
        const total = inv.enderecos.length;
        const contados = inv.enderecos.filter(e => e.status !== 'PENDENTE').length;
        const pct = total > 0 ? Math.round((contados / total) * 100) : 0;
        const divergentes = inv.enderecos.filter(e => e.status === 'DIVERGENTE').length;

        return `
                <div style="padding:1.25rem 1.5rem; border-bottom:1px solid var(--border-color);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span style="font-weight:700; font-family:monospace;">${inv.id}</span>
                            <span style="font-size:0.8rem; color:var(--text-secondary);">Tipo: ${inv.tipo}</span>
                            <span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                background:rgba(245,158,11,0.12); color:#f59e0b;">EM ANDAMENTO</span>
                        </div>
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${new Date(inv.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    </div>

                    <!-- Progress -->
                    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                        <div style="flex:1; background:rgba(255,255,255,0.05); border-radius:4px; height:8px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:${divergentes > 0 ? '#f59e0b' : '#10b981'}; border-radius:4px; transition:width 0.3s;"></div>
                        </div>
                        <span style="font-size:0.8rem; font-weight:600;">${pct}%</span>
                    </div>

                    <!-- Address table -->
                    <table class="data-table" style="margin:-1px;">
                        <thead>
                            <tr>
                                <th>Endereço</th>
                                <th>SKU</th>
                                <th>Descrição</th>
                                <th style="text-align:right;">Saldo Sistema</th>
                                <th style="text-align:right;">Contagem</th>
                                <th>Diff</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inv.enderecos.map((e, idx) => {
            const diff = e.contagem !== null ? e.contagem - e.saldoSistema : null;
            const diffStr = diff !== null ? (diff === 0 ? '0' : diff > 0 ? `+${diff}` : `${diff}`) : '-';
            const diffColor = diff === null ? '#94a3b8' : diff === 0 ? '#10b981' : '#ef4444';
            const sc = e.status === 'OK' ? '#10b981' : e.status === 'DIVERGENTE' ? '#f59e0b' : '#94a3b8';

            return `<tr>
                                    <td style="font-weight:600; font-family:monospace;">${e.endereco}</td>
                                    <td style="font-family:monospace;">${e.sku}</td>
                                    <td>${e.desc}</td>
                                    <td style="text-align:right; font-weight:600;">${e.saldoSistema}</td>
                                    <td style="text-align:right;">
                                        ${e.contagem !== null ? `<span style="font-weight:600;">${e.contagem}</span>` :
                    `<input type="number" min="0" id="inv-${inv.id}-${idx}" placeholder="Qtd"
                                            style="width:80px; padding:0.3rem 0.5rem; border:1px solid var(--border-color);
                                            border-radius:4px; background:var(--bg-body); color:var(--text-primary);
                                            text-align:right; font-size:0.85rem;">`}
                                    </td>
                                    <td style="font-weight:600; color:${diffColor};">${diffStr}</td>
                                    <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                        background:${sc}18; color:${sc};">${e.status}</span></td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>

                    <div style="display:flex; gap:0.75rem; margin-top:1rem;">
                        <button onclick="salvarContagem('${inv.id}')" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;">
                            <span class="material-icons-round" style="font-size:0.9rem;">save</span> Salvar Contagem
                        </button>
                        ${contados === total ? `
                        <button onclick="finalizarInventario('${inv.id}')" class="btn btn-secondary" style="padding:0.4rem 1rem; font-size:0.8rem;">
                            <span class="material-icons-round" style="font-size:0.9rem;">check_circle</span> Finalizar
                        </button>` : ''}
                    </div>
                </div>`;
    }).join('') : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">inventory_2</span>
                Nenhum inventário em andamento. Clique em "Novo Inventário" para iniciar.
            </div>`}
        </div>

        <!-- Completed -->
        ${finalizados.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Inventários Finalizados</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Tipo</th><th>Data</th><th>Endereços</th><th>Divergências</th><th>Status</th></tr></thead>
                    <tbody>
                        ${finalizados.map(inv => `<tr style="opacity:0.7;">
                            <td style="font-family:monospace; font-weight:600;">${inv.id}</td>
                            <td>${inv.tipo}</td>
                            <td>${new Date(inv.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td style="text-align:center;">${inv.enderecos.length}</td>
                            <td style="text-align:center; color:${inv.enderecos.some(e => e.status === 'DIVERGENTE') ? '#f59e0b' : '#10b981'};">
                                ${inv.enderecos.filter(e => e.status === 'DIVERGENTE').length}
                            </td>
                            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                background:rgba(16,185,129,0.12); color:#10b981;">FINALIZADO</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.criarInventario = function () {
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const addresses = mockData.addresses || [];

    // Pick random 5 addresses or use defaults
    const selected = addresses.length > 0
        ? addresses.sort(() => Math.random() - 0.5).slice(0, 5)
        : [
            { id: '01-03-0101', status: 'OCUPADO' },
            { id: '01-03-0102', status: 'OCUPADO' },
            { id: '02-02-0101', status: 'OCUPADO' },
        ];

    const products = ['Óleo WD-40 300ml', 'Fita Isolante 3M', 'Lixa d\'água 220', 'Disco de Corte 7"', 'Chave Allen 5mm'];

    const inventarios = getInventariosMock();
    const newInv = {
        id: `INV-${String(inventarios.length + 1).padStart(3, '0')}`,
        tipo: 'CÍCLICO',
        data: new Date().toISOString().split('T')[0],
        status: 'EM ANDAMENTO',
        enderecos: selected.map((a, i) => ({
            endereco: a.id || a.address || `0${i + 1}-01-0101`,
            sku: `SKU-${String(i + 4).padStart(4, '0')}`,
            desc: products[i % products.length],
            saldoSistema: Math.floor(Math.random() * 200) + 20,
            contagem: null,
            status: 'PENDENTE'
        }))
    };

    inventarios.push(newInv);
    localStorage.setItem('wms_inventarios', JSON.stringify(inventarios));
    renderInventarioCiclico(document.getElementById('view-dynamic'));
};

window.salvarContagem = function (invId) {
    const inventarios = getInventariosMock();
    const inv = inventarios.find(i => i.id === invId);
    if (!inv) return;

    let updated = false;
    inv.enderecos.forEach((e, idx) => {
        if (e.status === 'PENDENTE') {
            const input = document.getElementById(`inv-${invId}-${idx}`);
            if (input && input.value !== '') {
                e.contagem = parseInt(input.value);
                e.status = e.contagem === e.saldoSistema ? 'OK' : 'DIVERGENTE';
                updated = true;
            }
        }
    });

    if (updated) {
        localStorage.setItem('wms_inventarios', JSON.stringify(inventarios));
        renderInventarioCiclico(document.getElementById('view-dynamic'));
    }
};

window.finalizarInventario = function (invId) {
    const inventarios = getInventariosMock();
    const inv = inventarios.find(i => i.id === invId);
    if (inv) {
        inv.status = 'FINALIZADO';
        localStorage.setItem('wms_inventarios', JSON.stringify(inventarios));
        renderInventarioCiclico(document.getElementById('view-dynamic'));
    }
};

// ========================
// 2. TRANSFERÊNCIA DE ENDEREÇO
// ========================
function renderTransferencia(container) {
    let transferencias = JSON.parse(localStorage.getItem('wms_transferencias') || 'null');
    if (!transferencias) {
        transferencias = [
            { id: 'TRF-001', sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', qtd: 100, origem: '01-01-0101', destino: '01-02-0101', motivo: 'Reorganização', status: 'CONCLUÍDA', data: new Date(Date.now() - 86400000).toISOString() },
            { id: 'TRF-002', sku: 'SKU-0008', desc: 'Lixa d\'água 220', qtd: 50, origem: '02-02-0101', destino: '02-03-0101', motivo: 'Otimização ABC', status: 'CONCLUÍDA', data: new Date(Date.now() - 86400000 * 2).toISOString() },
        ];
        localStorage.setItem('wms_transferencias', JSON.stringify(transferencias));
    }

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">swap_horiz</span>
                    Nova Transferência de Endereço
                </h3>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                    <div class="form-group">
                        <label class="form-label">SKU</label>
                        <input id="trf-sku" class="form-input" placeholder="Código do produto">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Quantidade</label>
                        <input id="trf-qtd" type="number" class="form-input" min="1" value="1">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:1rem; align-items:end; margin-bottom:1rem;">
                    <div class="form-group">
                        <label class="form-label">Endereço Origem</label>
                        <input id="trf-origem" class="form-input" placeholder="Ex: 01-01-0101" style="font-family:monospace;">
                    </div>
                    <span class="material-icons-round" style="font-size:1.5rem; color:var(--primary-color); padding-bottom:0.6rem;">arrow_forward</span>
                    <div class="form-group">
                        <label class="form-label">Endereço Destino</label>
                        <input id="trf-destino" class="form-input" placeholder="Ex: 02-01-0201" style="font-family:monospace;">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:1rem;">
                    <label class="form-label">Motivo</label>
                    <select id="trf-motivo" class="form-input">
                        <option value="Reorganização">Reorganização</option>
                        <option value="Otimização ABC">Otimização Curva ABC</option>
                        <option value="Avaria no endereço">Avaria no Endereço</option>
                        <option value="Solicitação operacional">Solicitação Operacional</option>
                    </select>
                </div>
                <button onclick="salvarTransferencia()" class="btn btn-primary">
                    <span class="material-icons-round" style="font-size:1rem;">swap_horiz</span> Registrar Transferência
                </button>
            </div>
        </div>

        <!-- History -->
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Histórico de Transferências</h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${transferencias.length} registros</span>
            </div>
            ${transferencias.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>ID</th><th>SKU</th><th>Descrição</th><th style="text-align:right;">Qtd</th><th>Origem</th><th></th><th>Destino</th><th>Motivo</th><th>Data</th></tr>
                    </thead>
                    <tbody>
                        ${transferencias.slice().reverse().map(t => `<tr>
                            <td style="font-family:monospace; font-weight:600;">${t.id}</td>
                            <td style="font-family:monospace;">${t.sku}</td>
                            <td>${t.desc}</td>
                            <td style="text-align:right; font-weight:600;">${t.qtd}</td>
                            <td style="font-family:monospace;">${t.origem}</td>
                            <td style="color:var(--primary-color);">→</td>
                            <td style="font-family:monospace;">${t.destino}</td>
                            <td style="font-size:0.8rem;">${t.motivo}</td>
                            <td style="font-size:0.8rem;">${new Date(t.data).toLocaleDateString('pt-BR')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:2rem; text-align:center; color:var(--text-secondary);">Nenhuma transferência registrada.</div>`}
        </div>
    `;
}

window.salvarTransferencia = function () {
    const sku = document.getElementById('trf-sku').value || 'SKU-0000';
    const qtd = parseInt(document.getElementById('trf-qtd').value) || 1;
    const origem = document.getElementById('trf-origem').value || '00-00-0000';
    const destino = document.getElementById('trf-destino').value || '00-00-0000';
    const motivo = document.getElementById('trf-motivo').value;

    const transferencias = JSON.parse(localStorage.getItem('wms_transferencias') || '[]');
    transferencias.push({
        id: `TRF-${String(transferencias.length + 1).padStart(3, '0')}`,
        sku, desc: `Produto ${sku}`, qtd, origem, destino, motivo,
        status: 'CONCLUÍDA', data: new Date().toISOString()
    });

    localStorage.setItem('wms_transferencias', JSON.stringify(transferencias));
    renderTransferencia(document.getElementById('view-dynamic'));
};

// ========================
// 3. BLOQUEIO / QUARENTENA
// ========================
function renderBloqueio(container) {
    let bloqueios = JSON.parse(localStorage.getItem('wms_bloqueios') || 'null');
    if (!bloqueios) {
        bloqueios = [
            { id: 'BLQ-001', tipo: 'ENDEREÇO', ref: '02-01-0201', desc: 'Broca HSS 8mm Bosch', motivo: 'Conferência pendente', status: 'BLOQUEADO', data: new Date().toISOString() },
            { id: 'BLQ-002', tipo: 'SKU', ref: 'SKU-0012', desc: 'Massa Corrida PVA 25kg', motivo: 'Produto vencido', status: 'QUARENTENA', data: new Date(Date.now() - 86400000).toISOString() },
        ];
        localStorage.setItem('wms_bloqueios', JSON.stringify(bloqueios));
    }

    const ativos = bloqueios.filter(b => b.status !== 'LIBERADO');
    const liberados = bloqueios.filter(b => b.status === 'LIBERADO');

    container.innerHTML = `
        <!-- New block form -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">block</span>
                    Novo Bloqueio / Quarentena
                </h3>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                    <div class="form-group">
                        <label class="form-label">Tipo</label>
                        <select id="blq-tipo" class="form-input">
                            <option value="ENDEREÇO">Endereço</option>
                            <option value="SKU">SKU / Produto</option>
                            <option value="LOTE">Lote</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Referência</label>
                        <input id="blq-ref" class="form-input" placeholder="Endereço, SKU ou Lote" style="font-family:monospace;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Ação</label>
                        <select id="blq-status" class="form-input">
                            <option value="BLOQUEADO">Bloqueio</option>
                            <option value="QUARENTENA">Quarentena</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:1rem;">
                    <label class="form-label">Motivo</label>
                    <input id="blq-motivo" class="form-input" placeholder="Motivo do bloqueio">
                </div>
                <button onclick="salvarBloqueio()" class="btn btn-primary">
                    <span class="material-icons-round" style="font-size:1rem;">lock</span> Registrar Bloqueio
                </button>
            </div>
        </div>

        <!-- Active blocks -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Bloqueios Ativos</h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${ativos.length} ativos</span>
            </div>
            ${ativos.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr><th>ID</th><th>Tipo</th><th>Referência</th><th>Descrição</th><th>Motivo</th><th>Status</th><th>Data</th><th>Ação</th></tr>
                    </thead>
                    <tbody>
                        ${ativos.map(b => {
        const sc = b.status === 'BLOQUEADO' ? '#ef4444' : '#f59e0b';
        return `<tr>
                                <td style="font-family:monospace; font-weight:600;">${b.id}</td>
                                <td>${b.tipo}</td>
                                <td style="font-family:monospace; font-weight:600;">${b.ref}</td>
                                <td>${b.desc}</td>
                                <td style="font-size:0.8rem;">${b.motivo}</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${b.status}</span></td>
                                <td style="font-size:0.8rem;">${new Date(b.data).toLocaleDateString('pt-BR')}</td>
                                <td>
                                    <button onclick="liberarBloqueio('${b.id}')" class="btn btn-secondary" style="padding:0.3rem 0.8rem; font-size:0.75rem;">
                                        <span class="material-icons-round" style="font-size:0.9rem;">lock_open</span> Liberar
                                    </button>
                                </td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:2rem; text-align:center; color:var(--text-secondary);">Nenhum bloqueio ativo.</div>`}
        </div>

        <!-- Released -->
        ${liberados.length > 0 ? `
        <div class="card">
            <div class="card-header"><h3 style="font-size:0.95rem; font-weight:600;">Histórico de Liberações</h3></div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Tipo</th><th>Referência</th><th>Motivo</th><th>Data</th><th>Status</th></tr></thead>
                    <tbody>
                        ${liberados.map(b => `<tr style="opacity:0.6;">
                            <td style="font-family:monospace;">${b.id}</td>
                            <td>${b.tipo}</td>
                            <td style="font-family:monospace;">${b.ref}</td>
                            <td style="font-size:0.8rem;">${b.motivo}</td>
                            <td style="font-size:0.8rem;">${new Date(b.data).toLocaleDateString('pt-BR')}</td>
                            <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                                background:rgba(16,185,129,0.12); color:#10b981;">LIBERADO</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

window.salvarBloqueio = function () {
    const tipo = document.getElementById('blq-tipo').value;
    const ref = document.getElementById('blq-ref').value || '-';
    const status = document.getElementById('blq-status').value;
    const motivo = document.getElementById('blq-motivo').value || 'Sem motivo informado';

    const bloqueios = JSON.parse(localStorage.getItem('wms_bloqueios') || '[]');
    bloqueios.push({
        id: `BLQ-${String(bloqueios.length + 1).padStart(3, '0')}`,
        tipo, ref, desc: `Ref. ${ref}`, motivo, status,
        data: new Date().toISOString()
    });

    localStorage.setItem('wms_bloqueios', JSON.stringify(bloqueios));
    renderBloqueio(document.getElementById('view-dynamic'));
};

window.liberarBloqueio = function (blqId) {
    const bloqueios = JSON.parse(localStorage.getItem('wms_bloqueios') || '[]');
    const blq = bloqueios.find(b => b.id === blqId);
    if (blq) {
        blq.status = 'LIBERADO';
        localStorage.setItem('wms_bloqueios', JSON.stringify(bloqueios));
        renderBloqueio(document.getElementById('view-dynamic'));
    }
};

// ========================
// 4. AJUSTE DE ESTOQUE
// ========================
function renderAjusteEstoque(container) {
    const ajustes = JSON.parse(localStorage.getItem('wms_ajustes') || '[]');
    const historico = ajustes.length > 0 ? ajustes : [
        { id: 'AJ-001', sku: 'SKU-1001', descricao: 'Parafuso M8x30', endereco: 'A-01-01-01', qtdAnterior: 500, qtdNova: 490, motivo: 'Avaria', usuario: 'supervisor1', data: new Date().toLocaleDateString('pt-BR'), status: 'aprovado' },
        { id: 'AJ-002', sku: 'SKU-2015', descricao: 'Óleo 15W40', endereco: 'B-02-03-02', qtdAnterior: 120, qtdNova: 125, motivo: 'Recontagem', usuario: 'operador3', data: new Date().toLocaleDateString('pt-BR'), status: 'pendente' }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">tune</span> Ajuste de Estoque</h3>
                <button class="btn btn-primary" onclick="novoAjuste()"><span class="material-icons-round" style="font-size:1rem;">add</span> Novo Ajuste</button>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Ajuste</th><th>SKU</th><th>Endereço</th><th>Qtd Ant.</th><th>Qtd Nova</th><th>Diff</th><th>Motivo</th><th>Status</th></tr></thead>
                    <tbody>
                        ${historico.map(a => {
        const diff = a.qtdNova - a.qtdAnterior;
        return `<tr>
                                <td><strong>${a.id}</strong></td>
                                <td>${a.sku}</td>
                                <td>${a.endereco}</td>
                                <td style="text-align:center;">${a.qtdAnterior}</td>
                                <td style="text-align:center;">${a.qtdNova}</td>
                                <td style="text-align:center; color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:bold;">${diff >= 0 ? '+' : ''}${diff}</td>
                                <td>${a.motivo}</td>
                                <td><span class="badge ${a.status === 'aprovado' ? 'badge-success' : 'badge-warning'}">${a.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.novoAjuste = function () {
    const ajustes = JSON.parse(localStorage.getItem('wms_ajustes') || '[]');
    ajustes.push({ id: 'AJ-' + String(ajustes.length + 3).padStart(3, '0'), sku: 'SKU-0000', descricao: '', endereco: '', qtdAnterior: 0, qtdNova: 0, motivo: 'Recontagem', usuario: 'admin', data: new Date().toLocaleDateString('pt-BR'), status: 'pendente' });
    localStorage.setItem('wms_ajustes', JSON.stringify(ajustes));
    alert('✅ Ajuste criado! Edite os detalhes na lista.');
    renderAjusteEstoque(document.getElementById('view-dynamic'));
};

// ========================
// 5. CONTAGEM ROTATIVA
// ========================
function renderContagemRotativa(container) {
    const contagens = [
        { setor: 'Rua A', enderecos: 45, contados: 38, divergencias: 2, proxima: 'Seg 17/02', status: 'andamento' },
        { setor: 'Rua B', enderecos: 62, contados: 62, divergencias: 0, proxima: 'Qua 19/02', status: 'concluido' },
        { setor: 'Rua C', enderecos: 30, contados: 0, divergencias: 0, proxima: 'Sex 21/02', status: 'agendado' },
        { setor: 'Blocado', enderecos: 18, contados: 12, divergencias: 1, proxima: 'Seg 17/02', status: 'andamento' }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">pin</span> Contagem Rotativa</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Setor</th><th>Endereços</th><th>Contados</th><th>%</th><th>Diverg.</th><th>Próxima</th><th>Status</th></tr></thead>
                    <tbody>
                        ${contagens.map(c => {
        const pct = c.enderecos > 0 ? Math.round(c.contados / c.enderecos * 100) : 0;
        return `<tr>
                                <td><strong>${c.setor}</strong></td>
                                <td style="text-align:center;">${c.enderecos}</td>
                                <td style="text-align:center;">${c.contados}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:0.5rem;">
                                        <div style="flex:1; height:6px; background:var(--bg-hover); border-radius:3px;"><div style="width:${pct}%; height:100%; background:var(--wms-primary); border-radius:3px;"></div></div>
                                        <span style="font-size:0.75rem;">${pct}%</span>
                                    </div>
                                </td>
                                <td style="text-align:center; ${c.divergencias > 0 ? 'color:var(--danger); font-weight:bold;' : ''}">${c.divergencias}</td>
                                <td>${c.proxima}</td>
                                <td><span class="badge ${c.status === 'concluido' ? 'badge-success' : c.status === 'andamento' ? 'badge-info' : 'badge-secondary'}">${c.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ========================
// 6. DIVERGÊNCIAS
// ========================
function renderDivergencias(container) {
    const divs = [
        { id: 'DIV-001', data: '12/02', origem: 'Conferência NF', sku: 'SKU-1001', esperado: 100, encontrado: 98, severity: 'baixa', status: 'resolvido' },
        { id: 'DIV-002', data: '12/02', origem: 'Inventário Cíclico', sku: 'SKU-2015', esperado: 120, encontrado: 125, severity: 'media', status: 'pendente' },
        { id: 'DIV-003', data: '11/02', origem: 'Separação', sku: 'SKU-3042', esperado: 50, encontrado: 48, severity: 'baixa', status: 'ajustado' },
        { id: 'DIV-004', data: '11/02', origem: 'Conferência NF', sku: 'SKU-4088', esperado: 200, encontrado: 180, severity: 'alta', status: 'pendente' }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">difference</span> Divergências</h3>
                <span class="badge badge-warning">${divs.filter(d => d.status === 'pendente').length} pendentes</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Data</th><th>Origem</th><th>SKU</th><th>Esperado</th><th>Encontrado</th><th>Diff</th><th>Severidade</th><th>Status</th></tr></thead>
                    <tbody>
                        ${divs.map(d => {
        const diff = d.encontrado - d.esperado;
        const sevColor = d.severity === 'alta' ? 'var(--danger)' : d.severity === 'media' ? 'var(--warning)' : 'var(--success)';
        return `<tr>
                                <td><strong>${d.id}</strong></td>
                                <td>${d.data}</td>
                                <td>${d.origem}</td>
                                <td>${d.sku}</td>
                                <td style="text-align:center;">${d.esperado}</td>
                                <td style="text-align:center;">${d.encontrado}</td>
                                <td style="text-align:center; color:${diff >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:bold;">${diff >= 0 ? '+' : ''}${diff}</td>
                                <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevColor};margin-right:4px;"></span>${d.severity}</td>
                                <td><span class="badge ${d.status === 'resolvido' || d.status === 'ajustado' ? 'badge-success' : 'badge-warning'}">${d.status}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ========================
// 7. RASTREABILIDADE (KARDEX)
// ========================
function renderRastreabilidade(container) {
    const movs = [
        { data: '12/02 10:15', tipo: 'Entrada', sku: 'SKU-1001', descricao: 'Parafuso M8x30', de: 'NF 12345', para: 'A-01-01-01', qtd: 500, usuario: 'operador1' },
        { data: '12/02 11:30', tipo: 'Transferência', sku: 'SKU-1001', descricao: 'Parafuso M8x30', de: 'A-01-01-01', para: 'A-01-02-03', qtd: 100, usuario: 'operador2' },
        { data: '12/02 14:00', tipo: 'Separação', sku: 'SKU-1001', descricao: 'Parafuso M8x30', de: 'A-01-02-03', para: 'Onda OND-001', qtd: 50, usuario: 'separador1' },
        { data: '12/02 15:20', tipo: 'Ajuste', sku: 'SKU-2015', descricao: 'Óleo 15W40', de: 'B-02-03-02', para: '-', qtd: -5, usuario: 'supervisor1' },
        { data: '11/02 16:45', tipo: 'Devolução', sku: 'SKU-3042', descricao: 'Filtro AP-200', de: 'Cliente 1234', para: 'C-03-01-01', qtd: 10, usuario: 'operador3' },
        { data: '11/02 09:00', tipo: 'Entrada', sku: 'SKU-4088', descricao: 'Correia Dentada', de: 'NF 12340', para: 'D-01-05-01', qtd: 200, usuario: 'operador1' }
    ];

    const tipoColor = { 'Entrada': 'var(--success)', 'Separação': 'var(--wms-primary)', 'Transferência': '#6366f1', 'Ajuste': 'var(--warning)', 'Devolução': 'var(--danger)' };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">history</span> Rastreabilidade (Kardex)</h3>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="text" placeholder="Buscar SKU..." class="form-input" style="width:160px; font-size:0.85rem;">
                    <button class="btn btn-secondary"><span class="material-icons-round" style="font-size:1rem;">search</span></button>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Data/Hora</th><th>Tipo</th><th>SKU</th><th>Descrição</th><th>Origem</th><th>Destino</th><th>Qtd</th><th>Usuário</th></tr></thead>
                    <tbody>
                        ${movs.map(m => `<tr>
                            <td>${m.data}</td>
                            <td><span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${tipoColor[m.tipo] || 'gray'};"></span>${m.tipo}</span></td>
                            <td><strong>${m.sku}</strong></td>
                            <td>${m.descricao}</td>
                            <td>${m.de}</td>
                            <td>${m.para}</td>
                            <td style="text-align:center; font-weight:bold; color:${m.qtd >= 0 ? 'var(--success)' : 'var(--danger)'}">${m.qtd >= 0 ? '+' : ''}${m.qtd}</td>
                            <td>${m.usuario}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ========================
// 8. LOG DE OPERAÇÕES
// ========================
function renderLogOperacoes(container) {
    const logs = [
        { hora: '10:15:23', modulo: 'Recebimento', acao: 'NF 12345 conferida', usuario: 'operador1', ip: '192.168.1.10' },
        { hora: '10:32:05', modulo: 'Armazenagem', acao: 'Putaway SKU-1001 → A-01-01-01', usuario: 'operador1', ip: '192.168.1.10' },
        { hora: '11:00:12', modulo: 'Separação', acao: 'Onda OND-003 liberada', usuario: 'supervisor1', ip: '192.168.1.5' },
        { hora: '11:15:40', modulo: 'Inventário', acao: 'Contagem Rua B iniciada', usuario: 'auditor1', ip: '192.168.1.8' },
        { hora: '11:30:55', modulo: 'Transferência', acao: 'SKU-1001 movido A-01-01 → A-01-02', usuario: 'operador2', ip: '192.168.1.11' },
        { hora: '14:00:08', modulo: 'Bloqueio', acao: 'Endereço C-03-01-01 bloqueado', usuario: 'supervisor1', ip: '192.168.1.5' },
        { hora: '14:35:22', modulo: 'Expedição', acao: 'Carga CRG-002 liberada', usuario: 'supervisor1', ip: '192.168.1.5' },
        { hora: '15:20:11', modulo: 'Ajuste', acao: 'SKU-2015 ajustado -5un', usuario: 'supervisor1', ip: '192.168.1.5' }
    ];

    const modColor = { 'Recebimento': '#22c55e', 'Armazenagem': '#3b82f6', 'Separação': '#f59e0b', 'Inventário': '#8b5cf6', 'Transferência': '#6366f1', 'Bloqueio': '#ef4444', 'Expedição': '#06b6d4', 'Ajuste': '#f97316' };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;"><span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">list_alt</span> Log de Operações</h3>
                <span class="badge badge-info">${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Hora</th><th>Módulo</th><th>Ação</th><th>Usuário</th><th>IP</th></tr></thead>
                    <tbody>
                        ${logs.map(l => `<tr>
                            <td style="font-family:monospace; font-size:0.85rem;">${l.hora}</td>
                            <td><span style="display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${modColor[l.modulo] || 'gray'};"></span>${l.modulo}</span></td>
                            <td>${l.acao}</td>
                            <td>${l.usuario}</td>
                            <td style="font-family:monospace; font-size:0.8rem; color:var(--text-secondary);">${l.ip}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

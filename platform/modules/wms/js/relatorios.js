// WMS Relatórios - Management Reports
// rel-recebimento: Receiving KPIs
// rel-produtividade: Productivity metrics
// rel-estoque: Stock position summary
// rel-movimentacao, rel-enderecamento, rel-indicadores: enriched placeholders

window.loadRelatoriosView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        case 'rel-recebimento': renderRelRecebimento(container); break;
        case 'rel-produtividade': renderRelProdutividade(container); break;
        case 'rel-estoque': renderRelEstoque(container); break;
        case 'rel-movimentacao': renderPlaceholderRel(container, 'Relatório de Movimentação', 'swap_vert', 'Histórico de entradas, saídas e transferências por período.'); break;
        case 'rel-enderecamento': renderPlaceholderRel(container, 'Relatório de Endereçamento', 'grid_view', 'Ocupação por rua, prédio e andar com mapa de calor.'); break;
        case 'rel-indicadores': renderPlaceholderRel(container, 'Indicadores Operacionais', 'insights', 'KPIs de lead time, acuracidade e throughput.'); break;
    }
};

// ========================
// 1. RELATÓRIO DE RECEBIMENTO
// ========================
function renderRelRecebimento(container) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const today = new Date().toISOString().split('T')[0];
    const todayReceipts = receipts.filter(r => r.createdAt?.startsWith(today));
    const conferidos = receipts.filter(r => r.status === 'FINALIZADO');
    const pendentes = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA');
    const totalItens = receipts.reduce((s, r) => s + (r.totalQty || r.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0), 0);

    // Divergence stats
    let totalDivergences = 0;
    conferidos.forEach(r => {
        (r.items || []).forEach(i => {
            if (i.checked && i.qtyChecked !== i.qty) totalDivergences++;
        });
    });

    container.innerHTML = `
        <!-- KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Total de NFs</div>
                <div style="font-size:1.8rem; font-weight:700;">${receipts.length}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${todayReceipts.length} hoje</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Itens Recebidos</div>
                <div style="font-size:1.8rem; font-weight:700;">${totalItens.toLocaleString('pt-BR')}</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Conferidos</div>
                <div style="font-size:1.8rem; font-weight:700; color:#10b981;">${conferidos.length}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${pendentes.length} pendentes</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Divergências</div>
                <div style="font-size:1.8rem; font-weight:700; color:${totalDivergences > 0 ? '#ef4444' : '#10b981'};">${totalDivergences}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${conferidos.length > 0 ? Math.round((1 - totalDivergences / Math.max(1, conferidos.reduce((s, r) => s + (r.items || []).length, 0))) * 100) : 100}% acuracidade</div>
            </div>
        </div>

        <!-- Receiving table -->
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Histórico de Recebimentos</h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${receipts.length} registros</span>
            </div>
            ${receipts.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>NF</th><th>Fornecedor</th><th>Doca</th><th>Itens</th><th style="text-align:right;">Qtd Total</th><th>Status</th><th>Data</th></tr></thead>
                    <tbody>
                        ${receipts.slice(0, 20).map(r => {
        const sc = r.status === 'FINALIZADO' ? '#10b981' : r.status === 'CONFERENCIA' ? '#f59e0b' : '#3b82f6';
        return `<tr>
                                <td style="font-weight:600;">${r.nf || r.id}</td>
                                <td>${r.supplier || r.fornecedor || '-'}</td>
                                <td>${r.dock || '-'}</td>
                                <td style="text-align:center;">${r.totalItems || (r.items || []).length}</td>
                                <td style="text-align:right; font-weight:600;">${(r.totalQty || r.items?.reduce((a, i) => a + (i.qty || 0), 0) || 0).toLocaleString('pt-BR')}</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${r.status}</span></td>
                                <td style="font-size:0.8rem;">${r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div style="padding:2rem; text-align:center; color:var(--text-secondary);">Nenhum recebimento registrado.</div>`}
        </div>
    `;
}

// ========================
// 2. RELATÓRIO DE PRODUTIVIDADE
// ========================
function renderRelProdutividade(container) {
    const picking = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const transferencias = JSON.parse(localStorage.getItem('wms_transferencias') || '[]');
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');

    const pickDone = picking.filter(t => t.status === 'COLETADO').length;
    const pickPend = picking.filter(t => t.status === 'PENDENTE').length;
    const putDone = putaway.filter(t => t.status === 'ARMAZENADO').length;
    const putPend = putaway.filter(t => t.status === 'PENDENTE').length;
    const invDone = inventarios.filter(i => i.status === 'FINALIZADO').reduce((s, i) => s + i.enderecos.length, 0);

    const totalOps = pickDone + putDone + transferencias.length + invDone;

    container.innerHTML = `
        <!-- Overall -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Total Operações</div>
                <div style="font-size:1.8rem; font-weight:700;">${totalOps}</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Picking</div>
                <div style="font-size:1.8rem; font-weight:700; color:#f59e0b;">${pickDone}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${pickPend} pendentes</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Putaway</div>
                <div style="font-size:1.8rem; font-weight:700; color:#8b5cf6;">${putDone}</div>
                <div style="font-size:0.7rem; color:var(--text-secondary);">${putPend} pendentes</div>
            </div>
            <div class="card" style="padding:1.25rem;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Transferências</div>
                <div style="font-size:1.8rem; font-weight:700; color:#3b82f6;">${transferencias.length}</div>
            </div>
        </div>

        <!-- Productivity breakdown -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Breakdown por Atividade</h3>
            </div>
            <div style="padding:1rem;">
                ${[
            { label: 'Separação (Picking)', done: pickDone, pend: pickPend, color: '#f59e0b' },
            { label: 'Armazenagem (Putaway)', done: putDone, pend: putPend, color: '#8b5cf6' },
            { label: 'Transferências', done: transferencias.length, pend: 0, color: '#3b82f6' },
            { label: 'Inventário (Endereços)', done: invDone, pend: inventarios.filter(i => i.status === 'EM ANDAMENTO').reduce((s, i) => s + i.enderecos.filter(e => e.status === 'PENDENTE').length, 0), color: '#10b981' },
        ].map(a => {
            const total = a.done + a.pend;
            const pct = total > 0 ? Math.round((a.done / total) * 100) : 0;
            return `
                    <div style="margin-bottom:1rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                            <span style="font-size:0.85rem; font-weight:600;">${a.label}</span>
                            <span style="font-size:0.8rem; color:var(--text-secondary);">${a.done}/${total} (${pct}%)</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.05); border-radius:4px; height:8px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:${a.color}; border-radius:4px; transition:width 0.3s;"></div>
                        </div>
                    </div>`;
        }).join('')}
            </div>
        </div>

        <!-- Metrics -->
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Métricas de Inventário</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Inventário</th><th>Tipo</th><th>Endereços</th><th>Contados</th><th>Divergências</th><th>Acuracidade</th><th>Status</th></tr></thead>
                    <tbody>
                        ${inventarios.map(inv => {
            const total = inv.enderecos.length;
            const contados = inv.enderecos.filter(e => e.status !== 'PENDENTE').length;
            const divs = inv.enderecos.filter(e => e.status === 'DIVERGENTE').length;
            const acc = contados > 0 ? Math.round(((contados - divs) / contados) * 100) : 100;
            const sc = inv.status === 'FINALIZADO' ? '#10b981' : '#f59e0b';
            return `<tr>
                                <td style="font-family:monospace; font-weight:600;">${inv.id}</td>
                                <td>${inv.tipo}</td>
                                <td style="text-align:center;">${total}</td>
                                <td style="text-align:center;">${contados}</td>
                                <td style="text-align:center; color:${divs > 0 ? '#ef4444' : '#10b981'};">${divs}</td>
                                <td style="text-align:center; font-weight:600;">${acc}%</td>
                                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.65rem; font-weight:600;
                                    background:${sc}18; color:${sc};">${inv.status}</span></td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ========================
// 3. POSIÇÃO DE ESTOQUE
// ========================
function renderRelEstoque(container) {
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const addresses = mockData.addresses || [];
    const streets = mockData.streets || [];

    const occupied = addresses.filter(a => a.status === 'OCUPADO').length;
    const empty = addresses.filter(a => a.status === 'LIVRE').length;
    const blocked = addresses.filter(a => a.status === 'BLOQUEADO').length;
    const total = addresses.length;
    const occPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

    // Street breakdown
    const streetData = streets.map(s => {
        const addrs = addresses.filter(a => a.rua === s.id || a.street === s.number);
        const occ = addrs.filter(a => a.status === 'OCUPADO').length;
        return { name: s.name || `Rua ${s.number || s.id}`, total: addrs.length, occupied: occ, pct: addrs.length > 0 ? Math.round((occ / addrs.length) * 100) : 0 };
    });

    container.innerHTML = `
        <!-- Stock position summary -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Total Endereços</div>
                <div style="font-size:2rem; font-weight:700;">${total}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Ocupação</div>
                <div style="font-size:2rem; font-weight:700; color:${occPct > 85 ? '#ef4444' : occPct > 60 ? '#f59e0b' : '#10b981'};">${occPct}%</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Ocupados</div>
                <div style="font-size:2rem; font-weight:700; color:#f59e0b;">${occupied}</div>
            </div>
            <div class="card" style="padding:1.25rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Livres</div>
                <div style="font-size:2rem; font-weight:700; color:#10b981;">${empty}</div>
            </div>
        </div>

        <!-- Occupation gauge -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Ocupação Geral</h3>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:flex; height:30px; border-radius:8px; overflow:hidden; margin-bottom:1rem;">
                    ${occupied > 0 ? `<div style="width:${(occupied / Math.max(1, total)) * 100}%; background:#f59e0b;" title="${occupied} Ocupados"></div>` : ''}
                    ${blocked > 0 ? `<div style="width:${(blocked / Math.max(1, total)) * 100}%; background:#ef4444;" title="${blocked} Bloqueados"></div>` : ''}
                    ${empty > 0 ? `<div style="width:${(empty / Math.max(1, total)) * 100}%; background:#10b981;" title="${empty} Livres"></div>` : ''}
                </div>
                <div style="display:flex; justify-content:center; gap:2rem; font-size:0.8rem;">
                    <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#f59e0b; margin-right:4px;"></span>Ocupados (${occupied})</span>
                    <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#ef4444; margin-right:4px;"></span>Bloqueados (${blocked})</span>
                    <span><span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:#10b981; margin-right:4px;"></span>Livres (${empty})</span>
                </div>
            </div>
        </div>

        ${streetData.length > 0 ? `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Ocupação por Rua</h3>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>Rua</th><th>Endereços</th><th>Ocupados</th><th>Ocupação</th><th></th></tr></thead>
                    <tbody>
                        ${streetData.map(s => `<tr>
                            <td style="font-weight:600;">${s.name}</td>
                            <td style="text-align:center;">${s.total}</td>
                            <td style="text-align:center; font-weight:600;">${s.occupied}</td>
                            <td style="text-align:center; font-weight:600; color:${s.pct > 85 ? '#ef4444' : s.pct > 60 ? '#f59e0b' : '#10b981'};">${s.pct}%</td>
                            <td style="width:120px;">
                                <div style="background:rgba(255,255,255,0.05); border-radius:3px; height:6px; overflow:hidden;">
                                    <div style="width:${s.pct}%; height:100%; background:${s.pct > 85 ? '#ef4444' : s.pct > 60 ? '#f59e0b' : '#10b981'}; border-radius:3px;"></div>
                                </div>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : ''}
    `;
}

// ========================
// PLACEHOLDER
// ========================
function renderPlaceholderRel(container, title, icon, desc) {
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

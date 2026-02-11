// WMS Dashboard - KPIs, Occupation Chart, Recent Movements
// Renders into #view-dashboard

window.loadDashboardView = function () {
    const container = document.getElementById('view-dashboard');
    if (!container) return;

    // Get mock data
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const addresses = mockData.addresses || [];

    // Calculate KPIs
    const totalAddresses = addresses.length;
    const occupiedAddresses = addresses.filter(a => a.status === 'OCUPADO').length;
    const blockedAddresses = addresses.filter(a => a.status === 'BLOQUEADO').length;
    const emptyAddresses = totalAddresses - occupiedAddresses - blockedAddresses;
    const occupationPct = totalAddresses > 0 ? Math.round((occupiedAddresses / totalAddresses) * 100) : 0;

    const today = new Date().toLocaleDateString('pt-BR');
    const receiptsToday = receipts.filter(r => {
        const d = new Date(r.date || r.created_at);
        return d.toLocaleDateString('pt-BR') === today;
    }).length;

    // Mock operational data
    const separacoesHoje = Math.floor(Math.random() * 15) + 3;
    const divergenciasPendentes = Math.floor(Math.random() * 5);

    // Calculate occupation by street
    const streetOccupation = {};
    addresses.forEach(a => {
        const street = a.street || a.rua || (a.id ? a.id.split('-')[0] : 'N/A');
        if (!streetOccupation[street]) streetOccupation[street] = { total: 0, occupied: 0 };
        streetOccupation[street].total++;
        if (a.status === 'OCUPADO') streetOccupation[street].occupied++;
    });

    // Generate street bars
    const streetBarsHtml = Object.entries(streetOccupation)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 10)
        .map(([street, data]) => {
            const pct = data.total > 0 ? Math.round((data.occupied / data.total) * 100) : 0;
            const barColor = pct > 85 ? 'var(--accent-danger)' : pct > 60 ? 'var(--accent-warning)' : 'var(--accent-success)';
            return `
                <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem;">
                    <span style="width:60px; font-size:0.8rem; color:var(--text-secondary); text-align:right;">Rua ${street}</span>
                    <div style="flex:1; background:rgba(255,255,255,0.05); border-radius:4px; height:20px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:4px; transition:width 0.5s;"></div>
                    </div>
                    <span style="width:40px; font-size:0.8rem; font-weight:600;">${pct}%</span>
                </div>`;
        }).join('');

    // Recent movements (last 10 receipts)
    const recentMovements = receipts.slice(-10).reverse().map(r => {
        const date = new Date(r.date || r.created_at).toLocaleDateString('pt-BR');
        return `
            <tr>
                <td>${r.nfNumber || r.nf || '-'}</td>
                <td>${r.supplier || r.fornecedor || '-'}</td>
                <td>${(r.items || []).length} itens</td>
                <td>${date}</td>
                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                    background:${r.status === 'CONFERIDO' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'};
                    color:${r.status === 'CONFERIDO' ? '#10b981' : '#f59e0b'};">${r.status || 'PENDENTE'}</span></td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <!-- KPI Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
            <div class="card" style="padding:1.5rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg,#3b82f6,#2563eb); display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white;">warehouse</span>
                </div>
                <div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Ocupação Geral</div>
                    <div style="font-size:1.5rem; font-weight:700;">${occupationPct}%</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${occupiedAddresses} / ${totalAddresses} endereços</div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg,#10b981,#059669); display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white;">move_to_inbox</span>
                </div>
                <div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Recebimentos Hoje</div>
                    <div style="font-size:1.5rem; font-weight:700;">${receiptsToday}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${receipts.length} total</div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg,#f59e0b,#d97706); display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white;">shopping_basket</span>
                </div>
                <div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Separações Hoje</div>
                    <div style="font-size:1.5rem; font-weight:700;">${separacoesHoje}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">em andamento</div>
                </div>
            </div>
            <div class="card" style="padding:1.5rem; display:flex; align-items:center; gap:1rem;">
                <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg,#ef4444,#dc2626); display:flex; align-items:center; justify-content:center;">
                    <span class="material-icons-round" style="color:white;">warning</span>
                </div>
                <div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">Divergências</div>
                    <div style="font-size:1.5rem; font-weight:700;">${divergenciasPendentes}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">pendentes</div>
                </div>
            </div>
        </div>

        <!-- Row: Occupation Chart + Summary -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem;">
            <!-- Occupation by Street -->
            <div class="card">
                <div class="card-header">
                    <h3 style="font-size:0.95rem; font-weight:600;">Ocupação por Rua</h3>
                </div>
                <div style="padding:1.5rem;">
                    ${streetBarsHtml || '<p style="color:var(--text-secondary); text-align:center; padding:2rem 0;">Nenhum endereço cadastrado. Crie endereços em Cadastros → Endereçamento.</p>'}
                </div>
            </div>
            <!-- Address Summary -->
            <div class="card">
                <div class="card-header">
                    <h3 style="font-size:0.95rem; font-weight:600;">Resumo de Endereços</h3>
                </div>
                <div style="padding:1.5rem;">
                    <div style="display:flex; gap:1rem; margin-bottom:1.5rem;">
                        <div style="flex:1; text-align:center; padding:1rem; background:rgba(16,185,129,0.08); border-radius:8px;">
                            <div style="font-size:1.5rem; font-weight:700; color:#10b981;">${emptyAddresses}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">Vazios</div>
                        </div>
                        <div style="flex:1; text-align:center; padding:1rem; background:rgba(59,130,246,0.08); border-radius:8px;">
                            <div style="font-size:1.5rem; font-weight:700; color:#3b82f6;">${occupiedAddresses}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">Ocupados</div>
                        </div>
                        <div style="flex:1; text-align:center; padding:1rem; background:rgba(239,68,68,0.08); border-radius:8px;">
                            <div style="font-size:1.5rem; font-weight:700; color:#ef4444;">${blockedAddresses}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">Bloqueados</div>
                        </div>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">
                        Total: <strong style="color:var(--text-primary);">${totalAddresses}</strong> endereços cadastrados
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Movements -->
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">Últimos Recebimentos</h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">Últimos 10</span>
            </div>
            ${receipts.length > 0 ? `
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nota Fiscal</th>
                            <th>Fornecedor</th>
                            <th>Itens</th>
                            <th>Data</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${recentMovements}</tbody>
                </table>
            </div>` : `
            <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; margin-bottom:0.5rem; display:block;">inbox</span>
                Nenhum recebimento registrado.<br>
                <span style="font-size:0.8rem;">Acesse Entrada de Produtos → Recebimento de NF para começar.</span>
            </div>`}
        </div>
    `;
};

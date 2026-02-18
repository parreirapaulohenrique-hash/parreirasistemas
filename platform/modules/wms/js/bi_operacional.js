// ===========================================
// WMS - BI OPERACIONAL (Dashboard Gerencial)
// ===========================================
// KPIs: Ocupação, Recebimentos, Separações, Divergências
// Gráficos: Ocupação por Rua (Bar), Movimentação Semanal (Line), Produtividade (Doughnut)

let chartOcupacaoRuaBI = null;
let chartMovimentacaoBI = null;
let chartProdutividadeBI = null;

window.renderBiOperacional = function () {
    console.log("Renderizando BI Operacional WMS...");

    // ============================
    // 1. CARREGAR DADOS
    // ============================
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const ondas = JSON.parse(localStorage.getItem('wms_ondas') || '[]');
    const waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
    const ajustes = JSON.parse(localStorage.getItem('wms_ajustes') || '[]');
    const addresses = mockData.addresses || [];
    const stock = JSON.parse(localStorage.getItem('wms_stock') || '[]');

    const hoje = new Date();
    const todayStr = hoje.toLocaleDateString('pt-BR');

    // ============================
    // 2. CALCULAR KPIs
    // ============================

    // Ocupação Geral
    const totalAddresses = addresses.length;
    const occupiedAddresses = addresses.filter(a => a.status === 'OCUPADO').length;
    const blockedAddresses = addresses.filter(a => a.status === 'BLOQUEADO').length;
    const occupationPct = totalAddresses > 0 ? Math.round((occupiedAddresses / totalAddresses) * 100) : 0;

    // Recebimentos hoje
    const receiptsToday = receipts.filter(r => {
        const d = new Date(r.date || r.created_at);
        return d.toLocaleDateString('pt-BR') === todayStr;
    }).length;

    // Separações hoje (ondas + waves)
    const allWaves = [...ondas, ...waves];
    const separacoesHoje = allWaves.filter(o => {
        const d = new Date(o.created || o.data || o.createdAt || new Date().toISOString());
        return d.toLocaleDateString('pt-BR') === todayStr;
    }).length;

    // Divergências pendentes
    const divergenciasPendentes = ajustes.filter(a => a.status === 'pendente').length;

    // Total SKUs em estoque
    const totalSKUs = stock.length || addresses.filter(a => a.sku).length;

    // ============================
    // 3. ATUALIZAR DOM - KPIs
    // ============================
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setEl('biWmsOcupacao', occupationPct + '%');
    setEl('biWmsOcupacaoDetalhe', `${occupiedAddresses} / ${totalAddresses} endereços`);
    setEl('biWmsRecebimentos', receiptsToday.toString());
    setEl('biWmsRecebimentosDetalhe', `${receipts.length} total`);
    setEl('biWmsSeparacoes', separacoesHoje.toString());
    setEl('biWmsSeparacoesDetalhe', `${allWaves.length} total`);
    setEl('biWmsDivergencias', divergenciasPendentes.toString());
    setEl('biWmsDivergenciasDetalhe', `${ajustes.length} registros`);

    // Colorir ocupação
    const elOcup = document.getElementById('biWmsOcupacao');
    if (elOcup) {
        elOcup.style.color = occupationPct > 85 ? '#ef4444' : occupationPct > 60 ? '#f59e0b' : '#10b981';
    }

    // ============================
    // 4. GRÁFICOS
    // ============================
    renderChartOcupacaoRua(addresses);
    renderChartMovimentacao(receipts, allWaves);
    renderChartProdutividade(allWaves);
};

// ============================
// CHART 1: Ocupação por Rua (Horizontal Bar)
// ============================
function renderChartOcupacaoRua(addresses) {
    const ctx = document.getElementById('chartBiOcupacaoRua');
    if (!ctx) return;

    const streetOccupation = {};
    addresses.forEach(a => {
        const street = a.street || a.rua || (a.id ? a.id.split('-')[0] : 'N/A');
        if (!streetOccupation[street]) streetOccupation[street] = { total: 0, occupied: 0 };
        streetOccupation[street].total++;
        if (a.status === 'OCUPADO') streetOccupation[street].occupied++;
    });

    const sorted = Object.entries(streetOccupation).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12);
    const labels = sorted.map(([s]) => `Rua ${s}`);
    const data = sorted.map(([, d]) => d.total > 0 ? Math.round((d.occupied / d.total) * 100) : 0);
    const colors = data.map(v => v > 85 ? '#ef4444' : v > 60 ? '#f59e0b' : '#10b981');

    if (chartOcupacaoRuaBI) chartOcupacaoRuaBI.destroy();
    chartOcupacaoRuaBI = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '% Ocupação',
                data,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.raw + '% ocupado' } }
            }
        }
    });
}

// ============================
// CHART 2: Movimentação Semanal (Entradas vs Saídas)
// ============================
function renderChartMovimentacao(receipts, waves) {
    const ctx = document.getElementById('chartBiMovimentacao');
    if (!ctx) return;

    const labels = [];
    const entradas = [];
    const saidas = [];

    // Últimos 7 dias
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
        const isoDate = d.toLocaleDateString('pt-BR');
        labels.push(dayStr);

        const entDia = receipts.filter(r => {
            const rd = new Date(r.date || r.created_at);
            return rd.toLocaleDateString('pt-BR') === isoDate;
        }).length;

        const saiDia = waves.filter(w => {
            const wd = new Date(w.created || w.data || w.createdAt || '');
            return wd.toLocaleDateString('pt-BR') === isoDate;
        }).length;

        entradas.push(entDia);
        saidas.push(saiDia);
    }

    if (chartMovimentacaoBI) chartMovimentacaoBI.destroy();
    chartMovimentacaoBI = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Entradas (NFs)',
                    data: entradas,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                },
                {
                    label: 'Saídas (Ondas)',
                    data: saidas,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ============================
// CHART 3: Status das Ondas de Separação (Doughnut)
// ============================
function renderChartProdutividade(waves) {
    const ctx = document.getElementById('chartBiProdutividade');
    if (!ctx) return;

    const statusCount = {};
    waves.forEach(w => {
        const s = w.status || 'Pendente';
        statusCount[s] = (statusCount[s] || 0) + 1;
    });

    const labels = Object.keys(statusCount).length > 0 ? Object.keys(statusCount) : ['Sem dados'];
    const data = Object.values(statusCount).length > 0 ? Object.values(statusCount) : [1];
    const bgColors = labels.map(l => {
        const lower = l.toLowerCase();
        if (lower.includes('conclu') || lower.includes('finaliz') || lower === 'completed') return '#10b981';
        if (lower.includes('andamento') || lower.includes('separa') || lower === 'in_progress') return '#3b82f6';
        if (lower.includes('pend') || lower === 'pending') return '#f59e0b';
        if (lower.includes('cancel')) return '#ef4444';
        return '#64748b';
    });

    if (chartProdutividadeBI) chartProdutividadeBI.destroy();
    chartProdutividadeBI = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

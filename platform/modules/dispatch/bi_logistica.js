// ===========================================
// DISPATCH - BI LOGÍSTICO (Indicadores de Frete e SLA)
// ===========================================
// KPIs: Total Despachos, Custo Médio de Frete, SLA Entregas, Ocorrências
// Gráficos: Frete por Transportadora (Bar), Evolução de Volumes (Line), Status Entregas (Doughnut)

let chartFreteBILog = null;
let chartVolumesBILog = null;
let chartEntregasBILog = null;

// Helpers para resiliência na leitura de despachos (v3.20.0)
function _getFreightValue(d) {
    if (!d) return 0;
    const val = d.total != null ? d.total : (d.mainTotal != null ? d.mainTotal : (d.originalTotal != null ? d.originalTotal : (d.freightValue || d.valor_frete || d.valorFrete)));
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function _getDispatchDate(d) {
    if (!d) return null;
    const raw = d.date || d.dispatchedAt || d.registradoEm || d.data || d.created_at;
    if (!raw) return null;
    const dt = new Date(raw);
    return isNaN(dt.getTime()) ? null : dt;
}

window.openBiLogisticaModal = function () {
    const modal = document.getElementById('modalBiLogistica');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            if (typeof window.renderBiLogistica === 'function') {
                window.renderBiLogistica();
            }
        }, 60);
    }
};

window.closeBiLogisticaModal = function () {
    const modal = document.getElementById('modalBiLogistica');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.renderBiLogistica = function () {
    console.log("📊 Renderizando BI Logístico Dispatch...");

    // ============================
    // 1. CARREGAR DADOS
    // ============================
    let dispatches = (window.Utils && typeof Utils.getStorage === 'function') ? (Utils.getStorage('dispatches') || []) : [];
    if ((!dispatches || dispatches.length === 0) && window.dispatchState && Array.isArray(window.dispatchState.dispatches)) {
        dispatches = window.dispatchState.dispatches;
    }
    if ((!dispatches || dispatches.length === 0) && window.CarrierSwitchModule && typeof window.CarrierSwitchModule.getState === 'function') {
        const cs = window.CarrierSwitchModule.getState();
        if (cs && Array.isArray(cs.dispatches)) dispatches = cs.dispatches;
    }

    const deliveryHistory = (window.Utils && typeof Utils.getStorage === 'function') ? (Utils.getStorage('delivery_history') || []) : [];
    const carrierList = (window.Utils && typeof Utils.getStorage === 'function') ? (Utils.getStorage('carrier_list') || []) : [];

    const hoje = new Date();
    const todayStr = hoje.toLocaleDateString('pt-BR');
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    // ============================
    // 2. CALCULAR KPIs
    // ============================

    // Total de Despachos (mês atual)
    const despachosMes = dispatches.filter(d => {
        const dt = _getDispatchDate(d);
        return dt && dt.getMonth() === mesAtual && dt.getFullYear() === anoAtual;
    });
    const totalDespachosMes = despachosMes.length;

    // Custo Médio de Frete
    const valoresDispatch = dispatches.filter(d => _getFreightValue(d) > 0);
    const totalFrete = valoresDispatch.reduce((s, d) => s + _getFreightValue(d), 0);
    const custoMedioFrete = valoresDispatch.length > 0 ? (totalFrete / valoresDispatch.length) : 0;

    // SLA Entregas (% entregues com sucesso)
    const totalHistorico = deliveryHistory.length;
    const entregues = deliveryHistory.filter(d => d.result === 'entregue').length;
    const sla = totalHistorico > 0 ? ((entregues / totalHistorico) * 100).toFixed(1) : 0;

    // Ocorrências (devoluções)
    const devolvidos = deliveryHistory.filter(d => d.result === 'devolvido').length;

    // ============================
    // 3. ATUALIZAR DOM - KPIs
    // ============================
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setEl('biDispDespachos', totalDespachosMes.toString());
    setEl('biDispDespachosDetalhe', `${dispatches.length} total`);
    setEl('biDispCustoMedio', Utils.formatCurrency ? Utils.formatCurrency(custoMedioFrete) : `R$ ${custoMedioFrete.toFixed(2)}`);
    setEl('biDispCustoMedioDetalhe', `${valoresDispatch.length} cotações`);
    setEl('biDispSLA', sla + '%');
    setEl('biDispSLADetalhe', `${entregues} / ${totalHistorico} entregas`);
    setEl('biDispOcorrencias', devolvidos.toString());
    setEl('biDispOcorrenciasDetalhe', `de ${totalHistorico} total`);

    // Colorir SLA
    const elSLA = document.getElementById('biDispSLA');
    if (elSLA) {
        const slaNum = parseFloat(sla);
        elSLA.style.color = slaNum >= 90 ? '#10b981' : slaNum >= 70 ? '#f59e0b' : '#ef4444';
    }

    // ============================
    // 4. GRÁFICOS
    // ============================
    renderChartFreteTransportadora(dispatches, carrierList);
    renderChartVolumes(dispatches);
    renderChartEntregas(deliveryHistory);
};

// ============================
// CHART 1: Custo de Frete por Transportadora (Bar)
// ============================
function renderChartFreteTransportadora(dispatches, carrierList) {
    const ctx = document.getElementById('chartBiFreteTransp');
    if (!ctx) return;

    const carrierCosts = {};
    dispatches.forEach(d => {
        const carrier = d.carrierName || d.transportadora || d.carrier || 'N/I';
        const value = _getFreightValue(d);
        if (value > 0) {
            if (!carrierCosts[carrier]) carrierCosts[carrier] = { total: 0, count: 0 };
            carrierCosts[carrier].total += value;
            carrierCosts[carrier].count++;
        }
    });

    const sorted = Object.entries(carrierCosts)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 8);

    const labels = sorted.map(([name]) => name.substring(0, 20));
    const data = sorted.map(([, d]) => d.count > 0 ? Math.round(d.total / d.count) : 0);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

    if (chartFreteBILog) chartFreteBILog.destroy();
    chartFreteBILog = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Custo Médio (R$)',
                data,
                backgroundColor: colors.slice(0, data.length),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `R$ ${c.raw.toFixed(2)}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v } }
            }
        }
    });
}

// ============================
// CHART 2: Evolução de Volumes Transportados (Últimos 6 meses - Line)
// ============================
function renderChartVolumes(dispatches) {
    const ctx = document.getElementById('chartBiVolumes');
    if (!ctx) return;

    const labels = [];
    const data = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mes = d.getMonth();
        const ano = d.getFullYear();
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));

        const count = dispatches.filter(dp => {
            const dt = _getDispatchDate(dp);
            return dt && dt.getMonth() === mes && dt.getFullYear() === ano;
        }).length;

        data.push(count);
    }

    if (chartVolumesBILog) chartVolumesBILog.destroy();
    chartVolumesBILog = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Despachos',
                data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#3b82f6'
            }]
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
// CHART 3: Status das Entregas (Doughnut)
// ============================
function renderChartEntregas(deliveryHistory) {
    const ctx = document.getElementById('chartBiEntregas');
    if (!ctx) return;

    const statusCount = { 'Entregue': 0, 'Devolvido': 0, 'Pendente': 0 };
    deliveryHistory.forEach(d => {
        if (d.result === 'entregue') statusCount['Entregue']++;
        else if (d.result === 'devolvido') statusCount['Devolvido']++;
        else statusCount['Pendente']++;
    });

    // Remove zero categories
    const nonZero = Object.entries(statusCount).filter(([, v]) => v > 0);
    const labels = nonZero.length > 0 ? nonZero.map(([k]) => k) : ['Sem dados'];
    const data = nonZero.length > 0 ? nonZero.map(([, v]) => v) : [1];
    const colors = labels.map(l => {
        if (l === 'Entregue') return '#10b981';
        if (l === 'Devolvido') return '#ef4444';
        if (l === 'Pendente') return '#f59e0b';
        return '#64748b';
    });

    if (chartEntregasBILog) chartEntregasBILog.destroy();
    chartEntregasBILog = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors
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

// Módulo de Inteligência Financeira (BI)
// Analisa Contas a Receber e a Pagar

async function renderBiFinanceiro() {
    console.log("Renderizando BI Financeiro...");

    // 1. Carregar Dados
    const receber = JSON.parse(localStorage.getItem('erp_receber')) || [];
    const pagar = JSON.parse(localStorage.getItem('erp_pagar')) || [];

    const hoje = new Date();
    const currentMonth = hoje.getMonth();
    const currentYear = hoje.getFullYear();

    // 2. Calcular KPIs Gerais (Mês Atual)

    // Receita Realizada (Pago no mês atual)
    const receitaMes = receber.reduce((acc, r) => {
        if (r.status === 'Pago' && r.dataPagamento) {
            const d = new Date(r.dataPagamento);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                return acc + (parseFloat(r.valor) || 0);
            }
        }
        return acc;
    }, 0);

    // Despesa Realizada (Pago no mês atual)
    const despesaMes = pagar.reduce((acc, p) => {
        if (p.status === 'Pago' && p.dataPagamento) {
            const d = new Date(p.dataPagamento);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                return acc + (parseFloat(p.valor) || 0);
            }
        }
        return acc;
    }, 0);

    // Lucro Líquido
    const lucroLiquido = receitaMes - despesaMes;

    // Inadimplência Geral (Vencidos e não pagos)
    const totalVencido = receber.reduce((acc, r) => {
        const venc = new Date(r.vencimento);
        if (r.status !== 'Pago' && venc < hoje) {
            return acc + (parseFloat(r.valor) || 0);
        }
        return acc;
    }, 0);

    // Total a Receber (Geral) para base de %
    const totalCarteira = receber.reduce((acc, r) => acc + (parseFloat(r.valor) || 0), 0);
    const inadimplenciaPerc = totalCarteira > 0 ? (totalVencido / totalCarteira) * 100 : 0;

    // 3. Atualizar Cards KPI
    document.getElementById('biFinReceita').innerText = formatCurrency(receitaMes);
    document.getElementById('biFinDespesa').innerText = formatCurrency(despesaMes);
    document.getElementById('biFinLucro').innerText = formatCurrency(lucroLiquido);

    const elInad = document.getElementById('biFinInadimplencia');
    elInad.innerText = inadimplenciaPerc.toFixed(1) + '%';
    elInad.style.color = inadimplenciaPerc > 5 ? '#ef4444' : '#10b981'; // Alert if > 5%

    // 4. Preparar Dados para Gráficos
    renderChartFluxoCaixa(receber, pagar);
    renderChartDespesasCategoria(pagar);
}

// Chart 1: Fluxo de Caixa (Previsto vs Realizado - Próximos 7 dias + Passado recente)
let chartFluxoInstance = null;
function renderChartFluxoCaixa(receber, pagar) {
    const ctx = document.getElementById('chartFluxoCaixa').getContext('2d');

    // Vamos pegar o mês atual dia a dia
    const labels = [];
    const dataReceita = [];
    const dataDespesa = [];

    const hoje = new Date();
    // Últimos 15 dias e Próximos 15 dias
    for (let i = -10; i <= 10; i++) {
        const d = new Date();
        d.setDate(hoje.getDate() + i);
        const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const isoDate = d.toISOString().split('T')[0];

        labels.push(dayStr);

        // Sum Receitas para este dia (Vencimento ou Pagamento?)
        // Fluxo de Caixa geralmente olha Data de Pagamento (Realizado) ou Vencimento (Previsto)
        // Vamos fazer um Híbrido: Se pago, usa data pgto. Se aberto, usa vencimento.

        const recDia = receber.reduce((acc, r) => {
            const dataRef = r.status === 'Pago' ? (r.dataPagamento ? r.dataPagamento.split('T')[0] : r.vencimento) : r.vencimento;
            if (dataRef === isoDate) return acc + (parseFloat(r.valor) || 0);
            return acc;
        }, 0);

        const pagDia = pagar.reduce((acc, p) => {
            const dataRef = p.status === 'Pago' ? (p.dataPagamento ? p.dataPagamento.split('T')[0] : p.vencimento) : p.vencimento;
            if (dataRef === isoDate) return acc + (parseFloat(p.valor) || 0);
            return acc;
        }, 0);

        dataReceita.push(recDia);
        dataDespesa.push(pagDia);
    }

    if (chartFluxoInstance) chartFluxoInstance.destroy();

    chartFluxoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Entradas',
                    data: dataReceita,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Saídas',
                    data: dataDespesa,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: false },
                y: { beginAtZero: true }
            }
        }
    });
}

// Chart 2: Despesas por Categoria
let chartDespesasInstance = null;
function renderChartDespesasCategoria(pagar) {
    const ctx = document.getElementById('chartDespesasCategoria').getContext('2d');

    const categorias = {};
    const hoje = new Date();
    const currentMonth = hoje.getMonth();

    pagar.forEach(p => {
        // Filtrar apenas mês atual para ser mais relevante? Ou tudo? Vamos usar mês atual + anterior
        const venc = new Date(p.vencimento);
        // if (venc.getMonth() === currentMonth) {
        const cat = p.categoria || 'Sem Categoria';
        if (!categorias[cat]) categorias[cat] = 0;
        categorias[cat] += parseFloat(p.valor) || 0;
        // }
    });

    const labels = Object.keys(categorias);
    const data = Object.values(categorias);

    if (chartDespesasInstance) chartDespesasInstance.destroy();

    chartDespesasInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}

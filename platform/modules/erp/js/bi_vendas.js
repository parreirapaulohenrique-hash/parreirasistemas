// Módulo de Inteligência de Vendas (BI)
// Focado em analisar dados locais de vendas e metas

async function renderBiVendas() {
    console.log("Renderizando BI de Vendas...");

    // 1. Carregar Dados
    const vendas = JSON.parse(localStorage.getItem('erp_vendas')) || [];
    const produtos = JSON.parse(localStorage.getItem('erp_products')) || [];
    const clientes = JSON.parse(localStorage.getItem('erp_entities')) || [];

    // Filtrar apenas vendas concluídas/faturadas se houver status, por enquanto assumimos todas em 'erp_vendas' como válidas ou filtramos canceladas
    const vendasValidas = vendas.filter(v => v.status !== 'cancelada');

    // 2. Calcular KPIs Gerais
    const totalVendas = vendasValidas.reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);
    const qtdVendas = vendasValidas.length;
    const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;

    // Margem Média (Mockada por enquanto, pois precisaria do Custo no item da venda)
    // Se tivermos custo no cadastro de produto, podemos tentar cruzar.
    let margemTotal = 0;
    let custoTotal = 0;

    // Tentar calcular margem real se possível
    vendasValidas.forEach(v => {
        if (v.itens) {
            v.itens.forEach(item => {
                const prod = produtos.find(p => p.codigo === item.codigo);
                const custo = prod ? (parseFloat(prod.precoCusto) || 0) : 0;
                const totalItem = parseFloat(item.total) || 0;
                const qtd = parseFloat(item.qtd) || 0;

                custoTotal += (custo * qtd);
                margemTotal += (totalItem - (custo * qtd));
            });
        }
    });

    const margemPercent = totalVendas > 0 ? ((totalVendas - custoTotal) / totalVendas) * 100 : 0;

    // 3. Atualizar Cards KPI
    document.getElementById('biVendasTotal').innerText = formatCurrency(totalVendas);
    document.getElementById('biTicketMedio').innerText = formatCurrency(ticketMedio);
    document.getElementById('biPedidosQtd').innerText = qtdVendas;
    document.getElementById('biMargemMedia').innerText = margemPercent.toFixed(1) + '%';

    // 4. Preparar Dados para Gráficos
    renderChartEvolucao(vendasValidas);
    renderChartMix(vendasValidas);
    renderChartTopClientes(vendasValidas, clientes);
    renderChartTopProdutos(vendasValidas, produtos);
}

// Chart 1: Evolução Mensal (Últimos 6 meses)
let chartEvolucaoInstance = null;
function renderChartEvolucao(vendas) {
    const ctx = document.getElementById('chartEvolucaoVendas').getContext('2d');

    // Agrupar por Mês (YYYY-MM)
    const meses = {};
    const hoje = new Date();

    // Inicializar últimos 6 meses com 0
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        meses[key] = { label, valor: 0 };
    }

    vendas.forEach(v => {
        if (!v.data) return;
        const key = v.data.substring(0, 7); // YYYY-MM
        if (meses[key]) {
            meses[key].valor += parseFloat(v.total) || 0;
        }
    });

    const labels = Object.values(meses).map(m => m.label);
    const data = Object.values(meses).map(m => m.valor);

    if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

    chartEvolucaoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento (R$)',
                data: data,
                borderColor: '#10b981', // brand success
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Chart 2: Mix de Produtos (Categorias)
let chartMixInstance = null;
function renderChartMix(vendas) {
    const ctx = document.getElementById('chartMixProdutos').getContext('2d');

    // Agrupar por Grupo/Categoria (Ex: 'grupo' do produto)
    // Precisamos cruzar com cadastro de produtos se a venda não tiver esse dado
    const produtos = JSON.parse(localStorage.getItem('erp_products')) || [];
    const grupos = {};

    vendas.forEach(v => {
        if (v.itens) {
            v.itens.forEach(item => {
                const prod = produtos.find(p => p.codigo === item.codigo);
                const grupo = prod ? (prod.grupo || 'Sem Grupo') : 'Outros';

                if (!grupos[grupo]) grupos[grupo] = 0;
                grupos[grupo] += parseFloat(item.total) || 0;
            });
        }
    });

    // Top 5 Grupos + Outros
    const sortedGrupos = Object.entries(grupos)
        .sort((a, b) => b[1] - a[1]);

    const topGrupos = sortedGrupos.slice(0, 5);
    const outros = sortedGrupos.slice(5).reduce((acc, curr) => acc + curr[1], 0);

    const labels = topGrupos.map(g => g[0]);
    const data = topGrupos.map(g => g[1]);

    if (outros > 0) {
        labels.push('Outros');
        data.push(outros);
    }

    if (chartMixInstance) chartMixInstance.destroy();

    chartMixInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'
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

// Chart 3: Top Clientes
let chartTopClientesInstance = null;
function renderChartTopClientes(vendas, clientesDb) {
    const ctx = document.getElementById('chartTopClientes').getContext('2d');

    const clientes = {};

    vendas.forEach(v => {
        const nome = v.nomeCliente || 'Consumidor Final';
        if (!clientes[nome]) clientes[nome] = 0;
        clientes[nome] += parseFloat(v.total) || 0;
    });

    const top5 = Object.entries(clientes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (chartTopClientesInstance) chartTopClientesInstance.destroy();

    chartTopClientesInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top5.map(c => c[0]),
            datasets: [{
                label: 'Total Comprado (R$)',
                data: top5.map(c => c[1]),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Chart 4: Top Produtos
let chartTopProdutosInstance = null;
function renderChartTopProdutos(vendas, produtosDb) {
    const ctx = document.getElementById('chartTopProdutos').getContext('2d');

    const produtos = {};

    vendas.forEach(v => {
        if (v.itens) {
            v.itens.forEach(item => {
                const nome = item.descricao || item.produto || item.codigo;
                if (!produtos[nome]) produtos[nome] = 0;
                produtos[nome] += parseFloat(item.total) || 0;
            });
        }
    });

    const top5 = Object.entries(produtos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (chartTopProdutosInstance) chartTopProdutosInstance.destroy();

    chartTopProdutosInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top5.map(p => p[0]),
            datasets: [{
                label: 'Total Vendido (R$)',
                data: top5.map(p => p[1]),
                backgroundColor: '#f59e0b',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

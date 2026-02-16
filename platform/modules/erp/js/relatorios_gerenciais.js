// ===========================================
// RELATÓRIOS GERENCIAIS
// Curva ABC e DRE
// ===========================================

// ===========================================
// 1. CURVA ABC (Produtos)
// ===========================================
window.renderCurvaABC = function () {
    const tbody = document.getElementById('abcTableBody');
    if (!tbody) return;

    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    const produtoMap = {};
    let totalGeralVendas = 0;

    // 1. Agrupar vendas por produto
    vendas.forEach(venda => {
        venda.itens.forEach(item => {
            const nome = item.produto; // Vendas salva o nome
            const total = parseFloat(item.total);

            if (!produtoMap[nome]) {
                produtoMap[nome] = { nome: nome, valor: 0, qtd: 0 };
            }
            produtoMap[nome].valor += total;
            produtoMap[nome].qtd += parseFloat(item.quantidade);
            totalGeralVendas += total;
        });
    });

    // 2. Converter para array e ordenar
    let produtos = Object.values(produtoMap).sort((a, b) => b.valor - a.valor);

    // 3. Calcular Acumulado e Classificação
    let acumulado = 0;

    const html = produtos.map(p => {
        const perc = (p.valor / totalGeralVendas) * 100;
        acumulado += perc;

        let classe = 'C';
        if (acumulado <= 80) classe = 'A';
        else if (acumulado <= 95) classe = 'B';

        const valorFmt = p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const percFmt = perc.toFixed(2) + '%';
        const badgeColor = classe === 'A' ? 'var(--accent-success)' : (classe === 'B' ? 'var(--accent-warning)' : 'var(--text-secondary)');

        return `<tr>
            <td style="font-weight:600;">${p.nome}</td>
            <td>${p.qtd}</td>
            <td>${valorFmt}</td>
            <td>${percFmt}</td>
            <td style="text-align:center;">
                <span class="status-badge" style="background:${badgeColor}; color:white;">${classe}</span>
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:2rem;">Nenhuma venda registrada.</td></tr>';
};

// ===========================================
// 2. DRE GERENCIAL (Demonstrativo de Resultado)
// ===========================================
window.renderDRE = function () {
    const dreBody = document.getElementById('dreTableBody');
    if (!dreBody) return;

    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    const produtos = JSON.parse(localStorage.getItem('erp_products') || '[]');
    const despesas = JSON.parse(localStorage.getItem('erp_pagar') || '[]');

    // 1. Receita Bruta (Vendas Totais)
    let receitaBruta = 0;
    let cmvTotal = 0; // Custo da Mercadoria Vendida

    vendas.forEach(venda => {
        receitaBruta += parseFloat(venda.totalGeral || 0);

        // Calcular CMV da venda
        venda.itens.forEach(item => {
            // Tenta achar o produto pelo nome ou SKU (vendas.js as vezes salva cod/nome)
            // A busca aqui é heurística pois o vendas.js anterior não salvava SKU explicitamente no item.
            // Vamos tentar pelo nome que é o que temos garantido.
            const produtoCad = produtos.find(p => p.nome === item.produto || p.sku === item.codigo);
            const custoUnit = produtoCad ? (parseFloat(produtoCad.custo) || 0) : 0;
            cmvTotal += (parseFloat(item.quantidade) * custoUnit);
        });
    });

    // 2. Deduções (Impostos Simples - Mock 6%)
    const deducoes = receitaBruta * 0.06;
    const receitaLiquida = receitaBruta - deducoes;

    // 3. Lucro Bruto
    const lucroBruto = receitaLiquida - cmvTotal;

    // 4. Despesas Operacionais (Contas a Pagar - Pagas e Abertas? DRE é competência, então TUDO)
    let totalDespesas = 0;
    const despesasDetalhadas = {};

    despesas.forEach(d => {
        totalDespesas += parseFloat(d.valor || 0);
        if (!despesasDetalhadas[d.categoria]) despesasDetalhadas[d.categoria] = 0;
        despesasDetalhadas[d.categoria] += parseFloat(d.valor || 0);
    });

    // 5. Resultado Líquido
    const resultadoLiquido = lucroBruto - totalDespesas;

    // Renderizar
    const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pct = (v) => ((v / receitaBruta) * 100).toFixed(1) + '%';
    const row = (label, valor, isTotal = false, indent = false) => `
        <tr style="${isTotal ? 'font-weight:bold; background:var(--bg-secondary);' : ''}">
            <td style="${indent ? 'padding-left:2rem;' : ''}">${label}</td>
            <td style="text-align:right;">${fmt(valor)}</td>
            <td style="text-align:right; font-size:0.85rem; color:var(--text-secondary);">${receitaBruta > 0 ? pct(valor) : '-'}</td>
        </tr>
    `;

    let html = '';
    html += row('Receita Bruta de Vendas', receitaBruta, true);
    html += row('(-) Impostos (Simples 6%)', -deducoes, false, true);
    html += row('(=) Receita Líquida', receitaLiquida, true);
    html += row('(-) CMV (Custo Mercadoria)', -cmvTotal, false, true);
    html += row('(=) Lucro Bruto', lucroBruto, true);

    html += `<tr><td colspan="3" style="font-weight:600; padding-top:1rem;">Despesas Operacionais</td></tr>`;
    for (const [cat, val] of Object.entries(despesasDetalhadas)) {
        html += row(`(-) ${cat}`, -val, false, true);
    }

    html += row('(=) Resultado Líquido', resultadoLiquido, true);

    dreBody.innerHTML = html;
};

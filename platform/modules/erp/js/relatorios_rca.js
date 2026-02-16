// ===========================================
// RELATÓRIO DE DESEMPENHO POR RCA
// ===========================================

window.renderRelatorioRca = function () {
    const tbody = document.getElementById('rcaTableBody');
    const footer = document.getElementById('rcaTableFooter');

    if (!tbody || !footer) return;

    // Filters
    const dtIni = document.getElementById('rcaDtIni')?.value;
    const dtFim = document.getElementById('rcaDtFim')?.value;

    // Load Data
    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]'); // Sales
    const produtos = JSON.parse(localStorage.getItem('erp_products') || '[]'); // Products (for Cost/Weight)
    const clientes = JSON.parse(localStorage.getItem('erp_entities') || '[]'); // Clients (for Status/RCA link)

    // Mock Sellers/RCAs if not in separate collection, or extract from sales/clients
    // In Parreira ERP, usually "vendedor" is just a code or name in the sale.
    // We will group by `venda.vendedor` (Code) and `venda.nomeVendedor` (Name)

    const rcaMap = {};

    // 1. Initialize RCAs from Sales (to capture all who sold)
    vendas.forEach(v => {
        // Filter Date
        if (dtIni && v.data < dtIni) return;
        if (dtFim && v.data > dtFim) return;

        const codRca = v.vendedor?.id || v.vendedor || '0';
        const nomeRca = v.vendedor?.nome || ('Vendedor ' + codRca);

        if (!rcaMap[codRca]) {
            rcaMap[codRca] = {
                codigo: codRca,
                nome: nomeRca,
                dtAdmissao: '', // Mock or fetch if available
                totalFaturado: 0,
                totalPeso: 0,
                totalCusto: 0,
                clientesDaCarteira: new Set(),
                clientesPositivados: new Set(),
                clientesBloqueados: 0,
                produtosVendidos: new Set() // For Mix
            };
        }

        // Metrics from Sale
        const totalVenda = parseFloat(v.totalGeral || 0);
        rcaMap[codRca].totalFaturado += totalVenda;

        // Metrics from Items
        if (v.itens && Array.isArray(v.itens)) {
            v.itens.forEach(item => {
                const prod = produtos.find(p => p.sku === item.codigo || p.id === item.codigo);
                const qtd = parseFloat(item.quantidade || 0);

                // Mix
                rcaMap[codRca].produtosVendidos.add(item.codigo);

                if (prod) {
                    // Weight
                    const peso = parseFloat(prod.pesoBruto || 0);
                    rcaMap[codRca].totalPeso += (peso * qtd);

                    // Cost (for Margin)
                    const custo = parseFloat(prod.custo || 0);
                    rcaMap[codRca].totalCusto += (custo * qtd);
                }
            });
        }

        // Positivization
        const clienteId = v.cliente?.id || v.cliente;
        if (clienteId) {
            rcaMap[codRca].clientesPositivados.add(clienteId);
        }
    });

    // 2. Encontrar Total de Clientes da Carteira e Bloqueados for each RCA
    // Iterate all clients to assign them to RCAs (if client has RCA field) or just assume from sales if loose
    // Since we don't have explicit RCA-Client link structure in previous files, we'll infer or assume all clients 
    // that bought are in portfolio OR we check `erp_entities` for a `vendedor` field.

    // Let's try to map from `erp_entities` if valuable
    clientes.forEach(c => {
        // If client has a linked seller
        const sellerId = c.vendedor || c.vendedorId;
        if (sellerId && rcaMap[sellerId]) {
            rcaMap[sellerId].clientesDaCarteira.add(c.id);
            if (c.bloqueado || c.status === 'Bloqueado') {
                rcaMap[sellerId].clientesBloqueados++;
            }
        }
    });

    // If no client-seller link exists in entities, we might default "Total Clientes" 
    // to be at least the count of Positivados (cannot be less).
    Object.values(rcaMap).forEach(r => {
        if (r.clientesDaCarteira.size < r.clientesPositivados.size) {
            // Fix inconsistencies if no explicit portfolio
            r.clientesPositivados.forEach(c => r.clientesDaCarteira.add(c));
        }
    });

    // 3. Convert to Array and Calc Derived Metrics
    let reportData = Object.values(rcaMap).map(r => {
        const margemVal = r.totalFaturado - r.totalCusto;
        const margemPct = r.totalFaturado > 0 ? (margemVal / r.totalFaturado) * 100 : 0;

        const valorPorKilo = r.totalPeso > 0 ? (r.totalFaturado / r.totalPeso) : 0;

        const totalClientes = r.clientesDaCarteira.size;
        const positivados = r.clientesPositivados.size;
        const positPct = totalClientes > 0 ? (positivados / totalClientes) * 100 : 0;

        return {
            ...r,
            margemPct,
            valorPorKilo,
            totalClientes,
            positivados,
            positPct,
            mix: r.produtosVendidos.size
        };
    });

    // Sort by Total Faturado Desc
    reportData.sort((a, b) => b.totalFaturado - a.totalFaturado);

    // 4. Render Rows
    tbody.innerHTML = reportData.map(r => `
        <tr>
            <td>${r.codigo}</td>
            <td style="font-weight:600; color:var(--text-primary); text-align:left;">${r.nome}</td>
            <td>${r.dtAdmissao || ''}</td>
            <td style="font-weight:bold; color:var(--accent-primary);">R$ ${r.totalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${r.valorPorKilo > 0 ? r.valorPorKilo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}</td>
            <td style="${r.margemPct < 30 ? 'color:var(--accent-danger);' : 'color:var(--accent-success);'} font-weight:600;">
                ${r.margemPct.toFixed(2)}%
            </td>
            <td>${r.totalClientes}</td>
            <td>${r.positivados}</td>
            <td>${r.positPct.toFixed(2)}%</td>
            <td style="color:${r.clientesBloqueados > 0 ? 'var(--accent-danger)' : 'inherit'}; font-weight:${r.clientesBloqueados > 0 ? 'bold' : 'normal'}">
                ${r.clientesBloqueados}
            </td>
            <td>${r.mix}</td>
        </tr>
    `).join('');

    if (reportData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem;">Nenhuma venda encontrada no período.</td></tr>`;
    }

    // 5. Render Footer (Totals)
    const totals = reportData.reduce((acc, curr) => {
        acc.faturado += curr.totalFaturado;
        acc.peso += curr.totalPeso;
        acc.custo += curr.totalCusto;
        acc.clientes += curr.totalClientes;
        acc.positivados += curr.positivados;
        acc.bloqueados += curr.clientesBloqueados;
        acc.mix += curr.mix; // Sum of mixes (or average? Screenshot shows sum-like or big number, usually per RCA mix is summed or distinct total)
        // Screenshot shows Mix '502' total, which seems like a sum of mixes or distinct total. 
        // Let's assum Sum for now as per usual simple reports, or Distinct Global.
        // To be precise: Usually Total Mix is distinct global. Let's do distinct global.
        curr.produtosVendidos.forEach(p => acc.distinctProducts.add(p));
        return acc;
    }, { faturado: 0, peso: 0, custo: 0, clientes: 0, positivados: 0, bloqueados: 0, mix: 0, distinctProducts: new Set() });

    const totalMargemVal = totals.faturado - totals.custo;
    const totalMargemPct = totals.faturado > 0 ? (totalMargemVal / totals.faturado) * 100 : 0;
    const totalValorKilo = totals.peso > 0 ? (totals.faturado / totals.peso) : 0;
    const totalPositPct = totals.clientes > 0 ? (totals.positivados / totals.clientes) * 100 : 0;

    footer.innerHTML = `
        <tr style="background:var(--bg-secondary); font-weight:bold; border-top:2px solid var(--border-color);">
            <td colspan="3" style="text-align:right; padding-right:1rem;">Totais >>></td>
            <td style="color:var(--accent-primary);">R$ ${totals.faturado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${totalValorKilo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${totalMargemPct.toFixed(2)}%</td>
            <td>${totals.clientes}</td>
            <td>${totals.positivados}</td>
            <td>${totalPositPct.toFixed(2)}%</td>
            <td style="color:${totals.bloqueados > 0 ? 'var(--accent-danger)' : 'inherit'}">${totals.bloqueados}</td>
            <td>${totals.distinctProducts.size}</td> 
        </tr>
    `;
};

// Initial Render on Load if View is Active
document.addEventListener('DOMContentLoaded', () => {
    // Check if view is active and render
    if (document.getElementById('view-relatorio-rca')?.style.display !== 'none') {
        renderRelatorioRca();
    }
});

// Export to Excel (CSV/XLS logic)
window.exportRelatorioRcaToExcel = function () {
    const table = document.getElementById('rcaTable');
    if (!table) return;

    let html = table.outerHTML;

    // Basic clean up if needed (normally table.outerHTML is enough for basic XLS open)
    // We replace some css vars with static colors for standard excel opening if we use .xls extension
    // But for a simple approach, we can just use the html blob.

    const uri = 'data:application/vnd.ms-excel;base64,';
    const template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Desempenho RCA</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><meta charset="UTF-8"></head><body>{table}</body></html>';

    const base64 = function (s) { return window.btoa(unescape(encodeURIComponent(s))) };
    const format = function (s, c) { return s.replace(/{(\w+)}/g, function (m, p) { return c[p]; }) };

    const ctx = { worksheet: 'Desempenho RCA', table: html };

    const link = document.createElement("a");
    link.href = uri + base64(format(template, ctx));
    link.download = "Relatorio_Desempenho_RCA.xls";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

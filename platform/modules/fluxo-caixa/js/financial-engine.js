/**
 * Motor de Inteligência Financeira (V3 - Template Spreadsheet Mode)
 * Monta a estrutura baseada na planilha e preenche com os dados do PDF.
 */

window.FinancialEngine = {
    // Cores oficiais dos grupos (conforme ordem das imagens enviadas)
    GROUP_STYLES: {
        'Disponíveis Nas Contas Movimento inicial': { color: 'var(--color-disponiveis)', class: 'group-disponiveis' },
        'Total Receitas Operacionais / Vendas': { color: 'var(--color-receitas)', class: 'group-receitas' },
        'Total dos Custos': { color: 'var(--color-custos)', class: 'group-custos' },
        '300. Despesas Operac. Fixas e Variáveis': { color: 'var(--color-despesas)', class: 'group-despesas' },
        'Receitas Não Operacionais Totais': { color: 'var(--color-receitas-nao-op)', class: 'group-nao-op' }
    },

    /**
     * Processa as contas do PDF e mapeia para a estrutura da planilha
     */
    processData(pdfAccounts) {
        if (!window.MASTER_ACCOUNTS) {
            console.error("MASTER_ACCOUNTS não carregado.");
            return { rows: [], totals: {} };
        }

        // 1. Criar um mapa das contas do PDF para busca rápida por código
        const pdfMap = {};
        pdfAccounts.forEach(acc => {
            if (!pdfMap[acc.codigo]) pdfMap[acc.codigo] = { total: 0, items: [] };
            pdfMap[acc.codigo].total += (acc.a_receber || 0) - (acc.a_pagar || 0);
            pdfMap[acc.codigo].items.push(acc);
        });

        // 2. Construir as linhas da tabela seguindo fielmente a MASTER_ACCOUNTS
        const tableRows = [];
        let currentGroup = null;
        const groupTotals = {};

        window.MASTER_ACCOUNTS.forEach(master => {
            // Se for um cabeçalho de grupo
            if (master.codigo === 'HEADER') {
                currentGroup = master.descricao;
                if (!groupTotals[currentGroup]) groupTotals[currentGroup] = 0;
                
                tableRows.push({
                    type: 'header',
                    descricao: master.descricao,
                    style: this.GROUP_STYLES[master.descricao] || { color: '#64748b', class: 'group-other' }
                });
                return;
            }

            // Se for uma conta normal
            const pdfData = pdfMap[master.codigo];
            const valor = pdfData ? pdfData.total : 0;
            
            if (currentGroup) groupTotals[currentGroup] += valor;

            tableRows.push({
                type: 'account',
                codigo: master.codigo,
                descricao: master.descricao,
                valor: valor,
                group: currentGroup
            });

            // Se usamos essa conta do PDF, removemos do mapa para saber o que sobrou
            if (pdfData) delete pdfMap[master.codigo];
        });

        // 3. Adicionar contas do PDF que NÃO foram encontradas na planilha (Unmapped)
        const unmappedRows = [];
        Object.entries(pdfMap).forEach(([codigo, data]) => {
            unmappedRows.push({
                type: 'account',
                codigo: codigo,
                descricao: data.items[0].descricao, // Usa a descrição que veio no PDF
                valor: data.total,
                unmapped: true
            });
        });

        if (unmappedRows.length > 0) {
            tableRows.push({
                type: 'header',
                descricao: 'CONTAS NÃO ENCONTRADAS NA PLANILHA (Vincular Manualmente)',
                style: { color: '#64748b', class: 'group-other' }
            });
            tableRows.push(...unmappedRows);
        }

        // 4. Calcular totais para a barra de resumo
        const totals = {
            saldoInicial: groupTotals['Disponíveis Nas Contas Movimento inicial'] || 0,
            totalReceitas: (groupTotals['Total Receitas Operacionais / Vendas'] || 0) + (groupTotals['Receitas Não Operacionais Totais'] || 0),
            totalDespesas: (groupTotals['Total dos Custos'] || 0) + (groupTotals['300. Despesas Operac. Fixas e Variáveis'] || 0),
        };
        totals.saldoLiquido = totals.totalReceitas + totals.totalDespesas; // Despesas já costumam vir negativas no PDF
        totals.saldoAjustado = totals.saldoLiquido + totals.saldoInicial;

        return { rows: tableRows, totals };
    }
};

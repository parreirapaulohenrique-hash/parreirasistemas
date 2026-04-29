/**
 * Motor de Inteligência Financeira (V4 - Triple Hierarchy & Validation)
 * Suporta 3 níveis de profundidade e lógica de conferência manual.
 */

window.FinancialEngine = {
    GROUP_STYLES: {
        'Disponíveis Nas Contas Movimento inicial': { color: 'var(--color-disponiveis)', class: 'group-disponiveis' },
        'Total Receitas Operacionais / Vendas': { color: 'var(--color-receitas)', class: 'group-receitas', allowManual: true },
        'Total dos Custos': { color: 'var(--color-custos)', class: 'group-custos' },
        '300. Despesas Operac. Fixas e Variáveis': { color: 'var(--color-despesas)', class: 'group-despesas' },
        'Receitas Não Operacionais Totais': { color: 'var(--color-receitas-nao-op)', class: 'group-nao-op' }
    },

    /**
     * Determina o nível da conta pelo código
     */
    getLevel(codigo) {
        if (codigo === 'HEADER') return 1;
        const dots = (codigo.match(/\./g) || []).length;
        if (dots === 0) return 2; // Ex: 300
        if (dots === 1) return 2; // Ex: 1.1, 3.2
        return 3; // Ex: 1.1.01
    },

    processData(pdfAccounts, manualEntries = {}) {
        if (!window.MASTER_ACCOUNTS) return { rows: [], totals: {} };

        const pdfMap = {};
        pdfAccounts.forEach(acc => {
            if (!pdfMap[acc.codigo]) pdfMap[acc.codigo] = { total: 0 };
            pdfMap[acc.codigo].total += (acc.a_receber || 0) - (acc.a_pagar || 0);
        });

        const tableRows = [];
        let currentGroup = null;
        const groupTotals = {};
        const subgroupTotals = {};

        window.MASTER_ACCOUNTS.forEach(master => {
            if (master.codigo === 'HEADER') {
                currentGroup = master.descricao;
                groupTotals[currentGroup] = 0;
                tableRows.push({
                    type: 'header',
                    level: 1,
                    descricao: master.descricao,
                    style: this.GROUP_STYLES[master.descricao] || { color: '#64748b', class: 'group-other' }
                });
                
                // Caso especial: Receita Operacional Bruta
                if (master.descricao === 'Receita Operacional Bruta') {
                    const r1 = groupTotals['Total Receitas Operacionais / Vendas'] || 0;
                    const r2 = groupTotals['Total dos Custos'] || 0;
                    tableRows[tableRows.length-1].valorCalculado = r1 + r2; // Custos costumam ser negativos
                }
                return;
            }

            const level = this.getLevel(master.codigo);
            let valor = 0;

            // Lógica de Preenchimento Manual para Receitas
            if (currentGroup === 'Total Receitas Operacionais / Vendas' && level === 3) {
                // Se houver valor manual salvo, usa ele, senão 0
                const manualKey = `${master.codigo}-${master.descricao}`;
                valor = manualEntries[manualKey] || 0;
            } else {
                valor = pdfMap[master.codigo] ? pdfMap[master.codigo].total : 0;
            }

            // Acumula Totais
            if (currentGroup) groupTotals[currentGroup] += valor;
            if (level === 2) subgroupTotals[master.codigo] = 0;
            
            // Tenta somar no subgrupo pai (simplificado: pega os primeiros caracteres até o último ponto)
            if (level === 3) {
                const parentCode = master.codigo.substring(0, master.codigo.lastIndexOf('.'));
                if (subgroupTotals[parentCode] !== undefined) subgroupTotals[parentCode] += valor;
            }

            tableRows.push({
                type: 'account',
                level: level,
                codigo: master.codigo,
                descricao: master.descricao,
                valor: valor,
                group: currentGroup,
                isManual: (currentGroup === 'Total Receitas Operacionais / Vendas' && level === 3)
            });

            if (pdfMap[master.codigo]) delete pdfMap[master.codigo];
        });

        // Adicionar Unmapped
        const unmapped = Object.entries(pdfMap).map(([c, d]) => ({
            type: 'account',
            level: 3,
            codigo: c,
            descricao: d.descricao || 'Desconhecida',
            valor: d.total,
            unmapped: true
        }));

        if (unmapped.length > 0) {
            tableRows.push({ type: 'header', level: 1, descricao: 'CONTAS PARA VINCULAR', style: { class: 'group-other' } });
            tableRows.push(...unmapped);
        }

        return { 
            rows: tableRows, 
            totals: this.calculateBarTotals(groupTotals),
            pdfTotalReceitas: pdfAccounts.filter(a => a.codigo.startsWith('1.1') || a.codigo.startsWith('1.5')).reduce((s, a) => s + (a.a_receber - a.a_pagar), 0)
        };
    },

    calculateBarTotals(groups) {
        const rOp = groups['Total Receitas Operacionais / Vendas'] || 0;
        const rNOp = groups['Receitas Não Operacionais Totais'] || 0;
        const custos = groups['Total dos Custos'] || 0;
        const despesas = groups['300. Despesas Operac. Fixas e Variáveis'] || 0;
        const inicial = groups['Disponíveis Nas Contas Movimento inicial'] || 0;

        return {
            saldoInicial: inicial,
            totalReceitas: rOp + rNOp,
            totalDespesas: custos + despesas,
            saldoLiquido: rOp + rNOp + custos + despesas,
            saldoAjustado: rOp + rNOp + custos + despesas + inicial
        };
    }
};

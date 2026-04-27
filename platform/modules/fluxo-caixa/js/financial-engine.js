/**
 * Motor de Inteligência Financeira (V2 - Strict Spreadsheet Mode)
 * Responsável por agrupar contas e calcular indicadores baseados RIGOROSAMENTE na planilha.
 */

window.FinancialEngine = {
    // Definição dos Grupos Principais (Conforme Planilha)
    GROUPS: [
        {
            id: 'disponibilidade',
            label: 'Disponíveis Nas Contas Movimento inicial',
            color: 'var(--color-disponiveis)',
            prefixes: ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.9', '2.1', '2.4', '2.9', '4.0', '4.1', '4.4', '4.9', '91.']
        },
        {
            id: 'receitas_operacionais',
            label: 'Total Receitas Operacionais / Vendas',
            color: 'var(--color-receitas)',
            prefixes: ['1.1.', '1.2.', '1.5.']
        },
        {
            id: 'custos_impostos',
            label: 'Total dos Custos',
            color: 'var(--color-custos)',
            prefixes: ['2.1.', '2.2.', '2.3.']
        },
        {
            id: 'despesas_operacionais',
            label: '300. Despesas Operac. Fixas e Variáveis',
            color: 'var(--color-despesas)',
            prefixes: ['3.1.', '3.2.', '3.3.', '3.4.', '3.5.', '3.6.']
        },
        {
            id: 'receitas_nao_operacionais',
            label: 'Receitas Não Operacionais Totais',
            color: 'var(--color-receitas-nao-op)',
            prefixes: ['4.1.', '4.2.', '4.3.']
        }
    ],

    /**
     * Tenta encontrar a descrição oficial da planilha para um código
     */
    getMasterDescription(code) {
        if (!window.MASTER_ACCOUNTS) return null;
        
        // Busca exata
        const match = window.MASTER_ACCOUNTS.find(acc => acc.codigo === code);
        if (match) return match.descricao;
        
        // Busca aproximada (remove pontos extras no final)
        const cleanCode = code.endsWith('.') ? code.slice(0, -1) : code;
        const match2 = window.MASTER_ACCOUNTS.find(acc => acc.codigo === cleanCode);
        return match2 ? match2.descricao : null;
    },

    /**
     * Agrupa uma lista de contas em categorias
     */
    groupAccounts(accounts) {
        const grouped = {};
        this.GROUPS.forEach(g => {
            grouped[g.id] = {
                config: g,
                items: [],
                total: 0
            };
        });

        grouped['outros'] = {
            config: { id: 'outros', label: 'Não Encontrados na Planilha (Vincular Manualmente)', color: '#64748b' },
            items: [],
            total: 0
        };

        accounts.forEach(acc => {
            // Sincroniza a descrição com a planilha se disponível
            const officialDesc = this.getMasterDescription(acc.codigo);
            if (officialDesc) {
                acc.descricao = officialDesc;
            }

            let matched = false;
            for (const group of this.GROUPS) {
                // Regra de prefixo: Se o código começa com o prefixo do grupo
                if (group.prefixes.some(p => acc.codigo.startsWith(p))) {
                    grouped[group.id].items.push(acc);
                    const val = (acc.a_receber || 0) - (acc.a_pagar || 0);
                    grouped[group.id].total += val;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                grouped['outros'].items.push(acc);
                const val = (acc.a_receber || 0) - (acc.a_pagar || 0);
                grouped['outros'].total += val;
                acc.unmapped = true; // Marca como não mapeado
            }
        });

        return grouped;
    },

    /**
     * Calcula os totais consolidados
     */
    calculateTotals(grouped) {
        const recOp = grouped['receitas_operacionais'].total;
        const recNaoOp = grouped['receitas_nao_operacionais'].total;
        const despesas = grouped['despesas_operacionais'].total + grouped['custos_impostos'].total;
        
        const saldoLiquidoFinal = recOp + recNaoOp + despesas;
        
        // O Saldo Inicial vem do grupo 'disponibilidade'
        const saldoInicial = grouped['disponibilidade'].total;

        return {
            saldoInicial: saldoInicial,
            totalReceitas: recOp + recNaoOp,
            totalDespesas: despesas,
            saldoLiquido: saldoLiquidoFinal,
            saldoAjustado: saldoLiquidoFinal + saldoInicial // Simulação do ajustado
        };
    }
};

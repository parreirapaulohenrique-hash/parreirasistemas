/**
 * Motor de Inteligência Financeira
 * Responsável por agrupar contas e calcular indicadores baseados no padrão da planilha do usuário.
 */

window.FinancialEngine = {
    // Definição dos Grupos e seus prefixos de código
    GROUPS: [
        {
            id: 'disponibilidade',
            label: 'Disponíveis nas Contas Movimento',
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
            label: 'Total dos Custos (Aquisição/Impostos)',
            color: 'var(--color-custos)',
            prefixes: ['2.1.', '2.2.', '2.3.']
        },
        {
            id: 'despesas_operacionais',
            label: 'Total das Despesas Operacionais',
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

        // Contas que não encaixam em nenhum grupo (fallback)
        grouped['outros'] = {
            config: { id: 'outros', label: 'Outras Contas', color: '#64748b' },
            items: [],
            total: 0
        };

        accounts.forEach(acc => {
            let matched = false;
            
            // Tenta encontrar o grupo pelo prefixo do código
            for (const group of this.GROUPS) {
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
            }
        });

        return grouped;
    },

    /**
     * Calcula os totais consolidados para a Barra de Resumo
     */
    calculateTotals(grouped) {
        const recOp = grouped['receitas_operacionais'].total;
        const recNaoOp = grouped['receitas_nao_operacionais'].total;
        const despesas = grouped['despesas_operacionais'].total + grouped['custos_impostos'].total;
        
        const saldoLiquidoFinal = recOp + recNaoOp + despesas;
        
        // Simulação de Saldo Ajustado (conforme planilha, parece ser saldo + disponibilidade inicial)
        const disponibilidadeInicial = grouped['disponibilidade'].total; // Simplificação
        const saldoAjustado = saldoLiquidoFinal + 0; // Na planilha o ajuste é específico, vamos manter saldo por enquanto

        return {
            saldoInicial: disponibilidadeInicial,
            totalReceitas: recOp + recNaoOp,
            totalDespesas: despesas,
            saldoLiquido: saldoLiquidoFinal,
            saldoAjustado: saldoLiquidoFinal // Por enquanto igual ao líquido até entendermos a regra de ajuste
        };
    }
};

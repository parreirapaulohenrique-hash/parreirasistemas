/**
 * Motor de Inteligência Financeira (V5 - Contas Movimento + Validation)
 * Suporta grupos de entrada manual (Contas Movimento e Receitas).
 */

window.FinancialEngine = {
    GROUP_STYLES: {
        'Disponíveis Nas Contas Movimento inicial': { color: '#e65100', class: 'group-disponiveis' },
        'Total Receitas Operacionais / Vendas':     { color: '#1b5e20', class: 'group-receitas', allowManual: true },
        'Total dos Custos':                         { color: '#b71c1c', class: 'group-custos' },
        '300. Despesas Operac. Fixas e Variáveis':  { color: '#880e4f', class: 'group-despesas' },
        'Receitas Não Operacionais Totais':         { color: '#0d47a1', class: 'group-nao-op' }
    },

    // Grupos cujos itens aceitam entrada manual (PDF é verificado primeiro; fallback = manual)
    MANUAL_GROUPS: new Set([
        'Disponíveis Nas Contas Movimento inicial',
        'Total Receitas Operacionais / Vendas'
    ]),

    getLevel(codigo) {
        if (codigo === 'HEADER') return 1;
        const dots = (codigo.match(/\./g) || []).length;
        if (dots === 0) return 2;
        if (dots === 1) return 2;
        return 3;
    },

    processData(pdfAccounts, manualEntries = {}) {
        if (!window.MASTER_ACCOUNTS) return { rows: [], totals: {} };

        // Mapa de valores do PDF por código (saldo = a_receber - a_pagar)
        const pdfMap = {};
        pdfAccounts.forEach(acc => {
            if (!pdfMap[acc.codigo]) pdfMap[acc.codigo] = { total: 0 };
            pdfMap[acc.codigo].total += (acc.a_receber || 0) - (acc.a_pagar || 0);
        });

        const tableRows      = [];
        let   currentGroup   = null;
        const groupTotals    = {};
        const subgroupTotals = {};

        // Índices dos headers de grupos manuais para back-fill do total depois
        const manualHeaderIdx = {};

        window.MASTER_ACCOUNTS.forEach(master => {
            // ── Header de grupo ──────────────────────────────────────────────
            if (master.codigo === 'HEADER') {
                currentGroup = master.descricao;
                groupTotals[currentGroup] = 0;

                const row = {
                    type:     'header',
                    level:    1,
                    descricao: master.descricao,
                    style: this.GROUP_STYLES[master.descricao] || { color: '#64748b', class: 'group-other' }
                };

                // Receita Operacional Bruta = Receitas + Custos (já calculados)
                if (master.descricao === 'Receita Operacional Bruta') {
                    const r1 = groupTotals['Total Receitas Operacionais / Vendas'] || 0;
                    const r2 = groupTotals['Total dos Custos'] || 0;
                    row.valorCalculado = r1 + r2;
                }

                tableRows.push(row);

                // Guarda índice dos grupos manuais para preencher o total depois
                if (this.MANUAL_GROUPS.has(currentGroup)) {
                    manualHeaderIdx[currentGroup] = tableRows.length - 1;
                }
                return;
            }

            // ── Conta / linha de dados ───────────────────────────────────────
            const level    = this.getLevel(master.codigo);
            const isManual = this.MANUAL_GROUPS.has(currentGroup);
            let   valor    = 0;

            if (isManual) {
                // PDF primeiro; fallback = entrada manual salva
                const manualKey = `${master.codigo}-${master.descricao}`;
                valor = pdfMap[master.codigo]
                    ? pdfMap[master.codigo].total
                    : (manualEntries[manualKey] || 0);
                // Consome do pdfMap para não aparecer como "não mapeado"
                if (pdfMap[master.codigo]) delete pdfMap[master.codigo];
            } else {
                valor = pdfMap[master.codigo] ? pdfMap[master.codigo].total : 0;
                if (pdfMap[master.codigo]) delete pdfMap[master.codigo];
            }

            // Acumula totais
            if (currentGroup) groupTotals[currentGroup] += valor;
            if (level === 2)  subgroupTotals[master.codigo] = 0;
            if (level === 3) {
                const parent = master.codigo.substring(0, master.codigo.lastIndexOf('.'));
                if (subgroupTotals[parent] !== undefined) subgroupTotals[parent] += valor;
            }

            tableRows.push({
                type:     'account',
                level,
                codigo:   master.codigo,
                descricao: master.descricao,
                valor,
                group:    currentGroup,
                isManual,
            });
        });

        // ── Back-fill: atualiza totais dos headers manuais ───────────────────
        for (const [group, idx] of Object.entries(manualHeaderIdx)) {
            tableRows[idx].valorCalculado = groupTotals[group] || 0;
        }

        // ── Contas não mapeadas do PDF ───────────────────────────────────────
        const unmapped = Object.entries(pdfMap).map(([c, d]) => ({
            type:     'account',
            level:    3,
            codigo:   c,
            descricao: d.descricao || 'Desconhecida',
            valor:    d.total,
            unmapped: true
        }));
        if (unmapped.length > 0) {
            tableRows.push({ type: 'header', level: 1, descricao: '⚠️ CONTAS PARA VINCULAR', style: { class: 'group-other' } });
            tableRows.push(...unmapped);
        }

        return {
            rows:            tableRows,
            totals:          this.calculateBarTotals(groupTotals),
            pdfTotalReceitas: pdfAccounts
                .filter(a => a.codigo.startsWith('1.1') || a.codigo.startsWith('1.5'))
                .reduce((s, a) => s + (a.a_receber - a.a_pagar), 0)
        };
    },

    calculateBarTotals(groups) {
        const rOp    = groups['Total Receitas Operacionais / Vendas'] || 0;
        const rNOp   = groups['Receitas Não Operacionais Totais']     || 0;
        const custos = groups['Total dos Custos']                     || 0;
        const desp   = groups['300. Despesas Operac. Fixas e Variáveis'] || 0;
        const inicial = groups['Disponíveis Nas Contas Movimento inicial'] || 0;
        return {
            saldoInicial:   inicial,
            totalReceitas:  rOp + rNOp,
            totalDespesas:  custos + desp,
            saldoLiquido:   rOp + rNOp + custos + desp,
            saldoAjustado:  rOp + rNOp + custos + desp + inicial
        };
    }
};




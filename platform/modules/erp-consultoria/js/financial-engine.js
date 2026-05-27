/**
 * Motor de Inteligência Financeira (V6 - Subgroup Headers + Manual Groups)
 * - MANUAL_GROUPS: itens aceitam entrada manual (PDF primeiro, fallback manual)
 * - Accounts com filhos em MANUAL_GROUPS → subheader (estilizado, sem input)
 * - Accounts sem filhos em MANUAL_GROUPS → leaf manual entry (com input)
 * - Back-fill de totais nos subheaders e headers de grupo após processar todos
 */

window.FinancialEngine = {
    GROUP_STYLES: {
        'Disponíveis Nas Contas Movimento inicial': { color: 'var(--color-disponiveis)',      class: 'group-disponiveis' },
        'Disponíveis nas Contas Movimento final':  { color: 'var(--color-disponiveis)',      class: 'group-disponiveis' },
        'Total Receitas Operacionais / Vendas':     { color: 'var(--color-receitas)',         class: 'group-receitas'    },
        'Custo de Aquisição':                       { color: 'var(--color-custos)',           class: 'group-custos'      },
        'Despesas Operac. Fixas e Variáveis':       { color: 'var(--color-despesas)',         class: 'group-despesas'    },
        'Receitas Não Operacionais Totais':         { color: 'var(--color-receitas-nao-op)', class: 'group-nao-op'      },
        'Despesas Não Operacional':                 { color: 'var(--color-despesas)',         class: 'group-despesas'    },
    },

    MANUAL_GROUPS: new Set([
        'Disponíveis Nas Contas Movimento inicial',
        'Disponíveis nas Contas Movimento final',
        'Total Receitas Operacionais / Vendas',
        'Custo de Aquisição'
    ]),

    getLevel(codigo) {
        if (codigo === 'HEADER') return 1;
        const dots = (codigo.match(/\./g) || []).length;
        return dots >= 2 ? 3 : 2;
    },

    processData(pdfAccounts, manualEntries = {}) {
        if (!window.MASTER_ACCOUNTS) return { rows: [], totals: {} };

        // ── PDF map (saldo = a_receber - a_pagar) ───────────────────────────
        const pdfMap = {};
        pdfAccounts.forEach(acc => {
            if (!pdfMap[acc.codigo]) pdfMap[acc.codigo] = { total: 0 };
            pdfMap[acc.codigo].total += (acc.a_receber || 0) - (acc.a_pagar || 0);
        });

        // ── Pré-scan: quais codes level-2 têm filhos (level-3)? ─────────────
        // → esses serão sub-cabeçalhos estilizados, sem campo de input
        const codesWithChildren = new Set();
        let _lastL2 = null;
        let _inManual = false;
        window.MASTER_ACCOUNTS.forEach(m => {
            if (m.codigo === 'HEADER') {
                _lastL2 = null;
                _inManual = this.MANUAL_GROUPS.has(m.descricao);
                return;
            }
            if (!_inManual) return;
            const lv = this.getLevel(m.codigo);
            if (lv === 2) { _lastL2 = m.codigo; }
            if (lv === 3 && _lastL2) { codesWithChildren.add(_lastL2); }
        });

        // ── Processamento principal ──────────────────────────────────────────
        const tableRows      = [];
        let   currentGroup   = null;
        const groupTotals    = {};
        const subgroupTotals = {};          // { codigo: running total }
        const subgroupRowIdx = {};          // { codigo: tableRows index }
        const manualHeaderIdx = {};         // { groupName: tableRows index }

        window.MASTER_ACCOUNTS.forEach(master => {

            // ── Header de grupo (nível 1) ──────────────────────────────────
            if (master.codigo === 'HEADER') {
                currentGroup = master.descricao;
                groupTotals[currentGroup] = 0;

                const row = {
                    type:      'header',
                    level:     1,
                    descricao: master.descricao,
                    style:     this.GROUP_STYLES[master.descricao] || { color: '#64748b', class: 'group-other' }
                };

                if (master.descricao === 'Receita Operacional Bruta') {
                    row.valorCalculado = (groupTotals['Total Receitas Operacionais / Vendas'] || 0)
                                       + (groupTotals['Custo de Aquisição'] || 0);
                }

                tableRows.push(row);
                if (this.MANUAL_GROUPS.has(currentGroup)) {
                    manualHeaderIdx[currentGroup] = tableRows.length - 1;
                }
                return;
            }

            // ── Conta / linha de dados ─────────────────────────────────────
            const level    = this.getLevel(master.codigo);
            const isManual = this.MANUAL_GROUPS.has(currentGroup);

            // Caso: subheader de subgrupo (level-2 com filhos em MANUAL_GROUP)
            if (isManual && level === 2 && codesWithChildren.has(master.codigo)) {
                subgroupTotals[master.codigo] = 0;
                subgroupRowIdx[master.codigo] = tableRows.length;
                tableRows.push({
                    type:        'account',
                    level:       2,
                    codigo:      master.codigo,
                    descricao:   master.descricao,
                    valor:       0,   // back-filled depois
                    group:       currentGroup,
                    isSubheader: true,
                });
                return;  // não acumula em groupTotals agora
            }

            // Caso: leaf (manual ou PDF)
            let valor = 0;
            if (isManual) {
                // Chave diferenciada por grupo
                const isInitialGroup = currentGroup === 'Disponíveis Nas Contas Movimento inicial';
                const manualKey = isInitialGroup
                    ? `${master.codigo}-${master.descricao}`
                    : `${currentGroup}::${master.codigo}-${master.descricao}`;

                // ⚡ PRIORIDADE: valor digitado manualmente é sempre preferido ao PDF.
                // O PDF só é usado como fallback se o usuário não digitou nada.
                const manualVal = manualEntries[manualKey];
                const hasManual = manualVal !== undefined && manualVal !== null && Number(manualVal) !== 0;

                if (hasManual) {
                    // Usa o valor manual e consome a entrada do PDF silenciosamente
                    // (evita que ela apareça como "não mapeada")
                    valor = Number(manualVal);
                    if (pdfMap[master.codigo]) delete pdfMap[master.codigo];
                } else {
                    // Sem valor manual → tenta o PDF como fallback
                    if (pdfMap[master.codigo]) {
                        valor = pdfMap[master.codigo].total;
                        delete pdfMap[master.codigo];
                    }
                }
            } else {
                // Matching APENAS pelo código exato do master (sem aliases)
                if (pdfMap[master.codigo]) {
                    valor = pdfMap[master.codigo].total;
                    delete pdfMap[master.codigo];
                }
            }

            // Acumula totais
            if (currentGroup) groupTotals[currentGroup] += valor;
            if (level === 2 && !isManual) subgroupTotals[master.codigo] = 0;
            if (level === 3) {
                const parent = master.codigo.substring(0, master.codigo.lastIndexOf('.'));
                if (subgroupTotals[parent] !== undefined) subgroupTotals[parent] += valor;
            }

            tableRows.push({
                type:      'account',
                level,
                codigo:    master.codigo,
                descricao: master.descricao,
                valor,
                group:     currentGroup,
                isManual,
            });
        });

        // ── Back-fill subheaders de subgrupo (ex: "1.1. Receita com Vendas") ─
        for (const [code, idx] of Object.entries(subgroupRowIdx)) {
            tableRows[idx].valor = subgroupTotals[code] || 0;
        }

        // ── Back-fill headers de grupos manuais (ex: "Total Receitas...") ────
        for (const [group, idx] of Object.entries(manualHeaderIdx)) {
            tableRows[idx].valorCalculado = groupTotals[group] || 0;
        }

        // ── Contas não mapeadas do PDF ───────────────────────────────────────
        const unmapped = Object.entries(pdfMap).map(([c, d]) => ({
            type: 'account', level: 3,
            codigo: c, descricao: d.descricao || 'Desconhecida',
            valor: d.total, unmapped: true
        }));
        if (unmapped.length > 0) {
            tableRows.push({ type: 'header', level: 1, descricao: '⚠️ CONTAS PARA VINCULAR', style: { class: 'group-other' } });
            tableRows.push(...unmapped);
        }

        return {
            rows:             tableRows,
            totals:           this.calculateBarTotals(groupTotals),
            pdfTotalReceitas: pdfAccounts
                .filter(a => a.codigo.startsWith('1.1') || a.codigo.startsWith('1.5'))
                .reduce((s, a) => s + (a.a_receber - a.a_pagar), 0)
        };
    },

    calculateBarTotals(groups) {
        const rOp    = groups['Total Receitas Operacionais / Vendas']     || 0;
        const rNOp   = groups['Receitas Não Operacionais Totais']         || 0;
        const custos = groups['Custo de Aquisição']                       || 0;
        const desp   = groups['Despesas Operac. Fixas e Variáveis']       || 0;
        const despNOp = groups['Despesas Não Operacional']                || 0;
        const inicial = groups['Disponíveis Nas Contas Movimento inicial'] || 0;
        return {
            saldoInicial:   inicial,
            totalReceitas:  rOp + rNOp,
            totalDespesas:  custos + desp + despNOp,
            saldoLiquido:   rOp + rNOp + custos + desp + despNOp,
            saldoAjustado:  rOp + rNOp + custos + desp + despNOp + inicial
        };
    }
};

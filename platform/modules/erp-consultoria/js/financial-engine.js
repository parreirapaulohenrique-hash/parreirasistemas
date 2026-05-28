/**
 * Motor de Inteligência Financeira (V7 - Full Manual)
 * - PDF / Excel completamente ignorados
 * - TODOS os grupos aceitam entrada manual via input
 * - Sub-cabeçalhos apenas em grupos hierárquicos (Receitas, Custos, Despesas)
 * - Disponíveis (seções 1 e 7) sempre planos (todos os itens são folhas com input)
 * - Chave de entrada: "${grupo}::${codigo}-${descricao}" para TODOS os grupos
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

    // Todos os grupos agora aceitam entrada manual
    MANUAL_GROUPS: new Set([
        'Disponíveis Nas Contas Movimento inicial',
        'Disponíveis nas Contas Movimento final',
        'Total Receitas Operacionais / Vendas',
        'Custo de Aquisição',
        'Despesas Operac. Fixas e Variáveis',
        'Receitas Não Operacionais Totais',
        'Despesas Não Operacional',
    ]),

    // Grupos com hierarquia (level-2 com filhos → sub-cabeçalho sem input)
    // Disponíveis são intencionalmente EXCLUÍDOS: todas as contas bancárias são folhas
    SUBHEADER_GROUPS: new Set([
        'Total Receitas Operacionais / Vendas',
        'Custo de Aquisição',
        'Despesas Operac. Fixas e Variáveis',
        'Receitas Não Operacionais Totais',
        'Despesas Não Operacional',
    ]),

    getLevel(codigo) {
        if (codigo === 'HEADER') return 1;
        const dots = (codigo.match(/\./g) || []).length;
        return dots >= 2 ? 3 : 2;
    },

    /**
     * Processa os dados para gerar as linhas da tabela.
     * @param {Array}  pdfAccounts   - ignorado (mantido para assinatura compatível)
     * @param {Object} manualEntries - { "grupo::codigo-descricao": valor }
     */
    processData(pdfAccounts, manualEntries = {}) {
        if (!window.MASTER_ACCOUNTS) return { rows: [], totals: {} };

        // ── Pré-scan SECTION-AWARE ───────────────────────────────────────────
        // Descobre quais códigos level-2 têm filhos level-3 NA MESMA SEÇÃO,
        // somente para SUBHEADER_GROUPS.
        const codesWithChildrenBySection = {};
        let _scanSection    = null;
        let _scanLastL2     = null;
        let _allowSubheader = false;

        window.MASTER_ACCOUNTS.forEach(m => {
            if (m.codigo === 'HEADER') {
                _scanSection    = m.descricao;
                _scanLastL2     = null;
                _allowSubheader = this.SUBHEADER_GROUPS.has(m.descricao);
                if (_allowSubheader) codesWithChildrenBySection[_scanSection] = new Set();
                return;
            }
            if (!_allowSubheader || !_scanSection) return;
            const lv = this.getLevel(m.codigo);
            if (lv === 2) { _scanLastL2 = m.codigo; }
            if (lv === 3 && _scanLastL2) { codesWithChildrenBySection[_scanSection].add(_scanLastL2); }
        });

        // ── Processamento principal ──────────────────────────────────────────
        const tableRows           = [];
        let   currentGroup        = null;
        let   currentSubheaderKey = null;
        const groupTotals         = {};
        const subgroupTotals      = {};   // { "group::codigo": total }
        const subgroupRowIdx      = {};   // { "group::codigo": índice em tableRows }
        const manualHeaderIdx     = {};   // { groupName: índice em tableRows }

        window.MASTER_ACCOUNTS.forEach(master => {

            // ── Header de grupo (nível 1) ──────────────────────────────────
            if (master.codigo === 'HEADER') {
                currentGroup        = master.descricao;
                currentSubheaderKey = null;
                groupTotals[currentGroup] = groupTotals[currentGroup] || 0;

                const row = {
                    type:      'header',
                    level:     1,
                    descricao: master.descricao,
                    style:     this.GROUP_STYLES[master.descricao] || { color: '#64748b', class: 'group-other' }
                };

                // Cabeçalhos calculados (não-manual)
                if (master.descricao === 'Receita Operacional Bruta') {
                    row.valorCalculado = (groupTotals['Total Receitas Operacionais / Vendas'] || 0)
                                       + (groupTotals['Custo de Aquisição'] || 0);
                } else if (master.descricao === 'Total dos Custos') {
                    row.valorCalculado = groupTotals['Custo de Aquisição'] || 0;
                } else if (master.descricao === 'Total das Despesas Operacionais') {
                    row.valorCalculado = groupTotals['Despesas Operac. Fixas e Variáveis'] || 0;
                } else if (master.descricao === 'Total das Despesas Não Operacional') {
                    row.valorCalculado = groupTotals['Despesas Não Operacional'] || 0;
                } else if (master.descricao === 'Saldo Operacional Liquido') {
                    row.valorCalculado = (groupTotals['Total Receitas Operacionais / Vendas'] || 0)
                                       + (groupTotals['Custo de Aquisição'] || 0)
                                       + (groupTotals['Despesas Operac. Fixas e Variáveis'] || 0);
                } else if (master.descricao === 'Saldo Liquido Final' || master.descricao === 'Saldo Liquido Ajustado') {
                    const rOp  = groupTotals['Total Receitas Operacionais / Vendas'] || 0;
                    const rNOp = groupTotals['Receitas Não Operacionais Totais']     || 0;
                    const c    = groupTotals['Custo de Aquisição']                   || 0;
                    const d    = groupTotals['Despesas Operac. Fixas e Variáveis']   || 0;
                    const dNOp = groupTotals['Despesas Não Operacional']             || 0;
                    const ini  = groupTotals['Disponíveis Nas Contas Movimento inicial'] || 0;
                    row.valorCalculado = rOp + rNOp + c + d + dNOp + (master.descricao.includes('Ajustado') ? ini : 0);
                }

                tableRows.push(row);
                manualHeaderIdx[currentGroup] = tableRows.length - 1;
                return;
            }

            if (!currentGroup) return;

            // ── Conta / linha de dados ─────────────────────────────────────
            const level = this.getLevel(master.codigo);

            // Sub-cabeçalho: level-2 com filhos NA MESMA SEÇÃO (apenas SUBHEADER_GROUPS)
            const sectionSet      = codesWithChildrenBySection[currentGroup];
            const isThisSubheader = level === 2 && sectionSet && sectionSet.has(master.codigo);

            if (isThisSubheader) {
                const sgKey = `${currentGroup}::${master.codigo}`;
                currentSubheaderKey   = sgKey;
                subgroupTotals[sgKey] = 0;
                subgroupRowIdx[sgKey] = tableRows.length;
                tableRows.push({
                    type:        'account',
                    level:       2,
                    codigo:      master.codigo,
                    descricao:   master.descricao,
                    valor:       0,   // back-filled depois
                    group:       currentGroup,
                    isSubheader: true,
                });
                return;
            }

            // ── Folha com entrada manual (PDF completamente ignorado) ──────
            // Chave padrão para TODOS os grupos: "grupo::codigo-descricao"
            const manualKey = `${currentGroup}::${master.codigo}-${master.descricao}`;
            let valor = 0;
            const raw = manualEntries[manualKey];
            if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
                const n = Number(raw);
                if (!isNaN(n)) valor = n;
            }

            // Acumula totais
            groupTotals[currentGroup] += valor;
            if (level === 3 && currentSubheaderKey && subgroupTotals[currentSubheaderKey] !== undefined) {
                subgroupTotals[currentSubheaderKey] += valor;
            }

            tableRows.push({
                type:      'account',
                level,
                codigo:    master.codigo,
                descricao: master.descricao,
                valor,
                group:     currentGroup,
                isManual:  true,
            });
        });

        // ── Back-fill: preenche totais nos sub-cabeçalhos ───────────────────
        for (const [key, idx] of Object.entries(subgroupRowIdx)) {
            tableRows[idx].valor = subgroupTotals[key] || 0;
        }

        // ── Back-fill: preenche totais nos headers de grupo ──────────────────
        for (const [group, idx] of Object.entries(manualHeaderIdx)) {
            if (tableRows[idx].valorCalculado === undefined) {
                tableRows[idx].valorCalculado = groupTotals[group] || 0;
            }
        }

        return {
            rows:   tableRows,
            totals: this.calculateBarTotals(groupTotals),
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

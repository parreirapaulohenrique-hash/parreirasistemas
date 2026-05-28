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

    // Apenas esses grupos podem ter sub-cabeçalhos (level-2 com filhos).
    // Disponíveis é propositalmente EXCLUÍDO: todas as contas bancárias ali
    // são folhas com campo de input, mesmo que tenham sub-códigos (ex: 1.5.03).
    SUBHEADER_GROUPS: new Set([
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

        // ── Pré-scan SECTION-AWARE ───────────────────────────────────────────
        // Descobre quais códigos level-2 TÊM filhos (level-3) DENTRO DA MESMA SEÇÃO,
        // mas SOMENTE nas seções que permitem sub-cabeçalhos (SUBHEADER_GROUPS).
        // Seções Disponíveis são EXCLUÍDAS: todas as contas bancárias ali são folhas
        // com input, mesmo que tenham sub-códigos como 1.5.03.
        const codesWithChildrenBySection = {}; // { sectionName: Set<codigo> }
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
        const tableRows      = [];
        let   currentGroup   = null;
        let   currentSubheaderKey = null; // último sub-cabeçalho visto (chave composta)
        const groupTotals    = {};
        // Usa chave composta "group::codigo" para evitar colisão entre seções
        const subgroupTotals = {};    // { "group::codigo": running total }
        const subgroupRowIdx = {};    // { "group::codigo": tableRows index }
        const manualHeaderIdx = {};   // { groupName: tableRows index }

        window.MASTER_ACCOUNTS.forEach(master => {

            // ── Header de grupo (nível 1) ──────────────────────────────────
            if (master.codigo === 'HEADER') {
                currentGroup      = master.descricao;
                currentSubheaderKey = null;           // reset ao trocar de grupo
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

            // Sub-cabeçalho: level-2 com filhos NA MESMA SEÇÃO
            const sectionSet = codesWithChildrenBySection[currentGroup];
            const isThisSubheader = isManual && level === 2 && sectionSet && sectionSet.has(master.codigo);

            if (isThisSubheader) {
                const sgKey = `${currentGroup}::${master.codigo}`;
                currentSubheaderKey  = sgKey;         // registra último sub-cabeçalho
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
                const manualVal = manualEntries[manualKey];
                const hasManual = manualVal !== undefined && manualVal !== null && Number(manualVal) !== 0;

                if (hasManual) {
                    valor = Number(manualVal);
                    if (pdfMap[master.codigo]) delete pdfMap[master.codigo];
                } else {
                    if (pdfMap[master.codigo]) {
                        valor = pdfMap[master.codigo].total;
                        delete pdfMap[master.codigo];
                    }
                }
            } else {
                if (pdfMap[master.codigo]) {
                    valor = pdfMap[master.codigo].total;
                    delete pdfMap[master.codigo];
                }
            }

            // Acumula totais
            if (currentGroup) groupTotals[currentGroup] += valor;
            // Usa último sub-cabeçalho visto (não prefixo do código) para acumular.
            // Isso cobre casos onde o código filho não bate com o pai, ex: 1.2.01 sob 1.5.
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
                isManual,
            });
        });

        // ── Back-fill subheaders ─────────────────────────────────────────────
        for (const [key, idx] of Object.entries(subgroupRowIdx)) {
            tableRows[idx].valor = subgroupTotals[key] || 0;
        }

        // ── Back-fill headers de grupos manuais ──────────────────────────────
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
            // Aceita códigos antigos (1.1/1.5) e novos (2.1/2.5) para compatibilidade
            pdfTotalReceitas: pdfAccounts
                .filter(a => a.codigo.startsWith('1.1') || a.codigo.startsWith('1.5')
                          || a.codigo.startsWith('2.1') || a.codigo.startsWith('2.5'))
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

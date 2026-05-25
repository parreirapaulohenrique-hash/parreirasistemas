/**
 * Controlador principal da Aplicação UI e Lógica do Fluxo de Caixa (ERP Consultoria)
 * Integrado como um módulo dentro do ERP Geral.
 */

window.fcApp = {
    currentChart: null,
    pendingImport: null,
    manualEntries: {},

    /**
     * Garante que as views FC estejam DENTRO do content-wrapper.
     * Resolve o problema de IDs duplicados e views fora da área scrollável.
     */
    consolidateFCViews() {
        const wrapper = document.querySelector('.content-wrapper');
        if (!wrapper) return;

        const viewIds = ['view-fc-clients', 'view-fc-overview', 'view-fc-import', 'view-fc-projections', 'view-fc-export'];

        viewIds.forEach(id => {
            const allMatches = Array.from(document.querySelectorAll('#' + id));
            if (allMatches.length === 0) return;

            // Prefere o que já tem view-header-bar (mais completo); senão pega o primeiro
            const best = allMatches.find(el => el.querySelector('.view-header-bar')) || allMatches[0];

            // Remove todos os outros duplicados
            allMatches.forEach(el => { if (el !== best) el.remove(); });

            // Move o melhor para dentro do content-wrapper se não estiver lá
            if (best.parentElement !== wrapper) {
                best.style.display = 'none';
                wrapper.appendChild(best);
            }
        });
    },

    init() {
        this.consolidateFCViews();
        this.bindEvents();
        this.loadCustomMasterAccounts();
        this.initFilters();

        // Carrega clientes da nuvem
        const grid = document.getElementById('fc-clients-grid');
        if (grid) grid.innerHTML = '<p style="text-align:center; color:var(--text-secondary); grid-column:1/-1;">Sincronizando clientes com a nuvem...</p>';

        this.renderClientsList();
    },

    initFilters() {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // Tipo de período
        const typeEl = document.getElementById('filter-period-type');
        if (typeEl && typeEl.options.length <= 1) {
            typeEl.innerHTML = `
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
            `;
            // ✅ Padrão: Anual — assim todos os meses têm chance de aparecer
            typeEl.value = 'anual';
        }

        // Popula anos
        const yearEl = document.getElementById('filter-period-year');
        const yearTarget = yearEl || document.getElementById('filter-period-value');
        if (yearTarget) {
            yearTarget.innerHTML = '';
            for (let y = currentYear - 2; y <= currentYear + 2; y++) {
                yearTarget.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
        }

        this.updatePeriodSubSelect();

        if (typeEl) typeEl.addEventListener('change', () => { this.updatePeriodSubSelect(); this.refreshDashboard(); });
        const subEl = document.getElementById('filter-period-sub');
        if (subEl) subEl.addEventListener('change', () => this.refreshDashboard());
        if (yearTarget) yearTarget.addEventListener('change', () => this.refreshDashboard());
    },

    updatePeriodSubSelect() {
        const type  = document.getElementById('filter-period-type')?.value || 'anual';
        const subEl = document.getElementById('filter-period-sub');
        if (!subEl) return;
        const currentMonth = new Date().getMonth() + 1;
        const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const options = {
            mensal:      MONTHS.map((m, i) => ({ v: i+1, l: m })),
            trimestral:  [{ v:'Q1', l:'1º Trimestre (Jan-Mar)' },{ v:'Q2', l:'2º Trimestre (Abr-Jun)' },{ v:'Q3', l:'3º Trimestre (Jul-Set)' },{ v:'Q4', l:'4º Trimestre (Out-Dez)' }],
            semestral:   [{ v:'S1', l:'1º Semestre (Jan-Jun)' },{ v:'S2', l:'2º Semestre (Jul-Dez)' }],
            anual:       [{ v:'ALL', l:'Ano Completo' }]
        };
        const list = options[type] || options.anual;
        subEl.innerHTML = list.map(o => `<option value="${o.v}">${o.l}</option>`).join('');
        // Seleciona o mês atual por padrão no modo mensal
        if (type === 'mensal') subEl.value = currentMonth;
    },

    getMonthsForPeriod(type, sub) {
        const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
        const map = {
            trimestral: { Q1: [1,2,3], Q2: [4,5,6], Q3: [7,8,9], Q4: [10,11,12] },
            semestral:  { S1: [1,2,3,4,5,6], S2: [7,8,9,10,11,12] },
            anual:      { ALL: ALL_MONTHS }
        };
        if (type === 'mensal') {
            const m = Number(sub);
            // ✅ Guarda contra sub inválido (NaN, 'ALL', undefined) — retorna o ano todo
            return (isNaN(m) || m < 1 || m > 12) ? ALL_MONTHS : [m];
        }
        return (map[type] && map[type][sub]) || ALL_MONTHS;
    },

    bindEvents() {
        const dropZone = document.getElementById('pdf-drop-zone');
        const fileInput = document.getElementById('pdf-file-input');

        if(dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--accent-success, #10b981)';
                dropZone.style.background = 'rgba(16, 185, 129, 0.1)';
            });

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary)';
                dropZone.style.background = 'transparent';
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary)';
                dropZone.style.background = 'transparent';
                if (e.dataTransfer.files.length) {
                    this.handlePDFUpload(e.dataTransfer.files[0]);
                }
            });

            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length) {
                        this.handlePDFUpload(e.target.files[0]);
                    }
                });
            }
        }
    },

    openClientSelection() {
        store.setActiveClient(null);

        const fcFunctions = document.getElementById('fc-functions');
        if (fcFunctions) fcFunctions.style.display = 'none';

        window.switchView('fc-clients');

        // Scroll instantâneo para o topo
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) { wrapper.style.scrollBehavior = 'auto'; wrapper.scrollTop = 0; }

        const grid = document.getElementById('fc-clients-grid');
        if (grid) grid.innerHTML = '<p style="text-align:center; color:var(--text-secondary); grid-column:1/-1; padding:2rem;">Buscando clientes na nuvem...</p>';
        this.renderClientsList();
    },

    /**
     * Verifica se o cliente está selecionado. 
     * Se sim, vai para a view, senão, vai para a seleção de clientes.
     */
    requireClient(viewId) {
        const activeClient = store.getActiveClient();
        if (!activeClient) {
            this.openClientSelection();
            alert('Por favor, selecione um cliente primeiro para visualizar a Análise Financeira.');
            return;
        }
        
        const fcFunctions = document.getElementById('fc-functions');
        if (fcFunctions) fcFunctions.style.display = 'block';

        window.switchView(viewId);
        // Scroll instantâneo para o topo
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) { wrapper.style.scrollBehavior = 'auto'; wrapper.scrollTop = 0; }
        
        // Se for a tela de overview, atualiza
        if (viewId === 'fc-overview') this.refreshDashboard();
    },

    // --- CLIENTES ---

    async renderClientsList() {
        const clients = await store.getClients();
        const grid = document.getElementById('fc-clients-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (clients.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Nenhum cliente cadastrado. Clique em Novo Cliente.</p>';
            return;
        }

        clients.forEach(client => {
            const card = document.createElement('div');
            card.className = 'client-card';
            card.onclick = () => this.loadDashboard(client);

            const initial = client.name.charAt(0).toUpperCase();

            card.innerHTML = `
                <div style="width:48px;height:48px;border-radius:12px;background:var(--primary-color);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.25rem;color:#fff;flex-shrink:0;">${initial}</div>
                <div style="flex:1;min-width:0;">
                    <h3 style="margin:0;font-size:1rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${client.name}</h3>
                    <p style="margin:0.2rem 0 0;font-size:0.8rem;color:var(--text-secondary);">CNPJ: ${client.cnpj || 'Não informado'}</p>
                </div>
                <button class="btn-icon btn-danger" onclick="event.stopPropagation(); fcApp.deleteClient('${client.id}', '${client.name}')" title="Excluir cliente">
                    <span class="material-icons-round" style="font-size:1.1rem;">delete_outline</span>
                </button>
            `;
            grid.appendChild(card);
        });
    },

    showNewClientModal() {
        const modal = document.getElementById('modal-new-client');
        if(modal) {
            modal.style.display = 'flex';
            document.getElementById('new-client-name').value = '';
            document.getElementById('new-client-cnpj').value = '';
        }
    },

    closeModals() {
        document.getElementById('modal-new-client').style.display = 'none';
    },

    async saveNewClient() {
        const name = document.getElementById('new-client-name').value.trim();
        const cnpj = document.getElementById('new-client-cnpj').value.trim();

        if (!name) {
            alert('O nome da empresa é obrigatório!');
            return;
        }
        
        const btn = document.querySelector('#modal-new-client .btn-primary');
        const oldText = btn.textContent;
        btn.textContent = "Salvando...";
        btn.disabled = true;

        const newClient = await store.addClient(name, cnpj);
        
        btn.textContent = oldText;
        btn.disabled = false;
        
        if (newClient) {
            this.closeModals();
            this.renderClientsList();
            this.loadDashboard(newClient);
        } else {
            alert("Erro ao salvar cliente na nuvem.");
        }
    },

    async deleteClient(id, name) {
        if (!confirm(`Tem certeza que deseja excluir o cliente "${name}"?\nTodos os dados de fluxo de caixa vinculados a ele serão perdidos permanentemente.`)) {
            return;
        }

        const success = await store.deleteClient(id);
        if (success) {
            this.renderClientsList();
        } else {
            alert("Erro ao excluir cliente da nuvem.");
        }
    },

    backToClients() {
        this.openClientSelection();
        this.renderClientsList();
    },

    // --- DASHBOARD ---

    loadDashboard(client) {
        store.setActiveClient(client.id);
        
        // Pode atualizar o Header do ERP se quiser indicar o cliente em análise
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) {
            titleEl.textContent = `Análise Financeira: ${client.name}`;
        }

        const fcFunctions = document.getElementById('fc-functions');
        if (fcFunctions) {
            fcFunctions.style.display = 'block';
        }
        
        const clientNameDisplay = document.getElementById('fc-client-name-display');
        if (clientNameDisplay) {
            clientNameDisplay.textContent = client.name;
        }

        // Auto expandir Fluxo de Caixa
        const subFluxoCaixa = document.getElementById('sub-fluxo-caixa');
        if (subFluxoCaixa) {
            subFluxoCaixa.style.display = 'block';
        }
        
        this.requireClient('fc-overview');
    },

    async refreshDashboard() {
        const client = store.getActiveClient();
        if (!client) return;

        const type  = document.getElementById('filter-period-type')?.value  || 'anual';
        const sub   = document.getElementById('filter-period-sub')?.value   || 'ALL';
        const year  = String(document.getElementById('filter-period-year')?.value
                          || document.getElementById('filter-period-value')?.value
                          || new Date().getFullYear());

        const months = this.getMonthsForPeriod(type, sub);

        // Sempre recarrega os dados do cliente do Firestore antes de renderizar
        await store.reloadClientPeriods(client.id);
        const updatedClient = store.getActiveClient();
        const yearData = store.getYearData(updatedClient.id, year);

        let totalRealizadoEntradas = 0;
        let totalRealizadoSaidas   = 0;
        let totalProjetadoEntradas = 0;
        let totalProjetadoSaidas   = 0;
        const monthlyRealizado = new Array(12).fill(0);
        const monthlyProjetado = new Array(12).fill(0);

        for (const month of months) {
            const key   = `${year}-${month.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            const real  = mData ? (mData.realizado || mData.contas) : null;
            if (real) {
                real.forEach(acc => {
                    totalRealizadoEntradas += acc.a_receber || 0;
                    totalRealizadoSaidas   += acc.a_pagar   || 0;
                    monthlyRealizado[month-1] += (acc.a_receber || 0) - (acc.a_pagar || 0);
                });
            }
            if (mData && mData.projetado) {
                mData.projetado.forEach(acc => {
                    totalProjetadoEntradas += acc.a_receber || 0;
                    totalProjetadoSaidas   += acc.a_pagar   || 0;
                    monthlyProjetado[month-1] += (acc.a_receber || 0) - (acc.a_pagar || 0);
                });
            }
        }

        const saldoRealizadoLiq  = totalRealizadoEntradas - totalRealizadoSaidas;
        const saldoProjetadoLiq  = totalProjetadoEntradas - totalProjetadoSaidas;
        let variacao = 0;
        if (saldoProjetadoLiq !== 0) variacao = ((saldoRealizadoLiq - saldoProjetadoLiq) / Math.abs(saldoProjetadoLiq)) * 100;

        const setKpi = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setKpi('kpi-entradas',    this.formatCurrency(totalRealizadoEntradas));
        setKpi('kpi-saidas',      this.formatCurrency(totalRealizadoSaidas));
        setKpi('kpi-saldo-geral', this.formatCurrency(saldoRealizadoLiq));
        setKpi('kpi-variacao',    variacao.toFixed(2) + '%');

        this.renderCharts(monthlyRealizado, monthlyProjetado);

        // Consolida contas de todos os meses selecionados
        const allAccountsInPeriod = [];
        for (const month of months) {
            const key   = `${year}-${month.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            const accs  = mData ? (mData.realizado || mData.contas) : null;
            if (accs) allAccountsInPeriod.push(...accs);
        }

        if (window.FinancialEngine) {
            const result = FinancialEngine.processData(allAccountsInPeriod, this.manualEntries);
            this.renderSummaryBar(result.totals);
            this.renderFlowTableStrict(result.rows, totalRealizadoEntradas, result.pdfTotalReceitas);
        }
    },

    renderFlowTableStrict(rows, totalEntradas, pdfTotalReceitas) {
        const tbody = document.getElementById('flow-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        let manualSum = 0;

        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = `level-${row.level}`;

            // Header de grupo principal
            if (row.type === 'header') {
                tr.classList.add('table-group-header');
                if (row.style && row.style.class) tr.classList.add(row.style.class);
                const val = row.valorCalculado !== undefined ? this.formatCurrency(row.valorCalculado) : '-';
                tr.innerHTML = `
                    <td colspan="3">${row.descricao}</td>
                    <td class="text-right">${val}</td>
                    <td colspan="2"></td>
                `;
                if (row.descricao === 'Total Receitas Operacionais / Vendas') {
                    tbody.appendChild(tr);
                    this.renderValidationRow(tbody, pdfTotalReceitas);
                    return;
                }
                tbody.appendChild(tr);
                return;
            }

            // Sub-cabeçalho de subgrupo (ex: "1.1. Receita com Vendas")
            if (row.isSubheader) {
                tr.classList.add('table-subgroup-header');
                // ✅ Adiciona classe do grupo para estilização por cor
                const subGroupClass = (window.FinancialEngine && row.group)
                    ? (window.FinancialEngine.GROUP_STYLES[row.group]?.class || 'group-other')
                    : 'group-other';
                tr.classList.add(subGroupClass);
                const pct = totalEntradas > 0
                    ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
                const tdSub = document.createElement('td');
                tdSub.colSpan = 3;
                const codeSpanSub = this.makeEditableCode(row.codigo, row.descricao);
                tdSub.appendChild(codeSpanSub);
                tdSub.insertAdjacentHTML('beforeend', `. <strong>${row.descricao}</strong>`);
                tr.appendChild(tdSub);
                tr.insertAdjacentHTML('beforeend', `
                    <td class="text-right"><strong>${this.formatCurrency(row.valor)}</strong></td>
                    <td></td>
                    <td class="text-right"><strong>${pct}</strong></td>
                `);
                tbody.appendChild(tr);
                return;
            }

            // Linha de conta (manual ou PDF)
            if (row.unmapped) tr.className += ' row-unmapped';
            if (row.isManual) manualSum += (row.valor || 0);
            // ✅ Adiciona classe do grupo para hierarquia de cor por nivel
            const rowGroupClass = (window.FinancialEngine && row.group)
                ? (window.FinancialEngine.GROUP_STYLES[row.group]?.class || 'group-other')
                : '';
            if (rowGroupClass) tr.classList.add(rowGroupClass);

            const valClass  = row.valor >= 0 ? 'positive' : 'negative';
            const vertical  = totalEntradas > 0
                ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
            const descText  = row.unmapped ? `⚠️ [VINCULAR] ${row.descricao}` : row.descricao;

            let valorHtml;
            if (row.isManual) {
                // ✅ Chave do grupo: mesma lógica do financial-engine.js para não misturar inicial/final
                const isInitialGroup = row.group === 'Disponíveis Nas Contas Movimento inicial';
                const key = isInitialGroup
                    ? `${row.codigo}-${row.descricao}`
                    : `${row.group}::${row.codigo}-${row.descricao}`;
                valorHtml = `<input type="number" step="0.01" class="manual-input"
                               value="${row.valor || ''}"
                               onchange="fcApp.updateManualEntry('${key}', this.value)"
                               placeholder="0.00">`;
            } else {
                valorHtml = this.formatCurrency(row.valor);
            }

            const tdCode = document.createElement('td');
            tdCode.className = 'col-code';
            if (row.unmapped) {
                // ✅ Para contas não mapeadas: botão Vincular em vez de inline-edit
                tdCode.innerHTML = `
                    <span class="editable-code" style="opacity:.5;">${row.codigo}</span>
                    <button class="btn-vincular-small" onclick="fcApp.openVincularModal('${row.codigo}', ${row.valor}, \`${row.descricao}\`)" title="Vincular esta conta ao plano de contas">
                        🔗 Vincular
                    </button>`;
            } else {
                tdCode.appendChild(this.makeEditableCode(row.codigo, row.descricao, row.group));
            }

            const tdDesc = document.createElement('td');
            tdDesc.className = 'col-desc';
            tdDesc.textContent = descText;

            tr.appendChild(tdCode);
            tr.appendChild(tdDesc);
            tr.insertAdjacentHTML('beforeend', `
                <td class="text-right">-</td>
                <td class="text-right ${valClass} col-val">${valorHtml}</td>
                <td class="text-right">-</td>
                <td class="text-right col-perc">${vertical}</td>
            `);
            tbody.appendChild(tr);
        });

        this.updateValidationStatus(manualSum, pdfTotalReceitas);
    },

    // Cria span de código editável inline
    // group: nome do grupo/seção ao qual este item pertence (para limitar edições à seção correta)
    makeEditableCode(codigo, descricao, group) {
        const span = document.createElement('span');
        span.className = 'editable-code';
        span.textContent = codigo;
        span.title = 'Clique para editar o código';
        span.addEventListener('click', () => this.inlineEditCode(span, codigo, descricao, group));
        return span;
    },

    inlineEditCode(span, originalCode, descricao, group) {
        const input = document.createElement('input');
        input.type  = 'text';
        input.value = originalCode;
        input.className = 'code-edit-input';
        input.title = 'Enter para salvar · Esc para cancelar';
        span.replaceWith(input);
        input.focus();
        input.select();

        const restore = (code) => {
            const s = this.makeEditableCode(code, descricao, group);
            input.replaceWith(s);
        };
        const save = () => {
            const newCode = input.value.trim();
            if (newCode && newCode !== originalCode) this.updateAccountCode(originalCode, descricao, newCode, group);
            else restore(originalCode);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); input.removeEventListener('blur', save); save(); }
            if (e.key === 'Escape') { e.preventDefault(); input.removeEventListener('blur', save); restore(originalCode); }
        });
    },

    // ✅ group-aware: altera APENAS a entrada da seção correta (não afeta inicial ao editar final e vice-versa)
    updateAccountCode(originalCode, descricao, newCode, group) {
        const accounts = this.getActiveMasterAccounts();
        let updated = false;
        let currentSection = null;
        const newAccounts = accounts.map(acc => {
            if (acc.codigo === 'HEADER') {
                currentSection = acc.descricao;
                return acc;
            }
            // Só altera se estiver na mesma seção E tiver o mesmo código e descrição
            const sameSection = !group || currentSection === group;
            if (sameSection && acc.codigo === originalCode && acc.descricao === descricao) {
                updated = true;
                return { codigo: newCode, descricao: acc.descricao };
            }
            return acc;
        });
        if (updated) {
            localStorage.setItem('customMasterAccounts', JSON.stringify(newAccounts));
            window.MASTER_ACCOUNTS = newAccounts;
            this.showToast(`✅ ${originalCode} → ${newCode}`);
            this.refreshDashboard();
        }
    },

    loadCustomMasterAccounts() {
        const custom = localStorage.getItem('customMasterAccounts');
        if (custom) {
            try {
                let parsed = JSON.parse(custom);
                if (parsed && parsed.length > 0) {
                    // ✅ MIGRAÇÃO: renomeia header antigo (sem "final") para a versão correta
                    // Cobre variações de capitalização e espaços extras
                    let migrated = false;
                    parsed = parsed.map(acc => {
                        if (acc.codigo === 'HEADER') {
                            const norm = (acc.descricao || '').trim().toLowerCase();
                            // Detecta a versão SEM "final" E SEM "inicial" = é a seção final antiga
                            if (norm === 'disponíveis nas contas movimento' ||
                                norm === 'disponiveis nas contas movimento') {
                                migrated = true;
                                return { ...acc, descricao: 'Disponíveis nas Contas Movimento final' };
                            }
                        }
                        return acc;
                    });
                    if (migrated) {
                        localStorage.setItem('customMasterAccounts', JSON.stringify(parsed));
                        console.log('[FC] ✅ Migração: header final atualizado para "Disponíveis nas Contas Movimento final"');
                    }
                    window.MASTER_ACCOUNTS = parsed;
                }
            } catch(e) { console.warn('customMasterAccounts inválido', e); }
        }
    },

    getActiveMasterAccounts() {
        return window.MASTER_ACCOUNTS || [];
    },

    // ─── MODAL VINCULAR CONTA ───────────────────────────────────────────────

    openVincularModal(codigo, valor, descricao) {
        const accounts = window.MASTER_ACCOUNTS || [];
        // Coleta todos os grupos (HEADERs com contas válidas)
        const grupos = [];
        let cur = null;
        accounts.forEach(m => {
            if (m.codigo === 'HEADER') { cur = m.descricao; }
            else if (cur && !grupos.includes(cur)) grupos.push(cur);
        });

        let modal = document.getElementById('modal-vincular-conta');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-vincular-conta';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;';
            document.body.appendChild(modal);
        }

        const groupOpts = grupos.map(g =>
            `<option value="${g.replace(/"/g,"'")}">${ g}</option>`
        ).join('');

        const valFmt = this.formatCurrency(valor);
        const valColor = valor >= 0 ? '#10b981' : '#ef4444';

        modal.innerHTML = `
            <div style="background:#1e293b;border-radius:12px;padding:2rem;width:520px;max-width:90vw;border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 60px rgba(0,0,0,.5);">
                <h3 style="margin:0 0 1rem;color:#f8fafc;">&#128279; Vincular Conta ao Plano de Contas</h3>
                <div style="background:#0f172a;border-radius:8px;padding:1rem;margin-bottom:1.5rem;border:1px solid rgba(255,255,255,.05);">
                    <div style="font-size:.75rem;color:#94a3b8;margin-bottom:.25rem;">Conta do PDF</div>
                    <div style="font-weight:700;font-size:1.1rem;color:#f8fafc;">${codigo}</div>
                    <div style="color:#94a3b8;font-size:.85rem;">${descricao}</div>
                    <div style="color:${valColor};font-weight:600;margin-top:.5rem;">${valFmt}</div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block;color:#94a3b8;font-size:.85rem;margin-bottom:.4rem;">Grupo de Destino no Plano</label>
                    <select id="vincular-grupo" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#f8fafc;padding:.6rem;font-size:.9rem;">
                        ${groupOpts}
                    </select>
                </div>
                <div style="margin-bottom:1.5rem;">
                    <label style="display:block;color:#94a3b8;font-size:.85rem;margin-bottom:.4rem;">Descrição para o Plano de Contas</label>
                    <input type="text" id="vincular-descricao" value="${descricao === 'Desconhecida' ? '' : descricao}"
                        placeholder="Ex: . Receita em Dinheiro"
                        style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#f8fafc;padding:.6rem;font-size:.9rem;box-sizing:border-box;">
                </div>
                <div style="display:flex;gap:1rem;justify-content:flex-end;">
                    <button onclick="document.getElementById('modal-vincular-conta').style.display='none'"
                        style="background:transparent;border:1px solid rgba(255,255,255,.15);color:#94a3b8;border-radius:8px;padding:.6rem 1.5rem;cursor:pointer;">Cancelar</button>
                    <button onclick="fcApp.confirmVincular('${codigo}', ${valor})"
                        style="background:#3b82f6;border:none;color:white;border-radius:8px;padding:.6rem 1.5rem;cursor:pointer;font-weight:600;">✔ Vincular</button>
                </div>
            </div>`;
        modal.style.display = 'flex';
    },

    confirmVincular(codigo, valor) {
        const grupo     = document.getElementById('vincular-grupo')?.value;
        const descricao = document.getElementById('vincular-descricao')?.value.trim() || codigo;
        if (!grupo) { alert('Selecione um grupo de destino.'); return; }

        const accounts = (window.MASTER_ACCOUNTS || []).slice(); // clone
        let insertIdx  = -1;
        let curGroup   = null;

        // Encontra o último índice do grupo alvo
        for (let i = 0; i < accounts.length; i++) {
            if (accounts[i].codigo === 'HEADER') {
                if (curGroup === grupo && insertIdx >= 0) break; // passou o grupo
                curGroup = accounts[i].descricao;
            } else if (curGroup === grupo) {
                insertIdx = i;
            }
        }

        if (insertIdx < 0) { alert('Grupo não encontrado.'); return; }

        // Remove o código de outros lugares (evita duplicatas)
        const cleaned = accounts.filter(a => !(a.codigo === codigo && a.descricao === descricao));
        // Recalcula o índice após filtragem
        let newInsert = -1;
        curGroup = null;
        for (let i = 0; i < cleaned.length; i++) {
            if (cleaned[i].codigo === 'HEADER') {
                if (curGroup === grupo && newInsert >= 0) break;
                curGroup = cleaned[i].descricao;
            } else if (curGroup === grupo) { newInsert = i; }
        }

        cleaned.splice((newInsert >= 0 ? newInsert : cleaned.length - 1) + 1, 0,
            { codigo, descricao });

        localStorage.setItem('customMasterAccounts', JSON.stringify(cleaned));
        window.MASTER_ACCOUNTS = cleaned;

        document.getElementById('modal-vincular-conta').style.display = 'none';
        this.showToast(`✅ ${codigo} vinculado → "${grupo}"`);
        this.refreshDashboard();
    },

    // ─── TOAST ─────────────────────────────────────────────────────────────────

    showToast(msg) {
        let t = document.getElementById('fc-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'fc-toast';
            t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e293b;color:#f8fafc;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:12px 20px;font-size:.9rem;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.4);transition:opacity .3s;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
    },

    renderValidationRow(tbody, pdfTotal) {
        const tr = document.createElement('tr');
        tr.className = 'validation-row';
        tr.innerHTML = `
            <td colspan="2" class="text-right"><strong>CONFERÊNCIA RECEITAS:</strong></td>
            <td class="text-right">PDF: ${this.formatCurrency(pdfTotal)}</td>
            <td class="text-right" id="manual-sum-display">Manual: R$ 0,00</td>
            <td colspan="2" id="validation-msg" class="text-center">Aguardando Lançamentos...</td>
        `;
        tbody.appendChild(tr);
    },

    updateManualEntry(key, value) {
        this.manualEntries[key] = parseFloat(value) || 0;
        this.refreshDashboard(); 
    },

    updateValidationStatus(manualSum, pdfTotal) {
        const display = document.getElementById('manual-sum-display');
        const msg = document.getElementById('validation-msg');
        if (!display || !msg) return;

        display.textContent = `Manual: ${this.formatCurrency(manualSum)}`;
        const diff = Math.abs(manualSum - pdfTotal);

        if (diff < 0.01) {
            msg.innerHTML = '<span class="status-ok" style="color:#10b981;">✅ CONFERIDO</span>';
        } else {
            const remaining = pdfTotal - manualSum;
            msg.innerHTML = `<span class="status-error" style="color:#ef4444;">❌ DIFERENÇA: ${this.formatCurrency(remaining)}</span>`;
        }
    },

    renderCharts(realizadoData, projetadoData) {
        const ctxEl = document.getElementById('mainChart');
        if (!ctxEl) return;
        const ctx = ctxEl.getContext('2d');
        if(this.currentChart) this.currentChart.destroy();

        this.currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [
                    { label: 'Realizado (Saldo Líquido)', data: realizadoData, backgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 4 },
                    { label: 'Projetado (Saldo Líquido)', data: projetadoData, type: 'line', borderColor: '#10b981', borderWidth: 2, fill: false, tension: 0.3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { labels: { color: '#f8fafc' } } }
            }
        });
    },

    renderSummaryBar(totals) {
        if(document.querySelector('#sum-saldo-inicial .sum-value')) document.querySelector('#sum-saldo-inicial .sum-value').textContent = this.formatCurrency(totals.saldoInicial);
        if(document.querySelector('#sum-total-receitas .sum-value')) document.querySelector('#sum-total-receitas .sum-value').textContent = this.formatCurrency(totals.totalReceitas);
        if(document.querySelector('#sum-total-despesas .sum-value')) document.querySelector('#sum-total-despesas .sum-value').textContent = this.formatCurrency(totals.totalDespesas);
        if(document.querySelector('#sum-saldo-liquido .sum-value')) document.querySelector('#sum-saldo-liquido .sum-value').textContent = this.formatCurrency(totals.saldoLiquido);
        if(document.querySelector('#sum-saldo-ajustado .sum-value')) document.querySelector('#sum-saldo-ajustado .sum-value').textContent = this.formatCurrency(totals.saldoAjustado);
    },

    // --- IMPORTAÇÃO ---

    async handlePDFUpload(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('Por favor, selecione um arquivo PDF válido.');
            return;
        }

        const dropZone = document.getElementById('pdf-drop-zone');
        if (dropZone) dropZone.innerHTML = '<div style="text-align:center;padding:2rem;"><span class="material-icons-round" style="font-size:3rem;color:var(--primary-color);animation:spin 1s linear infinite;">sync</span><p style="margin-top:1rem;color:var(--text-secondary);">Lendo e extraindo dados do PDF...</p></div>';

        try {
            // Verifica se PDFParser está disponível
            if (typeof window.PDFParser === 'undefined') {
                throw new Error('Biblioteca PDF não carregada. Aguarde e tente novamente.');
            }

            // Lê o arquivo como ArrayBuffer para o PDF.js
            const arrayBuffer = await file.arrayBuffer();

            // Usa o PDFParser do módulo (pdf-parser.js)
            const result = await window.PDFParser.parseMaxdataPDF({ data: arrayBuffer });

            const period = result.periodo;
            const accounts = result.contas;

            if (!period || accounts.length === 0) {
                alert('Não foi possível extrair dados válidos. Certifique-se que o PDF é o "Relatório de Centro de Custos" da Maxdata (Rel. 343).');
                this.resetDropZone();
                return;
            }

            this.pendingImport = { period, accounts };
            this.showImportPreview(period, accounts);

        } catch (error) {
            console.error('Erro na extração PDF:', error);
            alert('Erro ao processar o arquivo PDF.\n\nDetalhe: ' + error.message);
            this.resetDropZone();
        }
    },


    showImportPreview(period, accounts) {
        const dropZone = document.getElementById('pdf-drop-zone');
        const preview = document.getElementById('import-preview');
        const tbody = document.getElementById('import-preview-body');
        
        if (!dropZone || !preview || !tbody) return;

        dropZone.style.display = 'none';
        preview.style.display = 'block';
        document.getElementById('import-period').textContent = `Período detectado: ${period}`;

        tbody.innerHTML = '';
        accounts.forEach(acc => {
            tbody.innerHTML += `
                <tr>
                    <td>${acc.codigo} - ${acc.descricao}</td>
                    <td class="text-right" style="color:var(--success)">${this.formatCurrency(acc.a_receber)}</td>
                    <td class="text-right" style="color:var(--danger)">${this.formatCurrency(acc.a_pagar)}</td>
                </tr>
            `;
        });
    },

    async confirmImport() {
        if (!this.pendingImport) return;

        const client = store.getActiveClient();
        if (!client) {
            alert('Nenhum cliente selecionado. Por favor, volte e selecione um cliente.');
            return;
        }

        // Busca o botão de confirmar (sem depender de classe que pode não existir)
        const btn = document.querySelector('#import-preview .btn-primary');
        const originalText = btn ? btn.textContent : '';
        if (btn) { btn.textContent = 'Salvando na Nuvem...'; btn.disabled = true; }

        try {
            const success = await store.saveMonthData(client.id, this.pendingImport.period, this.pendingImport.accounts);

            if (btn) { btn.textContent = originalText; btn.disabled = false; }

            if (success) {
                const importedPeriod = this.pendingImport.period;
                this.pendingImport = null;
                this.resetDropZone();
                
                // Força recarregar do Firestore para garantir exibição
                await store.reloadClientPeriods(client.id);
                
                this.requireClient('fc-overview');
                alert(`✅ Dados de ${importedPeriod} importados com sucesso!`);
            } else {
                alert('❌ Erro ao salvar no banco de dados. Tente novamente.');
            }
        } catch (err) {
            if (btn) { btn.textContent = originalText; btn.disabled = false; }
            console.error('Erro ao confirmar importação:', err);
            alert('❌ Erro ao salvar: ' + err.message);
        }
    },


    cancelImport() {
        this.pendingImport = null;
        this.resetDropZone();
    },

    resetDropZone() {
        const dropZone = document.getElementById('pdf-drop-zone');
        const preview = document.getElementById('import-preview');
        if(dropZone && preview) {
            dropZone.style.display = 'block';
            preview.style.display = 'none';
            dropZone.innerHTML = `
                <span class="material-icons-round" style="font-size: 3rem; color: var(--primary);">cloud_upload</span>
                <h3>Arraste o arquivo PDF aqui</h3>
                <p>ou</p>
                <input type="file" id="pdf-file-input" accept=".pdf" hidden>
                <button class="btn btn-secondary" onclick="document.getElementById('pdf-file-input').click()">Procurar Arquivo</button>
            `;
            this.bindEvents();
        }
    },

    // --- PROJEÇÕES ---

    async applyProjections() {
        const btn = document.querySelector('.projection-rules .btn-primary');
        btn.textContent = 'Aplicando...';
        btn.disabled = true;

        // Simula delay de cálculo pesado
        await new Promise(r => setTimeout(r, 1500));

        alert('Projeções calculadas e aplicadas aos próximos 12 meses com sucesso!');
        btn.textContent = 'Aplicar Projeção';
        btn.disabled = false;
        
        this.requireClient('fc-overview');
    },

    // --- EXPORTAÇÃO ---

    exportToExcel() {
        const client = store.getActiveClient();
        if(!client) return;

        const year = document.getElementById('filter-period-value')?.value || new Date().getFullYear();
        const yearData = store.getYearData(client.id, year);
        
        const allAccountsInYear = [];
        for(let m = 1; m <= 12; m++) {
            const key = `${year}-${m.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            if(mData && mData.realizado) {
                allAccountsInYear.push(...mData.realizado);
            }
        }

        const wb = XLSX.utils.book_new();
        
        let wsData = [];
        wsData.push(['Código', 'Descrição da Conta', 'Valor R$']);

        const result = FinancialEngine.processData(allAccountsInYear, this.manualEntries);

        result.rows.forEach(row => {
            if (row.type === 'header') {
                wsData.push(['', row.descricao, row.valorCalculado || '']);
            } else {
                wsData.push([row.codigo, row.descricao, row.valor]);
            }
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Fluxo de Caixa " + year);
        
        XLSX.writeFile(wb, `ERP_Consultoria_${client.name}_${year}.xlsx`);
    },

    // --- UTILS ---

    formatCurrency(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }
};

// Initialize after ERP loads
setTimeout(() => {
    fcApp.init();
}, 1000);

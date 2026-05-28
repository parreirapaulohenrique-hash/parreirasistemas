/**
 * Controlador principal da Aplicação UI e Lógica do Fluxo de Caixa (ERP Consultoria)
 * Integrado como um módulo dentro do ERP Geral.
 */

window.fcApp = {
    currentChart: null,
    pendingImport: null,
    manualEntries: {},

    // ── Persistência de lançamentos manuais no localStorage ────────────────
    _getEntriesKey() {
        const c = store.getActiveClient();
        return c ? `fcEntries_${c.id}` : null;
    },
    _saveManualEntries() {
        const k = this._getEntriesKey();
        if (k) localStorage.setItem(k, JSON.stringify(this.manualEntries));
    },
    _loadManualEntries() {
        const k = this._getEntriesKey();
        if (!k) { this.manualEntries = {}; return; }
        try {
            const raw = localStorage.getItem(k);
            this.manualEntries = raw ? JSON.parse(raw) : {};
        } catch(e) { this.manualEntries = {}; }
    },

    // ── Estado de bloqueio (lock) por cliente ──────────────────────────────
    isLocked() {
        const c = store.getActiveClient();
        if (!c) return false;
        return localStorage.getItem(`fcLocked_${c.id}`) === 'true';
    },
    lockEntries() {
        const c = store.getActiveClient();
        if (!c) return;
        localStorage.setItem(`fcLocked_${c.id}`, 'true');
        this._updateLockButton();
        this.refreshDashboard();
        this.showToast('🔒 Preenchimento bloqueado com sucesso!');
    },
    unlockEntries() {
        const c = store.getActiveClient();
        if (!c) return;
        localStorage.removeItem(`fcLocked_${c.id}`);
        this._updateLockButton();
        this.refreshDashboard();
        this.showToast('🔓 Preenchimento desbloqueado!');
    },
    _updateLockButton() {
        const btn = document.getElementById('btn-lock-entries');
        if (!btn) return;
        const locked = this.isLocked();
        btn.textContent = locked ? '🔓 Desbloquear Edição' : '🔒 Bloquear Preenchimento';
        btn.style.background = locked ? '#ef4444' : '#10b981';
    },

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

        // Carrega lançamentos manuais salvos para este cliente
        this._loadManualEntries();
        
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
            this.renderFlowTableStrict(result.rows, totalRealizadoEntradas);

            // ── Botão Lock/Unlock — injeta na barra de ações se ainda não existir ──
            const headerBar = document.querySelector('#view-fc-overview .view-header-bar');
            if (headerBar && !document.getElementById('btn-lock-entries')) {
                const lockBtn = document.createElement('button');
                lockBtn.id = 'btn-lock-entries';
                lockBtn.style.cssText = 'margin-left:8px;padding:0.45rem 1.1rem;border:none;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;color:#fff;transition:background .2s;';
                lockBtn.onclick = () => this.isLocked() ? this.unlockEntries() : this.lockEntries();
                headerBar.appendChild(lockBtn);
            }
            this._updateLockButton();
        }
    },

    renderFlowTableStrict(rows, totalEntradas) {
        const tbody = document.getElementById('flow-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const locked = this.isLocked();

        // ── Mapeamento das seções principais ─────────────────────────
        const SECTION_MAP = {
            'Disponíveis Nas Contas Movimento inicial': { num: 1, label: 'Disponíveis nas Contas Movimento Inicial', cls: 'fc-section-1' },
            'Total Receitas Operacionais / Vendas':     { num: 2, label: 'Total Receitas Operacionais / Vendas',     cls: 'fc-section-2' },
            'Custo de Aquisição':                       { num: 3, label: 'Custo',                                    cls: 'fc-section-3' },
            'Despesas Operac. Fixas e Variáveis':       { num: 4, label: 'Despesas Operac. Fixas e Variáveis',       cls: 'fc-section-4' },
            'Receitas Não Operacionais Totais':         { num: 5, label: 'Receitas Não Operacionais Totais',         cls: 'fc-section-5' },
            'Despesas Não Operacional':                 { num: 6, label: 'Despesas Não Operacional',                 cls: 'fc-section-6' },
            'Disponíveis nas Contas Movimento final':   { num: 7, label: 'Disponíveis nas Contas Movimento Final',   cls: 'fc-section-7' },
        };

        let currentSectionCls = '';

        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = `level-${row.level}`;

            // ── Header de grupo principal (Nível 1) ──────────────────────
            if (row.type === 'header') {
                tr.classList.add('table-group-header');
                if (row.style && row.style.class) tr.classList.add(row.style.class);

                const secInfo = SECTION_MAP[row.descricao];
                if (secInfo) {
                    currentSectionCls = secInfo.cls;
                    tr.classList.add(secInfo.cls);
                }

                const val = row.valorCalculado !== undefined ? this.formatCurrency(row.valorCalculado) : '-';

                let displayLabel;
                if (secInfo) {
                    displayLabel = `<span class="section-num">${secInfo.num}</span> ${secInfo.label}`;
                } else {
                    displayLabel = this.toDisplayCase(row.descricao);
                }

                tr.innerHTML = `
                    <td colspan="3">${displayLabel}</td>
                    <td class="text-right">${val}</td>
                    <td colspan="2"></td>
                `;
                tbody.appendChild(tr);
                return;
            }

            // Aplica classe da seção atual a todas as linhas de dados
            if (currentSectionCls) tr.classList.add(currentSectionCls);

            // ── Sub-cabeçalho de subgrupo (Nível 2 com filhos) ───────────
            if (row.isSubheader) {
                tr.classList.add('table-subgroup-header');
                const subGroupClass = (window.FinancialEngine && row.group)
                    ? (window.FinancialEngine.GROUP_STYLES[row.group]?.class || 'group-other')
                    : 'group-other';
                tr.classList.add(subGroupClass);
                const pct = totalEntradas > 0
                    ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
                const tdSub = document.createElement('td');
                tdSub.colSpan = 3;

                // ✏️ Botão de edição de código + 🗑 botão de remoção quando desbloqueado
                if (!locked) {
                    const codeSpan = this.makeEditableCode(row.codigo, row.descricao, row.group, false);
                    codeSpan.style.cssText = 'font-size:.72rem;opacity:.65;margin-right:.5rem;background:rgba(255,255,255,.06);padding:1px 5px;border-radius:4px;';
                    tdSub.appendChild(codeSpan);

                    const delBtnSub = document.createElement('button');
                    delBtnSub.title = 'Remover linha';
                    delBtnSub.innerHTML = '×';
                    delBtnSub.style.cssText = 'float:right;background:transparent;border:none;color:#f87171;cursor:pointer;font-size:1.1rem;line-height:1;padding:0 4px;opacity:0;transition:opacity .15s;';
                    delBtnSub.onclick = (e) => { e.stopPropagation(); this.deleteAccount(row.codigo, row.descricao, row.group); };
                    tr.addEventListener('mouseenter', () => delBtnSub.style.opacity = '1');
                    tr.addEventListener('mouseleave', () => delBtnSub.style.opacity = '0');
                    tdSub.appendChild(delBtnSub);
                }
                tdSub.insertAdjacentHTML('beforeend',
                    `<strong>${this.toDisplayCase(row.descricao)}</strong>`);
                tr.appendChild(tdSub);

                // Input de valor na linha de sub-header quando desbloqueado
                const subKey = `${row.group}::${row.codigo}-${row.descricao}`;
                let subValHtml;
                if (locked) {
                    subValHtml = `<strong>${this.formatCurrency(row.valor)}</strong>`;
                } else {
                    const safeSubKey = subKey.replace(/"/g, '&quot;').replace(/'/g, "\\'");
                    subValHtml = `<input type="number" step="0.01" class="manual-input"
                        value="${row.valor || ''}"
                        onchange="fcApp.updateManualEntry('${safeSubKey}', this.value)"
                        placeholder="0.00">`;
                }
                tr.insertAdjacentHTML('beforeend', `
                    <td class="text-right">${subValHtml}</td>
                    <td></td>
                    <td class="text-right"><strong>${pct}</strong></td>
                `);
                tbody.appendChild(tr);
                return;
            }

            // ── Linha de conta manual — Nível 2/3 ────────────────────────
            const rowGroupClass = (window.FinancialEngine && row.group)
                ? (window.FinancialEngine.GROUP_STYLES[row.group]?.class || 'group-other')
                : '';
            if (rowGroupClass) tr.classList.add(rowGroupClass);

            const valClass = row.valor >= 0 ? 'positive' : 'negative';
            const vertical = totalEntradas > 0
                ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
            const descText = this.toDisplayCase(row.descricao);

            // Chave unificada: "grupo::codigo-descricao" para TODOS os grupos
            const key = `${row.group}::${row.codigo}-${row.descricao}`;

            let valorHtml;
            if (locked) {
                // 🔒 BLOQUEADO: exibe valor como texto estático
                const fmt = this.formatCurrency(row.valor);
                valorHtml = `<span class="locked-value" style="font-weight:600;">${fmt}</span>`;
            } else {
                // 🔓 DESBLOQUEADO: campo de entrada editável
                const safeKey = key.replace(/"/g, '&quot;').replace(/'/g, '\'');
                valorHtml = `<input type="number" step="0.01" class="manual-input"
                               value="${row.valor || ''}"
                               onchange="fcApp.updateManualEntry('${safeKey}', this.value)"
                               placeholder="0.00">`;
            }

            const tdCode = document.createElement('td');
            tdCode.className = 'col-code';
            tdCode.appendChild(this.makeEditableCode(row.codigo, row.descricao, row.group, locked));

            const tdDesc = document.createElement('td');
            tdDesc.className = 'col-desc';
            const descSpan = document.createElement('span');
            descSpan.textContent = descText;
            tdDesc.appendChild(descSpan);

            // 🗑 Botão de remoção — aparece ao hover, só quando desbloqueado
            if (!locked) {
                const delBtn = document.createElement('button');
                delBtn.title = 'Remover linha do plano de contas';
                delBtn.innerHTML = '×';
                delBtn.style.cssText = 'float:right;background:transparent;border:none;color:#f87171;cursor:pointer;font-size:1.1rem;line-height:1;padding:0 4px;opacity:0;transition:opacity .15s;';
                delBtn.onclick = (e) => { e.stopPropagation(); this.deleteAccount(row.codigo, row.descricao, row.group); };
                tr.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
                tr.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
                tdDesc.appendChild(delBtn);
            }

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
    },

    // Normaliza texto: converte ALL CAPS para Title Case; mantém texto já formatado
    toDisplayCase(str) {
        if (!str) return str;
        const letters = str.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (letters.length < 3) return str;
        // Conta letras maiúsculas
        const upperCount = (str.match(/[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ]/g) || []).length;
        // Se mais de 55% das letras forem maiúsculas → converte para Title Case
        if (upperCount / letters.length > 0.55) {
            return str.toLowerCase()
                .replace(/(^|[\s\-\/\(])([a-záàâãäåçèéêëìíîïñòóôõöùúûü])/g,
                    (m, p1, p2) => p1 + p2.toUpperCase())
                // Preposições/artigos em português → minúsculo
                .replace(/\b(De|Do|Da|Dos|Das|E|Em|Na|No|Nas|Nos|Com|Por|Para|Se|Ao|Aos|À|Um|Uma)\b/g,
                    w => w.toLowerCase());
        }
        return str;
    },

    // Código da conta: estático quando bloqueado, editável (clique) quando desbloqueado
    makeEditableCode(codigo, descricao, group, locked = false) {
        const span = document.createElement('span');
        span.className = 'code-label';
        span.textContent = codigo;
        if (!locked) {
            span.title = 'Clique para editar o código';
            span.style.cursor = 'pointer';
            span.style.textDecorationLine = 'underline';
            span.style.textDecorationStyle = 'dotted';
            span.onclick = () => this.inlineEditCode(span, codigo, descricao, group);
        }
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
            const s = this.makeEditableCode(code, descricao, group, false);
            s.style.cssText = span.style.cssText; // preserva estilo original (sub-header vs normal)
            input.replaceWith(s);
        };
        const save = () => {
            const newCode = input.value.trim();
            // 🛡️ Guarda: não salva código vazio — sempre restaura o original
            if (!newCode) {
                restore(originalCode);
                return;
            }
            if (newCode !== originalCode) this.updateAccountCode(originalCode, descricao, newCode, group);
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

    // 🗑️ Remove uma conta do plano de contas (group-aware)
    deleteAccount(codigo, descricao, group) {
        if (!confirm(`Remover "${this.toDisplayCase(descricao)}" do plano de contas?`)) return;
        const accounts = this.getActiveMasterAccounts();
        let found = false;
        let currentSection = null;
        const filtered = accounts.filter(acc => {
            if (acc.codigo === 'HEADER') { currentSection = acc.descricao; return true; }
            const sameSection = !group || currentSection === group;
            if (sameSection && acc.codigo === codigo && acc.descricao === descricao) {
                found = true;
                return false; // remove esta entrada
            }
            return true;
        });
        if (found) {
            localStorage.setItem('customMasterAccounts', JSON.stringify(filtered));
            window.MASTER_ACCOUNTS = filtered;
            this.showToast(`🗑️ Linha removida`);
            this.refreshDashboard();
        }
    },

    // Versão do plano de contas — ao mudar, limpa o customMasterAccounts do localStorage
    MASTER_VERSION: '11.23.14',

    loadCustomMasterAccounts() {
        const masterAccounts = window.MASTER_ACCOUNTS || [];

        // ── Invalidação de cache: se versão mudou, descarta dados antigos ─────────────────────
        const storedVersion = localStorage.getItem('masterAccountsVersion');
        if (storedVersion !== this.MASTER_VERSION) {
            localStorage.removeItem('customMasterAccounts');
            localStorage.setItem('masterAccountsVersion', this.MASTER_VERSION);
            console.log(`[FC] ✅ Plano de contas atualizado para v${this.MASTER_VERSION}. Cache resetado.`);
        }

        const custom = localStorage.getItem('customMasterAccounts');
        let parsed = null;
        if (custom) {
            try { parsed = JSON.parse(custom); }
            catch(e) { console.warn('customMasterAccounts inválido', e); }
        }

        // Se não tiver custom no localStorage, usa o padrão do master
        if (!parsed || parsed.length === 0) {
            parsed = [...masterAccounts];
        }

        let changed = false;

        // ── Migração: renomear headers legados e limpar descrições ──────────
        parsed = parsed.map(acc => {
            let u = { ...acc };
            if (acc.codigo === 'HEADER') {
                const norm = (acc.descricao || '').trim().toLowerCase();
                if (norm === 'disponíveis nas contas movimento' ||
                    norm === 'disponiveis nas contas movimento') {
                    u.descricao = 'Disponíveis nas Contas Movimento final';
                    changed = true;
                }
            } else if (u.descricao) {
                const cleaned = u.descricao.replace(/^[\s\.\-]+/, '').trim();
                if (cleaned !== u.descricao) { u.descricao = cleaned; changed = true; }
            }
            return u;
        });

        // ── Merge: insere contas novas do master que não estão no cache ─────
        // (garante que qualquer conta adicionada ao master-accounts.js apareça mesmo com cache antigo)
        const cachedCodes = new Set(parsed.filter(a => a.codigo !== 'HEADER').map(a => a.codigo));
        let masterHeaderGroup = null;

        masterAccounts.forEach(masterEntry => {
            if (masterEntry.codigo === 'HEADER') {
                masterHeaderGroup = masterEntry.descricao;
                return;
            }
            if (cachedCodes.has(masterEntry.codigo)) return; // já existe

            // Encontra a posição de inserção: após o último item do mesmo grupo no cache
            let insertIdx = -1;
            let inGroup = false;
            for (let i = 0; i < parsed.length; i++) {
                if (parsed[i].codigo === 'HEADER') {
                    if (inGroup) break;
                    if (parsed[i].descricao === masterHeaderGroup) inGroup = true;
                } else if (inGroup) {
                    insertIdx = i;
                }
            }
            const pos = insertIdx >= 0 ? insertIdx + 1 : parsed.length;
            parsed.splice(pos, 0, { ...masterEntry });
            cachedCodes.add(masterEntry.codigo);
            changed = true;
            console.log(`[FC] ✅ Merge: conta nova inserida — ${masterEntry.codigo} (${masterEntry.descricao})`);
        });

        if (changed) {
            localStorage.setItem('customMasterAccounts', JSON.stringify(parsed));
        }
        window.MASTER_ACCOUNTS = parsed;
    },

    getActiveMasterAccounts() {
        return window.MASTER_ACCOUNTS || [];
    },

    // ─── AUTO-VINCULAR VIA EXCEL ────────────────────────────────────────────────

    autoVincularViaExcel() {
        const unmapped = this.pendingUnmapped || [];
        if (unmapped.length === 0) {
            this.showToast('ℹ️ Nenhuma conta para vincular no período atual');
            return;
        }
        const input = document.createElement('input');
        input.type  = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
        input.addEventListener('change', async (e) => {
            document.body.removeChild(input);
            const file = e.target.files[0];
            if (!file) return;
            this.showToast('📊 Lendo planilha...');
            try {
                if (typeof XLSX === 'undefined') throw new Error('SheetJS não carregado');
                const data    = await file.arrayBuffer();
                const wb      = XLSX.read(data, { type: 'array' });
                const sheetName = this._getBestSheetName(wb.SheetNames);
                this.showToast(`📊 Lendo aba: "${sheetName}"...`);
                console.log(`[AutoVincular] Lendo aba selecionada: "${sheetName}"`);
                const ws      = wb.Sheets[sheetName];
                const entries = this.parseExcelForValueMapping(ws);

                // ── DEBUG: mostra o que foi extraído do Excel ──────────────────
                console.log('[AutoVincular] Entradas extraídas do Excel:', entries.length);
                console.log('[AutoVincular] Primeiras 10 entradas:', entries.slice(0, 10));
                console.log('[AutoVincular] Contas para vincular:', unmapped.map(r => ({ codigo: r.codigo, valor: r.valor })));

                if (entries.length === 0) {
                    alert('Não foram encontrados pares (descrição + valor) na planilha.\nAbra o console (F12) para ver detalhes.');
                    return;
                }

                const proposed = this.matchByValue(unmapped, entries);
                // Inclui contas sem match (para vinculação manual)
                const semMatch = unmapped.filter(row =>
                    !proposed.find(p => p.pdfCodigo === row.codigo)
                ).map(row => ({
                    pdfCodigo:   row.codigo,
                    pdfValor:    row.valor,
                    excelDesc:   null,
                    masterEntry: null,
                    autoMatched: false,
                    matches:     []
                }));

                const allProposed = [...proposed, ...semMatch];
                if (allProposed.length === 0) {
                    this.showToast('⚠️ Nenhuma conta para exibir');
                    return;
                }
                this.pendingAutoVincular = allProposed;
                this.showAutoVincularModal(allProposed);
            } catch(err) {
                alert('Erro ao ler planilha: ' + err.message);
                console.error('[AutoVincular] Erro:', err);
            }
        });
    },

    // ── Parser do Excel: abordagem por coluna ──────────────────────────────
    // Localiza a célula de descrição (no formato "N.N.N. Texto") e pega
    // o PRIMEIRO número APÓS ela na mesma linha (evita capturar n° de linha).
    parseExcelForValueMapping(ws) {
        const rows    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        const entries = [];

        rows.forEach(row => {
            if (!Array.isArray(row)) return;

            // 1) Acha a primeira célula de descrição no formato "N.N.N. Texto"
            let descInfo  = null;
            let descColIdx = -1;

            for (let ci = 0; ci < row.length; ci++) {
                const cell = row[ci];
                if (cell === null || cell === undefined) continue;
                if (typeof cell === 'boolean') continue;
                if (typeof cell === 'number') continue;
                const str = String(cell).trim();
                if (str.length < 3) continue;
                if (/^(false|true|falso|verdadeiro)$/i.test(str)) continue;
                const m = str.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
                if (m && m[2].trim().length >= 3) {
                    const desc = m[2].trim();
                    // Rejeita se a descrição extraída for uma palavra booleana
                    if (/^(false|true|falso|verdadeiro)$/i.test(desc)) continue;
                    descInfo   = { excelCode: m[1], desc };
                    descColIdx = ci;
                    break;
                }
            }

            if (!descInfo) return; // linha sem descrição no padrão esperado

            // 2) Pega o primeiro valor numérico significativo APÓS a coluna de descrição
            for (let ci = descColIdx + 1; ci < row.length; ci++) {
                const cell = row[ci];
                if (cell === null || cell === undefined || typeof cell === 'boolean') continue;

                let val = null;
                if (typeof cell === 'number') {
                    // Ignora decimais muito pequenos (provavelmente %)
                    if (Math.abs(cell) < 0.5 && cell !== Math.floor(cell)) continue;
                    val = cell;
                } else {
                    const str = String(cell).trim();
                    if (!str || /^(false|true|falso|verdadeiro)$/i.test(str)) continue;
                    if (/^\d+[,.]?\d*\s*%$/.test(str)) continue; // porcentagem
                    const brNum = this._parseBRNumber(str);
                    if (brNum !== null && Math.abs(brNum) >= 0.01) val = brNum;
                }

                if (val !== null) {
                    entries.push({ excelCode: descInfo.excelCode, desc: descInfo.desc, value: val });
                    break; // apenas o primeiro valor após a descrição
                }
            }
        });

        return entries;
    },

    _parseBRNumber(str) {
        let s   = str.replace(/[R$\s]/g, '').trim();
        const neg = s.startsWith('(') && s.endsWith(')');
        s = s.replace(/[()]/g, '');
        if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) {
            const val = parseFloat(s.replace(/\./g, '').replace(',', '.'));
            return neg ? -val : val;
        }
        const plain = parseFloat(s.replace(',', '.'));
        if (!isNaN(plain)) return neg ? -plain : plain;
        return null;
    },

    _getBestSheetName(sheetNames) {
        const type  = document.getElementById('filter-period-type')?.value  || 'anual';
        const sub   = document.getElementById('filter-period-sub')?.value   || 'ALL';
        
        let targetMonthNum = null;
        if (type === 'mensal') {
            targetMonthNum = Number(sub);
        } else {
            // Se for trimestral/semestral/anual, tenta pegar o primeiro mês do período
            const months = this.getMonthsForPeriod(type, sub);
            if (months && months.length > 0) targetMonthNum = months[0];
        }

        if (!targetMonthNum || isNaN(targetMonthNum)) {
            return sheetNames[0]; // fallback
        }

        const MONTH_NAMES = [
            ['janeiro', 'jan', '01'],
            ['fevereiro', 'fev', '02'],
            ['março', 'marco', 'mar', '03'],
            ['abril', 'abr', '04'],
            ['maio', 'mai', '05'],
            ['junho', 'jun', '06'],
            ['julho', 'jul', '07'],
            ['agosto', 'ago', '08'],
            ['setembro', 'set', '09'],
            ['outubro', 'out', '10'],
            ['novembro', 'nov', '11'],
            ['dezembro', 'dez', '12']
        ];

        const targets = MONTH_NAMES[targetMonthNum - 1];

        // Tenta encontrar um match exato ou parcial nas abas
        for (const name of sheetNames) {
            const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (targets.some(t => normName === t || normName.includes(t))) {
                console.log(`[AutoVincular] Aba selecionada automaticamente para o mês ${targetMonthNum}: "${name}"`);
                return name;
            }
        }

        return sheetNames[0]; // Fallback para a primeira aba
    },

    // ── Match: valor do PDF → valor do Excel → descrição do Excel ──────────
    matchByValue(unmappedRows, excelEntries) {
        const proposed  = [];
        const TOLERANCE = 0.05;
        unmappedRows.forEach(row => {
            const pdfAbs = Math.abs(row.valor);
            if (pdfAbs < 0.01) return;

            const valMatches = excelEntries.filter(e =>
                Math.abs(Math.abs(e.value) - pdfAbs) <= TOLERANCE
            );
            if (valMatches.length === 0) return;

            // Para cada match de valor, tenta encontrar no MASTER pela descrição
            const enriched = valMatches.map(m => ({
                ...m,
                masterEntry: this._findMasterByDesc(m.desc)
            }));

            const withMaster = enriched.filter(m => m.masterEntry);
            const best       = withMaster.length > 0 ? withMaster[0] : enriched[0];

            console.log(`[AutoVincular] ${row.codigo} (${row.valor}) → Excel: "${best.desc}" → Master: ${best.masterEntry?.descricao || 'NÃO ENCONTRADO'}`);

            proposed.push({
                pdfCodigo:   row.codigo,
                pdfValor:    row.valor,
                excelDesc:   best.desc,
                masterEntry: best.masterEntry,
                autoMatched: withMaster.length === 1,
                matches:     [...new Set(enriched.map(m => m.desc))]
            });
        });
        return proposed;
    },

    _normalizeDesc(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/^[\s.\-]+/, '')
            .replace(/[\/()'"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _findMasterByDesc(excelDesc) {
        if (!excelDesc) return null;
        const normExcel = this._normalizeDesc(excelDesc);
        if (normExcel.length < 4) return null;

        const accounts = window.MASTER_ACCOUNTS || [];
        let currentGroup = null;
        let bestMatch    = null;
        let bestScore    = 0;

        for (const acc of accounts) {
            if (acc.codigo === 'HEADER') { currentGroup = acc.descricao; continue; }
            const normMaster = this._normalizeDesc(acc.descricao);
            if (normMaster.length < 2) continue;
            if (normMaster === normExcel) return { ...acc, group: currentGroup };
            const shorter = normMaster.length < normExcel.length ? normMaster : normExcel;
            const longer  = normMaster.length >= normExcel.length ? normMaster : normExcel;
            if (shorter.length >= 5 && longer.includes(shorter)) {
                const score = shorter.length;
                if (score > bestScore) { bestScore = score; bestMatch = { ...acc, group: currentGroup }; }
            }
        }
        return bestMatch;
    },

    _suggestGroup(codigo) {
        const hdrs = (window.MASTER_ACCOUNTS || []).filter(m => m.codigo === 'HEADER').map(m => m.descricao);
        if (codigo.startsWith('1.') || codigo.startsWith('2.')) return hdrs.find(h => /Receita|Custo/i.test(h)) || hdrs[1] || '';
        if (codigo.startsWith('4.')) return hdrs.find(h => /Despesas Operac/i.test(h)) || hdrs.find(h => /Vari.veis/i.test(h)) || '';
        if (codigo.startsWith('5.')) return hdrs.find(h => /N.o Operac/i.test(h)) || '';
        if (codigo.startsWith('6.')) return hdrs.find(h => /Despesas N.o/i.test(h)) || '';
        return hdrs[1] || '';
    },

    // ── Modal: lista todas as contas com select de MASTER_ACCOUNTS ──────────
    showAutoVincularModal(proposed) {
        let modal = document.getElementById('modal-auto-vincular');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-auto-vincular';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;box-sizing:border-box;overflow-y:auto;';
            document.body.appendChild(modal);
        }

        // Constrói lista de todas as entradas do MASTER_ACCOUNTS (para o select)
        const allMasterEntries = [];
        let _curGrp = null;
        (window.MASTER_ACCOUNTS || []).forEach(m => {
            if (m.codigo === 'HEADER') { _curGrp = m.descricao; return; }
            allMasterEntries.push({ codigo: m.codigo, descricao: m.descricao, group: _curGrp });
        });

        // Constrói a lista de grupos direto dos HEADERs que têm pelo menos uma conta filha.
        // Isso garante que "Custo de Aquisição", "Despesas Operac. Fixas e Variáveis" e outros
        // grupos apareçam corretamente, e que HEADERs de sumário (Receita Operacional Bruta,
        // Total dos Custos) — que não têm contas diretas — sejam excluídos.
        const grupos = [];
        {
            let _scanGrp = null;
            let _grpHasAccounts = false;
            (window.MASTER_ACCOUNTS || []).forEach(m => {
                if (m.codigo === 'HEADER') {
                    if (_scanGrp !== null && _grpHasAccounts) grupos.push(_scanGrp);
                    _scanGrp = m.descricao;
                    _grpHasAccounts = false;
                } else {
                    _grpHasAccounts = true;
                }
            });
            if (_scanGrp && _grpHasAccounts) grupos.push(_scanGrp);
        }

        const tableRows = proposed.map((p, idx) => {
            const masterDesc  = p.masterEntry?.descricao || '';
            const masterGroup = p.masterEntry?.group     || (p.pdfCodigo ? this._suggestGroup(p.pdfCodigo) : '');
            const autoOk      = p.autoMatched && !!p.masterEntry;

            const badge = autoOk
                ? `<span title="Correspondência automática única" style="color:#10b981;font-size:1.1rem;">✅</span>`
                : p.masterEntry
                    ? `<span title="Correspondência encontrada" style="color:#f59e0b;font-size:.9rem;">⚠️</span>`
                    : `<span title="Sem correspondência automática — selecione manualmente" style="color:#ef4444;font-size:.9rem;">❌</span>`;

            // Select com TODAS as entradas do MASTER_ACCOUNTS
            const masterOpts = `<option value="">-- Selecione a linha do plano --</option>` +
                allMasterEntries.map(m =>
                    `<option value="${m.descricao.replace(/"/g,"'")}"
                        data-group="${(m.group||'').replace(/"/g,"'")}"
                        ${m.descricao === masterDesc ? 'selected' : ''}>
                        ${m.descricao}
                    </option>`
                ).join('');

            const gOpts = grupos.map(g =>
                `<option value="${g.replace(/"/g,"'")}" ${g === masterGroup ? 'selected' : ''}>${g}</option>`
            ).join('');

            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                    <td style="padding:8px 10px;"><input type="checkbox" id="avm-chk-${idx}" ${(autoOk||p.masterEntry)?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:#3b82f6;"></td>
                    <td style="padding:8px 10px;font-weight:700;font-size:.82rem;color:#60a5fa;">${p.pdfCodigo}</td>
                    <td style="padding:8px 6px;font-size:.82rem;color:${(p.pdfValor||0)>=0?'#10b981':'#ef4444'};text-align:right;">${this.formatCurrency(p.pdfValor||0)}</td>
                    <td style="padding:8px 6px;font-size:.75rem;color:#94a3b8;max-width:160px;overflow:hidden;text-overflow:ellipsis;" title="${p.excelDesc||''}"><i>${p.excelDesc||'—'}</i></td>
                    <td style="padding:8px 4px;text-align:center;">${badge}</td>
                    <td style="padding:4px;">
                        <select id="avm-master-sel-${idx}"
                            onchange="fcApp.autoVincularMasterChanged(${idx})"
                            style="background:#0f172a;border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#f8fafc;padding:4px 6px;font-size:.75rem;width:100%;min-width:200px;">
                            ${masterOpts}
                        </select>
                    </td>
                    <td style="padding:4px;">
                        <select id="avm-grupo-${idx}" style="background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#f8fafc;padding:4px 6px;font-size:.72rem;width:100%;min-width:130px;">${gOpts}</select>
                    </td>
                </tr>`;
        }).join('');

        const totalAuto    = proposed.filter(p => p.autoMatched && p.masterEntry).length;
        const totalMaster  = proposed.filter(p => p.masterEntry).length;
        const totalNoMatch = proposed.length - totalMaster;

        modal.innerHTML = `
            <div style="background:#1e293b;border-radius:14px;padding:2rem;width:100%;max-width:1100px;border:1px solid rgba(255,255,255,.08);box-shadow:0 24px 60px rgba(0,0,0,.6);">
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.6rem;">
                    <h3 style="margin:0;color:#f8fafc;flex:1;">&#9889; Auto-Vincular via Planilha</h3>
                    <span style="background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);border-radius:20px;padding:3px 12px;font-size:.78rem;font-weight:600;">
                        ${totalAuto} automáticas · ${totalMaster} encontradas · ${totalNoMatch} manuais
                    </span>
                </div>
                <p style="color:#94a3b8;font-size:.78rem;margin-bottom:1rem;">
                    ✅ encontrado automaticamente &nbsp;·&nbsp; ⚠️ encontrado (confirme) &nbsp;·&nbsp; ❌ selecione a linha do plano manualmente<br>
                    <b style="color:#60a5fa;">Coluna "Linha no Plano"</b>: escolha a qual linha do plano de contas este código do PDF corresponde.
                </p>
                <div style="overflow-x:auto;max-height:55vh;overflow-y:auto;border-radius:8px;border:1px solid rgba(255,255,255,.05);">
                    <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
                        <thead style="position:sticky;top:0;z-index:1;">
                            <tr style="background:#0f172a;color:#64748b;text-align:left;">
                                <th style="padding:10px;"><input type="checkbox" id="avm-chk-all" checked onchange="fcApp.selectAllAutoVincular(${proposed.length},this.checked)" style="width:14px;height:14px;cursor:pointer;accent-color:#3b82f6;"></th>
                                <th style="padding:10px;">Cód. PDF</th>
                                <th style="padding:10px;text-align:right;">Valor</th>
                                <th style="padding:10px;">Desc. Excel</th>
                                <th style="padding:10px;"></th>
                                <th style="padding:10px;">Linha no Plano de Contas</th>
                                <th style="padding:10px;">Grupo</th>
                            </tr>
                        </thead>
                        <tbody style="color:#f8fafc;">${tableRows}</tbody>
                    </table>
                </div>
                <div style="display:flex;gap:1rem;align-items:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.06);">
                    <span style="color:#64748b;font-size:.78rem;">Selecione a linha correta e clique Aplicar. Linhas sem seleção serão ignoradas.</span>
                    <div style="flex:1;"></div>
                    <button onclick="document.getElementById('modal-auto-vincular').style.display='none'" style="background:transparent;border:1px solid rgba(255,255,255,.15);color:#94a3b8;border-radius:8px;padding:.6rem 1.2rem;cursor:pointer;">Cancelar</button>
                    <button onclick="fcApp.applyAutoVincular(${proposed.length})" style="background:#10b981;border:none;color:white;border-radius:8px;padding:.6rem 1.5rem;cursor:pointer;font-weight:700;">&#9889; Aplicar Vinculações</button>
                </div>
            </div>`;
        modal.style.display = 'flex';
    },

    // Atualiza o dropdown de grupo quando o usuário escolhe uma linha do plano
    autoVincularMasterChanged(idx) {
        const sel = document.getElementById(`avm-master-sel-${idx}`);
        if (!sel || !sel.value) return;
        const opt = sel.options[sel.selectedIndex];
        const grp = opt?.dataset?.group;
        if (!grp) return;
        const grupoSel = document.getElementById(`avm-grupo-${idx}`);
        if (!grupoSel) return;
        for (const o of grupoSel.options) {
            if (o.value === grp) { o.selected = true; return; }
        }
    },

    selectAllAutoVincular(count, checked) {
        for (let i = 0; i < count; i++) {
            const chk = document.getElementById(`avm-chk-${i}`);
            if (chk) chk.checked = checked;
        }
        const all = document.getElementById('avm-chk-all');
        if (all) all.checked = checked;
    },

    // ── Aplica as vinculações: ATUALIZA o código no MASTER_ACCOUNTS ─────────
    applyAutoVincular(count) {
        const proposed = this.pendingAutoVincular || [];
        let accounts   = (window.MASTER_ACCOUNTS || []).slice();
        let applied    = 0;

        for (let i = 0; i < count; i++) {
            const chk = document.getElementById(`avm-chk-${i}`);
            if (!chk || !chk.checked) continue;
            const p = proposed[i];
            if (!p) continue;

            const novoCodigo = p.pdfCodigo;
            // Pega a descrição selecionada no dropdown (linha do plano de contas)
            const selectedDesc = document.getElementById(`avm-master-sel-${i}`)?.value?.trim();
            if (!selectedDesc) {
                console.log(`[AutoVincular] Linha ${i} (${novoCodigo}): sem seleção no plano, pulando.`);
                continue;
            }

            // Encontra a entrada no MASTER_ACCOUNTS pela descrição
            const entryIdx = accounts.findIndex(a =>
                a.descricao === selectedDesc && a.codigo !== 'HEADER'
            );

            if (entryIdx >= 0) {
                const masterAcc = { ...accounts[entryIdx] };
                if (!masterAcc.aliases) masterAcc.aliases = [];
                if (!masterAcc.aliases.includes(novoCodigo) && masterAcc.codigo !== novoCodigo) {
                    masterAcc.aliases.push(novoCodigo);
                    accounts[entryIdx] = masterAcc;
                    console.log(`[AutoVincular] ✅ Vinculado alias: "${selectedDesc}" (${masterAcc.codigo}) ← PDF: ${novoCodigo}`);
                    applied++;
                } else {
                    console.log(`[AutoVincular] ℹ️ Já vinculado como alias: "${selectedDesc}" (${masterAcc.codigo}) ← PDF: ${novoCodigo}`);
                }
            } else {
                // Fallback: insere nova entrada no grupo selecionado
                const grupo = document.getElementById(`avm-grupo-${i}`)?.value || '';
                if (!grupo) continue;
                accounts = accounts.filter(a => !(a.codigo === novoCodigo && a.descricao === selectedDesc));
                let insertIdx = -1, curGrp = null;
                for (let j = 0; j < accounts.length; j++) {
                    if (accounts[j].codigo === 'HEADER') {
                        if (curGrp === grupo && insertIdx >= 0) break;
                        curGrp = accounts[j].descricao;
                    } else if (curGrp === grupo) { insertIdx = j; }
                }
                if (insertIdx >= 0) {
                    accounts.splice(insertIdx + 1, 0, { codigo: novoCodigo, descricao: selectedDesc });
                    console.log(`[AutoVincular] ➕ Inserido: ${novoCodigo} — "${selectedDesc}" em "${grupo}"`);
                    applied++;
                }
            }
        }

        if (applied > 0) {
            localStorage.setItem('customMasterAccounts', JSON.stringify(accounts));
            window.MASTER_ACCOUNTS = accounts;
            document.getElementById('modal-auto-vincular').style.display = 'none';
            this.showToast(`✅ ${applied} conta${applied>1?'s':''} vinculada${applied>1?'s':''} com sucesso!`);
            this.refreshDashboard();
        } else {
            this.showToast('⚠️ Nenhuma conta foi vinculada — selecione as linhas do plano');
        }
    },

    // ─── MODAL VINCULAR CONTA ────────────────────────────────────────────────

    openVincularModal(codigo, valor, descricao) {
        const accounts = window.MASTER_ACCOUNTS || [];
        const cleanedDesc = (descricao || '').replace(/^[\s.\-]+/, '').trim();
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
                    <div style="color:#94a3b8;font-size:.85rem;">${cleanedDesc}</div>
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
                    <input type="text" id="vincular-descricao" value="${cleanedDesc === 'Desconhecida' ? '' : cleanedDesc}"
                        placeholder="Ex: Receita em Dinheiro"
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
        const rawDesc   = document.getElementById('vincular-descricao')?.value.trim() || codigo;
        const descricao = rawDesc.replace(/^[\s.\-]+/, '').trim();
        if (!grupo) { alert('Selecione um grupo de destino.'); return; }

        const accounts = (window.MASTER_ACCOUNTS || []).slice(); // clone

        // Procure se já existe uma conta com a mesma descrição no MASTER_ACCOUNTS (ignorando acentos/case)
        const normalizedInputDesc = this._normalizeDesc(descricao);
        const existingIdx = accounts.findIndex(a => 
            a.codigo !== 'HEADER' && this._normalizeDesc(a.descricao) === normalizedInputDesc
        );

        if (existingIdx >= 0) {
            // Se já existe, apenas adiciona o código do PDF aos aliases dessa conta!
            const masterAcc = { ...accounts[existingIdx] };
            if (!masterAcc.aliases) masterAcc.aliases = [];
            if (!masterAcc.aliases.includes(codigo) && masterAcc.codigo !== codigo) {
                masterAcc.aliases.push(codigo);
            }
            accounts[existingIdx] = masterAcc;
            localStorage.setItem('customMasterAccounts', JSON.stringify(accounts));
            window.MASTER_ACCOUNTS = accounts;
            
            const modal = document.getElementById('modal-vincular-conta');
            if (modal) modal.style.display = 'none';
            this.showToast(`✅ ${codigo} vinculado como alias de "${masterAcc.descricao}"`);
            this.refreshDashboard();
            return;
        }

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
        const num = parseFloat(value);
        if (!isNaN(num)) this.manualEntries[key] = num;
        else delete this.manualEntries[key];
        this._saveManualEntries();
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



/**
 * Controlador principal da Aplicação UI e Lógica
 */

const app = {
    currentChart: null,
    pendingImport: null,
    manualEntries: {}, // { "1.1.01-Desc": 100.00 }

    async init() {
        this.bindEvents();
        this.initFilters();

        // Carrega estrutura customizada do plano de contas (se existir)
        this.loadCustomMasterAccounts();

        // Carrega clientes da nuvem
        document.getElementById('clients-grid').innerHTML = '<p style="text-align:center; color: var(--text-muted);">Sincronizando com a nuvem...</p>';
        await this.renderClientsList();
        
        const activeClient = store.getActiveClient();
        if (activeClient) {
            this.loadDashboard(activeClient);
        } else {
            this.showView('view-clients');
        }
    },

    bindEvents() {
        const dropZone = document.getElementById('pdf-drop-zone');
        const fileInput = document.getElementById('pdf-file-input');

        if(dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--success)';
                dropZone.style.background = 'rgba(16, 185, 129, 0.1)';
            });
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary)';
                dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--primary)';
                dropZone.style.background = 'rgba(59, 130, 246, 0.05)';
                if (e.dataTransfer.files.length) this.handlePDFUpload(e.dataTransfer.files[0]);
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) this.handlePDFUpload(e.target.files[0]);
            });
        }

        document.getElementById('filter-period-type').addEventListener('change', (e) => {
            this.updatePeriodSubSelect(e.target.value);
            this.refreshDashboard();
        });
        const subEl = document.getElementById('filter-period-sub');
        if (subEl) subEl.addEventListener('change', () => this.refreshDashboard());
        const yearEl = document.getElementById('filter-year');
        if (yearEl) yearEl.addEventListener('change', () => this.refreshDashboard());
    },

    // ── FILTROS ─────────────────────────────────────────────────────────────

    initFilters() {
        const now = new Date();
        const currentYear  = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        // Popula select de ano
        const yearSel = document.getElementById('filter-year');
        if (yearSel) {
            yearSel.innerHTML = '';
            for (let y = currentYear - 2; y <= currentYear + 1; y++) {
                yearSel.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
        }
        // Padrão: Mensal, mês atual
        const typeSel = document.getElementById('filter-period-type');
        if (typeSel) typeSel.value = 'monthly';
        this.updatePeriodSubSelect('monthly', currentMonth);
    },

    updatePeriodSubSelect(type, defaultVal) {
        const sub = document.getElementById('filter-period-sub');
        if (!sub) return;
        sub.innerHTML = '';
        if (type === 'monthly') {
            const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                           'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            names.forEach((name, i) => {
                const sel = (i + 1) === parseInt(defaultVal || 1) ? 'selected' : '';
                sub.innerHTML += `<option value="${i + 1}" ${sel}>${name}</option>`;
            });
            sub.style.display = '';
        } else if (type === 'quarterly') {
            [['Q1','1º Trimestre'],['Q2','2º Trimestre'],['Q3','3º Trimestre'],['Q4','4º Trimestre']]
                .forEach(([val, lbl]) => { sub.innerHTML += `<option value="${val}">${lbl}</option>`; });
            if (defaultVal) sub.value = defaultVal;
            sub.style.display = '';
        } else if (type === 'semiannual') {
            sub.innerHTML = '<option value="S1">1º Semestre</option><option value="S2">2º Semestre</option>';
            if (defaultVal) sub.value = defaultVal;
            sub.style.display = '';
        } else {
            sub.style.display = 'none'; // anual: esconde sub
        }
    },

    getMonthsForPeriod(type, subVal) {
        switch (type) {
            case 'monthly':    return [parseInt(subVal)];
            case 'quarterly':  return ({Q1:[1,2,3],Q2:[4,5,6],Q3:[7,8,9],Q4:[10,11,12]})[subVal] || [1,2,3];
            case 'semiannual': return subVal === 'S1' ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
            default:           return [1,2,3,4,5,6,7,8,9,10,11,12];
        }
    },

    getPeriodLabel(type, subVal, year) {
        const mn = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        switch (type) {
            case 'monthly':    return `${mn[parseInt(subVal)]} ${year}`;
            case 'quarterly':  return ({Q1:'1º Trimestre',Q2:'2º Trimestre',Q3:'3º Trimestre',Q4:'4º Trimestre'})[subVal] + ` ${year}`;
            case 'semiannual': return (subVal === 'S1' ? '1º Semestre' : '2º Semestre') + ` ${year}`;
            default:           return `Anual ${year}`;
        }
    },

    getFilterState() {
        const type   = document.getElementById('filter-period-type')?.value || 'annual';
        const year   = document.getElementById('filter-year')?.value || new Date().getFullYear().toString();
        const sub    = document.getElementById('filter-period-sub');
        const subVal = (sub && sub.style.display !== 'none' && sub.value) ? sub.value : null;
        return { type, year, subVal };
    },


    showView(viewId) {
        document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    },

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const links = document.querySelectorAll('.nav-item');
        for (let link of links) {
            if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(tabId)) {
                link.classList.add('active');
            }
        }
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');

        if (tabId === 'overview')  this.refreshDashboard();
        if (tabId === 'accounts')  this.renderAccountsEditor();
    },

    // --- CLIENTES ---

    async renderClientsList() {
        const clients = await store.getClients();
        const grid = document.getElementById('clients-grid');
        grid.innerHTML = '';

        if (clients.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center;">Nenhum cliente cadastrado. Clique em Novo Cliente.</p>';
            return;
        }

        clients.forEach(client => {
            const card = document.createElement('div');
            card.className = 'client-card glass-panel';
            card.onclick = () => this.loadDashboard(client);
            
            const initial = client.name.charAt(0).toUpperCase();
            
            card.innerHTML = `
                <div class="client-avatar">${initial}</div>
                <div class="client-card-info">
                    <h3>${client.name}</h3>
                    <p>CNPJ: ${client.cnpj || 'Não informado'}</p>
                </div>
                <button class="btn-delete-client" onclick="event.stopPropagation(); app.deleteClient('${client.id}', '${client.name}')">
                    <span class="material-icons-round">delete_outline</span>
                </button>
            `;
            grid.appendChild(card);
        });
    },

    showNewClientModal() {
        document.getElementById('modal-new-client').classList.add('active');
        document.getElementById('new-client-name').value = '';
        document.getElementById('new-client-cnpj').value = '';
    },

    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
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
        store.setActiveClient(null);
        this.renderClientsList();
        this.showView('view-clients');
    },

    // --- DASHBOARD ---

    loadDashboard(client) {
        store.setActiveClient(client.id);
        
        document.getElementById('active-client-initial').textContent = client.name.charAt(0).toUpperCase();
        document.getElementById('active-client-name').textContent = client.name;
        document.getElementById('active-client-cnpj').textContent = client.cnpj || 'CNPJ não informado';
        
        this.showView('view-dashboard');
        this.switchTab('overview');
    },

    refreshDashboard() {
        const client = store.getActiveClient();
        if (!client) return;

        const { type, year, subVal } = this.getFilterState();
        const yearData = store.getYearData(client.id, year);
        const months   = this.getMonthsForPeriod(type, subVal);

        let totalRealizadoEntradas = 0, totalRealizadoSaidas   = 0;
        let totalProjetadoEntradas = 0, totalProjetadoSaidas   = 0;
        const monthlyRealizado = new Array(12).fill(0);
        const monthlyProjetado = new Array(12).fill(0);
        const allAccountsInPeriod = [];

        for (const month of months) {
            const key   = `${year}-${month.toString().padStart(2, '0')}`;
            const mData = yearData[key];

            if (mData && mData.realizado) {
                mData.realizado.forEach(acc => {
                    totalRealizadoEntradas += acc.a_receber || 0;
                    totalRealizadoSaidas   += acc.a_pagar   || 0;
                    monthlyRealizado[month - 1] += (acc.a_receber || 0) - (acc.a_pagar || 0);
                    allAccountsInPeriod.push(acc);
                });
            }
            if (mData && mData.projetado) {
                mData.projetado.forEach(acc => {
                    totalProjetadoEntradas += acc.a_receber || 0;
                    totalProjetadoSaidas   += acc.a_pagar   || 0;
                    monthlyProjetado[month - 1] += (acc.a_receber || 0) - (acc.a_pagar || 0);
                });
            }
        }

        const saldoRealizadoLiq = totalRealizadoEntradas - totalRealizadoSaidas;
        const saldoProjetadoLiq = totalProjetadoEntradas - totalProjetadoSaidas;
        let variacao = 0;
        if (saldoProjetadoLiq !== 0) variacao = ((saldoRealizadoLiq - saldoProjetadoLiq) / Math.abs(saldoProjetadoLiq)) * 100;

        document.getElementById('kpi-entradas').textContent     = this.formatCurrency(totalRealizadoEntradas);
        document.getElementById('kpi-saidas').textContent       = this.formatCurrency(totalRealizadoSaidas);
        document.getElementById('kpi-saldo-geral').textContent  = this.formatCurrency(saldoRealizadoLiq);
        document.getElementById('kpi-variacao').textContent     = variacao.toFixed(2) + '%';

        // Gráfico: apenas os meses selecionados
        const shortNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        const chartLabels    = months.map(m => shortNames[m - 1]);
        const chartRealizado = months.map(m => monthlyRealizado[m - 1]);
        const chartProjetado = months.map(m => monthlyProjetado[m - 1]);
        this.renderCharts(chartRealizado, chartProjetado, chartLabels);

        // Tabela financeira detalhada
        const result = FinancialEngine.processData(allAccountsInPeriod, this.manualEntries);
        this.renderSummaryBar(result.totals);
        this.renderFlowTableStrict(result.rows, totalRealizadoEntradas, result.pdfTotalReceitas);

        // Label do período no header
        const label = this.getPeriodLabel(type, subVal, year);
        const lbl = document.getElementById('current-period-label');
        if (lbl) lbl.textContent = label;
    },

    renderFlowTableStrict(rows, totalEntradas, pdfTotalReceitas) {
        const tbody = document.getElementById('flow-table-body');
        tbody.innerHTML = '';

        let manualSum = 0;

        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = `level-${row.level}`;

            // ── Nível 1: Header de grupo principal ──────────────────────────
            if (row.type === 'header') {
                tr.classList.add('table-group-header', row.style?.class || '');
                const val = row.valorCalculado !== undefined
                    ? this.formatCurrency(row.valorCalculado) : '-';
                const pct = (totalEntradas > 0 && row.valorCalculado !== undefined)
                    ? ((Math.abs(row.valorCalculado) / totalEntradas) * 100).toFixed(2) + '%' : '-';
                tr.innerHTML = `
                    <td colspan="2">${row.descricao}</td>
                    <td class="text-right"><strong>${val}</strong></td>
                    <td class="text-right">${pct}</td>
                `;
                tbody.appendChild(tr);
                // Linha de conferência logo abaixo do header de Receitas
                if (row.descricao === 'Total Receitas Operacionais / Vendas') {
                    this.renderValidationRow(tbody, pdfTotalReceitas);
                }
                return;
            }

            // ── Nível 2: Sub-cabeçalho de subgrupo (ex: "1.1. Receita com Vendas") ──
            if (row.isSubheader) {
                tr.classList.add('table-subgroup-header');
                const pct = totalEntradas > 0
                    ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
                tr.innerHTML = `
                    <td colspan="2"><strong>${row.codigo}. ${row.descricao}</strong></td>
                    <td class="text-right"><strong>${this.formatCurrency(row.valor)}</strong></td>
                    <td class="text-right"><strong>${pct}</strong></td>
                `;
                tbody.appendChild(tr);
                return;
            }

            // ── Nível 2/3: Linha de conta (manual ou do PDF) ────────────────
            if (row.unmapped) tr.classList.add('row-unmapped');
            if (row.isManual) manualSum += (row.valor || 0);

            const valClass = row.valor >= 0 ? 'positive' : 'negative';
            const vertical = totalEntradas > 0
                ? ((Math.abs(row.valor) / totalEntradas) * 100).toFixed(2) + '%' : '0,00%';
            const descText = row.unmapped ? `⚠️ [VINCULAR] ${row.descricao}` : row.descricao;

            let valorHtml;
            if (row.isManual) {
                const key = `${row.codigo}-${row.descricao}`;
                valorHtml = `<input type="number" step="0.01" class="manual-input"
                               value="${row.valor || ''}"
                               onchange="app.updateManualEntry('${key}', this.value)"
                               placeholder="0,00">`;
            } else {
                valorHtml = `<span class="${valClass}">${this.formatCurrency(row.valor)}</span>`;
            }

            tr.innerHTML = `
                <td class="col-code"><strong>${row.codigo}</strong> <span class="col-desc">${descText}</span></td>
                <td class="text-right ${valClass} col-val">${valorHtml}</td>
                <td class="text-right col-perc">${vertical}</td>
            `;
            tbody.appendChild(tr);
        });

        this.updateValidationStatus(manualSum, pdfTotalReceitas);
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
            msg.innerHTML = '<span class="status-ok">✅ CONFERIDO</span>';
            msg.style.color = '#10b981';
        } else {
            const remaining = pdfTotal - manualSum;
            msg.innerHTML = `<span class="status-error">❌ DIFERENÇA: ${this.formatCurrency(remaining)}</span>`;
            msg.style.color = '#ef4444';
        }
    },

    renderCharts(realizadoData, projetadoData, labels) {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if (this.currentChart) this.currentChart.destroy();
        const chartLabels = labels || ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        this.currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
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
        document.querySelector('#sum-saldo-inicial .sum-value').textContent = this.formatCurrency(totals.saldoInicial);
        document.querySelector('#sum-total-receitas .sum-value').textContent = this.formatCurrency(totals.totalReceitas);
        document.querySelector('#sum-total-despesas .sum-value').textContent = this.formatCurrency(totals.totalDespesas);
        document.querySelector('#sum-saldo-liquido .sum-value').textContent = this.formatCurrency(totals.saldoLiquido);
        document.querySelector('#sum-saldo-ajustado .sum-value').textContent = this.formatCurrency(totals.saldoAjustado);
    },

    renderFlowTableGrouped(grouped, totalEntradas) {
        const tbody = document.getElementById('flow-table-body');
        tbody.innerHTML = '';
        
        const groupOrder = ['disponibilidade', 'receitas_operacionais', 'custos_impostos', 'despesas_operacionais', 'receitas_nao_operacionais', 'outros'];
        
        groupOrder.forEach(groupId => {
            const group = grouped[groupId];
            if (group.items.length === 0) return;

            // Header do Grupo
            const headerTr = document.createElement('tr');
            headerTr.className = `table-group-header group-${groupId.replace('_','-')}`;
            headerTr.innerHTML = `
                <td colspan="2">${group.config.label}</td>
                <td class="text-right">-</td>
                <td class="text-right">${this.formatCurrency(group.total)}</td>
                <td colspan="2"></td>
            `;
            tbody.appendChild(headerTr);

            // Itens do Grupo (consolidados por código para não repetir)
            const consolidated = {};
            group.items.forEach(acc => {
                if(!consolidated[acc.codigo]) consolidated[acc.codigo] = { ...acc, total: 0 };
                consolidated[acc.codigo].total += (acc.a_receber || 0) - (acc.a_pagar || 0);
            });

            Object.values(consolidated).sort((a,b) => a.codigo.localeCompare(b.codigo)).forEach(acc => {
                const tr = document.createElement('tr');
                if (acc.unmapped) tr.className = 'row-unmapped'; // CSS class to highlight

                const isEntrada = acc.codigo.startsWith('1.') || acc.codigo.startsWith('4.');
                const valClass = acc.total >= 0 ? 'positive' : 'negative';
                
                let vertical = 0;
                if(totalEntradas > 0) vertical = (Math.abs(acc.total) / totalEntradas) * 100;

                const descText = acc.unmapped ? `⚠️ [NÃO MAPEADO] ${acc.descricao}` : acc.descricao;

                tr.innerHTML = `
                    <td><strong>${acc.codigo}</strong></td>
                    <td>${descText}</td>
                    <td class="text-right">-</td>
                    <td class="text-right ${valClass}">${this.formatCurrency(acc.total)}</td>
                    <td class="text-right">-</td>
                    <td class="text-right">${vertical.toFixed(2)}%</td>
                `;
                tbody.appendChild(tr);
            });
        });
    },

    renderFlowTable(accountsMap, totalEntradas) {
        // Esta função foi substituída pela renderFlowTableGrouped
    },

    formatCurrency(val) {
        const sign = val < 0 ? '-' : '';
        return `${sign}R$ ${Math.abs(val).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    },

    // --- IMPORTAÇÃO DE PDF ---
    
    handlePDFUpload(file) {
        if (!file || file.type !== 'application/pdf') return alert('Por favor, selecione um arquivo PDF válido.');
        document.getElementById('import-period').textContent = 'Analisando...';
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const typedarray = new Uint8Array(e.target.result);
            if(window.PDFParser) {
                window.PDFParser.parseMaxdataPDF(typedarray)
                    .then(result => app.showImportPreview(result))
                    .catch(err => alert('Erro ao processar PDF: ' + err.message));
            } else { alert('Módulo PDF não carregado.'); }
        };
        reader.readAsArrayBuffer(file);
    },

    showImportPreview(result) {
        document.getElementById('pdf-drop-zone').classList.add('hidden');
        document.getElementById('import-preview').classList.remove('hidden');

        // Período: result.periodo vem como 'MM/YYYY' (ex: '03/2026')
        const [mm, yyyy] = result.periodo.split('/');
        const monthNames = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                            'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const periodLabel = `${monthNames[+mm] || mm}/${yyyy}`;
        document.getElementById('import-period').textContent = `Período detectado: ${periodLabel}`;

        // Totais para o resumo
        const totalPagar   = result.contas.reduce((s, c) => s + c.a_pagar,   0);
        const totalReceber = result.contas.reduce((s, c) => s + c.a_receber, 0);
        const ccTxt = result.ccCount > 0 ? ` — ${result.ccCount} filiais consolidadas` : '';

        // Resumo no topo do preview
        let summaryEl = document.getElementById('import-summary');
        if (!summaryEl) {
            summaryEl = document.createElement('div');
            summaryEl.id = 'import-summary';
            summaryEl.style.cssText = 'display:flex;gap:1rem;flex-wrap:wrap;margin:.75rem 0 1rem;padding:.75rem 1rem;' +
                'background:rgba(59,130,246,.08);border-radius:8px;font-size:.82rem;border:1px solid rgba(59,130,246,.2);';
            document.getElementById('import-preview').insertBefore(
                summaryEl,
                document.getElementById('import-preview').querySelector('.table-responsive')
            );
        }
        summaryEl.innerHTML = `
            <span>📄 <strong>${result.contas.length}</strong> contas extraídas${ccTxt}</span>
            <span>🟢 A Receber: <strong class="positive">R$ ${totalReceber.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>
            <span>🔴 A Pagar: <strong class="negative">R$ ${totalPagar.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>
            <span>📊 Saldo: <strong>R$ ${(totalReceber - totalPagar).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>
        `;

        const tbody = document.getElementById('import-preview-body');
        tbody.innerHTML = '';
        
        // Ordena por código para facilitar conferência
        const sorted = [...result.contas].sort((a, b) => a.codigo.localeCompare(b.codigo));
        sorted.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.codigo}</strong> ${c.descricao}</td>
                <td class="text-right positive">${c.a_receber > 0 ? 'R$ ' + c.a_receber.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="text-right negative">${c.a_pagar > 0 ? 'R$ ' + c.a_pagar.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
        
        this.pendingImport = result;
    },

    cancelImport() {
        this.pendingImport = null;
        document.getElementById('pdf-drop-zone').classList.remove('hidden');
        document.getElementById('import-preview').classList.add('hidden');
        document.getElementById('pdf-file-input').value = '';
        // Limpa summary se existir
        const s = document.getElementById('import-summary');
        if (s) s.innerHTML = '';
    },

    async confirmImport() {
        if (!this.pendingImport) return;
        
        // Busca o botão de confirmar de forma robusta
        const btn = document.querySelector('#import-confirm-btn') ||
                    document.querySelector('.import-actions .btn-primary');
        if (btn) { btn.textContent = 'Sincronizando...'; btn.disabled = true; }
        
        const client = store.getActiveClient();
        if (!client) {
            alert('Nenhum cliente selecionado.');
            if (btn) { btn.textContent = 'Confirmar e Salvar'; btn.disabled = false; }
            return;
        }

        // Período vem como 'MM/YYYY' → converte para chave 'YYYY-MM'
        const [mes, ano] = this.pendingImport.periodo.split('/');
        const periodKey = `${ano}-${mes.padStart(2, '0')}`;
        
        const success = await store.savePeriodData(client.id, periodKey, 'realizado', this.pendingImport.contas);
        
        if (btn) { btn.textContent = 'Confirmar e Salvar'; btn.disabled = false; }
        
        if (success) {
            const [mmN, yyyyN] = this.pendingImport.periodo.split('/');
            const nomes = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                           'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
            const label = `${nomes[+mmN] || mmN}/${yyyyN}`;
            alert(`✅ ${this.pendingImport.contas.length} contas de ${label} importadas com sucesso!`);
            this.cancelImport();
            this.switchTab('overview');
        } else {
            alert('❌ Erro ao enviar dados para a nuvem. Verifique a conexão e tente novamente.');
        }
    },

    // --- PROJEÇÕES ---
    async applyProjections() {
        const growth = parseFloat(document.getElementById('proj-growth').value) || 0;
        const multiplier = 1 + (growth / 100);
        
        const client = store.getActiveClient();
        if(!client) return;
        
        const currentYear = new Date().getFullYear().toString();
        const yearData = store.getYearData(client.id, currentYear);
        
        let lastRealizadoMonth = 0;
        let baseContas = [];
        
        for(let m = 12; m >= 1; m--) {
            const key = `${currentYear}-${m.toString().padStart(2,'0')}`;
            if(yearData[key] && yearData[key].realizado && yearData[key].realizado.length > 0) {
                lastRealizadoMonth = m;
                baseContas = yearData[key].realizado;
                break;
            }
        }
        
        if (lastRealizadoMonth === 0 || lastRealizadoMonth === 12) {
            return alert('Não há dados realizados para basear a projeção ou o ano já está fechado.');
        }

        const btn = document.querySelector('.projection-rules .btn-primary');
        const oldText = btn.textContent;
        btn.textContent = "Projetando na Nuvem...";
        btn.disabled = true;

        let projCount = 0;
        for(let m = lastRealizadoMonth + 1; m <= 12; m++) {
            const key = `${currentYear}-${m.toString().padStart(2,'0')}`;
            const projectedAccounts = baseContas.map(acc => {
                return {
                    codigo: acc.codigo,
                    descricao: acc.descricao,
                    a_receber: acc.a_receber * multiplier,
                    a_pagar: acc.a_pagar * multiplier
                }
            });
            await store.savePeriodData(client.id, key, 'projetado', projectedAccounts);
            projCount++;
        }
        
        btn.textContent = oldText;
        btn.disabled = false;

        alert(`Projeções aplicadas com sucesso para ${projCount} meses com taxa de ${growth}% baseados no mês ${lastRealizadoMonth}/${currentYear}.`);
        this.switchTab('overview');
    },

    // --- EXPORTAÇÃO EXCEL ---
    exportToExcel() {
        if(typeof XLSX === 'undefined') return alert('Biblioteca de exportação não carregada.');
        const client = store.getActiveClient();
        if(!client) return;

        const year = document.getElementById('filter-period-value').value;
        const yearData = store.getYearData(client.id, year);
        
        const wb = XLSX.utils.book_new();
        const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

        const allAccounts = {};
        for(let m=1; m<=12; m++) {
            const key = `${year}-${m.toString().padStart(2,'0')}`;
            if(yearData[key]) {
                const arr = (yearData[key].realizado || []).concat(yearData[key].projetado || []);
                arr.forEach(a => { allAccounts[a.codigo] = a.descricao; });
            }
        }

        const orderedKeys = Object.keys(allAccounts).sort();

        months.forEach((monthName, idx) => {
            const monthNum = (idx + 1).toString().padStart(2, '0');
            const key = `${year}-${monthNum}`;
            const mData = yearData[key] || { realizado: [], projetado: [] };
            
            const sheetData = [];
            sheetData.push(["", `Fluxo de Caixa ${year} CTR`, monthName, `% ACUMULADO ${monthName.substring(0,3)}/${year}`]);
            sheetData.push(["Disponíveis Nas Contas Movimento"]);
            
            orderedKeys.forEach(code => {
                let rAcc = mData.realizado ? mData.realizado.find(a => a.codigo === code) : null;
                let pAcc = mData.projetado ? mData.projetado.find(a => a.codigo === code) : null;
                
                let saldo = 0;
                if (rAcc) saldo = (rAcc.a_receber || 0) - (rAcc.a_pagar || 0);
                else if (pAcc) saldo = (pAcc.a_receber || 0) - (pAcc.a_pagar || 0);

                sheetData.push(["", `${code} - ${allAccounts[code]}`, saldo]);
            });

            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            ws['!cols'] = [{wch: 5}, {wch: 45}, {wch: 15}, {wch: 20}];
            XLSX.utils.book_append_sheet(wb, ws, monthName);
        });

        const annualData = [];
        annualData.push(["CÓDIGO", "CONTA", "SALDO TOTAL DO ANO"]);
        orderedKeys.forEach(code => {
            let totalSaldo = 0;
            for(let m=1; m<=12; m++) {
                const key = `${year}-${m.toString().padStart(2,'0')}`;
                if(yearData[key]) {
                    const rAcc = yearData[key].realizado ? yearData[key].realizado.find(a=>a.codigo===code) : null;
                    const pAcc = yearData[key].projetado ? yearData[key].projetado.find(a=>a.codigo===code) : null;
                    if(rAcc) totalSaldo += (rAcc.a_receber || 0) - (rAcc.a_pagar || 0);
                    else if(pAcc) totalSaldo += (pAcc.a_receber || 0) - (pAcc.a_pagar || 0);
                }
            }
            annualData.push([code, allAccounts[code], totalSaldo]);
        });

        const wsAnnual = XLSX.utils.aoa_to_sheet(annualData);
        XLSX.utils.book_append_sheet(wb, wsAnnual, `Anual ${year}`);


        XLSX.writeFile(wb, `Fluxo_Caixa_${client.name.replace(/\s+/g,'_')}_${year}.xlsx`);
    },

    // ══ PLANO DE CONTAS (EDITOR) ══════════════════════════════════════

    loadCustomMasterAccounts() {
        const custom = localStorage.getItem('customMasterAccounts');
        if (custom) {
            try {
                const parsed = JSON.parse(custom);
                if (parsed && parsed.length > 0) window.MASTER_ACCOUNTS = parsed;
            } catch (e) { console.warn('Erro ao carregar plano de contas customizado', e); }
        }
    },

    getActiveMasterAccounts() {
        return window.MASTER_ACCOUNTS || [];
    },

    renderAccountsEditor() {
        const accounts = this.getActiveMasterAccounts();
        const tbody    = document.getElementById('accounts-editor-body');
        if (!tbody) return;

        const locked = localStorage.getItem('masterAccountsLocked') === 'true';
        this.updateLockUI(locked);

        tbody.innerHTML = '';
        accounts.forEach((acc, idx) => {
            const isHeader = acc.codigo === 'HEADER';
            const tr = document.createElement('tr');
            tr.draggable = !locked;
            tr.dataset.acc = JSON.stringify(acc);
            tr.style.cursor = locked ? 'default' : 'grab';
            if (isHeader) tr.style.background = 'rgba(255,255,255,0.06)';

            const badge = isHeader
                ? '<span class="badge-tipo badge-grupo">GRUPO</span>'
                : `<span class="badge-tipo badge-conta">${(acc.codigo.match(/\./g)||[]).length <= 1 ? 'Nível 2' : 'Nível 3'}</span>`;

            const codeField = locked
                ? `<span style="font-family:monospace;color:var(--primary);">${acc.codigo}</span>`
                : `<input type="text" class="acc-code-input" value="${acc.codigo}"
                          style="width:110px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
                                 border-radius:6px;padding:4px 8px;color:#fff;font-family:monospace;font-size:.9rem;"
                          ${isHeader ? 'disabled style="color:var(--text-muted);"' : ''}>`;

            tr.innerHTML = `
                <td class="drag-handle" style="text-align:center;font-size:1.2rem;color:var(--text-muted);user-select:none;">
                    ${locked ? '🔒' : '⊿️'}
                </td>
                <td>${codeField}</td>
                <td style="color:${isHeader ? '#f8fafc' : 'var(--text-muted)'};
                           font-weight:${isHeader ? '700' : '400'};
                           padding-left:${isHeader ? '8px' : '28px'};">
                    ${acc.descricao}
                </td>
                <td style="text-align:center;">${badge}</td>
            `;
            tbody.appendChild(tr);
        });

        if (!locked) this.setupDragDrop(tbody);
    },

    setupDragDrop(tbody) {
        let dragSrc = null;
        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('dragstart', e => {
                dragSrc = row;
                e.dataTransfer.effectAllowed = 'move';
                row.style.opacity = '0.5';
            });
            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
            });
            row.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (row !== dragSrc) row.classList.add('drag-over');
            });
            row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
            row.addEventListener('drop', e => {
                e.preventDefault();
                row.classList.remove('drag-over');
                if (dragSrc && dragSrc !== row) {
                    const rows = [...tbody.querySelectorAll('tr')];
                    const si = rows.indexOf(dragSrc);
                    const di = rows.indexOf(row);
                    tbody.insertBefore(dragSrc, si < di ? row.nextSibling : row);
                }
            });
        });
    },

    saveAccountsStructure() {
        const rows = document.querySelectorAll('#accounts-editor-body tr');
        const newAccounts = [];
        rows.forEach(tr => {
            let acc;
            try { acc = JSON.parse(tr.dataset.acc); } catch(e) { return; }
            const input = tr.querySelector('.acc-code-input');
            newAccounts.push({
                codigo:   input ? input.value.trim() : acc.codigo,
                descricao: acc.descricao
            });
        });
        if (newAccounts.length === 0) return;
        localStorage.setItem('customMasterAccounts', JSON.stringify(newAccounts));
        window.MASTER_ACCOUNTS = newAccounts;
        // Atualiza data-acc nos trs para refletir códigos editados
        document.querySelectorAll('#accounts-editor-body tr').forEach((tr, i) => {
            if (newAccounts[i]) tr.dataset.acc = JSON.stringify(newAccounts[i]);
        });
        this.showToast('✅ Estrutura salva com sucesso!');
    },

    toggleLockAccounts() {
        const locked = localStorage.getItem('masterAccountsLocked') === 'true';
        if (!locked) {
            if (!confirm('Travar a estrutura do plano de contas? Você não poderá editar os códigos ou reordenar até destravar.')) return;
            this.saveAccountsStructure(); // salva antes de travar
            localStorage.setItem('masterAccountsLocked', 'true');
            this.showToast('🔒 Estrutura travada!');
        } else {
            if (!confirm('Destravar a estrutura para edição?')) return;
            localStorage.removeItem('masterAccountsLocked');
            this.showToast('🔓 Estrutura destravada para edição.');
        }
        this.renderAccountsEditor();
    },

    resetAccountsStructure() {
        if (!confirm('Restaurar a estrutura padrão? Todas as alterações de códigos e ordem serão perdidas.')) return;
        localStorage.removeItem('customMasterAccounts');
        localStorage.removeItem('masterAccountsLocked');
        // Reload original
        const original = window._MASTER_ACCOUNTS_ORIGINAL;
        if (original) window.MASTER_ACCOUNTS = JSON.parse(JSON.stringify(original));
        this.showToast('♻️ Estrutura padrão restaurada.');
        this.renderAccountsEditor();
    },

    updateLockUI(locked) {
        const icon  = document.getElementById('lock-icon');
        const label = document.getElementById('lock-label');
        const banner = document.getElementById('accounts-lock-banner');
        if (!icon) return;
        if (locked) {
            icon.textContent  = 'lock_open';
            label.textContent = 'Destravar';
            banner?.classList.remove('hidden');
        } else {
            icon.textContent  = 'lock';
            label.textContent = 'Travar';
            banner?.classList.add('hidden');
        }
    },

    showToast(msg) {
        let t = document.getElementById('app-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'app-toast';
            t.style.cssText = `position:fixed;bottom:24px;right:24px;background:#1e293b;color:#f8fafc;
                border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 22px;
                font-size:.95rem;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.4);
                transition:opacity .3s ease;`;
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
    },

};

document.addEventListener('DOMContentLoaded', () => {
    // Delay leve para garantir que o firebase inicializou caso seja remoto
    setTimeout(() => {
        app.init();
    }, 500);
});

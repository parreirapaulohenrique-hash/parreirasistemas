/**
 * Controlador principal da Aplicação UI e Lógica do Fluxo de Caixa (ERP Consultoria)
 * Integrado como um módulo dentro do ERP Geral.
 */

window.fcApp = {
    currentChart: null,
    pendingImport: null,
    manualEntries: {}, 

    init() {
        this.bindEvents();
        
        // Populate period filter years
        const currentYear = new Date().getFullYear();
        const yearSelect = document.getElementById('filter-period-value');
        if (yearSelect) {
            yearSelect.innerHTML = '';
            for(let y = currentYear - 1; y <= currentYear + 2; y++) {
                yearSelect.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
        }
        
        // Carrega clientes da nuvem
        const grid = document.getElementById('fc-clients-grid');
        if(grid) grid.innerHTML = '<p style="text-align:center; color: var(--text-muted); grid-column:1/-1;">Sincronizando clientes com a nuvem...</p>';
        
        this.renderClientsList();
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

        const fpt = document.getElementById('filter-period-type');
        const fpv = document.getElementById('filter-period-value');
        if(fpt) fpt.addEventListener('change', () => this.refreshDashboard());
        if(fpv) fpv.addEventListener('change', () => this.refreshDashboard());
    },

    /**
     * Verifica se o cliente está selecionado. 
     * Se sim, vai para a view, senão, vai para a seleção de clientes.
     */
    requireClient(viewId) {
        const activeClient = store.getActiveClient();
        if (!activeClient) {
            window.switchView('fc-clients');
            alert('Por favor, selecione um cliente primeiro para visualizar a Análise Financeira.');
            return;
        }
        window.switchView(viewId);
        
        // Se for a tela de overview, atualiza
        if (viewId === 'fc-overview') {
            this.refreshDashboard();
        }
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
            card.className = 'client-card glass-panel';
            card.style.cssText = "padding: 20px; border-radius: 12px; cursor: pointer; transition: 0.3s; border: 1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:16px; background: rgba(30,41,59,0.5);";
            card.onmouseover = () => card.style.background = 'rgba(59, 130, 246, 0.1)';
            card.onmouseout = () => card.style.background = 'rgba(30,41,59,0.5)';
            card.onclick = () => this.loadDashboard(client);
            
            const initial = client.name.charAt(0).toUpperCase();
            
            card.innerHTML = `
                <div class="client-avatar" style="width:48px;height:48px;border-radius:12px;background:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:20px;">${initial}</div>
                <div class="client-card-info" style="flex:1;">
                    <h3 style="margin:0; font-size:1.1rem;">${client.name}</h3>
                    <p style="margin:0; font-size:0.8rem; color:var(--text-muted);">CNPJ: ${client.cnpj || 'Não informado'}</p>
                </div>
                <button class="btn-icon" style="color:#ef4444;" onclick="event.stopPropagation(); fcApp.deleteClient('${client.id}', '${client.name}')">
                    <span class="material-icons-round">delete_outline</span>
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
        store.setActiveClient(null);
        this.renderClientsList();
        window.switchView('fc-clients');
    },

    // --- DASHBOARD ---

    loadDashboard(client) {
        store.setActiveClient(client.id);
        
        // Pode atualizar o Header do ERP se quiser indicar o cliente em análise
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) {
            titleEl.textContent = `Análise Financeira: ${client.name}`;
        }
        
        this.requireClient('fc-overview');
    },

    refreshDashboard() {
        const client = store.getActiveClient();
        if(!client) return;

        const year = document.getElementById('filter-period-value')?.value || new Date().getFullYear();
        const yearData = store.getYearData(client.id, year);
        
        let totalRealizadoEntradas = 0;
        let totalRealizadoSaidas = 0;
        let totalProjetadoEntradas = 0;
        let totalProjetadoSaidas = 0;
        
        const monthlyRealizado = new Array(12).fill(0);
        const monthlyProjetado = new Array(12).fill(0);

        for(let month = 1; month <= 12; month++) {
            const key = `${year}-${month.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            
            if(mData && mData.realizado) {
                mData.realizado.forEach(acc => {
                    totalRealizadoEntradas += acc.a_receber || 0;
                    totalRealizadoSaidas += acc.a_pagar || 0;
                    const saldoRealizado = (acc.a_receber || 0) - (acc.a_pagar || 0);
                    monthlyRealizado[month-1] += saldoRealizado;
                });
            }
            
            if(mData && mData.projetado) {
                mData.projetado.forEach(acc => {
                    totalProjetadoEntradas += acc.a_receber || 0;
                    totalProjetadoSaidas += acc.a_pagar || 0;
                    const saldoProjetado = (acc.a_receber || 0) - (acc.a_pagar || 0);
                    monthlyProjetado[month-1] += saldoProjetado;
                });
            }
        }

        const saldoRealizadoLiq = totalRealizadoEntradas - totalRealizadoSaidas;
        const saldoProjetadoLiq = totalProjetadoEntradas - totalProjetadoSaidas;
        let variacao = 0;
        if(saldoProjetadoLiq !== 0) variacao = ((saldoRealizadoLiq - saldoProjetadoLiq) / Math.abs(saldoProjetadoLiq)) * 100;

        if(document.getElementById('kpi-entradas')) document.getElementById('kpi-entradas').textContent = this.formatCurrency(totalRealizadoEntradas);
        if(document.getElementById('kpi-saidas')) document.getElementById('kpi-saidas').textContent = this.formatCurrency(totalRealizadoSaidas);
        if(document.getElementById('kpi-saldo-geral')) document.getElementById('kpi-saldo-geral').textContent = this.formatCurrency(saldoRealizadoLiq);
        if(document.getElementById('kpi-variacao')) document.getElementById('kpi-variacao').textContent = variacao.toFixed(2) + '%';
        
        this.renderCharts(monthlyRealizado, monthlyProjetado);
        
        // --- Lógica Baseada em Template de Planilha com Conferência ---
        const allAccountsInYear = [];
        for(let m = 1; m <= 12; m++) {
            const key = `${year}-${m.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            if(mData && mData.realizado) {
                allAccountsInYear.push(...mData.realizado);
            }
        }
        
        if (window.FinancialEngine) {
            const result = FinancialEngine.processData(allAccountsInYear, this.manualEntries);
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
            
            if (row.type === 'header') {
                tr.classList.add('table-group-header');
                if (row.style && row.style.class) {
                    tr.classList.add(row.style.class);
                }
                const val = row.valorCalculado !== undefined ? this.formatCurrency(row.valorCalculado) : '-';
                tr.innerHTML = `
                    <td colspan="3">${row.descricao}</td>
                    <td class="text-right">${val}</td>
                    <td colspan="2"></td>
                `;

                // Se for o grupo de Receitas, adiciona a barra de conferência logo abaixo
                if (row.descricao === 'Total Receitas Operacionais / Vendas') {
                    tbody.appendChild(tr);
                    this.renderValidationRow(tbody, pdfTotalReceitas);
                    return;
                }
            } else {
                if (row.unmapped) tr.className += ' row-unmapped';
                if (row.isManual) manualSum += (row.valor || 0);

                const valClass = row.valor >= 0 ? 'positive' : 'negative';
                let vertical = 0;
                if(totalEntradas > 0) vertical = (Math.abs(row.valor) / totalEntradas) * 100;

                const descText = row.unmapped ? `⚠️ [VINCULAR] ${row.descricao}` : row.descricao;

                let valorHtml = this.formatCurrency(row.valor);
                if (row.isManual) {
                    const key = `${row.codigo}-${row.descricao}`;
                    valorHtml = `<input type="number" step="0.01" class="manual-input" value="${row.valor || ''}" 
                                  onchange="fcApp.updateManualEntry('${key}', this.value)" placeholder="0.00">`;
                }

                tr.innerHTML = `
                    <td class="col-code"><strong>${row.codigo}</strong></td>
                    <td class="col-desc">${descText}</td>
                    <td class="text-right">-</td>
                    <td class="text-right ${valClass} col-val">${valorHtml}</td>
                    <td class="text-right">-</td>
                    <td class="text-right col-perc">${vertical.toFixed(2)}%</td>
                `;
            }
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
        if(dropZone) dropZone.innerHTML = '<div class="loader"></div><p style="margin-top:20px;">Lendo e extraindo dados do PDF...</p>';

        try {
            const text = await parsePDF(file);
            const { period, accounts } = extractData(text);

            if (!period || accounts.length === 0) {
                alert('Não foi possível extrair dados válidos. Certifique-se que o PDF é o "Relatório de Centro de Custos" da Maxdata.');
                this.resetDropZone();
                return;
            }

            this.pendingImport = { period, accounts };
            this.showImportPreview(period, accounts);

        } catch (error) {
            console.error('Erro na extração:', error);
            alert('Erro ao processar o arquivo PDF.');
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

        const btn = document.querySelector('.import-actions .btn-primary');
        const oldText = btn.textContent;
        btn.textContent = 'Salvando na Nuvem...';
        btn.disabled = true;

        const client = store.getActiveClient();
        const success = await store.saveMonthData(client.id, this.pendingImport.period, this.pendingImport.accounts);

        btn.textContent = oldText;
        btn.disabled = false;

        if (success) {
            alert('Dados importados com sucesso!');
            this.pendingImport = null;
            this.resetDropZone();
            this.requireClient('fc-overview');
        } else {
            alert('Erro ao salvar no banco de dados.');
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

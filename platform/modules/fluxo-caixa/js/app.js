/**
 * Controlador principal da Aplicação UI e Lógica
 */

const app = {
    currentChart: null,
    pendingImport: null,

    async init() {
        this.bindEvents();
        
        // Populate period filter years
        const currentYear = new Date().getFullYear();
        const yearSelect = document.getElementById('filter-period-value');
        yearSelect.innerHTML = '';
        for(let y = currentYear - 1; y <= currentYear + 2; y++) {
            yearSelect.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
        }
        
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
                if (e.dataTransfer.files.length) {
                    this.handlePDFUpload(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handlePDFUpload(e.target.files[0]);
                }
            });
        }

        document.getElementById('filter-period-type').addEventListener('change', () => this.refreshDashboard());
        document.getElementById('filter-period-value').addEventListener('change', () => this.refreshDashboard());
    },

    showView(viewId) {
        document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
    },

    switchTab(tabId) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const links = document.querySelectorAll('.nav-item');
        for(let link of links) {
            if(link.getAttribute('onclick') && link.getAttribute('onclick').includes(tabId)) {
                link.classList.add('active');
            }
        }
        
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-' + tabId).classList.add('active');
        
        if (tabId === 'overview') this.refreshDashboard();
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
        if(!client) return;

        const year = document.getElementById('filter-period-value').value;
        const yearData = store.getYearData(client.id, year);
        
        let totalRealizadoEntradas = 0;
        let totalRealizadoSaidas = 0;
        let totalProjetadoEntradas = 0;
        let totalProjetadoSaidas = 0;
        
        const monthlyRealizado = new Array(12).fill(0);
        const monthlyProjetado = new Array(12).fill(0);
        const aggregatedAccounts = {};

        for(let month = 1; month <= 12; month++) {
            const key = `${year}-${month.toString().padStart(2, '0')}`;
            const mData = yearData[key];
            
            if(mData && mData.realizado) {
                mData.realizado.forEach(acc => {
                    totalRealizadoEntradas += acc.a_receber || 0;
                    totalRealizadoSaidas += acc.a_pagar || 0;
                    const saldoRealizado = (acc.a_receber || 0) - (acc.a_pagar || 0);
                    monthlyRealizado[month-1] += saldoRealizado;
                    
                    if(!aggregatedAccounts[acc.codigo]) aggregatedAccounts[acc.codigo] = { codigo: acc.codigo, descricao: acc.descricao, realizado: 0, projetado: 0 };
                    aggregatedAccounts[acc.codigo].realizado += saldoRealizado;
                });
            }
            
            if(mData && mData.projetado) {
                mData.projetado.forEach(acc => {
                    totalProjetadoEntradas += acc.a_receber || 0;
                    totalProjetadoSaidas += acc.a_pagar || 0;
                    const saldoProjetado = (acc.a_receber || 0) - (acc.a_pagar || 0);
                    monthlyProjetado[month-1] += saldoProjetado;
                    
                    if(!aggregatedAccounts[acc.codigo]) aggregatedAccounts[acc.codigo] = { codigo: acc.codigo, descricao: acc.descricao, realizado: 0, projetado: 0 };
                    aggregatedAccounts[acc.codigo].projetado += saldoProjetado;
                });
            }
        }

        const saldoRealizadoLiq = totalRealizadoEntradas - totalRealizadoSaidas;
        const saldoProjetadoLiq = totalProjetadoEntradas - totalProjetadoSaidas;
        let variacao = 0;
        if(saldoProjetadoLiq !== 0) variacao = ((saldoRealizadoLiq - saldoProjetadoLiq) / Math.abs(saldoProjetadoLiq)) * 100;

        document.getElementById('kpi-entradas').textContent = this.formatCurrency(totalRealizadoEntradas);
        document.getElementById('kpi-saidas').textContent = this.formatCurrency(totalRealizadoSaidas);
        document.getElementById('kpi-saldo').textContent = this.formatCurrency(saldoRealizadoLiq);
        document.getElementById('kpi-variacao').textContent = variacao.toFixed(2) + '%';
        
        this.renderCharts(monthlyRealizado, monthlyProjetado);
        this.renderFlowTable(aggregatedAccounts, totalRealizadoEntradas);
    },

    renderCharts(realizadoData, projetadoData) {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if(this.currentChart) this.currentChart.destroy();

        this.currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [
                    { label: 'Realizado (Saldo Lívquido)', data: realizadoData, backgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 4 },
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
    
    renderFlowTable(accountsMap, totalEntradas) {
        const tbody = document.getElementById('flow-table-body');
        tbody.innerHTML = '';
        
        const accounts = Object.values(accountsMap).sort((a,b) => a.codigo.localeCompare(b.codigo));
        if(accounts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Nenhum dado encontrado para o período selecionado.</td></tr>';
            return;
        }

        accounts.forEach(acc => {
            const tr = document.createElement('tr');
            let variacao = 0;
            if(acc.projetado !== 0) variacao = ((acc.realizado - acc.projetado) / Math.abs(acc.projetado)) * 100;
            
            let vertical = 0;
            if(totalEntradas > 0) vertical = (Math.abs(acc.realizado) / totalEntradas) * 100;

            const isEntrada = acc.codigo.startsWith('1.') || acc.codigo.startsWith('4.');
            const valClass = isEntrada ? 'positive' : 'negative';
            const valSign = acc.realizado >= 0 ? '' : '-';

            tr.innerHTML = `
                <td><strong>${acc.codigo}</strong></td>
                <td>${acc.descricao}</td>
                <td class="text-right">R$ ${acc.projetado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td class="text-right ${valClass}">${valSign}R$ ${Math.abs(acc.realizado).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td class="text-right ${variacao < 0 && !isEntrada ? 'positive' : (variacao < 0 ? 'negative' : 'positive')}">${variacao.toFixed(2)}%</td>
                <td class="text-right">${vertical.toFixed(2)}%</td>
            `;
            tbody.appendChild(tr);
        });
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
        document.getElementById('import-period').textContent = 'Período detectado: ' + result.periodo;
        
        const tbody = document.getElementById('import-preview-body');
        tbody.innerHTML = '';
        
        result.contas.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.codigo}</strong> ${c.descricao}</td>
                <td class="text-right positive">R$ ${c.a_receber.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td class="text-right negative">R$ ${c.a_pagar.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
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
    },

    async confirmImport() {
        if(!this.pendingImport) return;
        
        const btn = document.querySelector('.import-actions .btn-primary');
        const oldText = btn.textContent;
        btn.textContent = "Sincronizando com a Nuvem...";
        btn.disabled = true;
        
        const client = store.getActiveClient();
        const [mes, ano] = this.pendingImport.periodo.split('/');
        const periodKey = `${ano}-${mes}`;
        
        const success = await store.savePeriodData(client.id, periodKey, 'realizado', this.pendingImport.contas);
        
        btn.textContent = oldText;
        btn.disabled = false;
        
        if (success) {
            alert('Dados importados com sucesso!');
            this.cancelImport();
            this.switchTab('overview');
        } else {
            alert("Erro ao enviar dados para a nuvem.");
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
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Delay leve para garantir que o firebase inicializou caso seja remoto
    setTimeout(() => {
        app.init();
    }, 500);
});

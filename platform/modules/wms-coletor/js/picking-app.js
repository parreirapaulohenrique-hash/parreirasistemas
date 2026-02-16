// ===========================================
// WMS COLETOR - MÓDULO DE SEPARAÇÃO (PICKING)
// ===========================================

window.PickingApp = {
    currentWave: null,
    currentItemIndex: 0,

    init: function () {
        console.log('PickingApp init');
        this.renderWaveList();
    },

    /**
     * Lista de Ondas Disponíveis
     */
    renderWaveList: function () {
        const container = document.getElementById('screen-separar');
        if (!container) return;

        // Sync data (simulate)
        const waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
        const available = waves.filter(w => w.status === 'Em Separação' || w.status === 'Pendente');

        if (available.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">assignment_turned_in</span>
                    <p>Nenhuma onda de separação disponível.</p>
                    <button class="btn-primary" onclick="PickingApp.renderWaveList()">Atualizar</button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="list-container">
                <h3 style="padding:1rem; color:var(--text-primary);">Ondas Disponíveis</h3>
                ${available.map(w => `
                    <div class="card-item" onclick="PickingApp.startWave('${w.id}')">
                        <div class="card-header">
                            <span class="card-title">${w.description}</span>
                            <span class="status-badge status-${w.status === 'Pendente' ? 'warning' : 'pending'}">${w.status}</span>
                        </div>
                        <div class="card-body">
                            <p><strong>ID:</strong> ${w.id}</p>
                            <p><strong>Pedidos:</strong> ${w.orders.length}</p>
                            <p><strong>Itens:</strong> ${w.items.length}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Iniciar Separação
     */
    startWave: function (waveId) {
        const waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
        this.currentWave = waves.find(w => w.id === waveId);

        if (!this.currentWave) return;

        // Mark as "Em Separação" if not already
        if (this.currentWave.status === 'Pendente') {
            this.currentWave.status = 'Em Separação';
            this.saveWaves(waves);
        }

        this.currentItemIndex = 0;
        this.renderPickScreen();
    },

    /**
     * Tela de Separação (Passo a Passo)
     */
    renderPickScreen: function () {
        const container = document.getElementById('screen-separar');
        const item = this.currentWave.items[this.currentItemIndex];

        if (!item) {
            this.finishWaveScreen();
            return;
        }

        // Setup Scanner logic
        window.currentScanCallback = (code) => this.checkScan(code, item);

        container.innerHTML = `
            <div class="pick-screen">
                <div class="location-banner">
                    <span class="label">IR PARA:</span>
                    <span class="value">${item.locais[0]}</span>
                </div>
                
                <div class="product-card">
                    <div class="product-info">
                        <span class="sku">${item.sku}</span>
                        <h2 class="name">${item.nome}</h2>
                        <span class="unit">${item.unidade}</span>
                    </div>
                    
                    <div class="qty-control">
                        <span class="label">SEPARAR:</span>
                        <span class="value big">${item.qtdTotal}</span>
                    </div>

                    <div class="scan-area">
                        <input type="text" id="inputScan" placeholder="Bipe o produto..." onchange="window.currentScanCallback(this.value)">
                        <button class="btn-scan" onclick="document.getElementById('inputScan').focus()">
                            <span class="material-icons-round">qr_code_scanner</span>
                        </button>
                    </div>

                    <div class="actions">
                        <button class="btn-secondary" onclick="PickingApp.skipItem()">Pular</button>
                        <button class="btn-primary" onclick="PickingApp.confirmItemManual()">Confirmar Manual</button>
                    </div>
                </div>

                <div class="progress-bar">
                    <div class="fill" style="width: ${(this.currentItemIndex / this.currentWave.items.length) * 100}%"></div>
                    <span>${this.currentItemIndex + 1} / ${this.currentWave.items.length}</span>
                </div>
            </div>
        `;

        requestAnimationFrame(() => document.getElementById('inputScan').focus());
    },

    checkScan: function (code, item) {
        // Mock validation: Check if EAN or SKU matches
        // In real app, we check item.ean
        if (code === item.sku || code === item.ean || code.length > 3) {
            // Success
            this.nextItem();
        } else {
            alert('Código incorreto!');
            document.getElementById('inputScan').value = '';
            document.getElementById('inputScan').focus();
        }
    },

    confirmItemManual: function () {
        if (confirm('Confirmar separação deste item manualmente?')) {
            this.nextItem();
        }
    },

    skipItem: function () {
        // Move to end of list
        const item = this.currentWave.items.splice(this.currentItemIndex, 1)[0];
        this.currentWave.items.push(item);
        this.renderPickScreen();
    },

    nextItem: function () {
        this.currentItemIndex++;
        this.renderPickScreen();
    },

    finishWaveScreen: function () {
        const container = document.getElementById('screen-separar');
        container.innerHTML = `
            <div class="success-screen">
                <span class="material-icons-round big-icon">check_circle</span>
                <h1>Onda Finalizada!</h1>
                <p>Todos os itens foram separados.</p>
                <button class="btn-primary" onclick="PickingApp.completeWave()">Concluir</button>
            </div>
        `;
    },

    completeWave: function () {
        const waves = JSON.parse(localStorage.getItem('wms_waves') || '[]');
        const index = waves.findIndex(w => w.id === this.currentWave.id);
        if (index > -1) {
            waves[index].status = 'Conferência'; // Ready for checking
            this.saveWaves(waves);
        }

        alert('Separação concluída! Encaminhe para a bancada de conferência.');
        this.renderWaveList();
    },

    saveWaves: function (waves) {
        localStorage.setItem('wms_waves', JSON.stringify(waves));
    }
};

// Hook into the main navigation
document.addEventListener('navigateTo', function (e) {
    if (e.detail.screen === 'separar') {
        PickingApp.init();
    }
});

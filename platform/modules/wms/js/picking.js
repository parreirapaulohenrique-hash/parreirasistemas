// ===========================================
// WMS - GESTÃO DE ONDAS DE SEPARAÇÃO (WAVES)
// ===========================================

// LocalStorage Keys
const STORAGE_KEY_WAVES = 'wms_waves';
const STORAGE_KEY_ORDERS = 'erp_vendas'; // Sync from ERP
const STORAGE_KEY_STOCK = 'wms_stock';

window.PickingManager = {

    /**
     * Lista pedidos pendentes de separação
     */
    getPendingOrders: function () {
        const orders = JSON.parse(localStorage.getItem(STORAGE_KEY_ORDERS) || '[]');
        // Filter orders that are approved/integrated but not yet in a wave or shipped
        return orders.filter(o => o.status === 'Aprovado' || o.status === 'Pendente WMS');
    },

    /**
     * Cria uma nova Onda de Separação
     * @param {Array} orderIds - IDs dos pedidos
     * @param {String} description - Descrição (ex: "Rota MG - Manhã")
     */
    createWave: function (orderIds, description) {
        if (!orderIds || orderIds.length === 0) return { success: false, message: 'Nenhum pedido selecionado.' };

        const waves = JSON.parse(localStorage.getItem(STORAGE_KEY_WAVES) || '[]');
        const orders = JSON.parse(localStorage.getItem(STORAGE_KEY_ORDERS) || '[]');

        // Validate Orders
        const selectedOrders = orders.filter(o => orderIds.includes(o.id));

        // Create Wave
        const wave = {
            id: 'wave_' + Date.now(),
            description: description || `Onda ${new Date().toLocaleTimeString()}`,
            orders: selectedOrders.map(o => ({ id: o.id, numero: o.numero, cliente: o.cliente })),
            status: 'Pendente', // Pendente, Em Separação, Conferência, Finalizada
            createdAt: new Date().toISOString(),
            items: this.consolidateItems(selectedOrders)
        };

        // Update Orders Status
        selectedOrders.forEach(o => {
            o.status = 'Em Separação';
            o.waveId = wave.id;
        });

        waves.push(wave);
        localStorage.setItem(STORAGE_KEY_WAVES, JSON.stringify(waves));
        localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));

        return { success: true, wave };
    },

    /**
     * Consolida itens de múltiplos pedidos para otimizar separação
     */
    consolidateItems: function (orders) {
        const itemsMap = {};

        orders.forEach(order => {
            if (order.itens) {
                order.itens.forEach(item => {
                    const key = item.sku;
                    if (!itemsMap[key]) {
                        itemsMap[key] = {
                            sku: item.sku,
                            nome: item.nome,
                            qtdTotal: 0,
                            unidade: item.unidade,
                            locais: this.findStockLocations(item.sku) // Mock generic location
                        };
                    }
                    itemsMap[key].qtdTotal += item.qtd;
                });
            }
        });

        // Convert to Array and Sort by Location
        return Object.values(itemsMap).sort((a, b) => (a.locais[0] || '').localeCompare(b.locais[0] || ''));
    },

    findStockLocations: function (sku) {
        // Mock Location Logic - In real WMS, query wms_stock
        // Here we simulate standard picking path
        const zone = sku.substring(0, 1).toUpperCase() || 'A';
        const aisle = Math.floor(Math.random() * 10) + 1;
        return [`${zone}-${String(aisle).padStart(2, '0')}-01`];
    },

    /**
     * Renderiza a lista de ondas
     */
    renderWavesGrid: function () {
        const tbody = document.getElementById('wavesTableBody');
        if (!tbody) return;

        const waves = JSON.parse(localStorage.getItem(STORAGE_KEY_WAVES) || '[]');
        waves.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (waves.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">Nenhuma onda de separação criada.</td></tr>`;
            return;
        }

        tbody.innerHTML = waves.map(w => `
            <tr>
                <td><strong>${w.id}</strong></td>
                <td>${w.description}</td>
                <td>${w.orders.length} pedidos</td>
                <td>${w.items.length} skus</td>
                <td><span class="status-badge ${this.getStatusClass(w.status)}">${w.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-sm btn-primary" onclick="window.PickingManager.printPickList('${w.id}')">
                        <span class="material-icons-round">print</span> Lista
                    </button>
                    ${w.status === 'Pendente' ? `
                    <button class="btn btn-sm btn-success" onclick="window.PickingManager.startWave('${w.id}')">
                        <span class="material-icons-round">play_arrow</span> Iniciar
                    </button>` : ''}
                </td>
            </tr>
        `).join('');
    },

    getStatusClass: function (status) {
        switch (status) {
            case 'Pendente': return 'status-warning';
            case 'Em Separação': return 'status-pending';
            case 'Finalizada': return 'status-success';
            default: return 'status-secondary';
        }
    },

    printPickList: function (waveId) {
        const waves = JSON.parse(localStorage.getItem(STORAGE_KEY_WAVES) || '[]');
        const wave = waves.find(w => w.id === waveId);
        if (!wave) return;

        // Generate simple HTML for printing
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head>
                <title>Lista de Separação - ${wave.id}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    .header { margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Lista de Separação Consolidada</h1>
                    <p><strong>Onda:</strong> ${wave.id} - ${wave.description}</p>
                    <p><strong>Pedidos:</strong> ${wave.orders.map(o => o.numero).join(', ')}</p>
                    <p><strong>Data:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Local</th>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th>Qtd Total</th>
                            <th>UN</th>
                            <th>Check</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${wave.items.map(item => `
                            <tr>
                                <td style="font-weight:bold; font-size:1.2em;">${item.locais.join(', ')}</td>
                                <td>${item.sku}</td>
                                <td>${item.nome}</td>
                                <td style="font-weight:bold; font-size:1.2em;">${item.qtdTotal}</td>
                                <td>${item.unidade}</td>
                                <td>[ ]</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `);
        win.document.close();
        win.print();
    },

    startWave: function (waveId) {
        if (!confirm('Iniciar separação desta onda? Isso irá liberá-la para os coletores.')) return;

        const waves = JSON.parse(localStorage.getItem(STORAGE_KEY_WAVES) || '[]');
        const wave = waves.find(w => w.id === waveId);
        if (wave) {
            wave.status = 'Em Separação';
            // Mock assignment to a collector
            wave.assignedTo = 'COLETOR_01';
            localStorage.setItem(STORAGE_KEY_WAVES, JSON.stringify(waves));
            this.renderWavesGrid();
            alert('Onda iniciada e enviada para os coletores!');
        }
    }
};

window.renderPickingDashboard = function () {
    window.PickingManager.renderWavesGrid();

    // Also render pending orders for selection (Mock)
    const pending = window.PickingManager.getPendingOrders();
    // Logic to show pending list...
};

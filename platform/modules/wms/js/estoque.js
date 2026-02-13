// WMS Estoque - Stock queries
// est-consulta: Search by SKU/description
// est-endereco: Search by address

window.loadEstoqueView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    if (viewId === 'est-consulta') {
        renderConsultaEstoque(container);
    } else if (viewId === 'est-endereco') {
        renderConsultaEndereco(container);
    }
};

// --- Stock Manager (Persistence Layer) ---
window.StockManager = {
    getData: () => JSON.parse(localStorage.getItem('wms_mock_data') || '{"addresses":[]}'),

    saveData: (data) => localStorage.setItem('wms_mock_data', JSON.stringify(data)),

    // Log Transaction (Kardex)
    logTransaction: function (type, sku, qty, doc, reason) {
        const logs = JSON.parse(localStorage.getItem('wms_kardex') || '[]');
        const user = JSON.parse(localStorage.getItem('logged_user') || '{"login":"system"}');
        logs.unshift({
            id: `LOG-${Date.now()}`,
            data: new Date().toISOString(),
            tipo: type, // 'ENTRADA', 'SAIDA', 'AJUSTE'
            sku: sku,
            qtd: qty,
            doc: doc || '-',
            motivo: reason || '-',
            usuario: user.login || 'system'
        });
        // Limit log size to 1000
        if (logs.length > 1000) logs.pop();
        localStorage.setItem('wms_kardex', JSON.stringify(logs));
    },

    // Add stock to a location (Receiving)
    add: function (sku, qty, locationId, desc = '', unit = 'UN', docRef = '') {
        const data = this.getData();
        const addrIndex = data.addresses.findIndex(a => (a.id || a.address) === locationId);

        if (addrIndex >= 0) {
            const addr = data.addresses[addrIndex];
            // If already occupied by same SKU, add qty
            if (addr.status === 'OCUPADO' && addr.sku === sku) {
                addr.qty = (addr.qty || 0) + qty;
            } else {
                // Overwrite or fill empty
                addr.status = 'OCUPADO';
                addr.sku = sku;
                addr.product = desc; // Store description
                addr.qty = qty;
                addr.unit = unit;
                addr.lote = `L${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`;
                addr.validade = '';
            }
            this.saveData(data);
            this.logTransaction('ENTRADA', sku, qty, docRef, `Armazenagem em ${locationId}`);
            return true;
        }
        return false;
    },

    // Check available stock (Qty - Reserved)
    getAvailable: function (sku) {
        const data = this.getData();
        return data.addresses
            .filter(a => a.sku === sku && a.status === 'OCUPADO')
            .reduce((sum, a) => sum + (a.qty - (a.reserved || 0)), 0);
    },

    // Reserve stock (Picking)
    reserve: function (sku, qty) {
        const data = this.getData();
        let remaining = qty;

        // Find locations with this SKU, sorted by FIFO or Lote (simplified: just list)
        const candidates = data.addresses.filter(a => a.sku === sku && a.status === 'OCUPADO' && (a.qty - (a.reserved || 0)) > 0);

        for (const addr of candidates) {
            if (remaining <= 0) break;

            const available = addr.qty - (addr.reserved || 0);
            const take = Math.min(available, remaining);

            addr.reserved = (addr.reserved || 0) + take;
            remaining -= take;
        }

        this.saveData(data);
        return remaining === 0; // True if fully reserved
    },

    // Commit stock (Shipment - Decrement)
    commit: function (sku, qty, docRef = '') {
        const data = this.getData();
        let remaining = qty;

        const candidates = data.addresses.filter(a => a.sku === sku && a.status === 'OCUPADO');

        for (const addr of candidates) {
            if (remaining <= 0) break;

            // Prioritize reserved stock
            if (addr.reserved > 0) {
                const take = Math.min(addr.reserved, remaining);
                addr.reserved -= take;
                addr.qty -= take;
                remaining -= take;
            } else if (addr.qty > 0) {
                const take = Math.min(addr.qty, remaining);
                addr.qty -= take;
                remaining -= take;
            }

            // Free up address if empty
            if (addr.qty <= 0) {
                addr.status = 'LIVRE';
                delete addr.sku;
                delete addr.product;
                delete addr.qty;
                delete addr.reserved;
                delete addr.lote;
            }
        }

        this.saveData(data);
        this.logTransaction('SAIDA', sku, qty, docRef || '-', 'Expedição/Picking');
    },

    // Get aggregated stock for view
    getStockList: function () {
        const data = this.getData();
        const stockMap = {};

        data.addresses.forEach(a => {
            if (a.status === 'OCUPADO' && a.sku) {
                // Aggregated view not used by renderConsultaEstoque anymore, 
                // but useful for API. 
                // However, renderConsultaEstoque expects a flat list of lots/locations.
            }
        });

        // Return flat list of occupied addresses for the table
        return data.addresses
            .filter(a => a.status === 'OCUPADO' && a.sku)
            .map(a => ({
                sku: a.sku,
                desc: a.product || 'Produto Sem Nome',
                endereco: a.id || a.address,
                saldo: a.qty || 0,
                unidade: a.unit || 'UN',
                status: a.blocked ? 'BLOQUEADO' : 'DISPONÍVEL', // Using 'blocked' flag if exists
                lote: a.lote || '-',
                validade: a.validade || ''
            }));
    }
};

// --- Mock stock data (Replaced by Real Data) ---
function getMockStock() {
    // Seed initial data if empty
    const stock = window.StockManager.getStockList();
    if (stock.length === 0) {
        // Optional: seed some random data one time if needed, 
        // but better to start clean or let Inbound populate it.
        // For now, return empty to respect "Real Mode".
        return [];
    }
    return stock;
}

// --- CONSULTA DE ESTOQUE (by SKU) ---
function renderConsultaEstoque(container) {
    const stock = getMockStock();

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">search</span>
                    Consulta de Estoque
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${stock.length} produtos</span>
            </div>
            <div style="padding:1rem 1.5rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center; border-bottom:1px solid var(--border-color);">
                <input id="est-search-sku" type="text" placeholder="Buscar por SKU ou Descrição..."
                    style="flex:1; min-width:250px; padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem; outline:none;"
                    oninput="filterEstoque()">
                <select id="est-filter-status" onchange="filterEstoque()"
                    style="padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem; outline:none;">
                    <option value="">Todos Status</option>
                    <option value="DISPONÍVEL">Disponível</option>
                    <option value="QUARENTENA">Quarentena</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                </select>
                <button onclick="filterEstoque()" style="padding:0.6rem 1.2rem; background:var(--primary-color); color:white;
                    border:none; border-radius:var(--radius-md); cursor:pointer; font-size:0.85rem; font-weight:500;">
                    <span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">search</span> Buscar
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table" id="est-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Descrição</th>
                            <th>Endereço</th>
                            <th style="text-align:right;">Saldo</th>
                            <th>UN</th>
                            <th>Lote</th>
                            <th>Validade</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="est-tbody"></tbody>
                </table>
            </div>
        </div>

        <!-- Summary Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem;">
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Total SKUs</div>
                <div style="font-size:1.3rem; font-weight:700;">${stock.length}</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Saldo Total</div>
                <div style="font-size:1.3rem; font-weight:700;">${stock.reduce((s, p) => s + p.saldo, 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Disponíveis</div>
                <div style="font-size:1.3rem; font-weight:700; color:#10b981;">${stock.filter(p => p.status === 'DISPONÍVEL').length}</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Quarentena</div>
                <div style="font-size:1.3rem; font-weight:700; color:#f59e0b;">${stock.filter(p => p.status === 'QUARENTENA').length}</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Bloqueados</div>
                <div style="font-size:1.3rem; font-weight:700; color:#ef4444;">${stock.filter(p => p.status === 'BLOQUEADO').length}</div>
            </div>
        </div>
    `;

    // Store for filtering
    window._estoqueData = stock;
    filterEstoque();
}

window.filterEstoque = function () {
    const search = (document.getElementById('est-search-sku')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('est-filter-status')?.value || '';
    const stock = window._estoqueData || [];
    const tbody = document.getElementById('est-tbody');
    if (!tbody) return;

    const filtered = stock.filter(p => {
        const matchSearch = !search || p.sku.toLowerCase().includes(search) || p.desc.toLowerCase().includes(search);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
    });

    tbody.innerHTML = filtered.map(p => {
        const statusColor = p.status === 'DISPONÍVEL' ? '#10b981' : p.status === 'QUARENTENA' ? '#f59e0b' : '#ef4444';
        const statusBg = p.status === 'DISPONÍVEL' ? 'rgba(16,185,129,0.12)' : p.status === 'QUARENTENA' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
        return `
            <tr>
                <td style="font-weight:600; font-family:monospace;">${p.sku}</td>
                <td>${p.desc}</td>
                <td style="font-family:monospace; font-size:0.8rem;">${p.endereco}</td>
                <td style="text-align:right; font-weight:600;">${p.saldo.toLocaleString('pt-BR')}</td>
                <td>${p.unidade}</td>
                <td style="font-size:0.8rem;">${p.lote}</td>
                <td style="font-size:0.8rem;">${p.validade || '-'}</td>
                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                    background:${statusBg}; color:${statusColor};">${p.status}</span></td>
            </tr>`;
    }).join('');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum produto encontrado.</td></tr>`;
    }
};

// --- CONSULTA POR ENDEREÇO ---
function renderConsultaEndereco(container) {
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const addresses = mockData.addresses || [];
    const stock = getMockStock();

    // Get unique streets
    const streets = [...new Set(addresses.map(a => a.street || a.rua || (a.id ? a.id.split('-')[0] : 'N/A')))].sort();

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">location_on</span>
                    Consulta por Endereço
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${addresses.length} endereços</span>
            </div>
            <div style="padding:1rem 1.5rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center; border-bottom:1px solid var(--border-color);">
                <input id="end-search" type="text" placeholder="Buscar por endereço (ex: 01-01-0101)..."
                    style="flex:1; min-width:250px; padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem; outline:none;"
                    oninput="filterEnderecos()">
                <select id="end-filter-rua" onchange="filterEnderecos()"
                    style="padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem; outline:none;">
                    <option value="">Todas as Ruas</option>
                    ${streets.map(s => `<option value="${s}">Rua ${s}</option>`).join('')}
                </select>
                <select id="end-filter-status" onchange="filterEnderecos()"
                    style="padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem; outline:none;">
                    <option value="">Todos Status</option>
                    <option value="LIVRE">Livre</option>
                    <option value="OCUPADO">Ocupado</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                </select>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table" id="end-table">
                    <thead>
                        <tr>
                            <th>Endereço</th>
                            <th>Rua</th>
                            <th>Prédio</th>
                            <th>Nível</th>
                            <th>Status</th>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th style="text-align:right;">Qtd</th>
                        </tr>
                    </thead>
                    <tbody id="end-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    // Enrich addresses with stock data
    window._enderecoData = addresses.map(a => {
        const addrId = a.id || a.address || `${a.street || a.rua}-${a.building || a.predio}-${a.level || a.andar}${a.position || a.posicao}`;
        const stockItem = stock.find(s => s.endereco === addrId);
        return {
            id: addrId,
            rua: a.street || a.rua || addrId.split('-')[0] || '-',
            predio: a.building || a.predio || addrId.split('-')[1] || '-',
            nivel: a.level || a.andar || '-',
            status: a.status || 'LIVRE',
            sku: stockItem ? stockItem.sku : '-',
            produto: stockItem ? stockItem.desc : '-',
            qtd: stockItem ? stockItem.saldo : 0
        };
    });

    // If no addresses from storage, show sample
    if (window._enderecoData.length === 0) {
        window._enderecoData = stock.map(s => ({
            id: s.endereco,
            rua: s.endereco.split('-')[0],
            predio: s.endereco.split('-')[1],
            nivel: s.endereco.split('-')[2]?.substring(0, 2) || '-',
            status: 'OCUPADO',
            sku: s.sku,
            produto: s.desc,
            qtd: s.saldo
        }));
    }

    filterEnderecos();
}

window.filterEnderecos = function () {
    const search = (document.getElementById('end-search')?.value || '').toLowerCase();
    const ruaFilter = document.getElementById('end-filter-rua')?.value || '';
    const statusFilter = document.getElementById('end-filter-status')?.value || '';
    const data = window._enderecoData || [];
    const tbody = document.getElementById('end-tbody');
    if (!tbody) return;

    const filtered = data.filter(e => {
        const matchSearch = !search || e.id.toLowerCase().includes(search);
        const matchRua = !ruaFilter || e.rua === ruaFilter;
        const matchStatus = !statusFilter || e.status === statusFilter;
        return matchSearch && matchRua && matchStatus;
    });

    tbody.innerHTML = filtered.map(e => {
        const statusColor = e.status === 'LIVRE' ? '#10b981' : e.status === 'OCUPADO' ? '#3b82f6' : '#ef4444';
        const statusBg = e.status === 'LIVRE' ? 'rgba(16,185,129,0.12)' : e.status === 'OCUPADO' ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)';
        return `
            <tr>
                <td style="font-weight:600; font-family:monospace;">${e.id}</td>
                <td>Rua ${e.rua}</td>
                <td>Prédio ${e.predio}</td>
                <td>${e.nivel}</td>
                <td><span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:600;
                    background:${statusBg}; color:${statusColor};">${e.status}</span></td>
                <td style="font-family:monospace; font-size:0.8rem;">${e.sku}</td>
                <td>${e.produto}</td>
                <td style="text-align:right; font-weight:600;">${e.qtd > 0 ? e.qtd.toLocaleString('pt-BR') : '-'}</td>
            </tr>`;
    }).join('');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum endereço encontrado.</td></tr>`;
    }
};

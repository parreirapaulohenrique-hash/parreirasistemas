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

// --- Mock stock data (generates from addresses + products) ---
function getMockStock() {
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data') || '{}');
    const addresses = mockData.addresses || [];

    // If no addresses, return sample data
    if (addresses.length === 0) {
        return [
            { sku: 'SKU-0001', desc: 'Parafuso Phillips M6x30', endereco: '01-01-0101', saldo: 250, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-001', validade: '2027-06-15' },
            { sku: 'SKU-0002', desc: 'Porca Sextavada M6', endereco: '01-01-0102', saldo: 480, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-002', validade: '2027-12-01' },
            { sku: 'SKU-0003', desc: 'Arruela Lisa 1/4"', endereco: '01-02-0201', saldo: 1200, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-003', validade: '2028-03-20' },
            { sku: 'SKU-0004', desc: 'Óleo Lubrificante WD-40 300ml', endereco: '01-03-0101', saldo: 35, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-010', validade: '2027-01-10' },
            { sku: 'SKU-0005', desc: 'Fita Isolante 3M 20m', endereco: '01-03-0102', saldo: 150, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-011', validade: '2028-08-25' },
            { sku: 'SKU-0006', desc: 'Chave Allen 5mm Tramontina', endereco: '02-01-0101', saldo: 42, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-020', validade: '' },
            { sku: 'SKU-0007', desc: 'Broca HSS 8mm Bosch', endereco: '02-01-0201', saldo: 80, unidade: 'UN', status: 'QUARENTENA', lote: 'L2026-021', validade: '' },
            { sku: 'SKU-0008', desc: 'Lixa d\'água 220 Norton', endereco: '02-02-0101', saldo: 300, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-030', validade: '2027-11-30' },
            { sku: 'SKU-0009', desc: 'Disco de Corte 7" DeWalt', endereco: '02-02-0301', saldo: 22, unidade: 'UN', status: 'DISPONÍVEL', lote: 'L2026-031', validade: '' },
            { sku: 'SKU-0010', desc: 'Cimento Cola AC-III 20kg', endereco: '03-01-0101', saldo: 15, unidade: 'SC', status: 'DISPONÍVEL', lote: 'L2026-040', validade: '2026-09-01' },
            { sku: 'SKU-0011', desc: 'Tinta Acrílica Branca 18L', endereco: '03-01-0201', saldo: 8, unidade: 'BD', status: 'DISPONÍVEL', lote: 'L2026-041', validade: '2027-04-15' },
            { sku: 'SKU-0012', desc: 'Massa Corrida PVA 25kg', endereco: '03-02-0101', saldo: 5, unidade: 'BD', status: 'BLOQUEADO', lote: 'L2026-042', validade: '2026-07-20' },
        ];
    }

    // Generate stock from occupied addresses
    const products = [
        'Parafuso Phillips M6x30', 'Porca Sextavada M6', 'Arruela Lisa 1/4"',
        'Óleo Lubrificante WD-40', 'Fita Isolante 3M', 'Chave Allen 5mm',
        'Broca HSS 8mm', 'Lixa d\'água 220', 'Disco de Corte 7"',
        'Cimento Cola AC-III', 'Tinta Acrílica 18L', 'Massa Corrida PVA'
    ];

    return addresses
        .filter(a => a.status === 'OCUPADO')
        .map((a, i) => ({
            sku: `SKU-${String(i + 1).padStart(4, '0')}`,
            desc: products[i % products.length],
            endereco: a.id || a.address || `${a.street || a.rua}-${a.building || a.predio}-${a.level || a.andar}${a.position || a.posicao}`,
            saldo: Math.floor(Math.random() * 500) + 10,
            unidade: 'UN',
            status: Math.random() > 0.9 ? 'QUARENTENA' : 'DISPONÍVEL',
            lote: `L2026-${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`,
            validade: Math.random() > 0.5 ? `2027-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-15` : ''
        }));
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

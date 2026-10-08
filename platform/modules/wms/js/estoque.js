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
    } else if (viewId === 'est-kardex') {
        renderKardexView(container);
    } else if (viewId === 'est-reabastecimento') {
        renderReabastecimentoView(container);
    }
};

// --- Stock Manager (Persistence Layer) ---
window.StockManager = {
    getData: function () {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const raw = localStorage.getItem('wms_mock_data' + suf);
        if (!raw) return { addresses: [] };
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return { addresses: parsed };
            }
            if (parsed && Array.isArray(parsed.addresses)) {
                return parsed;
            }
            return { addresses: [] };
        } catch (e) {
            return { addresses: [] };
        }
    },

    saveData: function (data) {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const addrs = Array.isArray(data) ? data : (data && Array.isArray(data.addresses) ? data.addresses : []);
        localStorage.setItem('wms_mock_data' + suf, JSON.stringify(addrs));
    },

    // Log Transaction (Kardex Local + Firestore)
    logTransaction: function (type, sku, qty, doc, reason, endereco = '-') {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const logs = JSON.parse(localStorage.getItem('wms_kardex' + suf) || '[]');
        const user = (typeof ParreiraAuth !== 'undefined' && ParreiraAuth.getSessao) ? ParreiraAuth.getSessao() : JSON.parse(localStorage.getItem('logged_user') || '{"login":"system"}');
        const id = `LOG-${Date.now()}`;
        const entry = {
            id,
            data: new Date().toISOString(),
            tipo: type, // 'ENTRADA', 'SAIDA', 'AJUSTE', 'PICKING', 'REABASTECIMENTO'
            sku: sku,
            qtd: qty,
            endereco: endereco,
            doc: doc || '-',
            motivo: reason || '-',
            usuario: user.nome || user.login || 'system'
        };
        logs.unshift(entry);
        if (logs.length > 1000) logs.pop();
        localStorage.setItem('wms_kardex' + suf, JSON.stringify(logs));

        // Sincronização em nuvem Firestore (resiliente)
        if (window.WmsStore && window.WmsStore.registrarKardex) {
            window.WmsStore.registrarKardex(entry).catch(e => console.warn('[Kardex] Falha ao registrar log no Firestore:', e.message));
        }
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

        // Sincroniza baixa atômica no Firestore
        if (window.WmsStore && window.WmsStore.efetivarBaixaEstoque) {
            window.WmsStore.efetivarBaixaEstoque(sku, qty, docRef).catch(() => {});
        }
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
    const mockData = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
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

// =============================================================================
// TELA KARDEX DE AUDITORIA (HISTÓRICO EM NUVEM)
// =============================================================================
window.renderKardexView = async function (container) {
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:220px;gap:.75rem;color:var(--text-secondary);">
            <span class="material-icons-round" style="animation:spin 1s linear infinite; font-size:1.6rem;">refresh</span>
            Carregando Kardex de auditoria...
        </div>
    `;

    const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
    let logs = [];

    // Tenta nuvem primeiro
    try {
        if (window.WmsStore && window.WmsStore.listarKardex) {
            logs = await window.WmsStore.listarKardex({ limite: 200 });
        }
    } catch (_) {}

    // Fallback local
    if (!logs || logs.length === 0) {
        logs = JSON.parse(localStorage.getItem('wms_kardex' + suf) || '[]');
    }

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="font-size:0.95rem; font-weight:600; margin:0;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#3b82f6;">history</span>
                    Kardex de Movimentações (Auditoria Multi-Tenant)
                </h3>
                <span style="font-size:0.75rem; color:var(--text-secondary);">${logs.length} registros</span>
            </div>

            <div style="padding:1rem 1.5rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center; border-bottom:1px solid var(--border-color);">
                <input id="kdx-search" type="text" placeholder="Buscar por SKU, motivo ou usuário..."
                    style="flex:1; min-width:240px; padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem;"
                    oninput="filterKardex()">
                <select id="kdx-filter-tipo" onchange="filterKardex()"
                    style="padding:0.6rem 1rem; border:1px solid var(--border-color); border-radius:var(--radius-md);
                    background:var(--bg-card); color:var(--text-primary); font-size:0.85rem;">
                    <option value="">Todos os Tipos</option>
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                    <option value="AJUSTE">Ajuste / Inventário</option>
                    <option value="PICKING">Picking / Separação</option>
                    <option value="REABASTECIMENTO">Reabastecimento</option>
                </select>
                <button class="btn btn-secondary" onclick="renderKardexView(document.getElementById('view-dynamic'))" style="font-size:.8rem; padding:.5rem .9rem;">
                    <span class="material-icons-round" style="font-size:1rem;">refresh</span>
                </button>
            </div>

            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Data/Hora</th>
                            <th>Tipo</th>
                            <th>SKU</th>
                            <th>Endereço</th>
                            <th style="text-align:right;">Quantidade</th>
                            <th>Documento</th>
                            <th>Motivo</th>
                            <th>Operador</th>
                        </tr>
                    </thead>
                    <tbody id="kdx-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    window._kardexData = logs;
    filterKardex();
};

window.filterKardex = function () {
    const search = (document.getElementById('kdx-search')?.value || '').toLowerCase();
    const tipo = document.getElementById('kdx-filter-tipo')?.value || '';
    const logs = window._kardexData || [];
    const tbody = document.getElementById('kdx-tbody');
    if (!tbody) return;

    const filtered = logs.filter(l => {
        const mSearch = !search || (l.sku || '').toLowerCase().includes(search) || (l.motivo || '').toLowerCase().includes(search) || (l.usuario || '').toLowerCase().includes(search);
        const mTipo = !tipo || (l.tipo || '').toUpperCase() === tipo.toUpperCase();
        return mSearch && mTipo;
    });

    tbody.innerHTML = filtered.map(l => {
        const t = (l.tipo || 'AJUSTE').toUpperCase();
        const color = t === 'ENTRADA' ? '#10b981' : t === 'SAIDA' ? '#ef4444' : t === 'REABASTECIMENTO' ? '#3b82f6' : '#f59e0b';
        const d = l.data ? new Date(l.data).toLocaleString('pt-BR') : '-';
        return `
            <tr>
                <td style="font-size:0.78rem; font-family:monospace;">${d}</td>
                <td><span style="padding:2px 8px; border-radius:10px; font-size:0.68rem; font-weight:700; background:${color}18; color:${color};">${t}</span></td>
                <td style="font-weight:600; font-family:monospace;">${l.sku}</td>
                <td style="font-family:monospace; font-size:0.8rem;">${l.endereco || '-'}</td>
                <td style="text-align:right; font-weight:700; color:${color};">${t === 'SAIDA' ? '-' : '+'}${Number(l.qtd).toLocaleString('pt-BR')}</td>
                <td style="font-size:0.8rem;">${l.doc || '-'}</td>
                <td style="font-size:0.82rem;">${l.motivo || '-'}</td>
                <td style="font-size:0.78rem; color:var(--text-secondary);">${l.usuario || 'system'}</td>
            </tr>
        `;
    }).join('');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum lançamento no Kardex.</td></tr>`;
    }
};

// =============================================================================
// TELA REABASTECIMENTO AUTOMÁTICO (PULMÃO ➔ PICKING)
// =============================================================================
window.renderReabastecimentoView = async function (container) {
    container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:220px;gap:.75rem;color:var(--text-secondary);">
            <span class="material-icons-round" style="animation:spin 1s linear infinite; font-size:1.6rem;">refresh</span>
            Calculando necessidades de reabastecimento...
        </div>
    `;

    let ordens = [];
    if (window.WmsStore) {
        try {
            await window.WmsStore.verificarGatilhosReabastecimento();
            ordens = await window.WmsStore.listarOrdensReabastecimento();
        } catch (_) {}
    }

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3 style="font-size:0.95rem; font-weight:600; margin:0;">
                        <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:#f59e0b;">swap_vert</span>
                        Motor de Reabastecimento Contínuo (Pulmão ➔ Picking)
                    </h3>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                        Geração automática de ordens de descida de paletes para empilhadeiristas
                    </div>
                </div>
                <button class="btn btn-primary" onclick="renderReabastecimentoView(document.getElementById('view-dynamic'))" style="font-size:.8rem; padding:.5rem 1rem;">
                    <span class="material-icons-round" style="font-size:1rem;">sync</span> Recalcular Níveis
                </button>
            </div>

            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Ordem</th>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th>Origem (Pulmão)</th>
                            <th>Destino (Picking)</th>
                            <th style="text-align:right;">Qtd Sugerida</th>
                            <th>Prioridade</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ordens.length > 0 ? ordens.map(o => `
                            <tr>
                                <td style="font-weight:700; font-family:monospace;">${o.id}</td>
                                <td style="font-weight:600; font-family:monospace;">${o.sku}</td>
                                <td>${o.produto}</td>
                                <td style="font-family:monospace; color:#3b82f6; font-weight:700;">${o.origemEndereco}</td>
                                <td style="font-family:monospace; color:#10b981; font-weight:700;">${o.destinoEndereco}</td>
                                <td style="text-align:right; font-weight:700;">${o.qtdSugerida} un</td>
                                <td><span style="padding:2px 8px; border-radius:10px; font-size:.7rem; font-weight:700; background:rgba(239,68,68,0.12); color:#ef4444;">${o.prioridade}</span></td>
                                <td><span style="padding:2px 8px; border-radius:10px; font-size:.7rem; font-weight:700; background:rgba(245,158,11,0.12); color:#f59e0b;">${o.status}</span></td>
                                <td>
                                    ${o.status === 'PENDENTE' ? `
                                        <button class="btn btn-secondary" onclick="concluirReabastecimentoManual('${o.id}')" style="font-size:.75rem; padding:.3rem .6rem;">
                                            Concluir
                                        </button>
                                    ` : '<span style="font-size:.75rem; color:#10b981;">Concluído</span>'}
                                </td>
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="9" style="text-align:center; padding:3rem; color:var(--text-secondary);">
                                    <span class="material-icons-round" style="font-size:2rem; opacity:.4; display:block; margin-bottom:.5rem;">check_circle</span>
                                    Todos os endereços de picking operam com saldo acima do estoque mínimo!
                                </td>
                            </tr>
                        `}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

window.concluirReabastecimentoManual = async function (id) {
    if (!confirm('Confirmar movimentação e conclusão do reabastecimento?')) return;
    if (window.WmsStore && window.WmsStore.atualizarOrdemReabastecimento) {
        await window.WmsStore.atualizarOrdemReabastecimento(id, { status: 'CONCLUIDO', concluidoEm: new Date().toISOString() });
    }
    renderReabastecimentoView(document.getElementById('view-dynamic'));
};


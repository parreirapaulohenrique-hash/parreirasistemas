// WMS Addressing (Locations) Logic

let locationsState = {
    gridData: [],
    viewMode: 'grid' // 'grid' or 'table'
};

// --- Dashboard Stats ---
window.updateDashboardStats = function () {
    const data = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    const el = (id) => document.getElementById(id);
    if (el('statTotal')) el('statTotal').textContent = data.length;
    if (el('statLivres')) el('statLivres').textContent = data.filter(x => x.status === 'LIVRE').length;
    if (el('statOcupados')) el('statOcupados').textContent = data.filter(x => x.status === 'OCUPADO').length;
    if (el('statBloqueados')) el('statBloqueados').textContent = data.filter(x => x.status === 'BLOQUEADO').length;
}

// Call stats on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateDashboardStats, 200);
});

// --- Main Entry Point ---
window.loadLocationsView = async function () {
    const container = document.getElementById('view-locations');

    if (container.innerHTML.trim() === '') {
        container.innerHTML = `
            <div class="card" style="margin-bottom:1rem;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Gestão de Endereços</h3>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="toggleViewMode()" id="btnToggleView" title="Alternar Visualização">
                            <span class="material-icons-round">table_rows</span>
                        </button>
                        <button class="btn btn-secondary" onclick="loadLocationsData()">
                            <span class="material-icons-round">refresh</span>
                        </button>
                        <button class="btn btn-primary" onclick="openGeneratorModal()">
                            <span class="material-icons-round">add_circle</span> Gerar Endereços
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:1rem;">
                    <!-- Filters -->
                    <div style="display:flex; gap:1rem; margin-bottom:1rem; align-items:end; flex-wrap:wrap;">
                        <div style="width:80px;">
                            <label class="text-secondary" style="font-size:0.75rem; display:block;">Rua</label>
                            <input type="text" id="filterRua" class="form-input" placeholder="Todas" style="font-size:0.85rem;">
                        </div>
                        <div style="width:80px;">
                            <label class="text-secondary" style="font-size:0.75rem; display:block;">Prédio</label>
                            <input type="text" id="filterPredio" class="form-input" placeholder="Todos" style="font-size:0.85rem;">
                        </div>
                        <div style="width:100px;">
                            <label class="text-secondary" style="font-size:0.75rem; display:block;">Nível</label>
                            <input type="text" id="filterNivel" class="form-input" placeholder="Todos" style="font-size:0.85rem;">
                        </div>
                        <div style="width:120px;">
                            <label class="text-secondary" style="font-size:0.75rem; display:block;">Status</label>
                            <select id="filterStatus" class="form-input" style="font-size:0.85rem;">
                                <option value="ALL">Todos</option>
                                <option value="LIVRE">Livres</option>
                                <option value="OCUPADO">Ocupados</option>
                                <option value="BLOQUEADO">Bloqueados</option>
                            </select>
                        </div>
                        <button class="btn btn-secondary" onclick="filterGrid()" style="height:34px;">
                            <span class="material-icons-round" style="font-size:1rem;">filter_list</span> Filtrar
                        </button>
                        <div style="margin-left:auto; font-size:0.85rem; color:var(--text-secondary);">
                            Exibindo: <strong id="filterCount" style="color:var(--text-primary);">0</strong> endereços
                        </div>
                    </div>

                    <!-- Grid View -->
                    <div id="locationsGrid" style="
                        display: grid; 
                        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); 
                        gap: 0.5rem; 
                        padding: 0.75rem; 
                        background: var(--bg-dark); 
                        border-radius: 8px;
                        max-height: 55vh;
                        overflow-y: auto;
                    "></div>

                    <!-- Table View (hidden by default) -->
                    <div id="locationsTable" style="display:none; max-height:55vh; overflow:auto; border:1px solid var(--border-color); border-radius:8px;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                            <thead style="position:sticky; top:0; background:var(--bg-card); z-index:1;">
                                <tr>
                                    <th style="padding:0.6rem; text-align:left; border-bottom:1px solid var(--border-color);">Endereço</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Rua</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Prédio</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Nível</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Posição</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Status</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color); width:120px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="locationsTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Generator -->
            <div id="modalGenerator" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
                <div class="card" style="width:480px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>Gerador de Endereços</h3>
                        <span class="material-icons-round" style="cursor:pointer; color:var(--text-secondary);" onclick="document.getElementById('modalGenerator').style.display='none'">close</span>
                    </div>
                    <div class="card-body" style="padding:1.25rem;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Rua</label>
                                <input type="text" id="genRua" class="form-input" value="01" maxlength="2">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Prédio</label>
                                <input type="text" id="genPredio" class="form-input" value="10" maxlength="2">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Níveis (Altura)</label>
                                <input type="number" id="genNiveis" class="form-input" value="5" min="1" max="20">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Posições (Lateral)</label>
                                <input type="number" id="genPosicoes" class="form-input" value="10" min="1" max="100">
                            </div>
                        </div>
                        <div style="background:rgba(14,165,233,0.1); color:var(--primary-color); padding:0.75rem; border-radius:6px; font-size:0.85rem;">
                            <span class="material-icons-round" style="font-size:1rem; vertical-align:middle; margin-right:0.25rem;">info</span>
                            Serão gerados <strong id="genPreviewCount">50</strong> aptos.
                            Primeiro: <code id="genFirst">01-10-0101</code> | Último: <code id="genLast">01-10-0510</code>
                        </div>
                    </div>
                    <div style="padding:1rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="document.getElementById('modalGenerator').style.display='none'">Cancelar</button>
                        <button class="btn btn-primary" onclick="generateLocations()">
                            <span class="material-icons-round" style="font-size:1rem;">check</span> Gerar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Listeners for live preview
        ['genRua', 'genPredio', 'genNiveis', 'genPosicoes'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateGenPreview);
        });
    }

    loadLocationsData();
}

// --- Data Loading ---
window.loadLocationsData = function () {
    const stored = localStorage.getItem('wms_mock_data');
    if (stored) {
        locationsState.gridData = JSON.parse(stored);
    } else {
        locationsState.gridData = [];
    }
    filterGrid();
}

// --- View Mode Toggle ---
window.toggleViewMode = function () {
    const gridEl = document.getElementById('locationsGrid');
    const tableEl = document.getElementById('locationsTable');
    const btn = document.getElementById('btnToggleView');

    if (locationsState.viewMode === 'grid') {
        locationsState.viewMode = 'table';
        gridEl.style.display = 'none';
        tableEl.style.display = 'block';
        btn.innerHTML = '<span class="material-icons-round">grid_view</span>';
    } else {
        locationsState.viewMode = 'grid';
        gridEl.style.display = 'grid';
        tableEl.style.display = 'none';
        btn.innerHTML = '<span class="material-icons-round">table_rows</span>';
    }
    filterGrid();
}

// --- Preview ---
function updateGenPreview() {
    const rua = (document.getElementById('genRua').value || '01').padStart(2, '0');
    const predio = (document.getElementById('genPredio').value || '10').padStart(2, '0');
    const n = parseInt(document.getElementById('genNiveis').value) || 0;
    const p = parseInt(document.getElementById('genPosicoes').value) || 0;

    document.getElementById('genPreviewCount').textContent = n * p;
    document.getElementById('genFirst').textContent = `${rua}-${predio}-0101`;
    const lastN = n.toString().padStart(2, '0');
    const lastP = p.toString().padStart(2, '0');
    document.getElementById('genLast').textContent = `${rua}-${predio}-${lastN}${lastP}`;
}

// --- Generator ---
window.openGeneratorModal = function () {
    document.getElementById('modalGenerator').style.display = 'flex';
    updateGenPreview();
}

window.generateLocations = async function () {
    const rua = document.getElementById('genRua').value.padStart(2, '0');
    const predio = document.getElementById('genPredio').value.padStart(2, '0');
    const niveis = parseInt(document.getElementById('genNiveis').value);
    const posicoes = parseInt(document.getElementById('genPosicoes').value);

    let newLocs = [];
    let existing = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    const existingIds = new Set(existing.map(l => l.id));
    let duplicates = 0;

    for (let n = 1; n <= niveis; n++) {
        for (let p = 1; p <= posicoes; p++) {
            const nivelStr = n.toString().padStart(2, '0');
            const posStr = p.toString().padStart(2, '0');
            const apto = `${nivelStr}${posStr}`;
            const fullId = `${rua}-${predio}-${apto}`;

            if (existingIds.has(fullId)) {
                duplicates++;
                continue;
            }

            newLocs.push({
                id: fullId,
                rua: rua,
                predio: predio,
                nivel: nivelStr,
                posicao: posStr,
                apto: apto,
                status: 'LIVRE'
            });
        }
    }

    existing = [...existing, ...newLocs];
    localStorage.setItem('wms_mock_data', JSON.stringify(existing));

    locationsState.gridData = existing;
    filterGrid();
    updateDashboardStats();
    document.getElementById('modalGenerator').style.display = 'none';

    let msg = `${newLocs.length} endereços gerados!`;
    if (duplicates > 0) msg += `\n(${duplicates} duplicados ignorados)`;
    alert(msg);
}

// --- Filter & Render ---
window.filterGrid = function () {
    const fRua = (document.getElementById('filterRua')?.value || '').trim();
    const fPredio = (document.getElementById('filterPredio')?.value || '').trim();
    const fNivel = (document.getElementById('filterNivel')?.value || '').trim();
    const fStatus = document.getElementById('filterStatus')?.value || 'ALL';

    let filtered = [...locationsState.gridData];

    if (fRua) filtered = filtered.filter(x => x.rua === fRua.padStart(2, '0'));
    if (fPredio) filtered = filtered.filter(x => x.predio === fPredio.padStart(2, '0'));
    if (fNivel) filtered = filtered.filter(x => x.nivel === fNivel.padStart(2, '0'));
    if (fStatus !== 'ALL') filtered = filtered.filter(x => x.status === fStatus);

    // Sort: Rua > Prédio > Nível > Posição
    filtered.sort((a, b) => a.id.localeCompare(b.id));

    const countEl = document.getElementById('filterCount');
    if (countEl) countEl.textContent = filtered.length;

    if (locationsState.viewMode === 'grid') {
        renderGridView(filtered);
    } else {
        renderTableView(filtered);
    }
}

function renderGridView(data) {
    const grid = document.getElementById('locationsGrid');
    grid.innerHTML = '';

    if (data.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:2rem;">Nenhum endereço encontrado.</div>';
        return;
    }

    data.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'location-card';

        const colors = {
            'LIVRE': { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#10b981' },
            'OCUPADO': { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444' },
            'BLOQUEADO': { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#f59e0b' }
        };
        const c = colors[loc.status] || colors['LIVRE'];

        card.style.cssText = `
            background:${c.bg}; border:1px solid ${c.border}; border-radius:6px;
            padding:0.6rem; text-align:center; cursor:pointer; transition:transform 0.15s;
        `;
        card.onmouseenter = () => card.style.transform = 'scale(1.05)';
        card.onmouseleave = () => card.style.transform = 'scale(1)';
        card.onclick = () => showLocationActions(loc.id);

        card.innerHTML = `
            <div style="font-size:0.65rem; color:var(--text-secondary);">R${loc.rua} P${loc.predio}</div>
            <div style="font-weight:700; font-size:1rem; margin:0.15rem 0; letter-spacing:0.5px;">${loc.apto}</div>
            <div style="font-size:0.6rem; font-weight:600; color:${c.text};">${loc.status}</div>
        `;
        grid.appendChild(card);
    });
}

function renderTableView(data) {
    const tbody = document.getElementById('locationsTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum endereço encontrado.</td></tr>';
        return;
    }

    data.forEach(loc => {
        const colors = { 'LIVRE': '#10b981', 'OCUPADO': '#ef4444', 'BLOQUEADO': '#f59e0b' };
        const color = colors[loc.status] || '#94a3b8';

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.innerHTML = `
            <td style="padding:0.5rem 0.6rem; font-weight:600;">${loc.id}</td>
            <td style="padding:0.5rem; text-align:center;">${loc.rua}</td>
            <td style="padding:0.5rem; text-align:center;">${loc.predio}</td>
            <td style="padding:0.5rem; text-align:center;">${loc.nivel}</td>
            <td style="padding:0.5rem; text-align:center;">${loc.posicao}</td>
            <td style="padding:0.5rem; text-align:center;">
                <span style="background:${color}22; color:${color}; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem; font-weight:600;">
                    ${loc.status}
                </span>
            </td>
            <td style="padding:0.5rem; text-align:center;">
                <button onclick="toggleBlock('${loc.id}')" style="background:none; border:none; cursor:pointer; color:${loc.status === 'BLOQUEADO' ? '#10b981' : '#f59e0b'};" title="${loc.status === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear'}">
                    <span class="material-icons-round" style="font-size:1.1rem;">${loc.status === 'BLOQUEADO' ? 'lock_open' : 'lock'}</span>
                </button>
                <button onclick="deleteLocation('${loc.id}')" style="background:none; border:none; cursor:pointer; color:#ef4444;" title="Excluir">
                    <span class="material-icons-round" style="font-size:1.1rem;">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Actions ---
window.showLocationActions = function (id) {
    const loc = locationsState.gridData.find(x => x.id === id);
    if (!loc) return;

    const action = prompt(
        `Endereço: ${loc.id}\nStatus: ${loc.status}\n\nDigite a ação:\n1 - Bloquear/Desbloquear\n2 - Excluir\n3 - Cancelar`
    );

    if (action === '1') toggleBlock(id);
    else if (action === '2') deleteLocation(id);
}

window.toggleBlock = function (id) {
    let data = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    const loc = data.find(x => x.id === id);
    if (!loc) return;

    if (loc.status === 'BLOQUEADO') {
        loc.status = 'LIVRE';
    } else if (loc.status === 'LIVRE') {
        loc.status = 'BLOQUEADO';
    } else {
        alert('Não é possível bloquear um endereço ocupado.');
        return;
    }

    localStorage.setItem('wms_mock_data', JSON.stringify(data));
    locationsState.gridData = data;
    filterGrid();
    updateDashboardStats();
}

window.deleteLocation = function (id) {
    if (!confirm(`Excluir endereço ${id}?`)) return;

    let data = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    data = data.filter(x => x.id !== id);
    localStorage.setItem('wms_mock_data', JSON.stringify(data));
    locationsState.gridData = data;
    filterGrid();
    updateDashboardStats();
}

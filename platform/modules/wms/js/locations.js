// WMS Addressing (Locations) Logic

let locationsState = {
    gridData: [],
    viewMode: 'grid', // 'grid', 'table', 'map', or 'lateral'
    lateralRua: '',
    lateralLado: 'par'
};

// --- Dashboard Stats ---
window.updateDashboardStats = function () {
    const data = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
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
                            <span class="material-icons-round">view_module</span>
                        </button>
                        <button class="btn btn-secondary" id="btnLateralView" onclick="setLateralMode()" title="Visão Lateral 3D">
                            <span class="material-icons-round" style="color:var(--primary-color);">3d_rotation</span>
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

                    <!-- Map View (hidden by default) -->
                    <div id="locationsMap" style="display:none; max-height:55vh; overflow-y:auto;"></div>

                    <!-- Lateral View (NOVO: v1.6) -->
                    <div id="locationsLateral" style="display:none; height:60vh; overflow:hidden; border-radius:12px; background:var(--bg-dark); border:1px solid var(--border-color); position:relative; perspective:1000px;">
                        <!-- Controls for Lateral View -->
                        <div style="position:absolute; top:1rem; left:1rem; z-index:10; display:flex; gap:0.5rem; background:rgba(0,0,0,0.5); padding:0.5rem; border-radius:8px; backdrop-filter:blur(4px);">
                            <select id="latRua" class="form-input" style="width:100px; padding:0.3rem 0.5rem; height:32px;" onchange="updateLateralView()"></select>
                            <div class="btn-group" style="display:flex; border-radius:6px; overflow:hidden;">
                                <button class="btn-lat-lado active" data-lado="par" onclick="setLateralLado('par')" style="padding:0.3rem 0.8rem; border:none; background:rgba(255,255,255,0.1); color:white; cursor:pointer; font-size:0.75rem; font-weight:600;">PAR</button>
                                <button class="btn-lat-lado" data-lado="impar" onclick="setLateralLado('impar')" style="padding:0.3rem 0.8rem; border:none; background:rgba(255,255,255,0.1); color:white; cursor:pointer; font-size:0.75rem; font-weight:600; border-left:1px solid rgba(255,255,255,0.1);">ÍMPAR</button>
                            </div>
                        </div>
                        <!-- Canvas/Container for Racks -->
                        <div id="lateralCanvas" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:auto; padding:2rem;">
                            <!-- Racks will be injected here -->
                        </div>
                        <!-- Legend -->
                        <div style="position:absolute; bottom:1rem; right:1rem; display:flex; gap:1rem; font-size:0.7rem; color:var(--text-secondary);">
                            <div style="display:flex; align-items:center; gap:0.3rem;"><div style="width:10px; height:10px; background:#10b981; border-radius:2px;"></div> Livre</div>
                            <div style="display:flex; align-items:center; gap:0.3rem;"><div style="width:10px; height:10px; background:#3b82f6; border-radius:2px;"></div> Ocupado</div>
                            <div style="display:flex; align-items:center; gap:0.3rem;"><div style="width:10px; height:10px; background:#f59e0b; border-radius:2px;"></div> Bloqueado</div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Modal Generator (NOVO: Gerador em Massa v1.5) -->
            <div id="modalGenerator" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1100; align-items:center; justify-content:center;">
                <div class="card" style="width:100%; max-width:600px; box-shadow: 0 10px 40px rgba(0,0,0,0.7); animation: slideUp 0.3s ease-out;">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="material-icons-round" style="color:var(--primary-color);">grid_view</span>
                            Gerador de Endereçamento em Massa
                        </h3>
                        <span class="material-icons-round" style="cursor:pointer; color:var(--text-secondary);" onclick="document.getElementById('modalGenerator').style.display='none'">close</span>
                    </div>
                    <div class="card-body" style="padding:1.5rem;">
                        
                        <!-- Coluna Dupla: Rua -->
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:0.4rem; font-weight:600; text-transform:uppercase;">Rua Inicial</label>
                                <select id="genRuaIni" class="form-input"></select>
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:0.4rem; font-weight:600; text-transform:uppercase;">Rua Final</label>
                                <select id="genRuaEnd" class="form-input"></select>
                            </div>
                        </div>

                        <!-- Prédio e Nível -->
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:0.4rem; font-weight:600; text-transform:uppercase;">Prédio (Dê/Até)</label>
                                <div style="display:flex; gap:0.4rem; align-items:center;">
                                    <input type="number" id="genPredioIni" class="form-input" value="1" min="1" style="text-align:center;">
                                    <span style="color:var(--text-secondary);">-</span>
                                    <input type="number" id="genPredioEnd" class="form-input" value="10" min="1" style="text-align:center;">
                                </div>
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:0.4rem; font-weight:600; text-transform:uppercase;">Nível (Dê/Até)</label>
                                <div style="display:flex; gap:0.4rem; align-items:center;">
                                    <input type="number" id="genNivelIni" class="form-input" value="1" min="1" style="text-align:center;">
                                    <span style="color:var(--text-secondary);">-</span>
                                    <input type="number" id="genNivelEnd" class="form-input" value="5" min="1" style="text-align:center;">
                                </div>
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:0.4rem; font-weight:600; text-transform:uppercase;">Apto (Dê/Até)</label>
                                <div style="display:flex; gap:0.4rem; align-items:center;">
                                    <input type="number" id="genAptoIni" class="form-input" value="1" min="1" style="text-align:center;">
                                    <span style="color:var(--text-secondary);">-</span>
                                    <input type="number" id="genAptoEnd" class="form-input" value="1" min="1" style="text-align:center;">
                                </div>
                            </div>
                        </div>

                        <!-- Outras Configurações e Filtros (Botões da Imagem) -->
                        <div style="display:flex; justify-content:space-between; align-items:end; margin-bottom:1rem;">
                            <div style="display:flex; flex-direction:column; gap:0.5rem;">
                                 <label class="text-secondary" style="font-size:0.75rem; display:block; font-weight:600; text-transform:uppercase;">Tipo de Endereço</label>
                                 <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; background:var(--bg-body); padding:0.6rem 1rem; border-radius:6px; border:1px solid var(--border-color);">
                                     <input type="checkbox" id="genPalete" style="width:18px; height:18px; accent-color:var(--primary-color);">
                                     <span style="font-size:0.85rem; font-weight:500;">Palete</span>
                                 </label>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:0.5rem; flex:1; margin-left:2rem;">
                                <label class="text-secondary" style="font-size:0.75rem; display:block; font-weight:600; text-transform:uppercase;">Sequenciamento (Prédio)</label>
                                <div class="btn-group" id="genFilterGroup" style="display:flex; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--bg-body);">
                                    <button class="btn-filter active" data-type="par" style="flex:1; padding:0.6rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-secondary);">Par</button>
                                    <button class="btn-filter" data-type="todos" style="flex:1; padding:0.6rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-secondary); border-left:1px solid var(--border-color); border-right:1px solid var(--border-color);">Todos</button>
                                    <button class="btn-filter" data-type="impar" style="flex:1; padding:0.6rem; border:none; background:none; cursor:pointer; font-size:0.85rem; font-weight:600; color:var(--text-secondary);">Ímpar</button>
                                </div>
                            </div>
                        </div>

                        <div id="genPreviewBox" style="background:rgba(14,165,233,0.1); color:var(--primary-color); padding:1rem; border-radius:8px; font-size:0.85rem; border-left:4px solid var(--primary-color);">
                            <div style="display:flex; justify-content:space-between;">
                                <span>Serão criados: <strong id="genPreviewCount">0</strong> endereços</span>
                                <span>Ex: <code id="genPreviewEx">01-01-0101</code></span>
                            </div>
                        </div>
                    </div>
                    <div style="padding:1.25rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:0.75rem; background:rgba(0,0,0,0.1);">
                        <button class="btn btn-secondary" onclick="document.getElementById('modalGenerator').style.display='none'">Cancelar</button>
                        <button class="btn btn-primary" onclick="generateLocationsMassive()" style="padding:0 1.5rem;">
                            <span class="material-icons-round" style="font-size:1.1rem;">auto_fix_high</span> Criar Endereçamentos
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .btn-filter.active { background: var(--primary-color) !important; color: white !important; }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            </style>
        `;

        // Popular selects de Rua
        const sIni = document.getElementById('genRuaIni');
        const sEnd = document.getElementById('genRuaEnd');
        for(let i=1; i<=99; i++) {
            const val = i.toString().padStart(2, '0');
            sIni.options.add(new Option('Rua ' + val, val));
            sEnd.options.add(new Option('Rua ' + val, val));
        }
        sEnd.value = '01';

        // Listeners p/ botões de filtro (Par/Impar/Todos)
        const filterBtns = document.querySelectorAll('.btn-filter');
        filterBtns.forEach(btn => {
            btn.onclick = () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateMassPreview();
            };
        });

        // Listeners for live preview
        ['genRuaIni', 'genRuaEnd', 'genPredioIni', 'genPredioEnd', 'genNivelIni', 'genNivelEnd', 'genAptoIni', 'genAptoEnd', 'genPalete'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateMassPreview);
        });
    }
    loadLocationsData();
}

// --- Mass Preview & Logic (v1.5) ---
function updateMassPreview() {
    try {
        const rIni = parseInt(document.getElementById('genRuaIni').value);
        const rEnd = parseInt(document.getElementById('genRuaEnd').value);
        const pIni = parseInt(document.getElementById('genPredioIni').value);
        const pEnd = parseInt(document.getElementById('genPredioEnd').value);
        const nIni = parseInt(document.getElementById('genNivelIni').value);
        const nEnd = parseInt(document.getElementById('genNivelEnd').value);
        const aIni = parseInt(document.getElementById('genAptoIni').value);
        const aEnd = parseInt(document.getElementById('genAptoEnd').value);
        
        const filterType = document.querySelector('.btn-filter.active')?.getAttribute('data-type') || 'todos';

        let count = 0;
        let example = '';

        for (let r = Math.min(rIni, rEnd); r <= Math.max(rIni, rEnd); r++) {
            for (let p = Math.min(pIni, pEnd); p <= Math.max(pIni, pEnd); p++) {
                // Filtro Par/Impar no Prédio
                if (filterType === 'par' && p % 2 !== 0) continue;
                if (filterType === 'impar' && p % 2 === 0) continue;

                for (let n = Math.min(nIni, nEnd); n <= Math.max(nIni, nEnd); n++) {
                    for (let a = Math.min(aIni, aEnd); a <= Math.max(aIni, aEnd); a++) {
                        count++;
                        if (!example) {
                            const rs = r.toString().padStart(2, '0');
                            const ps = p.toString().padStart(2, '0');
                            const ns = n.toString().padStart(2, '0');
                            const as = a.toString().padStart(2, '0');
                            example = `${rs}-${ps}-${ns}${as}`;
                        }
                    }
                }
            }
        }

        document.getElementById('genPreviewCount').textContent = count;
        document.getElementById('genPreviewEx').textContent = example || '---';
    } catch (e) { console.error(e); }
}

window.openGeneratorModal = function () {
    document.getElementById('modalGenerator').style.display = 'flex';
    updateMassPreview();
}

window.generateLocationsMassive = async function () {
    try {
        const rIni = parseInt(document.getElementById('genRuaIni').value);
        const rEnd = parseInt(document.getElementById('genRuaEnd').value);
        const pIni = parseInt(document.getElementById('genPredioIni').value);
        const pEnd = parseInt(document.getElementById('genPredioEnd').value);
        const nIni = parseInt(document.getElementById('genNivelIni').value);
        const nEnd = parseInt(document.getElementById('genNivelEnd').value);
        const aIni = parseInt(document.getElementById('genAptoIni').value);
        const aEnd = parseInt(document.getElementById('genAptoEnd').value);
        const isPalete = document.getElementById('genPalete').checked;
        const filterType = document.querySelector('.btn-filter.active')?.getAttribute('data-type') || 'todos';

        let newLocs = [];
        let existing = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
        const existingIds = new Set(existing.map(l => l.id));
        let duplicates = 0;

        for (let r = Math.min(rIni, rEnd); r <= Math.max(rIni, rEnd); r++) {
            const rs = r.toString().padStart(2, '0');

            for (let p = Math.min(pIni, pEnd); p <= Math.max(pIni, pEnd); p++) {
                if (filterType === 'par' && p % 2 !== 0) continue;
                if (filterType === 'impar' && p % 2 === 0) continue;
                const ps = p.toString().padStart(2, '0');

                for (let n = Math.min(nIni, nEnd); n <= Math.max(nIni, nEnd); n++) {
                    const ns = n.toString().padStart(2, '0');

                    for (let a = Math.min(aIni, aEnd); a <= Math.max(aIni, aEnd); a++) {
                        const as = a.toString().padStart(2, '0');
                        const apto = `${ns}${as}`;
                        const fullId = `${rs}-${ps}-${apto}`;

                        if (existingIds.has(fullId)) {
                            duplicates++;
                            continue;
                        }

                        newLocs.push({
                            id: fullId,
                            rua: rs,
                            predio: ps,
                            nivel: ns,
                            posicao: as,
                            apto: apto,
                            status: 'LIVRE',
                            tipo: isPalete ? 'Palete' : 'Picking'
                        });
                    }
                }
            }
        }

        if (newLocs.length === 0) {
            alert('Nenhum novo endereço para gerar.');
            return;
        }

        existing = [...existing, ...newLocs];
        localStorage.setItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(existing));

        locationsState.gridData = existing;
        filterGrid();
        if (window.updateDashboardStats) window.updateDashboardStats();
        
        document.getElementById('modalGenerator').style.display = 'none';
        
        let msg = `${newLocs.length} endereços gerados com sucesso!`;
        if (duplicates > 0) msg += `\n(${duplicates} duplicados ignorados)`;
        alert(msg);

    } catch (err) {
        console.error(err);
        alert('Erro ao gerar endereços: ' + err.message);
    }
}


window.toggleViewMode = function () {
    const btn = document.getElementById('btnToggleView');
    if (locationsState.viewMode === 'grid') {
        locationsState.viewMode = 'table';
        btn.innerHTML = '<span class="material-icons-round">grid_view</span>';
    } else if (locationsState.viewMode === 'table') {
        locationsState.viewMode = 'map';
        btn.innerHTML = '<span class="material-icons-round">map</span>';
    } else {
        locationsState.viewMode = 'grid';
        btn.innerHTML = '<span class="material-icons-round">table_rows</span>';
    }
    filterGrid();
}

window.setLateralMode = function() {
    locationsState.viewMode = 'lateral';
    
    // Popular Ruas
    const data = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const streets = [...new Set(data.map(l => l.rua))].sort();
    const sel = document.getElementById('latRua');
    if(sel) {
        sel.innerHTML = '';
        streets.forEach(s => sel.add(new Option('Rua '+s, s)));
        if(streets.length > 0 && !locationsState.lateralRua) {
            locationsState.lateralRua = streets[0];
            sel.value = streets[0];
        } else if(locationsState.lateralRua) {
            sel.value = locationsState.lateralRua;
        }
    }
    filterGrid();
}

window.setLateralLado = function(lado) {
    locationsState.lateralLado = lado;
    document.querySelectorAll('.btn-lat-lado').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lado') === lado);
    });
    updateLateralView();
}

window.updateLateralView = function() {
    const canvas = document.getElementById('lateralCanvas');
    if (!canvas) return;
    
    const rua = document.getElementById('latRua')?.value;
    if(!rua) {
        canvas.innerHTML = '<div style="color:var(--text-secondary);">Selecione uma rua para visualizar os racks.</div>';
        return;
    }
    locationsState.lateralRua = rua;
    const lado = locationsState.lateralLado;
    
    const data = (locationsState.gridData || []).filter(l => l.rua === rua);
    
    let filtered = data.filter(l => {
        const p = parseInt(l.predio);
        return lado === 'par' ? p % 2 === 0 : p % 2 !== 0;
    });

    if (filtered.length === 0) {
        canvas.innerHTML = `<div style="color:var(--text-secondary); text-align:center;">
            <span class="material-icons-round" style="font-size:3rem; display:block; margin-bottom:1rem; opacity:0.3;">inventory_2</span>
            Nenhum endereço encontrado para Rua ${rua} (Lado ${lado === 'par' ? 'Par' : 'Ímpar'}).
        </div>`;
        return;
    }

    const predios = [...new Set(filtered.map(l => l.predio))].sort((a,b) => parseInt(a) - parseInt(b));
    const niveis = [...new Set(filtered.map(l => l.nivel))].sort((a,b) => parseInt(b) - parseInt(a));
    
    let html = `<div style="display:flex; gap:3rem; align-items:flex-end; padding:4rem 2rem; min-width:max-content;">`;
    
    predios.forEach(p => {
        html += `
        <div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
            <div style="font-size:0.75rem; font-weight:800; color:var(--primary-color); background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:4px;">P${p}</div>
            <div style="display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; border-left:4px solid #475569; border-bottom:8px solid #1e293b; box-shadow: 10px 10px 20px rgba(0,0,0,0.4);">
        `;
        
        niveis.forEach(n => {
            const loc = filtered.find(l => l.predio === p && l.nivel === n);
            if (loc) {
                const isOccupied = loc.status === 'OCUPADO';
                const color = loc.status === 'LIVRE' ? '#10b981' : isOccupied ? '#3b82f6' : '#f59e0b';
                const shadow = isOccupied ? 'rgba(59, 130, 246, 0.4)' : 'transparent';
                
                html += `
                <div class="rack-box-3d" onclick="renderLateralDetails('${loc.id}')" title="Endereço: ${loc.id}"
                     style="width:60px; height:45px; background:${color}; border-radius:3px; cursor:pointer; 
                            position:relative; transform: skewY(-8deg); transition: all 0.2s;
                            display:flex; flex-direction:column; align-items:center; justify-content:center;
                            box-shadow: 6px 6px 0 rgba(0,0,0,0.5), 0 0 15px ${shadow}; border:1px solid rgba(255,255,255,0.1);">
                    <span style="font-size:0.6rem; opacity:0.8;">NV</span>
                    <span style="font-size:0.85rem; font-weight:900;">${n}</span>
                    ${isOccupied ? '<div style="width:6px; height:6px; background:white; border-radius:50%; position:absolute; top:4px; right:4px; box-shadow:0 0 5px white;"></div>' : ''}
                </div>`;
            } else {
                html += `<div style="width:60px; height:45px; border:1px dashed rgba(255,255,255,0.05); transform: skewY(-8deg);"></div>`;
            }
        });
        
        html += `</div></div>`;
    });
    
    html += `</div>`;
    canvas.innerHTML = html;
}

window.renderLateralDetails = function(id) {
    const loc = (locationsState.gridData || []).find(l => l.id === id);
    if(!loc) return;

    if(loc.status !== 'OCUPADO') {
        alert(`Endereço ${id} está LIVRE.`);
        return;
    }

    let detailModal = document.getElementById('lateralDetailModal');
    if(!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'lateralDetailModal';
        detailModal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:2000; display:none; align-items:center; justify-content:center;`;
        document.body.appendChild(detailModal);
    }

    detailModal.innerHTML = `
        <div class="card" style="width:400px; animation: slideUp 0.3s ease-out;">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h3><span class="material-icons-round" style="vertical-align:middle; color:#3b82f6;">inventory_2</span> Conteúdo do Endereço</h3>
                <span class="material-icons-round" style="cursor:pointer;" onclick="this.closest('#lateralDetailModal').style.display='none'">close</span>
            </div>
            <div class="card-body" style="padding:1.5rem;">
                <div style="font-family:monospace; font-size:1.1rem; font-weight:700; color:var(--primary-color); margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                    ${loc.id}
                </div>
                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <div>
                        <label class="text-secondary" style="font-size:0.75rem; text-transform:uppercase; font-weight:600;">Produto / SKU</label>
                        <div style="font-size:0.95rem; font-weight:700; color:var(--text-primary); text-transform:uppercase;">${loc.product || 'N/A'}</div>
                        <div style="font-family:monospace; font-size:0.85rem; color:var(--text-secondary);">${loc.sku || '-'}</div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div>
                            <label class="text-secondary" style="font-size:0.75rem; text-transform:uppercase; font-weight:600;">Quantidade</label>
                            <div style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${loc.qty || 0} ${loc.unit || 'UN'}</div>
                        </div>
                        <div>
                            <label class="text-secondary" style="font-size:0.75rem; text-transform:uppercase; font-weight:600;">Lote</label>
                            <div style="font-size:0.9rem; font-weight:600;">${loc.lote || '-'}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="padding:1rem; border-top:1px solid var(--border-color); text-align:right;">
                <button class="btn btn-primary" onclick="document.getElementById('lateralDetailModal').style.display='none'">Fechar</button>
            </div>
        </div>
    `;

    detailModal.style.display = 'flex';
}

// --- Filter & Render ---
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
        document.getElementById('locationsGrid').style.display = 'grid';
        document.getElementById('locationsTable').style.display = 'none';
        document.getElementById('locationsMap').style.display = 'none';
        renderGridView(filtered);
    } else if (locationsState.viewMode === 'table') {
        document.getElementById('locationsGrid').style.display = 'none';
        document.getElementById('locationsTable').style.display = 'block';
        document.getElementById('locationsMap').style.display = 'none';
        renderTableView(filtered);
    } else if (locationsState.viewMode === 'map') {
        document.getElementById('locationsGrid').style.display = 'none';
        document.getElementById('locationsTable').style.display = 'none';
        document.getElementById('locationsMap').style.display = 'block';
        document.getElementById('locationsLateral').style.display = 'none';
        renderMapView(filtered);
    } else if (locationsState.viewMode === 'lateral') {
        document.getElementById('locationsGrid').style.display = 'none';
        document.getElementById('locationsTable').style.display = 'none';
        document.getElementById('locationsMap').style.display = 'none';
        document.getElementById('locationsLateral').style.display = 'block';
        updateLateralView();
    }
}

// ... (renderGridView and renderTableView remain unchanged) ...

function renderMapView(data) {
    const container = document.getElementById('locationsMap');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum endereço para exibir no mapa.</div>';
        return;
    }

    // Group by Rua -> Predio
    const hierarchy = {};
    data.forEach(loc => {
        if (!hierarchy[loc.rua]) hierarchy[loc.rua] = {};
        if (!hierarchy[loc.rua][loc.predio]) hierarchy[loc.rua][loc.predio] = [];
        hierarchy[loc.rua][loc.predio].push(loc);
    });

    // Render Streets
    Object.keys(hierarchy).sort().forEach(rua => {
        const ruaDiv = document.createElement('div');
        ruaDiv.className = 'card';
        ruaDiv.style.marginBottom = '1.5rem';
        ruaDiv.style.padding = '1rem';

        ruaDiv.innerHTML = `<h4 style="margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">Rua ${rua}</h4>`;

        const racksContainer = document.createElement('div');
        racksContainer.style.display = 'flex';
        racksContainer.style.gap = '1.5rem';
        racksContainer.style.overflowX = 'auto';
        racksContainer.style.paddingBottom = '0.5rem';

        Object.keys(hierarchy[rua]).sort().forEach(predio => {
            const locs = hierarchy[rua][predio];
            // Find max levels and positions for this rack to build grid
            const maxNivel = Math.max(...locs.map(l => parseInt(l.nivel)));
            const maxPos = Math.max(...locs.map(l => parseInt(l.posicao)));

            const rackDiv = document.createElement('div');
            rackDiv.style.minWidth = 'fit-content';
            rackDiv.style.border = '1px solid var(--border-color)';
            rackDiv.style.borderRadius = '8px';
            rackDiv.style.padding = '0.75rem';
            rackDiv.style.background = 'var(--bg-body)';

            rackDiv.innerHTML = `<div style="text-align:center; font-weight:600; margin-bottom:0.5rem; font-size:0.85rem;">Prédio ${predio}</div>`;

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            // Grid template: rows = levels (reverse), cols = positions
            grid.style.gridTemplateRows = `repeat(${maxNivel}, 1fr)`;
            grid.style.gridTemplateColumns = `repeat(${maxPos}, 24px)`;
            grid.style.gap = '4px';

            // Fill grid
            // We need to render from Top Level (maxNivel) down to 1
            for (let n = maxNivel; n >= 1; n--) {
                for (let p = 1; p <= maxPos; p++) {
                    const loc = locs.find(l => parseInt(l.nivel) === n && parseInt(l.posicao) === p);
                    const cell = document.createElement('div');
                    cell.style.width = '24px';
                    cell.style.height = '24px';
                    cell.style.borderRadius = '3px';
                    cell.style.fontSize = '0.6rem';
                    cell.style.display = 'flex';
                    cell.style.alignItems = 'center';
                    cell.style.justifyContent = 'center';
                    cell.style.cursor = 'pointer';

                    if (loc) {
                        const statusColors = {
                            'LIVRE': '#10b981',
                            'OCUPADO': '#ef4444',
                            'BLOQUEADO': '#f59e0b'
                        };
                        cell.style.background = statusColors[loc.status] || '#94a3b8';
                        cell.title = `End: ${loc.id}\nStatus: ${loc.status}`;
                        cell.onclick = () => showLocationActions(loc.id);
                        // cell.innerText = n; // Optional: show level number
                    } else {
                        cell.style.background = 'transparent';
                        cell.style.border = '1px dashed var(--border-color)';
                    }
                    grid.appendChild(cell);
                }
            }

            rackDiv.appendChild(grid);
            racksContainer.appendChild(rackDiv);
        });

        ruaDiv.appendChild(racksContainer);
        container.appendChild(ruaDiv);
    });
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
    let data = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
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

    localStorage.setItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(data));
    locationsState.gridData = data;
    filterGrid();
    updateDashboardStats();
}

window.deleteLocation = function (id) {
    if (!confirm(`Excluir endereço ${id}?`)) return;

    let data = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    data = data.filter(x => x.id !== id);
    localStorage.setItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(data));
    locationsState.gridData = data;
    filterGrid();
    updateDashboardStats();
}

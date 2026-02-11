// WMS Addressing (Locations) Logic

let locationsState = {
    gridData: []   // Flattened list of locations
};

// Main Entry Point
window.loadLocationsView = async function () {
    console.log("Loading Locations View...");
    const container = document.getElementById('view-locations');

    // Inject HTML Structure if empty
    if (container.innerHTML.trim() === '') {
        container.innerHTML = `
            <div class="card">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Gestão de Endereços</h3>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="renderGrid()">
                            <span class="material-icons-round">refresh</span> Atualizar
                        </button>
                        <button class="btn btn-primary" onclick="openGeneratorModal()">
                            <span class="material-icons-round">add_circle</span> Gerador em Massa
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Filters -->
                    <div style="display:flex; gap:1rem; margin-bottom:1.5rem; align-items:end;">
                        <div style="width:120px;">
                            <label class="text-secondary" style="font-size:0.8rem">Prédio/Galpão</label>
                            <select id="filterBuilding" class="form-input">
                                <option value="CD-01">CD-01</option>
                            </select>
                        </div>
                        <div style="width:100px;">
                            <label class="text-secondary" style="font-size:0.8rem">Rua (01-99)</label>
                            <input type="text" id="filterAisle" class="form-input" placeholder="Todas" onchange="filterGrid()">
                        </div>
                        <div style="width:120px;">
                            <label class="text-secondary" style="font-size:0.8rem">Status</label>
                            <select id="filterStatus" class="form-input" onchange="filterGrid()">
                                <option value="ALL">Todos</option>
                                <option value="ACTIVE">Ativos</option>
                                <option value="OCCUPIED">Ocupados</option>
                            </select>
                        </div>
                    </div>

                    <!-- Visual Grid -->
                    <div id="locationsGrid" style="
                        display: grid; 
                        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); 
                        gap: 0.75rem; 
                        padding: 1rem; 
                        background: var(--bg-dark); 
                        border-radius: 8px;
                        max-height: 60vh;
                        overflow-y: auto;
                    ">
                    </div>
                </div>
            </div>

            <!-- Modal Generator -->
            <div id="modalGenerator" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
                <div class="card" style="width:500px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div class="card-header">
                        <h3>Gerador de Endereços</h3>
                    </div>
                    <div class="card-body">
                        <div class="grid-2-col" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem">Rua (01-99)</label>
                                <input type="text" id="genRua" class="form-input" value="01" maxlength="2">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem">Prédio (01-99)</label>
                                <input type="text" id="genPredio" class="form-input" value="10" maxlength="2">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem">Níveis (Altura)</label>
                                <input type="number" id="genNiveis" class="form-input" value="5" min="1" max="20">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem">Posições (Lateral)</label>
                                <input type="number" id="genPosicoes" class="form-input" value="10" min="1" max="100">
                            </div>
                        </div>
                        <div class="alert" style="background:rgba(16, 185, 129, 0.1); color:var(--accent-success); padding:0.75rem; border-radius:4px; font-size:0.9rem; margin-bottom:1rem;">
                            <span class="material-icons-round" style="font-size:1rem; vertical-align:middle; margin-right:0.5rem;">info</span>
                            Serão gerados <strong id="genPreviewCount">50</strong> endereços.<br>
                            Ex: <code>01-10-0101</code> até <code>01-10-0510</code>
                        </div>
                    </div>
                    <div class="card-footer" style="padding:1rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="document.getElementById('modalGenerator').style.display='none'">Cancelar</button>
                        <button class="btn btn-primary" onclick="generateLocations()">Gerar Endereços</button>
                    </div>
                </div>
            </div>
        `;

        // Listeners
        document.getElementById('genNiveis').addEventListener('input', updateGenPreview);
        document.getElementById('genPosicoes').addEventListener('input', updateGenPreview);
    }

    // Load Data
    const stored = localStorage.getItem('wms_mock_data');
    if (stored) {
        locationsState.gridData = JSON.parse(stored);
        filterGrid();
    } else {
        document.getElementById('locationsGrid').innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#94a3b8;">Nenhum endereço. Use o Gerador.</div>';
    }
}

function updateGenPreview() {
    const n = parseInt(document.getElementById('genNiveis').value) || 0;
    const p = parseInt(document.getElementById('genPosicoes').value) || 0;
    document.getElementById('genPreviewCount').textContent = n * p;
}

window.openGeneratorModal = function () {
    document.getElementById('modalGenerator').style.display = 'flex';
    updateGenPreview();
}

window.generateLocations = async function () {
    const rua = document.getElementById('genRua').value.padStart(2, '0');
    const predio = document.getElementById('genPredio').value.padStart(2, '0');

    const niveis = parseInt(document.getElementById('genNiveis').value);
    const posicoes = parseInt(document.getElementById('genPosicoes').value);

    // Logic: 01-10-0205 (Rua-Predio-NivelPosicao)
    let newLocs = [];

    for (let n = 1; n <= niveis; n++) {
        for (let p = 1; p <= posicoes; p++) {
            const nivelStr = n.toString().padStart(2, '0');
            const posStr = p.toString().padStart(2, '0');
            const apto = `${nivelStr}${posStr}`; // 0205

            const fullId = `${rua}-${predio}-${apto}`;

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

    // Save
    let current = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    current = [...current, ...newLocs];
    localStorage.setItem('wms_mock_data', JSON.stringify(current));

    locationsState.gridData = current;
    filterGrid();
    document.getElementById('modalGenerator').style.display = 'none';
    alert(`${newLocs.length} endereços gerados!`);
}

window.filterGrid = function () {
    const grid = document.getElementById('locationsGrid');
    const fRua = document.getElementById('filterAisle').value;

    let db = locationsState.gridData;

    if (fRua && fRua !== '') {
        db = db.filter(x => x.rua === fRua);
    }

    grid.innerHTML = '';

    if (db.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#94a3b8;">Nenhum endereço encontrado.</div>';
        return;
    }

    db.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'card';
        // Visual style: Green for free, Red for occupied
        const isOccupied = loc.status === 'OCUPADO';
        card.style.background = isOccupied ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
        card.style.borderColor = isOccupied ? '#ef4444' : '#10b981';
        card.style.padding = '0.5rem';
        card.style.textAlign = 'center';

        card.innerHTML = `
            <div style="font-size:0.7rem; color:#94a3b8;">RUA ${loc.rua} | PR ${loc.predio}</div>
            <div style="font-weight:700; font-size:1.1rem; margin:0.25rem 0;">${loc.apto}</div>
            <div style="font-size:0.65rem; font-weight:600; color:${isOccupied ? '#ef4444' : '#10b981'};">
                ${isOccupied ? 'OCUPADO' : 'LIVRE'}
            </div>
        `;
        grid.appendChild(card);
    });
}

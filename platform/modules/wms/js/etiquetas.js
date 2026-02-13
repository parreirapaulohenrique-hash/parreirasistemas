// WMS Etiquetas - Label Generator
// Generates HTML/CSS labels for printing (ZPL style simulation)

window.loadEtiquetasView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    container.innerHTML = `
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">qr_code_2</span>
                    Gerador de Etiquetas
                </h3>
            </div>
            <div style="padding:1.5rem; border-bottom:1px solid var(--border-color);">
                <div style="display:flex; gap:1rem; margin-bottom:1rem;">
                    <button class="btn btn-primary" onclick="renderEtiquetaEndereco()">
                        <span class="material-icons-round">location_on</span> Etiquetas de Endereço
                    </button>
                    <button class="btn btn-outline" onclick="renderEtiquetaProduto()">
                        <span class="material-icons-round">inventory_2</span> Etiquetas de Produto
                    </button>
                </div>
            </div>
            <div id="etiqueta-content" style="padding:1.5rem;">
                <!-- Content loads here -->
            </div>
        </div>
    `;

    renderEtiquetaEndereco();
};

window.renderEtiquetaEndereco = function () {
    const container = document.getElementById('etiqueta-content');
    if (!container) return;

    // Get addresses from StockManager (or mock data)
    const stockData = window.StockManager ? window.StockManager.getData() : { addresses: [] };
    const addresses = stockData.addresses.map(a => a.id || a.address).sort();

    container.innerHTML = `
        <h4 style="margin-bottom:1rem;">Selecionar Endereços para Impressão</h4>
        <div style="display:flex; gap:1rem; margin-bottom:1rem;">
            <div style="flex:1;">
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">Filtrar Rua</label>
                <input type="text" id="filter-rua" class="input-field" placeholder="Ex: 01" oninput="filterLabelList()">
            </div>
            <div style="flex:1;">
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">Filtrar Prédio</label>
                <input type="text" id="filter-predio" class="input-field" placeholder="Ex: 03" oninput="filterLabelList()">
            </div>
        </div>

        <div style="max-height:300px; overflow-y:auto; border:1px solid var(--border-color); border-radius:8px; margin-bottom:1rem;">
            <table class="data-table" style="margin:0;">
                <thead>
                    <tr>
                        <th width="40"><input type="checkbox" onchange="toggleAllLabels(this)"></th>
                        <th>Endereço</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="label-tbody">
                    ${addresses.map(addr => `
                        <tr>
                            <td><input type="checkbox" class="lbl-check" value="${addr}"></td>
                            <td>${addr}</td>
                            <td><span class="badge">Ativo</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-success" onclick="printSelectedLabels('endereco')">
                <span class="material-icons-round">print</span> Imprimir Selecionadas
            </button>
        </div>
    `;
};

window.renderEtiquetaProduto = function () {
    const container = document.getElementById('etiqueta-content');
    if (!container) return;

    // Simplification: Manual entry or list from stock
    container.innerHTML = `
        <h4 style="margin-bottom:1rem;">Gerar Etiqueta de Produto</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">SKU</label>
                <input type="text" id="lbl-sku" class="input-field" placeholder="Ex: SKU-1234">
            </div>
            <div>
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">Descrição</label>
                <input type="text" id="lbl-desc" class="input-field" placeholder="Ex: Parafuso Hexagonal...">
            </div>
            <div>
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">Lote</label>
                <input type="text" id="lbl-lote" class="input-field" placeholder="Lote atual">
            </div>
            <div>
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.3rem;">Quantidade (Cópias)</label>
                <input type="number" id="lbl-copies" class="input-field" value="1">
            </div>
        </div>
        <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-success" onclick="printProductLabel()">
                <span class="material-icons-round">print</span> Imprimir
            </button>
        </div>
    `;
};

window.filterLabelList = function () {
    // Basic filter impl
    const rua = document.getElementById('filter-rua').value.toLowerCase();
    const rows = document.querySelectorAll('#label-tbody tr');
    rows.forEach(r => {
        const txt = r.innerText.toLowerCase();
        if (txt.includes(rua)) r.style.display = '';
        else r.style.display = 'none';
    });
};

window.toggleAllLabels = function (source) {
    document.querySelectorAll('.lbl-check').forEach(c => c.checked = source.checked);
};

window.printSelectedLabels = function (type) {
    const checked = [...document.querySelectorAll('.lbl-check:checked')].map(c => c.value);
    if (checked.length === 0) return alert('Selecione pelo menos um endereço.');

    const win = window.open('', '_blank');
    win.document.write(`
        <html>
        <head>
            <title>Imprimir Etiquetas</title>
            <style>
                body { font-family: sans-serif; }
                .label-sheet { display: flex; flex-wrap: wrap; gap: 10px; }
                .label { 
                    width: 300px; height: 150px; border: 1px dashed #ccc; padding: 10px; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    page-break-inside: avoid;
                }
                .qr-placeholder { width: 80px; height: 80px; background: #000; margin-bottom:10px; }
                .addr-text { font-size: 24px; font-weight: bold; }
                @media print {
                    .label { border: none; outline: 1px solid #ddd; }
                }
            </style>
        </head>
        <body>
            <div class="label-sheet">
                ${checked.map(addr => `
                    <div class="label">
                        <!-- QR Code Mock -->
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${addr}" width="80" height="80" />
                        <div class="addr-text">${addr}</div>
                        <div style="font-size:12px;">WMS LOCATION</div>
                    </div>
                `).join('')}
            </div>
            <script>window.print();</script>
        </body>
        </html>
    `);
    win.document.close();
};

window.printProductLabel = function () {
    const sku = document.getElementById('lbl-sku').value;
    const desc = document.getElementById('lbl-desc').value;
    const lote = document.getElementById('lbl-lote').value;
    const copies = parseInt(document.getElementById('lbl-copies').value) || 1;

    if (!sku) return alert('Informe o SKU');

    const win = window.open('', '_blank');
    let content = '';
    for (let i = 0; i < copies; i++) {
        content += `
            <div class="label">
                <div style="font-size:18px; font-weight:bold;">${sku}</div>
                <div style="font-size:14px; margin-bottom:5px;">${desc}</div>
                <!-- Barcode Mock using Font or simple div bars -->
                <div style="height:40px; background:repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px); width:80%;"></div>
                <div style="font-size:12px; margin-top:5px;">Lote: ${lote} | ${new Date().toLocaleDateString()}</div>
            </div>
        `;
    }

    win.document.write(`
        <html>
        <head>
            <title>Imprimir Etiquetas Produto</title>
            <style>
                body { font-family: sans-serif; }
                .label-sheet { display: flex; flex-wrap: wrap; gap: 10px; }
                .label { 
                    width: 200px; height: 120px; border: 1px dashed #ccc; padding: 10px; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align:center;
                    page-break-inside: avoid;
                }
                @media print { .label { border: 1px solid #000; } }
            </style>
        </head>
        <body>
            <div class="label-sheet">${content}</div>
            <script>window.print();</script>
        </body>
        </html>
    `);
    win.document.close();
};

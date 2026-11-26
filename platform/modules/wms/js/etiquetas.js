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

        <div style="display:flex; justify-content:flex-end; gap:0.6rem; align-items:center;">
            <button class="btn btn-outline" type="button" onclick="copiarZplSelecionados()">
                <span class="material-icons-round">qr_code</span> Copiar ZPL II (Zebra)
            </button>
            <button class="btn btn-success" type="button" onclick="printSelectedLabels('endereco')">
                <span class="material-icons-round">print</span> Imprimir Térmica / HTML
            </button>
        </div>
    `;
};

window.copiarZplSelecionados = function () {
    const checked = [...document.querySelectorAll('.lbl-check:checked')].map(c => c.value);
    if (checked.length === 0) return alert('Selecione pelo menos um endereço para gerar ZPL.');

    if (window.WmsEtiquetas && WmsEtiquetas.gerarZplEndereco) {
        const fullZpl = checked.map(addr => WmsEtiquetas.gerarZplEndereco({ endereco: addr, tipo: 'PICKING' })).join('\n');
        WmsEtiquetas.copiarZpl(fullZpl);
    } else {
        alert('Módulo ZPL indisponível no momento.');
    }
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

    if (type === 'endereco' && window.WmsEtiquetas && window.WmsEtiquetas._extrairDadosEndereco) {
        const stockData = window.StockManager ? window.StockManager.getData() : { addresses: [] };
        const addrsMap = {};
        (stockData.addresses || []).forEach(a => addrsMap[a.id || a.address] = a);

        const win = window.open('', '_blank');
        const cardsHtml = checked.map(addr => {
            const raw = addrsMap[addr] || { id: addr, endereco: addr };
            const d = WmsEtiquetas._extrairDadosEndereco(raw);
            const extrasHtml = (d.camposEtiqueta && d.camposEtiqueta.length > 0)
                ? `<div style="width:100%;font-size:7.5pt;color:#333;margin-top:2px;display:flex;gap:6px;justify-content:center;border-top:1px dashed #ccc;padding-top:2px;">
                    ${d.camposEtiqueta.map(c => `<span><strong>${c.label}:</strong> ${c.valor}</span>`).join(' • ')}
                   </div>`
                : '';

            return `
                <div class="label" style="
                    width: 105mm; height: 38mm; border: 1.5px solid #000; border-radius: 8px; padding: 3mm 4mm;
                    box-sizing: border-box; display: flex; flex-direction: column; justify-content: center;
                    page-break-inside: avoid; background: #fff; font-family: 'Inter', Arial, sans-serif; margin: 4mm;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <!-- RUA -->
                        <div style="flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-size: 11pt; font-weight: 700; color: #111; letter-spacing: 0.5px; text-transform: uppercase;">${d.lblRua}</span>
                            <span style="font-size: 38pt; font-weight: 900; line-height: 1.05; color: #000; margin-top: 2px;">${d.rua}</span>
                        </div>
                        <!-- PRÉDIO -->
                        <div style="flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-size: 11pt; font-weight: 700; color: #111; letter-spacing: 0.5px; text-transform: uppercase;">${d.lblPredio}</span>
                            <span style="font-size: 38pt; font-weight: 900; line-height: 1.05; color: #000; margin-top: 2px;">${d.predio}</span>
                        </div>
                        <!-- APTO (Invertido) -->
                        <div style="background: #000; color: #fff; border-radius: 4px; padding: 2mm 3.5mm; min-width: 27mm; display: flex; flex-direction: column; justify-content: space-between; align-items: center; box-sizing: border-box; height: 29mm;">
                            <div style="width: 100%; text-align: right; font-size: 9pt; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #fff; line-height: 1;">${d.lblApto}</div>
                            <div style="font-size: 35pt; font-weight: 900; line-height: 1; color: #fff; text-align: center; width: 100%; margin-top: auto; margin-bottom: auto;">${d.apto}</div>
                        </div>
                        <!-- QR Code + ID -->
                        <div style="margin-left: 3mm; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 24mm;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.qrData)}" style="width: 21mm; height: 21mm; display: block;" alt="QR" />
                            <span style="font-family: 'Courier New', monospace; font-size: 10pt; font-weight: 700; color: #222; margin-top: 1.5mm; letter-spacing: 0.5px;">${d.idNum}</span>
                        </div>
                    </div>
                    ${extrasHtml}
                </div>
            `;
        }).join('');

        win.document.write(`
            <html>
            <head>
                <title>Imprimir Etiquetas de Endereçamento</title>
                <style>
                    @page { size: auto; margin: 5mm; }
                    body { font-family: sans-serif; margin: 0; padding: 10px; background: #f8fafc; }
                    .label-sheet { display: flex; flex-wrap: wrap; justify-content: center; gap: 6mm; }
                    @media print {
                        body { background: #fff; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="label-sheet">${cardsHtml}</div>
                <script>
                    window.onload = function() {
                        setTimeout(() => window.print(), 400);
                    };
                </script>
            </body>
            </html>
        `);
        win.document.close();
        return;
    }

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


// ===========================================
// IMPORT PRODUTOS (EXCEL) - COM MAPEAMENTO
// ===========================================
window._importProdData = { rows: [], headers: [] };

window.handleImportProdutos = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        if (!window.XLSX) {
            if (!document.querySelector('script[data-sheetjs]')) {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                s.setAttribute('data-sheetjs', 'true');
                document.head.appendChild(s);
            }
            alert('Carregando motor de planilhas. Por favor, aguarde 2 segundos e selecione o arquivo novamente.');
            input.value = '';
            return;
        }

        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (rows.length < 2) {
                alert('Planilha vazia ou inválida.');
                input.value = '';
                return;
            }
            
            const headers = rows[0].map(h => String(h).trim());
            window._importProdData.headers = headers;
            window._importProdData.rows = rows.slice(1);
            
            openProdMappingModal();
            
        } catch (err) {
            console.error('Erro na leitura da planilha:', err);
            alert('Erro ao processar a planilha. Verifique se o formato é válido.');
        }
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
};

window.openProdMappingModal = function() {
    let existing = document.getElementById('prodMapModal');
    if (existing) existing.remove();

    const config = CAD_CONFIG['cad-prod-cadastro'];
    const headers = window._importProdData.headers;
    
    // Auto-detect mappings based on name similarity
    const autoMap = {};
    const normH = headers.map(h => h.toLowerCase());
    config.fields.forEach(f => {
        const fn = f.name.toLowerCase();
        const fl = f.label.toLowerCase();
        const idx = normH.findIndex(h => h === fn || h === fl || 
            (fn === 'sku' && (h.includes('código') || h.includes('codigo') || h === 'produto')) ||
            (fn === 'descricao' && (h.includes('descri') || h === 'nome')) ||
            (fn === 'ean' && (h.includes('barras') || h.includes('gtin'))) ||
            (fn === 'unidade' && h === 'und') ||
            (fn === 'pesobruto' && h.includes('bruto'))
        );
        if (idx !== -1) autoMap[f.name] = headers[idx];
    });

    const opts = `<option value="">(Não importar)</option>` +
        headers.map(c => `<option value="${c}">${c}</option>`).join('');

    const fieldsHTML = config.fields.map(f => {
        const sel = autoMap[f.name] || '';
        return `
        <div style="margin-bottom:0.75rem;">
            <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">
                ${f.label}${f.required ? ' <span style="color:var(--wms-danger);">*</span>' : ''}
            </label>
            <select id="map-prod-${f.name}" class="form-input" style="width:100%; font-size:0.8rem;" onchange="_prodUpdatePreview()">
                ${opts.replace(`value="${sel}"`, `value="${sel}" selected`)}
            </select>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'prodMapModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center; backdrop-filter:blur(3px);';
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:900px; max-height:90vh; display:flex; flex-direction:column; margin:1rem; animation:fadeIn 0.2s ease; overflow:hidden;">
            <div class="card-header" style="padding:1.25rem 1.5rem; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color);">
                <div>
                    <h3 style="font-size:1.1rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
                        <span class="material-icons-round" style="color:var(--wms-primary);">compare_arrows</span>
                        Mapeamento de Produtos
                    </h3>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">Vincule as colunas da sua planilha com os campos do WMS</div>
                </div>
                <button class="btn btn-secondary btn-icon" onclick="document.getElementById('prodMapModal').remove()" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1.2rem;">close</span>
                </button>
            </div>
            
            <div style="display:flex; flex:1; overflow:hidden;">
                <!-- Left: Mapping -->
                <div style="width:300px; padding:1.5rem; overflow-y:auto; border-right:1px solid var(--border-color); background:rgba(0,0,0,0.1);">
                    ${fieldsHTML}
                </div>
                
                <!-- Right: Preview -->
                <div style="flex:1; padding:1.5rem; overflow-y:auto; display:flex; flex-direction:column;">
                    <h4 style="font-size:0.9rem; margin-bottom:1rem; color:var(--text-secondary);">Pré-visualização (5 primeiras linhas)</h4>
                    <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:8px; flex:1;">
                        <table class="data-table" id="prodMapPreviewTable">
                            <!-- Injected dynamically -->
                        </table>
                    </div>
                </div>
            </div>
            
            <div style="padding:1.25rem 1.5rem; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:var(--bg-card);">
                <div id="prodMapSummary" style="font-size:0.85rem; font-weight:600; color:var(--text-secondary);"></div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary" onclick="document.getElementById('prodMapModal').remove()">Cancelar</button>
                    <button class="btn btn-primary" onclick="_prodConfirmImport()">
                        <span class="material-icons-round" style="font-size:1rem;">check_circle</span> Confirmar Importação
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    _prodUpdatePreview();
};

window._prodGetMap = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = {};
    config.fields.forEach(f => {
        const el = document.getElementById('map-prod-' + f.name);
        if (el && el.value) map[f.name] = el.value;
    });
    return map;
};

window._prodUpdatePreview = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = _prodGetMap();
    const { headers, rows } = window._importProdData;
    
    // Check required fields
    const missing = config.fields.filter(f => f.required && !map[f.name]).map(f => f.label);
    const summary = document.getElementById('prodMapSummary');
    
    if (missing.length > 0) {
        summary.innerHTML = `<span style="color:var(--wms-danger);"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;margin-right:4px;">warning</span>Atenção: Mapeie os campos obrigatórios (${missing.join(', ')})</span>`;
    } else {
        summary.innerHTML = `<span style="color:#10b981;"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>Pronto para importar ${rows.length} produtos.</span>`;
    }

    const table = document.getElementById('prodMapPreviewTable');
    
    // Build Headers
    const mappedCols = Object.keys(map);
    const ths = mappedCols.map(k => {
        const f = config.fields.find(x => x.name === k);
        return `<th>${f ? f.label : k}</th>`;
    }).join('');
    
    const thead = `<thead><tr>${ths}</tr></thead>`;
    
    // Build Rows
    const previewRows = rows.slice(0, 5);
    const tbody = `<tbody>${previewRows.map(row => {
        const tds = mappedCols.map(k => {
            const hName = map[k];
            const hIdx = headers.indexOf(hName);
            const val = hIdx !== -1 ? row[hIdx] : '';
            return `<td><div style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${val}">${val}</div></td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('')}</tbody>`;
    
    table.innerHTML = thead + tbody;
};

window._prodConfirmImport = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = _prodGetMap();
    
    const missing = config.fields.filter(f => f.required && !map[f.name]).map(f => f.label);
    if (missing.length > 0) {
        alert('Você precisa mapear as colunas obrigatórias: ' + missing.join(', '));
        return;
    }
    
    const { headers, rows } = window._importProdData;
    let countNew = 0;
    let countUpdate = 0;
    
    const cadData = getCadastroData();
    if (!cadData['produtos']) cadData['produtos'] = [];
    const produtos = cadData['produtos'];
    
    const existingSkus = {};
    produtos.forEach((p, index) => {
        existingSkus[String(p.sku).trim().toUpperCase()] = index;
    });
    
    // Create fast lookup for column indexes
    const mapIdx = {};
    Object.keys(map).forEach(k => {
        mapIdx[k] = headers.indexOf(map[k]);
    });
    
    rows.forEach(row => {
        if (!row || row.length === 0) return;
        
        const skuIdx = mapIdx['sku'];
        const skuVal = row[skuIdx];
        if (skuVal === undefined || skuVal === null || String(skuVal).trim() === '') return;
        const sku = String(skuVal).trim();
        const skuKey = sku.toUpperCase();
        
        const itemObj = {};
        Object.keys(mapIdx).forEach(k => {
            const idx = mapIdx[k];
            let val = idx !== -1 ? row[idx] : '';
            // Treat boolean fields
            const fieldDef = config.fields.find(f => f.name === k);
            if (fieldDef && fieldDef.type === 'checkbox') {
                const s = String(val).toLowerCase();
                val = (s === 'sim' || s === 'true' || s === '1' || s === 's' || val === true || val === 1);
            }
            // Treat numeric fields
            if (fieldDef && fieldDef.type === 'number') {
                if (val === '') val = null;
                else val = parseFloat(String(val).replace(',','.'));
            }
            itemObj[k] = val;
        });
        
        if (existingSkus.hasOwnProperty(skuKey)) {
            const pIdx = existingSkus[skuKey];
            Object.assign(produtos[pIdx], itemObj);
            countUpdate++;
        } else {
            itemObj.id = 'PROD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            itemObj.ativo = true;
            produtos.push(itemObj);
            existingSkus[skuKey] = produtos.length - 1;
            countNew++;
        }
    });
    
    saveCadastroData(cadData);
    alert(`Importação concluída!\nNovos produtos: ${countNew}\nAtualizados: ${countUpdate}`);
    
    document.getElementById('prodMapModal').remove();
    loadCadastroView('cad-prod-cadastro');
};

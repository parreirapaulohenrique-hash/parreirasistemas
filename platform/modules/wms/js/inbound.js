// WMS Inbound (Recebimento) Logic

let inboundState = {
    receipts: [], // All receiving records
    currentReceipt: null
};

// --- Main Entry ---
window.loadInboundView = async function () {
    const container = document.getElementById('view-inbound');

    if (container.innerHTML.trim() === '' || container.querySelector('h2')) {
        container.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1rem;">
                <div class="card" style="border-left:3px solid var(--primary-color);">
                    <div class="card-body" style="padding:0.75rem;">
                        <div style="font-size:0.7rem; color:var(--text-secondary);">Aguardando</div>
                        <div id="inbStatPending" style="font-size:1.5rem; font-weight:700; color:var(--primary-color);">0</div>
                    </div>
                </div>
                <div class="card" style="border-left:3px solid #f59e0b;">
                    <div class="card-body" style="padding:0.75rem;">
                        <div style="font-size:0.7rem; color:var(--text-secondary);">Em Conferência</div>
                        <div id="inbStatChecking" style="font-size:1.5rem; font-weight:700; color:#f59e0b;">0</div>
                    </div>
                </div>
                <div class="card" style="border-left:3px solid #10b981;">
                    <div class="card-body" style="padding:0.75rem;">
                        <div style="font-size:0.7rem; color:var(--text-secondary);">Finalizados</div>
                        <div id="inbStatDone" style="font-size:1.5rem; font-weight:700; color:#10b981;">0</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Recebimento de Mercadorias</h3>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="loadInboundData()">
                            <span class="material-icons-round">refresh</span>
                        </button>
                        <button class="btn btn-primary" onclick="openNewReceiptModal()">
                            <span class="material-icons-round">add_circle</span> Nova Entrada
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div style="max-height:55vh; overflow:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                            <thead style="position:sticky; top:0; background:var(--bg-card); z-index:1;">
                                <tr>
                                    <th style="padding:0.6rem; text-align:left; border-bottom:1px solid var(--border-color);">NF</th>
                                    <th style="padding:0.6rem; text-align:left; border-bottom:1px solid var(--border-color);">Fornecedor</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Itens</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Data</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color);">Status</th>
                                    <th style="padding:0.6rem; text-align:center; border-bottom:1px solid var(--border-color); width:140px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="inboundTableBody">
                                <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhuma entrada registrada.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Nova Entrada -->
            <div id="modalNewReceipt" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
                <div class="card" style="width:600px; max-height:85vh; overflow:auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>Registrar Entrada de Mercadoria</h3>
                        <span class="material-icons-round" style="cursor:pointer; color:var(--text-secondary);" onclick="closeReceiptModal()">close</span>
                    </div>
                    <div class="card-body" style="padding:1.25rem;">
                        <!-- Header Info -->
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Número da NF</label>
                                <input type="text" id="recNF" class="form-input" placeholder="Ex: 123456">
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Fornecedor</label>
                                <input type="text" id="recSupplier" class="form-input" placeholder="Nome do fornecedor">
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Doca</label>
                                <select id="recDock" class="form-input">
                                    <option value="DOCA-01">Doca 01</option>
                                    <option value="DOCA-02">Doca 02</option>
                                    <option value="DOCA-03">Doca 03</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-secondary" style="font-size:0.8rem; display:block; margin-bottom:0.25rem;">Tipo</label>
                                <select id="recType" class="form-input">
                                    <option value="COMPRA">Compra</option>
                                    <option value="DEVOLUCAO">Devolução</option>
                                    <option value="TRANSFERENCIA">Transferência</option>
                                </select>
                            </div>
                        </div>

                        <!-- Items Section -->
                        <div style="border-top:1px solid var(--border-color); padding-top:1rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                                <h4 style="font-size:0.9rem;">Itens da NF</h4>
                                <button class="btn btn-secondary" onclick="addItemRow()" style="font-size:0.8rem; padding:0.3rem 0.6rem;">
                                    <span class="material-icons-round" style="font-size:0.9rem;">add</span> Item
                                </button>
                            </div>
                            <div id="recItemsList">
                                <div class="rec-item-row" style="display:grid; grid-template-columns:2fr 0.5fr 0.7fr auto; gap:0.5rem; align-items:end; margin-bottom:0.5rem;">
                                    <div>
                                        <label class="text-secondary" style="font-size:0.7rem;">Produto / SKU</label>
                                        <input type="text" class="form-input item-sku" placeholder="Descrição ou código" style="font-size:0.8rem;">
                                    </div>
                                    <div>
                                        <label class="text-secondary" style="font-size:0.7rem;">Qtd</label>
                                        <input type="number" class="form-input item-qty" value="1" min="1" style="font-size:0.8rem;">
                                    </div>
                                    <div>
                                        <label class="text-secondary" style="font-size:0.7rem;">Endereço</label>
                                        <input type="text" class="form-input item-loc" placeholder="01-10-0101" style="font-size:0.8rem;">
                                    </div>
                                    <button onclick="this.closest('.rec-item-row').remove()" style="background:none; border:none; color:#ef4444; cursor:pointer; padding-bottom:0.3rem;">
                                        <span class="material-icons-round" style="font-size:1.1rem;">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="padding:1rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="closeReceiptModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="saveReceipt()">
                            <span class="material-icons-round" style="font-size:1rem;">save</span> Registrar Entrada
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal Conferência -->
            <div id="modalConferencia" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
                <div class="card" style="width:550px; max-height:80vh; overflow:auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>Conferência Cega</h3>
                        <span class="material-icons-round" style="cursor:pointer; color:var(--text-secondary);" onclick="document.getElementById('modalConferencia').style.display='none'">close</span>
                    </div>
                    <div class="card-body" id="confBody" style="padding:1.25rem;">
                    </div>
                    <div style="padding:1rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button class="btn btn-secondary" onclick="document.getElementById('modalConferencia').style.display='none'">Cancelar</button>
                        <button class="btn btn-primary" onclick="finishConferencia()">
                            <span class="material-icons-round" style="font-size:1rem;">check</span> Finalizar Conferência
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    loadInboundData();
}

// --- Add Item Row ---
window.addItemRow = function () {
    const list = document.getElementById('recItemsList');
    const row = document.createElement('div');
    row.className = 'rec-item-row';
    row.style.cssText = 'display:grid; grid-template-columns:2fr 0.5fr 0.7fr auto; gap:0.5rem; align-items:end; margin-bottom:0.5rem;';
    row.innerHTML = `
        <div>
            <input type="text" class="form-input item-sku" placeholder="Produto / SKU" style="font-size:0.8rem;">
        </div>
        <div>
            <input type="number" class="form-input item-qty" value="1" min="1" style="font-size:0.8rem;">
        </div>
        <div>
            <input type="text" class="form-input item-loc" placeholder="01-10-0101" style="font-size:0.8rem;">
        </div>
        <button onclick="this.closest('.rec-item-row').remove()" style="background:none; border:none; color:#ef4444; cursor:pointer; padding-bottom:0.3rem;">
            <span class="material-icons-round" style="font-size:1.1rem;">close</span>
        </button>
    `;
    list.appendChild(row);
}

// --- Modal Controls ---
window.openNewReceiptModal = function () {
    document.getElementById('recNF').value = '';
    document.getElementById('recSupplier').value = '';
    // Reset items to single row
    const list = document.getElementById('recItemsList');
    list.innerHTML = `
        <div class="rec-item-row" style="display:grid; grid-template-columns:2fr 0.5fr 0.7fr auto; gap:0.5rem; align-items:end; margin-bottom:0.5rem;">
            <div>
                <label class="text-secondary" style="font-size:0.7rem;">Produto / SKU</label>
                <input type="text" class="form-input item-sku" placeholder="Descrição ou código" style="font-size:0.8rem;">
            </div>
            <div>
                <label class="text-secondary" style="font-size:0.7rem;">Qtd</label>
                <input type="number" class="form-input item-qty" value="1" min="1" style="font-size:0.8rem;">
            </div>
            <div>
                <label class="text-secondary" style="font-size:0.7rem;">Endereço</label>
                <input type="text" class="form-input item-loc" placeholder="01-10-0101" style="font-size:0.8rem;">
            </div>
            <button onclick="this.closest('.rec-item-row').remove()" style="background:none; border:none; color:#ef4444; cursor:pointer; padding-bottom:0.3rem;">
                <span class="material-icons-round" style="font-size:1.1rem;">close</span>
            </button>
        </div>
    `;
    document.getElementById('modalNewReceipt').style.display = 'flex';
}

window.closeReceiptModal = function () {
    document.getElementById('modalNewReceipt').style.display = 'none';
}

// --- Save Receipt ---
window.saveReceipt = function () {
    const nf = document.getElementById('recNF').value.trim();
    const supplier = document.getElementById('recSupplier').value.trim();
    const dock = document.getElementById('recDock').value;
    const type = document.getElementById('recType').value;

    if (!nf || !supplier) {
        alert('Preencha NF e Fornecedor!');
        return;
    }

    // Collect items
    const rows = document.querySelectorAll('.rec-item-row');
    let items = [];
    rows.forEach(row => {
        const sku = row.querySelector('.item-sku')?.value?.trim();
        const qty = parseInt(row.querySelector('.item-qty')?.value) || 0;
        const loc = row.querySelector('.item-loc')?.value?.trim();
        if (sku && qty > 0) {
            // Generate LPN
            const lpn = `LPN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            items.push({ sku, qty, location: loc || '', lpn, checked: false, qtyChecked: 0 });
        }
    });

    if (items.length === 0) {
        alert('Adicione pelo menos um item!');
        return;
    }

    const receipt = {
        id: `REC-${Date.now()}`,
        nf: nf,
        supplier: supplier,
        dock: dock,
        type: type,
        items: items,
        status: 'AGUARDANDO', // AGUARDANDO → CONFERENCIA → FINALIZADO
        createdAt: new Date().toISOString(),
        totalItems: items.length,
        totalQty: items.reduce((s, i) => s + i.qty, 0)
    };

    let receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    receipts.unshift(receipt); // Add to top
    localStorage.setItem('wms_receipts', JSON.stringify(receipts));

    // Update location status if assigned
    let locations = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
    items.forEach(item => {
        if (item.location) {
            const loc = locations.find(l => l.id === item.location);
            if (loc) {
                loc.status = 'OCUPADO';
            }
        }
    });
    localStorage.setItem('wms_mock_data', JSON.stringify(locations));

    closeReceiptModal();
    loadInboundData();

    // Also update dashboard stats
    if (window.updateDashboardStats) updateDashboardStats();

    alert(`NF ${nf} registrada com ${items.length} item(ns)!\nLPNs gerados automaticamente.`);
}

// --- Load Data ---
window.loadInboundData = function () {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    inboundState.receipts = receipts;

    // Stats
    const pending = receipts.filter(r => r.status === 'AGUARDANDO').length;
    const checking = receipts.filter(r => r.status === 'CONFERENCIA').length;
    const done = receipts.filter(r => r.status === 'FINALIZADO').length;

    const el = (id) => document.getElementById(id);
    if (el('inbStatPending')) el('inbStatPending').textContent = pending;
    if (el('inbStatChecking')) el('inbStatChecking').textContent = checking;
    if (el('inbStatDone')) el('inbStatDone').textContent = done;

    // Table
    const tbody = document.getElementById('inboundTableBody');
    if (!tbody) return;

    if (receipts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhuma entrada registrada.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    receipts.forEach(rec => {
        const statusColors = {
            'AGUARDANDO': { bg: 'rgba(14,165,233,0.15)', color: '#0ea5e9' },
            'CONFERENCIA': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
            'FINALIZADO': { bg: 'rgba(16,185,129,0.15)', color: '#10b981' }
        };
        const sc = statusColors[rec.status] || statusColors['AGUARDANDO'];
        const date = new Date(rec.createdAt).toLocaleDateString('pt-BR');

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        tr.innerHTML = `
            <td style="padding:0.6rem; font-weight:600;">${rec.nf}</td>
            <td style="padding:0.6rem;">${rec.supplier}</td>
            <td style="padding:0.6rem; text-align:center;">${rec.totalItems} (${rec.totalQty} un)</td>
            <td style="padding:0.6rem; text-align:center;">${date}</td>
            <td style="padding:0.6rem; text-align:center;">
                <span style="background:${sc.bg}; color:${sc.color}; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.7rem; font-weight:600;">
                    ${rec.status}
                </span>
            </td>
            <td style="padding:0.6rem; text-align:center;">
                ${rec.status === 'AGUARDANDO' ? `
                    <button onclick="startConferencia('${rec.id}')" style="background:none; border:none; cursor:pointer; color:#f59e0b;" title="Iniciar Conferência">
                        <span class="material-icons-round" style="font-size:1.1rem;">fact_check</span>
                    </button>
                ` : ''}
                ${rec.status === 'CONFERENCIA' ? `
                    <button onclick="startConferencia('${rec.id}')" style="background:none; border:none; cursor:pointer; color:#f59e0b;" title="Continuar Conferência">
                        <span class="material-icons-round" style="font-size:1.1rem;">fact_check</span>
                    </button>
                ` : ''}
                <button onclick="viewReceiptDetails('${rec.id}')" style="background:none; border:none; cursor:pointer; color:var(--primary-color);" title="Detalhes">
                    <span class="material-icons-round" style="font-size:1.1rem;">visibility</span>
                </button>
                <button onclick="deleteReceipt('${rec.id}')" style="background:none; border:none; cursor:pointer; color:#ef4444;" title="Excluir">
                    <span class="material-icons-round" style="font-size:1.1rem;">delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Conferência Cega ---
window.startConferencia = function (recId) {
    let receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const rec = receipts.find(r => r.id === recId);
    if (!rec) return;

    // Update status
    rec.status = 'CONFERENCIA';
    localStorage.setItem('wms_receipts', JSON.stringify(receipts));
    inboundState.currentReceipt = rec;

    // Build blind check form
    const body = document.getElementById('confBody');
    body.innerHTML = `
        <div style="background:rgba(14,165,233,0.1); color:var(--primary-color); padding:0.75rem; border-radius:6px; font-size:0.85rem; margin-bottom:1rem;">
            <strong>NF: ${rec.nf}</strong> | Fornecedor: ${rec.supplier} | Doca: ${rec.dock}
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
            Confira cada item. Informe a quantidade física recebida:
        </p>
        <div id="confItems">
            ${rec.items.map((item, i) => `
                <div style="display:grid; grid-template-columns:2fr 0.7fr 0.7fr 0.7fr; gap:0.5rem; align-items:center; margin-bottom:0.5rem; padding:0.5rem; background:var(--bg-dark); border-radius:4px;">
                    <div>
                        <div style="font-weight:600; font-size:0.85rem;">${item.sku}</div>
                        <div style="font-size:0.65rem; color:var(--text-secondary);">LPN: ${item.lpn}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.65rem; color:var(--text-secondary);">Esperado</div>
                        <div style="font-weight:700;">${item.qty}</div>
                    </div>
                    <div>
                        <div style="font-size:0.65rem; color:var(--text-secondary);">Contado</div>
                        <input type="number" class="form-input conf-qty" data-index="${i}" value="${item.qtyChecked || ''}" min="0" style="font-size:0.85rem; text-align:center;">
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.65rem; color:var(--text-secondary);">End.</div>
                        <div style="font-size:0.8rem;">${item.location || '-'}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    document.getElementById('modalConferencia').style.display = 'flex';
    loadInboundData();
}

window.finishConferencia = function () {
    const rec = inboundState.currentReceipt;
    if (!rec) return;

    // Read counted quantities
    const inputs = document.querySelectorAll('.conf-qty');
    let allMatch = true;
    let divergences = [];

    inputs.forEach(input => {
        const idx = parseInt(input.dataset.index);
        const counted = parseInt(input.value) || 0;
        rec.items[idx].qtyChecked = counted;
        rec.items[idx].checked = true;

        if (counted !== rec.items[idx].qty) {
            allMatch = false;
            divergences.push(`${rec.items[idx].sku}: Esperado ${rec.items[idx].qty}, Contado ${counted}`);
        }
    });

    rec.status = 'FINALIZADO';

    // Save
    let receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const idx = receipts.findIndex(r => r.id === rec.id);
    if (idx >= 0) receipts[idx] = rec;
    localStorage.setItem('wms_receipts', JSON.stringify(receipts));

    document.getElementById('modalConferencia').style.display = 'none';
    loadInboundData();

    if (allMatch) {
        alert(`Conferência NF ${rec.nf} finalizada!\nTodos os itens conferem.`);
    } else {
        alert(`Conferência NF ${rec.nf} finalizada com DIVERGÊNCIAS:\n\n${divergences.join('\n')}`);
    }
}

// --- View Details ---
window.viewReceiptDetails = function (recId) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    const rec = receipts.find(r => r.id === recId);
    if (!rec) return;

    let detail = `NF: ${rec.nf}\nFornecedor: ${rec.supplier}\nDoca: ${rec.dock}\nTipo: ${rec.type}\nStatus: ${rec.status}\nData: ${new Date(rec.createdAt).toLocaleString('pt-BR')}\n\n--- ITENS ---\n`;
    rec.items.forEach((item, i) => {
        detail += `\n${i + 1}. ${item.sku} | Qtd: ${item.qty} | LPN: ${item.lpn} | End: ${item.location || 'N/A'}`;
        if (item.checked) detail += ` | Conferido: ${item.qtyChecked}`;
    });
    alert(detail);
}

// --- Delete ---
window.deleteReceipt = function (recId) {
    if (!confirm('Excluir este recebimento?')) return;
    let receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
    receipts = receipts.filter(r => r.id !== recId);
    localStorage.setItem('wms_receipts', JSON.stringify(receipts));
    loadInboundData();
}

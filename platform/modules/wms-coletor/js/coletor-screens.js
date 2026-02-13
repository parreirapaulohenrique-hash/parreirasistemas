// WMS Coletor — Functional Screens
// Recebimento, Armazenar, Separar, Inventário
// All screens use scanner-driven workflow and share localStorage with WMS PC

// ===================================
// 1. RECEBIMENTO (Receiving)
// ===================================
// Workflow: Scan NF barcode → see items list → scan/input each item qty → confirm receipt

window.handleScanRecebimento = function (code) {
    // If NF is loaded, treat scan as SKU scan
    if (window._recebimentoNF) {
        const item = window._recebimentoNF.items.find(i => i.sku === code);
        if (item) {
            item.received = Math.min((item.received || 0) + 1, item.qty);
            renderRecebimentoItems();
            showToast(`+1 ${item.desc}`, 'success');
        } else {
            showToast('SKU não encontrado nesta NF', 'warning');
        }
        return;
    }

    // Otherwise, treat as NF scan
    const receipts = wmsData.getReceipts();
    const nf = receipts.find(r => r.nf === code || r.id === code);
    if (nf) {
        loadNFForReceiving(nf);
    } else {
        showToast('NF não encontrada: ' + code, 'danger');
    }
};

function loadNFForReceiving(nf) {
    window._recebimentoNF = {
        id: nf.id, nf: nf.nf, supplier: nf.supplier || nf.fornecedor || 'Fornecedor',
        items: (nf.items || []).map(i => ({
            sku: i.sku || i.code, desc: i.desc || i.description || 'Produto',
            qty: i.qty || i.quantidade || 0, received: i.received || 0
        }))
    };
    renderRecebimentoItems();
}

function initRecebimentoScreen(container) {
    const receipts = wmsData.getReceipts();
    const pending = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA');

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--primary);">move_to_inbox</span>
                    Recebimento de NF
                </span>
                <span class="m-badge m-badge-yellow">${pending.length} pendentes</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
                Escaneie o código de barras da NF ou selecione abaixo:
            </p>
            ${pending.length > 0 ? pending.map(r => `
                <div class="m-list-item" onclick="loadNFById('${r.id}')" style="cursor:pointer; border-radius:8px; margin-bottom:0.5rem; background:rgba(255,255,255,0.02);">
                    <span class="material-icons-round" style="font-size:1.5rem; color:var(--primary);">description</span>
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:0.9rem;">NF ${r.nf || r.id}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${r.supplier || r.fornecedor || 'Fornecedor'} • ${(r.items || []).length} itens</div>
                    </div>
                    <span class="m-badge ${r.status === 'CONFERENCIA' ? 'm-badge-yellow' : 'm-badge-blue'}">${r.status}</span>
                </div>
            `).join('') : `
                <div style="text-align:center; padding:2rem; color:var(--text-secondary);">
                    <span class="material-icons-round" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:0.5rem;">check_circle</span>
                    Nenhuma NF pendente
                </div>
            `}
        </div>
    `;
}

window.loadNFById = function (nfId) {
    const receipts = wmsData.getReceipts();
    const nf = receipts.find(r => r.id === nfId);
    if (nf) loadNFForReceiving(nf);
};

function renderRecebimentoItems() {
    const nf = window._recebimentoNF;
    if (!nf) return;

    const container = document.getElementById('screen-recebimento');
    const totalExpected = nf.items.reduce((s, i) => s + i.qty, 0);
    const totalReceived = nf.items.reduce((s, i) => s + (i.received || 0), 0);
    const pct = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid var(--primary);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <div>
                    <div style="font-weight:700;">NF ${nf.nf}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${nf.supplier}</div>
                </div>
                <span class="m-badge ${pct === 100 ? 'm-badge-green' : 'm-badge-blue'}">${pct}%</span>
            </div>
            <div style="background:rgba(255,255,255,0.05); border-radius:4px; height:6px; overflow:hidden; margin-bottom:0.5rem;">
                <div style="width:${pct}%; height:100%; background:${pct === 100 ? 'var(--success)' : 'var(--primary)'}; border-radius:4px; transition:width 0.3s;"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${totalReceived}/${totalExpected} itens conferidos</div>
        </div>

        ${nf.items.map((item, idx) => {
        const done = (item.received || 0) >= item.qty;
        return `
            <div class="m-card" style="border-left:3px solid ${done ? 'var(--success)' : 'var(--border)'}; ${done ? 'opacity:0.6;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:0.85rem;">${item.desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); font-family:monospace;">${item.sku}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.1rem; font-weight:700; color:${done ? 'var(--success)' : 'var(--text-primary)'};">
                            ${item.received || 0}<span style="font-size:0.8rem; color:var(--text-secondary);">/${item.qty}</span>
                        </div>
                    </div>
                </div>
                ${!done ? `
                <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                    <button class="m-btn m-btn-primary" style="flex:1; padding:0.6rem; font-size:0.85rem;"
                        onclick="addQtyRecebimento(${idx}, 1)">
                        <span class="material-icons-round" style="font-size:1rem;">add</span> +1
                    </button>
                    <button class="m-btn m-btn-outline" style="width:70px; padding:0.6rem; font-size:0.85rem;"
                        onclick="addQtyRecebimento(${idx}, ${item.qty - (item.received || 0)})">Tudo</button>
                </div>` : `
                <div style="text-align:center; margin-top:0.5rem;">
                    <span class="material-icons-round" style="color:var(--success); font-size:1.2rem;">check_circle</span>
                </div>`}
            </div>`;
    }).join('')}

        ${pct === 100 ? `
        <button class="m-btn m-btn-success" style="margin-top:0.5rem;" onclick="finalizarRecebimentoMobile()">
            <span class="material-icons-round">check</span> Confirmar Recebimento
        </button>` : `
        <button class="m-btn m-btn-outline" style="margin-top:0.5rem;" onclick="cancelarRecebimento()">
            <span class="material-icons-round">arrow_back</span> Voltar
        </button>`}
    `;
}

window.addQtyRecebimento = function (idx, qty) {
    const nf = window._recebimentoNF;
    if (!nf || !nf.items[idx]) return;
    nf.items[idx].received = Math.min((nf.items[idx].received || 0) + qty, nf.items[idx].qty);
    renderRecebimentoItems();
};

window.finalizarRecebimentoMobile = function () {
    const nf = window._recebimentoNF;
    if (!nf) return;

    // Update receipt status in localStorage
    const receipts = wmsData.getReceipts();
    const receipt = receipts.find(r => r.id === nf.id);
    if (receipt) {
        receipt.status = 'CONFERIDO';
        receipt.items = receipt.items.map((item, idx) => ({
            ...item, received: nf.items[idx]?.received || 0
        }));
        wmsData.saveReceipts(receipts);
    }

    // Generate putaway tasks
    let putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    nf.items.forEach(item => {
        putaway.push({
            id: `PUT-${String(putaway.length + 1).padStart(4, '0')}`,
            nf: nf.nf, sku: item.sku, desc: item.desc, qty: item.received,
            destino: suggestAddress(item.sku), status: 'PENDENTE',
            created: new Date().toISOString()
        });
    });
    localStorage.setItem('wms_putaway', JSON.stringify(putaway));

    window._recebimentoNF = null;
    showToast('Recebimento confirmado! Tarefas de armazenagem criadas.', 'success');
    updateBadges();
    navigateTo('home');
};

window.cancelarRecebimento = function () {
    window._recebimentoNF = null;
    initRecebimentoScreen(document.getElementById('screen-recebimento'));
};

function suggestAddress(sku) {
    // Simple deterministic suggestion based on SKU hash
    const hash = sku.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const street = String((hash % 3) + 1).padStart(2, '0');
    const building = String((hash % 4) + 1).padStart(2, '0');
    const apt = String((hash % 5) + 1).padStart(2, '0') + String((hash % 3) + 1).padStart(2, '0');
    return `${street}-${building}-${apt}`;
}


// ===================================
// 2. ARMAZENAR (Putaway)
// ===================================
// Workflow: See pending putaway tasks → scan destination address → confirm

window.handleScanArmazenar = function (code) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const task = putaway.find(t => t.id === code || t.destino === code);
    if (task && task.status === 'PENDENTE') {
        confirmarArmazenagem(task.id);
    } else if (code.match(/^\d{2}-\d{2}-\d{4}$/)) {
        // Address scanned — confirm the first task pointing to this address
        const matching = putaway.find(t => t.destino === code && t.status === 'PENDENTE');
        if (matching) {
            confirmarArmazenagem(matching.id);
        } else {
            showToast('Nenhuma tarefa para este endereço', 'warning');
        }
    } else {
        showToast('Código não reconhecido', 'warning');
    }
};

function initArmazenarScreen(container) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const pending = putaway.filter(t => t.status === 'PENDENTE');
    const done = putaway.filter(t => t.status === 'ARMAZENADO');

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--purple);">system_update_alt</span>
                    Armazenagem
                </span>
                <span class="m-badge m-badge-yellow">${pending.length} pendentes</span>
            </div>
        </div>

        ${pending.length > 0 ? pending.map(t => `
            <div class="m-card" style="border-left:3px solid var(--purple);">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
                    <div>
                        <div style="font-weight:600; font-size:0.85rem;">${t.desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">
                            <span style="font-family:monospace;">${t.sku}</span> • NF ${t.nf} • ${t.qty} un
                        </div>
                    </div>
                    <span class="m-badge m-badge-yellow" style="font-size:0.6rem;">PEND.</span>
                </div>
                <div style="background:var(--bg-input); border-radius:8px; padding:0.75rem; display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
                    <span class="material-icons-round" style="color:var(--purple); font-size:1.5rem;">place</span>
                    <div>
                        <div style="font-size:0.7rem; color:var(--text-secondary);">ENDEREÇO DESTINO</div>
                        <div style="font-size:1.2rem; font-weight:700; font-family:monospace; letter-spacing:1px;">${t.destino}</div>
                    </div>
                </div>
                <button class="m-btn m-btn-success" onclick="confirmarArmazenagem('${t.id}')" style="padding:0.65rem; font-size:0.9rem;">
                    <span class="material-icons-round" style="font-size:1.1rem;">check</span> Confirmar Armazenagem
                </button>
            </div>
        `).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Nenhuma tarefa de armazenagem pendente.
            </div>
        `}

        ${done.length > 0 ? `
        <div class="m-card" style="margin-top:0.5rem;">
            <div style="font-size:0.8rem; color:var(--text-secondary); font-weight:600; margin-bottom:0.5rem;">Últimas armazenagens</div>
            ${done.slice(-3).reverse().map(t => `
                <div class="m-list-item" style="padding:0.5rem 0;">
                    <span class="material-icons-round" style="color:var(--success); font-size:1.2rem;">check_circle</span>
                    <div style="flex:1;">
                        <span style="font-size:0.8rem; font-weight:600;">${t.desc}</span>
                        <span style="font-size:0.7rem; color:var(--text-secondary);"> → ${t.destino}</span>
                    </div>
                </div>
            `).join('')}
        </div>` : ''}
    `;
}

window.confirmarArmazenagem = function (taskId) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const task = putaway.find(t => t.id === taskId);
    if (task) {
        task.status = 'ARMAZENADO';
        task.completedAt = new Date().toISOString();
        localStorage.setItem('wms_putaway', JSON.stringify(putaway));
        showToast(`Armazenado em ${task.destino}`, 'success');
        updateBadges();
        initArmazenarScreen(document.getElementById('screen-armazenar'));
    }
};


// ===================================
// 3. SEPARAR (Picking)
// ===================================
// Workflow: See picking tasks → go to address → scan address/SKU → confirm pick

window.handleScanSeparar = function (code) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pending = tasks.filter(t => t.status === 'PENDENTE');

    // Match by address or SKU
    const match = pending.find(t => t.endereco === code || t.sku === code || t.id === code);
    if (match) {
        match.status = 'COLETADO';
        localStorage.setItem('wms_picking', JSON.stringify(tasks));
        showToast(`Coletado: ${match.desc} (${match.qtd} un)`, 'success');
        updateBadges();
        initSepararScreen(document.getElementById('screen-separar'));
    } else {
        showToast('Nenhuma tarefa para este código', 'warning');
    }
};

function initSepararScreen(container) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pending = tasks.filter(t => t.status === 'PENDENTE');
    const coletados = tasks.filter(t => t.status === 'COLETADO');

    // Group by onda
    const ondas = {};
    pending.forEach(t => {
        if (!ondas[t.onda]) ondas[t.onda] = [];
        ondas[t.onda].push(t);
    });

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--warning);">shopping_basket</span>
                    Separação
                </span>
                <span class="m-badge m-badge-yellow">${pending.length} pendentes</span>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <div style="flex:1; text-align:center; padding:0.5rem; background:var(--bg-input); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--warning);">${pending.length}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary);">PENDENTES</div>
                </div>
                <div style="flex:1; text-align:center; padding:0.5rem; background:var(--bg-input); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--success);">${coletados.length}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary);">COLETADOS</div>
                </div>
            </div>
        </div>

        ${pending.length > 0 ? Object.entries(ondas).map(([ondaId, tasks]) => `
            <div style="margin-bottom:0.25rem;">
                <div style="font-size:0.7rem; font-weight:600; color:var(--text-secondary); padding:0.5rem 0.25rem; text-transform:uppercase; letter-spacing:0.5px;">
                    ${ondaId}
                </div>
                ${tasks.map(t => `
                <div class="m-card" style="border-left:3px solid var(--warning);">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
                        <div>
                            <div style="font-weight:600; font-size:0.85rem;">${t.desc}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">
                                <span style="font-family:monospace;">${t.sku}</span> • ${t.pedido}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.2rem; font-weight:700;">${t.qtd}</div>
                            <div style="font-size:0.6rem; color:var(--text-secondary);">unidades</div>
                        </div>
                    </div>
                    <div style="background:var(--bg-input); border-radius:8px; padding:0.65rem; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                        <span class="material-icons-round" style="color:var(--primary); font-size:1.3rem;">place</span>
                        <div style="font-size:1.1rem; font-weight:700; font-family:monospace; letter-spacing:1px;">${t.endereco}</div>
                    </div>
                    <button class="m-btn m-btn-primary" onclick="confirmarPickMobile('${t.id}')" style="padding:0.6rem; font-size:0.85rem;">
                        <span class="material-icons-round" style="font-size:1rem;">check</span> Confirmar Coleta
                    </button>
                </div>`).join('')}
            </div>
        `).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Nenhuma tarefa de separação pendente.<br>
                <span style="font-size:0.8rem;">Aguarde a liberação de ondas no WMS PC.</span>
            </div>
        `}
    `;
}

window.confirmarPickMobile = function (taskId) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'COLETADO';
        localStorage.setItem('wms_picking', JSON.stringify(tasks));
        showToast(`Coletado: ${task.desc}`, 'success');
        updateBadges();
        initSepararScreen(document.getElementById('screen-separar'));
    }
};


// ===================================
// 4. INVENTÁRIO
// ===================================
// Workflow: See active inventory → scan address → input count → save

window.handleScanInventario = function (code) {
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const active = inventarios.find(i => i.status === 'EM ANDAMENTO');
    if (!active) {
        showToast('Nenhum inventário ativo', 'warning');
        return;
    }

    const endereco = active.enderecos.find(e => e.endereco === code);
    if (endereco) {
        if (endereco.status === 'PENDENTE') {
            window._invTarget = { invId: active.id, endereco: code };
            openCountInput(endereco);
        } else {
            showToast('Endereço já contado', 'warning');
        }
    } else {
        showToast('Endereço não pertence a este inventário', 'warning');
    }
};

function initInventarioScreen(container) {
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const active = inventarios.filter(i => i.status === 'EM ANDAMENTO');

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--success);">inventory_2</span>
                    Inventário
                </span>
                <span class="m-badge ${active.length > 0 ? 'm-badge-green' : 'm-badge-blue'}">${active.length} ativos</span>
            </div>
        </div>

        ${active.length > 0 ? active.map(inv => {
        const total = inv.enderecos.length;
        const contados = inv.enderecos.filter(e => e.status !== 'PENDENTE').length;
        const pct = total > 0 ? Math.round((contados / total) * 100) : 0;
        const divergentes = inv.enderecos.filter(e => e.status === 'DIVERGENTE').length;

        return `
            <div class="m-card" style="border-left:3px solid var(--success);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <div>
                        <div style="font-weight:700;">${inv.id}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${inv.tipo} • ${new Date(inv.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <span class="m-badge m-badge-green">${pct}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.05); border-radius:4px; height:6px; overflow:hidden; margin-bottom:1rem;">
                    <div style="width:${pct}%; height:100%; background:var(--success); border-radius:4px;"></div>
                </div>

                ${divergentes > 0 ? `
                <div style="background:rgba(239,68,68,0.1); border-radius:6px; padding:0.5rem 0.75rem; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
                    <span class="material-icons-round" style="color:var(--danger); font-size:1rem;">warning</span>
                    <span style="font-size:0.8rem; color:var(--danger); font-weight:600;">${divergentes} divergência(s)</span>
                </div>` : ''}

                ${inv.enderecos.map(e => {
            const icon = e.status === 'OK' ? 'check_circle' : e.status === 'DIVERGENTE' ? 'error' : 'radio_button_unchecked';
            const color = e.status === 'OK' ? 'var(--success)' : e.status === 'DIVERGENTE' ? 'var(--danger)' : 'var(--text-secondary)';
            const diff = e.contagem !== null ? e.contagem - e.saldoSistema : null;
            return `
                    <div class="m-list-item" style="padding:0.6rem 0; cursor:${e.status === 'PENDENTE' ? 'pointer' : 'default'};"
                        ${e.status === 'PENDENTE' ? `onclick="startCount('${inv.id}','${e.endereco}')"` : ''}>
                        <span class="material-icons-round" style="color:${color}; font-size:1.3rem;">${icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600; font-family:monospace; font-size:0.9rem;">${e.endereco}</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">${e.sku} • ${e.desc}</div>
                        </div>
                        <div style="text-align:right;">
                            ${e.contagem !== null ? `
                                <div style="font-size:0.9rem; font-weight:700; color:${diff === 0 ? 'var(--success)' : 'var(--danger)'};">${e.contagem}</div>
                                <div style="font-size:0.6rem; color:var(--text-secondary);">sist: ${e.saldoSistema}</div>
                            ` : `
                                <span class="m-badge m-badge-blue" style="font-size:0.6rem;">CONTAR</span>
                            `}
                        </div>
                    </div>`;
        }).join('')}
            </div>`;
    }).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">inventory_2</span>
                Nenhum inventário ativo.<br>
                <span style="font-size:0.8rem;">Crie um inventário no WMS PC primeiro.</span>
            </div>
        `}
    `;
}

window.startCount = function (invId, endereco) {
    window._invTarget = { invId, endereco };
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const inv = inventarios.find(i => i.id === invId);
    const end = inv?.enderecos.find(e => e.endereco === endereco);
    if (end) openCountInput(end);
};

function openCountInput(endereco) {
    const container = document.getElementById('screen-inventario');
    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid var(--success);">
            <div style="text-align:center; margin-bottom:1.25rem;">
                <span class="material-icons-round" style="font-size:2rem; color:var(--success);">place</span>
                <div style="font-size:1.5rem; font-weight:700; font-family:monospace; letter-spacing:2px; margin:0.5rem 0;">${endereco.endereco}</div>
                <div style="font-size:0.85rem; color:var(--text-secondary);">${endereco.sku} — ${endereco.desc}</div>
            </div>

            <div style="margin-bottom:1.25rem;">
                <label class="m-label">Quantidade Contada</label>
                <input type="number" id="countInput" class="m-input" min="0"
                    style="font-size:1.5rem; text-align:center; font-weight:700; padding:1rem;"
                    placeholder="0" autofocus>
            </div>

            <button class="m-btn m-btn-success" style="margin-bottom:0.5rem;" onclick="saveCount()">
                <span class="material-icons-round">check</span> Salvar Contagem
            </button>
            <button class="m-btn m-btn-outline" onclick="cancelCount()">
                <span class="material-icons-round">arrow_back</span> Voltar
            </button>
        </div>
    `;

    setTimeout(() => {
        const input = document.getElementById('countInput');
        if (input) input.focus();
    }, 200);
}

window.saveCount = function () {
    const input = document.getElementById('countInput');
    const count = parseInt(input?.value);
    if (isNaN(count) || count < 0) {
        showToast('Informe uma quantidade válida', 'warning');
        return;
    }

    const target = window._invTarget;
    if (!target) return;

    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const inv = inventarios.find(i => i.id === target.invId);
    const end = inv?.enderecos.find(e => e.endereco === target.endereco);

    if (end) {
        end.contagem = count;
        end.status = count === end.saldoSistema ? 'OK' : 'DIVERGENTE';
        localStorage.setItem('wms_inventarios', JSON.stringify(inventarios));
        showToast(end.status === 'OK' ? 'Contagem OK!' : `Divergência: ${count} vs ${end.saldoSistema}`,
            end.status === 'OK' ? 'success' : 'warning');
    }

    window._invTarget = null;
    updateBadges();
    initInventarioScreen(document.getElementById('screen-inventario'));
};

window.cancelCount = function () {
    window._invTarget = null;
    initInventarioScreen(document.getElementById('screen-inventario'));
};


// ===================================
// SHARED UTILITIES
// ===================================

// Toast notification (mobile-style)
// Toast notification (mobile-style) with Feedback integration
function showToast(message, type = 'info') {
    // 1. Trigger Feedback (Audio/Visual)
    if (window.Feedback) {
        if (type === 'success') {
            window.Feedback.beep('success');
            window.Feedback.flash('success');
        } else if (type === 'danger') {
            window.Feedback.beep('error');
            window.Feedback.flash('error');
        } else if (type === 'warning') {
            window.Feedback.beep('error');
        }
    }

    // 2. Show Toast UI
    const existing = document.getElementById('mobileToast');
    if (existing) existing.remove();

    const icons = { success: 'check_circle', warning: 'warning', danger: 'error', info: 'info' };

    const toast = document.createElement('div');
    toast.id = 'mobileToast';
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-icons-round" style="font-size:1.2rem;">${icons[type]}</span> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}

// Update badge counts on home screen
function updateBadges() {
    const el = (id) => document.getElementById(id);

    // Receber badge
    const receipts = wmsData.getReceipts();
    const pendingReceipts = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA').length;
    if (el('badgeReceber')) {
        el('badgeReceber').textContent = pendingReceipts;
        el('badgeReceber').style.display = pendingReceipts > 0 ? 'flex' : 'none';
    }

    // Armazenar badge
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const pendingPutaway = putaway.filter(t => t.status === 'PENDENTE').length;
    if (el('badgeArmazenar')) {
        el('badgeArmazenar').textContent = pendingPutaway;
        el('badgeArmazenar').style.display = pendingPutaway > 0 ? 'flex' : 'none';
    }

    // Separar badge
    const picking = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pendingPicking = picking.filter(t => t.status === 'PENDENTE').length;
    if (el('badgeSeparar')) {
        el('badgeSeparar').textContent = pendingPicking;
        el('badgeSeparar').style.display = pendingPicking > 0 ? 'flex' : 'none';
    }

    // Inventário badge
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const activeInv = inventarios.filter(i => i.status === 'EM ANDAMENTO');
    const pendingCount = activeInv.reduce((s, i) => s + i.enderecos.filter(e => e.status === 'PENDENTE').length, 0);
    if (el('badgeInventario')) {
        el('badgeInventario').textContent = pendingCount;
        el('badgeInventario').style.display = pendingCount > 0 ? 'flex' : 'none';
    }

    // Also update stats
    if (el('statPendentes')) el('statPendentes').textContent = pendingReceipts + pendingPutaway + pendingPicking;
}

// ===================================
// SCREEN INIT HOOK — Override placeholder injection
// ===================================
const _originalNavigateTo = window.navigateTo || navigateTo;

// Patch navigateTo to use real screens instead of placeholders
(function patchNavigation() {
    const origNav = window.navigateTo;
    window.navigateTo = function (screenId) {
        origNav(screenId);
        const container = document.getElementById(`screen-${screenId}`);
        if (!container) return;

        // Replace placeholder with real screen if available
        switch (screenId) {
            case 'recebimento':
                if (!window._recebimentoNF) initRecebimentoScreen(container);
                break;
            case 'armazenar':
                initArmazenarScreen(container);
                break;
            case 'separar':
                initSepararScreen(container);
                break;
            case 'inventario':
                initInventarioScreen(container);
                break;
            case 'home':
                updateBadges();
                break;
        }
    };
})();

// Add toast animation CSS
(function injectToastCSS() {
    const style = document.createElement('style');
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
    document.head.appendChild(style);
})();

// Init badges on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateBadges, 300);
});

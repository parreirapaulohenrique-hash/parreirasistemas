// WMS Coletor — Inbound V3
// Conferência de Itens (SKUs)
// Etapa final do fluxo: Portaria -> Doca -> CONFERÊNCIA DE ITENS

window.initConferenciaItensScreen = function(container) {
    const key = 'wms_receipts_v2';
    const receipts = JSON.parse(localStorage.getItem(key) || '[]');
    // Pegar as notas que já passaram da Doca
    const pending = receipts.filter(r => r.status === 'CONFERENCIA_ITENS_PENDENTE').reverse();

    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid #0ea5e9;margin-bottom:1rem;">
            <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:.5rem;color:#0ea5e9;">
                <span class="material-icons-round">qr_code_scanner</span>
                Bipe a NF ou Selecione Abaixo para Conferir Produtos
            </div>
        </div>

        <div style="font-size:.85rem;font-weight:600;color:var(--text-secondary);margin-bottom:.75rem;">
            Aguardando Conferência Cega/Aberta (${pending.length})
        </div>

        ${pending.length > 0 ? pending.map(r => `
            <div class="m-card" style="padding:.85rem;cursor:pointer;" onclick="iniciarConferenciaItens('${r.id}')">
                <div style="display:flex;justify-content:space-between;align-items:start;">
                    <div>
                        <strong style="font-size:.9rem;">NF: ${r.nfNumero}</strong><br>
                        <span style="font-size:.75rem;color:var(--text-secondary);">${r.fornecedor}</span>
                    </div>
                    <span class="m-badge" style="background:rgba(14,165,233,.15);color:#0ea5e9;">PRODUTOS</span>
                </div>
                <div style="margin-top:.5rem;font-size:.75rem;color:var(--text-secondary);display:flex;gap:1rem;">
                    <span><span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;">local_shipping</span> ${r.doca}</span>
                    <span><span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;">widgets</span> Itens: ${r.itens?.length || 0}</span>
                </div>
            </div>
        `).join('') : `
            <div style="text-align:center;padding:2rem 1rem;color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem;opacity:.3;">inventory_2</span>
                <p style="margin-top:.5rem;">Nenhuma carga aguardando conferência de itens no piso.</p>
            </div>
        `}
    `;
};

window.handleScanConferenciaItens = function(code) {
    if (window._skuConfAtiva) {
        _biparProdutoConferencia(code);
        return;
    }

    const clean = code.replace(/\D/g, '');
    const key = 'wms_receipts_v2';
    const receipts = JSON.parse(localStorage.getItem(key) || '[]');
    const target = receipts.find(r => r.status === 'CONFERENCIA_ITENS_PENDENTE' && 
                                     ((clean.length === 44 && r.chaveNfe === clean) || (clean.length < 44 && r.nfNumero == clean)));
    if (target) {
        iniciarConferenciaItens(target.id);
    } else {
        Feedback.beep('error'); showToast('NF não encontrada para conferência de produtos.', 'danger');
    }
};

window.iniciarConferenciaItens = function(id) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const r = receipts.find(x => x.id === id);
    if (!r) return;

    window._skuConfAtiva = true;
    window._confNfId = id;

    // Inicializar estado de contagem
    if (!r._leituras) {
        r._leituras = {};
        (r.itens || []).forEach(it => {
            r._leituras[it.sku] = 0;
        });
    }

    _renderBaseConferencia(r);
};

function _renderBaseConferencia(r) {
    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const isCega = cfg.geral?.contagemCega !== false;
    const container = document.getElementById('screen-recebimento'); // the placeholder used by router

    // Render header
    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <strong style="font-size:.95rem;color:#0ea5e9;">🏷️ Bipar Produtos: NF ${r.nfNumero}</strong>
            <button class="m-btn m-btn-outline" onclick="fecharConferenciaItens()"
                style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">close</span>
            </button>
        </div>
        
        <div style="background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.2);border-radius:8px;padding:.65rem;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">
            <span class="material-icons-round" style="color:#0ea5e9;font-size:1.2rem;">${isCega ? 'visibility_off' : 'visibility'}</span>
            <div style="font-size:.78rem;">
                <div style="font-weight:600;color:#0ea5e9;">${isCega ? 'Contagem Cega' : 'Contagem Aberta'}</div>
                <div style="color:var(--text-secondary);">${isCega ? 'Quantidades esperadas ocultas.' : 'Você pode ver o esperado.'}</div>
            </div>
        </div>

        <div id="c-itens-lista" style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:5rem;"></div>

        <div style="position:fixed;bottom:75px;left:0;width:100%;padding:0 1rem;">
            <button class="m-btn m-btn-primary" onclick="finalizarConferenciaItens()" style="width:100%;box-shadow:0 4px 6px rgba(0,0,0,.2);">
                <span class="material-icons-round">done_all</span> Finalizar Contagem
            </button>
        </div>
    `;

    _renderItensConferencia(r, isCega);
}

function _renderItensConferencia(r, isCega) {
    const lista = document.getElementById('c-itens-lista');
    if (!lista) return;

    if (!r.itens || r.itens.length === 0) {
        lista.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:.8rem;">Esta NF não possui itens declarados no XML para bipagem.</div>`;
        return;
    }

    let html = '';
    r.itens.forEach(it => {
        const leu = r._leituras[it.sku] || 0;
        const esperado = it.quantidade;
        let cardStyle = "background:#fff;border:1px solid var(--border);";
        let qtyDisplay = '';

        if (isCega) {
            qtyDisplay = `<strong style="font-size:1.1rem;color:var(--primary);">${leu}</strong> <span style="font-size:.7rem;color:var(--text-secondary);">LIDOS</span>`;
            if (leu > 0) cardStyle = "background:rgba(16,185,129,.05);border-color:#10b981;";
        } else {
            const finished = leu >= esperado;
            const excess = leu > esperado;
            if (excess) cardStyle = "background:rgba(245,158,11,.1);border-color:#f59e0b;";
            else if (finished) cardStyle = "background:rgba(16,185,129,.1);border-color:#10b981;";

            qtyDisplay = `
                <div style="display:flex;flex-direction:column;align-items:flex-end;">
                    <div style="font-size:.7rem;color:var(--text-secondary);">ESP: <strong>${esperado}</strong></div>
                    <div style="font-size:.9rem;color:${finished ? (excess ? '#f59e0b' : '#10b981') : 'var(--text-primary)'};">
                        LIDO: <strong>${leu}</strong>
                    </div>
                </div>
            `;
        }

        html += `
            <div class="m-card" style="padding:.65rem;border-radius:6px;${cardStyle}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="flex:1;">
                        <div style="font-family:monospace;font-size:.7rem;color:var(--text-secondary);">${it.sku}</div>
                        <div style="font-size:.8rem;font-weight:600;margin-top:.1rem;line-height:1.2;">
                            ${it.descricao.length > 35 ? it.descricao.substring(0,35)+'...' : it.descricao}
                        </div>
                    </div>
                    <div style="margin-left:1rem;text-align:right;">
                        ${qtyDisplay}
                    </div>
                </div>
            </div>
        `;
    });

    lista.innerHTML = html;
}

window._biparProdutoConferencia = function(code) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIndex = receipts.findIndex(x => x.id === window._confNfId);
    if(rIndex === -1) return;
    const r = receipts[rIndex];

    const cln = code.trim();
    // Procura por SKU e, de preferência, Cód Barras no futuro:
    const itemEncontrado = r.itens.find(it => it.sku === cln || it.codigoBarras === cln);
    if (!itemEncontrado) {
        Feedback.beep('error');
        showToast('Produto não pertence a esta NF.', 'danger');
        return;
    }

    r._leituras[itemEncontrado.sku] = (r._leituras[itemEncontrado.sku] || 0) + 1;
    
    // Check if limits exceeded (warn user but keep incrementing)
    if (r._leituras[itemEncontrado.sku] > itemEncontrado.quantidade) {
        Feedback.beep('warning');
        showToast(`Atenção: Passou da qtde da NF!`, 'warning');
    } else {
        Feedback.beep('success');
    }

    receipts[rIndex] = r;
    localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));

    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    _renderItensConferencia(r, cfg.geral?.contagemCega !== false);
};

window.fecharConferenciaItens = function() {
    window._skuConfAtiva = false;
    window._confNfId = null;
    initConferenciaItensScreen(document.getElementById('screen-recebimento'));
};

window.finalizarConferenciaItens = async function() {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIndex = receipts.findIndex(x => x.id === window._confNfId);
    if(rIndex === -1) return;
    const r = receipts[rIndex];

    // Verificar se sobrou e faltou
    const itensPayload = [];
    let msgDivergencia = '';
    let hasDivergencia = false;

    r.itens.forEach(it => {
        const lido = r._leituras[it.sku] || 0;
        const esperado = Number(it.quantidade);
        const divQty = lido - esperado;

        if (divQty !== 0) hasDivergencia = true;
        
        itensPayload.push({
            sku: it.sku,
            lido: lido,
            esperado: esperado,
            divergenciaQty: divQty // Positivo=Sobra, Negativo=Falta
        });
    });

    if (hasDivergencia) {
        const confirmar = confirm("Existem diferenças entre a NF e o que foi bipado! Deseja finalizar com divergência?");
        if (!confirmar) return;
    }

    try {
        const user = JSON.parse(localStorage.getItem('logged_user') || '{}');
        const payload = {
            id: r.id,
            nfNumero: r.nfNumero,
            chaveNfe: r.chaveNfe || '',
            operador: user.name || user.login || 'Operador',
            inicio: r.dataConferenciaMacro,
            fim: new Date().toISOString(),
            itens: itensPayload
        };

        // Envia para o ERP
        await WmsProcedures.proc_confirmar_conferencia_itens(payload);

        // Gera o Putaway
        _gerarPutawayFinal(r);

        // Limpa da tela e encerra fluxo
        r.status = 'FINALIZADO';
        receipts[rIndex] = r;
        localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));

        window._skuConfAtiva = false;
        Feedback.beep('success'); Feedback.flash('success');
        showToast('Conferência Finalizada! Tarefas de Putaway geradas.', 'success');
        if (window.updateHomeStats) updateHomeStats();
        setTimeout(() => navigateTo('home'), 1500);

    } catch (e) {
        showToast('Erro ao enviar ERP: ' + e.message, 'danger');
    }
};

function _gerarPutawayFinal(r) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    if (r.itens && r.itens.length > 0) {
        r.itens.forEach(item => {
            const lido = r._leituras[item.sku] || 0;
            if (lido > 0) {
                putaway.push({
                    id: `PUT-${String(putaway.length + 1).padStart(4, '0')}`,
                    nf: r.nfNumero, sku: item.sku, desc: item.descricao,
                    qty: lido, destino: 'PISO-DOCA',
                    status: 'PENDENTE', created: new Date().toISOString()
                });
            }
        });
    }
    localStorage.setItem('wms_putaway', JSON.stringify(putaway));
}

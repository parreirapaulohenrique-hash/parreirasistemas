// =============================================================================
// WMS Coletor — Tela "Conferir" (Conferência de Recebimento)
// Etapa final do fluxo: Portaria → Doca → CONFERIR
// Parâmetros configuráveis via WMS > Configurações (para uso futuro):
//   - contagemCega: oculta qtde esperada durante bipagem
//   - conferenciaPorVolume: confirma por volume (não por SKU)
//   - alertaExcesso: toca alerta quando SKU ultrapassa qtde esperada
// =============================================================================

// ─── ESTADO GLOBAL DA SESSÃO ─────────────────────────────────────────────────
window._confSessao = {
    nfId:    null,   // ID do recibo ativo
    inicio:  null,   // Timestamp de início da conferência
    ativo:   false,  // Se há conferência em andamento
};

// ─── TELA INICIAL — LISTA DE NFs AGUARDANDO CONFERÊNCIA ──────────────────────
window.initConferenciaItensScreen = function(container) {
    window._confSessao.ativo = false;
    window._confSessao.nfId  = null;

    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const pending  = receipts
        .filter(r => r.status === 'CONFERENCIA_ITENS_PENDENTE')
        .sort((a, b) => new Date(a.dataCheckin) - new Date(b.dataCheckin)); // FIFO

    container.innerHTML = `
        <!-- Instrução de bipagem -->
        <div class="m-card" style="border-left:3px solid #0ea5e9;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:.6rem;">
                <span class="material-icons-round" style="color:#0ea5e9;font-size:1.4rem;">qr_code_scanner</span>
                <div>
                    <div style="font-weight:600;font-size:.9rem;color:#0ea5e9;">Bipe a chave NF-e ou selecione abaixo</div>
                    <div style="font-size:.75rem;color:var(--text-secondary);">Inicia a conferência de produtos da carga recebida</div>
                </div>
            </div>
        </div>

        <!-- Contador -->
        <div style="font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.65rem;display:flex;justify-content:space-between;align-items:center;">
            <span>Cargas Aguardando Conferência</span>
            <span style="background:rgba(14,165,233,.15);color:#0ea5e9;padding:.2rem .55rem;border-radius:999px;font-size:.75rem;">${pending.length}</span>
        </div>

        <!-- Lista de NFs -->
        ${pending.length > 0 ? pending.map(r => {
            const totalItens  = (r.itens || []).length;
            const itensBipados = (r.itens || []).filter(it => (r._leituras?.[it.sku] || 0) > 0).length;
            const pct = totalItens > 0 ? Math.round((itensBipados / totalItens) * 100) : 0;
            const temDiv = r.condicaoCarga && r.condicaoCarga !== 'OK';
            const dtCheckin = r.dataCheckin ? new Date(r.dataCheckin).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';

            return `
            <div class="m-card" style="padding:.85rem;cursor:pointer;margin-bottom:.6rem;" onclick="iniciarConferirItens('${r.id}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem;">
                    <div>
                        <strong style="font-size:.92rem;">NF ${r.nfNumero}</strong>
                        ${temDiv ? `<span style="font-size:.68rem;background:rgba(245,158,11,.2);color:#f59e0b;padding:.1rem .4rem;border-radius:4px;margin-left:.4rem;">⚠️ ${r.condicaoCarga}</span>` : ''}
                        <br>
                        <span style="font-size:.75rem;color:var(--text-secondary);">${r.fornecedor}</span>
                    </div>
                    <span class="m-badge" style="background:rgba(14,165,233,.15);color:#0ea5e9;white-space:nowrap;">
                        <span class="material-icons-round" style="font-size:.75rem;vertical-align:middle;">fact_check</span> CONFERIR
                    </span>
                </div>
                <div style="font-size:.73rem;color:var(--text-secondary);display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.55rem;">
                    <span><span class="material-icons-round" style="font-size:.78rem;vertical-align:middle;">local_shipping</span> ${r.doca}</span>
                    <span><span class="material-icons-round" style="font-size:.78rem;vertical-align:middle;">widgets</span> ${totalItens} SKU(s)</span>
                    <span><span class="material-icons-round" style="font-size:.78rem;vertical-align:middle;">schedule</span> ${dtCheckin}</span>
                </div>
                ${totalItens > 0 ? `
                <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:#0ea5e9;border-radius:2px;transition:width .3s;"></div>
                </div>
                <div style="font-size:.68rem;color:var(--text-secondary);margin-top:.2rem;">${itensBipados}/${totalItens} SKUs iniciados · ${pct}%</div>
                ` : ''}
            </div>`;
        }).join('') : `
            <div style="text-align:center;padding:3rem 1rem;color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3.5rem;opacity:.25;">inventory_2</span>
                <p style="margin-top:.75rem;font-size:.85rem;">Nenhuma carga aguardando conferência.</p>
                <p style="font-size:.75rem;opacity:.7;">Após o Check-in e Recebimento na Doca, as NFs aparecerão aqui.</p>
            </div>
        `}
    `;
};

// ─── SCAN na tela inicial ──────────────────────────────────────────────────────
window.handleScanConferenciaItens = function(code) {
    // Se já está com conferência ativa, bipa produto
    if (window._confSessao.ativo) {
        _registrarBipagem(code);
        return;
    }

    const clean    = code.replace(/\D/g, '');
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const target   = receipts.find(r =>
        r.status === 'CONFERENCIA_ITENS_PENDENTE' &&
        ((clean.length === 44 && (r.chaveNfe || '').replace(/\D/g, '') === clean) ||
         (clean.length < 44 && String(r.nfNumero) === clean))
    );

    if (target) {
        iniciarConferirItens(target.id);
    } else {
        Feedback.beep('error');
        showToast('NF não encontrada na fila de conferência.', 'danger');
    }
};

// ─── INICIAR CONFERÊNCIA DE UMA NF ───────────────────────────────────────────
window.iniciarConferirItens = function(id) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const r = receipts.find(x => x.id === id);
    if (!r) return;

    // Inicializa leituras zeradas se ainda não existir
    if (!r._leituras) {
        r._leituras = {};
        (r.itens || []).forEach(it => { r._leituras[it.sku] = 0; });
        const idx = receipts.findIndex(x => x.id === id);
        receipts[idx] = r;
        localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));
    }

    window._confSessao = { nfId: id, inicio: new Date().toISOString(), ativo: true };
    _renderTelaConferencia(r);
};

// ─── RENDERIZA TELA DE CONFERÊNCIA ───────────────────────────────────────────
function _renderTelaConferencia(r) {
    const container = document.getElementById('screen-recebimento');
    const cfg       = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const isCega    = cfg.geral?.contagemCega !== false; // default: cega ativa

    const totalItens     = (r.itens || []).length;
    const itensConferidos = (r.itens || []).filter(it => (r._leituras?.[it.sku] || 0) >= it.quantidade).length;
    const pct = totalItens > 0 ? Math.round((itensConferidos / totalItens) * 100) : 0;
    const temDiv = r.condicaoCarga && r.condicaoCarga !== 'OK';

    container.innerHTML = `
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">
            <div>
                <strong style="font-size:.95rem;color:#0ea5e9;">📋 NF ${r.nfNumero}</strong>
                ${temDiv ? `<span style="font-size:.7rem;background:rgba(245,158,11,.2);color:#f59e0b;padding:.15rem .4rem;border-radius:4px;margin-left:.4rem;">⚠️ ${r.condicaoCarga}</span>` : ''}
                <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.1rem;">${r.fornecedor}</div>
            </div>
            <button class="m-btn m-btn-outline" onclick="fecharConferenciaItens()" style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span>
            </button>
        </div>

        <!-- Progresso compacto -->
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem;">
            <div style="flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;">
                <div id="conf-progress-bar" style="height:100%;width:${pct}%;background:#0ea5e9;border-radius:3px;transition:width .4s;"></div>
            </div>
            <span id="conf-pct-label" style="font-size:.72rem;color:var(--text-secondary);white-space:nowrap;">${itensConferidos}/${totalItens} · ${pct}%</span>
            <span style="font-size:.72rem;padding:.1rem .4rem;border-radius:4px;background:${isCega ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.15)'};color:${isCega ? '#f59e0b' : '#10b981'}">
                ${isCega ? '👁‍🗨 Cega' : '👁 Aberta'}
            </span>
        </div>

        <!-- PAINEL ÚLTIMO LIDO (scanner feedback) -->
        <div id="conf-ultimo-lido" style="border-radius:10px;padding:.75rem;margin-bottom:.75rem;
            background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.1);
            min-height:62px;display:flex;align-items:center;gap:.75rem;">
            <span class="material-icons-round" style="font-size:2rem;color:rgba(255,255,255,.15);">qr_code_scanner</span>
            <div style="font-size:.8rem;color:var(--text-secondary);">Bipe o código de barras do produto…</div>
        </div>

        <!-- Lista de SKUs -->
        <div id="conf-itens-lista" style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:5rem;">
            ${_renderItensHtml(r, isCega)}
        </div>

        <!-- Botão Finalizar fixo -->
        <div style="position:fixed;bottom:75px;left:0;width:100%;padding:0 1rem;box-sizing:border-box;">
            <button class="m-btn m-btn-primary" id="conf-btn-finalizar" onclick="finalizarConferencia()"
                style="width:100%;font-size:.95rem;box-shadow:0 4px 20px rgba(14,165,233,.3);">
                <span class="material-icons-round">done_all</span> Finalizar Conferência
            </button>
        </div>
    `;
}

// ─── RENDERIZA LISTA DE ITENS — compacto, scanner-first ──────────────────────
function _renderItensHtml(r, isCega) {
    if (!r.itens || r.itens.length === 0) {
        return `<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.82rem;">
            <span class="material-icons-round" style="font-size:2.5rem;opacity:.3;">inventory_2</span>
            <p style="margin-top:.5rem;">NF sem itens declarados. Finalize diretamente.</p>
        </div>`;
    }

    return r.itens.map(it => {
        const lido     = r._leituras?.[it.sku] || 0;
        const esperado = Number(it.quantidade);
        const diff     = lido - esperado;
        const ok       = lido >= esperado && esperado > 0;
        const excesso  = lido > esperado;
        const zerado   = lido === 0;

        let borderColor = 'rgba(255,255,255,.07)';
        let bg          = 'rgba(255,255,255,.02)';
        let icone       = 'radio_button_unchecked';
        let iconeColor  = 'rgba(255,255,255,.25)';
        if (excesso)      { borderColor='rgba(245,158,11,.4)'; bg='rgba(245,158,11,.06)'; icone='warning';               iconeColor='#f59e0b'; }
        else if (ok)      { borderColor='rgba(16,185,129,.4)';  bg='rgba(16,185,129,.06)';  icone='check_circle';          iconeColor='#10b981'; }
        else if (!zerado) { borderColor='rgba(14,165,233,.35)'; bg='rgba(14,165,233,.05)';  icone='pending';               iconeColor='#0ea5e9'; }

        const qtyRight = isCega
            ? `<div style="font-size:1.4rem;font-weight:800;color:${zerado?'rgba(255,255,255,.2)':iconeColor};min-width:2.5rem;text-align:center;">${lido}</div>`
            : `<div style="text-align:center;min-width:3.5rem;">
                 <div style="font-size:.62rem;color:var(--text-secondary);">ESP</div>
                 <div style="font-size:.85rem;font-weight:700;color:var(--text-secondary);">${esperado}</div>
                 <div style="font-size:.6rem;color:var(--text-secondary);margin:.1rem 0;">LID</div>
                 <div style="font-size:1.2rem;font-weight:800;color:${zerado?'rgba(255,255,255,.2)':iconeColor};">${lido}${diff>0?`<span style='font-size:.6rem;'>+${diff}</span>`:diff<0?`<span style='font-size:.6rem;'>${diff}</span>`:''}</div>
               </div>`;

        const skuId = it.sku.replace(/[^a-z0-9]/gi,'_');
        return `
            </div>
        </div>`;
    }).join('');
}

// ─── REGISTRAR BIPAGEM (SCANNER) ─────────────────────────────────────────────
function _registrarBipagem(code) {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIdx     = receipts.findIndex(x => x.id === window._confSessao.nfId);
    if (rIdx === -1) return;
    const r = receipts[rIdx];

    const cln  = code.trim();
    const item = (r.itens || []).find(it => it.sku === cln || it.codigoBarras === cln);

    if (!item) {
        Feedback.beep('error');
        _atualizarUltimoLido(null, cln, 'notfound');
        return;
    }

    r._leituras[item.sku] = (r._leituras[item.sku] || 0) + 1;
    const lido     = r._leituras[item.sku];
    const esperado = Number(item.quantidade);
    const status   = lido > esperado ? 'excesso' : lido === esperado ? 'ok' : 'parcial';

    if (status === 'excesso') Feedback.beep('error');
    else Feedback.beep('success');

    receipts[rIdx] = r;
    localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));

    _atualizarUltimoLido(item, lido, status, esperado);
    _atualizarUiConferencia(r);

    // Scroll para o item e re-foco no scanner
    setTimeout(() => {
        const card = document.getElementById('item-card-' + item.sku.replace(/[^a-z0-9]/gi,'_'));
        if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
        const inp = document.getElementById('scannerInput');
        if (inp) inp.focus();
    }, 120);
}

// ─── PAINEL ÚLTIMO LIDO ───────────────────────────────────────────────────────
function _atualizarUltimoLido(item, lido, status, esperado) {
    const panel = document.getElementById('conf-ultimo-lido');
    if (!panel) return;

    if (status === 'notfound') {
        panel.style.background = 'rgba(239,68,68,.1)';
        panel.style.borderColor = 'rgba(239,68,68,.4)';
        panel.innerHTML = `
            <span class="material-icons-round" style="font-size:2rem;color:#ef4444;">error_outline</span>
            <div><div style="font-size:.82rem;font-weight:700;color:#ef4444;">Código não encontrado nesta NF</div>
            <div style="font-size:.72rem;color:var(--text-secondary);font-family:monospace;">${lido}</div></div>`;
        return;
    }

    const colors = { ok:'#10b981', excesso:'#f59e0b', parcial:'#0ea5e9' };
    const icons  = { ok:'check_circle', excesso:'warning', parcial:'pending' };
    const msgs   = { ok:'✅ Completo!', excesso:`⚠️ Excesso! (esp: ${esperado})`, parcial:`${lido}/${esperado}` };
    const c = colors[status]; const ico = icons[status];

    panel.style.background   = `rgba(${status==='ok'?'16,185,129':status==='excesso'?'245,158,11':'14,165,233'},.08)`;
    panel.style.borderColor  = `rgba(${status==='ok'?'16,185,129':status==='excesso'?'245,158,11':'14,165,233'},.4)`;
    panel.innerHTML = `
        <span class="material-icons-round" style="font-size:2.2rem;color:${c};flex-shrink:0;">${ico}</span>
        <div style="flex:1;min-width:0;">
            <div style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.sku}</div>
            <div style="font-size:.88rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.descricao}</div>
        </div>
        <div style="text-align:center;flex-shrink:0;">
            <div style="font-size:2rem;font-weight:900;color:${c};line-height:1;">${lido}</div>
            <div style="font-size:.68rem;color:${c};font-weight:600;">${msgs[status]}</div>
        </div>`;
}

// ─── REGISTRAR QTD MANUAL ─────────────────────────────────────────────────────
window.registrarManualConf = function(sku, valor) {
    const qty = parseInt(valor);
    if (isNaN(qty) || qty < 0) return;

    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIdx     = receipts.findIndex(x => x.id === window._confSessao.nfId);
    if (rIdx === -1) return;
    const r = receipts[rIdx];

    r._leituras[sku] = qty;
    receipts[rIdx] = r;
    localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));

    Feedback.beep('success');
    _atualizarUiConferencia(r);
};

// ─── ATUALIZA UI SEM RE-RENDERIZAR TUDO ──────────────────────────────────────
function _atualizarUiConferencia(r) {
    const cfg    = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const isCega = cfg.geral?.contagemCega !== false;

    // Atualiza barra de progresso
    const totalItens      = (r.itens || []).length;
    const itensConferidos = (r.itens || []).filter(it => (r._leituras?.[it.sku] || 0) >= it.quantidade).length;
    const pct = totalItens > 0 ? Math.round((itensConferidos / totalItens) * 100) : 0;

    const bar   = document.getElementById('conf-progress-bar');
    const label = document.getElementById('conf-pct-label');
    if (bar)   bar.style.width = pct + '%';
    if (label) label.textContent = `${itensConferidos}/${totalItens} SKUs · ${pct}%`;

    // Re-renderiza lista de itens
    const lista = document.getElementById('conf-itens-lista');
    if (lista) lista.innerHTML = _renderItensHtml(r, isCega);
}

// ─── VOLTAR PARA LISTA ────────────────────────────────────────────────────────
window.fecharConferenciaItens = function() {
    window._confSessao = { nfId: null, inicio: null, ativo: false };
    initConferenciaItensScreen(document.getElementById('screen-recebimento'));
};

// ─── FINALIZAR CONFERÊNCIA ────────────────────────────────────────────────────
window.finalizarConferencia = async function() {
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIdx     = receipts.findIndex(x => x.id === window._confSessao.nfId);
    if (rIdx === -1) return;
    const r = receipts[rIdx];

    // Monta payload de itens com divergências
    const itensPayload = [];
    let hasDivergencia = false;
    let itensSemBipagem = 0;

    (r.itens || []).forEach(it => {
        const lido     = r._leituras?.[it.sku] || 0;
        const esperado = Number(it.quantidade);
        const div      = lido - esperado;
        if (div !== 0) hasDivergencia = true;
        if (lido === 0) itensSemBipagem++;
        itensPayload.push({ sku: it.sku, descricao: it.descricao, lido, esperado, divergencia: div });
    });

    // Alerta se houver itens não bipados
    if (itensSemBipagem > 0 && r.itens?.length > 0) {
        const ok = confirm(`⚠️ ${itensSemBipagem} SKU(s) com zero leituras!\n\nDeseja finalizar mesmo assim?`);
        if (!ok) return;
    } else if (hasDivergencia) {
        const ok = confirm('⚠️ Existem diferenças de quantidade entre a NF e o conferido.\n\nDeseja finalizar com divergência?');
        if (!ok) return;
    }

    const btn = document.getElementById('conf-btn-finalizar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Finalizando...'; }

    try {
        const user = JSON.parse(localStorage.getItem('logged_user') || '{}');
        const payload = {
            id:         r.id,
            nfNumero:   r.nfNumero,
            chaveNfe:   r.chaveNfe || '',
            fornecedor: r.fornecedor,
            operador:   user.name || user.login || 'Operador',
            inicio:     window._confSessao.inicio,
            fim:        new Date().toISOString(),
            hasDivergencia,
            itens: itensPayload
        };

        await WmsProcedures.proc_confirmar_conferencia_itens(payload);

        // Gera tarefas de Putaway
        _gerarPutaway(r);

        // Atualiza status do recibo
        receipts[rIdx].status = hasDivergencia ? 'FINALIZADO_COM_DIV' : 'FINALIZADO';
        receipts[rIdx]._conferenciaFim = new Date().toISOString();
        localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));

        window._confSessao = { nfId: null, inicio: null, ativo: false };
        Feedback.beep('success'); Feedback.flash('success');
        showToast(hasDivergencia
            ? '⚠️ Conferência finalizada com divergência. Putaway gerado.'
            : '✅ Conferência finalizada! Putaway gerado.',
            hasDivergencia ? 'warning' : 'success');

        if (window.updateHomeStats) updateHomeStats();
        setTimeout(() => navigateTo('home'), 1500);

    } catch (e) {
        showToast('Erro ao finalizar: ' + e.message, 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">done_all</span> Finalizar Conferência'; }
    }
};

// ─── GERAR PUTAWAY ────────────────────────────────────────────────────────────
function _gerarPutaway(r) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    (r.itens || []).forEach(item => {
        const lido = r._leituras?.[item.sku] || 0;
        if (lido > 0) {
            putaway.push({
                id:      `PUT-${String(putaway.length + 1).padStart(4, '0')}`,
                nf:      r.nfNumero,
                sku:     item.sku,
                desc:    item.descricao,
                qty:     lido,
                destino: 'PISO-DOCA',
                status:  'PENDENTE',
                created: new Date().toISOString()
            });
        }
    });
    localStorage.setItem('wms_putaway', JSON.stringify(putaway));
}

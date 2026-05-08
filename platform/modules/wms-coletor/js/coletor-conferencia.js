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
    nfId:   null,
    inicio: null,
    ativo:  false,
};
window._recAtivo = null; // receipt em memória (evita reads durante bipagem)
let _saveTimer   = null; // debounce para salvar leituras no Firestore

function _salvarLeiturasDebounced() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
        if (window._recAtivo) {
            await WmsStore.salvarLeituras(window._recAtivo.id, window._recAtivo._leituras || {}).catch(() => {});
        }
    }, 3000);
}

// ─── TELA INICIAL — LISTA DE NFs AGUARDANDO CONFERÊNCIA ──────────────────────
window.initConferenciaItensScreen = async function(container) {
    window._confSessao.ativo = false;
    window._confSessao.nfId  = null;
    window._recAtivo         = null;

    container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);">
        <span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem;opacity:.4;">sync</span>
        <span style="font-size:.82rem;">Carregando cargas...</span></div>`;

    const pending = await WmsStore.listarRecebimentos({ status: 'CONFERENCIA_ITENS_PENDENTE' }).catch(() => []);
    pending.sort((a, b) => new Date(a.dataCheckin||0) - new Date(b.dataCheckin||0)); // FIFO

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
window.handleScanConferenciaItens = async function(code) {
    if (window._confSessao.ativo) { _registrarBipagem(code); return; }

    const clean = code.replace(/\D/g, '');
    try {
        const lista = await WmsStore.listarRecebimentos({ status: 'CONFERENCIA_ITENS_PENDENTE' });
        const target = lista.find(r =>
            (clean.length === 44 && (r.chaveNfe || '').replace(/\D/g, '') === clean) ||
            (clean.length < 44  && String(r.nfNumero) === clean)
        );
        if (target) iniciarConferirItens(target.id);
        else { Feedback.beep('error'); showToast('NF não encontrada na fila de conferência.', 'danger'); }
    } catch(e) { showToast('Erro: ' + e.message, 'danger'); }
};

// ─── INICIAR CONFERÊNCIA DE UMA NF ───────────────────────────────────────────
window.iniciarConferirItens = async function(id) {
    const r = await WmsStore.buscarRecebimento(id).catch(() => null);
    if (!r) { showToast('Recebimento não encontrado.', 'danger'); return; }
    if (!r._leituras) r._leituras = {};

    window._recAtivo   = r;
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

        let borderColor = 'rgba(255,255,255,.08)';
        let bg          = 'rgba(255,255,255,.02)';
        let icone       = 'radio_button_unchecked';
        let iconeColor  = 'rgba(255,255,255,.2)';
        let statusLabel = '';

        if (excesso)      { borderColor='rgba(245,158,11,.4)';  bg='rgba(245,158,11,.05)';  icone='warning';      iconeColor='#f59e0b'; statusLabel='EXCESSO'; }
        else if (ok)      { borderColor='rgba(16,185,129,.4)';  bg='rgba(16,185,129,.05)';  icone='check_circle'; iconeColor='#10b981'; statusLabel='OK'; }
        else if (!zerado) { borderColor='rgba(14,165,233,.35)'; bg='rgba(14,165,233,.04)';  icone='pending';      iconeColor='#0ea5e9'; statusLabel='PARCIAL'; }

        const skuId = it.sku.replace(/[^a-z0-9]/gi,'_');

        // Bloco de quantidade — cega: só mostra lido; aberta: mostra esp vs lido
        const qtyBlock = isCega
            ? `<div style="text-align:center;min-width:2.8rem;">
                   <div style="font-size:1.6rem;font-weight:900;color:${zerado?'rgba(255,255,255,.15)':iconeColor};line-height:1;">${lido}</div>
                   <div style="font-size:.58rem;color:var(--text-secondary);">LIDO</div>
               </div>`
            : `<div style="text-align:center;min-width:4rem;">
                   <div style="font-size:.58rem;color:var(--text-secondary);">ESP / LID</div>
                   <div style="font-size:1.3rem;font-weight:900;color:${zerado?'rgba(255,255,255,.15)':iconeColor};line-height:1.1;">
                       ${esperado}<span style="font-size:.7rem;opacity:.6;">/</span>${lido}
                   </div>
                   ${diff !== 0 ? `<div style="font-size:.6rem;color:${diff>0?'#f59e0b':'#ef4444'};font-weight:700;">${diff>0?'+':''}${diff}</div>` : ''}
               </div>`;

        return `
        <div id="item-card-${skuId}"
             style="background:${bg};border:1px solid ${borderColor};border-radius:10px;padding:.7rem .85rem;
                    display:flex;align-items:center;gap:.7rem;transition:background .2s,border-color .2s;">
            <!-- Ícone status -->
            <span class="material-icons-round" style="font-size:1.6rem;color:${iconeColor};flex-shrink:0;">${icone}</span>

            <!-- Info produto -->
            <div style="flex:1;min-width:0;">
                <div style="font-size:.78rem;font-weight:700;color:var(--text-primary);
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.descricao || '—'}</div>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.15rem;">
                    ${it.codigoInterno ? `<span style="font-size:.62rem;background:rgba(99,102,241,.15);color:#818cf8;
                        padding:.05rem .35rem;border-radius:4px;font-family:monospace;">${it.codigoInterno}</span>` : ''}
                    <span style="font-size:.62rem;color:var(--text-secondary);font-family:monospace;">${it.sku}</span>
                    ${it.unidade ? `<span style="font-size:.62rem;color:var(--text-secondary);">${it.unidade}</span>` : ''}
                </div>
                <!-- Entrada manual -->
                <div style="margin-top:.4rem;display:flex;align-items:center;gap:.4rem;">
                    <input type="number" min="0" value="${lido}"
                        id="manual-${skuId}"
                        style="width:60px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
                               border-radius:5px;color:var(--text-primary);font-size:.78rem;padding:.2rem .35rem;text-align:center;"
                        onchange="registrarManualConf('${it.sku}', this.value)"
                        onclick="this.select()">
                    <span style="font-size:.65rem;color:var(--text-secondary);">qtd manual</span>
                    ${statusLabel ? `<span style="font-size:.6rem;font-weight:700;padding:.1rem .3rem;border-radius:3px;
                        background:${iconeColor}22;color:${iconeColor};">${statusLabel}</span>` : ''}
                </div>
            </div>

            <!-- Qtd lida -->
            ${qtyBlock}
        </div>`;
    }).join('');
}

// ─── REGISTRAR BIPAGEM (SCANNER) ─────────────────────────────────────────────
function _registrarBipagem(code) {
    const r = window._recAtivo;
    if (!r) return;

    const cln = code.trim();
    // Resolve o item por barcode, SKU ou código interno do ERP
    const item = (r.itens || []).find(it =>
        it.sku          === cln ||
        it.codigoBarras === cln ||
        it.codigoInterno=== cln
    );

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

    // Atualiza campo manual se visível
    const skuId = item.sku.replace(/[^a-z0-9]/gi,'_');
    const inp = document.getElementById('manual-' + skuId);
    if (inp) inp.value = lido;

    _salvarLeiturasDebounced();
    _atualizarUltimoLido(item, lido, status, esperado);
    _atualizarUiConferencia(r);

    setTimeout(() => {
        const card = document.getElementById('item-card-' + skuId);
        if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
        const scanInput = document.getElementById('scannerInput');
        if (scanInput) scanInput.focus();
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
    const r = window._recAtivo;
    if (!r) return;
    r._leituras[sku] = qty;
    _salvarLeiturasDebounced();
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
    const r = window._recAtivo;
    if (!r) return;

    const itensPayload  = [];
    let hasDivergencia  = false;
    let itensSemBipagem = 0;

    (r.itens || []).forEach(it => {
        const lido     = r._leituras?.[it.sku] || 0;
        const esperado = Number(it.quantidade);
        const div      = lido - esperado;
        if (div !== 0) hasDivergencia = true;
        if (lido === 0) itensSemBipagem++;
        itensPayload.push({ sku: it.sku, descricao: it.descricao, lido, esperado, divergencia: div });
    });

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
        clearTimeout(_saveTimer);
        const sessao = window.ParreiraAuth?.getSessao?.() || {};
        const fim    = new Date().toISOString();

        const maxdataPayload = {
            recebimentoId: r.id,
            nfNumero:      r.nfNumero,
            chaveNfe:      r.chaveNfe || '',
            fornecedor:    r.fornecedor,
            pedidoCompra:  r.pedidoCompra || '',
            operador:      sessao.nome || sessao.login || 'Operador',
            inicio:        window._confSessao.inicio, fim,
            hasDivergencia,
            itens:         itensPayload
        };

        // 1. Envia resumo ao ERP Maxdata (não bloqueia em caso de falha)
        WmsProcedures.proc_enviar_conferencia_maxdata(maxdataPayload)
            .catch(e => console.warn('[Maxdata] Falha no envio (será retentado):', e.message));

        // 2. Notifica ERP (procedure original)
        await WmsProcedures.proc_confirmar_conferencia_itens(maxdataPayload);

        // 3. Finaliza no Firestore
        await WmsStore.finalizarConferencia(r.id, {
            status:          hasDivergencia ? 'FINALIZADO_COM_DIV' : 'FINALIZADO',
            itensConferidos: itensPayload,
            operador:        sessao.nome || sessao.login || 'Operador',
            inicio:          window._confSessao.inicio, fim
        });

        // 4. Cria registro de divergência para controle no WMS PC
        if (hasDivergencia) {
            const itensDivergentes = itensPayload.filter(it => it.divergencia !== 0);
            await WmsStore.criarDivergencia({
                id:             `DIV-${r.id}`,
                recebimentoId:  r.id,
                nfNumero:       r.nfNumero,
                chaveNfe:       r.chaveNfe || '',
                fornecedor:     r.fornecedor,
                cnpjFornecedor: r.cnpjFornecedor || '',
                pedidoCompra:   r.pedidoCompra || '',
                doca:           r.doca || '',
                dataConferencia: fim,
                operadorConferencia: sessao.nome || sessao.login || 'Operador',
                itensDivergentes,
                totalItens:     itensPayload.length,
                totalDivergentes: itensDivergentes.length,
                status:         'ABERTA',   // ABERTA → EM_ANALISE → NOTIFICADO → RESOLVIDO / BAIXADO
                tratativas:     [],
                protocoloMaxdata: ''        // preenchido após integração real
            }).catch(e => console.warn('[Divergência] Falha ao criar registro:', e.message));
        }

        // 5. Gera putaway
        await _gerarPutaway(r);

        window._recAtivo   = null;
        window._confSessao = { nfId: null, inicio: null, ativo: false };
        Feedback.beep('success'); Feedback.flash('success');
        showToast(hasDivergencia
            ? '⚠️ Conferência finalizada com divergência. Putaway gerado.'
            : '✅ Conferência finalizada! Putaway gerado.',
            hasDivergencia ? 'warning' : 'success');
        if (window.updateHomeStats) updateHomeStats();
        setTimeout(() => navigateTo('home'), 1500);

    } catch(e) {
        showToast('Erro ao finalizar: ' + e.message, 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">done_all</span> Finalizar Conferência'; }
    }
};


// ─── GERAR PUTAWAY ────────────────────────────────────────────────────────────
async function _gerarPutaway(r) {
    const cfgRaw = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const cfgPut = cfgRaw.putaway || { modo: 'PICKING_DIRETO', tipoEnderec: 'FLUTUANTE' };
    const setores = cfgPut.setores || { A:'PICK-A', B:'PICK-B', C:'PULMAO', D:'FUNDO' };
    const efCfg  = cfgRaw.enderecoFixo || {};

    const tasks = [];
    for (let i = 0; i < (r.itens || []).length; i++) {
        const item = r.itens[i];
        const lido = r._leituras?.[item.sku] || 0;
        if (lido <= 0) continue;

        // Busca curva ABCD do SKU (Firestore → fallback D)
        let curva = 'D';
        let enderecoSugerido = setores['D'] || 'PULMAO';
        try {
            curva = await WmsStore.buscarCurvaSku(item.sku);
        } catch(_) {}

        // Endereço sugerido
        if (cfgPut.tipoEnderec === 'FIXO') {
            enderecoSugerido = efCfg[item.sku]?.endereco || setores[curva] || 'PISO-DOCA';
        } else {
            enderecoSugerido = setores[curva] || 'PISO-DOCA';
        }

        tasks.push({
            id:               `PUT-${Date.now()}-${i}`,
            nf:               r.nfNumero,
            sku:              item.sku,
            desc:             item.descricao,
            qty:              lido,
            curva,
            enderecoSugerido,
            modo:             cfgPut.modo || 'PICKING_DIRETO',
            tipoEnderec:      cfgPut.tipoEnderec || 'FLUTUANTE',
            status:           'PENDENTE',
            tipoDestino:      null,
            enderecoEfetivo:  null,
            operador:         null,
            iniciadoEm:       null,
            concluidoEm:      null,
            created:          new Date().toISOString()
        });
    }
    if (tasks.length > 0) await WmsStore.criarPutaway(tasks);
    return tasks.length;
}

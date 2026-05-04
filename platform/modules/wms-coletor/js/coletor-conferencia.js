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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
            <div>
                <strong style="font-size:.95rem;color:#0ea5e9;">📋 NF ${r.nfNumero}</strong>
                ${temDiv ? `<span style="font-size:.7rem;background:rgba(245,158,11,.2);color:#f59e0b;padding:.15rem .4rem;border-radius:4px;margin-left:.4rem;">⚠️ ${r.condicaoCarga}</span>` : ''}
                <div style="font-size:.72rem;color:var(--text-secondary);margin-top:.1rem;">${r.fornecedor}</div>
            </div>
            <button class="m-btn m-btn-outline" onclick="fecharConferenciaItens()" style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span>
            </button>
        </div>

        <!-- Barra de progresso -->
        <div style="background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.2);border-radius:8px;padding:.7rem;margin-bottom:.9rem;">
            <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.4rem;">
                <span style="color:#0ea5e9;font-weight:600;">Progresso da Conferência</span>
                <span id="conf-pct-label" style="color:var(--text-secondary);">${itensConferidos}/${totalItens} SKUs · ${pct}%</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;">
                <div id="conf-progress-bar" style="height:100%;width:${pct}%;background:#0ea5e9;border-radius:3px;transition:width .3s;"></div>
            </div>
        </div>

        <!-- Badge modo contagem -->
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.85rem;padding:.5rem .75rem;background:rgba(255,255,255,.04);border-radius:6px;border:1px solid rgba(255,255,255,.06);">
            <span class="material-icons-round" style="font-size:1rem;color:${isCega ? '#f59e0b' : '#10b981'};">${isCega ? 'visibility_off' : 'visibility'}</span>
            <span style="font-size:.78rem;font-weight:600;color:${isCega ? '#f59e0b' : '#10b981'};">${isCega ? 'Contagem Cega' : 'Contagem Aberta'}</span>
            <span style="font-size:.72rem;color:var(--text-secondary);">${isCega ? '— qtde. esperada oculta' : '— qtde. esperada visível'}</span>
        </div>

        <!-- Lista de SKUs -->
        <div id="conf-itens-lista" style="display:flex;flex-direction:column;gap:.45rem;margin-bottom:5rem;">
            ${_renderItensHtml(r, isCega)}
        </div>

        <!-- Botão Finalizar fixo no rodapé -->
        <div style="position:fixed;bottom:75px;left:0;width:100%;padding:0 1rem;box-sizing:border-box;">
            <button class="m-btn m-btn-primary" id="conf-btn-finalizar" onclick="finalizarConferencia()" style="width:100%;font-size:.95rem;box-shadow:0 4px 20px rgba(14,165,233,.3);">
                <span class="material-icons-round">done_all</span> Finalizar Conferência
            </button>
        </div>
    `;
}

// ─── RENDERIZA LISTA DE ITENS (HTML) ──────────────────────────────────────────
function _renderItensHtml(r, isCega) {
    if (!r.itens || r.itens.length === 0) {
        return `<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:.82rem;">
            <span class="material-icons-round" style="font-size:2.5rem;opacity:.3;">inventory_2</span>
            <p style="margin-top:.5rem;">Esta NF não possui itens declarados no XML para conferência.<br>
            <small>Você pode finalizar a conferência diretamente.</small></p>
        </div>`;
    }

    return r.itens.map(it => {
        const lido     = r._leituras?.[it.sku] || 0;
        const esperado = Number(it.quantidade);
        const diff     = lido - esperado;
        const ok       = lido >= esperado && esperado > 0;
        const excesso  = lido > esperado;
        const zerado   = lido === 0;

        // Cores e ícones
        let borderColor = 'rgba(255,255,255,.08)';
        let bg          = 'rgba(255,255,255,.03)';
        let icone       = 'radio_button_unchecked';
        let iconeColor  = 'var(--text-secondary)';

        if (zerado) {
            // Não bipado ainda
        } else if (excesso) {
            borderColor = 'rgba(245,158,11,.4)'; bg = 'rgba(245,158,11,.06)';
            icone = 'warning'; iconeColor = '#f59e0b';
        } else if (ok) {
            borderColor = 'rgba(16,185,129,.4)'; bg = 'rgba(16,185,129,.06)';
            icone = 'check_circle'; iconeColor = '#10b981';
        } else {
            // Parcialmente bipado
            borderColor = 'rgba(14,165,233,.3)'; bg = 'rgba(14,165,233,.04)';
            icone = 'pending'; iconeColor = '#0ea5e9';
        }

        // Coluna da direita — depende do modo contagem
        const colunaDir = isCega
            ? `<div style="text-align:right;">
                   <div style="font-size:1.15rem;font-weight:700;color:${zerado ? 'var(--text-secondary)' : iconeColor};">${lido}</div>
                   <div style="font-size:.65rem;color:var(--text-secondary);">LIDOS</div>
               </div>`
            : `<div style="text-align:right;">
                   <div style="font-size:.68rem;color:var(--text-secondary);">ESP: <strong>${esperado}</strong></div>
                   <div style="font-size:1rem;font-weight:700;color:${zerado ? 'var(--text-secondary)' : iconeColor};">
                       LID: ${lido}${diff > 0 ? ` <span style="font-size:.72rem;color:#f59e0b;">+${diff}</span>` : diff < 0 ? ` <span style="font-size:.72rem;color:#ef4444;">${diff}</span>` : ''}
                   </div>
               </div>`;

        return `
        <div style="background:${bg};border:1px solid ${borderColor};border-radius:8px;padding:.65rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:flex-start;gap:.5rem;flex:1;">
                    <span class="material-icons-round" style="color:${iconeColor};font-size:1.1rem;margin-top:.1rem;">${icone}</span>
                    <div style="flex:1;">
                        <div style="font-family:monospace;font-size:.68rem;color:var(--text-secondary);">${it.sku}</div>
                        <div style="font-size:.82rem;font-weight:600;line-height:1.3;margin-top:.1rem;">
                            ${it.descricao.length > 40 ? it.descricao.substring(0,40) + '…' : it.descricao}
                        </div>
                        <div style="font-size:.7rem;color:var(--text-secondary);margin-top:.2rem;">${it.unidade || 'UN'}</div>
                    </div>
                </div>
                <div style="margin-left:.75rem;">${colunaDir}</div>
            </div>
            <!-- Input manual de quantidade (toque no card) -->
            <div style="margin-top:.5rem;display:flex;gap:.4rem;">
                <input type="number" min="0"
                    id="manual-${it.sku.replace(/[^a-z0-9]/gi,'_')}"
                    class="m-input" placeholder="Qtde. lida"
                    style="flex:1;height:32px;font-size:.82rem;"
                    value="${lido > 0 ? lido : ''}"
                    onchange="registrarManualConf('${it.sku}', this.value)">
                <button class="m-btn" style="height:32px;padding:0 .6rem;background:rgba(14,165,233,.15);color:#0ea5e9;border:1px solid rgba(14,165,233,.3);border-radius:6px;"
                    onclick="registrarManualConf('${it.sku}', document.getElementById('manual-${it.sku.replace(/[^a-z0-9]/gi,'_')}').value)">
                    <span class="material-icons-round" style="font-size:.9rem;">check</span>
                </button>
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
        showToast('SKU não pertence a esta NF.', 'danger');
        return;
    }

    r._leituras[item.sku] = (r._leituras[item.sku] || 0) + 1;
    const lido     = r._leituras[item.sku];
    const esperado = Number(item.quantidade);

    if (lido > esperado) {
        Feedback.beep('error');
        showToast(`⚠️ Excesso: ${item.sku} — ${lido} bipado(s) vs ${esperado} esperado(s)`, 'warning');
    } else {
        Feedback.beep('success');
        if (lido === esperado) showToast(`✅ ${item.sku} completo!`, 'success');
    }

    receipts[rIdx] = r;
    localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));
    _atualizarUiConferencia(r);
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

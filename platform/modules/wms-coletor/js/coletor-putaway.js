// =============================================================================
// WMS Coletor — Tela de Armazenagem (Putaway)
// Fluxo: Conferência → PENDENTE → Operador executa → CONCLUÍDO
//
// Modos (controlados por wms_config.putaway.modo):
//   PICKING_DIRETO — vai direto ao endereço de picking sugerido
//   PULMAO         — operador escolhe PICKING ou PULMÃO antes de confirmar
//
// Endereçamento (wms_config.putaway.tipoEnderec):
//   FLUTUANTE — endereço sugerido vem da curva ABCD do SKU
//   FIXO      — endereço sugerido vem da config de endereço fixo do SKU
// =============================================================================

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function _getWmsCfgPutaway() {
    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    return cfg.putaway || { modo: 'PICKING_DIRETO', tipoEnderec: 'FLUTUANTE' };
}

function _getEnderecoFixo(sku) {
    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    return (cfg.enderecoFixo || {})[sku] || null;
}

function _curvaCor(curva) {
    return { A:'#10b981', B:'#0ea5e9', C:'#f59e0b', D:'#64748b' }[curva] || '#64748b';
}

function _sugerirEndereco(task, cfgPut) {
    if (cfgPut.tipoEnderec === 'FIXO') {
        const ef = _getEnderecoFixo(task.sku);
        if (ef?.endereco) return ef.endereco;
    }
    // Flutuante: usa setor da curva
    const curva   = task.curva || 'D';
    const setores  = cfgPut.setores || { A:'PICK-A', B:'PICK-B', C:'PULMAO', D:'FUNDO' };
    return setores[curva] || 'PULMAO';
}

// ─── TELA LISTA DE TAREFAS PENDENTES ─────────────────────────────────────────

window.initArmazenagemScreen = async function(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:var(--text-secondary);">
            <span class="material-icons-round" style="font-size:2rem;display:block;margin-bottom:.5rem;opacity:.4;">sync</span>
            <span style="font-size:.82rem;">Carregando tarefas...</span>
        </div>`;

    let tasks = [];
    try {
        tasks = await WmsStore.listarPutaway({ status: 'PENDENTE' });
    } catch(e) {
        container.innerHTML = `<div class="m-card" style="border-left:3px solid #ef4444;">
            <span style="color:#ef4444;font-size:.85rem;">Erro ao carregar tarefas: ${e.message}</span>
        </div>`;
        return;
    }

    const cfgPut = _getWmsCfgPutaway();
    const modoLabel = cfgPut.modo === 'PULMAO' ? '🏭 Picking + Pulmão' : '⚡ Picking Direto';
    const tipoLabel = cfgPut.tipoEnderec === 'FIXO' ? '📌 Endereço Fixo' : '🌊 Flutuante (Curva ABCD)';

    container.innerHTML = `
        <!-- Modo ativo -->
        <div class="m-card" style="border-left:3px solid #0ea5e9;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:.6rem;">
                <span class="material-icons-round" style="color:#0ea5e9;font-size:1.4rem;">warehouse</span>
                <div>
                    <div style="font-weight:600;font-size:.9rem;color:#0ea5e9;">Armazenagem</div>
                    <div style="font-size:.72rem;color:var(--text-secondary);">${modoLabel} · ${tipoLabel}</div>
                </div>
            </div>
        </div>

        <!-- Contador -->
        <div style="font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.65rem;
            display:flex;justify-content:space-between;align-items:center;">
            <span>Tarefas Pendentes</span>
            <span style="background:rgba(14,165,233,.15);color:#0ea5e9;padding:.2rem .55rem;
                border-radius:999px;font-size:.75rem;">${tasks.length}</span>
        </div>

        <!-- Lista -->
        ${tasks.length === 0 ? `
            <div class="m-card" style="text-align:center;padding:2rem;">
                <span class="material-icons-round" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem;">check_circle</span>
                <div style="font-size:.85rem;color:var(--text-secondary);">Nenhuma tarefa pendente 🎉</div>
            </div>` :
        tasks.map(t => {
            const curva = t.curva || 'D';
            const cor   = _curvaCor(curva);
            const end   = t.enderecoSugerido || _sugerirEndereco(t, cfgPut);
            return `
            <div class="m-card" style="padding:.85rem;cursor:pointer;margin-bottom:.6rem;"
                onclick="abrirTarefaPutaway('${t.id}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.45rem;">
                    <div>
                        <strong style="font-size:.92rem;">${t.sku}</strong>
                        <span style="font-size:.65rem;background:${cor}22;color:${cor};
                            border:1px solid ${cor}44;border-radius:4px;padding:.1rem .35rem;
                            margin-left:.4rem;font-weight:700;">Curva ${curva}</span>
                        <br>
                        <span style="font-size:.75rem;color:var(--text-secondary);">${t.desc || '—'}</span>
                    </div>
                    <span class="m-badge" style="background:rgba(245,158,11,.15);color:#f59e0b;white-space:nowrap;">
                        <span class="material-icons-round" style="font-size:.75rem;vertical-align:middle;">inventory_2</span>
                        ARMAZENAR
                    </span>
                </div>
                <div style="font-size:.73rem;color:var(--text-secondary);display:flex;gap:1rem;flex-wrap:wrap;">
                    <span>📦 Qtd: <strong>${t.qty}</strong></span>
                    <span>🗂️ NF: <strong>${t.nf || '—'}</strong></span>
                    <span>📍 Sugerido: <strong style="color:#0ea5e9;">${end}</strong></span>
                </div>
            </div>`;
        }).join('')}
    `;
};

// ─── DETALHE/EXECUÇÃO DA TAREFA ───────────────────────────────────────────────

window.abrirTarefaPutaway = async function(taskId) {
    const container = document.getElementById('screen-armazenagem');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:var(--text-secondary);">
            <span class="material-icons-round" style="font-size:2rem;display:block;opacity:.4;">sync</span>
        </div>`;

    let task;
    try {
        const tasks = await WmsStore.listarPutaway({});
        task = tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Tarefa não encontrada');
    } catch(e) {
        showToast('Erro: ' + e.message, 'danger');
        return;
    }

    const cfgPut   = _getWmsCfgPutaway();
    const curva    = task.curva || 'D';
    const cor      = _curvaCor(curva);
    const endSug   = task.enderecoSugerido || _sugerirEndereco(task, cfgPut);
    const modoPulmao = cfgPut.modo === 'PULMAO';

    // Marca EM_EXECUCAO
    await WmsStore.atualizarPutaway(taskId, {
        status: 'EM_EXECUCAO',
        iniciadoEm: new Date().toISOString()
    }).catch(() => {});

    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem;">
            <button onclick="initArmazenagemScreen(document.getElementById('screen-armazenagem'))"
                style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0;">
                <span class="material-icons-round">arrow_back</span>
            </button>
            <span style="font-weight:600;font-size:.95rem;">Armazenar Item</span>
        </div>

        <!-- Card do produto -->
        <div class="m-card" style="border-left:4px solid ${cor};margin-bottom:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-weight:700;font-size:1rem;">${task.sku}</div>
                    <div style="font-size:.78rem;color:var(--text-secondary);margin:.2rem 0;">${task.desc || '—'}</div>
                    <div style="font-size:.8rem;">
                        📦 Qtd: <strong>${task.qty}</strong> &nbsp;·&nbsp;
                        🗂️ NF: <strong>${task.nf || '—'}</strong>
                    </div>
                </div>
                <div style="text-align:center;background:${cor}22;border:2px solid ${cor}44;
                    border-radius:10px;padding:.5rem .85rem;">
                    <div style="color:${cor};font-weight:800;font-size:1.4rem;">${curva}</div>
                    <div style="font-size:.6rem;color:var(--text-secondary);">CURVA</div>
                </div>
            </div>
        </div>

        ${modoPulmao ? `
        <!-- Escolha Picking / Pulmão (modo PULMAO) -->
        <div style="font-size:.78rem;font-weight:600;color:var(--text-secondary);
            text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;">
            Destino
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-bottom:1rem;">
            <button id="btn-dest-picking" onclick="put_selecionarDestino('PICKING')"
                style="padding:.85rem;border-radius:12px;border:2px solid var(--border-color);
                    background:transparent;color:var(--text-primary);cursor:pointer;
                    font-size:.85rem;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:.3rem;
                    transition:all .2s;">
                <span class="material-icons-round" style="font-size:1.6rem;color:#0ea5e9;">shopping_cart</span>
                PICKING
                <span style="font-size:.68rem;color:var(--text-secondary);">Endereço ativo</span>
            </button>
            <button id="btn-dest-pulmao" onclick="put_selecionarDestino('PULMAO')"
                style="padding:.85rem;border-radius:12px;border:2px solid var(--border-color);
                    background:transparent;color:var(--text-primary);cursor:pointer;
                    font-size:.85rem;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:.3rem;
                    transition:all .2s;">
                <span class="material-icons-round" style="font-size:1.6rem;color:#f59e0b;">warehouse</span>
                PULMÃO
                <span style="font-size:.68rem;color:var(--text-secondary);">Buffer/reserva</span>
            </button>
        </div>` : ''}

        <!-- Endereço sugerido -->
        <div class="m-card" style="margin-bottom:1rem;background:rgba(14,165,233,.06);">
            <div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:.3rem;">Endereço Sugerido</div>
            <div style="font-size:1.1rem;font-weight:700;color:#0ea5e9;font-family:monospace;">${endSug}</div>
        </div>

        <!-- Campo de endereço (bipe ou digita) -->
        <div style="font-size:.78rem;font-weight:600;color:var(--text-secondary);
            text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;">
            Confirmar Endereço
        </div>
        <div style="display:flex;gap:.5rem;margin-bottom:1rem;">
            <input id="put-endereco-input" type="text" placeholder="Bipe ou digite o endereço..."
                style="flex:1;background:var(--bg-card);border:2px solid var(--border-color);
                    border-radius:10px;padding:.65rem .85rem;color:var(--text-primary);
                    font-size:.95rem;font-family:monospace;text-transform:uppercase;"
                oninput="this.value=this.value.toUpperCase()"
                onkeydown="if(event.key==='Enter')put_confirmarEndereco('${taskId}','${task.sku}')"
                value="${endSug}">
            <button onclick="put_usarSugerido('${endSug}')"
                style="background:rgba(14,165,233,.12);border:2px solid rgba(14,165,233,.2);
                    color:#0ea5e9;border-radius:10px;padding:.65rem .85rem;cursor:pointer;font-size:.85rem;">
                ✓ Usar
            </button>
        </div>

        <button id="put-btn-confirmar" onclick="put_confirmarEndereco('${taskId}','${task.sku}')"
            style="width:100%;background:linear-gradient(135deg,#10b981,#059669);color:#fff;
                border:none;border-radius:14px;padding:1rem;font-size:.95rem;font-weight:700;
                cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;">
            <span class="material-icons-round">check_circle</span>
            Confirmar Armazenagem
        </button>
    `;

    // Auto-foco no campo de endereço
    setTimeout(() => document.getElementById('put-endereco-input')?.focus(), 200);

    // Se modo PICKING_DIRETO, pré-seleciona PICKING visualmente
    if (!modoPulmao) window._putDestinoAtivo = 'PICKING';
};

// Botões PICKING / PULMÃO
window._putDestinoAtivo = null;
window.put_selecionarDestino = function(tipo) {
    window._putDestinoAtivo = tipo;
    const picking = document.getElementById('btn-dest-picking');
    const pulmao  = document.getElementById('btn-dest-pulmao');
    const cfgPut  = _getWmsCfgPutaway();
    const setores = cfgPut.setores || { A:'PICK-A', B:'PICK-B', C:'PULMAO', D:'FUNDO' };
    const inp     = document.getElementById('put-endereco-input');

    if (picking) picking.style.borderColor = tipo === 'PICKING' ? '#0ea5e9' : 'var(--border-color)';
    if (picking) picking.style.background  = tipo === 'PICKING' ? 'rgba(14,165,233,.1)' : 'transparent';
    if (pulmao)  pulmao.style.borderColor  = tipo === 'PULMAO'  ? '#f59e0b' : 'var(--border-color)';
    if (pulmao)  pulmao.style.background   = tipo === 'PULMAO'  ? 'rgba(245,158,11,.1)' : 'transparent';

    // Atualiza sugestão de endereço conforme escolha
    if (inp) {
        const setor = tipo === 'PICKING' ? (setores.A || 'PICK-A') : (setores.C || 'PULMAO');
        inp.value = setor;
    }
};

window.put_usarSugerido = function(end) {
    const inp = document.getElementById('put-endereco-input');
    if (inp) { inp.value = end; inp.focus(); }
};

// ─── CONFIRMAR ARMAZENAGEM ────────────────────────────────────────────────────

window.put_confirmarEndereco = async function(taskId, sku) {
    const endereco = document.getElementById('put-endereco-input')?.value?.trim().toUpperCase();
    if (!endereco) {
        showToast('Informe o endereço de destino.', 'warning');
        return;
    }

    const btn = document.getElementById('put-btn-confirmar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Confirmando...'; }

    try {
        const sessao = window.ParreiraAuth?.getSessao?.() || {};
        const fim    = new Date().toISOString();

        await WmsStore.atualizarPutaway(taskId, {
            status:         'CONCLUIDO',
            tipoDestino:    window._putDestinoAtivo || 'PICKING',
            enderecoEfetivo: endereco,
            operador:       sessao.nome || sessao.login || 'Operador',
            concluidoEm:    fim
        });

        Feedback.beep('success');
        Feedback.flash('success');
        showToast(`✅ Item armazenado em ${endereco}`, 'success');

        window._putDestinoAtivo = null;

        setTimeout(() => {
            initArmazenagemScreen(document.getElementById('screen-armazenagem'));
        }, 1200);

    } catch(e) {
        showToast('Erro ao confirmar: ' + e.message, 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">check_circle</span> Confirmar Armazenagem'; }
    }
};

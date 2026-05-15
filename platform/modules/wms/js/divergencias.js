// =============================================================================
// divergencias.js — Controle de Divergências de Recebimento
// WMS Dashboard (PC) — ParreiraLog
//
// Ciclo de vida da divergência:
//   ABERTA → EM_ANALISE → NOTIFICADO_FORNECEDOR → RESOLVIDO | BAIXADO
// =============================================================================

window.DivergenciasManager = (function () {

    let _unsub = null;
    let _cache = [];

    // ── Badges de status ────────────────────────────────────────────────────
    const STATUS_MAP = {
        'ABERTA':                { label: 'ABERTA',       bg: 'rgba(239,68,68,.15)',  color: '#ef4444' },
        'EM_ANALISE':            { label: 'EM ANÁLISE',   bg: 'rgba(245,158,11,.15)', color: '#f59e0b' },
        'NOTIFICADO_FORNECEDOR': { label: 'NOTIFICADO',   bg: 'rgba(99,102,241,.15)', color: '#818cf8' },
        'RESOLVIDO':             { label: 'RESOLVIDO',    bg: 'rgba(16,185,129,.15)', color: '#10b981' },
        'BAIXADO':               { label: 'BAIXADO',      bg: 'rgba(100,116,139,.15)',color: '#94a3b8' },
    };

    function _badge(status) {
        return STATUS_MAP[status] || { label: status || '?', bg: 'rgba(100,116,139,.15)', color: '#94a3b8' };
    }

    // ── Ponto de entrada (chamado pelo switchView) ──────────────────────────
    function load(container) {
        if (!container) return;
        if (typeof WmsStore === 'undefined') {
            container.innerHTML = `<div style="padding:2rem;color:#ef4444;">WmsStore não disponível.</div>`;
            return;
        }

        container.innerHTML = _html();
        _iniciarListener();
        _bindFiltros();
    }

    // ── HTML da view ────────────────────────────────────────────────────────
    function _html() {
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem;">
            <div>
                <h2 style="font-size:1.25rem;font-weight:700;margin:0;">Controle de Divergências</h2>
                <p style="font-size:.8rem;color:var(--text-secondary);margin:.2rem 0 0;">
                    Registros gerados automaticamente ao finalizar conferência com divergência.
                </p>
            </div>
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">
                <div id="div-live-badge" style="display:flex;align-items:center;gap:.4rem;
                    font-size:.72rem;color:#10b981;background:rgba(16,185,129,.1);
                    border:1px solid rgba(16,185,129,.2);border-radius:20px;padding:.2rem .65rem;">
                    <span style="width:6px;height:6px;border-radius:50%;background:#10b981;
                        animation:pulse 1.5s infinite;display:inline-block;"></span>
                    Ao Vivo
                </div>
                <span id="div-last-update" style="font-size:.72rem;color:var(--text-secondary);"></span>
            </div>
        </div>

        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.85rem;margin-bottom:1.5rem;">
            ${_kpi('div-kpi-total',       'Total',            'report_problem',   '#94a3b8')}
            ${_kpi('div-kpi-abertas',     'Abertas',          'error',            '#ef4444')}
            ${_kpi('div-kpi-analise',     'Em Análise',       'manage_search',    '#f59e0b')}
            ${_kpi('div-kpi-notificado',  'Notificados',      'email',            '#818cf8')}
            ${_kpi('div-kpi-resolvido',   'Resolvidos',       'check_circle',     '#10b981')}
        </div>

        <!-- Filtros -->
        <div style="display:flex;gap:.65rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
            <input id="div-filtro-busca" type="text" placeholder="🔍 Buscar NF, fornecedor..."
                style="flex:1;min-width:180px;background:var(--bg-card);border:1px solid var(--border-color);
                       border-radius:8px;padding:.45rem .75rem;color:var(--text-primary);font-size:.82rem;"
                oninput="DivergenciasManager.filtrar()">
            <select id="div-filtro-status"
                style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;
                       padding:.45rem .75rem;color:var(--text-primary);font-size:.82rem;"
                onchange="DivergenciasManager.filtrar()">
                <option value="">Todos os status</option>
                <option value="ABERTA">Abertas</option>
                <option value="EM_ANALISE">Em Análise</option>
                <option value="NOTIFICADO_FORNECEDOR">Notificados</option>
                <option value="RESOLVIDO">Resolvidos</option>
                <option value="BAIXADO">Baixados</option>
            </select>
        </div>

        <!-- Tabela -->
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">ID / Data</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">NF / Fornecedor</th>
                        <th style="padding:.75rem 1rem;text-align:center;font-size:.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Itens</th>
                        <th style="padding:.75rem 1rem;text-align:center;font-size:.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Status</th>
                        <th style="padding:.75rem 1rem;text-align:center;font-size:.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Ações</th>
                    </tr>
                </thead>
                <tbody id="div-tabela-body">
                    <tr><td colspan="5" style="padding:3rem;text-align:center;color:var(--text-secondary);">
                        <span class="material-icons-round" style="font-size:2.5rem;opacity:.3;display:block;">sync</span>
                        Carregando...
                    </td></tr>
                </tbody>
            </table>
        </div>

        <!-- Modal de Detalhe -->
        <div id="modal-div-detalhe" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);
            z-index:9999;overflow-y:auto;padding:1.5rem;backdrop-filter:blur(4px);"
            onclick="if(event.target===this)DivergenciasManager.fecharModal()">
            <div id="modal-div-content"
                style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;
                       max-width:700px;margin:0 auto;padding:1.75rem;position:relative;">
            </div>
        </div>
        `;
    }

    function _kpi(id, label, icon, color) {
        return `<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;
                    padding:1rem;text-align:center;">
                    <span class="material-icons-round" style="font-size:1.4rem;color:${color};display:block;margin-bottom:.35rem;">${icon}</span>
                    <div id="${id}" style="font-size:1.6rem;font-weight:800;color:${color};line-height:1;">—</div>
                    <div style="font-size:.68rem;color:var(--text-secondary);margin-top:.2rem;">${label}</div>
                </div>`;
    }

    // ── Listener em tempo real ──────────────────────────────────────────────
    function _iniciarListener() {
        if (_unsub) _unsub();
        try {
            _unsub = WmsStore.ouvirDivergencias(function(divs) {
                _cache = divs;
                _renderTabela(divs);
                _atualizarKpis(divs);
                const el = document.getElementById('div-last-update');
                if (el) el.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
            });
        } catch(e) {
            const b = document.getElementById('div-tabela-body');
            if (b) b.innerHTML = `<tr><td colspan="5" style="padding:2rem;text-align:center;color:#ef4444;">
                Erro: ${e.message}</td></tr>`;
        }
    }

    function _atualizarKpis(divs) {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('div-kpi-total',      divs.length);
        set('div-kpi-abertas',    divs.filter(d => d.status === 'ABERTA').length);
        set('div-kpi-analise',    divs.filter(d => d.status === 'EM_ANALISE').length);
        set('div-kpi-notificado', divs.filter(d => d.status === 'NOTIFICADO_FORNECEDOR').length);
        set('div-kpi-resolvido',  divs.filter(d => ['RESOLVIDO','BAIXADO'].includes(d.status)).length);
    }

    // ── Renderiza tabela ────────────────────────────────────────────────────
    function _renderTabela(divs) {
        const body = document.getElementById('div-tabela-body');
        if (!body) return;

        // Aplica filtros ativos
        const busca  = (document.getElementById('div-filtro-busca')?.value || '').toLowerCase();
        const status = document.getElementById('div-filtro-status')?.value || '';
        const filtradas = divs.filter(d => {
            if (status && d.status !== status) return false;
            if (busca) {
                const txt = `${d.nfNumero} ${d.fornecedor} ${d.id}`.toLowerCase();
                if (!txt.includes(busca)) return false;
            }
            return true;
        });

        if (filtradas.length === 0) {
            body.innerHTML = `<tr><td colspan="5" style="padding:3rem;text-align:center;color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem;opacity:.25;display:block;margin-bottom:.5rem;">check_circle</span>
                Nenhuma divergência encontrada.
            </td></tr>`;
            return;
        }

        body.innerHTML = filtradas.map(d => {
            const st  = _badge(d.status);
            const dt  = WmsStore.fmtData(d.criadoEm || d.dataConferencia);
            const nTrat = (d.tratativas || []).length;
            return `
            <tr style="border-bottom:1px solid var(--border-color);${d.status==='ABERTA'?'background:rgba(239,68,68,.02);':''}"
                onclick="DivergenciasManager.abrirModal('${d.id}')" style="cursor:pointer;">
                <td style="padding:.75rem 1rem;">
                    <div style="font-family:monospace;font-size:.72rem;color:var(--text-secondary);">${d.id}</div>
                    <div style="font-size:.75rem;color:var(--text-secondary);">${dt}</div>
                </td>
                <td style="padding:.75rem 1rem;">
                    <div style="font-weight:600;font-size:.88rem;">NF ${d.nfNumero || '—'}</div>
                    <div style="font-size:.75rem;color:var(--text-secondary);">${(d.fornecedor||'—').substring(0,30)}</div>
                    ${d.pedidoCompra ? `<div style="font-size:.68rem;color:#818cf8;">PC: ${d.pedidoCompra}</div>` : ''}
                </td>
                <td style="padding:.75rem 1rem;text-align:center;">
                    <div style="font-size:1.1rem;font-weight:700;color:#ef4444;">${d.totalDivergentes || 0}</div>
                    <div style="font-size:.65rem;color:var(--text-secondary);">de ${d.totalItens || 0}</div>
                </td>
                <td style="padding:.75rem 1rem;text-align:center;">
                    <span style="background:${st.bg};color:${st.color};padding:.2rem .55rem;border-radius:4px;
                        font-size:.65rem;font-weight:700;">${st.label}</span>
                    ${nTrat > 0 ? `<div style="font-size:.65rem;color:var(--text-secondary);margin-top:.2rem;">
                        ${nTrat} tratativa${nTrat>1?'s':''}</div>` : ''}
                </td>
                <td style="padding:.75rem 1rem;text-align:center;">
                    <button class="btn btn-secondary btn-icon" title="Ver detalhe"
                        onclick="event.stopPropagation();DivergenciasManager.abrirModal('${d.id}')"
                        style="font-size:.78rem;padding:.3rem .6rem;">
                        <span class="material-icons-round" style="font-size:1rem;">open_in_new</span>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── Filtros ─────────────────────────────────────────────────────────────
    function _bindFiltros() {}

    function filtrar() {
        _renderTabela(_cache);
    }

    // ── Modal de detalhe ────────────────────────────────────────────────────
    function abrirModal(id) {
        const d = _cache.find(x => x.id === id);
        if (!d) return;
        const modal   = document.getElementById('modal-div-detalhe');
        const content = document.getElementById('modal-div-content');
        if (!modal || !content) return;

        const st = _badge(d.status);

        const statusOptions = Object.entries(STATUS_MAP).map(([k, v]) =>
            `<option value="${k}" ${d.status===k?'selected':''}>${v.label}</option>`
        ).join('');

        const trataHtml = (d.tratativas || []).map(t => `
            <div style="border-left:3px solid var(--border-color);padding:.5rem .75rem;margin-bottom:.5rem;
                background:rgba(255,255,255,.02);border-radius:0 6px 6px 0;">
                <div style="font-size:.68rem;color:var(--text-secondary);">
                    ${t.operador || 'Gestor'} · ${t.dataHora ? new Date(t.dataHora).toLocaleString('pt-BR') : '—'}
                    ${t.novoStatus ? `<span style="margin-left:.4rem;background:${_badge(t.novoStatus).bg};
                        color:${_badge(t.novoStatus).color};padding:.05rem .35rem;border-radius:3px;
                        font-size:.62rem;">${_badge(t.novoStatus).label}</span>` : ''}
                </div>
                <div style="font-size:.82rem;color:var(--text-primary);margin-top:.2rem;">${t.descricao || '—'}</div>
            </div>`).join('') || `<div style="font-size:.8rem;color:var(--text-secondary);padding:.5rem 0;">Nenhuma tratativa registrada.</div>`;

        const itensHtml = (d.itensDivergentes || []).map(it => {
            const isExcesso = it.divergencia > 0;
            const cor = isExcesso ? '#f59e0b' : '#ef4444';
            return `<div style="display:flex;justify-content:space-between;align-items:center;
                padding:.5rem .75rem;background:rgba(255,255,255,.02);border-radius:8px;margin-bottom:.35rem;
                border:1px solid ${cor}22;">
                <div>
                    <div style="font-size:.8rem;font-weight:600;">${it.descricao || it.sku}</div>
                    <div style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;">${it.sku}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:.72rem;color:var(--text-secondary);">Esp: ${it.esperado} / Lid: ${it.lido}</div>
                    <div style="font-size:.88rem;font-weight:700;color:${cor};">
                        ${isExcesso ? '+' : ''}${it.divergencia} ${isExcesso ? 'excesso' : 'falta'}
                    </div>
                </div>
            </div>`;
        }).join('');

        content.innerHTML = `
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;">
                <div>
                    <div style="display:flex;align-items:center;gap:.65rem;margin-bottom:.25rem;">
                        <span class="material-icons-round" style="color:#ef4444;font-size:1.4rem;">report_problem</span>
                        <strong style="font-size:1.05rem;">Divergência — NF ${d.nfNumero}</strong>
                        <span style="background:${st.bg};color:${st.color};padding:.15rem .5rem;border-radius:4px;
                            font-size:.7rem;font-weight:700;">${st.label}</span>
                    </div>
                    <div style="font-size:.78rem;color:var(--text-secondary);">
                        ${d.fornecedor} · ${d.pedidoCompra ? 'PC ' + d.pedidoCompra + ' · ' : ''}Conferido em ${d.dataConferencia ? new Date(d.dataConferencia).toLocaleString('pt-BR') : '—'}
                    </div>
                </div>
                <button onclick="DivergenciasManager.fecharModal()"
                    style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:.3rem;">
                    <span class="material-icons-round">close</span>
                </button>
            </div>

            <!-- Itens Divergentes -->
            <div style="margin-bottom:1.25rem;">
                <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                    letter-spacing:.06em;margin-bottom:.65rem;">Itens com Divergência</div>
                ${itensHtml || '<div style="font-size:.8rem;color:var(--text-secondary);">Sem itens divergentes.</div>'}
            </div>

            <!-- Alterar Status -->
            <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-color);border-radius:10px;
                padding:1rem;margin-bottom:1.25rem;">
                <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                    letter-spacing:.06em;margin-bottom:.65rem;">Atualizar Status</div>
                <div style="display:flex;gap:.65rem;align-items:flex-end;flex-wrap:wrap;">
                    <div style="flex:1;min-width:150px;">
                        <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Novo Status</label>
                        <select id="div-novo-status"
                            style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-color);
                                   border-radius:8px;padding:.45rem .65rem;color:var(--text-primary);font-size:.82rem;">
                            ${statusOptions}
                        </select>
                    </div>
                    <div style="flex:2;min-width:200px;">
                        <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Descrição da Tratativa *</label>
                        <input id="div-trat-desc" type="text" placeholder="Ex: Fornecedor notificado por email..."
                            style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-color);
                                   border-radius:8px;padding:.45rem .65rem;color:var(--text-primary);font-size:.82rem;">
                    </div>
                    <button onclick="DivergenciasManager.salvarTratativa('${d.id}')"
                        class="btn btn-primary" style="white-space:nowrap;">
                        <span class="material-icons-round">save</span> Salvar
                    </button>
                </div>
            </div>

            <!-- Histórico de Tratativas -->
            <div>
                <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                    letter-spacing:.06em;margin-bottom:.65rem;">Histórico de Tratativas</div>
                ${trataHtml}
            </div>
        `;

        modal.style.display = 'block';
    };

    function fecharModal() {
        const m = document.getElementById('modal-div-detalhe');
        if (m) m.style.display = 'none';
    };

    // ── Salvar tratativa ────────────────────────────────────────────────────
    async function salvarTratativa(id) {
        const desc      = document.getElementById('div-trat-desc')?.value?.trim();
        const novoStatus= document.getElementById('div-novo-status')?.value;
        if (!desc) { alert('Informe a descrição da tratativa.'); return; }

        const sessao = window.ParreiraAuth?.getSessao?.() || {};
        try {
            await WmsStore.adicionarTratativa(id, {
                operador:   sessao.nome || sessao.login || 'Gestor',
                descricao:  desc,
                novoStatus: novoStatus
            });
            if (novoStatus) {
                await WmsStore.atualizarDivergencia(id, { status: novoStatus });
            }
            window.DivergenciasManager.fecharModal();
            if (window.showToast) showToast('Tratativa registrada!', 'success');
        } catch(e) {
            if (window.showToast) showToast('Erro: ' + e.message, 'danger');
        }
    };

    // ── Cleanup ─────────────────────────────────────────────────────────────
    function unload() {
        if (_unsub) { _unsub(); _unsub = null; }
        _cache = [];
    }

    return { load, unload, filtrar, abrirModal, fecharModal, salvarTratativa };
})();

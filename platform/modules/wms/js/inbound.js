// =============================================================================
// WMS Inbound — Dashboard de Recebimento (Tempo Real)
// Versão: 3.0.0 | WMS v2.0.0
// Fonte de dados: Firestore via WmsStore.ouvirRecebimentos()
// O Coletor PRODUZ (check-in / conferência) — o WMS CONSOME (visualiza).
// =============================================================================

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    let _unsubscribe = null; // cancela o listener ao sair da view
    let _cache       = [];   // snapshot local dos recebimentos (para o modal)

    // ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────
    window.loadInboundView = function () {
        // Cancela listener anterior se existir
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

        const container = $('view-inbound');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2>📦 Gestão de Recebimento</h2>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <span id="inb-live-dot" style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;animation:pulse 2s infinite;" title="Atualização em tempo real"></span>
                    <span style="font-size:.78rem;color:var(--text-secondary);">Tempo real</span>
                    <div style="font-size:0.82rem; color:var(--text-secondary); background:rgba(255,255,255,0.05); padding:0.4rem .9rem; border-radius:20px;">
                        💡 O Coletor alimenta · o WMS exibe
                    </div>
                </div>
            </div>

            <!-- KPIs -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.5rem;">
                ${_kpi('inb-kpi-checkin',     'Check-ins Hoje',       'how_to_reg',    '#ec4899')}
                ${_kpi('inb-kpi-conferindo',  'Em Conferência',       'fact_check',    '#f59e0b')}
                ${_kpi('inb-kpi-divergencias','Com Divergências',     'warning',       '#ef4444')}
                ${_kpi('inb-kpi-ok',          'Finalizados (Hoje)',   'check_circle',  '#10b981')}
            </div>

            <!-- Tabela -->
            <div class="card">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3><span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;">format_list_bulleted</span> Histórico de Recebimentos</h3>
                    <span style="font-size:.75rem;color:var(--text-secondary);" id="inb-last-update">—</span>
                </div>
                <div class="card-body" style="padding:0;">
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                            <thead>
                                <tr style="background:var(--bg-dark); border-bottom:1px solid var(--border-color);">
                                    <th style="padding:.75rem 1rem;">ID</th>
                                    <th style="padding:.75rem 1rem;">NF / Série</th>
                                    <th style="padding:.75rem 1rem;">Fornecedor</th>
                                    <th style="padding:.75rem 1rem;">Operador / Doca</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Check-in</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Status</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="inb-lista-body">
                                <tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-secondary);">
                                    <span class="material-icons-round" style="display:block;font-size:2rem;opacity:.3;margin-bottom:.5rem;">sync</span>
                                    Conectando ao Firestore...
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Detalhes -->
            <div id="modal-inb-detalhe" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; align-items:center; justify-content:center;">
                <div class="card" style="width:min(620px, 95vw); max-height:90vh; overflow-y:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:inherit; z-index:10;">
                        <h3 style="font-size:1.1rem;">Detalhes do Recebimento</h3>
                        <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer;" onclick="document.getElementById('modal-inb-detalhe').style.display='none'">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>
                    <div class="card-body" id="modal-inb-detalhe-body" style="padding:1.5rem;"></div>
                </div>
            </div>

            <style>
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
            </style>
        `;

        // Inicia listener em tempo real
        _iniciarListener();
    };

    // ─── LISTENER FIRESTORE ───────────────────────────────────────────────────
    function _iniciarListener() {
        try {
            _unsubscribe = WmsStore.ouvirRecebimentos(function (receipts) {
                _cache = receipts;
                _renderTable(receipts);
                _atualizarKpis(receipts);
                const upd = $('inb-last-update');
                if (upd) upd.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
            });
        } catch(e) {
            const body = $('inb-lista-body');
            if (body) body.innerHTML = `<tr><td colspan="7" style="padding:2rem;text-align:center;color:#ef4444;">
                Erro ao conectar: ${e.message}</td></tr>`;
        }
    }

    // ─── KPIs ─────────────────────────────────────────────────────────────────
    function _kpi(id, label, icon, color) {
        return `
        <div class="card" style="padding:1rem; border-left:3px solid ${color};">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">${label}</div>
                    <div id="${id}" style="font-size:1.8rem; font-weight:700; color:${color}; margin-top:0.25rem;">—</div>
                </div>
                <span class="material-icons-round" style="color:${color}; opacity:0.8;">${icon}</span>
            </div>
        </div>`;
    }

    function _atualizarKpis(receipts) {
        const hoje = new Date().toDateString();
        const hojeRec = receipts.filter(r => {
            const d = r.criadoEm?.toDate?.() || new Date(r.dataCheckin || 0);
            return d.toDateString() === hoje;
        });

        const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
        set('inb-kpi-checkin',     hojeRec.length);
        set('inb-kpi-conferindo',  receipts.filter(r => r.status === 'CONFERENCIA_ITENS_PENDENTE').length);
        set('inb-kpi-divergencias',receipts.filter(r => r.status === 'FINALIZADO_COM_DIV').length);
        set('inb-kpi-ok',          receipts.filter(r => {
            if (r.status !== 'FINALIZADO' && r.status !== 'FINALIZADO_COM_DIV') return false;
            const d = r.atualizadoEm?.toDate?.() || new Date(r.conferenciaFim || 0);
            return d.toDateString() === hoje;
        }).length);
    }

    // ─── TABELA ───────────────────────────────────────────────────────────────
    function _renderTable(receipts) {
        const body = $('inb-lista-body');
        if (!body) return;

        if (!receipts || receipts.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-secondary);">Nenhum recebimento registrado. O Coletor alimentará esta lista ao fazer o Check-in de uma NF.</td></tr>';
            return;
        }

        // Já vem ordenado por criadoEm desc do Firestore
        body.innerHTML = receipts.map(r => {
            const st      = _badge(r);
            const dtStr   = WmsStore.fmtData(r.criadoEm || r.dataCheckin);
            const operador = r.operadorNome || r.operadorLogin || '—';

            return `
            <tr style="border-bottom:1px solid var(--border-color); ${r.status==='FINALIZADO_COM_DIV'?'background:rgba(239,68,68,0.02);':''}">
                <td style="padding:.75rem 1rem; font-family:monospace; font-size:0.75rem; color:var(--text-secondary);">${r.id}</td>
                <td style="padding:.75rem 1rem; font-weight:600;">${r.nfNumero || '—'} / ${r.nfSerie || '—'}</td>
                <td style="padding:.75rem 1rem;">${(r.fornecedor || '—').substring(0,25)}</td>
                <td style="padding:.75rem 1rem; font-size:0.8rem;">
                    <div>${operador}</div>
                    <div style="color:var(--text-secondary);">${r.doca || '—'}</div>
                </td>
                <td style="padding:.75rem 1rem; text-align:center; font-size:0.8rem; color:var(--text-secondary);">${dtStr}</td>
                <td style="padding:.75rem 1rem; text-align:center;">
                    <span style="background:${st.bg}; color:${st.color}; padding:.2rem .5rem; border-radius:4px; font-size:.65rem; font-weight:700;">${st.label}</span>
                </td>
                <td style="padding:.75rem 1rem; text-align:center;">
                    <button class="btn btn-secondary btn-icon" onclick="inbVerDetalhe('${r.id}')" title="Ver Detalhes" style="padding:0.3rem;">
                        <span class="material-icons-round" style="font-size:1.1rem;">visibility</span>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ─── STATUS BADGE ─────────────────────────────────────────────────────────
    function _badge(r) {
        const map = {
            'AGUARDANDO_CONFERENCIA':    { label: 'CHECK-IN',        bg: 'rgba(236,72,153,.15)', color: '#ec4899' },
            'CONFERENCIA_ITENS_PENDENTE':{ label: 'CONFERINDO',      bg: 'rgba(245,158,11,.15)', color: '#f59e0b' },
            'FINALIZADO':                { label: 'FINALIZADO',      bg: 'rgba(16,185,129,.15)', color: '#10b981' },
            'FINALIZADO_COM_DIV':        { label: 'DIVERGÊNCIA',     bg: 'rgba(239,68,68,.15)',  color: '#ef4444' },
            'CANCELADO':                 { label: 'CANCELADO',       bg: 'rgba(100,100,100,.15)',color: '#aaa'    },
        };
        return map[r.status] || { label: r.status || '?', bg: 'rgba(100,100,100,.15)', color: '#aaa' };
    }

    // ─── MODAL DE DETALHE ─────────────────────────────────────────────────────
    window.inbVerDetalhe = function (id) {
        // Usa o cache em memória — sem read extra no Firestore
        const r = _cache.find(x => x.id === id);
        if (!r) return;

        const badge = _badge(r);

        const itensHtml = (r.itensConferidos || r.itens || []).length > 0 ? `
            <div style="margin-top:1rem;">
                <h4 style="font-size:0.82rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.5rem;">
                    ${r.itensConferidos ? 'Itens Conferidos' : 'Itens da NF'}
                </h4>
                <div style="max-height:220px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                        <thead style="background:var(--bg-dark); position:sticky; top:0;">
                            <tr>
                                <th style="padding:0.5rem;">SKU</th>
                                <th style="padding:0.5rem;">Descrição</th>
                                ${r.itensConferidos ? '<th style="padding:0.5rem;text-align:center;">Esp.</th><th style="padding:0.5rem;text-align:center;">Conf.</th><th style="padding:0.5rem;text-align:center;">Div.</th>' : '<th style="padding:0.5rem;text-align:center;">Qtd</th>'}
                            </tr>
                        </thead>
                        <tbody>
                            ${(r.itensConferidos || r.itens || []).map(i => `
                            <tr style="border-top:1px solid var(--border-color);">
                                <td style="padding:0.4rem 0.5rem; font-family:monospace;">${i.sku}</td>
                                <td style="padding:0.4rem 0.5rem;">${i.descricao}</td>
                                ${r.itensConferidos
                                    ? `<td style="padding:0.4rem;text-align:center;">${i.esperado}</td>
                                       <td style="padding:0.4rem;text-align:center;font-weight:700;">${i.lido}</td>
                                       <td style="padding:0.4rem;text-align:center;color:${i.divergencia!==0?'#ef4444':'#10b981'};font-weight:700;">${i.divergencia > 0 ? '+'+i.divergencia : i.divergencia}</td>`
                                    : `<td style="padding:0.4rem;text-align:center;">${i.quantidade}</td>`
                                }
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>` : '';

        $('modal-inb-detalhe-body').innerHTML = `
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-color);">
                <span style="background:${badge.bg};color:${badge.color};padding:.25rem .65rem;border-radius:6px;font-size:.72rem;font-weight:700;">${badge.label}</span>
                <span style="font-size:.8rem;color:var(--text-secondary);">NF ${r.nfNumero || '—'} · ${r.fornecedor || '—'}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:.85rem 2rem; font-size:0.85rem; margin-bottom:1rem;">
                ${_ro('ID',          r.id)}
                ${_ro('Check-in',    WmsStore.fmtData(r.criadoEm || r.dataCheckin))}
                ${_ro('NF / Série',  `${r.nfNumero||'—'} / ${r.nfSerie||'—'}`)}
                ${_ro('Fornecedor',  r.fornecedor || '—')}
                ${_ro('Operador',    r.operadorNome || r.operadorLogin || '—')}
                ${_ro('Doca',        r.doca || '—')}
                ${_ro('Placa',       r.placa || '—')}
                ${_ro('Motorista',   r.motorista || '—')}
                ${r.operadorConferencia ? _ro('Conferente', r.operadorConferencia) : ''}
                ${r.conferenciaFim ? _ro('Fim Conferência', WmsStore.fmtData(r.conferenciaFim)) : ''}
            </div>

            ${itensHtml}
        `;

        $('modal-inb-detalhe').style.display = 'flex';
    };

    function _ro(label, value) {
        return `<div>
            <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.1rem;">${label}</div>
            <div style="font-weight:600;">${value}</div>
        </div>`;
    }

    // Cancela o listener quando a view é desmontada
    window._inboundUnsubscribe = function() {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    };

})();

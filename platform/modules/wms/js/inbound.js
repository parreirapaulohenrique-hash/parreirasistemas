// =============================================================================
// WMS Inbound — Dashboard de Recebimento (Tempo Real)
// Versão: 3.0.0 | WMS v2.0.0
// Fonte de dados: Firestore via WmsStore.ouvirRecebimentos()
// O Coletor PRODUZ (check-in / conferência) — o WMS CONSOME (visualiza).
// =============================================================================

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    let _unsubscribe = null;
    let _cache       = [];
    let _pollTimer   = null; // polling automático para NFs sem pré-entrada

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
            <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:.85rem; margin-bottom:1.5rem;">
                ${_kpi('inb-kpi-checkin',       'Check-ins Hoje',        'how_to_reg',    '#ec4899')}
                ${_kpi('inb-kpi-pre-entrada',   'Aguard. Pré-Entrada',   'hourglass_top', '#f97316')}
                ${_kpi('inb-kpi-conferindo',    'Em Conferência',        'fact_check',    '#f59e0b')}
                ${_kpi('inb-kpi-divergencias',  'Com Divergências',      'warning',       '#ef4444')}
                ${_kpi('inb-kpi-ok',            'Finalizados (Hoje)',    'check_circle',  '#10b981')}
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
                _agendarPollPreEntrada(receipts); // polling para NFs bloqueadas
                const upd = $('inb-last-update');
                if (upd) upd.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
            });
        } catch(e) {
            const body = $('inb-lista-body');
            if (body) body.innerHTML = `<tr><td colspan="7" style="padding:2rem;text-align:center;color:#ef4444;">
                Erro ao conectar: ${e.message}</td></tr>`;
        }
    }

    // ─── POLLING AUTOMÁTICO PRÉ-ENTRADA ────────────────────────────────────────────────
    function _agendarPollPreEntrada(receipts) {
        clearInterval(_pollTimer);
        const bloqueadas = receipts.filter(r => r.status === 'AGUARDANDO_PRE_ENTRADA');
        if (bloqueadas.length === 0) return;

        _pollTimer = setInterval(async () => {
            for (const r of bloqueadas) {
                try {
                    const res = await WmsProcedures.proc_verificar_pre_entrada(r.chaveNfe);
                    if (res.found) {
                        await WmsStore.atualizarRecebimento(r.id, {
                            status:       'AGUARDANDO_CONFERENCIA',
                            itens:        res.itens,
                            pedidoCompra: res.pedidoCompra || ''
                        });
                        // onSnapshot atualizará o dashboard automaticamente
                        if (window.showToast) showToast(`✅ Pré-Entrada localizada! NF ${r.nfNumero} liberada.`, 'success');
                    }
                } catch(e) { /* falha silenciosa no poll */ }
            }
        }, 60000); // verifica a cada 60 segundos
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
        set('inb-kpi-pre-entrada', receipts.filter(r => r.status === 'AGUARDANDO_PRE_ENTRADA').length);
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
        const r = _cache.find(x => x.id === id);
        if (!r) return;

        const badge        = _badge(r);
        const aguardPreEnt = r.status === 'AGUARDANDO_PRE_ENTRADA';

        // Bloco informativo de pré-entrada bloqueada
        const preEntradaHtml = aguardPreEnt ? `
            <div style="background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);border-radius:10px;padding:1rem;margin:.85rem 0;text-align:center;">
                <span class="material-icons-round" style="font-size:2.2rem;color:#f97316;display:block;margin-bottom:.4rem;">hourglass_top</span>
                <div style="font-weight:700;color:#f97316;font-size:.9rem;margin-bottom:.25rem;">Aguardando Pré-Entrada no ERP</div>
                <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.75rem;">
                    Os itens desta NF ainda não foram vinculados ao cadastro interno.<br>
                    O sistema verificará automaticamente a cada 60 segundos.
                </div>
                <button class="btn btn-secondary btn-icon" onclick="inbVerificarPreEntrada('${r.id}','${r.chaveNfe}')" style="font-size:.78rem;padding:.4rem .9rem;">
                    <span class="material-icons-round" style="font-size:1rem;">refresh</span> Verificar Agora
                </button>
            </div>` : '';

        // Expor função de retry
        window.inbVerificarPreEntrada = async function(recId, chaveNfe) {
            const btn = document.querySelector('[onclick^="inbVerificarPreEntrada"]');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">sync</span> Verificando...'; }
            try {
                const res = await WmsProcedures.proc_verificar_pre_entrada(chaveNfe);
                if (res.found) {
                    await WmsStore.atualizarRecebimento(recId, {
                        status: 'AGUARDANDO_CONFERENCIA',
                        itens:  res.itens,
                        pedidoCompra: res.pedidoCompra || ''
                    });
                    $('modal-inb-detalhe').style.display = 'none';
                    showToast('✅ Pré-Entrada encontrada! NF liberada para conferência.', 'success');
                } else {
                    showToast('⏳ Ainda sem pré-entrada no ERP.', 'warning');
                    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">refresh</span> Verificar Agora'; }
                }
            } catch(e) {
                showToast('Erro: ' + e.message, 'danger');
                if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">refresh</span> Verificar Agora'; }
            }
        };

        // ─── Itens: conferência concluída ou em progresso ─────────────────────────
        let itensHtml = '';
        const todosItens   = r.itensConferidos || r.itens || [];
        const leituras     = r._leituras || {};
        const emConferencia= r.status === 'CONFERENCIA_ITENS_PENDENTE';

        if (todosItens.length > 0) {
            const headers = r.itensConferidos
                ? '<th style="padding:0.5rem;text-align:center;">Esp.</th><th style="padding:0.5rem;text-align:center;">Conf.</th><th style="padding:0.5rem;text-align:center;">Div.</th>'
                : emConferencia
                    ? '<th style="padding:0.5rem;text-align:center;">Esp.</th><th style="padding:0.5rem;text-align:center;">Bipado</th><th style="padding:0.5rem;text-align:center;">%</th>'
                    : '<th style="padding:0.5rem;text-align:center;">Qtd</th>';

            const rows = todosItens.map(i => {
                if (r.itensConferidos) {
                    const divColor = i.divergencia !== 0 ? '#ef4444' : '#10b981';
                    return `<tr style="border-top:1px solid var(--border-color);">
                        <td style="padding:0.4rem 0.5rem;font-family:monospace;">${i.sku}</td>
                        <td style="padding:0.4rem 0.5rem;">${i.descricao}</td>
                        <td style="padding:0.4rem;text-align:center;">${i.esperado}</td>
                        <td style="padding:0.4rem;text-align:center;font-weight:700;">${i.lido}</td>
                        <td style="padding:0.4rem;text-align:center;color:${divColor};font-weight:700;">${i.divergencia>0?'+'+i.divergencia:i.divergencia}</td>
                    </tr>`;
                } else if (emConferencia) {
                    const lido = leituras[i.sku] || 0;
                    const esp  = Number(i.quantidade);
                    const pct  = esp > 0 ? Math.min(100, Math.round((lido/esp)*100)) : 0;
                    const cor  = lido >= esp && esp > 0 ? '#10b981' : lido > 0 ? '#0ea5e9' : 'rgba(255,255,255,.3)';
                    return `<tr style="border-top:1px solid var(--border-color);">
                        <td style="padding:0.4rem 0.5rem;font-family:monospace;">${i.sku}</td>
                        <td style="padding:0.4rem 0.5rem;">${i.descricao}</td>
                        <td style="padding:0.4rem;text-align:center;">${esp}</td>
                        <td style="padding:0.4rem;text-align:center;font-weight:700;color:${cor};">${lido}</td>
                        <td style="padding:0.4rem;text-align:center;">
                            <div style="background:rgba(255,255,255,.08);border-radius:3px;height:6px;width:50px;margin:auto;">
                                <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px;"></div>
                            </div>
                        </td>
                    </tr>`;
                } else {
                    return `<tr style="border-top:1px solid var(--border-color);">
                        <td style="padding:0.4rem 0.5rem;font-family:monospace;">${i.sku}</td>
                        <td style="padding:0.4rem 0.5rem;">${i.descricao}</td>
                        <td style="padding:0.4rem;text-align:center;">${i.quantidade}</td>
                    </tr>`;
                }
            }).join('');

            itensHtml = `
                <div style="margin-top:1rem;">
                    <h4 style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.5rem;display:flex;align-items:center;gap:.4rem;">
                        ${emConferencia ? '<span class="material-icons-round" style="font-size:1rem;color:#0ea5e9;">radar</span> Progresso em Tempo Real' : r.itensConferidos ? 'Itens Conferidos' : 'Itens da NF'}
                    </h4>
                    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.8rem;text-align:left;">
                            <thead style="background:var(--bg-dark);position:sticky;top:0;">
                                <tr>
                                    <th style="padding:0.5rem;">SKU</th>
                                    <th style="padding:0.5rem;">Descrição</th>
                                    ${headers}
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
        }

        // ─── Divergência de Doca ─────────────────────────────────────────────────
        const docaDiv = r.divergenciaMacro && r.divergenciaMacro.tipo !== 'OK' ? `
            <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.85rem;margin:.85rem 0;">
                <div style="font-weight:700;font-size:.8rem;color:#f59e0b;margin-bottom:.4rem;">
                    <span class="material-icons-round" style="font-size:1rem;vertical-align:middle;">warning</span>
                    Divergência Macro — ${r.divergenciaMacro.tipo}
                </div>
                <div style="font-size:.8rem;display:flex;gap:1.5rem;">
                    ${r.divergenciaMacro.avariados>0?`<span>Avariados: <strong>${r.divergenciaMacro.avariados}</strong></span>`:''}
                    ${r.divergenciaMacro.faltantes>0?`<span>Faltantes: <strong>${r.divergenciaMacro.faltantes}</strong></span>`:''}
                    ${r.divergenciaMacro.excesso>0?`<span>Excesso: <strong>${r.divergenciaMacro.excesso}</strong></span>`:''}
                </div>
                ${r.divergenciaMacro.desc?`<div style="font-size:.78rem;color:var(--text-secondary);margin-top:.4rem;">${r.divergenciaMacro.desc}</div>`:''}
            </div>` : '';

        $('modal-inb-detalhe-body').innerHTML = `
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-color);">
                <span style="background:${badge.bg};color:${badge.color};padding:.25rem .65rem;border-radius:6px;font-size:.72rem;font-weight:700;">${badge.label}</span>
                <span style="font-size:.8rem;color:var(--text-secondary);">NF ${r.nfNumero || '—'} · ${r.fornecedor || '—'}</span>
                ${emConferencia ? '<span style="font-size:.72rem;color:#0ea5e9;background:rgba(14,165,233,.1);padding:.2rem .5rem;border-radius:4px;">🔴 AO VIVO</span>' : ''}
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
                ${r.pedidoCompra    ? _ro('Pedido de Compra', r.pedidoCompra) : ''}
                ${r.volumesFisicos != null ? _ro('Vol. NF / Físico', `${r.volumesNF ?? '?'} / <strong>${r.volumesFisicos}</strong>`) : ''}
                ${r.operadorConferencia ? _ro('Conferente', r.operadorConferencia) : ''}
                ${r.conferenciaFim ? _ro('Fim Conferência', WmsStore.fmtData(r.conferenciaFim)) : ''}
            </div>

            ${preEntradaHtml}
            ${docaDiv}
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

    // Cancela o listener e o poll quando a view é desmontada
    window._inboundUnsubscribe = function() {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        clearInterval(_pollTimer); _pollTimer = null;
    };

})();

// =============================================================================
// WMS Inbound — Painel de Gestão (Dashboard)
// Versão: 2.1.0 | WMS v1.7.0
// O recebimento manual agora ocorre no WMS Coletor.
// Esta tela exibe as conferências realizadas e auditorias.
// =============================================================================

(function () {
    'use strict';

    function ts() { return window.getTenantSuffix ? window.getTenantSuffix() : ''; }
    function $(id) { return document.getElementById(id); }

    window.loadInboundView = function () {
        const container = $('view-inbound');
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h2>📦 Gestão de Recebimento</h2>
                <div style="font-size:0.85rem; color:var(--text-secondary); background:rgba(255,255,255,0.05); padding:0.5rem 1rem; border-radius:20px;">
                    💡 Dica: A conferência de NF agora é feita pelo <strong>WMS Coletor</strong>
                </div>
            </div>

            <!-- KPIs -->
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.5rem;">
                ${_kpi('inb-kpi-aguardando','Aguardando Putaway','hourglass_empty','#0ea5e9')}
                ${_kpi('inb-kpi-divergencias','Com Divergências','warning','#f59e0b')}
                ${_kpi('inb-kpi-avulsa','Entradas Avulsas','lock_open','#ef4444')}
                ${_kpi('inb-kpi-ok','Concluídos (Hoje)','check_circle','#10b981')}
            </div>

            <div class="card">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3><span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;">format_list_bulleted</span> Histórico de Recebimentos</h3>
                    <button class="btn btn-secondary btn-icon" onclick="loadInboundView()" title="Atualizar">
                        <span class="material-icons-round">refresh</span>
                    </button>
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
                                    <th style="padding:.75rem 1rem; text-align:center;">Vol. Físicos</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Data</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Status</th>
                                    <th style="padding:.75rem 1rem; text-align:center;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="inb-lista-body">
                                <tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-secondary);">Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Detalhes -->
            <div id="modal-inb-detalhe" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; align-items:center; justify-content:center;">
                <div class="card" style="width:min(600px, 95vw); max-height:90vh; overflow-y:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:inherit; z-index:10;">
                        <h3 style="font-size:1.1rem;">Detalhes do Recebimento</h3>
                        <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer;" onclick="document.getElementById('modal-inb-detalhe').style.display='none'">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>
                    <div class="card-body" id="modal-inb-detalhe-body" style="padding:1.5rem;">
                        <!-- Conteúdo injetado via JS -->
                    </div>
                </div>
            </div>
        `;

        _renderTable();
    };

    function _kpi(id, label, icon, color) {
        return `
        <div class="card" style="padding:1rem; border-left:3px solid ${color};">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">${label}</div>
                    <div id="${id}" style="font-size:1.8rem; font-weight:700; color:${color}; margin-top:0.25rem;">0</div>
                </div>
                <span class="material-icons-round" style="color:${color}; opacity:0.8;">${icon}</span>
            </div>
        </div>`;
    }

    function _getStatusBadge(rec) {
        if (rec.divergencia) {
            return { label: 'DIVERGÊNCIA', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
        }
        if (rec.status === 'AGUARDANDO_PUTAWAY') {
            return { label: 'AGUARDANDO PUTAWAY', bg: 'rgba(14,165,233,0.15)', color: '#0ea5e9' };
        }
        if (rec.status === 'EM_CONFERENCIA') {
            return { label: 'EM CONFERÊNCIA', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
        }
        if (rec.status === 'PUTAWAY_CONCLUIDO') {
            return { label: 'CONCLUÍDO', bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
        }
        return { label: rec.status, bg: 'rgba(100,100,100,0.15)', color: '#aaa' };
    }

    function _renderTable() {
        const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2' + ts()) || '[]');
        
        // Atualiza KPIs
        const hoje = new Date().toDateString();
        $('inb-kpi-aguardando').textContent = receipts.filter(r => r.status === 'AGUARDANDO_PUTAWAY').length;
        $('inb-kpi-divergencias').textContent = receipts.filter(r => r.divergencia).length;
        $('inb-kpi-avulsa').textContent = receipts.filter(r => r.entradaAvulsa).length;
        $('inb-kpi-ok').textContent = receipts.filter(r => r.status === 'PUTAWAY_CONCLUIDO' && new Date(r.dataConferencia).toDateString() === hoje).length;

        const body = $('inb-lista-body');
        if (receipts.length === 0) {
            body.innerHTML = '<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-secondary);">Nenhum recebimento registrado.</td></tr>';
            return;
        }

        // Ordena por data mais recente
        receipts.sort((a, b) => new Date(b.dataConferencia || b.registradoEm || 0) - new Date(a.dataConferencia || a.registradoEm || 0));

        body.innerHTML = receipts.map((r, i) => {
            const st = _getStatusBadge(r);
            const isAvulsa = r.entradaAvulsa ? '<span class="material-icons-round" style="font-size:1rem;color:#f59e0b;vertical-align:middle;margin-right:2px;" title="Entrada Avulsa via PIN">warning</span>' : '';
            const dataStr = r.dataConferencia ? new Date(r.dataConferencia).toLocaleString('pt-BR').substring(0, 16) : '—';
            
            return `
            <tr style="border-bottom:1px solid var(--border-color); ${r.divergencia ? 'background:rgba(239,68,68,0.02);' : ''}">
                <td style="padding:.75rem 1rem; font-family:monospace; font-size:0.75rem; color:var(--text-secondary);">${r.id}</td>
                <td style="padding:.75rem 1rem; font-weight:600;">${isAvulsa} ${r.nfNumero || '—'} / ${r.nfSerie || '—'}</td>
                <td style="padding:.75rem 1rem;">${(r.fornecedor || '—').substring(0,25)}</td>
                <td style="padding:.75rem 1rem; font-size:0.75rem;">
                    <div>${r.operador || '—'}</div>
                    <div style="color:var(--text-secondary);">${r.doca || '—'}</div>
                </td>
                <td style="padding:.75rem 1rem; text-align:center; font-weight:600;">${r.volumesFisicos != null ? r.volumesFisicos : '—'}</td>
                <td style="padding:.75rem 1rem; text-align:center; font-size:0.8rem; color:var(--text-secondary);">${dataStr}</td>
                <td style="padding:.75rem 1rem; text-align:center;">
                    <span style="background:${st.bg}; color:${st.color}; padding:.2rem .5rem; border-radius:4px; font-size:.65rem; font-weight:700;">${st.label}</span>
                </td>
                <td style="padding:.75rem 1rem; text-align:center;">
                    <button class="btn btn-secondary btn-icon" onclick="inbVerDetalhe('${r.id}')" title="Ver Detalhes" style="padding:0.3rem;">
                        <span class="material-icons-round" style="font-size:1.1rem;">visibility</span>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    }

    function _campo_ro(label, value) {
        return `<div><div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.1rem; text-transform:uppercase;">${label}</div><div style="font-weight:600;">${value}</div></div>`;
    }

    window.inbVerDetalhe = function (id) {
        const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2' + ts()) || '[]');
        const r = receipts.find(x => x.id === id);
        if (!r) return;

        let divHtml = '';
        if (r.divergencia) {
            divHtml = `
            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:1rem; margin:1rem 0;">
                <h4 style="color:#ef4444; margin-bottom:0.5rem; display:flex; align-items:center;">
                    <span class="material-icons-round" style="font-size:1.2rem; margin-right:0.5rem;">warning</span>
                    Ocorrência: ${r.divergencia.tipo}
                </h4>
                <div style="display:flex; gap:1.5rem; font-size:0.85rem;">
                    ${r.divergencia.volumesFaltantes ? `<div><strong>Faltantes:</strong> ${r.divergencia.volumesFaltantes}</div>` : ''}
                    ${r.divergencia.volumesExcesso ? `<div><strong>Excesso:</strong> ${r.divergencia.volumesExcesso}</div>` : ''}
                    ${r.divergencia.volumesAvariados ? `<div><strong>Avariados:</strong> ${r.divergencia.volumesAvariados}</div>` : ''}
                </div>
                ${r.divergencia.descricao ? `<div style="margin-top:0.5rem; font-size:0.85rem; color:var(--text-secondary);">"${r.divergencia.descricao}"</div>` : ''}
                
                ${r.divergencia.fotos && r.divergencia.fotos.length > 0 ? `
                <div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                    ${r.divergencia.fotos.map(f => `
                        <img src="${f.b64}" style="width:80px; height:80px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color); cursor:pointer;" onclick="window.open('${f.b64}')" title="Clique para ampliar">
                    `).join('')}
                </div>
                ` : ''}
            </div>
            `;
        }

        let itensHtml = '';
        if (r.itens && r.itens.length > 0) {
            itensHtml = `
            <div style="margin-top:1rem;">
                <h4 style="font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.5rem;">Itens da NF</h4>
                <div style="max-height:200px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                        <thead style="background:var(--bg-dark); position:sticky; top:0;">
                            <tr>
                                <th style="padding:0.5rem;">SKU</th>
                                <th style="padding:0.5rem;">Descrição</th>
                                <th style="padding:0.5rem; text-align:center;">Qtd</th>
                                <th style="padding:0.5rem; text-align:center;">Un</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${r.itens.map(i => `
                            <tr style="border-top:1px solid var(--border-color);">
                                <td style="padding:0.4rem 0.5rem; font-family:monospace;">${i.sku}</td>
                                <td style="padding:0.4rem 0.5rem;">${i.descricao}</td>
                                <td style="padding:0.4rem 0.5rem; text-align:center;">${i.quantidade}</td>
                                <td style="padding:0.4rem 0.5rem; text-align:center;">${i.unidade || 'UN'}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            `;
        }

        $('modal-inb-detalhe-body').innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem 2rem; font-size:0.85rem; border-bottom:1px solid var(--border-color); padding-bottom:1rem;">
                ${_campo_ro('ID Operação / Entrada', `${r.id} ${r.entradaAvulsa ? '<span style="color:#f59e0b">(Avulsa/PIN)</span>' : ''}`)}
                ${_campo_ro('Data Recebimento', new Date(r.dataConferencia).toLocaleString('pt-BR'))}
                ${_campo_ro('NF / Série', `${r.nfNumero || '—'} / ${r.nfSerie || '—'}`)}
                ${_campo_ro('Chave de Acesso', `<span style="font-family:monospace;font-size:0.75rem;">${r.chaveNfe || '—'}</span>`)}
                ${_campo_ro('Fornecedor', r.fornecedor || '—')}
                ${_campo_ro('Empresa Destinatária', r.empresaDestino || '—')}
                ${_campo_ro('Operador WMS', r.operador || '—')}
                ${_campo_ro('Doca e Veículo', `${r.doca || '—'} | Placa: ${r.placa || '—'} | Mot: ${r.motorista || '—'}`)}
                ${_campo_ro('Volumes (XML / Físico)', `<b>${r.volumesNF != null ? r.volumesNF : '?'}</b> vs <b>${r.volumesFisicos != null ? r.volumesFisicos : '?'}</b>`)}
                ${_campo_ro('Pedido de Compra', r.pedidoCompra || '—')}
            </div>
            
            ${divHtml}
            ${itensHtml}

            ${r.observacoes ? `
            <div style="margin-top:1rem; padding:0.75rem; background:var(--bg-dark); border-radius:6px; font-size:0.85rem;">
                <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.25rem;">Observações</div>
                <div>${r.observacoes}</div>
            </div>
            ` : ''}
        `;

        $('modal-inb-detalhe').style.display = 'flex';
    };

})();

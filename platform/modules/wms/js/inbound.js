// =============================================================================
// WMS Inbound — Gestão de Recebimento & Conferência de Chegada
// Versão: 4.0.0 | Multi-ERP (Maxdata / Standalone / Parreira ERP)
// Integração bidirecional com WmsProcedures, WmsStore e WmsIntegration
// =============================================================================

(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    let _unsubscribe    = null;
    let _cache          = [];
    let _pollTimer      = null;
    let _currentTab     = 'nova-entrada'; // 'nova-entrada' | 'historico'
    let _activeNfData   = null;           // NF localizada no ERP/Maxdata
    let _uploadedPhotos = [];             // Fotos de avaria/divergência (Base64)

    // ─── PONTO DE ENTRADA PRINCIPAL ──────────────────────────────────────────
    window.loadInboundView = function () {
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

        const container = $('view-inbound');
        if (!container) return;

        container.innerHTML = `
            <!-- Top Navigation Tabs -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:.75rem;">
                <div style="display:flex; gap:0.5rem;">
                    <button id="inb-tab-btn-nova" class="btn ${
                        _currentTab === 'nova-entrada' ? 'btn-primary' : 'btn-secondary'
                    }" onclick="window._switchInboundTab('nova-entrada')" style="display:flex; align-items:center; gap:.4rem; font-weight:600;">
                        <span class="material-icons-round" style="font-size:1.1rem;">qr_code_scanner</span>
                        Nova Entrada (Scanner)
                    </button>
                    <button id="inb-tab-btn-hist" class="btn ${
                        _currentTab === 'historico' ? 'btn-primary' : 'btn-secondary'
                    }" onclick="window._switchInboundTab('historico')" style="display:flex; align-items:center; gap:.4rem; font-weight:600;">
                        <span class="material-icons-round" style="font-size:1.1rem;">history</span>
                        Histórico de Recebimentos
                    </button>
                </div>

                <div style="display:flex; align-items:center; gap:.75rem;">
                    <div id="inb-maxdata-badge" style="font-size:.78rem; background:rgba(59,130,246,0.1); color:#3b82f6; border:1px solid rgba(59,130,246,0.2); padding:.3rem .8rem; border-radius:20px; display:flex; align-items:center; gap:.4rem;">
                        <span class="material-icons-round" style="font-size:0.9rem;">sync</span> Conector ERP: <strong id="inb-connector-label">Carregando...</strong>
                    </div>
                </div>
            </div>

            <!-- Tab Content 1: Nova Entrada -->
            <div id="inb-tab-nova" style="display:${_currentTab === 'nova-entrada' ? 'block' : 'none'};">
                <!-- Scanner Section -->
                <div class="card" style="margin-bottom:1.5rem; background:linear-gradient(135deg, rgba(15,23,42,0.8), rgba(30,41,59,0.8)); border:1px solid rgba(255,255,255,0.08);">
                    <div class="card-body" style="padding:1.75rem;">
                        <label style="font-size:0.85rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; display:block; margin-bottom:0.5rem;">
                            <span class="material-icons-round" style="vertical-align:middle; margin-right:.4rem; color:var(--wms-primary, #3b82f6);">barcode_reader</span>
                            Bipar ou Digitar Chave NF-e (44 dígitos)
                        </label>
                        <div style="display:flex; gap:0.75rem; align-items:center;">
                            <div style="position:relative; flex:1;">
                                <input type="text" id="inb-scan-chave" placeholder="352607......................................" maxlength="44" autocomplete="off"
                                    style="width:100%; font-size:1.25rem; font-family:monospace; padding:.75rem 1rem; border-radius:8px; border:2px solid var(--border-color); background:var(--bg-card, #1e293b); color:#fff; text-transform:uppercase;"
                                    oninput="window._handleChaveInput(this.value)" onkeydown="if(event.key==='Enter') window._buscarNfEntrada();">
                                <span id="inb-scan-counter" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:0.75rem; color:var(--text-secondary); font-weight:600;">0/44</span>
                            </div>
                            <button class="btn btn-primary" onclick="window._buscarNfEntrada()" style="padding:.75rem 1.5rem; font-size:1rem; display:flex; align-items:center; gap:.5rem;">
                                <span class="material-icons-round">search</span> Buscar NF
                            </button>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.5rem; display:flex; justify-content:space-between;">
                            <span>💡 A leitura por leitor USB/Bluetooth preencherá automaticamente ao bipar.</span>
                            <span id="inb-poller-status" style="color:#10b981;">● Polling ERP Ativo</span>
                        </div>
                    </div>
                </div>

                <!-- Container do Card de Conferência ou Alerta de Busca -->
                <div id="inb-card-container">
                    <div class="card" style="text-align:center; padding:3rem 1.5rem; color:var(--text-secondary);">
                        <span class="material-icons-round" style="font-size:3.5rem; opacity:0.3; margin-bottom:0.5rem; display:block;">inventory_2</span>
                        <h4 style="margin:0 0 .25rem 0;">Aguardando Leitura de NF-e</h4>
                        <p style="font-size:0.85rem; margin:0;">Bipe a DANFE do fornecedor para iniciar a conferência de recepção.</p>
                    </div>
                </div>
            </div>

            <!-- Tab Content 2: Histórico (Conteúdo Preservado) -->
            <div id="inb-tab-hist" style="display:${_currentTab === 'historico' ? 'block' : 'none'};">
                <!-- KPIs -->
                <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:.85rem; margin-bottom:1.5rem;">
                    ${_kpi('inb-kpi-checkin',       'Check-ins Hoje',        'how_to_reg',    '#ec4899')}
                    ${_kpi('inb-kpi-pre-entrada',   'Aguard. Pré-Entrada',   'hourglass_top', '#f97316')}
                    ${_kpi('inb-kpi-conferindo',    'Em Conferência',        'fact_check',    '#f59e0b')}
                    ${_kpi('inb-kpi-divergencias',  'Com Divergências',      'warning',       '#ef4444')}
                    ${_kpi('inb-kpi-ok',            'Finalizados (Hoje)',    'check_circle',  '#10b981')}
                </div>

                <!-- Tabela de Histórico -->
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
            </div>

            <!-- Modal Detalhes Histórico -->
            <div id="modal-inb-detalhe" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; align-items:center; justify-content:center;">
                <div class="card" style="width:min(640px, 95vw); max-height:90vh; overflow-y:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:inherit; z-index:10;">
                        <h3 style="font-size:1.1rem;">Detalhes do Recebimento</h3>
                        <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer;" onclick="document.getElementById('modal-inb-detalhe').style.display='none'">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>
                    <div class="card-body" id="modal-inb-detalhe-body" style="padding:1.5rem;"></div>
                </div>
            </div>

            <!-- Modal PIN Supervisor para Entrada Avulsa -->
            <div id="modal-inb-pin" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:10000; align-items:center; justify-content:center;">
                <div class="card" style="width:min(480px, 90vw); box-shadow:0 15px 50px rgba(239,68,68,0.3); border:1px solid rgba(239,68,68,0.4);">
                    <div class="card-header" style="background:rgba(239,68,68,0.1); border-bottom:1px solid rgba(239,68,68,0.3);">
                        <h3 style="color:#ef4444; font-size:1.1rem; display:flex; align-items:center; gap:.5rem;">
                            <span class="material-icons-round">security</span> Liberação com PIN de Supervisor
                        </h3>
                    </div>
                    <div class="card-body" style="padding:1.5rem;">
                        <p style="font-size:0.85rem; color:var(--text-secondary); margin:0 0 1rem 0;">
                            A Nota Fiscal não foi localizada na integração ERP Maxdata/Nativa. Para permitir a entrada avulsa com registro de auditoria, digite o PIN de Supervisor.
                        </p>
                        
                        <div style="margin-bottom:1rem;">
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">FORNECEDOR (DIGITAÇÃO MANUALE)</label>
                            <input type="text" id="pin-fornecedor-manual" placeholder="Razão Social do Fornecedor" class="form-control" style="width:100%; padding:.5rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:.75rem; margin-bottom:1rem;">
                            <div>
                                <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">NF NÚMERO</label>
                                <input type="text" id="pin-nf-manual" placeholder="Ex: 12345" class="form-control" style="width:100%; padding:.5rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">VOLUMES</label>
                                <input type="number" id="pin-vol-manual" placeholder="Qtd volumes" class="form-control" style="width:100%; padding:.5rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                            </div>
                        </div>

                        <div style="margin-bottom:1.5rem;">
                            <label style="font-size:0.75rem; font-weight:700; color:#ef4444;">PIN DO SUPERVISOR (4 DÍGITOS)</label>
                            <input type="password" id="pin-input" maxlength="6" placeholder="****" style="width:100%; font-size:1.5rem; text-align:center; letter-spacing:0.5em; padding:.5rem; margin-top:.25rem; border-radius:6px; border:2px solid #ef4444; background:var(--bg-dark); color:#fff;">
                        </div>

                        <div style="display:flex; justify-content:flex-end; gap:.75rem;">
                            <button class="btn btn-secondary" onclick="$('modal-inb-pin').style.display='none'">Cancelar</button>
                            <button class="btn btn-danger" onclick="window._validarPinAutorizarEntrada()">
                                Autorizar Entrada Avulsa
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        _atualizarStatusConectorLabel();
        _iniciarListener();
    };

    // ─── GESTÃO DE ABAS ──────────────────────────────────────────────────────
    window._switchInboundTab = function (tab) {
        _currentTab = tab;
        const nova = $('inb-tab-nova');
        const hist = $('inb-tab-hist');
        const btnNova = $('inb-tab-btn-nova');
        const btnHist = $('inb-tab-btn-hist');

        if (nova && hist) {
            nova.style.display = tab === 'nova-entrada' ? 'block' : 'none';
            hist.style.display = tab === 'historico' ? 'block' : 'none';
        }
        if (btnNova && btnHist) {
            btnNova.className = `btn ${tab === 'nova-entrada' ? 'btn-primary' : 'btn-secondary'}`;
            btnHist.className = `btn ${tab === 'historico' ? 'btn-primary' : 'btn-secondary'}`;
        }
    };

    // ─── LEITURA E SCANNER NF-E ──────────────────────────────────────────────
    window._handleChaveInput = function (val) {
        const clean = val.replace(/\D/g, '');
        const counter = $('inb-scan-counter');
        if (counter) counter.textContent = `${clean.length}/44`;

        if (clean.length === 44) {
            window._buscarNfEntrada();
        }
    };

    function _atualizarStatusConectorLabel() {
        const el = $('inb-connector-label');
        if (!el) return;
        try {
            const status = window.WmsIntegration ? window.WmsIntegration.getStatus() : null;
            if (status && status.connectorId === 'maxdata') {
                const empId = status.config?.empId || 5;
                el.textContent = `Maxdata ERP (empId: ${empId})`;
            } else if (status && status.connectorName) {
                el.textContent = status.connectorName;
            } else {
                el.textContent = 'Standalone (sem ERP)';
            }
        } catch (e) {
            el.textContent = 'Standalone (sem ERP)';
        }
    }

    // Reage dinamicamente a mudanças de integração
    window.addEventListener('wms-integration-changed', function () {
        _atualizarStatusConectorLabel();
    });

    // ─── BUSCA NF NO ERP (PROCEDURES) ────────────────────────────────────────
    window._buscarNfEntrada = async function () {
        const input = $('inb-scan-chave');
        if (!input) return;
        const chave = input.value.replace(/\D/g, '');

        if (!chave || chave.length < 5) {
            if (window.showToast) showToast('Digite a chave NF-e de 44 dígitos ou número da NF.', 'warning');
            return;
        }

        const container = $('inb-card-container');
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:3rem 1.5rem;">
                <span class="material-icons-round" style="font-size:3rem; color:var(--wms-primary, #3b82f6); animation:spin 1s linear infinite; display:inline-block; margin-bottom:.5rem;">sync</span>
                <h4 style="margin:0;">Consultando Integração ERP...</h4>
                <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:.25rem;">Chave: ${chave}</p>
            </div>
        `;

        try {
            // Executa procedure padronizada
            const nfData = await WmsProcedures.proc_buscar_nf_destinada(chave);

            if (nfData && (nfData.found || nfData.numero || nfData.chaveNfe)) {
                _activeNfData = nfData;
                _uploadedPhotos = [];
                _renderCardConferencia(nfData);
                if (window.showToast) showToast(`✅ NF ${nfData.numero || ''} localizada!`, 'success');
            } else {
                _activeNfData = { chaveNfe: chave };
                _renderCardNfNaoEncontrada(chave);
            }
        } catch (e) {
            console.error('Erro na busca de NF:', e);
            _renderCardNfNaoEncontrada(chave, e.message);
        }
    };

    // ─── RENDER CARD CONFERÊNCIA ─────────────────────────────────────────────
    function _renderCardConferencia(nf) {
        const container = $('inb-card-container');
        if (!container) return;

        const docasMock = [
            { id: 'DOCA-01', nome: 'Doca 01 - Recebimento' },
            { id: 'DOCA-02', nome: 'Doca 02 - Recebimento' },
            { id: 'DOCA-03', nome: 'Doca 03 - Mista' },
        ];

        const docasOptions = docasMock.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');

        container.innerHTML = `
            <div class="card" style="border-top:4px solid var(--wms-primary, #3b82f6); box-shadow:0 8px 30px rgba(0,0,0,0.2);">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02);">
                    <div>
                        <span style="font-size:0.7rem; font-weight:700; background:rgba(16,185,129,0.15); color:#10b981; padding:.2rem .6rem; border-radius:4px; margin-right:.5rem;">
                            ORIGEM: ${nf.origem || 'MAXDATA ERP'}
                        </span>
                        <span style="font-size:0.85rem; color:var(--text-secondary);">Chave: ${nf.chaveNfe || '—'}</span>
                    </div>
                    <button class="btn btn-secondary btn-icon" onclick="window._limparConferencia()" title="Cancelar">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>

                <div class="card-body" style="padding:1.5rem;">
                    <!-- Top Info Grid -->
                    <div style="display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:1rem; padding:1rem; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:1.5rem;">
                        <div>
                            <div style="font-size:.7rem; color:var(--text-secondary); text-transform:uppercase;">Fornecedor</div>
                            <div style="font-weight:700; font-size:1.05rem;">${nf.fornecedor || 'Desconhecido'}</div>
                            <div style="font-size:.75rem; color:var(--text-secondary);">CNPJ: ${nf.cnpjEmitente || '—'}</div>
                        </div>
                        <div>
                            <div style="font-size:.7rem; color:var(--text-secondary); text-transform:uppercase;">NF / Série</div>
                            <div style="font-weight:700; font-size:1.05rem; color:var(--wms-primary, #3b82f6);">${nf.numero || '—'} / ${nf.serie || '1'}</div>
                        </div>
                        <div>
                            <div style="font-size:.7rem; color:var(--text-secondary); text-transform:uppercase;">Volumes NF</div>
                            <div style="font-weight:700; font-size:1.05rem;" id="inb-conf-vol-nf">${nf.volumes || nf.quantidadeVolumes || 1}</div>
                        </div>
                        <div>
                            <div style="font-size:.7rem; color:var(--text-secondary); text-transform:uppercase;">Valor Total</div>
                            <div style="font-weight:700; font-size:1.05rem; color:#10b981;">R$ ${Number(nf.valorTotal || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
                        </div>
                    </div>

                    <!-- Input Form: Doca & Transportadora -->
                    <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:.75rem;">
                        📋 Preenchimento de Portaria & Recebimento
                    </h4>

                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:1rem; margin-bottom:1.25rem;">
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">DOCA DE DESCARGA *</label>
                            <select id="inb-conf-doca" class="form-control" style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                                ${docasOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">PLACA DO VEÍCULO</label>
                            <input type="text" id="inb-conf-placa" placeholder="ABC-1234" maxlength="8" class="form-control" style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff; text-transform:uppercase;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">NOME DO MOTORISTA</label>
                            <input type="text" id="inb-conf-motorista" placeholder="Nome do Condutor" class="form-control" style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">VOLUMES FÍSICOS LIDOS *</label>
                            <input type="number" id="inb-conf-vol-fisico" value="${nf.volumes || nf.quantidadeVolumes || 1}" min="1" class="form-control"
                                style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff; font-weight:700;"
                                onchange="window._checarDivergenciaVolumes()">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">CONDIÇÃO DA CARGA *</label>
                            <select id="inb-conf-condicao" class="form-control" onchange="window._checarDivergenciaVolumes()" style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                                <option value="Normal">Sem Avarias (Normal)</option>
                                <option value="Avariado">Embalagens Avariadas / Molhadas</option>
                                <option value="Parcial">Entrega Parcial / Falta</option>
                                <option value="Excesso">Volume Excedente</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">E-MAIL DO FORNECEDOR (PARA NOTIFICAÇÃO)</label>
                            <input type="email" id="inb-conf-email" value="${nf.emailFornecedor || ''}" placeholder="sac@fornecedor.com.br" class="form-control" style="width:100%; padding:.6rem; margin-top:.25rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff;">
                        </div>
                    </div>

                    <!-- Divergência & Photo Panel (Dinâmico) -->
                    <div id="inb-panel-divergencia" style="display:none; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
                        <h4 style="color:#ef4444; margin:0 0 .75rem 0; font-size:0.9rem; display:flex; align-items:center; gap:.4rem;">
                            <span class="material-icons-round">warning</span> Divergência Detectada — Registro Obrigatório
                        </h4>
                        
                        <div style="margin-bottom:1rem;">
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary);">DESCRIÇÃO DA DIVERGÊNCIA / AVARIA</label>
                            <textarea id="inb-div-desc" rows="2" placeholder="Descreva os detalhes da avaria ou divergência de volumes..." style="width:100%; padding:.5rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-dark); color:#fff; font-size:0.85rem; margin-top:.25rem;"></textarea>
                        </div>

                        <!-- Photo Capture -->
                        <div>
                            <label style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); display:block; margin-bottom:.4rem;">
                                REGISTRO FOTOGRÁFICO (ATÉ 4 FOTOS DE AVARIA)
                            </label>
                            <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
                                <input type="file" id="inb-photo-input" accept="image/*" capture="environment" multiple style="display:none;" onchange="window._handlePhotoUpload(event)">
                                <button class="btn btn-secondary" onclick="$('inb-photo-input').click()" style="display:flex; align-items:center; gap:.4rem; font-size:0.8rem;">
                                    <span class="material-icons-round">add_a_photo</span> Adicionar Foto
                                </button>
                                <div id="inb-photos-preview" style="display:flex; gap:.5rem;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display:flex; justify-content:space-between; align-items:center; padding-top:1rem; border-top:1px solid var(--border-color);">
                        <button class="btn btn-secondary" onclick="window._limparConferencia()">
                            Cancelar
                        </button>
                        <button class="btn btn-primary" onclick="window._confirmarRecebimentoNf()" style="padding:.75rem 1.75rem; font-size:1rem; font-weight:700; background:#10b981; border:none; display:flex; align-items:center; gap:.5rem;">
                            <span class="material-icons-round">check_circle</span> Confirmar Recebimento
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── CARD NF NÃO ENCONTRADA ──────────────────────────────────────────────
    function _renderCardNfNaoEncontrada(chave, erroMsg) {
        const container = $('inb-card-container');
        if (!container) return;

        container.innerHTML = `
            <div class="card" style="border-top:4px solid #ef4444;">
                <div class="card-body" style="padding:2rem; text-align:center;">
                    <span class="material-icons-round" style="font-size:3.5rem; color:#ef4444; margin-bottom:.5rem;">report_problem</span>
                    <h3 style="margin:0 0 .5rem 0; color:#ef4444;">Nota Fiscal Não Localizada no ERP</h3>
                    <p style="font-size:0.9rem; color:var(--text-secondary); max-width:500px; margin:0 auto 1.5rem auto;">
                        ${erroMsg || 'A chave informada não possui registro prévio de entrada ou pedido de compra no ERP Maxdata.'}
                    </p>

                    <div style="display:flex; justify-content:center; gap:1rem;">
                        <button class="btn btn-secondary" onclick="window._limparConferencia()">
                            Tentar Outra Chave
                        </button>
                        <button class="btn btn-danger" onclick="window._abrirModalPinSupervisor('${chave}')" style="display:flex; align-items:center; gap:.5rem;">
                            <span class="material-icons-round">admin_panel_settings</span> Liberar Entrada Avulsa (PIN)
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── VERIFICAÇÃO DINÂMICA DE DIVERGÊNCIA ──────────────────────────────────
    window._checarDivergenciaVolumes = function () {
        const volNf = Number($('inb-conf-vol-nf')?.textContent || 0);
        const volFisico = Number($('inb-conf-vol-fisico')?.value || 0);
        const condicao = $('inb-conf-condicao')?.value;
        const panel = $('inb-panel-divergencia');

        if (!panel) return;

        if (volNf !== volFisico || condicao !== 'Normal') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    };

    // ─── UPLOAD DE FOTOS DA AVARIA ───────────────────────────────────────────
    window._handlePhotoUpload = function (evt) {
        const files = evt.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            if (_uploadedPhotos.length >= 4) {
                if (window.showToast) showToast('Limite de 4 fotos atingido.', 'warning');
                break;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                _uploadedPhotos.push(e.target.result);
                _renderPhotosPreview();
            };
            reader.readAsDataURL(files[i]);
        }
    };

    function _renderPhotosPreview() {
        const div = $('inb-photos-preview');
        if (!div) return;
        div.innerHTML = _uploadedPhotos.map((p, idx) => `
            <div style="position:relative; width:50px; height:50px; border-radius:6px; overflow:hidden; border:1px solid var(--border-color);">
                <img src="${p}" style="width:100%; height:100%; object-fit:cover;">
                <button onclick="window._removerFoto(${idx})" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.7); color:#fff; border:none; border-radius:50%; width:16px; height:16px; font-size:10px; cursor:pointer;">×</button>
            </div>
        `).join('');
    }

    window._removerFoto = function (idx) {
        _uploadedPhotos.splice(idx, 1);
        _renderPhotosPreview();
    };

    // ─── CONFIRMAR RECEBIMENTO ───────────────────────────────────────────────
    window._confirmarRecebimentoNf = async function () {
        if (!_activeNfData) return;

        const doca = $('inb-conf-doca')?.value;
        const placa = $('inb-conf-placa')?.value;
        const motorista = $('inb-conf-motorista')?.value;
        const volFisico = Number($('inb-conf-vol-fisico')?.value || 1);
        const condicao = $('inb-conf-condicao')?.value;
        const email = $('inb-conf-email')?.value;
        const volNf = Number(_activeNfData.volumes || _activeNfData.quantidadeVolumes || 1);

        if (!doca) {
            if (window.showToast) showToast('Selecione a Doca de descarga.', 'warning');
            return;
        }

        const temDivergencia = volNf !== volFisico || condicao !== 'Normal';
        const descDiv = $('inb-div-desc')?.value || '';

        const payload = {
            recebimentoId: 'REC-' + Date.now(),
            nfNumero: _activeNfData.numero || _activeNfData.nfNumero || '—',
            nfSerie: _activeNfData.serie || '1',
            chaveNfe: _activeNfData.chaveNfe || '',
            fornecedor: _activeNfData.fornecedor || 'Desconhecido',
            doca: doca,
            placa: placa,
            motorista: motorista,
            volumesNF: volNf,
            volumesFisicos: volFisico,
            condicaoCarga: condicao,
            emailFornecedor: email,
            hasDivergencia: temDivergencia,
            divergenciaDesc: descDiv,
            fotos: _uploadedPhotos,
            operador: window.ParreiraAuth?.getSessao()?.nome || 'Operador',
            dataCheckin: new Date().toISOString()
        };

        try {
            // 1. Executa Procedure de Recebimento
            const res = await WmsProcedures.proc_confirmar_recebimento(payload);

            // 2. Se tem divergência, registra e notifica por e-mail
            if (temDivergencia) {
                await WmsProcedures.proc_registrar_divergencia({
                    tipo: condicao,
                    descricao: descDiv,
                    recebimentoId: payload.recebimentoId,
                    fotos: _uploadedPhotos
                });

                if (email) {
                    await WmsProcedures.proc_enviar_email_divergencia({
                        emailDestino: email,
                        nfNumero: payload.nfNumero,
                        fornecedor: payload.fornecedor,
                        divergencia: descDiv
                    });
                }
            }

            if (window.showToast) showToast('✅ Recebimento registrado com sucesso!', 'success');

            window._limparConferencia();
            window._switchInboundTab('historico');
        } catch (e) {
            console.error('Erro ao confirmar recebimento:', e);
            if (window.showToast) showToast('Erro ao salvar: ' + e.message, 'danger');
        }
    };

    window._limparConferencia = function () {
        _activeNfData = null;
        _uploadedPhotos = [];
        const input = $('inb-scan-chave');
        if (input) input.value = '';

        const container = $('inb-card-container');
        if (container) {
            container.innerHTML = `
                <div class="card" style="text-align:center; padding:3rem 1.5rem; color:var(--text-secondary);">
                    <span class="material-icons-round" style="font-size:3.5rem; opacity:0.3; margin-bottom:0.5rem; display:block;">inventory_2</span>
                    <h4 style="margin:0 0 .25rem 0;">Aguardando Leitura de NF-e</h4>
                    <p style="font-size:0.85rem; margin:0;">Bipe a DANFE do fornecedor para iniciar a conferência de recepção.</p>
                </div>
            `;
        }
    };

    // ─── PIN SUPERVISOR MODAL ────────────────────────────────────────────────
    window._abrirModalPinSupervisor = function (chave) {
        const modal = $('modal-inb-pin');
        if (modal) {
            modal.style.display = 'flex';
            $('pin-input').value = '';
        }
    };

    window._validarPinAutorizarEntrada = async function () {
        const pin = $('pin-input')?.value;
        const forn = $('pin-fornecedor-manual')?.value;
        const nfNum = $('pin-nf-manual')?.value;
        const vol = $('pin-vol-manual')?.value;

        if (!pin) {
            if (window.showToast) showToast('Informe o PIN de supervisor.', 'warning');
            return;
        }

        try {
            const ok = await WmsProcedures.proc_validar_pin_supervisor(pin);
            if (ok) {
                await WmsProcedures.proc_registrar_entrada_avulsa({
                    fornecedor: forn || 'Entrada Avulsa',
                    nfNumero: nfNum || 'S/N',
                    volumes: Number(vol || 1),
                    chaveNfe: _activeNfData?.chaveNfe || ''
                });

                if (window.showToast) showToast('✅ Entrada Avulsa Autorizada com sucesso!', 'success');
                $('modal-inb-pin').style.display = 'none';
                window._limparConferencia();
                window._switchInboundTab('historico');
            } else {
                if (window.showToast) showToast('❌ PIN de Supervisor incorreto.', 'danger');
            }
        } catch (e) {
            if (window.showToast) showToast('Erro de validação: ' + e.message, 'danger');
        }
    };

    // ─── LISTENER FIRESTORE (HISTÓRICO) ──────────────────────────────────────
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
        set('inb-kpi-pre-entrada', receipts.filter(r => r.status === 'AGUARDANDO_PRE_ENTRADA').length);
        set('inb-kpi-conferindo',  receipts.filter(r => r.status === 'CONFERENCIA_ITENS_PENDENTE').length);
        set('inb-kpi-divergencias',receipts.filter(r => r.status === 'FINALIZADO_COM_DIV').length);
        set('inb-kpi-ok',          receipts.filter(r => {
            if (r.status !== 'FINALIZADO' && r.status !== 'FINALIZADO_COM_DIV') return false;
            const d = r.atualizadoEm?.toDate?.() || new Date(r.conferenciaFim || 0);
            return d.toDateString() === hoje;
        }).length);
    }

    // ─── TABELA DE HISTÓRICO ──────────────────────────────────────────────────
    function _renderTable(receipts) {
        const body = $('inb-lista-body');
        if (!body) return;

        if (!receipts || receipts.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-secondary);">Nenhum recebimento registrado. O Coletor ou a tela de Scanner alimentará esta lista.</td></tr>';
            return;
        }

        body.innerHTML = receipts.map(r => {
            const st       = _badge(r);
            const dtStr    = WmsStore.fmtData(r.criadoEm || r.dataCheckin);
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

    function _badge(r) {
        const map = {
            'AGUARDANDO_PRE_ENTRADA':    { label: 'AGU. PRÉ-ENTRADA',  bg: 'rgba(249,115,22,.15)', color: '#f97316' },
            'AGUARDANDO_CONFERENCIA':    { label: 'CHECK-IN',           bg: 'rgba(236,72,153,.15)', color: '#ec4899' },
            'CONFERENCIA_ITENS_PENDENTE':{ label: 'CONFERINDO',         bg: 'rgba(245,158,11,.15)', color: '#f59e0b' },
            'FINALIZADO':                { label: 'FINALIZADO',         bg: 'rgba(16,185,129,.15)', color: '#10b981' },
            'FINALIZADO_COM_DIV':        { label: 'DIVERGÊNCIA',        bg: 'rgba(239,68,68,.15)',  color: '#ef4444' },
            'CANCELADO':                 { label: 'CANCELADO',          bg: 'rgba(100,100,100,.15)',color: '#aaa'    },
        };
        return map[r.status] || { label: r.status || '?', bg: 'rgba(100,100,100,.15)', color: '#aaa' };
    }

    // Modal de Detalhes
    window.inbVerDetalhe = function (id) {
        const r = _cache.find(x => x.id === id);
        if (!r) return;

        const badge = _badge(r);
        $('modal-inb-detalhe-body').innerHTML = `
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-color);">
                <span style="background:${badge.bg};color:${badge.color};padding:.25rem .65rem;border-radius:6px;font-size:.72rem;font-weight:700;">${badge.label}</span>
                <span style="font-size:.8rem;color:var(--text-secondary);">NF ${r.nfNumero || '—'} · ${r.fornecedor || '—'}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:.85rem 2rem; font-size:0.85rem; margin-bottom:1rem;">
                <div><div style="font-size:.7rem;color:var(--text-secondary);">ID</div><div style="font-weight:600;">${r.id}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">DATA CHECK-IN</div><div style="font-weight:600;">${WmsStore.fmtData(r.criadoEm || r.dataCheckin)}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">NF / SÉRIE</div><div style="font-weight:600;">${r.nfNumero||'—'} / ${r.nfSerie||'—'}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">FORNECEDOR</div><div style="font-weight:600;">${r.fornecedor||'—'}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">DOCA</div><div style="font-weight:600;">${r.doca||'—'}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">PLACA / MOTORISTA</div><div style="font-weight:600;">${r.placa||'—'} (${r.motorista||'—'})</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">VOLUMES (NF / FÍSICO)</div><div style="font-weight:600;">${r.volumesNF||'?'} / ${r.volumesFisicos||'?'}</div></div>
                <div><div style="font-size:.7rem;color:var(--text-secondary);">OPERADOR</div><div style="font-weight:600;">${r.operadorNome||r.operadorLogin||'—'}</div></div>
            </div>
        `;

        $('modal-inb-detalhe').style.display = 'flex';
    };

})();

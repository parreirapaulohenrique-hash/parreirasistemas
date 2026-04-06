// =============================================================================
// WMS Inbound — Recebimento de NF via Integração Multi-ERP
// Versão: 2.0.0 | WMS v1.7.0
// REESCRITA COMPLETA — não há compatibilidade com inbound.js v1.x
//
// Fluxo: Scanner NF-e → Validação ERP → Card de Conferência → Push ERP
// =============================================================================

(function () {
    'use strict';

    // ─── STATE ──────────────────────────────────────────────────────────────
    const state = {
        etapa: 'scanner',       // 'scanner' | 'conferencia'
        nfDados: null,          // NF normalizada vinda do ERP
        empresaSelecionada: null,
        isAvulsa: false,
        recAtivo: null          // Receipt sendo editado
    };

    function ts() { return window.getTenantSuffix ? window.getTenantSuffix() : ''; }
    function $(id) { return document.getElementById(id); }

    // ─── ENTRY POINT ────────────────────────────────────────────────────────
    window.loadInboundView = function () {
        const container = $('view-inbound');
        container.innerHTML = _htmlShell();
        _renderListaRecebimentos();
        _bindScannerEvents();
    };

    // ─── HTML SHELL ─────────────────────────────────────────────────────────
    function _htmlShell() {
        return `
        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.25rem;">
            ${_kpi('inb-kpi-aguardando','Aguardando','hourglass_empty','#0ea5e9')}
            ${_kpi('inb-kpi-conferencia','Em Conferência','fact_check','#f59e0b')}
            ${_kpi('inb-kpi-avulsa','Avulsas Hoje','warning','#ef4444')}
            ${_kpi('inb-kpi-ok','Finalizados Hoje','check_circle','#10b981')}
        </div>

        <!-- Scanner Panel -->
        <div class="card" id="inb-scanner-panel" style="margin-bottom:1.25rem;">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3><span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;">qr_code_scanner</span>Receber Nova NF</h3>
                <div style="display:flex;gap:.5rem;align-items:center;">
                    <span id="inb-erp-badge" style="font-size:.7rem;padding:.2rem .6rem;border-radius:20px;background:rgba(16,185,129,.15);color:#10b981;font-weight:600;">⬤ ERP</span>
                </div>
            </div>
            <div class="card-body" style="padding:1.5rem;">
                <!-- Tabs -->
                <div style="display:flex;gap:0;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;width:fit-content;margin-bottom:1.25rem;">
                    <button id="tab-chave" onclick="inbSwitchTab('chave')"
                        style="padding:.45rem 1.1rem;border:none;background:var(--primary-color);color:#fff;font-size:.8rem;cursor:pointer;font-weight:600;">
                        Chave NF-e (44 dígitos)
                    </button>
                    <button id="tab-numero" onclick="inbSwitchTab('numero')"
                        style="padding:.45rem 1.1rem;border:none;background:var(--bg-dark);color:var(--text-secondary);font-size:.8rem;cursor:pointer;">
                        Número + Série
                    </button>
                </div>

                <!-- Chave 44 -->
                <div id="inb-tab-chave">
                    <div style="display:flex;gap:.75rem;align-items:flex-end;">
                        <div style="flex:1;">
                            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">
                                Chave de Acesso NF-e — bipe o código ou digite os 44 dígitos
                            </label>
                            <input id="inb-chave-input" type="text" class="form-input" maxlength="47"
                                placeholder="00000 00000 00000 00000 00000 00000 00000 00000 0000"
                                style="font-family:monospace;font-size:.95rem;letter-spacing:.05em;"
                                oninput="inbMascaraChave(this)" onkeydown="if(event.key==='Enter')inbConsultar()">
                        </div>
                        <button class="btn btn-primary" onclick="inbConsultar()" id="inb-btn-consultar"
                            style="white-space:nowrap;min-width:130px;">
                            <span class="material-icons-round" style="font-size:1rem;">search</span> Consultar
                        </button>
                    </div>
                </div>

                <!-- Número + Série -->
                <div id="inb-tab-numero" style="display:none;">
                    <div style="display:flex;gap:.75rem;align-items:flex-end;">
                        <div style="flex:2;">
                            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">Número da NF</label>
                            <input id="inb-numero-input" type="text" class="form-input" placeholder="Ex: 1234"
                                onkeydown="if(event.key==='Enter')inbConsultarPorNum()">
                        </div>
                        <div style="flex:.5;">
                            <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">Série</label>
                            <input id="inb-serie-input" type="text" class="form-input" value="1" maxlength="3">
                        </div>
                        <button class="btn btn-primary" onclick="inbConsultarPorNum()"
                            style="white-space:nowrap;min-width:130px;">
                            <span class="material-icons-round" style="font-size:1rem;">search</span> Consultar
                        </button>
                    </div>
                </div>

                <!-- Feedback -->
                <div id="inb-feedback" style="margin-top:1rem;display:none;"></div>
            </div>
        </div>

        <!-- Card de Conferência (oculto inicialmente) -->
        <div id="inb-conferencia-panel" style="display:none;margin-bottom:1.25rem;"></div>

        <!-- Lista de Recebimentos -->
        <div class="card">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3>Histórico de Recebimentos</h3>
                <button class="btn btn-secondary" onclick="_renderListaRecebimentos()" style="padding:.35rem .75rem;">
                    <span class="material-icons-round" style="font-size:1rem;">refresh</span>
                </button>
            </div>
            <div class="card-body" style="padding:0;">
                <div style="max-height:45vh;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:.8rem;">
                        <thead style="position:sticky;top:0;background:var(--bg-card);z-index:1;">
                            <tr>
                                <th style="padding:.6rem;text-align:left;border-bottom:1px solid var(--border-color);">NF</th>
                                <th style="padding:.6rem;text-align:left;border-bottom:1px solid var(--border-color);">Fornecedor</th>
                                <th style="padding:.6rem;text-align:center;border-bottom:1px solid var(--border-color);">Empresa Dest.</th>
                                <th style="padding:.6rem;text-align:center;border-bottom:1px solid var(--border-color);">Volumes</th>
                                <th style="padding:.6rem;text-align:center;border-bottom:1px solid var(--border-color);">Data</th>
                                <th style="padding:.6rem;text-align:center;border-bottom:1px solid var(--border-color);">Status</th>
                                <th style="padding:.6rem;text-align:center;border-bottom:1px solid var(--border-color);">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="inb-tabela-body">
                            <tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhum recebimento registrado.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Modal PIN Supervisor -->
        <div id="modal-pin-supervisor" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.85);z-index:2000;align-items:center;justify-content:center;">
            <div class="card" style="width:360px;box-shadow:0 20px 50px rgba(0,0,0,.6);">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #f59e0b;">
                    <h3 style="color:#f59e0b;font-size:1rem;">
                        <span class="material-icons-round" style="vertical-align:middle;margin-right:.3rem;">lock</span>
                        Autorização de Supervisor
                    </h3>
                    <span class="material-icons-round" style="cursor:pointer;color:var(--text-secondary);" onclick="inbFecharPinModal()">close</span>
                </div>
                <div class="card-body" style="padding:1.5rem;text-align:center;">
                    <p style="font-size:.85rem;color:var(--text-secondary);margin-bottom:1.25rem;">
                        NF não localizada no ERP. Para autorizar entrada avulsa, insira o PIN de supervisor.
                    </p>
                    <div id="inb-pin-display" style="font-size:2rem;letter-spacing:.6rem;font-weight:700;
                        font-family:monospace;min-height:2.5rem;margin-bottom:1rem;color:var(--primary-color);">
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;max-width:220px;margin:0 auto 1rem;">
                        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => `
                            <button onclick="inbPinTecla('${n}')"
                                style="padding:.85rem;border:1px solid var(--border-color);border-radius:8px;
                                background:var(--bg-dark);color:var(--text-primary);font-size:1.1rem;
                                cursor:pointer;font-weight:600;${n===''?'visibility:hidden;':''}
                                transition:background .15s;"
                                onmousedown="this.style.background='var(--primary-color)'"
                                onmouseup="this.style.background='var(--bg-dark)'">
                                ${n}
                            </button>
                        `).join('')}
                    </div>
                    <div id="inb-pin-erro" style="color:#ef4444;font-size:.8rem;min-height:1.2rem;margin-bottom:.5rem;"></div>
                    <div style="display:flex;gap:.5rem;">
                        <button class="btn btn-secondary" onclick="inbFecharPinModal()" style="flex:1;">Cancelar</button>
                        <button class="btn btn-primary" onclick="inbValidarPin()" style="flex:1;">Confirmar</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal Detalhes -->
        <div id="modal-inb-detalhe" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.8);z-index:2000;align-items:center;justify-content:center;">
            <div class="card" style="width:640px;max-height:85vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.6);">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h3>Detalhes do Recebimento</h3>
                    <span class="material-icons-round" style="cursor:pointer;color:var(--text-secondary);"
                        onclick="document.getElementById('modal-inb-detalhe').style.display='none'">close</span>
                </div>
                <div id="modal-inb-detalhe-body" class="card-body" style="padding:1.25rem;"></div>
            </div>
        </div>`;
    }

    function _kpi(id, label, icon, color) {
        return `<div class="card" style="border-left:3px solid ${color};">
            <div class="card-body" style="padding:.75rem;display:flex;align-items:center;gap:.75rem;">
                <span class="material-icons-round" style="color:${color};font-size:1.6rem;">${icon}</span>
                <div>
                    <div style="font-size:.7rem;color:var(--text-secondary);">${label}</div>
                    <div id="${id}" style="font-size:1.6rem;font-weight:700;color:${color};">0</div>
                </div>
            </div>
        </div>`;
    }

    // ─── TABS ───────────────────────────────────────────────────────────────
    window.inbSwitchTab = function (tab) {
        $('inb-tab-chave').style.display = tab === 'chave' ? 'block' : 'none';
        $('inb-tab-numero').style.display = tab === 'numero' ? 'block' : 'none';
        $('tab-chave').style.background = tab === 'chave' ? 'var(--primary-color)' : 'var(--bg-dark)';
        $('tab-chave').style.color = tab === 'chave' ? '#fff' : 'var(--text-secondary)';
        $('tab-numero').style.background = tab === 'numero' ? 'var(--primary-color)' : 'var(--bg-dark)';
        $('tab-numero').style.color = tab === 'numero' ? '#fff' : 'var(--text-secondary)';
    };

    // ─── MÁSCARA CHAVE ACESSO ────────────────────────────────────────────────
    window.inbMascaraChave = function (el) {
        let v = el.value.replace(/\D/g, '').substring(0, 44);
        el.value = v.replace(/(\d{5})(?=\d)/g, '$1 ').trim();
        // Auto-consulta quando atinge 44 dígitos
        if (v.length === 44) setTimeout(() => inbConsultar(), 200);
    };

    // ─── CONSULTA POR CHAVE ──────────────────────────────────────────────────
    window.inbConsultar = async function () {
        const rawVal = ($('inb-chave-input').value || '').replace(/\D/g, '');
        if (rawVal.length < 44) {
            _feedback('warning', 'Digite os 44 dígitos da chave de acesso NF-e.');
            return;
        }
        await _executarConsulta(() => WmsProcedures.proc_buscar_nf_destinada(rawVal));
    };

    // ─── CONSULTA POR NÚMERO ─────────────────────────────────────────────────
    window.inbConsultarPorNum = async function () {
        const num = ($('inb-numero-input').value || '').trim();
        const serie = ($('inb-serie-input').value || '1').trim();
        if (!num) { _feedback('warning', 'Digite o número da NF.'); return; }
        await _executarConsulta(() => WmsProcedures.proc_buscar_nf_por_numero(num, serie));
    };

    async function _executarConsulta(fn) {
        _feedback('loading', 'Consultando ERP...');
        _setLoading(true);
        try {
            const result = await fn();
            _setLoading(false);

            if (result.found) {
                _feedback('ok', `NF ${result.nf.numero} localizada — ${result.nf.razaoSocialEmitente}`);

                // Multi-CNPJ: mais de uma empresa match?
                if (result.empresas && result.empresas.length > 1) {
                    _mostrarSeletorEmpresa(result.nf, result.empresas);
                } else {
                    state.nfDados = result.nf;
                    state.empresaSelecionada = result.empresa;
                    state.isAvulsa = false;
                    _renderConferenciaCard();
                }
            } else {
                const msg = result.error
                    ? `Erro ao consultar ERP: ${result.error}`
                    : 'NF não localizada na fila de pedidos destinados deste CNPJ.';
                _feedback('error', msg);
                _mostrarOpcaoRecusa();
            }
        } catch (err) {
            _setLoading(false);
            _feedback('error', `Falha na consulta: ${err.message}`);
        }
    }

    function _mostrarOpcaoRecusa() {
        const fb = $('inb-feedback');
        fb.insertAdjacentHTML('beforeend', `
            <div style="margin-top:.75rem;display:flex;gap:.75rem;flex-wrap:wrap;">
                <button class="btn btn-secondary" onclick="inbRecusarNF()" style="border-color:#ef4444;color:#ef4444;">
                    <span class="material-icons-round" style="font-size:1rem;">block</span> Recusar Recebimento
                </button>
                <button class="btn btn-secondary" onclick="inbAbrirPinModal()" style="border-color:#f59e0b;color:#f59e0b;">
                    <span class="material-icons-round" style="font-size:1rem;">lock_open</span> Entrada Avulsa (PIN Supervisor)
                </button>
            </div>`);
    }

    function _mostrarSeletorEmpresa(nf, empresas) {
        _feedback('info',
            `<strong>NF encontrada em ${empresas.length} CNPJs.</strong> Selecione a empresa destinatária:<br>
             <div style="display:flex;flex-direction:column;gap:.35rem;margin-top:.5rem;">
              ${empresas.map((e, i) => `
                <button onclick="inbSelecionarEmpresa(${i})" class="btn btn-secondary" style="text-align:left;font-size:.82rem;" id="emp-btn-${i}">
                  <strong>${e.razaoSocial}</strong> — ${e.cnpj}
                </button>`).join('')}
             </div>`);
        window._inbEmpresasMulti = { nf, empresas };
    }

    window.inbSelecionarEmpresa = function (idx) {
        const { nf, empresas } = window._inbEmpresasMulti;
        state.nfDados = nf;
        state.empresaSelecionada = empresas[idx];
        state.isAvulsa = false;
        _renderConferenciaCard();
    };

    // ─── RECUSAR NF ─────────────────────────────────────────────────────────
    window.inbRecusarNF = function () {
        const motivo = prompt('Informe o motivo da recusa (ex: NF não esperada, fornecedor errado):');
        if (!motivo) return;
        const key = 'wms_recusas' + ts();
        const recusas = JSON.parse(localStorage.getItem(key) || '[]');
        recusas.unshift({
            id: `REC-REC-${Date.now()}`,
            motivo,
            operador: (JSON.parse(localStorage.getItem('logged_user') || '{}')).name || 'Op.',
            registradoEm: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(recusas));
        _feedback('ok', `Recusa registrada. Motivo: "${motivo}". Notifique a portaria.`);
    };

    // ─── PIN MODAL ───────────────────────────────────────────────────────────
    let _pinBuffer = '';

    window.inbAbrirPinModal = function () {
        _pinBuffer = '';
        $('inb-pin-display').textContent = '';
        $('inb-pin-erro').textContent = '';
        $('modal-pin-supervisor').style.display = 'flex';
        // Entrada manual via teclado também
        document.onkeydown = (e) => {
            if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Enter') return;
            if ($('modal-pin-supervisor').style.display !== 'flex') return;
            if (e.key === 'Enter') inbValidarPin();
            else inbPinTecla(e.key === 'Backspace' ? '⌫' : e.key);
        };
    };

    window.inbFecharPinModal = function () {
        $('modal-pin-supervisor').style.display = 'none';
        document.onkeydown = null;
    };

    window.inbPinTecla = function (tecla) {
        if (tecla === '⌫') {
            _pinBuffer = _pinBuffer.slice(0, -1);
        } else if (_pinBuffer.length < 6) {
            _pinBuffer += tecla;
        }
        $('inb-pin-display').textContent = '●'.repeat(_pinBuffer.length);
        $('inb-pin-erro').textContent = '';
    };

    window.inbValidarPin = async function () {
        if (!_pinBuffer) { $('inb-pin-erro').textContent = 'Digite o PIN.'; return; }
        const ok = await WmsProcedures.proc_validar_pin_supervisor(_pinBuffer);
        if (ok.valid) {
            inbFecharPinModal();
            // Abre card avulso (sem dados do ERP)
            state.nfDados = null;
            state.empresaSelecionada = null;
            state.isAvulsa = true;
            _renderConferenciaCard();
            _feedback('warning', '⚠️ Entrada avulsa autorizada via PIN. Preencha os dados manualmente.');
        } else {
            _pinBuffer = '';
            $('inb-pin-display').textContent = '';
            $('inb-pin-erro').textContent = ok.message;
        }
    };

    // ─── CARD DE CONFERÊNCIA ─────────────────────────────────────────────────
    function _renderConferenciaCard() {
        const nf = state.nfDados;
        const emp = state.empresaSelecionada;
        const avulsa = state.isAvulsa;

        const panel = $('inb-conferencia-panel');
        panel.style.display = 'block';

        const rodape_avulsa = avulsa
            ? `<div style="background:rgba(245,158,11,.12);border:1px solid #f59e0b;border-radius:6px;
                   padding:.6rem .9rem;font-size:.8rem;color:#f59e0b;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;">
                   <span class="material-icons-round" style="font-size:1.1rem;">warning</span>
                   Entrada Avulsa — NF não localizada no ERP. Preencha todos os campos manualmente.
               </div>` : '';

        const secaoERP = !avulsa ? `
        <div style="background:var(--bg-dark);border-radius:8px;padding:1rem;margin-bottom:1.25rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                letter-spacing:.08em;margin-bottom:.75rem;display:flex;align-items:center;gap:.4rem;">
                <span class="material-icons-round" style="font-size:.9rem;color:#10b981;">verified</span>
                Dados vindos do ERP (somente leitura)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem 1.5rem;font-size:.82rem;">
                ${_campo_ro('NF / Série', `${nf.numero} / ${nf.serie}`)}
                ${_campo_ro('Data Emissão', _fmtData(nf.dataEmissao))}
                ${_campo_ro('Fornecedor', nf.razaoSocialEmitente)}
                ${_campo_ro('CNPJ Emitente', nf.cnpjEmitente)}
                ${_campo_ro('Empresa Destinatária', emp ? emp.razaoSocial : '—')}
                ${_campo_ro('CNPJ Destinatário', nf.cnpjDestinatario)}
                ${_campo_ro('Valor Total NF', `R$ ${Number(nf.valorTotal).toLocaleString('pt-BR',{minimumFractionDigits:2})}`)}
                ${_campo_ro('Pedido de Compra', nf.pedidoCompra || '—')}
                ${_campo_ro('Transportadora (NF)', nf.transportadora || '—')}
                ${_campo_ro('Volumes declarados NF', nf.volumes != null ? nf.volumes : '—')}
            </div>
            ${nf.chaveNfe ? `<div style="margin-top:.6rem;font-size:.7rem;color:var(--text-secondary);font-family:monospace;word-break:break-all;">
                Chave: ${nf.chaveNfe}</div>` : ''}
        </div>

        <!-- Itens da NF -->
        <div style="margin-bottom:1.25rem;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                letter-spacing:.08em;margin-bottom:.5rem;">Itens da NF (${nf.itens.length} SKU${nf.itens.length!==1?'s':''})</div>
            <div style="max-height:160px;overflow:auto;border:1px solid var(--border-color);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                    <thead style="position:sticky;top:0;background:var(--bg-card);">
                        <tr>
                            <th style="padding:.4rem .6rem;text-align:left;border-bottom:1px solid var(--border-color);">SKU</th>
                            <th style="padding:.4rem .6rem;text-align:left;border-bottom:1px solid var(--border-color);">Descrição</th>
                            <th style="padding:.4rem;text-align:center;border-bottom:1px solid var(--border-color);">Qtd</th>
                            <th style="padding:.4rem;text-align:center;border-bottom:1px solid var(--border-color);">Un</th>
                            <th style="padding:.4rem;text-align:right;border-bottom:1px solid var(--border-color);">Vl. Unit.</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${nf.itens.map(i => `<tr style="border-bottom:1px solid var(--border-color);">
                            <td style="padding:.35rem .6rem;font-family:monospace;">${i.sku}</td>
                            <td style="padding:.35rem .6rem;">${i.descricao}</td>
                            <td style="padding:.35rem;text-align:center;">${i.quantidade}</td>
                            <td style="padding:.35rem;text-align:center;">${i.unidade}</td>
                            <td style="padding:.35rem;text-align:right;">R$${Number(i.valorUnitario).toFixed(2)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : '';

        panel.innerHTML = `
        <div class="card" style="border-top:3px solid ${avulsa ? '#f59e0b' : 'var(--primary-color)'};">
            <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3>
                    <span class="material-icons-round" style="vertical-align:middle;margin-right:.4rem;color:${avulsa?'#f59e0b':'var(--primary-color)'};">
                        ${avulsa ? 'edit_note' : 'fact_check'}
                    </span>
                    ${avulsa ? 'Entrada Avulsa (Manual)' : `Conferência de Recebimento — NF ${nf.numero}`}
                </h3>
                <button class="btn btn-secondary" onclick="inbCancelarConferencia()" style="padding:.35rem .7rem;font-size:.8rem;">
                    <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span> Voltar
                </button>
            </div>
            <div class="card-body" style="padding:1.25rem;">
                ${rodape_avulsa}
                ${secaoERP}

                <!-- Seção Manual -->
                <div style="font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                    letter-spacing:.08em;margin-bottom:.75rem;display:flex;align-items:center;gap:.4rem;">
                    <span class="material-icons-round" style="font-size:.9rem;color:#f59e0b;">edit</span>
                    Dados da Conferência Física (preenchimento pelo operador)
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem 1.25rem;">
                    ${avulsa ? `
                    <div>
                        <label class="form-label">Número da NF *</label>
                        <input id="conf-nf-num" type="text" class="form-input" placeholder="Ex: 12345">
                    </div>
                    <div>
                        <label class="form-label">CNPJ / Razão Social do Fornecedor *</label>
                        <input id="conf-fornecedor" type="text" class="form-input" placeholder="Nome do fornecedor">
                    </div>` : ''}
                    <div>
                        <label class="form-label">Doca de Recebimento *</label>
                        <select id="conf-doca" class="form-input">${_docasOptions()}</select>
                    </div>
                    <div>
                        <label class="form-label">Tipo de Entrada</label>
                        <select id="conf-tipo" class="form-input">
                            <option value="COMPRA">Compra</option>
                            <option value="DEVOLUCAO">Devolução de Cliente</option>
                            <option value="TRANSFERENCIA">Transferência entre filiais</option>
                            <option value="BONIFICACAO">Bonificação / Brinde</option>
                            <option value="CONSIGNACAO">Consignação</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">Placa do Veículo</label>
                        <input id="conf-placa" type="text" class="form-input" placeholder="AAA-0000 ou AAA0A00"
                            oninput="this.value=this.value.toUpperCase()">
                    </div>
                    <div>
                        <label class="form-label">Nome do Motorista / Entregador</label>
                        <input id="conf-motorista" type="text" class="form-input" placeholder="Nome completo">
                    </div>
                    <div>
                        <label class="form-label">Volumes declarados na NF</label>
                        <input id="conf-vol-nf" type="number" class="form-input" min="0"
                            value="${!avulsa && nf.volumes != null ? nf.volumes : ''}">
                    </div>
                    <div>
                        <label class="form-label">Volumes físicos recebidos *</label>
                        <input id="conf-vol-fisico" type="number" class="form-input" min="0"
                            oninput="inbAtualizarDivergencia()">
                    </div>
                    <div style="grid-column:1/-1;">
                        <label class="form-label">Condição da Carga *</label>
                        <select id="conf-condicao" class="form-input" onchange="inbToggleDivergencia()">
                            <option value="OK">✅ OK — Carga íntegra, volumes conferem</option>
                            <option value="FALTA">⚠️ Falta de Volumes</option>
                            <option value="AVARIA_PARCIAL">⚠️ Avaria Parcial</option>
                            <option value="AVARIA_TOTAL">🚨 Avaria Total</option>
                            <option value="EXCESSO">📦 Excesso de Volumes</option>
                            <option value="LACRE_ROMPIDO">🔓 Lacre Rompido</option>
                            <option value="MISTO">⚠️ Múltiplas Ocorrências</option>
                        </select>
                    </div>
                </div>

                <!-- Email fornecedor -->
                <div style="margin-top:.75rem;display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                    <div style="grid-column:1/-1;">
                        <label class="form-label">E-mail do Fornecedor
                            <span style="font-size:.7rem;font-weight:400;color:var(--text-secondary);"> — para envio automático do relatório de divergência</span>
                        </label>
                        <input id="conf-email-fornecedor" type="email" class="form-input"
                            placeholder="contato@fornecedor.com.br"
                            value="">
                    </div>
                </div>

                <!-- Bloco de Divergência (visível quando condição ≠ OK) -->
                <div id="conf-div-bloco" style="display:none;margin-top:1rem;padding:1rem;
                    background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;">
                    <div style="font-size:.75rem;font-weight:700;color:#f59e0b;margin-bottom:.75rem;
                        text-transform:uppercase;letter-spacing:.05em;">Detalhes da Divergência</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;">
                        <div>
                            <label class="form-label">Volumes avariados</label>
                            <input id="conf-vol-avariados" type="number" class="form-input" min="0" value="0">
                        </div>
                        <div>
                            <label class="form-label">Volumes faltantes</label>
                            <input id="conf-vol-faltantes" type="number" class="form-input" min="0" value="0">
                        </div>
                        <div>
                            <label class="form-label">Volumes em excesso</label>
                            <input id="conf-vol-excesso" type="number" class="form-input" min="0" value="0">
                        </div>
                        <div style="grid-column:1/-1;">
                            <label class="form-label">Descrição da divergência (para o setor de Compras e Fornecedor)</label>
                            <textarea id="conf-div-descricao" class="form-input" rows="2"
                                placeholder="Descreva a avaria ou divergência com detalhes..."></textarea>
                        </div>
                        <div style="grid-column:1/-1;">
                            <label class="form-label">Fotos da ocorrência
                                <span style="font-size:.7rem;font-weight:400;color:var(--text-secondary);"> — máx. 4 fotos, serão anexadas ao relatório</span>
                            </label>
                            <div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.3rem;">
                                <label for="conf-fotos-input" style="cursor:pointer;display:flex;align-items:center;
                                    gap:.4rem;padding:.45rem .85rem;border:1px dashed var(--primary-color);
                                    border-radius:6px;font-size:.82rem;color:var(--primary-color);
                                    background:rgba(14,165,233,.05);">
                                    <span class="material-icons-round" style="font-size:1rem;">add_a_photo</span>
                                    Adicionar foto
                                </label>
                                <input id="conf-fotos-input" type="file" accept="image/*" capture="environment"
                                    multiple style="display:none;" onchange="inbAdicionarFotos(this)">
                                <div id="conf-fotos-preview" style="display:flex;flex-wrap:wrap;gap:.4rem;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top:1rem;">
                    <label class="form-label">Observações gerais</label>
                    <textarea id="conf-obs" class="form-input" rows="2"
                        placeholder="Informações adicionais relevantes para o recebimento..."></textarea>
                </div>

                <div id="conf-alerta-vol" style="display:none;margin-top:.5rem;font-size:.8rem;padding:.4rem .7rem;border-radius:6px;"></div>

                <div style="margin-top:1.25rem;display:flex;justify-content:flex-end;gap:.75rem;">
                    <button class="btn btn-secondary" onclick="inbCancelarConferencia()">Cancelar</button>
                    <button class="btn btn-primary" id="btn-confirmar-rec" onclick="inbConfirmarRecebimento()"
                        style="min-width:200px;">
                        <span class="material-icons-round" style="font-size:1rem;">check_circle</span>
                        Confirmar Recebimento
                    </button>
                </div>
            </div>
        </div>`;

        // Scroll para o card
        panel.scrollIntoView({ behavior: 'smooth' });
        // Focus no primeiro campo editável
        const fc = avulsa ? $('conf-nf-num') : $('conf-doca');
        if (fc) setTimeout(() => fc.focus(), 300);
    }

    function _campo_ro(label, value) {
        return `<div>
            <div style="font-size:.7rem;color:var(--text-secondary);">${label}</div>
            <div style="font-weight:600;font-size:.85rem;">${value || '—'}</div>
        </div>`;
    }

    function _docasOptions() {
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
        const docas = wmsConfig.docas || ['DOCA-01', 'DOCA-02', 'DOCA-03'];
        return docas.map(d => `<option value="${d}">${d.replace('-', ' ')}</option>`).join('');
    }

    // ─── DIVERGÊNCIA UI ──────────────────────────────────────────────────────
    window.inbToggleDivergencia = function () {
        const cond = $('conf-condicao').value;
        $('conf-div-bloco').style.display = (cond !== 'OK') ? 'block' : 'none';
    };

    window.inbAtualizarDivergencia = function () {
        const volNF = parseInt($('conf-vol-nf').value) || 0;
        const volFis = parseInt($('conf-vol-fisico').value) || 0;
        const alerta = $('conf-alerta-vol');
        if (volNF > 0 && volFis !== volNF) {
            const diff = volFis - volNF;
            alerta.style.display = 'block';
            if (diff < 0) {
                alerta.style.background = 'rgba(239,68,68,.1)';
                alerta.style.color = '#ef4444';
                alerta.textContent = `⚠️ Faltam ${Math.abs(diff)} volume(s) em relação à NF.`;
                $('conf-condicao').value = 'FALTA';
            } else {
                alerta.style.background = 'rgba(245,158,11,.1)';
                alerta.style.color = '#f59e0b';
                alerta.textContent = `⚠️ Excesso de ${diff} volume(s) em relação à NF.`;
                $('conf-condicao').value = 'EXCESSO';
            }
            $('conf-div-bloco').style.display = 'block';
        } else {
            alerta.style.display = 'none';
        }
    };

    // ─── CANCELAR ────────────────────────────────────────────────────────────
    window.inbCancelarConferencia = function () {
        $('inb-conferencia-panel').style.display = 'none';
        $('inb-conferencia-panel').innerHTML = '';
        $('inb-feedback').style.display = 'none';
        if ($('inb-chave-input')) $('inb-chave-input').value = '';
        if ($('inb-numero-input')) $('inb-numero-input').value = '';
        state.nfDados = null;
        state.empresaSelecionada = null;
        state.isAvulsa = false;
    };

    // ─── CONFIRMAR RECEBIMENTO ───────────────────────────────────────────────
    window.inbConfirmarRecebimento = async function () {
        const avulsa = state.isAvulsa;
        const nf = state.nfDados;

        // Validações
        const doca = $('conf-doca').value;
        const volFis = parseInt($('conf-vol-fisico').value);
        const condicao = $('conf-condicao').value;

        if (!doca) { _showError('Selecione a doca.'); return; }
        if (isNaN(volFis) || volFis < 0) { _showError('Informe a quantidade de volumes físicos recebidos.'); return; }

        if (avulsa) {
            const nfNum = ($('conf-nf-num').value || '').trim();
            const forn = ($('conf-fornecedor').value || '').trim();
            if (!nfNum) { _showError('Informe o número da NF.'); return; }
            if (!forn) { _showError('Informe o fornecedor.'); return; }
        }

        const user = JSON.parse(localStorage.getItem('logged_user') || '{}');
        const condicaoCond = $('conf-condicao').value;
        const hasDivergencia = condicaoCond !== 'OK';

        // Coleta fotos como base64
        const fotosB64 = window._inbFotosBuffer || [];

        // Monta payload
        const payload = {
            id: `REC2-${Date.now()}`,
            chaveNfe:       avulsa ? '' : (nf.chaveNfe || ''),
            nfNumero:       avulsa ? $('conf-nf-num').value.trim() : nf.numero,
            nfSerie:        avulsa ? '1' : nf.serie,
            fornecedor:     avulsa ? $('conf-fornecedor').value.trim() : nf.razaoSocialEmitente,
            cnpjFornecedor: avulsa ? '' : nf.cnpjEmitente,
            empresaDestino: state.empresaSelecionada ? state.empresaSelecionada.razaoSocial : '',
            cnpjDestino:    state.empresaSelecionada ? state.empresaSelecionada.cnpj : (avulsa ? '' : nf.cnpjDestinatario),
            pedidoCompra:   avulsa ? '' : (nf.pedidoCompra || ''),
            valorTotalNF:   avulsa ? 0 : (nf.valorTotal || 0),
            transportadora: avulsa ? '' : (nf.transportadora || ''),
            doca,
            tipo:           $('conf-tipo').value,
            placa:          $('conf-placa').value.trim(),
            motorista:      $('conf-motorista').value.trim(),
            volumesNF:      parseInt($('conf-vol-nf').value) || 0,
            volumesFisicos: volFis,
            condicaoCarga:  condicao,
            observacoes:    $('conf-obs').value.trim(),
            itens:          avulsa ? [] : nf.itens,
            entradaAvulsa:  avulsa,
            status:         'AGUARDANDO_PUTAWAY',
            operador:       user.name || user.login || 'Operador',
            dataConferencia: new Date().toISOString(),
            emailFornecedor: ($('conf-email-fornecedor')?.value || '').trim(),
            divergencia:    hasDivergencia ? {
                tipo:             condicao,
                volumesAvariados: parseInt($('conf-vol-avariados')?.value) || 0,
                volumesFaltantes: parseInt($('conf-vol-faltantes')?.value) || 0,
                volumesExcesso:   parseInt($('conf-vol-excesso')?.value) || 0,
                descricao:        $('conf-div-descricao')?.value.trim() || '',
                fotos:            fotosB64
            } : null
        };

        // Desabilita botão durante push
        const btn = $('btn-confirmar-rec');
        if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

        try {
            // 1. Confirma recebimento no ERP
            const resConf = await WmsProcedures.proc_confirmar_recebimento(payload);

            // 2. Se houver divergência, notifica ERP e envia email ao fornecedor
            if (hasDivergencia && payload.divergencia) {
                const divPayload = {
                    recId: payload.id,
                    nfNumero: payload.nfNumero,
                    chaveNfe: payload.chaveNfe,
                    fornecedor: payload.fornecedor,
                    emailFornecedor: payload.emailFornecedor,
                    ...payload.divergencia,
                    operador: payload.operador,
                    dataOcorrencia: payload.dataConferencia
                };
                await WmsProcedures.proc_registrar_divergencia(divPayload);
                // Envia relatório de divergência por email ao fornecedor
                if (payload.emailFornecedor) {
                    await WmsProcedures.proc_enviar_email_divergencia(divPayload);
                }
            }

            // 3. Se avulsa, registra na auditoria
            if (avulsa) {
                await WmsProcedures.proc_registrar_entrada_avulsa(payload, {
                    timestamp: new Date().toISOString()
                });
            }

            // Fecha card e atualiza
            inbCancelarConferencia();
            _renderListaRecebimentos();
            _atualizarKPIs();

            // Feedback final
            const alertMsg = hasDivergencia
                ? `Recebimento registrado com divergência (${condicao}).\nCompras foi notificado.\n${resConf.message}`
                : `Recebimento confirmado com sucesso!\n${resConf.message}`;

            _feedback(hasDivergencia ? 'warning' : 'ok', alertMsg.replace(/\n/g, '<br>'));

        } catch (err) {
            _showError(`Erro ao confirmar recebimento: ${err.message}`);
            if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Recebimento'; }
        }
    };

    // ─── LISTA DE RECEBIMENTOS ───────────────────────────────────────────────
    window._renderListaRecebimentos = function () {
        const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2' + ts()) || '[]');
        const tbody = $('inb-tabela-body');
        if (!tbody) return;
        _atualizarKPIs(receipts);

        if (receipts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhum recebimento registrado.</td></tr>';
            return;
        }

        const STATUS_STYLE = {
            'AGUARDANDO_PUTAWAY': { bg: 'rgba(14,165,233,.15)', color: '#0ea5e9', label: 'Ag. Putaway' },
            'PUTAWAY_CONCLUIDO':  { bg: 'rgba(16,185,129,.15)', color: '#10b981', label: 'Concluído' },
            'DIVERGENCIA':        { bg: 'rgba(239,68,68,.15)',  color: '#ef4444', label: 'Divergência' }
        };

        tbody.innerHTML = receipts.map(r => {
            const st = STATUS_STYLE[r.status] || { bg: 'rgba(100,100,100,.15)', color: '#888', label: r.status };
            const data = new Date(r.dataConferencia).toLocaleDateString('pt-BR');
            const avBadge = r.entradaAvulsa ? '&nbsp;<span style="font-size:.65rem;background:rgba(245,158,11,.2);color:#f59e0b;padding:.1rem .35rem;border-radius:3px;">AVULSA</span>' : '';
            const divBadge = r.divergencia ? '&nbsp;<span style="font-size:.65rem;background:rgba(239,68,68,.2);color:#ef4444;padding:.1rem .35rem;border-radius:3px;">DIVERG.</span>' : '';
            return `<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:.55rem .6rem;font-weight:600;">${r.nfNumero}${avBadge}${divBadge}</td>
                <td style="padding:.55rem .6rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.fornecedor}">${r.fornecedor}</td>
                <td style="padding:.55rem;text-align:center;font-size:.78rem;">${r.empresaDestino || '—'}</td>
                <td style="padding:.55rem;text-align:center;">${r.volumesFisicos || 0} / ${r.volumesNF || 0}</td>
                <td style="padding:.55rem;text-align:center;">${data}</td>
                <td style="padding:.55rem;text-align:center;">
                    <span style="background:${st.bg};color:${st.color};padding:.2rem .55rem;border-radius:4px;font-size:.7rem;font-weight:600;">${st.label}</span>
                </td>
                <td style="padding:.55rem;text-align:center;">
                    <button onclick="inbVerDetalhe('${r.id}')" style="background:none;border:none;cursor:pointer;color:var(--primary-color);" title="Detalhes">
                        <span class="material-icons-round" style="font-size:1.1rem;">visibility</span>
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    function _atualizarKPIs(receipts) {
        receipts = receipts || JSON.parse(localStorage.getItem('wms_receipts_v2' + ts()) || '[]');
        const hoje = new Date().toDateString();
        const set = id => el => { const e = $(id); if (e) e.textContent = el; };
        set('inb-kpi-aguardando')(receipts.filter(r => r.status === 'AGUARDANDO_PUTAWAY').length);
        set('inb-kpi-conferencia')(receipts.filter(r => r.status === 'EM_CONFERENCIA').length);
        set('inb-kpi-avulsa')(receipts.filter(r => r.entradaAvulsa && new Date(r.dataConferencia).toDateString() === hoje).length);
        set('inb-kpi-ok')(receipts.filter(r => r.status === 'PUTAWAY_CONCLUIDO' && new Date(r.dataConferencia).toDateString() === hoje).length);
    }

    // ─── DETALHE ─────────────────────────────────────────────────────────────
    window.inbVerDetalhe = function (recId) {
        const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2' + ts()) || '[]');
        const r = receipts.find(x => x.id === recId);
        if (!r) return;
        const body = $('modal-inb-detalhe-body');
        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem 1.5rem;font-size:.83rem;margin-bottom:1rem;">
                ${_campo_ro('NF / Série', `${r.nfNumero} / ${r.nfSerie||'1'}`)}
                ${_campo_ro('Data Conferência', new Date(r.dataConferencia).toLocaleString('pt-BR'))}
                ${_campo_ro('Fornecedor', r.fornecedor)} ${_campo_ro('Empresa Dest.', r.empresaDestino||'—')}
                ${_campo_ro('Doca', r.doca)} ${_campo_ro('Tipo', r.tipo)}
                ${_campo_ro('Placa', r.placa||'—')} ${_campo_ro('Motorista', r.motorista||'—')}
                ${_campo_ro('Volumes NF', r.volumesNF)} ${_campo_ro('Volumes Físicos', r.volumesFisicos)}
                ${_campo_ro('Condição Carga', r.condicaoCarga)} ${_campo_ro('Operador', r.operador||'—')}
                ${_campo_ro('Pedido Compra', r.pedidoCompra||'—')} ${_campo_ro('Valor NF', r.valorTotalNF?`R$ ${Number(r.valorTotalNF).toFixed(2)}`:'—')}
            </div>
            ${r.divergencia ? `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:.75rem;margin-bottom:.75rem;font-size:.82rem;">
                <strong style="color:#ef4444;">Divergência:</strong> ${r.divergencia.tipo} |
                Avariados: ${r.divergencia.volumesAvariados} | Faltantes: ${r.divergencia.volumesFaltantes} | Excesso: ${r.divergencia.volumesExcesso}<br>
                ${r.divergencia.descricao ? `<em>${r.divergencia.descricao}</em>` : ''}
            </div>` : ''}
            ${r.observacoes ? `<div style="font-size:.82rem;color:var(--text-secondary);">Obs: ${r.observacoes}</div>` : ''}
            ${r.chaveNfe ? `<div style="font-size:.7rem;font-family:monospace;color:var(--text-secondary);margin-top:.5rem;word-break:break-all;">Chave: ${r.chaveNfe}</div>` : ''}
            ${r.itens && r.itens.length > 0 ? `
            <div style="margin-top:1rem;font-size:.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:.4rem;">Itens (${r.itens.length})</div>
            <div style="border:1px solid var(--border-color);border-radius:6px;max-height:180px;overflow:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:.78rem;">
                    <thead><tr style="background:var(--bg-dark);">
                        <th style="padding:.35rem .5rem;text-align:left;">SKU</th>
                        <th style="padding:.35rem .5rem;text-align:left;">Descrição</th>
                        <th style="padding:.35rem;text-align:center;">Qtd</th>
                        <th style="padding:.35rem;text-align:center;">Un</th>
                    </tr></thead>
                    <tbody>${r.itens.map(i=>`<tr style="border-top:1px solid var(--border-color);">
                        <td style="padding:.3rem .5rem;font-family:monospace;">${i.sku}</td>
                        <td style="padding:.3rem .5rem;">${i.descricao}</td>
                        <td style="padding:.3rem;text-align:center;">${i.quantidade}</td>
                        <td style="padding:.3rem;text-align:center;">${i.unidade}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>` : ''}`;
        $('modal-inb-detalhe').style.display = 'flex';
    };

    // ─── GERENCIAMENTO DE FOTOS ──────────────────────────────────────────────
    window._inbFotosBuffer = [];

    window.inbAdicionarFotos = function (input) {
        const files = Array.from(input.files);
        const preview = $('conf-fotos-preview');
        const MAX = 4;
        files.forEach(file => {
            if (window._inbFotosBuffer.length >= MAX) {
                alert(`Máximo de ${MAX} fotos permitidas.`); return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const b64 = e.target.result;
                const idx = window._inbFotosBuffer.length;
                window._inbFotosBuffer.push({ nome: file.name, b64, tipo: file.type });
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative;width:64px;height:64px;';
                wrap.innerHTML = `
                    <img src="${b64}" style="width:64px;height:64px;object-fit:cover;
                        border-radius:6px;border:1px solid var(--border-color);">
                    <button onclick="inbRemoverFoto(${idx},this)" style="position:absolute;top:-5px;right:-5px;
                        background:#ef4444;border:none;border-radius:50%;width:18px;height:18px;
                        cursor:pointer;color:#fff;font-size:.65rem;display:flex;align-items:center;
                        justify-content:center;padding:0;">&times;</button>`;
                if (preview) preview.appendChild(wrap);
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    };

    window.inbRemoverFoto = function (idx, btn) {
        window._inbFotosBuffer.splice(idx, 1);
        btn.closest('div').remove();
        // Reindexar botões restantes
        const preview = $('conf-fotos-preview');
        if (preview) preview.querySelectorAll('button').forEach((b, i) => {
            b.setAttribute('onclick', `inbRemoverFoto(${i},this)`);
        });
    };

    // ─── BIND EVENTS ─────────────────────────────────────────────────────────
    function _bindScannerEvents() {
        window._inbFotosBuffer = [];
        _atualizarKPIs();
        // Detecta badge de conexão ERP
        const intCfg = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
        const badge = $('inb-erp-badge');
        if (badge) {
            const id = intCfg.connectorId || 'standalone';
            badge.textContent = `⬤ ${id === 'standalone' ? 'Standalone (mock)' : id === 'parreira-erp' ? 'Parreira ERP' : 'REST API'}`;
            badge.style.background = id === 'standalone' ? 'rgba(100,100,100,.15)' : 'rgba(16,185,129,.15)';
            badge.style.color = id === 'standalone' ? '#888' : '#10b981';
        }
    }

    // ─── UTILITÁRIOS ─────────────────────────────────────────────────────────
    function _feedback(tipo, html) {
        const fb = $('inb-feedback');
        if (!fb) return;
        const styles = {
            loading: { bg: 'rgba(14,165,233,.1)', color: '#0ea5e9', icon: 'hourglass_top' },
            ok:      { bg: 'rgba(16,185,129,.1)', color: '#10b981', icon: 'check_circle' },
            warning: { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', icon: 'warning' },
            error:   { bg: 'rgba(239,68,68,.1)',  color: '#ef4444', icon: 'error' },
            info:    { bg: 'rgba(14,165,233,.1)', color: '#0ea5e9', icon: 'info' }
        };
        const s = styles[tipo] || styles.info;
        fb.style.display = 'block';
        fb.innerHTML = `<div style="background:${s.bg};color:${s.color};padding:.7rem 1rem;border-radius:6px;
            font-size:.85rem;display:flex;align-items:flex-start;gap:.5rem;">
            <span class="material-icons-round" style="font-size:1.1rem;flex-shrink:0;
                ${tipo==='loading'?'animation:spin 1s linear infinite;':''}">
                ${s.icon}
            </span>
            <span>${html}</span>
        </div>`;
    }

    function _setLoading(on) {
        const btn = $('inb-btn-consultar');
        if (btn) btn.disabled = on;
    }

    function _showError(msg) {
        _feedback('error', msg);
        const panel = $('inb-conferencia-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth' });
    }

    function _fmtData(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
    }

})();

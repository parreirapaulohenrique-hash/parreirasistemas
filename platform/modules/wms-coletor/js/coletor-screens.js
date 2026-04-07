// WMS Coletor — Functional Screens
// Recebimento (ERP-validated), Armazenar, Separar, Inventário
// All screens use scanner-driven workflow and share localStorage with WMS PC

// ===================================
// 1. RECEBIMENTO — SCANNER NF-e
// ===================================
// Fluxo: Bipa Chave NF-e (44 dígitos) → valida no ERP via WmsProcedures
//        → Card de Conferência Física → Divergências + Fotos → Push ERP
//
// Modo fallback: busca por Número + Série se chave não disponível
// Modo avulso: liberado via PIN de supervisor configurável

// ─── Estado ──────────────────────────────────────────────────────────────────
window._recNFDados        = null;   // NF normalizada (do ERP ou manual)
window._recEmpresa        = null;   // empresa destinatária selecionada
window._recIsAvulsa       = false;  // true = entrada avulsa (sem NF no ERP)
window._recFotosBuffer    = [];     // fotos base64 de avaria
window._recPinBuffer      = '';     // buffer do teclado PIN

// ─── Handler de scan global ───────────────────────────────────────────────────
// Chamado pelo coletor-core ao bipar qualquer código na tela de recebimento
window.handleScanRecebimento = function (code) {
    const clean = code.replace(/\D/g, '');
    // 44 dígitos = chave NF-e completa
    if (clean.length === 44) {
        _recConsultarPorChave(clean);
    } else if (clean.length >= 1) {
        // Número de NF curto — consultar por número
        _recConsultarPorNumero(clean);
    }
};

// ─── ETAPA 1: SCANNER NF-e ────────────────────────────────────────────────────
function initRecebimentoScreen(container) {
    window._recNFDados     = null;
    window._recEmpresa     = null;
    window._recIsAvulsa    = false;
    window._recFotosBuffer = [];

    container.innerHTML = `
        <!-- Instruções de scan -->
        <div class="m-card" style="border-left:3px solid var(--primary);">
            <div class="m-card-header">
                <span style="font-weight:600;font-size:.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem;vertical-align:middle;color:var(--primary);">qr_code_scanner</span>
                    Receber Nova NF
                </span>
                <span id="rec-erp-badge" style="font-size:.65rem;padding:.15rem .5rem;border-radius:20px;
                    background:rgba(100,100,100,.2);color:#888;font-weight:700;">STANDALONE</span>
            </div>
            <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:1rem;">
                Bipe a <strong>chave de acesso NF-e (44 dígitos)</strong> na barra de scanner acima,
                ou use as abas abaixo para busca manual.
            </p>

            <!-- Abas -->
            <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:1rem;">
                <button id="rtab-chave" onclick="recSwitchTab('chave')"
                    style="flex:1;padding:.6rem;border:none;background:none;color:var(--primary);font-size:.8rem;font-weight:700;border-bottom:2px solid var(--primary);cursor:pointer;">
                    Chave NF-e
                </button>
                <button id="rtab-numero" onclick="recSwitchTab('numero')"
                    style="flex:1;padding:.6rem;border:none;background:none;color:var(--text-secondary);font-size:.8rem;cursor:pointer;">
                    Número + Série
                </button>
            </div>

            <!-- Tab Chave -->
            <div id="rec-tab-chave">
                <div style="margin-bottom:.75rem;">
                    <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">
                        Chave de Acesso (44 dígitos)
                    </label>
                    <input id="rec-chave-inp" type="text" class="m-input" maxlength="47"
                        placeholder="00000 00000 00000 00000 00000 00000 00000 00000 0000"
                        style="font-family:monospace;font-size:.82rem;"
                        oninput="recMascaraChave(this)"
                        onkeydown="if(event.key==='Enter')recConsultarChaveManual()">
                </div>
                <button class="m-btn m-btn-primary" onclick="recConsultarChaveManual()" id="rec-btn-consultar">
                    <span class="material-icons-round" style="font-size:1rem;">search</span>
                    Consultar ERP
                </button>
            </div>

            <!-- Tab Número -->
            <div id="rec-tab-numero" style="display:none;">
                <div style="display:flex;gap:.5rem;margin-bottom:.75rem;">
                    <div style="flex:2;">
                        <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">Número NF</label>
                        <input id="rec-num-inp" type="text" class="m-input" placeholder="Ex: 1234"
                            onkeydown="if(event.key==='Enter')recConsultarNumero()">
                    </div>
                    <div style="flex:.6;">
                        <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.3rem;">Série</label>
                        <input id="rec-serie-inp" type="text" class="m-input" value="1" maxlength="3">
                    </div>
                </div>
                <button class="m-btn m-btn-primary" onclick="recConsultarNumero()">
                    <span class="material-icons-round" style="font-size:1rem;">search</span>
                    Consultar ERP
                </button>
            </div>

            <!-- Feedback -->
            <div id="rec-feedback" style="display:none;margin-top:.75rem;"></div>
        </div>

        <!-- Modal PIN Supervisor -->
        <div id="rec-modal-pin" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.92);z-index:3000;align-items:center;justify-content:center;">
            <div class="m-card" style="width:min(340px,90vw);box-shadow:0 20px 50px rgba(0,0,0,.7);">
                <div style="display:flex;justify-content:space-between;align-items:center;
                    border-bottom:2px solid #f59e0b;padding-bottom:.75rem;margin-bottom:1rem;">
                    <span style="font-weight:700;color:#f59e0b;font-size:.95rem;">
                        <span class="material-icons-round" style="vertical-align:middle;font-size:1.1rem;">lock</span>
                        PIN de Supervisor
                    </span>
                    <span class="material-icons-round" style="cursor:pointer;color:var(--text-secondary);"
                        onclick="recFecharPin()">close</span>
                </div>
                <p style="font-size:.78rem;color:var(--text-secondary);margin-bottom:1rem;text-align:center;">
                    NF não localizada no ERP. Para Entrada Avulsa, insira o PIN de supervisor.
                </p>
                <div id="rec-pin-display" style="font-size:2.2rem;letter-spacing:.7rem;font-weight:700;
                    font-family:monospace;text-align:center;min-height:2.5rem;margin-bottom:1rem;
                    color:var(--primary);"></div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;max-width:200px;margin:0 auto .75rem;">
                    ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => `
                        <button onclick="recPinTecla('${n}')"
                            style="padding:.8rem;border:1px solid var(--border);border-radius:8px;
                            background:var(--bg-input);color:var(--text-primary);font-size:1.1rem;
                            cursor:pointer;font-weight:600;${n===''?'visibility:hidden;':''}">
                            ${n}
                        </button>`).join('')}
                </div>
                <div id="rec-pin-erro" style="color:#ef4444;font-size:.78rem;text-align:center;min-height:1rem;margin-bottom:.5rem;"></div>
                <div style="display:flex;gap:.5rem;">
                    <button class="m-btn m-btn-outline" onclick="recFecharPin()" style="flex:1;">Cancelar</button>
                    <button class="m-btn m-btn-primary" onclick="recValidarPin()" style="flex:1;">Confirmar</button>
                </div>
            </div>
        </div>

        <!-- Modal Multi-CNPJ -->
        <div id="rec-modal-cnpj" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.88);z-index:3000;align-items:center;justify-content:center;">
            <div class="m-card" style="width:min(340px,90vw);">
                <div style="font-weight:700;font-size:.95rem;margin-bottom:.75rem;">
                    <span class="material-icons-round" style="vertical-align:middle;color:var(--primary);">business</span>
                    Selecione a Empresa Destinatária
                </div>
                <div id="rec-cnpj-lista"></div>
                <button class="m-btn m-btn-outline" onclick="recFecharCnpj()" style="margin-top:.5rem;">Cancelar</button>
            </div>
        </div>
    `;

    // Atualiza badge de conector
    const intCfg = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
    const badge = document.getElementById('rec-erp-badge');
    if (badge) {
        const id = intCfg.connectorId || 'standalone';
        badge.textContent = id === 'standalone' ? '⬤ STANDALONE' : id === 'parreira-erp' ? '⬤ PARREIRA ERP' : '⬤ REST API';
        badge.style.background = id === 'standalone' ? 'rgba(100,100,100,.2)' : 'rgba(16,185,129,.15)';
        badge.style.color = id === 'standalone' ? '#888' : '#10b981';
    }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
window.recSwitchTab = function (tab) {
    document.getElementById('rec-tab-chave').style.display  = tab === 'chave'  ? 'block' : 'none';
    document.getElementById('rec-tab-numero').style.display = tab === 'numero' ? 'block' : 'none';
    document.getElementById('rtab-chave').style.cssText  = `flex:1;padding:.6rem;border:none;background:none;font-size:.8rem;cursor:pointer;font-weight:${tab==='chave'?'700':'400'};color:${tab==='chave'?'var(--primary)':'var(--text-secondary)'};border-bottom:${tab==='chave'?'2px solid var(--primary)':'none'};`;
    document.getElementById('rtab-numero').style.cssText = `flex:1;padding:.6rem;border:none;background:none;font-size:.8rem;cursor:pointer;font-weight:${tab==='numero'?'700':'400'};color:${tab==='numero'?'var(--primary)':'var(--text-secondary)'};border-bottom:${tab==='numero'?'2px solid var(--primary)':'none'};`;
};

window.recMascaraChave = function (el) {
    let v = el.value.replace(/\D/g, '').substring(0, 44);
    el.value = v.replace(/(\d{5})(?=\d)/g, '$1 ').trim();
    if (v.length === 44) setTimeout(() => recConsultarChaveManual(), 200);
};

// ─── CONSULTAS ────────────────────────────────────────────────────────────────
window.recConsultarChaveManual = function () {
    const raw = (document.getElementById('rec-chave-inp')?.value || '').replace(/\D/g, '');
    if (raw.length < 44) { _recFeedback('warning', 'Digite os 44 dígitos da chave.'); return; }
    _recConsultarPorChave(raw);
};

window.recConsultarNumero = function () {
    const num = (document.getElementById('rec-num-inp')?.value || '').trim();
    const serie = (document.getElementById('rec-serie-inp')?.value || '1').trim();
    if (!num) { _recFeedback('warning', 'Digite o número da NF.'); return; }
    _recConsultarPorNumero(num, serie);
};

async function _recConsultarPorChave(chave) {
    if (!window.WmsProcedures) { _recFeedback('error', 'WmsProcedures não carregado.'); return; }
    _recFeedback('loading', 'Consultando ERP...');
    _recSetLoading(true);
    try {
        const res = await WmsProcedures.proc_buscar_nf_destinada(chave);
        _recSetLoading(false);
        _recTratarResultado(res);
    } catch (e) {
        _recSetLoading(false);
        _recFeedback('danger', 'Erro: ' + e.message);
    }
}

async function _recConsultarPorNumero(numero, serie = '1') {
    if (!window.WmsProcedures) { _recFeedback('error', 'WmsProcedures não carregado.'); return; }
    _recFeedback('loading', 'Consultando ERP...');
    _recSetLoading(true);
    try {
        const res = await WmsProcedures.proc_buscar_nf_por_numero(numero, serie);
        _recSetLoading(false);
        _recTratarResultado(res);
    } catch (e) {
        _recSetLoading(false);
        _recFeedback('danger', 'Erro: ' + e.message);
    }
}

function _recTratarResultado(res) {
    if (res.found) {
        if (res.empresas && res.empresas.length > 1) {
            // Multi-CNPJ: mostra modal de seleção
            _recAbrirCnpjModal(res.nf, res.empresas);
        } else {
            window._recNFDados  = res.nf;
            window._recEmpresa  = res.empresa;
            window._recIsAvulsa = false;
            Feedback.beep('success'); Feedback.flash('success');
            _recAbrirConferencia();
        }
    } else {
        const erroMsg = res.error ? `Erro ERP: ${res.error}` : 'NF não localizada na fila de pedidos.';
        _recFeedback('warning', erroMsg);
        // Botões: Recusar ou Avulsa
        const fb = document.getElementById('rec-feedback');
        if (fb) fb.insertAdjacentHTML('beforeend', `
            <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;">
                <button class="m-btn m-btn-outline" onclick="recRecusarNF()"
                    style="flex:1;border-color:#ef4444;color:#ef4444;font-size:.8rem;">
                    <span class="material-icons-round" style="font-size:.9rem;">block</span> Recusar
                </button>
                <button class="m-btn m-btn-outline" onclick="recAbrirPin()"
                    style="flex:1;border-color:#f59e0b;color:#f59e0b;font-size:.8rem;">
                    <span class="material-icons-round" style="font-size:.9rem;">lock_open</span> Avulsa (PIN)
                </button>
            </div>`);
        Feedback.beep('error'); Feedback.flash('error');
    }
}

// ─── RECUSA ───────────────────────────────────────────────────────────────────
window.recRecusarNF = function () {
    const motivo = prompt('Motivo da recusa (ex: NF não esperada, fornecedor errado):');
    if (!motivo) return;
    const key = 'wms_recusas' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
    const lista = JSON.parse(localStorage.getItem(key) || '[]');
    lista.unshift({ motivo, registradoEm: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(lista));
    _recFeedback('success', `Recusa registrada: "${motivo}". Avise a portaria.`);
};

// ─── MODAL MULTI-CNPJ ─────────────────────────────────────────────────────────
function _recAbrirCnpjModal(nf, empresas) {
    window._recMultiCnpj = { nf, empresas };
    const lista = document.getElementById('rec-cnpj-lista');
    if (lista) lista.innerHTML = empresas.map((e, i) => `
        <button onclick="recSelecionarEmpresa(${i})" class="m-btn m-btn-outline"
            style="width:100%;text-align:left;margin-bottom:.4rem;font-size:.85rem;padding:.65rem;">
            <strong>${e.razaoSocial}</strong><br>
            <span style="font-size:.72rem;font-family:monospace;">${e.cnpj}</span>
        </button>`).join('');
    document.getElementById('rec-modal-cnpj').style.display = 'flex';
}

window.recFecharCnpj = function () {
    document.getElementById('rec-modal-cnpj').style.display = 'none';
};

window.recSelecionarEmpresa = function (idx) {
    const { nf, empresas } = window._recMultiCnpj;
    window._recNFDados  = nf;
    window._recEmpresa  = empresas[idx];
    window._recIsAvulsa = false;
    recFecharCnpj();
    _recAbrirConferencia();
};

// ─── MODAL PIN SUPERVISOR ─────────────────────────────────────────────────────
window.recAbrirPin = function () {
    window._recPinBuffer = '';
    document.getElementById('rec-pin-display').textContent = '';
    document.getElementById('rec-pin-erro').textContent = '';
    document.getElementById('rec-modal-pin').style.display = 'flex';
};

window.recFecharPin = function () {
    document.getElementById('rec-modal-pin').style.display = 'none';
    window._recPinBuffer = '';
};

window.recPinTecla = function (tecla) {
    if (tecla === '⌫') {
        window._recPinBuffer = window._recPinBuffer.slice(0, -1);
    } else if (window._recPinBuffer.length < 6) {
        window._recPinBuffer += tecla;
    }
    document.getElementById('rec-pin-display').textContent = '●'.repeat(window._recPinBuffer.length);
    document.getElementById('rec-pin-erro').textContent = '';
};

window.recValidarPin = async function () {
    if (!window._recPinBuffer) { document.getElementById('rec-pin-erro').textContent = 'Digite o PIN.'; return; }
    const ok = await WmsProcedures.proc_validar_pin_supervisor(window._recPinBuffer);
    if (ok.valid) {
        recFecharPin();
        window._recNFDados  = null;
        window._recEmpresa  = null;
        window._recIsAvulsa = true;
        _recAbrirConferencia();
        _recFeedback('warning', '⚠️ Entrada Avulsa autorizada via PIN. Preencha os dados.');
    } else {
        window._recPinBuffer = '';
        document.getElementById('rec-pin-display').textContent = '';
        document.getElementById('rec-pin-erro').textContent = ok.message;
        Feedback.beep('error');
    }
};

// ─── ETAPA 2: CARD DE CONFERÊNCIA FÍSICA ────────────────────────────────────
function _recAbrirConferencia() {
    const nf      = window._recNFDados;
    const emp     = window._recEmpresa;
    const avulsa  = window._recIsAvulsa;
    const container = document.getElementById('screen-recebimento');
    window._recFotosBuffer = [];

    const secaoERP = !avulsa ? `
        <div style="background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.2);
            border-radius:8px;padding:.85rem;margin-bottom:1rem;">
            <div style="font-size:.65rem;font-weight:700;color:#0ea5e9;text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:.6rem;">✅ Dados do ERP (somente leitura)</div>
            <div style="font-size:.82rem;display:flex;flex-direction:column;gap:.3rem;">
                <div><span style="color:var(--text-secondary);">NF:</span> <strong>${nf.numero} / Série ${nf.serie}</strong></div>
                <div><span style="color:var(--text-secondary);">Fornecedor:</span> <strong>${nf.razaoSocialEmitente}</strong></div>
                <div><span style="color:var(--text-secondary);">Empresa Dest.:</span> <strong>${emp ? emp.razaoSocial : '—'}</strong></div>
                <div><span style="color:var(--text-secondary);">Valor NF:</span> <strong>R$ ${Number(nf.valorTotal).toFixed(2)}</strong></div>
                <div><span style="color:var(--text-secondary);">Transp.:</span> ${nf.transportadora || '—'}</div>
                <div><span style="color:var(--text-secondary);">PC:</span> ${nf.pedidoCompra || '—'}</div>
                <div><span style="color:var(--text-secondary);">Vol. NF:</span> ${nf.volumes ?? '—'}</div>
            </div>
            ${nf.itens && nf.itens.length > 0 ? `
            <div style="margin-top:.6rem;max-height:110px;overflow:auto;border-top:1px solid rgba(14,165,233,.2);padding-top:.5rem;">
                ${nf.itens.map(i => `
                <div style="font-size:.75rem;display:flex;justify-content:space-between;padding:.2rem 0;">
                    <span><span style="font-family:monospace;color:var(--text-secondary);">${i.sku}</span> ${i.descricao}</span>
                    <strong>${i.quantidade} ${i.unidade}</strong>
                </div>`).join('')}
            </div>` : ''}
        </div>` : `
        <div style="background:rgba(245,158,11,.08);border:1px solid #f59e0b;border-radius:8px;
            padding:.65rem .85rem;margin-bottom:1rem;font-size:.8rem;color:#f59e0b;display:flex;align-items:center;gap:.4rem;">
            <span class="material-icons-round" style="font-size:1rem;">warning</span>
            Entrada Avulsa — preencha todos os campos manualmente.
        </div>`;

    container.innerHTML = `
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <strong style="font-size:.95rem;">
                ${avulsa ? '📋 Entrada Avulsa' : `📦 Conferência — NF ${nf.numero}`}
            </strong>
            <button class="m-btn m-btn-outline" onclick="recCancelarConferencia()"
                style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span> Voltar
            </button>
        </div>

        ${secaoERP}

        <!-- Campos manuais -->
        <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;">
            ${avulsa ? `
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Número da NF *</label>
                <input id="rconf-nf-num" type="text" class="m-input" placeholder="Ex: 12345">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Fornecedor *</label>
                <input id="rconf-fornecedor" type="text" class="m-input" placeholder="Nome do fornecedor">
            </div>` : ''}
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">E-mail do Fornecedor <span style="opacity:.6;">(relatório de diverg.)</span></label>
                <input id="rconf-email-forn" type="email" class="m-input" placeholder="contato@fornecedor.com.br"
                    value="${(!avulsa && nf?._raw?.emailFornecedor) || ''}">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Doca *</label>
                <select id="rconf-doca" class="m-input">${_recDocasOptions()}</select>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Tipo de Entrada</label>
                <select id="rconf-tipo" class="m-input">
                    <option value="COMPRA">Compra</option>
                    <option value="DEVOLUCAO">Devolução de Cliente</option>
                    <option value="TRANSFERENCIA">Transferência entre filiais</option>
                    <option value="BONIFICACAO">Bonificação</option>
                </select>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Placa do Veículo</label>
                <input id="rconf-placa" type="text" class="m-input" placeholder="AAA-0000"
                    oninput="this.value=this.value.toUpperCase()">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Motorista / Entregador</label>
                <input id="rconf-motorista" type="text" class="m-input" placeholder="Nome completo">
            </div>
            <div style="display:flex;gap:.5rem;">
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Vol. NF</label>
                    <input id="rconf-vol-nf" type="number" class="m-input" min="0"
                        value="${!avulsa && nf.volumes != null ? nf.volumes : ''}">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Vol. Físico *</label>
                    <input id="rconf-vol-fis" type="number" class="m-input" min="0"
                        oninput="recAtualizarDivergencia()">
                </div>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Condição da Carga *</label>
                <select id="rconf-condicao" class="m-input" onchange="recToggleDivergencia()">
                    <option value="OK">✅ OK — Carga íntegra</option>
                    <option value="FALTA">⚠️ Falta de Volumes</option>
                    <option value="AVARIA_PARCIAL">⚠️ Avaria Parcial</option>
                    <option value="AVARIA_TOTAL">🚨 Avaria Total</option>
                    <option value="EXCESSO">📦 Excesso de Volumes</option>
                    <option value="LACRE_ROMPIDO">🔓 Lacre Rompido</option>
                    <option value="MISTO">⚠️ Múltiplas Ocorrências</option>
                </select>
            </div>
        </div>

        <!-- Bloco de divergência -->
        <div id="rconf-div-bloco" style="display:none;background:rgba(245,158,11,.08);
            border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.85rem;margin-bottom:1rem;">
            <div style="font-size:.72rem;font-weight:700;color:#f59e0b;text-transform:uppercase;
                letter-spacing:.05em;margin-bottom:.75rem;">Detalhes da Divergência</div>
            <div style="display:flex;gap:.5rem;margin-bottom:.75rem;">
                <div style="flex:1;">
                    <label style="font-size:.68rem;color:var(--text-secondary);display:block;margin-bottom:.2rem;">Avariados</label>
                    <input id="rconf-avariados" type="number" class="m-input" min="0" value="0">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.68rem;color:var(--text-secondary);display:block;margin-bottom:.2rem;">Faltantes</label>
                    <input id="rconf-faltantes" type="number" class="m-input" min="0" value="0">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.68rem;color:var(--text-secondary);display:block;margin-bottom:.2rem;">Excesso</label>
                    <input id="rconf-excesso" type="number" class="m-input" min="0" value="0">
                </div>
            </div>
            <div style="margin-bottom:.75rem;">
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Descrição da Divergência</label>
                <textarea id="rconf-div-desc" class="m-input" rows="2"
                    placeholder="Descreva a avaria com detalhes..."></textarea>
            </div>
            <!-- Fotos -->
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.4rem;">
                    Fotos da Ocorrência <span style="opacity:.6;">(máx. 4)</span>
                </label>
                <div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;">
                    <label for="rconf-fotos-inp" style="cursor:pointer;display:flex;align-items:center;
                        gap:.3rem;padding:.4rem .7rem;border:1px dashed var(--primary);border-radius:6px;
                        font-size:.78rem;color:var(--primary);">
                        <span class="material-icons-round" style="font-size:.95rem;">add_a_photo</span>
                        Foto
                    </label>
                    <input id="rconf-fotos-inp" type="file" accept="image/*" capture="environment"
                        multiple style="display:none;" onchange="recAdicionarFotos(this)">
                    <div id="rconf-fotos-preview" style="display:flex;flex-wrap:wrap;gap:.3rem;"></div>
                </div>
            </div>
        </div>

        <div style="margin-bottom:1rem;">
            <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Observações</label>
            <textarea id="rconf-obs" class="m-input" rows="2" placeholder="Informações adicionais..."></textarea>
        </div>

        <div id="rconf-alerta-vol" style="display:none;padding:.4rem .65rem;border-radius:6px;font-size:.78rem;margin-bottom:.75rem;"></div>

        <button class="m-btn m-btn-success" id="rconf-btn-confirmar" onclick="recConfirmarRecebimento()"
            style="font-size:.95rem;">
            <span class="material-icons-round">check_circle</span>
            Confirmar Recebimento
        </button>
    `;
}

function _recDocasOptions() {
    const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const docas = wmsConfig.docas || ['DOCA-01','DOCA-02','DOCA-03'];
    return docas.map(d => `<option value="${d}">${d.replace('-',' ')}</option>`).join('');
}

// ─── DIVERGÊNCIA UI ───────────────────────────────────────────────────────────
window.recToggleDivergencia = function () {
    const cond = document.getElementById('rconf-condicao')?.value;
    const bloco = document.getElementById('rconf-div-bloco');
    if (bloco) bloco.style.display = (cond !== 'OK') ? 'block' : 'none';
};

window.recAtualizarDivergencia = function () {
    const volNF  = parseInt(document.getElementById('rconf-vol-nf')?.value) || 0;
    const volFis = parseInt(document.getElementById('rconf-vol-fis')?.value) || 0;
    const alerta = document.getElementById('rconf-alerta-vol');
    if (volNF > 0 && volFis !== volNF && alerta) {
        const diff = volFis - volNF;
        alerta.style.display = 'block';
        alerta.style.background = diff < 0 ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)';
        alerta.style.color = diff < 0 ? '#ef4444' : '#f59e0b';
        alerta.textContent = diff < 0 ? `⚠️ Faltam ${Math.abs(diff)} volume(s).` : `⚠️ Excesso de ${diff} volume(s).`;
        if (document.getElementById('rconf-condicao')) {
            document.getElementById('rconf-condicao').value = diff < 0 ? 'FALTA' : 'EXCESSO';
            recToggleDivergencia();
        }
    } else if (alerta) alerta.style.display = 'none';
};

// ─── FOTOS ────────────────────────────────────────────────────────────────────
window.recAdicionarFotos = function (input) {
    const MAX = 4;
    Array.from(input.files).forEach(file => {
        if (window._recFotosBuffer.length >= MAX) { showToast(`Máx. ${MAX} fotos.`,'warning'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            const idx = window._recFotosBuffer.length;
            window._recFotosBuffer.push({ nome: file.name, b64: e.target.result, tipo: file.type });
            const preview = document.getElementById('rconf-fotos-preview');
            if (!preview) return;
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;width:52px;height:52px;';
            wrap.innerHTML = `<img src="${e.target.result}" style="width:52px;height:52px;object-fit:cover;border-radius:5px;border:1px solid var(--border);">
                <button onclick="recRemoverFoto(${idx},this)" style="position:absolute;top:-4px;right:-4px;background:#ef4444;border:none;border-radius:50%;width:16px;height:16px;cursor:pointer;color:#fff;font-size:.6rem;display:flex;align-items:center;justify-content:center;padding:0;">&times;</button>`;
            preview.appendChild(wrap);
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

window.recRemoverFoto = function (idx, btn) {
    window._recFotosBuffer.splice(idx, 1);
    btn.closest('div').remove();
    const preview = document.getElementById('rconf-fotos-preview');
    if (preview) preview.querySelectorAll('button').forEach((b, i) => b.setAttribute('onclick', `recRemoverFoto(${i},this)`));
};

// ─── CANCELAR ─────────────────────────────────────────────────────────────────
window.recCancelarConferencia = function () {
    window._recNFDados = null; window._recEmpresa = null; window._recIsAvulsa = false;
    window._recFotosBuffer = [];
    initRecebimentoScreen(document.getElementById('screen-recebimento'));
};

// ─── CONFIRMAR RECEBIMENTO ────────────────────────────────────────────────────
window.recConfirmarRecebimento = async function () {
    const avulsa   = window._recIsAvulsa;
    const nf       = window._recNFDados;
    const emp      = window._recEmpresa;
    const condicao = document.getElementById('rconf-condicao')?.value;
    const volFis   = parseInt(document.getElementById('rconf-vol-fis')?.value);
    const user     = JSON.parse(localStorage.getItem('logged_user') || '{}');

    // Validações básicas
    if (!document.getElementById('rconf-doca')?.value) { showToast('Selecione a doca.','warning'); return; }
    if (isNaN(volFis) || volFis < 0) { showToast('Informe volumes físicos.','warning'); return; }
    if (avulsa) {
        if (!(document.getElementById('rconf-nf-num')?.value||'').trim()) { showToast('Informe o nº da NF.','warning'); return; }
        if (!(document.getElementById('rconf-fornecedor')?.value||'').trim()) { showToast('Informe o fornecedor.','warning'); return; }
    }

    const hasDivergencia = condicao !== 'OK';
    const emailForn = (document.getElementById('rconf-email-forn')?.value || '').trim();

    const payload = {
        id:              `REC2-${Date.now()}`,
        chaveNfe:        avulsa ? '' : (nf.chaveNfe || ''),
        nfNumero:        avulsa ? document.getElementById('rconf-nf-num').value.trim() : nf.numero,
        nfSerie:         avulsa ? '1' : nf.serie,
        fornecedor:      avulsa ? document.getElementById('rconf-fornecedor').value.trim() : nf.razaoSocialEmitente,
        cnpjFornecedor:  avulsa ? '' : nf.cnpjEmitente,
        empresaDestino:  emp ? emp.razaoSocial : '',
        cnpjDestino:     emp ? emp.cnpj : (avulsa ? '' : nf.cnpjDestinatario),
        pedidoCompra:    avulsa ? '' : (nf.pedidoCompra || ''),
        valorTotalNF:    avulsa ? 0 : (nf.valorTotal || 0),
        transportadora:  avulsa ? '' : (nf.transportadora || ''),
        doca:            document.getElementById('rconf-doca').value,
        tipo:            document.getElementById('rconf-tipo').value,
        placa:           (document.getElementById('rconf-placa')?.value || '').trim(),
        motorista:       (document.getElementById('rconf-motorista')?.value || '').trim(),
        volumesNF:       parseInt(document.getElementById('rconf-vol-nf')?.value) || 0,
        volumesFisicos:  volFis,
        condicaoCarga:   condicao,
        observacoes:     (document.getElementById('rconf-obs')?.value || '').trim(),
        emailFornecedor: emailForn,
        itens:           avulsa ? [] : (nf.itens || []),
        entradaAvulsa:   avulsa,
        status:          'AGUARDANDO_PUTAWAY',
        operador:        user.name || user.login || 'Operador',
        dataConferencia: new Date().toISOString(),
        divergencia:     hasDivergencia ? {
            tipo:             condicao,
            volumesAvariados: parseInt(document.getElementById('rconf-avariados')?.value) || 0,
            volumesFaltantes: parseInt(document.getElementById('rconf-faltantes')?.value) || 0,
            volumesExcesso:   parseInt(document.getElementById('rconf-excesso')?.value) || 0,
            descricao:        (document.getElementById('rconf-div-desc')?.value || '').trim(),
            fotos:            window._recFotosBuffer || []
        } : null
    };

    const btn = document.getElementById('rconf-btn-confirmar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons-round" style="animation:spin 1s linear infinite;">sync</span> Processando...'; }

    try {
        // 1. Confirma no ERP
        await WmsProcedures.proc_confirmar_recebimento(payload);

        // 2. Divergência → registra + email automático
        if (hasDivergencia && payload.divergencia) {
            const divP = {
                recId: payload.id, nfNumero: payload.nfNumero, chaveNfe: payload.chaveNfe,
                fornecedor: payload.fornecedor, emailFornecedor: emailForn,
                ...payload.divergencia, operador: payload.operador, dataOcorrencia: payload.dataConferencia
            };
            await WmsProcedures.proc_registrar_divergencia(divP);
            if (emailForn) await WmsProcedures.proc_enviar_email_divergencia(divP);
        }

        // 3. Auditoria avulsa
        if (avulsa) {
            await WmsProcedures.proc_registrar_entrada_avulsa(payload, { timestamp: new Date().toISOString() });
        }

        // 4. Gera tarefas de putaway
        _recGerarPutaway(payload);

        // Feedback e volta para home
        Feedback.beep('success'); Feedback.flash('success');
        showToast(hasDivergencia ? `Recebimento com divergência (${condicao}) registrado.` : 'Recebimento confirmado! Putaway gerado.', 'success');
        updateBadges();
        window._recNFDados = null; window._recEmpresa = null; window._recIsAvulsa = false;
        window._recFotosBuffer = [];
        setTimeout(() => navigateTo('home'), 1200);

    } catch (err) {
        showToast('Erro: ' + err.message, 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">check_circle</span> Confirmar Recebimento'; }
    }
};

function _recGerarPutaway(payload) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    if (payload.itens && payload.itens.length > 0) {
        payload.itens.forEach(item => {
            putaway.push({
                id: `PUT-${String(putaway.length + 1).padStart(4, '0')}`,
                nf: payload.nfNumero, sku: item.sku, desc: item.descricao,
                qty: item.quantidade, destino: suggestAddress(item.sku),
                status: 'PENDENTE', created: new Date().toISOString()
            });
        });
    } else {
        putaway.push({
            id: `PUT-${String(putaway.length + 1).padStart(4, '0')}`,
            nf: payload.nfNumero, sku: '—', desc: `Recebimento NF ${payload.nfNumero}`,
            qty: payload.volumesFisicos, destino: 'DOCA-RECEPCAO',
            status: 'PENDENTE', created: new Date().toISOString()
        });
    }
    localStorage.setItem('wms_putaway', JSON.stringify(putaway));
}

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────
function _recFeedback(tipo, html) {
    const fb = document.getElementById('rec-feedback');
    if (!fb) return;
    const s = {
        loading: { bg: 'rgba(14,165,233,.1)',  color: '#0ea5e9' },
        success: { bg: 'rgba(16,185,129,.1)',  color: '#10b981' },
        warning: { bg: 'rgba(245,158,11,.1)',  color: '#f59e0b' },
        danger:  { bg: 'rgba(239,68,68,.1)',   color: '#ef4444' }
    }[tipo] || { bg: 'rgba(14,165,233,.1)', color: '#0ea5e9' };
    fb.style.display = 'block';
    fb.innerHTML = `<div style="background:${s.bg};color:${s.color};padding:.6rem .85rem;border-radius:6px;font-size:.82rem;">${html}</div>`;
}

function _recSetLoading(on) {
    const btn = document.getElementById('rec-btn-consultar');
    if (btn) btn.disabled = on;
}

function suggestAddress(sku) {
    const hash = sku.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const street   = String((hash % 3) + 1).padStart(2, '0');
    const building = String((hash % 4) + 1).padStart(2, '0');
    const apt      = String((hash % 5) + 1).padStart(2, '0') + String((hash % 3) + 1).padStart(2, '0');
    return `${street}-${building}-${apt}`;
}


// ===================================
// 2. ARMAZENAR (Putaway)
// ===================================
// Workflow: See pending putaway tasks → scan destination address → confirm

window.handleScanArmazenar = function (code) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const task = putaway.find(t => t.id === code || t.destino === code);
    if (task && task.status === 'PENDENTE') {
        confirmarArmazenagem(task.id);
    } else if (code.match(/^\d{2}-\d{2}-\d{4}$/)) {
        // Address scanned — confirm the first task pointing to this address
        const matching = putaway.find(t => t.destino === code && t.status === 'PENDENTE');
        if (matching) {
            confirmarArmazenagem(matching.id);
        } else {
            showToast('Nenhuma tarefa para este endereço', 'warning');
        }
    } else {
        showToast('Código não reconhecido', 'warning');
    }
};

function initArmazenarScreen(container) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const pending = putaway.filter(t => t.status === 'PENDENTE');
    const done = putaway.filter(t => t.status === 'ARMAZENADO');

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--purple);">system_update_alt</span>
                    Armazenagem
                </span>
                <span class="m-badge m-badge-yellow">${pending.length} pendentes</span>
            </div>
        </div>

        ${pending.length > 0 ? pending.map(t => `
            <div class="m-card" style="border-left:3px solid var(--purple);">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
                    <div>
                        <div style="font-weight:600; font-size:0.85rem;">${t.desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">
                            <span style="font-family:monospace;">${t.sku}</span> • NF ${t.nf} • ${t.qty} un
                        </div>
                    </div>
                    <span class="m-badge m-badge-yellow" style="font-size:0.6rem;">PEND.</span>
                </div>
                <div style="background:var(--bg-input); border-radius:8px; padding:0.75rem; display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
                    <span class="material-icons-round" style="color:var(--purple); font-size:1.5rem;">place</span>
                    <div>
                        <div style="font-size:0.7rem; color:var(--text-secondary);">ENDEREÇO DESTINO</div>
                        <div style="font-size:1.2rem; font-weight:700; font-family:monospace; letter-spacing:1px;">${t.destino}</div>
                    </div>
                </div>
                <button class="m-btn m-btn-success" onclick="confirmarArmazenagem('${t.id}')" style="padding:0.65rem; font-size:0.9rem;">
                    <span class="material-icons-round" style="font-size:1.1rem;">check</span> Confirmar Armazenagem
                </button>
            </div>
        `).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Nenhuma tarefa de armazenagem pendente.
            </div>
        `}

        ${done.length > 0 ? `
        <div class="m-card" style="margin-top:0.5rem;">
            <div style="font-size:0.8rem; color:var(--text-secondary); font-weight:600; margin-bottom:0.5rem;">Últimas armazenagens</div>
            ${done.slice(-3).reverse().map(t => `
                <div class="m-list-item" style="padding:0.5rem 0;">
                    <span class="material-icons-round" style="color:var(--success); font-size:1.2rem;">check_circle</span>
                    <div style="flex:1;">
                        <span style="font-size:0.8rem; font-weight:600;">${t.desc}</span>
                        <span style="font-size:0.7rem; color:var(--text-secondary);"> → ${t.destino}</span>
                    </div>
                </div>
            `).join('')}
        </div>` : ''}
    `;
}

window.confirmarArmazenagem = function (taskId) {
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const task = putaway.find(t => t.id === taskId);
    if (task) {
        task.status = 'ARMAZENADO';
        task.completedAt = new Date().toISOString();
        localStorage.setItem('wms_putaway', JSON.stringify(putaway));
        showToast(`Armazenado em ${task.destino}`, 'success');
        updateBadges();
        initArmazenarScreen(document.getElementById('screen-armazenar'));
    }
};


// ===================================
// 3. SEPARAR (Picking)
// ===================================
// Workflow: See picking tasks → go to address → scan address/SKU → confirm pick

window.handleScanSeparar = function (code) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pending = tasks.filter(t => t.status === 'PENDENTE');

    // Match by address or SKU
    const match = pending.find(t => t.endereco === code || t.sku === code || t.id === code);
    if (match) {
        match.status = 'COLETADO';
        localStorage.setItem('wms_picking', JSON.stringify(tasks));
        showToast(`Coletado: ${match.desc} (${match.qtd} un)`, 'success');
        updateBadges();
        initSepararScreen(document.getElementById('screen-separar'));
    } else {
        showToast('Nenhuma tarefa para este código', 'warning');
    }
};

function initSepararScreen(container) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pending = tasks.filter(t => t.status === 'PENDENTE');
    const coletados = tasks.filter(t => t.status === 'COLETADO');

    // Group by onda
    const ondas = {};
    pending.forEach(t => {
        if (!ondas[t.onda]) ondas[t.onda] = [];
        ondas[t.onda].push(t);
    });

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--warning);">shopping_basket</span>
                    Separação
                </span>
                <span class="m-badge m-badge-yellow">${pending.length} pendentes</span>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <div style="flex:1; text-align:center; padding:0.5rem; background:var(--bg-input); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--warning);">${pending.length}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary);">PENDENTES</div>
                </div>
                <div style="flex:1; text-align:center; padding:0.5rem; background:var(--bg-input); border-radius:6px;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--success);">${coletados.length}</div>
                    <div style="font-size:0.65rem; color:var(--text-secondary);">COLETADOS</div>
                </div>
            </div>
        </div>

        ${pending.length > 0 ? Object.entries(ondas).map(([ondaId, tasks]) => `
            <div style="margin-bottom:0.25rem;">
                <div style="font-size:0.7rem; font-weight:600; color:var(--text-secondary); padding:0.5rem 0.25rem; text-transform:uppercase; letter-spacing:0.5px;">
                    ${ondaId}
                </div>
                ${tasks.map(t => `
                <div class="m-card" style="border-left:3px solid var(--warning);">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
                        <div>
                            <div style="font-weight:600; font-size:0.85rem;">${t.desc}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">
                                <span style="font-family:monospace;">${t.sku}</span> • ${t.pedido}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.2rem; font-weight:700;">${t.qtd}</div>
                            <div style="font-size:0.6rem; color:var(--text-secondary);">unidades</div>
                        </div>
                    </div>
                    <div style="background:var(--bg-input); border-radius:8px; padding:0.65rem; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
                        <span class="material-icons-round" style="color:var(--primary); font-size:1.3rem;">place</span>
                        <div style="font-size:1.1rem; font-weight:700; font-family:monospace; letter-spacing:1px;">${t.endereco}</div>
                    </div>
                    <button class="m-btn m-btn-primary" onclick="confirmarPickMobile('${t.id}')" style="padding:0.6rem; font-size:0.85rem;">
                        <span class="material-icons-round" style="font-size:1rem;">check</span> Confirmar Coleta
                    </button>
                </div>`).join('')}
            </div>
        `).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">done_all</span>
                Nenhuma tarefa de separação pendente.<br>
                <span style="font-size:0.8rem;">Aguarde a liberação de ondas no WMS PC.</span>
            </div>
        `}
    `;
}

window.confirmarPickMobile = function (taskId) {
    const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'COLETADO';
        localStorage.setItem('wms_picking', JSON.stringify(tasks));
        showToast(`Coletado: ${task.desc}`, 'success');
        updateBadges();
        initSepararScreen(document.getElementById('screen-separar'));
    }
};


// ===================================
// 4. INVENTÁRIO
// ===================================
// Workflow: See active inventory → scan address → input count → save

window.handleScanInventario = function (code) {
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const active = inventarios.find(i => i.status === 'EM ANDAMENTO');
    if (!active) {
        showToast('Nenhum inventário ativo', 'warning');
        return;
    }

    const endereco = active.enderecos.find(e => e.endereco === code);
    if (endereco) {
        if (endereco.status === 'PENDENTE') {
            window._invTarget = { invId: active.id, endereco: code };
            openCountInput(endereco);
        } else {
            showToast('Endereço já contado', 'warning');
        }
    } else {
        showToast('Endereço não pertence a este inventário', 'warning');
    }
};

function initInventarioScreen(container) {
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const active = inventarios.filter(i => i.status === 'EM ANDAMENTO');

    container.innerHTML = `
        <div class="m-card">
            <div class="m-card-header">
                <span style="font-weight:600; font-size:0.95rem;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle; color:var(--success);">inventory_2</span>
                    Inventário
                </span>
                <span class="m-badge ${active.length > 0 ? 'm-badge-green' : 'm-badge-blue'}">${active.length} ativos</span>
            </div>
        </div>

        ${active.length > 0 ? active.map(inv => {
        const total = inv.enderecos.length;
        const contados = inv.enderecos.filter(e => e.status !== 'PENDENTE').length;
        const pct = total > 0 ? Math.round((contados / total) * 100) : 0;
        const divergentes = inv.enderecos.filter(e => e.status === 'DIVERGENTE').length;

        return `
            <div class="m-card" style="border-left:3px solid var(--success);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <div>
                        <div style="font-weight:700;">${inv.id}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${inv.tipo} • ${new Date(inv.data + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <span class="m-badge m-badge-green">${pct}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.05); border-radius:4px; height:6px; overflow:hidden; margin-bottom:1rem;">
                    <div style="width:${pct}%; height:100%; background:var(--success); border-radius:4px;"></div>
                </div>

                ${divergentes > 0 ? `
                <div style="background:rgba(239,68,68,0.1); border-radius:6px; padding:0.5rem 0.75rem; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
                    <span class="material-icons-round" style="color:var(--danger); font-size:1rem;">warning</span>
                    <span style="font-size:0.8rem; color:var(--danger); font-weight:600;">${divergentes} divergência(s)</span>
                </div>` : ''}

                ${inv.enderecos.map(e => {
            const icon = e.status === 'OK' ? 'check_circle' : e.status === 'DIVERGENTE' ? 'error' : 'radio_button_unchecked';
            const color = e.status === 'OK' ? 'var(--success)' : e.status === 'DIVERGENTE' ? 'var(--danger)' : 'var(--text-secondary)';
            const diff = e.contagem !== null ? e.contagem - e.saldoSistema : null;
            return `
                    <div class="m-list-item" style="padding:0.6rem 0; cursor:${e.status === 'PENDENTE' ? 'pointer' : 'default'};"
                        ${e.status === 'PENDENTE' ? `onclick="startCount('${inv.id}','${e.endereco}')"` : ''}>
                        <span class="material-icons-round" style="color:${color}; font-size:1.3rem;">${icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600; font-family:monospace; font-size:0.9rem;">${e.endereco}</div>
                            <div style="font-size:0.7rem; color:var(--text-secondary);">${e.sku} • ${e.desc}</div>
                        </div>
                        <div style="text-align:right;">
                            ${e.contagem !== null ? `
                                <div style="font-size:0.9rem; font-weight:700; color:${diff === 0 ? 'var(--success)' : 'var(--danger)'};">${e.contagem}</div>
                                <div style="font-size:0.6rem; color:var(--text-secondary);">sist: ${e.saldoSistema}</div>
                            ` : `
                                <span class="m-badge m-badge-blue" style="font-size:0.6rem;">CONTAR</span>
                            `}
                        </div>
                    </div>`;
        }).join('')}
            </div>`;
    }).join('') : `
            <div class="m-card" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2.5rem; opacity:0.3; display:block; margin-bottom:0.5rem;">inventory_2</span>
                Nenhum inventário ativo.<br>
                <span style="font-size:0.8rem;">Crie um inventário no WMS PC primeiro.</span>
            </div>
        `}
    `;
}

window.startCount = function (invId, endereco) {
    window._invTarget = { invId, endereco };
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const inv = inventarios.find(i => i.id === invId);
    const end = inv?.enderecos.find(e => e.endereco === endereco);
    if (end) openCountInput(end);
};

function openCountInput(endereco) {
    const container = document.getElementById('screen-inventario');
    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid var(--success);">
            <div style="text-align:center; margin-bottom:1.25rem;">
                <span class="material-icons-round" style="font-size:2rem; color:var(--success);">place</span>
                <div style="font-size:1.5rem; font-weight:700; font-family:monospace; letter-spacing:2px; margin:0.5rem 0;">${endereco.endereco}</div>
                <div style="font-size:0.85rem; color:var(--text-secondary);">${endereco.sku} — ${endereco.desc}</div>
            </div>

            <div style="margin-bottom:1.25rem;">
                <label class="m-label">Quantidade Contada</label>
                <input type="number" id="countInput" class="m-input" min="0"
                    style="font-size:1.5rem; text-align:center; font-weight:700; padding:1rem;"
                    placeholder="0" autofocus>
            </div>

            <button class="m-btn m-btn-success" style="margin-bottom:0.5rem;" onclick="saveCount()">
                <span class="material-icons-round">check</span> Salvar Contagem
            </button>
            <button class="m-btn m-btn-outline" onclick="cancelCount()">
                <span class="material-icons-round">arrow_back</span> Voltar
            </button>
        </div>
    `;

    setTimeout(() => {
        const input = document.getElementById('countInput');
        if (input) input.focus();
    }, 200);
}

window.saveCount = function () {
    const input = document.getElementById('countInput');
    const count = parseInt(input?.value);
    if (isNaN(count) || count < 0) {
        showToast('Informe uma quantidade válida', 'warning');
        return;
    }

    const target = window._invTarget;
    if (!target) return;

    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const inv = inventarios.find(i => i.id === target.invId);
    const end = inv?.enderecos.find(e => e.endereco === target.endereco);

    if (end) {
        end.contagem = count;
        end.status = count === end.saldoSistema ? 'OK' : 'DIVERGENTE';
        localStorage.setItem('wms_inventarios', JSON.stringify(inventarios));
        showToast(end.status === 'OK' ? 'Contagem OK!' : `Divergência: ${count} vs ${end.saldoSistema}`,
            end.status === 'OK' ? 'success' : 'warning');
    }

    window._invTarget = null;
    updateBadges();
    initInventarioScreen(document.getElementById('screen-inventario'));
};

window.cancelCount = function () {
    window._invTarget = null;
    initInventarioScreen(document.getElementById('screen-inventario'));
};


// ===================================
// SHARED UTILITIES
// ===================================

// Toast notification (mobile-style)
// Toast notification (mobile-style) with Feedback integration
function showToast(message, type = 'info') {
    // 1. Trigger Feedback (Audio/Visual)
    if (window.Feedback) {
        if (type === 'success') {
            window.Feedback.beep('success');
            window.Feedback.flash('success');
        } else if (type === 'danger') {
            window.Feedback.beep('error');
            window.Feedback.flash('error');
        } else if (type === 'warning') {
            window.Feedback.beep('error');
        }
    }

    // 2. Show Toast UI
    const existing = document.getElementById('mobileToast');
    if (existing) existing.remove();

    const icons = { success: 'check_circle', warning: 'warning', danger: 'error', info: 'info' };

    const toast = document.createElement('div');
    toast.id = 'mobileToast';
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-icons-round" style="font-size:1.2rem;">${icons[type]}</span> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}

// Update badge counts on home screen
function updateBadges() {
    const el = (id) => document.getElementById(id);

    // Receber badge
    const receipts = wmsData.getReceipts();
    const pendingReceipts = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA').length;
    if (el('badgeReceber')) {
        el('badgeReceber').textContent = pendingReceipts;
        el('badgeReceber').style.display = pendingReceipts > 0 ? 'flex' : 'none';
    }

    // Armazenar badge
    const putaway = JSON.parse(localStorage.getItem('wms_putaway') || '[]');
    const pendingPutaway = putaway.filter(t => t.status === 'PENDENTE').length;
    if (el('badgeArmazenar')) {
        el('badgeArmazenar').textContent = pendingPutaway;
        el('badgeArmazenar').style.display = pendingPutaway > 0 ? 'flex' : 'none';
    }

    // Separar badge
    const picking = JSON.parse(localStorage.getItem('wms_picking') || '[]');
    const pendingPicking = picking.filter(t => t.status === 'PENDENTE').length;
    if (el('badgeSeparar')) {
        el('badgeSeparar').textContent = pendingPicking;
        el('badgeSeparar').style.display = pendingPicking > 0 ? 'flex' : 'none';
    }

    // Inventário badge
    const inventarios = JSON.parse(localStorage.getItem('wms_inventarios') || '[]');
    const activeInv = inventarios.filter(i => i.status === 'EM ANDAMENTO');
    const pendingCount = activeInv.reduce((s, i) => s + i.enderecos.filter(e => e.status === 'PENDENTE').length, 0);
    if (el('badgeInventario')) {
        el('badgeInventario').textContent = pendingCount;
        el('badgeInventario').style.display = pendingCount > 0 ? 'flex' : 'none';
    }

    // Also update stats
    if (el('statPendentes')) el('statPendentes').textContent = pendingReceipts + pendingPutaway + pendingPicking;
}

// ===================================
// SCREEN INIT HOOK — Override placeholder injection
// ===================================
const _originalNavigateTo = window.navigateTo || navigateTo;

// Patch navigateTo to use real screens instead of placeholders
(function patchNavigation() {
    const origNav = window.navigateTo;
    window.navigateTo = function (screenId) {
        origNav(screenId);
        const container = document.getElementById(`screen-${screenId}`);
        if (!container) return;

        // Replace placeholder with real screen if available
        switch (screenId) {
            case 'recebimento':
                if (!window._recebimentoNF) initRecebimentoScreen(container);
                break;
            case 'armazenar':
                initArmazenarScreen(container);
                break;
            case 'separar':
                initSepararScreen(container);
                break;
            case 'inventario':
                initInventarioScreen(container);
                break;
            case 'home':
                updateBadges();
                break;
        }
    };
})();

// Add toast animation CSS
(function injectToastCSS() {
    const style = document.createElement('style');
    style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
    document.head.appendChild(style);
})();

// Init badges on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateBadges, 300);
});

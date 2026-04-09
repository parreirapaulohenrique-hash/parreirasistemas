// WMS Coletor — Inbound V2 (Desacoplado)
// Novo fluxo: Check-in (Portaria) -> Conferência Física (CD)

// ===================================
// 1. CHECK-IN DE PORTARIA
// ===================================

window.initCheckinScreen = function(container) {
    window._recNFDados = null;
    window._recEmpresa = null;
    window._recIsAvulsa = false;
    
    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid #ec4899;">
            <div class="m-card-header">
                <span style="font-weight:600;font-size:.95rem;color:#ec4899;">
                    <span class="material-icons-round" style="font-size:1.1rem;vertical-align:middle;">how_to_reg</span>
                    Check-in de Portaria
                </span>
            </div>
            <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:1rem;">
                Bipe a <strong>chave de acesso NF-e</strong> para registrar a chegada do veículo.
            </p>
            <div id="checkin-feedback" style="display:none;margin-bottom:1rem;"></div>
        </div>
    `;
};

window.handleScanCheckin = async function(code) {
    const clean = code.replace(/\D/g, '');
    if (clean.length === 44) {
        await _consultarEIniciarCheckin(clean);
    } else {
        _mostrarFeedbackCheckin('warning', 'Digite os 44 dígitos da chave NF-e.');
    }
};

function _mostrarFeedbackCheckin(tipo, html) {
    const fb = document.getElementById('checkin-feedback');
    if (!fb) return;
    const bg = tipo === 'warning' ? 'rgba(245,158,11,.1)' : (tipo === 'error' || tipo === 'danger') ? 'rgba(239,68,68,.1)' : 'rgba(14,165,233,.1)';
    const color = tipo === 'warning' ? '#f59e0b' : (tipo === 'error' || tipo === 'danger') ? '#ef4444' : '#0ea5e9';
    fb.style.display = 'block';
    fb.innerHTML = `<div style="background:${bg};color:${color};padding:.6rem .85rem;border-radius:6px;font-size:.82rem;">${html}</div>`;
}

async function _consultarEIniciarCheckin(chave) {
    _mostrarFeedbackCheckin('loading', 'Consultando ERP...');
    try {
        const res = await WmsProcedures.proc_buscar_nf_destinada(chave);
        if (res.found) {
            window._recNFDados = res.nf;
            window._recEmpresa = res.empresa;
            window._recIsAvulsa = false;
            Feedback.beep('success'); Feedback.flash('success');
            _renderizarFormularioCheckin();
        } else {
            _mostrarFeedbackCheckin('warning', 'NF não localizada. Operação avulsa indisponível aqui.');
            Feedback.beep('error'); Feedback.flash('error');
        }
    } catch (e) {
        _mostrarFeedbackCheckin('danger', 'Erro: ' + e.message);
    }
}

function _renderizarFormularioCheckin() {
    const nf = window._recNFDados;
    const emp = window._recEmpresa;
    const container = document.getElementById('screen-checkin');

    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <strong style="font-size:.95rem;">📦 Check-in — NF ${nf.numero}</strong>
            <button class="m-btn m-btn-outline" onclick="initCheckinScreen(document.getElementById('screen-checkin'))"
                style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span> Voltar
            </button>
        </div>

        <div style="background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.2);border-radius:8px;padding:.85rem;margin-bottom:1rem;">
            <div style="font-size:.65rem;font-weight:700;color:#0ea5e9;text-transform:uppercase;margin-bottom:.6rem;">✅ Dados Básicos</div>
            <div style="font-size:.82rem;display:flex;flex-direction:column;gap:.3rem;">
                <div><span style="color:var(--text-secondary);">NF:</span> <strong>${nf.numero} / Série ${nf.serie}</strong></div>
                <div><span style="color:var(--text-secondary);">Fornecedor:</span> <strong>${nf.razaoSocialEmitente}</strong></div>
            </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;">
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Doca *</label>
                <select id="rcheck-doca" class="m-input">${_docasHtml()}</select>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Placa do Veículo *</label>
                <input id="rcheck-placa" type="text" class="m-input" placeholder="AAA-0000" oninput="this.value=this.value.toUpperCase()">
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Motorista</label>
                <input id="rcheck-motorista" type="text" class="m-input" placeholder="Nome completo">
            </div>
        </div>

        <button class="m-btn m-btn-success" onclick="salvarCheckin()" style="font-size:.95rem;">
            <span class="material-icons-round">how_to_reg</span> Confirmar Check-in
        </button>
    `;
}

function _docasHtml() {
    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const docas = cfg.docas || ['DOCA-01','DOCA-02','DOCA-03'];
    return docas.map(d => `<option value="${d}">${d}</option>`).join('');
}

window.salvarCheckin = function() {
    const doca = document.getElementById('rcheck-doca')?.value;
    const placa = document.getElementById('rcheck-placa')?.value?.trim();
    if (!doca) { showToast('Selecione a Doca', 'warning'); return; }
    if (!placa) { showToast('Informe a placa do veículo', 'warning'); return; }

    const nf = window._recNFDados;
    const emp = window._recEmpresa;
    const user = JSON.parse(localStorage.getItem('logged_user') || '{}');

    const payload = {
        id: `CHK-${Date.now()}`,
        chaveNfe: nf.chaveNfe || '',
        nfNumero: nf.numero,
        nfSerie: nf.serie,
        fornecedor: nf.razaoSocialEmitente,
        cnpjFornecedor: nf.cnpjEmitente,
        empresaDestino: emp ? emp.razaoSocial : '',
        cnpjDestino: emp ? emp.cnpj : nf.cnpjDestinatario,
        doca: doca,
        placa: placa,
        motorista: document.getElementById('rcheck-motorista')?.value?.trim() || '',
        volumesNF: nf.volumes || 0,
        emailFornecedor: nf._raw?.emailFornecedor || '',
        itens: nf.itens || [],
        status: 'AGUARDANDO_CONFERENCIA',
        dataCheckin: new Date().toISOString(),
        operadorCheckin: user.name || user.login || 'Operador',
        _rf: window._recNFDados
    };

    const key = 'wms_receipts_v2';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(payload);
    localStorage.setItem(key, JSON.stringify(arr));

    Feedback.beep('success'); Feedback.flash('success');
    showToast('Check-in Concluído!', 'success');
    if (window.updateHomeStats) updateHomeStats();
    setTimeout(() => navigateTo('home'), 1000);
};

// ===================================
// 2. CONFERÊNCIA FÍSICA
// ===================================

window.initConferirScreen = function(container) {
    const key = 'wms_receipts_v2';
    const receipts = JSON.parse(localStorage.getItem(key) || '[]');
    const pending = receipts.filter(r => r.status === 'AGUARDANDO_CONFERENCIA').reverse();

    container.innerHTML = `
        <div class="m-card" style="border-left:3px solid #ec4899;margin-bottom:1rem;">
            <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:.5rem;color:#ec4899;">
                <span class="material-icons-round">qr_code_scanner</span>
                Bipe a NF na Doca para Conferir
            </div>
        </div>

        <div style="font-size:.85rem;font-weight:600;color:var(--text-secondary);margin-bottom:.75rem;">
            NFs Aguardando Conferência Física (${pending.length})
        </div>

        ${pending.length > 0 ? pending.map(r => `
            <div class="m-card" style="padding:.85rem;cursor:pointer;" onclick="iniciarConferenciaFisica('${r.id}')">
                <div style="display:flex;justify-content:space-between;align-items:start;">
                    <div>
                        <strong style="font-size:.9rem;">NF: ${r.nfNumero}</strong><br>
                        <span style="font-size:.75rem;color:var(--text-secondary);">${r.fornecedor}</span>
                    </div>
                    <span class="m-badge" style="background:rgba(236,72,153,.15);color:#ec4899;">DOCA</span>
                </div>
                <div style="margin-top:.5rem;font-size:.75rem;color:var(--text-secondary);display:flex;gap:1rem;">
                    <span><span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;">local_shipping</span> ${r.doca}</span>
                    <span><span class="material-icons-round" style="font-size:.8rem;vertical-align:middle;">format_list_numbered</span> Vol: ${r.volumesNF}</span>
                </div>
            </div>
        `).join('') : `
            <div style="text-align:center;padding:2rem 1rem;color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem;opacity:.3;">done_all</span>
                <p style="margin-top:.5rem;">Nenhuma nota aguardando conferência.</p>
            </div>
        `}
    `;
};

window.handleScanConferir = function(code) {
    const clean = code.replace(/\D/g, '');
    const key = 'wms_receipts_v2';
    const receipts = JSON.parse(localStorage.getItem(key) || '[]');
    const target = receipts.find(r => r.status === 'AGUARDANDO_CONFERENCIA' && 
                                     ((clean.length === 44 && r.chaveNfe === clean) || (clean.length < 44 && r.nfNumero == clean)));
    if (target) {
        iniciarConferenciaFisica(target.id);
    } else {
        Feedback.beep('error'); showToast('NF não encontrada na fila de Doca.', 'danger');
    }
};

window.iniciarConferenciaFisica = function(id) {
    window._confAtivoId = id;
    window._confFotosBuffer = [];
    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const r = receipts.find(x => x.id === id);
    if (!r) return;
    
    const container = document.getElementById('screen-conferir');

    const maxH = r.itens && r.itens.length > 3 ? '150px' : 'auto';
    const secaoItens = r.itens && r.itens.length > 0 ? `
        <div style="margin-top:.6rem;max-height:${maxH};overflow:auto;border-top:1px solid rgba(236,72,153,.2);padding-top:.5rem;">
            ${r.itens.map(i => `
            <div style="font-size:.75rem;display:flex;justify-content:space-between;padding:.2rem 0;">
                <span><span style="font-family:monospace;color:var(--text-secondary);">${i.sku}</span> ${i.descricao}</span>
                <strong>${i.quantidade} ${i.unidade || 'UN'}</strong>
            </div>`).join('')}
        </div>` : '';

    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <strong style="font-size:.95rem;color:#ec4899;">📦 Conferindo NF ${r.nfNumero}</strong>
            <button class="m-btn m-btn-outline" onclick="initConferirScreen(document.getElementById('screen-conferir'))"
                style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span> Voltar
            </button>
        </div>

        <div style="background:rgba(236,72,153,.07);border:1px solid rgba(236,72,153,.2);border-radius:8px;padding:.85rem;margin-bottom:1rem;">
            <div style="font-size:.82rem;display:flex;flex-direction:column;gap:.3rem;">
                <div><span style="color:var(--text-secondary);">Fornecedor:</span> <strong>${r.fornecedor}</strong></div>
                <div><span style="color:var(--text-secondary);">Doca:</span> <strong>${r.doca}</strong></div>
                <div><span style="color:var(--text-secondary);">Placa:</span> ${r.placa}</div>
            </div>
            ${secaoItens}
        </div>

        <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem;">
            <div style="display:flex;gap:.5rem;">
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Vol. NF</label>
                    <input type="number" class="m-input" value="${r.volumesNF || 0}" readonly style="background:rgba(0,0,0,.1);">
                </div>
                <div style="flex:1;">
                    <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Vol. Físico *</label>
                    <input id="cconf-vol-fis" type="number" class="m-input" min="0">
                </div>
            </div>
            <div>
                <label style="font-size:.72rem;color:var(--text-secondary);display:block;margin-bottom:.25rem;">Condição da Carga *</label>
                <select id="cconf-condicao" class="m-input" onchange="toggleDivConf()">
                    <option value="OK">✅ OK — Carga íntegra</option>
                    <option value="FALTA">⚠️ Falta de Volumes</option>
                    <option value="AVARIA_PARCIAL">⚠️ Avaria Parcial</option>
                    <option value="AVARIA_TOTAL">🚨 Avaria Total</option>
                    <option value="EXCESSO">📦 Excesso de Volumes</option>
                    <option value="LACRE_ROMPIDO">🔓 Lacre Rompido</option>
                </select>
            </div>
        </div>

        <div id="cconf-div-bloco" style="display:none;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:.85rem;margin-bottom:1rem;">
            <div style="display:flex;gap:.5rem;margin-bottom:.75rem;">
                <div style="flex:1;"><label style="font-size:.68rem;">Avariados</label><input id="cconf-avariados" type="number" class="m-input" value="0"></div>
                <div style="flex:1;"><label style="font-size:.68rem;">Faltantes</label><input id="cconf-faltantes" type="number" class="m-input" value="0"></div>
                <div style="flex:1;"><label style="font-size:.68rem;">Excesso</label><input id="cconf-excesso" type="number" class="m-input" value="0"></div>
            </div>
            <textarea id="cconf-desc" class="m-input" rows="2" placeholder="Descreva a avaria..."></textarea>
            
            <div style="margin-top:.5rem;">
                <label for="cconf-fotos" style="cursor:pointer;display:inline-flex;align-items:center;padding:.4rem .7rem;border:1px dashed var(--primary);border-radius:6px;font-size:.78rem;color:var(--primary);">
                    <span class="material-icons-round">add_a_photo</span> Adicionar Foto
                </label>
                <input id="cconf-fotos" type="file" accept="image/*" capture="environment" multiple style="display:none;" onchange="addFotoConf(this)">
                <div id="cconf-fotos-preview" style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem;"></div>
            </div>
        </div>

        <button class="m-btn m-btn-success" id="cconf-btn" onclick="salvarConferenciaFisica()">
            <span class="material-icons-round">fact_check</span> Finalizar Conferência
        </button>
    `;
};

window.toggleDivConf = function() {
    const cond = document.getElementById('cconf-condicao')?.value;
    document.getElementById('cconf-div-bloco').style.display = cond !== 'OK' ? 'block' : 'none';
};

window.addFotoConf = function(input) {
    Array.from(input.files).forEach(file => {
        if(window._confFotosBuffer.length >= 4) return;
        const reader = new FileReader();
        reader.onload = e => {
            window._confFotosBuffer.push(e.target.result);
            const div = document.createElement('div');
            div.innerHTML = `<img src="${e.target.result}" style="width:50px;height:50px;object-fit:cover;border-radius:5px;">`;
            document.getElementById('cconf-fotos-preview').appendChild(div);
        };
        reader.readAsDataURL(file);
    });
};

window.salvarConferenciaFisica = async function() {
    const volfis = parseInt(document.getElementById('cconf-vol-fis').value);
    if (isNaN(volfis)) { showToast('Informe os volumes físicos!', 'warning'); return; }

    const receipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const rIndex = receipts.findIndex(x => x.id === window._confAtivoId);
    if(rIndex === -1) return;
    const r = receipts[rIndex];
    
    r.volumesFisicos = volfis;
    r.condicaoCarga = document.getElementById('cconf-condicao').value;
    r.dataConferenciaMacro = new Date().toISOString();
    r.status = 'CONFERENCIA_ITENS_PENDENTE';
    
    if (r.condicaoCarga !== 'OK') {
        r.divergencia = {
            tipo: r.condicaoCarga,
            avariados: parseInt(document.getElementById('cconf-avariados').value)||0,
            faltantes: parseInt(document.getElementById('cconf-faltantes').value)||0,
            excesso: parseInt(document.getElementById('cconf-excesso').value)||0,
            desc: document.getElementById('cconf-desc').value,
            fotos: window._confFotosBuffer
        };
    }

    const btn = document.getElementById('cconf-btn');
    btn.disabled = true; btn.innerHTML = 'Processando...';

    try {
        // Apenas avança na esteira local, não notifica ERP ainda (salva para a etapa de Itens)
        receipts[rIndex] = r;
        localStorage.setItem('wms_receipts_v2', JSON.stringify(receipts));
        
        Feedback.beep('success'); Feedback.flash('success');
        showToast('Volumes confirmados! Aguardando Prod.', 'success');
        if (window.updateHomeStats) updateHomeStats();
        setTimeout(() => navigateTo('home'), 1000);
    } catch(e) {
        showToast(e.message, 'danger');
        btn.disabled = false; btn.innerHTML = 'Finalizar Conferência';
    }
};

// ===================================
// 3. PARÂMETROS / CONFIGURAÇÕES (MOBILE)
// ===================================

window.initConfigScreen = function(container) {
    const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
    const geral = cfg.geral || {};
    const pinSupervisor = cfg.seguranca?.pinSupervisor;
    
    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <strong style="font-size:.95rem;color:var(--primary);">⚙️ Parâmetros do WMS</strong>
            <button class="m-btn m-btn-outline" onclick="navigateTo('home')" style="font-size:.75rem;padding:.3rem .65rem;">
                <span class="material-icons-round" style="font-size:.9rem;">arrow_back</span>
            </button>
        </div>

        <div id="cfg-auth-container" style="background:#fff;border-radius:8px;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:1rem;">
            <p style="font-size:.8rem;color:var(--text-secondary);margin-bottom:.5rem;">Funções restritas. Digite o PIN do supervisor ou clique no botão para desbloquear (se não houver PIN configurado na plataforma).</p>
            <div style="display:flex;gap:.5rem;">
                <input id="cfg-pin-input" type="password" class="m-input" placeholder="PIN" style="flex:1;">
                <button class="m-btn m-btn-primary" onclick="window.unlockConfigMobile()">Desbloquear</button>
            </div>
            <div id="cfg-pin-feedback" style="color:#ef4444;font-size:.75rem;margin-top:.5rem;"></div>
        </div>

        <div id="cfg-panel" style="display:none;background:#fff;border-radius:8px;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.1);">
            <div style="font-weight:600;font-size:.85rem;margin-bottom:.8rem;color:var(--text-primary);display:flex;align-items:center;gap:.3rem;">
                <span class="material-icons-round" style="font-size:1rem;color:var(--primary);">visibility_off</span>
                Contagem Cega
            </div>
            <p style="font-size:.75rem;color:var(--text-secondary);margin-bottom:1rem;">
                Se ativado, o operador de conferência não verá a quantidade esperada dos produtos.
            </p>
            
            <label class="switch" style="margin-bottom:1.5rem;display:inline-block;">
                <input id="cfg-blind-toggle" type="checkbox" ${geral.contagemCega !== false ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>

            <button class="m-btn m-btn-success" onclick="window.saveConfigMobile()" style="width:100%;">
                <span class="material-icons-round">save</span> Salvar Alterações
            </button>
        </div>
    `;

    window.unlockConfigMobile = function() {
        const pinDigitado = document.getElementById('cfg-pin-input').value.trim();
        const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
        const pinMaster = cfg.seguranca?.pinSupervisor;
        
        if (pinMaster && pinMaster !== pinDigitado) {
            document.getElementById('cfg-pin-feedback').textContent = 'PIN Incorreto.';
            return;
        }
        
        document.getElementById('cfg-auth-container').style.display = 'none';
        document.getElementById('cfg-panel').style.display = 'block';
    };

    window.saveConfigMobile = function() {
        const blind = document.getElementById('cfg-blind-toggle').checked;
        const cfg = JSON.parse(localStorage.getItem('wms_config') || '{}');
        if (!cfg.geral) cfg.geral = {};
        cfg.geral.contagemCega = blind;
        localStorage.setItem('wms_config', JSON.stringify(cfg));
        
        showToast('Configurações salvas.', 'success');
        setTimeout(() => navigateTo('home'), 1000);
    };
};

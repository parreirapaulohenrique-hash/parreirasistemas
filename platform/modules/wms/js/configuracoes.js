// ===========================================
// WMS Configurações
// cfg-geral, cfg-armazenagem, cfg-separacao,
// cfg-etiqueta, cfg-integracao
// ===========================================

window.loadConfigView = function (viewId) {
    const container = document.getElementById('view-dynamic');
    if (!container) return;

    switch (viewId) {
        case 'cfg-geral': renderCfgGeral(container); break;
        case 'cfg-armazenagem': renderCfgArmazenagem(container); break;
        case 'cfg-separacao': renderCfgSeparacao(container); break;
        case 'cfg-etiqueta': renderCfgEtiqueta(container); break;
        case 'cfg-integracao': renderCfgIntegracao(container); break;
    }
};

const WMS_CONFIG_KEY = 'wms_config';
function getWmsConfig() { return JSON.parse(localStorage.getItem(WMS_CONFIG_KEY) || '{}'); }
function saveWmsConfig(cfg) { localStorage.setItem(WMS_CONFIG_KEY, JSON.stringify(cfg)); }

// ========================
// 1. CONFIGURAÇÕES GERAIS
// ========================
function renderCfgGeral(container) {
    const cfg = getWmsConfig();
    const g = cfg.geral || {};

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">settings</span>
                    Configurações Gerais
                </h3>
                <button class="btn btn-primary" onclick="salvarCfgGeral()">
                    <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar
                </button>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">Nome do Armazém</label>
                        <input type="text" id="cfgNomeArmazem" class="form-input" style="width:100%;" value="${g.nomeArmazem || 'CD Parreira'}">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">Código do CD</label>
                        <input type="text" id="cfgCodigoCD" class="form-input" style="width:100%;" value="${g.codigoCD || 'CD-01'}">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">Fuso Horário</label>
                        <select id="cfgFuso" class="form-input" style="width:100%;">
                            <option value="America/Belem" ${g.fuso === 'America/Belem' ? 'selected' : ''}>Belém (GMT-3)</option>
                            <option value="America/Sao_Paulo" ${g.fuso === 'America/Sao_Paulo' ? 'selected' : ''}>São Paulo (GMT-3)</option>
                            <option value="America/Manaus" ${g.fuso === 'America/Manaus' ? 'selected' : ''}>Manaus (GMT-4)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">Área Total (m²)</label>
                        <input type="number" id="cfgArea" class="form-input" style="width:100%;" value="${g.area || 5000}">
                    </div>
                </div>
                <hr style="border-color:var(--border-color); margin:1.5rem 0;">
                <h4 style="font-size:0.85rem; margin-bottom:1rem;">Opções Operacionais</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                    ${[
            ['cfgContagemCega', 'Contagem Cega no Recebimento', g.contagemCega !== false],
            ['cfgGerarLPN', 'Gerar LPN Automático', g.gerarLPN !== false],
            ['cfgConfSaidaObrig', 'Conferência de Saída Obrigatória', g.confSaidaObrig !== false],
            ['cfgWavePicking', 'Separação por Ondas', g.wavePicking !== false],
            ['cfgFIFO', 'FIFO na Separação', g.fifo !== false],
            ['cfgCrossDock', 'Permitir Cross-Docking', g.crossDock || false],
            ['cfgNotifEmail', 'Notificações por E-mail', g.notifEmail || false],
            ['cfgLogOperacoes', 'Log de Operações Detalhado', g.logOperacoes !== false]
        ].map(([id, label, checked]) => `
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.85rem;">
                            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--wms-primary);">
                            ${label}
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

window.salvarCfgGeral = function () {
    const cfg = getWmsConfig();
    cfg.geral = {
        nomeArmazem: document.getElementById('cfgNomeArmazem').value,
        codigoCD: document.getElementById('cfgCodigoCD').value,
        fuso: document.getElementById('cfgFuso').value,
        area: Number(document.getElementById('cfgArea').value),
        contagemCega: document.getElementById('cfgContagemCega').checked,
        gerarLPN: document.getElementById('cfgGerarLPN').checked,
        confSaidaObrig: document.getElementById('cfgConfSaidaObrig').checked,
        wavePicking: document.getElementById('cfgWavePicking').checked,
        fifo: document.getElementById('cfgFIFO').checked,
        crossDock: document.getElementById('cfgCrossDock').checked,
        notifEmail: document.getElementById('cfgNotifEmail').checked,
        logOperacoes: document.getElementById('cfgLogOperacoes').checked
    };
    saveWmsConfig(cfg);
    alert('✅ Configurações gerais salvas!');
};

// ========================
// 2. REGRAS DE ARMAZENAGEM
// ========================
function renderCfgArmazenagem(container) {
    const cfg = getWmsConfig();
    const regras = cfg.armazenagem || [];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">shelves</span>
                    Regras de Armazenagem
                </h3>
                <button class="btn btn-primary" onclick="addRegraArm()">
                    <span class="material-icons-round" style="font-size:1rem;">add</span> Nova Regra
                </button>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr>
                        <th>Prioridade</th><th>Critério</th><th>Condição</th><th>Ação</th><th>Destino</th><th>Ações</th>
                    </tr></thead>
                    <tbody>
                        ${regras.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhuma regra configurada — usando FIFO padrão</td></tr>' :
            regras.map((r, i) => `
                            <tr>
                                <td style="text-align:center;">${r.prioridade || (i + 1)}</td>
                                <td>${r.criterio || '-'}</td>
                                <td>${r.condicao || '-'}</td>
                                <td>${r.acao || '-'}</td>
                                <td><strong>${r.destino || '-'}</strong></td>
                                <td style="text-align:center;">
                                    <button class="btn btn-secondary btn-icon" onclick="removeRegraArm(${i})" style="padding:0.3rem;">
                                        <span class="material-icons-round" style="font-size:1rem; color:var(--danger);">delete</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card" style="margin-top:1rem;">
            <div class="card-header"><h3 style="font-size:0.9rem;">Estratégias Ativas</h3></div>
            <div style="padding:1rem; display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem;">
                ${['FIFO (Primeiro a Entrar)', 'Proximidade (Next Empty)', 'Curva ABC (A→Piso, C→Pulmão)', 'Peso (Pesado→Baixo)', 'Volume (Grande→Blocado)', 'Grupo (Mesma Família)'].map((s, i) => `
                    <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; cursor:pointer;">
                        <input type="checkbox" ${i < 3 ? 'checked' : ''} style="accent-color:var(--wms-primary);">
                        ${s}
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

window.addRegraArm = function () {
    const cfg = getWmsConfig();
    if (!cfg.armazenagem) cfg.armazenagem = [];
    cfg.armazenagem.push({
        prioridade: cfg.armazenagem.length + 1,
        criterio: 'Grupo de Produto',
        condicao: 'Igual a "Lubrificantes"',
        acao: 'Direcionar',
        destino: 'Rua A, Piso'
    });
    saveWmsConfig(cfg);
    renderCfgArmazenagem(document.getElementById('view-dynamic'));
};

window.removeRegraArm = function (idx) {
    const cfg = getWmsConfig();
    cfg.armazenagem.splice(idx, 1);
    saveWmsConfig(cfg);
    renderCfgArmazenagem(document.getElementById('view-dynamic'));
};

// ========================
// 3. REGRAS DE SEPARAÇÃO
// ========================
function renderCfgSeparacao(container) {
    const cfg = getWmsConfig();
    const sep = cfg.separacao || {};

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">shopping_cart</span>
                    Regras de Separação
                </h3>
                <button class="btn btn-primary" onclick="salvarCfgSep()">
                    <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar
                </button>
            </div>
            <div style="padding:1.5rem; display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div>
                    <label class="form-label-cfg">Método de Separação</label>
                    <select id="cfgMetodoSep" class="form-input" style="width:100%;">
                        ${['Por Onda', 'Por Pedido', 'Por Zona', 'Batch Picking', 'Cluster Picking'].map(m =>
        `<option ${sep.metodo === m ? 'selected' : ''}>${m}</option>`
    ).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label-cfg">Máx. Pedidos por Onda</label>
                    <input type="number" id="cfgMaxPedOndas" class="form-input" style="width:100%;" value="${sep.maxPedOnda || 20}">
                </div>
                <div>
                    <label class="form-label-cfg">Prioridade de Rota</label>
                    <select id="cfgRotaSep" class="form-input" style="width:100%;">
                        ${['Menor Caminho', 'Serpentina', 'Zona Fixa', 'Prioridade ABC'].map(m =>
        `<option ${sep.rota === m ? 'selected' : ''}>${m}</option>`
    ).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label-cfg">Reserva Automática</label>
                    <select id="cfgReserva" class="form-input" style="width:100%;">
                        <option ${sep.reserva === 'Imediata' ? 'selected' : ''}>Imediata</option>
                        <option ${sep.reserva === 'Na Formação da Onda' ? 'selected' : ''}>Na Formação da Onda</option>
                        <option ${sep.reserva === 'Manual' ? 'selected' : ''}>Manual</option>
                    </select>
                </div>
            </div>
            <div style="padding:0 1.5rem 1.5rem;">
                <h4 style="font-size:0.85rem; margin-bottom:0.75rem;">Opções</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                    ${[
            ['cfgShortPicking', 'Permitir Short Picking', sep.shortPicking || false],
            ['cfgSubstituicao', 'Sugerir Substituição (falta)', sep.substituicao || false],
            ['cfgRecontagem', 'Recontagem em Divergência', sep.recontagem !== false],
            ['cfgBipObrig', 'Bipagem Obrigatória', sep.bipObrig !== false]
        ].map(([id, label, checked]) => `
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.85rem;">
                            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="accent-color:var(--wms-primary);">
                            ${label}
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

window.salvarCfgSep = function () {
    const cfg = getWmsConfig();
    cfg.separacao = {
        metodo: document.getElementById('cfgMetodoSep').value,
        maxPedOnda: Number(document.getElementById('cfgMaxPedOndas').value),
        rota: document.getElementById('cfgRotaSep').value,
        reserva: document.getElementById('cfgReserva').value,
        shortPicking: document.getElementById('cfgShortPicking').checked,
        substituicao: document.getElementById('cfgSubstituicao').checked,
        recontagem: document.getElementById('cfgRecontagem').checked,
        bipObrig: document.getElementById('cfgBipObrig').checked
    };
    saveWmsConfig(cfg);
    alert('✅ Regras de separação salvas!');
};

// ========================
// 4. LAYOUT DE ETIQUETA
// ========================
function renderCfgEtiqueta(container) {
    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">label</span>
                    Layout de Etiqueta
                </h3>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem;">
                    ${[
            ['Endereço', 'qr_code', '100×50mm', 'QR Code + Rua/Prédio/Apto'],
            ['Palete (LPN)', 'qr_code_2', '100×75mm', 'Cód. Barras 128 + SKU + Qtd'],
            ['Produto', 'label', '50×25mm', 'EAN-13 + Descrição curta'],
            ['Volume Expedição', 'package_2', '150×100mm', 'Destino + Peso + Lacre'],
            ['Romaneio', 'receipt_long', 'A4', 'Lista de NFs + Volumes'],
            ['Inventário', 'checklist', '100×50mm', 'Endereço + Último SKU']
        ].map(([nome, icon, tamanho, desc]) => `
                        <div class="card" style="text-align:center; padding:1.5rem; cursor:pointer; transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--wms-primary)'" onmouseout="this.style.borderColor=''">
                            <span class="material-icons-round" style="font-size:2rem; color:var(--wms-primary); display:block; margin-bottom:0.5rem;">${icon}</span>
                            <strong style="font-size:0.9rem;">${nome}</strong>
                            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">${tamanho}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">${desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// ========================
// 5. INTEGRAÇÕES
// ========================
function renderCfgIntegracao(container) {
    const intStatus = [
        { nome: 'ERP Parreira', tipo: 'Bidirecional', status: 'ativo', icon: 'sync', ultimaSync: new Date().toLocaleString('pt-BR') },
        { nome: 'NF-e SEFAZ', tipo: 'Saída', status: 'ativo', icon: 'receipt_long', ultimaSync: '—' },
        { nome: 'Transportadora API', tipo: 'Saída', status: 'inativo', icon: 'local_shipping', ultimaSync: '—' },
        { nome: 'Coletor Mobile', tipo: 'Bidirecional', status: 'ativo', icon: 'phone_android', ultimaSync: new Date().toLocaleString('pt-BR') }
    ];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h3 style="font-size:0.95rem; font-weight:600;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">hub</span>
                    Integrações
                </h3>
            </div>
            <div style="padding:1rem;">
                ${intStatus.map(int => `
                    <div class="card" style="margin-bottom:0.75rem; border-left:3px solid ${int.status === 'ativo' ? 'var(--success)' : 'var(--text-secondary)'};">
                        <div style="padding:1rem; display:flex; align-items:center; gap:1rem;">
                            <span class="material-icons-round" style="font-size:1.5rem; color:${int.status === 'ativo' ? 'var(--wms-primary)' : 'var(--text-secondary)'};">${int.icon}</span>
                            <div style="flex:1;">
                                <strong style="font-size:0.9rem;">${int.nome}</strong>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${int.tipo} · Última sync: ${int.ultimaSync}</div>
                            </div>
                            <span class="badge ${int.status === 'ativo' ? 'badge-success' : 'badge-secondary'}">${int.status}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

console.log('⚙️ WMS Configurações carregadas');

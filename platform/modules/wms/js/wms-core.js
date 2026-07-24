// WMS Core Logic
// Navigation, Auth, Submenu Control, Dynamic View Loading

const WMS_VERSION = '3.4.0';

// =============================================================================
// getTenantSuffix — definida no nivel do modulo para estar disponivel
// sincronamente para TODOS os scripts WMS antes do DOMContentLoaded.
// Retorna '_centralpecas' para o tenant 'centralpecas', '' se sem tenant.
// =============================================================================
window.getTenantSuffix = function () {
    try {
        const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
        const tid  = sess?.tenantId || '';
        return tid ? '_' + tid : '';
    } catch (e) { return ''; }
};

// --- Submenu Toggle e SwitchView definidos ANTES do DOMContentLoaded ---
// Garante disponibilidade mesmo que haja erro em codigo posterior
window.toggleSubmenu = function (id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = (el.style.display === 'flex' || el.style.display === 'block') ? 'none' : 'flex';
    }
};

// --- Auth & Tenant Check ---
document.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('logged_user');
    if (!savedUser) {
        window.location.href = '../../login.html';
        return;
    }

    const user = JSON.parse(savedUser);
    document.getElementById('userName').textContent = user.name || user.login;
    document.getElementById('userTenant').textContent = user.tenantId || (window.ParreiraAuth?.getSessao?.()?.tenantNome) || 'Tenant';

    // ── Garante que Firebase esteja inicializado (auth.js tem lazy init) ──────
    // Sem isso, wms-store e wms-sync recebem "No Firebase App [DEFAULT]" error
    try { if (window.ParreiraAuth?.getDB) window.ParreiraAuth.getDB(); } catch(e) {}

    // ── Abre o dashboard IMEDIATAMENTE (antes de qualquer await ou Firestore) ──
    // Garante que a UI carregue mesmo que algum código posterior lance erro.
    try { switchView('dashboard'); } catch(e) {}

    // --- WMS Integration Init ---
    if (window.WmsIntegration) {
        const intConfig = JSON.parse(localStorage.getItem('wms_integration_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
        window.WmsIntegration.init(intConfig);

        // Dynamic Branding (Store Name)
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
        const storeName = wmsConfig.geral?.nomeArmazem || 'WMS';

        const titleEl = document.getElementById('wmsTitle');
        if (titleEl) titleEl.innerText = storeName;

        const pageTitle = document.getElementById('pageTitleTag');
        if (pageTitle) pageTitle.innerText = `${storeName} | Gestão de Armazém`;

        // Sync Products from ERP Master on startup
        window.WmsIntegration.sync('products').then(res => {
            if (res.status === 'ok' && Array.isArray(res.data)) {
                const cads = JSON.parse(localStorage.getItem('wms_cadastros' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
                cads.produtos = res.data;
                localStorage.setItem('wms_cadastros' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(cads));
                console.log('📦 Produtos sincronizados do ERP Master:', res.data.length);
            }
        });
    }

    // ─── Firestore: carregar configs WMS do tenant (provisionadas pelo Admin Master) ──
    // Garante que as configurações sobrevivam limpeza de cache e troca de dispositivo.
    const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
    let tenantId = sess?.tenantId || sess?.tenant || null;
    if (!tenantId && typeof Utils !== 'undefined' && Utils.getTenant) {
        tenantId = Utils.getTenant();
    }
    if (!tenantId) {
        const match = window.location.pathname.match(/\/wms\/([^\/]+)/);
        if (match) tenantId = match[1].replace('_hml', '');
    }
    if (tenantId && typeof firebase !== 'undefined') {
        const _ts = (window.getTenantSuffix ? window.getTenantSuffix() : `_${tenantId}`);
        try {
            const db = firebase.firestore();
            const [intSnap, cfgSnap, armSnap] = await Promise.all([
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').get(),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('config').get(),
                db.collection('tenants').doc(tenantId).collection('wms_config').doc('armazem').get()
            ]);

            // Integração Maxdata: preenche localStorage com as credenciais do tenant
            if (intSnap.exists) {
                const intData = intSnap.data();
                const existingInt = JSON.parse(localStorage.getItem('wms_integration_config' + _ts) || '{}');
                // Só sobrescreve se o Firestore tiver dados mais recentes ou localStorage estiver vazio
                if (!existingInt.connectorId || new Date(intData.updatedAt) > new Date(existingInt.updatedAt || 0)) {
                    localStorage.setItem('wms_integration_config' + _ts, JSON.stringify({
                        connectorId:     intData.connectorId || 'maxdata',
                        connectorConfig: { baseUrl: intData.baseUrl, empId: intData.empId, terminal: intData.terminal },
                        updatedAt:       intData.updatedAt
                    }));
                    // Re-inicializa a integração com as credenciais corretas do tenant
                    if (window.WmsIntegration) {
                        const newCfg = JSON.parse(localStorage.getItem('wms_integration_config' + _ts) || '{}');
                        window.WmsIntegration.init(newCfg);
                        if (window.WmsMaxdataPoller) window.WmsMaxdataPoller.restore();
                    }
                    console.log(`🔐 [WMS] Configuração Maxdata carregada do Firestore para tenant: ${tenantId}`);
                }
            } else if (tenantId && tenantId.startsWith('centralpecas')) {
                // Fallback automático para Central Peças (Filial Redenção - empId: 5)
                const defaultConfig = {
                    connectorId: 'maxdata',
                    connectorConfig: {
                        baseUrl: 'http://rds.skytins.com.br:8720/v2',
                        empId: 5,
                        terminal: '364F64E6539974C1D75C8A46C14B2D3D'
                    },
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem('wms_integration_config' + _ts, JSON.stringify(defaultConfig));
                if (window.WmsIntegration) {
                    window.WmsIntegration.init(defaultConfig);
                    if (window.WmsMaxdataPoller) window.WmsMaxdataPoller.restore();
                }
                console.log(`🔐 [WMS] Configuração padrão Maxdata (empId: 5 - Redenção) aplicada para tenant: ${tenantId}`);
            }

            // Config geral (CNPJs, etc.)
            if (cfgSnap.exists) {
                const cfgData = cfgSnap.data();
                const existingCfg = JSON.parse(localStorage.getItem('wms_config' + _ts) || '{}');
                if (!existingCfg.cnpjs && cfgData.cnpjs) {
                    existingCfg.cnpjs = cfgData.cnpjs;
                    localStorage.setItem('wms_config' + _ts, JSON.stringify(existingCfg));
                    console.log(`📋 [WMS] CNPJs carregados do Firestore: ${cfgData.cnpjs.length} empresa(s)`);
                }
            }

            // Config do armazém
            if (armSnap.exists) {
                const armData = armSnap.data();
                const existingArm = JSON.parse(localStorage.getItem('wms_armazem_config' + _ts) || '{}');
                if (!Object.keys(existingArm).length) {
                    localStorage.setItem('wms_armazem_config' + _ts, JSON.stringify(armData));
                    console.log(`🏭 [WMS] Config do armazém carregada do Firestore`);
                }
            }
        } catch(e) {
            console.warn('[WMS] Firestore config sync falhou (modo offline?):', e.message);
        }
    }

    // ─── Ativa WmsSync: espelha localStorage ↔ Firestore em tempo real ─────────
    try {
        if (window.WmsSync) {
            WmsSync.init().then(() => {
                const syncBadge = document.getElementById('wms-sync-status');
                if (syncBadge) {
                    syncBadge.innerHTML = `<span class="material-icons-round" style="font-size:.9rem;color:#10b981;">cloud_done</span>
                        <span style="color:#10b981;font-size:.72rem;">Cloud Sync Ativo</span>`;
                }
            }).catch(e => console.warn('[WmsSync] init:', e.message));
        }
    } catch(e) { console.warn('[WmsSync] falhou silenciosamente:', e.message); }

    // 🟢 Cloud Listener: Iniciar escuta de Novos Pedidos do ERP no Firebase
        if (typeof firebase !== 'undefined' && user.tenant) {
            console.log('📡 WMS Cloud Listener ativo para fila de Pedidos (Tenant: ' + user.tenant + ')');

            const db = firebase.firestore();
            db.collection('tenants').doc(user.tenant).collection('wms_pedidos')
                .onSnapshot(snapshot => {
                    let pedidosCloud = [];
                    snapshot.forEach(doc => {
                        pedidosCloud.push(doc.data());
                    });

                    // Atualizar o cache local blindado que alimenta a tela de "Ondas de Separação"
                    localStorage.setItem('wms_pedidos' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(pedidosCloud));

                    // Se a tela de picking estiver ativa, forçar re-render para mostrar imediato
                    if (document.getElementById('view-picking') && document.getElementById('view-picking').style.display === 'block') {
                        if (window.PickingManager && window.PickingManager.renderWavesGrid) {
                            window.PickingManager.renderWavesGrid();
                        }
                    }
                }, err => {
                    console.error('Erro na escuta de Pedidos Cloud:', err);
                });
        }

    // --- Migração automática ampla: recupera endereços de QUALQUER chave wms_mock_data* ---
    (function migrateWmsData() {
        try {
            const suf    = (window.getTenantSuffix ? window.getTenantSuffix() : '');
            if (!suf) return;
            const keyNew = 'wms_mock_data' + suf;

            // Se o tenant atual já tem dados, não faz nada
            const existing = JSON.parse(localStorage.getItem(keyNew) || '[]');
            if (Array.isArray(existing) && existing.length > 0) return;

            // Varre TODAS as chaves wms_mock_data* e escolhe a que tem mais endereços
            let bestKey  = null;
            let bestData = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith('wms_mock_data')) continue;
                if (k === keyNew) continue; // ignora destino
                try {
                    const d = JSON.parse(localStorage.getItem(k) || '[]');
                    if (Array.isArray(d) && d.length > bestData.length) {
                        bestData = d;
                        bestKey  = k;
                    }
                } catch(e) {}
            }

            if (bestData.length > 0) {
                localStorage.setItem(keyNew, JSON.stringify(bestData));
                console.warn('[WMS Migration] ' + bestData.length + ' enderecos migrados de "' + bestKey + '" para "' + keyNew + '"');
            }
        } catch(e) { console.warn('[WMS Migration] Erro:', e); }
    })();

    // --- Firebase Endereços Sync ---
    if (window.WmsStore && typeof firebase !== 'undefined') {
        (async () => {
            try {
                _updateSyncStatus('syncing');
                const count = await WmsStore.sincronizarEnderecos();
                if (count === 0) {
                    // Firestore vazio: migrar do localStorage
                    const res = await WmsStore.migrarEnderecos();
                    if (res.status === 'ok') {
                        _updateSyncStatus('ok', `${res.count} end. enviados`);
                    } else {
                        _updateSyncStatus('ok', 'offline mode');
                    }
                } else if (count > 0) {
                    _updateSyncStatus('ok', `${count} end.`);
                } else {
                    _updateSyncStatus('warn');
                }

                // Listener tempo real: Firestore → localStorage
                // NUNCA sobrescreve localStorage com array vazio (evita race com migração)
                let _syncDebounce = null;
                const unsub = WmsStore.ouvirEnderecos(addrs => {
                    if (!Array.isArray(addrs) || addrs.length === 0) return;
                    clearTimeout(_syncDebounce);
                    _syncDebounce = setTimeout(() => {
                        // Atualiza direto na memória se a tela de endereços estiver aberta
                        if (window.locationsState) {
                            window.locationsState.gridData = addrs;
                        }
                        // Tenta salvar local, se não der, segue o jogo (usa a memória apenas)
                        try {
                            const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
                            localStorage.setItem('wms_mock_data' + suf, JSON.stringify(addrs));
                        } catch(qe) {}
                        
                        if (document.getElementById('view-dashboard') && document.getElementById('view-dashboard').style.display !== 'none') {
                            if (window.WMS3D && window.WMS3D.updateData) {
                                WMS3D.updateData();
                                // Note: We do NOT call loadDashboardView() here because it would rebuild the DOM and reset the camera.
                                // Real-time KPI updates can be added later if needed.
                            } else if (window.loadDashboardView) {
                                loadDashboardView();
                            }
                        }
                    }, 600);
                });
                window.wmsEnderecosSyncUnsubscribe = unsub;
            } catch(e) {
                console.warn('[WMS Cloud Sync] Endereços:', e);
                _updateSyncStatus('error');
            }
        })();
    }

    // switchView('dashboard') ja foi chamado no inicio do DOMContentLoaded
});

// --- Submenu Toggle (mantido aqui para referencia, definido no topo) ---
// window.toggleSubmenu ja foi definido acima

// --- View title mapping ---
const VIEW_TITLES = {
    'dashboard': 'Visão Geral',
    // Cadastros
    'cad-usuarios': 'Cadastro de Usuário',
    'cad-perfil-senha': 'Perfil de Segurança de Senha',
    'cad-tipo-empresa': 'Tipo de Empresa',
    'cad-filial': 'Filial',
    'cad-cliente': 'Cliente',
    'cad-fornecedor': 'Fornecedor',
    'cad-setor': 'Setor Executante',
    'cad-contato': 'Contato',
    'cad-etiquetas': 'Etiquetas',
    'cad-motivo-transf': 'Motivo de Transferência',
    'cad-prod-grupo': 'Grupo de Produtos',
    'cad-prod-subgrupo': 'Sub-Grupo de Produtos',
    'cad-prod-familia': 'Família de Produtos',
    'cad-prod-cadastro': 'Cadastro de Produto',
    'cad-end-tipo': 'Tipo de Endereço',
    'cad-end-cadastro': 'Endereçamento',
    'cad-rec-tipo-nf': 'Tipo de Nota Fiscal',
    'cad-rec-regras': 'Regras de Recebimento',
    'cad-exp-doca': 'Docas',
    'cad-exp-transportadora': 'Transportadora',
    'cad-os-tipo': 'Tipo de Ordem de Serviço',
    'cad-os-prioridade': 'Prioridade',
    // Relatórios Manutenção
    'relm-endereco-vazio': 'Endereços Vazios',
    'relm-endereco-bloqueado': 'Endereços Bloqueados',
    'relm-produto-sem-end': 'Produtos sem Endereço',
    'relm-curva-abc': 'Curva ABC',
    'relm-ocupacao': 'Ocupação por Rua',
    'relm-parametros': 'Parâmetros de Armazenagem',
    'relm-auditoria-cadastro': 'Auditoria de Cadastros',
    // Relatórios Operação
    'relo-recebimento': 'Recebimentos do Dia',
    'relo-armazenagem': 'Armazenagens Pendentes',
    'relo-separacao': 'Separações do Dia',
    'relo-expedicao': 'Expedições do Dia',
    'relo-produtividade': 'Produtividade Operador',
    'relo-divergencias': 'Divergências',
    'relo-movimentacao': 'Movimentação (Kardex)',
    // Entrada
    'ent-agendamento': 'Agendamento de Doca',
    'ent-recebimento': 'Recebimento de NF',
    'ent-conferencia': 'Conferência',
    'ent-armazenagem': 'Armazenagem (Putaway)',
    'ent-devolucao': 'Devolução de Cliente',
    'divergencias': 'Controle de Divergências',
    // Estoque
    'est-consulta': 'Consulta de Estoque',
    'est-endereco': 'Consulta por Endereço',
    'est-transferencia': 'Transferência de Endereço',
    'est-bloqueio': 'Bloqueio / Quarentena',
    'est-inventario': 'Inventário',
    'est-ajuste': 'Ajuste de Estoque',
    // Saída
    'sai-ondas': 'Formação de Ondas',
    'sai-separacao': 'Separação (Picking)',
    'sai-conferencia': 'Conferência de Saída',
    'sai-embalagem': 'Embalagem (Packing)',
    'sai-romaneio': 'Romaneio',
    'sai-expedicao': 'Expedição',
    // Auditoria
    'aud-inventario': 'Inventário Cíclico',
    'aud-contagem': 'Contagem Rotativa',
    'aud-divergencias': 'Divergências',
    'aud-rastreio': 'Rastreabilidade (Kardex)',
    'aud-log': 'Log de Operações',
    // Configurações
    'cfg-geral': 'Configurações Gerais',
    'cfg-armazenagem': 'Regras de Armazenagem',
    'cfg-separacao': 'Regras de Separação',
    'cfg-etiqueta': 'Layout de Etiqueta',
    'cfg-integracao': 'Integrações',
    'cfg-galpao': 'Configuração Física do Galpão',
};

// Map view IDs to parent categories for breadcrumb
const VIEW_PARENTS = {};
Object.keys(VIEW_TITLES).forEach(k => {
    if (k.startsWith('cad-')) VIEW_PARENTS[k] = 'Cadastros';
    else if (k.startsWith('relm-')) VIEW_PARENTS[k] = 'Rel. Manutenção';
    else if (k.startsWith('relo-')) VIEW_PARENTS[k] = 'Rel. Operação';
    else if (k.startsWith('ent-')) VIEW_PARENTS[k] = 'Entrada de Produtos';
    else if (k === 'divergencias')  VIEW_PARENTS[k] = 'Entrada de Produtos';
    else if (k.startsWith('est-')) VIEW_PARENTS[k] = 'Estoque';
    else if (k.startsWith('sai-')) VIEW_PARENTS[k] = 'Saída de Produtos';
    else if (k.startsWith('aud-')) VIEW_PARENTS[k] = 'Auditoria';
    else if (k.startsWith('cfg-')) VIEW_PARENTS[k] = 'Configurações';
    else VIEW_PARENTS[k] = 'WMS';
});

// --- Existing view loaders + aliases ---
const VIEW_ALIASES = {
    'cad-end-cadastro': 'locations',  // Endereçamento uses existing locations.js
    'ent-recebimento': 'inbound',     // Recebimento uses existing inbound.js
};

// --- Navigation ---
function switchView(viewId) {
    // Check alias
    const resolvedId = VIEW_ALIASES[viewId] || viewId;

    // Hide all views
    document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');

    // Try to find dedicated container
    let target = document.getElementById(`view-${resolvedId}`);

    // If no dedicated container, use dynamic
    if (!target) {
        target = document.getElementById('view-dynamic');
        if (target) {
            target.innerHTML = '';
            target.setAttribute('data-view', viewId);
        }
    }

    if (target) {
        target.style.display = 'block';

        // Update breadcrumb
        const parent = VIEW_PARENTS[viewId] || 'WMS';
        const title = VIEW_TITLES[viewId] || viewId;
        document.getElementById('breadParent').textContent = parent;
        document.getElementById('pageTitle').textContent = title;

        // Highlight active submenu item
        document.querySelectorAll('.nav-sub-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.nav-sub-item[onclick="switchView('${viewId}')"]`);
        if (activeItem) activeItem.classList.add('active');

        // Highlight active nav-item (dashboard only)
        document.querySelectorAll('.nav-item').forEach(el => {
            if (!el.classList.contains('has-submenu')) el.classList.remove('active');
        });
        if (viewId === 'dashboard') {
            const dashItem = document.querySelector(`.nav-item[onclick="switchView('dashboard')"]`);
            if (dashItem) dashItem.classList.add('active');
        }

        // WMS View Registry - Maps view IDs or prefixes to loader functions
        const VIEW_REGISTRY = [
            // Exact matches (Higher priority)
            { id: 'dashboard',     loader: () => window.loadDashboardView && window.loadDashboardView() },
            { id: 'locations',     loader: () => window.loadLocationsView && window.loadLocationsView() },
            { id: 'inbound',       loader: () => window.loadInboundView && window.loadInboundView() },
            { id: 'divergencias',  loader: () => window.DivergenciasManager && window.DivergenciasManager.load(document.getElementById('view-divergencias')) },
            { id: 'cad-etiquetas', loader: (v) => window.loadEtiquetasView && window.loadEtiquetasView(v) },

            // Specific overrides for shared loaders
            { id: 'est-consulta', loader: (v) => window.loadEstoqueView && window.loadEstoqueView(v) },
            { id: 'est-endereco', loader: (v) => window.loadEstoqueView && window.loadEstoqueView(v) },
            { id: 'est-inventario', loader: (v) => window.loadControleView && window.loadControleView(v) },
            { id: 'est-transferencia', loader: (v) => window.loadControleView && window.loadControleView(v) },
            { id: 'est-bloqueio', loader: (v) => window.loadControleView && window.loadControleView(v) },
            { id: 'est-ajuste', loader: (v) => window.loadControleView && window.loadControleView(v) },

            // Prefix matches (Lower priority)
            { prefix: 'aud-', loader: (v) => window.loadControleView && window.loadControleView(v) },
            { prefix: 'ent-', exclude: ['ent-recebimento'], loader: (v) => window.loadEntradaView && window.loadEntradaView(v) }, // ent-recebimento is aliased to inbound
            { prefix: 'sai-', loader: (v) => window.loadSaidaView && window.loadSaidaView(v) },
            { prefix: 'rel-', loader: (v) => window.loadRelatoriosView && window.loadRelatoriosView(v) },
            { prefix: 'cad-', loader: (v) => window.loadCadastroView && window.loadCadastroView(v) },
            { prefix: 'cfg-', loader: (v) => window.loadConfigView && window.loadConfigView(v) },
            { prefix: 'relm-', loader: (v) => window.loadRelManutencaoView && window.loadRelManutencaoView(v) },
            { prefix: 'relo-', loader: (v) => window.loadRelManutencaoView && window.loadRelManutencaoView(v) }
        ];

        // Find matching loader
        let loaded = false;

        // 1. Check exact ID in registry
        const exactMatch = VIEW_REGISTRY.find(r => r.id === resolvedId);
        if (exactMatch) {
            exactMatch.loader(viewId);
            loaded = true;
        }
        // 2. Check prefix in registry
        else {
            const prefixMatch = VIEW_REGISTRY.find(r => r.prefix && resolvedId.startsWith(r.prefix) && (!r.exclude || !r.exclude.includes(resolvedId)));
            if (prefixMatch) {
                prefixMatch.loader(viewId);
                loaded = true;
            }
        }

        // 3. Fallback
        if (!loaded && viewId !== 'dashboard' && !VIEW_ALIASES[viewId]) {
            if (target.id === 'view-dynamic' || target.innerHTML.trim() === '') {
                const icon = getViewIcon(viewId);
                target.innerHTML = `
                    <div class="view-placeholder">
                        <span class="material-icons-round">${icon}</span>
                        <h3>${VIEW_TITLES[viewId] || viewId}</h3>
                        <p style="font-size:0.85rem;">Tela em construção.</p>
                    </div>
                `;
            }
        }

        // Persist state
        localStorage.setItem('wmsLastView', viewId);
    }
}

function getViewIcon(viewId) {
    const icons = {
        'cad': 'edit_note', 'relm': 'build', 'relo': 'assessment',
        'ent': 'move_to_inbox', 'est': 'inventory_2', 'sai': 'local_shipping',
        'aud': 'policy', 'cfg': 'settings'
    };
    const prefix = viewId.split('-')[0];
    return icons[prefix] || 'info';
}

// --- Firebase Sync Status Badge ---
function _updateSyncStatus(status, info) {
    const el = document.getElementById('wms-sync-status');
    if (!el) return;
    const STATES = {
        syncing: { icon: 'sync',         color: '#f59e0b', text: 'Sincronizando...' },
        ok:      { icon: 'cloud_done',   color: '#10b981', text: info || 'Cloud Sync OK' },
        warn:    { icon: 'cloud_off',    color: '#f59e0b', text: 'Sem dados cloud' },
        error:   { icon: 'cloud_off',    color: '#ef4444', text: 'Erro de sync' },
    };
    const s = STATES[status] || STATES.ok;
    const spinning = status === 'syncing' ? 'style="animation:spin 1s linear infinite;display:inline-block;"' : '';
    el.innerHTML = `
        <span class="material-icons-round" ${spinning} style="font-size:.9rem;color:${s.color};vertical-align:middle;">${s.icon}</span>
        <span style="color:${s.color};">${s.text}</span>`;
}
window._updateSyncStatus = _updateSyncStatus;


// WMS Core Logic
// Navigation, Auth, Submenu Control, Dynamic View Loading

const WMS_VERSION = '3.4.0';

// --- Auth & Tenant Check ---
document.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('logged_user');
    if (!savedUser) {
        window.location.href = '../../index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    document.getElementById('userName').textContent = user.name || user.login;
    document.getElementById('userTenant').textContent = user.tenantId || 'Tenant';

    // --- WMS Integration Init ---
    if (window.WmsIntegration) {
        const intConfig = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
        window.WmsIntegration.init(intConfig);

        // Dynamic Branding (Store Name)
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
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
    }

    // Start at dashboard
    switchView('dashboard');
});

// --- Submenu Toggle (ERP Pattern - ID based) ---
window.toggleSubmenu = function (id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = (el.style.display === 'flex' || el.style.display === 'block') ? 'none' : 'flex';
    }
};

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
};

// Map view IDs to parent categories for breadcrumb
const VIEW_PARENTS = {};
Object.keys(VIEW_TITLES).forEach(k => {
    if (k.startsWith('cad-')) VIEW_PARENTS[k] = 'Cadastros';
    else if (k.startsWith('relm-')) VIEW_PARENTS[k] = 'Rel. Manutenção';
    else if (k.startsWith('relo-')) VIEW_PARENTS[k] = 'Rel. Operação';
    else if (k.startsWith('ent-')) VIEW_PARENTS[k] = 'Entrada de Produtos';
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
            { id: 'dashboard', loader: () => window.loadDashboardView && window.loadDashboardView() },
            { id: 'locations', loader: () => window.loadLocationsView && window.loadLocationsView() },
            { id: 'inbound', loader: () => window.loadInboundView && window.loadInboundView() },
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

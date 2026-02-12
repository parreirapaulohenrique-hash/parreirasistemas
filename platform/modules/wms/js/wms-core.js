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

        // Trigger view-specific loaders
        if (viewId === 'dashboard' && window.loadDashboardView) {
            window.loadDashboardView();
        } else if (resolvedId === 'locations' && window.loadLocationsView) {
            window.loadLocationsView();
        } else if (resolvedId === 'inbound' && window.loadInboundView) {
            window.loadInboundView();
        } else if (viewId.startsWith('est-') && window.loadEstoqueView) {
            window.loadEstoqueView(viewId);
        } else if (viewId.startsWith('ent-') && viewId !== 'ent-recebimento' && window.loadEntradaView) {
            window.loadEntradaView(viewId);
        } else if (viewId.startsWith('sai-') && window.loadSaidaView) {
            window.loadSaidaView(viewId);
        } else if ((viewId.startsWith('aud-') || viewId === 'est-transferencia' || viewId === 'est-bloqueio' || viewId === 'est-ajuste') && window.loadControleView) {
            window.loadControleView(viewId);
        } else if (viewId.startsWith('rel-') && window.loadRelatoriosView) {
            window.loadRelatoriosView(viewId);
        } else if (viewId !== 'dashboard' && !VIEW_ALIASES[viewId]) {
            // Route to specific loaders based on prefix
            if (viewId.startsWith('cad-') && window.loadCadastroView) {
                window.loadCadastroView(viewId);
            } else if (viewId.startsWith('cfg-') && window.loadConfigView) {
                window.loadConfigView(viewId);
            } else if ((viewId.startsWith('relm-') || viewId.startsWith('relo-')) && window.loadRelatoriosView) {
                window.loadRelatoriosView(viewId);
            } else {
                // Show placeholder for views not yet implemented
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

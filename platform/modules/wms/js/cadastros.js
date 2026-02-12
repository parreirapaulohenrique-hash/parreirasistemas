// ===========================================
// WMS Cadastros - Universal CRUD
// All cad-* views: user, filial, cliente,
// fornecedor, setor, contato, etiquetas,
// motivo transferência, produto grupo/sub/fam,
// produto cadastro, tipo endereço, tipo NF,
// regras recebimento, doca, transportadora,
// tipo OS, prioridade
// ===========================================

const WMS_CAD_STORAGE = 'wms_cadastros';

function getCadastroData() {
    return JSON.parse(localStorage.getItem(WMS_CAD_STORAGE) || '{}');
}
function saveCadastroData(data) {
    localStorage.setItem(WMS_CAD_STORAGE, JSON.stringify(data));
}

// --- Config for each cadastro ---
const CAD_CONFIG = {
    'cad-usuarios': {
        key: 'usuarios', label: 'Usuários', icon: 'person',
        fields: [
            { name: 'login', label: 'Login', type: 'text', required: true },
            { name: 'nome', label: 'Nome Completo', type: 'text', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'perfil', label: 'Perfil', type: 'select', options: ['Operador', 'Supervisor', 'Gerente', 'Admin'] },
            { name: 'setor', label: 'Setor', type: 'text' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox', default: true }
        ],
        columns: ['login', 'nome', 'perfil', 'ativo']
    },
    'cad-perfil-senha': {
        key: 'perfilSenha', label: 'Perfil de Segurança', icon: 'security',
        fields: [
            { name: 'nome', label: 'Nome do Perfil', type: 'text', required: true },
            { name: 'minCaracteres', label: 'Mín. Caracteres', type: 'number', default: 8 },
            { name: 'exigirMaiuscula', label: 'Exigir Maiúscula', type: 'checkbox', default: true },
            { name: 'exigirNumero', label: 'Exigir Número', type: 'checkbox', default: true },
            { name: 'exigirEspecial', label: 'Exigir Especial', type: 'checkbox' },
            { name: 'diasExpirar', label: 'Dias p/ Expirar', type: 'number', default: 90 }
        ],
        columns: ['nome', 'minCaracteres', 'diasExpirar']
    },
    'cad-tipo-empresa': {
        key: 'tipoEmpresa', label: 'Tipo de Empresa', icon: 'business',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true }
        ],
        columns: ['codigo', 'descricao']
    },
    'cad-filial': {
        key: 'filiais', label: 'Filiais', icon: 'store',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome Filial', type: 'text', required: true },
            { name: 'cnpj', label: 'CNPJ', type: 'text' },
            { name: 'endereco', label: 'Endereço', type: 'text' },
            { name: 'cidade', label: 'Cidade/UF', type: 'text' },
            { name: 'responsavel', label: 'Responsável', type: 'text' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'nome', 'cidade', 'ativo']
    },
    'cad-cliente': {
        key: 'clientes', label: 'Clientes', icon: 'people',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'razaoSocial', label: 'Razão Social', type: 'text', required: true },
            { name: 'fantasia', label: 'Fantasia', type: 'text' },
            { name: 'cnpjCpf', label: 'CNPJ/CPF', type: 'text' },
            { name: 'cidade', label: 'Cidade/UF', type: 'text' },
            { name: 'telefone', label: 'Telefone', type: 'text' },
            { name: 'email', label: 'E-mail', type: 'email' }
        ],
        columns: ['codigo', 'razaoSocial', 'cidade']
    },
    'cad-fornecedor': {
        key: 'fornecedores', label: 'Fornecedores', icon: 'local_shipping',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'razaoSocial', label: 'Razão Social', type: 'text', required: true },
            { name: 'fantasia', label: 'Fantasia', type: 'text' },
            { name: 'cnpj', label: 'CNPJ', type: 'text' },
            { name: 'cidade', label: 'Cidade/UF', type: 'text' },
            { name: 'telefone', label: 'Telefone', type: 'text' },
            { name: 'prazoEntrega', label: 'Prazo Entrega (dias)', type: 'number' }
        ],
        columns: ['codigo', 'razaoSocial', 'cidade', 'prazoEntrega']
    },
    'cad-setor': {
        key: 'setores', label: 'Setores Executantes', icon: 'groups',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome do Setor', type: 'text', required: true },
            { name: 'responsavel', label: 'Responsável', type: 'text' },
            { name: 'area', label: 'Área', type: 'select', options: ['Recebimento', 'Armazenagem', 'Separação', 'Expedição', 'Inventário', 'Administrativo'] }
        ],
        columns: ['codigo', 'nome', 'area', 'responsavel']
    },
    'cad-contato': {
        key: 'contatos', label: 'Contatos', icon: 'contact_phone',
        fields: [
            { name: 'nome', label: 'Nome', type: 'text', required: true },
            { name: 'empresa', label: 'Empresa', type: 'text' },
            { name: 'cargo', label: 'Cargo', type: 'text' },
            { name: 'telefone', label: 'Telefone', type: 'text' },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'observacao', label: 'Observação', type: 'text' }
        ],
        columns: ['nome', 'empresa', 'telefone', 'email']
    },
    'cad-etiquetas': {
        key: 'etiquetas', label: 'Modelos de Etiqueta', icon: 'label',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome do Modelo', type: 'text', required: true },
            { name: 'tipo', label: 'Tipo', type: 'select', options: ['Endereço', 'Palete', 'Produto', 'Volume', 'Expedição'] },
            { name: 'largura', label: 'Largura (mm)', type: 'number', default: 100 },
            { name: 'altura', label: 'Altura (mm)', type: 'number', default: 50 },
            { name: 'codigoBarras', label: 'Tipo Cód. Barras', type: 'select', options: ['Code128', 'EAN13', 'QRCode', 'DataMatrix'] }
        ],
        columns: ['codigo', 'nome', 'tipo', 'codigoBarras']
    },
    'cad-motivo-transf': {
        key: 'motivoTransf', label: 'Motivos de Transferência', icon: 'swap_horiz',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true },
            { name: 'tipo', label: 'Tipo', type: 'select', options: ['Reabastecimento', 'Reorganização', 'Avaria', 'Devolução', 'Outro'] },
            { name: 'exigeAprovacao', label: 'Exige Aprovação', type: 'checkbox' }
        ],
        columns: ['codigo', 'descricao', 'tipo', 'exigeAprovacao']
    },
    'cad-prod-grupo': {
        key: 'prodGrupo', label: 'Grupos de Produtos', icon: 'category',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome do Grupo', type: 'text', required: true },
            { name: 'curvaABC', label: 'Curva ABC Padrão', type: 'select', options: ['A', 'B', 'C'] }
        ],
        columns: ['codigo', 'nome', 'curvaABC']
    },
    'cad-prod-subgrupo': {
        key: 'prodSubgrupo', label: 'Sub-Grupos de Produtos', icon: 'account_tree',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome do Sub-Grupo', type: 'text', required: true },
            { name: 'grupoPai', label: 'Grupo Pai', type: 'text' }
        ],
        columns: ['codigo', 'nome', 'grupoPai']
    },
    'cad-prod-familia': {
        key: 'prodFamilia', label: 'Famílias de Produtos', icon: 'workspaces',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome da Família', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text' }
        ],
        columns: ['codigo', 'nome']
    },
    'cad-prod-cadastro': {
        key: 'produtos', label: 'Produtos', icon: 'inventory_2',
        fields: [
            { name: 'sku', label: 'SKU', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true },
            { name: 'grupo', label: 'Grupo', type: 'text' },
            { name: 'unidade', label: 'Unidade', type: 'select', options: ['UN', 'CX', 'KG', 'LT', 'PC', 'MT', 'JG', 'PR', 'KIT'] },
            { name: 'pesoLiquido', label: 'Peso Líq. (kg)', type: 'number' },
            { name: 'pesoBruto', label: 'Peso Bruto (kg)', type: 'number' },
            { name: 'largura', label: 'Largura (cm)', type: 'number' },
            { name: 'altura', label: 'Altura (cm)', type: 'number' },
            { name: 'profundidade', label: 'Profundidade (cm)', type: 'number' },
            { name: 'ean', label: 'EAN/GTIN', type: 'text' },
            { name: 'ncm', label: 'NCM', type: 'text' },
            { name: 'curvaABC', label: 'Curva ABC', type: 'select', options: ['A', 'B', 'C'] },
            { name: 'estoqueMinimo', label: 'Estoque Mínimo', type: 'number' },
            { name: 'estoqueMaximo', label: 'Estoque Máximo', type: 'number' },
            { name: 'controleLote', label: 'Controle Lote', type: 'checkbox' },
            { name: 'controleValidade', label: 'Controle Validade', type: 'checkbox' },
            { name: 'ativo', label: 'Ativo', type: 'checkbox', default: true }
        ],
        columns: ['sku', 'descricao', 'grupo', 'unidade', 'curvaABC']
    },
    'cad-end-tipo': {
        key: 'enderecoTipo', label: 'Tipos de Endereço', icon: 'grid_view',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true },
            { name: 'tipo', label: 'Tipo', type: 'select', options: ['Picking', 'Pulmão', 'Blocado', 'Doca', 'Expedição', 'Cross-Dock', 'Quarentena', 'Reservado'] },
            { name: 'capacidadeKg', label: 'Capacidade (kg)', type: 'number' },
            { name: 'capacidadeVol', label: 'Capacidade (volumes)', type: 'number' }
        ],
        columns: ['codigo', 'descricao', 'tipo', 'capacidadeKg']
    },
    'cad-rec-tipo-nf': {
        key: 'tipoNF', label: 'Tipos de NF', icon: 'receipt',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true },
            { name: 'tipo', label: 'Tipo', type: 'select', options: ['Compra', 'Transferência', 'Devolução', 'Bonificação', 'Importação', 'Consignação'] },
            { name: 'geraConferencia', label: 'Gera Conferência', type: 'checkbox', default: true },
            { name: 'geraPutaway', label: 'Gera Putaway', type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'descricao', 'tipo']
    },
    'cad-rec-regras': {
        key: 'regrasRecebimento', label: 'Regras de Recebimento', icon: 'rule',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome da Regra', type: 'text', required: true },
            { name: 'conferenciaObrigatoria', label: 'Conferência Obrigatória', type: 'checkbox', default: true },
            { name: 'contagemCega', label: 'Contagem Cega', type: 'checkbox', default: true },
            { name: 'toleranciaQtd', label: 'Tolerância Quantidade (%)', type: 'number', default: 5 },
            { name: 'exigeNF', label: 'Exige NF', type: 'checkbox', default: true },
            { name: 'geraEtiqueta', label: 'Gera Etiqueta LPN', type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'nome', 'conferenciaObrigatoria', 'contagemCega']
    },
    'cad-exp-doca': {
        key: 'docas', label: 'Docas', icon: 'door_sliding',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome da Doca', type: 'text', required: true },
            { name: 'tipo', label: 'Tipo', type: 'select', options: ['Recebimento', 'Expedição', 'Mista'] },
            { name: 'capacidadeVeiculos', label: 'Capacidade Veículos', type: 'number', default: 1 },
            { name: 'ativa', label: 'Ativa', type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'nome', 'tipo', 'ativa']
    },
    'cad-exp-transportadora': {
        key: 'transportadoras', label: 'Transportadoras', icon: 'local_shipping',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'razaoSocial', label: 'Razão Social', type: 'text', required: true },
            { name: 'fantasia', label: 'Fantasia', type: 'text' },
            { name: 'cnpj', label: 'CNPJ', type: 'text' },
            { name: 'telefone', label: 'Telefone', type: 'text' },
            { name: 'cidade', label: 'Cidade/UF', type: 'text' },
            { name: 'veiculoTipo', label: 'Tipo Veículo', type: 'select', options: ['Fiorino', 'VUC', 'Toco', 'Truck', 'Carreta', 'Bitrem'] },
            { name: 'ativa', label: 'Ativa', type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'razaoSocial', 'cnpj', 'veiculoTipo']
    },
    'cad-os-tipo': {
        key: 'ostipos', label: 'Tipos de OS', icon: 'assignment',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'descricao', label: 'Descrição', type: 'text', required: true },
            { name: 'area', label: 'Área', type: 'select', options: ['Recebimento', 'Armazenagem', 'Separação', 'Expedição', 'Inventário', 'Manutenção'] },
            { name: 'prioridadePadrao', label: 'Prioridade Padrão', type: 'select', options: ['Baixa', 'Normal', 'Alta', 'Urgente'] }
        ],
        columns: ['codigo', 'descricao', 'area', 'prioridadePadrao']
    },
    'cad-os-prioridade': {
        key: 'prioridades', label: 'Prioridades', icon: 'priority_high',
        fields: [
            { name: 'codigo', label: 'Código', type: 'text', required: true },
            { name: 'nome', label: 'Nome', type: 'text', required: true },
            { name: 'nivel', label: 'Nível (1=Mais Alta)', type: 'number', default: 3 },
            { name: 'cor', label: 'Cor', type: 'select', options: ['Verde', 'Azul', 'Amarelo', 'Laranja', 'Vermelho'] },
            { name: 'sla', label: 'SLA (horas)', type: 'number' }
        ],
        columns: ['codigo', 'nome', 'nivel', 'cor']
    }
};

// ===========================================
// MAIN LOADER (called from wms-core.js)
// ===========================================
window.loadCadastroView = function (viewId) {
    const config = CAD_CONFIG[viewId];
    if (!config) return;

    const container = document.getElementById('view-dynamic');
    if (!container) return;
    container.innerHTML = '';
    container.setAttribute('data-view', viewId);

    const data = getCadastroData();
    if (!data[config.key]) data[config.key] = [];
    const items = data[config.key];

    renderCadGrid(container, config, items, viewId);
};

// ===========================================
// GRID RENDERER
// ===========================================
function renderCadGrid(container, config, items, viewId) {
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <span class="material-icons-round" style="font-size:1.5rem; color:var(--wms-primary);">${config.icon}</span>
                <div>
                    <h3 style="font-size:1rem;">${config.label}</h3>
                    <span style="font-size:0.8rem; color:var(--text-secondary);">${items.length} registro(s)</span>
                </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <div style="display:flex; align-items:center; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:0 0.5rem;">
                    <span class="material-icons-round" style="font-size:1rem; color:var(--text-secondary);">search</span>
                    <input type="text" id="cadSearch" placeholder="Buscar..." style="background:none; border:none; color:var(--text-primary); padding:0.5rem; outline:none; font-size:0.85rem; width:160px;"
                        oninput="filterCadGrid('${viewId}', this.value)">
                </div>
                <button class="btn btn-primary" onclick="openCadForm('${viewId}')">
                    <span class="material-icons-round" style="font-size:1rem;">add</span> Novo
                </button>
            </div>
        </div>
        <div class="card" style="overflow:hidden;">
            <div style="overflow-x:auto;">
                <table class="data-table" id="cadTable">
                    <thead>
                        <tr>
                            ${config.columns.map(col => {
        const field = config.fields.find(f => f.name === col);
        return `<th>${field ? field.label : col}</th>`;
    }).join('')}
                            <th style="width:80px; text-align:center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderCadRows(config, items)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderCadRows(config, items) {
    if (items.length === 0) {
        return `<tr><td colspan="${config.columns.length + 1}" style="text-align:center; padding:2rem; color:var(--text-secondary);">Nenhum registro cadastrado</td></tr>`;
    }
    return items.map((item, idx) => `
        <tr>
            ${config.columns.map(col => {
        const val = item[col];
        if (typeof val === 'boolean') return `<td><span style="color:${val ? 'var(--success)' : 'var(--danger)'};">${val ? 'Sim' : 'Não'}</span></td>`;
        return `<td>${val ?? '-'}</td>`;
    }).join('')}
            <td style="text-align:center;">
                <button class="btn btn-secondary btn-icon" onclick="editCadItem('${config.key}', ${idx})" title="Editar" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn btn-secondary btn-icon" onclick="deleteCadItem('${config.key}', ${idx})" title="Excluir" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1rem; color:var(--danger);">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

// ===========================================
// FORM MODAL
// ===========================================
window.openCadForm = function (viewId, editIdx = null) {
    const config = CAD_CONFIG[viewId];
    if (!config) return;

    const data = getCadastroData();
    const items = data[config.key] || [];
    const editItem = editIdx !== null ? items[editIdx] : null;

    let existing = document.getElementById('cadModal');
    if (existing) existing.remove();

    const fieldsHTML = config.fields.map(f => {
        const val = editItem ? (editItem[f.name] ?? '') : (f.default ?? '');
        if (f.type === 'checkbox') {
            const checked = editItem ? editItem[f.name] : (f.default || false);
            return `
                <label style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; cursor:pointer;">
                    <input type="checkbox" name="${f.name}" ${checked ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--wms-primary);">
                    <span style="font-size:0.85rem;">${f.label}</span>
                </label>`;
        }
        if (f.type === 'select') {
            return `
                <div style="margin-bottom:0.75rem;">
                    <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">${f.label}${f.required ? ' *' : ''}</label>
                    <select name="${f.name}" class="form-input" style="width:100%;">
                        <option value="">Selecione...</option>
                        ${(f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>`;
        }
        return `
            <div style="margin-bottom:0.75rem;">
                <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">${f.label}${f.required ? ' *' : ''}</label>
                <input type="${f.type || 'text'}" name="${f.name}" value="${val}" class="form-input" style="width:100%;" ${f.required ? 'required' : ''}>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'cadModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:560px; max-height:85vh; overflow-y:auto; margin:1rem; animation:fadeIn 0.2s ease;">
            <div class="card-header" style="position:sticky; top:0; z-index:1; padding:1rem 1.5rem;">
                <h3 style="font-size:1rem; font-weight:600;">${editItem ? 'Editar' : 'Novo'} ${config.label}</h3>
                <button class="btn btn-secondary btn-icon" onclick="document.getElementById('cadModal').remove()" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1.2rem;">close</span>
                </button>
            </div>
            <form id="cadForm" style="padding:1.5rem;" onsubmit="saveCadForm(event, '${viewId}', ${editIdx})">
                ${fieldsHTML}
                <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border-color);">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('cadModal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">
                        <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
};

window.saveCadForm = function (e, viewId, editIdx) {
    e.preventDefault();
    const config = CAD_CONFIG[viewId];
    const form = document.getElementById('cadForm');
    const data = getCadastroData();
    if (!data[config.key]) data[config.key] = [];

    const item = {};
    config.fields.forEach(f => {
        if (f.type === 'checkbox') {
            item[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
        } else if (f.type === 'number') {
            item[f.name] = Number(form.querySelector(`[name="${f.name}"]`).value || 0);
        } else {
            item[f.name] = form.querySelector(`[name="${f.name}"]`).value;
        }
    });

    // Validate required
    for (const f of config.fields) {
        if (f.required && !item[f.name]) {
            alert(`Campo obrigatório: ${f.label}`);
            return;
        }
    }

    if (editIdx !== null && editIdx >= 0) {
        item.updatedAt = new Date().toISOString();
        data[config.key][editIdx] = { ...data[config.key][editIdx], ...item };
    } else {
        item.id = 'cad_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        item.createdAt = new Date().toISOString();
        data[config.key].push(item);
    }

    saveCadastroData(data);
    document.getElementById('cadModal').remove();
    loadCadastroView(viewId);
};

window.editCadItem = function (key, idx) {
    const viewId = Object.keys(CAD_CONFIG).find(k => CAD_CONFIG[k].key === key);
    if (viewId) openCadForm(viewId, idx);
};

window.deleteCadItem = function (key, idx) {
    if (!confirm('Excluir este registro?')) return;
    const data = getCadastroData();
    if (data[key]) {
        data[key].splice(idx, 1);
        saveCadastroData(data);
        const viewId = Object.keys(CAD_CONFIG).find(k => CAD_CONFIG[k].key === key);
        if (viewId) loadCadastroView(viewId);
    }
};

window.filterCadGrid = function (viewId, query) {
    const config = CAD_CONFIG[viewId];
    const data = getCadastroData();
    let items = data[config.key] || [];
    if (query) {
        const s = query.toLowerCase();
        items = items.filter(item =>
            config.columns.some(col => String(item[col] || '').toLowerCase().includes(s))
        );
    }
    document.getElementById('cadTable').querySelector('tbody').innerHTML = renderCadRows(config, items);
};

console.log('📋 WMS Cadastros carregados — ' + Object.keys(CAD_CONFIG).length + ' entidades configuradas');

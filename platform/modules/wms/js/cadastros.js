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
            { name: 'codigo',            label: 'Código',                   type: 'text',   required: true },
            { name: 'nome',              label: 'Nome (ex: Picking)',        type: 'text',   required: true },
            { name: 'categoria',         label: 'Categoria',                type: 'select', options: ['Picking', 'Pulmão', 'Blocado', 'Doca', 'Expedição', 'Cross-Dock', 'Quarentena', 'Reservado'] },
            { name: 'larguraCelula',     label: 'Largura Célula (m)',       type: 'number', default: 1.2 },
            { name: 'alturaCelula',      label: 'Altura Célula (m)',        type: 'number', default: 2.0 },
            { name: 'profundidadeCelula',label: 'Profundidade Célula (m)',  type: 'number', default: 0.8 },
            { name: 'capacidadeKg',      label: 'Capacidade (kg)',          type: 'number' },
            { name: 'capacidadeVol',     label: 'Capacidade (volumes)',     type: 'number' },
            { name: 'ativo',             label: 'Ativo',                    type: 'checkbox', default: true }
        ],
        columns: ['codigo', 'nome', 'categoria', 'larguraCelula', 'alturaCelula', 'profundidadeCelula', 'capacidadeKg']
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
    const container = document.getElementById('view-dynamic');
    if (!container) return;
    container.innerHTML = '';
    container.setAttribute('data-view', viewId);

    // Usuários: gerenciado via Firebase Auth + Firestore (WmsUsuarios)
    if (viewId === 'cad-usuarios') {
        if (window.WmsUsuarios) WmsUsuarios.renderView('view-dynamic');
        else container.innerHTML = '<p style="padding:2rem;color:var(--text-secondary);">Módulo de usuários não carregado.</p>';
        return;
    }

    const config = CAD_CONFIG[viewId];
    if (!config) return;

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
                ${viewId === 'cad-prod-cadastro' ? `
                <button class="btn btn-secondary" onclick="document.getElementById('importProdFile').click()">
                    <span class="material-icons-round" style="font-size:1rem;">upload_file</span> Importar
                </button>
                <input type="file" id="importProdFile" accept=".xlsx, .xls, .csv" style="display:none;" onchange="handleImportProdutos(this)">
                ` : ''}
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


// ===========================================
// IMPORT PRODUTOS (EXCEL) - COM MAPEAMENTO
// ===========================================
window._importProdData = { rows: [], headers: [] };

window.handleImportProdutos = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        if (!window.XLSX) {
            if (!document.querySelector('script[data-sheetjs]')) {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                s.setAttribute('data-sheetjs', 'true');
                document.head.appendChild(s);
            }
            alert('Carregando motor de planilhas. Por favor, aguarde 2 segundos e selecione o arquivo novamente.');
            input.value = '';
            return;
        }

        try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (rows.length < 2) {
                alert('Planilha vazia ou inválida.');
                input.value = '';
                return;
            }
            
            const headers = rows[0].map(h => String(h).trim());
            window._importProdData.headers = headers;
            window._importProdData.rows = rows.slice(1);
            
            openProdMappingModal();
            
        } catch (err) {
            console.error('Erro na leitura da planilha:', err);
            alert('Erro ao processar a planilha. Verifique se o formato é válido.');
        }
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
};

window.openProdMappingModal = function() {
    let existing = document.getElementById('prodMapModal');
    if (existing) existing.remove();

    const config = CAD_CONFIG['cad-prod-cadastro'];
    const headers = window._importProdData.headers;
    
    // Auto-detect mappings based on name similarity
    const autoMap = {};
    const normH = headers.map(h => h.toLowerCase());
    config.fields.forEach(f => {
        const fn = f.name.toLowerCase();
        const fl = f.label.toLowerCase();
        const idx = normH.findIndex(h => h === fn || h === fl || 
            (fn === 'sku' && (h.includes('código') || h.includes('codigo') || h === 'produto')) ||
            (fn === 'descricao' && (h.includes('descri') || h === 'nome')) ||
            (fn === 'ean' && (h.includes('barras') || h.includes('gtin'))) ||
            (fn === 'unidade' && h === 'und') ||
            (fn === 'pesobruto' && h.includes('bruto'))
        );
        if (idx !== -1) autoMap[f.name] = headers[idx];
    });

    const opts = `<option value="">(Não importar)</option>` +
        headers.map(c => `<option value="${c}">${c}</option>`).join('');

    const fieldsHTML = config.fields.map(f => {
        const sel = autoMap[f.name] || '';
        return `
        <div style="margin-bottom:0.75rem;">
            <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem; font-weight:500;">
                ${f.label}${f.required ? ' <span style="color:var(--wms-danger);">*</span>' : ''}
            </label>
            <select id="map-prod-${f.name}" class="form-input" style="width:100%; font-size:0.8rem;" onchange="_prodUpdatePreview()">
                ${opts.replace(`value="${sel}"`, `value="${sel}" selected`)}
            </select>
        </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'prodMapModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center; backdrop-filter:blur(3px);';
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:900px; max-height:90vh; display:flex; flex-direction:column; margin:1rem; animation:fadeIn 0.2s ease; overflow:hidden;">
            <div class="card-header" style="padding:1.25rem 1.5rem; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color);">
                <div>
                    <h3 style="font-size:1.1rem; font-weight:700; display:flex; align-items:center; gap:0.5rem;">
                        <span class="material-icons-round" style="color:var(--wms-primary);">compare_arrows</span>
                        Mapeamento de Produtos
                    </h3>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem;">Vincule as colunas da sua planilha com os campos do WMS</div>
                </div>
                <button class="btn btn-secondary btn-icon" onclick="document.getElementById('prodMapModal').remove()" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1.2rem;">close</span>
                </button>
            </div>
            
            <div style="display:flex; flex:1; overflow:hidden;">
                <!-- Left: Mapping -->
                <div style="width:300px; padding:1.5rem; overflow-y:auto; border-right:1px solid var(--border-color); background:rgba(0,0,0,0.1);">
                    ${fieldsHTML}
                </div>
                
                <!-- Right: Preview -->
                <div style="flex:1; padding:1.5rem; overflow-y:auto; display:flex; flex-direction:column;">
                    <h4 style="font-size:0.9rem; margin-bottom:1rem; color:var(--text-secondary);">Pré-visualização (5 primeiras linhas)</h4>
                    <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:8px; flex:1;">
                        <table class="data-table" id="prodMapPreviewTable">
                            <!-- Injected dynamically -->
                        </table>
                    </div>
                </div>
            </div>
            
            <div style="padding:1.25rem 1.5rem; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:var(--bg-card);">
                <div id="prodMapSummary" style="font-size:0.85rem; font-weight:600; color:var(--text-secondary);"></div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-secondary" onclick="document.getElementById('prodMapModal').remove()">Cancelar</button>
                    <button class="btn btn-primary" onclick="_prodConfirmImport()">
                        <span class="material-icons-round" style="font-size:1rem;">check_circle</span> Confirmar Importação
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    _prodUpdatePreview();
};

window._prodGetMap = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = {};
    config.fields.forEach(f => {
        const el = document.getElementById('map-prod-' + f.name);
        if (el && el.value) map[f.name] = el.value;
    });
    return map;
};

window._prodUpdatePreview = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = _prodGetMap();
    const { headers, rows } = window._importProdData;
    
    // Check required fields
    const missing = config.fields.filter(f => f.required && !map[f.name]).map(f => f.label);
    const summary = document.getElementById('prodMapSummary');
    
    if (missing.length > 0) {
        summary.innerHTML = `<span style="color:var(--wms-danger);"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;margin-right:4px;">warning</span>Atenção: Mapeie os campos obrigatórios (${missing.join(', ')})</span>`;
    } else {
        summary.innerHTML = `<span style="color:#10b981;"><span class="material-icons-round" style="font-size:1rem;vertical-align:middle;margin-right:4px;">info</span>Pronto para importar ${rows.length} produtos.</span>`;
    }

    const table = document.getElementById('prodMapPreviewTable');
    
    // Build Headers
    const mappedCols = Object.keys(map);
    const ths = mappedCols.map(k => {
        const f = config.fields.find(x => x.name === k);
        return `<th>${f ? f.label : k}</th>`;
    }).join('');
    
    const thead = `<thead><tr>${ths}</tr></thead>`;
    
    // Build Rows
    const previewRows = rows.slice(0, 5);
    const tbody = `<tbody>${previewRows.map(row => {
        const tds = mappedCols.map(k => {
            const hName = map[k];
            const hIdx = headers.indexOf(hName);
            const val = hIdx !== -1 ? row[hIdx] : '';
            return `<td><div style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${val}">${val}</div></td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('')}</tbody>`;
    
    table.innerHTML = thead + tbody;
};

window._prodConfirmImport = function() {
    const config = CAD_CONFIG['cad-prod-cadastro'];
    const map = _prodGetMap();
    
    const missing = config.fields.filter(f => f.required && !map[f.name]).map(f => f.label);
    if (missing.length > 0) {
        alert('Você precisa mapear as colunas obrigatórias: ' + missing.join(', '));
        return;
    }
    
    const { headers, rows } = window._importProdData;
    let countNew = 0;
    let countUpdate = 0;
    
    const cadData = getCadastroData();
    if (!cadData['produtos']) cadData['produtos'] = [];
    const produtos = cadData['produtos'];
    
    const existingSkus = {};
    produtos.forEach((p, index) => {
        existingSkus[String(p.sku).trim().toUpperCase()] = index;
    });
    
    // Create fast lookup for column indexes
    const mapIdx = {};
    Object.keys(map).forEach(k => {
        mapIdx[k] = headers.indexOf(map[k]);
    });
    
    rows.forEach(row => {
        if (!row || row.length === 0) return;
        
        const skuIdx = mapIdx['sku'];
        const skuVal = row[skuIdx];
        if (skuVal === undefined || skuVal === null || String(skuVal).trim() === '') return;
        const sku = String(skuVal).trim();
        const skuKey = sku.toUpperCase();
        
        const itemObj = {};
        Object.keys(mapIdx).forEach(k => {
            const idx = mapIdx[k];
            let val = idx !== -1 ? row[idx] : '';
            // Treat boolean fields
            const fieldDef = config.fields.find(f => f.name === k);
            if (fieldDef && fieldDef.type === 'checkbox') {
                const s = String(val).toLowerCase();
                val = (s === 'sim' || s === 'true' || s === '1' || s === 's' || val === true || val === 1);
            }
            // Treat numeric fields
            if (fieldDef && fieldDef.type === 'number') {
                if (val === '') val = null;
                else val = parseFloat(String(val).replace(',','.'));
            }
            itemObj[k] = val;
        });
        
        if (existingSkus.hasOwnProperty(skuKey)) {
            const pIdx = existingSkus[skuKey];
            Object.assign(produtos[pIdx], itemObj);
            countUpdate++;
        } else {
            itemObj.id = 'PROD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            itemObj.ativo = true;
            produtos.push(itemObj);
            existingSkus[skuKey] = produtos.length - 1;
            countNew++;
        }
    });
    
    saveCadastroData(cadData);
    alert(`Importação concluída!\nNovos produtos: ${countNew}\nAtualizados: ${countUpdate}`);
    
    document.getElementById('prodMapModal').remove();
    loadCadastroView('cad-prod-cadastro');
};

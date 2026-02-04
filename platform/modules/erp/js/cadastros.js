// ===========================================
// Parreira ERP - Módulo de Cadastros (CRUD)
// ===========================================

// Configuração das coleções
const COLLECTIONS = {
    groups: { name: 'Grupos', path: 'financial/groups', fields: ['codigo', 'nome'] },
    accountPlans: { name: 'Plano de Contas', path: 'financial/accountPlans', fields: ['codigo', 'conta', 'contaContabil', 'valorOrcado', 'tipo', 'investimento', 'exibirDre'] },
    billing: { name: 'Cobrança', path: 'financial/billing', fields: ['codigo', 'descricao', 'moeda', 'carencia', 'diasProtesto', 'juros'] },
    paymentPlans: { name: 'Plano de Pagamento', path: 'financial/paymentPlans', fields: ['codigo', 'descricao', 'parcelas', 'tipo', 'liberaBloqueado'] },
    banks: { name: 'Caixas e Bancos', path: 'financial/banks', fields: ['codigo', 'empresa', 'nome', 'banco', 'agencia', 'conta', 'digito'] },
    cfop: { name: 'CFOP', path: 'fiscal/cfop', fields: ['codigo', 'descricao', 'observacao'] },
    icmsParams: { name: 'Parâmetros ICMS', path: 'fiscal/icmsParams', fields: ['codTribut', 'icmsNf', 'icmsSubs', 'baseRed'] }
};

// Estado local para armazenamento
let cadastrosData = {};

// ===========================================
// FUNÇÕES CRUD GENÉRICAS
// ===========================================

/**
 * Inicializa o módulo de cadastros
 */
window.initCadastros = function () {
    console.log('📋 Módulo de Cadastros inicializado');

    // Carregar dados do localStorage para cada coleção
    Object.keys(COLLECTIONS).forEach(key => {
        const stored = localStorage.getItem(`erp_${key}`);
        cadastrosData[key] = stored ? JSON.parse(stored) : [];
    });
};

/**
 * Salva um registro em uma coleção
 * @param {string} collection - Nome da coleção (ex: 'groups')
 * @param {object} data - Dados do registro
 * @param {string} editId - ID do registro (se editando)
 */
window.saveCadastro = function (collection, data, editId = null) {
    if (!COLLECTIONS[collection]) {
        console.error(`Coleção '${collection}' não encontrada`);
        return false;
    }

    // Garantir que o array existe
    if (!cadastrosData[collection]) {
        cadastrosData[collection] = [];
    }

    if (editId) {
        // Editar registro existente
        const index = cadastrosData[collection].findIndex(item => item.id === editId);
        if (index !== -1) {
            cadastrosData[collection][index] = { ...data, id: editId, updatedAt: new Date().toISOString() };
        }
    } else {
        // Criar novo registro
        const newRecord = {
            ...data,
            id: generateId(),
            createdAt: new Date().toISOString()
        };
        cadastrosData[collection].push(newRecord);
    }

    // Persistir no localStorage
    localStorage.setItem(`erp_${collection}`, JSON.stringify(cadastrosData[collection]));

    // Tentar salvar no Firebase se disponível
    saveToFirebase(collection, cadastrosData[collection]);

    console.log(`✅ Registro salvo em '${collection}'`);
    return true;
};

/**
 * Carrega todos os registros de uma coleção
 * @param {string} collection - Nome da coleção
 * @returns {array} Lista de registros
 */
window.loadCadastros = function (collection) {
    return cadastrosData[collection] || [];
};

/**
 * Obtém um registro pelo ID
 * @param {string} collection - Nome da coleção
 * @param {string} id - ID do registro
 */
window.getCadastro = function (collection, id) {
    if (!cadastrosData[collection]) return null;
    return cadastrosData[collection].find(item => item.id === id);
};

/**
 * Exclui um registro
 * @param {string} collection - Nome da coleção
 * @param {string} id - ID do registro
 */
window.deleteCadastro = function (collection, id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) {
        return false;
    }

    if (!cadastrosData[collection]) return false;

    cadastrosData[collection] = cadastrosData[collection].filter(item => item.id !== id);
    localStorage.setItem(`erp_${collection}`, JSON.stringify(cadastrosData[collection]));

    // Tentar excluir do Firebase se disponível
    saveToFirebase(collection, cadastrosData[collection]);

    console.log(`🗑️ Registro excluído de '${collection}'`);
    return true;
};

/**
 * Limpa os campos de um formulário
 * @param {string} formId - ID do formulário ou modal
 */
window.clearForm = function (formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    // Limpar todos os inputs e selects
    form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'radio' || el.type === 'checkbox') {
            el.checked = el.defaultChecked;
        } else {
            el.value = '';
        }
    });

    // Remover ID de edição se existir
    form.removeAttribute('data-edit-id');
};

// ===========================================
// FUNÇÕES ESPECÍFICAS - GRUPOS
// ===========================================

/**
 * Salva um grupo
 */
window.saveGrupo = function () {
    const modal = document.getElementById('finGroupModal');
    const codigo = modal.querySelector('#grpCodigo')?.value || '';
    const nome = modal.querySelector('#grpNome')?.value || '';

    if (!codigo || !nome) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    const editId = modal.getAttribute('data-edit-id');

    saveCadastro('groups', { codigo, nome }, editId);

    // Atualizar grid
    renderGruposGrid();

    // Limpar e fechar modal
    clearForm('finGroupModal');
    closeModal('finGroupModal');

    alert('Grupo salvo com sucesso!');
};

/**
 * Renderiza a grid de grupos na página
 */
window.renderGruposGrid = function () {
    const tbody = document.getElementById('groupsTableBody');
    if (!tbody) return;

    const grupos = loadCadastros('groups');

    if (grupos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                    <span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">folder_open</span>
                    <span style="margin-left:0.5rem;">Nenhum grupo cadastrado</span>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = grupos.map(g => `
        <tr>
            <td style="font-weight:600">${g.codigo}</td>
            <td>${g.nome}</td>
            <td style="text-align:right;">
                <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="editGrupo('${g.id}')" title="Editar">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
            </td>
        </tr>
    `).join('');
};

/**
 * Edita um grupo
 */
window.editGrupo = function (id) {
    const grupo = getCadastro('groups', id);
    if (!grupo) return;

    const modal = document.getElementById('finGroupModal');
    modal.querySelector('#grpCodigo').value = grupo.codigo || '';
    modal.querySelector('#grpNome').value = grupo.nome || '';
    modal.setAttribute('data-edit-id', id);

    openModal('finGroupModal');
};

/**
 * Exclui um grupo
 */
window.deleteGrupo = function (id) {
    if (deleteCadastro('groups', id)) {
        renderGruposGrid();
    }
};

// ===========================================
// UTILITÁRIOS
// ===========================================

/**
 * Gera um ID único
 */
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Tenta salvar no Firebase (se disponível)
 */
async function saveToFirebase(collection, data) {
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            const user = JSON.parse(localStorage.getItem('platform_user_logged'));
            if (!user?.tenant) return;

            const collectionConfig = COLLECTIONS[collection];
            if (!collectionConfig) return;

            const docRef = firebase.firestore()
                .collection('tenants')
                .doc(user.tenant)
                .collection(collectionConfig.path.split('/')[0])
                .doc(collectionConfig.path.split('/')[1] || collection);

            await docRef.set({ items: data, updatedAt: new Date().toISOString() });
            console.log(`☁️ Sincronizado com Firebase: ${collection}`);
        }
    } catch (err) {
        console.warn('Firebase sync failed:', err);
    }
}

/**
 * Carrega do Firebase (se disponível)
 */
async function loadFromFirebase(collection) {
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            const user = JSON.parse(localStorage.getItem('platform_user_logged'));
            if (!user?.tenant) return null;

            const collectionConfig = COLLECTIONS[collection];
            if (!collectionConfig) return null;

            const docRef = firebase.firestore()
                .collection('tenants')
                .doc(user.tenant)
                .collection(collectionConfig.path.split('/')[0])
                .doc(collectionConfig.path.split('/')[1] || collection);

            const doc = await docRef.get();
            if (doc.exists) {
                return doc.data().items || [];
            }
        }
    } catch (err) {
        console.warn('Firebase load failed:', err);
    }
    return null;
}

// ===========================================
// FUNÇÕES ESPECÍFICAS - CBS/IBS TRIBUTOS
// ===========================================

// Salva tributo CBS/IBS
window.saveCbsIbs = function () {
    const data = {
        codigo: document.getElementById('cbsIbsCodigo').value,
        descricao: document.getElementById('cbsIbsDescricao').value,
        ibsMunicipio: document.getElementById('cbsIbsMunicipio').value,
        ibsRedMunicipio: document.getElementById('cbsIbsRedMunicipio').value,
        ibsDifMunicipio: document.getElementById('cbsIbsDifMunicipio').value,
        cbs: document.getElementById('cbsCbs').value,
        redCbs: document.getElementById('cbsRedCbs').value,
        ibsUf: document.getElementById('cbsIbsUf').value,
        ibsRedUf: document.getElementById('cbsIbsRedUf').value,
        ibsDifUf: document.getElementById('cbsIbsDifUf').value,
        difCbs: document.getElementById('cbsDifCbs').value,
        cst: document.getElementById('cbsCst').value,
        codClassif: document.getElementById('cbsCodClassif').value
    };

    if (!data.codigo || !data.descricao) {
        alert('Código e Descrição são obrigatórios!');
        return;
    }

    saveCadastro('cbsIbs', data);
    closeModal('cbsIbsModal');
    clearForm('cbsIbsModal');
    renderCbsIbsGrid();
    alert('Tributo CBS/IBS salvo com sucesso!');
};

// Renderiza grid de CBS/IBS
function renderCbsIbsGrid() {
    const tbody = document.getElementById('cbsIbsTableBody');
    if (!tbody) return;

    const items = loadCadastros('cbsIbs');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>${item.ibsMunicipio || '0,00'}%</td>
            <td>${item.cbs || '0,00'}%</td>
            <td>${item.ibsUf || '0,00'}%</td>
            <td>${item.cst || '-'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="editCbsIbs('${item.id}')" title="Editar">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn btn-sm" onclick="deleteCbsIbs('${item.id}')" title="Excluir">
                    <span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

// Filtro CBS/IBS
window.filterCbsIbs = function () {
    const search = document.getElementById('cbsIbsSearch').value.toLowerCase();
    const items = loadCadastros('cbsIbs').filter(item =>
        item.codigo.toLowerCase().includes(search) ||
        item.descricao.toLowerCase().includes(search)
    );
    const tbody = document.getElementById('cbsIbsTableBody');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.codigo}</td>
            <td>${item.descricao}</td>
            <td>${item.ibsMunicipio || '0,00'}%</td>
            <td>${item.cbs || '0,00'}%</td>
            <td>${item.ibsUf || '0,00'}%</td>
            <td>${item.cst || '-'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="editCbsIbs('${item.id}')" title="Editar">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn btn-sm" onclick="deleteCbsIbs('${item.id}')" title="Excluir">
                    <span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
};

window.editCbsIbs = function (id) {
    const item = getCadastro('cbsIbs', id);
    if (!item) return;
    document.getElementById('cbsIbsCodigo').value = item.codigo;
    document.getElementById('cbsIbsDescricao').value = item.descricao;
    document.getElementById('cbsIbsMunicipio').value = item.ibsMunicipio || '';
    document.getElementById('cbsIbsRedMunicipio').value = item.ibsRedMunicipio || '';
    document.getElementById('cbsIbsDifMunicipio').value = item.ibsDifMunicipio || '';
    document.getElementById('cbsCbs').value = item.cbs || '';
    document.getElementById('cbsRedCbs').value = item.redCbs || '';
    document.getElementById('cbsIbsUf').value = item.ibsUf || '';
    document.getElementById('cbsIbsRedUf').value = item.ibsRedUf || '';
    document.getElementById('cbsIbsDifUf').value = item.ibsDifUf || '';
    document.getElementById('cbsDifCbs').value = item.difCbs || '';
    document.getElementById('cbsCst').value = item.cst || '';
    document.getElementById('cbsCodClassif').value = item.codClassif || '';
    openModal('cbsIbsModal');
};

window.deleteCbsIbs = function (id) {
    if (confirm('Confirma a exclusão deste tributo?')) {
        deleteCadastro('cbsIbs', id);
        renderCbsIbsGrid();
    }
};

// ===========================================
// FUNÇÕES ESPECÍFICAS - PDV
// ===========================================

// Salva PDV
window.savePdv = function () {
    const data = {
        numero: document.getElementById('pdvNumero').value,
        empresa: document.getElementById('pdvEmpresa').value,
        descricao: document.getElementById('pdvDescricao').value,
        nomeComputador: document.getElementById('pdvNomeComputador').value,
        ipComputador: document.getElementById('pdvIpComputador').value,
        tipoEmissao: document.getElementById('pdvTipoEmissao').value,
        ambiente: document.getElementById('pdvAmbiente').value,
        idCsc: document.getElementById('pdvIdCsc').value,
        csc: document.getElementById('pdvCsc').value,
        caixaMovimento: document.getElementById('pdvCaixaMovimento').value,
        dirEventos: document.getElementById('pdvDirEventos').value,
        dirInutilizacoes: document.getElementById('pdvDirInutilizacoes').value,
        dirNotasSaida: document.getElementById('pdvDirNotasSaida').value,
        dirEnviados: document.getElementById('pdvDirEnviados').value,
        dirSchemas: document.getElementById('pdvDirSchemas').value
    };

    if (!data.numero) {
        alert('Nº PDV é obrigatório!');
        return;
    }

    saveCadastro('pdv', data);
    closeModal('pdvModal');
    clearForm('pdvModal');
    renderPdvGrid();
    alert('PDV salvo com sucesso!');
};

// Renderiza grid de PDV
function renderPdvGrid() {
    const tbody = document.getElementById('pdvTableBody');
    if (!tbody) return;

    const items = loadCadastros('pdv');
    const ambientes = { '1': 'Produção', '2': 'Homologação' };
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.numero}</td>
            <td>${item.descricao || '-'}</td>
            <td>${item.nomeComputador || '-'}</td>
            <td>${item.ipComputador || '-'}</td>
            <td>${ambientes[item.ambiente] || '-'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="editPdv('${item.id}')" title="Editar">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn btn-sm" onclick="deletePdv('${item.id}')" title="Excluir">
                    <span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

// Filtro PDV
window.filterPdv = function () {
    const search = document.getElementById('pdvSearch').value.toLowerCase();
    const items = loadCadastros('pdv').filter(item =>
        String(item.numero).includes(search) ||
        (item.descricao && item.descricao.toLowerCase().includes(search)) ||
        (item.nomeComputador && item.nomeComputador.toLowerCase().includes(search))
    );
    const ambientes = { '1': 'Produção', '2': 'Homologação' };
    const tbody = document.getElementById('pdvTableBody');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.numero}</td>
            <td>${item.descricao || '-'}</td>
            <td>${item.nomeComputador || '-'}</td>
            <td>${item.ipComputador || '-'}</td>
            <td>${ambientes[item.ambiente] || '-'}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm" onclick="editPdv('${item.id}')" title="Editar">
                    <span class="material-icons-round" style="font-size:1rem;">edit</span>
                </button>
                <button class="btn btn-sm" onclick="deletePdv('${item.id}')" title="Excluir">
                    <span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
};

window.editPdv = function (id) {
    const item = getCadastro('pdv', id);
    if (!item) return;
    document.getElementById('pdvNumero').value = item.numero;
    document.getElementById('pdvEmpresa').value = item.empresa || '1';
    document.getElementById('pdvDescricao').value = item.descricao || '';
    document.getElementById('pdvNomeComputador').value = item.nomeComputador || '';
    document.getElementById('pdvIpComputador').value = item.ipComputador || '';
    document.getElementById('pdvTipoEmissao').value = item.tipoEmissao || '1';
    document.getElementById('pdvAmbiente').value = item.ambiente || '1';
    document.getElementById('pdvIdCsc').value = item.idCsc || '';
    document.getElementById('pdvCsc').value = item.csc || '';
    document.getElementById('pdvCaixaMovimento').value = item.caixaMovimento || '';
    document.getElementById('pdvDirEventos').value = item.dirEventos || '';
    document.getElementById('pdvDirInutilizacoes').value = item.dirInutilizacoes || '';
    document.getElementById('pdvDirNotasSaida').value = item.dirNotasSaida || '';
    document.getElementById('pdvDirEnviados').value = item.dirEnviados || '';
    document.getElementById('pdvDirSchemas').value = item.dirSchemas || '';
    openModal('pdvModal');
};

window.deletePdv = function (id) {
    if (confirm('Confirma a exclusão deste PDV?')) {
        deleteCadastro('pdv', id);
        renderPdvGrid();
    }
};

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    initCadastros();
});

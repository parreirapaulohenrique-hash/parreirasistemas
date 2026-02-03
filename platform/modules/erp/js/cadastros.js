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
 * Renderiza a grid de grupos
 */
window.renderGruposGrid = function () {
    const grid = document.getElementById('gruposGrid');
    if (!grid) return;

    const grupos = loadCadastros('groups');

    if (grupos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:3rem;">folder_open</span>
                <p>Nenhum grupo cadastrado</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = `
        <table class="data-table" style="width:100%;">
            <thead>
                <tr>
                    <th style="width:100px;">Código</th>
                    <th>Nome</th>
                    <th style="width:120px;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${grupos.map(g => `
                    <tr>
                        <td>${g.codigo}</td>
                        <td>${g.nome}</td>
                        <td>
                            <button class="btn btn-icon" onclick="editGrupo('${g.id}')" title="Editar">
                                <span class="material-icons-round">edit</span>
                            </button>
                            <button class="btn btn-icon btn-danger" onclick="deleteGrupo('${g.id}')" title="Excluir">
                                <span class="material-icons-round">delete</span>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
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

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    initCadastros();
});

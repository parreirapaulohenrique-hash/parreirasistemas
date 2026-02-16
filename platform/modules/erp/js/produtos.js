// ===========================================
// ERP - GESTÃO DE PRODUTOS (MASTER)
// ===========================================

// Key for LocalStorage
const STORAGE_KEY_PRODUCTS = 'erp_products';

// Initialize
window.renderProdutosGrid = function () {
    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) return;

    const produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');

    if (produtos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">Nenhum produto cadastrado.</td></tr>`;
        return;
    }

    // Sort by Name
    produtos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    tbody.innerHTML = produtos.map(p => `
        <tr>
            <td style="font-weight:bold;">${p.sku || '-'}</td>
            <td>${p.nome || '-'}</td>
            <td>${p.unidade || '-'}</td>
            <td>${p.grupo || '-'}</td>
            <td style="text-align:right;">${parseFloat(p.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td style="text-align:right;">
                <button class="btn btn-sm btn-secondary" onclick="editProduto('${p.id}')">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduto('${p.id}')" style="margin-left:0.5rem;">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
};

window.saveProduto = function () {
    const id = document.getElementById('prodId').value;
    const sku = document.getElementById('prodSku').value.trim();
    const nome = document.getElementById('prodNome').value.trim();

    if (!sku || !nome) {
        alert('SKU e Nome são obrigatórios.');
        return;
    }

    const produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');

    // Check duplication if new
    if (!id && produtos.some(p => p.sku === sku)) {
        alert('Já existe um produto com este SKU.');
        return;
    }

    const produto = {
        id: id || 'prod_' + Date.now(),
        sku: sku,
        nome: nome,
        unidade: document.getElementById('prodUnidade').value,
        grupo: document.getElementById('prodGrupo').value,
        custo: parseFloat(document.getElementById('prodCusto').value) || 0,
        preco: parseFloat(document.getElementById('prodPreco').value) || 0,
        // Fiscal
        ncm: document.getElementById('prodNcm').value,
        cest: document.getElementById('prodCest').value,
        ean: document.getElementById('prodEan').value,
        origem: document.getElementById('prodOrigem').value,
        cfop: document.getElementById('prodCfop').value,
        icmsRate: parseFloat(document.getElementById('prodIcmsRate').value) || 0,
        ipiRate: parseFloat(document.getElementById('prodIpiRate').value) || 0,
        pisRate: parseFloat(document.getElementById('prodPisRate').value) || 0,
        cofinsRate: parseFloat(document.getElementById('prodCofinsRate').value) || 0,
        // Logistica
        pesoLiq: parseFloat(document.getElementById('prodPesoLiq').value) || 0,
        pesoBruto: parseFloat(document.getElementById('prodPesoBruto').value) || 0,
        largura: parseFloat(document.getElementById('prodLargura').value) || 0,
        altura: parseFloat(document.getElementById('prodAltura').value) || 0,
        profundidade: parseFloat(document.getElementById('prodProfundidade').value) || 0,
        updatedAt: new Date().toISOString()
    };

    if (id) {
        // Update
        const index = produtos.findIndex(p => p.id === id);
        if (index > -1) produtos[index] = produto;
    } else {
        // Create
        produto.createdAt = new Date().toISOString();
        produtos.push(produto);
    }

    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(produtos));

    // Notify Sync (if WMS is listening via storage event or polling, integration handles it)
    console.log('✅ Produto salvo no ERP Master:', produto.sku);

    closeModal('cadProdutoModal');
    renderProdutosGrid();
    alert('Produto salvo com sucesso!');
};

window.editProduto = function (id) {
    const produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');
    const p = produtos.find(i => i.id === id);
    if (!p) return;

    document.getElementById('prodId').value = p.id;
    document.getElementById('prodSku').value = p.sku;
    document.getElementById('prodNome').value = p.nome;
    document.getElementById('prodUnidade').value = p.unidade || 'UN';
    document.getElementById('prodGrupo').value = p.grupo || '';
    document.getElementById('prodCusto').value = p.custo || '';
    document.getElementById('prodPreco').value = p.preco || '';

    // Fiscal
    document.getElementById('prodNcm').value = p.ncm || '';
    document.getElementById('prodCest').value = p.cest || '';
    document.getElementById('prodEan').value = p.ean || '';
    document.getElementById('prodOrigem').value = p.origem || '0';
    document.getElementById('prodCfop').value = p.cfop || '';
    document.getElementById('prodIcmsRate').value = p.icmsRate || '';
    document.getElementById('prodIpiRate').value = p.ipiRate || '';
    document.getElementById('prodPisRate').value = p.pisRate || '';
    document.getElementById('prodCofinsRate').value = p.cofinsRate || '';

    document.getElementById('prodPesoLiq').value = p.pesoLiq || '';
    document.getElementById('prodPesoBruto').value = p.pesoBruto || '';
    document.getElementById('prodLargura').value = p.largura || '';
    document.getElementById('prodAltura').value = p.altura || '';
    document.getElementById('prodProfundidade').value = p.profundidade || '';

    openModal('cadProdutoModal');
};

window.deleteProduto = function (id) {
    if (!confirm('Deseja excluir este produto?')) return;

    let produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');
    produtos = produtos.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(produtos));

    renderProdutosGrid();
};

window.newProduto = function () {
    document.getElementById('formProduto').reset();
    document.getElementById('prodId').value = '';
    document.getElementById('formProduto').reset();
    document.getElementById('prodId').value = '';
    // Reset tabs
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById('tab-prod-geral').style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelector('.tab-btn').classList.add('active'); // First one

    openModal('cadProdutoModal');
};

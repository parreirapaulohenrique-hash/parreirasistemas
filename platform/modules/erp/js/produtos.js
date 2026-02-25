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

    // Helper to safely read optional fields
    const getVal = (elId) => { const el = document.getElementById(elId); return el ? el.value : ''; };
    const getNum = (elId) => { const el = document.getElementById(elId); return el ? (parseFloat(el.value) || 0) : 0; };

    const produto = {
        id: id || 'prod_' + Date.now(),
        sku: sku,
        nome: nome,
        descricaoCompleta: getVal('prodDescCompleta') || nome,
        unidade: document.getElementById('prodUnidade').value,
        unidadeMaster: getVal('prodUnidadeMaster') || 'UN',
        qtUnitCx: getNum('prodQtUnitCx') || 1,
        grupo: document.getElementById('prodGrupo').value,
        idGrup: getVal('prodIdGrup') || '',
        custo: parseFloat(document.getElementById('prodCusto').value) || 0,
        preco: parseFloat(document.getElementById('prodPreco').value) || 0,
        descontoMaxProd: getNum('prodDescontoMax'),
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
        // Imagem
        imagem: getVal('prodImagem') || '',
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

    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };

    document.getElementById('prodId').value = p.id;
    document.getElementById('prodSku').value = p.sku;
    document.getElementById('prodNome').value = p.nome;
    document.getElementById('prodUnidade').value = p.unidade || 'UN';
    document.getElementById('prodGrupo').value = p.grupo || '';
    document.getElementById('prodCusto').value = p.custo || '';
    document.getElementById('prodPreco').value = p.preco || '';

    // FV-aligned fields
    setVal('prodDescCompleta', p.descricaoCompleta || '');
    setVal('prodUnidadeMaster', p.unidadeMaster || 'UN');
    setVal('prodQtUnitCx', p.qtUnitCx || '');
    setVal('prodIdGrup', p.idGrup || '');
    setVal('prodDescontoMax', p.descontoMaxProd || '');
    setVal('prodImagem', p.imagem || '');

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
    // Reset tabs
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    const tabGeral = document.getElementById('tab-prod-geral');
    if (tabGeral) tabGeral.style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const firstTab = document.querySelector('.tab-btn');
    if (firstTab) firstTab.classList.add('active');

    openModal('cadProdutoModal');
};

// ===========================================
// EXPORTAR PRODUTOS ERP → FV FORMAT
// ===========================================
window.exportProdutosParaFV = function () {
    const produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');
    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');

    return produtos.map(p => {
        const est = estoqueERP[p.sku] || {};
        return {
            sku: p.sku,
            nome: p.nome,
            descricaoCompleta: p.descricaoCompleta || p.nome,
            grupo: p.grupo || '',
            idGrup: p.idGrup || '',
            precoBase: p.preco || 0,
            estoque: est.disponivel || est.estoqueAtual || 0,
            unidade: p.unidade || 'UN',
            unidadeMaster: p.unidadeMaster || 'UN',
            qtUnitCx: p.qtUnitCx || 1,
            ipi: p.ipiRate || 0,
            descontoMaxProd: p.descontoMaxProd || 0,
            ean13: p.ean || '',
            imagem: p.imagem || '',
            flagNovo: 'N',
            flagAlter: 'N'
        };
    });
};

// ===========================================
// IMPORTAR PRODUTOS VIA EXCEL
// ===========================================
window.handleExcelImport = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Generate JSON array from Excel rows
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (rows.length === 0) {
                alert("O arquivo está vazio ou não pôde ser lido.");
                return;
            }

            let produtos = JSON.parse(localStorage.getItem(STORAGE_KEY_PRODUCTS) || '[]');
            let countSuccess = 0;
            let countSkipped = 0;

            rows.forEach(row => {
                // Try to map commonly named columns (adjust flexibly based on the headers)
                // Normalize keys to ignore case, accents, and all punctuation/spaces
                const normalize = (key) => key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

                let sku = "", nome = "", preco = 0, costo = 0, unidade = "UN", grupo = "", ncm = "", ean = "", pesoLiq = 0;

                for (const key in row) {
                    const normKey = normalize(key);
                    const val = String(row[key] || "").trim();

                    if (!val) continue; // Do not overwrite with empty cells

                    // Map fields prioritizing the first found match per row
                    if (!sku && ["sku", "codigo", "cod", "codigointerno", "codigoerp", "reffabricante", "referencia"].includes(normKey)) sku = val;
                    if (!nome && ["nome", "produto", "descricao", "descricaodoproduto", "nomedoproduto"].includes(normKey)) nome = val;
                    if (!preco && ["preco", "precovenda", "valor", "valorvenda", "venda"].includes(normKey)) preco = parseFloat(val.replace(',', '.')) || 0;
                    if (!costo && ["custo", "precocusto", "valorcusto"].includes(normKey)) costo = parseFloat(val.replace(',', '.')) || 0;
                    if (["unidade", "un", "und", "medida", "unidadedemedida"].includes(normKey)) unidade = val;
                    if (["grupo", "categoria", "departamento", "secao"].includes(normKey)) grupo = val;
                    if (!ncm && ["ncm", "classificacaofiscal"].includes(normKey)) ncm = val;
                    if (!ean && ["ean", "codigodebarras", "ean13", "gtin", "codigobarras"].includes(normKey)) ean = val;
                    if (!pesoLiq && ["peso", "pesoliq", "pesoliquido"].includes(normKey)) pesoLiq = parseFloat(val.replace(',', '.')) || 0;
                }

                if (!sku || !nome) {
                    // Skip if mandatory fields are missing
                    countSkipped++;
                    return;
                }

                // Append or edit
                const index = produtos.findIndex(p => p.sku === sku);
                if (index > -1) {
                    // Update main fields but preserve original ID and dates
                    produtos[index].nome = nome || produtos[index].nome;
                    produtos[index].preco = preco || produtos[index].preco;
                    produtos[index].custo = costo || produtos[index].custo;
                    produtos[index].unidade = unidade || produtos[index].unidade;
                    produtos[index].grupo = grupo || produtos[index].grupo;
                    produtos[index].ncm = ncm || produtos[index].ncm;
                    produtos[index].ean = ean || produtos[index].ean;
                    produtos[index].pesoLiq = pesoLiq || produtos[index].pesoLiq;
                    produtos[index].updatedAt = new Date().toISOString();
                    countSuccess++;
                } else {
                    // Create new
                    produtos.push({
                        id: 'prod_' + Date.now() + Math.floor(Math.random() * 1000),
                        sku: sku,
                        nome: nome,
                        descricaoCompleta: nome,
                        unidade: unidade || 'UN',
                        grupo: grupo,
                        custo: costo,
                        preco: preco,
                        ncm: ncm,
                        ean: ean,
                        pesoLiq: pesoLiq,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                    countSuccess++;
                }
            });

            localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(produtos));
            event.target.value = ""; // Reset input
            renderProdutosGrid();

            alert(`Importação concluída!\n\n${countSuccess} produtos importados/atualizados.\n${countSkipped} linhas ignoradas (SKU ou Nome em branco).`);

        } catch (error) {
            console.error("Erro na importação:", error);
            alert("Ocorreu um erro ao processar o arquivo. Verifique se é um arquivo Excel válido.");
        }
    };
    reader.readAsArrayBuffer(file);
};

console.log('📦 Módulo de Produtos ERP inicializado');

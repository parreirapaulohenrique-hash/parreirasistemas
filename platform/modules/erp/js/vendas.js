// ===========================================
// Parreira ERP - Módulo de Vendas
// ===========================================

// Estado do pedido atual
let vendaAtual = {
    numero: 0,
    data: new Date().toISOString().split('T')[0],
    empresa: '1',
    cliente: null,
    vendedor: null,
    itens: [],
    totalGeral: 0
};

// Inicializa o módulo quando a view é carregada
function initVendas() {
    document.getElementById('vendaData').value = new Date().toISOString().split('T')[0];
}

// Nova Venda - F1
window.novaVenda = function () {
    vendaAtual = {
        numero: gerarNumeroVenda(),
        data: new Date().toISOString().split('T')[0],
        empresa: '1',
        cliente: null,
        vendedor: null,
        itens: [],
        totalGeral: 0
    };

    // Limpar campos
    document.getElementById('vendaData').value = vendaAtual.data;
    document.getElementById('vendaCodCliente').value = '';
    document.getElementById('vendaNomeCliente').value = '';
    document.getElementById('vendaCpfCnpj').value = '';
    document.getElementById('vendaLimite').value = '0,00';
    document.getElementById('vendaCredito').value = '0,00';
    document.getElementById('vendaCodVendedor').value = '';
    document.getElementById('vendaOrigTroca').value = '0';
    document.getElementById('vendaCombos').value = '';

    // Limpar itens
    document.getElementById('itensVendaTableBody').innerHTML = '';

    // Atualizar footer
    atualizarTotaisVenda();

    document.getElementById('vendaNumPedido').textContent = vendaAtual.numero;
    alert('Nova venda iniciada! Nº ' + vendaAtual.numero);
};

// Gravar Venda - F2
window.gravarVenda = function () {
    if (!vendaAtual.cliente && !document.getElementById('vendaCodCliente').value) {
        alert('Informe o cliente!');
        return;
    }

    if (vendaAtual.itens.length === 0) {
        alert('Adicione pelo menos um item!');
        return;
    }

    // Salvar no localStorage/Firebase
    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    vendas.push({ ...vendaAtual, dataGravacao: new Date().toISOString() });
    localStorage.setItem('erp_vendas', JSON.stringify(vendas));

    alert('Venda ' + vendaAtual.numero + ' gravada com sucesso!');
    novaVenda();
};

// Cancelar Venda - F4
window.cancelarVenda = function () {
    if (confirm('Deseja cancelar esta venda?')) {
        novaVenda();
    }
};

// Buscar Vendas
window.buscarVendas = function () {
    alert('Funcionalidade de busca de vendas em desenvolvimento.');
};

// Buscar Cliente
window.buscarCliente = function () {
    const cod = document.getElementById('vendaCodCliente').value;
    if (!cod) {
        alert('Informe o código do cliente.');
        return;
    }

    // Simular busca de cliente
    const clientes = JSON.parse(localStorage.getItem('erp_entities') || '[]');
    const cliente = clientes.find(c => c.id === cod || c.codigo === cod);

    if (cliente) {
        document.getElementById('vendaNomeCliente').value = cliente.nome || cliente.razaoSocial || '';
        document.getElementById('vendaCpfCnpj').value = cliente.cpfCnpj || cliente.cnpj || '';
        document.getElementById('vendaLimite').value = formatarMoeda(cliente.limiteCredito || 0);
        document.getElementById('vendaCredito').value = formatarMoeda(cliente.creditoDisponivel || 0);
        vendaAtual.cliente = cliente;
    } else {
        alert('Cliente não encontrado.');
    }
};

// Buscar Produto
window.buscarProduto = function () {
    const cod = document.getElementById('itemCodigo').value;
    if (!cod) {
        alert('Informe o código do produto.');
        return;
    }

    // Simular busca de produto
    const produtos = JSON.parse(localStorage.getItem('erp_products') || '[]');
    const produto = produtos.find(p => p.sku === cod || p.id === cod);

    if (produto) {
        document.getElementById('itemProduto').value = produto.nome || '';
        document.getElementById('itemEmbalagem').value = produto.embalagem || 'UN';
        document.getElementById('itemPreco').value = formatarMoeda(produto.preco || 0);
        calcularTotalParcial();
    } else {
        // Simular produto demo
        document.getElementById('itemProduto').value = 'PRODUTO DEMONSTRAÇÃO ' + cod;
        document.getElementById('itemEmbalagem').value = 'UN';
        document.getElementById('itemPreco').value = '10,00';
        calcularTotalParcial();
    }
};

// Calcular Total Parcial do item
function calcularTotalParcial() {
    const qtd = parseFloat(document.getElementById('itemQtd').value.replace(',', '.')) || 0;
    const preco = parseFloat(document.getElementById('itemPreco').value.replace(',', '.')) || 0;
    const desconto = parseFloat(document.getElementById('itemDesconto').value.replace(',', '.')) || 0;

    const subtotal = qtd * preco;
    const valorDesconto = subtotal * (desconto / 100);
    const total = subtotal - valorDesconto;

    document.getElementById('itemTotalParcial').value = formatarMoeda(total);
}

// Adicionar Item à venda
window.adicionarItem = function () {
    const codigo = document.getElementById('itemCodigo').value;
    const produto = document.getElementById('itemProduto').value;
    const embalagem = document.getElementById('itemEmbalagem').value;
    const qtd = document.getElementById('itemQtd').value;
    const desconto = document.getElementById('itemDesconto').value;
    const preco = document.getElementById('itemPreco').value;
    const totalParcial = document.getElementById('itemTotalParcial').value;
    const retira = document.getElementById('itemRetira').value;

    if (!codigo || !produto) {
        alert('Informe o produto!');
        return;
    }

    const seq = vendaAtual.itens.length + 1;

    const item = {
        seq,
        retira,
        codigo,
        produto,
        embalagem,
        unidade: 'UN',
        quantidade: qtd,
        desconto,
        precoNegociado: preco,
        valorUnitario: preco,
        parcial: totalParcial
    };

    vendaAtual.itens.push(item);

    renderizarItensVenda();
    limparCamposItem();
    atualizarTotaisVenda();
};

// Renderiza a grid de itens
function renderizarItensVenda() {
    const tbody = document.getElementById('itensVendaTableBody');
    tbody.innerHTML = vendaAtual.itens.map(item => `
        <tr>
            <td>${item.retira}</td>
            <td>${item.seq}</td>
            <td>${item.codigo}</td>
            <td>${item.produto}</td>
            <td>${item.embalagem}</td>
            <td>${item.unidade}</td>
            <td style="text-align:right;">${item.quantidade}</td>
            <td style="text-align:right;">${item.desconto}</td>
            <td style="text-align:right;">${item.precoNegociado}</td>
            <td style="text-align:right;">${item.valorUnitario}</td>
            <td style="text-align:right;">${item.parcial}</td>
        </tr>
    `).join('');
}

// Limpar campos de item
function limparCamposItem() {
    document.getElementById('itemCodigo').value = '';
    document.getElementById('itemProduto').value = '';
    document.getElementById('itemEmbalagem').value = '';
    document.getElementById('itemQtd').value = '0,000';
    document.getElementById('itemDesconto').value = '0,00';
    document.getElementById('itemPreco').value = '0,0000';
    document.getElementById('itemTotalParcial').value = '0,0000';
}

// Atualizar totais da venda
function atualizarTotaisVenda() {
    const totalItens = vendaAtual.itens.length;
    let totalGeral = 0;

    vendaAtual.itens.forEach(item => {
        totalGeral += parseFloat(item.parcial.replace(',', '.')) || 0;
    });

    vendaAtual.totalGeral = totalGeral;

    document.getElementById('vendaQtItens').textContent = totalItens;
    document.getElementById('vendaTotalGeral').textContent = formatarMoeda(totalGeral);
    document.getElementById('vendaValorFinal').value = formatarMoeda(totalGeral);
}

// Mostrar Parcelas
window.mostrarParcelas = function () {
    alert('Funcionalidade de parcelas em desenvolvimento.');
};

// Gerar número de venda
function gerarNumeroVenda() {
    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    return vendas.length + 1;
}

// Formatar moeda
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Atalhos de teclado
document.addEventListener('keydown', function (e) {
    if (document.getElementById('view-sales').style.display !== 'none') {
        if (e.key === 'F1') {
            e.preventDefault();
            novaVenda();
        } else if (e.key === 'F2') {
            e.preventDefault();
            gravarVenda();
        } else if (e.key === 'F4') {
            e.preventDefault();
            cancelarVenda();
        }
    }
});

// Auto-calcular total parcial quando mudar campos
document.addEventListener('DOMContentLoaded', function () {
    ['itemQtd', 'itemDesconto', 'itemPreco'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', calcularTotalParcial);
            el.addEventListener('keyup', calcularTotalParcial);
        }
    });

    // Inicializar datas de cancelamento
    const hoje = new Date().toISOString().split('T')[0];
    const cancelDataIni = document.getElementById('cancelDataIni');
    const cancelDataFim = document.getElementById('cancelDataFim');
    if (cancelDataIni) cancelDataIni.value = hoje;
    if (cancelDataFim) cancelDataFim.value = hoje;
});

// ===========================================
// MÓDULO DE CANCELAMENTO
// ===========================================

// Buscar pedidos para cancelamento
window.buscarPedidosCancelamento = function () {
    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');

    // Mock data para demonstração
    const mockData = [
        { emp: '01', dtEmissao: '04/02/2026', nCarreg: '40777', nDoc: '49499', nPedido: '64095', especie: 'NF', cod: '223', cliente: 'EDILSON SILVA SOUSA 61068624272', valorTotal: 19.50, canceladoEm: '', obs: '' },
        { emp: '01', dtEmissao: '04/02/2026', nCarreg: '40789', nDoc: '49504', nPedido: '64116', especie: 'NF', cod: '1556', cliente: 'A C F DE CARVALHO COM. DE PCS E SERVICOS', valorTotal: 65.66, canceladoEm: '', obs: '' },
        { emp: '01', dtEmissao: '04/02/2026', nCarreg: '40795', nDoc: '49517', nPedido: '64119', especie: 'NF', cod: '48', cliente: 'EVA SILVA BARROS DE ALMEIDA', valorTotal: 306.00, canceladoEm: '', obs: '' },
        { emp: '01', dtEmissao: '04/02/2026', nCarreg: '40811', nDoc: '49520', nPedido: '64134', especie: 'NF', cod: '10', cliente: 'C B DOS SANTOS', valorTotal: 255.00, canceladoEm: '', obs: '' },
        { emp: '01', dtEmissao: '04/02/2026', nCarreg: '40823', nDoc: '49525', nPedido: '64148', especie: 'NF', cod: '176', cliente: 'M. SOBREIRA ALVES', valorTotal: 17.00, canceladoEm: '', obs: '' }
    ];

    const dados = vendas.length > 0 ? vendas.map((v, i) => ({
        emp: v.empresa || '01',
        dtEmissao: new Date(v.dataGravacao || v.data).toLocaleDateString('pt-BR'),
        nCarreg: '',
        nDoc: '',
        nPedido: v.numero || i + 1,
        especie: 'NF',
        cod: v.cliente?.id || '',
        cliente: v.cliente?.nome || 'Cliente ' + (i + 1),
        valorTotal: v.totalGeral || 0,
        canceladoEm: v.cancelado ? v.canceladoEm : '',
        obs: ''
    })) : mockData;

    renderizarTabelaCancelamento(dados);
};

// Renderizar tabela de cancelamento
function renderizarTabelaCancelamento(dados) {
    const tbody = document.getElementById('cancelamentoTableBody');
    if (!tbody) return;

    tbody.innerHTML = dados.map((item, idx) => `
        <tr>
            <td><input type="radio" name="selCancel" value="${idx}"></td>
            <td>${item.emp}</td>
            <td>${item.dtEmissao}</td>
            <td>${item.nCarreg}</td>
            <td>${item.nDoc}</td>
            <td>${item.nPedido}</td>
            <td>${item.especie}</td>
            <td>${item.cod}</td>
            <td>${item.cliente}</td>
            <td style="text-align:right;">${typeof item.valorTotal === 'number' ? item.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : item.valorTotal}</td>
            <td>${item.canceladoEm || ''}</td>
            <td>${item.obs || ''}</td>
        </tr>
    `).join('');

    document.getElementById('cancelQtdNotas').textContent = dados.length;
}

// Cancelar pedido selecionado
window.cancelarPedidoSelecionado = function () {
    const selected = document.querySelector('input[name="selCancel"]:checked');
    if (!selected) {
        alert('Selecione um pedido para cancelar.');
        return;
    }

    if (confirm('Confirma o cancelamento deste pedido?')) {
        alert('Pedido cancelado com sucesso!');
        buscarPedidosCancelamento();
    }
};

// Switch tabs cancelamento
window.switchTabCancel = function (btn, tabId) {
    // Remove active from all tabs
    document.querySelectorAll('#view-cancelamento .tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#view-cancelamento .tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    // Activate selected
    btn.classList.add('active');
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
        tab.style.display = 'block';
    }
};

// ===========================================
// Parreira ERP - Módulo de Integrações
// Estruturas JSON para Pedidos/Notas Fiscais
// + Listeners para Estoque WMS <-> ERP
// ===========================================

// ===========================================
// 1. ESTRUTURA JSON - PEDIDOS DE VENDA
// ===========================================
const PedidoSchema = {
    numero: 0,
    serie: '1',
    data: '',
    empresa: '1',
    status: 'aberto', // aberto | faturado | cancelado
    cliente: {
        codigo: '',
        razaoSocial: '',
        cnpjCpf: '',
        ie: '',
        endereco: { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '' }
    },
    vendedor: { codigo: '', nome: '', comissao: 0 },
    condicaoPagamento: { codigo: '', descricao: '', parcelas: 1 },
    cobranca: { codigo: '', descricao: '' },
    itens: [
        // {seq, sku, descricao, ncm, cfop, unidade, quantidade, valorUnitario, desconto, valorTotal, icms, pis, cofins, ipi}
    ],
    totais: {
        subtotal: 0,
        desconto: 0,
        frete: 0,
        seguro: 0,
        outrasDespesas: 0,
        totalProdutos: 0,
        totalNF: 0,
        baseICMS: 0,
        valorICMS: 0,
        valorPIS: 0,
        valorCOFINS: 0,
        valorIPI: 0
    },
    transporte: {
        modalidadeFrete: 0, // 0=Emitente, 1=Destinatário, 9=Sem frete
        transportadora: { cnpj: '', razaoSocial: '', ie: '' },
        volumes: { quantidade: 0, especie: '', pesoLiquido: 0, pesoBruto: 0 }
    },
    observacao: '',
    createdAt: '',
    updatedAt: ''
};

// ===========================================
// 2. ESTRUTURA JSON - NOTA FISCAL ELETRÔNICA
// ===========================================
const NFeSchema = {
    chaveAcesso: '',
    numero: 0,
    serie: '1',
    naturezaOperacao: '',
    tipoOperacao: 1, // 0=Entrada, 1=Saída
    finalidade: 1,   // 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução
    data: '',
    emitente: {
        cnpj: '', razaoSocial: '', fantasia: '', ie: '',
        endereco: { logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '', codigoMunicipio: '' },
        crt: 3 // 1=SN, 2=SN Ex, 3=Normal
    },
    destinatario: {
        cnpjCpf: '', razaoSocial: '', ie: '', indIE: 1,
        endereco: { logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '', codigoMunicipio: '' }
    },
    itens: [
        // {seq, cProd, cEAN, xProd, NCM, CFOP, uCom, qCom, vUnCom, vProd, ICMS:{orig,CST,modBC,vBC,pICMS,vICMS}, PIS:{CST,vBC,pPIS,vPIS}, COFINS:{CST,vBC,pCOFINS,vCOFINS}}
    ],
    totais: {
        vBC: 0, vICMS: 0, vICMSDeson: 0, vFCPUFDest: 0,
        vBCST: 0, vST: 0, vProd: 0, vFrete: 0, vSeg: 0,
        vDesc: 0, vII: 0, vIPI: 0, vPIS: 0, vCOFINS: 0,
        vOutro: 0, vNF: 0
    },
    transporte: {
        modFrete: 0,
        transporta: { cnpj: '', xNome: '', ie: '' },
        vol: { qVol: 0, esp: '', pesoL: 0, pesoB: 0 }
    },
    pagamento: {
        formas: [
            // {indPag: 0/1, tPag: '01', vPag: 0}
        ]
    },
    informacoesAdicionais: '',
    pedidoOrigem: null, // Link to PedidoSchema.numero
    protocolo: '',
    statusSEFAZ: 'pendente', // pendente | autorizada | rejeitada | cancelada
    createdAt: '',
    updatedAt: ''
};

// ===========================================
// 3. FUNÇÕES DE CONVERSÃO
// ===========================================

/**
 * Converte um Pedido de Venda em estrutura de NF-e
 */
window.pedidoParaNFe = function (pedido) {
    const user = JSON.parse(localStorage.getItem('platform_user_logged') || '{}');
    const emitente = JSON.parse(localStorage.getItem('erp_empresa') || '{}');

    return {
        ...JSON.parse(JSON.stringify(NFeSchema)),
        numero: gerarNumeroNFe(),
        naturezaOperacao: 'VENDA DE MERCADORIAS',
        tipoOperacao: 1,
        finalidade: 1,
        data: new Date().toISOString(),
        emitente: {
            cnpj: emitente.cnpj || '',
            razaoSocial: emitente.razaoSocial || user.tenant || '',
            fantasia: emitente.fantasia || '',
            ie: emitente.ie || '',
            endereco: emitente.endereco || {},
            crt: emitente.crt || 3
        },
        destinatario: {
            cnpjCpf: pedido.cliente?.cnpjCpf || '',
            razaoSocial: pedido.cliente?.razaoSocial || '',
            ie: pedido.cliente?.ie || '',
            indIE: 1,
            endereco: pedido.cliente?.endereco || {}
        },
        itens: (pedido.itens || []).map((item, idx) => ({
            seq: idx + 1,
            cProd: item.sku,
            cEAN: 'SEM GTIN',
            xProd: item.descricao,
            NCM: item.ncm || '00000000',
            CFOP: item.cfop || '5102',
            uCom: item.unidade || 'UN',
            qCom: item.quantidade,
            vUnCom: item.valorUnitario,
            vProd: item.valorTotal,
            ICMS: { orig: '0', CST: '00', modBC: '0', vBC: item.valorTotal, pICMS: item.icms || 0, vICMS: (item.valorTotal * (item.icms || 0) / 100) },
            PIS: { CST: '01', vBC: item.valorTotal, pPIS: item.pis || 1.65, vPIS: (item.valorTotal * (item.pis || 1.65) / 100) },
            COFINS: { CST: '01', vBC: item.valorTotal, pCOFINS: item.cofins || 7.6, vCOFINS: (item.valorTotal * (item.cofins || 7.6) / 100) }
        })),
        totais: {
            vProd: pedido.totais?.totalProdutos || 0,
            vDesc: pedido.totais?.desconto || 0,
            vFrete: pedido.totais?.frete || 0,
            vNF: pedido.totais?.totalNF || 0,
            vBC: pedido.totais?.baseICMS || 0,
            vICMS: pedido.totais?.valorICMS || 0,
            vPIS: pedido.totais?.valorPIS || 0,
            vCOFINS: pedido.totais?.valorCOFINS || 0,
            vIPI: pedido.totais?.valorIPI || 0,
            vBCST: 0, vST: 0, vICMSDeson: 0, vFCPUFDest: 0,
            vII: 0, vSeg: pedido.totais?.seguro || 0, vOutro: pedido.totais?.outrasDespesas || 0
        },
        transporte: pedido.transporte || {},
        pedidoOrigem: pedido.numero,
        createdAt: new Date().toISOString()
    };
};

function gerarNumeroNFe() {
    const nfes = JSON.parse(localStorage.getItem('erp_nfes') || '[]');
    return nfes.length > 0 ? Math.max(...nfes.map(n => n.numero)) + 1 : 1;
}

// ===========================================
// 4. LISTENERS DE ESTOQUE WMS ↔ ERP
// ===========================================

/**
 * Listener: Quando WMS recebe mercadoria → atualiza estoque ERP
 */
window.onWmsRecebimento = function (recebimento) {
    console.log('🔄 WMS→ERP: Recebimento processado', recebimento);

    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque') || '{}');

    (recebimento.itens || []).forEach(item => {
        const key = item.sku || item.codigo;
        if (!estoqueERP[key]) {
            estoqueERP[key] = { sku: key, descricao: item.descricao || '', estoqueAtual: 0, reservado: 0, disponivel: 0, custoMedio: 0 };
        }
        estoqueERP[key].estoqueAtual += Number(item.quantidade || 0);
        estoqueERP[key].disponivel = estoqueERP[key].estoqueAtual - estoqueERP[key].reservado;

        // Atualizar custo médio
        if (item.valorUnitario) {
            const qtAnterior = estoqueERP[key].estoqueAtual - Number(item.quantidade);
            const custoAnterior = estoqueERP[key].custoMedio * qtAnterior;
            const custoNovo = Number(item.valorUnitario) * Number(item.quantidade);
            estoqueERP[key].custoMedio = (custoAnterior + custoNovo) / estoqueERP[key].estoqueAtual;
        }
    });

    localStorage.setItem('erp_estoque', JSON.stringify(estoqueERP));
    console.log('✅ Estoque ERP atualizado via recebimento WMS');

    // Notificar outros módulos
    window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'wms-recebimento', itens: recebimento.itens } }));
};

/**
 * Listener: Quando ERP grava venda/NF → reserva estoque e notifica WMS
 */
window.onErpVendaFaturada = function (pedido) {
    console.log('🔄 ERP→WMS: Venda faturada, reservando estoque', pedido);

    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque') || '{}');
    const tarefasWMS = JSON.parse(localStorage.getItem('wms_tarefas_separacao') || '[]');

    (pedido.itens || []).forEach(item => {
        const key = item.sku;
        if (estoqueERP[key]) {
            estoqueERP[key].reservado += Number(item.quantidade || 0);
            estoqueERP[key].disponivel = estoqueERP[key].estoqueAtual - estoqueERP[key].reservado;
        }

        // Gerar tarefa de separação no WMS
        tarefasWMS.push({
            id: 'sep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            pedido: pedido.numero,
            sku: item.sku,
            descricao: item.descricao,
            quantidade: item.quantidade,
            enderecoOrigem: item.endereco || '',
            status: 'pendente',
            prioridade: pedido.prioridade || 'normal',
            createdAt: new Date().toISOString()
        });
    });

    localStorage.setItem('erp_estoque', JSON.stringify(estoqueERP));
    localStorage.setItem('wms_tarefas_separacao', JSON.stringify(tarefasWMS));

    console.log(`✅ ${pedido.itens?.length || 0} tarefas de separação criadas no WMS`);

    window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'erp-venda', pedido: pedido.numero } }));
    window.dispatchEvent(new CustomEvent('wms-separacao-nova', { detail: { pedido: pedido.numero, tarefas: tarefasWMS.length } }));
};

/**
 * Listener: Quando WMS confirma separação → baixa reserva e gera NF
 */
window.onWmsSeparacaoConcluida = function (separacao) {
    console.log('🔄 WMS→ERP: Separação concluída', separacao);

    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque') || '{}');

    (separacao.itens || []).forEach(item => {
        const key = item.sku;
        if (estoqueERP[key]) {
            estoqueERP[key].estoqueAtual -= Number(item.quantidade || 0);
            estoqueERP[key].reservado -= Number(item.quantidade || 0);
            estoqueERP[key].disponivel = estoqueERP[key].estoqueAtual - estoqueERP[key].reservado;
        }
    });

    localStorage.setItem('erp_estoque', JSON.stringify(estoqueERP));
    console.log('✅ Estoque ERP baixado após separação WMS');

    window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'wms-separacao', pedido: separacao.pedido } }));
};

/**
 * Listener: Devolução de venda → estorna estoque
 */
window.onErpDevolucao = function (devolucao) {
    console.log('🔄 ERP: Devolução processada', devolucao);

    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque') || '{}');

    (devolucao.itens || []).forEach(item => {
        const key = item.sku;
        if (!estoqueERP[key]) {
            estoqueERP[key] = { sku: key, descricao: item.descricao || '', estoqueAtual: 0, reservado: 0, disponivel: 0, custoMedio: 0 };
        }
        estoqueERP[key].estoqueAtual += Number(item.quantidade || 0);
        estoqueERP[key].disponivel = estoqueERP[key].estoqueAtual - estoqueERP[key].reservado;
    });

    localStorage.setItem('erp_estoque', JSON.stringify(estoqueERP));

    // Gerar tarefa de armazenagem no WMS para itens devolvidos
    const tarefasPutaway = JSON.parse(localStorage.getItem('wms_tarefas_putaway') || '[]');
    (devolucao.itens || []).forEach(item => {
        tarefasPutaway.push({
            id: 'put_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            sku: item.sku,
            descricao: item.descricao,
            quantidade: item.quantidade,
            origem: 'DEVOLUÇÃO',
            nfOrigem: devolucao.nfOrigem,
            status: 'pendente',
            createdAt: new Date().toISOString()
        });
    });
    localStorage.setItem('wms_tarefas_putaway', JSON.stringify(tarefasPutaway));

    console.log('✅ Estoque estornado e tarefas de putaway criadas para devolução');
    window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'erp-devolucao' } }));
};

// ===========================================
// 5. MONITOR DE EVENTOS (LOG)
// ===========================================
window.addEventListener('estoque-atualizado', (e) => {
    console.log(`📦 [Estoque] Atualização: origem=${e.detail.origem}`, e.detail);
});

window.addEventListener('wms-separacao-nova', (e) => {
    console.log(`📋 [WMS] Novas tarefas de separação: pedido=${e.detail.pedido}, total=${e.detail.tarefas}`);
});

// Export schemas for external use
window.PedidoSchema = PedidoSchema;
window.NFeSchema = NFeSchema;

console.log('🔗 Módulo de Integrações ERP↔WMS inicializado');

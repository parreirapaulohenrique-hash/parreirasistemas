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
/**
 * Listener: Quando ERP grava venda/NF → reserva estoque e notifica WMS
 */
window.onErpVendaFaturada = function (pedido) {
    console.log('🔄 ERP→WMS: Venda faturada, reservando estoque', pedido);

    const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque') || '{}');
    const wmsPedidos = JSON.parse(localStorage.getItem('wms_pedidos') || '[]');
    const wmsStock = JSON.parse(localStorage.getItem('wms_mock_data') || '{"addresses":[]}');

    // 1. Reserva no ERP
    (pedido.itens || []).forEach(item => {
        const key = item.sku;
        if (!estoqueERP[key]) {
            estoqueERP[key] = { sku: key, descricao: item.descricao || '', estoqueAtual: 0, reservado: 0, disponivel: 0 };
        }
        estoqueERP[key].reservado += Number(item.quantidade || 0);
        estoqueERP[key].disponivel = estoqueERP[key].estoqueAtual - estoqueERP[key].reservado;
    });

    // 2. Enviar para WMS (wms_pedidos)
    const exists = wmsPedidos.find(wp => wp.id === `PED-${pedido.numero}`);
    if (!exists) {
        const newWmsOrder = {
            id: `PED-${pedido.numero}`,
            cliente: pedido.cliente?.razaoSocial || pedido.cliente?.favorito || 'Cliente ' + pedido.cliente?.codigo,
            prioridade: pedido.prioridade || 'NORMAL',
            itens: (pedido.itens || []).map(i => ({
                sku: i.sku,
                desc: i.descricao || i.nome,
                qtd: i.quantidade,
                endereco: 'A-00-00-00'
            })),
            status: 'PENDENTE',
            created: new Date().toISOString()
        };
        wmsPedidos.push(newWmsOrder);

        // 3. Reserva WMS (Físico)
        (pedido.itens || []).forEach(item => {
            let remaining = item.quantidade;
            const candidates = wmsStock.addresses.filter(a => a.sku === item.sku && a.status === 'OCUPADO' && (a.qty - (a.reserved || 0)) > 0);
            for (const addr of candidates) {
                if (remaining <= 0) break;
                const available = addr.qty - (addr.reserved || 0);
                const take = Math.min(available, remaining);
                addr.reserved = (addr.reserved || 0) + take;
                remaining -= take;
            }
        });
    }

    localStorage.setItem('erp_estoque', JSON.stringify(estoqueERP));
    localStorage.setItem('wms_pedidos', JSON.stringify(wmsPedidos));
    localStorage.setItem('wms_mock_data', JSON.stringify(wmsStock));

    console.log(`✅ Pedido PED-${pedido.numero} enviado ao WMS e estoque reservado.`);

    window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'erp-venda', pedido: pedido.numero } }));
};

/**
 * Entry Point: Receber Pedido do Força de Vendas
 * Adapter completo FV → ERP PedidoSchema (v3.0)
 */
window.onErpReceberPedidoFV = function (pedidoFV) {
    console.log('🔄 FV→ERP: Recebendo pedido', pedidoFV.id || pedidoFV.numero);

    // ─── Montar itens com IPI, desconto e fiscais ────────
    const itensERP = (pedidoFV.itens || []).map((i, idx) => {
        const valorBruto = (i.qtd || 0) * (i.preco || 0);
        const descItem = i.desconto || 0; // % desconto
        const valorDesc = valorBruto * descItem / 100;
        const valorLiq = valorBruto - valorDesc;
        const ipiPerc = i.ipi || i.percIpi || 0;
        const valorIpi = valorLiq * ipiPerc / 100;

        return {
            seq: idx + 1,
            sku: i.sku || '',
            descricao: i.nome || i.descricao || '',
            ncm: i.ncm || '00000000',
            cfop: i.cfop || '5102',
            unidade: i.unidade || 'UN',
            quantidade: i.qtd || 0,
            valorUnitario: i.preco || 0,
            desconto: descItem,
            valorDesconto: valorDesc,
            valorTotal: valorLiq,
            ipi: ipiPerc,
            valorIpi: valorIpi,
            precoQtde: i.precoQtde || false
        };
    });

    const totalProdutos = itensERP.reduce((s, i) => s + i.valorTotal, 0);
    const totalIpi = itensERP.reduce((s, i) => s + i.valorIpi, 0);
    const totalDesconto = itensERP.reduce((s, i) => s + i.valorDesconto, 0);

    // ─── Adapter FV → ERP PedidoSchema ───────────────────
    const pedidoERP = {
        numero: pedidoFV.id || pedidoFV.numero || ('FV-' + Date.now()),
        serie: '1',
        data: pedidoFV.data || new Date().toISOString().slice(0, 10),
        empresa: pedidoFV.codEmpresa || '01',
        status: pedidoFV.status || 'aberto',
        stpPedido: pedidoFV.stpPedido || 'Pre-Venda',
        origemFV: true,

        // ── Cliente ──
        cliente: {
            codigo: pedidoFV.clienteId || pedidoFV.cliente?.codigo || '',
            razaoSocial: pedidoFV.clienteNome || pedidoFV.cliente?.razaoSocial || pedidoFV.cliente?.nome || '',
            fantasia: pedidoFV.cliente?.fantasia || pedidoFV.clienteNome || '',
            cnpjCpf: pedidoFV.clienteCnpjCpf || pedidoFV.cliente?.cnpjCpf || '',
            ie: pedidoFV.cliente?.inscEstadual || pedidoFV.cliente?.ie || '',
            endereco: {
                logradouro: pedidoFV.cliente?.endereco || '',
                cidade: pedidoFV.cliente?.cidade || '',
                uf: pedidoFV.cliente?.uf || '',
                cep: pedidoFV.cliente?.cep || '',
                bairro: pedidoFV.cliente?.bairro || ''
            }
        },

        // ── Vendedor ──
        vendedor: {
            codigo: pedidoFV.vendedorCodigo || '32',
            nome: pedidoFV.vendedorNome || '',
            comissao: 0
        },

        // ── Condição de Pagamento ──
        condicaoPagamento: {
            codigo: pedidoFV.idFormPg || '',
            descricao: pedidoFV.planoPagamento || '',
            parcelas: pedidoFV.parcelas || 1
        },

        // ── Transporte ──
        transporte: {
            modalidadeFrete: 0,
            transportadora: {
                codigo: pedidoFV.codfornecTransp || '',
                razaoSocial: pedidoFV.transportadora || '',
                cnpj: '',
                ie: ''
            },
            volumes: { quantidade: 0, especie: '', pesoLiquido: 0, pesoBruto: 0 }
        },

        // ── Itens ──
        itens: itensERP,

        // ── Totais ──
        totais: {
            subtotal: totalProdutos + totalDesconto,
            desconto: totalDesconto,
            totalProdutos: totalProdutos,
            totalNF: pedidoFV.valorTotal || totalProdutos + totalIpi,
            valorIPI: totalIpi,
            porDesconto: pedidoFV.porDesconto || 0,
            frete: 0,
            seguro: 0,
            outrasDespesas: 0,
            baseICMS: 0,
            valorICMS: 0,
            valorPIS: 0,
            valorCOFINS: 0
        },

        // ── Extras ──
        observacao: pedidoFV.obs || '',
        rota: pedidoFV.rota || 0,
        valorFlex: pedidoFV.valorFlex || 0,
        sincronizado: pedidoFV.sincronizado || 'N',
        flagEnvio: pedidoFV.flagEnvio || 'N',

        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // ─── Salvar no ERP Vendas ────────────────────────────
    const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    const existIdx = vendas.findIndex(v => v.numero === pedidoERP.numero);
    if (existIdx > -1) {
        vendas[existIdx] = pedidoERP;
        console.log('🔄 Pedido FV atualizado no ERP:', pedidoERP.numero);
    } else {
        vendas.push(pedidoERP);
        console.log('✅ Pedido FV inserido no ERP:', pedidoERP.numero);
    }
    localStorage.setItem('erp_vendas', JSON.stringify(vendas));

    // ─── Se status é 'venda' ou 'faturado', processar faturamento ──
    if (['venda', 'faturado', 'separado', 'despachado'].includes(pedidoERP.status)) {
        window.onErpVendaFaturada(pedidoERP);
    }

    return pedidoERP;
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

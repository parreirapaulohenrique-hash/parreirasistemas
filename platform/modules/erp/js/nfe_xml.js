// ===========================================
// GERADOR DE XML NF-e 4.0
// ===========================================

window.generateNfeXml = function (notaId) {
    // 1. Load Data
    const notas = JSON.parse(localStorage.getItem('erp_nfe_notas') || '[]');
    const nota = notas.find(n => n.id === notaId);
    if (!nota) return 'ERRO: Nota não encontrada.';

    const pedidos = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
    const pedido = pedidos.find(p => p.id === nota.pedido || p.numero === nota.pedido); // Support ID or Number

    // If no order linked, use mock items
    let itens = [];
    if (pedido && pedido.itens) {
        itens = pedido.itens;
    } else {
        // Mock items if no order found
        itens = [
            { id: '1', sku: 'MOCK001', nome: 'PRODUTO TESTE', qtd: 1, valorUnitario: 100 }
        ];
    }

    const clientes = JSON.parse(localStorage.getItem('erp_clientes') || '[]');
    // Mock client search if code exists
    const cliente = clientes.find(c => c.codigo == nota.codCliente) || {
        razaoSocial: nota.cliente,
        cnpjCpf: '00000000000000',
        endereco: 'Rua Teste, 100',
        bairro: 'Centro',
        cidade: 'Cidade Teste',
        uf: 'SP',
        cep: '00000-000'
    };

    const emitente = {
        cnpj: '12345678000199',
        razaoSocial: 'LT DISTRIBUIDORA LTDA',
        fantasia: 'LT DISTRIBUIDORA',
        endereco: 'AVENIDA INDUSTRIAL, 1000',
        bairro: 'DISTRITO INDUSTRIAL',
        cidade: 'CONTAGEM',
        uf: 'MG',
        cep: '32000-000',
        ie: '123456789'
    };

    // Products Master (for Tax Info)
    const produtosMaster = JSON.parse(localStorage.getItem('erp_products') || '[]');

    // 2. Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${nota.chaveAcesso || 'PENDENTE'}" versao="4.00">
        <ide>
            <cUF>31</cUF>
            <cNF>${Math.floor(Math.random() * 99999999)}</cNF>
            <natOp>VENDA DE MERCADORIA</natOp>
            <mod>55</mod>
            <serie>${nota.serie}</serie>
            <nNF>${nota.numNota}</nNF>
            <dhEmi>${new Date().toISOString()}</dhEmi>
            <tpNF>1</tpNF>
            <idDest>1</idDest>
            <cMunFG>3118601</cMunFG>
            <tpImp>1</tpImp>
            <tpEmis>1</tpEmis>
            <cDV>0</cDV>
            <tpAmb>2</tpAmb>
            <finNFe>1</finNFe>
            <indFinal>1</indFinal>
            <indPres>1</indPres>
            <procEmi>0</procEmi>
            <verProc>PARREIRA_ERP_1.0</verProc>
        </ide>
        <emit>
            <CNPJ>${emitente.cnpj}</CNPJ>
            <xNome>${emitente.razaoSocial}</xNome>
            <xFant>${emitente.fantasia}</xFant>
            <enderEmit>
                <xLgr>${emitente.endereco}</xLgr>
                <nro>1000</nro>
                <xBairro>${emitente.bairro}</xBairro>
                <cMun>3118601</cMun>
                <xMun>${emitente.cidade}</xMun>
                <UF>${emitente.uf}</UF>
                <CEP>${emitente.cep}</CEP>
                <cPais>1058</cPais>
                <xPais>BRASIL</xPais>
            </enderEmit>
            <IE>${emitente.ie}</IE>
            <CRT>3</CRT>
        </emit>
        <dest>
            <CNPJ>${cliente.cnpjCpf.replace(/\D/g, '')}</CNPJ>
            <xNome>${cliente.razaoSocial}</xNome>
            <enderDest>
                <xLgr>${cliente.endereco}</xLgr>
                <nro>S/N</nro>
                <xBairro>${cliente.bairro || ''}</xBairro>
                <cMun>3550308</cMun>
                <xMun>${cliente.cidade}</xMun>
                <UF>${cliente.uf || 'SP'}</UF>
                <CEP>${cliente.cep || ''}</CEP>
                <cPais>1058</cPais>
                <xPais>BRASIL</xPais>
            </enderDest>
            <indIEDest>9</indIEDest>
        </dest>
`;

    // Items
    let totalProd = 0;
    let totalICMS = 0;
    let totalIPI = 0;
    let totalPIS = 0;
    let totalCOFINS = 0;
    let totalNF = 0;

    itens.forEach((item, idx) => {
        // Find Master Data
        const prodMaster = produtosMaster.find(p => p.sku === item.sku) || {
            ncm: '00000000', origin: '0',
            icmsRate: 18, ipiRate: 0, pisRate: 1.65, cofinsRate: 7.6
        };

        // Calculate Taxes
        const taxes = window.TaxEngine.calculate(prodMaster, item, cliente.uf || 'SP');

        totalProd += taxes.vProd;
        totalICMS += taxes.icms.val;
        totalIPI += taxes.ipi.val;
        totalPIS += taxes.pis.val;
        totalCOFINS += taxes.cofins.val;

        xml += `
        <det nItem="${idx + 1}">
            <prod>
                <cProd>${item.sku}</cProd>
                <cEAN>${prodMaster.ean || 'SEM GTIN'}</cEAN>
                <xProd>${item.nome}</xProd>
                <NCM>${prodMaster.ncm || '00000000'}</NCM>
                <CEST>${prodMaster.cest || ''}</CEST>
                <CFOP>${prodMaster.cfop || '5102'}</CFOP>
                <uCom>${prodMaster.unidade || 'UN'}</uCom>
                <qCom>${item.qtd}</qCom>
                <vUnCom>${item.valorUnitario.toFixed(2)}</vUnCom>
                <vProd>${taxes.vProd.toFixed(2)}</vProd>
                <cEANTrib>${prodMaster.ean || 'SEM GTIN'}</cEANTrib>
                <uTrib>${prodMaster.unidade || 'UN'}</uTrib>
                <qTrib>${item.qtd}</qTrib>
                <vUnTrib>${item.valorUnitario.toFixed(2)}</vUnTrib>
                <indTot>1</indTot>
            </prod>
            <imposto>
                <ICMS>
                    <ICMS00>
                        <orig>${prodMaster.origem || '0'}</orig>
                        <CST>00</CST>
                        <modBC>3</modBC>
                        <vBC>${taxes.icms.base.toFixed(2)}</vBC>
                        <pICMS>${taxes.icms.rate.toFixed(2)}</pICMS>
                        <vICMS>${taxes.icms.val.toFixed(2)}</vICMS>
                    </ICMS00>
                </ICMS>
                <IPI>
                    <cEnq>999</cEnq>
                    <IPITrib>
                        <CST>50</CST>
                        <vBC>${taxes.ipi.base.toFixed(2)}</vBC>
                        <pIPI>${taxes.ipi.rate.toFixed(2)}</pIPI>
                        <vIPI>${taxes.ipi.val.toFixed(2)}</vIPI>
                    </IPITrib>
                </IPI>
                <PIS>
                    <PISAliq>
                        <CST>01</CST>
                        <vBC>${taxes.pis.base.toFixed(2)}</vBC>
                        <pPIS>${taxes.pis.rate.toFixed(2)}</pPIS>
                        <vPIS>${taxes.pis.val.toFixed(2)}</vPIS>
                    </PISAliq>
                </PIS>
                <COFINS>
                    <COFINSAliq>
                        <CST>01</CST>
                        <vBC>${taxes.cofins.base.toFixed(2)}</vBC>
                        <pCOFINS>${taxes.cofins.rate.toFixed(2)}</pCOFINS>
                        <vCOFINS>${taxes.cofins.val.toFixed(2)}</vCOFINS>
                    </COFINSAliq>
                </COFINS>
            </imposto>
        </det>`;
    });

    totalNF = totalProd + totalIPI; // Simple Total = Prod + IPI (ignoring ST, Frete for now)

    xml += `
        <total>
            <ICMSTot>
                <vBC>${totalProd.toFixed(2)}</vBC>
                <vICMS>${totalICMS.toFixed(2)}</vICMS>
                <vICMSDeson>0.00</vICMSDeson>
                <vFCP>0.00</vFCP>
                <vBCST>0.00</vBCST>
                <vST>0.00</vST>
                <vFCPST>0.00</vFCPST>
                <vFCPSTRet>0.00</vFCPSTRet>
                <vProd>${totalProd.toFixed(2)}</vProd>
                <vFrete>0.00</vFrete>
                <vSeg>0.00</vSeg>
                <vDesc>0.00</vDesc>
                <vII>0.00</vII>
                <vIPI>${totalIPI.toFixed(2)}</vIPI>
                <vIPIDevol>0.00</vIPIDevol>
                <vPIS>${totalPIS.toFixed(2)}</vPIS>
                <vCOFINS>${totalCOFINS.toFixed(2)}</vCOFINS>
                <vOutro>0.00</vOutro>
                <vNF>${totalNF.toFixed(2)}</vNF>
            </ICMSTot>
        </total>
        <transp>
            <modFrete>0</modFrete>
        </transp>
    </infNFe>
</NFe>`;

    return xml;
};

// ===========================================
// MOTOR DE CÁLCULO DE IMPOSTOS (Tax Engine)
// ===========================================

window.TaxEngine = {

    /**
     * Calcula impostos para um item de pedido
     * @param {Object} product - Dados do Produto (com taxas)
     * @param {Object} item - Item do Pedido (qtd, valorUnitario)
     * @param {String} clientState - UF do Cliente (ex: 'SP', 'MG')
     */
    calculate: function (product, item, clientState) {

        const valorTotal = item.qtd * item.valorUnitario;

        // Defaults
        const result = {
            vProd: valorTotal,
            icms: { base: 0, rate: 0, val: 0 },
            ipi: { base: 0, rate: 0, val: 0 },
            pis: { base: 0, rate: 0, val: 0 },
            cofins: { base: 0, rate: 0, val: 0 },
            vTotal: valorTotal // + IPI + ST...
        };

        // 1. ICMS
        // Regra Simples: Usa a alíquota do cadastro do produto
        // Em produção: Validaria UF Origem x Destino (DIFAL)
        if (product.icmsRate > 0) {
            result.icms.base = valorTotal;
            result.icms.rate = product.icmsRate;
            result.icms.val = valorTotal * (product.icmsRate / 100);
        }

        // 2. IPI
        if (product.ipiRate > 0) {
            result.ipi.base = valorTotal;
            result.ipi.rate = product.ipiRate;
            result.ipi.val = valorTotal * (product.ipiRate / 100);
        }

        // 3. PIS
        if (product.pisRate > 0) {
            result.pis.base = valorTotal;
            result.pis.rate = product.pisRate;
            result.pis.val = valorTotal * (product.pisRate / 100);
        }

        // 4. COFINS
        if (product.cofinsRate > 0) {
            result.cofins.base = valorTotal;
            result.cofins.rate = product.cofinsRate;
            result.cofins.val = valorTotal * (product.cofinsRate / 100);
        }

        // Total da Nota (Produtos + IPI + ST + Frete + Despesas - Desconto)
        // Aqui simplificamos: Valor Produtos + IPI
        result.vTotal = valorTotal + result.ipi.val;

        // Arredondamentos
        result.icms.val = Number(result.icms.val.toFixed(2));
        result.ipi.val = Number(result.ipi.val.toFixed(2));
        result.pis.val = Number(result.pis.val.toFixed(2));
        result.cofins.val = Number(result.cofins.val.toFixed(2));
        result.vTotal = Number(result.vTotal.toFixed(2));

        return result;
    }
};

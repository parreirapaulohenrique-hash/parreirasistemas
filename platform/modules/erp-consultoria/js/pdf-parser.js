/**
 * Parser para o PDF do ERP Maxdata
 * Extrai contas e valores do Relatório 343 (Centro de Custos / Plano de Contas)
 * v2: Consolida valores de múltiplos Centros de Custo (soma todas as filiais)
 */

// Configura o worker do PDF.js (necessário para processamento)
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

window.PDFParser = {
    async parseMaxdataPDF(typedarray) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js não carregado. Verifique a conexão e recarregue a página.');
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const loadingTask = pdfjsLib.getDocument(typedarray);
        const pdf = await loadingTask.promise;

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let lastY = -1, currentLine = '';
            for (const item of textContent.items) {
                if (lastY !== item.transform[5] && lastY !== -1) {
                    fullText += currentLine + '\n';
                    currentLine = '';
                }
                currentLine += item.str + ' ';
                lastY = item.transform[5];
            }
            fullText += currentLine + '\n';
        }

        return this.processExtractedText(fullText);
    },

    processExtractedText(text) {
        const lines = text.split('\n');
        const result = { periodo: '', contas: [], porCC: {} };

        // Detecta o período do relatório (ex: "Data Pag.: 01/03/2026 a 31/03/2026")
        const periodMatch = text.match(/Data Pag\.?:?\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (periodMatch) {
            const parts = periodMatch[2].split('/');
            result.periodo = `${parts[2]}-${parts[1]}`; // YYYY-MM
        } else {
            result.periodo = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
        }

        let isProcessingData = false;
        let currentCC = 'GERAL';

        // Mapa de consolidação: codigo -> { descricao, a_pagar, a_receber, ccs: [] }
        const consolidated = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Detecta início de seção de Centro de Custo
            // Ex: "CC: 1.CENTRAL ROLAMENTOS MATRIZ A Pagar: A Receber: Análise Vertical:"
            const ccMatch = line.match(/^CC:\s*(.+?)\s*A Pagar:/i);
            if (ccMatch) {
                currentCC = ccMatch[1].trim();
                isProcessingData = true;
                continue;
            }

            // Inicia processamento após o cabeçalho das colunas
            if (line.includes('Análise Vertical') || line.includes('A Receber:')) {
                isProcessingData = true;
                continue;
            }

            if (!isProcessingData) continue;

            // Ignora linhas de rodapé/cabeçalho de página
            if (line.includes('Maxdata Sistemas') || line.includes('www.maxdata') ||
                line.match(/^Pág\.:?\s*\d/) || line.match(/Emissão:/) ||
                line.match(/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/) ||
                line.match(/^\d+\/\d+\/\d{4}/)) continue;

            // Extrai código da conta no início da linha (ex: "2.1.01." ou "3.2.01")
            const codeMatch = line.match(/^(\d+(?:\.\d+)+)\.?\s+/);
            if (!codeMatch) continue;

            const codigo = codeMatch[1];
            const restOfLine = line.substring(codeMatch[0].length).trim();
            const tokens = restOfLine.split(/\s+/);

            let valor = 0;
            const descriptionTokens = [];

            for (const token of tokens) {
                if (token.includes('%')) continue; // ignora porcentagens

                // Valor monetário: "1.234,56" ou "123,45"
                if (/^(\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(token)) {
                    valor = parseFloat(token.replace(/\./g, '').replace(',', '.'));
                } else {
                    descriptionTokens.push(token);
                }
            }

            if (valor === 0 && descriptionTokens.length === 0) continue;

            const descricao = descriptionTokens.join(' ');
            const isReceita = codigo.startsWith('1.') || codigo.startsWith('4.');

            // Consolida: acumula valores do mesmo código across all CCs
            if (!consolidated[codigo]) {
                consolidated[codigo] = { codigo, descricao, a_receber: 0, a_pagar: 0, ccs: [] };
            } else if (!consolidated[codigo].descricao && descricao) {
                consolidated[codigo].descricao = descricao;
            }

            if (isReceita) {
                consolidated[codigo].a_receber = parseFloat((consolidated[codigo].a_receber + valor).toFixed(2));
            } else {
                consolidated[codigo].a_pagar = parseFloat((consolidated[codigo].a_pagar + valor).toFixed(2));
            }

            // Guarda detalhe por CC (para breakdown por filial)
            consolidated[codigo].ccs.push({ cc: currentCC, valor, isReceita });

            if (!result.porCC[currentCC]) result.porCC[currentCC] = {};
            result.porCC[currentCC][codigo] = parseFloat(((result.porCC[currentCC][codigo] || 0) + valor).toFixed(2));
        }

        // Array de contas consolidadas (apenas contas com valor)
        result.contas = Object.values(consolidated).filter(c => c.a_pagar > 0 || c.a_receber > 0);

        if (result.contas.length === 0) {
            throw new Error('Não foi possível extrair dados válidos. Verifique se o PDF é o "Relatório 343 - Centro de Custos" do Maxdata.');
        }

        return result;
    }
};

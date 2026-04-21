/**
 * Parser para o PDF do ERP Maxdata
 * Extrai contas e valores do Relatório 343 (Centro de Custos / Plano de Contas)
 */

window.PDFParser = {
    async parseMaxdataPDF(typedarray) {
        // Inicializa o PDF.js
        const loadingTask = pdfjsLib.getDocument(typedarray);
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        // Extrai texto de todas as páginas
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Agrupa os itens de texto para formar linhas
            let lastY = -1;
            let currentLine = '';
            
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
        
        const result = {
            periodo: '',
            contas: []
        };

        // Encontra o período. Exemplo alvo: "Data Pag.: 01/03/2026 a 31/03/2026"
        const periodMatch = text.match(/Data Pag\.:?\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (periodMatch) {
            // Pega o mês do fim do período (ex: 31/03/2026 -> 03/2026)
            const parts = periodMatch[2].split('/');
            result.periodo = `${parts[1]}/${parts[2]}`;
        } else {
            // Fallback se não encontrar o header exato
            result.periodo = '01/2026'; // Default
        }

        let isProcessingData = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Começa a processar após o cabeçalho das colunas
            if (line.includes('Análise Vertical') || line.includes('A Receber')) {
                isProcessingData = true;
                continue;
            }

            if (!isProcessingData) continue;

            // Regex para identificar linhas de conta:
            // Ex 1: "1.1. RECEITAS COM VENDAS 47.986,72 100,00%"
            // Ex 2: "3.2.01. SALÁRIO (CLT) 33.411,65 33,92%"
            
            // Matcher para iniciar com código numérico (ex: "1.1.", "3.2.01.")
            const accountRegex = /^(\d+(?:\.\d+)+)\.?\s+(.+?)\s+([\d\.,]+)?\s*([\d\.,]+)?\s*([\d\.,]+)%/i;
            const match = line.match(accountRegex);
            
            if (match) {
                const codigo = match[1];
                const descricao = match[2].trim();
                
                // Os valores no Maxdata ficam alinhados à direita.
                // Como não sabemos exatamente se o valor lido é A Pagar ou A Receber só pelo texto linear,
                // usamos a natureza da conta (1 = Receita, 3 = Despesa)
                
                let valor = 0;
                // Pega o último número grande antes das porcentagens
                const rawValMatch = line.match(/([\d\.]+,\d{2})\s+[\d\.,]+%/);
                if (rawValMatch) {
                    // Remove pontos de milhar e troca vírgula por ponto
                    valor = parseFloat(rawValMatch[1].replace(/\./g, '').replace(',', '.'));
                }

                let a_pagar = 0;
                let a_receber = 0;

                // Regra de negócio simples para identificar entrada vs saída:
                if (codigo.startsWith('1.') || codigo.startsWith('4.')) {
                    a_receber = valor; // Receitas
                } else {
                    a_pagar = valor;   // Custos/Despesas (2., 3.)
                }

                result.contas.push({
                    codigo,
                    descricao,
                    a_receber,
                    a_pagar
                });
            }
        }

        // Se a regex falhar (formatação do pdfjs muito bagunçada), tentamos uma abordagem de fallback mais agressiva
        if (result.contas.length === 0) {
            const fallbackRegex = /^(\d[\d\.]+)\s+([A-ZÀ-Ú\s]+)\s+([\d\.]+,\d{2})/gim;
            let m;
            while ((m = fallbackRegex.exec(text)) !== null) {
                const codigo = m[1];
                const descricao = m[2].trim();
                const valor = parseFloat(m[3].replace(/\./g, '').replace(',', '.'));
                
                let a_pagar = 0;
                let a_receber = 0;

                if (codigo.startsWith('1.') || codigo.startsWith('4.')) {
                    a_receber = valor;
                } else {
                    a_pagar = valor;
                }

                result.contas.push({ codigo, descricao, a_receber, a_pagar });
            }
        }

        if (result.contas.length === 0) {
            throw new Error("Não foi possível encontrar as contas e valores no formato esperado. O relatório selecionado é o 343 do Maxdata?");
        }

        return result;
    }
};

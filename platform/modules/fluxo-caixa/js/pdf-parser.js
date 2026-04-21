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

            // Regex para capturar apenas o código inicial (Ex: "1.1." ou "3.2.01.")
            const codeMatch = line.match(/^(\d+(?:\.\d+)+)\.?\s+/);
            
            if (codeMatch) {
                const codigo = codeMatch[1];
                const restOfLine = line.substring(codeMatch[0].length).trim();
                
                // O resto da linha pode ser "VENDAS 100,00% 5,46% 47.986,72"
                // ou "RECEITAS COM VENDAS 47.986,72 100,00% 2,50%"
                const tokens = restOfLine.split(/\s+/);
                
                let valor = 0;
                let descriptionTokens = [];
                
                for (let token of tokens) {
                    if (token.includes('%')) {
                        continue; // Ignora porcentagens da análise vertical
                    }
                    
                    // Verifica se o token é um valor monetário válido (ex: 1.234,56 ou 123,45)
                    if (/^(\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(token)) {
                        valor = parseFloat(token.replace(/\./g, '').replace(',', '.'));
                    } else {
                        // Se não for valor nem %, faz parte da descrição
                        descriptionTokens.push(token);
                    }
                }
                
                const descricao = descriptionTokens.join(' ');
                
                if (valor > 0 || descricao.length > 0) {
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
        }

        if (result.contas.length === 0) {
            throw new Error("Não foi possível encontrar as contas e valores no formato esperado. O relatório selecionado é o 343 do Maxdata?");
        }

        return result;
    }
};

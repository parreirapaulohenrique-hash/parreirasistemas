/**
 * PDFParser — Tela 834 Maxdata (Fluxo de Caixa Mensal)
 * Formato: colunas jan/fev/mar/abr/mai + Total por linha de conta
 * Detecta posições X dos meses dinamicamente no cabeçalho do PDF
 * v3: multi-mês, coordenadas X para atribuição de coluna
 */

const _MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

window.PDFParser = {

    async parseMaxdataPDF(typedarray) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js não carregado. Recarregue a página.');
        }

        const loadingTask = pdfjsLib.getDocument(typedarray);
        const pdf = await loadingTask.promise;

        // Coleta todos os itens de texto com coordenadas (x, y_from_top)
        const allItems = [];

        for (let pg = 1; pg <= pdf.numPages; pg++) {
            const page     = await pdf.getPage(pg);
            const viewport = page.getViewport({ scale: 1.0 });
            const tc       = await page.getTextContent();

            for (const item of tc.items) {
                const text = (item.str || '').trim();
                if (!text) continue;
                allItems.push({
                    text,
                    x:    item.transform[4],
                    y:    Math.round(viewport.height - item.transform[5]), // de cima
                    page: pg
                });
            }
        }

        return this._process834Items(allItems);
    },

    // ─── Processamento principal ────────────────────────────────────────────

    _process834Items(items) {
        // 1. Detecta período (ex: "Período: 01/2026 a 05/2026")
        const periodInfo = this._detectPeriod(items);

        // 2. Detecta colunas dos meses pelo cabeçalho
        const monthCols = this._detectMonthColumns(items);
        if (Object.keys(monthCols).length === 0) {
            throw new Error(
                'Não foi possível identificar os meses no PDF.\n' +
                'Certifique-se que o arquivo é o Relatório 834 (Fluxo de Caixa Mensal) do Maxdata.'
            );
        }

        // Ordena por X e calcula limites de cada coluna
        const sortedCols = Object.values(monthCols).sort((a, b) => a.x - b.x);
        for (let i = 0; i < sortedCols.length; i++) {
            const prev = i > 0 ? sortedCols[i - 1].x : 0;
            const next = i < sortedCols.length - 1 ? sortedCols[i + 1].x : 9999;
            sortedCols[i].minX = (sortedCols[i].x + prev) / 2;
            sortedCols[i].maxX = (sortedCols[i].x + next) / 2;
        }

        // 3. Agrupa itens por linha (Y)
        const lineMap = {};
        for (const item of items) {
            const y = item.y;
            if (!lineMap[y]) lineMap[y] = [];
            lineMap[y].push(item);
        }

        // 4. Parseia cada linha
        const accounts = {}; // codigo → { codigo, descricao, meses: {monthKey: value}, total }
        const VALUE_RE = /^-?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
        const CODE_RE  = /^(\d+(?:\.\d+)+)\.?$/;

        for (const lineItems of Object.values(lineMap)) {
            // Ordena por X
            lineItems.sort((a, b) => a.x - b.x);

            // Ignora rodapés e cabeçalhos
            const lineText = lineItems.map(i => i.text).join(' ');
            if (lineText.includes('Maxdata Sistemas') ||
                lineText.includes('Fluxo de Caixa Mensal') ||
                lineText.includes('Emissão:') ||
                lineText.match(/^CENTRAL PECAS|CNPJ|RODOVIA|PALMAS-TO/)) continue;

            // Detecta código no início da linha
            const firstTok = lineItems[0]?.text || '';
            let codigo = null;

            if (CODE_RE.test(firstTok)) {
                codigo = firstTok.replace(/\.$/, '');
            } else {
                // Código pode estar junto com um ponto no fim: "1.1.01."
                const m = firstTok.match(/^(\d+(?:\.\d+)+)\.?$/);
                if (m) codigo = m[1];
            }

            if (!codigo) continue;

            // Só processa contas "folha" (2+ pontos: ex 2.1.01, 3.2.14)
            // e grupos de 1 nível (ex 1.1, 3.2) — ambos válidos para calibração
            const dotCount = (codigo.match(/\./g) || []).length;
            if (dotCount < 1) continue;

            // Extrai descrição (tokens antes do primeiro valor)
            let descTokens = [];
            const valueItems = [];

            for (let i = 1; i < lineItems.length; i++) {
                const tok = lineItems[i];
                if (VALUE_RE.test(tok.text)) {
                    valueItems.push(tok);
                } else {
                    // Só adiciona à descrição se ainda não encontrou valores
                    if (valueItems.length === 0) {
                        descTokens.push(tok.text);
                    }
                }
            }

            if (valueItems.length === 0) continue;

            const descricao = descTokens.join(' ').trim();

            // Para cada valor, determina o mês pela posição X
            const mesVals = {};
            let total = null;

            for (const vi of valueItems) {
                const numVal = parseFloat(vi.text.replace(/\./g, '').replace(',', '.'));

                // Verifica se é o Total (coluna mais à direita, x > 750)
                if (vi.x > 750) {
                    total = numVal;
                    continue;
                }

                // Encontra a coluna de mês mais próxima
                let bestCol = null, bestDist = Infinity;
                for (const col of sortedCols) {
                    const dist = Math.abs(vi.x - col.x);
                    if (dist < bestDist) { bestDist = dist; bestCol = col; }
                }

                if (bestCol && bestDist < 60) { // tolerância de 60 pts
                    const key = bestCol.monthKey;
                    mesVals[key] = (mesVals[key] || 0) + numVal;
                }
            }

            if (Object.keys(mesVals).length === 0 && total === null) continue;

            if (!accounts[codigo]) {
                accounts[codigo] = { codigo, descricao, meses: {}, total: null };
            }
            if (!accounts[codigo].descricao && descricao) {
                accounts[codigo].descricao = descricao;
            }
            // Acumula (pode haver múltiplas filiais somadas — não neste relatório, mas por segurança)
            for (const [k, v] of Object.entries(mesVals)) {
                accounts[codigo].meses[k] = parseFloat(
                    ((accounts[codigo].meses[k] || 0) + v).toFixed(2)
                );
            }
            if (total !== null) {
                accounts[codigo].total = parseFloat(
                    ((accounts[codigo].total || 0) + total).toFixed(2)
                );
            }
        }

        const contasArray = Object.values(accounts).filter(
            c => Object.keys(c.meses).length > 0 || c.total !== null
        );

        if (contasArray.length === 0) {
            throw new Error(
                'Nenhuma conta foi extraída do PDF.\n' +
                'Verifique se o arquivo é o Relatório 834 (Fluxo de Caixa Mensal) do Maxdata.'
            );
        }

        // Período compatível com o sistema (primeiro mês detectado)
        const allMonthKeys = Object.values(monthCols).map(c => c.monthKey).sort();
        const periodo = allMonthKeys[0] || periodInfo.periodoInicio;

        return {
            periodo,
            periodoInicio: periodInfo.periodoInicio,
            periodoFim:    periodInfo.periodoFim,
            meses:         allMonthKeys,
            contas:        contasArray,  // compatível com o fluxo existente
            contasArray,
        };
    },

    // ─── Detecta cabeçalho de período ──────────────────────────────────────

    _detectPeriod(items) {
        for (const item of items) {
            const m = item.text.match(/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{4})/);
            if (m) {
                return {
                    periodoInicio: `${m[2]}-${m[1]}`,
                    periodoFim:    `${m[4]}-${m[3]}`
                };
            }
        }
        // Fallback por itens adjacentes
        const periodoItem = items.find(it => it.text === 'Período:');
        if (periodoItem) {
            const nearby = items
                .filter(it => Math.abs(it.y - periodoItem.y) < 5 && it.x > periodoItem.x)
                .sort((a, b) => a.x - b.x)
                .map(it => it.text).join(' ');
            const m = nearby.match(/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{4})/);
            if (m) return { periodoInicio: `${m[2]}-${m[1]}`, periodoFim: `${m[4]}-${m[3]}` };
        }
        const now = new Date();
        const p = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        return { periodoInicio: p, periodoFim: p };
    },

    // ─── Detecta colunas de meses pelo cabeçalho ───────────────────────────

    _detectMonthColumns(items) {
        const cols = {};
        const MONTH_RE = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(\d{2})$/i;

        for (const item of items) {
            const m = item.text.toLowerCase().match(MONTH_RE);
            if (!m) continue;
            const monthName = m[1];
            const year      = 2000 + parseInt(m[2]);
            const monthNum  = _MONTH_NAMES.indexOf(monthName) + 1;
            cols[monthName] = {
                x:        item.x,
                monthKey: `${year}-${String(monthNum).padStart(2, '0')}`,
                label:    item.text
            };
        }
        return cols;
    }
};

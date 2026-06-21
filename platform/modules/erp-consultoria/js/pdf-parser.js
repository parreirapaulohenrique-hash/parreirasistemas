/**
 * PDFParser — Tela 834 Maxdata (Fluxo de Caixa Mensal)
 * v4: Robusto para PDF.js browser (Y-tolerance, token scanning, concat fallback)
 *
 * Diferenças Python (pdfplumber) x Browser (PDF.js):
 *   - PDF.js pode retornar "jan/26 fev/26 mar/26" como UM item concatenado
 *   - Y de itens da mesma linha pode variar ±2pt → usar tolerância, não Math.round
 *   - transform[5] é Y da LINHA BASE do texto (de baixo), não do topo
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
        console.log('[PDFParser834] Páginas:', pdf.numPages);

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
                    x: item.transform[4],
                    // Y do topo da página (PDF.js tem origem bottom-left)
                    y: viewport.height - item.transform[5],
                    page: pg
                });
            }
        }

        console.log('[PDFParser834] Itens extraídos:', allItems.length);
        if (allItems.length > 0) {
            console.log('[PDFParser834] === ITENS RAW (primeiros 60) ===');
            console.table(allItems.slice(0, 60).map(i => ({ text: i.text.slice(0,60), x: Math.round(i.x), y: Math.round(i.y), page: i.page })));
        }

        return this._process834Items(allItems);
    },

    // ─── Processamento principal ────────────────────────────────────────────

    _process834Items(items) {
        const periodInfo = this._detectPeriod(items);
        const monthCols  = this._detectMonthColumns(items);

        console.log('[PDFParser834] Meses detectados:', Object.keys(monthCols));

        if (Object.keys(monthCols).length === 0) {
            throw new Error(
                'Não foi possível identificar os meses no PDF.\n' +
                'Verifique se o arquivo é o Relatório 834 (Fluxo de Caixa Mensal) do Maxdata.'
            );
        }

        // Ordena colunas por X e calcula limites
        const sortedCols = Object.values(monthCols).sort((a, b) => a.x - b.x);
        for (let i = 0; i < sortedCols.length; i++) {
            const prev = i > 0 ? sortedCols[i - 1].x : 0;
            const next = i < sortedCols.length - 1 ? sortedCols[i + 1].x : 9999;
            sortedCols[i].minX = (sortedCols[i].x + prev) / 2;
            sortedCols[i].maxX = (sortedCols[i].x + next) / 2;
        }

        // Agrupa itens por linhas com tolerância de ±4pt
        const lineGroups = this._groupByLines(items, 4);
        console.log('[PDFParser834] Linhas agrupadas:', lineGroups.length);

        const accounts = {};
        const VALUE_RE = /^-?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
        const CODE_RE  = /^(\d+(?:\.\d+)+)\.?$/;

        const SKIP_PATTERNS = [
            /maxdata sistemas/i,
            /fluxo de caixa mensal/i,
            /emiss[aã]o:/i,
            /central pe[cç]/i,
            /cnpj|rodovia|palmas-to/i,
        ];

        let contasParsed = 0;

        for (const lineItems of lineGroups) {
            // Ordena por X dentro da linha
            lineItems.sort((a, b) => a.x - b.x);
            const lineText = lineItems.map(i => i.text).join(' ');

            // Ignora linhas de cabeçalho/rodapé
            if (SKIP_PATTERNS.some(p => p.test(lineText))) continue;

            // Detecta código de conta no início da linha
            const { codigo, descStart } = this._extractCode(lineItems, CODE_RE);
            if (!codigo) continue;

            const dotCount = (codigo.match(/\./g) || []).length;
            if (dotCount < 1) continue;

            // Extrai descrição e valores do restante da linha
            const descTokens  = [];
            const valueItems  = [];

            for (let i = descStart; i < lineItems.length; i++) {
                const tok = lineItems[i];
                if (VALUE_RE.test(tok.text)) {
                    valueItems.push(tok);
                } else if (valueItems.length === 0) {
                    // Antes do primeiro valor = parte da descrição
                    descTokens.push(tok.text);
                }
            }

            // Também tenta extrair valores de tokens que possam ter sido concatenados
            const extraValues = this._extractGluedValues(lineItems, descStart, VALUE_RE, sortedCols);
            const allValues   = valueItems.length > 0 ? valueItems : extraValues;

            if (allValues.length === 0) continue;

            // ── Limpa a descrição ─────────────────────────────────────────
            // Problema: PDF.js concatena a coluna de descrições inteira num único
            // token (ex: "RECEITAS COM VENDAS 3.6.DESPESAS... 5.3.02.MAQUINAS...").
            // Solução em 3 passos:
            //   1. Remove prefixo de código (ex: "1.1.")
            //   2. Remove valores numéricos no formato BR (ex: "749.632,93")
            //   3. Trunca no primeiro código embarcado (ex: " 3.6." de outra conta)
            const BR_NUM_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
            let rawDesc = descTokens.join(' ')
                .replace(/^\d+(?:\.\d+)*\.?\s*/, '')   // passo 1: remove código inicial
                .replace(BR_NUM_RE, '')                  // passo 2: remove valores BR
                .replace(/\s+/g, ' ')
                .trim();
            // Passo 3: trunca no primeiro código embarcado de outra conta
            // (padrão: espaço seguido de dígitos.dígitos — ex: " 3.6" " 1.1.01")
            const embeddedCodeMatch = rawDesc.match(/\s+\d+\.\d/);
            if (embeddedCodeMatch) {
                rawDesc = rawDesc.slice(0, rawDesc.indexOf(embeddedCodeMatch[0])).trim();
            }
            const descricao = rawDesc;

            // ── Atribui valores ao mês ────────────────────────────────────
            const mesVals = {};
            let   total   = null;

            if (valueItems.length > 0) {
                // Caso normal: itens separados com X posição real
                for (const vi of valueItems) {
                    const numVal = parseFloat(vi.text.replace(/\./g, '').replace(',', '.'));
                    if (vi.x > 750) { total = numVal; continue; }

                    let bestCol = null, bestDist = Infinity;
                    for (const col of sortedCols) {
                        const dist = Math.abs(vi.x - col.x);
                        if (dist < bestDist) { bestDist = dist; bestCol = col; }
                    }
                    if (bestCol && bestDist < 70) {
                        mesVals[bestCol.monthKey] = parseFloat(
                            ((mesVals[bestCol.monthKey] || 0) + numVal).toFixed(2)
                        );
                    }
                }
            } else if (extraValues.length > 0) {
                // Caso concatenado: PDF.js fundiu todos os tokens num só —
                // X estimado é impreciso, então atribuímos POR ÍNDICE:
                // 1º valor → 1º mês, 2º → 2º mês, ... último → Total
                const numVals = extraValues.map(ev =>
                    parseFloat(ev.text.replace(/\./g, '').replace(',', '.'))
                );
                for (let vi = 0; vi < numVals.length; vi++) {
                    if (vi < sortedCols.length) {
                        const key = sortedCols[vi].monthKey;
                        mesVals[key] = parseFloat(((mesVals[key] || 0) + numVals[vi]).toFixed(2));
                    } else {
                        // Valor extra (após todos os meses) = coluna Total
                        total = numVals[vi];
                    }
                }
            }

            if (Object.keys(mesVals).length === 0 && total === null) continue;

            if (!accounts[codigo]) {
                accounts[codigo] = { codigo, descricao, meses: {}, total: null };
            }
            if (!accounts[codigo].descricao && descricao) {
                accounts[codigo].descricao = descricao;
            }
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
            contasParsed++;
        }

        console.log('[PDFParser834] Contas extraídas:', contasParsed, Object.keys(accounts).length);
        console.log('[PDFParser834] === CONTAS EXTRAÍDAS ===');
        console.table(Object.values(accounts).slice(0, 40).map(c => ({
            codigo: c.codigo,
            descricao: (c.descricao || '').slice(0, 50),
            meses_count: Object.keys(c.meses).length,
            jan: c.meses['2026-01'] ?? '-',
            fev: c.meses['2026-02'] ?? '-',
            mar: c.meses['2026-03'] ?? '-',
            total: c.total
        })));

        const contasArray = Object.values(accounts).filter(
            c => Object.keys(c.meses).length > 0 || c.total !== null
        );

        if (contasArray.length === 0) {
            throw new Error(
                'Nenhuma conta foi extraída do PDF.\n' +
                'Verifique se o arquivo é o Relatório 834 (Fluxo de Caixa Mensal) do Maxdata.'
            );
        }

        const allMonthKeys = Object.values(monthCols).map(c => c.monthKey).sort();
        const periodo = allMonthKeys[0] || periodInfo.periodoInicio;

        console.log('[PDFParser834] OK —', contasArray.length, 'contas, meses:', allMonthKeys);

        return {
            periodo,
            periodoInicio: periodInfo.periodoInicio,
            periodoFim:    periodInfo.periodoFim,
            meses:         allMonthKeys,
            contas:        contasArray,
            contasArray,
        };
    },

    // ─── Agrupa itens por linha com tolerância ──────────────────────────────

    _groupByLines(items, tolerance = 3) {
        const sorted = [...items].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
        const groups    = [];
        let current     = [];
        let groupStartY = -9999; // Y do PRIMEIRO item do grupo atual (não do último)

        for (const item of sorted) {
            // Compara com o início do grupo (não com o item anterior)
            // Evita "efeito corrente" onde Y=100, 103, 106, 109 todos se fundem
            if (current.length > 0 && Math.abs(item.y - groupStartY) > tolerance) {
                groups.push(current);
                current = [];
                groupStartY = item.y;
            }
            if (current.length === 0) groupStartY = item.y;
            current.push(item);
        }
        if (current.length) groups.push(current);
        return groups;
    },

    // ─── Concatena tokens de código inserindo "." quando necessário ─────────
    // PDF.js divide "1.1.01." em ["1", "1.01."] → join simples dá "11.01." (errado)
    // Com smartJoin: "1" (sem dot) + "1.01." (começa com dígito) → insere "." → "1.1.01." (correto)
    _smartJoin(tokens) {
        let result = '';
        for (const t of tokens) {
            if (result.length > 0 && !result.endsWith('.') && /^\d/.test(t)) {
                result += '.'; // insere separador faltante
            }
            result += t;
        }
        return result;
    },

    // ─── Extrai código do início da linha (robusto a itens concatenados) ───

    _extractCode(lineItems, CODE_RE) {
        if (!lineItems.length) return { codigo: null, descStart: 0 };

        const t0 = lineItems[0].text;

        // ── PRIORIDADE 1: concatenação com smart-join (maior → menor) ──────
        // PDF.js pode dividir "1.1.01." em ["1", "1.01."] ou ["1.", "1.01."]
        // _smartJoin insere "." quando necessário para recompor o código correto.
        for (let len = Math.min(5, lineItems.length); len >= 2; len--) {
            const tokens  = lineItems.slice(0, len).map(i => i.text);
            const combined = this._smartJoin(tokens);
            if (CODE_RE.test(combined)) {
                return { codigo: combined.replace(/\.$/, ''), descStart: len };
            }
        }

        // ── PRIORIDADE 2: item 0 sozinho ────────────────────────────────────
        if (CODE_RE.test(t0)) {
            return { codigo: t0.replace(/\.$/, ''), descStart: 1 };
        }

        // ── PRIORIDADE 3: prefixo numérico no primeiro item ─────────────────
        // Cobre "1.1.01.RECEITAS COM VENDAS" num token só (sem separação)
        const prefixMatch = t0.match(/^(\d+(?:\.\d+)+)\./);
        if (prefixMatch) {
            return { codigo: prefixMatch[1], descStart: 0 };
        }

        return { codigo: null, descStart: 0 };
    },

    // ─── Tenta extrair valores de itens concatenados (ex: "749.632,931.028.427,28") ─

    _extractGluedValues(lineItems, descStart, VALUE_RE, sortedCols) {
        const extracted = [];
        const MULTI_VALUE_RE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;

        for (let i = descStart; i < lineItems.length; i++) {
            const tok = lineItems[i];
            if (VALUE_RE.test(tok.text)) continue; // já tratado acima

            const matches = tok.text.match(MULTI_VALUE_RE);
            if (matches && matches.length > 1) {
                // Distribui valores pela posição X do item (estimativa)
                matches.forEach((m, idx) => {
                    extracted.push({ text: m, x: tok.x + idx * 40 });
                });
            }
        }
        return extracted;
    },

    // ─── Detecta cabeçalho de período ──────────────────────────────────────

    _detectPeriod(items) {
        const allText = items.map(i => i.text).join(' ');
        const m = allText.match(/Per[ií]odo:?\s*(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{4})/i);
        if (m) {
            return {
                periodoInicio: `${m[2]}-${m[1]}`,
                periodoFim:    `${m[4]}-${m[3]}`
            };
        }
        const now = new Date();
        const p = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        return { periodoInicio: p, periodoFim: p };
    },

    // ─── Detecta colunas de meses — scan token a token ─────────────────────

    _detectMonthColumns(items) {
        const cols     = {};
        const MONTH_RE = /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(\d{2})/gi;

        for (const item of items) {
            // Divide o texto do item em tokens (pode vir concatenado)
            const tokens = item.text.split(/\s+/);

            let tokenOffset = 0;
            for (const token of tokens) {
                MONTH_RE.lastIndex = 0;
                const m = MONTH_RE.exec(token);
                if (m) {
                    const monthName = m[1].toLowerCase();
                    const year      = 2000 + parseInt(m[2]);
                    const monthNum  = _MONTH_NAMES.indexOf(monthName) + 1;
                    if (monthNum > 0 && !cols[monthName]) {
                        // Estima X do token dentro do item
                        const charWidth = 6; // aprox pts por caractere
                        const tokenX    = item.x + tokenOffset * charWidth;
                        cols[monthName] = {
                            x:        tokenX,
                            monthKey: `${year}-${String(monthNum).padStart(2, '0')}`,
                            label:    token
                        };
                    }
                }
                tokenOffset += token.length + 1;
            }
        }

        console.log('[PDFParser834] _detectMonthColumns raw:', JSON.stringify(cols));
        return cols;
    }
};

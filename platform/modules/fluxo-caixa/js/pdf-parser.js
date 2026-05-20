/**
 * Parser para o PDF do ERP Maxdata
 * Extrai contas e valores do Relatório 343 (Centro de Custos / Plano de Contas)
 *
 * v2.0 — Reescrito com detecção por posição X (coluna A Pagar vs A Receber),
 *        consolidação entre múltiplos Centros de Custo e filtragem de cabeçalhos de grupo.
 */

window.PDFParser = {

    async parseMaxdataPDF(typedarray) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjsLib.getDocument(typedarray).promise;

        // ── Extrai período a partir do texto bruto da primeira página ──────────
        const page1 = await pdf.getPage(1);
        const page1Text = (await page1.getTextContent()).items.map(i => i.str).join(' ');
        const periodo = this._extractPeriod(page1Text);

        // ── Processa todas as páginas coletando tokens com posição X, Y ────────
        const allTokens = []; // { pageNum, x, y, text }
        for (let p = 1; p <= pdf.numPages; p++) {
            const page   = await pdf.getPage(p);
            const tc     = await page.getTextContent();
            for (const item of tc.items) {
                const text = (item.str || '').trim();
                if (!text) continue;
                allTokens.push({
                    pageNum: p,
                    x: Math.round(item.transform[4]),
                    y: Math.round(item.transform[5]),
                    text
                });
            }
        }

        // ── Agrupa tokens por (página, Y) formando linhas ─────────────────────
        const lineMap = {};
        for (const tok of allTokens) {
            const key = `${tok.pageNum}|${tok.y}`;
            if (!lineMap[key]) lineMap[key] = { pageNum: tok.pageNum, y: tok.y, tokens: [] };
            lineMap[key].tokens.push(tok);
        }

        // Ordena linhas: página ascendente, Y descendente (topo da página = maior Y)
        const lines = Object.values(lineMap).sort((a, b) =>
            a.pageNum !== b.pageNum ? a.pageNum - b.pageNum : b.y - a.y
        );
        for (const ln of lines) {
            ln.tokens.sort((a, b) => a.x - b.x);
            ln.text = ln.tokens.map(t => t.text).join(' ');
        }

        // ── Detecta posições X das colunas A Pagar e A Receber ────────────────
        // O cabeçalho de cada CC contém "A Pagar: A Receber: Análise Vertical:"
        // Usamos as coordenadas X desses textos como referência de coluna.
        let xPagar   = -1;
        let xReceber = -1;

        for (const ln of lines) {
            if (ln.text.includes('A Pagar') && ln.text.includes('A Receber')) {
                const toks = ln.tokens;
                for (let i = 0; i < toks.length; i++) {
                    if (toks[i].text === 'A' && i + 1 < toks.length) {
                        if (toks[i + 1].text.startsWith('Pagar'))   xPagar   = toks[i].x;
                        if (toks[i + 1].text.startsWith('Receber')) xReceber = toks[i].x;
                    }
                }
                if (xPagar > 0 && xReceber > 0) break; // encontrou — usa do primeiro CC
            }
        }

        // ── Parseia as linhas de conta e consolida entre CCs ──────────────────
        // consolidated: { [codigo]: { codigo, descricao, a_pagar, a_receber } }
        const consolidated = {};

        const _isNumeric  = t => /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(t);
        const _parseBR    = t => parseFloat(t.replace(/\./g, '').replace(',', '.'));
        // Código de conta folha: pelo menos 3 segmentos numéricos  →  "3.2.01" ou "2.3.06"
        // Código de grupo (ignorar):  2 segmentos  →  "3.2" ou "1.1"
        const _isLeafCode = c => (c.match(/\.\d/g) || []).length >= 2;

        for (const ln of lines) {
            const raw = ln.text;

            // Ignora rodapés e linhas de total
            if (raw.startsWith('Maxdata') || raw.startsWith('Total R$')  ||
                raw.includes('Análise Vertical') || raw.startsWith('CC:') ||
                raw.startsWith('CENTRAL') || raw.includes('Data Pag')) continue;

            // Detecta código de conta no início da linha
            const codeM = raw.match(/^(\d+(?:\.\d+)+)\.?\s+/);
            if (!codeM) continue;

            const codigo = codeM[1];
            if (!_isLeafCode(codigo)) continue;  // pula grupos (ex: "3.2.", "1.1.")

            // Coleta tokens numéricos com suas posições X
            const numTokens = ln.tokens.filter(t => _isNumeric(t.text));
            if (numTokens.length === 0) continue;

            // Coleta descrição (tokens não-numéricos entre o código e o primeiro número)
            const codeEndX = ln.tokens.find(t => t.text.startsWith(codigo.split('.')[0]))?.x ?? 0;
            const firstNumX = numTokens[0].x;
            const descTokens = ln.tokens.filter(t =>
                t.x > codeEndX &&
                t.x < firstNumX &&
                !_isNumeric(t.text) &&
                !t.text.endsWith('%')
            );
            const descricao = descTokens.map(t => t.text).join(' ').trim();

            // Atribui cada valor à coluna A Pagar ou A Receber pelo X mais próximo
            let a_pagar   = 0;
            let a_receber = 0;

            for (const nt of numTokens) {
                const val = _parseBR(nt.text);
                if (xPagar > 0 && xReceber > 0) {
                    // Usa posição X para determinar coluna
                    const dPagar   = Math.abs(nt.x - xPagar);
                    const dReceber = Math.abs(nt.x - xReceber);
                    if (dPagar <= dReceber) {
                        a_pagar += val;
                    } else {
                        a_receber += val;
                    }
                } else {
                    // Fallback: prefixo do código (menos preciso)
                    if (codigo.startsWith('1.') || codigo.startsWith('4.')) {
                        a_receber += val;
                    } else {
                        a_pagar += val;
                    }
                }
            }

            // Consolida: soma entre CCs para o mesmo código
            if (consolidated[codigo]) {
                consolidated[codigo].a_pagar   += a_pagar;
                consolidated[codigo].a_receber += a_receber;
            } else {
                consolidated[codigo] = {
                    codigo,
                    descricao: descricao || codigo,
                    a_pagar,
                    a_receber
                };
            }
        }

        const contas = Object.values(consolidated).filter(c => c.a_pagar > 0 || c.a_receber > 0);

        if (contas.length === 0) {
            throw new Error(
                'Não foi possível extrair contas do PDF. ' +
                'Verifique se o arquivo é o Relatório 343 do Maxdata.'
            );
        }

        // Conta quantos CCs foram encontrados (informação extra no resultado)
        const ccCount = lines.filter(ln => ln.text.startsWith('CC:')).length;

        return { periodo, contas, ccCount };
    },

    // ── Detecta período no formato "Data Pag.: 01/03/2026 a 31/03/2026" ───────
    // Retorna no formato "MM/YYYY" compatível com app.js confirmImport()
    _extractPeriod(text) {
        const m = text.match(/Data Pag\.?:?\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i);
        if (m) {
            // Usa o mês/ano do fim do período: m[5] = mês, m[6] = ano
            return `${m[5]}/${m[6]}`; // ex: "03/2026"
        }
        // Fallback: tenta encontrar qualquer data com barras
        const fallback = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (fallback) return `${fallback[2]}/${fallback[3]}`;
        return `${String(new Date().getMonth() + 1).padStart(2,'0')}/${new Date().getFullYear()}`;
    }
};

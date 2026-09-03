/**
 * demanda-import.js — Motor de Importação Multimodal
 * ====================================================
 * Processa entrada de dados vindos de:
 *   - Texto colado (WhatsApp, email, texto livre)
 *   - Excel / CSV (via SheetJS)
 *   - Grade manual linha a linha
 *
 * Fase 2 (futuro): PDF (PDF.js), Imagem/OCR (Tesseract.js)
 *
 * Retorna sempre um array normalizado de ItemProvisório:
 * { refOriginal, descOriginal, qtdeSolicitada, obs, incerteza }
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaImport = (() => {

    // ── Parser de texto colado ────────────────────────────────
    /**
     * Tenta separar itens de um bloco de texto livre.
     * Suporta padrões como:
     *   "2 rolamento 6208 / 5 correia plataforma S660 / 10 RE123456"
     *   "2x 6208\n5 correia S660\n10 RE123456"
     *   "- 2 pcs 6208 skf"
     */
    function parseText(text) {
        if (!text || !text.trim()) return [];

        const itens = [];

        // Divide por separadores comuns: nova linha, /, ;
        const linhas = text
            .split(/[\/;\n\r]+/)
            .map(l => l.trim())
            .filter(l => l.length > 2);

        for (const linha of linhas) {
            const item = _parseLinha(linha);
            if (item) itens.push(item);
        }

        // Fallback: se nenhuma linha produziu item, tenta tratar o texto todo como 1 item
        if (itens.length === 0 && text.trim()) {
            itens.push({
                refOriginal:    '',
                descOriginal:   text.trim(),
                qtdeSolicitada: 1,
                obs:            '',
                incerteza:      true,
            });
        }

        return itens;
    }

    /**
     * Tenta extrair ref, qtde e desc de uma única linha de texto.
     */
    function _parseLinha(linha) {
        // Remove prefixos comuns: "- ", "• ", "* ", números de lista "1.", "1)"
        linha = linha.replace(/^[-•*·]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
        if (!linha) return null;

        // Tenta detectar quantidade no início: "2 rolamento", "2x rolamento", "2 pcs rolamento"
        const qtdMatch = linha.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|un|unid\.?|peças?)?\s+(.+)$/i);
        let qtde = 1;
        let resto = linha;

        if (qtdMatch) {
            qtde  = parseFloat(qtdMatch[1].replace(',', '.')) || 1;
            resto = qtdMatch[2].trim();
        }

        // Tenta detectar referência: sequência alfanumérica sem espaços com pelo menos 4 chars
        // Padrões: RE123456, 6208-2Z, 25B-3300, SKF6208, etc.
        const refPatterns = [
            /\b([A-Z]{1,4}[-\s]?\d{3,}[A-Z0-9\-\/]*)\b/i,   // RE123456, SKF 6208
            /\b(\d{3,}[A-Z0-9\-\/]{2,})\b/i,                  // 6208-2Z, 25B-3300
            /\b([A-Z]{2,}\d{3,})\b/i,                          // SKF6208
        ];

        let ref   = '';
        let desc  = resto;

        for (const pat of refPatterns) {
            const m = resto.match(pat);
            if (m) {
                ref  = m[1].toUpperCase().trim();
                desc = resto.replace(m[0], '').trim().replace(/^[,\s]+/, '').replace(/[,\s]+$/, '');
                break;
            }
        }

        // Se a referência for o texto todo (sem descrição adicional), assume como desc também
        if (ref && !desc) desc = ref;

        return {
            refOriginal:    ref,
            descOriginal:   desc || resto,
            qtdeSolicitada: qtde,
            obs:            '',
            incerteza:      !ref, // incerto se não encontrou referência
        };
    }

    // ── Parser de Excel / CSV ─────────────────────────────────
    /**
     * Processa um arquivo Excel ou CSV usando SheetJS.
     * SheetJS deve estar carregado globalmente como window.XLSX.
     *
     * @param {File} file - Arquivo do input[type=file]
     * @returns {Promise<{ itens: Array, colunas: object, amostra: Array }>}
     */
    async function parseExcel(file) {
        if (typeof XLSX === 'undefined') {
            throw new Error('SheetJS (XLSX) não está carregado. Adicione a biblioteca.');
        }

        const buffer  = await file.arrayBuffer();
        const wb      = XLSX.read(buffer, { type: 'array' });
        const sheetNm = wb.SheetNames[0];
        const sheet   = wb.Sheets[sheetNm];
        const rows    = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rows.length < 2) throw new Error('Planilha vazia ou sem dados.');

        // Detecta cabeçalho na primeira linha
        const header  = rows[0].map(h => String(h).toLowerCase().trim());
        const colMap  = _detectColumns(header);
        const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));

        const itens = dataRows.map((row, idx) => _mapExcelRow(row, colMap, idx + 2));

        return {
            itens,
            colunas: colMap,
            amostra: rows.slice(0, 4), // primeiras linhas para preview
        };
    }

    /**
     * Detecta automaticamente quais colunas contêm cada campo.
     */
    function _detectColumns(header) {
        const map = { ref: -1, desc: -1, qtde: -1, marca: -1, obs: -1, seq: -1 };

        const patterns = {
            ref:   /ref|c[oó]d|código|codigo|part|pn|n[úu]mero.pe[çc]|referencia|referência/i,
            desc:  /desc|produto|pe[çc]a|item|denomina/i,
            qtde:  /qtde?|quant|qty|unid|volume/i,
            marca: /marca|fabr|brand|mfr/i,
            obs:   /obs|note|coment|detalh|inform/i,
            seq:   /seq|item|n[°oº]|linha|#/i,
        };

        header.forEach((col, idx) => {
            for (const [field, pat] of Object.entries(patterns)) {
                if (map[field] === -1 && pat.test(col)) {
                    map[field] = idx;
                }
            }
        });

        return map;
    }

    function _mapExcelRow(row, colMap, rowNum) {
        const get = (col) => col >= 0 ? String(row[col] || '').trim() : '';

        const ref   = get(colMap.ref);
        const desc  = get(colMap.desc);
        const qtde  = parseFloat(get(colMap.qtde).replace(',', '.')) || 1;
        const marca = get(colMap.marca);
        const obs   = get(colMap.obs);

        return {
            refOriginal:    ref,
            descOriginal:   desc || ref,
            qtdeSolicitada: qtde,
            marca,
            obs,
            incerteza:      !ref && !desc,
            _rowNum:        rowNum,
        };
    }

    // ── Normalização de referências ───────────────────────────
    /**
     * Normaliza uma referência para busca padronizada.
     * RE-123456, RE 123456, re123456 → RE123456
     */
    function normalizeRef(ref) {
        if (!ref) return '';
        return String(ref)
            .toUpperCase()
            .replace(/[\s\-\.\/]/g, '')
            .replace(/[^A-Z0-9]/g, '')
            .trim();
    }

    /**
     * Verifica se duas referências são candidatas equivalentes por normalização.
     */
    function refsMatch(a, b) {
        return normalizeRef(a) === normalizeRef(b);
    }

    // ── Validação dos itens importados ────────────────────────
    /**
     * Valida e completa itens importados, marcando problemas.
     * @returns {Array} itens com campo _erros adicionado se houver
     */
    function validateItens(itens) {
        return itens.map(item => {
            const erros = [];
            if (!item.refOriginal && !item.descOriginal) erros.push('Sem referência e sem descrição');
            if (!item.qtdeSolicitada || item.qtdeSolicitada <= 0) erros.push('Quantidade inválida');
            return { ...item, _erros: erros };
        });
    }

    return {
        parseText,
        parseExcel,
        normalizeRef,
        refsMatch,
        validateItens,
    };

})();

if (typeof window !== 'undefined') window.DemandaImport = DemandaImport;

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

    // Palavras que indicam linha de cabeçalho / título — devem ser ignoradas
    // Linhas a ignorar: cabecalhos, unidades (UN), codigos de centro de custo (.100.997), pontos isolados
    const SKIP_PATTERNS = /^(cod\.?\s*item|denominação|denomina|quantidade|qtde?|referencia|descrição|descri|titulo|título|peças|pecas|trator|produto|marca|obs|n[°º]|item|ref|seq|#|un|und|unid\.?)$/i;
    // Padrao de centro de custo ERP: .100.997, 100.997, :100.997 — linha de ruido
    function _isNoiseLine(s) {
        s = s.trim();
        if (SKIP_PATTERNS.test(s))     return true;   // cabecalho
        if (/^[.:,]?\d{3}[.,]\d{3}$/.test(s)) return true; // .100.997 / 100,997
        if (/^[.:,]?\d+([.,]\d+)+$/.test(s) && s.length <= 12) return true; // numeros isolados tipo preco
        if (/^\.$/.test(s))            return true;   // ponto isolado
        return false;
    }

    function parseText(text) {
        if (!text || !text.trim()) return [];

        const linhas = text
            .split(/[\n\r]+/)
            .map(l => l.trim())
            .filter(l => l.length > 1);

        // Tenta primeiro detectar tabela em formato "linha por linha" com colunas separadas
        // (OCR de tabelas costuma emitir: código, descrição, número — uma por linha)
        const tableItens = _tryParseTableLines(linhas);
        if (tableItens.length > 0) return tableItens;

        // Fallback: processa linha a linha (WhatsApp, texto livre)
        const itens = [];
        for (const linha of linhas) {
            const item = _parseLinha(linha);
            if (item) itens.push(item);
        }

        if (itens.length === 0 && text.trim()) {
            itens.push({ refOriginal: '', descOriginal: text.trim(), qtdeSolicitada: 1, obs: '', incerteza: true });
        }

        return itens;
    }

    /**
     * Tenta interpretar linhas como tabela com colunas (Código | Descrição | Qtde).
     * Suporta dois sub-formatos:
     *   A) Uma linha por registro: "DZ126340 Junta 1"
     *   B) Três linhas por registro: "DZ126340" / "Junta" / "1"
     */
    function _tryParseTableLines(linhas) {
        // Filtra cabeçalhos e linhas muito curtas
        const util = linhas.filter(l => !SKIP_PATTERNS.test(l) && l.length > 1);

        // ─── Formato A: cada linha tem código + descrição + qtde ───
        // Detecta se há pelo menos 3 linhas com padrão "COD DESC NUM" na linha inteira
        const formatA = util.filter(l => _isFormatALine(l));
        if (formatA.length >= 3 || (formatA.length >= 1 && formatA.length >= util.length * 0.5)) {
            return formatA
                .map(l => _parseFormatALine(l))
                .filter(Boolean);
        }

        // ─── Formato B: linhas alternadas Código / Descrição / Qtde ───
        // Detecta se temos padrão repetido: código puro → texto → número
        const codLines = util.filter(l => _isPartCode(l) && !_isOnlyNumber(l));
        if (codLines.length >= 2 && codLines.length >= util.length * 0.25) {
            return _parseFormatBLines(util);
        }

        return []; // não detectou tabela
    }

    /** Linha no formato A: começa com código, termina com número, tem descrição no meio */
    function _isFormatALine(l) {
        // "DZ126340 Junta 1" ou "R518255 Engrenagem 1"
        return /^[A-Z0-9]{3,}[\s\-\/][^\d].*\s+\d+\s*$/i.test(l)
            || /^[A-Z]{1,4}\d{3,}\S*\s+.+\s+\d+$/i.test(l);
    }

    function _parseFormatALine(linha) {
        // Tenta extrair: CÓDIGO(s1) DESCRIÇÃO(s*) QTDE(último token)
        const m = linha.match(/^(\S+)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/);
        if (!m) return null;
        const ref  = m[1].toUpperCase().trim();
        const desc = m[2].trim();
        const qtde = parseFloat(m[3].replace(',', '.')) || 1;
        return { refOriginal: ref, descOriginal: desc || ref, qtdeSolicitada: qtde, obs: '', incerteza: !ref };
    }

    /** Formato B: linhas agrupadas Código / Descrição / Número */
    function _parseFormatBLines(util) {
        const itens = [];
        let i = 0;
        while (i < util.length) {
            const l = util[i];
            if (_isPartCode(l) && !_isOnlyNumber(l)) {
                const ref  = l.toUpperCase().trim();
                const desc = (i + 1 < util.length && !_isPartCode(util[i+1]) && !_isOnlyNumber(util[i+1])) ? util[i+1].trim() : ref;
                const hasDesc = (desc !== ref);
                let qtde = 1;
                let skipCount = hasDesc ? 2 : 1;
                // Próximo após descrição pode ser número
                if (i + skipCount < util.length && _isOnlyNumber(util[i + skipCount])) {
                    qtde = parseFloat(util[i + skipCount].replace(',', '.')) || 1;
                    skipCount++;
                }
                itens.push({ refOriginal: ref, descOriginal: desc, qtdeSolicitada: qtde, obs: '', incerteza: false });
                i += skipCount;
            } else {
                i++;
            }
        }
        return itens;
    }

    function _isPartCode(s) {
        return /^[A-Z]{1,4}[-\s]?\d{3,}[A-Z0-9\-\/]*$/i.test(s.trim())
            || /^\d{3,}[A-Z]{2,}/i.test(s.trim());
    }

    function _isOnlyNumber(s) {
        return /^\d+([.,]\d+)?$/.test(s.trim());
    }

    /**
     * Tenta extrair ref, qtde e desc de uma única linha de texto.
     * Suporta quantidade no início OU no final da linha.
     */
    function _parseLinha(linha) {
        linha = linha.replace(/^[-•*·]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
        if (!linha || _isNoiseLine(linha)) return null;

        let qtde = 1;
        let ref  = '';
        let desc = linha;

        // ── Padrao John Deere: "DESCRICAO;MARCA/CODIGO" ou "DESCRICAO/CODIGO" ──
        // Referencia eh o segmento apos a ULTIMA barra, se parecer um codigo de peca
        const slashIdx = linha.lastIndexOf('/');
        if (slashIdx > 0) {
            const candidateRef = linha.slice(slashIdx + 1).trim();
            if (candidateRef.length >= 3 && /^[A-Z0-9][A-Z0-9\-]{2,}$/i.test(candidateRef)) {
                ref  = candidateRef.toUpperCase();
                desc = linha.slice(0, slashIdx).trim();
                // remove sufixo de marca tipo ";JOHN DEERE" do final da descricao
                desc = desc.replace(/[;,]\s*john\s*deere\s*$/i, '').trim();
            }
        }

        // ── Quantidade no INICIO: "2,00000 ROLAMENTO" ou "2 rolamento" ──
        // Formato ERP: 2,00000 (virgula decimal + zeros) — normaliza para inteiro
        const qtdInicio = linha.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|un(?:id)?|peças?|pç)?\s+(.+)$/i);
        if (qtdInicio) {
            const qv = parseFloat(qtdInicio[1].replace(',', '.'));
            if (qv > 0 && qv < 10000) {
                qtde = Math.round(qv) || 1;   // 2,00000 → 2
                if (!ref) {
                    desc = qtdInicio[2].trim();
                } else {
                    // ref ja extraida via slash — ainda remove prefixo numerico da desc
                    // ex: "2,00000 ROLAMENTO;JOHN DEERE" → "ROLAMENTO;JOHN DEERE" → "ROLAMENTO"
                    desc = desc.replace(/^\d+(?:[.,]\d+)?\s+/, '').trim();
                }
            }
        }

        // ── Fallback: detecta referencia por padrao alfanumerico ──
        if (!ref) {
            const refPatterns = [
                /\b([A-Z]{1,4}[-\s]?\d{3,}[A-Z0-9\-]*)\b/i,
                /\b(\d{3,}[A-Z0-9\-]{2,})\b/i,
                /\b([A-Z]{2,}\d{3,})\b/i,
            ];
            for (const pat of refPatterns) {
                const m = desc.match(pat);
                if (m) {
                    ref  = m[1].toUpperCase().trim();
                    desc = desc.replace(m[0], '').trim().replace(/^[,\s]+/, '').replace(/[,\s]+$/, '');
                    break;
                }
            }
        }

        // Quantidade no FINAL da descricao (tabela foto): "Junta 1"
        if (!qtdInicio && desc) {
            const qtdFinal = desc.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/);
            if (qtdFinal && !_isNoiseLine(qtdFinal[1])) {
                const qf = parseFloat(qtdFinal[2].replace(',', '.'));
                if (qf > 0 && qf < 10000) {
                    desc = qtdFinal[1].trim();
                    qtde = Math.round(qf) || 1;
                }
            }
        }

        if (ref && !desc) desc = ref;

        return {
            refOriginal:    ref,
            descOriginal:   desc || linha,
            qtdeSolicitada: qtde,
            obs:            '',
            incerteza:      !ref,
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

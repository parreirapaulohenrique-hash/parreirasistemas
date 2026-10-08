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

    // Palavras e padrões que indicam linha de cabeçalho / rodapé / ruído em documentos e notas
    const NOISE_LINE_PATTERNS = [
        /c\.?n\.?p\.?j/i,
        /c\.?p\.?f/i,
        /insc\.?\s*estadual/i,
        /i\.?e\.?\s*:/i,
        /telefone/i,
        /fone\s*:/i,
        /endere[cç]o/i,
        /bairro/i,
        /fazenda/i,
        /estrada/i,
        /zona\s*rural/i,
        /cliente\s*:/i,
        /vendedor/i,
        /opera[cç][aã]o/i,
        /local\s*de\s*venda/i,
        /data\s*abert/i,
        /data\s*:/i,
        /or[cç]amento/i,
        /\b\d+[ªºa]?\s*via\b/i,
        /condi[cç][aã]o\s*de\s*pagamento/i,
        /boleto/i,
        /servi[cç]os\s*:/i,
        /frete\s*:/i,
        /outras\s*despesas/i,
        /total\s*de\s*itens/i,
        /total\s*geral/i,
        /nro\s*itens/i,
        /p[aá]g\s*:\s*\d+/i,
        /pe[cç]as\s*e\s*insumos/i,
        /filial\s*\d+/i,
        /agricola\s*ltda/i,
        /^produto\s+descri/i,
        /^tipo\s+cod/i,
        /^item\s+c[oó]digo/i,
        /pre[cç]o\s*unit/i,
        /pre[cç]o\s*bruto/i,
        /^(cod\.?\s*item|denominação|denomina|quantidade|qtde?|referencia|descrição|descri|titulo|título|peças|pecas|trator|produto|marca|obs|n[°º]|item|ref|seq|#|un|und|unid\.?)$/i
    ];

    // Padrões de centro de custo ou linhas de puro ruído
    function _isNoiseLine(s) {
        if (!s) return true;
        s = s.trim();
        if (s.length < 2) return true;
        if (/^\.?\d{1,5}$/.test(s)) return true; // número isolado tipo '7401' ou '16'
        if (/^[.:,]?\d+([.,]\d+)+$/.test(s) && s.length <= 12) return true; // números isolados tipo preço
        if (/^\.+$/.test(s)) return true; // ponto isolado

        for (let i = 0; i < NOISE_LINE_PATTERNS.length; i++) {
            if (NOISE_LINE_PATTERNS[i].test(s)) return true;
        }
        return false;
    }

    function parseText(text) {
        if (!text || !text.trim()) return [];

        const linhas = text
            .split(/[\n\r]+/)
            .map(l => l.trim())
            .filter(l => l.length > 1);

        // Tenta primeiro detectar tabela estruturada (OCR, PDF, Excel colado)
        const tableItens = _tryParseTableLines(linhas);
        if (tableItens.length > 0) return tableItens;

        // Fallback: processa linha a linha (WhatsApp, texto livre)
        const itens = [];
        for (const linha of linhas) {
            const item = _parseLinha(linha);
            if (item) itens.push(item);
        }

        if (itens.length === 0 && text.trim() && !_isNoiseLine(text.trim())) {
            itens.push({ refOriginal: '', descOriginal: text.trim(), qtdeSolicitada: 1, obs: '', incerteza: true });
        }

        return itens;
    }

    /**
     * Tenta interpretar linhas como tabela com colunas (Código | Descrição | Qtde).
     * Suporta:
     *   0) Linhas com colunas tabuladas (\t) ou múltiplos espaços (\s{2,}) vindas de OCR/PDF
     *   A) Uma linha por registro com formato "COD DESC NUM": "DZ126340 Junta 1"
     *   B) Linhas alternadas Código / Descrição / Qtde
     */
    function _tryParseTableLines(linhas) {
        // ─── Formato 0: Tabela com colunas tabuladas (\t) ou múltiplos espaços ───
        const tabRows = [];
        for (const l of linhas) {
            if (_isNoiseLine(l)) continue;
            const parts = l.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2 && _isPartCode(parts[0])) {
                const ref = parts[0].toUpperCase();
                const desc = parts[1];
                let qtde = 1;
                for (let idx = 2; idx < parts.length; idx++) {
                    const p = parts[idx];
                    // Quantidade após unidade
                    if (/^(UN|PC|PÇ|CX|UND|JG|PAR|M)$/i.test(p) && idx + 1 < parts.length) {
                        const mq = parts[idx + 1].match(/^(\d+(?:[.,]\d+)?)$/);
                        if (mq) {
                            qtde = Math.round(parseFloat(mq[1].replace(',', '.'))) || 1;
                            break;
                        }
                    }
                    // Quantidade com zeros ou formato inteiro
                    const mq2 = p.match(/^(\d+(?:\.0+|\.0000)?)$/);
                    if (mq2) {
                        const qv = parseFloat(mq2[1]);
                        if (qv > 0 && qv < 10000) {
                            qtde = Math.round(qv) || 1;
                            break;
                        }
                    }
                }
                tabRows.push({ refOriginal: ref, descOriginal: desc || ref, qtdeSolicitada: qtde, obs: '', incerteza: false });
            }
        }
        if (tabRows.length >= 2 || (tabRows.length === 1 && linhas.length <= 6)) {
            return tabRows;
        }

        // Filtra cabeçalhos e linhas muito curtas para outros formatos
        const util = linhas.filter(l => !_isNoiseLine(l) && l.length > 1);

        // ─── Formato A: cada linha tem código + descrição + qtde ───
        const formatA = util.filter(l => _isFormatALine(l));
        if (formatA.length >= 3 || (formatA.length >= 1 && formatA.length >= util.length * 0.5)) {
            return formatA
                .map(l => _parseFormatALine(l))
                .filter(Boolean);
        }

        // ─── Formato B: linhas alternadas Código / Descrição / Qtde ───
        const codLines = util.filter(l => _isPartCode(l) && !_isOnlyNumber(l));
        if (codLines.length >= 2 && codLines.length >= util.length * 0.25) {
            return _parseFormatBLines(util);
        }

        return []; // não detectou tabela
    }

    /** Linha no formato A: começa com código, termina com número, tem descrição no meio */
    function _isFormatALine(l) {
        return /^[A-Z0-9\-\/]{3,}[\s\-\/][^\d].*\s+\d+\s*$/i.test(l)
            || /^[A-Z0-9]{1,6}\d{2,}\S*\s+.+\s+\d+$/i.test(l);
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

    /**
     * Valida se uma string é um código de peça agrícola / automotiva / industrial real.
     * Suporta formatos:
     * - Alfanumérico (14M7230/JA, 6206-2RS-C3/PFI, ALM8/JA, F110390 -INA, DZ126340, RE123456)
     * - Números com separador (450452029/199, 73382326-952, 3003060080/199)
     * - Códigos numéricos OEM puros de 6 a 12 dígitos (61174275, 87016581, 73380630)
     */
    function _isPartCode(s) {
        if (!s) return false;
        s = s.trim();
        if (s.length < 3 || s.length > 32) return false;
        if (_isNoiseLine(s)) return false;
        if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(s)) return false; // data
        if (/^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(s)) return false; // telefone
        if (/^\d+([.,]\d+)+$/.test(s) && s.length < 10 && !/[A-Za-z]/.test(s)) return false; // preço/decimal puro
        if (/^\d{1,5}$/.test(s)) return false; // número curto

        // 1. Alfanumérico com letras e dígitos
        if (/[A-Za-z]/.test(s) && /\d/.test(s)) return true;
        // 2. Dígitos com hífen ou barra
        if (/^\d{4,}[-/]\d+/.test(s)) return true;
        // 3. Código numérico OEM puro com 6 a 12 dígitos
        if (/^\d{6,12}$/.test(s)) return true;
        // 4. Padrão OEM clássico de 1-4 letras + dígitos
        if (/^[A-Za-z]{1,4}\d{3,}/.test(s)) return true;

        return false;
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

        if (!ref) {
            // Se não encontrou código de peça, só aceita se houver termo mecânico/agrícola na descrição
            const hasPartKeyword = /\b(rolamento|correia|junta|parafuso|porca|filtro|retentor|arruela|mangueira|mangote|bucha|disco|mola|pino|sensor|v[aá]lvula|bomba|cabo|anel|terminal|engrenagem|eixo|cubo|reparo|kit|cruzeta|bico|corrente|amortecedor|bra[cç]o|sapata|lona|tambor|cilindro|radiador|palheta|lampada|rele|fusivel|chicote|espelho|farol|lanterna|oleo|graxa|adesivo|tinta|aditivo|vela|bateria|motor|compressor|alternador|turbina|tubo|abra[cç]adeira|gaxeta|chapa|revestimento|feltro|pinhao|oring|o-ring)\b/i.test(desc);
            if (!hasPartKeyword) {
                return null;
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

    /**
     * Processador Universal de Arquivos (PDF, Excel, CSV ou Texto).
     * @param {File} file
     * @returns {Promise<Array>} Lista de itens normalizados
     */
    async function parseFile(file) {
        if (!file) throw new Error('Nenhum arquivo fornecido.');
        const name = (file.name || '').toLowerCase();

        // 1. Arquivo PDF
        if (name.endsWith('.pdf')) {
            if (typeof DemandaPDF === 'undefined' || typeof DemandaPDF.parseCotacaoPDF !== 'function') {
                throw new Error('Motor de extração PDF.js não carregado.');
            }
            return await DemandaPDF.parseCotacaoPDF(file);
        }

        // 2. Arquivo Excel ou CSV
        if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
            const res = await parseExcel(file);
            return res.itens || [];
        }

        // 3. Arquivo de Texto livre
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                resolve(parseText(text));
            };
            reader.onerror = () => reject(new Error('Erro ao ler arquivo de texto.'));
            reader.readAsText(file, 'utf-8');
        });
    }

    return {
        parseText,
        parseExcel,
        parseFile,
        normalizeRef,
        refsMatch,
        validateItens,
    };

})();

if (typeof window !== 'undefined') window.DemandaImport = DemandaImport;

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

    // Padrões de conversa informal e saudações comuns em WhatsApp / mensagens
    const CONVERSATION_NOISE_PATTERNS = [
        /^(bom dia|boa tarde|boa noite|ola|olá|opa|fala|blz|oi|e ai|e aí)\b/i,
        /\b(cota\s+pra\s+mim|cota\s+a[ií]|or[cç]a\s+a[ií]|or[cç]a\s+pra\s+mim|v[eê]\s+se\s+tem|tem\s+a[ií]|tem\s+em\s+estoque|tem\s+dispon[ií]vel|tem\s+pronta\s+entrega|qual\s+o\s+pre[cç]o|qual\s+o\s+valor|quanto\s+custa|quanto\s+t[aá]|consegue\s+desconto|manda\s+o\s+or[cç]amento|manda\s+a\s+cota[cç][aã]o|segue\s+a\s+lista|segue\s+os\s+itens|segue\s+cota[cç][aã]o|segue\s+pedido|preciso\s+dessas\s+pe[cç]as|preciso\s+desses\s+itens|d[aá]\s+uma\s+olhada)\b/i,
        /^(obrigad[oa]|obg|valeu|vlw|agrade[cç]o|aguardo|aguardo\s+retorno|fico\s+no\s+aguardo|abra[cç]o|tks|thanks|fechou|perfeito|combinado|ok)\b/i,
        /\b(criptografia\s+de\s+ponta\s+a\s+ponta|mensagem\s+apagada|mensagem\s+exclu[ií]da|arquivo\s+de\s+m[ií]dia\s+oculto|m[ií]dia\s+ocult[ao]|figurinha|sticker|chamada\s+de\s+voz|chamada\s+de\s+v[ií]deo|audio\s+oculto|[aá]udio\s+oculto)\b/i,
        /^(aten[cç][aã]o|aviso|nota|importante)\b/i
    ];

    /**
     * Remove prefixos e cabeçalhos automáticos de cópia de conversas do WhatsApp Web / Mobile.
     * Ex: "[13:57, 08/10/2026] Carlos Central Peças: Rolamento 6028 2rsc3" -> "Rolamento 6028 2rsc3"
     * Ex: "08/10/2026, 13:57 - Carlos: 67048/10" -> "67048/10"
     */
    function _cleanWhatsAppPrefix(linha) {
        if (!linha) return '';
        let s = linha.trim();
        // [13:57, 08/10/2026] Nome:
        s = s.replace(/^\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*,\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*\]\s*[^:\n]+:?\s*/i, '');
        // [08/10/2026, 13:57:12] Nome:
        s = s.replace(/^\[\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*,\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*[^:\n]+:?\s*/i, '');
        // 08/10/2026, 13:57 - Nome:
        s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*-\s*[^:\n]+:?\s*/i, '');
        // 13:57 - Nome: ou [13:57] Nome:
        s = s.replace(/^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]|\d{1,2}:\d{2}(?::\d{2})?\s*-)\s*[^:\n]+:?\s*/i, '');
        // ~ Nome:
        s = s.replace(/^~\s*[^:\n]+:?\s*/, '');
        // Linha isolada que é apenas nome de contato com dois pontos: "Carlos Central Peças:"
        s = s.replace(/^[\w\s\u00C0-\u00FF.\-_]{3,40}:\s*$/, '');
        return s.trim();
    }

    // Padrões de centro de custo ou linhas de puro ruído
    function _isNoiseLine(s) {
        if (!s) return true;
        s = s.trim();
        if (s.length < 2) return true;
        if (/^\.?\d{1,3}$/.test(s)) return true; // números isolados curtos tipo 1, 2, 99
        if (/^[.:,]?\d+([.,]\d+)+$/.test(s) && s.length <= 12) return true; // números isolados tipo preço
        if (/^\.+$/.test(s)) return true; // ponto isolado

        for (let i = 0; i < NOISE_LINE_PATTERNS.length; i++) {
            if (NOISE_LINE_PATTERNS[i].test(s)) return true;
        }
        for (let i = 0; i < CONVERSATION_NOISE_PATTERNS.length; i++) {
            if (CONVERSATION_NOISE_PATTERNS[i].test(s)) return true;
        }
        return false;
    }

    /**
     * Converte strings numéricas em formato brasileiro de moeda para float.
     * Trata "1.250,50", "23,340", "8.010" (OCR de 8,010), "28,50", "0,00".
     */
    function _parseMoedaBR(s) {
        if (!s) return null;
        let c = String(s).trim();
        c = c.replace(/^[R$\s]+/, '').trim();
        if (c.indexOf(',') >= 0) {
            // Tem vírgula: formato brasileiro padrão (ex: "1.400,40", "23,340")
            c = c.replace(/\./g, '').replace(',', '.');
        } else if (/^\d+\.\d{3}$/.test(c)) {
            // Caso de OCR onde vírgula com 3 casas decimais virou ponto (ex: "8.010" -> 8.01)
            // Mantém o ponto como separador decimal
        } else if (/^\d+\.\d{1,2}$/.test(c)) {
            // Decimal padrão com ponto (ex: 8.01, 15.5)
        } else {
            c = c.replace(/\./g, '');
        }
        const v = parseFloat(c);
        return (!isNaN(v) && v > 0 && v < 500000) ? Math.round(v * 100) / 100 : null;
    }

    /**
     * Motor Universal de Tabela por Cabeçalho Dinâmico.
     * Inspeciona linhas cruas (sem perdas por filtros de ruído) buscando linha de cabeçalho
     * com nomes de colunas: Produto, Descrição, Marca, Local, Referência, Un, Quant, Preço.
     * Suporta perfeitamente:
     *   - Romaneios/Separações de Balcão (ex: J.A. Agrícola Fernando) com colunas Descrição | Marca | Local | Referência
     *   - Orçamentos de Concorrentes com preços (ex: J.A. Agrícola Andrei) com colunas Produto | Descrição | Un | Quant | Preço
     */
    function _parseTableWithHeader(text) {
        if (!text) return [];
        const rawLines = text
            .split(/[\n\r]+/)
            .map(l => _cleanWhatsAppPrefix(l).trim())
            .filter(l => l.length > 0);

        // 1. Extração preventiva de metadados do cabeçalho do documento (antes de qualquer filtro)
        let detectedConcorrente = '';
        let detectedCliente = '';
        let detectedOrcamento = '';

        if (/j\.?\s*a\.?\s*agricola/i.test(text)) {
            detectedConcorrente = 'J.A. Agrícola';
        } else if (/carlos\s+central\s+pe/i.test(text)) {
            detectedConcorrente = 'Carlos Central Peças';
        } else if (/rondobras/i.test(text)) {
            detectedConcorrente = 'Rondobras';
        }

        const mCli = text.match(/cliente\s*:\s*(?:\d+\s+)?([A-Za-zÀ-ÿ\s]{4,40})/i);
        if (mCli) detectedCliente = mCli[1].trim();

        const mOrc = text.match(/(?:or[cç]amento|orc|cod\.?\s*int\.?)\s*:\s*(?:orc\s*)?([0-9.]+)/i);
        if (mOrc) detectedOrcamento = mOrc[1].trim();

        // 2. Localiza linha de cabeçalho da tabela
        let headerIdx = -1;
        let colMap = {};

        for (let idx = 0; idx < rawLines.length; idx++) {
            const l = rawLines[idx];
            const parts = l.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
            let matches = 0;
            const mapping = {};
            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
                const pClean = parts[pIdx].toLowerCase();
                if (/^(produto|c[oó]d(?:igo)?|c[oó]d\.?\s*int\.?)$/i.test(pClean)) { mapping.produto = pIdx; matches++; }
                else if (/^(descri[cç][aã]o|denomina[cç][aã]o|item|denomina)$/i.test(pClean)) { mapping.descricao = pIdx; matches++; }
                else if (/^(marca|fabricante)$/i.test(pClean)) { mapping.marca = pIdx; matches++; }
                else if (/^(local|loc|box)$/i.test(pClean)) { mapping.local = pIdx; matches++; }
                else if (/^(refer[eê]ncia|ref\.?)$/i.test(pClean)) { mapping.referencia = pIdx; matches++; }
                else if (/^(un|und|unid\.?)$/i.test(pClean)) { mapping.un = pIdx; matches++; }
                else if (/^(quant\.?|quantidade|qtde?|qtd)$/i.test(pClean)) { mapping.qtde = pIdx; matches++; }
                else if (/^(pre[cç]o\s*unit\.?|unit[aá]rio|vlr\.?\s*unit\.?)$/i.test(pClean)) { mapping.preco_unit = pIdx; matches++; }
                else if (/^(pre[cç]o\s*bruto|total|subtotal)$/i.test(pClean)) { mapping.preco_total = pIdx; matches++; }
            }
            if (matches >= 2 && (mapping.descricao !== undefined || mapping.referencia !== undefined || mapping.produto !== undefined)) {
                headerIdx = idx;
                colMap = mapping;
                break;
            }
        }

        if (headerIdx === -1) return [];

        // Detecta se é Romaneio/Separação de Balcão (tem Referência e Descrição, mas NÃO tem coluna de Quantidade explícita)
        const isPickingSlip = (colMap.referencia !== undefined && colMap.descricao !== undefined && colMap.qtde === undefined);
        const items = [];

        for (let r = headerIdx + 1; r < rawLines.length; r++) {
            const rowLine = rawLines[r];
            // Ignora rodapés / totais / mensagens do ERP
            if (/^(frete|outras\s*despesas|total|nro\s*itens|condi[cç][aã]o|servi[cç]os|p[aá]g|balcao)\b/i.test(rowLine)) continue;
            if (/^[\d\s.,\-]+$/.test(rowLine) && rowLine.length < 8) continue;

            const partsRow = rowLine.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (partsRow.length === 0) continue;
            if (/^0[,.]00$/.test(partsRow[0]) || /outras\s*despesas/i.test(partsRow[0])) continue;

            let desc = '', ref = '', qtde = 1, preco = null, marca = '', local = '';

            if (isPickingSlip) {
                // Separação de Balcão / Picking:
                // Estrutura das colunas: Descrição [Marca] [Local] [Referência]
                desc = partsRow[0];
                const lastTok = partsRow[partsRow.length - 1];
                // Padrão de endereço de prateleira/gôndola (ex: "1D03", "2A00", "7F04", "6G04")
                const isLastLocal = /^[0-9][A-Z0-9][0-9]{2}$/i.test(lastTok);

                if (partsRow.length >= 4) {
                    ref = partsRow[partsRow.length - 1];
                    local = partsRow[partsRow.length - 2];
                    marca = partsRow[1];
                } else if (partsRow.length === 3) {
                    if (isLastLocal) {
                        marca = partsRow[1];
                        local = partsRow[2];
                        ref = '';
                    } else {
                        local = partsRow[1];
                        ref = partsRow[2];
                    }
                } else if (partsRow.length === 2) {
                    if (isLastLocal) {
                        local = partsRow[1];
                    } else {
                        ref = partsRow[1];
                    }
                }

                // Se não veio coluna explícita de referência, extrai código da própria descrição se houver
                if (!ref) {
                    const mCode = desc.match(/\b([A-Z]{1,4}\d{4,}|\d{5,}[A-Z\d\-_]*)\b/);
                    ref = mCode ? mCode[1] : desc;
                }
            } else {
                // Layout com Produto / Quantidade / Preço (Orçamento completo)
                ref = partsRow[0];
                if (partsRow.length > 1) desc = partsRow[1];

                // Localiza índice da unidade de medida (UN, PC, etc.)
                let unIdx = -1;
                for (let u = 0; u < partsRow.length; u++) {
                    if (/^(UN|PC|PÇ|CX|UND|JG|PAR|M)$/i.test(partsRow[u])) {
                        unIdx = u;
                        break;
                    }
                }

                if (unIdx !== -1 && unIdx + 1 < partsRow.length) {
                    const qv = parseFloat(partsRow[unIdx + 1].replace(',', '.'));
                    qtde = Math.round(qv) || 1;
                    if (unIdx + 2 < partsRow.length) {
                        const pv = _parseMoedaBR(partsRow[unIdx + 2]);
                        if (pv > 0) preco = pv;
                    }
                } else {
                    if (colMap.qtde !== undefined && colMap.qtde < partsRow.length) {
                        const qv = parseFloat(partsRow[colMap.qtde].replace(',', '.'));
                        qtde = Math.round(qv) || 1;
                    }
                    if (colMap.preco_unit !== undefined && colMap.preco_unit < partsRow.length) {
                        const pv = _parseMoedaBR(partsRow[colMap.preco_unit]);
                        if (pv > 0) preco = pv;
                    }
                }
            }

            if (!desc && ref) desc = ref;
            if (!ref && desc) ref = desc;
            if (/^(frete|outras\s*despesas|total|nro\s*itens)\b/i.test(desc)) continue;

            const obsArr = [];
            if (marca && marca.toUpperCase() !== 'GERAL') obsArr.push('Marca: ' + marca);
            if (local) obsArr.push('Local: ' + local);
            if (preco) obsArr.push('Preço conc.: R$ ' + preco.toFixed(2).replace('.', ','));

            items.push({
                refOriginal: ref.toUpperCase(),
                descOriginal: desc.toUpperCase(),
                qtdeSolicitada: Math.max(1, qtde),
                precoConcorrente: preco,
                obs: obsArr.join(' | '),
                incerteza: false,
                _metaConcorrente: detectedConcorrente || null,
                _metaCliente: detectedCliente || null,
                _metaOrcamento: detectedOrcamento || null
            });
        }
        return items;
    }

    function parseText(text) {
        if (!text || !text.trim()) return [];

        // 1. Tenta primeiro motor universal por cabeçalho (Romaneios, Separações e Orçamentos com colunas)
        const tableHeaderItens = _parseTableWithHeader(text);
        if (tableHeaderItens.length > 0) {
            return tableHeaderItens;
        }

        const linhas = text
            .split(/[\n\r]+/)
            .map(l => _cleanWhatsAppPrefix(l))
            .map(l => l.trim())
            .filter(l => l.length > 1 && !_isNoiseLine(l));

        // 2. Tenta interpretar como tabela sem cabeçalho explícito (colunas tabuladas / Formato A / Formato B)
        const tableItens = _tryParseTableLines(linhas);
        if (tableItens.length > 0) return tableItens;

        // 3. Fallback: processa linha a linha (WhatsApp, texto livre)
        const itens = [];
        for (const linha of linhas) {
            const item = _parseLinha(linha);
            if (item) itens.push(item);
        }

        if (itens.length === 0 && text.trim() && !_isNoiseLine(_cleanWhatsAppPrefix(text.trim()))) {
            const cleanT = _cleanWhatsAppPrefix(text.trim());
            itens.push({ refOriginal: '', descOriginal: cleanT, qtdeSolicitada: 1, obs: '', incerteza: true });
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
        // Tenta detectar cabeçalho de concorrente ou cliente nas linhas do documento
        let detectedConcorrente = '';
        let detectedCliente = '';
        let detectedOrcamento = '';

        for (const l of linhas) {
            if (/j\.?\s*a\.?\s*agricola/i.test(l)) {
                detectedConcorrente = 'J.A. Agrícola';
            } else if (/carlos\s+central\s+pe/i.test(l)) {
                detectedConcorrente = 'Carlos Central Peças';
            } else if (/rondobras/i.test(l)) {
                detectedConcorrente = 'Rondobras';
            }
            const mCli = l.match(/cliente\s*:\s*(?:\d+\s+)?([A-Za-zÀ-ÿ\s]{4,40})/i);
            if (mCli && !detectedCliente) {
                detectedCliente = mCli[1].trim();
            }
            const mOrc = l.match(/or[cç]amento\s*:\s*(?:orc\s*)?([0-9.]+)/i);
            if (mOrc && !detectedOrcamento) {
                detectedOrcamento = mOrc[1].trim();
            }
        }

        // ─── Formato 0: Tabela com colunas tabuladas (\t) ou múltiplos espaços ───
        const tabRows = [];
        for (const l of linhas) {
            if (_isNoiseLine(l)) continue;
            const parts = l.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2 && _isPartCode(parts[0])) {
                const ref = parts[0].toUpperCase();
                const desc = parts[1];
                let qtde = 1;
                let qIdx = -1;
                for (let idx = 2; idx < parts.length; idx++) {
                    const p = parts[idx];
                    // Quantidade após unidade
                    if (/^(UN|PC|PÇ|CX|UND|JG|PAR|M)$/i.test(p) && idx + 1 < parts.length) {
                        const mq = parts[idx + 1].match(/^(\d+(?:[.,]\d+)?)$/);
                        if (mq) {
                            qtde = Math.round(parseFloat(mq[1].replace(',', '.'))) || 1;
                            qIdx = idx + 1;
                            break;
                        }
                    }
                    // Quantidade com zeros ou formato inteiro
                    const mq2 = p.match(/^(\d+(?:\.0+|\.0000)?)$/);
                    if (mq2) {
                        const qv = parseFloat(mq2[1]);
                        if (qv > 0 && qv < 10000) {
                            qtde = Math.round(qv) || 1;
                            qIdx = idx;
                            break;
                        }
                    }
                }

                // Tenta extrair preço unitário do concorrente se houver valor monetário após a quantidade
                let precoConcorrente = null;
                if (qIdx !== -1 && qIdx + 1 < parts.length) {
                    const cand = parts[qIdx + 1];
                    const candClean = cand.replace(/\./g, '').replace(',', '.');
                    const val = parseFloat(candClean);
                    if (!isNaN(val) && val > 0 && val < 500000) {
                        precoConcorrente = val;
                    }
                }

                const obsTxt = precoConcorrente ? ('Preço conc.: R$ ' + precoConcorrente.toFixed(2).replace('.', ',')) : '';

                tabRows.push({
                    refOriginal: ref,
                    descOriginal: desc || ref,
                    qtdeSolicitada: qtde,
                    precoConcorrente: precoConcorrente,
                    obs: obsTxt,
                    incerteza: false,
                    _metaConcorrente: detectedConcorrente || null,
                    _metaCliente: detectedCliente || null,
                    _metaOrcamento: detectedOrcamento || null
                });
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
     * - Conjuntos de rolamento com barra ou hífen (67048/10, LM11949/10, 450452029/199)
     * - Códigos numéricos padrão de rolamentos e OEM de 4 a 12 dígitos (6204, 16012, 22310, 22309, 22216, 61174275)
     * - Prefixo de mancais/rolamentos com letras e espaço/ponto (FL. 204, F 600, UC 205, UC211-32, UCP 205)
     */
    function _isPartCode(s) {
        if (!s) return false;
        s = s.trim();
        if (s.length < 3 || s.length > 32) return false;
        if (_isNoiseLine(s)) return false;
        if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(s)) return false; // data
        if (/^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(s)) return false; // telefone
        if (/^\d+([.,]\d+)+$/.test(s) && s.length < 10 && !/[A-Za-z]/.test(s)) return false; // preço/decimal puro
        if (/^\d{1,3}$/.test(s)) return false; // número curto (1 a 3 dígitos é quantidade/índice)
        if (/^(5101|5102|5405|6102|6405|7102|7401)$/.test(s)) return false; // CFOPs fiscais comuns

        // 1. Alfanumérico com letras e dígitos (ex: 6028-2RS, FL. 204, F113407, UC211-32, F 600)
        if (/[A-Za-z]/.test(s) && /\d/.test(s)) return true;
        // 2. Números com barra ou hífen (ex: 67048/10, 67048-10, 450452029/199)
        if (/^\d{3,}[-/]\d+/.test(s)) return true;
        // 3. Rolamentos e peças numéricas padrão (4 a 12 dígitos: 6204, 16012, 22310, 22309, 22216)
        if (/^\d{4,12}$/.test(s)) return true;
        // 4. Padrão OEM com prefixo de letras e espaços/pontos (ex: FL. 204, F 600, UC 205)
        if (/^[A-Za-z]{1,4}\.?\s*[-/]?\s*\d{2,6}/.test(s)) return true;

        return false;
    }

    function _isOnlyNumber(s) {
        return /^\d+([.,]\d+)?$/.test(s.trim());
    }

    /**
     * Tenta extrair ref, qtde e desc de uma única linha de texto.
     * Suporta WhatsApp, códigos com espaços ("FL. 204", "F 600"), sufixos de rolamento e quantidade.
     */
    function _parseLinha(linha) {
        linha = _cleanWhatsAppPrefix(linha);
        linha = linha.replace(/^[-•*·]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
        if (!linha || _isNoiseLine(linha)) return null;

        let qtde = 1;
        let ref  = '';
        let desc = linha;

        // ── 0. Linha que já é um código de peça direto ──
        // Ex: "67048/10", "16012", "FL. 204", "F113407", "F 600", "22310", "UC211-32", "22309", "22216"
        if (_isPartCode(linha)) {
            const code = linha.toUpperCase().trim();
            return {
                refOriginal:    code,
                descOriginal:   code,
                qtdeSolicitada: 1,
                obs:            '',
                incerteza:      false,
            };
        }

        // ── 1. Categoria no início: "Rolamento 6028 2rsc3", "Retentor 01234", "Correia A-45" ──
        const mTipo = linha.match(/^([A-Za-zÀ-ÿ]{3,20})\s+(.+)$/i);
        if (mTipo && /^(rolamento|mancal|retentor|correia|porca|parafuso|filtro|anel|bucha|cruzeta|junta|v[aá]lvula|valvula|disco|eixo|sensor|bomba)$/i.test(mTipo[1])) {
            const tipo = mTipo[1].charAt(0).toUpperCase() + mTipo[1].slice(1).toLowerCase();
            let resto = mTipo[2].trim();

            // Quantidade explícita no final do resto: "6028 2 un", "A-45 3 pçs", "6028 x 2"
            const mqFinal = resto.match(/\s+(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|un(?:id)?|peças?|pç)$/i);
            if (mqFinal) {
                const qv = parseFloat(mqFinal[1].replace(',', '.'));
                if (qv > 0 && qv < 10000) {
                    qtde = Math.round(qv) || 1;
                    resto = resto.slice(0, mqFinal.index).trim();
                }
            }

            ref  = resto.toUpperCase().trim();
            desc = `${tipo} ${resto}`;
            return {
                refOriginal:    ref,
                descOriginal:   desc,
                qtdeSolicitada: qtde,
                obs:            '',
                incerteza:      false,
            };
        }

        // ── 2. Padrão John Deere / OEM com barra: "DESCRICAO/CODIGO" ou "DESCRICAO;MARCA/CODIGO" ──
        // (Apenas se a barra separa texto descritivo de código, sem ser conjunto tipo 67048/10)
        const slashIdx = linha.lastIndexOf('/');
        if (slashIdx > 0 && !/^\d{3,}[-/]\d+$/.test(linha)) {
            const candidateRef = linha.slice(slashIdx + 1).trim();
            if (candidateRef.length >= 3 && /^[A-Z0-9][A-Z0-9\-]{2,}$/i.test(candidateRef)) {
                ref  = candidateRef.toUpperCase();
                desc = linha.slice(0, slashIdx).trim();
                // remove sufixo de marca tipo ";JOHN DEERE" do final da descricao
                desc = desc.replace(/[;,]\s*john\s*deere\s*$/i, '').trim();
            }
        }

        // ── 3. Quantidade no INÍCIO: "2,00000 ROLAMENTO" ou "2x 6206" ou "2 rolamento" ──
        const qtdInicio = linha.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|un(?:id)?|peças?|pç)?\s+(.+)$/i);
        if (qtdInicio) {
            const qv = parseFloat(qtdInicio[1].replace(',', '.'));
            if (qv > 0 && qv < 10000) {
                qtde = Math.round(qv) || 1;
                if (!ref) {
                    desc = qtdInicio[2].trim();
                } else {
                    desc = desc.replace(/^\d+(?:[.,]\d+)?\s+/, '').trim();
                }
            }
        }

        // ── 4. Quantidade com unidade explícita no FINAL: "6206 2 un", "DZ126340 5 pcs" ──
        const qtdFinalUn = desc.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:x|pcs?|un(?:id)?|peças?|pç)$/i);
        if (qtdFinalUn) {
            const qf = parseFloat(qtdFinalUn[2].replace(',', '.'));
            if (qf > 0 && qf < 10000) {
                desc = qtdFinalUn[1].trim();
                qtde = Math.round(qf) || 1;
            }
        }

        // Se após remover quantidade a linha restante for código puro
        if (!ref && _isPartCode(desc)) {
            ref = desc.toUpperCase().trim();
            desc = ref;
        }

        // ── 5. Fallback: detecta referência por padrão alfanumérico ou código no meio ──
        if (!ref) {
            // Primeiro tenta código composto com espaço tipo "FL. 204", "F 600", "UC 205"
            const mPre = desc.match(/\b([A-Za-z]{1,4}\.?\s*[-/]?\s*\d{2,6}[A-Za-z0-9\-]*)\b/i);
            if (mPre && _isPartCode(mPre[1])) {
                ref = mPre[1].toUpperCase().trim();
                desc = desc.replace(mPre[0], '').trim().replace(/^[,\s\-]+/, '').replace(/[,\s\-]+$/, '');
            }
        }

        if (!ref) {
            const refPatterns = [
                /\b([A-Z]{1,4}[-\s]?\d{3,}[A-Z0-9\-]*)\b/i,
                /\b(\d{3,}[A-Z0-9\-]{2,})\b/i,
                /\b([A-Z]{2,}\d{3,})\b/i,
                /\b(\d{4,12})\b/
            ];
            for (const pat of refPatterns) {
                const m = desc.match(pat);
                if (m) {
                    ref  = m[1].toUpperCase().trim();
                    desc = desc.replace(m[0], '').trim().replace(/^[,\s\-]+/, '').replace(/[,\s\-]+$/, '');
                    break;
                }
            }
        }

        // Quantidade no FINAL da descrição apenas se não for parte de um código e houver número isolado
        if (!qtdInicio && !qtdFinalUn && desc) {
            const qtdFinal = desc.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/);
            if (qtdFinal && !_isNoiseLine(qtdFinal[1]) && !_isPartCode(qtdFinal[0])) {
                const qf = parseFloat(qtdFinal[2].replace(',', '.'));
                if (qf > 0 && qf < 10000) {
                    desc = qtdFinal[1].trim();
                    qtde = Math.round(qf) || 1;
                }
            }
        }

        if (!ref) {
            // Se não encontrou código de peça, só aceita se houver termo mecânico/agrícola na descrição
            const hasPartKeyword = /\b(rolamento|mancal|correia|junta|parafuso|porca|filtro|retentor|arruela|mangueira|mangote|bucha|disco|mola|pino|sensor|v[aá]lvula|valvula|bomba|cabo|anel|terminal|engrenagem|eixo|cubo|reparo|kit|cruzeta|bico|corrente|amortecedor|bra[cç]o|sapata|lona|tambor|cilindro|radiador|palheta|lampada|rele|fusivel|chicote|espelho|farol|lanterna|oleo|graxa|adesivo|tinta|aditivo|vela|bateria|motor|compressor|alternador|turbina|tubo|abra[cç]adeira|gaxeta|chapa|revestimento|feltro|pinhao|oring|o-ring)\b/i.test(desc);
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

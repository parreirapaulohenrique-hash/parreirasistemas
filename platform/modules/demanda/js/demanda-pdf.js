/**
 * demanda-pdf.js — Importador de Catálogos PDF de Peças
 * ======================================================
 * Extrai referências de peças de catálogos OEM em PDF
 * e popula a base técnica Firestore (via DemandaLookup).
 *
 * Marcas suportadas: John Deere, New Holland, Case IH, Massey Ferguson
 * Equipamentos: Colheitadeiras, Plantadeiras, Pulverizadores, Tratores
 *
 * Usa PDF.js (pdfjs-dist) carregado dinamicamente via CDN.
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v2.4.0
 */

const DemandaPDF = (() => {

    const PDFJS_CDN    = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    // ── Padrões de código por fabricante ──────────────────────
    // Baseado nos formatos de referência reais dos OEMs
    const PART_PATTERNS = {
        'JOHN DEERE': [
            /\b([A-Z]{1,3}\d{5,8}[A-Z]?)\b/g,      // AKK24650, N317641, RE123456
            /\b([A-Z]{2}\d{6,10})\b/g,               // DZ126340, AN123456
            /\b(1[0-9]{8,9})\b/g,                    // 10 digits starting with 1
        ],
        'NEW HOLLAND': [
            /\b(\d{9,12})\b/g,                       // Pure numeric (CNH format)
            /\b([A-Z]\d{8,10}[A-Z]?)\b/g,            // Letter + digits
            /\b(87[0-9]{6,8})\b/g,                   // CNH universal parts (87xxxxxx)
        ],
        'CASE': [
            /\b(\d{3}-\d{4}-\d{2})\b/g,             // 123-4567-89
            /\b([A-Z]{1,2}\d{8,})\b/g,               // Letter prefix
            /\b(87[0-9]{6,8})\b/g,                   // CNH (shared w/ New Holland)
        ],
        'MASSEY FERGUSON': [
            /\b(\d{7,10})\b/g,                       // Numeric (AGCO format)
            /\b([A-Z]\d{7,9}[A-Z]?)\b/g,
            /\b(3\d{8})\b/g,                         // Parts starting with 3
        ],
        'VALTRA': [
            /\b([A-Z]{2,3}\d{5,8})\b/g,
        ],
    };

    // ── Palavras-chave de detecção de contexto ─────────────────
    const MARCAS_KEYWORDS = {
        'JOHN DEERE':       ['john deere', 'deere', 'jd', 'greenstar'],
        'NEW HOLLAND':      ['new holland', 'cnh', 'ford new holland'],
        'CASE':             ['case ih', 'case i.h.', 'caseiH', 'ihc'],
        'MASSEY FERGUSON':  ['massey ferguson', 'massey', 'agco'],
        'VALTRA':           ['valtra'],
    };

    const EQUIPAMENTO_KEYWORDS = {
        'COLHEITADEIRA': ['colheitadeira', 'colheita', 'harvester', 'combine', 's660', 's680',
                          's690', 's770', 'sts', 'cr9', 'cr10', 'cx', 'tc'],
        'PLANTADEIRA':   ['plantadeira', 'planter', 'semeadora', 'seedstar', 'exactemerge',
                          'db60', 'db80', 'db90', 'p2070', 'p2075', 'p2080'],
        'PULVERIZADOR':  ['pulverizador', 'sprayer', 'r4023', 'r4030', 'r4038', 'r4040',
                          'r4044', 'r4045', 'aplicador', 'guardian'],
        'TRATOR':        ['trator', 'tractor', '6030', '6120', '6130', '6140', '6150',
                          '7200', '7215', '7230', '8100', '8200', '8300', '8400', '9420'],
    };

    // ── Carrega PDF.js dinamicamente ───────────────────────────
    function _loadPDFjs() {
        return new Promise((resolve, reject) => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                resolve(window.pdfjsLib);
                return;
            }
            const s    = document.createElement('script');
            s.src      = PDFJS_CDN;
            s.onload   = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                resolve(window.pdfjsLib);
            };
            s.onerror  = () => reject(new Error('Falha ao carregar PDF.js'));
            document.head.appendChild(s);
        });
    }

    // ── Extrai texto de todas as páginas ───────────────────────
    async function _extractPages(pdfLib, file, onPageProgress) {
        const buffer = await file.arrayBuffer();
        const pdf    = await pdfLib.getDocument({ data: buffer }).promise;
        const pages  = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            const text    = content.items.map(it => it.str).join(' ');
            pages.push({ pageNum: i, text });
            if (onPageProgress) onPageProgress(i, pdf.numPages);
        }

        return pages;
    }

    // ── Detecta fabricante pelo texto ──────────────────────────
    function _detectFabricante(text) {
        const lower = text.toLowerCase();
        for (const [fab, keywords] of Object.entries(MARCAS_KEYWORDS)) {
            if (keywords.some(kw => lower.includes(kw))) return fab;
        }
        return 'DESCONHECIDO';
    }

    // ── Detecta equipamento pelo texto ─────────────────────────
    function _detectEquipamento(text) {
        const lower = text.toLowerCase();
        for (const [eq, keywords] of Object.entries(EQUIPAMENTO_KEYWORDS)) {
            if (keywords.some(kw => lower.includes(kw))) return eq;
        }
        return '';
    }

    // ── Extrai modelo (ex: "S680", "8400R") do texto ──────────
    function _detectModelo(text) {
        // Padrão comum: letra + 3-4 dígitos + opcional letra
        const matches = text.match(/\b([A-Z]\d{3,4}[A-Z]?)\b/g);
        return matches ? [...new Set(matches)].slice(0, 3).join(', ') : '';
    }

    // ── Filtra referências inválidas (ruído) ───────────────────
    function _isValidRef(ref, fabricante) {
        if (!ref || ref.length < 4 || ref.length > 18) return false;
        // Descarta apenas dígitos curtos (números de página, etc.)
        if (/^\d{1,6}$/.test(ref)) return false;
        // Descarta strings apenas de letras comuns
        if (/^[A-Z]{1,3}$/.test(ref)) return false;
        return true;
    }

    // ── Extrai referências de um texto ─────────────────────────
    function _extractRefs(text, fabricante) {
        const patterns = PART_PATTERNS[fabricante] || Object.values(PART_PATTERNS).flat();
        const refs     = new Set();

        for (const pattern of patterns) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = re.exec(text)) !== null) {
                const ref = match[1] || match[0];
                if (_isValidRef(ref, fabricante)) refs.add(ref);
            }
        }

        return [...refs];
    }

    // ── Tenta extrair descrição próxima ao código ──────────────
    function _extractDescNearRef(pageText, ref) {
        const idx = pageText.indexOf(ref);
        if (idx < 0) return '';
        // Pega texto ao redor do código
        const around = pageText.slice(Math.max(0, idx - 60), idx + ref.length + 120);
        // Remove o próprio código e limpa
        return around
            .replace(ref, '')
            .replace(/[^\w\sÀ-ÿ\-\.]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
    }

    // ── Importa catálogo PDF → base técnica ───────────────────
    /**
     * @param {File}   file         - Arquivo PDF
     * @param {Object} meta         - { fabricante?, equipamento?, modelo? }
     * @param {function} onProgress - (fase, atual, total, msg) => void
     * @returns {Promise<{totalPaginas, totalRefs, totalSalvo, fabricante, equipamento, modelo}>}
     */
    async function importCatalogPDF(file, meta = {}, onProgress) {
        // 1. Carrega PDF.js
        if (onProgress) onProgress('carregando', 0, 1, 'Carregando PDF.js...');
        const pdfLib = await _loadPDFjs();

        // 2. Extrai texto das páginas
        if (onProgress) onProgress('extraindo', 0, 1, 'Lendo páginas do PDF...');
        const pages = await _extractPages(pdfLib, file, (cur, total) => {
            if (onProgress) onProgress('extraindo', cur, total, `Lendo página ${cur}/${total}...`);
        });

        // 3. Detecta contexto (fabricante, equipamento, modelo) do PDF inteiro
        const fullText   = pages.map(p => p.text).join(' ');
        const fabricante = meta.fabricante  || _detectFabricante(fullText);
        const equipamento= meta.equipamento || _detectEquipamento(fullText);
        const modelo     = meta.modelo      || _detectModelo(fullText);

        if (onProgress) onProgress('analisando', 0, pages.length,
            `Fabricante: ${fabricante} | Equipamento: ${equipamento}`);

        // 4. Extrai referências de cada página
        const produtosMap = new Map();

        for (let i = 0; i < pages.length; i++) {
            const { text } = pages[i];
            if (onProgress) onProgress('analisando', i + 1, pages.length, `Analisando página ${i + 1}/${pages.length}...`);

            const refs = _extractRefs(text, fabricante);
            for (const ref of refs) {
                if (!produtosMap.has(ref)) {
                    produtosMap.set(ref, {
                        codigoFab:  ref,
                        descricao:  _extractDescNearRef(text, ref),
                        fabricante,
                        aplicacao:  [equipamento, modelo].filter(Boolean).join(' — '),
                        grupo:      equipamento || 'PEÇAS AGRÍCOLAS',
                        subGrupo:   modelo || '',
                        origem:     'pdf_catalog',
                    });
                }
            }
        }

        const produtos = [...produtosMap.values()];

        // 5. Salva na base técnica
        let totalSalvo = 0;
        if (produtos.length > 0 && typeof DemandaLookup !== 'undefined') {
            if (onProgress) onProgress('salvando', 0, produtos.length,
                `Salvando ${produtos.length} referências na base técnica...`);
            totalSalvo = await DemandaLookup.saveBatchToTechbase(produtos, 'pdf_catalog', (salvo) => {
                if (onProgress) onProgress('salvando', salvo, produtos.length,
                    `Salvando... ${salvo}/${produtos.length}`);
            });
        }

    
    // ═══════════════════════════════════════════════════════════
    // PARSER ESTRUTURADO DE COTAÇÕES / ORÇAMENTOS OEM EM PDF
    // Extrai tabelas respeitando coordenadas geométricas X / Y
    // ═══════════════════════════════════════════════════════════

    async function parseCotacaoPDF(file, onProgress) {
        const pdfLib = await _loadPDFjs();
        const buffer = await file.arrayBuffer();
        const pdf    = await pdfLib.getDocument({ data: buffer }).promise;
        const totalPaginas = pdf.numPages;
        const itensEncontrados = [];

        // Termos que indicam cabeçalhos ou rodapés a serem descartados
        const IGNORE_PATTERNS = /^(número\s*de\s*peça|numero\s*de\s*peca|part\s*number|item\s*code|código|codigo|qtde?|quantidade|qty|descrição|descricao|description|comentário|comentario|pin|copyright|todos\s*os\s*direitos|page\s*\d+|página\s*\d+|a\s*pronta\s*entrega|em\s*cotação|um\s*pouco\s*mais|orçamento|deere\s*&\s*company|um\s*solicita|qtde?\s*solic|descri[cç][aã]o\s*comple)/i;

        for (let p = 1; p <= totalPaginas; p++) {
            if (onProgress) onProgress(p, totalPaginas);
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();

            // 1. Coleta itens com coordenadas X e Y
            const rawItems = content.items.map(it => ({
                text: (it.str || '').trim(),
                x: it.transform[4],
                y: it.transform[5],
                width: it.width,
                height: it.height
            })).filter(it => it.text.length > 0);

            // 2. Agrupa itens com Y próximo (mesma linha da tabela, tolerância 4px)
            const rowsMap = [];
            rawItems.forEach(item => {
                let row = rowsMap.find(r => Math.abs(r.y - item.y) <= 4.5);
                if (!row) {
                    row = { y: item.y, items: [] };
                    rowsMap.push(row);
                }
                row.items.push(item);
            });

            // Ordena as linhas do topo para o rodapé (Y decrescente)
            rowsMap.sort((a, b) => b.y - a.y);

            // 3. Processa cada linha de itens da esquerda para a direita (X crescente)
            rowsMap.forEach(row => {
                row.items.sort((a, b) => a.x - b.x);
                const lineFullText = row.items.map(it => it.text).join(' ').trim();

                if (!lineFullText || IGNORE_PATTERNS.test(lineFullText) || lineFullText.length < 3) {
                    return;
                }

                // Remove marcas de conferência comuns (✓, X, —, etc.)
                const tokens = row.items
                    .map(it => it.text)
                    .filter(t => t !== '✓' && t !== 'X' && t !== 'x' && t !== '—' && t !== '-' && t !== '.' && t !== ':');

                if (tokens.length === 0) return;

                let ref = '';
                let qtde = 1;
                let desc = '';
                let obs = '';

                // Regex para referências OEM: 1-4 letras + 4-10 dígitos + sufixo opcional (ex: AKK23814, RE196945, N305594, TY26372, AN208074, 14M7594)
                const partRegex = /^[A-Z0-9]{1,4}\d{4,}[A-Z0-9]*$/i;
                let refIdx = -1;

                for (let i = 0; i < tokens.length; i++) {
                    const tk = tokens[i].replace(/[.,:;]/g, '').trim();
                    if (partRegex.test(tk) && !/^\d{1,3}$/.test(tk)) {
                        ref = tk.toUpperCase();
                        refIdx = i;
                        break;
                    }
                }

                // Fallback: se não pegou por regex estrito, analisa primeiro token
                if (!ref && tokens.length > 0) {
                    const first = tokens[0].replace(/[.,:;]/g, '').trim();
                    if (first.length >= 4 && !/^\d{1,3}$/.test(first)) {
                        ref = first.toUpperCase();
                        refIdx = 0;
                    }
                }

                if (!ref) return;

                const restTokens = tokens.slice(refIdx + 1);

                // Detecta quantidade (número inteiro 1 a 99999 OU decimal tipo 2,00000 / 48,00000)
                let qtdeIdx = -1;
                for (let j = 0; j < restTokens.length; j++) {
                    const t = restTokens[j].trim();
                    // Ignora centro de custo ou número de item tipo .100.997 ou ,100.997
                    if (/^[.,]?\d{3}[.,]\d{3}$/.test(t)) continue;

                    if (/^\d{1,6}(?:[.,]\d+)?$/.test(t)) {
                        const numVal = parseFloat(t.replace(',', '.'));
                        if (numVal > 0 && numVal <= 50000) {
                            qtde = Math.round(numVal) || 1;
                            qtdeIdx = j;
                            break;
                        }
                    }
                }

                const descTokens = [];
                const obsTokens = [];

                restTokens.forEach((t, j) => {
                    if (j === qtdeIdx) return;
                    if (/^(un|und|unid|pc|pç|cj|jg|kg|m)$/i.test(t)) return;
                    if (/^[.,]?\d{3}[.,]\d{3}$/.test(t)) return; // ignora .100.997
                    if (t.toLowerCase() === 'agricultura') return;
                    if (/^m\d{3,4}/i.test(t) || /pulverizador|colheitadeira|trator|plantadeira/i.test(t)) {
                        obsTokens.push(t);
                    } else {
                        descTokens.push(t);
                    }
                });

                desc = descTokens.join(' ').trim();
                obs  = obsTokens.join(' ').trim();

                itensEncontrados.push({
                    refOriginal: ref,
                    descOriginal: desc || ('Peça ' + ref),
                    qtdeSolicitada: qtde || 1,
                    obs: obs,
                    incerteza: false
                });
            });
        }

        return itensEncontrados;
    }

    return {
            totalPaginas: pages.length,
            totalRefs:    produtos.length,
            totalSalvo,
            fabricante,
            equipamento,
            modelo,
        };
    }


    // ═══════════════════════════════════════════════════════════
    // PARSER ESTRUTURADO DE COTAÇÕES / ORÇAMENTOS OEM EM PDF
    // Extrai tabelas respeitando coordenadas geométricas X / Y
    // ═══════════════════════════════════════════════════════════

    async function parseCotacaoPDF(file, onProgress) {
        const pdfLib = await _loadPDFjs();
        const buffer = await file.arrayBuffer();
        const pdf    = await pdfLib.getDocument({ data: buffer }).promise;
        const totalPaginas = pdf.numPages;
        const itensEncontrados = [];

        // Termos que indicam cabeçalhos ou rodapés a serem descartados
        const IGNORE_PATTERNS = /^(número\s*de\s*peça|numero\s*de\s*peca|part\s*number|item\s*code|código|codigo|qtde?|quantidade|qty|descrição|descricao|description|comentário|comentario|pin|copyright|todos\s*os\s*direitos|page\s*\d+|página\s*\d+|a\s*pronta\s*entrega|em\s*cotação|um\s*pouco\s*mais|orçamento|deere\s*&\s*company|um\s*solicita|qtde?\s*solic|descri[cç][aã]o\s*comple|denomina[cç][aã]o)/i;

        for (let p = 1; p <= totalPaginas; p++) {
            if (onProgress) onProgress(p, totalPaginas);
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();

            // 1. Coleta itens com coordenadas X e Y
            const rawItems = content.items.map(it => ({
                text: (it.str || '').trim(),
                x: it.transform[4],
                y: it.transform[5],
                width: it.width,
                height: it.height
            })).filter(it => it.text.length > 0);

            // 2. Agrupa itens com Y próximo (mesma linha da tabela, tolerância 4px)
            const rowsMap = [];
            rawItems.forEach(item => {
                let row = rowsMap.find(r => Math.abs(r.y - item.y) <= 4.5);
                if (!row) {
                    row = { y: item.y, items: [] };
                    rowsMap.push(row);
                }
                row.items.push(item);
            });

            // Ordena as linhas do topo para o rodapé (Y decrescente)
            rowsMap.sort((a, b) => b.y - a.y);

            // 3. Processa cada linha de itens da esquerda para a direita (X crescente)
            rowsMap.forEach(row => {
                row.items.sort((a, b) => a.x - b.x);
                const lineFullText = row.items.map(it => it.text).join(' ').trim();

                if (!lineFullText || IGNORE_PATTERNS.test(lineFullText) || lineFullText.length < 3) {
                    return;
                }
                if (/(solicita|qtde?\s*solic|descri[cç][aã]o\s*comple|denomina[cç][aã]o)/i.test(lineFullText) && !/\b\d{1,5}[.,]0+\b/.test(lineFullText)) {
                    return;
                }

                // Remove marcas de conferência comuns (✓, X, —, etc.)
                const tokens = row.items
                    .map(it => it.text)
                    .filter(t => t !== '✓' && t !== 'X' && t !== 'x' && t !== '—' && t !== '-' && t !== '.' && t !== ':');

                if (tokens.length === 0) return;

                let ref = '';
                let qtde = 1;
                let desc = '';
                let obs = '';

                // Regex para referências OEM: 1-4 letras + 4-10 dígitos + sufixo opcional (ex: AKK23814, RE196945, N305594, TY26372, AN208074, 14M7594)
                const partRegex = /^[A-Z0-9]{1,4}\d{4,}[A-Z0-9]*$/i;
                let refIdx = -1;

                for (let i = 0; i < tokens.length; i++) {
                    const tk = tokens[i].replace(/[.,:;]/g, '').trim();
                    if (partRegex.test(tk) && !/^\d{1,3}$/.test(tk)) {
                        ref = tk.toUpperCase();
                        refIdx = i;
                        break;
                    }
                }

                // Fallback: se não pegou por regex estrito, analisa primeiro token
                if (!ref && tokens.length > 0) {
                    const first = tokens[0].replace(/[.,:;]/g, '').trim();
                    if (first.length >= 4 && !/^\d{1,3}$/.test(first)) {
                        ref = first.toUpperCase();
                        refIdx = 0;
                    }
                }

                if (!ref || ref.length < 3) return;

                const restTokens = tokens.slice(refIdx + 1);

                // Detecta quantidade (aceita inteiros como 1..99999 OU decimais como 2,00000 / 48,00000)
                let qtdeIdx = -1;
                for (let j = 0; j < restTokens.length; j++) {
                    const t = restTokens[j].trim();
                    // Ignora centro de custo ou número de item tipo .100.997 ou ,100.997
                    if (/^[.,]?\d{3}[.,]\d{3}$/.test(t)) continue;
                    if (/^(un|und|unid|pc|pç|cj|jg|kg|m)$/i.test(t)) continue;

                    if (/^\d{1,6}(?:[.,]\d+)?$/.test(t)) {
                        const numVal = parseFloat(t.replace(',', '.'));
                        if (numVal > 0 && numVal <= 50000) {
                            qtde = Math.round(numVal) || 1;
                            qtdeIdx = j;
                            break;
                        }
                    }
                }

                const descTokens = [];
                const obsTokens = [];

                restTokens.forEach((t, j) => {
                    if (j === qtdeIdx) return;
                    const clean = t.trim();
                    if (/^(un|und|unid|pc|pç|cj|jg|kg|m)$/i.test(clean)) return;
                    if (/^[.,]?\d{3}[.,]\d{3}$/.test(clean)) return; // ignora ,100.997
                    if (clean.toLowerCase() === 'agricultura') return;
                    if (/^m\d{3,4}/i.test(clean) || /pulverizador|colheitadeira|trator|plantadeira/i.test(clean)) {
                        obsTokens.push(clean);
                    } else {
                        descTokens.push(clean);
                    }
                });

                desc = descTokens.join(' ').trim();
                obs  = obsTokens.join(' ').trim();

                itensEncontrados.push({
                    refOriginal: ref,
                    descOriginal: desc || ('Peça ' + ref),
                    qtdeSolicitada: qtde || 1,
                    obs: obs,
                    incerteza: false
                });
            });
        }

        return itensEncontrados;
    }

    return {
        importCatalogPDF,
        parseCotacaoPDF
    };

})();

window.DemandaPDF = DemandaPDF;

/**
 * demanda-search.js — Motor de Busca de Produtos
 * ================================================
 * Centraliza toda busca de produtos para o módulo de demanda.
 * Consulta o MaxDataAdapter (ERP) e a base técnica (Firestore).
 *
 * NUNCA chama a API MaxData diretamente — passa sempre pelo adapter.
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaSearch = (() => {

    // ── Resolução Dinâmica de Tenant ─────────────────────────
    function _getTenantId() {
        if (typeof DemandaDB !== 'undefined' && DemandaDB.TENANT_ID) {
            return DemandaDB.TENANT_ID;
        }
        try {
            if (window.ParreiraAuth) {
                if (typeof ParreiraAuth.getTenantId === 'function') {
                    const tid = ParreiraAuth.getTenantId();
                    if (tid) return String(tid);
                }
                if (typeof ParreiraAuth.getTenant === 'function') {
                    const t = ParreiraAuth.getTenant();
                    if (t && typeof t === 'object' && t.id) return String(t.id);
                    if (t && typeof t === 'string') return t;
                }
            }
            if (window.sessionManager && typeof sessionManager.getTenantId === 'function') {
                const t = sessionManager.getTenantId();
                if (t) return String(t);
            }
            const s = JSON.parse(sessionStorage.getItem('parreira_session') || localStorage.getItem('parreira_session_ls') || 'null');
            if (s && s.tenantId) return String(s.tenantId);
        } catch (_) {}
        return String(localStorage.getItem('app_tenant_id') || 'centralpecas');
    }

    const _techbaseCol = () => `tenants/${_getTenantId()}/demanda/techbase`;

    // Cache simples para resultados recentes (5 min TTL, não para estoque)
    const _cache = new Map();
    const CACHE_TTL = 5 * 60 * 1000;

    function _getCached(key) {
        const entry = _cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
        return entry.data;
    }

    function _setCache(key, data) {
        _cache.set(key, { ts: Date.now(), data });
    }

    // ── Obtém o adapter MaxData ───────────────────────────────
    function _getAdapter() {
        // Tenta via ErpIntegration (sistema de registro central)
        if (window.ErpIntegration && ErpIntegration.getActive) {
            return ErpIntegration.getActive();
        }
        // Fallback: instancia direto com config do sessionStorage
        if (window.MaxDataAdapter) {
            const cfg = JSON.parse(sessionStorage.getItem('_demanda_erp_config') || '{}');
            if (!cfg.baseUrl) throw new Error('ERP não configurado. Faça login primeiro.');
            return new MaxDataAdapter(_getTenantId(), cfg);
        }
        throw new Error('MaxDataAdapter não encontrado. Verifique os scripts carregados.');
    }

    // ── Mapeamento Concorrente ➔ Central Peças (Cross-Reference) ──────
    const _DEFAULT_CONCORRENTE_MAP = {
        '00440185': 'CQ54027/1', // EIXO ESQUERDO DA RODA COBRIDORA (J.A. Agrícola -> Central Peças)
        '00440190': 'CQ54028/1', // EIXO DIREITO DA RODA COBRIDORA
        '39':       'CQ69725',   // ALAVANCA DB
        '399':      'CQ69723',   // EIXO DA RODA COBRIDORA 1100
        'KK34847':  'KK14927',   // BLINDAGEM DA HASTE 1100/2100/DB
        '1298':     'CQ16233',   // ARRUELA DB
        '83210508': 'M8 PARLOCK',// PORCA A/TRAVANTE M8
        '12577511': 'M12 PARLOC',// PORCA A/TRAVANTE M12
        '1611':     'PS8X55',    // PARAFUSO SEXTAVADO AC MA 8.8 8X55
        'ALM8':     '6004',      // ARRUELA LISA 8MM (Central Peças)
        '14M7166':  'M8 PARLOCK',// PORCA A/TRAVANTE M8
        '14M7291':  'M16FL',     // PORCA SEXT. FLANGE M16
    };

    function _extractBaseRef(ref) {
        if (!ref) return '';
        var r = String(ref).trim();
        // Remove sufixos comuns de marcas ou concorrentes (/JA, -INA, /PFI, /228, /199, -952, /RL, /FC, etc.)
        var base = r.replace(/[\/\-_](?:JA|INA|PFI|REX|FEY|CISER|RL|FC|THOR|DB|\d{2,4})$/i, '').trim();
        if (base.indexOf('/') >= 0) {
            base = base.split('/')[0].trim();
        }
        return base || r;
    }

    var _GENERIC_STOPWORDS = {
        'DE':1, 'DA':1, 'DO':1, 'DOS':1, 'DAS':1, 'COM':1, 'SEM':1, 'PARA':1, 'POR':1, 'EM':1, 'NO':1, 'NA':1, 'NOS':1, 'NAS':1,
        'E':1, 'OU':1, 'A':1, 'O':1, 'AS':1, 'OS':1, 'UM':1, 'UMA':1, 'UN':1, 'PC':1, 'KG':1, 'M':1, 'MM':1, 'CM':1,
        'ROLAMENTO':1, 'PARAFUSO':1, 'ARRUELA':1, 'PORCA':1, 'MANGOTE':1, 'RETENTOR':1, 'CORREIA':1,
        'PINHAO':1, 'CONJUNTO':1, 'ANEL':1, 'DISCO':1, 'MOLA':1, 'CHAPA':1, 'SUPORTE':1, 'EIXO':1, 'VEDADOR':1,
        'LISA':1, 'SEXTAVADO':1, 'ESFERAS':1, 'GERAL':1, 'ORIGINAL':1, 'ESPECIAL':1,
        'COMPONENTE':1, 'REVISAO':1, 'MAQ':1, 'PECA':1, 'PECAS':1, 'ITEM':1, 'PRODUTO':1, 'SERVICO':1, 'DIVERSOS':1, 'OUTROS':1
    };

    // ── Resolução de Preços MaxData ERP (Preço de Venda x Custo) ──
    function _getErpPrice(codErp, codFab, rawSku) {
        var pId = String(codErp || '').trim();
        var pFab = String(codFab || '').trim().toUpperCase();
        var pData = null;
        if (typeof window !== 'undefined') {
            if (window.ERP_PRICES_BY_ID && pId && window.ERP_PRICES_BY_ID[pId]) {
                pData = window.ERP_PRICES_BY_ID[pId];
            } else if (window.ERP_PRICES_BY_FAB && pFab && window.ERP_PRICES_BY_FAB[pFab]) {
                pData = window.ERP_PRICES_BY_FAB[pFab];
            }
        }
        if (pData) {
            return {
                v: Number(pData.v || pData.preco || 0),
                a: Number(pData.a || pData.valorAtacado || pData.v || 0),
                c: Number(pData.c || pData.valorCusto || (rawSku ? rawSku[11] : 0) || 0)
            };
        }
        // Fallback: se não estiver no mapa ERP direto mas tem histórico analítico
        if (rawSku && Array.isArray(rawSku)) {
            var custo = Number(rawSku[11] || 0);
            var qtdVendida = Number(rawSku[23] || 0);
            var fatTotal = Number(rawSku[24] || 0);
            var margemPct = Number(rawSku[26] || 0);
            var vVenda = 0;
            if (qtdVendida > 0 && fatTotal > 0) {
                vVenda = Number((fatTotal / qtdVendida).toFixed(2));
            } else if (custo > 0) {
                if (margemPct > 0 && margemPct < 90) {
                    vVenda = Number((custo / (1 - margemPct / 100)).toFixed(2));
                } else {
                    vVenda = Number((custo * 1.85).toFixed(2));
                }
            }
            return { v: vVenda, a: vVenda, c: custo };
        }
        return { v: 0, a: 0, c: 0 };
    }

    function _formatMatchResult(sku, score, tipoMatch) {
        var estq = Number(sku[10] != null ? sku[10] : (sku[9] || 0));
        var codErp = String(sku[0] || '');
        var codFab = String(sku[38] || '');
        var desc = sku[1] || '';
        var marca = sku[2] || '';
        var prcData = _getErpPrice(codErp, codFab, sku);
        var prcVenda = Number(prcData.v || 0);
        var custo = Number(prcData.c || sku[11] || 0);
        return {
            erpProdutoId:   codErp,
            codigoErp:      codErp,
            referencia:     codFab || codErp,
            erpCodigoFab:   codFab || codErp,
            codigoFab:      codFab,
            descricao:      desc,
            erpProdutoDesc: desc,
            marca:          marca,
            fabricante:     marca,
            estoqueFilial:  estq,
            saldoEstoque:   estq,
            preco:          prcVenda,
            precoUnitario:  prcVenda,
            precoVenda:     prcVenda,
            valorVenda:     prcVenda,
            valorAtacado:   Number(prcData.a || prcVenda),
            custo:          custo,
            valorCusto:     custo,
            status:         estq > 0 ? 'estoque_disponivel' : 'sem_estoque',
            score:          score,
            tipoMatch:      tipoMatch,
            confidencia:    score >= 95 ? 'alta' : 'media',
            _rawSku:        sku
        };
    }

    function _getConcorrenteMappings() {
        var map = Object.assign({}, _DEFAULT_CONCORRENTE_MAP);
        try {
            var saved = localStorage.getItem('demanda_concorrente_cross_ref');
            if (saved) {
                var parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') Object.assign(map, parsed);
            }
        } catch (_) {}
        return map;
    }

    function addConcorrenteMapping(refConcorrente, codFabOrErp) {
        if (!refConcorrente || !codFabOrErp) return;
        try {
            var map = _getConcorrenteMappings();
            var cleanKey = String(refConcorrente).toUpperCase().replace(/[^A-Z0-9]/g, '');
            map[cleanKey] = String(codFabOrErp).trim();
            map[String(refConcorrente).trim()] = String(codFabOrErp).trim();
            localStorage.setItem('demanda_concorrente_cross_ref', JSON.stringify(map));
        } catch (_) {}
    }

    // ── Busca na base local de 10.896 SKUs da integração MaxData ──────
    function _searchCompactSkus(query, filialId) {
        if (typeof window === 'undefined' || !Array.isArray(window.COMPACT_SKUS) || window.COMPACT_SKUS.length === 0) {
            return [];
        }
        const q = (query || '').trim();
        if (!q || q.length < 2) return [];

        const qUp = q.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const qNorm = qUp.replace(/[^A-Z0-9]/g, '');
        const qWords = qUp.split(/\s+/).filter(w => w.length >= 3);
        const results = [];
        const skus = window.COMPACT_SKUS;

        for (let i = 0; i < skus.length; i++) {
            const s = skus[i];
            const codErp = String(s[0] || '');
            const desc = String(s[1] || '').toUpperCase();
            const marca = String(s[2] || '');
            const estoque = Number(s[10] != null ? s[10] : (s[9] || 0));
            const codFab = String(s[38] || '');
            const crossRef = String(s[39] || '');

            const prcData = _getErpPrice(codErp, codFab, s);
            const precoVenda = Number(prcData.v || 0);
            const custo = Number(prcData.c || s[11] || 0);

            const fabNorm = codFab.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const crossNorm = crossRef.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const descNorm = desc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');

            let score = 0;
            let tipoMatch = '';

            // 1. Código Fabricante Exato
            if (fabNorm && fabNorm.length >= 2 && fabNorm === qNorm) {
                score = 100;
                tipoMatch = 'fab_exato';
            } else if (codErp === q || (qNorm.length >= 2 && codErp === qNorm)) {
                score = 99;
                tipoMatch = 'erp_exato';
            } else if (qNorm.length >= 3 && crossNorm.includes(qNorm)) {
                score = 96;
                tipoMatch = 'cross_ref';
            } else if (fabNorm && fabNorm.length >= 3 && qNorm.length >= 3 && (fabNorm.startsWith(qNorm) || (qNorm.length >= 4 && fabNorm.length >= 4 && qNorm.startsWith(fabNorm)))) {
                score = 92;
                tipoMatch = 'fab_prefix';
            } else if (descNorm === qNorm) {
                score = 90;
                tipoMatch = 'desc_exata';
            } else if (qNorm.length >= 4 && descNorm.includes(qNorm)) {
                score = 80;
                tipoMatch = 'desc_contem';
            } else if (qWords.length >= 2) {
                let hitWords = 0;
                for (const w of qWords) {
                    if (desc.includes(w)) hitWords++;
                }
                if (hitWords >= Math.min(2, qWords.length)) {
                    score = 75 + Math.round((hitWords / qWords.length) * 10);
                    tipoMatch = 'desc_palavras';
                }
            }

            if (score > 0) {
                results.push({
                    erpProdutoId: codErp,
                    codigoErp: codErp,
                    referencia: codFab || codErp,
                    codigoFab: codFab,
                    descricao: s[1],
                    marca: marca,
                    fabricante: marca,
                    estoque: estoque,
                    saldoEstoque: estoque,
                    estoqueFilial: estoque,
                    preco: precoVenda,
                    precoUnitario: precoVenda,
                    precoVenda: precoVenda,
                    valorVenda: precoVenda,
                    valorAtacado: Number(prcData.a || precoVenda),
                    custo: custo,
                    valorCusto: custo,
                    confidencia: score >= 95 ? 'alta' : 'media',
                    _temEstoque: estoque > 0,
                    _fonte: 'compact_skus_maxdata',
                    _rank: score,
                    _match: tipoMatch,
                    _rawSku: s
                });
            }
        }

        results.sort((a, b) => {
            if (b._rank !== a._rank) return b._rank - a._rank;
            return (b.estoque > 0 ? 1 : 0) - (a.estoque > 0 ? 1 : 0);
        });

        return results.slice(0, 25);
    }

    // ── Smart Match Especializado para Cotações e Concorrentes ────────
    /**
     * Localiza o produto exato ou equivalente mais provável na base Central Peças
     * combinando referência de fábrica, código de concorrente, normalização de rolamentos e dimensões.
     * NUNCA chuta produtos aleatórios se não houver correlação técnica forte.
     *
     * @param {object|string} itemOrQuery - { refOriginal, descOriginal, precoConcorrente, concorrenteNome }
     * @param {object} opts
     * @returns {object|null} Produto enriquecido para auto-vínculo
     */
    function smartMatch(itemOrQuery, opts) {
        if (typeof window === 'undefined' || !Array.isArray(window.COMPACT_SKUS) || window.COMPACT_SKUS.length === 0) {
            return null;
        }

        var refOrig  = '';
        var descOrig = '';
        var precoConc = null;

        if (typeof itemOrQuery === 'string') {
            refOrig = itemOrQuery;
        } else if (itemOrQuery && typeof itemOrQuery === 'object') {
            refOrig  = itemOrQuery.refOriginal || itemOrQuery.referencia || itemOrQuery.ref || '';
            descOrig = itemOrQuery.descOriginal || itemOrQuery.descricao || itemOrQuery.desc || '';
            precoConc = itemOrQuery.precoConcorrente != null ? Number(itemOrQuery.precoConcorrente) : null;
        }

        refOrig = String(refOrig || '').trim();
        descOrig = String(descOrig || '').trim();

        var baseRef   = _extractBaseRef(refOrig);
        var refClean  = refOrig.toUpperCase().replace(/[^A-Z0-9]/g, '');
        var baseClean = baseRef.toUpperCase().replace(/[^A-Z0-9]/g, '');
        var descUpper = descOrig.toUpperCase();
        var skus      = window.COMPACT_SKUS;

        // 1. Mapeamento direto de Código de Concorrente (ex: J.A. Agrícola -> Central Peças)
        var mapConcorrente = _getConcorrenteMappings();
        var targetCode = null;
        var keysToCheck = [refClean, baseClean, refOrig, baseRef];
        for (var kIdx = 0; kIdx < keysToCheck.length; kIdx++) {
            var k = keysToCheck[kIdx];
            if (k && mapConcorrente[k]) {
                targetCode = mapConcorrente[k];
                break;
            }
        }
        if (targetCode) {
            var targetClean = String(targetCode).toUpperCase().replace(/[^A-Z0-9]/g, '');
            for (var mIdx = 0; mIdx < skus.length; mIdx++) {
                var sm = skus[mIdx];
                var smErp = String(sm[0] || '');
                var smFab = String(sm[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var smCross = String(sm[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var smDesc = String(sm[1] || '').toUpperCase();
                if (smFab === targetClean || smErp === targetCode || smCross.indexOf(targetClean) >= 0) {
                    if (targetCode === '6004' && smDesc.indexOf('ARRUELA') < 0) continue;
                    return _formatMatchResult(sm, 100, 'concorrente_map');
                }
            }
        }

        // 2. Busca por Código de Fabricante ou CrossRef Exato (testando baseRef limpa e refOrig)
        var codesToTest = [];
        if (baseClean && baseClean.length >= 3) codesToTest.push(baseClean);
        if (refClean && refClean.length >= 3 && refClean !== baseClean) codesToTest.push(refClean);

        for (var cIdx = 0; cIdx < codesToTest.length; cIdx++) {
            var c = codesToTest[cIdx];
            var exactCandidates = [];
            for (var i = 0; i < skus.length; i++) {
                var s = skus[i];
                var fabC = String(s[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var erpC = String(s[0] || '');
                var crossC = String(s[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                if (c === fabC || c === erpC) {
                    exactCandidates.push({ sku: s, score: 100, tipo: 'cod_fab_exato' });
                } else if (c.length >= 4 && crossC.indexOf(c) >= 0) {
                    exactCandidates.push({ sku: s, score: 96, tipo: 'cross_ref_exato' });
                }
            }
            if (exactCandidates.length > 0) {
                // Prioriza quem tem estoque positivo e maior score
                exactCandidates.sort(function(a, b) {
                    var estA = Number(a.sku[10] != null ? a.sku[10] : (a.sku[9] || 0));
                    var estB = Number(b.sku[10] != null ? b.sku[10] : (b.sku[9] || 0));
                    if (b.score !== a.score) return b.score - a.score;
                    return (estB > 0 ? 1 : 0) - (estA > 0 ? 1 : 0);
                });
                return _formatMatchResult(exactCandidates[0].sku, exactCandidates[0].score, exactCandidates[0].tipo);
            }
        }

        // 3. Normalização e Correspondência de Rolamentos Industriais/Agrícolas
        // (ex: 6006-2RS-C3/PFI -> 6006-2RS C3, F110390 -INA -> F110390 / PF110390)
        var bearingRegex = /\b(6\d{3}|5\d{3}|3\d{4}|F\d{5,6}|PF\d{5,6})\b/i;
        var bMatch = refOrig.match(bearingRegex);
        var bNum = null;
        if (bMatch) {
            bNum = bMatch[1].toUpperCase();
        } else if (descUpper.indexOf('ROLAMENTO') >= 0) {
            var numInRef = baseClean.match(/(\d{4,6})/);
            if (numInRef) bNum = numInRef[1];
        }

        if (bNum && bNum.length >= 4) {
            var bCand = [];
            for (var bIdx = 0; bIdx < skus.length; bIdx++) {
                var sb = skus[bIdx];
                var sbFabClean = String(sb[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var sbCrossClean = String(sb[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var sbDesc = String(sb[1] || '').toUpperCase();

                if (sbDesc.indexOf('ROLAMENTO') >= 0) {
                    if (sbFabClean.indexOf(bNum) >= 0 || sbCrossClean.indexOf(bNum) >= 0) {
                        var bScore = 92;
                        if (refClean.indexOf('2RS') >= 0 && sbFabClean.indexOf('2RS') >= 0) bScore += 4;
                        if (refClean.indexOf('C3') >= 0 && sbFabClean.indexOf('C3') >= 0) bScore += 3;
                        bCand.push({ sku: sb, score: bScore, tipo: 'rolamento_normativo' });
                    }
                }
            }
            if (bCand.length > 0) {
                bCand.sort(function(a, b) {
                    var estA = Number(a.sku[10] != null ? a.sku[10] : (a.sku[9] || 0));
                    var estB = Number(b.sku[10] != null ? b.sku[10] : (b.sku[9] || 0));
                    if (b.score !== a.score) return b.score - a.score;
                    return (estB > 0 ? 1 : 0) - (estA > 0 ? 1 : 0);
                });
                return _formatMatchResult(bCand[0].sku, bCand[0].score, bCand[0].tipo);
            }
        }

        // 4. Extração de Código Alfanumérico Embutido na Descrição (ex: "BLINDAGEM KK34847", "MOLA AX10319")
        var tokensDesc = descUpper.match(/[A-Z0-9\/\-\.]{4,}/g) || [];
        for (var t = 0; t < tokensDesc.length; t++) {
            var tokC = tokensDesc[t].replace(/[^A-Z0-9]/g, '');
            if (tokC.length >= 4 && !/^[A-Z]+$/.test(tokC) && !/^[0-9]+$/.test(tokC)) {
                for (var j = 0; j < skus.length; j++) {
                    var sj = skus[j];
                    var fabJ = String(sj[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    var crossJ = String(sj[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (tokC === fabJ || (tokC.length >= 5 && crossJ.indexOf(tokC) >= 0)) {
                        return _formatMatchResult(sj, 95, 'codigo_na_descricao');
                    }
                }
            }
        }

        // 5. Detecção de Dimensões de Parafusos/Fixadores
        // ATENÇÃO: Dispara APENAS se a descrição contiver explicitamente fixadores (NUNCA para mangotes ou anéis!)
        var isFastener = (descUpper.indexOf('PARAFUSO') >= 0 || descUpper.indexOf('BARRA') >= 0 || descUpper.indexOf('PRISIONEIRO') >= 0 || descUpper.indexOf('SEXTAVADO') >= 0);
        if (isFastener) {
            var dimMatch = descUpper.match(/(\d+)\s*[xX]\s*(\d+)/);
            if (dimMatch) {
                var dimCode = 'M' + dimMatch[1] + 'X' + dimMatch[2];
                var dimClean = dimCode.replace(/[^A-Z0-9]/g, '');
                for (var d = 0; d < skus.length; d++) {
                    var sd = skus[d];
                    var fabD = String(sd[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    var crossD = String(sd[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    var descD = String(sd[1] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (dimClean === fabD || crossD.indexOf(dimClean) >= 0 || descD.indexOf(dimClean) >= 0) {
                        if (descUpper.indexOf('FLANG') >= 0 && String(sd[1] || '').toUpperCase().indexOf('FLANG') < 0) {
                            continue;
                        }
                        return _formatMatchResult(sd, 94, 'dimensao_fixador');
                    }
                }
            }
        }

        // 6. Porcas Auto-Travantes / Parlock
        var isPorcaTrav = descUpper.indexOf('PORCA') >= 0 && (descUpper.indexOf('TRAV') >= 0 || descUpper.indexOf('PRESS') >= 0 || descUpper.indexOf('FREN') >= 0 || descUpper.indexOf('PARLOCK') >= 0 || descUpper.indexOf('PARLOC') >= 0);
        if (isPorcaTrav) {
            var diaMatch = descUpper.match(/(?:MA|M)\s*(\d+)|\b(\d+)\s*MM/);
            if (diaMatch) {
                var diaNum = diaMatch[1] || diaMatch[2];
                var porcaTarget = 'M' + diaNum + ' PARLOCK';
                var porcaTargetClean = porcaTarget.replace(/[^A-Z0-9]/g, '');
                for (var p = 0; p < skus.length; p++) {
                    var sp = skus[p];
                    var fabP = String(sp[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    var descP = String(sp[1] || '').toUpperCase();
                    if (fabP === porcaTargetClean || (descP.indexOf('PORCA') >= 0 && descP.indexOf('M' + diaNum) >= 0 && descP.indexOf('TRAVANTE') >= 0)) {
                        return _formatMatchResult(sp, 93, 'porca_travante');
                    }
                }
            }
        }

        // 7. Normalização e Expansão Semântica Agrícola ESTRITA
        // EXIGE pelo menos 2 palavras técnicas distintas e específicas (ignorando stopwords genéricas)
        var expDesc = descUpper
            .replace(/\bLE\b/g, 'ESQUERDO')
            .replace(/\bLD\b/g, 'DIREITO')
            .replace(/\bCAL\b/g, 'CALIBRADORA')
            .replace(/\bCUBRIDORA\b/g, 'COBRIDORA')
            .replace(/\bFLANG\b/g, 'FLANGEADO');

        var rawWords = expDesc.split(/[^A-Z0-9]+/).filter(function(w) { return w.length >= 3; });
        var expWords = rawWords.filter(function(w) { return !_GENERIC_STOPWORDS[w]; });

        if (expWords.length >= 2) {
            var bestSku = null;
            var bestHits = 0;

            for (var k = 0; k < skus.length; k++) {
                var sk = skus[k];
                var skDesc = String(sk[1] || '').toUpperCase();

                var matchedWords = 0;
                for (var w = 0; w < expWords.length; w++) {
                    if (skDesc.indexOf(expWords[w]) >= 0) matchedWords++;
                }

                if (matchedWords >= 2 && matchedWords === expWords.length) {
                    return _formatMatchResult(sk, 91, 'desc_palavras_estritas');
                } else if (matchedWords >= 2 && matchedWords > bestHits) {
                    bestHits = matchedWords;
                    bestSku = sk;
                }
            }

            if (bestSku && (bestHits / expWords.length) >= 0.75) {
                return _formatMatchResult(bestSku, 88, 'desc_palavras_parciais');
            }
        }

        // Se não houver correspondência forte e segura, retorna null (NUNCA CHUTA PRODUTO ERRADO!)
        return null;
    }

    // ── Busca principal (rota multi-camada) ───────────────────
    /**
     * Busca um produto por qualquer informação disponível.
     * Cascata: Compact SKUs (10.896) → Firestore synced → base técnica → ERP (opcional)
     *
     * @param {string} query - Texto digitado pelo vendedor
     * @param {object} opts  - { filialId, limit, forceRefresh }
     * @returns {Promise<Array<ResultadoBusca>>}
     */
    async function search(query, opts = {}) {
        const q     = (query || '').trim();
        if (!q || q.length < 2) return [];

        const { filialId = 1, limit = 25, forceRefresh = false } = opts;
        const cacheKey = `search:${q}:${filialId}`;

        if (!forceRefresh) {
            const cached = _getCached(cacheKey);
            if (cached) return cached;
        }

        const results = [];
        const seen    = new Set();

        // CAMADA -1 (ULTRA RÁPIDA / OFFLINE): Base de 10.896 SKUs MaxData integrados (window.COMPACT_SKUS)
        try {
            const compactMatches = _searchCompactSkus(q, filialId);
            for (const r of compactMatches) {
                const key = `erp:${r.erpProdutoId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(r);
                }
            }
        } catch (e) {
            console.warn('[DemandaSearch] COMPACT_SKUS falhou:', e.message);
        }

        // CAMADA 0 (PRIMÁRIA): Produtos sincronizados no Firestore (maxdata_sync.py)
        // Sempre funciona, independente de acesso ao ERP.
        try {
            const fsProducts = await _searchFirestoreProducts(q, filialId);
            for (const r of fsProducts) {
                const key = `fs:${r.erpProdutoId || r._firestoreId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ ...r, _fonte: 'firestore_sync', _rank: r._rank || 90 });
                }
            }
        } catch (e) { console.warn('[DemandaSearch] Firestore products falhou:', e.message); }

        // CAMADA 1: Base técnica Firestore (referências cruzadas OEM)
        try {
            const techResults = await _searchTechbase(q, filialId);
            for (const r of techResults) {
                const key = r.erpProdutoId ? `erp:${r.erpProdutoId}` : `tb:${r.parteMestreId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ ...r, _fonte: 'base_tecnica', _rank: r._rank || 80 });
                }
            }
        } catch (e) { console.warn('[DemandaSearch] Base técnica falhou:', e.message); }

        // CAMADA 2: ERP em tempo real (opcional — falha silenciosa se inacessível)
        if (results.length < 5) {
            try {
                const erpRef = await _searchErpByRef(q, filialId);
                for (const r of erpRef) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_ref_exata', _rank: 100 });
                    }
                }
            } catch (_) { /* ERP inacessível — ignora */ }
        }

        // CAMADA 3: Busca textual ERP (última opção)
        if (results.length < 3) {
            try {
                const erpText = await _searchErpByText(q, filialId, limit);
                for (const r of erpText) {
                    if (!seen.has(`erp:${r.erpProdutoId}`)) {
                        seen.add(`erp:${r.erpProdutoId}`);
                        results.push({ ...r, _fonte: 'erp_texto', _rank: 60 });
                    }
                }
            } catch (_) { /* ERP inacessível — ignora */ }
        }

        const sorted = results.sort((a, b) => b._rank - a._rank).slice(0, limit);
        _setCache(cacheKey, sorted);
        return sorted;
    }

    // ── Busca no Firestore (techbase/products — coleção sincronizada) ─────
    /**
     * Busca produtos no Firestore usando prefix range queries.
     * Funciona para: código exato, prefixo de referência, prefixo de descrição.
     */
    // ── Busca no Firestore (techbase/products — coleção sincronizada) ─────
    /**
     * Busca produtos no Firestore usando referências exatas, referências cruzadas e texto.
     * Funciona para: código exato, referências cruzadas (similares), prefixo de referência e descrição.
     */
    async function _searchFirestoreProducts(query, filialId) {
        if (typeof firebase === 'undefined') return [];
        const db  = firebase.firestore();
        const col = `tenants/${_getTenantId()}/demanda/techbase/products`;

        const qUp = query.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const qNorm = qUp.replace(/[\s\-\.\/]/g, '');
        const end = qUp + '\uf8ff';
        const results = [];
        const seen = new Set();

        const addItem = (doc) => {
            if (seen.has(doc.id)) return;
            seen.add(doc.id);
            const d = doc.data();
            results.push(_mapFirestoreProduct(d, doc.id, filialId, qUp, qNorm));
        };

        // 1. Busca por código de fábrica / referência
        try {
            const refSnap = await db.collection(col)
                .where('referencia', '>=', qUp).where('referencia', '<=', end)
                .where('ativo', '==', true).limit(15).get();
            refSnap.docs.forEach(d => addItem(d));
        } catch (_) {}

        // 2. Busca por referências cruzadas (similares indexados via array-contains)
        if (qNorm.length >= 3) {
            try {
                const crossSnap = await db.collection(col)
                    .where('referenciasCruzadas', 'array-contains', qNorm)
                    .where('ativo', '==', true).limit(15).get();
                crossSnap.docs.forEach(d => addItem(d));
            } catch (_) {}
        }

        // 3. Busca por código ERP exato (numérico)
        if (/^\d+$/.test(query)) {
            try {
                const codeSnap = await db.collection(col)
                    .where('codigoErp', '==', query)
                    .limit(5).get();
                codeSnap.docs.forEach(d => addItem(d));
            } catch (_) {}
        }

        // 4. Busca por descrição (prefix) — complementa referência
        if (results.length < 15) {
            try {
                const descSnap = await db.collection(col)
                    .where('descNorm', '>=', qUp).where('descNorm', '<=', end)
                    .where('ativo', '==', true).limit(15).get();
                descSnap.docs.forEach(d => addItem(d));
            } catch (_) {
                try {
                    const descSnap2 = await db.collection(col)
                        .where('descricao', '>=', query).where('descricao', '<=', query + '\uf8ff')
                        .where('ativo', '==', true).limit(10).get();
                    descSnap2.docs.forEach(d => addItem(d));
                } catch (_2) {}
            }
        }

        return results;
    }

    // ── Mapeamento Firestore product → ResultadoBusca ─────────
    function _mapFirestoreProduct(d, docId, filialId, queryNorm, queryClean) {
        const ref  = (d.referencia || '').toUpperCase();
        const refClean = (d.codigoNorm || ref.replace(/[\s\-\.\/]/g, ''));
        const desc = (d.descricao  || '').toUpperCase();
        const descClean = desc.replace(/[\s\-\.\/]/g, '');
        const aplicacao = (d.aplicacao || '').toUpperCase();
        const aplicacaoClean = aplicacao.replace(/[\s\-\.\/]/g, '');
        const cross = Array.isArray(d.referenciasCruzadas) ? d.referenciasCruzadas : [];

        // Novos campos tecnicos
        const equipamento    = (d.equipamento || '').trim();
        const similarGenuino = (d.similarGenuino || '').trim();
        const similar1       = (d.similar1 || '').trim();
        const similar2       = (d.similar2 || '').trim();
        const similar3       = (d.similar3 || '').trim();
        const similar4       = (d.similar4 || '').trim();
        const refFornecedor  = (d.refFornecedor || '').trim();
        const fotoProduto    = (d.fotoProduto || '').trim();
        const fonte          = (d.fonte || '').trim();
        const statusPesquisa = (d.statusPesquisa || '').trim();

        const simGenuinoClean = similarGenuino.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim1Clean       = similar1.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim2Clean       = similar2.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim3Clean       = similar3.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const sim4Clean       = similar4.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const refFornClean    = refFornecedor.toUpperCase().replace(/[\s\-\.\/]/g, '');

        let tipoMatch = 'descricao';
        let motivoMatch = 'Encontrado por descricao';
        let rank = 70;

        if (refClean === queryClean || ref === queryNorm) {
            tipoMatch = 'exato';
            motivoMatch = 'Codigo Exato';
            rank = 100;
        } else if (simGenuinoClean && (simGenuinoClean === queryClean || simGenuinoClean === queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Similar Genuino / OEM (' + similarGenuino + ')';
            rank = 98;
        } else if ([sim1Clean, sim2Clean, sim3Clean, sim4Clean].filter(Boolean).includes(queryClean)) {
            tipoMatch = 'similar';
            motivoMatch = 'Peca Similar de Mercado';
            rank = 96;
        } else if (refFornClean && (refFornClean === queryClean || refFornClean === queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Ref. Fornecedor (' + refFornecedor + ')';
            rank = 95;
        } else if (cross.includes(queryClean)) {
            tipoMatch = 'similar';
            motivoMatch = 'Similar / Ref. Cruzada (' + (queryNorm || queryClean) + ')';
            rank = 94;
        } else if (refClean.startsWith(queryClean) || ref.startsWith(queryNorm)) {
            tipoMatch = 'exato';
            motivoMatch = 'Prefixo do Codigo';
            rank = 90;
        } else if (aplicacaoClean.includes(queryClean) || aplicacao.includes(queryNorm)) {
            tipoMatch = 'similar';
            motivoMatch = 'Codigo citado na Aplicacao Tecnica';
            rank = 88;
        } else if (descClean.includes(queryClean) || desc.includes(queryNorm)) {
            tipoMatch = 'descricao';
            motivoMatch = 'Descricao do produto';
            rank = 75;
        }

        return {
            _firestoreId:         docId,
            erpProdutoId:         d.codigoErp || null,
            erpProdutoDesc:       (d.descricao || d.descPdv || '').trim(),
            erpCodigoFab:         (d.referencia || '').trim(),
            erpCodigoOriginal:    (d.referencia || '').trim(),
            erpGrupo:             (d.grupo || '').trim(),
            erpSubGrupo:          '',
            fabricante:           (d.fabricante || d.marca || '').trim(),
            marca:                (d.marca || d.fabricante || '').trim(),
            fabricanteId:         null,
            unidade:              d.unidade || d.un || 'UN',
            aplicacao:            (d.aplicacao || '').trim(),
            equipamento:          equipamento,
            similarGenuino:       similarGenuino,
            similar1:             similar1,
            similar2:             similar2,
            similar3:             similar3,
            similar4:             similar4,
            refFornecedor:        refFornecedor,
            fotoProduto:          fotoProduto,
            fonte:                fonte,
            statusPesquisa:       statusPesquisa,
            referenciasCruzadas:  cross,
            tipoMatch:            tipoMatch,
            motivoMatch:          motivoMatch,
            localizador:          '',
            ean:                  (d.barcode || '').trim(),
            estoqueFilial:        Number(d.estoque || 0),
            estoqueOutrasFiliais: [],
            estoqueTotal:         Number(d.estoque || 0),
            preco:                Number(d.preco || 0),
            valorAtacado:         0,
            valorCusto:           0,
            confidencia:          'erp',
            parteMestreId:        null,
            _temEstoque:          Number(d.estoque || 0) > 0,
            _temEstoqueOutro:     false,
            _source:              'firestore',
            _rank:                rank,
        };
    }

    async function _searchErpByRef(query, filialId) {
        const adapter = _getAdapter();
        const normRef = DemandaImport ? DemandaImport.normalizeRef(query) : query.toUpperCase().replace(/[\s\-\.\/]/g, '');
        const headers = await adapter._authHeaders();
        const results = [];

        // Maxdata GET /product aceita: codigoFab, codigoBarras (barcode) e descricao (texto)
        const attempts = [
            adapter._buildUrl('product', { codigoFab: query.trim(), limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { codigoFab: normRef, limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { codigoBarras: normRef, limit: 15, sincronizacao: true }),
            adapter._buildUrl('product', { codigoBarras: query.toUpperCase(), limit: 15, sincronizacao: true }),
            adapter._buildUrl('product', { descricao: normRef, limit: 30, sincronizacao: true }),
            adapter._buildUrl('product', { descricao: query, limit: 30, sincronizacao: true }),
        ];

        for (const url of attempts) {
            try {
                const resp  = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const data  = await resp.json();
                const items = Array.isArray(data) ? data : (data.docs || data.data || []);
                for (const item of items) {
                    const fab = (item.codigoFab || item.codigoOriginal || '').toUpperCase().replace(/[\s\-\.\/]/g, '');
                    const app = (item.aplicacao || '').toUpperCase().replace(/[\s\-\.\/]/g, '');
                    const desc = (item.descricao || '').toUpperCase().replace(/[\s\-\.\/]/g, '');

                    let matchType = null;
                    let matchMotivo = '';
                    if (fab === normRef || fab.includes(normRef) || normRef.includes(fab)) {
                        matchType = (fab === normRef) ? 'exato' : 'exato';
                        matchMotivo = 'Código correspondente no ERP';
                    } else if (app.includes(normRef)) {
                        matchType = 'similar';
                        matchMotivo = 'Similar encontrado na aplicação do produto (' + query + ')';
                    } else if (desc.includes(normRef)) {
                        matchType = 'descricao';
                        matchMotivo = 'Código na descrição';
                    }

                    if (matchType) {
                        results.push(_mapErpProduct(item, filialId, matchType, matchMotivo));
                    }
                }
                if (results.length === 0 && items.length > 0) {
                    items.slice(0, 5).forEach(item => results.push(_mapErpProduct(item, filialId, 'descricao', 'Busca aproximada')));
                }
                if (results.length > 0) break;
            } catch (_) { continue; }
        }

        return results;
    }

    // ── Busca por EAN ─────────────────────────────────────────
    async function _searchErpByEAN(ean, filialId) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl(`product/ean/${ean}`);
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return [];
        const data  = await resp.json();
        const items = Array.isArray(data) ? data : [data];
        return items.filter(Boolean).map(i => _mapErpProduct(i, filialId));
    }

    // ── Busca textual no ERP ──────────────────────────────────
    async function _searchErpByText(query, filialId, limit = 25) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl('product', { descricao: query, limit, sincronizacao: true });
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return [];
        const data  = await resp.json();
        const items = Array.isArray(data) ? data : (data.docs || data.data || []);
        return items.map(i => _mapErpProduct(i, filialId));
    }

    // ── Busca na base técnica ─────────────────────────────────
    async function _searchTechbase(query, filialId) {
        if (typeof firebase === 'undefined') return [];

        const db  = firebase.firestore();
        const ref = DemandaImport ? DemandaImport.normalizeRef(query) : query.toUpperCase();
        const results = [];

        // Busca por referência normalizada na coleção references
        const refsSnap = await db.collection(`${TECHBASE}/references`)
            .where('refNorm', '==', ref)
            .limit(10)
            .get();

        for (const doc of refsSnap.docs) {
            const r = doc.data();
            results.push({
                parteMestreId:   r.parteMestreId,
                erpProdutoId:    r.erpProdutoId || null,
                erpProdutoDesc:  r.descricao || '',
                erpCodigoFab:    r.ref,
                fabricante:      r.fabricante || '',
                confidencia:     r.confidencia || 'sugerida',
                estoqueFilial:   null, // será buscado sob demanda
                _rank:           _rankByConfianca(r.confidencia),
                _isTechbase:     true,
            });
        }

        return results;
    }

    function _rankByConfianca(c) {
        const ranks = { oficial: 95, catalogo: 85, confirmada: 80, historica: 70, sugerida: 55, pendente: 40 };
        return ranks[c] || 50;
    }

    // ── Mapeamento de produto ERP → ResultadoBusca ────────────
    function _mapErpProduct(raw, filialId, tipoMatch = 'exato', motivoMatch = 'Encontrado no ERP') {
        // Extrai estoque da filial solicitada via multiloja[]
        const multiloja  = raw.multiloja || [];
        const filialData = multiloja.find(f => f.empId === filialId) || multiloja[0] || {};
        const estoqueFilial = Number(filialData.qtde ?? filialData.estoque ?? raw.qtde ?? 0);

        // Estoque em outras filiais
        const outrasFiliaisMap = {
            1: 'CTR MATRIZ PALMAS ATACADO',
            2: 'CTR FILIAL PALMAS VAREJO',
            4: 'CTR PORTO VAREJO',
            5: 'CTR REDENÇÃO',
        };

        const estoqueOutrasFiliais = multiloja
            .filter(f => f.empId !== filialId)
            .map(f => ({
                empId:   f.empId,
                nome:    outrasFiliaisMap[f.empId] || `Filial ${f.empId}`,
                estoque: Number(f.estoque ?? 0),
                preco:   Number(f.valorVenda ?? 0),
            }));

        // Preço: prefere preço da filial via multiloja, fallback no produto
        const preco = Number(
            filialData.valorVenda ??
            raw.valorVenda ??
            raw.valorAtacado ??
            raw.valorCusto ??
            0
        );

        // Barcodes: codBarras é array no schema Maxdata
        const barcodes = Array.isArray(raw.codBarras) ? raw.codBarras.join(', ') : (raw.codBarras || '');

        // Extrai referências cruzadas da aplicação e descrição
        const cross = new Set();
        if (raw.codigoFab) cross.add(String(raw.codigoFab).toUpperCase().replace(/[\s\-\.\/]/g, ''));
        if (raw.codigoOriginal) cross.add(String(raw.codigoOriginal).toUpperCase().replace(/[\s\-\.\/]/g, ''));
        const textTokens = ((raw.aplicacao || '') + ' ' + (raw.descricao || '')).toUpperCase().split(/[\s,;\/\+\|]+/);
        for (const tok of textTokens) {
            const clean = tok.replace(/[\s\-\.\/]/g, '');
            if (clean.length >= 3 && /\d/.test(clean)) cross.add(clean);
        }

        return {
            erpProdutoId:         raw.id,
            erpProdutoDesc:       (raw.descricao || raw.descPdv || '').trim(),
            erpCodigoFab:         (raw.codigoFab  || raw.codigoOriginal || '').trim(),
            erpCodigoOriginal:    (raw.codigoOriginal || '').trim(),
            erpGrupo:             (raw.grupo    || '').trim(),
            erpSubGrupo:          (raw.subGrupo || '').trim(),
            fabricante:           (raw.fabricante || '').trim(),
            fabricanteId:         raw.fabricanteId || null,
            unidade:              raw.un || 'UN',
            aplicacao:            (raw.aplicacao || '').trim(),    // equipamento compatível / referências
            referenciasCruzadas:  Array.from(cross),
            tipoMatch:            tipoMatch,
            motivoMatch:          motivoMatch,
            localizador:          (raw.localizador || raw.prateleira || '').trim(),
            ean:                  barcodes,
            estoqueFilial,
            estoqueOutrasFiliais,
            estoqueTotal:         Number(raw.estoque ?? 0),
            preco,
            valorAtacado:         Number(raw.valorAtacado ?? 0),
            valorCusto:           Number(raw.valorCusto ?? 0),
            confidencia:          'erp',
            parteMestreId:        null,
            _temEstoque:          estoqueFilial > 0,
            _temEstoqueOutro:     estoqueOutrasFiliais.some(f => f.estoque > 0),
            _source:              'erp',
        };
    }

    // ── Busca de detalhes de produto ERP (com estoque atualizado) ──
    /**
     * Busca dados completos de um produto ERP por ID.
     * Não usa cache — sempre busca em tempo real (estoque pode mudar).
     */
    async function getProductDetails(erpProdutoId, filialId = 1) {
        const adapter = _getAdapter();
        const headers = await adapter._authHeaders();
        const url     = adapter._buildUrl(`product/${erpProdutoId}`);
        const resp    = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`Produto #${erpProdutoId}: HTTP ${resp.status}`);
        const raw = await resp.json();
        return _mapErpProduct(raw, filialId);
    }

    // ── Busca de clientes ──────────────────────────────────────
    /**
     * Busca clientes. Usa Firestore (DemandaClientes) como fonte primária.
     * Fallback: sessionStorage (sincronização legada).
     */
    async function searchClients(query) {
        const q = (query || '').trim();
        if (q.length < 2) return [];

        // PRIMÁRIO: Firestore via DemandaClientes (767 clientes sincronizados)
        if (typeof DemandaClientes !== 'undefined') {
            try {
                const fsClients = await DemandaClientes.buscar(q);
                if (fsClients.length > 0) return fsClients.slice(0, 15);
            } catch (_) {}
        }

        // FALLBACK: sessionStorage (legado)
        let clients = [];
        try {
            const ss = sessionStorage.getItem('_erp_clients_maxdata');
            if (ss) clients = JSON.parse(ss);
        } catch (_) {}

        if (clients.length === 0 && typeof Utils !== 'undefined' && Utils.getStorage) {
            clients = Utils.getStorage('clients') || [];
        }

        const qLow = q.toLowerCase();
        return clients.filter(c => {
            const nome     = (c.nome || '').toLowerCase();
            const fantasia = (c.fantasia || c.nomeFantasia || '').toLowerCase();
            const cnpj     = (c.cnpj || c.documento || '').replace(/\D/g, '');
            return nome.includes(qLow) || fantasia.includes(qLow) || cnpj.includes(qLow);
        }).slice(0, 15);
    }

    // ── Listar todos os produtos da base compacta integrada ──
    function getProdutos() {
        if (typeof window !== 'undefined' && Array.isArray(window.COMPACT_SKUS)) {
            return window.COMPACT_SKUS.map(s => {
                var codErp = String(s[0] || '');
                var codFab = String(s[38] || '');
                var prcData = _getErpPrice(codErp, codFab, s);
                var precoVenda = Number(prcData.v || 0);
                var custo = Number(prcData.c || s[11] || 0);
                return {
                    codigo: codErp,
                    erpProdutoId: codErp,
                    referencia: codFab || codErp,
                    codigoFab: codFab,
                    descricao: String(s[1] || ''),
                    marca: String(s[2] || ''),
                    estoque: Number(s[10] != null ? s[10] : (s[9] || 0)),
                    preco: precoVenda,
                    precoUnitario: precoVenda,
                    precoVenda: precoVenda,
                    valorVenda: precoVenda,
                    valorAtacado: Number(prcData.a || precoVenda),
                    custo: custo,
                    valorCusto: custo
                };
            });
        }
        return [];
    }

    // ── Limpar cache ──────────────────────────────────────────
    function clearCache() { _cache.clear(); }

    return {
        search,
        smartMatch,
        addConcorrenteMapping,
        getConcorrenteMappings: _getConcorrenteMappings,
        getProductDetails,
        getProdutos,
        searchClients,
        clearCache,
        getAdapter: _getAdapter,   // exposto para DemandaLookup.syncMaxdataToTechbase
    };

})();

if (typeof window !== 'undefined') window.DemandaSearch = DemandaSearch;

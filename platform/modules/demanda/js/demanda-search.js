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
    };

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
            const preco = Number(s[11] || 0);
            const codFab = String(s[38] || '');
            const crossRef = String(s[39] || '');

            const fabNorm = codFab.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const crossNorm = crossRef.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const descNorm = desc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');

            let score = 0;
            let tipoMatch = '';

            // 1. Código Fabricante Exato
            if (fabNorm && fabNorm === qNorm) {
                score = 100;
                tipoMatch = 'fab_exato';
            } else if (codErp === q || (qNorm.length >= 2 && codErp === qNorm)) {
                score = 99;
                tipoMatch = 'erp_exato';
            } else if (qNorm.length >= 3 && crossNorm.includes(qNorm)) {
                score = 96;
                tipoMatch = 'cross_ref';
            } else if (fabNorm && (fabNorm.startsWith(qNorm) || (qNorm.length >= 4 && qNorm.startsWith(fabNorm)))) {
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
                    preco: preco,
                    precoVenda: preco,
                    valorVenda: preco,
                    custo: Number(s[11] || 0),
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
     * combinando referência de fábrica, código de concorrente, dimensões e termos agrícolas.
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

        var refClean  = String(refOrig || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        var descClean = String(descOrig || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        var descUpper = String(descOrig || '').toUpperCase();
        var skus = window.COMPACT_SKUS;

        // 1. Mapeamento direto de Código de Concorrente (ex: J.A. Agrícola -> Central Peças)
        var mapConcorrente = _getConcorrenteMappings();
        var targetCode = null;
        if (refClean && (mapConcorrente[refClean] || mapConcorrente[refOrig.trim()])) {
            targetCode = mapConcorrente[refClean] || mapConcorrente[refOrig.trim()];
        }
        if (targetCode) {
            var targetClean = String(targetCode).toUpperCase().replace(/[^A-Z0-9]/g, '');
            for (var mIdx = 0; mIdx < skus.length; mIdx++) {
                var sm = skus[mIdx];
                var smErp = String(sm[0] || '');
                var smFab = String(sm[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var smCross = String(sm[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (smFab === targetClean || smErp === targetCode || smCross.indexOf(targetClean) >= 0) {
                    var estqM = Number(sm[10] != null ? sm[10] : (sm[9] || 0));
                    var prcM  = Number(sm[11] || 0);
                    return {
                        erpProdutoId:   smErp,
                        codigoErp:      smErp,
                        referencia:     sm[38] || smErp,
                        erpCodigoFab:   sm[38] || smErp,
                        codigoFab:      sm[38] || '',
                        descricao:      sm[1],
                        erpProdutoDesc: sm[1],
                        marca:          sm[2] || '',
                        fabricante:     sm[2] || '',
                        estoqueFilial:  estqM,
                        saldoEstoque:   estqM,
                        preco:          prcM,
                        precoUnitario:  prcM,
                        status:         estqM > 0 ? 'estoque_disponivel' : 'sem_estoque',
                        score:          100,
                        tipoMatch:      'concorrente_map',
                        confidencia:    'alta',
                        _rawSku:        sm
                    };
                }
            }
        }

        // 2. Busca por Código de Fabricante ou CrossRef Exato
        if (refClean && refClean.length >= 3) {
            for (var i = 0; i < skus.length; i++) {
                var s = skus[i];
                var fabC = String(s[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                var erpC = String(s[0] || '');
                var crossC = String(s[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

                if (refClean === fabC || refClean === erpC) {
                    var estq = Number(s[10] != null ? s[10] : (s[9] || 0));
                    var prc = Number(s[11] || 0);
                    return {
                        erpProdutoId:   erpC,
                        codigoErp:      erpC,
                        referencia:     s[38] || erpC,
                        erpCodigoFab:   s[38] || erpC,
                        codigoFab:      s[38] || '',
                        descricao:      s[1],
                        erpProdutoDesc: s[1],
                        marca:          s[2] || '',
                        fabricante:     s[2] || '',
                        estoqueFilial:  estq,
                        saldoEstoque:   estq,
                        preco:          prc,
                        precoUnitario:  prc,
                        status:         estq > 0 ? 'estoque_disponivel' : 'sem_estoque',
                        score:          100,
                        tipoMatch:      'fab_exato',
                        confidencia:    'alta',
                        _rawSku:        s
                    };
                }
                if (refClean.length >= 4 && crossC.indexOf(refClean) >= 0) {
                    var estqC = Number(s[10] != null ? s[10] : (s[9] || 0));
                    var prcC = Number(s[11] || 0);
                    return {
                        erpProdutoId:   erpC,
                        codigoErp:      erpC,
                        referencia:     s[38] || erpC,
                        erpCodigoFab:   s[38] || erpC,
                        codigoFab:      s[38] || '',
                        descricao:      s[1],
                        erpProdutoDesc: s[1],
                        marca:          s[2] || '',
                        fabricante:     s[2] || '',
                        estoqueFilial:  estqC,
                        saldoEstoque:   estqC,
                        preco:          prcC,
                        precoUnitario:  prcC,
                        status:         estqC > 0 ? 'estoque_disponivel' : 'sem_estoque',
                        score:          98,
                        tipoMatch:      'cross_ref',
                        confidencia:    'alta',
                        _rawSku:        s
                    };
                }
            }
        }

        // 3. Extração de Código Embutido na Descrição (ex: "BLINDAGEM DA LINHA KK34847", "MOLA AX10319", "ROLAMENTO PF110415", "HXE168052")
        var tokensDesc = descUpper.match(/[A-Z0-9\/\-\.]{4,}/g) || [];
        for (var t = 0; t < tokensDesc.length; t++) {
            var tokC = tokensDesc[t].replace(/[^A-Z0-9]/g, '');
            // Se possui dígitos e letras (código alfanumérico)
            if (tokC.length >= 4 && !/^[A-Z]+$/.test(tokC) && !/^[0-9]+$/.test(tokC)) {
                for (var j = 0; j < skus.length; j++) {
                    var sj = skus[j];
                    var fabJ = String(sj[38] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    var crossJ = String(sj[39] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (tokC === fabJ || (tokC.length >= 5 && crossJ.indexOf(tokC) >= 0)) {
                        var estqJ = Number(sj[10] != null ? sj[10] : (sj[9] || 0));
                        var prcJ = Number(sj[11] || 0);
                        return {
                            erpProdutoId:   String(sj[0] || ''),
                            codigoErp:      String(sj[0] || ''),
                            referencia:     sj[38] || String(sj[0] || ''),
                            erpCodigoFab:   sj[38] || String(sj[0] || ''),
                            codigoFab:      sj[38] || '',
                            descricao:      sj[1],
                            erpProdutoDesc: sj[1],
                            marca:          sj[2] || '',
                            fabricante:     sj[2] || '',
                            estoqueFilial:  estqJ,
                            saldoEstoque:   estqJ,
                            preco:          prcJ,
                            precoUnitario:  prcJ,
                            status:         estqJ > 0 ? 'estoque_disponivel' : 'sem_estoque',
                            score:          95,
                            tipoMatch:      'codigo_na_descricao',
                            confidencia:    'alta',
                            _rawSku:        sj
                        };
                    }
                }
            }
        }

        // 4. Detecção de Dimensões de Fixadores (ex: "12 X 160" -> "M12X160", "12 X 40" -> "19M7791" / "M12X40", "8X55" -> "PS8X55")
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
                    // Se a descrição do documento tem "FLANGEADO" / "FLANG", prefere parafuso flangeado (19M7791)
                    if (descUpper.indexOf('FLANG') >= 0 && String(sd[1] || '').toUpperCase().indexOf('FLANG') < 0) {
                        continue;
                    }
                    var estqD = Number(sd[10] != null ? sd[10] : (sd[9] || 0));
                    var prcD = Number(sd[11] || 0);
                    return {
                        erpProdutoId:   String(sd[0] || ''),
                        codigoErp:      String(sd[0] || ''),
                        referencia:     sd[38] || String(sd[0] || ''),
                        erpCodigoFab:   sd[38] || String(sd[0] || ''),
                        codigoFab:      sd[38] || '',
                        descricao:      sd[1],
                        erpProdutoDesc: sd[1],
                        marca:          sd[2] || '',
                        fabricante:     sd[2] || '',
                        estoqueFilial:  estqD,
                        saldoEstoque:   estqD,
                        preco:          prcD,
                        precoUnitario:  prcD,
                        status:         estqD > 0 ? 'estoque_disponivel' : 'sem_estoque',
                        score:          94,
                        tipoMatch:      'dimensao_fixador',
                        confidencia:    'alta',
                        _rawSku:        sd
                    };
                }
            }
        }

        // 5. Casos de Porcas Auto-Travantes / Parlock com Diâmetro (ex: "PORCA A/TRAV MA 20", "PORCA 12MM MA PRESSAO")
        var isPorcaTrav = descUpper.indexOf('PORCA') >= 0 && (descUpper.indexOf('TRAV') >= 0 || descUpper.indexOf('PRESS') >= 0 || descUpper.indexOf('FREN') >= 0);
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
                        var estqP = Number(sp[10] != null ? sp[10] : (sp[9] || 0));
                        var prcP = Number(sp[11] || 0);
                        return {
                            erpProdutoId:   String(sp[0] || ''),
                            codigoErp:      String(sp[0] || ''),
                            referencia:     sp[38] || String(sp[0] || ''),
                            erpCodigoFab:   sp[38] || String(sp[0] || ''),
                            codigoFab:      sp[38] || '',
                            descricao:      sp[1],
                            erpProdutoDesc: sp[1],
                            marca:          sp[2] || '',
                            fabricante:     sp[2] || '',
                            estoqueFilial:  estqP,
                            saldoEstoque:   estqP,
                            preco:          prcP,
                            precoUnitario:  prcP,
                            status:         estqP > 0 ? 'estoque_disponivel' : 'sem_estoque',
                            score:          93,
                            tipoMatch:      'porca_travante',
                            confidencia:    'alta',
                            _rawSku:        sp
                        };
                    }
                }
            }
        }

        // 6. Normalização e Expansão de Sinônimos Agrícolas
        // (LE -> ESQUERDO, LD -> DIREITO, CAL -> CALIBRADORA, CUBRIDORA -> COBRIDORA, etc.)
        var expDesc = descUpper
            .replace(/\bLE\b/g, 'ESQUERDO')
            .replace(/\bLD\b/g, 'DIREITO')
            .replace(/\bSEX\b|\bSEXT\b|\bSX\b/g, 'SEXTAVADO')
            .replace(/\bCAL\b/g, 'CALIBRADORA')
            .replace(/\bCUBRIDORA\b/g, 'COBRIDORA')
            .replace(/\bFLANG\b/g, 'FLANGEADO');

        var expWords = expDesc.split(/[^A-Z0-9]+/).filter(function(w) { return w.length >= 3; });
        var bestSku = null;
        var bestScore = 0;
        var bestMatch = '';

        for (var k = 0; k < skus.length; k++) {
            var sk = skus[k];
            var skDesc = String(sk[1] || '').toUpperCase();
            var skDescClean = skDesc.replace(/[^A-Z0-9]/g, '');

            // Descrição idêntica à expandida
            if (skDescClean === expDesc.replace(/[^A-Z0-9]/g, '') || skDescClean === descClean) {
                var estqK = Number(sk[10] != null ? sk[10] : (sk[9] || 0));
                var prcK = Number(sk[11] || 0);
                return {
                    erpProdutoId:   String(sk[0] || ''),
                    codigoErp:      String(sk[0] || ''),
                    referencia:     sk[38] || String(sk[0] || ''),
                    erpCodigoFab:   sk[38] || String(sk[0] || ''),
                    codigoFab:      sk[38] || '',
                    descricao:      sk[1],
                    erpProdutoDesc: sk[1],
                    marca:          sk[2] || '',
                    fabricante:     sk[2] || '',
                    estoqueFilial:  estqK,
                    saldoEstoque:   estqK,
                    preco:          prcK,
                    precoUnitario:  prcK,
                    status:         estqK > 0 ? 'estoque_disponivel' : 'sem_estoque',
                    score:          92,
                    tipoMatch:      'desc_exata_expandida',
                    confidencia:    'alta',
                    _rawSku:        sk
                };
            }

            // Confronto de palavras-chave agrícolas
            if (expWords.length >= 2) {
                var matchedWords = 0;
                for (var w = 0; w < expWords.length; w++) {
                    if (skDesc.indexOf(expWords[w]) >= 0) matchedWords++;
                }
                var ratio = matchedWords / expWords.length;
                if (ratio >= 0.70 && matchedWords >= 2) {
                    var sScore = 75 + Math.round(ratio * 15);
                    if (sScore > bestScore) {
                        bestScore = sScore;
                        bestSku = sk;
                        bestMatch = 'palavras_expandidas (' + matchedWords + '/' + expWords.length + ')';
                    }
                }
            }
        }

        if (bestSku && bestScore >= 80) {
            var estqB = Number(bestSku[10] != null ? bestSku[10] : (bestSku[9] || 0));
            var prcB = Number(bestSku[11] || 0);
            return {
                erpProdutoId:   String(bestSku[0] || ''),
                codigoErp:      String(bestSku[0] || ''),
                referencia:     bestSku[38] || String(bestSku[0] || ''),
                erpCodigoFab:   bestSku[38] || String(bestSku[0] || ''),
                codigoFab:      bestSku[38] || '',
                descricao:      bestSku[1],
                erpProdutoDesc: bestSku[1],
                marca:          bestSku[2] || '',
                fabricante:     bestSku[2] || '',
                estoqueFilial:  estqB,
                saldoEstoque:   estqB,
                preco:          prcB,
                precoUnitario:  prcB,
                status:         estqB > 0 ? 'estoque_disponivel' : 'sem_estoque',
                score:          bestScore,
                tipoMatch:      bestMatch,
                confidencia:    bestScore >= 90 ? 'alta' : 'media',
                _rawSku:        bestSku
            };
        }

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
            return window.COMPACT_SKUS.map(s => ({
                codigo: String(s[0]),
                erpProdutoId: String(s[0]),
                referencia: String(s[38] || s[0]),
                codigoFab: String(s[38] || ''),
                descricao: String(s[1]),
                marca: String(s[2] || ''),
                estoque: Number(s[10] != null ? s[10] : (s[9] || 0)),
                preco: Number(s[11] || 0)
            }));
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

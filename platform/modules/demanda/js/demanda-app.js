/* demanda-app.js — Controlador Principal | Inteligência de Demanda v1.1.0
 * Parreira Sistemas
 * Fase 2: salvarDemanda, filterDemandas, addItemGrade, clienteDropdown, toast
 */
"use strict";

const DemandaApp = (function() {

    // ── Mapeamento views → nav-item IDs ──────────────────────
    var _VIEWS = {
        captura:       "nav-captura",
        lista:         "nav-lista",
        pesquisa:      "nav-pesquisa",
        compras:       "nav-compras",
        clientes:      'nav-clientes',
        dashboard:     "nav-dashboard",
        relatorios:    "nav-relatorios",
        orcamento:     "nav-orcamento",
        concorrente:   "nav-concorrente",
        base:          "nav-base",
        integracaoErp: "nav-integracaoErp"
    };

    // ── Estado global ─────────────────────────────────────────
    var _itens             = [];      // Itens da demanda em andamento
    var _clienteAtual      = null;
    var _concClientesCache = [];
    var _concClienteSelecionado = null;    // { id, nome, cnpj } | null
    var _sessao            = null;    // Cache ParreiraAuth.getSessao()
    var _demandaAtual      = null;    // { id, data, itens } — demanda aberta no modal de detalhe
    var _erpInitialized    = false;
    var _searchTimeout     = null;
    var _searchResultsCache = [];     // Cache dos últimos resultados da busca
    var _filterAtual       = "todas";
    var _clientesCache     = [];      // Lista de clientes para o dropdown
    var _importItensTemp   = [];      // Itens parsed aguardando conferência
    var _excelItensTemp    = [];      // Itens do Excel antes de confirmar
    var _relatorioAtualTab = "perdas"; // Aba ativa nos relatórios: perdas, faltas, novos, performance
    var _relatorioDataCache = null;    // Cache dos dados do relatório

    // ════════════════════════════════════════════════════════
    // NAVEGAÇÃO DE VIEWS
    // ════════════════════════════════════════════════════════

    function switchView(v) {
        if (!_VIEWS[v]) { console.warn("[DemandaApp] View desconhecida:", v); return; }
        document.querySelectorAll("[id^='view-']").forEach(function(el) { el.style.display = "none"; });
        document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
        var ve = document.getElementById("view-" + v); if (ve) ve.style.display = "";
        var ne = document.getElementById(_VIEWS[v]); if (ne) ne.classList.add("active");
        if (v === "integracaoErp") _initErpUI();
        if (v === "clientes")      _initClientes();
        if (v === "lista")         loadDemandasLista(_filterAtual);
        if (v === "dashboard")     loadDashboard();
        if (v === "relatorios")    loadRelatorios();
        if (v === "compras")       loadFilaCompras();
        if (v === "orcamento")     loadOrcamento();
        if (v === "concorrente")   loadConcorrente();
    }

    // ════════════════════════════════════════════════════════
    // ERP UI & CLIENTES
    // ════════════════════════════════════════════════════════

    function _initErpUI() {
        if (_erpInitialized) return;
        if (typeof ErpUI === "undefined") {
            var c = document.getElementById("erp-config-container");
            if (c) c.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'><p>ErpUI nao carregado. Verifique os scripts.</p></div>";
            return;
        }
        ErpUI.init("demanda");
        _erpInitialized = true;
        console.log("[DemandaApp] ErpUI inicializado.");
    }

    function _initClientes() {
        if (typeof DemandaClientes === 'undefined') {
            var c = document.getElementById('view-clientes-content');
            if (c) c.innerHTML = '<p style="color:var(--text-secondary);padding:2rem">Módulo de clientes não carregado.</p>';
            return;
        }
        DemandaClientes.renderView('view-clientes-content');
    }

    // ════════════════════════════════════════════════════════
    // PESQUISA UNIVERSAL (coluna esquerda)
    // ════════════════════════════════════════════════════════

    function onSearchInput(value) {
        clearTimeout(_searchTimeout);
        var b = document.getElementById("searchClear");
        if (b) b.style.display = value.length > 0 ? "flex" : "none";
        var r = document.getElementById("searchResults");
        if (!r) return;
        if (value.length < 2) {
            r.innerHTML = "";
            var ph = document.getElementById("searchPlaceholder");
            if (ph) r.appendChild(ph);
            return;
        }

        r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Pesquisando no ERP e na base técnica...</p></div>";

        _searchTimeout = setTimeout(function() {
            if (typeof DemandaSearch === "undefined") {
                r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'><p>DemandaSearch não disponível.</p></div>";
                return;
            }

            var filialId = (_sessao && _sessao.filialId) ? Number(_sessao.filialId) : 1;
            DemandaSearch.search(value, { filialId: filialId, limit: 30 })
                .then(function(results) {
                    _searchResultsCache = results || [];
                    if (_searchResultsCache.length === 0) {
                        r.innerHTML = "<div style='padding:2.5rem;text-align:center;color:var(--text-secondary)'>" +
                            "<span class='material-icons-round' style='font-size:2.5rem;opacity:.3'>search_off</span>" +
                            "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Nenhum produto localizado</h4>" +
                            "<p style='font-size:.82rem'>Você pode adicionar como item provisório pela grade à direita.</p></div>";
                        return;
                    }

                    var html = "<div style='display:flex;flex-direction:column;gap:.75rem;padding:.5rem'>";
                    _searchResultsCache.forEach(function(item, idx) {
                        var stk = Number(item.estoqueFilial !== undefined ? item.estoqueFilial : (item.estoque || 0));
                        var prc = Number(item.preco || 0);
                        var stkBadge = stk > 0
                            ? "<span class='badge' style='background:rgba(16,185,129,.15);color:#10b981'><span class='material-icons-round' style='font-size:.7rem'>check_circle</span> Em Estoque (" + stk + ")</span>"
                            : "<span class='badge' style='background:rgba(239,68,68,.15);color:#ef4444'><span class='material-icons-round' style='font-size:.7rem'>inventory_2</span> Sem Estoque</span>";

                        var prcTxt = prc > 0 ? "R$ " + prc.toFixed(2).replace(".", ",") : "Consulte";
                        var fabTxt = item.fabricante ? "<span style='font-size:.75rem;color:var(--text-secondary)'>· " + _esc(item.fabricante) + "</span>" : "";

                        html += "<div class='search-result-card' style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:.9rem 1rem;display:flex;flex-direction:column;gap:.4rem'>" +
                            "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem'>" +
                            "<div><span style='font-weight:700;color:var(--primary-color);font-size:.9rem'>" + _esc(item.erpCodigoFab || item.referencia || item.erpProdutoId || "—") + "</span>" +
                            (item.erpProdutoId ? " <span style='font-size:.72rem;padding:.1rem .35rem;border-radius:4px;background:rgba(255,255,255,.07);color:var(--text-secondary)'>ERP #" + item.erpProdutoId + "</span>" : "") +
                            "</div>" +
                            "<div>" + stkBadge + "</div>" +
                            "</div>" +
                            "<div style='font-size:.85rem;color:var(--text-primary);line-height:1.3'>" + _esc(item.erpProdutoDesc || item.descricao || "—") + " " + fabTxt + "</div>" +
                            "<div style='display:flex;justify-content:space-between;align-items:center;margin-top:.4rem;padding-top:.4rem;border-top:1px solid rgba(255,255,255,.05)'>" +
                            "<span style='font-size:.92rem;font-weight:700;color:var(--accent-success)'>" + prcTxt + "</span>" +
                            "<button class='btn btn-primary btn-sm' onclick='DemandaApp.adicionarItemDaBusca(" + idx + ")' style='font-size:.78rem;padding:.3rem .75rem'>" +
                            "<span class='material-icons-round' style='font-size:.85rem'>add</span> Adicionar à Cotação</button>" +
                            "</div>" +
                            "</div>";
                    });
                    html += "</div>";
                    r.innerHTML = html;
                })
                .catch(function(err) {
                    console.error("[DemandaApp] Erro na busca:", err);
                    r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'><p>Erro ao pesquisar: " + _esc(err.message || err) + "</p></div>";
                });
        }, 300);
    }

    function adicionarItemDaBusca(idx) {
        var item = _searchResultsCache[idx];
        if (!item) return;

        var stk = Number(item.estoqueFilial !== undefined ? item.estoqueFilial : (item.estoque || 0));
        var prc = Number(item.preco || 0);

        _itens.push({
            refOriginal:     item.erpCodigoFab || item.referencia || item.erpProdutoId || '',
            descOriginal:    item.erpProdutoDesc || item.descricao || '',
            qtdeSolicitada:  1,
            erpProdutoId:    item.erpProdutoId ? String(item.erpProdutoId) : null,
            erpProdutoDesc:  item.erpProdutoDesc || item.descricao || '',
            erpCodigoFab:    item.erpCodigoFab || item.referencia || '',
            fabricante:      item.fabricante || '',
            estoqueFilial:   stk,
            estoque:         stk,
            preco:           prc,
            precoUnitario:   prc,
            unidade:         item.unidade || 'UN',
            confidencia:     item.confidencia || 'erp',
            status:          stk > 0 ? 'estoque_disponivel' : 'sem_estoque'
        });

        renderItens();
        _toast("Item adicionado: " + (item.erpCodigoFab || item.referencia || item.erpProdutoId), "success");
    }

    function clearSearch() {
        var i = document.getElementById("searchInput"); if (i) { i.value = ""; i.focus(); }
        var b = document.getElementById("searchClear"); if (b) b.style.display = "none";
        var r = document.getElementById("searchResults");
        if (r) {
            r.innerHTML = "";
            var ph = document.getElementById("searchPlaceholder");
            if (ph) r.appendChild(ph);
        }
    }

    function selectSearchResult(id) {
        console.log("[DemandaApp] selectSearchResult:", id);
    }

    // ════════════════════════════════════════════════════════
    // GRADE DE ENTRADA RÁPIDA (painel direito)
    // ════════════════════════════════════════════════════════

    function addItemGrade() {
        var refEl  = document.getElementById("gradeRef");
        var qtdeEl = document.getElementById("gradeQtde");
        if (!refEl || !refEl.value.trim()) { if (refEl) refEl.focus(); return; }

        var ref  = refEl.value.trim();
        var qtde = Math.max(1, parseInt((qtdeEl && qtdeEl.value) || "1", 10) || 1);

        var novo = { refOriginal: ref, descOriginal: "", qtdeSolicitada: qtde, status: "demanda_recebida" };
        _itens.push(novo);
        renderItens();

        refEl.value = "";
        if (qtdeEl) qtdeEl.value = "1";
        refEl.focus();

        _conciliarItensComEstoque([novo]).then(function() {
            renderItens();
        });
    }

    function onGradeKeydown(ev) {
        if (ev.key === "Enter") { ev.preventDefault(); addItemGrade(); }
    }

    function removeItem(idx) {
        if (idx < 0 || idx >= _itens.length) return;
        _itens.splice(idx, 1);
        renderItens();
    }

    function renderItens() {
        var tbody  = document.getElementById("itensTbody");
        var trEmpty = document.getElementById("trEmptyState");
        if (!tbody) return;

        if (_itens.length === 0) {
            tbody.innerHTML = "";
            if (trEmpty) tbody.appendChild(trEmpty);
            var ct = document.getElementById("demandaCodigoTopbar"); if (ct) ct.textContent = "";
            return;
        }

        var html = _itens.map(function(item, i) {
            var st = item.status || (Number(item.estoqueFilial || 0) > 0 ? "estoque_disponivel" : (item.erpProdutoId ? "sem_estoque" : "nao_cadastrado"));
            var badgeHtml = "";
            var stk = Number(item.estoqueFilial || 0);

            if (st === "estoque_disponivel") {
                badgeHtml = "<span style='font-size:.7rem;padding:.15rem .5rem;border-radius:6px;background:rgba(16,185,129,.15);color:#10b981;font-weight:600;display:inline-flex;align-items:center;gap:.25rem'><span class='material-icons-round' style='font-size:.75rem'>check_circle</span> Em Estoque (" + stk + ")</span>";
            } else if (st === "estoque_parcial") {
                badgeHtml = "<span style='font-size:.7rem;padding:.15rem .5rem;border-radius:6px;background:rgba(245,158,11,.15);color:#f59e0b;font-weight:600;display:inline-flex;align-items:center;gap:.25rem'><span class='material-icons-round' style='font-size:.75rem'>hourglass_bottom</span> Parcial (" + stk + "/" + item.qtdeSolicitada + ")</span>";
            } else if (st === "sem_estoque") {
                badgeHtml = "<span style='font-size:.7rem;padding:.15rem .5rem;border-radius:6px;background:rgba(234,179,8,.15);color:#eab308;font-weight:600;display:inline-flex;align-items:center;gap:.25rem' title='Cadastrado no ERP, porém sem saldo na filial'><span class='material-icons-round' style='font-size:.75rem'>inventory_2</span> Sem Estoque</span>";
            } else if (st === "catalogado") {
                badgeHtml = "<span style='font-size:.7rem;padding:.15rem .5rem;border-radius:6px;background:rgba(59,130,246,.15);color:#3b82f6;font-weight:600;display:inline-flex;align-items:center;gap:.25rem' title='Peça localizada na Base de Peças / Catálogo'><span class='material-icons-round' style='font-size:.75rem'>hub</span> Base de Peças</span>";
            } else {
                badgeHtml = "<span style='font-size:.7rem;padding:.15rem .5rem;border-radius:6px;background:rgba(239,68,68,.15);color:#ef4444;font-weight:600;display:inline-flex;align-items:center;gap:.25rem' title='Não encontrado no ERP'><span class='material-icons-round' style='font-size:.75rem'>help_outline</span> Não Cadastrado</span>";
            }

            var prc = Number(item.preco || item.precoUnitario || 0);
            var prcTxt = prc > 0 ? "<div style='font-size:.72rem;color:var(--accent-success);font-weight:600'>R$ " + prc.toFixed(2).replace(".",",") + "</div>" : "";
            var erpBadge = item.erpProdutoId ? " <span style='font-size:.65rem;color:var(--text-secondary);background:rgba(255,255,255,.07);padding:.1rem .35rem;border-radius:4px'>ERP #" + _esc(item.erpProdutoId) + "</span>" : "";

            return "<tr>" +
                "<td style='color:var(--text-secondary);font-size:.8rem'>" + (i + 1) + "</td>" +
                "<td style='font-weight:600;font-size:.83rem'>" + _esc(item.refOriginal) + erpBadge + prcTxt + "</td>" +
                "<td style='font-size:.8rem;color:var(--text-secondary)'>" + (_esc(item.erpProdutoDesc || item.descOriginal) || "—") + "</td>" +
                "<td style='text-align:center'>" + item.qtdeSolicitada + "</td>" +
                "<td>" + badgeHtml + "</td>" +
                "<td><button onclick='DemandaApp.removeItem(" + i + ")' title='Remover' " +
                    "style='background:none;border:none;color:var(--accent-danger);cursor:pointer;padding:.2rem'>" +
                    "<span class='material-icons-round' style='font-size:1rem'>close</span></button></td>" +
                "</tr>";
        }).join("");
        tbody.innerHTML = html;

        var ct = document.getElementById("demandaCodigoTopbar");
        if (ct) ct.textContent = "— " + _itens.length + (_itens.length === 1 ? " item" : " itens");
    }

    async function reavaliarEstoqueItens() {
        if (_itens.length === 0) { _toast("Adicione peças à cotação para checar.", "info"); return; }
        _toast("Cruzando peças com estoque do ERP e Base Técnica...", "info");
        await _carregarProdutosEEstoqueAsync(true);
        await _conciliarItensComEstoque(_itens);
        renderItens();
        _toast("Saldos e produtos atualizados com sucesso!", "success");
    }

    function limparDemanda() {
        if (_itens.length > 0 && !confirm("Limpar todos os itens da cotação?")) return;
        _itens = [];
        _clienteAtual = null;
        var cl = document.getElementById("clienteLabel"); if (cl) cl.textContent = "Selecionar cliente";
        var si = document.getElementById("selectOrigem"); if (si) si.value = "whatsapp";
        renderItens();
    }

    // ════════════════════════════════════════════════════════
    // SELEÇÃO E GERENCIAMENTO DE CLIENTES
    // ════════════════════════════════════════════════════════

    var _todosClientesCache      = null;   // Cache global normalizado em memória
    var _carregandoClientes      = false;  // Flag de requisição assíncrona


    // ════════════════════════════════════════════════════════
    // CACHE DE PRODUTOS & ESTOQUE DO ERP (COM AUTO-SYNC 5 MIN)
    // ════════════════════════════════════════════════════════

    var _todosProdutosCache = new Map(); // normalizado -> produto
    var _carregandoProdutos = false;

    function _normalizeKey(ref) {
        return (ref || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    function _extrairProdutosLocais() {
        var lista = [];
        try {
            var rawSession = sessionStorage.getItem("_erp_products_cache");
            if (rawSession) lista = JSON.parse(rawSession);
        } catch(e) {}
        if (!lista || lista.length === 0) {
            try {
                var rawLocal = localStorage.getItem("centralpecas_products_cache");
                if (rawLocal) lista = JSON.parse(rawLocal);
            } catch(e) {}
        }
        return Array.isArray(lista) ? lista : [];
    }

    async function _carregarProdutosEEstoqueAsync(forcar) {
        if (!forcar && _todosProdutosCache && _todosProdutosCache.size > 0) {
            return _todosProdutosCache;
        }

        // 1. Carrega imediatamente do cache local para resposta instantânea
        var locais = _extrairProdutosLocais();
        if (locais.length > 0 && _todosProdutosCache.size === 0) {
            locais.forEach(function(p) {
                var k = _normalizeKey(p.erpCodigoFab || p.referencia || p.codigoErp || p.codigoFab || p.id);
                if (k) _todosProdutosCache.set(k, p);
            });
            console.log("[DemandaApp] Produtos carregados do cache local:", _todosProdutosCache.size);
        }

        if (_carregandoProdutos) return _todosProdutosCache;
        _carregandoProdutos = true;

        try {
            var tenant = (_sessao && _sessao.tenantId) ? _sessao.tenantId : "centralpecas";
            var carregados = [];

            // A) Tenta Firestore tenants/{tenant}/demanda/techbase/products
            if (typeof firebase !== "undefined" && firebase.firestore) {
                try {
                    var db = firebase.firestore();
                    var snap = await db.collection("tenants/" + tenant + "/demanda/techbase/products").limit(1500).get();
                    if (!snap.empty) {
                        carregados = snap.docs.map(function(d) {
                            var dt = d.data();
                            dt._id = d.id;
                            return dt;
                        });
                    }
                } catch(e) { console.warn("[DemandaApp] Firestore techbase/products:", e); }
            }

            // B) Se tiver adapter ERP ativo, tenta carregar produtos sincronizados
            if (carregados.length === 0 && typeof ErpIntegration !== "undefined" && ErpIntegration.getActive) {
                try {
                    var adapter = ErpIntegration.getActive();
                    if (adapter && typeof adapter.syncProducts === "function") {
                        // Não bloqueia — carrega produtos se disponível
                    }
                } catch(e) {}
            }

            if (carregados.length > 0) {
                var listaCacheSalvar = [];
                carregados.forEach(function(p) {
                    var obj = {
                        erpProdutoId:   p.codigoErp || p.erpProdutoId || p.id || p._id,
                        erpProdutoDesc: (p.descricao || p.erpProdutoDesc || p.descPdv || "").trim(),
                        erpCodigoFab:   (p.referencia || p.codigoFab || p.erpCodigoFab || "").trim(),
                        fabricante:     (p.fabricante || "").trim(),
                        estoqueFilial:  Number(p.estoque !== undefined ? p.estoque : (p.estoqueFilial || 0)),
                        preco:          Number(p.preco || p.precoUnitario || 0),
                        unidade:        p.unidade || "UN"
                    };
                    var k = _normalizeKey(obj.erpCodigoFab || obj.erpProdutoId);
                    if (k) {
                        _todosProdutosCache.set(k, obj);
                        if (listaCacheSalvar.length < 1500) listaCacheSalvar.push(obj);
                    }
                });

                try {
                    sessionStorage.setItem("_erp_products_cache", JSON.stringify(listaCacheSalvar));
                    localStorage.setItem("centralpecas_products_cache", JSON.stringify(listaCacheSalvar.slice(0, 500)));
                } catch(e) {}
                console.log("[DemandaApp] Base de produtos e estoque sincronizada:", _todosProdutosCache.size);
            }
        } catch(err) {
            console.warn("[DemandaApp] Erro ao sincronizar catálogo de produtos:", err);
        } finally {
            _carregandoProdutos = false;
        }

        return _todosProdutosCache;
    }

    // ── Conciliação Automática de Itens com o Estoque e Base Técnica ────
    async function _conciliarItensComEstoque(itens) {
        if (!itens || itens.length === 0) return itens;

        if (_todosProdutosCache.size === 0) {
            await _carregarProdutosEEstoqueAsync();
        }

        for (var i = 0; i < itens.length; i++) {
            var item = itens[i];
            var refKey = _normalizeKey(item.refOriginal || item.erpCodigoFab);
            var prod = refKey ? _todosProdutosCache.get(refKey) : null;

            // Busca por prefixo/contém no cache se não encontrou exato
            if (!prod && refKey && refKey.length >= 4) {
                var entries = Array.from(_todosProdutosCache.entries());
                for (var j = 0; j < entries.length; j++) {
                    var k = entries[j][0];
                    if (k === refKey || k.indexOf(refKey) >= 0 || refKey.indexOf(k) >= 0) {
                        prod = entries[j][1];
                        break;
                    }
                }
            }

            if (prod) {
                item.erpProdutoId    = String(prod.erpProdutoId || "");
                item.erpProdutoDesc  = prod.erpProdutoDesc || item.descOriginal || "";
                item.erpCodigoFab    = prod.erpCodigoFab || item.refOriginal;
                item.fabricante      = prod.fabricante || item.fabricante || "";
                item.estoqueFilial   = Number(prod.estoqueFilial !== undefined ? prod.estoqueFilial : 0);
                item.preco           = Number(prod.preco || 0);
                item.precoUnitario   = Number(prod.preco || 0);
                item.unidade         = prod.unidade || "UN";

                var qtde = Number(item.qtdeSolicitada || 1);
                if (item.estoqueFilial >= qtde && item.estoqueFilial > 0) {
                    item.status = "estoque_disponivel";
                } else if (item.estoqueFilial > 0) {
                    item.status = "estoque_parcial";
                } else {
                    item.status = "sem_estoque";
                }
            } else {
                // Se não está no cache local do ERP, tenta DemandaLookup (Techbase / Base de Peças)
                if (typeof DemandaLookup !== "undefined" && DemandaLookup.lookupItem) {
                    try {
                        var resLkp = await DemandaLookup.lookupItem(item.refOriginal, item.descOriginal);
                        if (resLkp && resLkp.erpData) {
                            var ep = resLkp.erpData;
                            item.erpProdutoId   = String(ep.erpProdutoId || "");
                            item.erpProdutoDesc = ep.erpProdutoDesc || item.descOriginal || "";
                            item.erpCodigoFab   = ep.erpCodigoFab || item.refOriginal;
                            item.estoqueFilial  = Number(ep.estoqueFilial !== undefined ? ep.estoqueFilial : 0);
                            item.preco          = Number(ep.preco || 0);
                            item.precoUnitario  = Number(ep.preco || 0);
                            var q = Number(item.qtdeSolicitada || 1);
                            if (item.estoqueFilial >= q && item.estoqueFilial > 0) item.status = "estoque_disponivel";
                            else if (item.estoqueFilial > 0) item.status = "estoque_parcial";
                            else item.status = "sem_estoque";
                        } else if (resLkp && resLkp.status === "catalogado") {
                            item.status = "catalogado";
                            if (resLkp.techbaseData && resLkp.techbaseData.descricao) {
                                item.descOriginal = item.descOriginal || resLkp.techbaseData.descricao;
                            }
                        } else {
                            item.status = "nao_cadastrado";
                        }
                    } catch(errLkp) {
                        item.status = "nao_cadastrado";
                    }
                } else {
                    item.status = "nao_cadastrado";
                }
            }
        }

        return itens;
    }


    function _extrairClientesLocais() {
        var lista = [];
        var chaves = [
            "_erp_clients_maxdata", // sessionStorage
            "centralpecas_clients", // localStorage
            "clients",              // localStorage / sessionStorage
            "app_clients"
        ];

        // 1. Tenta sessionStorage (onde o MaxData salva)
        for (var i = 0; i < chaves.length; i++) {
            try {
                var s = sessionStorage.getItem(chaves[i]);
                if (s) {
                    var parsedS = JSON.parse(s);
                    if (Array.isArray(parsedS) && parsedS.length > 0) {
                        lista = parsedS;
                        break;
                    }
                }
            } catch(e) {}
        }

        // 2. Se não achou em sessionStorage, tenta localStorage
        if (!lista || lista.length === 0) {
            for (var j = 0; j < chaves.length; j++) {
                try {
                    var l = localStorage.getItem(chaves[j]);
                    if (l) {
                        var parsedL = JSON.parse(l);
                        if (Array.isArray(parsedL) && parsedL.length > 0) {
                            lista = parsedL;
                            break;
                        }
                    }
                } catch(e) {}
            }
        }

        // 3. Fallback para Utils.getStorage se disponível
        if ((!lista || lista.length === 0) && typeof Utils !== "undefined" && Utils.getStorage) {
            try {
                var u = Utils.getStorage("clients");
                if (Array.isArray(u) && u.length > 0) lista = u;
            } catch(e) {}
        }

        return _normalizarListaClientes(lista || []);
    }

    function _normalizarListaClientes(lista) {
        if (!Array.isArray(lista)) return [];
        var map = {};
        var resultado = [];
        for (var i = 0; i < lista.length; i++) {
            var c = lista[i];
            if (!c) continue;
            var nome = (c.nome || c.razaoSocial || c.nomeFantasia || c.cliente || "").toString().trim();
            if (!nome) continue;
            var doc = (c.cnpj || c.cpf || c.documento || "").toString().trim();
            var cod = (c.codigo || c.id || "").toString().trim();
            var chave = (cod ? "C:" + cod : "") + "|" + (doc ? "D:" + doc : "") + "|" + nome.toUpperCase();
            if (map[chave]) continue;
            map[chave] = true;

            resultado.push({
                id: c.id || cod || null,
                codigo: cod,
                nome: nome,
                razaoSocial: c.razaoSocial || nome,
                cnpj: doc,
                cpf: c.cpf || "",
                cidade: (c.cidade || "").toString().trim(),
                estado: (c.estado || c.uf || "").toString().trim(),
                telefone: (c.telefone || c.celular || "").toString().trim(),
                email: (c.email || "").toString().trim()
            });
        }
        return resultado;
    }

    async function _carregarClientesAsync(forcar) {
        if (!forcar && _todosClientesCache && _todosClientesCache.length > 0) {
            return _todosClientesCache;
        }

        // Carrega imediatamente do cache local para resposta instantânea
        var locais = _extrairClientesLocais();
        if (locais.length > 0) {
            _todosClientesCache = locais;
            _atualizarSugestoesClientesConcorrente();
        }

        if (_carregandoClientes) return _todosClientesCache || [];
        _carregandoClientes = true;

        try {
            var tenant = (_sessao && _sessao.tenantId) ? _sessao.tenantId : "centralpecas";
            var carregados = [];

            // A) Tenta DemandaClientes.listar() do Firestore
            if (typeof DemandaClientes !== "undefined" && DemandaClientes.listar) {
                try {
                    var dc = await DemandaClientes.listar(forcar);
                    if (Array.isArray(dc) && dc.length > 0) {
                        carregados = dc;
                    }
                } catch(e) { console.warn("[DemandaApp] DemandaClientes.listar:", e); }
            }

            // B) Tenta Firestore tenants/{tenant}/demanda/data/clientes
            if (carregados.length === 0 && typeof firebase !== "undefined" && firebase.firestore) {
                try {
                    var db = firebase.firestore();
                    var snap = await db.collection("tenants/" + tenant + "/demanda/data/clientes").limit(1000).get();
                    if (!snap.empty) {
                        carregados = snap.docs.map(function(d) {
                            var dt = d.data();
                            dt.id = d.id;
                            return dt;
                        });
                    }
                } catch(e) { console.warn("[DemandaApp] Firestore demanda/clientes:", e); }
            }

            // C) Tenta Firestore tenants/{tenant}/data/clients (chunks salvos pelo Maxdata)
            if (carregados.length === 0 && typeof firebase !== "undefined" && firebase.firestore) {
                try {
                    var db2 = firebase.firestore();
                    var docSnap = await db2.collection("tenants/" + tenant + "/data").doc("clients").get();
                    if (docSnap.exists) {
                        var dt2 = docSnap.data();
                        if (dt2 && Array.isArray(dt2.items) && dt2.items.length > 0) {
                            carregados = dt2.items;
                        }
                    }
                } catch(e) { console.warn("[DemandaApp] Firestore data/clients:", e); }
            }

            if (carregados.length > 0) {
                var normalizados = _normalizarListaClientes(carregados);
                if (normalizados.length > 0) {
                    _todosClientesCache = normalizados;
                    try {
                        sessionStorage.setItem("_erp_clients_maxdata", JSON.stringify(normalizados.slice(0, 1500)));
                        localStorage.setItem("centralpecas_clients", JSON.stringify(normalizados.slice(0, 500)));
                    } catch(e) {}
                }
            }
        } catch(err) {
            console.error("[DemandaApp] Erro ao sincronizar clientes:", err);
        } finally {
            _carregandoClientes = false;
            _atualizarSugestoesClientesConcorrente();
            // Se dropdown de cliente estiver aberto, atualiza lista
            var dd = document.getElementById("clienteDropdown");
            if (dd && dd.style.display === "block") {
                var inp = document.getElementById("clienteSearchInput");
                _renderClienteDropdownList(inp ? inp.value : "");
            }
        }

        return _todosClientesCache || [];
    }

    function toggleClienteDropdown() {
        var dd  = document.getElementById("clienteDropdown");
        if (!dd) return;
        var open = dd.style.display === "block";
        dd.style.display = open ? "none" : "block";
        if (!open) {
            var inp = document.getElementById("clienteSearchInput");
            if (inp) { inp.value = ""; inp.focus(); }
            if (!_todosClientesCache || _todosClientesCache.length === 0) {
                _carregarClientesAsync();
            }
            _renderClienteDropdownList("");
        }
    }

    function searchCliente(q) { _renderClienteDropdownList(q); }

    function _renderClienteDropdownList(q) {
        var list = document.getElementById("clienteDropdownList");
        if (!list) return;

        var todos = (_todosClientesCache && _todosClientesCache.length > 0)
            ? _todosClientesCache
            : _extrairClientesLocais();

        if (todos.length === 0 && _carregandoClientes) {
            list.innerHTML = "<div style='padding:.75rem 1rem;color:var(--text-secondary);font-size:.82rem;display:flex;align-items:center;gap:.5rem'>" +
                "<span class='material-icons-round' style='font-size:1rem;animation:spin 1s linear infinite'>sync</span> Buscando clientes na base..." +
                "</div>";
            return;
        }

        var qTerm = (q || "").trim().toLowerCase();
        var filtrados = qTerm.length > 0
            ? todos.filter(function(c) {
                var hay = (c.nome + " " + (c.cnpj || "") + " " + (c.codigo || "") + " " + (c.cidade || "")).toLowerCase();
                return hay.indexOf(qTerm) >= 0;
              }).slice(0, 35)
            : todos.slice(0, 25);

        _clientesCache = filtrados;

        var htmlItens = "";
        if (filtrados.length === 0) {
            var msgVazio = todos.length === 0
                ? "Nenhum cliente sincronizado. <a href='javascript:void(0)' onclick='DemandaApp.switchView(\"integracaoErp\")' style='color:var(--accent-primary)'>Sincronizar no ERP</a>"
                : "Nenhum resultado para \"" + _esc(qTerm) + "\".";
            htmlItens = "<div style='padding:.75rem 1rem;color:var(--text-secondary);font-size:.82rem'>" + msgVazio + "</div>";
        } else {
            htmlItens = filtrados.map(function(c, i) {
                var nome = c.nome || "Cliente " + (i+1);
                var detalhe = [c.cnpj || c.cpf || "", c.codigo ? "Cód: " + c.codigo : "", c.cidade || ""].filter(Boolean).join(" • ");
                return "<div class='client-dropdown-item' onclick='DemandaApp.selectClienteIdx(" + i + ")'>" +
                       "<strong>" + _esc(nome) + "</strong>" +
                       (detalhe ? "<span>" + _esc(detalhe) + "</span>" : "") +
                       "</div>";
            }).join("");
        }

        if (qTerm.length >= 2) {
            htmlItens += "<div class='client-dropdown-item' style='border-top:1px dashed var(--border-color);background:rgba(59,130,246,.08);color:var(--accent-primary);font-weight:600' onclick='DemandaApp.usarClienteAvulso(\"" + _escAttr(qTerm) + "\")'>" +
                "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle;margin-right:.3rem'>add_circle_outline</span>" +
                "Usar \"" + _esc(qTerm) + "\" como cliente" +
                "</div>";
        }

        list.innerHTML = htmlItens;
    }

    function selectClienteIdx(i) {
        if (i < 0 || i >= _clientesCache.length) return;
        var c = _clientesCache[i];
        _clienteAtual = { id: c.id || c.codigo || null, codigo: c.codigo || "", nome: c.nome || "", cnpj: c.cnpj || c.cpf || "", cidade: c.cidade || "" };
        var lbl = document.getElementById("clienteLabel");
        var btn = document.getElementById("btnSelectCliente");
        var btnClear = document.getElementById("btnClearCliente");
        if (lbl) lbl.textContent = _clienteAtual.nome;
        if (btn) { btn.classList.add("selected"); btn.style.borderColor = ""; }
        if (btnClear) btnClear.style.display = "inline-flex";
        var dd  = document.getElementById("clienteDropdown");
        if (dd) dd.style.display = "none";
    }

    function usarClienteAvulso(nome) {
        if (!nome || !nome.trim()) return;
        var n = nome.trim();
        _clienteAtual = { id: null, codigo: "", nome: n, cnpj: "", cidade: "", avulso: true };
        var lbl = document.getElementById("clienteLabel");
        var btn = document.getElementById("btnSelectCliente");
        var btnClear = document.getElementById("btnClearCliente");
        if (lbl) lbl.textContent = n;
        if (btn) { btn.classList.add("selected"); btn.style.borderColor = ""; }
        if (btnClear) btnClear.style.display = "inline-flex";
        var dd  = document.getElementById("clienteDropdown");
        if (dd) dd.style.display = "none";
    }

    function onClienteSearchEnter(val) {
        if (_clientesCache && _clientesCache.length === 1) {
            selectClienteIdx(0);
        } else if (val && val.trim().length >= 2) {
            var exatoIdx = -1;
            for (var i = 0; i < (_clientesCache || []).length; i++) {
                if ((_clientesCache[i].nome || "").toLowerCase() === val.trim().toLowerCase()) {
                    exatoIdx = i; break;
                }
            }
            if (exatoIdx >= 0) selectClienteIdx(exatoIdx);
            else usarClienteAvulso(val);
        }
    }

    function limparClienteSelecionado(ev) {
        if (ev) ev.stopPropagation();
        _clienteAtual = null;
        var lbl = document.getElementById("clienteLabel");
        var btn = document.getElementById("btnSelectCliente");
        var btnClear = document.getElementById("btnClearCliente");
        if (lbl) lbl.innerHTML = "Selecionar cliente <span style='color:var(--accent-danger);font-weight:bold;'>*</span>";
        if (btn) { btn.classList.remove("selected"); btn.style.borderColor = ""; }
        if (btnClear) btnClear.style.display = "none";
        var dd  = document.getElementById("clienteDropdown");
        if (dd) dd.style.display = "none";
    }

    function _getClientesLocalCache() {
        return (_todosClientesCache && _todosClientesCache.length > 0)
            ? _todosClientesCache
            : _extrairClientesLocais();
    }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO
    // ════════════════════════════════════════════════════════

    function _openModal(id) {
        var el = document.getElementById(id); if (el) el.style.display = "flex";
    }

    function openImportModal(type) {
        if (type === "texto") {
            var ta = document.getElementById("textareaImport"); if (ta) ta.value = "";
            _openModal("modalTexto");
        } else if (type === "excel") {
            var prev = document.getElementById("excelPreviewArea"); if (prev) prev.style.display = "none";
            var btn  = document.getElementById("btnConfirmExcel");  if (btn) btn.style.display = "none";
            var up   = document.getElementById("excelUploadArea");  if (up)  up.style.display = "";
            _openModal("modalExcel");
        } else if (type === "pdf") {
            _abrirImportPDF();
        } else if (type === "foto") {
            _abrirImportFoto();
        }
    }


    // ════════════════════════════════════════════════════════
    // IMPORT PDF DIRETO (Leitura estruturada via PDF.js)
    // ════════════════════════════════════════════════════════

    function _abrirImportPDF() {
        var modal = document.getElementById("modalImportPDF");
        var up = document.getElementById("pdfUploadArea");
        var proc = document.getElementById("pdfProcessingArea");
        if (up) up.style.display = "block";
        if (proc) proc.style.display = "none";
        if (modal) modal.style.display = "flex";
    }

    function _fecharImportPDF() {
        var modal = document.getElementById("modalImportPDF");
        if (modal) modal.style.display = "none";
        var inp = document.getElementById("pdfDirectFileInput");
        if (inp) inp.value = "";
    }

    function onPdfDrop(ev) {
        ev.preventDefault();
        var area = document.getElementById("pdfUploadArea");
        if (area) area.style.borderColor = "var(--border)";
        var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (file && file.type === "application/pdf") onPdfFileSelected(file);
        else if (file) _toast("Selecione um arquivo PDF válido.", "warning");
    }

    function onPdfFileSelected(file) {
        if (!file) return;
        if (typeof DemandaPDF === "undefined" || typeof DemandaPDF.parseCotacaoPDF !== "function") {
            _toast("Módulo DemandaPDF não carregado.", "error");
            return;
        }

        var up   = document.getElementById("pdfUploadArea");
        var proc = document.getElementById("pdfProcessingArea");
        var msg  = document.getElementById("pdfProcessingMsg");
        var bar  = document.getElementById("pdfProgressBar");

        if (up) up.style.display = "none";
        if (proc) proc.style.display = "block";
        if (msg) msg.textContent = "Abrindo " + file.name + "...";
        if (bar) bar.style.width = "10%";

        DemandaPDF.parseCotacaoPDF(file, function(paginaAtual, totalPaginas) {
            if (msg) msg.textContent = "Processando página " + paginaAtual + " de " + totalPaginas + "...";
            var pct = Math.round((paginaAtual / totalPaginas) * 85) + 10;
            if (bar) bar.style.width = pct + "%";
        }).then(function(itensExtraidos) {
            if (bar) bar.style.width = "100%";
            _fecharImportPDF();

            if (!itensExtraidos || itensExtraidos.length === 0) {
                _toast("Nenhum item reconhecido no PDF. Verifique o layout do arquivo.", "warning");
                return;
            }

            // Valida e envia direto para a Conferência de Importação
            var validados = (typeof DemandaImport !== "undefined")
                ? DemandaImport.validateItens(itensExtraidos)
                : itensExtraidos;

            _showConferencia(validados);
            _toast("✓ " + itensExtraidos.length + " peças extraídas com sucesso do PDF!", "success");
        }).catch(function(err) {
            console.error("[DemandaApp] Erro na leitura do PDF:", err);
            if (up) up.style.display = "block";
            if (proc) proc.style.display = "none";
            _toast("Erro ao ler PDF: " + (err.message || err), "error");
        });
    }

    // ════════════════════════════════════════════════════════
    // IMPORT FOTO / PRINT (camera ou galeria + transcricao)
    // ════════════════════════════════════════════════════════

    function _abrirImportFoto() {
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.onchange = function() {
            var file = inp.files[0];
            document.body.removeChild(inp);
            if (!file) return;
            var modal  = document.getElementById("modalImportFoto");
            var imgEl  = document.getElementById("fotoPreview");
            var ta     = document.getElementById("fotoTranscricao");
            var status = document.getElementById("fotoOcrStatus");
            var msg    = document.getElementById("fotoOcrMsg");
            var pct    = document.getElementById("fotoOcrPct");
            if (!modal || !imgEl) { _toast("Modal Foto não encontrado.", "error"); return; }
            if (ta) { ta.value = ""; ta.placeholder = "Carregando e processando imagem via OCR..."; }
            modal.style.display = "flex";
            if (status) { status.style.display = "flex"; }
            if (msg) msg.textContent = "Preparando reconhecimento...";
            if (pct) pct.textContent = "0%";

            var reader = new FileReader();
            reader.onerror = function() { _toast("Erro ao ler arquivo de imagem.", "error"); };
            reader.onload = function(ev) {
                var dataUrl = ev.target.result;
                imgEl.src = dataUrl;
                imgEl.onload = function() {
                    // Mantém alta resolução (até 2200px) para máxima nitidez do texto e das tabelas
                    var maxDim = 2200;
                    var w = imgEl.naturalWidth || 1200, h = imgEl.naturalHeight || 900;
                    var ratio = Math.min(maxDim / w, maxDim / h, 1);
                    var cv = document.createElement("canvas");
                    cv.width  = Math.round(w * ratio);
                    cv.height = Math.round(h * ratio);
                    var ctx = cv.getContext("2d");
                    ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);

                    // Aprimoramento de contraste para texto impresso em fundo claro
                    try {
                        var imgData = ctx.getImageData(0, 0, cv.width, cv.height);
                        var d = imgData.data;
                        for (var i = 0; i < d.length; i += 4) {
                            var lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
                            lum = lum > 140 ? Math.min(255, lum * 1.15) : Math.max(0, lum * 0.85);
                            d[i] = lum; d[i+1] = lum; d[i+2] = lum;
                        }
                        ctx.putImageData(imgData, 0, 0);
                    } catch(_) {}

                    var processedDataUrl = cv.toDataURL("image/png");

                    function _executarOcrTesseract() {
                        if (msg) msg.textContent = "Lendo caracteres (Tesseract OCR)...";
                        if (pct) pct.textContent = "15%";

                        Tesseract.recognize(
                            processedDataUrl,
                            "por+eng",
                            {
                                logger: function(m) {
                                    if (m.status === "recognizing text" && pct) {
                                        pct.textContent = Math.round((m.progress || 0) * 100) + "%";
                                    }
                                    if (m.status && msg) {
                                        msg.textContent = (m.status === "recognizing text") ? "Reconhecendo texto..." : "Carregando modelo OCR...";
                                    }
                                }
                            }
                        ).then(function(result) {
                            if (status) status.style.display = "none";
                            var texto = (result && result.data && result.data.text) ? result.data.text.trim() : "";
                            _tratarTextoExtraidoFoto(texto);
                        }).catch(function(err) {
                            console.warn("[DemandaApp] Tesseract client-side falhou, tentando fallback:", err);
                            _executarOcrFallbackServer();
                        });
                    }

                    function _executarOcrFallbackServer() {
                        if (msg) msg.textContent = "Tentando OCR via servidor...";
                        fetch("/api/ocr", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ base64: processedDataUrl })
                        }).then(function(r) { return r.json(); }).then(function(data) {
                            if (status) status.style.display = "none";
                            if (data.error) throw new Error(data.error);
                            var texto = (data.text || "").trim();
                            _tratarTextoExtraidoFoto(texto);
                        }).catch(function(err) {
                            console.error("[OCR Fallback]", err);
                            if (status) status.style.display = "none";
                            if (ta) { ta.value = ""; ta.placeholder = "Não foi possível extrair o texto automaticamente. Digite ou cole os dados manualmente."; }
                            _toast("Pouco texto legível na imagem. Digite os dados na caixa ao lado.", "warning");
                        });
                    }

                    if (typeof Tesseract !== "undefined") {
                        _executarOcrTesseract();
                    } else {
                        var scr = document.createElement("script");
                        scr.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
                        scr.onload = function() { _executarOcrTesseract(); };
                        scr.onerror = function() { _executarOcrFallbackServer(); };
                        document.head.appendChild(scr);
                    }
                };
            };
            reader.readAsDataURL(file);
        };
        inp.click();
    }

    function _tratarTextoExtraidoFoto(texto) {
        var ta = document.getElementById("fotoTranscricao");
        if (ta) ta.value = texto;

        if (texto && texto.length > 5) {
            if (typeof DemandaImport !== "undefined") {
                var parsed    = DemandaImport.parseText(texto);
                var validados = DemandaImport.validateItens(parsed);
                if (validados.length > 0) {
                    _fecharImportFoto();
                    _showConferencia(validados);
                    _toast("✓ " + validados.length + " " + (validados.length === 1 ? "peça reconhecida" : "peças reconhecidas") + " da imagem!", "success");
                    return;
                }
            }
            _toast("Texto reconhecido! Revise e clique em Processar Itens.", "info");
        } else {
            if (ta) ta.placeholder = "Pouco texto reconhecido. Digite ou cole as peças manualmente.";
            _toast("Pouco texto identificado na imagem. Revise ou digite no campo.", "warning");
        }
    }

    function _fecharImportFoto() {
        var modal  = document.getElementById("modalImportFoto");
        var img    = document.getElementById("fotoPreview");
        var status = document.getElementById("fotoOcrStatus");
        // Limpa onerror ANTES de apagar src — evita toast falso "Imagem invalida"
        if (img)    { img.onerror = null; img.onload = null; try { URL.revokeObjectURL(img.src); } catch(_) {} img.src = ""; }
        if (status) status.style.display = "none";
        if (modal)  modal.style.display = "none";
    }

    function _processarFotoTranscricao() {
        var ta = document.getElementById("fotoTranscricao");
        if (!ta || !ta.value.trim()) { _toast("Aguarde o OCR ou edite o texto antes de processar.", "warning"); return; }
        var texto = ta.value.trim();
        _fecharImportFoto();
        if (typeof DemandaImport !== "undefined") {
            var parsed    = DemandaImport.parseText(texto);
            var validados = DemandaImport.validateItens(parsed);
            if (validados.length > 0) {
                _showConferencia(validados);
                _toast("\u2713 " + validados.length + " " + (validados.length === 1 ? "item" : "itens") + " encontrados!", "success");
                return;
            }
        }
        // Fallback: abre modal de texto
        var taImport = document.getElementById("textareaImport");
        if (taImport) taImport.value = texto;
        _openModal("modalTexto");
        _toast("Texto carregado! Revise e clique em Processar.", "info");
    }


    function closeModal(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
    function addItemFromDetails() { closeModal("modalItemDetalhes"); }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO TEXTO / WHATSAPP
    // ════════════════════════════════════════════════════════

    function processImportTexto() {
        var ta = document.getElementById("textareaImport");
        if (!ta || !ta.value.trim()) { _toast("Cole um texto antes de processar.", "error"); return; }
        if (typeof DemandaImport === "undefined") { _toast("DemandaImport não disponível.", "error"); return; }
        var parsed    = DemandaImport.parseText(ta.value);
        var validados = DemandaImport.validateItens(parsed);
        if (validados.length === 0) { _toast("Nenhum item encontrado no texto.", "error"); return; }
        closeModal("modalTexto");
        _showConferencia(validados);
    }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO EXCEL / CSV
    // ════════════════════════════════════════════════════════

    function onExcelDrop(ev) {
        ev.preventDefault();
        var area = document.getElementById("excelUploadArea"); if (area) area.style.borderColor = "var(--border)";
        var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (file) onExcelFileSelected(file);
    }

    function onExcelFileSelected(file) {
        if (!file) return;
        if (typeof DemandaImport === "undefined" || typeof XLSX === "undefined") {
            _toast("SheetJS não carregado. Importe via texto por enquanto.", "error"); return;
        }
        var area = document.getElementById("excelUploadArea"); if (area) area.style.display = "none";
        var prev = document.getElementById("excelPreviewArea");
        if (prev) {
            prev.style.display = "";
            prev.innerHTML = "<div style='text-align:center;padding:1.5rem;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='animation:spin 1s linear infinite;font-size:2rem'>sync</span>" +
                "<p style='margin-top:.5rem'>Lendo arquivo...</p></div>";
        }
        DemandaImport.parseExcel(file).then(function(result) {
            _excelItensTemp = result.itens;
            var validados = DemandaImport.validateItens(result.itens);
            var ok  = validados.filter(function(i) { return !i._erros || i._erros.length === 0; }).length;
            var err = validados.length - ok;
            if (prev) prev.innerHTML =
                "<div style='padding:.75rem 1rem;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px;display:flex;gap:.75rem;align-items:center'>" +
                "<span class='material-icons-round' style='color:var(--accent-success)'>check_circle</span>" +
                "<div><strong>" + validados.length + " itens detectados</strong>" +
                (err > 0 ? " <span style='color:var(--accent-danger)'>(" + err + " com alerta)</span>" : "") +
                "<div style='font-size:.78rem;color:var(--text-secondary);margin-top:.15rem'>" + _esc(file.name) + "</div></div></div>";
            var btn = document.getElementById("btnConfirmExcel"); if (btn) btn.style.display = "";
        }).catch(function(err) {
            if (prev) prev.innerHTML = "<div style='color:var(--accent-danger);padding:1rem'>Erro: " + _esc(err.message) + "</div>";
            var area2 = document.getElementById("excelUploadArea"); if (area2) area2.style.display = "";
        });
    }

    function confirmExcelImport() {
        if (_excelItensTemp.length === 0) { _toast("Nenhum item para importar.", "error"); return; }
        closeModal("modalExcel");
        _showConferencia(DemandaImport.validateItens(_excelItensTemp));
    }

    // ════════════════════════════════════════════════════════
    // MODAL DE CONFERÊNCIA — revisão antes de adicionar
    // ════════════════════════════════════════════════════════

    function _showConferencia(itens) {
        _importItensTemp = itens;
        var tbody  = document.getElementById("conferenciaTbody");
        var stats  = document.getElementById("conferenciaStats");
        var chkAll = document.getElementById("chkAllConf");
        if (!tbody) return;

        var ok  = itens.filter(function(i) { return !i._erros || i._erros.length === 0; }).length;
        var err = itens.length - ok;
        if (stats) stats.innerHTML =
            "<span style='color:var(--accent-success)'><strong>" + ok + "</strong> ok</span>" +
            (err > 0 ? " &nbsp;·&nbsp; <span style='color:var(--accent-warning)'><strong>" + err + "</strong> com alerta</span>" : "") +
            " &nbsp;·&nbsp; " + itens.length + " total";
        if (chkAll) chkAll.checked = true;

        tbody.innerHTML = itens.map(function(item, i) {
            var hasErr = item._erros && item._erros.length > 0;
            var incert = item.incerteza;
            var rowStyle = hasErr ? "opacity:.75" : "";
            var statusHtml = hasErr
                ? "<span id='conf-status-" + i + "' style='color:var(--accent-danger);font-size:.72rem' title='" + _esc((item._erros || []).join(", ")) + "'>&#9888; Alerta</span>"
                : incert
                    ? "<span id='conf-status-" + i + "' style='color:var(--accent-warning);font-size:.72rem'>? Incerto</span>"
                    : "<span id='conf-status-" + i + "' style='color:var(--accent-success);font-size:.72rem'>&#10003; Ok</span>";
            return "<tr style='" + rowStyle + "'>" +
                "<td><input type='checkbox' class='conf-chk' data-idx='" + i + "' " + (!hasErr ? "checked" : "") + "></td>" +
                "<td style='color:var(--text-secondary);font-size:.78rem'>" + (i + 1) + "</td>" +
                "<td><input type='text' value='" + _esc(item.refOriginal) + "' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .5rem;color:var(--text-primary);width:100%;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'ref',this.value)\"></td>" +
                "<td><input type='text' value='" + _esc(item.descOriginal) + "' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .5rem;color:var(--text-primary);width:100%;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'desc',this.value)\"></td>" +
                "<td style='text-align:center'><input type='number' value='" + (item.qtdeSolicitada || 1) + "' min='1' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .4rem;color:var(--text-primary);width:56px;text-align:center;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'qtde',+this.value)\"></td>" +
                "<td style='font-size:.78rem;color:var(--text-secondary)'>" + _esc(item.obs || "") + "</td>" +
                "<td>" + statusHtml + "</td></tr>";
        }).join("");

        _openModal("modalConferencia");
    }

    function updateConferenciaItem(idx, field, value) {
        if (!_importItensTemp[idx]) return;
        if (field === "ref")  _importItensTemp[idx].refOriginal    = value;
        if (field === "desc") _importItensTemp[idx].descOriginal   = value;
        if (field === "qtde") _importItensTemp[idx].qtdeSolicitada = Math.max(1, value || 1);

        // Quando referencia muda, recalcula incerteza e atualiza badge de status
        if (field === "ref") {
            var temRef = value && value.trim().length > 0;
            _importItensTemp[idx].incerteza = !temRef;
            var badge = document.getElementById("conf-status-" + idx);
            if (badge) {
                if (temRef) {
                    badge.style.color = "var(--accent-success)";
                    badge.textContent = "\u2713 Ok";
                } else {
                    badge.style.color = "var(--accent-warning)";
                    badge.textContent = "? Incerto";
                }
            }
            // Marca o checkbox automaticamente quando o usuario define uma referencia
            if (temRef) {
                var chk = document.querySelector(".conf-chk[data-idx='" + idx + "']");
                if (chk) chk.checked = true;
            }
        }
    }

    function selectAllConferencia() {
        document.querySelectorAll(".conf-chk").forEach(function(c) { c.checked = true; });
        var chkAll = document.getElementById("chkAllConf"); if (chkAll) chkAll.checked = true;
    }

    function toggleAllConferencia(checked) {
        document.querySelectorAll(".conf-chk").forEach(function(c) { c.checked = checked; });
    }

    function desmarcarIncertosConferencia() {
        var count = 0;
        document.querySelectorAll(".conf-chk").forEach(function(chk) {
            var idx = parseInt(chk.getAttribute("data-idx"), 10);
            if (_importItensTemp[idx] && _importItensTemp[idx].incerteza) {
                chk.checked = false;
                count++;
            }
        });
        _toast(count > 0
            ? count + " incerto" + (count > 1 ? "s" : "") + " desmarcado" + (count > 1 ? "s" : "") + "."
            : "Nenhum item incerto encontrado.",
            count > 0 ? "info" : "warning");
    }

    function confirmConferencia() {
        var selecionados = [];
        document.querySelectorAll(".conf-chk").forEach(function(chk) {
            if (chk.checked) {
                var idx = parseInt(chk.getAttribute("data-idx"), 10);
                if (_importItensTemp[idx]) selecionados.push(_importItensTemp[idx]);
            }
        });
        if (selecionados.length === 0) { _toast("Selecione ao menos um item.", "error"); return; }

        var novosAdicionados = [];
        selecionados.forEach(function(item) {
            var obj = {
                refOriginal: item.refOriginal,
                descOriginal: item.descOriginal || "",
                qtdeSolicitada: item.qtdeSolicitada || 1,
                unidadeOriginal: item.unidadeOriginal || "UN",
                obsCliente: item.obsCliente || item.obs || ""
            };
            _itens.push(obj);
            novosAdicionados.push(obj);
        });

        renderItens();
        closeModal("modalConferencia");
        _toast("Cruzando " + novosAdicionados.length + " itens com estoque e base técnica...", "info");

        _conciliarItensComEstoque(novosAdicionados).then(function() {
            renderItens();
            _toast(novosAdicionados.length + " itens importados e conciliados com estoque!", "success");
        });

        _importItensTemp = [];
    }

    // ════════════════════════════════════════════════════════
    // SALVAR DEMANDA → FIRESTORE
    // ════════════════════════════════════════════════════════

    function salvarDemanda() {
        if (_itens.length === 0) {
            _toast("Adicione ao menos um item antes de salvar.", "error"); return;
        }
        if (!_clienteAtual || !_clienteAtual.nome || !_clienteAtual.nome.trim()) {
            _toast("Obrigatório selecionar ou informar o cliente antes de salvar a cotação.", "warning");
            var btnCli = document.getElementById("btnSelectCliente");
            if (btnCli) {
                btnCli.style.borderColor = "var(--accent-danger)";
                btnCli.style.animation = "shake 0.4s ease";
                setTimeout(function() { if (btnCli) btnCli.style.animation = ""; }, 500);
            }
            toggleClienteDropdown();
            return;
        }
        if (typeof DemandaDB === "undefined") {
            _toast("Erro: DemandaDB não disponível.", "error"); return;
        }

        var s = _sessao;
        var origemEl = document.getElementById("selectOrigem");

        var data = {
            origem:       origemEl ? origemEl.value : "manual",
            canalOrigem:  origemEl ? origemEl.value : "manual",
            clienteId:    _clienteAtual ? _clienteAtual.id    : null,
            clienteNome:  _clienteAtual ? _clienteAtual.nome  : "",
            clienteCnpj:  _clienteAtual ? _clienteAtual.cnpj  : "",
            vendedorId:   s ? (s.login || s.email || null)     : null,
            vendedorNome: s ? (s.nome  || s.name  || "")       : "",
            filialId:     s ? (s.filialId    || 1)             : 1,
            filialNome:   s ? (s.filial || s.tenantNome || "") : "",
            criadoPor:    s ? (s.login || s.email || "sistema"): "sistema"
        };

        // Feedback visual: desabilita ambos os botões salvar
        var btnSalvar  = document.getElementById("btnSalvarDemanda");
        var btnSalvar2 = document.getElementById("btnSalvarDemandaPanel");
        function _setBtnSaving(saving) {
            [btnSalvar, btnSalvar2].forEach(function(b) {
                if (!b) return;
                b.disabled = saving;
                if (saving) { b.textContent = "Salvando..."; }
                else { b.innerHTML = "<span class='material-icons-round'>save</span> Salvar Cotação"; }
            });
        }
        _setBtnSaving(true);

        DemandaDB.createDemanda(data, _itens.slice())
            .then(function(demandaId) {
                console.log("[DemandaApp] Demanda criada:", demandaId);
                _toast("Cotação salva com sucesso!", "success");
                limparDemanda();
                setTimeout(function() { switchView("lista"); }, 800);
            })
            .catch(function(err) {
                console.error("[DemandaApp] Erro ao salvar:", err);
                _toast("Erro ao salvar: " + (err.message || err), "error");
            })
            .finally(function() { _setBtnSaving(false); });
    }

    // ════════════════════════════════════════════════════════
    // LISTA DE DEMANDAS (view-lista)
    // ════════════════════════════════════════════════════════

    function filterDemandas(filtro, el) {
        _filterAtual = filtro;
        document.querySelectorAll(".filter-chip").forEach(function(c) { c.classList.remove("active"); });
        if (el) el.classList.add("active");
        loadDemandasLista(filtro);
    }

    function loadDemandasLista(filtro) {
        var container = document.getElementById("listaDemandasContainer");
        if (!container) return;

        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;display:block;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando cotações...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'>DemandaDB não disponível.</div>";
            return;
        }

        var filters = {};
        if (filtro === "aberta")         filters.status = "aberta";
        if (filtro === "em_atendimento") filters.status = "em_atendimento";
        if (filtro === "encerrada")      filters.status = "encerrada";
        if (filtro === "cancelada")      filters.status = "cancelada";

        DemandaDB.listDemandas(filters)
            .then(function(demandas) {
                if (demandas.length === 0) {
                    container.innerHTML =
                        "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:3rem;opacity:.3'>inbox</span>" +
                        "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Nenhuma cotação encontrada</h4>" +
                        "<p style='font-size:.85rem'>Crie uma nova na Central de Captura.</p>" +
                        "<button class='btn btn-primary btn-sm' style='margin-top:1rem' onclick='DemandaApp.switchView(\"captura\")'>" +
                        "<span class='material-icons-round'>add</span> Nova Cotação</button></div>";
                    return;
                }
                container.innerHTML = "<div style='padding:1rem 1.5rem'>" +
                    demandas.map(_renderDemandaCard).join("") + "</div>";

                // Auto-recuperação de totalizadores (ex: cotações salvas anteriormente como 0)
                demandas.forEach(function(d) {
                    if ((!d.totalItens || d.totalItens === 0) && d.id) {
                        DemandaDB.getItens(d.id).then(function(itens) {
                            if (itens && itens.length > 0) {
                                var comEst = 0, semEst = 0;
                                itens.forEach(function(i) {
                                    if (i.status === "estoque_disponivel") comEst++;
                                    else if (i.status === "estoque_parcial") { comEst++; semEst++; }
                                    else semEst++;
                                });
                                var el = document.getElementById("card_stats_" + d.id);
                                if (el) {
                                    el.innerHTML = _miniStat("Itens", itens.length, "var(--text-primary)") +
                                                   _miniStat("Estoque", comEst, "var(--accent-success)") +
                                                   _miniStat("Faltam", semEst, semEst > 0 ? "var(--accent-danger)" : "var(--text-secondary)");
                                }
                                DemandaDB.updateDemanda(d.id, {
                                    totalItens: itens.length,
                                    totalComEstoque: comEst,
                                    totalSemEstoque: semEst
                                }).catch(function() {});
                            }
                        }).catch(function() {});
                    }
                });
            })
            .catch(function(err) {
                console.error("[DemandaApp] Erro ao listar:", err);
                container.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'>" +
                    "<span class='material-icons-round'>error</span><p>Erro ao carregar: " + _esc(err.message || String(err)) + "</p></div>";
            });
    }

    function _renderDemandaCard(d) {
        var STATUS_COLOR = { aberta: "#6366f1", em_atendimento: "#f59e0b", encerrada: "#10b981", cancelada: "#6b7280" };
        var STATUS_LABEL = { aberta: "Aberta", em_atendimento: "Em Atendimento", encerrada: "Encerrada", cancelada: "Cancelada" };
        var cor = STATUS_COLOR[d.status] || "#6366f1";
        var lbl = STATUS_LABEL[d.status] || d.status;
        var dt  = d.criadoEm && d.criadoEm.toDate
            ? d.criadoEm.toDate().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
            : "—";

        return "<div onclick='DemandaApp.abrirDemanda(\"" + _esc(d.id) + "\")'" +
            " style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);" +
            "padding:1rem 1.25rem;margin-bottom:.75rem;display:flex;align-items:center;gap:1rem;" +
            "cursor:pointer;transition:border-color var(--transition)'" +
            " onmouseover='this.style.borderColor=\"var(--primary-color)\"'" +
            " onmouseout='this.style.borderColor=\"var(--border-color)\"'>" +
            // Info principal
            "<div style='flex:1;min-width:0'>" +
            "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem'>" +
            "<span style='font-weight:700;font-size:.9rem'>" + _esc(d.codigo || "—") + "</span>" +
            "<span style='font-size:.7rem;padding:.1rem .5rem;border-radius:10px;background:" + cor + "22;color:" + cor + ";font-weight:600'>" + lbl + "</span>" +
            "</div>" +
            "<div style='font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" +
            (d.clienteNome ? "<span style='color:var(--text-primary)'>" + _esc(d.clienteNome) + "</span> · " : "") +
            (d.vendedorNome ? "Vend.: " + _esc(d.vendedorNome) + " · " : "") +
            dt +
            "</div>" +
            "</div>" +
            // Contadores
            "<div id='card_stats_" + _esc(d.id) + "' style='display:flex;gap:1.25rem;text-align:center;flex-shrink:0'>" +
            _miniStat("Itens",   d.totalItens      || 0, "var(--text-primary)") +
            _miniStat("Estoque", d.totalComEstoque  || 0, "var(--accent-success)") +
            _miniStat("Faltam",  d.totalSemEstoque  || 0, (d.totalSemEstoque || 0) > 0 ? "var(--accent-danger)" : "var(--text-secondary)") +
            "</div>" +
            // Ações rápidas (Estornar / Reabrir / Excluir)
            "<div style='display:flex;gap:.35rem;align-items:center;margin-left:.5rem;flex-shrink:0'>" +
            (d.status === "cancelada"
                ? "<button onclick='event.stopPropagation(); DemandaApp.reabrirDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || '') + "\")' title='Reabrir Cotação' style='background:rgba(59,130,246,.15);color:#3b82f6;border:1px solid rgba(59,130,246,.3);border-radius:6px;padding:.3rem .55rem;cursor:pointer;display:inline-flex;align-items:center;gap:.25rem;font-size:.72rem;font-weight:600'><span class='material-icons-round' style='font-size:.9rem'>restore</span> Reabrir</button>"
                : "<button onclick='event.stopPropagation(); DemandaApp.estornarDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || '') + "\")' title='Estornar Cotação' style='background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:.3rem .55rem;cursor:pointer;display:inline-flex;align-items:center;gap:.25rem;font-size:.72rem;font-weight:600'><span class='material-icons-round' style='font-size:.9rem'>undo</span> Estornar</button>"
            ) +
            "<button onclick='event.stopPropagation(); DemandaApp.excluirDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || '') + "\")' title='Excluir Cotação' style='background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:.3rem .45rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center'><span class='material-icons-round' style='font-size:1rem'>delete_outline</span></button>" +
            "</div>" +
            "<span class='material-icons-round' style='color:var(--text-secondary);font-size:1.1rem'>chevron_right</span>" +
            "</div>";
    }

    function _miniStat(label, val, color) {
        return "<div style='min-width:44px'>" +
            "<div style='font-size:1rem;font-weight:700;color:" + color + "'>" + val + "</div>" +
            "<div style='font-size:.62rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em'>" + label + "</div>" +
            "</div>";
    }



    // ════════════════════════════════════════════════════════
    // AUTORIZAÇÃO DE SUPERVISÃO / ADM
    // ════════════════════════════════════════════════════════

    var _acaoPendenteSupervisao = null;

    async function _hashSenha(str) {
        var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
    }

    function _abrirModalSupervisao(dados) {
        _acaoPendenteSupervisao = dados;
        var modal = document.getElementById("modalAutorizacaoSupervisao");
        if (!modal) return;

        var elTitulo = document.getElementById("supModalTitulo");
        var elDesc   = document.getElementById("supAcaoDescricao");
        var elMotivo = document.getElementById("supCampoMotivo");
        var inpMotivo = document.getElementById("supInputMotivo");
        var inpLogin = document.getElementById("supInputLogin");
        var inpSenha = document.getElementById("supInputSenha");
        var elErro   = document.getElementById("supMsgErro");
        var btnConf  = document.getElementById("btnConfirmarSup");

        if (elTitulo) elTitulo.textContent = dados.titulo || "Autorização de Supervisão";
        if (elDesc) elDesc.innerHTML = dados.descricao || "Esta operação requer autorização de supervisão.";
        if (elErro) { elErro.style.display = "none"; elErro.textContent = ""; }

        if (inpMotivo) inpMotivo.value = "";
        if (inpSenha) inpSenha.value = "";

        if (elMotivo) {
            elMotivo.style.display = (dados.tipo === "estornar") ? "block" : "none";
        }

        // Sugere o login do usuário logado se for admin/master/supervisor
        var loginLogado = (_sessao && (_sessao.login || _sessao.email)) || "";
        var roleLogado  = ((_sessao && _sessao.role) || "").toLowerCase();
        var isSup       = ["admin", "master", "supervisor", "gerente"].includes(roleLogado);
        if (inpLogin) {
            inpLogin.value = isSup ? loginLogado : "";
            if (!isSup) inpLogin.focus();
            else if (inpSenha) inpSenha.focus();
        }

        if (btnConf) {
            btnConf.style.background = dados.corBtn || "var(--warning)";
            btnConf.innerHTML = "<span class='material-icons-round' style='font-size:.95rem'>lock_open</span> " + (dados.textoBtn || "Autorizar e Confirmar");
        }

        modal.style.display = "flex";
        setTimeout(function() {
            if (isSup && inpSenha) inpSenha.focus();
            else if (inpLogin) inpLogin.focus();
        }, 100);
    }

    function _fecharModalSupervisao() {
        var modal = document.getElementById("modalAutorizacaoSupervisao");
        if (modal) modal.style.display = "none";
        _acaoPendenteSupervisao = null;
    }

    function _toggleVisibilidadeSenhaSupervisao() {
        var inp = document.getElementById("supInputSenha");
        var btn = document.getElementById("supToggleVisBtn");
        if (!inp) return;
        if (inp.type === "password") {
            inp.type = "text";
            if (btn) btn.textContent = "visibility_off";
        } else {
            inp.type = "password";
            if (btn) btn.textContent = "visibility";
        }
    }

    async function _validarCredencialSupervisor(loginStr, senhaStr) {
        if (!loginStr || !senhaStr) throw new Error("Informe o login e a senha do supervisor.");
        if (typeof firebase === "undefined") throw new Error("Firebase não inicializado.");

        var db = firebase.firestore();
        var tenantId = (_sessao && _sessao.tenantId) || (typeof DemandaDB !== "undefined" && DemandaDB.TENANT_ID) || "centralpecas";
        var loginKey = loginStr.trim().toLowerCase();

        // 1. Tenta carregar documento do usuário
        var docSnap = await db.collection("tenants").doc(tenantId).collection("users").doc(loginKey).get();
        if (!docSnap.exists && tenantId !== "centralpecas") {
            docSnap = await db.collection("tenants").doc("centralpecas").collection("users").doc(loginKey).get();
        }

        if (!docSnap.exists) {
            throw new Error("Usuário supervisor '" + loginKey + "' não encontrado.");
        }

        var user = docSnap.data();
        if (user.ativo === false) {
            throw new Error("O usuário supervisor '" + (user.nome || loginKey) + "' está inativo.");
        }

        var role = (user.role || "").toLowerCase();
        var rolesPermitidas = ["admin", "master", "supervisor", "gerente"];
        if (!rolesPermitidas.includes(role)) {
            throw new Error("O usuário '" + (user.nome || loginKey) + "' não possui perfil de supervisor ou administrador (perfil: " + (user.role || "operador") + ").");
        }

        // 2. Valida hash SHA-256 ou PIN
        var senhaHash = await _hashSenha(senhaStr);
        var senhaValida = (user.senhaHash && user.senhaHash === senhaHash) ||
                          (user.pin && String(user.pin).trim() === senhaStr.trim());

        if (!senhaValida) {
            throw new Error("Senha ou PIN incorreto para o supervisor " + (user.nome || loginKey) + ".");
        }

        return {
            login: loginKey,
            nome: user.nome || loginKey,
            role: user.role || "supervisor"
        };
    }

    async function _confirmarAutorizacaoSupervisao() {
        var errEl = document.getElementById("supMsgErro");
        var btn = document.getElementById("btnConfirmarSup");
        if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

        var login = (document.getElementById("supInputLogin") || {}).value || "";
        var senha = (document.getElementById("supInputSenha") || {}).value || "";
        var motivo = (document.getElementById("supInputMotivo") || {}).value || "";

        if (_acaoPendenteSupervisao && _acaoPendenteSupervisao.tipo === "estornar" && !motivo.trim()) {
            if (errEl) { errEl.textContent = "Por favor, informe o motivo do estorno."; errEl.style.display = "block"; }
            return;
        }

        if (!login.trim() || !senha.trim()) {
            if (errEl) { errEl.textContent = "Informe o login e a senha/PIN de supervisão."; errEl.style.display = "block"; }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<span class='material-icons-round' style='font-size:.95rem;animation:spin 1s linear infinite'>sync</span> Validando...";
        }

        try {
            var supervisor = await _validarCredencialSupervisor(login, senha);
            var pendente = _acaoPendenteSupervisao;
            _fecharModalSupervisao();

            if (!pendente) return;

            if (pendente.tipo === "excluir") {
                await DemandaDB.deleteDemanda(pendente.demandaId);
                _toast("Cotação " + (pendente.codigo || "") + " excluída com sucesso! (Autorizado por " + supervisor.nome + ")", "success");
                closeModal("modalDemandaDetalhe");
                loadDemandasLista(_filterAtual);
            } else if (pendente.tipo === "estornar") {
                await DemandaDB.estornarDemanda(pendente.demandaId, motivo, supervisor.nome);
                _toast("Cotação " + (pendente.codigo || "") + " estornada com sucesso! (Autorizado por " + supervisor.nome + ")", "success");
                closeModal("modalDemandaDetalhe");
                loadDemandasLista(_filterAtual);
            } else if (pendente.tipo === "reabrir") {
                await DemandaDB.reabrirDemanda(pendente.demandaId, supervisor.nome);
                _toast("Cotação " + (pendente.codigo || "") + " reaberta com sucesso! (Autorizado por " + supervisor.nome + ")", "success");
                closeModal("modalDemandaDetalhe");
                loadDemandasLista(_filterAtual);
            }
        } catch(e) {
            console.warn("[DemandaApp] Falha na autorização:", e);
            if (errEl) {
                errEl.textContent = e.message || String(e);
                errEl.style.display = "block";
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = "<span class='material-icons-round' style='font-size:.95rem'>lock_open</span> Autorizar e Confirmar";
            }
        }
    }

    function excluirDemanda(demandaId, codigo) {
        if (!demandaId) return;
        _abrirModalSupervisao({
            tipo: "excluir",
            demandaId: demandaId,
            codigo: codigo,
            titulo: "Exclusão Permanente de Cotação",
            descricao: "Esta ação apagará permanentemente a cotação <strong>" + _esc(codigo || demandaId) + "</strong> e todos os seus itens do banco de dados.<br><br>Para continuar, é necessária a <strong>autorização expressa com senha</strong> de um supervisor ou administrador.",
            corBtn: "var(--accent-danger)",
            textoBtn: "Confirmar Exclusão"
        });
    }

    function estornarDemanda(demandaId, codigo) {
        if (!demandaId) return;
        _abrirModalSupervisao({
            tipo: "estornar",
            demandaId: demandaId,
            codigo: codigo,
            titulo: "Estorno de Cotação",
            descricao: "Você está estornando a cotação <strong>" + _esc(codigo || demandaId) + "</strong>. Os itens pendentes serão cancelados.<br><br>Informe o motivo e a <strong>senha de supervisão ou administração</strong> para autorizar.",
            corBtn: "var(--warning)",
            textoBtn: "Confirmar Estorno"
        });
    }

    function reabrirDemanda(demandaId, codigo) {
        if (!demandaId) return;
        _abrirModalSupervisao({
            tipo: "reabrir",
            demandaId: demandaId,
            codigo: codigo,
            titulo: "Reabertura de Cotação Estornada",
            descricao: "Deseja reabrir a cotação <strong>" + _esc(codigo || demandaId) + "</strong> para dar andamento comercial novamente?<br><br>Informe a <strong>senha de supervisão ou administração</strong>.",
            corBtn: "var(--primary-color)",
            textoBtn: "Confirmar Reabertura"
        });
    }

    function abrirDemanda(id) {
        if (!id) return;
        var body = document.getElementById("modalDemandaDetalheBody");
        if (body) body.innerHTML = "<div class='search-loading'><div class='spinner'></div><span>Carregando...</span></div>";
        _openModal("modalDemandaDetalhe");
        if (typeof DemandaDB === "undefined") {
            if (body) body.innerHTML = "<p style='color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }
        Promise.all([ DemandaDB.getDemanda(id), DemandaDB.getItens(id) ])
            .then(function(res) {
                _demandaAtual = { id: id, data: res[0], itens: res[1] };
                _renderDemandaDetalheBody();
            })
            .catch(function(err) {
                if (body) body.innerHTML = "<p style='color:var(--accent-danger);padding:1rem'>Erro: " + _esc(err.message || String(err)) + "</p>";
            });
    }

    // ════════════════════════════════════════════════════════
    // DETALHE DA DEMANDA — RENDERIZAÇÃO COM GESTÃO DE ESTADOS
    // ════════════════════════════════════════════════════════

    function _renderDemandaDetalheBody() {
        if (!_demandaAtual) return;
        var body = document.getElementById("modalDemandaDetalheBody");
        if (!body) return;

        var d     = _demandaAtual.data;
        var itens = _demandaAtual.itens;
        var SC = { aberta:"#6366f1", em_atendimento:"#f59e0b", encerrada:"#10b981", cancelada:"#6b7280" };
        var SL = { aberta:"Aberta", em_atendimento:"Em Atendimento", encerrada:"Encerrada", cancelada:"Cancelada" };
        var cor = SC[d.status] || "#6366f1";
        var lbl = SL[d.status] || d.status;
        var dt  = d.criadoEm && d.criadoEm.toDate ? d.criadoEm.toDate().toLocaleDateString("pt-BR") : "—";

        // Contadores do progresso
        var total    = itens.length;
        var terminal = itens.filter(function(i) { return typeof DemandaStates !== "undefined" && DemandaStates.isTerminal(i.status); }).length;
        var pct      = total > 0 ? Math.round((terminal / total) * 100) : 0;

        var itensHtml = total === 0
            ? "<tr><td colspan='6' style='text-align:center;padding:2rem;color:var(--text-secondary)'>Nenhum item registrado.</td></tr>"
            : itens.map(function(item, i) { return _renderItemRow(item, i); }).join("");

        body.innerHTML =
            // Cabeçalho com código + status + data
            "<div style='display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap'>" +
            "<span style='font-size:1.05rem;font-weight:700'>" + _esc(d.codigo) + "</span>" +
            "<span style='font-size:.7rem;padding:.15rem .55rem;border-radius:10px;background:" + cor + "22;color:" + cor + "'>" + lbl + "</span>" +
            "<span style='color:var(--text-secondary);font-size:.78rem;margin-left:auto'>" + dt + "</span>" +
            "</div>" +
            // Barra de ações (Estornar / Reabrir / Excluir)
            "<div style='display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--border-color)'>" +
            (d.status === "cancelada"
                ? "<button onclick='DemandaApp.reabrirDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || "") + "\")' style='background:rgba(59,130,246,.15);color:#3b82f6;border:1px solid rgba(59,130,246,.3);border-radius:6px;padding:.35rem .75rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:600'><span class='material-icons-round' style='font-size:.95rem'>restore</span> Reabrir Cotação</button>"
                : "<button onclick='DemandaApp.estornarDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || "") + "\")' style='background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:.35rem .75rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:600'><span class='material-icons-round' style='font-size:.95rem'>undo</span> Estornar Cotação</button>"
            ) +
            "<button onclick='DemandaApp.excluirDemanda(\"" + _esc(d.id) + "\", \"" + _esc(d.codigo || "") + "\")' style='background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);border-radius:6px;padding:.35rem .75rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:600'><span class='material-icons-round' style='font-size:.95rem'>delete_forever</span> Excluir Cotação</button>" +
            "</div>" +
            // Info cliente / vendedor
            (d.clienteNome ? "<div style='font-size:.82rem;margin-bottom:.75rem;color:var(--text-secondary)'>" +
                "<strong style='color:var(--text-primary)'>Cliente:</strong> " + _esc(d.clienteNome) +
                (d.vendedorNome ? " &nbsp;·&nbsp; <strong style='color:var(--text-primary)'>Vendedor:</strong> " + _esc(d.vendedorNome) : "") +
                "</div>" : "") +
            // Barra de progresso dos itens
            (total > 0 ? "<div style='margin-bottom:1rem'>" +
                "<div style='display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-secondary);margin-bottom:.3rem'>" +
                "<span>Progresso dos itens</span><span>" + terminal + "/" + total + " concluídos (" + pct + "%)</span></div>" +
                "<div style='height:4px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                "<div style='height:100%;width:" + pct + "%;background:var(--accent-success);transition:width .4s'></div></div>" +
                "</div>" : "") +
            // Tabela de itens
            "<div style='overflow-x:auto'>" +
            "<table style='width:100%;border-collapse:collapse;font-size:.82rem'>" +
            "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
            ["#","Referência","Descrição","Qtd","Status","Ação"].map(function(h) {
                return "<th style='padding:.4rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em'>" + h + "</th>";
            }).join("") +
            "</tr></thead><tbody id='detalheItemsTbody'>" + itensHtml + "</tbody></table></div>";
    }

    function _renderItemRow(item, i) {
        var sc     = (typeof DemandaStates !== "undefined") ? DemandaStates.get(item.status) : { label: item.status, color: "#6366f1" };
        var nexts  = (typeof DemandaStates !== "undefined") ? DemandaStates.nextStates(item.status) : [];
        var isEnd  = (typeof DemandaStates !== "undefined") && DemandaStates.isTerminal(item.status);
        var needsId = (item.status === "demanda_recebida" || item.status === "em_identificacao") && !item.erpProdutoId;

        var acaoHtml;
        if (isEnd) {
            acaoHtml = "<span style='font-size:.72rem;color:var(--text-secondary)'>Conclu\u00eddo</span>";
        } else if (nexts.length === 0) {
            acaoHtml = "<span style='font-size:.72rem;color:var(--text-secondary)'>\u2014</span>";
        } else {
            acaoHtml = "<select onchange=\"DemandaApp.avancarItemStatus('" + _esc(item.id) + "',this.value,this)\" " +
                "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.2rem .5rem;" +
                "color:var(--text-primary);font-size:.75rem;cursor:pointer;max-width:150px'>" +
                "<option value=''>Avan\u00e7ar para...</option>" +
                nexts.map(function(n) { return "<option value='" + n.key + "' style='color:" + n.color + "'>" + n.label + "</option>"; }).join("") +
                "</select>";
        }

        var identificarBtn = needsId
            ? "<br><button onclick=\"DemandaApp._abrirBuscaERP('" + _esc(item.id) + "')\" " +
              "style='margin-top:.3rem;background:transparent;border:1px solid var(--accent-primary);border-radius:4px;" +
              "padding:.15rem .5rem;color:var(--accent-primary);font-size:.7rem;cursor:pointer'>" +
              "<span class='material-icons-round' style='font-size:.8rem;vertical-align:middle'>search</span> Identificar</button>"
            : "";

        var tlBtn = "<button id='btnTimeline_" + _esc(item.id) + "' title='Hist\u00f3rico' onclick=\"DemandaApp.toggleItemTimeline('" + _esc(item.id) + "')\" " +
            "style='background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:.1rem;vertical-align:middle'>" +
            "<span class='material-icons-round' style='font-size:.95rem'>history</span></button>";

        var timelineRow = "<tr id='timeline_" + _esc(item.id) + "' style='display:none'>" +
            "<td colspan='6' style='padding:.5rem .6rem 1rem 2.5rem;border-bottom:1px solid rgba(255,255,255,.06)'>" +
            "<div style='font-size:.7rem;font-weight:600;color:var(--text-secondary);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.05em'>Hist\u00f3rico do Item</div>" +
            _renderTimeline(item) + "</td></tr>";

        var mainRow = "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
            "<td style='color:var(--text-secondary);font-size:.75rem;padding:.5rem .6rem'>" + (i + 1) + " " + tlBtn + "</td>" +
            "<td style='font-weight:600;font-size:.82rem;padding:.5rem .6rem'>" + _esc(item.refOriginal || item.erpProdutoId || "\u2014") + "</td>" +
            "<td style='font-size:.79rem;color:var(--text-secondary);padding:.5rem .6rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" +
                _esc(item.descOriginal || item.erpProdutoDesc || "\u2014") + "</td>" +
            "<td style='text-align:center;padding:.5rem .6rem'>" + (item.qtdeSolicitada || 1) + "</td>" +
            "<td style='padding:.5rem .6rem'><span style='font-size:.7rem;padding:.15rem .5rem;border-radius:10px;background:" +
                sc.color + "22;color:" + sc.color + ";white-space:nowrap'>" + _esc(sc.label) + "</span></td>" +
            "<td style='padding:.5rem .6rem'>" + acaoHtml + identificarBtn + "</td>" +
            "</tr>";

        return mainRow + timelineRow;
    }

    // ════════════════════════════════════════════════════════
    // AVANÇAR ESTADO DO ITEM → FIRESTORE
    // ════════════════════════════════════════════════════════

    function avancarItemStatus(itemId, novoStatus, selectEl) {
        if (!novoStatus || !_demandaAtual) return;
        if (selectEl) selectEl.value = ""; // reset imediatamente

        // Encontra o item na memória
        var item = null;
        for (var i = 0; i < _demandaAtual.itens.length; i++) {
            if (_demandaAtual.itens[i].id === itemId) { item = _demandaAtual.itens[i]; break; }
        }
        if (!item) { _toast("Item não encontrado.", "error"); return; }

        // Valida transição
        if (typeof DemandaStates !== "undefined") {
            var check = DemandaStates.canTransition(item.status, novoStatus);
            if (!check.valid) { _toast(check.reason, "error"); return; }
        }

        // Caso especial: venda_perdida → pede motivo
        if (novoStatus === "venda_perdida") {
            _confirmarVendaPerdida(itemId, item.status); return;
        }

        // Caso especial: estoque_disponivel ou estoque_parcial → verifica quantidade
        if ((novoStatus === "estoque_disponivel" || novoStatus === "estoque_parcial") && (item.qtdeSolicitada || 1) > 1) {
            _confirmarQuantidadeParcial(itemId, item.status, novoStatus); return;
        }

        // Persiste
        _persistirTransicao(itemId, item.status, novoStatus, "");
    }

    function _persistirTransicao(itemId, deStatus, paraStatus, obs) {
        if (typeof DemandaDB === "undefined") { _toast("DemandaDB indisponível.", "error"); return; }

        var s = _sessao;
        var por = s ? (s.login || s.nome || "sistema") : "sistema";

        var timelineEntry = { evento: "status_changed", de: deStatus, para: paraStatus, por: por, obs: obs };

        DemandaDB.updateItem(_demandaAtual.id, itemId, { status: paraStatus }, timelineEntry)
            .then(function() {
                // Atualiza memória local
                for (var i = 0; i < _demandaAtual.itens.length; i++) {
                    if (_demandaAtual.itens[i].id === itemId) {
                        _demandaAtual.itens[i].status = paraStatus;
                        break;
                    }
                }
                var sc  = (typeof DemandaStates !== "undefined") ? DemandaStates.get(paraStatus) : { label: paraStatus };
                _toast("Status avançado para: " + sc.label, "success");
                _renderDemandaDetalheBody();
                // Atualiza a lista de demandas em background
                loadDemandasLista(_filterAtual);
            })
            .catch(function(err) {
                _toast("Erro ao avançar: " + (err.message || err), "error");
            });
    }

    function _confirmarVendaPerdida(itemId, deStatus) {
        var motivos = (typeof DemandaStates !== "undefined" && DemandaStates.MOTIVOS_PERDA) ? DemandaStates.MOTIVOS_PERDA : [
            { key: "preco", label: "Preço" }, { key: "prazo", label: "Prazo de Entrega" },
            { key: "concorrencia", label: "Comprou de Outro Fornecedor" }, { key: "marca", label: "Marca / Fabricante" },
            { key: "condicao_pgto", label: "Condição de Pagamento" }, { key: "desistencia", label: "Cliente Desistiu" },
            { key: "sem_resposta", label: "Sem Resposta" }, { key: "outro", label: "Outro" }
        ];

        var tipos = (typeof DemandaStates !== "undefined" && DemandaStates.TIPOS_PERDA) ? DemandaStates.TIPOS_PERDA : {
            tipo1: "Produto sem cadastro no ERP",
            tipo2: "Produto cadastrado, mas sem estoque",
            tipo3: "Estoque parcial — quantidade faltante",
            tipo4: "Tinha estoque, mas cliente não fechou"
        };

        var optsMotivos = motivos.map(function(m) { return "<option value='" + m.key + "'>" + m.label + "</option>"; }).join("");
        var optsTipos = Object.keys(tipos).map(function(k) { return "<option value='" + k + "'>" + tipos[k] + "</option>"; }).join("");

        var itemObj = null;
        if (_demandaAtual && _demandaAtual.itens) {
            itemObj = _demandaAtual.itens.find(function(i) { return i.id === itemId; });
        }
        var estValor = 0;
        if (itemObj) {
            estValor = (Number(itemObj.preco || itemObj.precoUnitario || 0) * Number(itemObj.qtdeSolicitada || 1));
        }

        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center";
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.5rem;width:440px;max-width:92vw;box-shadow:0 10px 30px rgba(0,0,0,.5)'>" +
            "<h4 style='margin:0 0 1rem;display:flex;align-items:center;gap:.5rem;color:var(--accent-danger)'>" +
            "<span class='material-icons-round'>cancel</span>Registrar Venda Perdida</h4>" +

            "<label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>Tipo de Perda (Prompt 2):</label>" +
            "<select id='_motivoPerdaTipo' style='width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.45rem .65rem;color:var(--text-primary);margin-bottom:.75rem;font-size:.82rem'>" +
            optsTipos + "</select>" +

            "<label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>Motivo Principal:</label>" +
            "<select id='_motivoPerdaSelect' style='width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.45rem .65rem;color:var(--text-primary);margin-bottom:.75rem;font-size:.82rem'>" +
            optsMotivos + "</select>" +

            "<label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>Valor Estimado Perdido (R$):</label>" +
            "<input id='_motivoPerdaValor' type='number' step='0.01' value='" + (estValor > 0 ? estValor.toFixed(2) : "0.00") + "' " +
            "style='width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.45rem .65rem;color:var(--text-primary);box-sizing:border-box;margin-bottom:.75rem;font-size:.85rem;font-weight:700'>" +

            "<label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>Justificativa / Detalhes:</label>" +
            "<input id='_motivoPerdaObs' type='text' placeholder='Ex: Cliente achou caro / fechou com concorrente local...' " +
            "style='width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.45rem .65rem;color:var(--text-primary);box-sizing:border-box;margin-bottom:1.2rem;font-size:.82rem'>" +

            "<div style='display:flex;gap:.5rem;justify-content:flex-end'>" +
            "<button id='_btnCancelarPerda' " +
            "style='background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.45rem 1rem;color:var(--text-secondary);cursor:pointer;font-size:.82rem'>Cancelar</button>" +
            "<button id='_btnConfirmarPerda' " +
            "style='background:var(--accent-danger);border:none;border-radius:6px;padding:.45rem 1.2rem;color:#fff;cursor:pointer;font-weight:700;font-size:.82rem'>Confirmar Perda</button>" +
            "</div></div>";
        document.body.appendChild(overlay);

        document.getElementById("_btnCancelarPerda").onclick = function() { overlay.remove(); };

        document.getElementById("_btnConfirmarPerda").onclick = function() {
            var motivo = document.getElementById("_motivoPerdaSelect").value;
            var tipo   = document.getElementById("_motivoPerdaTipo").value;
            var valor  = parseFloat(document.getElementById("_motivoPerdaValor").value) || estValor || 0;
            var obs    = (document.getElementById("_motivoPerdaObs").value || "").trim();
            overlay.remove();

            var demandaId = _demandaAtual ? _demandaAtual.id : null;
            if (!demandaId) {
                _persistirTransicao(itemId, deStatus, "venda_perdida", "Motivo: " + motivo + (obs ? " — " + obs : ""));
                return;
            }

            var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
            var tl = { evento: "venda_perdida", de: deStatus, para: "venda_perdida", por: por, obs: "Motivo: " + motivo + " | Tipo: " + tipo + (obs ? " | " + obs : "") };

            DemandaDB.updateItem(demandaId, itemId, {
                status: "venda_perdida",
                vendaPerdida: true,
                motivoPerda: motivo,
                tipoPerda: tipo,
                valorPerdido: valor,
                motivoPerdaDetalhe: obs
            }, tl)
            .then(function() {
                _toast("Venda perdida registrada com sucesso.", "info");
                return DemandaDB.recalcTotals(demandaId);
            })
            .then(function() {
                _renderDemandaDetalheBody();
                loadDemandasLista(_filterAtual);
                if (typeof loadOrcamento === "function") loadOrcamento();
            })
            .catch(function(err) {
                _toast("Erro ao registrar perda: " + (err.message || err), "error");
            });
        };
    }

    // ════════════════════════════════════════════════════════
    // VIEW: DASHBOARD — KPIs DE INTELIGÊNCIA
    // ════════════════════════════════════════════════════════

    function loadDashboard() {
        var container = document.getElementById("dashboardContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando KPIs...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }

        DemandaDB.getDashboardStats()
            .then(function(s) {
                var SL = { aberta: "Abertas", em_atendimento: "Em Atendimento", encerrada: "Encerradas", cancelada: "Canceladas" };
                var SC = { aberta: "#6366f1", em_atendimento: "#f59e0b", encerrada: "#10b981", cancelada: "#6b7280" };

                // KPI cards
                var kpis = [
                    { icon: "receipt_long",  label: "Total Cotações",    val: s.totalDemandas,      color: "#6366f1" },
                    { icon: "inventory",     label: "Itens Recebidos",   val: s.totalItens,         color: "#3b82f6" },
                    { icon: "manage_search", label: "Identificados",     val: s.totalIdentificados, color: "#f59e0b" },
                    { icon: "check_circle",  label: "Com Estoque",       val: s.totalComEstoque,    color: "#10b981" },
                    { icon: "inventory_2",   label: "Sem Estoque",       val: s.totalSemEstoque,    color: "#ef4444" },
                    { icon: "cancel",        label: "Venda Perdida",     val: s.totalPerdidos,      color: "#6b7280" },
                ];

                var kpiHtml = "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:2rem'>" +
                    kpis.map(function(k) {
                        return "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:.4rem'>" +
                            "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem'>" +
                            "<span class='material-icons-round' style='font-size:1.1rem;color:" + k.color + "'>" + k.icon + "</span>" +
                            "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em'>" + k.label + "</span>" +
                            "</div>" +
                            "<span style='font-size:1.75rem;font-weight:800;color:" + k.color + "'>" + k.val + "</span>" +
                            "</div>";
                    }).join("") + "</div>";

                // Taxas como barras de progresso
                var taxas = [
                    { label: "Taxa de Identificação", val: s.taxaIdentificacao, color: "#f59e0b", desc: s.totalIdentificados + " de " + s.totalItens + " itens identificados" },
                    { label: "Taxa de Estoque",       val: s.taxaEstoque,       color: "#10b981", desc: s.totalComEstoque + " de " + s.totalIdentificados + " têm estoque disponível" },
                    { label: "Taxa de Venda Perdida", val: s.taxaPerda,         color: "#ef4444", desc: s.totalPerdidos + " de " + s.totalItens + " itens perdidos" },
                ];

                var taxasHtml = "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:2rem'>" +
                    "<h4 style='margin:0 0 1.25rem;font-size:.9rem;color:var(--text-primary)'>Indicadores de Performance</h4>" +
                    taxas.map(function(t) {
                        return "<div style='margin-bottom:1.1rem'>" +
                            "<div style='display:flex;justify-content:space-between;margin-bottom:.3rem'>" +
                            "<span style='font-size:.82rem;color:var(--text-secondary)'>" + t.label + "</span>" +
                            "<span style='font-size:.82rem;font-weight:700;color:" + t.color + "'>" + t.val + "%</span>" +
                            "</div>" +
                            "<div style='height:6px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                            "<div style='height:100%;width:" + t.val + "%;background:" + t.color + ";border-radius:4px;transition:width .5s'></div></div>" +
                            "<div style='font-size:.72rem;color:var(--text-secondary);margin-top:.2rem'>" + t.desc + "</div>" +
                            "</div>";
                    }).join("") + "</div>";

                // Demandas por status
                var statusKeys = Object.keys(s.porStatus);
                var statusHtml = statusKeys.length === 0 ? "" :
                    "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                    "<h4 style='margin:0 0 1.25rem;font-size:.9rem;color:var(--text-primary)'>Cotações por Status</h4>" +
                    "<div style='display:flex;flex-direction:column;gap:.5rem'>" +
                    statusKeys.map(function(sk) {
                        var cnt = s.porStatus[sk] || 0;
                        var pct = s.totalDemandas > 0 ? Math.round((cnt / s.totalDemandas) * 100) : 0;
                        var cor = SC[sk] || "#6b7280";
                        var lbl = SL[sk] || sk;
                        return "<div>" +
                            "<div style='display:flex;justify-content:space-between;margin-bottom:.25rem'>" +
                            "<span style='font-size:.82rem;color:var(--text-secondary)'>" + lbl + "</span>" +
                            "<span style='font-size:.82rem;font-weight:700;color:" + cor + "'>" + cnt + " (" + pct + "%)</span></div>" +
                            "<div style='height:5px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                            "<div style='height:100%;width:" + pct + "%;background:" + cor + ";border-radius:4px'></div></div>" +
                            "</div>";
                    }).join("") + "</div></div>";

                container.innerHTML = kpiHtml + taxasHtml + statusHtml;
            })
            .catch(function(err) {
                container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro ao carregar: " + _esc(err.message || err) + "</p>";
            });
    }

    // ════════════════════════════════════════════════════════
    // VIEW: FILA DE COMPRAS
    // ════════════════════════════════════════════════════════

    function loadFilaCompras() {
        var container = document.getElementById("comprasContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando fila...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }

        DemandaDB.listItensFila(80)
            .then(function(itens) {
                if (itens.length === 0) {
                    container.innerHTML =
                        "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:3rem;opacity:.3'>shopping_cart</span>" +
                        "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Fila vazia</h4>" +
                        "<p style='font-size:.85rem'>Nenhum item aguardando compra no momento.</p></div>";
                    return;
                }

                var SLBL = { sem_estoque:"Sem Estoque", nao_cadastrado:"Não Cadastrado no ERP", catalogado:"Na Base Técnica", encaminhado_compras:"Em Compras", cotacao_fornecedor:"Cotando", compra_possivel:"Compra Possível" };
                var SCOR = { sem_estoque:"#ef4444", nao_cadastrado:"#94a3b8", catalogado:"#60a5fa", encaminhado_compras:"#8b5cf6", cotacao_fornecedor:"#f97316", compra_possivel:"#10b981" };

                // Agrupa por status
                var grupos = {};
                itens.forEach(function(item) {
                    if (!grupos[item.status]) grupos[item.status] = [];
                    grupos[item.status].push(item);
                });

                var html = "<div style='padding:1rem 1.5rem'>" +
                    "<div style='display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap'>" +
                    "<span style='font-size:.88rem;font-weight:700'>" + itens.length + " " + (itens.length === 1 ? "item" : "itens") + " na fila</span>" +
                    "<button class='btn btn-secondary btn-sm' onclick='DemandaApp.loadFilaCompras()' style='margin-left:auto'>" +
                    "<span class='material-icons-round'>refresh</span> Atualizar</button>" +
                    "</div>";

                Object.keys(grupos).forEach(function(status) {
                    var grpItens = grupos[status];
                    var cor = SCOR[status] || "#6366f1";
                    var lbl = SLBL[status] || status;

                    html += "<div style='margin-bottom:1.5rem'>" +
                        "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1px solid var(--border-color)'>" +
                        "<span class='material-icons-round' style='color:" + cor + ";font-size:1rem'>shopping_cart</span>" +
                        "<span style='font-weight:700;color:" + cor + "'>" + lbl + "</span>" +
                        "<span style='font-size:.75rem;color:var(--text-secondary);margin-left:.25rem'>(" + grpItens.length + ")</span></div>" +
                        "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.82rem'>" +
                        "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                        ["Referência","Descrição","Qtd Solicitada","Demanda","Ação"].map(function(h) {
                            return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                        }).join("") + "</tr></thead><tbody>" +
                        grpItens.map(function(item) {
                            var nexts = (typeof DemandaStates !== "undefined") ? DemandaStates.nextStates(item.status) : [];
                            var acaoHtml = nexts.length === 0 ? "—" :
                                "<div style='display:flex;gap:.35rem;align-items:center'>" +
                                "<button onclick=\"DemandaApp._abrirDevolutivaCompras('" + _esc(item.id) + "','" + _esc(item.demandaId) + "')\" " +
                                "style='background:var(--accent-primary);color:#fff;border:none;border-radius:5px;padding:.25rem .6rem;font-size:.73rem;font-weight:600;cursor:pointer;white-space:nowrap'>" +
                                "<span class='material-icons-round' style='font-size:.8rem;vertical-align:middle'>local_shipping</span> Cotar</button>" +
                                "<select onchange=\"DemandaApp.avancarItemFilaCompras('" + _esc(item.id) + "','" + _esc(item.demandaId) + "',this.value,this)\" " +
                                "style='background:var(--bg-dark);border:1px solid var(--border-color);border-radius:5px;padding:.2rem .4rem;color:var(--text-primary);font-size:.73rem;cursor:pointer'>" +
                                "<option value=''>Avançar...</option>" +
                                nexts.map(function(n) { return "<option value='" + n.key + "'>" + n.label + "</option>"; }).join("") +
                                "</select></div>";

                            var cotacaoInfo = "";
                            if (item.compraFornecedor) {
                                cotacaoInfo = "<div style='font-size:.72rem;color:var(--accent-success);font-weight:600;margin-top:.15rem'>" +
                                    _esc(item.compraFornecedor) + (item.compraPrazoDias || item.compraPrazo ? " · " + (item.compraPrazoDias || item.compraPrazo) + "d" : "") +
                                    (item.compraCusto ? " · R$ " + Number(item.compraCusto).toFixed(2).replace(".",",") : "") + "</div>";
                            }

                            return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                                "<td style='padding:.4rem .6rem;font-weight:600'>" + _esc(item.refOriginal || "—") + cotacaoInfo + "</td>" +
                                "<td style='padding:.4rem .6rem;color:var(--text-secondary);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(item.descOriginal || "—") + "</td>" +
                                "<td style='padding:.4rem .6rem;text-align:center'>" + (item.qtdeSolicitada || 1) + "</td>" +
                                "<td style='padding:.4rem .6rem'>" +
                                "<a onclick=\"DemandaApp.abrirDemanda('" + _esc(item.demandaId) + "')\" style='color:var(--primary-color);cursor:pointer;font-size:.78rem;text-decoration:underline'>" +
                                (item.demandaId ? item.demandaId.substring(0, 8) + "..." : "—") + "</a></td>" +
                                "<td style='padding:.4rem .6rem'>" + acaoHtml + "</td>" +
                                "</tr>";
                        }).join("") +
                        "</tbody></table></div></div>";
                });
                html += "</div>";
                container.innerHTML = html;
            })
            .catch(function(err) {
                container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro: " + _esc(err.message || err) + "</p>";
            });
    }

    // Avança estado de item direto pela fila de compras (sem _demandaAtual)
    function avancarItemFilaCompras(itemId, demandaId, novoStatus, selectEl) {
        if (!novoStatus || !demandaId) return;
        if (selectEl) selectEl.value = "";
        if (typeof DemandaDB === "undefined") { _toast("DemandaDB indisponível.", "error"); return; }
        var s = _sessao;
        var por = s ? (s.login || s.nome || "sistema") : "sistema";
        DemandaDB.updateItem(demandaId, itemId, { status: novoStatus }, { evento: "status_changed", por: por, obs: "" })
            .then(function() {
                var sc = (typeof DemandaStates !== "undefined") ? DemandaStates.get(novoStatus) : { label: novoStatus };
                _toast("Status avançado: " + sc.label, "success");
                setTimeout(function() { loadFilaCompras(); }, 300);
            })
            .catch(function(err) { _toast("Erro: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // AUTOSAVE DE RASCUNHO
    // ════════════════════════════════════════════════════════

    var _RASCUNHO_KEY = "demanda_rascunho";

    function _autosave() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            sessionStorage.setItem(_RASCUNHO_KEY + "_" + tid, JSON.stringify({
                itens: _itens, cliente: _clienteAtual, ts: Date.now()
            }));
        } catch(e) {}
    }

    function _restoreRascunho() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            var raw = sessionStorage.getItem(_RASCUNHO_KEY + "_" + tid);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (!data || !data.itens || data.itens.length === 0) return;
            if (Date.now() - data.ts > 24 * 60 * 60 * 1000) return;
            if (confirm("H\u00e1 um rascunho salvo com " + data.itens.length + " item(s). Deseja restaurar?")) {
                _itens = data.itens;
                if (data.cliente) {
                    _clienteAtual = data.cliente;
                    var elNome = document.getElementById("clienteNome");
                    if (elNome) elNome.value = data.cliente.nome || "";
                }
                renderItens();
                _toast("Rascunho restaurado com " + _itens.length + " item(s).", "success");
            }
        } catch(e) {}
    }

    function _limparRascunho() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            sessionStorage.removeItem(_RASCUNHO_KEY + "_" + tid);
        } catch(e) {}
    }

    // ════════════════════════════════════════════════════════
    // TIMELINE VISUAL POR ITEM
    // ════════════════════════════════════════════════════════

    function _renderTimeline(item) {
        var tl = item.timeline || [];
        if (tl.length === 0) return "<p style='color:var(--text-secondary);font-size:.8rem;padding:.3rem 0'>Nenhum evento registrado.</p>";
        var html = "<div style='position:relative;padding-left:1.1rem;border-left:2px solid var(--border-color)'>";
        tl.slice().reverse().forEach(function(e) {
            var sc = (typeof DemandaStates !== "undefined" && e.para) ? DemandaStates.get(e.para) : { label: e.para || "?", color: "#6366f1" };
            var dt = e.em ? new Date(e.em).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
            html += "<div style='position:relative;margin-bottom:.65rem'>" +
                "<div style='position:absolute;left:-1.32rem;top:.3rem;width:.55rem;height:.55rem;border-radius:50%;background:" + sc.color + "'></div>" +
                "<div style='font-size:.72rem;color:var(--text-secondary)'>" + _esc(dt) + (e.por ? " \u00b7 " + _esc(e.por) : "") + "</div>" +
                "<div style='font-size:.78rem;font-weight:600;color:" + sc.color + "'>" + _esc(sc.label || e.para || "?") + "</div>" +
                (e.obs ? "<div style='font-size:.75rem;color:var(--text-secondary);margin-top:.1rem'>" + _esc(e.obs) + "</div>" : "") +
                "</div>";
        });
        return html + "</div>";
    }

    function toggleItemTimeline(itemId) {
        var el  = document.getElementById("timeline_" + itemId);
        if (!el) return;
        var open = el.style.display !== "none";
        el.style.display = open ? "none" : "";
        var btn = document.getElementById("btnTimeline_" + itemId);
        if (btn) btn.querySelector(".material-icons-round").textContent = open ? "history" : "expand_less";
    }

    // ════════════════════════════════════════════════════════
    // IDENTIFICAR ITEM VIA ERP
    // ════════════════════════════════════════════════════════

    var _buscaErpItemId = null;

    function _abrirBuscaERP(itemId) {
        _buscaErpItemId = itemId;
        var modal = document.getElementById("modalBuscaERP");
        if (!modal) { _toast("Modal ERP n\u00e3o encontrado.", "error"); return; }
        var inp = document.getElementById("inpBuscaERP");
        if (inp) { inp.value = ""; setTimeout(function(){ inp.focus(); }, 100); }
        var res = document.getElementById("buscaERPResultados");
        if (res) res.innerHTML = "<p style='color:var(--text-secondary);font-size:.83rem;padding:.5rem 0'>Digite uma refer\u00eancia ou descri\u00e7\u00e3o para buscar.</p>";
        modal.style.display = "flex";
    }

    function _fecharBuscaERP() {
        var modal = document.getElementById("modalBuscaERP");
        if (modal) modal.style.display = "none";
        _buscaErpItemId = null;
    }

    function _executarBuscaERP() {
        var inp = document.getElementById("inpBuscaERP");
        var q   = inp ? inp.value.trim() : "";
        if (q.length < 2) { _toast("Digite ao menos 2 caracteres.", "warning"); return; }
        var res = document.getElementById("buscaERPResultados");
        if (res) res.innerHTML = "<div style='padding:1.5rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='animation:spin 1s linear infinite'>sync</span>" +
            "<br><small>Buscando no ERP...</small></div>";
        if (typeof DemandaSearch === "undefined") {
            if (res) res.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>DemandaSearch n\u00e3o dispon\u00edvel. Configure a integra\u00e7\u00e3o ERP.</p>";
            return;
        }
        DemandaSearch.search(q)
            .then(function(resultados) {
                if (!resultados || resultados.length === 0) {
                    if (res) res.innerHTML = "<p style='color:var(--text-secondary);font-size:.83rem;padding:.5rem'>Nenhum produto encontrado para \"" + _esc(q) + "\".</p>";
                    return;
                }
                var html = resultados.slice(0, 15).map(function(p) {
                    var estoque = p.estoqueFilial !== undefined ? p.estoqueFilial : (p.saldo !== undefined ? p.saldo : null);
                    var badge   = (estoque !== null && estoque > 0) ? "#10b981" : "#ef4444";
                    var estoqTxt = estoque !== null ? (estoque > 0 ? "Estoque: " + estoque : "Sem estoque") : "";
                    var pid = JSON.stringify({ erpId: p.erpId || p.referencia || p.codigo || "", desc: p.descricao || p.nome || "", fabricante: p.fabricante || "", estoque: estoque, preco: p.preco || 0 });
                    return "<div style='border:1px solid var(--border-color);border-radius:8px;padding:.7rem;margin-bottom:.5rem'>" +
                        "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem'>" +
                        "<div><div style='font-weight:700;font-size:.84rem'>" + _esc(p.referencia || p.codigo || p.erpId || "?") + "</div>" +
                        "<div style='font-size:.77rem;color:var(--text-secondary)'>" + _esc(p.descricao || p.nome || "\u2014") + "</div>" +
                        (p.fabricante ? "<div style='font-size:.7rem;color:var(--text-secondary)'>" + _esc(p.fabricante) + "</div>" : "") + "</div>" +
                        "<div style='text-align:right;flex-shrink:0'>" +
                        (estoqTxt ? "<span style='font-size:.7rem;padding:.12rem .4rem;border-radius:6px;background:" + badge + "22;color:" + badge + "'>" + estoqTxt + "</span>" : "") +
                        (p.preco ? "<div style='font-size:.72rem;color:var(--text-secondary);margin-top:.2rem'>R$ " + Number(p.preco).toFixed(2).replace(".",",") + "</div>" : "") +
                        "</div></div>" +
                        "<button onclick=\"DemandaApp._vincularProduto(" + pid.replace(/\"/g, "&quot;") + ")\" " +
                        "style='margin-top:.45rem;background:var(--accent-primary);color:#fff;border:none;border-radius:5px;padding:.28rem .75rem;font-size:.75rem;cursor:pointer;width:100%'>Vincular este produto</button>" +
                        "</div>";
                }).join("");
                if (res) res.innerHTML = html;
            })
            .catch(function(err) {
                if (res) res.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Erro: " + _esc(err.message || String(err)) + "</p>";
            });
    }

    function _vincularProduto(produto) {
        if (!_buscaErpItemId || !_demandaAtual) { _toast("Contexto perdido. Reabra a cotação.", "error"); return; }
        if (typeof produto === "string") { try { produto = JSON.parse(produto); } catch(e) { _toast("Erro ao processar produto.", "error"); return; } }
        var itemId = _buscaErpItemId;
        var por    = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var fields = {
            erpProdutoId:   produto.erpId || "",
            erpProdutoDesc: produto.desc  || "",
            fabricante:     produto.fabricante || "",
            estoqueFilial:  produto.estoque !== undefined ? produto.estoque : null,
            preco:          produto.preco  || null,
            status:         "identificado"
        };
        var tl = { evento: "produto_vinculado", para: "identificado", por: por, obs: "ERP: " + (produto.erpId || "") };
        DemandaDB.updateItem(_demandaAtual.id, itemId, fields, tl)
            .then(function() {
                for (var i = 0; i < _demandaAtual.itens.length; i++) {
                    if (_demandaAtual.itens[i].id === itemId) { Object.assign(_demandaAtual.itens[i], fields); break; }
                }
                _fecharBuscaERP();
                _renderDemandaDetalheBody();
                loadDemandasLista(_filterAtual);
                _toast("Produto " + (produto.erpId || "") + " vinculado!", "success");
            })
            .catch(function(err) { _toast("Erro ao vincular: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // QUANTIDADE PARCIAL — SPLIT DE ITEM
    // ════════════════════════════════════════════════════════

    function _confirmarQuantidadeParcial(itemId, deStatus, paraStatus) {
        var item = null;
        for (var i = 0; i < _demandaAtual.itens.length; i++) {
            if (_demandaAtual.itens[i].id === itemId) { item = _demandaAtual.itens[i]; break; }
        }
        var qtdeSol = item ? (item.qtdeSolicitada || 1) : 1;
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:360px;max-width:90vw'>" +
            "<h4 style='margin:0 0 .75rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:var(--accent-primary)'>call_split</span>Quantidade Dispon\u00edvel</h4>" +
            "<p style='font-size:.83rem;color:var(--text-secondary);margin-bottom:1rem'>Qtde solicitada: <strong style='color:var(--text-primary)'>" + qtdeSol + "</strong></p>" +
            "<label style='font-size:.82rem;color:var(--text-secondary);display:block;margin-bottom:.4rem'>Qtde atendida pelo estoque:</label>" +
            "<input id='_qtdeAtendidaInp' type='number' min='1' max='" + qtdeSol + "' value='" + qtdeSol + "' " +
            "style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.45rem .7rem;color:var(--text-primary);box-sizing:border-box;margin-bottom:.5rem'>" +
            "<p style='font-size:.74rem;color:var(--text-secondary);margin-bottom:1rem'>Se menor que " + qtdeSol + ", a qtde faltante retorna como nova cotação pendente.</p>" +
            "<div style='display:flex;gap:.5rem;justify-content:flex-end'>" +
            "<button onclick='this.closest(\"div[style*=inset]\").remove()' style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .9rem;color:var(--text-secondary);cursor:pointer'>Cancelar</button>" +
            "<button id='_btnConfirmarQtde' style='background:var(--accent-success);border:none;border-radius:6px;padding:.4rem 1rem;color:#fff;cursor:pointer;font-weight:600'>Confirmar</button>" +
            "</div></div>";
        document.body.appendChild(overlay);
        document.getElementById("_btnConfirmarQtde").onclick = function() {
            var qtdeAtendida = parseInt(document.getElementById("_qtdeAtendidaInp").value, 10) || qtdeSol;
            overlay.remove();
            _persistirTransicao(itemId, deStatus, paraStatus, "");
            if (qtdeAtendida < qtdeSol && typeof DemandaDB !== "undefined" && DemandaDB.splitItem) {
                var faltante = qtdeSol - qtdeAtendida;
                DemandaDB.splitItem(_demandaAtual.id, itemId, qtdeAtendida, faltante)
                    .then(function() {
                        _toast(qtdeAtendida + " atendidos; " + faltante + " retornam como nova cotação.", "info");
                        abrirDemanda(_demandaAtual.id);
                    })
                    .catch(function(e) { _toast("Erro no split: " + e.message, "error"); });
            }
        };
    }

    // ════════════════════════════════════════════════════════
    // DEVOLUTIVA DE COMPRAS
    // ════════════════════════════════════════════════════════

    function _abrirDevolutivaCompras(itemId, demandaId) {
        var old = document.getElementById("overlayDevolutiva"); if (old) old.remove();
        var overlay = document.createElement("div");
        overlay.id = "overlayDevolutiva";
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";
        var fi = function(lbl, id, type, ph) {
            return "<div><label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.25rem'>" + lbl + "</label>" +
                "<input id='" + id + "' type='" + type + "' placeholder='" + ph + "' " +
                "style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .65rem;color:var(--text-primary);box-sizing:border-box'></div>";
        };
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:400px;max-width:90vw;max-height:90vh;overflow-y:auto'>" +
            "<h4 style='margin:0 0 1rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:var(--accent-primary)'>local_shipping</span>Devolutiva de Compras</h4>" +
            "<div style='display:grid;gap:.6rem'>" +
            fi("Fornecedor *", "_devFornecedor", "text", "Ex: Rolamentos Irm\u00e3os") +
            fi("Marca / Fabricante", "_devMarca", "text", "Ex: SKF, NSK, FAG") +
            fi("Custo unit\u00e1rio (R$)", "_devCusto", "number", "0.00") +
            fi("Qtde dispon\u00edvel", "_devQtde", "number", "1") +
            fi("Prazo estimado (dias)", "_devPrazo", "number", "7") +
            fi("Observa\u00e7\u00e3o", "_devObs", "text", "Opcional") +
            "</div>" +
            "<div style='display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem'>" +
            "<button onclick=\"document.getElementById('overlayDevolutiva').remove()\" " +
            "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .9rem;color:var(--text-secondary);cursor:pointer'>Cancelar</button>" +
            "<button onclick=\"DemandaApp._confirmarDevolutiva('" + itemId + "','" + demandaId + "')\" " +
            "style='background:var(--accent-primary);border:none;border-radius:6px;padding:.4rem 1rem;color:#fff;cursor:pointer;font-weight:600'>Confirmar</button>" +
            "</div></div>";
        document.body.appendChild(overlay);
    }

    function _confirmarDevolutiva(itemId, demandaId) {
        var g = function(id) { return (document.getElementById(id) || {}).value || ""; };
        var fornecedor = g("_devFornecedor");
        if (!fornecedor) { _toast("Informe o fornecedor.", "warning"); return; }
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var custo = parseFloat(g("_devCusto")) || 0;
        var prazo = parseInt(g("_devPrazo"), 10) || 0;
        var qtde  = parseInt(g("_devQtde"), 10) || 1;
        var obs   = g("_devObs");

        var fields = {
            compraFornecedor: fornecedor,
            compraMarca:      g("_devMarca"),
            compraCusto:      custo,
            compraQtde:       qtde,
            compraPrazoDias:  prazo,
            compraPrazo:      prazo,
            status:           "compra_possivel"
        };
        var tl = {
            evento: "devolutiva_compras",
            de: "cotacao_fornecedor",
            para: "compra_possivel",
            por: por,
            obs: "Fornecedor: " + fornecedor + " | Custo: R$ " + custo.toFixed(2) + " | Prazo: " + prazo + "d" + (obs ? " | " + obs : "")
        };

        DemandaDB.updateItem(demandaId, itemId, fields, tl)
            .then(function() {
                var el = document.getElementById("overlayDevolutiva"); if (el) el.remove();
                _toast("Devolutiva registrada: Compra Possível (" + fornecedor + ")", "success");
                loadFilaCompras();
                if (typeof loadOrcamento === "function") loadOrcamento();
            })
            .catch(function(err) { _toast("Erro: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // VIEW: ORÇAMENTO BÁSICO & EMISSÃO DE PEDIDO ERP
    // ════════════════════════════════════════════════════════

    function loadOrcamento() {
        var container = document.getElementById("orcamentoContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando orçamentos...</p></div>";
        if (typeof DemandaDB === "undefined") { container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return; }
        var STATUS_ORC = ["estoque_disponivel", "estoque_parcial", "compra_possivel", "proposta_enviada", "aguardando_cliente", "venda_aprovada", "pedido_criado_erp"];
        DemandaDB.listDemandas({ status: "todas", limit: 60 })
            .then(function(demandas) {
                return Promise.all(demandas.map(function(d) {
                    return DemandaDB.getItens(d.id).then(function(itens) { return { demanda: d, itens: itens }; });
                }));
            })
            .then(function(todos) {
                var comItens = todos.filter(function(t) {
                    return t.itens.some(function(i) { return STATUS_ORC.indexOf(i.status) >= 0; });
                });
                if (comItens.length === 0) {
                    container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:2.5rem;opacity:.4'>description</span>" +
                        "<p style='margin-top:.75rem'>Nenhum item em orçamento.</p>" +
                        "<small>Itens em Estoque, Compra Possível, Proposta Enviada, Aguardando Cliente ou Venda Aprovada aparecem aqui.</small></div>";
                    return;
                }
                var html = comItens.map(function(t) {
                    var d = t.demanda;
                    var itensOrc = t.itens.filter(function(i) { return STATUS_ORC.indexOf(i.status) >= 0; });
                    var total = itensOrc.reduce(function(acc, i) { return acc + ((i.preco || i.precoUnitario || 0) * (i.qtdeSolicitada || 1)); }, 0);
                    var dt = d.criadoEm && d.criadoEm.toDate ? d.criadoEm.toDate().toLocaleDateString("pt-BR") : "—";
                    var hasApproved = itensOrc.some(function(i) { return i.status === "venda_aprovada"; });

                    var rows = itensOrc.map(function(item) {
                        var sc = (typeof DemandaStates !== "undefined") ? DemandaStates.get(item.status) : { label: item.status, color: "#6366f1" };
                        var btnAprovar = (!["venda_aprovada", "pedido_criado_erp"].includes(item.status))
                            ? "<button onclick=\"DemandaApp._aprovarItemOrcamento('" + d.id + "','" + item.id + "')\" " +
                              "style='background:var(--accent-success);color:#fff;border:none;border-radius:4px;padding:.2rem .55rem;font-size:.72rem;cursor:pointer;margin-right:.3rem'>Aprovar</button>" : "";
                        var btnPerder = item.status !== "pedido_criado_erp" ? "<button onclick=\"DemandaApp._perderItemOrcamento('" + d.id + "','" + item.id + "','" + item.status + "')\" " +
                            "style='background:var(--accent-danger);color:#fff;border:none;border-radius:4px;padding:.2rem .55rem;font-size:.72rem;cursor:pointer'>Perder</button>" : "";

                        var compraTag = "";
                        if (item.compraFornecedor) {
                            compraTag = "<div style='font-size:.7rem;color:var(--accent-success)'>Forn: " + _esc(item.compraFornecedor) + " (" + (item.compraPrazoDias || 0) + "d)</div>";
                        }

                        var prcVal = item.preco || item.precoUnitario || (item.compraCusto ? item.compraCusto * 1.35 : 0);

                        return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                            "<td style='padding:.38rem .5rem;font-weight:600;font-size:.8rem'>" + _esc(item.refOriginal || item.erpProdutoId || "—") + compraTag + "</td>" +
                            "<td style='padding:.38rem .5rem;color:var(--text-secondary);font-size:.78rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(item.descOriginal || item.erpProdutoDesc || "—") + "</td>" +
                            "<td style='padding:.38rem .5rem;text-align:center'>" + (item.qtdeSolicitada || 1) + "</td>" +
                            "<td style='padding:.38rem .5rem'><span style='font-size:.7rem;padding:.12rem .45rem;border-radius:8px;background:" + sc.color + "22;color:" + sc.color + "'>" + _esc(sc.label) + "</span></td>" +
                            "<td style='padding:.38rem .5rem'>" + (prcVal ? "R$ " + Number(prcVal).toFixed(2).replace(".",",") : "Consulte") + "</td>" +
                            "<td style='padding:.38rem .5rem'>" + btnAprovar + btnPerder + "</td></tr>";
                    }).join("");

                    var erpStatusBadge = d.erpSaleId
                        ? "<span style='padding:.25rem .6rem;border-radius:6px;background:rgba(16,185,129,.15);color:#10b981;font-size:.78rem;font-weight:700;display:inline-flex;align-items:center;gap:.3rem'>" +
                          "<span class='material-icons-round' style='font-size:.9rem'>receipt_long</span> Pedido ERP #" + _esc(d.erpSaleId) + "</span>"
                        : "";

                    var btnGerarPedido = (!d.erpSaleId && hasApproved)
                        ? "<button onclick=\"DemandaApp._gerarPedidoERP('" + d.id + "')\" " +
                          "style='background:var(--accent-primary);color:#fff;border:none;border-radius:6px;padding:.35rem .9rem;font-size:.78rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem'>" +
                          "<span class='material-icons-round' style='font-size:.9rem'>shopping_bag</span> Gerar Pedido no ERP</button>"
                        : "";

                    return "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1rem'>" +
                        "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem'>" +
                        "<div><div style='font-weight:700;font-size:.95rem'>" + _esc(d.codigo) + "</div>" +
                        "<div style='font-size:.8rem;color:var(--text-secondary)'>" + _esc(d.clienteNome || "Cliente Avulso") + " · " + dt + "</div></div>" +
                        (total > 0 ? "<div style='text-align:right'><div style='font-size:.7rem;color:var(--text-secondary)'>Total estimado</div>" +
                            "<div style='font-weight:700;color:var(--accent-success)'>R$ " + total.toFixed(2).replace(".",",") + "</div></div>" : "") + "</div>" +
                        "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                        "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                        ["Referência","Descrição","Qtd","Status","Preço","Ação"].map(function(h) {
                            return "<th style='padding:.35rem .5rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                        }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
                        "<div style='margin-top:.75rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem'>" +
                        "<div>" + erpStatusBadge + "</div>" +
                        "<div style='display:flex;gap:.5rem'>" +
                        btnGerarPedido +
                        "<button onclick='window.print()' style='background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.3rem .8rem;color:var(--text-secondary);cursor:pointer;font-size:.78rem'>" +
                        "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>print</span> Imprimir Proposta</button></div></div></div>";
                }).join("");
                container.innerHTML = html;
            })
            .catch(function(err) { container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro: " + _esc(err.message || String(err)) + "</p>"; });
    }

    function _aprovarItemOrcamento(demandaId, itemId) {
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        DemandaDB.updateItem(demandaId, itemId, { status: "venda_aprovada" },
            { evento: "status_changed", para: "venda_aprovada", por: por, obs: "Aprovado no orçamento" })
            .then(function() { _toast("Venda aprovada!", "success"); loadOrcamento(); })
            .catch(function(e) { _toast("Erro: " + e.message, "error"); });
    }

    function _gerarPedidoERP(demandaId) {
        if (!confirm("Deseja emitir o Pedido de Venda no ERP MaxData para os itens aprovados?")) return;

        _toast("Comunicando com a API do ERP MaxData...", "info");

        DemandaDB.getDemanda(demandaId)
            .then(function(demanda) {
                if (!demanda) throw new Error("Cotação não encontrada.");
                var itens = demanda.itens || [];
                var itensAprovados = itens.filter(function(i) {
                    return i.status === "venda_aprovada" || i.status === "estoque_disponivel";
                });

                if (itensAprovados.length === 0) {
                    throw new Error("Nenhum item com status 'Aprovado' para gerar pedido no ERP.");
                }

                var adapter = null;
                if (window.ErpIntegration && ErpIntegration.getActive) {
                    adapter = ErpIntegration.getActive();
                } else if (window.MaxDataAdapter) {
                    var cfg = JSON.parse(sessionStorage.getItem("_demanda_erp_config") || "{}");
                    adapter = new MaxDataAdapter("centralpecas", cfg);
                }

                if (!adapter || typeof adapter.createSale !== "function") {
                    throw new Error("Adapter do MaxData não suporta createSale ou não está carregado.");
                }

                var saleData = {
                    clienteId: demanda.clienteId || 1,
                    vendedorId: (_sessao && _sessao.filialId) ? _sessao.filialId : 1,
                    demandaCodigo: demanda.codigo,
                    obs: demanda.obs || ""
                };

                return adapter.createSale(saleData, itensAprovados)
                    .then(function(res) {
                        var vendaId = res.vendaId;
                        _toast("Pedido de Venda #" + vendaId + " gerado no MaxData com sucesso!", "success");

                        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
                        var promises = itensAprovados.map(function(item) {
                            return DemandaDB.updateItem(demandaId, item.id, {
                                status: "pedido_criado_erp",
                                erpSaleId: String(vendaId)
                            }, {
                                evento: "pedido_erp_criado",
                                para: "pedido_criado_erp",
                                por: por,
                                obs: "Pedido MaxData #" + vendaId
                            });
                        });

                        promises.push(DemandaDB.updateDemanda(demandaId, {
                            erpSaleId: String(vendaId),
                            status: "encerrada"
                        }));

                        return Promise.all(promises);
                    });
            })
            .then(function() {
                loadOrcamento();
                loadDemandasLista(_filterAtual);
            })
            .catch(function(err) {
                console.error("[DemandaApp] Erro ao gerar pedido no ERP:", err);
                _toast("Erro ao gerar pedido no ERP: " + (err.message || err), "error");
            });
    }

    function _perderItemOrcamento(demandaId, itemId, deStatus) {
        _demandaAtual = { id: demandaId, data: {}, itens: [{ id: itemId, status: deStatus }] };
        _confirmarVendaPerdida(itemId, deStatus);
    }


    // ════════════════════════════════════════════════════════
    // VIEW: RELATÓRIOS GERENCIAIS & INTELIGÊNCIA COMERCIAL
    // ════════════════════════════════════════════════════════

    function loadRelatorios() {
        var container = document.getElementById("relatoriosContainer");
        if (!container) return;

        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Calculando indicadores de inteligência comercial...</p></div>";

        var selectP = document.getElementById("relatorioFiltroPeriodo");
        var valP = selectP ? selectP.value : "30";
        var dias = null;
        if (valP === "7") dias = 7;
        else if (valP === "30") dias = 30;
        else if (valP === "mes") dias = new Date().getDate();

        if (typeof DemandaDB === "undefined" || typeof DemandaDB.getRelatoriosData !== "function") {
            container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Função getRelatoriosData não disponível no DemandaDB.</p>";
            return;
        }

        DemandaDB.getRelatoriosData(dias)
            .then(function(dados) {
                _relatorioDataCache = dados;
                renderRelatorioSubTab();
            })
            .catch(function(err) {
                container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro ao gerar relatórios: " + _esc(err.message || err) + "</p>";
            });
    }

    function switchRelatorioTab(tab) {
        _relatorioAtualTab = tab;
        ["perdas", "faltas", "novos", "performance"].forEach(function(t) {
            var el = document.getElementById("subtab-" + t);
            if (el) {
                if (t === tab) el.classList.add("active");
                else el.classList.remove("active");
            }
        });
        renderRelatorioSubTab();
    }

    function renderRelatorioSubTab() {
        var container = document.getElementById("relatoriosContainer");
        if (!container || !_relatorioDataCache) return;

        var d = _relatorioDataCache;
        var r = d.resumo || {};

        if (_relatorioAtualTab === "perdas") {
            var motKeys = Object.keys(d.perdas.porMotivo || {});
            var motHtml = motKeys.length === 0 ? "<p style='color:var(--text-secondary);font-size:.85rem'>Nenhuma perda registrada no período.</p>" :
                motKeys.map(function(k) {
                    var m = d.perdas.porMotivo[k];
                    var pct = r.valorTotalPerdido > 0 ? Math.round((m.valor / r.valorTotalPerdido) * 100) : 0;
                    return "<div style='margin-bottom:.85rem'>" +
                        "<div style='display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.25rem'>" +
                        "<span style='font-weight:600;text-transform:capitalize'>" + _esc(k) + " (" + m.count + " itens)</span>" +
                        "<span style='color:var(--accent-danger);font-weight:700'>R$ " + m.valor.toFixed(2).replace(".",",") + " (" + pct + "%)</span>" +
                        "</div>" +
                        "<div style='height:6px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                        "<div style='height:100%;width:" + pct + "%;background:var(--accent-danger);border-radius:4px'></div></div></div>";
                }).join("");

            var listaHtml = (d.perdas.lista || []).slice(0, 30).map(function(it) {
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.45rem .6rem'>" + _esc(it.data) + "</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:600'>" + _esc(it.demandaCodigo) + "</td>" +
                    "<td style='padding:.45rem .6rem'>" + _esc(it.cliente) + "</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:600;color:var(--primary-color)'>" + _esc(it.referencia) + "</td>" +
                    "<td style='padding:.45rem .6rem;color:var(--text-secondary)'>" + _esc(it.descricao) + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center'>" + it.qtde + "</td>" +
                    "<td style='padding:.45rem .6rem'><span class='badge' style='background:rgba(239,68,68,.15);color:#ef4444;text-transform:capitalize'>" + _esc(it.motivo) + "</span></td>" +
                    "<td style='padding:.45rem .6rem;font-weight:700;color:var(--accent-danger)'>R$ " + Number(it.valor).toFixed(2).replace(".",",") + "</td>" +
                    "</tr>";
            }).join("");

            container.innerHTML =
                "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem'>" +
                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;display:flex;flex-direction:column;gap:.3rem'>" +
                "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase'>Valor Total Perdido</span>" +
                "<span style='font-size:1.75rem;font-weight:800;color:var(--accent-danger)'>R$ " + (r.valorTotalPerdido || 0).toFixed(2).replace(".",",") + "</span>" +
                "<span style='font-size:.72rem;color:var(--text-secondary)'>" + (r.totalItensPerdidos || 0) + " itens não convertidos</span></div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;display:flex;flex-direction:column;gap:.3rem'>" +
                "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase'>Taxa de Venda Perdida</span>" +
                "<span style='font-size:1.75rem;font-weight:800;color:#f59e0b'>" + (r.taxaPerda || 0) + "%</span>" +
                "<span style='font-size:.72rem;color:var(--text-secondary)'>" + (r.cotacoesPerdidas || 0) + " de " + (r.totalCotacoes || 0) + " cotações</span></div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;display:flex;flex-direction:column;gap:.3rem'>" +
                "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase'>Valor Total Cotado</span>" +
                "<span style='font-size:1.75rem;font-weight:800;color:var(--primary-color)'>R$ " + (r.valorTotalCotado || 0).toFixed(2).replace(".",",") + "</span>" +
                "<span style='font-size:.72rem;color:var(--text-secondary)'>Potencial comercial total</span></div>" +
                "</div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1.5rem'>" +
                "<h4 style='margin:0 0 1rem;font-size:.9rem;color:var(--text-primary);display:flex;align-items:center;gap:.5rem'>" +
                "<span class='material-icons-round' style='color:var(--accent-danger);font-size:1.1rem'>pie_chart</span> Perdas Financeiras por Motivo</h4>" +
                motHtml + "</div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                "<h4 style='margin:0 0 1rem;font-size:.9rem;color:var(--text-primary)'>Últimas Vendas Perdidas Detalhadas</h4>" +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["Data","Cotação","Cliente","Referência","Descrição","Qtd","Motivo","Valor Perdido"].map(function(h) {
                    return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + (listaHtml || "<tr><td colspan='8' style='padding:1.5rem;text-align:center;color:var(--text-secondary)'>Nenhum registro encontrado.</td></tr>") +
                "</tbody></table></div></div>";
        }
        else if (_relatorioAtualTab === "faltas") {
            var rowsFaltas = (d.demandaReprimida || []).map(function(it, idx) {
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.45rem .6rem;font-weight:700;color:var(--primary-color)'>#" + (idx + 1) + "</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:600'>" + _esc(it.referencia) + "</td>" +
                    "<td style='padding:.45rem .6rem;color:var(--text-secondary)'>" + _esc(it.descricao) + "</td>" +
                    "<td style='padding:.45rem .6rem'>" + _esc(it.fabricante) + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center;font-weight:700'>" + it.pedidosCount + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center;font-weight:700;color:var(--accent-warning)'>" + it.qtdeTotal + " un</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:700;color:var(--accent-success)'>" + (it.valorEstimado > 0 ? "R$ " + it.valorEstimado.toFixed(2).replace(".",",") : "Consulte") + "</td>" +
                    "</tr>";
            }).join("");

            container.innerHTML =
                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                "<div style='margin-bottom:1rem'>" +
                "<h4 style='margin:0 0 .25rem;font-size:.95rem;color:var(--text-primary)'>Demanda Reprimida — Top Peças Mais Cotadas Sem Estoque</h4>" +
                "<p style='font-size:.78rem;color:var(--text-secondary)'>Guia direto para o setor de compras priorizar a reposição e montagem de estoque regional.</p>" +
                "</div>" +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["Rank","Referência","Descrição","Fabricante","Cotações","Qtd Solicitada","Valor Potencial"].map(function(h) {
                    return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + (rowsFaltas || "<tr><td colspan='7' style='padding:2rem;text-align:center;color:var(--text-secondary)'>Nenhuma falta de estoque identificada no período.</td></tr>") +
                "</tbody></table></div></div>";
        }
        else if (_relatorioAtualTab === "novos") {
            var rowsNovos = (d.novosSkus || []).map(function(it) {
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.45rem .6rem;font-weight:700;color:var(--primary-color)'>" + _esc(it.referencia) + "</td>" +
                    "<td style='padding:.45rem .6rem;color:var(--text-secondary)'>" + _esc(it.descricao) + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center;font-weight:700'>" + it.cotacoesCount + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center'>" + it.qtdeSolicitada + " un</td>" +
                    "<td style='padding:.45rem .6rem;font-size:.75rem;color:var(--text-secondary)'>" + _esc(it.clientes) + "</td>" +
                    "</tr>";
            }).join("");

            container.innerHTML =
                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                "<div style='margin-bottom:1rem'>" +
                "<h4 style='margin:0 0 .25rem;font-size:.95rem;color:var(--text-primary)'>Novos SKUs — Peças Demandadas Sem Cadastro no ERP</h4>" +
                "<p style='font-size:.78rem;color:var(--text-secondary)'>Itens solicitados pelo mercado no balcão que ainda não existem cadastrados no MaxData.</p>" +
                "</div>" +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["Referência Solicitada","Descrição Recebida","Cotações","Qtd Total","Clientes Solicitantes"].map(function(h) {
                    return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + (rowsNovos || "<tr><td colspan='5' style='padding:2rem;text-align:center;color:var(--text-secondary)'>Todos os itens cotados possuem cadastro oficial no ERP.</td></tr>") +
                "</tbody></table></div></div>";
        }
        else if (_relatorioAtualTab === "performance") {
            var rowsVend = (d.vendedores || []).map(function(v) {
                var tx = v.total > 0 ? Math.round((v.aprovadas / v.total) * 100) : 0;
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.45rem .6rem;font-weight:600'>" + _esc(v.nome) + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center'>" + v.total + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center;color:var(--accent-success);font-weight:700'>" + v.aprovadas + "</td>" +
                    "<td style='padding:.45rem .6rem;text-align:center;color:var(--accent-danger)'>" + v.perdidas + "</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:700;color:var(--accent-success)'>R$ " + v.valorVendido.toFixed(2).replace(".",",") + "</td>" +
                    "<td style='padding:.45rem .6rem;color:var(--accent-danger)'>R$ " + v.valorPerdido.toFixed(2).replace(".",",") + "</td>" +
                    "<td style='padding:.45rem .6rem;font-weight:700'>" + tx + "%</td>" +
                    "</tr>";
            }).join("");

            container.innerHTML =
                "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem'>" +
                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;display:flex;flex-direction:column;gap:.3rem'>" +
                "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase'>Taxa de Conversão Geral</span>" +
                "<span style='font-size:1.75rem;font-weight:800;color:var(--accent-success)'>" + (r.taxaConversao || 0) + "%</span>" +
                "<span style='font-size:.72rem;color:var(--text-secondary)'>" + (r.cotacoesAprovadas || 0) + " convertidas</span></div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;display:flex;flex-direction:column;gap:.3rem'>" +
                "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase'>Total Vendido em Pedidos</span>" +
                "<span style='font-size:1.75rem;font-weight:800;color:var(--accent-success)'>R$ " + (r.valorTotalVendido || 0).toFixed(2).replace(".",",") + "</span>" +
                "<span style='font-size:.72rem;color:var(--text-secondary)'>Pedidos emitidos no período</span></div>" +
                "</div>" +

                "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                "<h4 style='margin:0 0 1rem;font-size:.9rem;color:var(--text-primary)'>Desempenho Comercial por Vendedor</h4>" +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["Vendedor","Cotações","Aprovadas","Perdidas","R$ Vendido","R$ Perdido","Conversão"].map(function(h) {
                    return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + (rowsVend || "<tr><td colspan='7' style='padding:1.5rem;text-align:center;color:var(--text-secondary)'>Nenhum dado comercial no período.</td></tr>") +
                "</tbody></table></div></div>";
        }
    }

    function imprimirRelatorio() {
        window.print();
    }

    function exportarRelatorioCSV() {
        if (!_relatorioDataCache) {
            _toast("Carregue o relatório antes de exportar.", "warning");
            return;
        }

        var csv = "";
        var filename = "relatorio_cotacao_" + _relatorioAtualTab + ".csv";

        if (_relatorioAtualTab === "perdas") {
            csv = "Data;Cotacao;Cliente;Vendedor;Referencia;Descricao;Quantidade;Motivo;Tipo;Valor_Perdido\n";
            (_relatorioDataCache.perdas.lista || []).forEach(function(it) {
                csv += [it.data, it.demandaCodigo, it.cliente, it.vendedor, it.referencia, it.descricao, it.qtde, it.motivo, it.tipo, it.valor.toFixed(2)].map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";") + "\n";
            });
        } else if (_relatorioAtualTab === "faltas") {
            csv = "Ranking;Referencia;Descricao;Fabricante;Cotacoes;Qtde_Solicitada;Valor_Potencial\n";
            (_relatorioDataCache.demandaReprimida || []).forEach(function(it, idx) {
                csv += [idx + 1, it.referencia, it.descricao, it.fabricante, it.pedidosCount, it.qtdeTotal, it.valorEstimado.toFixed(2)].map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";") + "\n";
            });
        } else if (_relatorioAtualTab === "novos") {
            csv = "Referencia;Descricao;Cotacoes;Qtde_Solicitada;Clientes\n";
            (_relatorioDataCache.novosSkus || []).forEach(function(it) {
                csv += [it.referencia, it.descricao, it.cotacoesCount, it.qtdeSolicitada, it.clientes].map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";") + "\n";
            });
        } else {
            csv = "Vendedor;Total_Cotacoes;Aprovadas;Perdidas;Valor_Vendido;Valor_Perdido\n";
            (_relatorioDataCache.vendedores || []).forEach(function(v) {
                csv += [v.nome, v.total, v.aprovadas, v.perdidas, v.valorVendido.toFixed(2), v.valorPerdido.toFixed(2)].map(function(val){ return '"' + String(val).replace(/"/g, '""') + '"'; }).join(";") + "\n";
            });
        }

        var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        _toast("Arquivo CSV exportado com sucesso!", "success");
    }


    // ════════════════════════════════════════════════════════
    // VIEW: COTAÇÃO DO CONCORRENTE
    // ════════════════════════════════════════════════════════

    var _concItens = [];
                _concClienteSelecionado = null;
    var _CONC_INP  = "width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:5px;padding:.3rem .55rem;color:var(--text-primary);font-size:.8rem;box-sizing:border-box";

    function _concDB() {
        if (typeof firebase === "undefined" || typeof DemandaDB === "undefined") return null;
        return firebase.firestore().collection("tenants").doc(DemandaDB.TENANT_ID).collection("cotacoes_concorrente");
    }

    function loadConcorrente() {
        if (_concItens.length === 0) _concAddItem();
        _renderConcorrenteForm();
        _loadHistoricoConcorrente();
    }

    function _renderConcorrenteForm() {
        var fc = document.getElementById("concFormContainer");
        if (!fc) return;
        fc.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
            "<h3 style='margin:0 0 1rem;font-size:.95rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:#f59e0b'>trending_up</span>Nova Cotação do Concorrente</h3>" +
            "<div style='display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:.75rem;margin-bottom:.75rem'>" +
            _concField("concNome", "Concorrente *", "text", "Ex: Distribuidora ABC", "list='concNomeSugestoes'") +
            "<div>" +
                "<label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>Cliente <span style=\'color:var(--accent-danger);font-weight:bold;\'>*</span></label>" +
                "<div style='position:relative'>" +
                    "<input id='concCliente' type='text' placeholder='Buscar ou digitar cliente (obrigat\u00f3rio)...' list='concClienteSugestoes' autocomplete='off' style='" + _CONC_INP + "' oninput='this.style.borderColor=\'\';DemandaApp._onConcClienteInput(this.value)' onfocus='DemandaApp._onConcClienteFocus(this)'>" +
                    "<div id='concClienteDropdown' class='client-dropdown' style='width:100%;left:0;right:0;top:100%;'></div>" +
                "</div>" +
            "</div>" +
            _concField("concObs", "Observação", "text", "Contexto opcional", "") +
            "</div>" +
            "<datalist id='concNomeSugestoes'></datalist>" +
            "<datalist id='concClienteSugestoes'></datalist>" +
            "<div style='overflow-x:auto;margin-bottom:.75rem'>" +
            "<table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
            "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
            ["#","Referência","Descrição","Qtde","Preço Concorrente","Preço Nosso","Diferença",""].map(function(h) {
                return "<th style='padding:.35rem .4rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase;white-space:nowrap'>" + h + "</th>";
            }).join("") +
            "</tr></thead>" +
            "<tbody id='concTbody'></tbody>" +
            "</table></div>" +
            "<div style='display:flex;gap:.5rem;align-items:center;flex-wrap:wrap'>" +
            "<button onclick='DemandaApp._concAddItem()' style='background:transparent;border:1px dashed var(--border-color);border-radius:6px;padding:.3rem .75rem;color:var(--text-secondary);cursor:pointer;font-size:.8rem'>" +
            "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>add</span> Adicionar item</button>" +
            "<button onclick='DemandaApp._salvarCotacaoConcorrente()' style='margin-left:auto;background:var(--accent-primary);color:#fff;border:none;border-radius:6px;padding:.4rem 1.1rem;font-size:.85rem;cursor:pointer;font-weight:600'>" +
            "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>save</span> Salvar Cotação</button>" +
            "</div></div>";
        _renderConcTbody();
        _populateConcSugestoes();
        _atualizarSugestoesClientesConcorrente();
    }

    function _concField(id, label, type, ph, extra) {
        return "<div><label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>" + label + "</label>" +
            "<input id='" + id + "' type='" + type + "' placeholder='" + ph + "' " + (extra||'') + " style='" + _CONC_INP + "'></div>";
    }

    function _renderConcTbody() {
        var tbody = document.getElementById("concTbody");
        if (!tbody) return;
        tbody.innerHTML = _concItens.map(function(item, i) {
            var pc  = parseFloat(item.precoConcorrente) || 0;
            var pm  = parseFloat(item.precoMeu) || 0;
            var d   = (pc && pm) ? (pm - pc) : null;
            var pct = (pc && d !== null) ? ((d / pc) * 100).toFixed(1) : null;
            var cor = d !== null ? (d > 0 ? "#10b981" : d < 0 ? "#ef4444" : "var(--text-secondary)") : "var(--text-secondary)";
            var dTxt = d !== null
                ? "R$ " + d.toFixed(2).replace(".",",") + (pct ? " <span style='font-size:.7rem;opacity:.8'>(" + (d>0?"+":"") + pct + "%)</span>" : "")
                : "\u2014";
            return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                "<td style='padding:.3rem .4rem;color:var(--text-secondary);font-size:.72rem'>" + (i+1) + "</td>" +
                "<td style='padding:.3rem .4rem'><input value='" + _escAttr(item.ref||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'ref',this.value)\" placeholder='Ref.' style='" + _CONC_INP + "min-width:90px'></td>" +
                "<td style='padding:.3rem .4rem'><input value='" + _escAttr(item.desc||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'desc',this.value)\" placeholder='Descri\u00e7\u00e3o' style='" + _CONC_INP + "min-width:140px'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' min='1' value='" + (item.qtde||1) + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'qtde',this.value)\" style='" + _CONC_INP + "width:55px;text-align:center'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' step='0.01' min='0' value='" + (item.precoConcorrente||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'precoConcorrente',this.value)\" placeholder='0,00' style='" + _CONC_INP + "width:90px'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' step='0.01' min='0' value='" + (item.precoMeu||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'precoMeu',this.value)\" placeholder='0,00' style='" + _CONC_INP + "width:90px'></td>" +
                "<td style='padding:.3rem .4rem;font-size:.78rem;font-weight:700;color:" + cor + ";white-space:nowrap'>" + dTxt + "</td>" +
                "<td style='padding:.3rem .4rem'><button onclick=\"DemandaApp._concRemoveItem(" + i + ")\" style='background:transparent;border:none;color:var(--accent-danger);cursor:pointer;padding:.1rem'><span class='material-icons-round' style='font-size:1rem'>close</span></button></td>" +
                "</tr>";
        }).join("");
    }

    function _escAttr(str) {
        if (!str) return "";
        return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function _concAddItem() {
        _concItens.push({ id: Date.now(), ref:"", desc:"", qtde:1, precoConcorrente:"", precoMeu:"" });
        _renderConcTbody();
    }

    function _concRemoveItem(idx) {
        _concItens.splice(idx, 1);
        if (_concItens.length === 0) _concAddItem();
        else _renderConcTbody();
    }

    function _concUpdateItem(idx, field, value) {
        if (!_concItens[idx]) return;
        _concItens[idx][field] = value;
        // Atualiza somente a coluna diferença sem re-renderizar tudo
        var tbody = document.getElementById("concTbody");
        if (tbody) _renderConcTbody();
    }

    
    function _onConcClienteInput(val) {
        var dd = document.getElementById("concClienteDropdown");
        if (!dd) return;
        var qTerm = (val || "").trim().toLowerCase();
        if (!qTerm) {
            dd.style.display = "none";
            return;
        }

        var todos = (_todosClientesCache && _todosClientesCache.length > 0)
            ? _todosClientesCache
            : _extrairClientesLocais();

        var matches = todos.filter(function(c) {
            var hay = (c.nome + " " + (c.cnpj || "") + " " + (c.codigo || "") + " " + (c.cidade || "")).toLowerCase();
            return hay.indexOf(qTerm) >= 0;
        }).slice(0, 15);

        if (matches.length === 0) {
            dd.style.display = "none";
            return;
        }

        _concClientesCache = matches;
        dd.style.display = "block";
        dd.innerHTML = matches.map(function(c, i) {
            var detalhe = [c.cnpj || c.cpf || "", c.codigo ? "Cód: " + c.codigo : "", c.cidade || ""].filter(Boolean).join(" • ");
            return "<div class='client-dropdown-item' onclick='DemandaApp._selectConcCliente(" + i + ")'>" +
                   "<strong>" + _esc(c.nome) + "</strong>" +
                   (detalhe ? "<span>" + _esc(detalhe) + "</span>" : "") +
                   "</div>";
        }).join("");
    }

    function _onConcClienteFocus(inp) {
        if (!_todosClientesCache || _todosClientesCache.length === 0) {
            _carregarClientesAsync();
        }
        if (inp && inp.value.trim()) {
            _onConcClienteInput(inp.value);
        }
    }

    function _selectConcCliente(i) {
        if (!_concClientesCache || !_concClientesCache[i]) return;
        var c = _concClientesCache[i];
        var inp = document.getElementById("concCliente");
        if (inp) inp.value = c.nome;
        _concClienteSelecionado = { id: c.id || c.codigo || null, nome: c.nome, cnpj: c.cnpj || c.cpf || "" };
        var dd = document.getElementById("concClienteDropdown");
        if (dd) dd.style.display = "none";
    }

    function _atualizarSugestoesClientesConcorrente() {
        var dl = document.getElementById("concClienteSugestoes");
        if (!dl) return;
        var todos = (_todosClientesCache && _todosClientesCache.length > 0) ? _todosClientesCache : _extrairClientesLocais();
        if (!todos || todos.length === 0) return;
        dl.innerHTML = todos.slice(0, 150).map(function(c) {
            var label = c.nome + (c.cnpj ? " (" + c.cnpj + ")" : "") + (c.cidade ? " - " + c.cidade : "");
            return "<option value=\"" + _escAttr(c.nome) + "\" label=\"" + _escAttr(label) + "\">";
        }).join("");
    }

    function _salvarCotacaoConcorrente() {
        var db = _concDB();
        if (!db) { _toast("Firebase n\u00e3o dispon\u00edvel.", "error"); return; }
        var concNome = (document.getElementById("concNome") || {}).value || "";
        if (!concNome.trim()) { _toast("Informe o nome do concorrente.", "warning"); return; }
        var concClienteVal = (document.getElementById("concCliente") || {}).value || "";
        if (!concClienteVal.trim()) {
            _toast("Obrigatório informar o cliente antes de salvar a cotação.", "warning");
            var cliInp = document.getElementById("concCliente");
            if (cliInp) {
                cliInp.focus();
                cliInp.style.borderColor = "var(--accent-danger)";
                cliInp.style.animation = "shake 0.4s ease";
                setTimeout(function() { if (cliInp) cliInp.style.animation = ""; }, 500);
            }
            return;
        }
        var itens = _concItens.filter(function(it) { return it.ref || it.desc; });
        if (itens.length === 0) { _toast("Adicione ao menos um item.", "warning"); return; }
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var doc = {
            concorrente:  concNome.trim(),
            clienteRef:   (document.getElementById("concCliente") || {}).value || "",
            clienteId:    (_concClienteSelecionado ? _concClienteSelecionado.id : null),
            clienteCnpj:  (_concClienteSelecionado ? _concClienteSelecionado.cnpj : ""),
            obs:          (document.getElementById("concObs") || {}).value || "",
            vendedorNome: por,
            criadoEm:     firebase.firestore.FieldValue.serverTimestamp(),
            status:       "ativa",
            itens:        itens.map(function(it) {
                return { id: String(it.id), ref: it.ref||'', desc: it.desc||'',
                    qtde: parseFloat(it.qtde)||1,
                    precoConcorrente: parseFloat(it.precoConcorrente)||0,
                    precoMeu:         parseFloat(it.precoMeu)||0 };
            })
        };
        db.add(doc)
            .then(function(ref) {
                return ref.update({ id: ref.id });
            })
            .then(function() {
                _toast("Cota\u00e7\u00e3o de " + concNome + " salva!", "success");
                _concItens = [];
                _concClienteSelecionado = null;
                _concAddItem();
                _renderConcorrenteForm();
                _loadHistoricoConcorrente();
            })
            .catch(function(e) { _toast("Erro ao salvar: " + (e.message||e), "error"); });
    }

    function _loadHistoricoConcorrente() {
        var hc = document.getElementById("concHistoricoContainer");
        if (!hc) return;
        hc.innerHTML = "<div style='text-align:center;padding:1.5rem;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='animation:spin 1s linear infinite'>sync</span></div>";
        var db = _concDB();
        if (!db) { hc.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Firebase n\u00e3o dispon\u00edvel.</p>"; return; }
        db.where("status","==","ativa").orderBy("criadoEm","desc").limit(40).get()
            .then(function(snap) { _renderHistoricoConcorrente(snap.docs.map(function(d){return d.data();})); })
            .catch(function(err) {
                hc.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Erro: " + _esc(err.message||String(err)) + "</p>";
            });
    }

    function _renderHistoricoConcorrente(cotacoes) {
        var hc = document.getElementById("concHistoricoContainer");
        if (!hc) return;
        if (cotacoes.length === 0) {
            hc.innerHTML = "<div style='text-align:center;padding:2rem;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='font-size:2rem;opacity:.4'>trending_up</span>" +
                "<p style='margin-top:.5rem;font-size:.85rem'>Nenhuma cota\u00e7\u00e3o registrada ainda.</p></div>";
            return;
        }
        var header = "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem'>" +
            "<h3 style='margin:0;font-size:.88rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em'>Hist\u00f3rico (" + cotacoes.length + ") cota\u00e7\u00f5es</h3>" +
            "<button onclick='DemandaApp._loadHistoricoConcorrente()' title='Atualizar' style='background:transparent;border:none;color:var(--accent-primary);cursor:pointer'>" +
            "<span class='material-icons-round' style='font-size:1rem'>refresh</span></button></div>";
        var cards = cotacoes.map(function(c) {
            var dt = c.criadoEm && c.criadoEm.toDate
                ? c.criadoEm.toDate().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})
                : "\u2014";
            var itens = c.itens || [];
            var totalC = itens.reduce(function(a,it){return a+((it.precoConcorrente||0)*(it.qtde||1));},0);
            var totalM = itens.reduce(function(a,it){return a+((it.precoMeu||0)*(it.qtde||1));},0);
            var diff   = totalM - totalC;
            var bCor   = diff > 0 ? "#ef4444" : diff < 0 ? "#10b981" : "#6366f1";
            var bTxt   = (totalC && totalM) ? (diff > 0 ? "Concorrente mais barato" : diff < 0 ? "N\u00f3s somos mais baratos" : "Mesmo pre\u00e7o") : "";
            var rows = itens.map(function(it,i) {
                var pc = it.precoConcorrente||0; var pm = it.precoMeu||0;
                var d  = (pc && pm) ? (pm - pc) : null;
                var pct= (pc && d!==null) ? ((d/pc)*100).toFixed(1) : null;
                var cor= d!==null ? (d>0?"#10b981":d<0?"#ef4444":"var(--text-secondary)") : "var(--text-secondary)";
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.28rem .5rem;font-size:.72rem;color:var(--text-secondary)'>" + (i+1) + "</td>" +
                    "<td style='padding:.28rem .5rem;font-weight:600;font-size:.8rem'>" + _esc(it.ref||"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.78rem;color:var(--text-secondary);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(it.desc||"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;text-align:center;font-size:.8rem'>" + (it.qtde||1) + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.8rem'>" + (pc?"R$ "+pc.toFixed(2).replace(".",","):"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.8rem'>" + (pm?"R$ "+pm.toFixed(2).replace(".",","):"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.78rem;font-weight:700;color:"+cor+"'>" +
                        (d!==null?"R$ "+d.toFixed(2).replace(".",",")+(pct?" ("+(d>0?"+":"")+pct+"%)":""):"\u2014")+
                    "</td></tr>";
            }).join("");
            var cid = _esc(c.id||"");
            return "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;margin-bottom:.75rem'>" +
                "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;cursor:pointer' onclick=\"DemandaApp._toggleConcCard('" + cid + "')\">" +
                "<div><div style='font-weight:700;font-size:.93rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap'>" +
                "<span class='material-icons-round' style='font-size:1rem;color:#f59e0b'>trending_up</span>" + _esc(c.concorrente) +
                (bTxt?"<span style='font-size:.68rem;padding:.12rem .4rem;border-radius:6px;background:"+bCor+"22;color:"+bCor+"'>"+bTxt+"</span>":"") +
                "</div><div style='font-size:.77rem;color:var(--text-secondary);margin-top:.2rem'>" + dt +
                (c.clienteRef?" \u00b7 "+_esc(c.clienteRef):"") + " \u00b7 " + _esc(c.vendedorNome||"") + "</div></div>" +
                "<div style='display:flex;align-items:center;gap:.75rem'>" +
                (totalC?"<div style='text-align:right'><div style='font-size:.68rem;color:var(--text-secondary)'>Total concorrente</div><div style='font-weight:700;font-size:.88rem'>R$ "+totalC.toFixed(2).replace(".",",")+"</div></div>":"") +
                "<span class='material-icons-round' id='concCardIcon_"+cid+"' style='color:var(--text-secondary);font-size:1.1rem'>expand_more</span>" +
                "</div></div>" +
                "<div id='concCardBody_"+cid+"' style='display:none;margin-top:.75rem'>" +
                (c.obs?"<div style='font-size:.78rem;color:var(--text-secondary);margin-bottom:.5rem;font-style:italic'>"+_esc(c.obs)+"</div>":"") +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["#","Ref.","Descri\u00e7\u00e3o","Qtde","Pre\u00e7o Concorrente","Pre\u00e7o Nosso","Diferen\u00e7a"].map(function(h){
                    return "<th style='padding:.28rem .5rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
                "<div style='margin-top:.75rem;text-align:right'>" +
                "<button onclick=\"DemandaApp._arquivarCotacaoConcorrente('" + cid + "')\" style='background:transparent;border:1px solid var(--border-color);border-radius:6px;padding:.25rem .65rem;color:var(--text-secondary);cursor:pointer;font-size:.75rem'>Arquivar</button>" +
                "</div></div></div>";
        }).join("");
        hc.innerHTML = header + cards;
    }

    function _toggleConcCard(id) {
        var body = document.getElementById("concCardBody_" + id);
        var icon = document.getElementById("concCardIcon_" + id);
        if (!body) return;
        var open = body.style.display !== "none";
        body.style.display = open ? "none" : "";
        if (icon) icon.textContent = open ? "expand_more" : "expand_less";
    }

    function _arquivarCotacaoConcorrente(id) {
        if (!id || !confirm("Arquivar esta cota\u00e7\u00e3o do concorrente?")) return;
        var db = _concDB();
        if (!db) return;
        db.doc(id).update({ status: "arquivada" })
            .then(function() { _toast("Cota\u00e7\u00e3o arquivada.", "info"); _loadHistoricoConcorrente(); })
            .catch(function(e) { _toast("Erro: " + e.message, "error"); });
    }

    function _populateConcSugestoes() {
        var dl = document.getElementById("concNomeSugestoes");
        if (!dl) return;
        var db = _concDB(); if (!db) return;
        db.orderBy("criadoEm","desc").limit(30).get()
            .then(function(snap) {
                var nomes = snap.docs.map(function(d){return d.data().concorrente;}).filter(Boolean);
                var uniq  = nomes.filter(function(v,i,a){return a.indexOf(v)===i;});
                dl.innerHTML = uniq.map(function(n){return "<option value='" + _escAttr(n) + "'>";}).join("");
            }).catch(function(){});
    }

    // ════════════════════════════════════════════════════════
    // TOAST / NOTIFICAÇÕES
    // ════════════════════════════════════════════════════════

    function _toast(msg, type) {
        var COLORS = { success: "#10b981", error: "#ef4444", info: "#3b82f6", warning: "#f59e0b" };
        var ICONS  = { success: "check_circle", error: "error", info: "info", warning: "warning" };
        var cor    = COLORS[type] || COLORS.info;
        var icon   = ICONS[type]  || "info";
        var el = document.createElement("div");
        el.style.cssText =
            "position:fixed;bottom:80px;right:1.5rem;z-index:99999;" +
            "background:var(--bg-sidebar);border:1px solid " + cor + ";" +
            "color:var(--text-primary);padding:.7rem 1.1rem;border-radius:var(--radius-lg);" +
            "display:flex;align-items:center;gap:.6rem;font-size:.85rem;font-weight:500;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .35s;max-width:360px;";
        el.innerHTML =
            "<span class='material-icons-round' style='color:" + cor + ";font-size:1.1rem;flex-shrink:0'>" + icon + "</span>" +
            "<span>" + _esc(msg) + "</span>";
        document.body.appendChild(el);
        setTimeout(function() {
            el.style.opacity = "0";
            setTimeout(function() { el.remove(); }, 350);
        }, 3200);
    }

    // ════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ════════════════════════════════════════════════════════

    function _esc(str) {
        if (!str && str !== 0) return "";
        return String(str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ════════════════════════════════════════════════════════
    // AUTH / SIDEBAR
    // ════════════════════════════════════════════════════════

    function _updateUser(s) {
        var n = (s && (s.nome || s.name || s.email)) || "Usuario";
        var f = (s && (s.filial || s.tenantNome || s.empresa)) || "Plataforma";
        var r = (s && s.role) || "";
        var en = document.getElementById("sidebarUserName"); if (en) en.textContent = n;
        var ef = document.getElementById("sidebarFilial");   if (ef) ef.textContent = f;
        var er = document.getElementById("sidebarRole");     if (er) er.textContent = r || f;
        var ea = document.getElementById("sidebarAvatarLetter"); if (ea) ea.textContent = n.charAt(0).toUpperCase();
    }

    function logout() {
        if (typeof ParreiraAuth !== "undefined" && ParreiraAuth.logout) { ParreiraAuth.logout(); }
        else { window.location.href = "/platform/index.html"; }
    }

    // ════════════════════════════════════════════════════════
    // BOOTSTRAP
    // ════════════════════════════════════════════════════════

    function init() {
        console.log("[DemandaApp] Inicializando v1.1.0...");

        // Guard de autenticação
        if (typeof ParreiraAuth !== "undefined") {
            if (!ParreiraAuth.isLogado()) {
                // ✅ Redireciona para login.html com module=demanda e redirect correto
                // (antes ia para index.html do portal, que perdia o contexto e abria o despacho)
                var destPath = encodeURIComponent("modules/demanda/index.html");
                window.location.href = "/platform/login.html?module=demanda&redirect=" + destPath;
                return;
            }
            try {
                _sessao = ParreiraAuth.getSessao ? ParreiraAuth.getSessao() : null;
                var mods   = (_sessao && _sessao.modulos) ? _sessao.modulos : [];
                var role   = _sessao ? (_sessao.role || "") : "";
                var tenant = _sessao ? (_sessao.tenantId || "") : "";
                // Admin/master sempre têm acesso a todos os módulos
                var isAdmin = (role === "admin" || role === "master");
                // Tenant centralpecas tem acesso ao módulo (configuração pendente no Firestore)
                var isCentralPecas = (tenant === "centralpecas");
                if (!isAdmin && !isCentralPecas && mods.length > 0 && mods.indexOf("demanda") === -1) {
                    alert("Voce nao tem acesso ao modulo Cotação.\nContate o administrador.");
                    history.back(); return;
                }
            } catch(e) { console.warn("[DemandaApp] Erro ao verificar modulos:", e); }
        }

        // Preenche sidebar
        try { _updateUser(_sessao || { nome: "Demo", filial: "Demo" }); } catch(e) {}

        // Versão no footer
        fetch("version.json?v=" + Date.now())
            .then(function(r) { return r.json(); })
            .then(function(d) {
                var el = document.getElementById("demandaFooterVersion");
                if (el) el.textContent = "v" + (d.version || "1.1.0");
            })
            .catch(function() {});

        // Fecha dropdown de cliente ao clicar fora
        document.addEventListener("click", function(ev) {
            var dd  = document.getElementById("clienteDropdown");
            var btn = document.getElementById("btnSelectCliente");
            if (!dd || dd.style.display !== "block") return;
            if (btn && (ev.target === btn || btn.contains(ev.target))) return;
            if (!dd.contains(ev.target)) dd.style.display = "none";
        });

                // Carrega clientes, produtos e estoque assincronamente em segundo plano
        _carregarClientesAsync();
        _carregarProdutosEEstoqueAsync();

        // Sincronização periódica em background de 5 em 5 minutos
        if (!window._demandaAutoSyncInterval) {
            window._demandaAutoSyncInterval = setInterval(function() {
                try {
                    console.log("[DemandaApp] Auto-sync (5 min): atualizando cadastro de clientes, produtos e estoque...");
                    _carregarClientesAsync(true);
                    _carregarProdutosEEstoqueAsync(true);
                } catch(e) { console.warn("[DemandaApp] Falha no auto-sync 5 min:", e); }
            }, 5 * 60 * 1000);
        }

        // Fecha dropdown de cliente concorrente ao clicar fora
        document.addEventListener("click", function(ev) {
            var cdd  = document.getElementById("concClienteDropdown");
            var cinp = document.getElementById("concCliente");
            if (!cdd || cdd.style.display !== "block") return;
            if (cinp && (ev.target === cinp || cinp.contains(ev.target))) return;
            if (!cdd.contains(ev.target)) cdd.style.display = "none";
        });

        // Exibe shell e vai para captura
        var sh = document.getElementById("appShell");
        if (sh) sh.style.display = "flex";
        switchView("captura");
        console.log("[DemandaApp] Pronto v1.1.0.");
    }

    // ════════════════════════════════════════════════════════
    // API PÚBLICA
    // ════════════════════════════════════════════════════════

    return {
        init:                   init,
        logout:                 logout,
        switchView:             switchView,
        // Pesquisa
        onSearchInput:          onSearchInput,
        clearSearch:            clearSearch,
        selectSearchResult:     selectSearchResult,
        // Importação
        openImportModal:        openImportModal,
        closeModal:             closeModal,
        addItemFromDetails:     addItemFromDetails,
        processImportTexto:     processImportTexto,
        // Import PDF
        onPdfDrop:                      onPdfDrop,
        onPdfFileSelected:              onPdfFileSelected,
        _abrirImportPDF:        _abrirImportPDF,
        _fecharImportPDF:       _fecharImportPDF,
        // Import Foto
        _abrirImportFoto:       _abrirImportFoto,
        _fecharImportFoto:      _fecharImportFoto,
        _processarFotoTranscricao: _processarFotoTranscricao,
        onExcelDrop:            onExcelDrop,
        onExcelFileSelected:    onExcelFileSelected,
        confirmExcelImport:     confirmExcelImport,
        updateConferenciaItem:  updateConferenciaItem,
        selectAllConferencia:          selectAllConferencia,
        toggleAllConferencia:          toggleAllConferencia,
        desmarcarIncertosConferencia:  desmarcarIncertosConferencia,
        confirmConferencia:            confirmConferencia,
        // Grade de entrada
        addItemGrade:           addItemGrade,
        onGradeKeydown:         onGradeKeydown,
        removeItem:             removeItem,
        renderItens:            renderItens,
        limparDemanda:          limparDemanda,
        // Salvar
        salvarDemanda:          salvarDemanda,
        // Cliente
        toggleClienteDropdown:  toggleClienteDropdown,
        searchCliente:          searchCliente,
        selectClienteIdx:       selectClienteIdx,
        limparClienteSelecionado: limparClienteSelecionado,
        usarClienteAvulso:      usarClienteAvulso,
        onClienteSearchEnter:   onClienteSearchEnter,
        _onConcClienteInput:    _onConcClienteInput,
        _onConcClienteFocus:    _onConcClienteFocus,
        _selectConcCliente:     _selectConcCliente,
        carregarClientes:       _carregarClientesAsync,
        carregarProdutos:       _carregarProdutosEEstoqueAsync,
        conciliarItens:         _conciliarItensComEstoque,
        reavaliarEstoqueItens:  reavaliarEstoqueItens,
        // Lista
        filterDemandas:         filterDemandas,
        excluirDemanda:         excluirDemanda,
        estornarDemanda:        estornarDemanda,
        reabrirDemanda:         reabrirDemanda,
        loadDemandasLista:      loadDemandasLista,
        abrirDemanda:           abrirDemanda,
        avancarItemStatus:      avancarItemStatus,
        toggleItemTimeline:     toggleItemTimeline,
        // Dashboard e Compras
        loadDashboard:          loadDashboard,
        loadFilaCompras:        loadFilaCompras,
        avancarItemFilaCompras: avancarItemFilaCompras,
        // Orçamento
        loadOrcamento:          loadOrcamento,
        _aprovarItemOrcamento:  _aprovarItemOrcamento,
        _perderItemOrcamento:   _perderItemOrcamento,
        // Busca ERP
        _abrirBuscaERP:         _abrirBuscaERP,
        _fecharBuscaERP:        _fecharBuscaERP,
        _executarBuscaERP:      _executarBuscaERP,
        _vincularProduto:       _vincularProduto,
        // Devolutiva Compras
        _abrirDevolutivaCompras:  _abrirDevolutivaCompras,
        _confirmarDevolutiva:     _confirmarDevolutiva,
        // Cota\u00e7\u00e3o Concorrente
        loadConcorrente:              loadConcorrente,
        _concAddItem:                 _concAddItem,
        _concRemoveItem:              _concRemoveItem,
        _concUpdateItem:              _concUpdateItem,
        _salvarCotacaoConcorrente:    _salvarCotacaoConcorrente,
        _loadHistoricoConcorrente:    _loadHistoricoConcorrente,
        _toggleConcCard:              _toggleConcCard,
        _arquivarCotacaoConcorrente:  _arquivarCotacaoConcorrente,
        // Métodos de Integração, Compras, Pedido ERP e Relatórios
        adicionarItemDaBusca:        adicionarItemDaBusca,
        _gerarPedidoERP:             _gerarPedidoERP,
        loadRelatorios:              loadRelatorios,
        switchRelatorioTab:          switchRelatorioTab,
        imprimirRelatorio:           imprimirRelatorio,
        exportarRelatorioCSV:        exportarRelatorioCSV,
        // Base Técnica
        abrirBaseTecnica:             abrirBaseTecnica,
        syncMaxdataTechbase:          syncMaxdataTechbase,
        importarCatalogoPDF:          importarCatalogoPDF,
    };

    // ── Base Técnica ───────────────────────────────────────────
    function abrirBaseTecnica() {
        var modal = document.getElementById('modalBaseTecnica');
        if (!modal) return;
        modal.style.display = 'flex';
        _loadBaseTecnicaStats();
    }

    function _loadBaseTecnicaStats() {
        if (typeof firebase === 'undefined') return;
        var db  = firebase.firestore();
        var col = db.collection('tenants/centralpecas/demanda/techbase/products');
        col.get().then(function(snap) {
            var total = snap.size;
            var erp   = snap.docs.filter(function(d) { return d.data().hasErpRecord; }).length;
            var pdf   = snap.docs.filter(function(d) { return d.data().origem === 'pdf_catalog'; }).length;
            var el;
            el = document.getElementById('btCountTotal'); if (el) el.textContent = total.toLocaleString('pt-BR');
            el = document.getElementById('btCountErp');   if (el) el.textContent = erp.toLocaleString('pt-BR');
            el = document.getElementById('btCountPdf');   if (el) el.textContent = pdf.toLocaleString('pt-BR');
        }).catch(function() {});
    }

    function syncMaxdataTechbase() {
        if (typeof DemandaLookup === 'undefined') { _toast('DemandaLookup não carregado.', 'error'); return; }
        var btn  = document.getElementById('btBtnSync');
        var stat = document.getElementById('btSyncStatus');
        var bar  = document.getElementById('btSyncBar');
        var fill = document.getElementById('btSyncBarFill');
        if (btn)  btn.disabled = true;
        if (bar)  bar.style.display = 'block';
        if (fill) fill.style.width  = '5%';
        if (stat) stat.textContent  = 'Conectando ao Maxdata...';
        DemandaLookup.syncMaxdataToTechbase(1, function(salvo, pagina) {
            if (stat) stat.textContent = 'Sincronizando... ' + salvo + ' peças (pág. ' + (pagina || '?') + ')';
            if (fill) fill.style.width = Math.min(95, 5 + salvo / 10) + '%';
        }).then(function(total) {
            if (fill) fill.style.width  = '100%';
            if (stat) stat.textContent  = '✓ ' + total + ' peças agrícolas sincronizadas!';
            _toast(total + ' peças salvas na base técnica.', 'success');
            _loadBaseTecnicaStats();
        }).catch(function(e) {
            if (stat) stat.textContent = '✗ Erro: ' + (e.message || e);
            _toast('Erro na sincronização: ' + (e.message || e), 'error');
        }).finally(function() {
            if (btn) btn.disabled = false;
        });
    }

    function importarCatalogoPDF(file) {
        if (!file) return;
        if (typeof DemandaPDF === 'undefined') { _toast('DemandaPDF não carregado.', 'error'); return; }
        var stat = document.getElementById('btPdfStatus');
        var bar  = document.getElementById('btPdfBar');
        var fill = document.getElementById('btPdfBarFill');
        if (stat) stat.textContent = 'Processando: ' + file.name;
        if (bar)  bar.style.display = 'block';
        if (fill) fill.style.width  = '5%';
        var meta = {
            fabricante:  (document.getElementById('btPdfFabricante')  || {}).value || '',
            equipamento: (document.getElementById('btPdfEquipamento') || {}).value || '',
            modelo:      (document.getElementById('btPdfModelo')      || {}).value || '',
        };
        DemandaPDF.importCatalogPDF(file, meta, function(fase, atual, total, msg) {
            if (stat) stat.textContent = msg || (fase + ' ' + atual + '/' + total);
            var pct = total > 0 ? Math.round((atual / total) * 90) + 5 : 50;
            if (fill) fill.style.width = pct + '%';
        }).then(function(result) {
            if (fill) fill.style.width = '100%';
            if (stat) stat.textContent = '✓ ' + result.totalRefs + ' referências de ' + result.totalPaginas +
                ' páginas | ' + result.fabricante + ' ' + result.equipamento;
            _toast(result.totalRefs + ' peças importadas do PDF!', 'success');
            _loadBaseTecnicaStats();
        }).catch(function(e) {
            if (stat) stat.textContent = '✗ Erro: ' + (e.message || e);
            _toast('Erro ao importar PDF: ' + (e.message || e), 'error');
        }).finally(function() {
            var inp = document.getElementById('btPdfInput');
            if (inp) inp.value = '';
        });
    }

})();

// ── Bootstrap: aguarda ParreiraAuth antes de inicializar ─────
document.addEventListener("DOMContentLoaded", function() {
    var attempts = 0;
    var t = setInterval(function() {
        attempts++;
        if (typeof ParreiraAuth !== "undefined") { clearInterval(t); DemandaApp.init(); return; }
        if (attempts >= 40) {
            clearInterval(t);
            console.warn("[DemandaApp] ParreiraAuth indisponivel — iniciando sem auth guard.");
            DemandaApp.init();
        }
    }, 100);
});

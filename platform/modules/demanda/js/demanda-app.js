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
        dashboard:     "nav-dashboard",
        base:          "nav-base",
        integracaoErp: "nav-integracaoErp"
    };

    // ── Estado global ─────────────────────────────────────────
    var _itens             = [];      // Itens da demanda em andamento
    var _clienteAtual      = null;    // { id, nome, cnpj } | null
    var _sessao            = null;    // Cache ParreiraAuth.getSessao()
    var _erpInitialized    = false;
    var _searchTimeout     = null;
    var _filterAtual       = "todas";
    var _clientesCache     = [];      // Lista de clientes para o dropdown

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
        if (v === "lista")         loadDemandasLista(_filterAtual);
    }

    // ════════════════════════════════════════════════════════
    // ERP UI (Integração)
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

    // ════════════════════════════════════════════════════════
    // PESQUISA UNIVERSAL (coluna esquerda)
    // ════════════════════════════════════════════════════════

    function onSearchInput(value) {
        clearTimeout(_searchTimeout);
        var b = document.getElementById("searchClear");
        if (b) b.style.display = value.length > 0 ? "flex" : "none";
        var r = document.getElementById("searchResults");
        if (!r) return;
        if (value.length < 3) {
            // Restaura placeholder
            r.innerHTML = "";
            var ph = document.getElementById("searchPlaceholder");
            if (ph) r.appendChild(ph);
            return;
        }
        _searchTimeout = setTimeout(function() {
            // TODO Fase 3: integrar DemandaSearch com ERP
            r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='font-size:2rem;opacity:.4'>manage_search</span>" +
                "<p style='margin-top:.5rem;font-size:.85rem'>Pesquisa no ERP em implementação.<br>Use a entrada rápida (→) para adicionar itens manualmente.</p>" +
                "</div>";
        }, 350);
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
        // TODO Fase 3: adicionar item do ERP direto
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

        _itens.push({ refOriginal: ref, descOriginal: "", qtdeSolicitada: qtde });
        renderItens();

        refEl.value = "";
        if (qtdeEl) qtdeEl.value = "1";
        refEl.focus();
        _toast("Item adicionado", "success");
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
            return "<tr>" +
                "<td style='color:var(--text-secondary);font-size:.8rem'>" + (i + 1) + "</td>" +
                "<td style='font-weight:600;font-size:.83rem'>" + _esc(item.refOriginal) + "</td>" +
                "<td style='font-size:.8rem;color:var(--text-secondary)'>" + (_esc(item.descOriginal) || "—") + "</td>" +
                "<td style='text-align:center'>" + item.qtdeSolicitada + "</td>" +
                "<td><span style='font-size:.72rem;padding:.15rem .5rem;border-radius:10px;" +
                    "background:rgba(99,102,241,.15);color:#6366f1'>Recebida</span></td>" +
                "<td><button onclick='DemandaApp.removeItem(" + i + ")' title='Remover' " +
                    "style='background:none;border:none;color:var(--accent-danger);cursor:pointer;padding:.2rem'>" +
                    "<span class='material-icons-round' style='font-size:1rem'>close</span></button></td>" +
                "</tr>";
        }).join("");
        tbody.innerHTML = html;

        var ct = document.getElementById("demandaCodigoTopbar");
        if (ct) ct.textContent = "— " + _itens.length + (_itens.length === 1 ? " item" : " itens");
    }

    function limparDemanda() {
        if (_itens.length > 0 && !confirm("Limpar todos os itens da demanda?")) return;
        _itens = [];
        _clienteAtual = null;
        var cl = document.getElementById("clienteLabel"); if (cl) cl.textContent = "Selecionar cliente";
        var si = document.getElementById("selectOrigem"); if (si) si.value = "whatsapp";
        renderItens();
    }

    // ════════════════════════════════════════════════════════
    // SELEÇÃO DE CLIENTE
    // ════════════════════════════════════════════════════════

    function toggleClienteDropdown() {
        var dd  = document.getElementById("clienteDropdown");
        if (!dd) return;
        var open = dd.style.display === "block";
        dd.style.display = open ? "none" : "block";
        if (!open) {
            var inp = document.getElementById("clienteSearchInput");
            if (inp) { inp.value = ""; inp.focus(); }
            _renderClienteDropdownList("");
        }
    }

    function searchCliente(q) { _renderClienteDropdownList(q); }

    function _renderClienteDropdownList(q) {
        var list = document.getElementById("clienteDropdownList");
        if (!list) return;

        var todos = _getClientesLocalCache();
        var filtrados = q.length > 1
            ? todos.filter(function(c) {
                var hay = ((c.nome || c.razaoSocial || "") + " " + (c.cnpj || "") + " " + (c.codigo || "")).toLowerCase();
                return hay.indexOf(q.toLowerCase()) >= 0;
              })
            : todos.slice(0, 25);

        _clientesCache = filtrados;

        if (filtrados.length === 0) {
            list.innerHTML = "<div style='padding:.75rem 1rem;color:var(--text-secondary);font-size:.82rem'>" +
                (todos.length === 0 ? "Nenhum cliente em cache. Sincronize o ERP." : "Nenhum resultado para \"" + _esc(q) + "\".") +
                "</div>";
            return;
        }

        list.innerHTML = filtrados.map(function(c, i) {
            var nome = c.nome || c.razaoSocial || "Cliente " + i;
            var detalhe = c.cnpj || c.cpf || c.codigo || "";
            return "<div onclick='DemandaApp.selectClienteIdx(" + i + ")'" +
                   " style='padding:.5rem 1rem;cursor:pointer;font-size:.83rem;border-bottom:1px solid var(--border);" +
                   "display:flex;flex-direction:column;gap:.1rem;transition:background .15s'" +
                   " onmouseover='this.style.background=\"rgba(59,130,246,.08)\"'" +
                   " onmouseout='this.style.background=\"\"'>" +
                   "<span style='font-weight:600;color:var(--text-primary)'>" + _esc(nome) + "</span>" +
                   (detalhe ? "<span style='color:var(--text-secondary);font-size:.75rem'>" + _esc(detalhe) + "</span>" : "") +
                   "</div>";
        }).join("");
    }

    function selectClienteIdx(i) {
        if (i < 0 || i >= _clientesCache.length) return;
        var c = _clientesCache[i];
        _clienteAtual = { id: c.id || c.codigo || null, nome: c.nome || c.razaoSocial || "", cnpj: c.cnpj || c.cpf || "" };
        var lbl = document.getElementById("clienteLabel"); if (lbl) lbl.textContent = _clienteAtual.nome;
        var dd  = document.getElementById("clienteDropdown"); if (dd) dd.style.display = "none";
    }

    function _getClientesLocalCache() {
        try {
            var key = "centralpecas_clients";
            var raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return [];
    }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO
    // ════════════════════════════════════════════════════════

    function openImportModal(type) {
        var tipos = { texto: "Colar Texto/WhatsApp", excel: "Excel/CSV", pdf: "PDF (em breve)", foto: "Foto/Print (em breve)" };
        _toast((tipos[type] || type) + " — implementação Fase 3", "info");
    }

    function closeModal(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
    function addItemFromDetails() { closeModal("modalItemDetalhes"); }

    // ════════════════════════════════════════════════════════
    // SALVAR DEMANDA → FIRESTORE
    // ════════════════════════════════════════════════════════

    function salvarDemanda() {
        if (_itens.length === 0) {
            _toast("Adicione ao menos um item antes de salvar.", "error"); return;
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
                else { b.innerHTML = "<span class='material-icons-round'>save</span> Salvar Demanda"; }
            });
        }
        _setBtnSaving(true);

        DemandaDB.createDemanda(data, _itens.slice())
            .then(function(demandaId) {
                console.log("[DemandaApp] Demanda criada:", demandaId);
                _toast("Demanda salva com sucesso!", "success");
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
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando demandas...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'>DemandaDB não disponível.</div>";
            return;
        }

        var filters = {};
        if (filtro === "aberta")         filters.status = "aberta";
        if (filtro === "em_atendimento") filters.status = "em_atendimento";
        if (filtro === "encerrada")      filters.status = "encerrada";

        DemandaDB.listDemandas(filters)
            .then(function(demandas) {
                if (demandas.length === 0) {
                    container.innerHTML =
                        "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:3rem;opacity:.3'>inbox</span>" +
                        "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Nenhuma demanda encontrada</h4>" +
                        "<p style='font-size:.85rem'>Crie uma nova na Central de Captura.</p>" +
                        "<button class='btn btn-primary btn-sm' style='margin-top:1rem' onclick='DemandaApp.switchView(\"captura\")'>" +
                        "<span class='material-icons-round'>add</span> Nova Demanda</button></div>";
                    return;
                }
                container.innerHTML = "<div style='padding:1rem 1.5rem'>" +
                    demandas.map(_renderDemandaCard).join("") + "</div>";
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
            "<div style='display:flex;gap:1.25rem;text-align:center;flex-shrink:0'>" +
            _miniStat("Itens",   d.totalItens      || 0, "var(--text-primary)") +
            _miniStat("Estoque", d.totalComEstoque  || 0, "var(--accent-success)") +
            _miniStat("Faltam",  d.totalSemEstoque  || 0, (d.totalSemEstoque || 0) > 0 ? "var(--accent-danger)" : "var(--text-secondary)") +
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

    function abrirDemanda(id) {
        // TODO Fase 3: modal/view de detalhes
        console.log("[DemandaApp] abrirDemanda:", id);
        _toast("Detalhes da demanda — implementação Fase 3", "info");
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
                window.location.href = "/platform/index.html?redirect=" + encodeURIComponent(window.location.pathname);
                return;
            }
            try {
                _sessao = ParreiraAuth.getSessao ? ParreiraAuth.getSessao() : null;
                var mods = (_sessao && _sessao.modulos) ? _sessao.modulos : [];
                if (mods.length > 0 && mods.indexOf("demanda") === -1) {
                    alert("Voce nao tem acesso ao modulo Inteligencia de Demanda.\nContate o administrador.");
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
        // Lista
        filterDemandas:         filterDemandas,
        loadDemandasLista:      loadDemandasLista,
        abrirDemanda:           abrirDemanda
    };

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

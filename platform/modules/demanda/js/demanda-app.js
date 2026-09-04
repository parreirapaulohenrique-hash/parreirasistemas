/* demanda-app.js — Controlador Principal | Inteligencia de Demanda v1.0.7
 * Parreira Sistemas
 * Fluxo: loginScreen (auth MaxData) -> appShell (modulo)
 */
"use strict";

const DemandaApp = (function() {

    // ─── CONFIGURACAO ─────────────────────────────────────────────────────────
    var BASE_URL  = "http://rds.skytins.com.br:8720/v2";
    var TERMINAL  = "364F64E6539974C1D75C8A46C14B2D3D";
    var SESSION_KEY = "demanda_session";

    var _VIEWS = {
        captura:       "nav-captura",
        lista:         "nav-lista",
        pesquisa:      "nav-pesquisa",
        compras:       "nav-compras",
        dashboard:     "nav-dashboard",
        base:          "nav-base",
        integracaoErp: "nav-integracaoErp"
    };

    var _session        = null;
    var _erpInitialized = false;
    var _searchTimeout  = null;

    // ─── AUTH HELPERS ─────────────────────────────────────────────────────────

    /** Monta URL da API MaxData respeitando proxy HTTPS */
    function _apiUrl(path) {
        if (typeof location !== "undefined" && location.protocol === "https:") {
            return "/api/maxdata?_path=" + encodeURIComponent(path);
        }
        return BASE_URL + "/" + path;
    }

    /** Exibe/esconde mensagem de erro no formulario de login */
    function _loginError(msg) {
        var el = document.getElementById("loginError");
        if (!el) return;
        if (msg) { el.textContent = msg; el.style.display = "block"; }
        else      { el.style.display = "none"; }
    }

    /** Habilita/desabilita o botao de login */
    function _loginLoading(loading) {
        var btn = document.getElementById("btnLogin");
        if (!btn) return;
        btn.disabled = !!loading;
        btn.innerHTML = loading
            ? "<span class='material-icons-round' style='animation:spin 1s linear infinite'>sync</span> Entrando..."
            : "<span class='material-icons-round'>login</span> Entrar";
    }

    /** Esconde a tela de login e exibe o shell do modulo */
    function _showApp(sessao) {
        _session = sessao;
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(sessao)); } catch(e) {}

        var loginScreen = document.getElementById("loginScreen");
        if (loginScreen) loginScreen.style.display = "none";

        var sh = document.getElementById("appShell");
        if (sh) sh.style.display = "flex";

        _updateUser(sessao);
        switchView("captura");
        console.log("[DemandaApp] Sessao iniciada:", sessao.nome || sessao.userId);
    }

    /** Recupera sessao salva, se ainda valida */
    function _loadSavedSession() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            var s = JSON.parse(raw);
            // Verifica expiracao (token MaxData dura ~24h)
            if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return s;
        } catch(e) { return null; }
    }

    // ─── LOGIN COM MaxData ERP ────────────────────────────────────────────────

    /**
     * Tenta autenticar via MaxData.
     * Tentativa 1: POST /auth com usuario + senha (auth de usuario)
     * Tentativa 2: POST /auth com terminal (auth de servico) + busca usuario
     */
    async function doLogin() {
        var userEl   = document.getElementById("loginUser");
        var passEl   = document.getElementById("loginPass");
        var filialEl = document.getElementById("loginFilial");

        var usuario = (userEl && userEl.value.trim())   || "";
        var senha   = (passEl && passEl.value.trim())   || "";
        var empId   = (filialEl && Number(filialEl.value)) || 1;

        if (!usuario || !senha) {
            _loginError("Preencha usuario e senha.");
            return;
        }

        _loginError("");
        _loginLoading(true);

        try {
            // Tentativa 1: auth de usuario (MaxData pode aceitar usuario+senha)
            var url = _apiUrl("auth");
            var resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ empId: empId, usuario: usuario, senha: senha })
            });

            var data = null;
            if (resp.ok) {
                data = await resp.json();
            }

            // Tentativa 2: auth de servico com terminal (fallback)
            if (!data || !data.token) {
                resp = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ empId: empId, terminal: TERMINAL })
                });
                if (resp.ok) {
                    data = await resp.json();
                } else {
                    var errText = await resp.text().catch(function() { return resp.statusText; });
                    throw new Error("Falha na autenticacao MaxData (HTTP " + resp.status + "): " + errText.substring(0, 100));
                }
            }

            if (!data || !data.token) {
                throw new Error("Token nao retornado pelo ERP. Verifique as credenciais.");
            }

            // Busca informacoes do usuario para exibir na sidebar
            var nomeUsuario = data.nomeUsuario || data.nome || usuario;
            var filialLabel = (filialEl && filialEl.options[filialEl.selectedIndex])
                ? filialEl.options[filialEl.selectedIndex].text
                : "Filial " + empId;

            // Valida credenciais buscando usuario no ERP
            try {
                var usersResp = await fetch(_apiUrl("users"), {
                    headers: { "Authorization": "Bearer " + data.token, "Content-Type": "application/json" }
                });
                if (usersResp.ok) {
                    var users = await usersResp.json();
                    if (Array.isArray(users)) {
                        var found = users.find(function(u) {
                            return String(u.id) === String(usuario) ||
                                   (u.login  && u.login.toLowerCase()  === usuario.toLowerCase()) ||
                                   (u.usuario && u.usuario.toLowerCase() === usuario.toLowerCase());
                        });
                        if (found) {
                            nomeUsuario = found.nome || found.login || usuario;
                        } else if (data.token) {
                            // Token valido mas usuario nao encontrado na lista — aceita assim mesmo
                            console.warn("[DemandaApp] Usuario nao encontrado na lista, mas token valido.");
                        }
                    }
                }
            } catch(e) { /* nao bloqueia o login se a busca de usuario falhar */ }

            _loginLoading(false);
            _showApp({
                token:     data.token,
                expiresAt: data.expiration || null,
                userId:    usuario,
                nome:      nomeUsuario,
                empId:     empId,
                filial:    filialLabel,
                demo:      false
            });

        } catch(err) {
            _loginLoading(false);
            _loginError(err.message || "Erro ao conectar com o ERP. Tente novamente.");
            console.error("[DemandaApp] Erro no login:", err);
        }
    }

    /** Login demo — sem autenticacao real, para testes */
    function doLoginDemo() {
        console.log("[DemandaApp] Modo demo ativado.");
        _showApp({
            token:     "DEMO",
            expiresAt: null,
            userId:    "demo",
            nome:      "Usuario Demo",
            empId:     1,
            filial:    "Demo / Homologacao",
            demo:      true
        });
    }

    /** Encerra a sessao e volta para a tela de login */
    function logout() {
        try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
        _session = null;
        var sh = document.getElementById("appShell");
        if (sh) sh.style.display = "none";
        var loginScreen = document.getElementById("loginScreen");
        if (loginScreen) loginScreen.style.display = "flex";
        var passEl = document.getElementById("loginPass");
        if (passEl) passEl.value = "";
        _loginError("");
    }

    // ─── ROTEAMENTO DE VIEWS ─────────────────────────────────────────────────

    function switchView(v) {
        if (!_VIEWS[v]) { console.warn("[DemandaApp] View desconhecida:", v); return; }
        document.querySelectorAll("[id^='view-']").forEach(function(el) { el.style.display = "none"; });
        document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
        var ve = document.getElementById("view-" + v); if (ve) ve.style.display = "";
        var ne = document.getElementById(_VIEWS[v]); if (ne) ne.classList.add("active");
        if (v === "integracaoErp") _initErpUI();
    }

    // ─── INTEGRACAO ERP ──────────────────────────────────────────────────────

    function _initErpUI() {
        if (_erpInitialized) return;
        if (typeof ErpUI === "undefined") {
            var c = document.getElementById("erp-config-container");
            if (c) c.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'><p>ErpUI nao carregado. Verifique os scripts e recarregue a pagina.</p></div>";
            return;
        }
        ErpUI.init("demanda");
        _erpInitialized = true;
        console.log("[DemandaApp] ErpUI inicializado para modulo demanda");
    }

    // ─── PESQUISA UNIVERSAL ──────────────────────────────────────────────────

    function onSearchInput(value) {
        clearTimeout(_searchTimeout);
        var b = document.getElementById("searchClear");
        if (b) b.style.display = value.length > 0 ? "flex" : "none";
        if (value.length < 3) return;
        _searchTimeout = setTimeout(function() {
            var r = document.getElementById("searchResults");
            if (r) r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'><p>Pesquisando por " + value + " (Fase 2 - em implementacao)</p></div>";
        }, 350);
    }

    function clearSearch() {
        var i = document.getElementById("searchInput");
        if (i) { i.value = ""; i.focus(); }
        var b = document.getElementById("searchClear");
        if (b) b.style.display = "none";
        var r = document.getElementById("searchResults");
        if (r) r.innerHTML = "";
    }

    // ─── IMPORTACAO ──────────────────────────────────────────────────────────

    function openImportModal(type) {
        var tipos = { texto: "Colar Texto/WhatsApp", excel: "Importar Excel/CSV", pdf: "Importar PDF" };
        alert("[Fase 2] " + (tipos[type] || type) + " - funcionalidade em implementacao.");
    }

    // ─── DEMANDA — ACOES ─────────────────────────────────────────────────────

    function salvarDemanda() { console.log("[DemandaApp] salvarDemanda - Fase 2"); }
    function closeModal(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
    function addItemFromDetails() { closeModal("modalItemDetalhes"); }
    function selectSearchResult(id) { console.log("[DemandaApp] select:", id); }

    // ─── SIDEBAR ─────────────────────────────────────────────────────────────

    function _updateUser(s) {
        var n = (s && (s.nome || s.name || s.userId)) || "Usuario";
        var f = (s && (s.filial || s.empresa)) || "Demo";
        var en = document.getElementById("sidebarUserName"); if (en) en.textContent = n;
        var ef = document.getElementById("sidebarFilial");   if (ef) ef.textContent = f;
        var ea = document.getElementById("sidebarAvatarLetter"); if (ea) ea.textContent = n.charAt(0).toUpperCase();
    }

    // ─── BOOTSTRAP ───────────────────────────────────────────────────────────

    function init() {
        console.log("[DemandaApp] Inicializando v1.0.7...");

        // Atualiza badge de versao no login
        fetch("version.json?v=" + Date.now()).then(function(r) { return r.json(); })
            .then(function(d) {
                var v = d.version || "1.0.7";
                var el = document.getElementById("sidebarVersion"); if (el) el.textContent = "v" + v;
                var lb = document.getElementById("loginVersionBadge");
                if (lb) lb.innerHTML = "<span style='width:6px;height:6px;border-radius:50%;background:#6366f1;display:inline-block'></span> v" + v + " - features";
            }).catch(function() {});

        // Verifica sessao salva
        var saved = _loadSavedSession();
        if (saved && saved.token) {
            console.log("[DemandaApp] Sessao encontrada:", saved.nome);
            _showApp(saved);
            return;
        }

        // Sem sessao: mantem loginScreen visivel (ja esta visivel por padrao no HTML)
        console.log("[DemandaApp] Aguardando login...");
    }

    // ─── API PUBLICA ─────────────────────────────────────────────────────────

    return {
        init:              init,
        doLogin:           doLogin,
        doLoginDemo:       doLoginDemo,
        logout:            logout,
        switchView:        switchView,
        onSearchInput:     onSearchInput,
        clearSearch:       clearSearch,
        openImportModal:   openImportModal,
        salvarDemanda:     salvarDemanda,
        closeModal:        closeModal,
        addItemFromDetails: addItemFromDetails,
        selectSearchResult: selectSearchResult
    };

})();

// Bootstrap — inicia apos DOM pronto (nao depende de Firebase/ParreiraAuth)
document.addEventListener("DOMContentLoaded", function() {
    DemandaApp.init();
});

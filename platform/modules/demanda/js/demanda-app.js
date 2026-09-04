/* demanda-app.js - Controlador Principal do Módulo de Inteligência de Demanda - v1.0.6 */
"use strict";

const DemandaApp = (function() {

    var _VIEWS = {
        captura:       "nav-captura",
        lista:         "nav-lista",
        pesquisa:      "nav-pesquisa",
        compras:       "nav-compras",
        dashboard:     "nav-dashboard",
        base:          "nav-base",
        integracaoErp: "nav-integracaoErp"
    };

    var _erpInitialized = false;
    var _searchTimeout  = null;

    // ── ROTEAMENTO DE VIEWS ───────────────────────────────────────────────
    function switchView(v) {
        if (!_VIEWS[v]) { console.warn("[DemandaApp] View desconhecida:", v); return; }
        document.querySelectorAll("[id^='view-']").forEach(function(el) { el.style.display = "none"; });
        document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
        var ve = document.getElementById("view-" + v); if (ve) ve.style.display = "";
        var ne = document.getElementById(_VIEWS[v]); if (ne) ne.classList.add("active");
        if (v === "integracaoErp") _initErpUI();
    }

    // ── INTEGRAÇÃO ERP ────────────────────────────────────────────────────
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

    // ── PESQUISA UNIVERSAL ────────────────────────────────────────────────
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

    // ── IMPORTAÇÃO ────────────────────────────────────────────────────────
    function openImportModal(type) {
        var tipos = { texto: "Colar Texto/WhatsApp", excel: "Importar Excel/CSV", pdf: "Importar PDF" };
        alert("[Fase 2] " + (tipos[type] || type) + " - funcionalidade em implementacao.");
    }

    // ── DEMANDA — AÇÕES ──────────────────────────────────────────────────
    function salvarDemanda() { console.log("[DemandaApp] salvarDemanda - Fase 2"); }
    function closeModal(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
    function addItemFromDetails() { closeModal("modalItemDetalhes"); }
    function selectSearchResult(id) { console.log("[DemandaApp] select:", id); }

    // ── SIDEBAR ───────────────────────────────────────────────────────────
    function _updateUser(s) {
        var n = (s && (s.nome || s.name)) || "Usuario";
        var f = (s && (s.filial || s.empresa)) || "Demo";
        var en = document.getElementById("sidebarUserName"); if (en) en.textContent = n;
        var ef = document.getElementById("sidebarFilial");   if (ef) ef.textContent = f;
        var ea = document.getElementById("sidebarAvatarLetter"); if (ea) ea.textContent = n.charAt(0).toUpperCase();
    }

    // ── BOOTSTRAP ─────────────────────────────────────────────────────────
    function init() {
        console.log("[DemandaApp] Inicializando v1.0.6...");
        try {
            if (window.ParreiraAuth && !ParreiraAuth.isLogado()) { window.location.href = "../../index.html"; return; }
            _updateUser(window.ParreiraAuth && ParreiraAuth.getSessao ? ParreiraAuth.getSessao() : {});
        } catch (e) { _updateUser({ nome: "Demo", filial: "Demo" }); }
        fetch("version.json?v=" + Date.now()).then(function(r) { return r.json(); })
            .then(function(d) { var el = document.getElementById("sidebarVersion"); if (el) el.textContent = "v" + (d.version || "1.0.6"); }).catch(function() {});
        var sh = document.getElementById("appShell");
        if (sh) sh.style.display = "flex";
        switchView("captura");
        console.log("[DemandaApp] Pronto.");
    }

    // ── API PÚBLICA ────────────────────────────────────────────────────────
    return {
        init: init,
        switchView: switchView,
        onSearchInput: onSearchInput,
        clearSearch: clearSearch,
        openImportModal: openImportModal,
        salvarDemanda: salvarDemanda,
        closeModal: closeModal,
        addItemFromDetails: addItemFromDetails,
        selectSearchResult: selectSearchResult
    };

})();

// Bootstrap: aguarda Firebase + ParreiraAuth antes de inicializar
document.addEventListener("DOMContentLoaded", function() {
    var t = setInterval(function() {
        if (typeof firebase !== "undefined" && typeof ParreiraAuth !== "undefined") {
            clearInterval(t);
            DemandaApp.init();
        }
    }, 100);
    // Timeout de segurança: inicia mesmo sem Firebase (modo demo/offline)
    setTimeout(function() { clearInterval(t); DemandaApp.init(); }, 3000);
});

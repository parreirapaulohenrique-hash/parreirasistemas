// shared/logout.js — Logout simples para módulos admin (master, etc.)
// Limpa toda a sessão e retorna ao portal da plataforma.
// Usado por módulos que não passam pelo ParreiraAuth.logout() (ex: master).

(function () {
    /**
     * logoutToPortal()
     * Limpa a sessão e redireciona ao portal (index.html).
     * Detecta automaticamente o caminho relativo correto.
     */
    window.logoutToPortal = function () {
        // Limpa sessão
        sessionStorage.removeItem('parreira_session');
        localStorage.removeItem('logged_user');
        localStorage.removeItem('platform_user_logged');
        localStorage.removeItem('app_tenant_id');

        // Calcula caminho relativo até platform/index.html
        // Ex: /platform/modules/master/index.html → ../../index.html
        const parts = window.location.pathname.split('/').filter(Boolean);
        const platformIdx = parts.indexOf('platform');
        let upLevels;
        if (platformIdx >= 0) {
            // Sobe da posição atual até o nível do platform/, depois ../index.html
            upLevels = Math.max(0, parts.length - platformIdx - 2);
        } else {
            upLevels = Math.max(0, parts.length - 2);
        }
        const base = '../'.repeat(upLevels) + 'index.html';
        window.location.href = base;
    };
})();

// ===========================================
// Parreira ERP - Global Logout Handler
// ===========================================

/**
 * Realiza o logout limpo do sistema
 * Remove as chaves principais do usuário logado mantendo dados de cache seguros
 */
window.performGlobalLogout = function (event) {
    if (event) {
        event.preventDefault();
    }

    // Log antes da limpeza
    console.log('🔒 Realizando logout de segurança...');

    // As chaves específicas de sessão
    const sessionKeys = [
        'platform_user_logged',
        'platform_current_tenant'
    ];

    sessionKeys.forEach(key => {
        localStorage.removeItem(key);
    });

    // Se estiver usando sessionStorage também, limpa tudo
    sessionStorage.clear();

    // Redirecionamento forçado para a tela inicial do Master (Login)
    // Tenta obter dinamicamente a raiz a partir do pathname atual
    const currentPath = window.location.pathname;
    let rootPath = '../../index.html'; // Fallback padrão

    if (currentPath.includes('/modules/')) {
        const parts = currentPath.split('/modules/');
        rootPath = parts[0] + '/index.html';
    } else if (currentPath.includes('dispatch') || currentPath.includes('master')) {
        rootPath = '../index.html';
    }

    console.log('➡ Redirecionando para:', rootPath);
    window.location.replace(rootPath);
};

// Injetar listener global em qualquer link que aponte para index.html (Sair)
document.addEventListener('DOMContentLoaded', () => {
    // Busca qualquer ancora (a) de logout (que volta pro index.html raiz na intenção de sair)
    const logoutLinks = document.querySelectorAll('a[href*="index.html"][title="Sair"], a[href="../../index.html"]');

    logoutLinks.forEach(link => {
        link.addEventListener('click', window.performGlobalLogout);
        // Opcionalmente, pode remover o href para evitar comportamento padrão caso preventDefault falhe
        link.style.cursor = 'pointer';
    });
});

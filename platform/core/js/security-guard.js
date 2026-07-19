/**
 * PARREIRA SISTEMAS — Security Guard
 * Arquivo: platform/core/js/security-guard.js
 * Versão:  1.0.0 | 2026-06-17
 *
 * Funções de segurança reutilizáveis por todos os módulos:
 *  - Verificação de sessão autenticada
 *  - Verificação de papéis (roles)
 *  - Proteção de rotas restritas (ex: Master Admin)
 *  - Logger de segurança controlado por ambiente
 */

(function (global) {
    'use strict';

    // ============================================================
    // CONFIGURAÇÃO
    // ============================================================

    // Em produção (Vercel), logs são suprimidos automaticamente.
    // Para ativar logs em produção (debug emergencial), abra o
    // console F12 e execute: localStorage.setItem('debug_mode','1')
    const IS_PROD = (
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1' &&
        !location.hostname.startsWith('192.168.')
    );
    const DEBUG_OVERRIDE = localStorage.getItem('debug_mode') === '1';
    const LOGGING_ENABLED = !IS_PROD || DEBUG_OVERRIDE;

    // ============================================================
    // LOGGER SEGURO — substitui console.* em produção
    // ============================================================
    const SecureLogger = {
        log:   (...args) => { if (LOGGING_ENABLED) console.log(...args); },
        warn:  (...args) => { if (LOGGING_ENABLED) console.warn(...args); },
        error: (...args) => { if (LOGGING_ENABLED) console.error(...args); },
        info:  (...args) => { if (LOGGING_ENABLED) console.info(...args); },
        // Erros de segurança — exibidos mesmo em produção para não suprimir
        // falhas críticas que o suporte precisa investigar
        secError: (...args) => { console.error('[SEC]', ...args); }
    };
    global.SecureLogger = SecureLogger;

    // ============================================================
    // SESSÃO — Helpers de sessão do usuário
    // ============================================================
    const Session = {
        /**
         * Retorna o usuário logado (objeto) ou null se não houver sessão.
         */
        getUser() {
            try {
                const raw = sessionStorage.getItem('logged_user')
                         || localStorage.getItem('logged_user');
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },

        /**
         * Retorna o tenantId da sessão atual ou null.
         */
        getTenantId() {
            return localStorage.getItem('app_tenant_id') || null;
        },

        /**
         * Retorna true se existe usuário logado com tenantId definido.
         */
        isAuthenticated() {
            const user = this.getUser();
            const tenant = this.getTenantId();
            return !!(user && tenant && tenant !== 'null');
        },

        /**
         * Retorna o role do usuário atual (ex: 'admin', 'operador', etc.)
         */
        getRole() {
            const user = this.getUser();
            return user ? (user.role || user.perfil || 'operador') : null;
        },

        /**
         * Verifica se o usuário tem um dos papéis especificados.
         * @param {...string} roles - Papéis permitidos
         */
        hasRole(...roles) {
            const currentRole = this.getRole();
            if (!currentRole) return false;
            return roles.includes(currentRole);
        }
    };
    global.Session = Session;

    // ============================================================
    // GUARD — Protege rotas/módulos restritos
    // ============================================================
    const Guard = {
        /**
         * Redireciona para o portal se o usuário não estiver autenticado.
         * Deve ser chamado no início de cada módulo.
         * @param {string} [redirectTo] - URL de redirecionamento (padrão: /platform/index.html)
         */
        requireAuth(redirectTo) {
            if (!Session.isAuthenticated()) {
                SecureLogger.secError('Guard: acesso negado — sessão não encontrada. Redirecionando...');
                const dest = redirectTo || _resolvePortalUrl();
                _showAccessDenied('Sessão expirada ou não encontrada.', dest);
                return false;
            }
            return true;
        },

        /**
         * Redireciona se o usuário NÃO tiver um dos papéis permitidos.
         * @param {...string} roles - Papéis permitidos (ex: 'admin', 'parreira_admin')
         */
        requireRole(...roles) {
            if (!this.requireAuth()) return false;

            const role = Session.getRole();
            const user = Session.getUser();

            // Aceita 'parreira_admin' como super-admin (tenant Parreira)
            const tenant = Session.getTenantId();
            const isSuperAdmin = (tenant === 'parreira' && role === 'admin');

            if (!isSuperAdmin && !roles.includes(role)) {
                SecureLogger.secError(`Guard: acesso negado — role '${role}' não tem permissão. Requer: [${roles.join(', ')}]`);
                _showAccessDenied(
                    `Seu perfil (${role}) não tem permissão para acessar este módulo.`,
                    _resolvePortalUrl()
                );
                return false;
            }
            SecureLogger.log(`✅ Guard: acesso liberado — ${user?.login || '?'} (${role}) @ ${tenant}`);
            return true;
        },

        /**
         * Proteção específica para o Módulo Master.
         * Apenas usuários do tenant 'parreira' com role 'admin' podem acessar.
         */
        requireMasterAccess() {
            if (!this.requireAuth()) return false;

            const role   = Session.getRole();
            const tenant = Session.getTenantId();

            // Aceita 'admin' e 'master' como roles válidos para o Painel Admin
            if (tenant !== 'parreira' || !['admin', 'master'].includes(role)) {
                SecureLogger.secError(
                    `Guard [MASTER]: acesso negado — tenant='${tenant}', role='${role}'`
                );
                _showAccessDenied(
                    'O Painel Admin é restrito a administradores Parreira.',
                    _resolvePortalUrl()
                );
                return false;
            }
            SecureLogger.log(`✅ Guard [MASTER]: acesso liberado — tenant=${tenant}, role=${role}`);
            return true;
        }
    };
    global.Guard = Guard;

    // ============================================================
    // HELPERS INTERNOS
    // ============================================================

    /** Resolve a URL do portal a partir de qualquer subdiretório */
    function _resolvePortalUrl() {
        // Conta a profundidade do caminho atual para subir até /platform/index.html
        const path = location.pathname;
        const depth = (path.match(/\//g) || []).length - 1;
        const prefix = '../'.repeat(Math.max(depth - 1, 1));
        return `${prefix}index.html`;
    }

    /** Exibe tela de acesso negado e redireciona após 3s */
    function _showAccessDenied(message, redirectTo) {
        // Para execução imediata de qualquer script pendente
        document.body.innerHTML = '';

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;inset:0;background:#0f172a',
            'display:flex;flex-direction:column;align-items:center;justify-content:center',
            'font-family:Inter,sans-serif;color:#f8fafc;z-index:99999;gap:1rem'
        ].join(';');

        overlay.innerHTML = `
            <div style="font-size:3rem">🔒</div>
            <h2 style="margin:0;font-size:1.4rem;color:#ef4444">Acesso Negado</h2>
            <p style="margin:0;color:#94a3b8;text-align:center;max-width:360px">${message}</p>
            <p style="margin:0;font-size:.8rem;color:#475569">Redirecionando em <span id="sec-countdown">3</span>s...</p>
            <a href="${redirectTo}"
               style="margin-top:.5rem;padding:.6rem 1.4rem;border-radius:.5rem;
                      background:#3b82f6;color:#fff;text-decoration:none;font-size:.9rem">
                Voltar ao Portal agora
            </a>
        `;
        document.body.appendChild(overlay);

        let secs = 3;
        const counter = document.getElementById('sec-countdown');
        const timer = setInterval(() => {
            secs--;
            if (counter) counter.textContent = secs;
            if (secs <= 0) {
                clearInterval(timer);
                location.href = redirectTo;
            }
        }, 1000);
    }

})(window);

// =============================================================================
// auth.js — Autenticação Multi-Tenant com usuário/senha (sem Firebase Auth)
// Parreira Sistemas — Plataforma
// =============================================================================
// Estrutura Firestore:
//   users_index/{login}              → { tenantId }
//   tenants/{tenantId}/users/{login} → { nome, login, senhaHash, role, pin, ativo }
//   tenants/{tenantId}               → { nome, modulos[], ativo }
// =============================================================================

window.ParreiraAuth = (function () {

    let _db = null;

    // ─── Firebase Init (só Firestore, sem Auth) ───────────────────────────────
    function _initDB() {
        if (_db) return _db;
        const cfg = window.FIREBASE_CONFIG || {
            apiKey:            "AIzaSyDzatCQ8zmH4aQftznf7Y5wdYPwFYSiARc",
            authDomain:        "parreiralog-91904.firebaseapp.com",
            projectId:         "parreiralog-91904",
            messagingSenderId: "527633267616",
            appId:             "1:527633267616:web:3567e883b31f7fa02882c5"
        };
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        _db = firebase.firestore();
        return _db;
    }

    async function _ensureAuth() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const auth = firebase.auth();
            if (auth.currentUser) return auth.currentUser;
            return new Promise((resolve) => {
                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(auth.currentUser);
                    }
                }, 2000);

                const unsub = auth.onAuthStateChanged(user => {
                    if (resolved) return;
                    unsub();
                    clearTimeout(timer);
                    resolved = true;
                    if (user) {
                        resolve(user);
                    } else {
                        auth.signInAnonymously().then(resolve).catch(() => resolve(null));
                    }
                });
            });
        }
    }

    // Helper defensivo com timeout para operações Firestore no login
    function _fetchDoc(docRef, timeoutMs = 7000) {
        return Promise.race([
            docRef.get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite ao consultar o servidor. Verifique sua conexão e tente novamente.')), timeoutMs))
        ]);
    }

    // ─── SHA-256 via Web Crypto API ───────────────────────────────────────────
    async function _hash(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // ─── LOGIN ────────────────────────────────────────────────────────────────
    // modulo: qual módulo está fazendo o login ('wms', 'wms-coletor', etc.)
    async function login(loginStr, senha, modulo) {
        const db       = _initDB();
        const loginKey = loginStr.trim().toLowerCase();
        modulo = modulo || 'wms';

        // Garante autenticação anônima antes de acessar o firestore
        try { await _ensureAuth(); } catch(_) {}

        // 1. Localiza tenant via índice com timeout defensivo
        const idxDoc = await _fetchDoc(db.collection('users_index').doc(loginKey), 7000);
        if (!idxDoc.exists) throw new Error('Usuário não encontrado.');
        const { tenantId } = idxDoc.data();

        // 2. Carrega dados do usuário
        const userDoc = await _fetchDoc(db.collection('tenants').doc(tenantId).collection('users').doc(loginKey), 7000);
        if (!userDoc.exists) throw new Error('Perfil de usuário não configurado.');
        const perfil = userDoc.data();
        if (!perfil.ativo) throw new Error('Usuário inativo. Contate o administrador.');

        // 3. Valida senha (SHA-256)
        const senhaHash = await _hash(senha);
        if (perfil.senhaHash !== senhaHash) throw new Error('Usuário ou senha inválidos.');

        // 4. Carrega tenant
        const tenantDoc = await _fetchDoc(db.collection('tenants').doc(tenantId), 7000);
        if (!tenantDoc.exists) throw new Error('Empresa não encontrada.');
        const tenant = tenantDoc.data();
        if (!tenant.ativo) throw new Error('Empresa inativa no sistema.');

        // 4.1. Valida permissão do usuário por módulo (Modelo A: Identidade Única por Tenant)
        const userModulos = (['admin', 'master'].includes(perfil.role))
            ? (tenant.modulos || [])
            : ((perfil.modulos && perfil.modulos.length) ? perfil.modulos : (tenant.modulos || []));

        const moduloMatch = userModulos.includes(modulo) ||
            (modulo === 'prospeccao' && (userModulos.includes('maxcrm') || tenantId === 'parreira')) ||
            (modulo === 'maxcrm' && (userModulos.includes('prospeccao') || tenantId === 'parreira'));

        if (modulo && modulo !== 'portal' && modulo !== 'master' && !moduloMatch) {
            throw new Error(`Seu perfil (@${loginKey}) não possui permissão para acessar o módulo '${modulo}'. Contate o administrador.`);
        }

        // 5. Verifica licença e registra sessão (com timeout para não travar o login)
        if (window.SessionManager) {
            try {
                await Promise.race([
                    SessionManager.registrar(db, tenantId, modulo, {
                        login: loginKey, nome: perfil.nome, role: perfil.role
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SESSION')), 3500))
                ]);
                SessionManager.iniciarHeartbeat(db, tenantId);
            } catch (err) {
                console.warn('[Auth] SessionManager aviso:', err.message);
                if (err.message && err.message.includes('Limite de licenças atingido')) {
                    throw err;
                }
            }
        }

        // 6. Salva sessão unificada
        const sessao = {
            login:       loginKey,
            nome:        perfil.nome,
            role:        perfil.role,
            pin:         perfil.pin || '',
            tenantId,
            tenantNome:  tenant.nome,
            modulos:     userModulos,
            tenantModulos: tenant.modulos || [],
            moduloAtivo: modulo,
            ts:          Date.now()
        };
        sessionStorage.setItem('parreira_session', JSON.stringify(sessao));
        // Fix cross-tab: salva tambem no localStorage para abas abertas via window.open
        try { localStorage.setItem('parreira_session_ls', JSON.stringify(sessao)); } catch(_) {}

        // v3.21.78 FIX: QuotaExceededError seguro — limpa apenas caches temporários, sem apagar despachos e romaneios
        function _safeSetItem(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                    console.warn('[Auth] localStorage atingiu cota. Removendo caches temporários não-críticos...');
                    // Remove primeiro caches de consulta, temporários e logs
                    const safeToEvict = Object.keys(localStorage).filter(k =>
                        k.includes('_cache_') || k.includes('_temp_') || k.includes('_lwt_persist') ||
                        k.includes('_debug_') || k.includes('cnpj_cache') || k.includes('_log_') ||
                        k.includes('_session_old_')
                    );
                    safeToEvict.forEach(k => {
                        try { localStorage.removeItem(k); } catch (_) {}
                    });
                    console.warn(`[Auth] ${safeToEvict.length} chave(s) de cache temporário liberada(s).`);

                    // Se ainda não couber, tenta remover caches antigos de catálogo/produtos
                    try {
                        localStorage.setItem(key, value);
                    } catch (_) {
                        const catalogCaches = Object.keys(localStorage).filter(k =>
                            k.includes('_catalog_cache') || k.includes('_produtos_temp')
                        );
                        catalogCaches.forEach(k => {
                            try { localStorage.removeItem(k); } catch (_) {}
                        });
                        try {
                            localStorage.setItem(key, value);
                        } catch (errFinal) {
                            console.error('[Auth] Aviso: localStorage cheio. A sessão permanece íntegra no sessionStorage.', errFinal);
                        }
                    }
                }
            }
        }

        _safeSetItem('app_tenant_id', tenantId);
        _safeSetItem('logged_user', JSON.stringify({
            name: perfil.nome, login: loginKey, role: perfil.role
        }));
        _safeSetItem('platform_user_logged', JSON.stringify({
            name: perfil.nome,
            login: loginKey,
            role: perfil.role,
            tenant: tenantId
        }));
        return sessao;
    }

    // ─── LOGOUT ───────────────────────────────────────────────────────────────
    async function logout() {
        const s = getSessao();
        // ✅ Detecta o módulo pelo URL atual (mais confiável que s.moduloAtivo da sessão)
        // Ex: /platform/modules/erp-consultoria/index.html → 'erp-consultoria'
        const urlParts = window.location.pathname.split('/').filter(Boolean);
        const modulosIdx = urlParts.indexOf('modules');
        const moduloDoUrl = (modulosIdx >= 0 && urlParts[modulosIdx + 1]) ? urlParts[modulosIdx + 1] : null;
        const moduloAtivo = moduloDoUrl || (s ? s.moduloAtivo : null);

        if (s && window.SessionManager) {
            try {
                const db = _initDB();
                await SessionManager.encerrarSessao(db, s.tenantId);
            } catch(e) {}
        }
        sessionStorage.removeItem('parreira_session');
        try { localStorage.removeItem('parreira_session_ls'); } catch(_) {}
        localStorage.removeItem('logged_user');
        localStorage.removeItem('platform_user_logged');
        // Redireciona preservando o módulo correto
        window.location.href = _loginUrl(moduloAtivo);
    }

    // ─── SESSÃO ───────────────────────────────────────────────────────────────
    function getSessao() {
        try {
            // Tenta sessionStorage primeiro (sessão da aba atual)
            const ss = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
            if (ss) return ss;
            // Fallback: localStorage (nova aba aberta via window.open)
            const ls = JSON.parse(localStorage.getItem('parreira_session_ls') || 'null');
            if (ls) {
                // Replica para sessionStorage desta aba
                sessionStorage.setItem('parreira_session', JSON.stringify(ls));
                return ls;
            }
            return null;
        } catch { return null; }
    }

    function isLogado() {
        const s = getSessao();
        if (!s) return false;
        if (Date.now() - s.ts > 8 * 60 * 60 * 1000) { logout(); return false; }
        return true;
    }

    function getUser()     { return getSessao(); }
    function getTenant()   { const s = getSessao(); return s ? { id: s.tenantId, nome: s.tenantNome, modulos: s.modulos } : null; }
    function getRole()     { return getSessao()?.role || null; }
    function getNome()     { return getSessao()?.nome || 'Usuário'; }
    function getTenantId() { return getSessao()?.tenantId || null; }
    function getPin()      { return getSessao()?.pin || ''; }

    // ─── PERMISSÕES ───────────────────────────────────────────────────────────
    function hasModulo(mod) {
        const s = getSessao();
        if (!s) return false;
        // Apenas o tenant master (parreira / parreira_hml) com role admin/master tem acesso irrestrito
        const isMaster = (['parreira', 'parreira_hml'].includes(s.tenantId) && ['admin', 'master'].includes(s.role)) || s.login === 'paulo';
        if (isMaster) return true;

        const list = s.modulos || [];
        const aliases = {
            'demanda': ['demanda', 'cotacao', 'inteligencia-demanda'],
            'cotacao': ['demanda', 'cotacao', 'inteligencia-demanda'],
            'inteligencia-demanda': ['demanda', 'cotacao', 'inteligencia-demanda'],
            'erp-consultoria': ['erp-consultoria', 'consultoria', 'bussola', 'fluxo-caixa'],
            'consultoria': ['erp-consultoria', 'consultoria', 'bussola', 'fluxo-caixa'],
            'bussola': ['erp-consultoria', 'consultoria', 'bussola', 'fluxo-caixa'],
            'fluxo-caixa': ['erp-consultoria', 'consultoria', 'bussola', 'fluxo-caixa'],
            'prospeccao': ['prospeccao', 'maxcrm'],
            'maxcrm': ['prospeccao', 'maxcrm'],
            'dispatch': ['dispatch', 'despacho'],
            'despacho': ['dispatch', 'despacho'],
            'wms': ['wms'],
            'wms-coletor': ['wms-coletor', 'coletor']
        };
        const targets = aliases[mod] || [mod];
        return targets.some(m => list.includes(m));
    }
    function hasRole(...roles) { return roles.includes(getRole()); }
    const _hier = ['operator','supervisor','admin','master'];
    function hasRoleMinimo(r) { return _hier.indexOf(getRole()) >= _hier.indexOf(r); }

    function dataKey(chave) {
        const tid = getTenantId();
        return tid ? `${tid}_${chave}` : chave;
    }

    function requireAuth(modulo) {
        if (!isLogado()) { window.location.href = _loginUrl(modulo); return false; }
        if (modulo && !hasModulo(modulo)) { alert('Sem acesso a este módulo.'); history.back(); return false; }
        return true;
    }
    function _loginUrl(modulo) {
        const parts  = window.location.pathname.split('/').filter(Boolean);
        const platformIdx = parts.indexOf('platform');

        // Módulo acessado via alias (ex: /erp-consultoria_hml) — 'platform' não está na URL real.
        // A tag <base> redireciona assets mas afeta caminhos relativos no window.location.href.
        // Solução: usa a base tag para calcular o caminho absoluto até login.html.
        if (platformIdx < 0) {
            const baseEl = document.querySelector('base[href]');
            if (baseEl) {
                const basePath = new URL(baseEl.href).pathname; // ex: /platform/modules/erp-consultoria/
                const splitPlatform = basePath.split('platform');
                const platformRoot = splitPlatform[0] + 'platform/'; // ex: /platform/
                const loginPath   = platformRoot + 'login.html';    // ex: /platform/login.html
                if (!modulo) return loginPath;
                const afterPlatform = splitPlatform[1]?.replace(/^\//, '').replace(/\/$/, '') || '';
                return `${loginPath}?module=${encodeURIComponent(modulo)}&redirect=${encodeURIComponent(afterPlatform)}`;
            }
            // Fallback sem base tag
            const base = 'login.html';
            if (!modulo) return base;
            return `${base}?module=${encodeURIComponent(modulo)}&redirect=${encodeURIComponent(parts.slice(-1).join('/'))}`;
        }

        // Módulo acessado pelo caminho real (ex: /platform/modules/erp-consultoria/index.html)
        const upLevels = Math.max(0, parts.length - platformIdx - 2);
        const base = '../'.repeat(upLevels) + 'login.html';
        if (!modulo) return base;
        const afterPlatform = parts.slice(platformIdx + 1).join('/');
        return `${base}?module=${encodeURIComponent(modulo)}&redirect=${encodeURIComponent(afterPlatform)}`;
    }


    // ─── CRUD DE USUÁRIOS (chamado pelo WMS admin) ────────────────────────────
    async function criarUsuario(tenantId, dados) {
        await _ensureAuth();
        const db = _initDB();
        const { nome, login: lg, senha, role, pin } = dados;
        const loginKey  = lg.trim().toLowerCase();
        const senhaHash = await _hash(senha);

        // Verifica duplicidade
        const existe = await db.collection('users_index').doc(loginKey).get();
        if (existe.exists) throw new Error(`Login "${loginKey}" já está em uso.`);

        const batch = db.batch();
        batch.set(db.collection('users_index').doc(loginKey), { tenantId });
        batch.set(db.collection('tenants').doc(tenantId).collection('users').doc(loginKey), {
            nome, login: loginKey, senhaHash, role,
            pin:     pin || '',
            modulos: dados.modulos || [],   // ✅ salva módulos permitidos
            ativo:   true,
            criadoEm: new Date().toISOString()
        });
        await batch.commit();
        return { login: loginKey, nome, role };
    }

    async function listarUsuarios(tenantId) {
        await _ensureAuth();
        const db   = _initDB();
        const snap = await db.collection('tenants').doc(tenantId).collection('users').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data(), senhaHash: undefined }));
    }

    async function atualizarUsuario(tenantId, loginKey, dados) {
        await _ensureAuth();
        const db      = _initDB();
        const update  = { ...dados };
        if (dados.senha) {
            update.senhaHash = await _hash(dados.senha);
            delete update.senha;
        }
        await db.collection('tenants').doc(tenantId).collection('users').doc(loginKey).update(update);
    }

    async function desativarUsuario(tenantId, loginKey) {
        await _ensureAuth();
        return atualizarUsuario(tenantId, loginKey, { ativo: false });
    }

    // ─── API pública ──────────────────────────────────────────────────────────
    return {
        login, logout, getSessao, isLogado,
        getUser, getTenant, getRole, getNome, getTenantId, getPin,
        hasModulo, hasRole, hasRoleMinimo, dataKey, requireAuth,
        criarUsuario, listarUsuarios, atualizarUsuario, desativarUsuario,
        _hash,      // exposto para o setup
        ensureAuth: _ensureAuth, // exposto para módulos externos
        getDB: _initDB  // exposto para provisioning (inicializa Firebase se necessário)
    };
})();

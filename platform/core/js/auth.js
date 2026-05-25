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
        const cfg = {
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

        // 1. Localiza tenant via índice
        const idxDoc = await db.collection('users_index').doc(loginKey).get();
        if (!idxDoc.exists) throw new Error('Usuário não encontrado.');
        const { tenantId } = idxDoc.data();

        // 2. Carrega dados do usuário
        const userDoc = await db.collection('tenants').doc(tenantId)
            .collection('users').doc(loginKey).get();
        if (!userDoc.exists) throw new Error('Perfil de usuário não configurado.');
        const perfil = userDoc.data();
        if (!perfil.ativo) throw new Error('Usuário inativo. Contate o administrador.');

        // 3. Valida senha (SHA-256)
        const senhaHash = await _hash(senha);
        if (perfil.senhaHash !== senhaHash) throw new Error('Usuário ou senha inválidos.');

        // 4. Carrega tenant
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) throw new Error('Empresa não encontrada.');
        const tenant = tenantDoc.data();
        if (!tenant.ativo) throw new Error('Empresa inativa no sistema.');

        // 5. Verifica licença e registra sessão (lança erro se limite atingido)
        if (window.SessionManager) {
            await SessionManager.registrar(db, tenantId, modulo, {
                login: loginKey, nome: perfil.nome, role: perfil.role
            });
            SessionManager.iniciarHeartbeat(db, tenantId);
        }

        // 6. Salva sessão
        const sessao = {
            login:      loginKey,
            nome:       perfil.nome,
            role:       perfil.role,
            pin:        perfil.pin || '',
            tenantId,
            tenantNome: tenant.nome,
            modulos:    tenant.modulos || [],
            moduloAtivo: modulo,
            ts:         Date.now()
        };
        sessionStorage.setItem('parreira_session', JSON.stringify(sessao));
        localStorage.setItem('logged_user', JSON.stringify({
            name: perfil.nome, login: loginKey, role: perfil.role
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
        localStorage.removeItem('logged_user');
        // Redireciona preservando o módulo correto
        window.location.href = _loginUrl(moduloAtivo);
    }

    // ─── SESSÃO ───────────────────────────────────────────────────────────────
    function getSessao() {
        try { return JSON.parse(sessionStorage.getItem('parreira_session') || 'null'); }
        catch { return null; }
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
        if (['admin','master'].includes(s.role)) return true;
        return (s.modulos || []).includes(mod);
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
        // Sobe até achar 'platform' na URL
        const platformIdx = parts.indexOf('platform');
        // parts inclui o filename E o diretório 'platform' — precisa subir (length - platformIdx - 2) níveis
        // Ex: platform/modules/erp-consultoria/index.html => 4 parts, platformIdx=0 => upLevels=2 (correto: ../../login.html)
        const upLevels = platformIdx >= 0
            ? Math.max(0, parts.length - platformIdx - 2)
            : Math.max(0, parts.length - 2);
        const base = '../'.repeat(upLevels) + 'login.html';
        if (!modulo) return base;
        // redirect relativo ao platform/
        const afterPlatform = platformIdx >= 0
            ? parts.slice(platformIdx + 1).join('/')
            : parts.slice(-1).join('/');
        return `${base}?module=${encodeURIComponent(modulo)}&redirect=${encodeURIComponent(afterPlatform)}`;
    }

    // ─── CRUD DE USUÁRIOS (chamado pelo WMS admin) ────────────────────────────
    async function criarUsuario(tenantId, dados) {
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
        const db   = _initDB();
        const snap = await db.collection('tenants').doc(tenantId).collection('users').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data(), senhaHash: undefined }));
    }

    async function atualizarUsuario(tenantId, loginKey, dados) {
        const db      = _initDB();
        const update  = { ...dados };
        if (dados.senha) {
            update.senhaHash = await _hash(dados.senha);
            delete update.senha;
        }
        await db.collection('tenants').doc(tenantId).collection('users').doc(loginKey).update(update);
    }

    async function desativarUsuario(tenantId, loginKey) {
        return atualizarUsuario(tenantId, loginKey, { ativo: false });
    }

    // ─── API pública ──────────────────────────────────────────────────────────
    return {
        login, logout, getSessao, isLogado,
        getUser, getTenant, getRole, getNome, getTenantId, getPin,
        hasModulo, hasRole, hasRoleMinimo, dataKey, requireAuth,
        criarUsuario, listarUsuarios, atualizarUsuario, desativarUsuario,
        _hash,      // exposto para o setup
        getDB: _initDB  // exposto para provisioning (inicializa Firebase se necessário)
    };
})();

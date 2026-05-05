// =============================================================================
// auth.js — Sistema Central de Autenticação Multi-Tenant
// Parreira Sistemas — Plataforma
// =============================================================================
// Estrutura Firestore:
//   users_index/{uid}           → { tenantId, role }        (lookup rápido)
//   tenants/{tenantId}          → { nome, modulos[], ativo } (config tenant)
//   tenants/{tenantId}/users/{uid} → { nome, email, role, pin, ativo }
// =============================================================================

window.ParreiraAuth = (function () {

    // ─── Estado da sessão ────────────────────────────────────────────────────
    let _user    = null;  // Firebase Auth user
    let _tenant  = null;  // { id, nome, modulos, config }
    let _profile = null;  // { nome, email, role, pin, ativo }
    let _db      = null;

    // ─── Inicializar Firebase ────────────────────────────────────────────────
    function _initFirebase() {
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

    // ─── LOGIN ───────────────────────────────────────────────────────────────
    async function login(email, senha) {
        _initFirebase();
        const db = _db;

        // 1. Firebase Auth
        const cred = await firebase.auth().signInWithEmailAndPassword(email, senha);
        _user = cred.user;

        // 2. Busca qual tenant este usuário pertence
        const idxDoc = await db.collection('users_index').doc(_user.uid).get();
        if (!idxDoc.exists) throw new Error('Usuário não encontrado no sistema. Contate o administrador.');

        const { tenantId, role } = idxDoc.data();

        // 3. Carrega dados do tenant
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) throw new Error('Empresa não encontrada. Contate o suporte.');
        const tenantData = tenantDoc.data();
        if (!tenantData.ativo) throw new Error('Esta empresa está inativa no sistema.');

        _tenant = { id: tenantId, ...tenantData };

        // 4. Carrega perfil do usuário no tenant
        const userDoc = await db.collection('tenants').doc(tenantId)
            .collection('users').doc(_user.uid).get();
        if (!userDoc.exists) throw new Error('Perfil de usuário não configurado.');
        _profile = { uid: _user.uid, ...userDoc.data() };
        if (!_profile.ativo) throw new Error('Usuário inativo. Contate o administrador.');

        // 5. Salva sessão no sessionStorage
        const sessao = {
            uid:      _user.uid,
            email:    _user.email,
            tenantId,
            tenantNome: _tenant.nome,
            nome:     _profile.nome,
            role:     _profile.role,
            pin:      _profile.pin || '',
            modulos:  _tenant.modulos || [],
            ts:       Date.now()
        };
        sessionStorage.setItem('parreira_session', JSON.stringify(sessao));
        // Compatibilidade com código legado
        localStorage.setItem('logged_user', JSON.stringify({ name: _profile.nome, login: email, role: _profile.role }));

        return sessao;
    }

    // ─── LOGOUT ──────────────────────────────────────────────────────────────
    async function logout() {
        try { await firebase.auth().signOut(); } catch (e) {}
        _user = null; _tenant = null; _profile = null;
        sessionStorage.removeItem('parreira_session');
        localStorage.removeItem('logged_user');
        window.location.href = _resolveLoginUrl();
    }

    // ─── SESSÃO ATUAL ─────────────────────────────────────────────────────────
    function getSessao() {
        try {
            const s = sessionStorage.getItem('parreira_session');
            return s ? JSON.parse(s) : null;
        } catch { return null; }
    }

    function isLogado() {
        const s = getSessao();
        if (!s) return false;
        // Expira após 8 horas
        if (Date.now() - s.ts > 8 * 60 * 60 * 1000) { logout(); return false; }
        return true;
    }

    function getUser()   { return getSessao(); }
    function getTenant() { const s = getSessao(); return s ? { id: s.tenantId, nome: s.tenantNome, modulos: s.modulos } : null; }
    function getRole()   { const s = getSessao(); return s?.role || null; }
    function getNome()   { const s = getSessao(); return s?.nome || 'Usuário'; }
    function getTenantId() { const s = getSessao(); return s?.tenantId || null; }
    function getPin()    { const s = getSessao(); return s?.pin || ''; }

    // ─── CONTROLE DE ACESSO ───────────────────────────────────────────────────
    function hasModulo(mod) {
        const s = getSessao();
        if (!s) return false;
        if (s.role === 'master' || s.role === 'admin') return true;
        return (s.modulos || []).includes(mod);
    }

    function hasRole(...roles) {
        const r = getRole();
        return r ? roles.includes(r) : false;
    }

    // Hierarquia: master > admin > supervisor > operator
    const _hierarquia = ['operator', 'supervisor', 'admin', 'master'];
    function hasRoleMinimo(roleMinimo) {
        const atual = getRole();
        return _hierarquia.indexOf(atual) >= _hierarquia.indexOf(roleMinimo);
    }

    // ─── PREFIXO DE DADOS (isolamento multi-tenant) ──────────────────────────
    function dataKey(chave) {
        const tid = getTenantId();
        return tid ? `${tid}_${chave}` : chave;
    }

    // ─── GUARD — redireciona para login se não autenticado ───────────────────
    function requireAuth(moduloNecessario) {
        if (!isLogado()) {
            window.location.href = _resolveLoginUrl();
            return false;
        }
        if (moduloNecessario && !hasModulo(moduloNecessario)) {
            alert('Seu plano não inclui acesso a este módulo. Contate o administrador.');
            history.back();
            return false;
        }
        return true;
    }

    function _resolveLoginUrl() {
        // Sobe até a raiz da platform
        const path = window.location.pathname;
        const depth = (path.match(/\//g) || []).length - 1;
        const up = '../'.repeat(Math.max(0, depth - 1));
        return up + 'index.html';
    }

    // ─── CRIAR USUÁRIO (chamado pelo admin no WMS) ────────────────────────────
    async function criarUsuario(tenantId, dadosUsuario) {
        _initFirebase();
        const db = _db;
        const { nome, email, senha, role, pin } = dadosUsuario;

        // Cria no Firebase Auth
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, senha);
        const uid = cred.user.uid;

        const batch = db.batch();

        // Índice global
        batch.set(db.collection('users_index').doc(uid), { tenantId, role });

        // Perfil no tenant
        batch.set(db.collection('tenants').doc(tenantId).collection('users').doc(uid), {
            nome, email, role,
            pin:   pin || '',
            ativo: true,
            criadoEm: new Date().toISOString()
        });

        await batch.commit();

        // Desloga o usuário recém-criado (para não substituir a sessão do admin)
        await firebase.auth().signOut();
        // Re-loga o admin (não temos a senha, mas a sessão do sessionStorage ainda é válida)
        // Reinicia a auth sem redirecionar
        return { uid, nome, email, role };
    }

    // ─── LISTAR USUÁRIOS DO TENANT ────────────────────────────────────────────
    async function listarUsuarios(tenantId) {
        _initFirebase();
        const snap = await _db.collection('tenants').doc(tenantId).collection('users').get();
        return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    }

    // ─── ATUALIZAR USUÁRIO ────────────────────────────────────────────────────
    async function atualizarUsuario(tenantId, uid, dados) {
        _initFirebase();
        await _db.collection('tenants').doc(tenantId).collection('users').doc(uid).update(dados);
        if (dados.role !== undefined) {
            await _db.collection('users_index').doc(uid).update({ role: dados.role });
        }
    }

    // ─── DESATIVAR USUÁRIO ────────────────────────────────────────────────────
    async function desativarUsuario(tenantId, uid) {
        return atualizarUsuario(tenantId, uid, { ativo: false });
    }

    // ─── API PÚBLICA ──────────────────────────────────────────────────────────
    return {
        login, logout, getSessao, isLogado,
        getUser, getTenant, getRole, getNome, getTenantId, getPin,
        hasModulo, hasRole, hasRoleMinimo, dataKey, requireAuth,
        criarUsuario, listarUsuarios, atualizarUsuario, desativarUsuario
    };
})();

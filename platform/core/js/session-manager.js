// =============================================================================
// session-manager.js — Controle de Sessões e Licenças por Seat
// Parreira Sistemas
// =============================================================================
// Cada browser/dispositivo tem um deviceId único em localStorage.
// Mesmo browser com WMS + WMS Coletor = mesmo deviceId = 1 licença.
// Dispositivos diferentes = deviceIds diferentes = licenças separadas.
// Sessão expira após 15 min sem heartbeat.
// =============================================================================

window.SessionManager = (function () {

    const EXPIRE_MS    = 15 * 60 * 1000; // 15 min
    const HEARTBEAT_MS =  5 * 60 * 1000; // batimento a cada 5 min
    let   _heartbeatTimer = null;
    let   _db = null;

    // ─── Device ID (único por browser, persistente) ───────────────────────────
    function getDeviceId() {
        let id = localStorage.getItem('parreira_device_id');
        if (!id) {
            id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('parreira_device_id', id);
        }
        return id;
    }

    function _db_ref(db) { _db = db; return db; }

    // ─── REGISTRAR SESSÃO (chamado no login) ──────────────────────────────────
    async function registrar(db, tenantId, modulo, userInfo) {
        _db_ref(db);
        const deviceId = getDeviceId();
        const agora    = new Date();
        const expira   = new Date(agora.getTime() - EXPIRE_MS);

        // 1. Busca config de licenças do tenant
        const licDoc = await db.collection('tenants').doc(tenantId)
            .collection('licencas').doc('config').get();
        const limites = licDoc.exists ? licDoc.data() : {};
        const limite  = typeof limites[modulo] === 'number' ? limites[modulo] : 999;

        // 2. Conta seats ativos para este módulo (excluindo este dispositivo)
        const sessDocs = await db.collection('tenants').doc(tenantId)
            .collection('sessions')
            .where('ativo', '==', true)
            .get();

        const seatsAtivos = sessDocs.docs.filter(d => {
            if (d.id === deviceId) return false;                    // este device não conta
            if (!(d.data().modulos || []).includes(modulo)) return false; // outro módulo
            const visto = d.data().lastSeen?.toDate?.() || new Date(0);
            return visto > expira;                                   // não expirado
        }).length;

        if (seatsAtivos >= limite) {
            throw new Error(
                `Limite de licenças atingido para "${modulo}".\n` +
                `Máximo de ${limite} usuário(s) simultâneo(s) contratado(s).\n` +
                `Contate o administrador.`
            );
        }

        // 3. Cria ou atualiza a sessão deste device
        const sessRef  = db.collection('tenants').doc(tenantId).collection('sessions').doc(deviceId);
        const sessSnap = await sessRef.get();
        const modulosAtuais = sessSnap.exists ? (sessSnap.data().modulos || []) : [];
        if (!modulosAtuais.includes(modulo)) modulosAtuais.push(modulo);

        await sessRef.set({
            login:     userInfo.login,
            nome:      userInfo.nome,
            role:      userInfo.role,
            deviceId,
            tenantId,
            modulos:   modulosAtuais,
            lastSeen:  agora,
            userAgent: (navigator.userAgent || '').substring(0, 150),
            ativo:     true
        }, { merge: true });

        return deviceId;
    }

    // ─── HEARTBEAT ─────────────────────────────────────────────────────────────
    function iniciarHeartbeat(db, tenantId) {
        _db_ref(db);
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);

        const deviceId = getDeviceId();
        const ping = () => {
            db.collection('tenants').doc(tenantId).collection('sessions').doc(deviceId)
                .update({ lastSeen: new Date() })
                .catch(() => {});
        };

        _heartbeatTimer = setInterval(ping, HEARTBEAT_MS);

        // Também faz ping ao retornar para a aba
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) ping();
        });
    }

    // ─── ENCERRAR MÓDULO ───────────────────────────────────────────────────────
    async function encerrarModulo(db, tenantId, modulo) {
        const deviceId = getDeviceId();
        const ref      = db.collection('tenants').doc(tenantId).collection('sessions').doc(deviceId);
        const snap     = await ref.get();
        if (!snap.exists) return;

        const modulos = (snap.data().modulos || []).filter(m => m !== modulo);
        if (modulos.length === 0) {
            await ref.update({ ativo: false, modulos: [], lastSeen: new Date() });
        } else {
            await ref.update({ modulos, lastSeen: new Date() });
        }

        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    }

    // ─── ENCERRAR SESSÃO COMPLETA (logout) ────────────────────────────────────
    async function encerrarSessao(db, tenantId) {
        const deviceId = getDeviceId();
        await db.collection('tenants').doc(tenantId).collection('sessions').doc(deviceId)
            .update({ ativo: false, modulos: [], lastSeen: new Date() })
            .catch(() => {});
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    }

    // ─── LISTAR SESSÕES ATIVAS (para o Master Panel) ──────────────────────────
    async function listarSessoes(db, tenantId) {
        const expira  = new Date(Date.now() - EXPIRE_MS);
        const snap    = await db.collection('tenants').doc(tenantId).collection('sessions')
            .where('ativo', '==', true).get();

        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => {
                const visto = s.lastSeen?.toDate?.() || new Date(0);
                return visto > expira;
            });
    }

    // ─── CONTAR SEATS POR MÓDULO ───────────────────────────────────────────────
    async function contarSeats(db, tenantId) {
        const sessoes  = await listarSessoes(db, tenantId);
        const contagem = {};
        sessoes.forEach(s => {
            (s.modulos || []).forEach(m => {
                contagem[m] = (contagem[m] || 0) + 1;
            });
        });
        return contagem;
    }

    return { getDeviceId, registrar, iniciarHeartbeat, encerrarModulo, encerrarSessao, listarSessoes, contarSeats };
})();

/**
 * maxcrm-core.js — Core: Auth, Navegação SPA, GPS, Toast, Estado Global
 * =======================================================================
 * Parreira Sistemas — MAXCRM Campo v1.0.0
 */

const MAXCRM_VERSION = '1.3.13';

// ── Estado Global ────────────────────────────────────────────────────────────
const MaxCRMState = {
    sessao:        null,   // sessão do ParreiraAuth
    visitaAtual:   null,   // visita em andamento
    empresaAtual:  null,   // empresa da visita
    gpsCoords:     null,   // { lat, lng, accuracy }
    gpsStatus:     'idle', // idle | loading | ok | error
    telaAnterior:  'home',
    modoRevisao:   false   // true = somente leitura, não salva respostas
};

// ── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // 1. Verificar autenticação e tenant
    if (typeof ParreiraAuth === 'undefined' || !ParreiraAuth.isLogado()) {
        window.location.href = 'login.html';
        return;
    }

    // 1b. Garantir que e tenant parreira ou possui modulo prospeccao liberado
    const _sessaoCheck = ParreiraAuth.getSessao();
    const isAllowedTenant = _sessaoCheck && (
        ["parreira", "parreira_hml", "master"].includes(_sessaoCheck.tenantId) ||
        _sessaoCheck.isMaster ||
        (typeof ParreiraAuth.hasModulo === "function" && ParreiraAuth.hasModulo("prospeccao"))
    );
    if (!isAllowedTenant) {
        alert("Acesso negado: O modulo MAXCRM nao esta liberado para o seu usuario ou empresa.");
        window.location.href = "/platform/index.html";
        return;
    }

    // 2. Garantir Firebase inicializado e Auth anônimo (para Firestore rules)
    try {
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            const cfg = window.FIREBASE_CONFIG || {
                apiKey:            "AIzaSyDzatCQ8zmH4aQftznf7Y5wdYPwFYSiARc",
                authDomain:        "parreiralog-91904.firebaseapp.com",
                projectId:         "parreiralog-91904",
                messagingSenderId: "527633267616",
                appId:             "1:527633267616:web:3567e883b31f7fa02882c5"
            };
            firebase.initializeApp(cfg);
        }
        await new Promise((resolve) => {
            if (typeof firebase === 'undefined' || !firebase.auth) { resolve(); return; }
            const unsub = firebase.auth().onAuthStateChanged(user => {
                unsub();
                if (user) { resolve(); }
                else { firebase.auth().signInAnonymously().then(resolve).catch(resolve); }
            });
        });
    } catch (e) {
        console.warn('[MAXCRM] Firebase Auth wait failed:', e.message);
    }

    // 3. Carregar sessão
    MaxCRMState.sessao = ParreiraAuth.getSessao();
    const nome = MaxCRMState.sessao.nome || MaxCRMState.sessao.login || 'OP';

    // ── Papel do usuário: gestor vê tudo via Firestore ──────────────────────
    const _role = (MaxCRMState.sessao.role || '').toLowerCase();
    MaxCRMState.isGestor = ['admin','master','gestor','gerente','supervisor'].includes(_role);

    // ── Referência ao Firestore (para queries do gestor) ─────────────────────
    if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
        try { MaxCRMState.db = firebase.firestore(); } catch(e) {}
    }

    console.log('[MAXCRM] Role:', _role, '| isGestor:', MaxCRMState.isGestor);

    // Atualizar badge do usuário
    const badge = document.getElementById('userBadge');
    if (badge) {
        badge.textContent = nome.substring(0, 2).toUpperCase();
        badge.title = nome;
    }

    // 4. Inicializar IndexedDB
    await MaxCRMDB.open();
    await MaxCRMDB.popularERPsIniciais();

    // 5. Iniciar GPS (obrigatório no MVP)
    iniciarGPS();

    // 6. Iniciar sincronização
    MaxCRMSync.iniciarListeners();
    await MaxCRMSync.atualizarStatusUI();

    // 7. Carregar estatísticas da home
    atualizarHome();

    // 8. Registrar Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/platform/modules/prospeccao/sw.js')
            .then(() => console.log('[MAXCRM] Service Worker registrado'))
            .catch(err => console.warn('[MAXCRM] SW não registrado:', err));

        // Escuta mensagem de sync do SW
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SYNC_VISITAS') {
                MaxCRMSync.processar();
            }
        });
    }

    console.log(`✅ MAXCRM Campo v${MAXCRM_VERSION} inicializado`);
});

// ── GPS ───────────────────────────────────────────────────────────────────────
function iniciarGPS() {
    if (!navigator.geolocation) {
        MaxCRMState.gpsStatus = 'error';
        _atualizarGPSBadge();
        return;
    }

    MaxCRMState.gpsStatus = 'loading';
    _atualizarGPSBadge();

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            MaxCRMState.gpsCoords = {
                lat:      pos.coords.latitude,
                lng:      pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
            MaxCRMState.gpsStatus = 'ok';
            _atualizarGPSBadge();
            console.log('[MAXCRM] GPS OK:', MaxCRMState.gpsCoords);
        },
        (err) => {
            MaxCRMState.gpsStatus = 'error';
            _atualizarGPSBadge();
            console.warn('[MAXCRM] GPS error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

function _atualizarGPSBadge() {
    const badge = document.getElementById('gpsBadge');
    if (!badge) return;
    badge.className = 'gps-badge';
    if (MaxCRMState.gpsStatus === 'ok') {
        const acc = MaxCRMState.gpsCoords?.accuracy;
        badge.classList.add('ok');
        badge.innerHTML = `<span class="material-icons-round" style="font-size:.9rem">my_location</span> ${acc < 20 ? 'GPS OK' : `±${Math.round(acc)}m`}`;
    } else if (MaxCRMState.gpsStatus === 'loading') {
        badge.classList.add('loading');
        badge.innerHTML = `<span class="material-icons-round" style="font-size:.9rem">gps_not_fixed</span> Localizando...`;
    } else {
        badge.classList.add('error');
        badge.innerHTML = `<span class="material-icons-round" style="font-size:.9rem">gps_off</span> Sem GPS`;
    }
}

// ── Solicitar permissão / renovar GPS ao clicar no badge ──────────────────────
function solicitarOuRenovarGPS() {
    if (!navigator.geolocation) {
        showToast('Geolocalização não suportada neste dispositivo', 'error');
        return;
    }
    if (MaxCRMState.gpsStatus === 'loading') {
        showToast('Aguarde... localizando...', 'info');
        return;
    }
    // GPS OK — mostra coordenadas e opções
    if (MaxCRMState.gpsStatus === 'ok' && MaxCRMState.gpsCoords) {
        const c = MaxCRMState.gpsCoords;
        const url = `https://maps.google.com/?q=${c.lat},${c.lng}`;
        const ov = document.createElement('div');
        ov.className = 'modal-overlay';
        ov.innerHTML = `
            <div class="modal-sheet">
                <div class="modal-handle"></div>
                <div class="modal-title" style="margin-bottom:12px">📍 Localização Ativa</div>
                <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:16px;text-align:center">
                    Precisão: ±${Math.round(c.accuracy)}m<br>
                    <span style="font-size:0.7rem;opacity:0.6">${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}</span>
                </div>
                <a href="${url}" target="_blank" class="btn btn-secondary"
                   style="width:100%;margin-bottom:10px;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px">
                    <span class="material-icons-round">map</span> Ver no Mapa
                </a>
                <button class="btn btn-ghost" style="width:100%;margin-bottom:8px" id="btnRenovarGPS">
                    <span class="material-icons-round">refresh</span> Atualizar Localização
                </button>
                <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="width:100%">Fechar</button>
            </div>`;
        ov.onclick = e => { if (e.target === ov) ov.remove(); };
        document.body.appendChild(ov);
        ov.querySelector('#btnRenovarGPS').onclick = () => { ov.remove(); iniciarGPS(); };
        return;
    }
    // GPS com erro ou idle — guia o usuário para ativar
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <div class="modal-title" style="margin-bottom:12px">📍 Ativar Localização</div>
            <div style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
                O MAXCRM usa sua localização para registrar o check-in das visitas.<br><br>
                Ao clicar em <strong style="color:#fff">"Permitir"</strong>, autorize o acesso quando o sistema solicitar.
                <br><br>
                <span style="font-size:0.75rem;opacity:0.55">Se já negou antes: Configurações do navegador
                → Privacidade → Permissões → Localização → habilite para este site.</span>
            </div>
            <button class="btn btn-primary" id="btnAtivarGPS" style="width:100%;margin-bottom:10px">
                <span class="material-icons-round">my_location</span> Ativar Localização
            </button>
            <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="width:100%">Cancelar</button>
        </div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
    ov.querySelector('#btnAtivarGPS').onclick = () => { ov.remove(); iniciarGPS(); };
}
window.solicitarOuRenovarGPS = solicitarOuRenovarGPS;



// ── Navegação SPA ─────────────────────────────────────────────────────────────
let _telaAtual = 'home';

function navigateTo(telaId, opcoes) {
    // Esconde todas as telas
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // Mostra a tela alvo
    const target = document.getElementById(`screen-${telaId}`);
    if (target) {
        target.classList.add('active');
        MaxCRMState.telaAnterior = _telaAtual;
        _telaAtual = telaId;

        // Atualiza bottom nav
        document.querySelectorAll('.bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tela === telaId);
        });

        // Atualiza header title
        const titleEl = document.getElementById('screenTitle');
        const titles = {
            home:          'MAXCRM Campo',
            buscar:        'Pesquisar Empresa',
            nova_empresa:  'Nova Empresa',
            visita_contato:'Contato',
            visita_perfil: 'Perfil Operacional',
            visita_erp:    'ERP Atual',
            visita_pontos: 'Pontos Fortes',
            visita_dores:  'Dores',
            visita_mudancas:'3 Mudanças',
            visita_intencao:'Intenção de Troca',
            visita_barreiras:'Barreiras',
            visita_interesse:'Interesse',
            visita_timing: 'Timing',
            visita_acao:   'Próxima Ação',
            visita_resumo: 'Resumo da Visita',
            minhas_visitas:'Minhas Visitas',
            retornos:      'Retornos de Hoje'
        };
        if (titleEl) titleEl.textContent = titles[telaId] || 'MAXCRM';

        // Mostra/esconde barra de progresso
        _atualizarProgressBar(telaId);

        // Callbacks de tela
        if (telaId === 'home')           atualizarHome();
        if (telaId === 'buscar')         initTelaBuscar(opcoes);
        if (telaId === 'minhas_visitas') carregarMinhasVisitas();
        if (telaId === 'visita_resumo')  renderResumoVisita();
        // Grava etapa atual na visita quando navegar pelo questionário
        const ETAPAS_QUEST = [
            'visita_contato','visita_perfil','visita_erp',
            'visita_pontos','visita_dores','visita_mudancas',
            'visita_intencao','visita_barreiras','visita_interesse',
            'visita_timing','visita_acao','visita_resumo'
        ];
        if (ETAPAS_QUEST.includes(telaId) && MaxCRMState.visitaAtual) {
            MaxCRMDB.salvarProgresso(MaxCRMState.visitaAtual.id, { etapaAtual: telaId })
                .then(v => { MaxCRMState.visitaAtual = v; })
                .catch(e => console.warn('[MAXCRM] Erro ao salvar etapaAtual:', e.message));
        }

        if (opcoes?.scroll !== false) {
            target.scrollTop = 0;
        }
    } else {
        console.warn('[MAXCRM] Tela não encontrada:', telaId);
    }
}

// ── Salvar dados ao fechar / minimizar o app ───────────────────────────
// Garante persistência mesmo que o usuário abandone sem finalizar
function _salvarAoSair() {
    if (!MaxCRMState.visitaAtual || !MaxCRMState.visitaAtual.id) return;

    // 1) BACKUP SÍNCRONO no localStorage — funciona mesmo se o browser matar a thread
    //    antes das operações async do IndexedDB concluírem (especialmente iOS Safari)
    try {
        const snapshot = {
            id:        MaxCRMState.visitaAtual.id,
            etapa:     _telaAtual,
            ts:        Date.now(),
            respostas: MaxCRMState.visitaAtual.respostas || {}
        };
        // Captura campos de texto visíveis que podem não ter disparado oninput
        const CAMPOS = [
            { id: 'erpMensalidade', chave: 'erp_mensalidade' },
            { id: 'pontosObs',      chave: 'pontosObs'       },
            { id: 'acaoObs',        chave: 'acaoObs'         },
            { id: 'mudanca1',       chave: '_mudanca1_tmp'   },
            { id: 'mudanca2',       chave: '_mudanca2_tmp'   },
            { id: 'mudanca3',       chave: '_mudanca3_tmp'   }
        ];
        CAMPOS.forEach(({ id, chave }) => {
            const el = document.getElementById(id);
            if (el && el.value.trim()) snapshot.respostas[chave] = el.value.trim();
        });
        localStorage.setItem('maxcrm_visita_snapshot', JSON.stringify(snapshot));
    } catch (_) {}

    // 2) Persiste no IndexedDB (async — melhor esforço)
    const visitaId = MaxCRMState.visitaAtual.id;
    const respostasExtras = {};
    const CAMPOS2 = [
        { id: 'erpMensalidade', chave: 'erp_mensalidade' },
        { id: 'pontosObs',      chave: 'pontosObs'       },
        { id: 'acaoObs',        chave: 'acaoObs'         }
    ];
    CAMPOS2.forEach(({ id, chave }) => {
        const el = document.getElementById(id);
        if (el && el.value.trim()) respostasExtras[chave] = el.value.trim();
    });
    if (Object.keys(respostasExtras).length > 0) {
        MaxCRMDB.salvarProgresso(visitaId, { respostas: respostasExtras })
            .catch(e => console.warn('[MAXCRM] Flush ao sair:', e.message));
    }
    MaxCRMDB.salvarProgresso(visitaId, { etapaAtual: _telaAtual })
        .catch(e => console.warn('[MAXCRM] Flush etapa ao sair:', e.message));
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _salvarAoSair();
});
window.addEventListener('pagehide',    _salvarAoSair); // iOS Safari - mais confiável que beforeunload
window.addEventListener('beforeunload', _salvarAoSair);

// ── Pausar visita explicitamente ───────────────────────────────────────────────
async function pausarVisitaAtual() {
    if (!MaxCRMState.visitaAtual) { navigateTo('home'); return; }

    const btn = document.getElementById('btnPausarVisita');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        // Captura e salva campos de texto visíveis
        const respostasExtras = {};
        const CAMPOS = [
            { id: 'erpMensalidade', chave: 'erp_mensalidade' },
            { id: 'pontosObs',      chave: 'pontosObs'       },
            { id: 'acaoObs',        chave: 'acaoObs'         },
            { id: 'mudanca1',       chave: '_mudanca1_tmp'   },
            { id: 'mudanca2',       chave: '_mudanca2_tmp'   },
            { id: 'mudanca3',       chave: '_mudanca3_tmp'   }
        ];
        CAMPOS.forEach(({ id, chave }) => {
            const el = document.getElementById(id);
            if (el && el.value.trim()) respostasExtras[chave] = el.value.trim();
        });
        if (Object.keys(respostasExtras).length > 0) {
            await MaxCRMDB.salvarProgresso(MaxCRMState.visitaAtual.id, { respostas: respostasExtras });
        }
        // Salva etapa atual
        await MaxCRMDB.salvarProgresso(MaxCRMState.visitaAtual.id, { etapaAtual: _telaAtual });

        // Limpa snapshot temporário e estado em memória
        localStorage.removeItem('maxcrm_visita_snapshot');
        const nomeEmpresa = MaxCRMState.empresaAtual?.nomeFantasia
            || MaxCRMState.empresaAtual?.razaoSocial
            || MaxCRMState.visitaAtual.empresaNome || 'empresa';
        MaxCRMState.visitaAtual  = null;
        MaxCRMState.empresaAtual = null;

        showToast(`Visita em "${nomeEmpresa}" pausada — continue depois em Minhas Visitas`, 'success');
        navigateTo('minhas_visitas');
    } catch (e) {
        console.error('[MAXCRM] Erro ao pausar:', e);
        showToast('Erro ao pausar: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:0.85rem">pause_circle</span> Pausar'; }
    }
}
window.pausarVisitaAtual = pausarVisitaAtual;



function voltar() {
    // Lógica de voltar no modo visita
    const ETAPAS_VISITA = [
        'visita_contato','visita_perfil','visita_erp',
        'visita_pontos','visita_dores','visita_mudancas',
        'visita_intencao','visita_barreiras','visita_interesse',
        'visita_timing','visita_acao','visita_resumo'
    ];
    const idx = ETAPAS_VISITA.indexOf(_telaAtual);
    if (idx > 0) {
        navigateTo(ETAPAS_VISITA[idx - 1]);
    } else if (idx === 0) {
        navigateTo('buscar'); // volta para busca de empresa
    } else {
        navigateTo(MaxCRMState.telaAnterior || 'home');
    }
}

// ── Barra de Progresso do Modo Visita ─────────────────────────────────────────
const ETAPAS_VISITA_CONFIG = [
    { id: 'visita_contato',   label: 'Contato' },
    { id: 'visita_perfil',    label: 'Perfil' },
    { id: 'visita_erp',       label: 'ERP Atual' },
    { id: 'visita_pontos',    label: 'Pontos Fortes' },
    { id: 'visita_dores',     label: 'Dores' },
    { id: 'visita_mudancas',  label: '3 Mudanças' },
    { id: 'visita_intencao',  label: 'Intenção' },
    { id: 'visita_barreiras', label: 'Barreiras' },
    { id: 'visita_interesse', label: 'Interesse' },
    { id: 'visita_timing',    label: 'Timing' },
    { id: 'visita_acao',      label: 'Próx. Ação' },
    { id: 'visita_resumo',    label: 'Resumo' }
];

function _atualizarProgressBar(telaId) {
    const bar = document.querySelector('.visit-progress-bar');
    if (!bar) return;

    const idx = ETAPAS_VISITA_CONFIG.findIndex(e => e.id === telaId);
    if (idx < 0) {
        bar.classList.remove('visible');
        return;
    }

    bar.classList.add('visible');
    const total   = ETAPAS_VISITA_CONFIG.length;
    const atual   = idx + 1;
    const pct     = Math.round((atual / total) * 100);
    const etapa   = ETAPAS_VISITA_CONFIG[idx].label;

    const stepEl = bar.querySelector('.visit-progress-step');
    const fillEl = bar.querySelector('.visit-progress-fill');
    const lblEl  = bar.querySelector('.visit-progress-label');

    if (stepEl) stepEl.textContent = `${atual} de ${total}`;
    if (fillEl) fillEl.style.width = pct + '%';
    if (lblEl)  lblEl.textContent  = etapa;
}

// ── Home Stats ────────────────────────────────────────────────────────────────
async function atualizarHome() {
    try {
        const visitas  = await MaxCRMDB.listarVisitas(200);
        const empresas = await MaxCRMDB.listarEmpresas();

        const hoje = new Date().toISOString().split('T')[0];
        const visitasHoje = visitas.filter(v => v.data === hoje);
        const pendentes   = visitas.filter(v => v.syncStatus === 'pending');
        const retornos    = visitas.filter(v =>
            v.respostas?.proximaAcao?.data === hoje && v.status === 'finalizada'
        );

        _setBadge('badgeVisitasHoje',   visitasHoje.length);
        _setBadge('badgeRetornos',      retornos.length);
        _setBadge('badgePendentes',     pendentes.length);
        _setBadge('badgeEmpresas',      empresas.length);

        // Sincronização status
        await MaxCRMSync.atualizarStatusUI();
    } catch (e) {
        console.error('[MAXCRM] Erro ao atualizar home:', e);
    }
}

function _setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count || 0;
    el.classList.toggle('hidden', count === 0);
}

// ── Nova Visita ───────────────────────────────────────────────────────────────
async function iniciarNovaVisita(empresaId) {
    const empresa = await MaxCRMDB.getEmpresa(empresaId);
    if (!empresa) { showToast('Empresa não encontrada', 'error'); return; }

    MaxCRMState.empresaAtual = empresa;

    const sessao = MaxCRMState.sessao;
    const visita = await MaxCRMDB.iniciarVisita({
        empresaId:   empresa.id,
        empresaNome: empresa.razaoSocial || empresa.nomeFantasia,
        promotorId:  sessao.login,
        promotorNome: sessao.nome,
        latitude:    MaxCRMState.gpsCoords?.lat || null,
        longitude:   MaxCRMState.gpsCoords?.lng || null
    });

    MaxCRMState.visitaAtual = visita;
    sessionStorage.setItem('maxcrm_visita_id', visita.id);

    navigateTo('visita_contato');
    showToast(`Visita iniciada em ${empresa.nomeFantasia || empresa.razaoSocial}`);
}

// ── Retomar visita em andamento ────────────────────────────────────────────────
async function verificarVisitaEmAndamento() {
    const visitaId = sessionStorage.getItem('maxcrm_visita_id');
    if (!visitaId) return null;

    const visita = await MaxCRMDB.getVisita(visitaId);
    if (visita && visita.status === 'em_andamento') {
        MaxCRMState.visitaAtual  = visita;
        MaxCRMState.empresaAtual = await MaxCRMDB.getEmpresa(visita.empresaId);
        return visita;
    }
    sessionStorage.removeItem('maxcrm_visita_id');
    return null;
}

// ── Salvar resposta da etapa atual ─────────────────────────────────────────────
async function salvarRespostaEtapa(chave, valor) {
    if (!MaxCRMState.visitaAtual) return;
    if (MaxCRMState.modoRevisao) return; // 🔒 Modo revisão: somente leitura
    const atualizada = await MaxCRMDB.salvarProgresso(MaxCRMState.visitaAtual.id, {
        respostas: { [chave]: valor }
    });
    MaxCRMState.visitaAtual = atualizada;
}

// ── Finalizar visita ───────────────────────────────────────────────────────────
async function finalizarVisitaAtual() {
    if (!MaxCRMState.visitaAtual) return;
    try {
        const finalizada = await MaxCRMDB.finalizarVisita(MaxCRMState.visitaAtual.id);
        MaxCRMState.visitaAtual = null;
        sessionStorage.removeItem('maxcrm_visita_id');
        await MaxCRMSync.processar();
        showToast('Visita finalizada!', 'success');
        navigateTo('home');
    } catch (e) {
        showToast('Erro ao finalizar visita: ' + e.message, 'error');
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(mensagem, tipo = '') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.className   = tipo ? `show ${tipo}` : 'show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ── Buscar empresa ────────────────────────────────────────────────────────────
async function initTelaBuscar(opcoes) {
    const input  = document.getElementById('buscarInput');
    const lista  = document.getElementById('buscarResultados');
    const btnNova= document.getElementById('btnNovaEmpresa');
    if (!input || !lista) return;

    // Resetar
    input.value = '';
    lista.innerHTML = '';

    const renderEmpresas = async (termo) => {
        const empresas = await MaxCRMDB.buscarEmpresas(termo);
        lista.innerHTML = '';
        if (empresas.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">search_off</span>
                    <div class="empty-state-title">Nenhuma empresa encontrada</div>
                    <div class="empty-state-sub">Tente outro termo ou cadastre como nova empresa</div>
                </div>`;
            if (btnNova) btnNova.style.display = 'flex';
            return;
        }
        if (btnNova) btnNova.style.display = 'none';

        const infoCount = document.createElement('div');
        infoCount.style.cssText = 'font-size:0.74rem;color:var(--text-secondary);margin:4px 0 10px 4px;font-weight:600;display:flex;justify-content:space-between;align-items:center';
        infoCount.innerHTML = `<span>Mostrando ${Math.min(empresas.length, 60)} de ${empresas.length} empresa(s)</span>${empresas.length > 60 ? '<span style="font-size:0.68rem;opacity:0.75">Refine a busca se necessário</span>' : ''}`;
        lista.appendChild(infoCount);

        empresas.slice(0, 60).forEach(emp => {
            const div = document.createElement('div');
            div.className = 'empresa-card';
            const segTag = emp.segmento ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:rgba(225,29,72,0.12);color:#fb7185;font-size:0.68rem;font-weight:600;margin-right:6px">${emp.segmento}</span>` : '';
            div.innerHTML = `
                <div class="empresa-card-nome">${emp.nomeFantasia || emp.razaoSocial || '(sem nome)'}</div>
                <div class="empresa-card-info">${segTag}${[emp.razaoSocial, emp.cidade, emp.uf].filter(Boolean).join(' • ')}</div>
                ${(emp.endereco || emp.logradouro) ? `<div class="empresa-card-info text-xs" style="color:var(--text-muted);margin-top:3px">${[emp.endereco || emp.logradouro, emp.bairro].filter(Boolean).join(' - ')}</div>` : ''}
                ${emp.cnpj ? `<div class="empresa-card-info text-xs mt-8" style="color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap"><span>CNPJ: ${emp.cnpj}</span>${emp.telefone ? `<span>Tel: ${emp.telefone}</span>` : ''}</div>` : ''}
                <span class="empresa-card-status status-${emp.status || 'prospecto'}">${_labelStatus(emp.status)}</span>
            `;
            div.onclick = () => _exibirOpcaoEmpresa(emp);
            lista.appendChild(div);
        });
    };

    window.refreshListaEmpresas = () => renderEmpresas(input.value);

    // Carrega todas ao abrir
    renderEmpresas('');

    // Busca ao digitar
    let debounce;
    input.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => renderEmpresas(input.value), 200);
    };

    input.focus();
}

function _labelStatus(status) {
    const m = { prospecto:'Prospecto', visitado:'Visitado', lead:'Lead', cliente:'Cliente' };
    return m[status] || 'Prospecto';
}

function _exibirOpcaoEmpresa(emp) {
    // Modal de ação
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-sheet">
            <div class="modal-handle"></div>
            <div class="modal-title">${emp.nomeFantasia || emp.razaoSocial}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);text-align:center;margin-bottom:20px">
                ${[emp.cidade, emp.uf, emp.cnpj].filter(Boolean).join(' • ')}
            </div>
            <button class="btn btn-primary" id="btnIniciarVisita">
                <span class="material-icons-round">play_circle</span> Iniciar Nova Visita
            </button>
            <div style="height:10px"></div>
            <button class="btn btn-secondary" id="btnVerHistorico">
                <span class="material-icons-round">history</span> Ver Histórico
            </button>
            <div style="height:10px"></div>
            <button class="btn btn-ghost" id="btnCancelarOpcao" style="width:100%">Cancelar</button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#btnIniciarVisita').onclick = () => {
        overlay.remove();
        iniciarNovaVisita(emp.id);
    };
    overlay.querySelector('#btnVerHistorico').onclick = () => {
        overlay.remove();
        showToast('Histórico disponível em breve');
    };
    overlay.querySelector('#btnCancelarOpcao').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Minhas Visitas ─────────────────────────────────────────────────────────────
async function carregarMinhasVisitas() {
    const lista = document.getElementById('listaMinhasVisitas');
    if (!lista) return;
    lista.innerHTML = '<div class="loading-spinner"></div>';

    let visitas = [];
    let fonte = 'nenhuma';
    let diagMsg = '';
    const sessao = MaxCRMState.sessao;
    const meuLogin = sessao ? (sessao.login || sessao.email || '') : '';

    // ── Diagnóstico: estado do Firebase Auth ─────────────────────────────
    const authUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    console.log('[MAXCRM-DIAG] Auth:', authUser ? `uid=${authUser.uid}` : 'NULL', '| db:', MaxCRMState.db ? 'OK' : 'NULL', '| online:', MaxCRMSync.isOnline(), '| login:', meuLogin);

    // ── Sempre tenta buscar do Firestore primeiro (cross-device) ─────────
    if (MaxCRMState.db && MaxCRMSync.isOnline()) {
        try {
            // Garantir auth antes da query
            if (!authUser) {
                console.warn('[MAXCRM-DIAG] Sem Firebase Auth! Tentando signInAnonymously...');
                try { await firebase.auth().signInAnonymously(); } catch(e) { console.error('[MAXCRM-DIAG] Auth falhou:', e.message); }
            }

            // Query SEM orderBy (evita necessidade de indice e evita hang)
            // Ordenação feita client-side
            console.log('[MAXCRM-DIAG] Query Firestore: tenants/parreira/visitas (sem orderBy, limit 300)...');
            const queryPromise = MaxCRMState.db
                .collection('tenants/parreira/visitas')
                .limit(300)
                .get();

            // Timeout de 8 segundos para não travar
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT: Firestore demorou mais de 8s')), 8000)
            );

            const snap = await Promise.race([queryPromise, timeoutPromise]);
            console.log(`[MAXCRM-DIAG] Firestore OK: ${snap.size} visitas (cache: ${snap.metadata.fromCache})`);

            let firestoreVisitas = snap.docs.map(d => {
                const data = d.data();
                if (data.criadoEm && data.criadoEm.toDate) data.criadoEm = data.criadoEm.toDate().toISOString();
                if (data.atualizadoEm && data.atualizadoEm.toDate) data.atualizadoEm = data.atualizadoEm.toDate().toISOString();
                if (data.inicioTs && data.inicioTs.toDate) data.inicioTs = data.inicioTs.toDate().toISOString();
                if (data.fimTs && data.fimTs.toDate) data.fimTs = data.fimTs.toDate().toISOString();
                return { id: d.id, ...data, syncStatus: 'synced' };
            });

            // Normalização para comparação robusta
            const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const meuLoginNorm = norm(meuLogin);
            const meuNomeNorm  = norm(sessao ? sessao.nome : '');

            // Log visitas encontradas
            firestoreVisitas.forEach(v => console.log(`[MAXCRM-DIAG] Visita: ${v.empresaNome} | promotor=${v.promotorId} (${v.promotorNome}) | status=${v.status}`));

            // Se NÃO é gestor, filtra apenas as visitas do próprio promotor
            if (!MaxCRMState.isGestor && (meuLoginNorm || meuNomeNorm)) {
                const antes = firestoreVisitas.length;
                firestoreVisitas = firestoreVisitas.filter(v => {
                    const pId = norm(v.promotorId);
                    const pNome = norm(v.promotorNome);
                    return (meuLoginNorm && (pId === meuLoginNorm || pNome.includes(meuLoginNorm))) ||
                           (meuNomeNorm && (pNome === meuNomeNorm || pNome.includes(meuNomeNorm)));
                });
                console.log(`[MAXCRM-DIAG] Filtro promotor (${meuLogin}): ${antes} → ${firestoreVisitas.length}`);
            }

            // Mesclar visitas locais do IndexedDB com as visitas do Firestore (para não esconder visitas locais do dispositivo)
            try {
                const idbVisitas = await MaxCRMDB.listarVisitas(500);
                const mapa = new Map();
                // 1. Visitas salvas localmente neste aparelho
                (idbVisitas || []).forEach(v => {
                    if (v && v.id) mapa.set(v.id, v);
                });
                // 2. Visitas da nuvem Firestore — deep-merge de respostas para não perder dados locais
                firestoreVisitas.forEach(v => {
                    if (v && v.id) {
                        const local = mapa.get(v.id) || {};
                        mapa.set(v.id, {
                            ...local,
                            ...v,
                            // Deep-merge de respostas: local tem prioridade por ter mais dados frescos
                            respostas: Object.assign({}, v.respostas || {}, local.respostas || {})
                        });
                    }
                });
                visitas = Array.from(mapa.values());
            } catch(idbErr) {
                visitas = firestoreVisitas;
            }

            // Ordenar client-side (mais recente primeiro)
            visitas.sort((a, b) => (b.criadoEm || b.data || '').localeCompare(a.criadoEm || a.data || ''));

            fonte = 'firestore+local';
            diagMsg = `Firestore: ${snap.size} nuvem | Total exibido: ${visitas.length}`;
        } catch(e) {
            console.error('[MAXCRM-DIAG] Firestore FALHOU:', e.code || '', e.message);
            diagMsg = `Firestore ERRO: ${e.message}`;
            // Fallback para IndexedDB
            visitas = await MaxCRMDB.listarVisitas(200);
            fonte = 'indexeddb-fallback';
            const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const meuLoginNorm = norm(meuLogin);
            const meuNomeNorm  = norm(sessao ? sessao.nome : '');
            if (!MaxCRMState.isGestor && (meuLoginNorm || meuNomeNorm)) {
                visitas = visitas.filter(v => {
                    const pId = norm(v.promotorId);
                    const pNome = norm(v.promotorNome);
                    return (meuLoginNorm && (pId === meuLoginNorm || pNome.includes(meuLoginNorm))) ||
                           (meuNomeNorm && (pNome === meuNomeNorm || pNome.includes(meuNomeNorm)));
                });
            }
            diagMsg += ` | IDB: ${visitas.length}`;
        }
    } else {
        visitas = await MaxCRMDB.listarVisitas(200);
        fonte = 'indexeddb-offline';
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const meuLoginNorm = norm(meuLogin);
        const meuNomeNorm  = norm(sessao ? sessao.nome : '');
        if (!MaxCRMState.isGestor && (meuLoginNorm || meuNomeNorm)) {
            visitas = visitas.filter(v => {
                const pId = norm(v.promotorId);
                const pNome = norm(v.promotorNome);
                return (meuLoginNorm && (pId === meuLoginNorm || pNome.includes(meuLoginNorm))) ||
                       (meuNomeNorm && (pNome === meuNomeNorm || pNome.includes(meuNomeNorm)));
            });
        }
        diagMsg = `Offline: IDB ${visitas.length} visitas`;
    }

    console.log(`[MAXCRM-DIAG] RESULTADO: fonte=${fonte} | ${visitas.length} visitas | ${diagMsg}`);

    if (visitas.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">assignment</span>
                <div class="empty-state-title">Nenhuma visita encontrada</div>
                <div class="empty-state-sub">Toque em "Sincronizar com Banco" ou inicie uma nova visita</div>
            </div>
            <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:0.7rem;color:rgba(255,255,255,0.4);word-break:break-all">
                <strong>Diagnóstico:</strong> ${diagMsg}<br>
                Auth: ${authUser ? 'uid=' + authUser.uid : 'SEM AUTH'}<br>
                DB: ${MaxCRMState.db ? 'OK' : 'NULL'} | Online: ${MaxCRMSync.isOnline()}<br>
                Login: ${meuLogin} | Gestor: ${MaxCRMState.isGestor} | Fonte: ${fonte}
            </div>`;
        return;
    }

    lista.innerHTML = '';

    // Se o usuário for gestor, adiciona seletor rápido de promotores da equipe
    if (MaxCRMState.isGestor) {
        const promotoresUnicos = Array.from(new Set(visitas.map(v => v.promotorNome || v.promotorId).filter(Boolean)));
        if (promotoresUnicos.length > 1) {
            const filterBar = document.createElement('div');
            filterBar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px';
            filterBar.innerHTML = `
                <span class="material-icons-round" style="font-size:1rem;color:var(--primary)">group</span>
                <span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Equipe:</span>
                <select id="filtroEquipeSelect" style="flex:1;background:transparent;border:none;color:white;font-size:0.8rem;outline:none;font-weight:600">
                    <option value="" style="background:#18181b">Todas as Visitas (${visitas.length})</option>
                    ${promotoresUnicos.map(p => `<option value="${p}" style="background:#18181b">${p}</option>`).join('')}
                </select>
            `;
            lista.appendChild(filterBar);

            const selectEl = filterBar.querySelector('#filtroEquipeSelect');
            selectEl.onchange = () => {
                const escolhido = selectEl.value;
                const itens = lista.querySelectorAll('.visita-card-item');
                itens.forEach(item => {
                    if (!escolhido || item.dataset.promotor === escolhido) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            };
        }
    }

    visitas.forEach(v => {
        const criadoEm = v.criadoEm || v.data || new Date().toISOString();
        const d = new Date(criadoEm);
        const dataFmt = isNaN(d.getTime()) ? criadoEm : d.toLocaleDateString('pt-BR');
        const syncIcon = v.syncStatus === 'synced' ? '☁️' : '⏳';
        const promotorInfo = v.promotorNome ? ` • ${v.promotorNome}` : (v.promotorId ? ` • ${v.promotorId}` : '');
        const div = document.createElement('div');
        div.className = 'list-item visita-card-item';
        div.dataset.promotor = v.promotorNome || v.promotorId || '';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div class="list-item-icon" style="background:var(--primary-bg)">
                <span class="material-icons-round" style="color:var(--primary)">assignment</span>
            </div>
            <div class="list-item-content">
                <div class="list-item-title">${v.empresaNome || 'Empresa'}</div>
                <div class="list-item-sub">${dataFmt} • ${_labelStatusVisita(v.status)}${promotorInfo} <span style="font-size:0.75rem;opacity:0.7">${syncIcon}</span></div>
            </div>
            <span class="material-icons-round list-item-arrow">chevron_right</span>`;
        div.onclick = () => _abrirDetalheVisita(v);
        lista.appendChild(div);
    });

    // Rodapé diagnóstico
    const diagFooter = document.createElement('div');
    diagFooter.style.cssText = 'margin-top:12px;padding:8px;font-size:0.65rem;color:rgba(255,255,255,0.3);text-align:center';
    diagFooter.textContent = `Fonte: ${fonte} | ${diagMsg}`;
    lista.appendChild(diagFooter);
}

function _abrirDetalheVisita(vBase) {
    // Sempre recarrega do IndexedDB para garantir dados mais completos (respostas, etc.)
    MaxCRMDB.getVisita(vBase.id).then(vIDB => {
        const v = vIDB
            ? { ...vBase, ...vIDB, respostas: Object.assign({}, vBase.respostas || {}, vIDB.respostas || {}) }
            : vBase;
        _renderDetalheVisita(v);
    }).catch(() => _renderDetalheVisita(vBase));
}

function _renderDetalheVisita(v) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const r = v.respostas || {};
    const erp = r.erpAtual || {};
    const acao = r.proximaAcao || {};
    const emAndamento = v.status === 'em_andamento';
    const sessao = MaxCRMState.sessao;
    // Promotores só podem retomar as próprias visitas; gestores podem ver tudo
    const podeRetomar = emAndamento && sessao && (
        v.promotorId === sessao.login || sessao.perfil === 'gestor' || sessao.isMaster
    );
    // Etapas do questionário com status de conclusão
    const etapas = [
        { label: 'Contato identificado',  ok: !!(r.contatos && r.contatos.length > 0) },
        { label: 'ERP atual mapeado',     ok: !!(erp.erpNome) },
        { label: 'Dores levantadas',      ok: !!(r.dores && r.dores.length > 0) },
        { label: 'Interesse avaliado',    ok: !!(r.interesse) },
        { label: 'Timing definido',       ok: !!(r.timing) },
        { label: 'Próxima ação definida', ok: !!(acao.tipo) }
    ];
    const etapasConcluidas = etapas.filter(e => e.ok).length;

    // Linhas de resumo para visitas finalizadas
    const rows = [
        ['Empresa',      v.empresaNome || '—'],
        ['Promotor',     v.promotorNome || '—'],
        ['Data',         new Date(v.criadoEm || v.data || Date.now()).toLocaleDateString('pt-BR')],
        ['ERP Atual',    erp.erpNome || '—'],
        ['Satisfação',   erp.satisfacao ? erp.satisfacao + '/5' : '—'],
        ['Interesse',    r.interesse || '—'],
        ['Timing',       r.timing || '—'],
        ['Próxima Ação', [acao.tipo, acao.data].filter(Boolean).join(' • ') || '—'],
        ['Obs',          r.observacoes || '—']
    ];

    overlay.innerHTML = `
        <div class="modal-sheet" style="max-height:85vh;overflow-y:auto">
            <div class="modal-handle"></div>
            <div class="modal-title" style="margin-bottom:4px">${v.empresaNome || 'Visita'}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);text-align:center;margin-bottom:16px">
                ${new Date(v.criadoEm || v.data || Date.now()).toLocaleDateString('pt-BR')} &bull; ${v.promotorNome || '—'}
            </div>

            ${podeRetomar ? `
            <button class="btn btn-primary" id="btnRetomarVisita"
                style="width:100%;margin-bottom:16px;font-size:0.95rem;padding:14px 12px;display:flex;align-items:center;justify-content:center;gap:8px">
                <span class="material-icons-round" style="font-size:1.3rem">play_circle</span>
                <span>Retomar Visita</span>
            </button>` : ''}

            ${emAndamento ? `
            <div style="margin-bottom:16px">
                <div style="font-size:0.68rem;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em">
                    Progresso — ${etapasConcluidas}/${etapas.length} etapas concluídas
                </div>
                <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:5px;margin-bottom:12px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(etapasConcluidas/etapas.length*100)}%;background:${etapasConcluidas===etapas.length?'#22c55e':'#facc15'};border-radius:4px"></div>
                </div>
                ${etapas.map(e => `
                <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                    <span class="material-icons-round" style="font-size:1.1rem;color:${e.ok ? '#22c55e' : 'rgba(255,255,255,0.2)'}">
                        ${e.ok ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span style="font-size:0.82rem;color:${e.ok ? '#fff' : 'rgba(255,255,255,0.35)'}">${e.label}</span>
                </div>`).join('')}
            </div>` : rows.map(([lbl,val]) => `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
                    <span style="font-size:0.75rem;color:var(--text-secondary)">${lbl}</span>
                    <span style="font-size:0.8rem;color:#fff;text-align:right;max-width:60%">${val}</span>
                </div>`).join('')}

            <div style="height:16px"></div>
            ${!emAndamento ? `
            <button class="btn btn-primary" id="btnRevisarVisita" style="width:100%;margin-bottom:10px">
                <span class="material-icons-round">find_in_page</span> Revisar Formulário
            </button>
            <button class="btn btn-secondary" id="btnAlterarVisita" style="width:100%;margin-bottom:10px">
                <span class="material-icons-round">edit_note</span> Alterar Visita
            </button>` : ''}
            <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="width:100%">Fechar</button>
        </div>`;
    overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);

    if (podeRetomar) {
        overlay.querySelector('#btnRetomarVisita').onclick = async () => {
            overlay.remove();
            await retomarVisita(v);
        };
    }
    if (!emAndamento) {
        overlay.querySelector('#btnRevisarVisita').onclick = async () => {
            overlay.remove();
            await revisarVisitaFinalizada(v);
        };
        overlay.querySelector('#btnAlterarVisita').onclick = () => {
            overlay.remove();
            _abrirModalEdicaoVisita(v);
        };
    }
}

// ── Modal de edição de visita finalizada ──────────────────────────────────────
function _abrirModalEdicaoVisita(v) {
    const r = v.respostas || {};
    const acao = r.proximaAcao || {};

    const INTERESSE_OPTS = ['Muito alto','Alto','Médio','Baixo','Sem interesse'];
    const TIMING_OPTS    = ['Imediato (< 1 mês)','Curto prazo (1-3 meses)','Médio prazo (3-6 meses)','Longo prazo (> 6 meses)','Sem previsão'];
    const ACAO_OPTS      = ['Retornar por telefone','Enviar proposta','Agendar demo','Aguardar contato','Visita presencial','Encerrar'];

    const mkSelect = (id, opts, val) =>
        `<select id="${id}" class="form-input" style="width:100%">
            <option value="">— selecione —</option>
            ${opts.map(o => `<option value="${o}" ${val===o?'selected':''}>${o}</option>`).join('')}
         </select>`;

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
        <div class="modal-sheet" style="max-height:85vh;overflow-y:auto">
            <div class="modal-handle"></div>
            <div class="modal-title" style="margin-bottom:4px">Alterar Visita</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);text-align:center;margin-bottom:18px">
                ${v.empresaNome || '—'} • ${new Date(v.criadoEm || Date.now()).toLocaleDateString('pt-BR')}
            </div>

            <div class="form-group">
                <label class="form-label">Interesse</label>
                ${mkSelect('editInteresse', INTERESSE_OPTS, r.interesse)}
            </div>
            <div class="form-group">
                <label class="form-label">Timing</label>
                ${mkSelect('editTiming', TIMING_OPTS, r.timing)}
            </div>
            <div class="form-group">
                <label class="form-label">Próxima Ação</label>
                ${mkSelect('editProxAcaoTipo', ACAO_OPTS, acao.tipo)}
            </div>
            <div class="form-group">
                <label class="form-label">Data da Próxima Ação</label>
                <input type="date" id="editProxAcaoData" class="form-input" style="width:100%" value="${acao.data || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea id="editObs" class="form-input" rows="3" style="width:100%;resize:vertical">${r.observacoes || ''}</textarea>
            </div>

            <div style="height:8px"></div>
            <button class="btn btn-primary" id="btnSalvarEdicao" style="width:100%;margin-bottom:10px">
                <span class="material-icons-round">save</span> Salvar Alterações
            </button>
            <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()" style="width:100%">Cancelar</button>
        </div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);

    ov.querySelector('#btnSalvarEdicao').onclick = async () => {
        const btn = ov.querySelector('#btnSalvarEdicao');
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Salvando...';
        try {
            const novasRespostas = {
                interesse:    ov.querySelector('#editInteresse').value   || r.interesse,
                timing:       ov.querySelector('#editTiming').value      || r.timing,
                observacoes:  ov.querySelector('#editObs').value.trim()  || r.observacoes,
                proximaAcao: {
                    ...acao,
                    tipo: ov.querySelector('#editProxAcaoTipo').value || acao.tipo,
                    data: ov.querySelector('#editProxAcaoData').value || acao.data
                }
            };
            await MaxCRMDB.salvarProgresso(v.id, { respostas: novasRespostas });
            showToast('Visita atualizada com sucesso!', 'success');
            ov.remove();
            // Recarrega a lista de visitas para refletir a alteração
            if (typeof carregarMinhasVisitas === 'function') carregarMinhasVisitas();
        } catch (e) {
            console.error('[MAXCRM] Erro ao editar visita:', e);
            showToast('Erro ao salvar: ' + e.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">save</span> Salvar Alterações';
        }
    };
}

// ── Revisão somente-leitura de visita finalizada ──────────────────────────────
async function revisarVisitaFinalizada(v) {
    try {
        let visita = await MaxCRMDB.getVisita(v.id);
        if (!visita) visita = v;

        let empresa = await MaxCRMDB.getEmpresa(visita.empresaId);
        if (!empresa) empresa = { id: visita.empresaId, razaoSocial: visita.empresaNome, nomeFantasia: visita.empresaNome };

        // Ativa modo revisão — salvarRespostaEtapa vira no-op
        MaxCRMState.modoRevisao  = true;
        MaxCRMState.visitaAtual  = visita;
        MaxCRMState.empresaAtual = empresa;

        // Banner fixo de leitura (removido ao sair do questionário)
        _mostrarBannerRevisao(visita.empresaNome || empresa.nomeFantasia || empresa.razaoSocial);

        navigateTo('visita_contato');
        showToast('Modo revisão — somente leitura', 'info');
    } catch (e) {
        MaxCRMState.modoRevisao = false;
        console.error('[MAXCRM] Erro ao abrir revisão:', e);
        showToast('Erro ao abrir revisão: ' + e.message, 'error');
    }
}

function _mostrarBannerRevisao(nomeEmpresa) {
    // Remove banner anterior se houver
    document.getElementById('bannerRevisao')?.remove();
    const b = document.createElement('div');
    b.id = 'bannerRevisao';
    b.style.cssText = [
        'position:fixed', 'top:56px', 'left:0', 'right:0', 'z-index:9980',
        'background:rgba(37,99,235,0.95)', 'backdrop-filter:blur(8px)',
        'padding:8px 16px', 'display:flex', 'align-items:center', 'gap:10px',
        'border-bottom:1px solid rgba(96,165,250,0.4)'
    ].join(';');
    b.innerHTML = `
        <span class="material-icons-round" style="font-size:1rem;color:#93c5fd">visibility</span>
        <span style="flex:1;font-size:0.78rem;color:#fff">
            <strong>REVISÃO</strong> — ${nomeEmpresa} — somente leitura
        </span>
        <button onclick="sairModoRevisao()" style="background:rgba(255,255,255,0.15);border:none;border-radius:6px;color:#fff;padding:4px 10px;font-size:0.72rem;cursor:pointer">
            Sair
        </button>`;
    document.body.appendChild(b);
}

window.sairModoRevisao = function() {
    MaxCRMState.modoRevisao = false;
    MaxCRMState.visitaAtual  = null;
    MaxCRMState.empresaAtual = null;
    document.getElementById('bannerRevisao')?.remove();
    navigateTo('minhas_visitas');
};

// Bloqueia interatividade da tela de visita quando em modo revisão
// Chamado pelo hook do maxcrm-visit.js após o init de cada tela
window._aplicarBloqueioRevisao = function() {
    if (!MaxCRMState.modoRevisao) return;
    setTimeout(() => {
        const tela = document.querySelector('.screen.active');
        if (!tela) return;
        // Desabilita chips
        tela.querySelectorAll('.chip').forEach(c => {
            c.style.pointerEvents = 'none';
            c.style.opacity = c.classList.contains('selected') ? '1' : '0.3';
        });
        // Desabilita segmenters
        tela.querySelectorAll('.segmenter-item').forEach(c => {
            c.style.pointerEvents = 'none';
            c.style.opacity = c.classList.contains('active') ? '1' : '0.3';
        });
        // Desabilita inputs/textareas/selects
        tela.querySelectorAll('input, textarea, select').forEach(el => {
            el.setAttribute('readonly', '');
            el.setAttribute('disabled', '');
            el.style.opacity = '0.65';
            el.style.cursor = 'not-allowed';
        });
        // Desabilita botões de ação (mantém só navegação prev/next)
        tela.querySelectorAll('.btn:not(.btn-ghost):not([onclick*="navigateTo"]):not([onclick*="_proximo"]):not([onclick*="voltar"])').forEach(btn => {
            if (!btn.textContent.includes('Próximo') && !btn.textContent.includes('Anterior') && !btn.textContent.includes('Voltar')) {
                btn.style.opacity = '0.4';
                btn.style.pointerEvents = 'none';
            }
        });
    }, 80);
};

// ── Retomar visita em andamento a partir da lista ────────────────────────────
async function retomarVisita(v) {
    try {
        // Carrega a visita do IndexedDB para garantir dados mais recentes
        let visita = await MaxCRMDB.getVisita(v.id);
        if (!visita) visita = v; // fallback para os dados do Firestore

        let empresa = await MaxCRMDB.getEmpresa(visita.empresaId);
        if (!empresa) {
            // Constrói empresa mínima a partir dos dados da visita para não bloquear
            empresa = { id: visita.empresaId, razaoSocial: visita.empresaNome, nomeFantasia: visita.empresaNome };
        }

        MaxCRMState.visitaAtual  = visita;
        MaxCRMState.empresaAtual = empresa;
        sessionStorage.setItem('maxcrm_visita_id', visita.id);

        // Valida etapaAtual para evitar tela em branco com IDs invalidos
        const ETAPAS_VALIDAS = ['visita_contato','visita_perfil','visita_erp',
            'visita_pontos','visita_dores','visita_mudancas',
            'visita_intencao','visita_barreiras','visita_interesse',
            'visita_timing','visita_acao','visita_resumo'];
        const etapa = ETAPAS_VALIDAS.includes(visita.etapaAtual) ? visita.etapaAtual : 'visita_contato';
        showToast(`Retomando em "${_tituloEtapa(etapa)}"`, 'success');
        navigateTo(etapa);
    } catch (e) {
        console.error('[MAXCRM] Erro ao retomar visita:', e);
        showToast('Erro ao retomar visita: ' + e.message, 'error');
    }
}

function _tituloEtapa(telaId) {
    const t = {
        visita_contato:  'Contato',
        visita_perfil:   'Perfil Operacional',
        visita_erp:      'ERP Atual',
        visita_pontos:   'Pontos Fortes',
        visita_dores:    'Dores',
        visita_mudancas: '3 Mudanças',
        visita_intencao: 'Intenção de Troca',
        visita_barreiras:'Barreiras',
        visita_interesse:'Interesse',
        visita_timing:   'Timing',
        visita_acao:     'Próxima Ação',
        visita_resumo:   'Resumo'
    };
    return t[telaId] || telaId;
}

function _labelStatusVisita(status) {
    return { em_andamento:'Em andamento', finalizada:'Finalizada', cancelada:'Cancelada' }[status] || status;
}

// ── Resumo da visita ───────────────────────────────────────────────────────────
function renderResumoVisita() {
    const visita  = MaxCRMState.visitaAtual;
    const empresa = MaxCRMState.empresaAtual;
    const el = document.getElementById('conteudoResumo');
    if (!el || !visita) return;

    const r = visita.respostas || {};
    const erp = r.erpAtual || {};
    const acao = r.proximaAcao || {};

    const rows = [
        ['Empresa',      empresa?.nomeFantasia || empresa?.razaoSocial || '—'],
        ['Contato',      (r.contatos || []).map(c => c.nome).join(', ') || '—'],
        ['ERP Atual',    erp.erpNome || '—'],
        ['Satisfação',   erp.satisfacao ? `${erp.satisfacao}/5` : '—'],
        ['Dores',        (r.dores || []).map(d => d.label).join(', ') || 'Nenhuma'],
        ['Interesse',    r.interesse || '—'],
        ['Timing',       r.timing || '—'],
        ['Próxima Ação', [acao.tipo, acao.data, acao.responsavel].filter(Boolean).join(' • ') || '—']
    ];

    el.innerHTML = rows.map(([lbl, val]) => `
        <div class="resumo-row">
            <div class="resumo-label">${lbl}</div>
            <div class="resumo-value">${val}</div>
        </div>`).join('');
}

// ── Novo Prospect (cadastro rápido) ────────────────────────────────────────────
async function salvarNovaEmpresa(form) {
    const dados = {
        cnpj:         form.querySelector('[name=cnpj]')?.value || '',
        razaoSocial:  form.querySelector('[name=razaoSocial]')?.value || '',
        nomeFantasia: form.querySelector('[name=nomeFantasia]')?.value || '',
        segmento:     form.querySelector('[name=segmento]')?.value || '',
        cidade:       form.querySelector('[name=cidade]')?.value || '',
        uf:           form.querySelector('[name=uf]')?.value || '',
        telefone:     form.querySelector('[name=telefone]')?.value || '',
        whatsapp:     form.querySelector('[name=whatsapp]')?.value || ''
    };

    if (!dados.razaoSocial && !dados.nomeFantasia) {
        showToast('Informe ao menos a razão social ou nome fantasia', 'error');
        return null;
    }

    const empresa = await MaxCRMDB.salvarEmpresa(dados);
    showToast('Empresa cadastrada!', 'success');
    return empresa;
}

// Expor globais necessários
window.navigateTo         = navigateTo;
window.voltar             = voltar;
window.iniciarNovaVisita  = iniciarNovaVisita;
window.finalizarVisitaAtual = finalizarVisitaAtual;
window.salvarRespostaEtapa  = salvarRespostaEtapa;
window.salvarNovaEmpresa    = salvarNovaEmpresa;
window.atualizarHome        = atualizarHome;
window.showToast            = showToast;
window.MaxCRMState          = MaxCRMState;
window.initTelaBuscar       = initTelaBuscar;
window.carregarMinhasVisitas= carregarMinhasVisitas;
window.renderResumoVisita   = renderResumoVisita;
window.retomarVisita        = retomarVisita;

console.log(`✅ MAXCRM Core v${MAXCRM_VERSION} carregado`);
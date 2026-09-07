/**
 * maxcrm-core.js — Core: Auth, Navegação SPA, GPS, Toast, Estado Global
 * =======================================================================
 * Parreira Sistemas — MAXCRM Campo v1.0.0
 */

const MAXCRM_VERSION = '1.0.0';

// ── Estado Global ────────────────────────────────────────────────────────────
const MaxCRMState = {
    sessao:        null,   // sessão do ParreiraAuth
    visitaAtual:   null,   // visita em andamento
    empresaAtual:  null,   // empresa da visita
    gpsCoords:     null,   // { lat, lng, accuracy }
    gpsStatus:     'idle', // idle | loading | ok | error
    telaAnterior:  'home'
};

// ── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // 1. Verificar autenticação
    if (typeof ParreiraAuth === 'undefined' || !ParreiraAuth.isLogado()) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Garantir Firebase Auth anônimo (para Firestore rules)
    try {
        await new Promise((resolve) => {
            if (typeof firebase === 'undefined') { resolve(); return; }
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
        if (opcoes?.scroll !== false) {
            target.scrollTop = 0;
        }
    } else {
        console.warn('[MAXCRM] Tela não encontrada:', telaId);
    }
}

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
                    <div class="empty-state-sub">Cadastre como nova empresa</div>
                </div>`;
            if (btnNova) btnNova.style.display = 'flex';
            return;
        }
        if (btnNova) btnNova.style.display = 'none';
        empresas.slice(0, 30).forEach(emp => {
            const div = document.createElement('div');
            div.className = 'empresa-card';
            div.innerHTML = `
                <div class="empresa-card-nome">${emp.nomeFantasia || emp.razaoSocial || '(sem nome)'}</div>
                <div class="empresa-card-info">${[emp.razaoSocial, emp.cidade, emp.uf].filter(Boolean).join(' • ')}</div>
                ${emp.cnpj ? `<div class="empresa-card-info text-xs mt-8" style="color:var(--text-muted)">${emp.cnpj}</div>` : ''}
                <span class="empresa-card-status status-${emp.status || 'prospecto'}">${_labelStatus(emp.status)}</span>
            `;
            div.onclick = () => _exibirOpcaoEmpresa(emp);
            lista.appendChild(div);
        });
    };

    // Carrega todas ao abrir
    renderEmpresas('');

    // Busca ao digitar
    let debounce;
    input.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => renderEmpresas(input.value), 250);
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

    const visitas = await MaxCRMDB.listarVisitas(50);
    if (visitas.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">assignment</span>
                <div class="empty-state-title">Nenhuma visita ainda</div>
                <div class="empty-state-sub">Inicie sua primeira visita</div>
            </div>`;
        return;
    }

    lista.innerHTML = visitas.map(v => {
        const d = new Date(v.criadoEm);
        const dataFmt = d.toLocaleDateString('pt-BR');
        const syncIcon = v.syncStatus === 'synced' ? '☁️' : '⏳';
        return `
            <div class="list-item">
                <div class="list-item-icon" style="background:var(--primary-bg)">
                    <span class="material-icons-round" style="color:var(--primary)">assignment</span>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${v.empresaNome || 'Empresa'}</div>
                    <div class="list-item-sub">${dataFmt} • ${_labelStatusVisita(v.status)} ${syncIcon}</div>
                </div>
                <span class="material-icons-round list-item-arrow">chevron_right</span>
            </div>`;
    }).join('');
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

console.log(`✅ MAXCRM Core v${MAXCRM_VERSION} carregado`);
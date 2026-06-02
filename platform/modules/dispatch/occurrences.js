// =============================================================================
// occurrences.js — Módulo de Ocorrências Logísticas
// Parreira Sistemas — Módulo Despacho
// Acesso: supervisor, admin, master apenas
// =============================================================================

window.OcorrenciasModule = (function () {

    // ── Estado ────────────────────────────────────────────────────────────────
    let _db         = null;
    let _tenantId   = null;
    let _currentUser = null;
    let _ocorrencias = [];
    let _filtros    = { status: '', tipo: '', periodo: '' };

    // ── Tipos de Ocorrência ───────────────────────────────────────────────────
    const TIPOS = {
        extravio:            { label: 'Extravio de Volume',          icon: 'search_off',        responsavel: 'transportadora' },
        avaria_transp:       { label: 'Avaria (Transportadora)',     icon: 'broken_image',       responsavel: 'transportadora' },
        atraso:              { label: 'Atraso na Entrega',           icon: 'schedule',           responsavel: 'transportadora' },
        entrega_errada:      { label: 'Entrega no Local Errado',     icon: 'wrong_location',     responsavel: 'transportadora' },
        avaria_expedicao:    { label: 'Avaria (Conferência/Expedi)', icon: 'report_problem',     responsavel: 'conferencia'   },
        sobra_produto:       { label: 'Sobra de Produto (Cliente)',  icon: 'add_shopping_cart',  responsavel: 'conferencia'   },
        falta_produto:       { label: 'Falta de Produto (Cliente)',  icon: 'remove_shopping_cart', responsavel: 'conferencia' },
        outro:               { label: 'Outro',                       icon: 'help_outline',       responsavel: 'outro'         },
    };

    // ── Status / Pipeline ─────────────────────────────────────────────────────
    const STATUS = {
        aberta:           { label: 'Aberta',              color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: 'fiber_new'        },
        em_analise:       { label: 'Em Análise',          color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  icon: 'manage_search'    },
        parecer:          { label: 'Parecer',             color: '#6366f1', bg: 'rgba(99,102,241,.12)',  icon: 'gavel'            },
        forma_resolucao:  { label: 'Forma de Resolução',  color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: 'playlist_add_check'},
        resolucao:        { label: 'Em Resolução',        color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: 'construction'     },
        concluida:        { label: 'Concluída',           color: '#10b981', bg: 'rgba(16,185,129,.12)',  icon: 'task_alt'         },
    };

    // Ordem das etapas
    const PIPELINE = ['aberta','em_analise','parecer','forma_resolucao','resolucao','concluida'];

    // ── Helper: lista de transportadoras cadastradas ───────────────────────────
    function _getCarriersOptions(selectedValue = '') {
        const lista = (Utils && Utils.getStorage
            ? Utils.getStorage('carrier_list')
            : JSON.parse(localStorage.getItem('carrier_list') || '[]')
        ) || [];
        const sorted = [...lista].sort();
        if (sorted.length === 0) {
            return `<option value="">Nenhuma transportadora cadastrada</option>`;
        }
        return `<option value="">Selecione a transportadora...</option>` +
            sorted.map(c => `<option value="${c}" ${c === selectedValue ? 'selected' : ''}>${c}</option>`).join('');
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init(db, tenantId, user) {
        _db          = db;
        _tenantId    = tenantId;
        _currentUser = user;
        renderView();
    }

    // ── Gera ID sequencial ────────────────────────────────────────────────────
    function _gerarId() {
        const hoje = new Date();
        const data = `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}`;
        const seq  = String(Date.now()).slice(-4);
        return `OCC-${data}-${seq}`;
    }

    // ── Firestore helpers ─────────────────────────────────────────────────────
    function _col() {
        return _db.collection('tenants').doc(_tenantId).collection('occurrences');
    }

    async function _carregar() {
        try {
            const snap = await _col().orderBy('criadoEm', 'desc').get();
            _ocorrencias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) {
            console.warn('[Ocorrencias] Erro ao carregar:', e.message);
            _ocorrencias = [];
        }
    }

    // ── Busca NF no histórico de despachos ────────────────────────────────────
    async function buscarNF(nf) {
        if (!nf || !_db) return null;
        try {
            // Busca em dispatches (legacy_store)
            const refDisp = _db.collection('tenants').doc(_tenantId)
                .collection('legacy_store').doc('dispatches');
            const doc = await refDisp.get();
            if (!doc.exists) return null;

            let data = doc.data();
            let lista = [];

            if (data && data.content) {
                try { lista = JSON.parse(data.content); } catch(e) { lista = []; }
            } else if (Array.isArray(data)) {
                lista = data;
            }

            // Procura a NF (string ou número)
            const found = lista.find(d => String(d.nf || d.invoiceNumber || d.invoice || '').trim() === String(nf).trim());
            if (!found) return null;

            return {
                cliente:        found.client || found.cliente || found.customerName || '—',
                transportadora: found.carrier || found.transportadora || '—',
                peso:           found.weight  || found.peso   || '—',
                valor:          found.value   || found.valor  || '—',
                cidade:         found.city    || found.cidade || '—',
            };
        } catch(e) {
            console.warn('[Ocorrencias] buscarNF:', e.message);
            return null;
        }
    }

    // ── Toast ─────────────────────────────────────────────────────────────────
    function _toast(msg, tipo = 'success') {
        const t = document.createElement('div');
        const colors = {
            success: { bg: 'rgba(16,185,129,.95)', icon: 'check_circle' },
            error:   { bg: 'rgba(239,68,68,.95)',  icon: 'error' },
            info:    { bg: 'rgba(99,102,241,.95)', icon: 'info' },
        };
        const c = colors[tipo] || colors.info;
        t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;
            background:${c.bg};color:#fff;padding:.75rem 1.25rem;border-radius:10px;
            font-size:.9rem;font-weight:500;display:flex;align-items:center;gap:.5rem;
            box-shadow:0 8px 24px rgba(0,0,0,.4);animation:slideInRight .3s ease;
            backdrop-filter:blur(8px);`;
        t.innerHTML = `<span class="material-icons-round" style="font-size:1.1rem">${c.icon}</span>${msg}`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    // ── Render principal ──────────────────────────────────────────────────────
    async function renderView() {
        const container = document.getElementById('view-occurrences');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:2.5rem;animation:spin 1s linear infinite">sync</span>
            <p>Carregando ocorrências...</p></div>`;

        await _carregar();
        _renderLista();
    }

    function _renderLista() {
        const container = document.getElementById('view-occurrences');
        if (!container) return;

        // Aplica filtros
        let lista = [..._ocorrencias];
        if (_filtros.status) lista = lista.filter(o => o.status === _filtros.status);
        if (_filtros.tipo)   lista = lista.filter(o => o.tipo   === _filtros.tipo);
        if (_filtros.periodo) {
            const dias = parseInt(_filtros.periodo);
            const corte = Date.now() - dias * 86400000;
            lista = lista.filter(o => {
                const t = o.criadoEm?.toMillis ? o.criadoEm.toMillis() : new Date(o.criadoEm).getTime();
                return t >= corte;
            });
        }

        // Contadores por status
        const counts = {};
        Object.keys(STATUS).forEach(k => { counts[k] = _ocorrencias.filter(o => o.status === k).length; });

        container.innerHTML = `
        <style>
            @keyframes slideInRight { from { transform:translateX(100px);opacity:0 } to { transform:translateX(0);opacity:1 } }
            @keyframes fadeIn { from { opacity:0;transform:translateY(8px) } to { opacity:1;transform:translateY(0) } }
            .occ-card { animation:fadeIn .25s ease forwards; }
            .occ-row:hover { background:rgba(255,255,255,.04)!important; cursor:pointer; }
            .occ-badge { display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .6rem;border-radius:6px;font-size:.72rem;font-weight:600;letter-spacing:.02em; }
            .filter-chip { cursor:pointer;padding:.35rem .75rem;border-radius:20px;font-size:.78rem;border:1px solid var(--border-color);background:rgba(255,255,255,.04);color:var(--text-secondary);transition:.15s; }
            .filter-chip.active { background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.4);color:#a5b4fc; }
            .filter-chip:hover:not(.active) { border-color:rgba(255,255,255,.2);color:var(--text-primary); }
            .pipeline-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
            .fab-occ { position:fixed;bottom:2rem;right:2rem;z-index:999;width:56px;height:56px;
                border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;
                display:flex;align-items:center;justify-content:center;cursor:pointer;
                box-shadow:0 8px 24px rgba(99,102,241,.5);transition:.2s;color:#fff; }
            .fab-occ:hover { transform:scale(1.08);box-shadow:0 12px 32px rgba(99,102,241,.6); }
        </style>

        <!-- Header -->
        <div class="welcome-banner" style="margin-bottom:1.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
                <div>
                    <h2 style="display:flex;align-items:center;gap:.6rem">
                        <span class="material-icons-round" style="color:#f59e0b">report_problem</span>
                        Ocorrências Logísticas
                    </h2>
                    <p>Registro e tratamento de ocorrências por NF. Acesso restrito a supervisores.</p>
                </div>
                <button onclick="OcorrenciasModule.abrirNovaOcorrencia()" class="btn btn-primary" style="gap:.5rem">
                    <span class="material-icons-round">add</span> Nova Ocorrência
                </button>
            </div>
        </div>

        <!-- Cards de Status -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem">
            ${Object.entries(STATUS).map(([k,s]) => `
            <div onclick="OcorrenciasModule.filtrarStatus('${k}')" style="
                background:${s.bg};border:1px solid ${s.color}33;border-radius:12px;padding:.85rem 1rem;
                cursor:pointer;transition:.15s;text-align:center;
                ${_filtros.status===k ? `box-shadow:0 0 0 2px ${s.color};` : ''}
            ">
                <span class="material-icons-round" style="color:${s.color};font-size:1.4rem">${s.icon}</span>
                <div style="font-size:1.4rem;font-weight:700;color:${s.color};line-height:1.2">${counts[k]}</div>
                <div style="font-size:.7rem;color:var(--text-secondary);margin-top:.1rem">${s.label}</div>
            </div>`).join('')}
        </div>

        <!-- Filtros -->
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.25rem;align-items:center">
            <span style="font-size:.78rem;color:var(--text-secondary)">Filtrar:</span>
            <span class="filter-chip ${!_filtros.status ? 'active':''}" onclick="OcorrenciasModule.filtrarStatus('')">Todos</span>

            <select onchange="OcorrenciasModule.filtrarTipo(this.value)" class="form-input"
                style="height:32px;font-size:.78rem;padding:.2rem .6rem;width:auto;min-width:160px">
                <option value="">Tipo: Todos</option>
                ${Object.entries(TIPOS).map(([k,t]) => `<option value="${k}" ${_filtros.tipo===k?'selected':''}>${t.label}</option>`).join('')}
            </select>

            <select onchange="OcorrenciasModule.filtrarPeriodo(this.value)" class="form-input"
                style="height:32px;font-size:.78rem;padding:.2rem .6rem;width:auto">
                <option value="">Período: Todos</option>
                <option value="7"  ${_filtros.periodo==='7' ?'selected':''}>Últimos 7 dias</option>
                <option value="30" ${_filtros.periodo==='30'?'selected':''}>Últimos 30 dias</option>
                <option value="90" ${_filtros.periodo==='90'?'selected':''}>Últimos 90 dias</option>
            </select>

            <button onclick="OcorrenciasModule.exportarRelatorio()" class="btn btn-secondary"
                style="font-size:.78rem;padding:.35rem .9rem;gap:.4rem;height:32px">
                <span class="material-icons-round" style="font-size:1rem">download</span>
                Relatório PDF
            </button>
        </div>

        <!-- Tabela -->
        <div class="card" style="padding:0;overflow:hidden">
            ${lista.length === 0 ? `
            <div style="text-align:center;padding:4rem;color:var(--text-secondary)">
                <span class="material-icons-round" style="font-size:3.5rem;opacity:.3">inbox</span>
                <p style="margin:.5rem 0 0">Nenhuma ocorrência encontrada.</p>
                <p style="font-size:.8rem;opacity:.6">Clique em "Nova Ocorrência" para registrar.</p>
            </div>` : `
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);background:rgba(255,255,255,.03)">
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">ID / NF</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">Tipo</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">Cliente</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">Status</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">Aberta em</th>
                        <th style="padding:.75rem 1rem;text-align:left;font-size:.75rem;color:var(--text-secondary);font-weight:600">Por</th>
                        <th style="padding:.75rem .5rem;text-align:center;font-size:.75rem;color:var(--text-secondary);font-weight:600"></th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(o => {
                        const s = STATUS[o.status] || STATUS.aberta;
                        const tipo = TIPOS[o.tipo] || TIPOS.outro;
                        const dt = o.criadoEm?.toDate ? o.criadoEm.toDate() : new Date(o.criadoEm);
                        return `
                        <tr class="occ-row" onclick="OcorrenciasModule.abrirDetalhe('${o.id}')"
                            style="border-bottom:1px solid rgba(255,255,255,.05)">
                            <td style="padding:.8rem 1rem">
                                <div style="font-family:monospace;font-size:.8rem;color:var(--text-primary);font-weight:600">${o.id}</div>
                                <div style="font-size:.75rem;color:var(--text-secondary)">NF ${o.nf}</div>
                            </td>
                            <td style="padding:.8rem 1rem">
                                <div style="display:flex;align-items:center;gap:.4rem;font-size:.82rem">
                                    <span class="material-icons-round" style="font-size:.95rem;color:var(--text-secondary)">${tipo.icon}</span>
                                    ${tipo.label}
                                </div>
                            </td>
                            <td style="padding:.8rem 1rem;font-size:.82rem;color:var(--text-secondary)">${o.dadosNF?.cliente || '—'}</td>
                            <td style="padding:.8rem 1rem">
                                <span class="occ-badge" style="background:${s.bg};color:${s.color}">
                                    <span class="pipeline-dot" style="background:${s.color}"></span>
                                    ${s.label}
                                </span>
                            </td>
                            <td style="padding:.8rem 1rem;font-size:.78rem;color:var(--text-secondary)">${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
                            <td style="padding:.8rem 1rem;font-size:.78rem;color:var(--text-secondary)">${o.criadoPor?.nome || '—'}</td>
                            <td style="padding:.8rem .5rem;text-align:center">
                                <span class="material-icons-round" style="font-size:1.1rem;color:var(--text-secondary)">chevron_right</span>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>`}
        </div>

        <!-- FAB -->
        <button class="fab-occ" onclick="OcorrenciasModule.abrirNovaOcorrencia()" title="Nova Ocorrência">
            <span class="material-icons-round" style="font-size:1.5rem">add</span>
        </button>

        <!-- Modal Ocorrência -->
        <div id="occModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);
            backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:1rem"></div>
        `;
    }

    // ── Filtros ───────────────────────────────────────────────────────────────
    function filtrarStatus(v) { _filtros.status = _filtros.status === v ? '' : v; _renderLista(); }
    function filtrarTipo(v)   { _filtros.tipo   = v; _renderLista(); }
    function filtrarPeriodo(v){ _filtros.periodo = v; _renderLista(); }

    // ── Nova Ocorrência ───────────────────────────────────────────────────────
    function abrirNovaOcorrencia() {
        const modal = document.getElementById('occModal');
        if (!modal) return;
        modal.style.display = 'flex';
        modal.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;
            width:100%;max-width:600px;max-height:90vh;overflow-y:auto;animation:fadeIn .2s ease">

            <div style="display:flex;justify-content:space-between;align-items:center;
                padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color)">
                <h3 style="margin:0;display:flex;align-items:center;gap:.5rem">
                    <span class="material-icons-round" style="color:#f59e0b">add_alert</span>
                    Nova Ocorrência
                </h3>
                <button onclick="document.getElementById('occModal').style.display='none'"
                    style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:.25rem">
                    <span class="material-icons-round">close</span>
                </button>
            </div>

            <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem">

                <!-- NF -->
                <div class="form-group">
                    <label class="form-label">Número da NF *</label>
                    <div style="display:flex;gap:.5rem">
                        <input type="text" id="occNF" class="form-input" placeholder="Ex: 7536"
                            oninput="this.value=this.value.replace(/[^0-9]/g,'')" style="flex:1">
                        <button onclick="OcorrenciasModule._buscarNFModal()" class="btn btn-secondary"
                            style="gap:.3rem;white-space:nowrap">
                            <span class="material-icons-round" style="font-size:1rem">search</span> Buscar
                        </button>
                    </div>
                    <div id="occNFResult" style="display:none;margin-top:.5rem;padding:.6rem .8rem;
                        background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);
                        border-radius:8px;font-size:.8rem;color:var(--text-secondary)"></div>
                </div>

                <!-- Tipo -->
                <div class="form-group">
                    <label class="form-label">Tipo de Ocorrência *</label>
                    <select id="occTipo" class="form-input" style="height:43px">
                        <option value="">Selecione o tipo...</option>
                        ${Object.entries(TIPOS).map(([k,t]) => `<option value="${k}">${t.label}</option>`).join('')}
                    </select>
                </div>

                <!-- Responsável -->
                <div class="form-group">
                    <label class="form-label">Responsável</label>
                    <select id="occResp" class="form-input" style="height:43px"
                        onchange="OcorrenciasModule._occRespChange(this.value)">
                        <option value="transportadora">Transportadora</option>
                        <option value="conferencia">Conferência / Expedição</option>
                        <option value="cliente">Cliente</option>
                        <option value="outro">Outro</option>
                    </select>
                </div>

                <!-- Transportadora / Envolvido (campo dinâmico) -->
                <div class="form-group" id="occTranspGroup">
                    <label class="form-label" id="occTranspLabel">Transportadora Envolvida</label>

                    <!-- Select: visível quando responsável = transportadora -->
                    <select id="occTranspSelect" class="form-input" style="height:43px">
                        ${_getCarriersOptions()}
                    </select>

                    <!-- Input livre: visível quando responsável = conferencia/cliente/outro -->
                    <input type="text" id="occTranspInput" class="form-input"
                        placeholder="Identifique o envolvido (ex: setor, nome do cliente...)"
                        style="display:none">
                </div>

                <!-- Descrição -->
                <div class="form-group">
                    <label class="form-label">Descrição da Ocorrência *</label>
                    <textarea id="occDescricao" class="form-input" rows="4"
                        style="resize:vertical;min-height:90px"
                        placeholder="Descreva detalhadamente o que aconteceu..."></textarea>
                </div>

            </div>

            <div style="padding:1rem 1.5rem;border-top:1px solid var(--border-color);
                display:flex;justify-content:flex-end;gap:.75rem">
                <button onclick="document.getElementById('occModal').style.display='none'"
                    class="btn btn-secondary">Cancelar</button>
                <button onclick="OcorrenciasModule._salvarNovaOcorrencia()" class="btn btn-primary" style="gap:.4rem">
                    <span class="material-icons-round">save</span> Registrar Ocorrência
                </button>
            </div>
        </div>`;
    }

    // ── Busca NF no modal ─────────────────────────────────────────────────────
    async function _buscarNFModal() {
        const nf = document.getElementById('occNF')?.value?.trim();
        const resultEl = document.getElementById('occNFResult');
        if (!nf || !resultEl) return;

        resultEl.style.display = 'block';
        resultEl.textContent = '🔍 Buscando...';

        const dados = await buscarNF(nf);
        if (!dados) {
            resultEl.style.background = 'rgba(245,158,11,.08)';
            resultEl.style.borderColor = 'rgba(245,158,11,.2)';
            resultEl.innerHTML = '⚠️ NF não encontrada no histórico. Prossiga com o preenchimento manual.';
            return;
        }

        // Preenche transportadora automaticamente no campo correto (select ou input)
        if (dados.transportadora && dados.transportadora !== '—') {
            const selEl = document.getElementById('occTranspSelect');
            const inpEl = document.getElementById('occTranspInput');

            if (selEl && selEl.style.display !== 'none') {
                // Modo select: tenta casar com o cadastro
                const opts = Array.from(selEl.options).map(o => o.value);
                const match = opts.find(o => o === dados.transportadora)
                           || opts.find(o => o.toUpperCase() === dados.transportadora.toUpperCase());
                if (match) selEl.value = match;
            } else if (inpEl) {
                // Modo texto livre
                inpEl.value = dados.transportadora;
            }
        }

        resultEl.style.background = 'rgba(16,185,129,.08)';
        resultEl.style.borderColor = 'rgba(16,185,129,.2)';
        resultEl.innerHTML = `
            ✅ <strong>NF ${nf}</strong> encontrada &nbsp;|&nbsp;
            Cliente: <strong>${dados.cliente}</strong> &nbsp;|&nbsp;
            Transportadora: <strong>${dados.transportadora}</strong> &nbsp;|&nbsp;
            Peso: <strong>${dados.peso} kg</strong> &nbsp;|&nbsp;
            Valor: <strong>R$ ${dados.valor}</strong>
        `;
        resultEl._dadosNF = dados;
    }

    // ── Salva nova ocorrência ─────────────────────────────────────────────────
    async function _salvarNovaOcorrencia() {
        const nf       = document.getElementById('occNF')?.value?.trim();
        const tipo     = document.getElementById('occTipo')?.value;
        const resp     = document.getElementById('occResp')?.value;
        const desc     = document.getElementById('occDescricao')?.value?.trim();
        const dadosNF  = document.getElementById('occNFResult')?._dadosNF || {};

        // Lê transportadora do campo visível (select ou input livre)
        const selEl = document.getElementById('occTranspSelect');
        const inpEl = document.getElementById('occTranspInput');
        const transp = (selEl && selEl.style.display !== 'none')
            ? (selEl.value || '').trim()
            : (inpEl?.value || '').trim();

        if (!nf)   { _toast('Informe o número da NF.', 'error'); return; }
        if (!tipo) { _toast('Selecione o tipo de ocorrência.', 'error'); return; }
        if (!desc) { _toast('Preencha a descrição.', 'error'); return; }

        const id  = _gerarId();
        const now = new Date().toISOString();
        const por = { login: _currentUser?.login || 'sistema', nome: _currentUser?.nome || _currentUser?.name || 'Sistema' };

        const ocorrencia = {
            id,
            nf,
            tipo,
            responsavel:     resp,
            transportadora:  transp,
            descricao:       desc,
            status:          'aberta',
            dadosNF,
            criadoEm:        now,
            criadoPor:       por,
            etapas: {
                abertura:       { em: now, por, notas: '' },
                analise:        { em: null, por: null, notas: '' },
                parecer:        { em: null, por: null, procede: null, justificativa: '' },
                formaResolucao: { em: null, por: null, descricao: '' },
                resolucao:      { em: null, por: null, notas: '' },
                conclusao:      { em: null, por: null, notas: '' },
            }
        };

        try {
            await _col().doc(id).set(ocorrencia);
            _toast(`Ocorrência ${id} registrada com sucesso!`);
            document.getElementById('occModal').style.display = 'none';
            await renderView();
        } catch(e) {
            _toast('Erro ao salvar: ' + e.message, 'error');
        }
    }

    // ── Alterna campo de transportadora conforme responsável ──────────────────
    function _occRespChange(resp) {
        const selEl   = document.getElementById('occTranspSelect');
        const inpEl   = document.getElementById('occTranspInput');
        const labelEl = document.getElementById('occTranspLabel');
        if (!selEl || !inpEl) return;

        const isTransp = resp === 'transportadora';

        selEl.style.display = isTransp ? '' : 'none';
        inpEl.style.display = isTransp ? 'none' : '';

        if (labelEl) {
            labelEl.textContent = isTransp
                ? 'Transportadora Envolvida'
                : 'Envolvido / Identificação';
        }

        // Limpa o campo ao trocar
        if (isTransp) { selEl.value = ''; }
        else          { inpEl.value = ''; }
    }

    // ── Abre detalhe / pipeline ───────────────────────────────────────────────
    function abrirDetalhe(id) {
        const occ = _ocorrencias.find(o => o.id === id);
        if (!occ) return;

        const modal = document.getElementById('occModal');
        if (!modal) return;
        modal.style.display = 'flex';

        const s      = STATUS[occ.status] || STATUS.aberta;
        const tipo   = TIPOS[occ.tipo]    || TIPOS.outro;
        const dt     = new Date(occ.criadoEm);
        const statusIdx = PIPELINE.indexOf(occ.status);

        // Etapas para o pipeline visual
        const etapasConfig = [
            { key: 'abertura',       label: 'Aberta',              icon: 'fiber_new',         skey: 'aberta'          },
            { key: 'analise',        label: 'Em Análise',          icon: 'manage_search',     skey: 'em_analise'      },
            { key: 'parecer',        label: 'Parecer',             icon: 'gavel',             skey: 'parecer'         },
            { key: 'formaResolucao', label: 'Forma de Resolução',  icon: 'playlist_add_check',skey: 'forma_resolucao' },
            { key: 'resolucao',      label: 'Em Resolução',        icon: 'construction',      skey: 'resolucao'       },
            { key: 'conclusao',      label: 'Concluída',           icon: 'task_alt',          skey: 'concluida'       },
        ];

        // Determina próxima etapa possível
        const nextIdx    = statusIdx + 1;
        const nextSKey   = PIPELINE[nextIdx];
        const nextConfig = etapasConfig.find(e => e.skey === nextSKey);

        modal.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;
            width:100%;max-width:750px;max-height:92vh;overflow-y:auto;animation:fadeIn .2s ease">

            <!-- Header -->
            <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                        <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
                            <span style="font-family:monospace;font-size:1rem;font-weight:700;color:var(--text-primary)">${occ.id}</span>
                            <span class="occ-badge" style="background:${s.bg};color:${s.color}">
                                <span class="material-icons-round" style="font-size:.85rem">${s.icon}</span>
                                ${s.label}
                            </span>
                            <span style="font-size:.75rem;color:var(--text-secondary)">NF ${occ.nf}</span>
                        </div>
                        <div style="margin-top:.35rem;font-size:.82rem;color:var(--text-secondary)">
                            ${tipo.label} &nbsp;·&nbsp;
                            Aberta em ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                            por <strong>${occ.criadoPor?.nome || '—'}</strong>
                        </div>
                    </div>
                    <button onclick="document.getElementById('occModal').style.display='none'"
                        style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:.25rem;flex-shrink:0">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
            </div>

            <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1.5rem">

                <!-- Dados da NF -->
                ${occ.dadosNF && Object.keys(occ.dadosNF).length > 0 ? `
                <div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:.85rem 1rem;font-size:.82rem;color:var(--text-secondary);display:flex;gap:1.5rem;flex-wrap:wrap">
                    <span>👤 <strong>${occ.dadosNF.cliente || '—'}</strong></span>
                    <span>🚛 <strong>${occ.dadosNF.transportadora || occ.transportadora || '—'}</strong></span>
                    <span>⚖️ <strong>${occ.dadosNF.peso || '—'} kg</strong></span>
                    <span>💰 <strong>R$ ${occ.dadosNF.valor || '—'}</strong></span>
                </div>` : occ.transportadora ? `
                <div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:.85rem 1rem;font-size:.82rem;color:var(--text-secondary)">
                    🚛 Transportadora: <strong>${occ.transportadora}</strong>
                </div>` : ''}

                <!-- Descrição -->
                <div>
                    <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.4rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Descrição</div>
                    <div style="background:rgba(255,255,255,.04);border:1px solid var(--border-color);border-radius:8px;padding:.85rem 1rem;font-size:.88rem;line-height:1.6">${occ.descricao}</div>
                </div>

                <!-- Pipeline visual -->
                <div>
                    <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:.85rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Tratativa</div>
                    <div style="display:flex;flex-direction:column;gap:0">
                        ${etapasConfig.map((etapa, i) => {
                            const concluida = i <= statusIdx;
                            const atual     = i === statusIdx;
                            const eData     = occ.etapas?.[etapa.key] || {};
                            const cor       = STATUS[etapa.skey]?.color || '#6b7280';
                            return `
                            <div style="display:flex;gap:.85rem;${i < etapasConfig.length-1 ? '' : ''}">
                                <!-- Linha vertical + círculo -->
                                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                                    <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                                        background:${concluida ? cor : 'rgba(255,255,255,.06)'};
                                        border:2px solid ${concluida ? cor : 'var(--border-color)'};
                                        ${atual ? `box-shadow:0 0 0 3px ${cor}33;` : ''}">
                                        <span class="material-icons-round" style="font-size:.9rem;color:${concluida ? '#fff' : 'var(--text-secondary)'}">
                                            ${concluida ? (atual ? etapa.icon : 'check') : etapa.icon}
                                        </span>
                                    </div>
                                    ${i < etapasConfig.length-1 ? `<div style="width:2px;flex:1;min-height:16px;background:${concluida && !atual ? cor : 'var(--border-color)'};margin:.2rem 0"></div>` : ''}
                                </div>

                                <!-- Conteúdo da etapa -->
                                <div style="padding-bottom:${i < etapasConfig.length-1 ? '1rem' : '0'};flex:1;min-width:0">
                                    <div style="font-weight:600;font-size:.88rem;color:${concluida ? 'var(--text-primary)' : 'var(--text-secondary)'}">
                                        ${etapa.label}
                                        ${atual ? `<span style="font-size:.7rem;color:${cor};background:${cor}22;padding:.1rem .45rem;border-radius:4px;margin-left:.4rem">Atual</span>` : ''}
                                    </div>
                                    ${eData.em ? `
                                    <div style="font-size:.75rem;color:var(--text-secondary);margin-top:.15rem">
                                        ${new Date(eData.em).toLocaleDateString('pt-BR')} ${new Date(eData.em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                                        por <strong>${eData.por?.nome || '—'}</strong>
                                    </div>` : ''}
                                    ${eData.notas ? `<div style="font-size:.8rem;color:var(--text-secondary);margin-top:.25rem;font-style:italic">"${eData.notas}"</div>` : ''}
                                    ${eData.procede !== null && eData.procede !== undefined ? `
                                    <div style="font-size:.8rem;margin-top:.25rem">
                                        Procede: <strong style="color:${eData.procede ? '#10b981' : '#ef4444'}">${eData.procede ? 'Sim' : 'Não'}</strong>
                                        ${eData.justificativa ? ` — "${eData.justificativa}"` : ''}
                                    </div>` : ''}
                                    ${eData.descricao ? `<div style="font-size:.8rem;color:var(--text-secondary);margin-top:.25rem">Resolução: "${eData.descricao}"</div>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Ação: avançar etapa -->
                ${occ.status !== 'concluida' && nextConfig ? `
                <div style="background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:1.1rem 1.25rem" id="acaoEtapa">
                    <div style="font-size:.82rem;font-weight:600;margin-bottom:.75rem;color:#a5b4fc">
                        ➡️ Avançar para: <strong>${nextConfig.label}</strong>
                    </div>

                    ${nextConfig.skey === 'parecer' ? `
                    <div class="form-group" style="margin-bottom:.75rem">
                        <label class="form-label">A reclamação procede?</label>
                        <div style="display:flex;gap:.75rem">
                            <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem">
                                <input type="radio" name="occProcede" value="sim" id="procedeSimRadio"> Sim, procede
                            </label>
                            <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-size:.88rem">
                                <input type="radio" name="occProcede" value="nao" id="procedeNaoRadio"> Não procede
                            </label>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:.75rem">
                        <label class="form-label">Justificativa</label>
                        <input type="text" id="occEtapaJust" class="form-input" placeholder="Ex: Avaria confirmada pela transportadora">
                    </div>` : ''}

                    ${nextConfig.skey === 'forma_resolucao' ? `
                    <div class="form-group" style="margin-bottom:.75rem">
                        <label class="form-label">Forma de Resolução *</label>
                        <select id="occFormaResolucao" class="form-input" style="height:43px">
                            <option value="">Selecione...</option>
                            <option value="Reembolso ao cliente">Reembolso ao cliente</option>
                            <option value="Reentrega do produto">Reentrega do produto</option>
                            <option value="Desconto em próxima NF">Desconto em próxima NF</option>
                            <option value="Crédito em nota fiscal">Crédito em nota fiscal</option>
                            <option value="Acionamento do seguro">Acionamento do seguro</option>
                            <option value="Troca do produto">Troca do produto</option>
                            <option value="Outro">Outro</option>
                        </select>
                    </div>` : ''}

                    <div class="form-group" style="margin-bottom:.75rem">
                        <label class="form-label">Observações (opcional)</label>
                        <textarea id="occEtapaNotas" class="form-input" rows="2"
                            style="resize:vertical" placeholder="Anotações sobre esta etapa..."></textarea>
                    </div>

                    <button onclick="OcorrenciasModule._avancarEtapa('${occ.id}', '${nextConfig.skey}', '${nextConfig.key}')"
                        class="btn btn-primary" style="gap:.4rem">
                        <span class="material-icons-round">${nextConfig.icon}</span>
                        Marcar como "${nextConfig.label}"
                    </button>
                </div>` : occ.status === 'concluida' ? `
                <div style="text-align:center;padding:1rem;color:#10b981;font-size:.9rem;font-weight:600">
                    <span class="material-icons-round" style="font-size:1.5rem;vertical-align:middle">task_alt</span>
                    Ocorrência concluída.
                </div>` : ''}

            </div>
        </div>`;
    }

    // ── Avança etapa do pipeline ──────────────────────────────────────────────
    async function _avancarEtapa(occId, novoStatus, etapaKey) {
        const occ = _ocorrencias.find(o => o.id === occId);
        if (!occ) return;

        const now = new Date().toISOString();
        const por = { login: _currentUser?.login || 'sistema', nome: _currentUser?.nome || _currentUser?.name || 'Sistema' };

        const notas = document.getElementById('occEtapaNotas')?.value?.trim() || '';
        const etapaData = { em: now, por, notas };

        // Dados específicos da etapa
        if (novoStatus === 'parecer') {
            const procedeVal = document.querySelector('input[name="occProcede"]:checked')?.value;
            if (!procedeVal) { _toast('Selecione se a reclamação procede ou não.', 'error'); return; }
            etapaData.procede       = procedeVal === 'sim';
            etapaData.justificativa = document.getElementById('occEtapaJust')?.value?.trim() || '';
        }

        if (novoStatus === 'forma_resolucao') {
            const forma = document.getElementById('occFormaResolucao')?.value;
            if (!forma) { _toast('Selecione a forma de resolução.', 'error'); return; }
            etapaData.descricao = forma;
        }

        // Se parecer = "Não procede" → vai direto para concluída
        let statusFinal = novoStatus;
        if (novoStatus === 'parecer' && etapaData.procede === false) {
            statusFinal = 'concluida';
            // Preenche conclusão automaticamente
            const conclusaoData = { em: now, por, notas: 'Encerrado automaticamente: reclamação não procede.' };
            try {
                await _col().doc(occId).update({
                    status:                        statusFinal,
                    [`etapas.${etapaKey}`]:        etapaData,
                    'etapas.conclusao':            conclusaoData,
                });
            } catch(e) { _toast('Erro ao salvar: ' + e.message, 'error'); return; }
            _toast(`Ocorrência encerrada — reclamação não procede.`, 'info');
        } else {
            try {
                await _col().doc(occId).update({
                    status:                   statusFinal,
                    [`etapas.${etapaKey}`]:   etapaData,
                });
            } catch(e) { _toast('Erro ao salvar: ' + e.message, 'error'); return; }
            _toast(`Etapa "${STATUS[statusFinal]?.label}" registrada por ${por.nome}!`);
        }

        document.getElementById('occModal').style.display = 'none';
        await renderView();
    }

    // ── Exportar relatório PDF ────────────────────────────────────────────────
    function exportarRelatorio() {
        let lista = [..._ocorrencias];
        if (_filtros.status) lista = lista.filter(o => o.status === _filtros.status);
        if (_filtros.tipo)   lista = lista.filter(o => o.tipo   === _filtros.tipo);

        const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Relatório de Ocorrências — ${mes}</title>
        <style>
            body { font-family: Arial, sans-serif; color: #1e293b; margin: 2rem; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: .25rem; }
            .sub { color: #64748b; margin-bottom: 1.5rem; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th { background: #1e293b; color: #fff; padding: .5rem .75rem; text-align: left; font-size: 11px; }
            td { padding: .5rem .75rem; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) td { background: #f8fafc; }
            .badge { display: inline-block; padding: .15rem .4rem; border-radius: 4px; font-size: 10px; font-weight: 700; }
        </style></head><body>
        <h1>Relatório de Ocorrências Logísticas</h1>
        <div class="sub">Gerado em ${new Date().toLocaleString('pt-BR')} — Total: ${lista.length} ocorrência(s)</div>
        <table>
            <thead><tr>
                <th>ID</th><th>NF</th><th>Tipo</th><th>Responsável</th>
                <th>Status</th><th>Aberta em</th><th>Por</th><th>Descrição</th>
            </tr></thead>
            <tbody>
            ${lista.map(o => `<tr>
                <td>${o.id}</td>
                <td>${o.nf}</td>
                <td>${TIPOS[o.tipo]?.label || o.tipo}</td>
                <td>${o.responsavel}</td>
                <td>${STATUS[o.status]?.label || o.status}</td>
                <td>${new Date(o.criadoEm).toLocaleDateString('pt-BR')}</td>
                <td>${o.criadoPor?.nome || '—'}</td>
                <td style="max-width:200px">${o.descricao}</td>
            </tr>`).join('')}
            </tbody>
        </table>
        </body></html>`;

        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 500);
    }

    // ── API pública ───────────────────────────────────────────────────────────
    return {
        init, renderView,
        abrirNovaOcorrencia, abrirDetalhe,
        filtrarStatus, filtrarTipo, filtrarPeriodo,
        exportarRelatorio,
        _buscarNFModal, _salvarNovaOcorrencia, _avancarEtapa,
        _occRespChange,
        buscarNF,
    };

})();

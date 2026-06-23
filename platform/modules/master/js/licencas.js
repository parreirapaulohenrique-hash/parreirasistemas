// =============================================================================
// licencas.js — Controle de Licenças de Clientes
// Painel Admin | Parreira Sistemas
// =============================================================================

window.LicencasManager = (function () {

    const MODULOS = [
        { id: 'erp',         label: 'ERP',             icon: 'account_balance' },
        { id: 'wms',         label: 'WMS',             icon: 'warehouse' },
        { id: 'wms-coletor', label: 'WMS Coletor',     icon: 'phone_android' },
        { id: 'dispatch',    label: 'Despacho',        icon: 'local_shipping' },
        { id: 'sales-force', label: 'Força de Vendas', icon: 'store' },
        { id: 'consultoria', label: 'Consultoria',     icon: 'savings' },
    ];

    const STATUS_CFG = {
        'TRIAL':    { label: 'TRIAL',    color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
        'ATIVA':    { label: 'ATIVA',    color: '#10b981', bg: 'rgba(16,185,129,.12)' },
        'SUSPENSA': { label: 'SUSPENSA', color: '#ef4444', bg: 'rgba(239,68,68,.12)'  },
        'EXPIRADA': { label: 'EXPIRADA', color: '#64748b', bg: 'rgba(100,116,139,.12)'},
    };

    let _cache = {};

    // ── Helpers ──────────────────────────────────────────────────────────────
    function _col() {
        try {
            return ParreiraAuth.getDB()
                .collection('platform').doc('licencas').collection('clientes');
        } catch(e) { return null; }
    }

    function _licencaPadrao(tenantId, nome) {
        return {
            id: tenantId, nome: nome || tenantId,
            status: 'TRIAL', modulos: [],
            dataInicio: new Date().toISOString().slice(0,10),
            dataVencimento: '', numUsuarios: 5,
            valorMensal: 0, observacao: '', tratativas: []
        };
    }

    function _allTenants() {
        const reg = JSON.parse(localStorage.getItem('platform_tenants_registry') || '[]');
        // also include mock tenants if window.mockTenants exists
        const mock = (window.mockTenants || []).filter(m => !reg.find(r => r.id === m.id));
        return [...mock, ...reg];
    }

    // ── Salvar ───────────────────────────────────────────────────────────────
    async function _salvar(tenantId) {
        const dado = _cache[tenantId];
        if (!dado) return;
        try {
            const col = _col();
            if (col) await col.doc(tenantId).set({
                ...dado,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch(e) {
            console.warn('[Licenças] Firestore:', e.message);
        }
        const local = JSON.parse(localStorage.getItem('platform_licencas') || '{}');
        local[tenantId] = dado;
        localStorage.setItem('platform_licencas', JSON.stringify(local));
    }

    // ── Carregar dados ────────────────────────────────────────────────────────
    async function _carregarDados() {
        // localStorage backup
        const local = JSON.parse(localStorage.getItem('platform_licencas') || '{}');
        _cache = { ...local };

        // Firestore
        try {
            const snap = await _col()?.get();
            snap?.docs?.forEach(d => { _cache[d.id] = { id: d.id, ...d.data() }; });
        } catch(e) {
            console.warn('[Licenças] Firestore indisponível.');
        }

        // Garante que todo tenant cadastrado tem entrada em _cache
        _allTenants().forEach(t => {
            if (!_cache[t.id]) {
                _cache[t.id] = _licencaPadrao(t.id, t.name || t.id);
            }
        });
    }

    // ── Render cards ─────────────────────────────────────────────────────────
    function _cardHtml(l) {
        const st = STATUS_CFG[l.status] || STATUS_CFG['TRIAL'];
        const hoje = new Date();
        const venc = l.dataVencimento ? new Date(l.dataVencimento + 'T23:59:59') : null;
        const dias = venc ? Math.ceil((venc - hoje) / 86400000) : null;
        const alerta = dias !== null && dias <= 15 && l.status === 'ATIVA';

        const modBadges = MODULOS.map(m => {
            const ativo = (l.modulos || []).includes(m.id);
            return `<span style="font-size:.65rem;padding:.1rem .4rem;border-radius:4px;
                background:${ativo?'rgba(14,165,233,.15)':'rgba(100,116,139,.08)'};
                color:${ativo?'#38bdf8':'#475569'};border:1px solid ${ativo?'rgba(14,165,233,.25)':'rgba(100,116,139,.15)'};">
                ${m.label}</span>`;
        }).join('');

        const vencTxt = l.dataVencimento
            ? new Date(l.dataVencimento+'T12:00:00').toLocaleDateString('pt-BR')
            : 'Sem data';

        const valorTxt = l.valorMensal
            ? 'R$ ' + Number(l.valorMensal).toLocaleString('pt-BR',{minimumFractionDigits:2})
            : '—';

        const btnStatus = (l.status === 'ATIVA' || l.status === 'TRIAL')
            ? `<button data-lic-suspend="${l.id}" style="background:rgba(239,68,68,.1);color:#ef4444;
                border:1px solid rgba(239,68,68,.2);border-radius:7px;padding:.35rem .6rem;
                font-size:.75rem;cursor:pointer;" title="Suspender">
                <span class="material-icons-round" style="font-size:.9rem;">block</span></button>`
            : `<button data-lic-activate="${l.id}" style="background:rgba(16,185,129,.1);color:#10b981;
                border:1px solid rgba(16,185,129,.2);border-radius:7px;padding:.35rem .6rem;
                font-size:.75rem;cursor:pointer;" title="Reativar">
                <span class="material-icons-round" style="font-size:.9rem;">play_arrow</span></button>`;

        return `
        <div style="background:var(--bg-card,#1e293b);border:1px solid ${alerta?'#f59e0b44':'rgba(255,255,255,.08)'};
            border-radius:14px;padding:1.25rem;display:flex;flex-direction:column;gap:.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-weight:700;font-size:.95rem;color:#e2e8f0;">${l.nome || l.id}</div>
                    <div style="font-size:.72rem;color:#64748b;font-family:monospace;">${l.id}</div>
                </div>
                <span style="background:${st.bg};color:${st.color};font-size:.65rem;font-weight:700;
                    padding:.2rem .6rem;border-radius:20px;">${st.label}</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:.3rem;">${modBadges}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">
                <div style="background:rgba(255,255,255,.03);border-radius:8px;padding:.5rem .65rem;">
                    <div style="font-size:.6rem;color:#64748b;text-transform:uppercase;">Vencimento</div>
                    <div style="font-size:.82rem;font-weight:600;color:${alerta?'#f59e0b':'#e2e8f0'};">
                        ${vencTxt}${alerta?` <span style="font-size:.65rem;">(${dias}d)</span>`:''}
                    </div>
                </div>
                <div style="background:rgba(255,255,255,.03);border-radius:8px;padding:.5rem .65rem;">
                    <div style="font-size:.6rem;color:#64748b;text-transform:uppercase;">Usuários</div>
                    <div style="font-size:.82rem;font-weight:600;color:#e2e8f0;">${l.numUsuarios || '—'}</div>
                </div>
                <div style="background:rgba(255,255,255,.03);border-radius:8px;padding:.5rem .65rem;">
                    <div style="font-size:.6rem;color:#64748b;text-transform:uppercase;">Valor/mês</div>
                    <div style="font-size:.82rem;font-weight:600;color:#10b981;">${valorTxt}</div>
                </div>
                <div style="background:rgba(255,255,255,.03);border-radius:8px;padding:.5rem .65rem;">
                    <div style="font-size:.6rem;color:#64748b;text-transform:uppercase;">Início</div>
                    <div style="font-size:.82rem;font-weight:600;color:#e2e8f0;">
                        ${l.dataInicio ? new Date(l.dataInicio+'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:.5rem;padding-top:.35rem;border-top:1px solid rgba(255,255,255,.06);">
                <button data-lic-edit="${l.id}" style="flex:1;background:rgba(14,165,233,.12);color:#38bdf8;
                    border:1px solid rgba(14,165,233,.2);border-radius:7px;padding:.35rem .6rem;
                    font-size:.75rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.3rem;">
                    <span class="material-icons-round" style="font-size:.9rem;">edit</span> Editar
                </button>
                ${btnStatus}
            </div>
        </div>`;
    }

    function _renderCards(filtro, filtroStatus) {
        const grid = document.getElementById('lic-cards-grid');
        if (!grid) return;

        const busca  = (filtro  ?? document.getElementById('lic-filtro')?.value ?? '').toLowerCase();
        const status = filtroStatus ?? document.getElementById('lic-filtro-status')?.value ?? '';

        const lista = Object.values(_cache).filter(l => {
            if (status && l.status !== status) return false;
            if (busca && !`${l.nome||''} ${l.id}`.toLowerCase().includes(busca)) return false;
            return true;
        });

        if (!lista.length) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">
                <span class="material-icons-round" style="font-size:3rem;opacity:.3;display:block;">verified</span>
                <p>Nenhuma licença encontrada.</p></div>`;
            return;
        }

        grid.innerHTML = lista.map(_cardHtml).join('');

        // Bind buttons via delegation
        grid.querySelectorAll('[data-lic-edit]').forEach(btn =>
            btn.addEventListener('click', () => _abrirModal(_cache[btn.dataset.licEdit]))
        );
        grid.querySelectorAll('[data-lic-suspend]').forEach(btn =>
            btn.addEventListener('click', () => _alterarStatus(btn.dataset.licSuspend, 'SUSPENSA'))
        );
        grid.querySelectorAll('[data-lic-activate]').forEach(btn =>
            btn.addEventListener('click', () => _alterarStatus(btn.dataset.licActivate, 'ATIVA'))
        );
    }

    // ── Status rápido ─────────────────────────────────────────────────────────
    async function _alterarStatus(tenantId, novoStatus) {
        if (!confirm(`Confirma alterar status para "${novoStatus}"?`)) return;
        if (_cache[tenantId]) _cache[tenantId].status = novoStatus;
        await _salvar(tenantId);
        _renderCards();
    }

    // ── Modal de edição ───────────────────────────────────────────────────────
    function _abrirModal(l) {
        if (!l) return;
        document.getElementById('modal-licenca')?.remove();

        const statusOpts = Object.entries(STATUS_CFG).map(([k,v]) =>
            `<option value="${k}" ${l.status===k?'selected':''}>${v.label}</option>`).join('');

        const modulosChecks = MODULOS.map(m => `
            <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;cursor:pointer;padding:.3rem;">
                <input type="checkbox" name="lic-mod" value="${m.id}"
                    ${(l.modulos||[]).includes(m.id)?'checked':''}> ${m.label}
            </label>`).join('');

        const el = document.createElement('div');
        el.id = 'modal-licenca';
        el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
        el.innerHTML = `
            <div style="background:#1e293b;border:1px solid rgba(255,255,255,.1);border-radius:16px;
                width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">
                <div style="padding:1.25rem 1.5rem;border-bottom:1px solid rgba(255,255,255,.08);
                    display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#1e293b;">
                    <strong style="font-size:1rem;">Licença — ${l.nome||l.id}</strong>
                    <button id="btn-fechar-modal-lic" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1.4rem;line-height:1;">✕</button>
                </div>
                <form id="form-licenca" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                        <div>
                            <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.3rem;">Status</label>
                            <select name="status" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.45rem;color:#e2e8f0;font-size:.85rem;">${statusOpts}</select>
                        </div>
                        <div>
                            <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.3rem;">Vencimento</label>
                            <input type="date" name="dataVencimento" value="${l.dataVencimento||''}"
                                style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.45rem;color:#e2e8f0;font-size:.85rem;">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                        <div>
                            <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.3rem;">Nº de Usuários</label>
                            <input type="number" name="numUsuarios" value="${l.numUsuarios||5}" min="1"
                                style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.45rem;color:#e2e8f0;font-size:.85rem;">
                        </div>
                        <div>
                            <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.3rem;">Valor Mensal (R$)</label>
                            <input type="number" name="valorMensal" value="${l.valorMensal||''}" step="0.01" min="0"
                                style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.45rem;color:#e2e8f0;font-size:.85rem;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.5rem;">Módulos Liberados</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;">${modulosChecks}</div>
                    </div>
                    <div>
                        <label style="font-size:.72rem;color:#64748b;display:block;margin-bottom:.3rem;">Observação</label>
                        <textarea name="observacao" rows="2" placeholder="Notas internas..."
                            style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:8px;
                                   padding:.45rem;color:#e2e8f0;font-size:.82rem;resize:vertical;">${l.observacao||''}</textarea>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:.65rem;padding-top:.5rem;border-top:1px solid rgba(255,255,255,.07);">
                        <button type="button" id="btn-cancelar-modal-lic"
                            style="background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.1);
                                   border-radius:8px;padding:.5rem 1.1rem;cursor:pointer;font-size:.85rem;">Cancelar</button>
                        <button type="submit"
                            style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;
                                   border-radius:8px;padding:.5rem 1.25rem;cursor:pointer;font-size:.85rem;font-weight:600;">
                            <span class="material-icons-round" style="font-size:.9rem;vertical-align:middle;">save</span>
                            Salvar Licença
                        </button>
                    </div>
                </form>
            </div>`;

        document.body.appendChild(el);

        // Fechar
        const fechar = () => el.remove();
        el.querySelector('#btn-fechar-modal-lic').addEventListener('click', fechar);
        el.querySelector('#btn-cancelar-modal-lic').addEventListener('click', fechar);
        el.addEventListener('click', e => { if (e.target === el) fechar(); });

        // Submit
        el.querySelector('#form-licenca').addEventListener('submit', async function(e) {
            e.preventDefault();
            const fd   = new FormData(this);
            const mods = [...this.querySelectorAll('[name="lic-mod"]:checked')].map(c => c.value);
            _cache[l.id] = {
                ...l,
                status:         fd.get('status'),
                dataVencimento: fd.get('dataVencimento'),
                numUsuarios:    parseInt(fd.get('numUsuarios')) || 5,
                valorMensal:    parseFloat(fd.get('valorMensal')) || 0,
                modulos:        mods,
                observacao:     fd.get('observacao') || '',
            };
            await _salvar(l.id);
            fechar();
            _renderCards();
        });
    }

    // ── API pública ───────────────────────────────────────────────────────────
    async function renderView() {
        const container = document.getElementById('licencas-container');
        if (!container) return;

        container.innerHTML = `
            <div style="padding:1.5rem;">
                <div style="display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
                    <input id="lic-filtro" type="text" placeholder="🔍 Buscar cliente..."
                        style="flex:1;min-width:180px;background:var(--bg-secondary,#1e293b);
                               border:1px solid rgba(255,255,255,.1);border-radius:8px;
                               padding:.45rem .75rem;color:#e2e8f0;font-size:.85rem;"
                        oninput="LicencasManager.filtrar()">
                    <select id="lic-filtro-status"
                        style="background:var(--bg-secondary,#1e293b);border:1px solid rgba(255,255,255,.1);
                               border-radius:8px;padding:.45rem .75rem;color:#e2e8f0;font-size:.85rem;"
                        onchange="LicencasManager.filtrar()">
                        <option value="">Todos os status</option>
                        <option value="TRIAL">Trial</option>
                        <option value="ATIVA">Ativas</option>
                        <option value="SUSPENSA">Suspensas</option>
                        <option value="EXPIRADA">Expiradas</option>
                    </select>
                </div>
                <div id="lic-cards-grid"
                    style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;">
                    <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">
                        <span class="material-icons-round" style="font-size:3rem;opacity:.3;display:block;">sync</span>
                        Carregando...
                    </div>
                </div>
            </div>`;

        await _carregarDados();
        _renderCards();
    }

    function filtrar() {
        _renderCards();
    }

    function abrirNovaLicenca() {
        const id = prompt('ID do cliente (ex: empresa123):')?.trim().toLowerCase();
        if (!id) return;
        const nome = prompt('Nome da empresa:')?.trim();
        if (!nome) return;
        if (!_cache[id]) _cache[id] = _licencaPadrao(id, nome);
        _abrirModal(_cache[id]);
    }

    /** Chamado pelo app.js quando um novo tenant é salvo */
    function registrarTenant(tenantId, nome) {
        if (!_cache[tenantId]) {
            _cache[tenantId] = _licencaPadrao(tenantId, nome);
            // Persiste imediatamente no localStorage
            const local = JSON.parse(localStorage.getItem('platform_licencas') || '{}');
            local[tenantId] = _cache[tenantId];
            localStorage.setItem('platform_licencas', JSON.stringify(local));
            // Salva no Firestore em background
            _salvar(tenantId);
        }
        // Se a tela de licenças estiver aberta, re-renderiza
        if (document.getElementById('lic-cards-grid')) _renderCards();
    }

    return { renderView, filtrar, abrirNovaLicenca, registrarTenant };
})();

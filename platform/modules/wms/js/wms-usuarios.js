// =============================================================================
// wms-usuarios.js — Gerenciamento de Usuários do WMS (Multi-Tenant)
// Cadastro > Usuários
// =============================================================================

window.WmsUsuarios = (function () {

    // ─── RENDERIZAR VIEW DE USUÁRIOS ─────────────────────────────────────────
    async function renderView(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const sessao = ParreiraAuth.getSessao();
        if (!sessao) return;
        const tenantId = sessao.tenantId;

        container.innerHTML = `
            <div class="card" style="margin-bottom:1.5rem;">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3 style="margin:0;">Usuários</h3>
                        <p style="margin:.25rem 0 0;font-size:.8rem;color:var(--text-secondary);">
                            ${sessao.tenantNome} — Gerenciamento de acessos
                        </p>
                    </div>
                    <button class="btn btn-primary" onclick="WmsUsuarios.abrirModalNovo()">
                        <span class="material-icons-round" style="font-size:1rem;">person_add</span>
                        Novo Usuário
                    </button>
                </div>
                <div class="card-body">
                    <div id="wms-usuarios-tabela">
                        <div style="text-align:center;padding:2rem;color:var(--text-secondary);">
                            <span class="material-icons-round" style="font-size:2rem;opacity:.4;">hourglass_top</span>
                            <p>Carregando usuários...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Usuário -->
            <div id="modal-usuario" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,.6);z-index:9000;align-items:center;justify-content:center;">
                <div class="card" style="width:min(480px,95vw);max-height:90vh;overflow-y:auto;">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <h3 id="modal-usuario-titulo" style="margin:0;">Novo Usuário</h3>
                        <span class="material-icons-round" style="cursor:pointer;color:var(--text-secondary);"
                            onclick="WmsUsuarios.fecharModal()">close</span>
                    </div>
                    <div class="card-body" style="display:flex;flex-direction:column;gap:1rem;">
                        <input type="hidden" id="mu-uid">
                        <div>
                            <label class="form-label">Nome Completo *</label>
                            <input type="text" id="mu-nome" class="form-control" placeholder="João da Silva">
                        </div>
                        <div>
                            <label class="form-label">E-mail *</label>
                            <input type="email" id="mu-email" class="form-control" placeholder="joao@empresa.com.br">
                        </div>
                        <div id="mu-senha-grupo">
                            <label class="form-label">Senha *</label>
                            <input type="password" id="mu-senha" class="form-control" placeholder="Mínimo 6 caracteres">
                        </div>
                        <div>
                            <label class="form-label">Perfil de Acesso *</label>
                            <select id="mu-role" class="form-control">
                                <option value="operator">Operador — Acesso ao Coletor</option>
                                <option value="supervisor">Supervisor — Coletor + Aprovações</option>
                                <option value="admin">Administrador — Acesso Total ao WMS</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">PIN do Coletor <span style="font-size:.75rem;color:var(--text-secondary);">(4-6 dígitos, usado no WMS Coletor)</span></label>
                            <input type="password" id="mu-pin" class="form-control" maxlength="6" placeholder="Ex: 1234"
                                inputmode="numeric" pattern="[0-9]*">
                        </div>
                        <div id="mu-ativo-grupo" style="display:flex;align-items:center;gap:.5rem;">
                            <input type="checkbox" id="mu-ativo" checked style="width:16px;height:16px;">
                            <label for="mu-ativo" style="margin:0;cursor:pointer;">Usuário ativo</label>
                        </div>
                        <div id="mu-erro" style="display:none;background:rgba(239,68,68,.1);color:#ef4444;
                            padding:.6rem .85rem;border-radius:6px;font-size:.82rem;"></div>
                        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem;">
                            <button class="btn btn-secondary" onclick="WmsUsuarios.fecharModal()">Cancelar</button>
                            <button class="btn btn-primary" id="mu-btn-salvar" onclick="WmsUsuarios.salvar()">
                                <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await _carregarTabela(tenantId);
    }

    // ─── TABELA DE USUÁRIOS ──────────────────────────────────────────────────
    async function _carregarTabela(tenantId) {
        const div = document.getElementById('wms-usuarios-tabela');
        if (!div) return;

        try {
            const usuarios = await ParreiraAuth.listarUsuarios(tenantId);
            const roleLabel = { operator: 'Operador', supervisor: 'Supervisor', admin: 'Administrador', master: 'Master' };
            const roleBadge = { operator: '#0ea5e9', supervisor: '#f59e0b', admin: '#10b981', master: '#a855f7' };

            if (usuarios.length === 0) {
                div.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-secondary);">
                    <span class="material-icons-round" style="font-size:2.5rem;opacity:.3;">group</span>
                    <p>Nenhum usuário cadastrado ainda.</p>
                </div>`;
                return;
            }

            div.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>E-mail</th>
                            <th>Perfil</th>
                            <th>PIN Coletor</th>
                            <th>Status</th>
                            <th style="text-align:right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${usuarios.map(u => `
                        <tr>
                            <td><strong>${u.nome}</strong></td>
                            <td style="font-size:.82rem;">${u.email}</td>
                            <td>
                                <span style="background:${roleBadge[u.role] || '#888'}22;color:${roleBadge[u.role] || '#888'};
                                    padding:.2rem .55rem;border-radius:4px;font-size:.75rem;font-weight:600;">
                                    ${roleLabel[u.role] || u.role}
                                </span>
                            </td>
                            <td style="font-family:monospace;font-size:.82rem;">${u.pin ? '••••' : '—'}</td>
                            <td>
                                <span style="font-size:.75rem;font-weight:600;color:${u.ativo ? '#10b981' : '#ef4444'};">
                                    ${u.ativo ? '● Ativo' : '● Inativo'}
                                </span>
                            </td>
                            <td style="text-align:right;">
                                <button class="btn btn-sm btn-secondary" onclick="WmsUsuarios.abrirModalEditar(${JSON.stringify(JSON.stringify(u))})"
                                    style="padding:.25rem .5rem;font-size:.75rem;">
                                    <span class="material-icons-round" style="font-size:.85rem;">edit</span>
                                </button>
                                ${u.ativo ? `<button class="btn btn-sm" onclick="WmsUsuarios.desativar('${u.uid}')"
                                    style="padding:.25rem .5rem;font-size:.75rem;background:rgba(239,68,68,.1);color:#ef4444;margin-left:.3rem;">
                                    <span class="material-icons-round" style="font-size:.85rem;">block</span>
                                </button>` : `<button class="btn btn-sm" onclick="WmsUsuarios.reativar('${u.uid}')"
                                    style="padding:.25rem .5rem;font-size:.75rem;background:rgba(16,185,129,.1);color:#10b981;margin-left:.3rem;">
                                    <span class="material-icons-round" style="font-size:.85rem;">check_circle</span>
                                </button>`}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            div.innerHTML = `<p style="color:#ef4444;">Erro ao carregar: ${e.message}</p>`;
        }
    }

    // ─── MODAL NOVO ──────────────────────────────────────────────────────────
    function abrirModalNovo() {
        document.getElementById('modal-usuario-titulo').textContent = 'Novo Usuário';
        document.getElementById('mu-uid').value = '';
        document.getElementById('mu-nome').value = '';
        document.getElementById('mu-email').value = '';
        document.getElementById('mu-senha').value = '';
        document.getElementById('mu-role').value = 'operator';
        document.getElementById('mu-pin').value = '';
        document.getElementById('mu-ativo').checked = true;
        document.getElementById('mu-senha-grupo').style.display = 'block';
        document.getElementById('mu-ativo-grupo').style.display = 'none';
        document.getElementById('mu-erro').style.display = 'none';
        document.getElementById('modal-usuario').style.display = 'flex';
    }

    // ─── MODAL EDITAR ────────────────────────────────────────────────────────
    function abrirModalEditar(jsonStr) {
        const u = JSON.parse(jsonStr);
        document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuário';
        document.getElementById('mu-uid').value = u.uid;
        document.getElementById('mu-nome').value = u.nome;
        document.getElementById('mu-email').value = u.email;
        document.getElementById('mu-role').value = u.role;
        document.getElementById('mu-pin').value = u.pin || '';
        document.getElementById('mu-ativo').checked = u.ativo;
        document.getElementById('mu-senha-grupo').style.display = 'none'; // Sem alterar senha
        document.getElementById('mu-ativo-grupo').style.display = 'flex';
        document.getElementById('mu-erro').style.display = 'none';
        document.getElementById('modal-usuario').style.display = 'flex';
    }

    function fecharModal() {
        document.getElementById('modal-usuario').style.display = 'none';
    }

    // ─── SALVAR ──────────────────────────────────────────────────────────────
    async function salvar() {
        const uid   = document.getElementById('mu-uid').value;
        const nome  = document.getElementById('mu-nome').value.trim();
        const email = document.getElementById('mu-email').value.trim();
        const senha = document.getElementById('mu-senha').value;
        const role  = document.getElementById('mu-role').value;
        const pin   = document.getElementById('mu-pin').value.trim();
        const ativo = document.getElementById('mu-ativo').checked;

        const erroEl = document.getElementById('mu-erro');
        const btn    = document.getElementById('mu-btn-salvar');

        const showErro = (msg) => { erroEl.textContent = msg; erroEl.style.display = 'block'; };

        if (!nome) return showErro('Informe o nome completo.');
        if (!email) return showErro('Informe o e-mail.');
        if (!uid && !senha) return showErro('Informe uma senha para o novo usuário.');
        if (!uid && senha.length < 6) return showErro('A senha deve ter ao menos 6 caracteres.');

        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;animation:spin 1s linear infinite;">sync</span> Salvando...';
        erroEl.style.display = 'none';

        try {
            const sessao   = ParreiraAuth.getSessao();
            const tenantId = sessao.tenantId;

            if (!uid) {
                // CRIAR
                await ParreiraAuth.criarUsuario(tenantId, { nome, email, senha, role, pin });
            } else {
                // ATUALIZAR
                await ParreiraAuth.atualizarUsuario(tenantId, uid, { nome, role, pin, ativo });
            }

            fecharModal();
            await _carregarTabela(tenantId);
        } catch (e) {
            showErro(e.message || 'Erro ao salvar usuário.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">save</span> Salvar';
        }
    }

    // ─── DESATIVAR / REATIVAR ────────────────────────────────────────────────
    async function desativar(uid) {
        if (!confirm('Desativar este usuário? Ele não conseguirá mais fazer login.')) return;
        const tenantId = ParreiraAuth.getTenantId();
        await ParreiraAuth.atualizarUsuario(tenantId, uid, { ativo: false });
        await _carregarTabela(tenantId);
    }

    async function reativar(uid) {
        const tenantId = ParreiraAuth.getTenantId();
        await ParreiraAuth.atualizarUsuario(tenantId, uid, { ativo: true });
        await _carregarTabela(tenantId);
    }

    return { renderView, abrirModalNovo, abrirModalEditar, fecharModal, salvar, desativar, reativar };
})();

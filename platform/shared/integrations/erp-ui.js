/**
 * erp-ui.js — Interface de Configuração ERP (Multi-módulo)
 * =========================================================
 * Renderiza e gerencia a seção de configuração de ERP em qualquer módulo
 * (Dispatch, WMS). Os dados são salvos no Firestore via ErpRegistry.
 *
 * Uso:
 *   ErpUI.init('dispatch');   ← no módulo Dispatch
 *   ErpUI.init('wms');        ← no módulo WMS
 *
 * O módulo é responsável por incluir o container HTML:
 *   <div id="erp-config-container"></div>
 *
 * Versão: 2.0.0
 * Atualizado: 2026-08-28
 * Parte de: platform/shared/integrations/
 */

const ErpUI = {

    _moduleContext: '',   // 'dispatch' | 'wms' | etc.
    _tenantId: '',
    _operatorName: '',
    _connected: false,

    /**
     * Inicializa a UI de configuração ERP.
     * @param {string} moduleContext - Nome do módulo que está exibindo a UI
     */
    init(moduleContext) {
        this._moduleContext = moduleContext || 'unknown';
        this._connected = false;

        // Lê tenant e operador — múltiplos fallbacks para garantir robustez
        try {
            if (window.ParreiraAuth && ParreiraAuth.isLogado()) {
                const s = ParreiraAuth.getSessao();
                this._tenantId     = s.tenant || s.tenantId || s.empresa || '';
                this._operatorName = s.nome || s.name || 'Sistema';
            }
        } catch (e) { /* ignora */ }

        // Fallbacks adicionais se ParreiraAuth não retornou tenant
        if (!this._tenantId) {
            try {
                if (typeof Utils !== 'undefined') {
                    this._tenantId = Utils.Cloud?.tenantId
                        || (Utils.getTenant && Utils.getTenant())
                        || '';
                }
            } catch (e) { /* ignora */ }
        }

        // Último fallback: sessão no localStorage
        if (!this._tenantId) {
            try {
                const raw = localStorage.getItem('_parreiraSessao')
                    || localStorage.getItem('parreiraSession')
                    || localStorage.getItem('session');
                if (raw) {
                    const sess = JSON.parse(raw);
                    this._tenantId = sess.tenant || sess.tenantId || sess.empresa || '';
                    if (!this._operatorName) this._operatorName = sess.nome || sess.name || 'Sistema';
                }
            } catch (e) { /* ignora */ }
        }

        this._renderContainer();
        this._bindEvents();
        this._loadCurrentConfig();
        this._listenForLogs();

        console.log(`[ErpUI v2.0] Módulo '${moduleContext}' | tenant '${this._tenantId}'`);
    },

    // ─────────────────────────────────────────────
    //  HTML DA SEÇÃO DE CONFIGURAÇÃO
    // ─────────────────────────────────────────────

    _renderContainer() {
        const container = document.getElementById('erp-config-container');
        if (!container) {
            console.warn('[ErpUI] Container #erp-config-container não encontrado.');
            return;
        }

        const providers = typeof ErpRegistry !== 'undefined'
            ? ErpRegistry.getProviders().map(p =>
                `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
              ).join('')
            : '<option value="acontec">Acontec</option>';

        container.innerHTML = `
        <div class="erp-config-section" style="display:flex; flex-direction:column; gap:1.5rem;">

            <!-- Header -->
            <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color, #e5e7eb);">
                <span style="font-size:1.75rem;">🔌</span>
                <div>
                    <h3 style="margin:0; font-size:1.1rem; font-weight:600;">Integração com ERP</h3>
                    <p style="margin:0; font-size:0.8rem; color:var(--text-secondary, #6b7280);">
                        Configure a conexão com o ERP da empresa. As configurações ficam salvas na nuvem e valem para todos os módulos.
                    </p>
                </div>
                <div id="erp-status-badge" style="margin-left:auto; padding:0.3rem 0.75rem; border-radius:999px; font-size:0.78rem; font-weight:600; background:#fef3c7; color:#92400e; white-space:nowrap;">
                    ⚙️ Verificando...
                </div>
            </div>

            <!-- Formulário -->
            <form id="formErpConfig" style="display:grid; gap:1.25rem;" autocomplete="off">

                <!-- Provedor -->
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        Provedor ERP
                    </label>
                    <select id="erpProvider" autocomplete="off" style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; background:var(--bg-secondary,#f9fafb);">
                        <option value="">-- Selecione o ERP --</option>
                        ${providers}
                    </select>
                </div>

                <!-- URL da API -->
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        URL da API
                    </label>
                    <input type="url" id="erpApiUrl" autocomplete="off"
                        placeholder="http://rds.skytins.com.br:8720/v2"
                        style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; font-family:monospace; box-sizing:border-box;">
                    <small style="color:var(--text-secondary,#6b7280);">URL base sem barra no final. Fornecida pelo ERP.</small>
                </div>

                <!-- MaxData Específicos: empId e terminal -->
                <div id="erpMaxdataFields" style="display:none; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                            Empresa / Filial no MaxData (empId) *
                        </label>
                        <input type="number" id="erpEmpId" autocomplete="off" name="erp-emp-id" placeholder="Ex: 1 (Matriz), 2 (Varejo), 4 (Porto)" value="1"
                            style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
                        <small style="color:var(--text-secondary,#6b7280);">1: Matriz Palmas Atacado | 2: Palmas Varejo | 4: Porto Varejo | 5: Redenção</small>
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                            Código do Terminal MaxData *
                        </label>
                        <input type="text" id="erpTerminal" autocomplete="off" name="erp-terminal-code" placeholder="364F64E6539974C1D75C8A46C14B2D3D"
                            style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; font-family:monospace; box-sizing:border-box;">
                        <small style="color:var(--text-secondary,#6b7280);">Terminal cadastrado no MaxData Manager</small>
                    </div>
                </div>

                <!-- Token — oculto para Maxdata (JWT automático via terminal) -->
                <div id="erpTokenSection">
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        Token de Autenticação
                        <span style="font-weight:400; color:var(--text-secondary,#6b7280); font-size:0.78rem;">
                            — válido apenas para esta sessão (segurança)
                        </span>
                    </label>
                    <input type="password" id="erpApiToken"
                        placeholder="Cole o token fornecido pelo ERP aqui"
                        style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; font-family:monospace; box-sizing:border-box;">
                    <small style="color:var(--text-secondary,#6b7280);">
                        ⚠️ O token não é salvo na nuvem. Será pedido novamente ao abrir o sistema em outro dispositivo ou após fechar o navegador.
                    </small>
                    <div id="erp-token-status" style="margin-top:0.4rem; font-size:0.8rem;"></div>
                </div>

                <!-- Autenticação automática (Maxdata) -->
                <div id="erpMaxdataAuthInfo" style="display:none; padding:0.75rem; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:8px;">
                    <span style="color:#059669; font-size:0.85rem; font-weight:500;">🔑 Autenticação automática via Terminal JWT</span><br>
                    <small style="color:var(--text-secondary,#6b7280);">O Maxdata usa o terminal para gerar o token JWT automaticamente a cada sessão. Não é necessário informar token manualmente.</small>
                    <div id="erp-token-status" style="margin-top:0.4rem; font-size:0.8rem;"></div>
                </div>

                <!-- Sincronização automática -->
                <div style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem; background:var(--bg-secondary,#f9fafb); border-radius:8px;">
                    <input type="checkbox" id="erpAutoSync" style="width:1.1rem; height:1.1rem; cursor:pointer;">
                    <label for="erpAutoSync" style="font-size:0.9rem; cursor:pointer;">
                        Ativar sincronização automática de clientes
                    </label>
                </div>

                <!-- Intervalo -->
                <div id="erpSyncIntervalGroup" style="display:none;">
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        Intervalo entre sincronizações (minutos)
                    </label>
                    <input type="number" id="erpSyncInterval" value="30" min="5" max="1440"
                        style="width:160px; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem;">
                </div>

                <!-- Botões de ação -->
                <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                    <button type="button" id="btnTestErpConnection" class="btn btn-secondary" style="display:flex; align-items:center; gap:0.5rem;">
                        🔗 Testar Conexão
                    </button>
                    <button type="submit" id="btnSaveErpConfig" class="btn btn-primary">
                        💾 Salvar Configuração
                    </button>
                </div>

                <!-- Última sincronização -->
                <div id="erp-last-sync-info" style="font-size:0.8rem; color:var(--text-secondary,#6b7280);"></div>
            </form>

            <!-- Ações de sincronização -->
            <div style="padding:1rem; background:var(--bg-secondary,#f9fafb); border-radius:12px; display:flex; flex-direction:column; gap:1rem;">
                <h4 style="margin:0; font-size:0.9rem; font-weight:600;">Sincronização Manual</h4>
                    <!-- Botões contextuais por módulo, gerados por _getSyncButtons() -->
                    ${this._getSyncButtonsHTML()}
                </div>
                <!-- Barra de progresso -->
                <div id="erp-sync-progress" style="display:none;">
                    <div style="background:#e5e7eb; border-radius:999px; height:6px; overflow:hidden;">
                        <div id="erp-progress-bar" style="height:100%; width:0%; background:var(--primary-color,#3b82f6); transition:width 0.3s ease; border-radius:999px;"></div>
                    </div>
                    <p id="erp-progress-text" style="font-size:0.8rem; margin:0.4rem 0 0; color:var(--text-secondary,#6b7280);">Sincronizando...</p>
                </div>
            </div>

            <!-- Log de eventos -->
            <div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
                    <h4 style="margin:0; font-size:0.9rem; font-weight:600;">📋 Log de Atividades</h4>
                    <button id="btnClearErpLogs" class="btn btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.75rem;">
                        Limpar
                    </button>
                </div>
                <div id="erp-logs-list" style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:0.4rem; font-size:0.8rem;">
                    <p style="color:var(--text-secondary,#6b7280); text-align:center; padding:1rem;">Nenhum log registrado ainda.</p>
                </div>
            </div>

        </div>`;
    },

    // ─────────────────────────────────────────────
    //  TOGGLE CAMPOS POR PROVEDOR
    // ─────────────────────────────────────────────

    _applyProviderUI(provider) {
        const $ = id => document.getElementById(id);
        const isMaxdata = provider === 'maxdata';

        // Campos específicos do Maxdata (empId + terminal)
        if ($('erpMaxdataFields')) {
            $('erpMaxdataFields').style.display = isMaxdata ? 'grid' : 'none';
        }
        // Token manual: oculto para Maxdata
        if ($('erpTokenSection')) {
            $('erpTokenSection').style.display = isMaxdata ? 'none' : 'block';
        }
        // Info de auth automática: visível para Maxdata
        if ($('erpMaxdataAuthInfo')) {
            $('erpMaxdataAuthInfo').style.display = isMaxdata ? 'block' : 'none';
        }
    },

    // ─────────────────────────────────────────────
    //  EVENTOS
    // ─────────────────────────────────────────────

    _bindEvents() {
        const $ = id => document.getElementById(id);

        // Toggle campos específicos por provedor
        const providerSelect = $('erpProvider');
        if (providerSelect) {
            providerSelect.addEventListener('change', () => {
                this._applyProviderUI(providerSelect.value);
            });
        }

        // Toggle intervalo de sync
        const autoSync = $('erpAutoSync');
        if (autoSync) {
            autoSync.addEventListener('change', () => {
                const grp = $('erpSyncIntervalGroup');
                if (grp) grp.style.display = autoSync.checked ? 'block' : 'none';
            });
        }

        // Salvar configuração
        const form = $('formErpConfig');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this._saveConfig();
            });
        }

        // Testar conexão
        const btnTest = $('btnTestErpConnection');
        if (btnTest) {
            btnTest.addEventListener('click', async () => await this._testConnection());
        }

        // Sincronizações manuais (contextuais por módulo)
        const btnClients = $('btnSyncErpClients');
        if (btnClients) btnClients.addEventListener('click', async () => await this._runSync('clients'));

        const btnNFs = $('btnSyncErpNFs');
        if (btnNFs) btnNFs.addEventListener('click', async () => await this._runSync('nfs'));

        const btnProducts = $('btnSyncErpProducts');
        if (btnProducts) btnProducts.addEventListener('click', async () => await this._runSync('products'));

        const btnOrders = $('btnSyncErpOrders');
        if (btnOrders) btnOrders.addEventListener('click', async () => await this._runSync('orders'));

        // Limpar logs
        const btnClearLogs = $('btnClearErpLogs');
        if (btnClearLogs) btnClearLogs.addEventListener('click', () => this._clearLogs());
    },

    // ─────────────────────────────────────────────
    //  LÓGICA DE CONFIGURAÇÃO
    // ─────────────────────────────────────────────

    async _loadCurrentConfig() {
        const $ = id => document.getElementById(id);

        try {
            if (!this._tenantId || typeof ErpRegistry === 'undefined') {
                this._updateStatusBadge(false, false);
                return;
            }

            const config = await ErpRegistry.getConfig(this._tenantId);
            if (!config || !config.provider) {
                this._updateStatusBadge(false, false);
                return;
            }

            // Preenche os campos do formulário
            if ($('erpProvider') && config.provider) {
                $('erpProvider').value = config.provider;
                this._applyProviderUI(config.provider);
            }

            // URL: compatível com baseUrl (Maxdata) e apiUrl (outros)
            const urlVal = config.apiUrl || config.baseUrl || '';
            if ($('erpApiUrl') && urlVal) $('erpApiUrl').value = urlVal;

            if ($('erpEmpId')    && config.empId)    $('erpEmpId').value    = config.empId;
            if ($('erpTerminal') && config.terminal) $('erpTerminal').value = config.terminal;
            if ($('erpAutoSync') && config.autoSync) $('erpAutoSync').checked = config.autoSync;
            if ($('erpSyncInterval') && config.syncInterval) $('erpSyncInterval').value = config.syncInterval;
            if (config.autoSync && $('erpSyncIntervalGroup')) $('erpSyncIntervalGroup').style.display = 'block';

            // Última sincronização
            if (config.lastSync && $('erp-last-sync-info')) {
                const dt = new Date(config.lastSync);
                $('erp-last-sync-info').textContent = `Última sincronização: ${dt.toLocaleString('pt-BR')}`;
            }

            // Para Maxdata: badge mostra configurado, usuário testa manualmente
            if (config.provider === 'maxdata' && config.terminal && config.enabled) {
                this._updateStatusBadge(true, false);
                this._addLog('info', '🔌 Configuração carregada. Clique em "Testar Conexão" para verificar.');
            } else {
                const hasToken = ErpRegistry.hasToken(this._tenantId);
                this._updateStatusBadge(config.enabled, hasToken);
            }

        } catch (e) {
            console.error('[ErpUI] Erro ao carregar config:', e);
            this._updateStatusBadge(false, false);
        }
    },

    async _saveConfig() {
        const $ = id => document.getElementById(id);
        const btn = $('btnSaveErpConfig');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

        try {
            const provider  = ($('erpProvider')?.value || '').toLowerCase();
            const urlVal    = $('erpApiUrl')?.value?.trim() || '';
            const terminal  = $('erpTerminal')?.value?.trim() || '';

            if (!provider) {
                alert('Selecione o Provedor ERP.');
                return;
            }

            // Para Maxdata: URL ou terminal são suficientes
            // Para outros provedores: URL é obrigatória
            if (provider !== 'maxdata' && !urlVal) {
                alert('Informe a URL da API.');
                return;
            }

            if (provider === 'maxdata' && !terminal) {
                alert('Informe o Código do Terminal MaxData.');
                return;
            }

            const config = {
                provider,
                apiUrl:       urlVal,       // compatibilidade com adapters antigos
                baseUrl:      urlVal,       // compatibilidade com MaxDataAdapter
                empId:        parseInt($('erpEmpId')?.value || '1'),
                terminal,
                apiToken:     $('erpApiToken')?.value?.trim() || '', // tratado no Registry
                enabled:      true,
                autoSync:     $('erpAutoSync')?.checked || false,
                syncInterval: parseInt($('erpSyncInterval')?.value || '30')
            };

            await ErpRegistry.saveConfig(this._tenantId, config, this._operatorName);

            this._addLog('success', '✅ Configuração salva! Clique em "Testar Conexão" para verificar.');
            this._updateStatusBadge(true, false);

            if ($('erpApiToken')) $('erpApiToken').value = '';

        } catch (e) {
            this._addLog('error', `❌ Erro ao salvar: ${e.message}`);
            alert(`Erro ao salvar configuração: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Configuração'; }
        }
    },

    /**
     * Testa a conexão com o ERP.
     * @param {boolean} silent - Se true, não exibe alert em caso de falha (útil para auto-teste)
     */
    async _testConnection(silent = false) {
        const btn = document.getElementById('btnTestErpConnection');
        // Em modo silent (auto-teste), NÃO desabilita o botão para não travar a UI
        if (!silent && btn) { btn.disabled = true; btn.textContent = '⏳ Testando...'; }

        try {
            // Timeout de segurança: garante que a função sempre termina em até 12s
            const withTimeout = (promise, ms, msg) => Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
            ]);

            const erp = await withTimeout(
                ErpRegistry.getAdapter(this._tenantId),
                8000,
                'Timeout ao buscar configuração ERP. Verifique sua conexão com o Firestore.'
            );

            if (!erp) throw new Error('ERP não configurado. Salve as configurações primeiro e recarregue a página.');

            await withTimeout(
                erp.testConnection(),
                12000,
                'Timeout: API não respondeu em 12s. Verifique se a URL está acessível e se o terminal está ativo.'
            );

            this._connected = true;

            this._addLog('success', '✅ Conexão com a API estabelecida com sucesso!');

            // Atualiza badge para ✅ Conectado
            this._setConnectedBadge();

        } catch (e) {
            this._connected = false;
            this._addLog('error', `❌ Falha na conexão: ${e.message}`);
            this._updateStatusBadge(true, false);
            if (!silent) alert(`Falha ao conectar: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔗 Testar Conexão'; }
        }
    },

    async _runSync(type) {
        const buttons = {
            clients:  document.getElementById('btnSyncErpClients'),
            nfs:      document.getElementById('btnSyncErpNFs'),
            products: document.getElementById('btnSyncErpProducts'),
            orders:   document.getElementById('btnSyncErpOrders')
        };
        const labels  = { clients: 'Clientes', nfs: 'NFs para Cotação', products: 'Produtos', orders: 'Pedidos' };
        const icons   = { clients: '👥', nfs: '📊', products: '📦', orders: '🧧' };
        const btn = buttons[type];

        if (btn) { btn.disabled = true; btn.textContent = `⏳ Sincronizando ${labels[type]}...`; }
        this._showProgress(true);

        try {
            const erp = await ErpRegistry.getAdapter(this._tenantId);
            if (!erp) throw new Error('ERP não configurado. Configure e salve antes de sincronizar.');

            let result;
            if (type === 'clients')  result = await erp.syncClients();
            if (type === 'nfs')      result = await erp.syncNFs({ status: 'pendente' });
            if (type === 'products') result = await erp.syncProducts();
            if (type === 'orders')   result = await erp.syncOrders();

            const summary = result
                ? `${result.added || 0} novos, ${result.updated || 0} atualizados, ${result.errors || 0} erros`
                : 'concluído';
            this._addLog('success', `✅ ${labels[type]} sincronizado(s) — ${summary}`, result);
            this._setConnectedBadge();

            // Atualiza último sync
            const lastSyncEl = document.getElementById('erp-last-sync-info');
            if (lastSyncEl) lastSyncEl.textContent = `Última sincronização: ${new Date().toLocaleString('pt-BR')}`;

        } catch (e) {
            this._addLog('error', `❌ Falha ao sincronizar ${labels[type]}: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = `${icons[type]} ${type === 'nfs' ? 'Importar NFs para Cotação' : 'Sincronizar ' + labels[type]}`; }
            this._showProgress(false);
        }
    },

    /**
     * Retorna o HTML dos botões de sincronização de acordo com o módulo.
     * Dispatch: Clientes + NFs para Cotação
     * WMS e demais: Clientes + Produtos + Pedidos
     */
    _getSyncButtonsHTML() {
        if (this._moduleContext === 'dispatch') {
            return `
                <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                    <button id="btnSyncErpClients" class="btn btn-primary" style="display:flex; align-items:center; gap:0.5rem;">
                        👥 Sincronizar Clientes
                    </button>
                    <button id="btnSyncErpNFs" class="btn btn-secondary" style="display:flex; align-items:center; gap:0.5rem;">
                        📊 Importar NFs para Cotação
                    </button>
                </div>`;
        }

        return `
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button id="btnSyncErpClients" class="btn btn-primary" style="display:flex; align-items:center; gap:0.5rem;">
                    👥 Sincronizar Clientes
                </button>
                <button id="btnSyncErpProducts" class="btn btn-secondary" style="display:flex; align-items:center; gap:0.5rem;">
                    📦 Sincronizar Produtos
                </button>
                <button id="btnSyncErpOrders" class="btn btn-secondary" style="display:flex; align-items:center; gap:0.5rem;">
                    🧧 Sincronizar Pedidos
                </button>
            </div>`;
    },

    // ─────────────────────────────────────────────
    //  HELPERS DE UI
    // ─────────────────────────────────────────────

    _setConnectedBadge() {
        const badge = document.getElementById('erp-status-badge');
        if (badge) {
            badge.style.background = '#d1fae5';
            badge.style.color      = '#065f46';
            badge.textContent      = '✅ Conectado';
        }
        // Atualiza status do token (para Maxdata: auth automática ativa)
        const tokenStatus = document.getElementById('erp-token-status');
        if (tokenStatus) {
            tokenStatus.innerHTML = '<span style="color:#059669;">🔒 Autenticação ativa nesta sessão</span>';
        }
    },

    _updateStatusBadge(enabled, hasToken) {
        const badge = document.getElementById('erp-status-badge');
        if (!badge) return;
        if (this._connected) {
            badge.style.background = '#d1fae5'; badge.style.color = '#065f46';
            badge.textContent = '✅ Conectado';
        } else if (enabled && hasToken) {
            badge.style.background = '#d1fae5'; badge.style.color = '#065f46';
            badge.textContent = '✅ Conectado';
        } else if (enabled) {
            badge.style.background = '#fef3c7'; badge.style.color = '#92400e';
            badge.textContent = '⚙️ Configurado';
        } else {
            badge.style.background = '#f3f4f6'; badge.style.color = '#6b7280';
            badge.textContent = '⚙️ Não configurado';
        }
    },

    _showProgress(show) {
        const el = document.getElementById('erp-sync-progress');
        if (el) el.style.display = show ? 'block' : 'none';
        if (show) {
            const bar = document.getElementById('erp-progress-bar');
            if (bar) { bar.style.width = '0%'; setTimeout(() => bar.style.width = '70%', 100); }
        }
    },

    _listenForLogs() {
        window.addEventListener('erp:log', (e) => {
            const { type, message, details } = e.detail;
            this._addLog(type, message, details);
            // Se for sucesso de autenticação, atualiza badge
            if (type === 'success' && message && message.includes('Token JWT')) {
                this._setConnectedBadge();
            }
        });
    },

    _addLog(type, message, details = null) {
        const container = document.getElementById('erp-logs-list');
        if (!container) return;

        const placeholder = container.querySelector('p');
        if (placeholder) placeholder.remove();

        const icons = { success: '🟢', error: '🔴', warning: '🟠', info: '🔵' };
        const now = new Date().toLocaleTimeString('pt-BR');
        const detailText = details && typeof details === 'object'
            ? ` (${JSON.stringify(details).substring(0, 80)}${JSON.stringify(details).length > 80 ? '...' : ''})`
            : (details ? ` — ${details}` : '');

        const entry = document.createElement('div');
        entry.style.cssText = 'padding:0.5rem 0.75rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px; display:flex; gap:0.6rem; align-items:center; color:#f8fafc; font-size:0.85rem;';
        entry.innerHTML = `
            <span style="font-size:0.95rem;">${icons[type] || '⚪'}</span>
            <span style="color:#94a3b8; font-family:monospace; font-size:0.8rem; white-space:nowrap;">${now}</span>
            <span style="flex:1; word-break:break-word; color:#f1f5f9; font-weight:500;">${message}${detailText}</span>`;

        container.insertBefore(entry, container.firstChild);

        while (container.children.length > 50) container.lastChild.remove();
    },

    _clearLogs() {
        const container = document.getElementById('erp-logs-list');
        if (container) container.innerHTML = '<p style="color:var(--text-secondary,#6b7280); text-align:center; padding:1rem;">Nenhum log registrado ainda.</p>';
    }
};

if (typeof window !== 'undefined') {
    window.ErpUI = ErpUI;
}

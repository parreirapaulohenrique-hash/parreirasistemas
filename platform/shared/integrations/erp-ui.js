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
 * Versão: 1.0.0
 * Criado: 2026-07-07
 * Parte de: platform/shared/integrations/
 */

const ErpUI = {

    _moduleContext: '',   // 'dispatch' | 'wms' | etc.
    _tenantId: '',
    _operatorName: '',

    /**
     * Inicializa a UI de configuração ERP.
     * @param {string} moduleContext - Nome do módulo que está exibindo a UI
     */
    init(moduleContext) {
        this._moduleContext = moduleContext || 'unknown';

        // Lê tenant e operador da sessão atual
        try {
            if (window.ParreiraAuth && ParreiraAuth.isLogado()) {
                const s = ParreiraAuth.getSessao();
                this._tenantId     = s.tenant   || '';
                this._operatorName = s.nome      || 'Sistema';
            } else if (typeof Utils !== 'undefined' && Utils.getTenant) {
                this._tenantId = Utils.getTenant();
            }
        } catch (e) {
            console.warn('[ErpUI] Não foi possível obter sessão:', e.message);
        }

        this._renderContainer();
        this._bindEvents();
        this._loadCurrentConfig();
        this._listenForLogs();

        console.log(`[ErpUI] Inicializado no módulo '${moduleContext}' para tenant '${this._tenantId}'`);
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
            ? ErpRegistry.getProviders().map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')
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
                <div id="erp-status-badge" style="margin-left:auto; padding:0.3rem 0.75rem; border-radius:999px; font-size:0.78rem; font-weight:600; background:#fef3c7; color:#92400e;">
                    ⚙️ Verificando...
                </div>
            </div>

            <!-- Formulário -->
            <form id="formErpConfig" style="display:grid; gap:1.25rem;">

                <!-- Provedor -->
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        Provedor ERP
                    </label>
                    <select id="erpProvider" style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; background:var(--bg-secondary,#f9fafb);">
                        <option value="">-- Selecione o ERP --</option>
                        ${providers}
                    </select>
                </div>

                <!-- URL da API -->
                <div>
                    <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                        URL da API
                    </label>
                    <input type="url" id="erpApiUrl"
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
                        <input type="number" id="erpEmpId" placeholder="Ex: 1 (Matriz), 2 (Varejo), 4 (Porto)" value="1"
                            style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
                        <small style="color:var(--text-secondary,#6b7280);">1: Matriz Palmas Atacado | 2: Palmas Varejo | 4: Porto Varejo | 5: Redenção</small>
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; font-weight:500; margin-bottom:0.4rem;">
                            Código do Terminal MaxData *
                        </label>
                        <input type="text" id="erpTerminal" placeholder="364F64E6539974C1D75C8A46C14B2D3D" value="364F64E6539974C1D75C8A46C14B2D3D"
                            style="width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; font-size:0.9rem; font-family:monospace; box-sizing:border-box;">
                        <small style="color:var(--text-secondary,#6b7280);">Terminal cadastrado no MaxData Manager</small>
                    </div>
                </div>

                <!-- Token -->
                <div>
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
                    <input type="number" id="erpSyncInterval" value="60" min="5" max="1440"
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
    //  EVENTOS
    // ─────────────────────────────────────────────

    _bindEvents() {
        const $ = id => document.getElementById(id);

        // Toggle campos específicos por provedor
        const providerSelect = $('erpProvider');
        if (providerSelect) {
            providerSelect.addEventListener('change', () => {
                const maxFields = $('erpMaxdataFields');
                if (maxFields) {
                    maxFields.style.display = providerSelect.value === 'maxdata' ? 'grid' : 'none';
                }
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
            if (!this._tenantId || typeof ErpRegistry === 'undefined') return;

            const config = await ErpRegistry.getConfig(this._tenantId);
            if (!config) return;

            if ($('erpProvider') && config.provider) {
                $('erpProvider').value = config.provider;
                if ($('erpMaxdataFields')) {
                    $('erpMaxdataFields').style.display = config.provider === 'maxdata' ? 'grid' : 'none';
                }
            }
            if ($('erpApiUrl')   && config.apiUrl)   $('erpApiUrl').value   = config.apiUrl;
            if ($('erpEmpId')    && config.empId)    $('erpEmpId').value    = config.empId;
            if ($('erpTerminal') && config.terminal) $('erpTerminal').value = config.terminal;
            if ($('erpAutoSync') && config.autoSync)  $('erpAutoSync').checked = config.autoSync;
            if ($('erpSyncInterval') && config.syncInterval) $('erpSyncInterval').value = config.syncInterval;
            if (config.autoSync && $('erpSyncIntervalGroup')) $('erpSyncIntervalGroup').style.display = 'block';

            // Status do token
            const hasToken = ErpRegistry.hasToken(this._tenantId);
            this._updateTokenStatus(hasToken);
            this._updateStatusBadge(config.enabled, hasToken);

            // Última sincronização
            if (config.lastSync && $('erp-last-sync-info')) {
                const dt = new Date(config.lastSync);
                $('erp-last-sync-info').textContent = `Última sincronização: ${dt.toLocaleString('pt-BR')}`;
            }

        } catch (e) {
            console.error('[ErpUI] Erro ao carregar config:', e);
        }
    },

    async _saveConfig() {
        const $ = id => document.getElementById(id);
        const btn = $('btnSaveErpConfig');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

        try {
            const config = {
                provider:     ($('erpProvider')?.value || '').toLowerCase(),
                apiUrl:       $('erpApiUrl')?.value?.trim() || '',
                empId:        parseInt($('erpEmpId')?.value || '1'),
                terminal:     $('erpTerminal')?.value?.trim() || '',
                apiToken:     $('erpApiToken')?.value?.trim() || '', // tratado no Registry
                enabled:      !!$('erpProvider')?.value,
                autoSync:     $('erpAutoSync')?.checked || false,
                syncInterval: parseInt($('erpSyncInterval')?.value || '60')
            };

            if (!config.provider || !config.apiUrl) {
                alert('Selecione o Provedor e informe a URL da API.');
                return;
            }

            await ErpRegistry.saveConfig(this._tenantId, config, this._operatorName);

            this._addLog('success', '✅ Configuração salva no Firestore com sucesso');
            this._updateStatusBadge(true, !!config.apiToken || ErpRegistry.hasToken(this._tenantId));
            this._updateTokenStatus(!!config.apiToken || ErpRegistry.hasToken(this._tenantId));

            if ($('erpApiToken')) $('erpApiToken').value = ''; // Limpa campo por segurança

        } catch (e) {
            this._addLog('error', `❌ Erro ao salvar: ${e.message}`);
            alert(`Erro ao salvar configuração: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Configuração'; }
        }
    },

    async _testConnection() {
        const btn = document.getElementById('btnTestErpConnection');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Testando...'; }

        try {
            const erp = await ErpRegistry.getAdapter(this._tenantId);
            if (!erp) throw new Error('ERP não configurado ou token ausente. Salve as configurações primeiro.');

            const result = await erp.testConnection();
            this._addLog('success', '✅ Conexão com a API estabelecida com sucesso', result.data);

        } catch (e) {
            this._addLog('error', `❌ Falha na conexão: ${e.message}`);
            alert(`Falha ao conectar: ${e.message}`);
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

            this._addLog('success', `✅ ${labels[type]} sincronizado(s) com sucesso`, result);

        } catch (e) {
            this._addLog('error', `❌ Falha ao sincronizar ${labels[type]}: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = `${icons[type]} ${type === 'nfs' ? 'Importar NFs para Cotação' : 'Sincronizar ' + labels[type]}`; }
            this._showProgress(false);
        }
    },

    /**
     * Retorna o HTML dos botões de sincronização de acordo com o módulo.
     * Dispatch: Clientes + NFs para Cotação (sem Produtos)
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

        // WMS, Sales Force e demais módulos
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

    _updateStatusBadge(enabled, hasToken) {
        const badge = document.getElementById('erp-status-badge');
        if (!badge) return;
        if (enabled && hasToken) {
            badge.style.background = '#d1fae5'; badge.style.color = '#065f46';
            badge.textContent = '✅ Conectado';
        } else if (enabled) {
            badge.style.background = '#fef3c7'; badge.style.color = '#92400e';
            badge.textContent = '⚠️ Token ausente';
        } else {
            badge.style.background = '#f3f4f6'; badge.style.color = '#6b7280';
            badge.textContent = '⚙️ Não configurado';
        }
    },

    _updateTokenStatus(hasToken) {
        const el = document.getElementById('erp-token-status');
        if (!el) return;
        el.innerHTML = hasToken
            ? '<span style="color:#059669;">🔒 Token ativo nesta sessão</span>'
            : '<span style="color:#d97706;">⚠️ Token não informado — necessário para sincronizar</span>';
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
        });
    },

    _addLog(type, message, details = null) {
        const container = document.getElementById('erp-logs-list');
        if (!container) return;

        // Remove placeholder
        const placeholder = container.querySelector('p');
        if (placeholder) placeholder.remove();

        const icons = { success: '🟢', error: '🔴', warning: '🟠', info: '🔵' };
        const now = new Date().toLocaleTimeString('pt-BR');
        const detailText = details && typeof details === 'object'
            ? ` (${JSON.stringify(details).substring(0, 80)}...)`
            : (details ? ` — ${details}` : '');

        const entry = document.createElement('div');
        entry.style.cssText = 'padding:0.4rem 0.6rem; background:var(--bg-secondary,#f9fafb); border-radius:6px; display:flex; gap:0.5rem; align-items:flex-start;';
        entry.innerHTML = `
            <span>${icons[type] || '⚪'}</span>
            <span style="color:var(--text-secondary,#6b7280); white-space:nowrap;">${now}</span>
            <span style="flex:1; word-break:break-word;">${message}${detailText}</span>`;

        container.insertBefore(entry, container.firstChild);

        // Mantém máximo de 50 entradas
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

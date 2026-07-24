// =============================================================
// WMS Integration Layer — Multi-ERP Adapter Pattern
// Camada de abstração para integração com ERPs externos.
// O WMS opera de forma autônoma; conectores são opcionais.
// =============================================================

(function () {
    'use strict';

    // ─── CONFIG KEY (tenant-aware) ──────────────────────────
    // Cada tenant tem sua própria configuração de integração:
    // wms_integration_config_<tenantId>
    function _iKey() {
        return 'wms_integration_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
    }
    const SYNC_LOG_KEY = 'wms_sync_log' + (window.getTenantSuffix ? window.getTenantSuffix() : '');

    // ─── ENTIDADES SINCRONIZÁVEIS ────────────────────────────
    const ENTITIES = {
        'products': { label: 'Produtos / SKUs', direction: 'erp→wms', icon: 'inventory_2' },
        'suppliers': { label: 'Fornecedores', direction: 'erp→wms', icon: 'local_shipping' },
        'customers': { label: 'Clientes', direction: 'erp→wms', icon: 'people' },
        'purchase-orders': { label: 'Pedidos de Compra / NFs', direction: 'erp→wms', icon: 'receipt' },
        'sales-orders': { label: 'Pedidos de Venda', direction: 'erp→wms', icon: 'shopping_cart' },
        'stock-levels': { label: 'Saldo de Estoque', direction: 'wms→erp', icon: 'analytics' },
        'shipments': { label: 'Embarques / Expedições', direction: 'wms→erp', icon: 'local_shipping' },
        'receipts': { label: 'Recebimentos Conferidos', direction: 'wms→erp', icon: 'move_to_inbox' },
    };

    // ─── CONNECTOR REGISTRY ──────────────────────────────────
    const connectors = {};

    function registerConnector(id, connector) {
        connectors[id] = connector;
    }

    // ─── 1. STANDALONE (sem ERP) ─────────────────────────────
    registerConnector('standalone', {
        id: 'standalone',
        name: 'Standalone (sem ERP)',
        description: 'WMS opera de forma independente. Dados ficam apenas no WMS.',
        icon: 'storage',
        configFields: [],
        async init() { return { status: 'ok', message: 'WMS operando de forma independente.' }; },
        async sync() { return { status: 'skip', message: 'Sem ERP conectado.' }; },
        async push() { return { status: 'skip', message: 'Sem ERP conectado.' }; },
        async testConnection() { return { status: 'ok', message: 'Nenhuma conexão necessária.' }; },
    });

    // ─── 2. PARREIRA ERP (nativo) ────────────────────────────
    registerConnector('parreira-erp', {
        id: 'parreira-erp',
        name: 'Parreira ERP',
        description: 'Integração nativa bidirecional via Custom Events e localStorage compartilhado.',
        icon: 'sync',
        configFields: [],
        async init() {
            // Escuta eventos do ERP Parreira
            window.addEventListener('erp-estoque-atualizado', (e) => {
                _addSyncLog('products', 'pull', 'ok', 'Auto-sync via Custom Event');
            });
            return { status: 'ok', message: 'Integração Parreira ERP ativa.' };
        },
        async sync(entity) {
            // Parreira ERP usa localStorage compartilhado — leitura direta
            const mapping = {
                'products': 'erp_products',
                'suppliers': 'erp_fornecedores',
                'customers': 'erp_clientes',
                'purchase-orders': 'erp_pedidos_compra',
                'sales-orders': 'erp_pedidos_venda',
            };
            const key = mapping[entity];
            if (!key) return { status: 'skip', message: `Entidade ${entity} não suportada para pull.` };

            const data = JSON.parse(localStorage.getItem(key) || '[]');
            _addSyncLog(entity, 'pull', 'ok', `${data.length} registros importados`);
            return { status: 'ok', data, message: `${data.length} registros.` };
        },
        async push(entity, payload) {
            // Dispara Custom Event para o ERP escutar
            const event = new CustomEvent('wms-data-push', {
                detail: { entity, payload, timestamp: new Date().toISOString() }
            });
            window.dispatchEvent(event);
            _addSyncLog(entity, 'push', 'ok', `${Array.isArray(payload) ? payload.length : 1} registros enviados via Event`);
            return { status: 'ok', message: 'Dados enviados ao ERP Parreira.' };
        },
        async testConnection() {
            // Verifica se o ERP está carregado (window.erpModule existe)
            const erpLoaded = typeof window.erpModule !== 'undefined' || localStorage.getItem('erp_products' + (window.getTenantSuffix ? window.getTenantSuffix() : ''));
            return {
                status: erpLoaded ? 'ok' : 'warning',
                message: erpLoaded ? 'ERP Parreira detectado.' : 'ERP Parreira não detectado na sessão atual.'
            };
        },
    });

    // ─── 3. REST API (Genérico) ──────────────────────────────
    registerConnector('rest-api', {
        id: 'rest-api',
        name: 'REST API (Genérico)',
        description: 'Integração via API REST. Compatível com qualquer ERP que exponha endpoints HTTP.',
        icon: 'api',
        configFields: [
            { key: 'baseUrl', label: 'URL Base da API', type: 'text', placeholder: 'https://erp.empresa.com/api/v1', required: true },
            { key: 'apiKey', label: 'Chave de API (API Key)', type: 'password', placeholder: 'sk_live_...', required: true },
            { key: 'authHeader', label: 'Header de Autenticação', type: 'text', placeholder: 'Authorization', value: 'X-Api-Key' },
            { key: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '10000', value: '10000' },
        ],
        _getHeaders(config) {
            const headers = { 'Content-Type': 'application/json' };
            const headerName = config.authHeader || 'X-Api-Key';
            headers[headerName] = config.apiKey;
            return headers;
        },
        async init(config) {
            if (!config.baseUrl || !config.apiKey) {
                return { status: 'error', message: 'URL Base e API Key são obrigatórios.' };
            }
            return { status: 'ok', message: `Conectado a ${config.baseUrl}` };
        },
        async sync(entity, config) {
            if (!config.baseUrl) return { status: 'error', message: 'URL Base não configurada.' };
            try {
                const url = `${config.baseUrl.replace(/\/$/, '')}/${entity}`;
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: this._getHeaders(config),
                    signal: AbortSignal.timeout(parseInt(config.timeout) || 10000),
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                const data = await resp.json();
                const records = Array.isArray(data) ? data : (data.data || data.results || [data]);
                _addSyncLog(entity, 'pull', 'ok', `${records.length} registros via REST`);
                return { status: 'ok', data: records, message: `${records.length} registros.` };
            } catch (err) {
                _addSyncLog(entity, 'pull', 'error', err.message);
                return { status: 'error', message: err.message };
            }
        },
        async push(entity, payload, config) {
            if (!config.baseUrl) return { status: 'error', message: 'URL Base não configurada.' };
            try {
                const url = `${config.baseUrl.replace(/\/$/, '')}/${entity}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: this._getHeaders(config),
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(parseInt(config.timeout) || 10000),
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                _addSyncLog(entity, 'push', 'ok', `Enviado via REST POST`);
                return { status: 'ok', message: 'Dados enviados com sucesso.' };
            } catch (err) {
                _addSyncLog(entity, 'push', 'error', err.message);
                return { status: 'error', message: err.message };
            }
        },
        async testConnection(config) {
            if (!config.baseUrl) return { status: 'error', message: 'URL Base não configurada.' };
            try {
                const resp = await fetch(`${config.baseUrl.replace(/\/$/, '')}/health`, {
                    method: 'GET',
                    headers: this._getHeaders(config),
                    signal: AbortSignal.timeout(5000),
                });
                return { status: resp.ok ? 'ok' : 'error', message: resp.ok ? `Conectado (${resp.status})` : `Erro HTTP ${resp.status}` };
            } catch (err) {
                return { status: 'error', message: `Falha: ${err.message}` };
            }
        },
    });

    // ─── 4. WEBHOOK (Notificações Outbound) ──────────────────
    registerConnector('webhook', {
        id: 'webhook',
        name: 'Webhook (Notificações)',
        description: 'Envia notificações HTTP POST para URL externa quando eventos ocorrem no WMS.',
        icon: 'webhook',
        configFields: [
            { key: 'callbackUrl', label: 'URL de Callback', type: 'text', placeholder: 'https://erp.empresa.com/webhook/wms', required: true },
            { key: 'secret', label: 'Secret (HMAC)', type: 'password', placeholder: 'whsec_...', required: false },
            {
                key: 'events', label: 'Eventos Ativos', type: 'checkboxes', options: [
                    'receipt.completed', 'shipment.released', 'stock.adjusted',
                    'order.picked', 'inventory.counted', 'putaway.completed'
                ]
            },
        ],
        async init(config) {
            if (!config.callbackUrl) return { status: 'error', message: 'URL de Callback é obrigatória.' };
            return { status: 'ok', message: `Webhook configurado para ${config.callbackUrl}` };
        },
        async sync() {
            return { status: 'skip', message: 'Webhook é somente saída (push). Use REST API para pull.' };
        },
        async push(entity, payload, config) {
            if (!config.callbackUrl) return { status: 'error', message: 'URL de Callback não configurada.' };
            try {
                const body = {
                    event: `wms.${entity}`,
                    timestamp: new Date().toISOString(),
                    data: payload,
                };
                const headers = { 'Content-Type': 'application/json' };
                if (config.secret) {
                    headers['X-WMS-Signature'] = config.secret; // Simplificado; produção usaria HMAC-SHA256
                }
                const resp = await fetch(config.callbackUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(10000),
                });
                const ok = resp.ok;
                _addSyncLog(entity, 'push', ok ? 'ok' : 'error', ok ? `Webhook entregue (${resp.status})` : `Erro ${resp.status}`);
                return { status: ok ? 'ok' : 'error', message: ok ? 'Webhook enviado.' : `Erro HTTP ${resp.status}` };
            } catch (err) {
                _addSyncLog(entity, 'push', 'error', err.message);
                return { status: 'error', message: err.message };
            }
        },
        async testConnection(config) {
            if (!config.callbackUrl) return { status: 'error', message: 'URL de Callback não configurada.' };
            try {
                const resp = await fetch(config.callbackUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: 'wms.test', timestamp: new Date().toISOString() }),
                    signal: AbortSignal.timeout(5000),
                });
                return { status: resp.ok ? 'ok' : 'error', message: resp.ok ? 'Webhook respondeu OK.' : `Erro ${resp.status}` };
            } catch (err) {
                return { status: 'error', message: `Falha: ${err.message}` };
            }
        },
    });

    // ─── 5. MAXDATA ERP (Nativo JWT) ─────────────────────────
    registerConnector('maxdata', {
        id: 'maxdata',
        name: 'Maxdata ERP',
        description: 'Integração nativa bidirecional com Maxdata via API REST JWT. Recebimento, conferência e estoque.',
        icon: 'integration_instructions',
        configFields: [
            { key: 'baseUrl',   label: 'URL Base da API (Maxdata)',  type: 'text',   placeholder: 'http://rds.skytins.com.br:8720/v2',           required: true  },
            { key: 'empId',     label: 'Empresa / Filial no MaxData (empId)',  type: 'number', placeholder: 'Ex: 1 (Matriz), 2 (Varejo), 4 (Porto), 5 (Redenção)', required: true  },
            { key: 'terminal',  label: 'Terminal (código)',          type: 'text',   placeholder: '364F64E6539974C1D75C8A46C14B2D3D',   required: true  },
        ],

        // ── Token JWT: busca cached ou faz novo POST /auth ────
        async _getToken(config) {
            const cached = config._maxdataToken;
            if (cached?.value && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) {
                return cached.value; // válido por mais de 1 min
            }
            const base = (config.baseUrl || '').replace(/\/$/, '');
            const resp = await fetch(`${base}/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empId: Number(config.empId), terminal: config.terminal }),
                signal: AbortSignal.timeout(10000)
            });
            if (!resp.ok) throw new Error(`Maxdata Auth: HTTP ${resp.status}`);
            const data = await resp.json();
            if (!data.token) throw new Error('Token não retornado pelo Maxdata.');
            // Persiste token no connectorConfig para reutilização
            const saved = JSON.parse(localStorage.getItem(_iKey()) || '{}');
            if (!saved.connectorConfig) saved.connectorConfig = {};
            const tokenCache = { value: data.token, expiresAt: data.expiration };
            saved.connectorConfig._maxdataToken = tokenCache;
            config._maxdataToken = tokenCache;
            localStorage.setItem(_iKey(), JSON.stringify(saved));
            return data.token;
        },

        _hdrs(token) {
            return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        },

        async init(config) {
            if (!config.baseUrl || !config.empId || !config.terminal)
                return { status: 'error', message: 'URL Base, empId e Terminal são obrigatórios.' };
            return { status: 'ok', message: `Maxdata ERP configurado (empId: ${config.empId}).` };
        },

        async sync(entity, config) {
            try {
                const token = await this._getToken(config);
                const base  = config.baseUrl.replace(/\/$/, '');
                const map   = { 'purchase-orders': `${base}/entry`, 'products': `${base}/product` };
                const url   = map[entity];
                if (!url) return { status: 'skip', message: `"${entity}" não suportado no pull Maxdata.` };
                const resp = await fetch(url, { method: 'GET', headers: this._hdrs(token), signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data    = await resp.json();
                const records = Array.isArray(data) ? data : (data.data || data.results || []);
                _addSyncLog(entity, 'erp→wms', 'ok', `${records.length} registros do Maxdata`);
                return { status: 'ok', data: records, message: `${records.length} registros.` };
            } catch (err) {
                _addSyncLog(entity, 'erp→wms', 'error', err.message);
                return { status: 'error', message: err.message };
            }
        },

        async push(entity, payload, config) {
            try {
                const token = await this._getToken(config);
                const base  = config.baseUrl.replace(/\/$/, '');
                const map   = {
                    'receipts':     { url: `${base}/entry/markaschecked`, method: 'PUT'  },
                    'stock-levels': { url: `${base}/adjustmentstock`,     method: 'POST' },
                };
                const ep = map[entity];
                if (!ep) return { status: 'skip', message: `Push de "${entity}" não suportado no Maxdata.` };
                const resp = await fetch(ep.url, {
                    method: ep.method, headers: this._hdrs(token),
                    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                _addSyncLog(entity, 'wms→erp', 'ok', `Maxdata push: ${entity}`);
                return { status: 'ok', message: 'Enviado ao Maxdata.' };
            } catch (err) {
                _addSyncLog(entity, 'wms→erp', 'error', err.message);
                return { status: 'error', message: err.message };
            }
        },

        async testConnection(config) {
            if (!config.baseUrl || !config.empId || !config.terminal)
                return { status: 'error', message: 'Configure URL Base, empId e Terminal.' };
            try {
                await this._getToken(config);
                return { status: 'ok', message: `✅ Autenticação Maxdata OK. Token ativo.` };
            } catch (err) {
                return { status: 'error', message: `Falha: ${err.message}` };
            }
        },
    });

    // ─── SYNC LOG ────────────────────────────────────────────

    function _addSyncLog(entity, direction, status, message) {
        const logs = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]');
        logs.unshift({
            entity,
            direction,
            status,
            message,
            timestamp: new Date().toISOString(),
        });
        // Keep last 50
        if (logs.length > 50) logs.length = 50;
        localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(logs));
    }

    // ─── MAIN SINGLETON ──────────────────────────────────────
    const WmsIntegration = {
        _connectorId: 'standalone',
        _config: {},
        _listeners: [],

        /**
         * Inicializa com config salva. Chamado uma vez no DOMContentLoaded.
         */
        init(savedConfig) {
            this._connectorId = (savedConfig && savedConfig.connectorId) || 'standalone';
            this._config = (savedConfig && savedConfig.connectorConfig) || {};
            const connector = connectors[this._connectorId];
            if (connector && connector.init) {
                connector.init(this._config);
            }
            console.log(`🔗 WMS Integration: ${connector ? connector.name : this._connectorId}`);
        },

        /**
         * Troca o conector ativo e salva em localStorage.
         */
        setConnector(connectorId, config) {
            if (!connectors[connectorId]) {
                console.warn(`Conector "${connectorId}" não encontrado.`);
                return;
            }
            this._connectorId = connectorId;
            this._config = config || {};
            const saved = { connectorId, connectorConfig: this._config, updatedAt: new Date().toISOString() };
            localStorage.setItem(_iKey(), JSON.stringify(saved));
            const connector = connectors[connectorId];
            if (connector.init) connector.init(this._config);
            this._emit('connector-changed', { connectorId, name: connector.name });
        },

        /**
         * Pull de dados do ERP.
         */
        async sync(entity) {
            const connector = connectors[this._connectorId];
            if (!connector) return { status: 'error', message: 'Conector não encontrado.' };
            const result = await connector.sync(entity, this._config);
            this._emit('sync', { entity, result });
            return result;
        },

        /**
         * Push de dados para o ERP.
         */
        async push(entity, payload) {
            const connector = connectors[this._connectorId];
            if (!connector) return { status: 'error', message: 'Conector não encontrado.' };
            const result = await connector.push(entity, payload, this._config);
            this._emit('push', { entity, result });
            return result;
        },

        /**
         * Testa conexão com o ERP.
         */
        async testConnection() {
            const connector = connectors[this._connectorId];
            if (!connector) return { status: 'error', message: 'Conector não encontrado.' };
            return connector.testConnection(this._config);
        },

        /**
         * Retorna status geral.
         */
        getStatus() {
            const connector = connectors[this._connectorId];
            return {
                connectorId: this._connectorId,
                connectorName: connector ? connector.name : 'Desconhecido',
                config: { ...this._config, apiKey: this._config.apiKey ? '••••••' : undefined },
                entities: ENTITIES,
            };
        },

        /**
         * Retorna lista de conectores disponíveis.
         */
        getConnectors() {
            return Object.values(connectors).map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                icon: c.icon,
                configFields: c.configFields || [],
            }));
        },

        /**
         * Retorna entidades sincronizáveis.
         */
        getEntities() {
            return ENTITIES;
        },

        /**
         * Retorna log de sincronização.
         */
        getSyncLog(limit) {
            const logs = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]');
            return limit ? logs.slice(0, limit) : logs;
        },

        /**
         * Registra um listener de eventos.
         */
        onEvent(callback) {
            this._listeners.push(callback);
        },

        /**
         * Remove listener.
         */
        offEvent(callback) {
            this._listeners = this._listeners.filter(l => l !== callback);
        },

        _emit(eventType, data) {
            this._listeners.forEach(fn => {
                try { fn({ type: eventType, ...data }); } catch (e) { console.error('Integration listener error:', e); }
            });
        },

        /**
         * Registra um conector externo (para extensibilidade futura).
         */
        registerConnector(id, connector) {
            registerConnector(id, connector);
        },
    };

    // Expor globalmente
    window.WmsIntegration = WmsIntegration;
    window.WMS_ENTITIES = ENTITIES;

    console.log('🔗 WMS Integration Layer carregada — ' + Object.keys(connectors).length + ' conectores disponíveis');

    // =========================================================
    // FASE 9: LISTENERS GLOBAIS WMS -> ERP via LocalStorage
    // (Operam como mock direto ao ERP na mesma origem)
    // =========================================================
    window.onWmsAjusteEstoque = function (sku, diff, motivo) {
        const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
        if (!estoqueERP[sku]) {
            estoqueERP[sku] = { sku: sku, descricao: '', estoqueAtual: 0, reservado: 0, disponivel: 0, custoMedio: 0 };
        }
        estoqueERP[sku].estoqueAtual += Number(diff);
        estoqueERP[sku].disponivel = estoqueERP[sku].estoqueAtual - (estoqueERP[sku].reservado || 0);

        localStorage.setItem('erp_estoque' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(estoqueERP));
        window.dispatchEvent(new CustomEvent('wms-data-push', { detail: { entity: 'stock-levels', event: 'ajuste', sku, diff } }));
        console.log(`✅ [Integração] Ajuste do WMS replicado no ERP. SKU: ${sku}, Diff: ${diff}`);
    };

    window.onWmsInventarioRealizado = function (inv) {
        const estoqueERP = JSON.parse(localStorage.getItem('erp_estoque' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');

        // Agrupar diff por SKU (pois pode haver o mesmo SKU em vários endereços no mesmo ref_inv)
        const skuDiffs = {};
        (inv.enderecos || []).forEach(e => {
            if (e.contagem !== null && e.saldoSistema !== null) {
                const diff = e.contagem - e.saldoSistema;
                if (diff !== 0) {
                    skuDiffs[e.sku] = (skuDiffs[e.sku] || 0) + diff;
                }
            }
        });

        Object.keys(skuDiffs).forEach(sku => {
            const diff = skuDiffs[sku];
            if (!estoqueERP[sku]) {
                estoqueERP[sku] = { sku: sku, descricao: '', estoqueAtual: 0, reservado: 0, disponivel: 0, custoMedio: 0 };
            }
            estoqueERP[sku].estoqueAtual += diff;
            estoqueERP[sku].disponivel = estoqueERP[sku].estoqueAtual - (estoqueERP[sku].reservado || 0);
        });

        localStorage.setItem('erp_estoque' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(estoqueERP));
        console.log(`✅ [Integração] Inventário do WMS replicado no ERP.`);
    };

})();

// =============================================================
// WmsMaxdataPoller — Sync em Tempo Real com Maxdata
// Polling de GET /entry a cada 30s. Detecta novas NFs e emite
// o CustomEvent 'maxdata-novas-nfs' para o WMS reagir.
// =============================================================
window.WmsMaxdataPoller = (function () {
    'use strict';

    const POLL_MS  = 30000;  // 30 segundos
    const IC_KEY    = () => 'wms_integration_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
    const KNOWN_KEY = () => 'wms_maxdata_known_entries' + (window.getTenantSuffix ? window.getTenantSuffix() : '');

    let _intervalId  = null;
    let _isActive    = false;

    // ── Auth helper (copia _getToken do conector) ─────────────
    async function _token() {
        const ic  = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
        const cfg = ic.connectorConfig || {};
        const cached = cfg._maxdataToken;
        if (cached?.value && new Date(cached.expiresAt) > new Date(Date.now() + 60000))
            return { token: cached.value, ic, cfg };

        const base = (cfg.baseUrl || '').replace(/\/$/, '');
        if (!base || !cfg.empId || !cfg.terminal)
            throw new Error('Maxdata não configurado.');

        const resp = await fetch(`${base}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId: Number(cfg.empId), terminal: cfg.terminal }),
            signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) throw new Error(`Auth HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.token) throw new Error('Token vazio.');

        if (!ic.connectorConfig) ic.connectorConfig = {};
        ic.connectorConfig._maxdataToken = { value: data.token, expiresAt: data.expiration };
        localStorage.setItem(IC_KEY(), JSON.stringify(ic));
        return { token: data.token, ic, cfg: ic.connectorConfig };
    }

    // ── Um ciclo de polling ───────────────────────────────────
    async function _poll() {
        try {
            const ic = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
            if (ic.connectorId !== 'maxdata') return;

            const { token, cfg } = await _token();
            const base = cfg.baseUrl.replace(/\/$/, '');

            const resp = await fetch(`${base}/entry`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(12000)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const raw = await resp.json();
            const entries = Array.isArray(raw) ? raw : (raw.data || raw.results || []);

            // Detectar NFs novas
            const knownIds  = new Set(JSON.parse(localStorage.getItem(KNOWN_KEY()) || '[]'));
            const newEntries = entries.filter(e => !knownIds.has(String(e.id)));

            if (newEntries.length > 0) {
                localStorage.setItem(KNOWN_KEY(), JSON.stringify(entries.map(e => String(e.id))));
                window.dispatchEvent(new CustomEvent('maxdata-novas-nfs', { detail: { entries: newEntries } }));
                if (window.WmsIntegration) {
                    window.WmsIntegration._emit?.('maxdata-novas-nfs', { count: newEntries.length });
                }
                console.log(`📥 [Maxdata Poller] ${newEntries.length} nova(s) NF(s) detectada(s).`);
            }

            // Persiste última sync
            const icUpd = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
            icUpd.pollingLastSync = new Date().toISOString();
            icUpd.pollingNfCount  = entries.length;
            localStorage.setItem(IC_KEY(), JSON.stringify(icUpd));

            // Atualiza badge na UI se visível
            const badge   = document.getElementById('maxdata-poll-badge');
            const counter = document.getElementById('maxdata-poll-count');
            if (badge)   badge.textContent = `Última sync: ${new Date().toLocaleTimeString('pt-BR')}`;
            if (counter) counter.textContent = `${entries.length} NF(s) no Maxdata`;

        } catch (err) {
            console.warn('[WmsMaxdataPoller] Erro no poll:', err.message);
            const badge = document.getElementById('maxdata-poll-badge');
            if (badge) badge.textContent = `Erro: ${err.message}`;
        }
    }

    // ── API pública ───────────────────────────────────────────
    return {
        isActive() { return _isActive; },

        async start() {
            if (_isActive) return;
            _isActive = true;
            // Persiste estado
            const ic = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
            ic.pollingAtivo = true;
            localStorage.setItem(IC_KEY(), JSON.stringify(ic));
            // Poll imediato + intervalo
            await _poll();
            _intervalId = setInterval(_poll, POLL_MS);
            console.log(`🟢 [WmsMaxdataPoller] Ativo — intervalo ${POLL_MS / 1000}s`);
        },

        stop() {
            if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
            _isActive = false;
            const ic = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
            ic.pollingAtivo = false;
            localStorage.setItem(IC_KEY(), JSON.stringify(ic));
            console.log('🔴 [WmsMaxdataPoller] Desativado.');
        },

        async toggle() {
            if (_isActive) { this.stop(); return false; }
            await this.start(); return true;
        },

        // Chamado no DOMContentLoaded para retomar se estava ativo
        restore() {
            const ic = JSON.parse(localStorage.getItem(IC_KEY()) || '{}');
            if (ic.connectorId === 'maxdata' && ic.pollingAtivo) {
                console.log('♻️ [WmsMaxdataPoller] Retomando sessão anterior...');
                this.start();
            }
        }
    };
})();

// Auto-restore quando página carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.WmsMaxdataPoller.restore());
} else {
    window.WmsMaxdataPoller.restore();
}



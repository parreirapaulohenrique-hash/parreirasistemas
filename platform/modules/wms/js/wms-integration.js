// =============================================================
// WMS Integration Layer — Multi-ERP Adapter Pattern
// Camada de abstração para integração com ERPs externos.
// O WMS opera de forma autônoma; conectores são opcionais.
// =============================================================

(function () {
    'use strict';

    // ─── CONFIG KEY ──────────────────────────────────────────
    const INTEGRATION_KEY = 'wms_integration_config';
    const SYNC_LOG_KEY = 'wms_sync_log';

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
            const erpLoaded = typeof window.erpModule !== 'undefined' || localStorage.getItem('erp_products');
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
            localStorage.setItem(INTEGRATION_KEY, JSON.stringify(saved));
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
})();

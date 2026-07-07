/**
 * erp-registry.js — Registro Multi-Tenant de Adaptadores ERP
 * ===========================================================
 * Responsável por:
 *  1. Guardar qual ERP cada tenant usa (lê/salva no Firestore)
 *  2. Instanciar o adaptador correto para cada tenant
 *  3. Cachear a instância durante a sessão (evita leituras repetidas do Firestore)
 *
 * Uso pelos módulos:
 *   const erp = await ErpRegistry.getAdapter(tenantId);
 *   if (erp) await erp.syncClients();
 *
 * Versão: 1.0.0
 * Criado: 2026-07-07
 * Parte de: platform/shared/integrations/
 */

const ErpRegistry = {

    // Cache de instâncias por tenant — válido apenas para esta sessão de navegador
    // Estrutura: { 'ltdistribuidora': AcontecAdapterInstance, ... }
    _adapterCache: {},

    // Provedores registrados — estrutura: { 'acontec': AcontecAdapter, 'maxdata': MaxDataAdapter }
    _providers: {},

    // ─────────────────────────────────────────────
    //  REGISTRO DE PROVEDORES
    // ─────────────────────────────────────────────

    /**
     * Registra um novo provedor de ERP.
     * Chamado em shared/integrations/index.js ao carregar a página.
     * @param {string} providerName - Nome único do provedor (ex: 'acontec')
     * @param {class}  AdapterClass - Classe que herda de ErpAdapter
     */
    register(providerName, AdapterClass) {
        this._providers[providerName.toLowerCase()] = AdapterClass;
        console.log(`[ErpRegistry] Provedor registrado: ${providerName}`);
    },

    // ─────────────────────────────────────────────
    //  OBTER ADAPTADOR (ponto de entrada dos módulos)
    // ─────────────────────────────────────────────

    /**
     * Retorna o adaptador de ERP ativo para o tenant informado.
     * Na primeira chamada, lê a config do Firestore.
     * Nas chamadas seguintes, usa o cache de sessão.
     *
     * @param {string} tenantId - ID do tenant (ex: 'ltdistribuidora')
     * @returns {Promise<ErpAdapter|null>} Instância do adaptador, ou null se não configurado
     */
    async getAdapter(tenantId) {
        if (!tenantId) {
            console.warn('[ErpRegistry] tenantId não informado');
            return null;
        }

        // Retorna cache de sessão se já instanciado
        if (this._adapterCache[tenantId]) {
            return this._adapterCache[tenantId];
        }

        // Carrega configuração do Firestore
        const config = await this._loadConfig(tenantId);

        if (!config) {
            console.info(`[ErpRegistry] Tenant '${tenantId}' sem configuração de ERP.`);
            return null;
        }

        if (!config.enabled) {
            console.info(`[ErpRegistry] Integração ERP desativada para '${tenantId}'.`);
            return null;
        }

        const providerKey = (config.provider || '').toLowerCase();
        const AdapterClass = this._providers[providerKey];

        if (!AdapterClass) {
            console.error(`[ErpRegistry] Provedor desconhecido: '${config.provider}' para tenant '${tenantId}'`);
            return null;
        }

        // Token vem do sessionStorage (segurança — nunca armazenado no Firestore)
        const apiToken = sessionStorage.getItem(`erp_token_${tenantId}`) || '';

        if (!apiToken) {
            console.warn(`[ErpRegistry] Token ERP ausente para '${tenantId}'. Configure nas Integrações.`);
            // Retorna a instância mesmo sem token — permite UI de configuração
        }

        const instance = new AdapterClass(tenantId, { ...config, apiToken });
        this._adapterCache[tenantId] = instance;

        console.log(`[ErpRegistry] Adaptador '${config.provider}' instanciado para '${tenantId}'`);
        return instance;
    },

    // ─────────────────────────────────────────────
    //  CONFIGURAÇÃO (leitura e escrita no Firestore)
    // ─────────────────────────────────────────────

    /**
     * Carrega a configuração de ERP do Firestore para o tenant.
     * Path: tenants/{tenantId}/erp_config/settings
     * @param {string} tenantId
     * @returns {Promise<object|null>}
     */
    async _loadConfig(tenantId) {
        try {
            const db = firebase.firestore();
            const doc = await db.doc(`tenants/${tenantId}/erp_config/settings`).get();
            if (!doc.exists) return null;
            return doc.data();
        } catch (e) {
            console.error(`[ErpRegistry] Erro ao carregar config ERP para '${tenantId}':`, e);
            return null;
        }
    },

    /**
     * Salva a configuração de ERP no Firestore.
     * O apiToken NUNCA é salvo aqui — fica apenas no sessionStorage.
     *
     * @param {string} tenantId     - ID do tenant
     * @param {object} config       - Configurações a salvar (sem apiToken)
     * @param {string} operatorName - Nome do operador que fez a configuração
     */
    async saveConfig(tenantId, config, operatorName) {
        if (!tenantId) throw new Error('[ErpRegistry] tenantId é obrigatório para salvar config');

        // Garante que o token não vá para o Firestore
        const { apiToken, ...safeConfig } = config;

        // Salva token APENAS no sessionStorage
        if (apiToken) {
            sessionStorage.setItem(`erp_token_${tenantId}`, apiToken);
        }

        const docData = {
            ...safeConfig,
            updatedAt: new Date().toISOString(),
            updatedBy: operatorName || 'Sistema'
        };

        try {
            const db = firebase.firestore();
            await db.doc(`tenants/${tenantId}/erp_config/settings`).set(docData, { merge: true });

            // Invalida cache — próximo getAdapter() relê do Firestore
            this.clearCache(tenantId);

            console.log(`[ErpRegistry] Config ERP salva no Firestore para '${tenantId}'`);
            return { success: true };
        } catch (e) {
            console.error(`[ErpRegistry] Erro ao salvar config ERP:`, e);
            throw e;
        }
    },

    /**
     * Carrega a configuração de ERP para exibição na tela (sem o token).
     * Usado pela UI de configuração dos módulos.
     * @param {string} tenantId
     * @returns {Promise<object>}
     */
    async getConfig(tenantId) {
        const config = await this._loadConfig(tenantId);
        return config || {
            provider: '',
            apiUrl: '',
            enabled: false,
            autoSync: false,
            syncInterval: 60,
            lastSync: null
        };
    },

    /**
     * Verifica se o token está disponível na sessão atual.
     * @param {string} tenantId
     * @returns {boolean}
     */
    hasToken(tenantId) {
        return !!sessionStorage.getItem(`erp_token_${tenantId}`);
    },

    /**
     * Lista todos os provedores registrados.
     * @returns {string[]}
     */
    getProviders() {
        return Object.keys(this._providers);
    },

    // ─────────────────────────────────────────────
    //  CACHE
    // ─────────────────────────────────────────────

    /**
     * Limpa o cache de instâncias para forçar recarregamento.
     * @param {string} [tenantId] - Se omitido, limpa todos os tenants
     */
    clearCache(tenantId) {
        if (tenantId) {
            delete this._adapterCache[tenantId];
        } else {
            this._adapterCache = {};
        }
    }
};

// Exporta para uso global
if (typeof window !== 'undefined') {
    window.ErpRegistry = ErpRegistry;
}

/**
 * index.js — Ponto de Entrada da Camada de Integração ERP
 * ========================================================
 * Registra todos os provedores disponíveis no ErpRegistry.
 * Este arquivo deve ser carregado APÓS erp-adapter.js, erp-registry.js
 * e os arquivos de cada adaptador.
 *
 * Para adicionar um novo ERP no futuro:
 *   1. Crie a pasta shared/integrations/maxdata/adapter.js
 *   2. Adicione o <script> no HTML dos módulos
 *   3. Registre aqui: ErpRegistry.register('maxdata', MaxDataAdapter);
 *
 * Versão: 1.0.0
 * Criado: 2026-07-07
 */

(function () {
    if (typeof ErpRegistry === 'undefined') {
        console.error('[ERP Integration] ErpRegistry não encontrado. Verifique a ordem dos scripts.');
        return;
    }

    // ── Registro de provedores disponíveis ──
    if (typeof AcontecAdapter !== 'undefined') {
        ErpRegistry.register('acontec', AcontecAdapter);
    }
    if (typeof MaxDataAdapter !== 'undefined') {
        ErpRegistry.register('maxdata', MaxDataAdapter);
    }
    // if (typeof SankhyaAdapter  !== 'undefined') ErpRegistry.register('sankhya',  SankhyaAdapter);
    // if (typeof TotvAdapter     !== 'undefined') ErpRegistry.register('totvs',     TotvAdapter);

    console.log(`[ERP Integration] Camada inicializada. Provedores: [${ErpRegistry.getProviders().join(', ')}]`);

    // Expõe objeto de conveniência para os módulos
    window.ErpIntegration = {
        /**
         * Atalho para obter o adaptador ativo do tenant atual.
         * @returns {Promise<ErpAdapter|null>}
         */
        async getActive() {
            let tenantId = '';
            try {
                if (window.ParreiraAuth && ParreiraAuth.isLogado()) {
                    tenantId = ParreiraAuth.getSessao().tenant || '';
                } else if (typeof Utils !== 'undefined' && Utils.getTenant) {
                    tenantId = Utils.getTenant();
                }
            } catch (e) { /* ignora */ }

            if (!tenantId) {
                console.warn('[ErpIntegration] Tenant não identificado.');
                return null;
            }
            return ErpRegistry.getAdapter(tenantId);
        },

        /**
         * Inicializa a UI de configuração no container do módulo.
         * @param {string} moduleContext - 'dispatch' | 'wms' | etc.
         */
        initUI(moduleContext) {
            if (typeof ErpUI !== 'undefined') {
                ErpUI.init(moduleContext);
            } else {
                console.warn('[ErpIntegration] ErpUI não carregado.');
            }
        },

        /**
         * Notifica o ERP ativo sobre a confirmação de despacho (Fase 4).
         * @param {object} payload
         * @returns {Promise<{success: boolean, queued?: boolean, reason?: string}>}
         */
        async confirmDispatch(payload) {
            try {
                const adapter = await this.getActive();
                if (!adapter) {
                    console.log('[ErpIntegration] Nenhum ERP ativo para este tenant.');
                    return { success: false, reason: 'no_adapter' };
                }
                return await adapter.confirmDispatch(payload);
            } catch (err) {
                console.warn('[ErpIntegration] Erro ao chamar confirmDispatch no adapter:', err);
                return { success: false, error: err.message };
            }
        }
    };
})();

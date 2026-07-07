/**
 * erp-adapter.js — Contrato Genérico de Integração ERP
 * =====================================================
 * Define a interface que TODOS os adaptadores de ERP devem implementar.
 * Nenhum módulo (Dispatch, WMS, Sales Force) deve conhecer o ERP diretamente —
 * eles chamam apenas os métodos desta interface.
 *
 * Versão: 1.0.0
 * Criado: 2026-07-07
 * Parte de: platform/shared/integrations/
 */

class ErpAdapter {
    /**
     * @param {string} tenantId - ID do tenant (ex: 'ltdistribuidora')
     * @param {object} config   - Configuração do ERP lida do Firestore
     *   @param {string} config.apiUrl    - URL base da API do ERP
     *   @param {string} config.apiToken  - Token de autenticação (vem do sessionStorage)
     *   @param {string} config.provider  - Nome do provedor (ex: 'acontec')
     */
    constructor(tenantId, config) {
        if (!tenantId) throw new Error('[ErpAdapter] tenantId é obrigatório');
        this.tenantId = tenantId;
        this.config   = config || {};
    }

    // ─────────────────────────────────────────────
    //  MÉTODOS OBRIGATÓRIOS (cada ERP deve implementar)
    // ─────────────────────────────────────────────

    /**
     * Testa a conexão com a API do ERP.
     * @returns {Promise<{success: boolean, data: any}>}
     */
    async testConnection() {
        throw new Error(`[${this.constructor.name}] testConnection() não implementado`);
    }

    /**
     * Sincroniza cadastro de clientes do ERP → Firestore (tenants/{tenantId}/clients).
     * Usado por: Dispatch (cotação), Sales Force (rota do RCA)
     * @returns {Promise<{added: number, updated: number, errors: number}>}
     */
    async syncClients() {
        throw new Error(`[${this.constructor.name}] syncClients() não implementado`);
    }

    /**
     * Sincroniza catálogo de produtos do ERP → Firestore (tenants/{tenantId}/products).
     * Usado por: Sales Force (pedidos em campo), WMS (conferência de recebimento)
     * @returns {Promise<{added: number, updated: number, errors: number}>}
     */
    async syncProducts() {
        throw new Error(`[${this.constructor.name}] syncProducts() não implementado`);
    }

    /**
     * Sincroniza pedidos do ERP → Firestore (tenants/{tenantId}/orders).
     * Usado por: WMS (geração de ondas de separação), Dispatch (pré-carga)
     * @returns {Promise<{added: number, updated: number, errors: number}>}
     */
    async syncOrders() {
        throw new Error(`[${this.constructor.name}] syncOrders() não implementado`);
    }

    /**
     * Busca Notas Fiscais pendentes de despacho no ERP.
     * Retorna array de NFs com campos de frete e redespacho.
     * Usado por: Dispatch (importação de NFs para cotação)
     * @param {object} filters - Filtros opcionais
     *   @param {string} [filters.status]       - 'pendente' | 'despachada' | 'todas'
     *   @param {string} [filters.dataInicio]   - Formato YYYY-MM-DD
     *   @param {string} [filters.dataFim]      - Formato YYYY-MM-DD
     *   @param {string} [filters.chave]        - Chave NF-e (44 dígitos) para busca específica
     * @returns {Promise<Array>} Array de NFs no formato normalizado
     */
    async syncNFs(filters = {}) {
        throw new Error(`[${this.constructor.name}] syncNFs() não implementado`);
    }

    /**
     * Notifica o ERP que uma NF foi despachada (webhook de saída).
     * Usado por: Dispatch (após confirmação do romaneio)
     * @param {object} nfData - Dados do despacho confirmado
     *   @param {string} nfData.numero_nf          - Número da NF
     *   @param {string} nfData.transportadora      - Transportadora usada
     *   @param {number} nfData.valor_frete_total   - Valor total do frete
     *   @param {number} nfData.valor_frete_principal
     *   @param {number} nfData.valor_redespacho
     *   @param {string} nfData.data_despacho       - Formato YYYY-MM-DD
     *   @param {string} nfData.romaneio_id
     * @returns {Promise<{success: boolean}>}
     */
    async confirmDispatch(nfData) {
        throw new Error(`[${this.constructor.name}] confirmDispatch() não implementado`);
    }

    // ─────────────────────────────────────────────
    //  HELPERS UTILITÁRIOS (disponíveis para todos os adaptadores)
    // ─────────────────────────────────────────────

    /**
     * Faz uma requisição autenticada à API do ERP.
     * Centraliza headers, timeout e tratamento de erros HTTP.
     * @param {string} endpoint  - Caminho da API (ex: '/clientes')
     * @param {object} [options] - Opções do fetch (method, body, etc.)
     */
    async _request(endpoint, options = {}) {
        if (!this.config.apiUrl || !this.config.apiToken) {
            throw new Error('[ErpAdapter] API não configurada (URL ou Token ausente)');
        }

        const url = `${this.config.apiUrl.replace(/\/$/, '')}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.config.apiToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText} — ${endpoint}`);
        }

        return response.json();
    }

    /**
     * Busca todas as páginas de um endpoint paginado.
     * @param {string} endpoint      - Ex: '/clientes'
     * @param {object} [extraParams] - Query params adicionais
     * @param {number} [pageSize]    - Itens por página (padrão 100)
     * @returns {Promise<Array>} Todos os registros combinados
     */
    async _fetchAllPages(endpoint, extraParams = {}, pageSize = 100) {
        const allItems = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const params = new URLSearchParams({ page, limit: pageSize, ...extraParams });
            const data = await this._request(`${endpoint}?${params}`);

            const items = data.data || data.clientes || data.produtos || data.pedidos || data;

            if (!Array.isArray(items) || items.length === 0) {
                hasMore = false;
                break;
            }

            allItems.push(...items);
            hasMore = data.hasMore || data.has_next || (items.length >= pageSize);
            page++;
        }

        return allItems;
    }

    /**
     * Salva um array de itens no Firestore do tenant.
     * @param {string} collection - Nome da coleção (ex: 'clients', 'products')
     * @param {Array}  items      - Dados a salvar
     */
    async _saveToFirestore(collection, items) {
        try {
            const db = firebase.firestore();
            await db.doc(`tenants/${this.tenantId}/${collection}/data`).set({
                items,
                updatedAt: new Date().toISOString(),
                count: items.length
            });
        } catch (e) {
            console.error(`[ErpAdapter] Erro ao salvar ${collection} no Firestore:`, e);
            throw e;
        }
    }
}

// Exporta para uso global
if (typeof window !== 'undefined') {
    window.ErpAdapter = ErpAdapter;
}

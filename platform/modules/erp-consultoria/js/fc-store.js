/**
 * Store de Fluxo de Caixa (ERP Consultoria)
 * Fonte de verdade: Firebase Firestore (Multi-Tenant).
 * Estrutura: tenants/{tenantId}/fv_clientes  (lista de clientes do ERP)
 *            tenants/{tenantId}/fluxo_caixa_clientes (dados de períodos)
 */
class Store {
    constructor() {
        this.activeClientId = null;
        this.clientsCache = [];
        this.yearDataCache = {};
    }

    /**
     * TenantId dinâmico: lido do usuário logado na plataforma.
     */
    get tenantId() {
        try {
            const user = JSON.parse(localStorage.getItem('platform_user_logged'));
            return (user && user.tenant) ? user.tenant : 'parreira';
        } catch (e) {
            return 'parreira';
        }
    }

    get db() {
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firebase não está inicializado.');
        }
        return firebase.firestore();
    }

    // --- CLIENTES ---

    /**
     * Busca clientes do Firebase.
     * Fonte primária: fv_clientes (sincronizado pelo ERP ao salvar cliente).
     * Combina com períodos de fluxo_caixa_clientes.
     */
    async getClients() {
        try {
            const tenantRef = this.db.collection('tenants').doc(this.tenantId);

            // 1. Clientes do ERP (fonte de verdade primária)
            const clientsSnap = await tenantRef.collection('fv_clientes').get();

            // 2. Dados do Fluxo de Caixa — contém períodos E clientes adicionados pelo módulo FC
            const periodsSnap = await tenantRef.collection('fluxo_caixa_clientes').get();
            const periodsData = {};
            periodsSnap.forEach(doc => {
                periodsData[doc.id] = doc.data();
            });

            this.clientsCache = [];

            if (!clientsSnap.empty) {
                // Carrega clientes do ERP com seus períodos correspondentes
                clientsSnap.forEach(doc => {
                    const data = doc.data();
                    this.clientsCache.push({
                        id: doc.id,
                        name: data.razaoSocial || data.nome || data.name || doc.id,
                        cnpj: data.cnpjCpf || data.cnpj || '',
                        periods: periodsData[doc.id] ? (periodsData[doc.id].periods || {}) : {}
                    });
                });
            } else {
                // Fallback: localStorage (para ERP não sincronizado)
                const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
                const localClients = JSON.parse(localStorage.getItem('erp_clientes' + suffix)) || window.entities || [];
                localClients.forEach(c => {
                    const idStr = String(c.code || c.id);
                    this.clientsCache.push({
                        id: idStr,
                        name: c.name || c.razaoSocial || '',
                        cnpj: c.cnpj || c.cnpjCpf || '',
                        periods: periodsData[idStr] ? (periodsData[idStr].periods || {}) : {}
                    });
                });
            }

            // ✅ CORREÇÃO: Adiciona clientes criados DIRETAMENTE pelo módulo FC (via addClient())
            // Esses clientes têm campo "name" em fluxo_caixa_clientes mas NÃO estão em fv_clientes.
            // Sem isso, após recarregar a página, eles sumiam porque o ID Firestore não batia com o ID do localStorage.
            periodsSnap.forEach(doc => {
                const data = doc.data();
                const jaExiste = this.clientsCache.some(c => c.id === doc.id);
                if (!jaExiste && (data.name || data.nome || data.cnpj)) {
                    this.clientsCache.push({
                        id: doc.id,
                        name: data.name || data.nome || doc.id,
                        cnpj: data.cnpj || '',
                        periods: data.periods || {}
                    });
                }
            });

            console.log(`[fc-store] ${this.clientsCache.length} cliente(s) carregado(s) para tenant: ${this.tenantId}`);
            return this.clientsCache;
        } catch (error) {
            console.error('[fc-store] Erro ao buscar clientes:', error);
            return [];
        }
    }

    async addClient(name, cnpj) {
        try {
            const newClient = {
                name,
                cnpj,
                createdAt: new Date().toISOString(),
                periods: {}
            };

            const docRef = await this.db.collection('tenants').doc(this.tenantId)
                                        .collection('fluxo_caixa_clientes')
                                        .add(newClient);

            newClient.id = docRef.id;
            this.clientsCache.push(newClient);
            return newClient;
        } catch (error) {
            console.error('[fc-store] Erro ao criar cliente:', error);
            return null;
        }
    }

    async deleteClient(id) {
        try {
            await this.db.collection('tenants').doc(this.tenantId)
                         .collection('fluxo_caixa_clientes').doc(id)
                         .delete();

            this.clientsCache = this.clientsCache.filter(c => c.id !== id);
            return true;
        } catch (error) {
            console.error('[fc-store] Erro ao excluir cliente:', error);
            return false;
        }
    }

    setActiveClient(id) {
        this.activeClientId = id;
    }

    getActiveClient() {
        if (!this.activeClientId) return null;
        return this.clientsCache.find(c => c.id === this.activeClientId) || null;
    }

    // --- FLUXO DE CAIXA ---

    async savePeriodData(clientId, periodKey, type, accountData) {
        try {
            const clientRef = this.db.collection('tenants').doc(this.tenantId)
                                     .collection('fluxo_caixa_clientes').doc(clientId);

            // IMPORTANTE: usar update() e NÃO set({...}, {merge:true}) com dot-notation.
            // O set() com merge:true cria um campo LITERALMENTE chamado "periods.2026-03.realizado"
            // ao invés de criar a estrutura aninhada periods > 2026-03 > realizado.
            // Somente o update() interpreta dot-notation como caminho aninhado.
            const updateObj = {};
            updateObj[`periods.${periodKey}.${type}`] = accountData;

            try {
                await clientRef.update(updateObj);
            } catch (notFoundErr) {
                // Documento ainda não existe — cria ele do zero com a estrutura correta
                if (notFoundErr.code === 'not-found') {
                    const initData = { periods: {} };
                    initData.periods[periodKey] = {};
                    initData.periods[periodKey][type] = accountData;
                    await clientRef.set(initData);
                } else {
                    throw notFoundErr;
                }
            }

            // Atualiza cache em memória
            const client = this.clientsCache.find(c => c.id === clientId);
            if (client) {
                if (!client.periods) client.periods = {};
                if (!client.periods[periodKey]) client.periods[periodKey] = {};
                client.periods[periodKey][type] = accountData;
            }

            return true;
        } catch (error) {
            console.error('[fc-store] Erro ao salvar período:', error);
            return false;
        }
    }

    /**
     * Recarrega os dados de períodos de um cliente específico do Firestore.
     * Usado após salvar para garantir que o cache esteja atualizado antes de renderizar.
     */
    async reloadClientPeriods(clientId) {
        try {
            const docSnap = await this.db.collection('tenants').doc(this.tenantId)
                                         .collection('fluxo_caixa_clientes').doc(clientId).get();

            const client = this.clientsCache.find(c => c.id === clientId);
            if (!client) return;

            if (docSnap.exists) {
                const data = docSnap.data();
                client.periods = data.periods || {};
                console.log(`[fc-store] Períodos recarregados para cliente ${clientId}:`, Object.keys(client.periods));
            }
        } catch (error) {
            console.error('[fc-store] Erro ao recarregar períodos:', error);
        }
    }

    /**
     * Salva os dados de um mês completo (contas importadas do PDF).
     * Wrapper conveniente sobre savePeriodData.
     */
    async saveMonthData(clientId, periodKey, accounts) {
        return this.savePeriodData(clientId, periodKey, 'realizado', accounts);
    }


    getYearData(clientId, year) {
        const client = this.clientsCache.find(c => c.id === clientId);
        if (!client || !client.periods) return {};

        const result = {};
        Object.keys(client.periods).forEach(key => {
            if (key.startsWith(year)) {
                result[key] = client.periods[key];
            }
        });
        return result;
    }
}

// Inicializa o Store como variável global (window.store)
window.store = new Store();
const store = window.store; // alias para compatibilidade com scripts internos

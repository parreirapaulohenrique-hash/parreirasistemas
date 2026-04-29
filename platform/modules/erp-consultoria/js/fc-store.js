/**
 * Classe responsável por gerenciar o armazenamento em Nuvem (Firebase)
 * Suporta o modelo Multi-Tenant.
 */
class Store {
    constructor() {
        this.tenantId = localStorage.getItem('app_tenant_id') || 'parreira'; // Fallback
        this.activeClientId = null;
        this.clientsCache = [];
        this.yearDataCache = {};
    }

    get db() {
        if (!window.db) throw new Error("Firebase não está inicializado.");
        return window.db;
    }

    // --- CLIENTES ---

    async getClients() {
        try {
            // Unificação: Busca a base de clientes do ERP principal
            const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
            const erpClients = JSON.parse(localStorage.getItem('erp_clientes' + suffix)) || [];
            
            // Busca também se há dados salvos no Firebase para combinar
            const snapshot = await this.db.collection('tenants').doc(this.tenantId)
                                       .collection('fluxo_caixa_clientes')
                                       .get();
            
            const firebaseData = {};
            snapshot.forEach(doc => {
                firebaseData[doc.id] = doc.data();
            });

            this.clientsCache = [];
            
            // Cria a lista mesclando os clientes do ERP com os períodos do Firebase
            if (erpClients && erpClients.length > 0) {
                erpClients.forEach(c => {
                    const idStr = String(c.code);
                    this.clientsCache.push({
                        id: idStr,
                        name: c.name,
                        cnpj: c.cnpj,
                        periods: firebaseData[idStr] ? firebaseData[idStr].periods : {}
                    });
                });
            } else {
                // Fallback caso o ERP não tenha clientes ainda
                Object.keys(firebaseData).forEach(id => {
                    const data = firebaseData[id];
                    data.id = id;
                    this.clientsCache.push(data);
                });
            }
            
            return this.clientsCache;
        } catch (error) {
            console.error("Erro ao buscar clientes:", error);
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
            console.error("Erro ao criar cliente:", error);
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
            console.error("Erro ao excluir cliente:", error);
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
            
            // Usando set com merge para atualizar apenas o período específico
            const updateObj = {};
            updateObj[`periods.${periodKey}.${type}`] = accountData;
            
            await clientRef.set(updateObj, { merge: true });
            
            // Atualiza cache local
            const client = this.clientsCache.find(c => c.id === clientId);
            if (client) {
                if(!client.periods) client.periods = {};
                if(!client.periods[periodKey]) client.periods[periodKey] = {};
                client.periods[periodKey][type] = accountData;
            }
            
            return true;
        } catch (error) {
            console.error("Erro ao salvar período:", error);
            return false;
        }
    }
    
    // Retorna todos os dados de um ano específico para cálculo e consolidação
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

// Inicializa o Store globalmente
const store = new Store();

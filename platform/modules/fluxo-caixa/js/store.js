/**
 * Classe responsável por gerenciar o armazenamento local (localStorage)
 * Suporta o modelo Multi-Tenant e armazenamento de períodos do fluxo de caixa.
 */
class Store {
    constructor() {
        this.STORAGE_KEY = 'cashflow_pro_data';
        this.data = this.loadData();
    }

    loadData() {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
        return {
            clients: [],
            activeClientId: null
        };
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    // --- CLIENTES ---

    getClients() {
        return this.data.clients || [];
    }

    addClient(name, cnpj) {
        const id = 'client_' + Date.now();
        const newClient = {
            id,
            name,
            cnpj,
            createdAt: new Date().toISOString(),
            periods: {} // Ex: "2026-03": { realizado: {}, projetado: {} }
        };
        
        if (!this.data.clients) this.data.clients = [];
        this.data.clients.push(newClient);
        this.save();
        return newClient;
    }

    setActiveClient(id) {
        this.data.activeClientId = id;
        this.save();
    }

    getActiveClient() {
        if (!this.data.activeClientId) return null;
        return this.data.clients.find(c => c.id === this.data.activeClientId) || null;
    }

    // --- FLUXO DE CAIXA ---

    savePeriodData(clientId, periodKey, type, accountData) {
        // periodKey: "YYYY-MM"
        // type: "realizado" ou "projetado"
        // accountData: array de objetos { codigo, descricao, a_pagar, a_receber }
        
        const client = this.data.clients.find(c => c.id === clientId);
        if (!client) return false;

        if (!client.periods) client.periods = {};
        if (!client.periods[periodKey]) {
            client.periods[periodKey] = { realizado: [], projetado: [] };
        }

        client.periods[periodKey][type] = accountData;
        this.save();
        return true;
    }

    getPeriodData(clientId, periodKey) {
        const client = this.data.clients.find(c => c.id === clientId);
        if (!client || !client.periods || !client.periods[periodKey]) {
            return { realizado: [], projetado: [] };
        }
        return client.periods[periodKey];
    }
    
    // Retorna todos os dados de um ano específico para cálculo e consolidação
    getYearData(clientId, year) {
        const client = this.data.clients.find(c => c.id === clientId);
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

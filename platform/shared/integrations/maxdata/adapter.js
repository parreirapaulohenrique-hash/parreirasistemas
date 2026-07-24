/**
 * MaxDataAdapter — Implementação da Integração com ERP MaxData
 * =============================================================
 * Herda de ErpAdapter e implementa a comunicação com a API MaxData v2 (REST JWT).
 *
 * Suporta:
 *  - Autenticação via POST /auth com empId e terminal
 *  - Busca de Produtos via GET /product
 *  - Busca de Entradas / NFs via GET /entry
 *  - Confirmação de Recebimento / Despacho via PUT /entry/markaschecked
 *
 * Versão: 1.0.0
 * Criado: 2026-07-24
 * Parte de: platform/shared/integrations/maxdata/
 */

class MaxDataAdapter extends ErpAdapter {

    // ─────────────────────────────────────────────
    //  AUTENTICAÇÃO & REQUEST HELPER
    // ─────────────────────────────────────────────

    async _getToken() {
        const cached = this._tokenCache;
        if (cached?.value && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) {
            return cached.value;
        }

        const baseUrl  = (this.config.apiUrl || this.config.baseUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/$/, '');
        const empId    = Number(this.config.empId || 1);
        const terminal = this.config.terminal || '364F64E6539974C1D75C8A46C14B2D3D';

        this._log('info', `Autenticando no MaxData (${baseUrl}/auth)...`);

        const resp = await fetch(`${baseUrl}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId, terminal }),
            signal: AbortSignal.timeout(12000)
        });

        if (!resp.ok) throw new Error(`MaxData Auth: HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.token) throw new Error('Token JWT não retornado pelo MaxData.');

        this._tokenCache = {
            value: data.token,
            expiresAt: new Date(data.expiration || Date.now() + 86400000)
        };

        return data.token;
    }

    async _headers() {
        const token = await this._getToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    // ─────────────────────────────────────────────
    //  TESTE DE CONEXÃO
    // ─────────────────────────────────────────────

    async testConnection() {
        this._log('info', 'Testando autenticação MaxData...');
        try {
            const token = await this._getToken();
            this._log('success', '✅ Conexão MaxData estabelecida com sucesso!');
            return { success: true, token };
        } catch (e) {
            this._log('error', `Falha ao conectar no MaxData: ${e.message}`);
            throw e;
        }
    }

    // ─────────────────────────────────────────────
    //  CLIENTES
    // ─────────────────────────────────────────────

    async syncClients() {
        this._log('info', 'Sync de clientes não aplicável diretamente para MaxData (uso em NF/Entry).');
        return { added: 0, updated: 0, errors: 0 };
    }

    // ─────────────────────────────────────────────
    //  PRODUTOS
    // ─────────────────────────────────────────────

    async syncProducts() {
        this._log('info', '🔄 Buscando produtos do MaxData (GET /product)...');
        try {
            const headers = await this._headers();
            const baseUrl = (this.config.apiUrl || this.config.baseUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/$/, '');
            const resp = await fetch(`${baseUrl}/product`, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const raw = Array.isArray(data) ? data : (data.data || data.results || []);

            this._log('success', `✅ ${raw.length} produto(s) obtido(s) do MaxData.`);
            return { added: raw.length, updated: 0, errors: 0, products: raw };
        } catch (e) {
            this._log('error', `Erro ao buscar produtos MaxData: ${e.message}`);
            throw e;
        }
    }

    // ─────────────────────────────────────────────
    //  PEDIDOS / NFs (ENTRADAS)
    // ─────────────────────────────────────────────

    async syncOrders() {
        return this.syncNFs();
    }

    async syncNFs(filters = {}) {
        this._log('info', '🔄 Consultando NFs/Entradas no MaxData (GET /entry)...');
        try {
            const headers = await this._headers();
            const baseUrl = (this.config.apiUrl || this.config.baseUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/$/, '');
            const resp = await fetch(`${baseUrl}/entry`, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const raw = Array.isArray(data) ? data : (data.data || data.results || []);

            this._log('success', `✅ ${raw.length} entrada(s) localizada(s) no MaxData.`);
            return raw;
        } catch (e) {
            this._log('error', `Erro ao buscar NFs MaxData: ${e.message}`);
            throw e;
        }
    }

    // ─────────────────────────────────────────────
    //  CONFIRMAÇÃO / WEBHOCK
    // ─────────────────────────────────────────────

    async confirmDispatch(nfData) {
        this._log('info', `Enviando marcação de conferência para NF ${nfData.numero_nf || nfData.nfNumero}...`);
        try {
            const headers = await this._headers();
            const baseUrl = (this.config.apiUrl || this.config.baseUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/$/, '');
            const resp = await fetch(`${baseUrl}/entry/markaschecked`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(nfData),
                signal: AbortSignal.timeout(15000)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            this._log('success', `✅ Marcação de conferência enviada ao MaxData.`);
            return { success: true };
        } catch (e) {
            this._log('error', `Erro ao marcar conferência MaxData: ${e.message}`);
            throw e;
        }
    }
}

// Expor globalmente
if (typeof window !== 'undefined') {
    window.MaxDataAdapter = MaxDataAdapter;
}

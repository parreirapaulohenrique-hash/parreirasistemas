/**
 * AcontecAdapter — Implementação da Integração com ERP Acontec
 * =============================================================
 * Herda de ErpAdapter e implementa todos os métodos para a API Acontec.
 * Migração e reescrita do antigo acontec-integration.js (dispatch-only).
 *
 * Estrutura da API Acontec esperada: ver API_ACONTEC_INTEGRACAO_REDESPACHO.md
 *
 * Versão: 2.0.0
 * Criado: 2026-07-07
 * Parte de: platform/shared/integrations/acontec/
 */

class AcontecAdapter extends ErpAdapter {

    // ─────────────────────────────────────────────
    //  TESTE DE CONEXÃO
    // ─────────────────────────────────────────────

    async testConnection() {
        this._log('info', 'Testando conexão com API Acontec...');
        try {
            const data = await this._request('/health');
            this._log('success', 'Conexão estabelecida com sucesso', data);
            return { success: true, data };
        } catch (e) {
            this._log('error', `Falha na conexão: ${e.message}`);
            throw e;
        }
    }

    // ─────────────────────────────────────────────
    //  CLIENTES
    // ─────────────────────────────────────────────

    /**
     * Sincroniza clientes da Acontec → Firestore + localStorage do tenant.
     * Salva em: tenants/{tenantId}/data/clients (Firestore)
     *           localStorage key 'clients' (cache local do módulo)
     */
    async syncClients() {
        this._log('info', '🔄 Iniciando sincronização de clientes...');
        const start = Date.now();

        try {
            const rawClients = await this._fetchAllPages('/clientes');
            this._log('info', `${rawClients.length} clientes recebidos da API. Normalizando...`);

            // Carrega clientes atuais do localStorage para merge (não-destrutivo)
            const current = this._getLocalClients();
            const clientsMap = new Map(current.map(c => [String(c.codigo), c]));

            let added = 0, updated = 0, errors = 0;

            for (const raw of rawClients) {
                try {
                    const mapped = this._mapClient(raw);
                    if (!mapped.codigo || !mapped.nome) {
                        this._log('warning', `Cliente ignorado: sem código ou nome`, raw);
                        continue;
                    }
                    const key = String(mapped.codigo);
                    if (clientsMap.has(key)) {
                        clientsMap.set(key, { ...clientsMap.get(key), ...mapped });
                        updated++;
                    } else {
                        clientsMap.set(key, mapped);
                        added++;
                    }
                } catch (e) {
                    this._log('error', `Erro ao mapear cliente`, e.message);
                    errors++;
                }
            }

            const finalClients = Array.from(clientsMap.values());

            // Salva no Firestore (fonte da verdade)
            await this._saveFirestoreClients(finalClients);

            // Atualiza localStorage (cache de performance dos módulos)
            this._setLocalClients(finalClients);

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            this._log('success', `✅ Clientes: ${added} novos, ${updated} atualizados, ${errors} erros em ${duration}s`);

            // Atualiza UI se callback registrado
            if (typeof window.renderClientList === 'function') window.renderClientList();

            return { added, updated, errors, total: finalClients.length, duration };

        } catch (e) {
            this._log('error', `❌ Falha na sincronização de clientes: ${e.message}`);
            throw e;
        }
    }

    /**
     * Mapeia o formato da API Acontec para o formato interno ParreiraLog.
     */
    _mapClient(raw) {
        const phone = (raw.telefone || raw.celular || '').replace(/\D/g, '');
        const nome  = (raw.razao_social || raw.nome_fantasia || raw.nome || '').toUpperCase().trim();
        const cidade = (raw.endereco?.cidade || raw.cidade || 'N/I').toUpperCase().trim();
        const bairro = (raw.endereco?.bairro || raw.bairro || '-').toUpperCase().trim();

        return {
            codigo:    String(raw.id || raw.codigo || ''),
            nome,
            cidade,
            bairro,
            telefone:  phone,
            estado:    (raw.endereco?.estado || raw.estado || '').toUpperCase(),
            cnpj:      raw.cnpj || '',
            email:     raw.email || '',
            // Metadados de sincronização
            _source:   'acontec',
            _syncedAt: new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────
    //  PRODUTOS
    // ─────────────────────────────────────────────

    /**
     * Sincroniza catálogo de produtos da Acontec → Firestore.
     * Endpoint: GET /produtos (a ser implementado pela Acontec)
     */
    async syncProducts() {
        this._log('info', '🔄 Iniciando sincronização de produtos...');
        const start = Date.now();

        try {
            const rawProducts = await this._fetchAllPages('/produtos');
            const products = rawProducts.map(p => this._mapProduct(p));

            // Salva no Firestore
            await this._saveToFirestore('products', products);

            // Cache localStorage
            if (typeof Utils !== 'undefined' && Utils.saveRaw) {
                Utils.saveRaw(`products_${this.tenantId}`, JSON.stringify(products));
            }

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            this._log('success', `✅ Produtos: ${products.length} sincronizados em ${duration}s`);
            return { total: products.length, duration };

        } catch (e) {
            this._log('error', `❌ Falha na sincronização de produtos: ${e.message}`);
            throw e;
        }
    }

    _mapProduct(raw) {
        return {
            codigo:      String(raw.id || raw.codigo || raw.sku || ''),
            descricao:   (raw.descricao || raw.nome || raw.name || '').toUpperCase().trim(),
            unidade:     (raw.unidade || raw.un || 'UN').toUpperCase(),
            preco:       parseFloat(raw.preco || raw.valor || 0),
            estoque:     parseFloat(raw.estoque || raw.saldo || 0),
            ncm:         raw.ncm || '',
            ean:         raw.ean || raw.codigo_barras || '',
            peso:        parseFloat(raw.peso_kg || raw.peso || 0),
            _source:     'acontec',
            _syncedAt:   new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────
    //  PEDIDOS
    // ─────────────────────────────────────────────

    /**
     * Sincroniza pedidos do ERP Acontec → Firestore.
     * Endpoint: GET /pedidos (a ser implementado pela Acontec)
     */
    async syncOrders() {
        this._log('info', '🔄 Iniciando sincronização de pedidos...');
        const start = Date.now();

        try {
            const rawOrders = await this._fetchAllPages('/pedidos');
            const orders = rawOrders.map(o => this._mapOrder(o));

            await this._saveToFirestore('orders', orders);

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            this._log('success', `✅ Pedidos: ${orders.length} sincronizados em ${duration}s`);
            return { total: orders.length, duration };

        } catch (e) {
            this._log('error', `❌ Falha na sincronização de pedidos: ${e.message}`);
            throw e;
        }
    }

    _mapOrder(raw) {
        return {
            numero:       String(raw.numero || raw.id || ''),
            cliente:      raw.cliente || {},
            itens:        raw.itens || raw.items || [],
            valorTotal:   parseFloat(raw.valor_total || raw.total || 0),
            status:       raw.status || 'pendente',
            dataEmissao:  raw.data_emissao || raw.created_at || '',
            _source:      'acontec',
            _syncedAt:    new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────
    //  NOTAS FISCAIS (para o Dispatch)
    // ─────────────────────────────────────────────

    /**
     * Busca NFs pendentes de despacho na Acontec.
     * Retorna array normalizado com campos de frete e redespacho.
     * Endpoint: GET /notas-fiscais
     *
     * @param {object} filters
     * @returns {Promise<Array>} NFs normalizadas para o Dispatch
     */
    async syncNFs(filters = {}) {
        this._log('info', '🔄 Buscando Notas Fiscais da Acontec...');

        const params = {};
        if (filters.status)      params.status      = filters.status;
        if (filters.dataInicio)  params.data_inicio = filters.dataInicio;
        if (filters.dataFim)     params.data_fim    = filters.dataFim;
        if (filters.chave)       params.chave_nfe   = filters.chave;

        try {
            const rawNFs = await this._fetchAllPages('/notas-fiscais', params, 50);
            const nfs = rawNFs
                .map(nf => this._mapNF(nf))
                // Regra: só NFs com transportadora informada no ERP
                .filter(nf => nf.suggestedCarrier && String(nf.suggestedCarrier).trim() !== '');

            this._log('success', `✅ ${nfs.length} NF(s) com transportadora recebida(s) da Acontec`);
            return nfs;

        } catch (e) {
            this._log('error', `❌ Falha ao buscar NFs: ${e.message}`);
            throw e;
        }
    }

    /**
     * Mapeia NF do formato Acontec para o formato interno do Dispatch.
     * Campos: ver API_ACONTEC_INTEGRACAO_REDESPACHO.md
     */
    _mapNF(raw) {
        const redespacho = raw.redespacho || {};
        const frete      = raw.frete || {};
        const cliente    = raw.cliente || {};
        const vendedor   = raw.vendedor || {};

        return {
            // Identificação
            invoice:     String(raw.numero_nf || raw.id || 'S/N'),
            serie:       raw.serie || '001',
            chaveNFe:    raw.chave_nfe || '',
            dataEmissao: raw.data_emissao || '',
            status:      raw.status_nf || 'pendente',

            // Destinatário
            client:      (cliente.razao_social || cliente.nome || '').toUpperCase().trim(),
            city:        (cliente.cidade || '').toUpperCase().trim(),
            neighborhood:(cliente.bairro || '').toUpperCase().trim(),
            state:       (cliente.estado || '').toUpperCase(),
            clientCode:  String(cliente.codigo || ''),
            cnpj:        cliente.cnpj || '',
            address:     cliente.endereco_completo || '',

            // Vendedor
            sellerId:    String(vendedor.codigo || ''),
            sellerName:  vendedor.nome || '',
            sellerPhone: (vendedor.telefone || '').replace(/\D/g, ''),

            // Frete
            nfValue:     parseFloat(frete.valor_nf || 0),
            weight:      parseFloat(frete.peso_kg || 0),
            volume:      parseInt(frete.volumes || 1),
            freightType: (frete.tipo_frete || 'CIF').toUpperCase(),
            suggestedCarrier: frete.transportadora_sugerida || '',

            // Redespacho (campos críticos para o cálculo)
            hasRedespacho:          redespacho.possui_redespacho === true,
            redespCidade:           (redespacho.cidade_hub || '').toUpperCase(),
            redespCarrier:          (redespacho.transportadora_redespacho || '').toUpperCase(),
            redespTotal:            parseFloat(redespacho.valor_redespacho || 0),
            percentualRedespacho:   parseFloat(redespacho.percentual_redespacho || 0),
            minimoRedespacho:       parseFloat(redespacho.minimo_redespacho || 0),

            // NF complementar
            isComplement: raw.complemento?.is_complemento === true,
            mainInvoice:  raw.complemento?.nf_principal || null,

            // Metadados
            _source:   'acontec',
            _syncedAt: new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────
    //  WEBHOOK: CONFIRMAÇÃO DE DESPACHO
    // ─────────────────────────────────────────────

    /**
     * Notifica a Acontec que uma NF foi despachada.
     * Endpoint: POST /webhook/despacho-confirmado
     * Opcional: se a Acontec não tiver o endpoint, registra aviso e segue.
     */
    async confirmDispatch(nfData) {
        this._log('info', `Notificando Acontec: despacho NF ${nfData.numero_nf}...`);

        try {
            const payload = {
                evento:                  'DESPACHO_CONFIRMADO',
                timestamp:               new Date().toISOString(),
                numero_nf:               nfData.numero_nf,
                transportadora:          nfData.transportadora,
                redespacho_carrier:      nfData.redespacho_carrier || null,
                valor_frete_total:       nfData.valor_frete_total,
                valor_frete_principal:   nfData.valor_frete_principal,
                valor_redespacho:        nfData.valor_redespacho || 0,
                data_despacho:           nfData.data_despacho,
                romaneio_id:             nfData.romaneio_id,
                operador:                nfData.operador || 'Sistema'
            };

            await this._request('/webhook/despacho-confirmado', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            this._log('success', `✅ Acontec notificada: NF ${nfData.numero_nf} despachada`);
            return { success: true };

        } catch (e) {
            // Não bloqueia o fluxo — webhook é opcional
            this._log('warning', `Falha ao notificar Acontec (não crítico): ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    // ─────────────────────────────────────────────
    //  HELPERS INTERNOS
    // ─────────────────────────────────────────────

    /**
     * Salva clientes no Firestore (path correto multi-tenant).
     * Usa o mesmo caminho que o sistema de storage existente.
     */
    async _saveFirestoreClients(clients) {
        try {
            // Usa Utils.Cloud se disponível (respeita o anti-echo e sync do sistema)
            if (typeof Utils !== 'undefined' && Utils.Cloud && Utils.Cloud.save) {
                await Utils.Cloud.save('clients', clients);
            } else {
                // Fallback direto ao Firestore
                const db = firebase.firestore();
                const chunks = this._chunkArray(clients, 500); // Firestore tem limite de escrita
                for (const chunk of chunks) {
                    await db.collection(`tenants/${this.tenantId}/data`)
                        .doc('clients')
                        .set({ items: chunk, updatedAt: new Date().toISOString() }, { merge: true });
                }
            }
        } catch (e) {
            this._log('warning', `Aviso ao salvar clientes no Firestore: ${e.message}`);
        }
    }

    /** Lê clientes do localStorage (cache) */
    _getLocalClients() {
        try {
            if (typeof Utils !== 'undefined' && Utils.getStorage) {
                return Utils.getStorage('clients') || [];
            }
            const raw = localStorage.getItem('clients');
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }

    /** Salva clientes no localStorage (cache) */
    _setLocalClients(clients) {
        try {
            if (typeof Utils !== 'undefined' && Utils.saveRaw) {
                Utils.saveRaw('clients', JSON.stringify(clients));
            } else {
                localStorage.setItem('clients', JSON.stringify(clients));
            }
        } catch (e) {
            this._log('warning', `Aviso ao salvar clientes no localStorage: ${e.message}`);
        }
    }

    /** Divide array em chunks (para escritas em lote no Firestore) */
    _chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
    }

    /**
     * Log interno — registra no console e no sistema de logs do ErpRegistry.
     */
    _log(type, message, details = null) {
        const prefix = `[AcontecAdapter:${this.tenantId}]`;
        if (type === 'error')   console.error(prefix, message, details || '');
        else if (type === 'warning') console.warn(prefix, message, details || '');
        else console.log(prefix, message, details || '');

        // Dispara evento para a UI registrar no painel de logs
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp:log', {
                detail: { type, message, details, tenant: this.tenantId, provider: 'acontec' }
            }));
        }
    }
}

// Exporta para uso global
if (typeof window !== 'undefined') {
    window.AcontecAdapter = AcontecAdapter;
}

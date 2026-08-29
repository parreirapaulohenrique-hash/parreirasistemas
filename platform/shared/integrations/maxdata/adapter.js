/**
 * MaxDataAdapter — Integração com ERP MaxData
 * ============================================
 * Implementa syncClients() paginado via GET /v2/client.
 * Autenticação JWT via POST /v2/auth (empId + terminal).
 *
 * Fase 1: sincronização de catálogo de clientes para uso
 * na aba Cotação do Dispatch (Central Rolamentos).
 *
 * Configuração salva no Firestore do tenant:
 *   erp: 'maxdata'
 *   erpConfig: { baseUrl, empId, terminal }
 *
 * Versão: 2.0.0
 * Atualizado: 2026-08-28
 */

class MaxDataAdapter extends ErpAdapter {

    // ─────────────────────────────────────────────────────────
    //  AUTENTICAÇÃO — JWT com cache de sessão
    // ─────────────────────────────────────────────────────────

    async _getToken() {
        if (this._tokenCache?.value &&
            new Date(this._tokenCache.expiresAt) > new Date(Date.now() + 120000)) {
            return this._tokenCache.value;
        }

        const empId    = Number(this.config.empId || 1);
        const terminal = (this.config.terminal || '').trim();

        if (!terminal) throw new Error('Terminal Maxdata não configurado. Acesse Integração ERP → Configurar.');

        this._log('info', `Autenticando no MaxData — empId: ${empId}`);

        const url  = this._buildUrl('auth');
        const resp = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ empId, terminal }),
            signal:  AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => resp.statusText);
            throw new Error(`MaxData Auth falhou (HTTP ${resp.status}): ${errText}`);
        }

        const data = await resp.json();
        if (!data.token) throw new Error('Token JWT não retornado pelo MaxData. Verifique o terminal.');

        this._tokenCache = {
            value:     data.token,
            expiresAt: new Date(data.expiration || Date.now() + 86400000)
        };

        this._log('success', `✅ Token JWT obtido — expira: ${new Date(this._tokenCache.expiresAt).toLocaleString('pt-BR')}`);
        return data.token;
    }

    async _authHeaders() {
        const token = await this._getToken();
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    }

    /**
     * Retorna a URL base da API.
     */
    _baseUrl() {
        return (this.config.baseUrl || this.config.apiUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/$/, '');
    }

    /**
     * Monta a URL para um endpoint.
     * Em HTTPS (produção Vercel), usa o proxy /api/maxdata para evitar mixed-content e CORS.
     */
    _buildUrl(endpoint, params = {}) {
        const configUrl = this._baseUrl();
        const isHttpsPage = typeof location !== 'undefined' && location.protocol === 'https:';
        const isHttpApi   = configUrl.startsWith('http://');

        if (isHttpsPage && isHttpApi) {
            const qs = new URLSearchParams({ _path: endpoint, ...params }).toString();
            return `/api/maxdata?${qs}`;
        }

        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
        return `${configUrl}/${endpoint}${qs}`;
    }

    // ─────────────────────────────────────────────────────────
    //  TESTE DE CONEXÃO
    // ─────────────────────────────────────────────────────────

    async testConnection() {
        this._log('info', 'Testando conexão com MaxData...');
        try {
            const token = await this._getToken();
            this._log('success', '✅ Conexão MaxData estabelecida com sucesso!');
            return { success: true, token };
        } catch (e) {
            this._log('error', `❌ Falha ao conectar: ${e.message}`);
            throw e;
        }
    }

    // ─────────────────────────────────────────────────────────
    //  CLIENTES — Fase 1
    // ─────────────────────────────────────────────────────────

    async syncClients() {
        this._log('info', '🔄 Iniciando sincronização de clientes MaxData...');
        const start = Date.now();

        try {
            const rawClients = await this._fetchAllClients();
            this._log('info', `${rawClients.length} cliente(s) recebido(s) da API. Normalizando...`);

            const current    = this._getLocalClients();
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
                    this._log('error', `Erro ao mapear cliente id=${raw?.id}: ${e.message}`);
                    errors++;
                }
            }

            const finalClients = Array.from(clientsMap.values());
            await this._saveFirestoreClients(finalClients);
            this._setLocalClients(finalClients);

            const duration = ((Date.now() - start) / 1000).toFixed(2);
            this._log('success', `✅ Clientes MaxData: ${added} novos, ${updated} atualizados, ${errors} erros — Total: ${finalClients.length} (${duration}s)`);

            if (typeof window.renderClientsList === 'function') window.renderClientsList();
            if (typeof window.renderClientList === 'function') window.renderClientList();

            return { added, updated, errors, total: finalClients.length, duration };

        } catch (e) {
            this._log('error', `❌ Falha na sincronização: ${e.message}`);
            throw e;
        }
    }

    async _fetchAllClients() {
        const headers = await this._authHeaders();
        const limit   = 100;
        let page      = 1;
        const all     = [];

        while (true) {
            const url = this._buildUrl('client', { page, limit });
            this._log('info', `Buscando página ${page} de clientes...`);

            const resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
            if (!resp.ok) throw new Error(`GET /client pág ${page}: HTTP ${resp.status}`);

            const data  = await resp.json();
            const items = Array.isArray(data) ? data : (data.docs || data.data || data.results || data.items || []);

            if (!items.length) break;
            all.push(...items);

            const totalPages = data.pages || Math.ceil((data.total || 0) / limit);
            if (totalPages && page >= totalPages) break;
            if (items.length < limit) break;
            page++;
        }

        return all;
    }

    /**
     * Mapeia dtos.Client (Maxdata) → formato interno do Dispatch.
     * enderecos: [{ cidade, bairro, uf, cep, endereco, numeroEndereco }]
     */
    _mapClient(raw) {
        const end    = (raw.enderecos && raw.enderecos.length > 0) ? raw.enderecos[0] : {};
        const nome   = (raw.nome || raw.fantasia || '').toUpperCase().trim();
        const cidade = (end.cidade || '').toUpperCase().trim();
        const bairro = (end.bairro || '').toUpperCase().trim();
        const phone  = (raw.telefone || raw.celular || '').replace(/\D/g, '');
        const logr   = [end.endereco, end.numeroEndereco].filter(Boolean).join(', ');

        return {
            codigo:     String(raw.id || ''),
            nome,
            fantasia:   (raw.fantasia || nome).toUpperCase().trim(),
            cidade,
            bairro,
            uf:         (end.uf || '').toUpperCase().trim(),
            cep:        (end.cep || '').replace(/\D/g, ''),
            endereco:   logr.toUpperCase().trim(),
            telefone:   phone,
            cnpj:       (raw.cpfCnpj || '').replace(/\D/g, ''),
            email:      (raw.email || '').toLowerCase().trim(),
            vendedorId: raw.vendedorPreferencialId ? String(raw.vendedorPreferencialId) : '',
            _source:    'maxdata',
            _syncedAt:  new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────────────────
    //  NOTAS FISCAIS / VENDAS — Integração com Cotação
    // ─────────────────────────────────────────────────────────

    /**
     * Busca vendas do Maxdata emitidas a partir de 28/08/2026 e consulta o número da NF-e na rota /fiscal/venda/{id}.
     */
    async fetchRecentSales(params = {}) {
        const headers = await this._authHeaders();
        const INCEPTION_DATE = '2026-08-28';
        const limit   = 50;
        let page      = 1;
        const validDocs = [];

        try {
            while (true) {
                const url = this._buildUrl('sale', { page, limit, ...params });
                const resp = await fetch(url, { method: 'GET', headers });
                if (!resp.ok) throw new Error(`GET /sale pág ${page} HTTP ${resp.status}`);

                const data = await resp.json();
                const docs = Array.isArray(data) ? data : (data.docs || data.data || []);
                if (!docs.length) break;

                let stopPagination = false;
                for (const s of docs) {
                    const saleDate = (s.abertura || s.data || s.fechamento || '').split('T')[0];
                    if (saleDate && saleDate < INCEPTION_DATE) {
                        stopPagination = true;
                        break;
                    }
                    if (s.status !== 'cancelada') {
                        validDocs.push(s);
                    }
                }

                if (stopPagination || docs.length < limit) break;
                page++;
                if (page > 10) break;
            }

            // Para cada venda encontrada, busca dados fiscais da NF-e via GET /fiscal/venda/{id} em paralelo
            const salesWithFiscal = await Promise.all(validDocs.map(async (sale) => {
                let fiscalData = null;
                try {
                    const fUrl = this._buildUrl(`fiscal/venda/${sale.id}`);
                    const fResp = await fetch(fUrl, { method: 'GET', headers });
                    if (fResp.ok) {
                        fiscalData = await fResp.json();
                    }
                } catch (_) {}
                return this._mapSale(sale, [], fiscalData);
            }));

            return salesWithFiscal;
        } catch (e) {
            this._log('error', `Erro ao buscar vendas do ERP: ${e.message}`);
            throw e;
        }
    }

    /**
     * Busca detalhes completos de uma venda (incluindo produtos, volumes e NF-e).
     */
    async getSale(saleId) {
        const headers = await this._authHeaders();
        try {
            const [saleResp, itemsResp, fiscalResp] = await Promise.all([
                fetch(this._buildUrl(`sale/${saleId}`), { method: 'GET', headers }),
                fetch(this._buildUrl(`sale/${saleId}/items`), { method: 'GET', headers }).catch(() => null),
                fetch(this._buildUrl(`fiscal/venda/${saleId}`), { method: 'GET', headers }).catch(() => null)
            ]);

            if (!saleResp.ok) throw new Error(`Venda #${saleId} não encontrada (HTTP ${saleResp.status})`);
            const saleData   = await saleResp.json();
            const itemsData  = itemsResp && itemsResp.ok ? await itemsResp.json() : [];
            const fiscalData = fiscalResp && fiscalResp.ok ? await fiscalResp.json() : null;
            const itemsList  = Array.isArray(itemsData) ? itemsData : (itemsData.docs || itemsData.data || []);

            return this._mapSale(saleData, itemsList, fiscalData);
        } catch (e) {
            this._log('error', `Erro ao buscar venda #${saleId}: ${e.message}`);
            throw e;
        }
    }

    /**
     * Mapeia venda do Maxdata para o formato esperado pela Cotação de Despacho.
     */
    _mapSale(raw, items = [], fiscal = null) {
        const totalNf = Number(fiscal?.vlrTotal || raw.totalNf || raw.vlrPago || raw.valorTotalLiquidoProduto || 0);
        const dataIso = raw.abertura || raw.data || raw.fechamento || new Date().toISOString();
        const dataFormatada = dataIso.split('T')[0];
        const horaEmissao = dataIso.includes('T') ? dataIso.split('T')[1].substring(0, 5) : '';

        // Número fiscal: extrai de fiscal/venda/{id} (nrNum) ou fallback
        let numeroFiscal = '';
        if (fiscal && fiscal.nrNum && Number(fiscal.nrNum) > 0) {
            numeroFiscal = String(fiscal.nrNum);
        } else if (raw.numeroNf || raw.nfe || raw.nrNf) {
            numeroFiscal = String(raw.numeroNf || raw.nfe || raw.nrNf);
        }

        // Cálculo de peso e volumes a partir dos itens (se houver)
        let totalPeso = Number(raw.peso || raw.pesoBruto || 0);
        let totalVolumes = Number(raw.volume || raw.volumes || raw.qtdeVolumes || 0);

        if (items.length > 0) {
            let somaPeso = 0;
            let somaQtde = 0;
            items.forEach(it => {
                const qtde = Number(it.qtde || 1);
                somaQtde += qtde;
                if (it.peso || it.pesoBruto || it.pesoLiquido) {
                    somaPeso += Number(it.peso || it.pesoBruto || it.pesoLiquido) * qtde;
                }
            });
            if (!totalPeso && somaPeso > 0) totalPeso = somaPeso;
            if (!totalVolumes && somaQtde > 0) totalVolumes = Math.max(1, Math.ceil(somaQtde / 5)); // estimativa se não houver
        }

        return {
            id:           String(raw.id || ''),
            numeroPedido: String(raw.id || ''),
            numeroNf:     numeroFiscal,
            chaveNfe:     fiscal?.chave || '',
            serieNfe:     fiscal?.serie || '1',
            dataEmissao:  dataFormatada,
            horaEmissao,
            clienteId:    String(raw.clienteId || ''),
            clienteNome:  (raw.clienteNome || '').toUpperCase().trim(),
            cpfCnpj:      (raw.cpfCnpj || '').replace(/\D/g, ''),
            telefone:     raw.clienteTelefone || raw.clienteCelular || '',
            valorTotal:   Number(totalNf.toFixed(2)),
            peso:         totalPeso > 0 ? Number(totalPeso.toFixed(3)) : null,
            volumes:      totalVolumes > 0 ? totalVolumes : null,
            observacoes:  (raw.msg || '').trim(),
            vendedor:     raw.atendenteId ? String(raw.atendenteId) : (raw.separadorNome || ''),
            status:       raw.status || 'finalizada',
            statusEntrega: raw.statusEntrega || '',
            itens:        items.map(it => ({
                id:        it.id || it.produtoId,
                descricao: it.descricaoProduto || '',
                codigoFab: it.codigoFab || '',
                qtde:      Number(it.qtde || 1),
                valor:     Number(it.valor || 0),
                un:        it.un || 'UN'
            })),
            _source:      'maxdata'
        };
    }

    async syncProducts()            { this._log('info', 'syncProducts: fora de escopo.'); return { added: 0, updated: 0, errors: 0 }; }
    async syncOrders()              { return this.fetchRecentSales(); }
    async syncNFs(filters = {})     { return this.fetchRecentSales(filters); }
    async confirmDispatch(nfData)   { this._log('info', 'confirmDispatch: fora de escopo.'); return { success: true }; }


    // ─────────────────────────────────────────────────────────
    //  HELPERS — Firestore + localStorage
    // ─────────────────────────────────────────────────────────

    async _saveFirestoreClients(clients) {
        try {
            if (typeof Utils !== 'undefined' && Utils.Cloud && Utils.Cloud.save) {
                await Utils.Cloud.save('clients', clients);
            } else {
                const db     = firebase.firestore();
                const chunks = this._chunk(clients, 500);
                for (const chunk of chunks) {
                    await db.collection(`tenants/${this.tenantId}/data`).doc('clients')
                        .set({ items: chunk, updatedAt: new Date().toISOString() }, { merge: true });
                }
            }
        } catch (e) { this._log('warning', `Aviso Firestore: ${e.message}`); }
    }

    _getLocalClients() {
        try {
            // Tenta sessionStorage primeiro (dados do ERP não persistem entre sessões — ok)
            const ss = sessionStorage.getItem('_erp_clients_maxdata');
            if (ss) return JSON.parse(ss);
            // Fallback para Utils.getStorage (localStorage com prefixo de tenant)
            if (typeof Utils !== 'undefined' && Utils.getStorage) return Utils.getStorage('clients') || [];
            const r = localStorage.getItem('clients');
            return r ? JSON.parse(r) : [];
        } catch { return []; }
    }

    _setLocalClients(clients) {
        try {
            // v3.22.17 FIX: Usa sessionStorage para evitar QuotaExceededError no localStorage.
            // Clientes do Maxdata (até 860+ registros) pesam vários KB e podem encher o quota.
            // sessionStorage é limpo automaticamente ao fechar o browser — sem problema de acúmulo.
            sessionStorage.setItem('_erp_clients_maxdata', JSON.stringify(clients));

            // Também tenta salvar em Utils (com catch para não travar se cheio)
            if (typeof Utils !== 'undefined' && Utils.saveRaw) {
                try { Utils.saveRaw('clients', JSON.stringify(clients)); } catch (_) { /* quota cheio — silencioso */ }
            }
        } catch (e) {
            this._log('warning', `Aviso ao salvar clientes localmente: ${e.message}`);
        }
    }

    _chunk(arr, size) {
        const r = [];
        for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
        return r;
    }

    // ─────────────────────────────────────────────────────────
    //  LOG
    // ─────────────────────────────────────────────────────────

    _log(type, message, details = null) {
        const prefix = `[MaxDataAdapter:${this.tenantId || '?'}]`;
        if (type === 'error')        console.error(prefix, message, details || '');
        else if (type === 'warning') console.warn(prefix,  message, details || '');
        else                         console.log(prefix,   message, details || '');

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('erp:log', {
                detail: { type, message, details, tenant: this.tenantId, provider: 'maxdata' }
            }));
        }
    }
}

if (typeof window !== 'undefined') {
    window.MaxDataAdapter = MaxDataAdapter;
}

/**
 * ACONTEC INTEGRATION MODULE
 * Sistema de integração com API Acontec para sincronização de clientes
 * Version: 1.0.0
 * Created: 2026-01-13
 */

const AcontecIntegration = {
    // Configurações da API (salvas em localStorage)
    config: {
        apiUrl: '',
        apiToken: '',
        autoSync: false,
        syncInterval: 60, // minutos
        lastSync: null,
        enabled: false
    },

    // Estatísticas de sincronização
    stats: {
        totalSynced: 0,
        totalErrors: 0,
        lastSyncDate: null,
        clientsAdded: 0,
        clientsUpdated: 0
    },

    // Logs de sincronização
    logs: [],

    /**
     * Inicializa o módulo de integração
     */
    init() {
        console.log('🔌 Inicializando Acontec Integration...');
        this.loadConfig();
        this.loadStats();
        this.loadLogs();

        if (this.config.enabled && this.config.autoSync) {
            this.startAutoSync();
        }
    },

    /**
     * Carrega configurações do localStorage (dados não-sensíveis)
     * O apiToken é armazenado em sessionStorage (não persiste entre sessões)
     * para reduzir o risco de exposição via XSS.
     */
    loadConfig() {
        // Carrega config geral (URL, intervalo, autoSync) — não-sensível
        const saved = localStorage.getItem('acontec_config');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Nunca carrega o token do localStorage (segurança)
                delete parsed.apiToken;
                this.config = { ...this.config, ...parsed };
            } catch (e) {
                if (typeof SecureLogger !== 'undefined') {
                    SecureLogger.error('Erro ao carregar config Acontec:', e);
                }
            }
        }
        // Carrega o token da sessionStorage (válido apenas para esta aba/sessão)
        const sessionToken = sessionStorage.getItem('acontec_api_token');
        if (sessionToken) {
            this.config.apiToken = sessionToken;
        }
    },

    /**
     * Salva configurações:
     *   - apiToken → sessionStorage (não persiste após fechar o navegador)
     *   - demais campos → localStorage (persistência normal, sem token)
     */
    saveConfig() {
        // Isola o token antes de salvar no localStorage
        const { apiToken, ...safePart } = this.config;
        localStorage.setItem('acontec_config', JSON.stringify(safePart));
        // Token salvo na session (morre quando a aba/browser fecha)
        if (apiToken) {
            sessionStorage.setItem('acontec_api_token', apiToken);
        } else {
            sessionStorage.removeItem('acontec_api_token');
        }
    },

    /**
     * Carrega estatísticas
     */
    loadStats() {
        const saved = localStorage.getItem('acontec_stats');
        if (saved) {
            try {
                this.stats = { ...this.stats, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Erro ao carregar stats Acontec:', e);
            }
        }
    },

    /**
     * Salva estatísticas
     */
    saveStats() {
        localStorage.setItem('acontec_stats', JSON.stringify(this.stats));
    },

    /**
     * Carrega logs históricos
     */
    loadLogs() {
        const saved = localStorage.getItem('acontec_logs');
        if (saved) {
            try {
                this.logs = JSON.parse(saved);
                // Manter apenas últimos 100 logs
                if (this.logs.length > 100) {
                    this.logs = this.logs.slice(-100);
                }
            } catch (e) {
                console.error('Erro ao carregar logs Acontec:', e);
                this.logs = [];
            }
        }
    },

    /**
     * Salva logs
     */
    saveLogs() {
        localStorage.setItem('acontec_logs', JSON.stringify(this.logs));
    },

    /**
     * Adiciona entrada no log
     */
    addLog(type, message, details = null) {
        const log = {
            timestamp: new Date().toISOString(),
            type, // 'success', 'error', 'info', 'warning'
            message,
            details
        };
        this.logs.push(log);
        this.saveLogs();

        // Notificar UI se houver callback registrado
        if (window.onAcontecLogUpdate) {
            window.onAcontecLogUpdate(log);
        }
    },

    /**
     * Testa conexão com API Acontec
     */
    async testConnection() {
        this.addLog('info', 'Testando conexão com API Acontec...');

        if (!this.config.apiUrl || !this.config.apiToken) {
            this.addLog('error', 'URL da API ou Token não configurados');
            throw new Error('Configuração incompleta');
        }

        try {
            const response = await fetch(`${this.config.apiUrl}/health`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.addLog('success', 'Conexão com API estabelecida com sucesso', data);
            return { success: true, data };

        } catch (error) {
            this.addLog('error', 'Falha ao conectar com API Acontec', error.message);
            throw error;
        }
    },

    /**
     * Busca clientes da API Acontec
     */
    async fetchClients(page = 1, limit = 100) {
        if (!this.config.apiUrl || !this.config.apiToken) {
            throw new Error('API não configurada');
        }

        try {
            const url = new URL(`${this.config.apiUrl}/clientes`);
            url.searchParams.append('page', page);
            url.searchParams.append('limit', limit);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            this.addLog('error', `Erro ao buscar clientes (página ${page})`, error.message);
            throw error;
        }
    },

    /**
     * Mapeia dados da Acontec para formato ParreiraLog
     */
    mapAcontecToParreiraLog(acontecClient) {
        // Formato esperado do Acontec (ajustar conforme API real)
        // {
        //   id: "123",
        //   razao_social: "Nome do Cliente LTDA",
        //   nome_fantasia: "Nome Fantasia",
        //   cnpj: "12.345.678/0001-90",
        //   telefone: "(91) 9 1234-5678",
        //   endereco: {
        //     logradouro: "Rua Exemplo",
        //     numero: "100",
        //     bairro: "Centro",
        //     cidade: "Belém",
        //     estado: "PA",
        //     cep: "66000-000"
        //   }
        // }

        // Normalizar telefone (remover caracteres especiais)
        let phone = '';
        if (acontecClient.telefone) {
            phone = acontecClient.telefone.replace(/\D/g, '');
        } else if (acontecClient.celular) {
            phone = acontecClient.celular.replace(/\D/g, '');
        }

        // Normalizar nome (uppercase)
        const nome = (acontecClient.razao_social || acontecClient.nome_fantasia || acontecClient.nome || '').toUpperCase();

        // Normalizar cidade
        const cidade = (acontecClient.endereco?.cidade || acontecClient.cidade || 'N/I').toUpperCase();

        // Normalizar bairro
        const bairro = (acontecClient.endereco?.bairro || acontecClient.bairro || '-').toUpperCase();

        // Formato ParreiraLog
        return {
            codigo: acontecClient.id || acontecClient.codigo || '',
            nome: nome,
            cidade: cidade,
            bairro: bairro,
            telefone: phone,
            // Metadados extras (opcionais)
            _source: 'acontec',
            _syncedAt: new Date().toISOString(),
            _cnpj: acontecClient.cnpj || '',
            _email: acontecClient.email || ''
        };
    },

    /**
     * Sincroniza clientes da Acontec com ParreiraLog
     */
    async syncClients(showProgress = true) {
        this.addLog('info', '🔄 Iniciando sincronização de clientes...');

        const startTime = Date.now();
        let totalFetched = 0;
        let totalAdded = 0;
        let totalUpdated = 0;
        let errors = 0;

        try {
            // Obter clientes atuais do ParreiraLog
            const currentClients = Utils.getStorage('clients') || [];
            const clientsMap = new Map(currentClients.map(c => [c.codigo, c]));

            // Buscar clientes da Acontec (paginado)
            let page = 1;
            let hasMore = true;
            const newClients = [];

            while (hasMore) {
                if (showProgress && window.updateAcontecProgress) {
                    window.updateAcontecProgress(`Buscando página ${page}...`);
                }

                try {
                    const response = await this.fetchClients(page, 100);

                    // Ajustar conforme estrutura real da API
                    const clients = response.data || response.clientes || response;

                    if (!Array.isArray(clients) || clients.length === 0) {
                        hasMore = false;
                        break;
                    }

                    // Mapear e processar clientes
                    for (const acontecClient of clients) {
                        try {
                            const mappedClient = this.mapAcontecToParreiraLog(acontecClient);

                            if (!mappedClient.codigo || !mappedClient.nome) {
                                this.addLog('warning', `Cliente sem código ou nome válido ignorado`, acontecClient);
                                continue;
                            }

                            const existing = clientsMap.get(mappedClient.codigo);

                            if (existing) {
                                // Atualizar cliente existente
                                clientsMap.set(mappedClient.codigo, { ...existing, ...mappedClient });
                                totalUpdated++;
                            } else {
                                // Adicionar novo cliente
                                clientsMap.set(mappedClient.codigo, mappedClient);
                                totalAdded++;
                            }

                            totalFetched++;

                        } catch (mapError) {
                            this.addLog('error', 'Erro ao mapear cliente', mapError.message);
                            errors++;
                        }
                    }

                    // Verificar se há mais páginas
                    hasMore = response.hasMore || response.has_next || (clients.length >= 100);
                    page++;

                } catch (pageError) {
                    this.addLog('error', `Erro ao processar página ${page}`, pageError.message);
                    errors++;
                    hasMore = false;
                }
            }

            // Converter Map de volta para Array
            const finalClients = Array.from(clientsMap.values());

            // Salvar no localStorage
            Utils.saveRaw('clients', JSON.stringify(finalClients));

            // Salvar na nuvem se disponível
            if (Utils.Cloud && Utils.Cloud.save) {
                try {
                    await Utils.Cloud.save('clients', finalClients);
                } catch (cloudError) {
                    this.addLog('warning', 'Erro ao salvar na nuvem', cloudError.message);
                }
            }

            // Atualizar estatísticas
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            this.stats.totalSynced = totalFetched;
            this.stats.clientsAdded = totalAdded;
            this.stats.clientsUpdated = totalUpdated;
            this.stats.totalErrors = errors;
            this.stats.lastSyncDate = new Date().toISOString();
            this.config.lastSync = new Date().toISOString();
            this.saveStats();
            this.saveConfig();

            const message = `✅ Sincronização concluída: ${totalAdded} novos, ${totalUpdated} atualizados, ${errors} erros em ${duration}s`;
            this.addLog('success', message, {
                totalFetched,
                totalAdded,
                totalUpdated,
                errors,
                duration
            });

            // Atualizar UI se houver callback
            if (window.renderClientList) {
                window.renderClientList();
            }

            return {
                success: true,
                totalFetched,
                totalAdded,
                totalUpdated,
                errors,
                duration
            };

        } catch (error) {
            const message = `❌ Falha na sincronização: ${error.message}`;
            this.addLog('error', message, error);
            this.stats.totalErrors++;
            this.saveStats();
            throw error;
        }
    },

    /**
     * Inicia sincronização automática periódica
     */
    startAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
        }

        const intervalMs = this.config.syncInterval * 60 * 1000;
        this.addLog('info', `Sincronização automática ativada (a cada ${this.config.syncInterval} min)`);

        this.autoSyncTimer = setInterval(async () => {
            try {
                this.addLog('info', 'Sincronização automática iniciada...');
                await this.syncClients(false);
            } catch (error) {
                this.addLog('error', 'Erro na sincronização automática', error.message);
            }
        }, intervalMs);
    },

    /**
     * Para sincronização automática
     */
    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            this.addLog('info', 'Sincronização automática desativada');
        }
    },

    /**
     * Limpa logs antigos
     */
    clearLogs() {
        this.logs = [];
        this.saveLogs();
        this.addLog('info', 'Logs limpos');
    },

    /**
     * Reseta estatísticas
     */
    resetStats() {
        this.stats = {
            totalSynced: 0,
            totalErrors: 0,
            lastSyncDate: null,
            clientsAdded: 0,
            clientsUpdated: 0
        };
        this.saveStats();
        this.addLog('info', 'Estatísticas resetadas');
    }
};

// Inicializar ao carregar
if (typeof window !== 'undefined') {
    window.AcontecIntegration = AcontecIntegration;

    // Auto-inicializar quando documento estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AcontecIntegration.init());
    } else {
        AcontecIntegration.init();
    }
}

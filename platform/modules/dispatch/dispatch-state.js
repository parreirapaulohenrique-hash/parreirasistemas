/**
 * DISPATCH STATE — Estado Global Centralizado
 * Arquivo: platform/modules/dispatch/dispatch-state.js
 * Versão:  1.0.0 | 2026-06-17
 *
 * PROPÓSITO:
 *   Substitui progressivamente as variáveis de closure espalhadas no app.js
 *   (clients, rules, carrierList, carrierConfigs, carrierInfo, currentUser,
 *   users, sellers) por um objeto centralizado com controle de mudanças.
 *
 * USO:
 *   // Ler estado
 *   const lista = AppState.get('carrierList');
 *
 *   // Escrever estado (notifica todos os listeners)
 *   AppState.set('carrierList', novaLista);
 *
 *   // Reagir a mudanças
 *   AppState.onChange('carrierList', (novo, anterior) => {
 *       renderCarrierConfigs();
 *   });
 *
 *   // Sincronizar tudo do localStorage de uma vez
 *   AppState.syncFromStorage();
 *
 * COMPATIBILIDADE:
 *   Esta versão 1.0 é ADITIVA — não remove nada do app.js.
 *   O app.js continua funcionando com suas variáveis de closure.
 *   Os módulos extraídos futuramente usarão AppState em vez das closures.
 */

(function (global) {
    'use strict';

    // ============================================================
    // ESTADO INICIAL — espelha as variáveis de closure do app.js
    // ============================================================
    const _initialState = {
        // Dados operacionais
        clients:        [],     // Array de clientes cadastrados
        rules:          [],     // Array de tabelas de frete (freight_tables)
        carrierList:    [],     // Array de nomes das transportadoras
        carrierConfigs: {},     // Object: configs financeiras por transportadora
        carrierInfo:    {},     // Object: dados cadastrais por transportadora (carrier_info_v2)
        companyData:    null,   // Object: dados da empresa emissora

        // Sessão
        currentUser:    null,   // Object: usuário logado {name, login, role}
        users:          [],     // Array de usuários do sistema
        sellers:        [],     // Array de vendedores cadastrados

        // Configurações
        appSettings:    {       // Configurações de automação WA
            wa_auto_seller: true,
            wa_auto_client: false
        },

        // Flags de UI
        activeCarrier:  '',     // String: transportadora ativa no filtro de tabelas
        appReady:       false   // Boolean: app totalmente inicializado
    };

    // ============================================================
    // APPSTATE — Objeto público centralizado
    // ============================================================
    const AppState = {
        _data:      Object.assign({}, _initialState),
        _listeners: {},

        /**
         * Lê um valor do estado.
         * @param {string} key - Chave do estado
         * @returns {*} Valor atual
         */
        get(key) {
            return this._data[key];
        },

        /**
         * Escreve um valor no estado e notifica todos os listeners registrados.
         * @param {string} key   - Chave do estado
         * @param {*}     value  - Novo valor
         */
        set(key, value) {
            const previous = this._data[key];
            this._data[key] = value;
            this._notify(key, value, previous);
        },

        /**
         * Registra um callback para ser chamado quando uma chave mudar.
         * @param {string}   key - Chave a observar
         * @param {Function} fn  - Callback: fn(novoValor, valorAnterior)
         * @returns {Function}   - Função de cancelamento (unsubscribe)
         */
        onChange(key, fn) {
            if (!this._listeners[key]) this._listeners[key] = [];
            this._listeners[key].push(fn);
            // Retorna função de cancelamento
            return () => {
                this._listeners[key] = this._listeners[key].filter(f => f !== fn);
            };
        },

        /**
         * Dispara todos os listeners de uma chave.
         * @private
         */
        _notify(key, value, previous) {
            const fns = this._listeners[key] || [];
            fns.forEach(fn => {
                try {
                    fn(value, previous);
                } catch (e) {
                    console.error(`[AppState] Erro no listener de '${key}':`, e);
                }
            });
        },

        /**
         * Sincroniza o AppState com os dados atuais do localStorage.
         * Deve ser chamado após Utils.Cloud.loadAll() ou após o login.
         *
         * IMPORTANTE: Requer que Utils esteja carregado antes deste arquivo.
         */
        syncFromStorage() {
            if (typeof Utils === 'undefined') {
                console.warn('[AppState] Utils não disponível — syncFromStorage ignorado.');
                return;
            }

            // Dados operacionais
            const clients = Utils.getStorage('clients');
            if (clients && Array.isArray(clients)) this.set('clients', clients);

            const rules = Utils.getStorage('freight_tables');
            if (rules && Array.isArray(rules)) this.set('rules', rules);

            let carrierList = Utils.getStorage('carrier_list');
            if (!Array.isArray(carrierList)) carrierList = [];
            this.set('carrierList', carrierList);

            let carrierConfigs = Utils.getStorage('carrier_configs');
            if (!carrierConfigs || typeof carrierConfigs !== 'object' || Array.isArray(carrierConfigs)) {
                carrierConfigs = {};
            }
            this.set('carrierConfigs', carrierConfigs);

            let carrierInfo = Utils.getStorage('carrier_info_v2');
            if (!carrierInfo || Array.isArray(carrierInfo)) carrierInfo = {};
            this.set('carrierInfo', carrierInfo);

            const companyData = Utils.getStorage('company_data');
            if (companyData) this.set('companyData', companyData);

            // Sessão
            const users = Utils.getStorage('app_users');
            if (users && Array.isArray(users)) this.set('users', users);

            const sellers = Utils.getStorage('app_sellers');
            if (sellers && Array.isArray(sellers)) this.set('sellers', sellers);

            const currentUser = Utils.getStorage('logged_user');
            if (currentUser && currentUser.login) this.set('currentUser', currentUser);

            // Configurações
            const settings = Utils.getStorage('app_settings');
            if (settings) this.set('appSettings', settings);

            if (typeof SecureLogger !== 'undefined') {
                SecureLogger.log(
                    `[AppState] syncFromStorage: ` +
                    `${this._data.carrierList.length} transportadoras, ` +
                    `${this._data.rules.length} tabelas, ` +
                    `${this._data.clients.length} clientes`
                );
            }
        },

        /**
         * Retorna um snapshot do estado atual (cópia profunda parcial).
         * Útil para debug no console F12: AppState.snapshot()
         */
        snapshot() {
            return {
                carrierList:    [...(this._data.carrierList || [])],
                rules:          (this._data.rules || []).length,
                clients:        (this._data.clients || []).length,
                currentUser:    this._data.currentUser
                    ? `${this._data.currentUser.login} (${this._data.currentUser.role})`
                    : null,
                sellers:        (this._data.sellers || []).length,
                users:          (this._data.users || []).length,
                appReady:       this._data.appReady
            };
        },

        /**
         * Reseta o estado para os valores iniciais (usado no logout).
         */
        reset() {
            Object.assign(this._data, _initialState);
            // Notifica todas as chaves resetadas
            Object.keys(_initialState).forEach(key => {
                this._notify(key, this._data[key], undefined);
            });
            if (typeof SecureLogger !== 'undefined') {
                SecureLogger.log('[AppState] Estado resetado (logout).');
            }
        }
    };

    // ============================================================
    // EXPOSIÇÃO GLOBAL
    // ============================================================
    global.AppState = AppState;

    // Disponível no console para debug:
    // AppState.snapshot() — mostra resumo do estado atual
    // AppState.get('carrierList') — lê uma chave específica
    // AppState.syncFromStorage() — força sincronização com localStorage

    if (typeof SecureLogger !== 'undefined') {
        SecureLogger.log('✅ [AppState] dispatch-state.js carregado. Use AppState.snapshot() para diagnóstico.');
    } else {
        console.log('✅ [AppState] dispatch-state.js carregado.');
    }

})(window);

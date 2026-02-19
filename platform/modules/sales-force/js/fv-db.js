// ===========================================
// Força de Vendas 2.1 — IndexedDB Layer
// Substitui localStorage por IndexedDB
// Suporte offline robusto + fila de sync
// ===========================================

const FVDB = (() => {
    const DB_NAME = 'ForcaVendasDB';
    const DB_VERSION = 1;
    let db = null;

    // ---- Store Definitions ----
    const STORES = {
        clientes: { keyPath: 'cnpjCpf' },
        produtos: { keyPath: 'sku' },
        pedidos: { keyPath: 'id' },
        pedidoItens: { keyPath: 'id', autoIncrement: true },
        precos: { keyPath: ['codigoProduto', 'regiao', 'codEmpresa'] },
        precosQuantidade: { keyPath: ['codigoProduto', 'regiao', 'seq'] },
        formaPag: { keyPath: 'id' },
        transportadoras: { keyPath: 'id' },
        empresas: { keyPath: 'codEmpresa' },
        estoque: { keyPath: ['codEmpresa', 'codigoProduto'] },
        contasReceber: { keyPath: ['empresa', 'pedido', 'parcela'] },
        usuarios: { keyPath: 'codigo' },
        rotas: { keyPath: 'id' },
        grupos: { keyPath: 'id' },
        config: { keyPath: 'id' },
        syncQueue: { keyPath: 'id', autoIncrement: true },
        meta: { keyPath: 'key' }    // key-value store for misc (lastSync, etc.)
    };

    // ---- Index Definitions ----
    const INDEXES = {
        clientes: [
            { name: 'by_codEmpresa', keyPath: 'codEmpresa', unique: false },
            { name: 'by_rota', keyPath: 'rota', unique: false },
            { name: 'by_status', keyPath: 'status', unique: false },
            { name: 'by_cidade', keyPath: 'cidade', unique: false }
        ],
        produtos: [
            { name: 'by_grupo', keyPath: 'grupo', unique: false },
            { name: 'by_ean13', keyPath: 'ean13', unique: false }
        ],
        pedidos: [
            { name: 'by_clienteId', keyPath: 'clienteCnpjCpf', unique: false },
            { name: 'by_status', keyPath: 'status', unique: false },
            { name: 'by_data', keyPath: 'data', unique: false },
            { name: 'by_codEmpresa', keyPath: 'codEmpresa', unique: false },
            { name: 'by_sincronizado', keyPath: 'sincronizado', unique: false }
        ],
        pedidoItens: [
            { name: 'by_pedidoId', keyPath: 'pedidoId', unique: false }
        ],
        precos: [
            { name: 'by_produto', keyPath: 'codigoProduto', unique: false }
        ],
        contasReceber: [
            { name: 'by_cliente', keyPath: 'codCliente', unique: false },
            { name: 'by_vencimento', keyPath: 'dtVenc', unique: false }
        ],
        syncQueue: [
            { name: 'by_tipo', keyPath: 'tipo', unique: false },
            { name: 'by_status', keyPath: 'status', unique: false }
        ],
        estoque: [
            { name: 'by_produto', keyPath: 'codigoProduto', unique: false }
        ]
    };

    // ---- Open Database ----
    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                for (const [storeName, config] of Object.entries(STORES)) {
                    if (!database.objectStoreNames.contains(storeName)) {
                        const store = database.createObjectStore(storeName, config);

                        // Create indexes
                        if (INDEXES[storeName]) {
                            for (const idx of INDEXES[storeName]) {
                                store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
                            }
                        }
                    }
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                db.onversionchange = () => { db.close(); db = null; };
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('[FVDB] Error opening database:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // ---- Generic CRUD ----
    async function put(storeName, data) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function putMany(storeName, items) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            let count = 0;
            for (const item of items) {
                const req = store.put(item);
                req.onsuccess = () => { count++; };
                req.onerror = () => reject(req.error);
            }
            tx.oncomplete = () => resolve(count);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function get(storeName, key) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAll(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function remove(storeName, key) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function clear(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function count(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ---- Index Query ----
    async function queryByIndex(storeName, indexName, value) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // ---- Sync Queue ----
    async function enqueueSync(tipo, dados) {
        return put('syncQueue', {
            tipo,       // 'pedido', 'cliente', 'preVenda'
            dados,
            status: 'pendente',
            tentativas: 0,
            criadoEm: new Date().toISOString(),
            ultimaTentativa: null
        });
    }

    async function getPendingSync() {
        return queryByIndex('syncQueue', 'by_status', 'pendente');
    }

    async function markSyncProcessed(id) {
        const item = await get('syncQueue', id);
        if (item) {
            item.status = 'enviado';
            item.ultimaTentativa = new Date().toISOString();
            return put('syncQueue', item);
        }
    }

    async function markSyncFailed(id) {
        const item = await get('syncQueue', id);
        if (item) {
            item.status = 'erro';
            item.tentativas++;
            item.ultimaTentativa = new Date().toISOString();
            // Re-enqueue if < 5 attempts
            if (item.tentativas < 5) item.status = 'pendente';
            return put('syncQueue', item);
        }
    }

    async function clearProcessedSync() {
        const all = await getAll('syncQueue');
        const processed = all.filter(i => i.status === 'enviado');
        for (const item of processed) {
            await remove('syncQueue', item.id);
        }
        return processed.length;
    }

    // ---- Meta (key-value) ----
    async function getMeta(key) {
        const result = await get('meta', key);
        return result ? result.value : null;
    }

    async function setMeta(key, value) {
        return put('meta', { key, value });
    }

    // ---- Migration from localStorage ----
    async function migrateFromLocalStorage() {
        const FV_STORAGE_KEY = 'fv_data';
        const raw = localStorage.getItem(FV_STORAGE_KEY);
        if (!raw) return false;

        const migrated = await getMeta('migrated_from_ls');
        if (migrated) return false; // Already migrated

        console.log('[FVDB] Migrating from localStorage...');
        try {
            const data = JSON.parse(raw);

            // Migrate clientes — add cnpjCpf as key if missing
            if (data.clientes && data.clientes.length) {
                const clientes = data.clientes.map(c => ({
                    ...c,
                    cnpjCpf: c.cnpjCpf || c.cpfCnpj || `CLI-${c.id}`,
                    codEmpresa: c.codEmpresa || '01',
                    tipoCliente: c.tipo === 'PJ' ? 'JURIDICA' : 'FISICA',
                    razaoSocial: c.nome,
                    fantasia: c.nomeFantasia || c.nome,
                    inscEstadual: c.ie || '',
                    celular: '',
                    comprador: '',
                    pedidoNaoFaturado: 0,
                    flagNovo: 'N',
                    flagAlter: 'N',
                    visita: '',
                    sincronizar: 0
                }));
                await putMany('clientes', clientes);
            }

            // Migrate produtos — expand fields
            if (data.produtos && data.produtos.length) {
                const produtos = data.produtos.map(p => ({
                    ...p,
                    ipi: 0,
                    descontoMaxProd: 100,
                    unidadeMaster: p.unidade,
                    qtUnitCx: 1,
                    ean13: '',
                    descricaoCompleta: p.nome,
                    imagem: '',
                    flagNovo: 'N',
                    flagAlter: 'N'
                }));
                await putMany('produtos', produtos);
            }

            // Migrate pedidos — expand fields
            if (data.pedidos && data.pedidos.length) {
                const pedidos = data.pedidos.map(p => ({
                    ...p,
                    clienteCnpjCpf: '',
                    codEmpresa: '01',
                    totalIpi: 0,
                    stpPedido: 'Pre-Venda',
                    porDesconto: 0,
                    statusNota: '',
                    valorFlex: 0,
                    sincronizado: 'N',
                    flagEnvio: 'N',
                    codfornecTransp: 0
                }));
                await putMany('pedidos', pedidos);
            }

            // Migrate tabelas de preço → formato Acontec
            if (data.tabelasPreco && data.tabelasPreco.length) {
                // Keep in formaPag-like structure for now
                await setMeta('tabelasPrecoLegacy', data.tabelasPreco);
            }

            // Migrate transportadoras
            if (data.transportadoras && data.transportadoras.length) {
                await putMany('transportadoras', data.transportadoras);
            }

            // Migrate planosPagamento → formaPag
            if (data.planosPagamento && data.planosPagamento.length) {
                const formas = data.planosPagamento.map(p => ({
                    ...p,
                    descPag: p.nome,
                    especiePag: p.codigo,
                    precoDesc: 0,
                    precoAcrec: 0,
                    vlVendaMin: 0
                }));
                await putMany('formaPag', formas);
            }

            // Default empresa
            await put('empresas', {
                codEmpresa: '01',
                nome: data.configEmpresa?.nome || 'Parreira Distribuidora',
                cnpj: data.configEmpresa?.cnpj || '00.000.000/0001-00',
                telefone: ''
            });

            // Save lastSync
            if (data.lastSync) {
                await setMeta('lastSync', data.lastSync);
            }

            await setMeta('migrated_from_ls', new Date().toISOString());
            console.log('[FVDB] Migration complete!');
            return true;
        } catch (err) {
            console.error('[FVDB] Migration error:', err);
            return false;
        }
    }

    // ---- Load all data into fvData object (compatibility layer) ----
    async function loadAllToMemory() {
        const [clientes, produtos, pedidos, formaPag, transportadoras, empresas, estoque, contasReceber] = await Promise.all([
            getAll('clientes'),
            getAll('produtos'),
            getAll('pedidos'),
            getAll('formaPag'),
            getAll('transportadoras'),
            getAll('empresas'),
            getAll('estoque'),
            getAll('contasReceber')
        ]);

        const lastSync = await getMeta('lastSync');
        const queueCount = await count('syncQueue');

        return {
            clientes,
            produtos,
            pedidos,
            planosPagamento: formaPag,
            transportadoras,
            empresas,
            estoque,
            titulosAbertos: contasReceber,
            configEmpresa: empresas[0] || { codEmpresa: '01', nome: 'Parreira Distribuidora', cnpj: '00.000.000/0001-00' },
            lastSync,
            syncQueueCount: queueCount
        };
    }

    // ---- Save fvData back to IndexedDB (compatibility layer) ----
    async function saveFromMemory(fvData) {
        const promises = [];
        if (fvData.clientes?.length) promises.push(putMany('clientes', fvData.clientes));
        if (fvData.produtos?.length) promises.push(putMany('produtos', fvData.produtos));
        if (fvData.pedidos?.length) promises.push(putMany('pedidos', fvData.pedidos));
        if (fvData.planosPagamento?.length) promises.push(putMany('formaPag', fvData.planosPagamento));
        if (fvData.transportadoras?.length) promises.push(putMany('transportadoras', fvData.transportadoras));
        await Promise.all(promises);
    }

    // ---- Public API ----
    return {
        open,
        put, putMany, get, getAll, remove, clear, count,
        queryByIndex,
        enqueueSync, getPendingSync, markSyncProcessed, markSyncFailed, clearProcessedSync,
        getMeta, setMeta,
        migrateFromLocalStorage,
        loadAllToMemory, saveFromMemory,
        STORES
    };
})();

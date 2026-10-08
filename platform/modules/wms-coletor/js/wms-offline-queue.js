// =============================================================================
// wms-offline-queue.js — Fila de Ações Offline (Outbox Pattern com IndexedDB)
// WMS Coletor — Parreira Sistemas
// =============================================================================
// Garante que nenhuma bipagem ou contagem física seja perdida quando o operador
// entrar em zonas sem sinal Wi-Fi no galpão logístico.
// =============================================================================

(function () {
    'use strict';

    const DB_NAME = 'WmsCollectorDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'outboxQueue';

    let _dbPromise = null;
    let _isFlushing = false;

    function _openDb() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('[WmsOfflineQueue] IndexedDB não suportado. Usando fallback localStorage.');
                return resolve(null);
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => {
                console.warn('[WmsOfflineQueue] Erro ao abrir IndexedDB:', e);
                resolve(null);
            };
        });
        return _dbPromise;
    }

    // Fallback LocalStorage
    function _getLsQueue() {
        try {
            return JSON.parse(localStorage.getItem('wms_outbox_fallback') || '[]');
        } catch (_) { return []; }
    }
    function _saveLsQueue(q) {
        try {
            localStorage.setItem('wms_outbox_fallback', JSON.stringify(q));
        } catch (_) {}
    }

    async function enqueue(type, payload) {
        const item = {
            id: 'OUTBOX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            type,
            payload,
            criadoEm: new Date().toISOString(),
            tentativas: 0,
            status: 'PENDENTE'
        };

        const db = await _openDb();
        if (db) {
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).put(item);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch (e) {
                    console.warn('[WmsOfflineQueue] Falha tx put:', e);
                    resolve();
                }
            });
        } else {
            const q = _getLsQueue();
            q.push(item);
            _saveLsQueue(q);
        }

        console.log(`📦 [WmsOfflineQueue] Ação enfileirada: ${type} (${item.id})`);
        updateStatusBadge();

        if (navigator.onLine) {
            flush();
        }
    }

    async function getPendingItems() {
        const db = await _openDb();
        if (db) {
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const req = tx.objectStore(STORE_NAME).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                } catch (e) {
                    resolve([]);
                }
            });
        }
        return _getLsQueue();
    }

    async function removeItem(id) {
        const db = await _openDb();
        if (db) {
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).delete(id);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch (_) { resolve(); }
            });
        } else {
            const q = _getLsQueue().filter(i => i.id !== id);
            _saveLsQueue(q);
        }
    }

    async function updateItem(item) {
        const db = await _openDb();
        if (db) {
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).put(item);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch (_) { resolve(); }
            });
        } else {
            const q = _getLsQueue();
            const idx = q.findIndex(i => i.id === item.id);
            if (idx > -1) q[idx] = item;
            _saveLsQueue(q);
        }
    }

    async function flush() {
        if (_isFlushing || !navigator.onLine) return;
        _isFlushing = true;

        try {
            const items = await getPendingItems();
            if (!items || items.length === 0) {
                _isFlushing = false;
                updateStatusBadge();
                return;
            }

            console.log(`🔄 [WmsOfflineQueue] Iniciando flush de ${items.length} ação(ões)...`);

            for (const item of items) {
                if (!navigator.onLine) break;

                try {
                    await _processItem(item);
                    await removeItem(item.id);
                    console.log(`✅ [WmsOfflineQueue] Sincronizado com sucesso: ${item.type} (${item.id})`);
                } catch (err) {
                    console.warn(`⚠️ [WmsOfflineQueue] Erro ao sincronizar ${item.id}:`, err.message);
                    item.tentativas = (item.tentativas || 0) + 1;
                    item.ultimoErro = err.message;
                    await updateItem(item);
                    // Se falhar rede, para o flush para não spammar
                    break;
                }
            }
        } finally {
            _isFlushing = false;
            updateStatusBadge();
        }
    }

    async function _processItem(item) {
        const p = item.payload;
        if (!window.WmsStore) throw new Error('WmsStore indisponível');

        switch (item.type) {
            case 'INVENTARIO':
                return window.WmsStore.salvarItemInventariado(p.endereco, p.produto, p.quantidade, p.operador);

            case 'PUTAWAY':
                if (p.id && p.dados) {
                    await window.WmsStore.atualizarPutaway(p.id, p.dados);
                }
                if (p.endereco && p.endDados) {
                    await window.WmsStore.atualizarEndereco(p.endereco, p.endDados);
                }
                return true;

            case 'CONFERENCIA_LEITURAS':
                return window.WmsStore.salvarLeituras(p.id, p.leituras);

            case 'CONFERENCIA_FINALIZAR':
                return window.WmsStore.finalizarConferencia(p.id, p.dados);

            case 'PICKING_TASK':
                return window.WmsStore.atualizarPickingTask(p.id, p.dados);

            case 'ONDA_STATUS':
                return window.WmsStore.atualizarOnda(p.id, p.dados);

            case 'CUBAGEM':
                return window.WmsStore.registrarCubagem(p.sku, p.dados);

            default:
                console.warn('[WmsOfflineQueue] Tipo desconhecido:', item.type);
                return true;
        }
    }

    async function getPendingCount() {
        const items = await getPendingItems();
        return items ? items.length : 0;
    }

    async function updateStatusBadge() {
        const count = await getPendingCount();
        const badge = document.getElementById('wms-network-badge');
        if (!badge) {
            const header = document.querySelector('.header, .app-header, .top-bar, nav');
            if (header && !document.getElementById('wms-network-badge')) {
                const el = document.createElement('div');
                el.id = 'wms-network-badge';
                el.style.cssText = 'display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:600; cursor:pointer; margin-left:auto; transition:all 0.3s;';
                el.onclick = () => {
                    if (navigator.onLine) {
                        flush();
                        if (window.Feedback) window.Feedback.vibrateSuccess?.();
                    } else {
                        alert(`Você está operando offline. ${count} ação(ões) salvas com segurança no coletor.`);
                    }
                };
                header.appendChild(el);
            }
        }

        const b = document.getElementById('wms-network-badge');
        if (!b) return;

        if (!navigator.onLine) {
            b.style.background = 'rgba(239, 68, 68, 0.18)';
            b.style.color = '#ef4444';
            b.innerHTML = `<span class="material-icons-round" style="font-size:13px;">wifi_off</span> Offline (${count})`;
        } else if (count > 0) {
            b.style.background = 'rgba(245, 158, 11, 0.18)';
            b.style.color = '#f59e0b';
            b.innerHTML = `<span class="material-icons-round" style="font-size:13px; animation:spin 2s linear infinite;">sync</span> ${count} pend.`;
        } else {
            b.style.background = 'rgba(16, 185, 129, 0.15)';
            b.style.color = '#10b981';
            b.innerHTML = `<span class="material-icons-round" style="font-size:13px;">cloud_done</span> Online`;
        }
    }

    // Inicialização e Listeners
    window.addEventListener('online', () => {
        console.log('🌐 [WmsOfflineQueue] Conexão restabelecida. Executando flush...');
        updateStatusBadge();
        flush();
    });

    window.addEventListener('offline', () => {
        console.warn('📶 [WmsOfflineQueue] Conexão perdida. Modo 100% offline ativo.');
        updateStatusBadge();
    });

    // Flush periódico a cada 20 segundos
    setInterval(() => {
        if (navigator.onLine) flush();
        else updateStatusBadge();
    }, 20000);

    // Inicialização ao carregar o DOM
    document.addEventListener('DOMContentLoaded', () => {
        _openDb().then(() => {
            updateStatusBadge();
            if (navigator.onLine) flush();
        });
    });

    window.WmsOfflineQueue = {
        enqueue,
        flush,
        getPendingCount,
        updateStatusBadge
    };

})();

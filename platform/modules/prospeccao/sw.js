// MAXCRM Campo — Service Worker v1.0.0
// Estratégia: Network-first com fallback offline
// Autor: Parreira Sistemas

const CACHE_NAME = 'maxcrm-v1';
const STATIC_ASSETS = [
    '/platform/modules/prospeccao/index.html',
    '/platform/modules/prospeccao/login.html',
    '/platform/modules/prospeccao/styles/maxcrm.css',
    '/platform/modules/prospeccao/js/maxcrm-core.js',
    '/platform/modules/prospeccao/js/maxcrm-db.js',
    '/platform/modules/prospeccao/js/maxcrm-sync.js',
    '/platform/modules/prospeccao/js/maxcrm-visit.js',
    '/platform/modules/prospeccao/js/cnpj-lookup.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

// ── Install: pré-cacheia assets estáticos ────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando MAXCRM v1...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[SW] Alguns assets não cacheados:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: limpa caches antigos ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
    console.log('[SW] Ativando MAXCRM v1...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

// ── Fetch: Network-first, fallback para cache ─────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Não interceptar chamadas de API externas (Firebase, BrasilAPI)
    if (url.hostname !== self.location.hostname) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Atualiza cache com resposta fresca
                if (response.ok) {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                }
                return response;
            })
            .catch(() => {
                // Offline: serve do cache
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // Fallback para index.html em rotas de navegação
                    if (event.request.mode === 'navigate') {
                        return caches.match('/platform/modules/prospeccao/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// ── Sync: recebe evento de sync quando a rede volta ──────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'maxcrm-sync-visitas') {
        console.log('[SW] Background sync: sincronizando visitas pendentes...');
        // Notifica a aba ativa para executar a sincronização
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SYNC_VISITAS' });
                });
            })
        );
    }
});
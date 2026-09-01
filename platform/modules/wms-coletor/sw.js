const CACHE_NAME = 'wms-coletor-v3.18.5-force';
const ASSETS = [
    './styles/coletor.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k))) // Limpa TODOS os caches antigos obrigatoriamente
        ).then(() => self.clients.claim())
    );
});

// Network-First para HTML e JS (tenta rede primeiro; se falhar, usa cache offline)
self.addEventListener('fetch', e => {
    const url = e.request.url;
    const isHtmlOrJs = url.endsWith('.html') || url.endsWith('.js') || url.includes('/wms-coletor/') || !url.includes('.');

    if (isHtmlOrJs) {
        e.respondWith(
            fetch(e.request)
                .then(networkResp => {
                    if (networkResp && networkResp.status === 200) {
                        const respClone = networkResp.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, respClone));
                    }
                    return networkResp;
                })
                .catch(() => caches.match(e.request))
        );
    } else {
        // Stale-while-revalidate para CSS e Fontes
        e.respondWith(
            caches.match(e.request).then(cachedResp => {
                const fetchPromise = fetch(e.request).then(networkResp => {
                    if (networkResp && networkResp.status === 200) {
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkResp.clone()));
                    }
                    return networkResp;
                }).catch(() => cachedResp);
                return cachedResp || fetchPromise;
            })
        );
    }
});

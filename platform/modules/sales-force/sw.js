const CACHE_NAME = 'fv-v8';
const ASSETS = [
    './',
    './index.html',
    './styles/fv.css',
    './js/fv-db.js',
    './js/fv-core.js',
    './js/fv-screens.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Para navegação HTML, tenta rede primeiro, senão cache, senão fallback para index.html
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Para JS, CSS e outros assets: Network First, fallback to cache
    // (Garante que o app no celular baixe os arquivos mais novos se a internet estiver ativa)
    e.respondWith(
        fetch(e.request)
            .then(response => {
                // Atualiza o cache silenciosamente
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseToCache));
                }
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});

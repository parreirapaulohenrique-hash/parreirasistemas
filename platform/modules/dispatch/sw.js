/**
 * ParreiraLog Service Worker
 * Enables offline caching and PWA functionality
 * Version: 1.8.3 - Network First Strategy
 */

const CACHE_NAME = 'parreiralog-v1.8.3';
const CACHE_URLS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/utils.js',
    '/data.js',
    '/firebase-config.js',
    '/acontec-integration.js',
    '/acontec-ui.js',
    '/delivery-module.js',
    '/manifest.json'
];

// Install event - cache core files
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v1.8.3...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Install complete - skipping waiting');
                return self.skipWaiting(); // Force activate immediately
            })
            .catch((err) => {
                console.error('[SW] Install failed:', err);
            })
    );
});

// Activate event - clean ALL old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v1.8.3...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete - claiming clients');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch event - NETWORK FIRST strategy (always try network first)
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip Firebase and external API requests (always go to network)
    if (event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis') ||
        event.request.url.includes('gstatic') ||
        event.request.url.includes('whatsapp') ||
        event.request.url.includes('vercel')) {
        return;
    }

    // NETWORK FIRST: Try network, fallback to cache
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Got network response, cache it
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(event.request);
            })
    );
});

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker v1.8.3 loaded');

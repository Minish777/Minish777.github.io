// Простой Service Worker для кэширования
const CACHE_NAME = 'discord-web-v1';
const STATIC_CACHE = [
    '/',
    '/index.html',
    '/login.html',
    '/app.js',
    '/optimization.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_CACHE))
    );
});

self.addEventListener('fetch', event => {
    // Для API запросов не кэшируем
    if (event.request.url.includes('discord.com/api')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

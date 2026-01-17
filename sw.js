const CACHE_NAME = 'selecty-v2'; // Incrementar versión para forzar actualización del SW
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap'
];

// Instalación
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Fetch con estrategia network-first
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // NO cachear peticiones a Supabase (son dinámicas y pueden ser PATCH/POST/PUT)
    if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase')) {
        // Permitir que las peticiones a Supabase pasen directamente sin cachear
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Solo cachear peticiones GET (el Cache API no soporta PATCH/POST/PUT)
    if (event.request.method !== 'GET') {
        // Para métodos que no son GET, pasar directamente sin cachear
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Para peticiones GET, usar estrategia network-first
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Solo cachear respuestas GET válidas
                if (response && response.status === 200 && event.request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseClone))
                        .catch(err => {
                            // Ignorar errores de cache (puede fallar si el request no es cacheable)
                            console.log('[SW] No se pudo cachear:', event.request.url);
                        });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, buscar en cache solo para GET
                return caches.match(event.request);
            })
    );
});

// Activación - limpiar caches antiguas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});




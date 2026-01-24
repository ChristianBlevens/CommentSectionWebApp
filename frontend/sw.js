const CACHE_VERSION = 'comment-app-v1.0.1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Base path for the app (will be set via message from main app)
let BASE_PATH = '/comments';

// Files to cache immediately (relative to BASE_PATH)
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/base-path.js',
    '/js/unified-app.js',
    '/js/auth.js',
    '/js/config.js',
    '/js/utils.js',
    '/js/markdown.js',
    '/js/ban-handler.js',
    '/js/service-worker-register.js',
    '/embed.js',
    '/theme.css'
];

// CDN resources to cache
const CDN_RESOURCES = [
    'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/alpinejs@3.12.0/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js',
    'https://d3js.org/d3.v7.min.js'
];

// Build full paths with base path
function getFullPaths() {
    return STATIC_FILES.map(file => BASE_PATH + file);
}

// Install event - cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                // Cache local files with base path
                const localPromises = getFullPaths().map(url =>
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err))
                );

                // Cache CDN resources with CORS mode
                const cdnPromises = CDN_RESOURCES.map(url =>
                    fetch(url, { mode: 'cors' })
                        .then(response => cache.put(url, response))
                        .catch(err => console.warn(`Failed to cache CDN resource ${url}:`, err))
                );

                return Promise.all([...localPromises, ...cdnPromises]);
            })
    );
});

// Handle messages from the client
self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data.action === 'setBasePath') {
        BASE_PATH = event.data.basePath || '/comments';
        console.log('[SW] Base path set to:', BASE_PATH);
    }
});

// Take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('static-') || name.startsWith('dynamic-'))
                        .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map(name => caches.delete(name))
                );
            }),
            // Take control of all clients
            self.clients.claim()
        ])
    );
});

// Fetch event - stale-while-revalidate for static assets
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip caching for OAuth callbacks, API calls, and WebSocket connections
    if (url.pathname.includes('oauth-callback') ||
        url.pathname.includes('/api/') ||
        url.pathname.startsWith('/backend/') ||
        request.method !== 'GET' ||
        request.headers.get('upgrade') === 'websocket') {
        return;
    }

    // Check if this is a static file we should cache
    const fullPaths = getFullPaths();
    const isStaticFile = fullPaths.some(path => url.pathname === path || url.pathname.endsWith(path));
    const isCdnResource = CDN_RESOURCES.includes(request.url);

    if (isStaticFile || isCdnResource) {
        // Stale-while-revalidate strategy
        event.respondWith(
            caches.open(STATIC_CACHE).then(cache => {
                return cache.match(request).then(cachedResponse => {
                    const fetchPromise = fetch(request).then(networkResponse => {
                        // Update cache with fresh version
                        if (networkResponse.ok) {
                            cache.put(request, networkResponse.clone());
                        }
                        return networkResponse;
                    });

                    // Return cached version immediately, update in background
                    return cachedResponse || fetchPromise;
                });
            })
        );
    }
});

// Background sync for update checks
self.addEventListener('sync', event => {
    if (event.tag === 'check-updates') {
        event.waitUntil(checkForUpdates());
    }
});

async function checkForUpdates() {
    try {
        // Check version endpoint
        const response = await fetch(BASE_PATH + '/api/version');
        const data = await response.json();

        if (data.version !== CACHE_VERSION) {
            // Notify clients about update
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'update-available',
                    version: data.version
                });
            });
        }
    } catch (error) {
        console.error('Update check failed:', error);
    }
}

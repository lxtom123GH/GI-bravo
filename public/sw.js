// Service worker for the Coffee Roasting Tracker PWA.
// Uses a versioned runtime cache with a stale-while-revalidate strategy so the
// app works offline regardless of Vite's hashed asset filenames.
const CACHE = 'roast-tracker-v1';

// Brand fonts are self-hosted (not on a CDN), so precache them at install time
// to guarantee the type renders on a cold offline launch. System-font fallbacks
// in the CSS cover the brief window before these resolve.
const FONT_ASSETS = [
    '/fonts/hanken-grotesk-var-latin.woff2',
    '/fonts/spline-sans-mono-var-latin.woff2',
    '/fonts/figtree-var-latin.woff2',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // Don't let one missing font abort activation — cache best-effort.
            .then(c => Promise.allSettled(FONT_ASSETS.map(u => c.add(u))))
            .finally(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only handle same-origin GET requests.
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
        return;
    }

    // For navigations, fall back to the cached app shell when offline.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    cachePut(req, res.clone());
                    return res;
                })
                .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
        );
        return;
    }

    // Stale-while-revalidate for everything else.
    event.respondWith(
        caches.match(req).then(cached => {
            const network = fetch(req)
                .then(res => {
                    cachePut(req, res.clone());
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});

function cachePut(req, res) {
    if (res && res.ok) {
        caches.open(CACHE).then(c => c.put(req, res));
    }
}

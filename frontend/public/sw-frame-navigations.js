// Imported by the service worker (vite.config.ts) before the Workbox routes. The navigation of
// an iframe always goes to the network: nginx then sends the frame-ancestors of that page, which
// lets the sites allowed by the admin embed the menu. The precached index.html carries the
// headers of /index.html (frame-ancestors 'none', X-Frame-Options DENY), so serving it in a
// frame would block the embedded menu. Top-level navigations keep the precache and work offline.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode === 'navigate' && request.destination !== 'document') {
    // No respondWith(): the browser loads the page itself. Workbox's listener comes later.
    event.stopImmediatePropagation();
  }
});

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ADMIN_PAGES } from './src/pwa/adminPages';

// The browsers of v1.11 (Vite 7's default target), down from Vite 8's Safari 16.4: tablets
// stuck on iPadOS 16.0 to 16.3 still serve as menu displays and for the admin. With Safari
// 16.4, the CSS keeps Tailwind's range media queries (`width>=40rem`), which these versions
// ignore: every sm:, md: and lg: style is lost. build.cssTarget follows this list.
// .github/scripts/css-media-ranges.mjs checks the built CSS in CI.
const BROWSER_TARGETS = ['chrome107', 'edge107', 'firefox104', 'safari16'];

// Loaded after the page (src/main.tsx), so not part of the first load. The precache keeps it,
// with the workbox-window chunk it imports, so that an offline visit registers too.
const REGISTRATION_MODULE = /[\\/]src[\\/]pwa[\\/]registerServiceWorker\.ts$/;
const THEME_COLOR = '#0f0f1a';
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Lists the files of the public shell: the entry chunk and every chunk it imports statically
 * (the scripts and modulepreload links of index.html), their CSS, and the service worker
 * registration chunk with its own imports. The chunks the entry reaches only through import()
 * (login, admin pages, admin messages, jszip) stay out: the precache never downloads admin
 * code to a guest. .github/scripts/bundle-budget.mjs checks the precache of the built sw.js.
 */
function publicShell(): { plugin: Plugin; files: Set<string> } {
  const files = new Set<string>();
  const plugin: Plugin = {
    name: 'carta:public-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      files.clear();
      const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
      const registration = chunks.find((chunk) =>
        REGISTRATION_MODULE.test(chunk.facadeModuleId ?? ''),
      );
      if (!registration) this.error('No chunk registers the service worker (src/pwa/)');
      const pending = [registration.fileName, ...registration.dynamicImports];
      pending.push(...chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName));
      for (let fileName = pending.pop(); fileName; fileName = pending.pop()) {
        const chunk = bundle[fileName];
        if (files.has(fileName) || chunk?.type !== 'chunk') continue;
        files.add(fileName);
        chunk.viteMetadata?.importedCss.forEach((css) => files.add(css));
        pending.push(...chunk.imports);
      }
    },
  };
  return { plugin, files };
}

const shell = publicShell();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    shell.plugin,
    VitePWA({
      // A new deployment installs a new service worker, which takes over at once: a public page
      // reloads, an admin page offers the new version (src/pwa/registerServiceWorker.ts).
      registerType: 'autoUpdate',
      // Registered by src/main.tsx, not by a script tag that index.html would wait for.
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Carta Cocktail',
        short_name: 'Carta',
        description: 'Cocktail menu',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        // Rendered from pwa-icons/ (see "Progressive web app" in AGENTS.md)
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The manifest icons are precached with the manifest; the apple-touch-icon is not one.
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // Without the injected registration, the plugin leaves these two to us: the new
        // worker activates without waiting for every tab to close, and controls open pages.
        skipWaiting: true,
        clientsClaim: true,
        // The Latin fonts cover English and French; other subsets fall back offline.
        // theme-init.js is a blocking script of index.html: without it offline, the light theme would flash.
        globPatterns: [
          'index.html',
          'theme-init.js',
          'assets/*.{js,css}',
          'assets/*-latin-wght-normal-*.woff2',
        ],
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.filter(
              (entry) => !/^assets\/.*\.(js|css)$/.test(entry.url) || shell.files.has(entry.url),
            ),
            warnings: [],
          }),
        ],
        // Registers its fetch listener before Workbox's: iframe navigations skip the precache.
        importScripts: ['sw-frame-navigations.js'],
        navigateFallback: 'index.html',
        // The admin side always loads from the network, as do the API and the photos.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, ADMIN_PAGES],
        // Only the guest's menu data and photos are kept: no other /api/ route is cached, and
        // the admin's requests, which carry a token, never read or fill the cache. These
        // functions are copied into sw.js: they cannot use the constants of this file.
        // src/pwa/registerServiceWorker.ts lists the same two paths.
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin &&
              url.pathname.startsWith('/api/public/') &&
              !request.headers.has('Authorization') &&
              // The link preview pages of /api/public/share/ are documents, not menu data
              request.mode !== 'navigate',
            // Fresh data whenever the network answers within 3 s (human decision, 2026-11-26)
            handler: 'NetworkFirst',
            options: {
              cacheName: 'public-api',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: THIRTY_DAYS_IN_SECONDS },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Photo file names are unique per upload, so a stored copy never goes stale.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'photos',
              expiration: { maxEntries: 200, maxAgeSeconds: THIRTY_DAYS_IN_SECONDS },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: BROWSER_TARGETS,
    rolldownOptions: {
      output: {
        // Stable vendor code in its own chunks keeps its long-term cache across app releases.
        // Each group also takes the dependencies of the packages it matches
        // (includeDependenciesRecursively defaults to true), like Rollup's manualChunks did.
        codeSplitting: {
          groups: [
            {
              // react-router is listed because react-router-dom only re-exports it: the
              // re-export module disappears, leaving no dependency for the group to follow.
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
            },
            {
              name: 'vendor-i18n',
              test: /[\\/]node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

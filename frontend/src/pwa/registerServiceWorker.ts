import { registerSW } from 'virtual:pwa-register';
import { ADMIN_PAGES } from './adminPages';
import { announceUpdate } from './updateAvailable';

// The answers the service worker keeps at run time: the guest's menu data and the photos.
// Keep in line with runtimeCaching in vite.config.ts, which cannot import this list.
const RUNTIME_CACHED_PATHS = ['/api/public/', '/uploads/'];

interface WarmUpTarget {
  serviceWorker: Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>;
  /** Resource Timing entries: every URL the page has requested so far. */
  loadedResources: () => readonly PerformanceEntry[];
  origin: string;
  fetch: (url: string) => Promise<unknown>;
}

const browserTarget = (): WarmUpTarget => ({
  serviceWorker: navigator.serviceWorker,
  loadedResources: () => performance.getEntriesByType('resource'),
  origin: window.location.origin,
  fetch: (url) => window.fetch(url),
});

/** The loaded URLs the service worker would have kept, each once. */
export function runtimeCachedUrls(
  resources: readonly PerformanceEntry[],
  origin: string,
): string[] {
  const urls = resources
    .map((resource) => new URL(resource.name, origin))
    .filter(
      (url) =>
        url.origin === origin && RUNTIME_CACHED_PATHS.some((path) => url.pathname.startsWith(path)),
    )
    .map((url) => url.href);
  return [...new Set(urls)];
}

/**
 * The first visit loads the menu and its photos before the service worker exists, so its
 * caches miss them, and the menu would not open offline. Once the new worker controls the
 * page, they are requested again through it: the photos mostly come from the HTTP cache.
 * Later visits go through the worker from the start.
 */
export function warmRuntimeCachesOnFirstControl(target: WarmUpTarget = browserTarget()): void {
  if (target.serviceWorker.controller) return;
  target.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      for (const url of runtimeCachedUrls(target.loadedResources(), target.origin)) {
        // A failed request only leaves that answer out of the cache.
        target.fetch(url).catch(() => undefined);
      }
    },
    { once: true },
  );
}

/**
 * Once a new version has taken over: a public page reloads at once to show it, an admin page
 * offers it in a banner instead, so that a form in progress is not lost.
 */
export function showNewVersion(location: Pick<Location, 'pathname' | 'reload'> = window.location) {
  if (ADMIN_PAGES.test(location.pathname)) announceUpdate();
  else location.reload();
}

/**
 * Registers the service worker of vite-plugin-pwa (sw.js). In autoUpdate mode, a new version
 * activates at once, also when another tab installed it, then showNewVersion runs.
 */
export function registerServiceWorker(): void {
  warmRuntimeCachesOnFirstControl();
  registerSW({ immediate: true, onNeedReload: () => showNewVersion() });
}

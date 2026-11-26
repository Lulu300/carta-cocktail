import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerSW } from 'virtual:pwa-register';
import {
  registerServiceWorker,
  runtimeCachedUrls,
  showNewVersion,
  warmRuntimeCachesOnFirstControl,
} from './registerServiceWorker';
import { isUpdateAvailable, subscribeToUpdate } from './updateAvailable';

const ORIGIN = 'https://menu.example';

function resource(url: string): PerformanceEntry {
  return { name: url } as PerformanceEntry;
}

const LOADED = [
  resource(`${ORIGIN}/assets/index-abc.js`),
  resource(`${ORIGIN}/api/public/settings`),
  resource(`${ORIGIN}/api/public/menus/summer`),
  resource(`${ORIGIN}/api/auth/me`),
  resource(`${ORIGIN}/api/cocktails`),
  resource(`${ORIGIN}/uploads/mojito-480.webp`),
  resource(`${ORIGIN}/uploads/mojito-480.webp`),
  resource('https://cdn.example/uploads/elsewhere.jpg'),
];

function createTarget({ controlled = false } = {}) {
  const events = new EventTarget();
  // The menu request fails: the warm-up must swallow the error.
  const fetch = vi.fn((url: string) =>
    url.endsWith('summer') ? Promise.reject(new Error(url)) : Promise.resolve(),
  );
  const target = {
    serviceWorker: {
      controller: controlled ? ({} as ServiceWorker) : null,
      addEventListener: events.addEventListener.bind(events),
    },
    loadedResources: () => LOADED,
    origin: ORIGIN,
    fetch,
  };
  const takeControl = () => events.dispatchEvent(new Event('controllerchange'));
  return { target, fetch, takeControl };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runtimeCachedUrls', () => {
  it('keeps the menu data and photos of this site, each once', () => {
    expect(runtimeCachedUrls(LOADED, ORIGIN)).toEqual([
      `${ORIGIN}/api/public/settings`,
      `${ORIGIN}/api/public/menus/summer`,
      `${ORIGIN}/uploads/mojito-480.webp`,
    ]);
  });
});

describe('warmRuntimeCachesOnFirstControl', () => {
  it('requests the loaded menu data and photos again once the new worker controls the page', () => {
    const { target, fetch, takeControl } = createTarget();

    warmRuntimeCachesOnFirstControl(target);
    expect(fetch).not.toHaveBeenCalled();
    takeControl();
    takeControl();

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${ORIGIN}/api/public/settings`,
      `${ORIGIN}/api/public/menus/summer`,
      `${ORIGIN}/uploads/mojito-480.webp`,
    ]);
  });

  it('does nothing when a worker already controls the page: its caches saw every request', () => {
    const { target, fetch, takeControl } = createTarget({ controlled: true });

    warmRuntimeCachesOnFirstControl(target);
    takeControl();

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('registerServiceWorker', () => {
  it('registers the worker at once and warms its caches when it takes control', () => {
    const events = new EventTarget();
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: null, addEventListener: events.addEventListener.bind(events) },
    });
    const fetch = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      resource(`${window.location.origin}/uploads/mojito.jpg`),
    ]);

    registerServiceWorker();
    events.dispatchEvent(new Event('controllerchange'));

    expect(registerSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
    expect(fetch).toHaveBeenCalledWith(`${window.location.origin}/uploads/mojito.jpg`);
  });

  it('hands a new version to showNewVersion: an open admin page gets the banner', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/admin/cocktails', reload });
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: {}, addEventListener: vi.fn() },
    });
    registerServiceWorker();

    const options = vi.mocked(registerSW).mock.lastCall?.[0];
    options?.onNeedReload?.();

    expect(reload).not.toHaveBeenCalled();
    expect(isUpdateAvailable()).toBe(true);
  });
});

describe('showNewVersion', () => {
  it.each(['/', '/menu/summer', '/menu/summer/cocktail/3', '/administrateur'])(
    'reloads the public page %s at once',
    (pathname) => {
      const announced = vi.fn();
      const unsubscribe = subscribeToUpdate(announced);
      const reload = vi.fn();

      showNewVersion({ pathname, reload });
      unsubscribe();

      expect(reload).toHaveBeenCalledOnce();
      expect(announced).not.toHaveBeenCalled();
    },
  );

  it.each(['/admin', '/admin/cocktails/3', '/login'])(
    'keeps the admin page %s and announces the new version instead',
    (pathname) => {
      const announced = vi.fn();
      const unsubscribe = subscribeToUpdate(announced);
      const reload = vi.fn();

      showNewVersion({ pathname, reload });
      unsubscribe();

      expect(reload).not.toHaveBeenCalled();
      expect(announced).toHaveBeenCalledOnce();
    },
  );
});

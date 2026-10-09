import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerChunkReloadHandler } from './chunkReload';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: () => null,
    get length() { return values.size; },
  };
}

function createTarget(storage: Storage = createStorage(), onLine = true) {
  const events = new EventTarget();
  const reload = vi.fn();
  const target = {
    addEventListener: events.addEventListener.bind(events),
    sessionStorage: storage,
    location: { reload } as unknown as Location,
    navigator: { onLine } as Navigator,
  };
  registerChunkReloadHandler(target);
  const firePreloadError = () => events.dispatchEvent(new Event('vite:preloadError'));
  return { reload, firePreloadError };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registerChunkReloadHandler', () => {
  it('reloads the page when a chunk fails to load', () => {
    const { reload, firePreloadError } = createTarget();

    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again right after a reload, to avoid a loop', () => {
    const storage = createStorage();
    createTarget(storage).firePreloadError();

    // Same session, freshly reloaded page that still fails
    const { reload, firePreloadError } = createTarget(storage);
    firePreloadError();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the guard delay has passed', () => {
    const storage = createStorage();
    createTarget(storage).firePreloadError();

    vi.advanceTimersByTime(60_000);
    const { reload, firePreloadError } = createTarget(storage);
    firePreloadError();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when session storage is unavailable', () => {
    const storage = createStorage();
    storage.getItem = () => { throw new Error('SecurityError'); };
    const { reload, firePreloadError } = createTarget(storage);

    firePreloadError();

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload while the browser is offline', () => {
    const storage = createStorage();
    const { reload, firePreloadError } = createTarget(storage, false);

    firePreloadError();

    expect(reload).not.toHaveBeenCalled();
    // The guard is left untouched, so a later failure once back online still reloads
    expect(storage.getItem('chunkReloadAt')).toBeNull();
  });
});

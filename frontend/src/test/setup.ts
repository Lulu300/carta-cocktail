import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import i18n from '../i18n';
import '../i18n/admin';
import { resetFactories } from './factories';
import { collectMissingKeys, takeMissingKeys } from './missingKeys';
import { resetCreatedIds } from './msw/handlers';
import { server } from './msw/server';

// Mock localStorage (Node.js 22+ built-in localStorage conflicts with jsdom)
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// jsdom's Blob has no stream(). Node's fetch sizes a multipart body from the file but reads its
// bytes through stream(): msw 3 then fails on the length mismatch when a handler reads an upload.
if (!Blob.prototype.stream) {
  Blob.prototype.stream = function stream(this: Blob) {
    const bytes = this.arrayBuffer();
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        controller.enqueue(new Uint8Array(await bytes));
        controller.close();
      },
    });
  };
}

// jsdom does not implement HTMLDialogElement.showModal/close: minimal polyfill
// that toggles `open` and emits `close`, enough for the Modal component.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Fake backend for every request of services/api.ts. A request with no handler
// fails the test, so a page cannot silently call an endpoint the test ignores.
// `onUnhandledFrame: 'error'` alone only logs and rejects the fetch, which a
// request nobody awaits (a reload after an invalidation) would hide: such
// requests are collected and turned into an error after the test.
const unhandledRequests: string[] = [];
server.events.on('request:unhandled', ({ request }) => {
  unhandledRequests.push(`${request.method} ${new URL(request.url).pathname}`);
});

// The real i18next instance, with the public and admin bundles as in the app once the admin is
// loaded: tests read the English messages. A key found in no bundle fails the test that displayed it.
collectMissingKeys();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(async () => {
  // Back to English for the next test, only when this one changed it: each change also rewrites <html lang>.
  if (i18n.language !== 'en') await i18n.changeLanguage('en');
  server.resetHandlers();
  resetCreatedIds();
  resetFactories();
  localStorage.clear();
  const absentKeys = takeMissingKeys();
  const unexpected = unhandledRequests.splice(0);
  if (absentKeys.length > 0) {
    throw new Error(`Translation keys found in no bundle: ${absentKeys.join(', ')}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`Requests without a handler: ${unexpected.join(', ')}`);
  }
});
afterAll(() => server.close());

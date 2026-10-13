import { vi } from 'vitest';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { server } from './server';

/** HTTP methods of `services/api.ts`, as named by MSW's `http` helpers. */
export type ApiMethod = 'get' | 'post' | 'put' | 'delete';

/** Makes the backend answer `body` (status 200 by default) to every `method path` request of the test. */
export function mockApiResponse(method: ApiMethod, path: string, body: JsonBodyType, status = 200): void {
  server.use(http[method](path, () => HttpResponse.json(body, { status })));
}

/** Makes the backend reject `method path` with `status` and the `{ error }` body the real API sends. */
export function mockApiError(method: ApiMethod, path: string, status: number, message: string): void {
  mockApiResponse(method, path, { error: message }, status);
}

/** Makes `method path` hang: the page stays in its loading state for the whole test. */
export function mockApiPending(method: ApiMethod, path: string): void {
  server.use(http[method](path, () => new Promise<never>(() => {})));
}

/** Makes `method path` fail like a dropped connection (fetch rejects, no HTTP status). */
export function mockNetworkError(method: ApiMethod, path: string): void {
  server.use(http[method](path, () => HttpResponse.error()));
}

/**
 * Makes the next `fetch` reject with `reason`, which need not be an Error. No HTTP
 * answer can do that: it covers the code that guards against a non-Error throw.
 * Undo with `vi.restoreAllMocks()`.
 */
export function rejectNextFetch(reason: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(reason);
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  // request.formData() fails on the jsdom File of an upload: a test reads the raw multipart text
  if (request.headers.get('Content-Type')?.startsWith('multipart/form-data')) return text;
  return text ? JSON.parse(text) : null;
}

export interface CapturedRequest {
  /**
   * Body of the first matching request: parsed JSON, the raw multipart text for a
   * file upload, `null` without a body.
   */
  body: Promise<unknown>;
  /** Number of matching requests received so far. */
  count: () => number;
  /** Full URL of the first matching request, to check its query string. */
  url: Promise<URL>;
}

/**
 * Records the requests sent to `method path` while letting the default handler
 * (or one added earlier with `server.use`) answer them. Call it after the
 * overrides of the same endpoint: MSW tries the handler added last first.
 */
export function captureRequest(method: ApiMethod, path: string): CapturedRequest {
  let received = 0;
  let resolveBody: (body: unknown) => void = () => {};
  let resolveUrl: (url: URL) => void = () => {};
  const body = new Promise<unknown>((resolve) => { resolveBody = resolve; });
  const url = new Promise<URL>((resolve) => { resolveUrl = resolve; });

  server.use(
    http[method](path, async ({ request }) => {
      received += 1;
      if (received === 1) {
        resolveUrl(new URL(request.url));
        resolveBody(await readBody(request.clone()));
      }
      // No response: MSW falls through to the next handler for this request.
      return undefined;
    }),
  );

  return { body, count: () => received, url };
}

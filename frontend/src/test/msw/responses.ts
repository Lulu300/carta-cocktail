import { HttpResponse } from 'msw';

/**
 * Building blocks of fake answers, shared by the default handlers, the helpers of
 * `./utils` and the stateful fake servers of page tests. Kept apart from `./utils`,
 * which imports the server, so that `./handlers` can use them too.
 */

/** Body of a request as an object, `{}` when it is not a JSON object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body } : {};
}

/** The `{ error }` answer the real API sends when it refuses a request. */
export function errorResponse(status: number, message: string): Response {
  return HttpResponse.json({ error: message }, { status });
}

/** An answer that never comes: the request stays in flight for the whole test. */
export function pendingResponse(): Promise<never> {
  return new Promise<never>(() => {});
}

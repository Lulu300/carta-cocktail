import type { Express, RequestHandler, Router } from 'express';

// Express 5 keeps no trace of the path a router is mounted on: the routers of the API are
// mounted through `mountApiRouter`, which remembers it for the OpenAPI document.
const mountPaths = new WeakMap<Router, string>();

/** `app.use(path, ...middleware, router)`, remembering where the router is mounted. */
export function mountApiRouter(
  app: Express,
  path: string,
  ...handlers: [...RequestHandler[], Router]
): void {
  app.use(path, ...handlers);
  mountPaths.set(handlers[handlers.length - 1] as Router, path);
}

/** The path `router` is mounted on, when it was mounted by `mountApiRouter`. */
export function mountPathOf(router: unknown): string | undefined {
  return typeof router === 'function' ? mountPaths.get(router as Router) : undefined;
}

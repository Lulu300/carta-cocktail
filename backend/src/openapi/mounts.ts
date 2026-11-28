import type { Express } from 'express';

// Express 5 keeps no trace of the path a router is mounted on: `rememberMountPaths` makes the
// app remember it for the OpenAPI document.
const mountPaths = new WeakMap<object, string>();

/**
 * Makes every later `app.use(path, ...middleware, router)` remember where `router` is mounted.
 *
 * The mounts stay plain `app.use()` calls: CodeQL's js/missing-rate-limiting only sees the
 * limiter in front of a router when the router is mounted by `app.use()` itself. Behind a
 * mount function, it flags every route that reads a file or hashes a password (D-48).
 */
export function rememberMountPaths(app: Express): void {
  const use = app.use.bind(app) as (...args: unknown[]) => Express;
  app.use = ((...args: unknown[]) => {
    const [path, ...handlers] = args;
    const router = handlers[handlers.length - 1];
    if (typeof path === 'string' && typeof router === 'function') mountPaths.set(router, path);
    return use(...args);
  }) as Express['use'];
}

/** The path `router` is mounted on, when its app remembers mount paths. */
export function mountPathOf(router: unknown): string | undefined {
  return typeof router === 'function' ? mountPaths.get(router) : undefined;
}

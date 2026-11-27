import type { Application } from 'express';
import { authMiddleware, optionalAuth } from '../middleware/auth';
import { isRateLimiter } from '../middleware/rateLimit';
import { type Schemas, validatedSchemas } from '../validation/validate';
import { mountPathOf } from './mounts';
import { type ExcludedRoute, type RouteDoc, routeDocOf } from './routeDoc';

/*
 * Reads the routes from the Express app itself, as a request goes through it: the routers
 * mounted by `mountApiRouter`, the routes of each router, and the middleware that runs in
 * front of each route. Nothing here lists a route: a route exists in the document because it
 * exists in the app.
 */

/** Who may call a route: anyone, anyone with more answers for the admin, or the admin only. */
export type RouteAccess = 'public' | 'optional' | 'admin';

export interface ApiRoute {
  method: string;
  /** OpenAPI form of the path: `/api/units/{id}`. */
  path: string;
  /** Where the router of the route is mounted, one per route file: `/api/units`. */
  mountPath: string;
  access: RouteAccess;
  /** A limiter runs in front of the route: it may answer 429. */
  rateLimited: boolean;
  /** The schemas `validate()` checks the request with. */
  schemas: Schemas;
  /** Undefined when the route has no declaration: the coverage test fails. */
  doc: RouteDoc | ExcludedRoute | undefined;
}

// The parts of Express's router (the `router` package) read here. They are not typed by
// @types/express; `matchers` is internal, used instead of `match()`, which stores the match.
interface Layer {
  handle: unknown;
  slash: boolean;
  matchers: ((path: string) => unknown)[];
  route?: Route;
}

interface Route {
  path: unknown;
  methods: Record<string, boolean>;
  stack: Layer[];
}

interface StackOwner {
  stack: Layer[];
}

function isRouter(handle: unknown): handle is StackOwner {
  return typeof handle === 'function' && Array.isArray((handle as Partial<StackOwner>).stack);
}

function appliesTo(layer: Layer, path: string): boolean {
  return layer.slash || layer.matchers.some((matcher) => matcher(path) !== false);
}

/** The middleware layers (neither a route nor a router) before `end` that a request to `path` goes through. */
function middlewareBefore(stack: Layer[], end: number, path: string): unknown[] {
  return stack
    .slice(0, end)
    .filter((layer) => !layer.route && !isRouter(layer.handle) && appliesTo(layer, path))
    .map((layer) => layer.handle);
}

const PATH_PARAMETER = /:(\w+)/g;

/** `/:id` -> `/{id}`. Express routes of this app only use named parameters. */
function toOpenApiPath(expressPath: string): string {
  if (/[*?(){}]/.test(expressPath)) {
    throw new Error(`Unsupported route path for the OpenAPI document: ${expressPath}`);
  }
  return expressPath.replace(PATH_PARAMETER, '{$1}');
}

/** A path a request could have, to find the middleware that runs for it. */
function samplePath(expressPath: string): string {
  return expressPath.replace(PATH_PARAMETER, '1');
}

function joinPaths(mountPath: string, routePath: string): string {
  return routePath === '/' ? mountPath : `${mountPath}${routePath}`;
}

function accessOf(handlers: unknown[]): RouteAccess {
  if (handlers.includes(authMiddleware)) return 'admin';
  if (handlers.includes(optionalAuth)) return 'optional';
  return 'public';
}

function routeOf(
  route: Route,
  mountPath: string,
  fullPath: string,
  middleware: unknown[],
): ApiRoute[] {
  const handlers = [...middleware, ...route.stack.map((layer) => layer.handle)];
  const schemas = Object.assign({}, ...handlers.map(validatedSchemas)) as Schemas;
  const doc = handlers.map(routeDocOf).find((found) => found !== undefined);
  return Object.keys(route.methods).map((method) => ({
    method,
    path: toOpenApiPath(fullPath),
    mountPath,
    access: accessOf(handlers),
    rateLimited: handlers.some(isRateLimiter),
    schemas,
    doc,
  }));
}

function routePath(route: Route): string {
  if (typeof route.path !== 'string') {
    throw new Error(`Unsupported route path for the OpenAPI document: ${String(route.path)}`);
  }
  return route.path;
}

/** The routes of a router mounted at `stack[routerIndex]` of the app. */
function routesOfRouter(
  router: StackOwner,
  mountPath: string,
  appStack: Layer[],
  routerIndex: number,
): ApiRoute[] {
  return router.stack.flatMap((layer, index) => {
    if (isRouter(layer.handle)) {
      throw new Error(`Nested routers are not listed in the OpenAPI document (${mountPath})`);
    }
    if (!layer.route) return [];
    const path = routePath(layer.route);
    const fullPath = joinPaths(mountPath, path);
    // The app's middleware is matched against the full path, the router's against its own part
    const middleware = [
      ...middlewareBefore(appStack, routerIndex, samplePath(fullPath)),
      ...middlewareBefore(router.stack, index, samplePath(path)),
    ];
    return routeOf(layer.route, mountPath, fullPath, middleware);
  });
}

/** Every route of `app`, in the order Express tries them. */
export function collectApiRoutes(app: Application): ApiRoute[] {
  const stack = (app.router as unknown as StackOwner).stack;
  return stack.flatMap((layer, index) => {
    if (layer.route) {
      const path = routePath(layer.route);
      return routeOf(layer.route, '', path, middlewareBefore(stack, index, samplePath(path)));
    }
    if (!isRouter(layer.handle)) return [];
    const mountPath = mountPathOf(layer.handle);
    if (mountPath === undefined) {
      throw new Error('A router is mounted without mountApiRouter(): its routes cannot be listed');
    }
    return routesOfRouter(layer.handle, mountPath, stack, index);
  });
}

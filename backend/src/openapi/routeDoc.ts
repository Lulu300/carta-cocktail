import type { RequestHandler } from 'express';
import type { z } from 'zod';

/*
 * The OpenAPI declaration of a route sits in the route itself, as a middleware that does
 * nothing but carry it:
 *
 *   const doc = apiDocs('Units');
 *   router.get('/:id', doc({ operationId: 'getUnit', summary: 'Get a unit', responses: { 200: Unit }, errors: { 404: '…' } }), validate(idRequest), handler);
 *
 * The rest comes from the route as Express runs it (openapi/operations.ts): the path and the
 * method, the request schemas of `validate()`, the authentication and the rate limits of the
 * middleware in front of the route. A route without a declaration fails the coverage test.
 */

/**
 * Error statuses a route declares itself, with what they mean for it. 400 (validation), 401
 * (token), 413 (body) and 429 (rate limit) follow from its middleware: a declaration of one of
 * them only gives it a more precise description.
 */
export type DeclaredErrorStatus = 400 | 401 | 403 | 404 | 409 | 413;

/** What a body of a response or of a request is made of, by media type. */
export type MediaBody = z.ZodType | 'binary' | 'text';

export interface ResponseDoc {
  description: string;
  /** Body by media type: a zod schema for JSON, `binary` for a file. No body when left out. */
  content?: Record<string, MediaBody>;
  /** Response headers worth knowing, e.g. `Content-Disposition` of a download. */
  headers?: Record<string, string>;
}

/** A file sent as `multipart/form-data`, read by multer rather than by `validate()`. */
export interface FileUpload {
  /** Name of the form field that carries the file. */
  field: string;
  description: string;
  /** Largest file accepted, that size included: one byte more answers 413. */
  maxBytes: number;
  /** Media types accepted, when the route checks them. */
  mediaTypes?: string[];
}

export interface OperationDoc {
  /** Unique name of the operation, used by generated clients (camelCase, e.g. `getUnit`). */
  operationId: string;
  summary: string;
  description?: string;
  /**
   * Path parameters of a route that reads them without `validate()`: the public routes answer
   * 404 for an invalid id (task A-05). Without either, a path parameter is a string.
   */
  pathParams?: z.ZodObject;
  upload?: FileUpload;
  /** By status: a zod schema answers JSON, a `ResponseDoc` anything else. */
  responses: Record<number, z.ZodType | ResponseDoc>;
  /** Error statuses of the route itself, with what they mean here. */
  errors?: Partial<Record<DeclaredErrorStatus, string>>;
}

export interface RouteDoc extends OperationDoc {
  tag: string;
}

/** A route deliberately left out of the OpenAPI document, and why. */
export interface ExcludedRoute {
  excludedBecause: string;
}

/** The deletions that recipes can block, and `?force=true` can force (deletionService.ts). */
export const FORCED_DELETION = {
  description:
    'Refused while recipes use the item, unless `force=true`: the deletion then also removes the recipe lines that use it, as `impact` reports.',
  conflict:
    'Recipes use the item and `force` is not `true`: `details` lists what a forced deletion removes.',
};

const docs = new WeakMap<RequestHandler, RouteDoc | ExcludedRoute>();

const carryOnly: () => RequestHandler = () => (_req, _res, next) => next();

/** Builds the declarations of the routes of one tag (one route file, as a rule). */
export function apiDocs(tag: string): (doc: OperationDoc) => RequestHandler {
  return (doc) => {
    const middleware = carryOnly();
    docs.set(middleware, { ...doc, tag });
    return middleware;
  };
}

/** Leaves a route out of the OpenAPI document; the coverage test lists it apart. */
export function excludedFromApiDocs(reason: string): RequestHandler {
  const middleware = carryOnly();
  docs.set(middleware, { excludedBecause: reason });
  return middleware;
}

/** The declaration carried by `handler`, when it is one. */
export function routeDocOf(handler: unknown): RouteDoc | ExcludedRoute | undefined {
  return typeof handler === 'function' ? docs.get(handler as RequestHandler) : undefined;
}

export function isExcluded(doc: RouteDoc | ExcludedRoute): doc is ExcludedRoute {
  return 'excludedBecause' in doc;
}

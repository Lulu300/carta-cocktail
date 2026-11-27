import { expect } from 'vitest';
import { z } from 'zod';
import type { Response } from 'supertest';
import app from '../app';
import { buildOpenApiDocument } from '../openapi/document';
import { type ApiRoute, collectApiRoutes } from '../openapi/operations';
import { isExcluded, type ResponseDoc, type RouteDoc } from '../openapi/routeDoc';
import { ApiError } from '../validation/errors';
import { expectContract } from './helpers';

/*
 * Checks a real answer against what the OpenAPI declaration of its route says (task F-14):
 * the status is documented, and the body parses with the declared schema. The contract tests
 * of responseContracts.test.ts check the schemas; these check that each route declares the
 * right one.
 */

const routes = collectApiRoutes(app);
const fullDocument = buildOpenApiDocument(routes, { scope: 'full', version: 'test' });

function pathPattern(openApiPath: string): RegExp {
  return new RegExp(`^${openApiPath.replace(/\{\w+\}/g, '[^/]+')}$`);
}

/** The route Express runs for this request: the first one whose method and path match. */
function routeOf(method: string, pathname: string): ApiRoute & { doc: RouteDoc } {
  const route = routes.find(
    (candidate) => candidate.method === method && pathPattern(candidate.path).test(pathname),
  );
  if (!route?.doc || isExcluded(route.doc)) {
    throw new Error(`No documented route for ${method.toUpperCase()} ${pathname}`);
  }
  return route as ApiRoute & { doc: RouteDoc };
}

function documentedStatuses(route: ApiRoute): string[] {
  const methods = fullDocument.paths[route.path] as Record<string, { responses: object }>;
  return Object.keys(methods[route.method]?.responses ?? {});
}

function mediaTypeOf(res: Response): string | undefined {
  return res.headers['content-type']?.split(';')[0];
}

function expectDeclaredBody(declared: z.ZodType | ResponseDoc, res: Response): void {
  if (declared instanceof z.ZodType) {
    expect(mediaTypeOf(res)).toBe('application/json');
    expectContract(declared, res.body);
    return;
  }
  if (!declared.content) {
    expect(res.text ?? '').toBe('');
    return;
  }
  const mediaType = mediaTypeOf(res) ?? '';
  expect(Object.keys(declared.content)).toContain(mediaType);
  const body = declared.content[mediaType];
  if (body instanceof z.ZodType) expectContract(body, res.body);
}

/** Fails unless the answer is one the declaration of its route documents. Returns the route. */
export function expectDocumentedResponse(res: Response): ApiRoute {
  const { request } = res as unknown as { request: { method: string; url: string } };
  const pathname = new URL(request.url).pathname;
  const route = routeOf(request.method.toLowerCase(), pathname);

  expect(documentedStatuses(route)).toContain(String(res.status));
  const declared = route.doc.responses[res.status];
  if (declared) {
    expectDeclaredBody(declared, res);
  } else {
    // An error status the middleware or the declaration adds: the one error body
    expectContract(ApiError, res.body);
  }
  return route;
}

/** The mount path of every router that has documented routes: one per route file. */
export function documentedMountPaths(): string[] {
  const documented = routes.filter((route) => route.doc && !isExcluded(route.doc));
  return [...new Set(documented.map((route) => route.mountPath))];
}

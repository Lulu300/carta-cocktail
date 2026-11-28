import { describe, it, expect } from 'vitest';
import express, { Router } from 'express';
import { z } from 'zod';
import app from '../app';
import { authMiddleware, refuseApiTokens } from '../middleware/auth';
import { rememberMountPaths } from '../openapi/mounts';
import { collectApiRoutes } from '../openapi/operations';
import { apiDocs } from '../openapi/routeDoc';
import { validate } from '../validation/validate';
import { IdParams } from '../validation/common';
import { BottleUpdate, Bottle } from '../validation/bottles';
import type { ToolDefinition } from './catalog';
import { buildOperationTools, operationToolsOf } from './operationTools';

const doc = apiDocs('Test');
const Item = z.strictObject({ id: z.number().int(), name: z.string() });

/** The routes of a small app whose router `build` fills, mounted behind authMiddleware. */
function routesOf(build: (router: Router) => void, ...middleware: express.RequestHandler[]) {
  const mini = express();
  rememberMountPaths(mini);
  const router = Router();
  build(router);
  mini.use('/api/items', ...(middleware.length ? middleware : [authMiddleware]), router);
  return collectApiRoutes(mini);
}

function tool(operationId: string): ToolDefinition {
  return { name: 'a_tool', operationId, title: 'A tool', description: 'Does it. Example: {}' };
}

const ok = (_req: express.Request, res: express.Response) => {
  res.end();
};

describe('buildOperationTools', () => {
  it('should put the path parameters, the query and the body side by side', () => {
    const routes = routesOf((router) =>
      router.put(
        '/:id',
        doc({ operationId: 'updateItem', summary: 'Update', responses: { 200: Item } }),
        validate({
          params: IdParams,
          query: z.object({ dryRun: z.string().optional() }),
          body: BottleUpdate.pick({ name: true }),
        }),
        ok,
      ),
    );

    const [built] = buildOperationTools(routes, [tool('updateItem')]);

    expect(built).toMatchObject({
      method: 'put',
      path: '/api/items/{id}',
      writes: true,
      argumentParts: { id: 'params', dryRun: 'query', name: 'body' },
      wrapsItems: false,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    });
    expect(built!.inputSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'integer' }, dryRun: { type: 'string' }, name: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    });
    expect(built!.description).toContain('API operation: PUT /api/items/{id} (updateItem)');
  });

  it('should answer a list as `{ items }`, an object being the only structured result', () => {
    const routes = routesOf((router) =>
      router.get(
        '/',
        doc({ operationId: 'listItems', summary: 'List', responses: { 200: z.array(Item) } }),
        ok,
      ),
    );

    const [built] = buildOperationTools(routes, [tool('listItems')]);

    expect(built).toMatchObject({
      writes: false,
      wrapsItems: true,
      annotations: { readOnlyHint: true },
    });
    expect(built!.outputSchema).toMatchObject({
      type: 'object',
      properties: { items: { type: 'array' } },
      required: ['items'],
    });
  });

  it.each([
    [
      'an unknown operation',
      () => routesOf(() => undefined),
      'missingItem',
      /no route has this operationId/,
    ],
    [
      'a deletion',
      () =>
        routesOf((router) =>
          router.delete(
            '/:id',
            doc({ operationId: 'deleteItem', summary: 'Delete', responses: { 200: Item } }),
            ok,
          ),
        ),
      'deleteItem',
      /deletions stay out/,
    ],
    [
      'a route without the admin token',
      () =>
        routesOf(
          (router) =>
            router.get(
              '/',
              doc({ operationId: 'publicItems', summary: 'List', responses: { 200: Item } }),
              ok,
            ),
          (_req, _res, next) => next(),
        ),
      'publicItems',
      /the route is public/,
    ],
    [
      'a route reserved to the session',
      () =>
        routesOf(
          (router) =>
            router.get(
              '/',
              doc({ operationId: 'sessionItems', summary: 'List', responses: { 200: Item } }),
              ok,
            ),
          // As SESSION_ONLY_ROUTES of app.ts: no API token, whatever its scope
          refuseApiTokens,
          authMiddleware,
        ),
      'sessionItems',
      /the route is session, not admin/,
    ],
    [
      'a body that is not an object',
      () =>
        routesOf((router) =>
          router.post(
            '/',
            doc({ operationId: 'postIds', summary: 'Post', responses: { 200: Item } }),
            validate({ body: z.array(z.number()) }),
            ok,
          ),
        ),
      'postIds',
      /the body of the request is not an object/,
    ],
    [
      'an argument both in the path and the body',
      () =>
        routesOf((router) =>
          router.put(
            '/:id',
            doc({ operationId: 'clash', summary: 'Put', responses: { 200: Item } }),
            validate({ params: IdParams, body: z.object({ id: z.number() }) }),
            ok,
          ),
        ),
      'clash',
      /"id" is both in the params and the body/,
    ],
    [
      'a route without a JSON success response',
      () =>
        routesOf((router) =>
          router.get(
            '/',
            doc({
              operationId: 'download',
              summary: 'Get',
              responses: { 200: { description: 'A file' } },
            }),
            ok,
          ),
        ),
      'download',
      /no single JSON success response/,
    ],
    [
      'a response that is neither an object nor a list',
      () =>
        routesOf((router) =>
          router.get(
            '/',
            doc({ operationId: 'count', summary: 'Count', responses: { 200: z.number() } }),
            ok,
          ),
        ),
      'count',
      /neither an object nor a list/,
    ],
  ])('should refuse %s', (_name, routes, operationId, message) => {
    expect(() => buildOperationTools(routes(), [tool(operationId)])).toThrow(message);
  });

  it('should build every tool of the catalog from the routes of the app', () => {
    const tools = operationToolsOf(app);

    expect(tools.map((built) => built.operationId)).toContain('updateBottle');
    expect(tools.find((built) => built.name === 'update_bottle')!.outputSchema).toMatchObject({
      properties: { remainingPercent: { type: 'integer' } },
    });
    // Read once per app
    expect(operationToolsOf(app)).toBe(tools);
    // The response schema of the route, so that a change of Bottle changes the tool
    expect(Object.keys(Bottle.shape).sort()).toEqual(
      Object.keys(
        (tools.find((built) => built.name === 'get_bottle')!.outputSchema as { properties: object })
          .properties,
      ).sort(),
    );
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import express, { Router } from 'express';
import { z } from 'zod';
import { Validator } from '@seriousme/openapi-schema-validator';
import app from '../app';
import { appVersion } from '../config';
import { authMiddleware } from '../middleware/auth';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
} from '../test/helpers';
import { validate } from '../validation/validate';
import { buildOpenApiDocument, type DocumentScope } from './document';
import { VALIDATION_MODULES } from './jsonSchemas';
import { mountApiRouter } from './mounts';
import { type ApiRoute, collectApiRoutes } from './operations';
import { apiDocs, excludedFromApiDocs, isExcluded } from './routeDoc';

beforeAll(async () => {
  await setupTestDatabase();
});
afterAll(async () => {
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
});

const routes = collectApiRoutes(app);

function documentOf(scope: DocumentScope) {
  return buildOpenApiDocument(routes, { scope, version: 'test' });
}

type Operation = { operationId: string; security: object[]; parameters?: { name: string }[] };

function operationsOf(document: ReturnType<typeof documentOf>) {
  return Object.entries(document.paths).flatMap(([routePath, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      key: `${method.toUpperCase()} ${routePath}`,
      path: routePath,
      operation: operation as Operation,
    })),
  );
}

function keyOf(route: ApiRoute): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}

// The routes left out of the document on purpose: adding one is a visible change of this list
const EXCLUDED_ROUTES = [
  'GET /api/public/share/menu/{slug}',
  'GET /api/public/share/menu/{slug}/cocktail/{id}',
];

describe('coverage of the routes', () => {
  it('should describe every Express route, except the ones excluded with a reason', () => {
    const declared = operationsOf(documentOf('full')).map(({ key }) => key);
    const excluded = routes.filter((route) => route.doc && isExcluded(route.doc)).map(keyOf);
    const undeclared = routes.filter((route) => !route.doc).map(keyOf);

    expect(undeclared).toEqual([]);
    expect(excluded).toEqual(EXCLUDED_ROUTES);
    expect([...declared, ...excluded].sort()).toEqual(routes.map(keyOf).sort());
  });

  it('should give every excluded route its reason', () => {
    for (const route of routes) {
      if (route.doc && isExcluded(route.doc)) expect(route.doc.excludedBecause).not.toBe('');
    }
  });

  it('should list a route without a declaration, and one excluded, apart', () => {
    const mini = express();
    const router = Router();
    const doc = apiDocs('Test');
    router.get('/declared', doc({ operationId: 'declared', summary: 'Declared', responses: {} }));
    router.get('/forgotten', (_req, res) => {
      res.end();
    });
    router.get('/excluded', excludedFromApiDocs('An HTML page'), (_req, res) => {
      res.end();
    });
    mountApiRouter(mini, '/api/test', router);

    const found = collectApiRoutes(mini);

    expect(found.map((route) => [keyOf(route), route.doc === undefined])).toEqual([
      ['GET /api/test/declared', false],
      ['GET /api/test/forgotten', true],
      ['GET /api/test/excluded', false],
    ]);
    const document = buildOpenApiDocument(found, { scope: 'full', version: 'test' });
    expect(Object.keys(document.paths)).toEqual(['/api/test/declared']);
  });

  it('should refuse a router mounted without mountApiRouter, whose path it cannot know', () => {
    const mini = express();
    mini.use(
      '/api/test',
      Router().get('/', (_req, res) => res.end()),
    );

    expect(() => collectApiRoutes(mini)).toThrow(/mountApiRouter/);
  });

  it('should list a route of the app itself, outside any router', () => {
    const mini = express();
    mini.get('/api/ping', (_req, res) => res.end());

    expect(collectApiRoutes(mini).map((route) => [keyOf(route), route.mountPath])).toEqual([
      ['GET /api/ping', ''],
    ]);
  });

  it.each([
    ['a nested router', () => Router().use('/inner', Router()), /Nested routers/],
    ['a wildcard path', () => Router().get('/*rest', (_req, res) => res.end()), /Unsupported/],
    [
      'a regular expression path',
      () => Router().get(/^\/x$/, (_req, res) => res.end()),
      /Unsupported/,
    ],
  ])('should refuse %s, which it cannot describe', (_name, buildRouter, message) => {
    const mini = express();
    mountApiRouter(mini, '/api/test', buildRouter());

    expect(() => collectApiRoutes(mini)).toThrow(message);
  });

  it('should read the authentication and the rate limits of the middleware in front of each route', () => {
    const find = (key: string) => routes.find((route) => keyOf(route) === key);

    expect(find('GET /api/health')).toMatchObject({ access: 'public', rateLimited: false });
    expect(find('POST /api/auth/login')).toMatchObject({ access: 'public', rateLimited: true });
    expect(find('GET /api/auth/me')).toMatchObject({ access: 'admin' });
    expect(find('GET /api/public/menus')).toMatchObject({ access: 'optional' });
    expect(find('GET /api/units')).toMatchObject({ access: 'admin', rateLimited: true });
    expect(find('GET /api/openapi/full.json')).toMatchObject({ access: 'admin' });
    // SESSION_ONLY_ROUTES of app.ts: refuseApiTokens runs in front of them
    for (const key of [
      'GET /api/api-tokens',
      'POST /api/api-tokens',
      'DELETE /api/api-tokens/{id}',
      'PUT /api/settings/profile',
      'POST /api/auth/logout-all',
      'GET /api/backup/export',
      'POST /api/backup/import',
    ]) {
      expect(find(key), key).toMatchObject({ access: 'session' });
    }
    expect(find('PUT /api/settings')).toMatchObject({ access: 'admin' });
  });

  it('should take the request schemas from validate() and the parameters from the path', () => {
    const mini = express();
    const router = Router();
    const doc = apiDocs('Test');
    const schemas = { params: z.object({ id: z.coerce.number().int() }), body: z.object({}) };
    router.put(
      '/:id/items/:item',
      doc({ operationId: 'put', summary: 'Put', responses: { 204: { description: 'Done' } } }),
      authMiddleware,
      validate(schemas),
    );
    mountApiRouter(mini, '/api/test', router);

    const document = buildOpenApiDocument(collectApiRoutes(mini), {
      scope: 'full',
      version: 'test',
    });
    const operation = document.paths['/api/test/{id}/items/{item}']?.put as Operation & {
      parameters: { name: string; schema: object }[];
      responses: Record<string, unknown>;
    };

    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: 'id',
        in: 'path',
        schema: expect.objectContaining({ type: 'integer' }),
      }),
      expect.objectContaining({ name: 'item', in: 'path', schema: { type: 'string' } }),
    ]);
    // 403: a read-only API token cannot write
    expect(Object.keys(operation.responses).sort()).toEqual(['204', '400', '401', '403', '413']);
    expect(operation.responses['403']).toEqual({
      $ref: '#/components/responses/ReadOnlyApiToken',
    });
    expect(operation.security).toEqual([{ bearerAuth: [] }, { apiToken: [] }]);
  });
});

describe('the OpenAPI documents', () => {
  it.each(['public', 'full'] as const)(
    'should be a valid OpenAPI 3.1 document (%s)',
    async (scope) => {
      const validator = new Validator();

      const result = await validator.validate(structuredClone(documentOf(scope)));

      expect(result.errors ?? []).toEqual([]);
      expect(result.valid).toBe(true);
      expect(validator.version).toBe('3.1');
      // Every $ref of the document points to a component it has
      expect(() => validator.resolveRefs()).not.toThrow();
    },
  );

  it('should accept API tokens on the admin routes but those reserved to the session', () => {
    const document = documentOf('full');
    const operation = (path: string, method: string) =>
      (document.paths[path] as Record<string, Operation & { responses: Record<string, unknown> }>)[
        method
      ]!;
    const bothTokens = [{ bearerAuth: [] }, { apiToken: [] }];

    expect(document.components.securitySchemes.apiToken).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: expect.stringMatching(/^carta_/),
    });
    // A read-only token reads, and gets 403 on a write
    expect(operation('/api/units', 'get').security).toEqual(bothTokens);
    expect(operation('/api/units', 'get').responses['403']).toBeUndefined();
    expect(operation('/api/units', 'post').responses['403']).toEqual({
      $ref: '#/components/responses/ReadOnlyApiToken',
    });
    // Reserved to the session: any API token gets 403, reads included
    for (const [path, method] of [
      ['/api/api-tokens', 'get'],
      ['/api/backup/export', 'get'],
      ['/api/settings/profile', 'put'],
      ['/api/auth/logout-all', 'post'],
    ] as const) {
      expect(operation(path, method).security, path).toEqual([{ bearerAuth: [] }]);
      expect(operation(path, method).responses['403'], path).toEqual({
        $ref: '#/components/responses/SessionOnly',
      });
    }
    // The public menus show more to the admin, whatever the token
    expect(operation('/api/public/menus', 'get').security).toEqual([{}, ...bothTokens]);
  });

  it('should give every operation a unique operationId', () => {
    const ids = operationsOf(documentOf('full')).map(({ operation }) => operation.operationId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should describe every path parameter', () => {
    for (const { key, path: routePath, operation } of operationsOf(documentOf('full'))) {
      const names = [...routePath.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const described = (operation.parameters ?? []).map((parameter) => parameter.name);
      for (const name of names) expect(described, key).toContain(name);
    }
  });

  it('should give the public document the routes a client calls without signing in, and nothing else', () => {
    const operations = operationsOf(documentOf('public'));
    const keys = operations.map(({ key }) => key);

    expect(keys).toEqual(
      expect.arrayContaining(['GET /api/health', 'POST /api/auth/login', 'GET /api/openapi.json']),
    );
    for (const key of keys) {
      expect(key).toMatch(/^\w+ \/api\/(public\/|health$|auth\/login$|openapi\.json$)/);
    }
    for (const { operation } of operations) {
      expect(operation.security).not.toEqual([{ bearerAuth: [] }]);
    }
  });

  it('should leave the schemas of the admin routes out of the public document', () => {
    const schemas = Object.keys(documentOf('public').components.schemas);

    expect(schemas).toEqual(expect.arrayContaining(['ApiError', 'PublicMenu', 'LoginResponse']));
    expect(schemas).not.toContain('AdminSiteSettings');
    expect(schemas).not.toContain('BackupRestoreResult');
  });

  it('should describe the error body once and refer to it from every client error response', () => {
    const document = documentOf('full');
    const errorResponses = operationsOf(document).flatMap(({ operation }) =>
      Object.entries((operation as unknown as { responses: Record<string, object> }).responses)
        // The 503 of the health check is its own answer, not an error of errorHandler
        .filter(([status]) => Number(status) >= 400 && Number(status) < 500)
        .map(([, response]) => JSON.stringify(response)),
    );

    expect(document.components.schemas.ApiError).toBeDefined();
    for (const response of errorResponses) {
      expect(response).toMatch(/#\/components\/(responses\/\w+|schemas\/ApiError)/);
    }
  });

  it('should describe the uploads as multipart/form-data with their limit', () => {
    const photo = documentOf('full').paths['/api/cocktails/{id}/image']?.post as {
      requestBody: { content: Record<string, { schema: { properties: Record<string, object> } }> };
    };

    const form = photo.requestBody.content['multipart/form-data'];
    expect(form?.schema.properties.image).toEqual(
      expect.objectContaining({
        description: expect.stringMatching(/At most 5 MB \(5242880 bytes\)/),
      }),
    );
  });

  it('should register the exports of every module of src/validation/ as components', () => {
    const validationDir = path.join(__dirname, '../validation');
    const modules = fs
      .readdirSync(validationDir)
      .filter(
        (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'validate.ts',
      )
      .map((file) => file.replace(/\.ts$/, ''));

    expect(Object.keys(VALIDATION_MODULES).sort()).toEqual(modules.sort());
  });
});

describe('GET /api/openapi.json', () => {
  it('should answer the public document to anyone, revalidated by caches', async () => {
    const res = await request.get('/api/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body.info.version).toBe(appVersion());
    expect(Object.keys(res.body.paths)).not.toContain('/api/units');
  });

  it('should answer the same public document to the admin', async () => {
    const guest = await request.get('/api/openapi.json');
    const admin = await request.get('/api/openapi.json').set(authHeader());

    expect(admin.body).toEqual(guest.body);
  });
});

describe('GET /api/openapi/full.json', () => {
  it('should answer 401 without a token', async () => {
    const res = await request.get('/api/openapi/full.json');

    expect(res.status).toBe(401);
  });

  it('should answer every route to the admin, kept out of shared caches', async () => {
    const res = await request.get('/api/openapi/full.json').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/units', '/api/backup/import', '/api/public/menus']),
    );
  });
});

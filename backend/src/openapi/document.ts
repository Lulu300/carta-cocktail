import { STATUS_CODES } from 'node:http';
import { z } from 'zod';
import { ApiError } from '../validation/errors';
import type { ApiRoute } from './operations';
import { inputSchema, type JsonSchema, SchemaComponents } from './jsonSchemas';
import {
  type FileUpload,
  isExcluded,
  type MediaBody,
  type ResponseDoc,
  type RouteDoc,
} from './routeDoc';

/*
 * Builds the OpenAPI 3.1 document from the routes of the app (operations.ts) and their
 * declarations (routeDoc.ts). The document is in English, as the code.
 */

/**
 * `public`: what a client can call without signing in (the routes whose middleware lets a
 * request through without a token). `full`: every route, for the signed-in admin.
 */
export type DocumentScope = 'public' | 'full';

interface DocumentedRoute extends ApiRoute {
  doc: RouteDoc;
}

const SECURITY_SCHEME = 'bearerAuth';

// Errors that follow from the middleware in front of a route, described once in
// components.responses and referred to by every route they apply to.
const COMMON_ERRORS = {
  400: {
    name: 'BadRequest',
    description:
      'The request is invalid. After a schema check, `details` lists every issue as `ValidationIssue` objects.',
  },
  401: {
    name: 'Unauthorized',
    description:
      'No session token, or one that is invalid, expired or revoked (password changed, "log out everywhere", backup restored).',
  },
  413: {
    name: 'PayloadTooLarge',
    description: 'The body or the file is larger than the route accepts.',
  },
  429: {
    name: 'TooManyRequests',
    description:
      'Too many requests from this client address. `Retry-After` gives the seconds to wait.',
  },
} as const;

const RATE_LIMIT_HEADERS = {
  'Retry-After': 'Seconds to wait before the next request.',
  RateLimit: 'Requests left in the current window (IETF draft 7 format).',
  'RateLimit-Policy': 'Limit and window of the limiter that refused the request.',
};

const DESCRIPTION = `REST API of Carta Cocktail: cocktail recipes, bottle stock and published menus.

**Authentication.** \`POST /api/auth/login\` answers a session token (JWT). Send it in the
\`Authorization: Bearer <token>\` header. It lasts 7 days by default and ends when the admin
changes the password, signs out everywhere or restores a backup.

**Errors.** Every error answers JSON with the same shape, the \`ApiError\` schema: \`error\`, a
message in the language of the request (\`Accept-Language\`, English by default), and sometimes
\`details\`.

**Rate limits.** Every route but \`/api/health\` counts the requests of each client address
(\`API_RATE_LIMIT\` per minute). Failed sign-ins and backups have lower limits of their own.
Over a limit, the route answers 429 with \`Retry-After\`.`;

const PUBLIC_SCOPE_NOTE = `

This document lists the routes a client can call without signing in. Once signed in, the admin
gets every route from \`GET /api/openapi/full.json\`, and reads them on the API page of the
admin.`;

function headerObjects(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, description]) => [
      name,
      { description, schema: { type: 'string' } },
    ]),
  );
}

function mediaSchema(body: MediaBody, components: SchemaComponents): JsonSchema {
  if (body === 'binary') return { type: 'string', contentMediaType: 'application/octet-stream' };
  if (body === 'text') return { type: 'string' };
  return components.output(body);
}

function responseObject(
  response: z.ZodType | ResponseDoc,
  status: number,
  components: SchemaComponents,
) {
  const doc: ResponseDoc =
    response instanceof z.ZodType
      ? {
          description: STATUS_CODES[status] ?? String(status),
          content: { 'application/json': response },
        }
      : response;
  return {
    description: doc.description,
    ...(doc.headers && { headers: headerObjects(doc.headers) }),
    ...(doc.content && {
      content: Object.fromEntries(
        Object.entries(doc.content).map(([mediaType, body]) => [
          mediaType,
          { schema: mediaSchema(body, components) },
        ]),
      ),
    }),
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
  };
}

function hasRequestBody(route: DocumentedRoute): boolean {
  return route.schemas.body !== undefined || route.doc.upload !== undefined;
}

/** Error responses: those the middleware implies, then those the route declares. */
function errorResponses(route: DocumentedRoute) {
  const implied: (keyof typeof COMMON_ERRORS)[] = [];
  if (Object.keys(route.schemas).length > 0 || route.doc.upload) implied.push(400);
  if (route.access === 'admin') implied.push(401);
  if (hasRequestBody(route)) implied.push(413);
  if (route.rateLimited) implied.push(429);

  const responses: Record<string, unknown> = {};
  for (const status of implied) {
    responses[status] = { $ref: `#/components/responses/${COMMON_ERRORS[status].name}` };
  }
  for (const [status, description] of Object.entries(route.doc.errors ?? {})) {
    responses[status] = errorResponse(description);
  }
  return responses;
}

function sizeInMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('en')} MB`;
}

function uploadBody(upload: FileUpload) {
  const accepted = upload.mediaTypes ? ` Accepted types: ${upload.mediaTypes.join(', ')}.` : '';
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: [upload.field],
          properties: {
            [upload.field]: {
              type: 'string',
              contentMediaType: 'application/octet-stream',
              description: `${upload.description} At most ${sizeInMegabytes(upload.maxBytes)} (${upload.maxBytes} bytes).${accepted}`,
            },
          },
        },
        ...(upload.mediaTypes && {
          encoding: { [upload.field]: { contentType: upload.mediaTypes.join(', ') } },
        }),
      },
    },
  };
}

function requestBody(route: DocumentedRoute) {
  if (route.doc.upload) return uploadBody(route.doc.upload);
  if (!route.schemas.body) return undefined;
  return {
    required: true,
    content: { 'application/json': { schema: inputSchema(route.schemas.body) } },
  };
}

interface ObjectSchema {
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

function parametersIn(location: 'path' | 'query', schema: z.ZodType | undefined) {
  if (!schema) return [];
  const { properties = {}, required = [] } = inputSchema(schema) as ObjectSchema;
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: property,
  }));
}

/** Path parameters without a schema (no `validate()`, no `pathParams`) are plain strings. */
function untypedPathParameters(path: string, typed: { name: string }[]) {
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
  return names
    .filter((name) => !typed.some((parameter) => parameter.name === name))
    .map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } }));
}

function parameters(route: DocumentedRoute) {
  const path = parametersIn('path', route.schemas.params ?? route.doc.pathParams);
  return [
    ...path,
    ...untypedPathParameters(route.path, path),
    ...parametersIn('query', route.schemas.query),
  ];
}

function security(route: DocumentedRoute) {
  if (route.access === 'admin') return [{ [SECURITY_SCHEME]: [] }];
  // The admin's token is optional: with it, the route also answers what only the admin sees
  if (route.access === 'optional') return [{}, { [SECURITY_SCHEME]: [] }];
  return [];
}

function operationObject(route: DocumentedRoute, components: SchemaComponents) {
  const { doc } = route;
  const params = parameters(route);
  const body = requestBody(route);
  const responses = Object.fromEntries(
    Object.entries(doc.responses).map(([status, response]) => [
      status,
      responseObject(response, Number(status), components),
    ]),
  );
  return {
    operationId: doc.operationId,
    summary: doc.summary,
    ...(doc.description && { description: doc.description }),
    tags: [doc.tag],
    security: security(route),
    ...(params.length > 0 && { parameters: params }),
    ...(body && { requestBody: body }),
    responses: { ...responses, ...errorResponses(route) },
  };
}

function commonComponents(components: SchemaComponents) {
  components.output(ApiError);
  const responses: Record<string, object> = Object.fromEntries(
    Object.values(COMMON_ERRORS).map(({ name, description }) => [name, errorResponse(description)]),
  );
  responses[COMMON_ERRORS[429].name] = {
    ...errorResponse(COMMON_ERRORS[429].description),
    headers: headerObjects(RATE_LIMIT_HEADERS),
  };
  return responses;
}

function isInScope(route: DocumentedRoute, scope: DocumentScope): boolean {
  return scope === 'full' || route.access !== 'admin';
}

/** The routes the document describes: declared, not excluded, within the scope. */
export function documentedRoutes(routes: ApiRoute[], scope: DocumentScope): DocumentedRoute[] {
  return routes.filter(
    (route): route is DocumentedRoute =>
      route.doc !== undefined &&
      !isExcluded(route.doc) &&
      isInScope(route as DocumentedRoute, scope),
  );
}

export function buildOpenApiDocument(
  routes: ApiRoute[],
  { scope, version }: { scope: DocumentScope; version: string },
) {
  const components = new SchemaComponents();
  const responses = commonComponents(components);
  const included = documentedRoutes(routes, scope);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of included) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = operationObject(route, components);
  }
  const tags = [...new Set(included.map((route) => route.doc.tag))].sort();

  return {
    openapi: '3.1.1',
    info: {
      title: 'Carta Cocktail API',
      version,
      description: scope === 'public' ? DESCRIPTION + PUBLIC_SCOPE_NOTE : DESCRIPTION,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    tags: tags.map((name) => ({ name })),
    paths,
    components: {
      schemas: components.schemas,
      responses,
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Session token of the admin, answered by `POST /api/auth/login`.',
        },
      },
    },
  };
}

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

/** A route with its declaration (not excluded). */
export interface DocumentedRoute extends ApiRoute {
  doc: RouteDoc;
}

// The admin's session token, and the API tokens of scripts and MCP clients (F-16)
const SESSION_SCHEME = 'bearerAuth';
const API_TOKEN_SCHEME = 'apiToken';
const SESSION = { [SESSION_SCHEME]: [] };
const API_TOKEN = { [API_TOKEN_SCHEME]: [] };

// Methods a read-only API token may send (authMiddleware)
const READ_METHODS = new Set(['get', 'head']);

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
      'No token, or one that is invalid, expired or revoked: a session token after a password change, "log out everywhere" or a backup restore; an API token once revoked or expired, or after "log out everywhere" or a backup restore.',
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

const API_TOKEN_SECURITY_SCHEME = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'carta_<43 base64url characters>',
  description:
    'API token of a script or an MCP client, created in Settings > API tokens and shown once. Read only (`GET` and `HEAD`) or read and write; it expires. The routes whose security lists the session only refuse it (403).',
};

// The 403 answers of an API token, from authMiddleware and refuseApiTokens
const TOKEN_REFUSALS = {
  readOnly: {
    name: 'ReadOnlyApiToken',
    description:
      'The request carries a read-only API token: such a token may only send `GET` and `HEAD`.',
  },
  sessionOnly: {
    name: 'SessionOnly',
    description:
      "The request carries an API token: this route only accepts the admin's session token, whatever the scope of the token.",
  },
} as const;

const RATE_LIMIT_HEADERS = {
  'Retry-After': 'Seconds to wait before the next request.',
  RateLimit: 'Requests left in the current window (IETF draft 7 format).',
  'RateLimit-Policy': 'Limit and window of the limiter that refused the request.',
};

const INTRODUCTION = `REST API of Carta Cocktail: cocktail recipes, bottle stock and published menus.`;

const SESSION_AUTHENTICATION = `**Authentication.** \`POST /api/auth/login\` answers a session token (JWT). Send it in the
\`Authorization: Bearer <token>\` header. It lasts 7 days by default and ends when the admin
changes the password, signs out everywhere or restores a backup.`;

// Full document only: the public one describes nothing that an API token could call
const API_TOKEN_AUTHENTICATION = `A script or an MCP client uses an API token instead (\`Authorization: Bearer carta_…\`), which
the admin creates in Settings and which expires after 30, 90 or 365 days. A read-only token may
only send \`GET\` and \`HEAD\` (403 otherwise). The routes that manage the tokens, the admin
account, signing out everywhere and the backups refuse every API token (403): their security
lists the session only. Signing out everywhere and restoring a backup delete every API token.`;

const ERRORS_AND_LIMITS = `**Errors.** Every error answers JSON with the same shape, the \`ApiError\` schema: \`error\`, a
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

function requiresToken(route: DocumentedRoute): boolean {
  return route.access === 'admin' || route.access === 'session';
}

/** Why an API token gets 403 here, when it can: the route is reserved to the session, or writes. */
function tokenRefusal(route: DocumentedRoute): keyof typeof TOKEN_REFUSALS | undefined {
  if (route.access === 'session') return 'sessionOnly';
  if (route.access === 'admin' && !READ_METHODS.has(route.method)) return 'readOnly';
  return undefined;
}

/** Error responses: those the middleware implies, then those the route declares. */
function errorResponses(route: DocumentedRoute) {
  const implied: (keyof typeof COMMON_ERRORS)[] = [];
  if (Object.keys(route.schemas).length > 0 || route.doc.upload) implied.push(400);
  if (requiresToken(route)) implied.push(401);
  if (hasRequestBody(route)) implied.push(413);
  if (route.rateLimited) implied.push(429);

  const responses: Record<string, unknown> = {};
  for (const status of implied) {
    responses[status] = { $ref: `#/components/responses/${COMMON_ERRORS[status].name}` };
  }
  const refusal = tokenRefusal(route);
  if (refusal) {
    responses[403] = { $ref: `#/components/responses/${TOKEN_REFUSALS[refusal].name}` };
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

function documentDescription(scope: DocumentScope): string {
  if (scope === 'public') {
    return (
      [INTRODUCTION, SESSION_AUTHENTICATION, ERRORS_AND_LIMITS].join('\n\n') + PUBLIC_SCOPE_NOTE
    );
  }
  return [INTRODUCTION, SESSION_AUTHENTICATION, API_TOKEN_AUTHENTICATION, ERRORS_AND_LIMITS].join(
    '\n\n',
  );
}

/**
 * Each entry is one way to call the route: with a session token, an API token, or none. The
 * public document leaves the API tokens out: it describes them nowhere.
 */
function security(route: DocumentedRoute, scope: DocumentScope) {
  if (route.access === 'session') return [SESSION];
  if (route.access === 'admin') return [SESSION, API_TOKEN];
  // The admin's token is optional: with it, the route also answers what only the admin sees
  if (route.access === 'optional')
    return scope === 'full' ? [{}, SESSION, API_TOKEN] : [{}, SESSION];
  return [];
}

function operationObject(
  route: DocumentedRoute,
  components: SchemaComponents,
  scope: DocumentScope,
) {
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
    security: security(route, scope),
    ...(params.length > 0 && { parameters: params }),
    ...(body && { requestBody: body }),
    responses: { ...responses, ...errorResponses(route) },
  };
}

function commonComponents(components: SchemaComponents, scope: DocumentScope) {
  components.output(ApiError);
  // Only the routes of the full document refuse API tokens
  const errors = [
    ...Object.values(COMMON_ERRORS),
    ...(scope === 'full' ? Object.values(TOKEN_REFUSALS) : []),
  ];
  const responses: Record<string, object> = Object.fromEntries(
    errors.map(({ name, description }) => [name, errorResponse(description)]),
  );
  responses[COMMON_ERRORS[429].name] = {
    ...errorResponse(COMMON_ERRORS[429].description),
    headers: headerObjects(RATE_LIMIT_HEADERS),
  };
  return responses;
}

function isInScope(route: DocumentedRoute, scope: DocumentScope): boolean {
  return scope === 'full' || !requiresToken(route);
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
  const responses = commonComponents(components, scope);
  const included = documentedRoutes(routes, scope);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of included) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = operationObject(route, components, scope);
  }
  const tags = [...new Set(included.map((route) => route.doc.tag))].sort();

  return {
    openapi: '3.1.1',
    info: {
      title: 'Carta Cocktail API',
      version,
      description: documentDescription(scope),
      license: { name: 'MIT', identifier: 'MIT' },
    },
    tags: tags.map((name) => ({ name })),
    paths,
    components: {
      schemas: components.schemas,
      responses,
      securitySchemes: {
        [SESSION_SCHEME]: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Session token of the admin, answered by `POST /api/auth/login`.',
        },
        ...(scope === 'full' && { [API_TOKEN_SCHEME]: API_TOKEN_SECURITY_SCHEME }),
      },
    },
  };
}

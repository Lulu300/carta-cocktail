import type { Application } from 'express';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { appVersion } from '../config';
import { isReadMethod } from '../middleware/auth';
import { buildOpenApiDocument, type DocumentedRoute, documentedRoutes } from '../openapi/document';
import type { JsonSchema } from '../openapi/jsonSchemas';
import { collectApiRoutes } from '../openapi/operations';
import { toValidationIssue } from '../validation/validate';
import {
  type Caller,
  type Operation,
  type OperationResponse,
  requestOperation,
} from './callOperation';
import {
  HostFunctionError,
  type HostFunction,
  runInSandbox,
  SANDBOX_LIMITS,
  type SandboxRequest,
  type SandboxResult,
} from './sandbox';

/*
 * Code Mode of the MCP server (F-15), in the form and with the names of Cloudflare's Code Mode
 * (`openApiMcpServer()` of `@cloudflare/codemode`): two tools whatever the size of the API.
 * `search` runs the agent's JavaScript on the OpenAPI document, `execute` runs JavaScript that
 * calls the API with `codemode.request()`. The code runs in the sandbox of sandbox.ts.
 *
 * Same reach as the typed tools: the admin operations of the document, without deletions nor the
 * routes reserved to the admin's session, whatever the token (a session included). Each request
 * goes through the API like a tool call (requestOperation): same token, rate limit, validation,
 * scope and errors. Off unless the admin turns it on in Settings (SiteSettings.codeModeEnabled).
 */

/** Longest code a call accepts, in characters. */
export const MAX_CODE_LENGTH = 20_000;
/**
 * Ends an answer cut at SANDBOX_LIMITS.outputChars (24,000 characters, about 6,000 tokens), as
 * Cloudflare marks it.
 */
export const TRUNCATION_MARKER = '--- TRUNCATED ---';

/** An operation of the document, as `codemode.request()` resolves a path against it. */
interface CodeModeOperation extends Operation {
  route: DocumentedRoute;
  /** `/api/bottles/{id}` -> `['api', 'bottles', '{id}']`. */
  segments: string[];
}

/** What Code Mode needs of the app: its operations, and the document a token may search. */
export interface CodeModeApi {
  /** Every documented route, in the order Express tries them. */
  operations: CodeModeOperation[];
  /** The JSON of the document of the operations Code Mode may call, with or without writes. */
  specJson: (canWrite: boolean) => string;
}

interface Refusal {
  status: number;
  key: string;
}

/** Why Code Mode may not call `route`, or nothing when it may. */
function refusalOf(route: DocumentedRoute, canWrite: boolean): Refusal | undefined {
  if (route.method === 'delete') return { status: 403, key: 'errors.codeModeDeletion' };
  if (route.access === 'session') return { status: 403, key: 'errors.codeModeSessionOnly' };
  if (route.access !== 'admin') return { status: 404, key: 'errors.codeModeUnknownOperation' };
  // codemode.request() sends JSON: a route that takes a file cannot get one
  if (route.doc.upload) return { status: 400, key: 'errors.codeModeFileUpload' };
  if (!canWrite && !isReadMethod(route.method)) {
    return { status: 403, key: 'errors.apiTokenReadOnly' };
  }
  return undefined;
}

/** The value at a local JSON pointer (`#/components/schemas/Unit`). */
function pointedValue(document: unknown, ref: string): unknown {
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      document,
    );
}

/**
 * The document with each local `$ref` replaced by what it points to, as Cloudflare's
 * `codemode.spec()` gives it: the code reads a schema where it is used. A reference to itself
 * becomes `{ $circular: ref }`. The components, all inlined, are left out but the security schemes.
 */
function dereferenced(document: { components: { securitySchemes: unknown } }): object {
  const resolve = (value: unknown, seen: string[]): unknown => {
    if (Array.isArray(value)) return value.map((item) => resolve(item, seen));
    if (typeof value !== 'object' || value === null) return value;
    const ref = (value as { $ref?: unknown }).$ref;
    if (typeof ref === 'string' && ref.startsWith('#/')) {
      if (seen.includes(ref)) return { $circular: ref };
      return resolve(pointedValue(document, ref), [...seen, ref]);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolve(item, seen)]),
    );
  };
  const resolved = resolve(document, []) as Record<string, unknown>;
  return { ...resolved, components: { securitySchemes: document.components.securitySchemes } };
}

function buildCodeModeApi(app: Application): CodeModeApi {
  const routes = documentedRoutes(collectApiRoutes(app), 'full');
  const operations = routes.map((route) => ({
    route,
    method: route.method,
    path: route.path,
    paramsSchema: route.schemas.params,
    segments: route.path.split('/').slice(1),
  }));
  const specs = new Map<boolean, string>();
  const specJson = (canWrite: boolean): string => {
    const cached = specs.get(canWrite);
    if (cached) return cached;
    const callable = routes.filter((route) => !refusalOf(route, canWrite));
    const document = buildOpenApiDocument(callable, { scope: 'full', version: appVersion() });
    const json = JSON.stringify(dereferenced(document));
    specs.set(canWrite, json);
    return json;
  };
  return { operations, specJson };
}

// The routes do not change once the app is built: read on the first request that needs them
const apiByApp = new WeakMap<Application, CodeModeApi>();

/** Code Mode's view of the app, read once. */
export function codeModeApiOf(app: Application): CodeModeApi {
  const api = apiByApp.get(app) ?? buildCodeModeApi(app);
  apiByApp.set(app, api);
  return api;
}

/** What `codemode.request()` accepts, as Cloudflare's `RequestOptions` (JSON bodies only). */
const RequestOptions = z.object({
  method: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  body: z.unknown().optional(),
});
type RequestOptions = z.infer<typeof RequestOptions>;

// The query goes in `query`; a backslash or `#` would make the URL say something else
const FORBIDDEN_PATH_CHARACTERS = /[?#\\]/;

/** The path parameters of `path` when it is a path of `operation`, decoded. */
function matchPath(
  operation: CodeModeOperation,
  segments: string[],
): Record<string, string> | undefined {
  if (operation.segments.length !== segments.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, expected] of operation.segments.entries()) {
    const segment = segments[index] as string;
    const name = /^\{(\w+)\}$/.exec(expected)?.[1];
    if (name) params[name] = decodeURIComponent(segment);
    else if (segment !== expected) return undefined;
  }
  return params;
}

/** `GET /api/units`: how an error message names the request. */
function requestLabel(options: RequestOptions): string {
  return `${options.method.toUpperCase()} ${options.path}`;
}

/** Rejects the request in the code with the status and body of an API error. */
function refused(
  request: string,
  status: number,
  body: { error: string; details?: unknown },
): HostFunctionError {
  return new HostFunctionError(`${request} answered ${status}: ${body.error}`, { status, body });
}

function refusedWith(caller: Caller, options: RequestOptions, refusal: Refusal) {
  return refused(requestLabel(options), refusal.status, { error: caller.translate(refusal.key) });
}

/** The operation and path parameters `options` name, when Code Mode may call it. */
function resolveOperation(
  api: CodeModeApi,
  caller: Caller,
  canWrite: boolean,
  options: RequestOptions,
): { operation: CodeModeOperation; params: Record<string, string> } {
  const method = options.method.toLowerCase();
  if (method === 'delete') {
    throw refusedWith(caller, options, { status: 403, key: 'errors.codeModeDeletion' });
  }
  if (!options.path.startsWith('/') || FORBIDDEN_PATH_CHARACTERS.test(options.path)) {
    throw refusedWith(caller, options, { status: 400, key: 'errors.codeModeInvalidPath' });
  }
  const segments = options.path.split('/').slice(1);
  for (const operation of api.operations) {
    if (operation.method !== method) continue;
    let params: Record<string, string> | undefined;
    try {
      params = matchPath(operation, segments);
    } catch {
      // A malformed percent-encoding in a parameter
      throw refusedWith(caller, options, { status: 400, key: 'errors.codeModeInvalidPath' });
    }
    if (!params) continue;
    const refusal = refusalOf(operation.route, canWrite);
    if (refusal) throw refusedWith(caller, options, refusal);
    return { operation, params };
  }
  throw refusedWith(caller, options, { status: 404, key: 'errors.codeModeUnknownOperation' });
}

function errorBodyOf(response: OperationResponse): { error: string; details?: unknown } {
  const { body } = response;
  if (typeof body === 'object' && body !== null && 'error' in body) {
    return body as { error: string; details?: unknown };
  }
  return { error: String(body) };
}

/**
 * `codemode.request()` of `execute`: answers `{ status, body }` of a success, and rejects with
 * the status and body of an error. The sandbox bounds the calls of a run (maxHostCalls).
 */
function requestFunction(api: CodeModeApi, caller: Caller, canWrite: boolean): HostFunction {
  return async (argument, signal) => {
    const parsed = RequestOptions.safeParse(argument);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => toValidationIssue(['options'], issue));
      throw refused('codemode.request()', 400, {
        error: caller.translate('errors.validationError'),
        details,
      });
    }
    const options = parsed.data;
    const { operation, params } = resolveOperation(api, caller, canWrite, options);
    const response = await requestOperation(
      caller,
      operation,
      {
        params,
        query: options.query ?? {},
        // A body on a GET would make fetch fail: a read sends none
        body: isReadMethod(operation.method) ? undefined : options.body,
      },
      signal,
    );
    if (response.status >= 400) {
      throw refused(requestLabel(options), response.status, errorBodyOf(response));
    }
    return response;
  };
}

/**
 * The text the sandbox handed back, cut at `outputChars` from `length` characters: a mark then
 * tells the agent to ask for less.
 */
function marked(text: string, length: number): string {
  const max = SANDBOX_LIMITS.outputChars;
  if (length <= max) return text;
  return `${text}\n\n${TRUNCATION_MARKER}\nThe answer has ${length} characters, cut at ${max}: return less, such as the fields you need.`;
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

/** The refusal of a run when the sandbox is full, in the form of the API's errors. */
function busyResult(caller: Caller): CallToolResult {
  const error = { status: 429, error: caller.translate('errors.codeModeBusy') };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(error) }] };
}

/** What a host call past the limit of a run rejects with, as an API refusal. */
function callRefusal(caller: Caller): HostFunctionError {
  const body = { error: caller.translate('errors.codeModeTooManyRequests') };
  return refused('codemode', 429, body);
}

/** Runs `code` in the sandbox with `api` under `codemode`, as a tool result. */
async function runCode(
  caller: Caller,
  code: unknown,
  api: Omit<SandboxRequest, 'code' | 'callRefusal'>,
): Promise<CallToolResult> {
  if (typeof code !== 'string') return errorResult(caller.translate('errors.codeModeNotAFunction'));
  if (code.length > MAX_CODE_LENGTH) {
    return errorResult(caller.translate('errors.codeModeCodeTooLong'));
  }
  return toolResultOf(
    caller,
    await runInSandbox({ code, ...api, callRefusal: callRefusal(caller) }),
  );
}

/** The result of a run as the agent reads it: the JSON of the value, or why the run failed. */
export function toolResultOf(caller: Caller, result: SandboxResult): CallToolResult {
  if (result.ok) return { content: [{ type: 'text', text: marked(result.json, result.length) }] };
  switch (result.reason) {
    case 'thrown':
      return errorResult(marked(result.message, result.length));
    case 'notAFunction':
      return errorResult(caller.translate('errors.codeModeNotAFunction'));
    case 'cpuTime':
      return errorResult(caller.translate('errors.codeModeCpuTime'));
    case 'wallTime':
      return errorResult(caller.translate('errors.codeModeWallTime'));
    case 'crashed':
      return errorResult(caller.translate('errors.codeModeCrashed'));
    case 'busy':
      return busyResult(caller);
    case 'cancelled':
      return errorResult(caller.translate('errors.codeModeCancelled'));
  }
}

const LIMITS = `Limits of a run: ${SANDBOX_LIMITS.wallTimeMs / 1000} s, ${SANDBOX_LIMITS.cpuTimeMs} ms of computation, ${SANDBOX_LIMITS.memoryBytes / (1024 * 1024)} MB of memory, ${SANDBOX_LIMITS.maxHostCalls} calls to the server (codemode.spec() included), code of ${MAX_CODE_LENGTH} characters at most; the answer is cut after ${SANDBOX_LIMITS.outputChars} characters (${TRUNCATION_MARKER}). Few runs at a time: a busy server refuses with the status 429, try again.`;

const SANDBOX = `Your code must be an async arrow function that returns the result. It runs in a sandbox on the server: no fetch, require, process, file system or timers.`;

const SEARCH_DESCRIPTION = `Search the OpenAPI document of the Carta Cocktail API: the operations this token may call. codemode.spec() returns it with every $ref resolved inline. Only what your code returns comes back to you, not the whole document.

${SANDBOX}

Examples:

// List all operations
async () => {
  const spec = await codemode.spec();
  const results = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      results.push({ method: method.toUpperCase(), path, summary: op.summary });
    }
  }
  return results;
}

// The parameters and body of one operation
async () => {
  const op = (await codemode.spec()).paths['/api/bottles/{id}'].put;
  return { parameters: op.parameters, body: op.requestBody.content['application/json'].schema };
}

${LIMITS}`;

function executeDescription(canWrite: boolean): string {
  const scope = canWrite
    ? 'Deleting and the routes reserved to the admin (API tokens, account, backups) are refused.'
    : 'This token is read-only: only GET requests are possible.';
  return `Call the Carta Cocktail API with JavaScript code. First use \`search\` to find the operations.

Available in your code:

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string; // a path of the document with its parameters filled in, such as "/api/cocktails/12"
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown; // sent as JSON
}

declare const codemode: {
  spec(): Promise<OpenApiSpec>; // as in search
  request(options: RequestOptions): Promise<{ status: number; body: unknown }>;
};

Each request goes through the API with the token of this connection: same checks, rate limit and errors. An error answer rejects with an Error whose \`status\` and \`body\` ({ error, details? }) are those of the API. ${scope}

${SANDBOX}

Example:
async () => {
  const { body: bottles } = await codemode.request({ method: "GET", path: "/api/bottles", query: { type: "SPIRIT" } });
  return bottles.filter((bottle) => bottle.remainingPercent < 20).map(({ id, name, remainingPercent }) => ({ id, name, remainingPercent }));
}

${LIMITS}`;
}

function codeInput(description: string): JsonSchema {
  return {
    type: 'object',
    properties: { code: { type: 'string', maxLength: MAX_CODE_LENGTH, description } },
    required: ['code'],
    additionalProperties: false,
  };
}

export interface CodeModeTool {
  name: 'search' | 'execute';
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /** `signal`: the cancellation of the tool call by the client. */
  run: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<CallToolResult>;
}

/** `search` and `execute` for `caller`, whose token may write or not. */
export function codeModeTools(api: CodeModeApi, caller: Caller, canWrite: boolean): CodeModeTool[] {
  // A value: the sandbox asks for it once per run, and the code gets the same object after
  const values = { spec: async () => JSON.parse(api.specJson(canWrite)) as unknown };
  return [
    {
      name: 'search',
      title: 'Search the API',
      description: SEARCH_DESCRIPTION,
      inputSchema: codeInput('JavaScript async arrow function to search the OpenAPI document'),
      annotations: { readOnlyHint: true, openWorldHint: false },
      run: (args, signal) => runCode(caller, args.code, { values, signal }),
    },
    {
      name: 'execute',
      title: 'Call the API with code',
      description: executeDescription(canWrite),
      inputSchema: codeInput('JavaScript async arrow function to execute'),
      annotations: { readOnlyHint: !canWrite, destructiveHint: canWrite, openWorldHint: false },
      run: (args, signal) =>
        runCode(caller, args.code, {
          values,
          signal,
          functions: { request: requestFunction(api, caller, canWrite) },
        }),
    },
  ];
}

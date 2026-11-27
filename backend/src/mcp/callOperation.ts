import { isIPv6 } from 'node:net';
import type { Request } from 'express';
import { toValidationIssue, type ValidationIssue } from '../validation/validate';
import type { OperationTool, RequestPart } from './operationTools';

/*
 * A tool runs its API operation as an HTTP request to this same server, at the address that
 * received the MCP request: the request goes through the whole app like any other, so it gets
 * the same rate limit, token checks (scope, revocation, session-only routes), validation and
 * error answers. The tool never reaches the database another way.
 *
 * Not an injection into the app without a socket: light-my-request, the usual tool for that,
 * rewrites the prototypes of Express's request and response for the whole process, which breaks
 * the real requests that follow.
 */

/** How long a tool waits for its API request: a stuck request must not hold the MCP client forever. */
export const OPERATION_TIMEOUT_MS = 30_000;

// Path segments a URL resolves (`/api/cocktails/..` is `/api/`): they would call another route
const DOT_SEGMENTS = new Set(['', '.', '..']);

/** Who calls the MCP endpoint: each API request of a tool is made on their behalf. */
export interface Caller {
  /** `http://<address>:<port>` where the server accepted the MCP request. */
  origin: string;
  /** The `Authorization` header of the MCP request: the same token authenticates the API request. */
  authorization: string;
  /**
   * The client address the API limiter counts (req.ip of the MCP request), forwarded in
   * `X-Forwarded-For`: the request comes from the server itself, a trusted proxy (TRUST_PROXY).
   */
  clientIp: string;
  /** `Accept-Language` of the MCP request: the API answers its errors in that language. */
  language?: string;
  /** Translates a message in the language of the MCP request (`req.t`), for the errors of the tool itself. */
  translate: (key: string) => string;
}

export interface OperationResponse {
  status: number;
  body: unknown;
}

type Arguments = Record<string, unknown>;

/** The caller of an MCP request, read from the Express request. */
export function callerOf(req: Request): Caller {
  const { localAddress, localPort } = req.socket;
  if (!localAddress || !localPort) throw new Error('The MCP request has no local address');
  const host = isIPv6(localAddress) ? `[${localAddress}]` : localAddress;
  return {
    origin: `http://${host}:${localPort}`,
    authorization: req.headers.authorization ?? '',
    clientIp: req.ip ?? localAddress,
    language: req.headers['accept-language'],
    translate: (key) => req.t(key),
  };
}

function argumentsIn(tool: OperationTool, args: Arguments, part: RequestPart): Arguments {
  return Object.fromEntries(
    Object.entries(args).filter(([name]) => tool.argumentParts[name] === part),
  );
}

function pathParameterNames(tool: OperationTool): string[] {
  return [...tool.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
}

/**
 * Checks the path parameters with the route's own schema before they go into the URL, as the
 * route would, and refuses the values that change the path itself: an empty one, `.` or `..`.
 */
function pathParameterIssues(tool: OperationTool, params: Arguments): ValidationIssue[] {
  const parsed = tool.paramsSchema?.safeParse(params);
  const issues = (parsed?.error?.issues ?? []).map((issue) => toValidationIssue(['params'], issue));
  for (const name of pathParameterNames(tool)) {
    const path = `params.${name}`;
    if (
      DOT_SEGMENTS.has(String(params[name] ?? '')) &&
      !issues.some((issue) => issue.path === path)
    ) {
      issues.push({ path, code: 'custom', message: 'Must not be empty, "." or ".."' });
    }
  }
  return issues;
}

/** `/api/bottles/{id}` with `{ id: 5 }` -> `/api/bottles/5`. The path parameters are checked already. */
function urlOf(tool: OperationTool, args: Arguments, origin: string): URL {
  const params = argumentsIn(tool, args, 'params');
  const path = tool.path.replace(/\{(\w+)\}/g, (_match, name: string) =>
    encodeURIComponent(String(params[name])),
  );
  const url = new URL(path, origin);
  for (const [name, value] of Object.entries(argumentsIn(tool, args, 'query'))) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  }
  return url;
}

function hasBody(tool: OperationTool): boolean {
  return Object.values(tool.argumentParts).includes('body');
}

function parseBody(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/**
 * Calls the operation of `tool` with the arguments of a tool call, as `caller`. Invalid path
 * parameters answer 400 and an API that does not answer in `timeoutMs` 504, in the form of the
 * API's errors. `signal` is the cancellation of the tool call by the client.
 */
export async function callOperation(
  caller: Caller,
  tool: OperationTool,
  args: Arguments,
  signal?: AbortSignal,
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<OperationResponse> {
  const issues = pathParameterIssues(tool, argumentsIn(tool, args, 'params'));
  if (issues.length > 0) {
    return {
      status: 400,
      body: { error: caller.translate('errors.validationError'), details: issues },
    };
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await request(caller, tool, args, signal ? AbortSignal.any([signal, timeout]) : timeout);
  } catch (error) {
    if (!isTimeout(error)) throw error;
    return { status: 504, body: { error: caller.translate('errors.mcpToolTimeout') } };
  }
}

async function request(
  caller: Caller,
  tool: OperationTool,
  args: Arguments,
  signal: AbortSignal,
): Promise<OperationResponse> {
  const withBody = hasBody(tool);
  const response = await fetch(urlOf(tool, args, caller.origin), {
    method: tool.method.toUpperCase(),
    headers: {
      authorization: caller.authorization,
      'x-forwarded-for': caller.clientIp,
      ...(caller.language && { 'accept-language': caller.language }),
      ...(withBody && { 'content-type': 'application/json' }),
    },
    ...(withBody && { body: JSON.stringify(argumentsIn(tool, args, 'body')) }),
    redirect: 'manual',
    signal,
  });
  return { status: response.status, body: parseBody(await response.text()) };
}

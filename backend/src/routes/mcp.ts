import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { Router, type Response } from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { AuthRequest } from '../middleware/auth';
import { callerOf } from '../mcp/callOperation';
import { createCartaMcpServer } from '../mcp/server';
import { operationToolsOf } from '../mcp/operationTools';
import { excludedFromApiDocs } from '../openapi/routeDoc';

/*
 * The MCP endpoint (F-15): Model Context Protocol over Streamable HTTP, without sessions. Each
 * request gets a server of its own, holding the tools its token may call (src/mcp/). The SDK
 * serves the 2026-07-28 revision and, for the clients of 2025, the stateless form of the older
 * ones; GET and DELETE, which only a session would use, answer 405.
 */

const router = Router();

const NOT_REST = excludedFromApiDocs(
  'JSON-RPC of the Model Context Protocol, not a REST route: each of its tools calls an operation the document describes.',
);

/** The Express request as the web-standard Request the SDK serves; the body is parsed already. */
function toWebRequest(req: AuthRequest, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host') ?? 'localhost'}`);
  return new Request(url, { method: req.method, headers, signal });
}

async function sendWebResponse(res: Response, response: globalThis.Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body as ReadableStream), res);
}

async function serveMcp(req: AuthRequest, res: Response): Promise<void> {
  const caller = callerOf(req);
  // Without sessions, a server lives for one request: the tools follow the token it carries
  const handler = createMcpHandler(() =>
    createCartaMcpServer(operationToolsOf(req.app), caller, req.canWrite === true),
  );
  const aborted = new AbortController();
  res.on('close', () => {
    aborted.abort();
    void handler.close();
  });
  const parsedBody: unknown = req.method === 'POST' ? req.body : undefined;
  const response = await handler.fetch(toWebRequest(req, aborted.signal), { parsedBody });
  await sendWebResponse(res, response);
}

router.post('/', NOT_REST, serveMcp);
router.get('/', NOT_REST, serveMcp);
router.delete('/', NOT_REST, serveMcp);

export default router;

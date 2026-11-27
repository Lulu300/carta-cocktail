import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Client } from '@modelcontextprotocol/client';
import { resetRateLimits } from '../middleware/rateLimit';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
  seedRequiredData,
  request,
  authHeader,
  getAuthToken,
  seedApiToken,
  seedBottle,
  seedCategory,
  listenOnLoopback,
  type ListeningServer,
  prisma,
  connectMcpClient,
} from '../test/helpers';
import { TOOL_CATALOG } from './catalog';
import i18next from '../i18n';
import type { Caller } from './callOperation';
import { MAX_CODE_LENGTH, toolResultOf, TRUNCATION_MARKER } from './codeMode';
import { MAX_CONCURRENT_RUNS, MAX_QUEUED_RUNS, SANDBOX_LIMITS } from './sandbox';

/*
 * Code Mode through the MCP endpoint, as a client sees it: the setting that shows `search` and
 * `execute`, their nominal use, and hostile code against the reach of `codemode.request()`.
 * The limits of the sandbox itself are tested in sandbox.test.ts.
 */

let server: ListeningServer;
let endpoint: URL;
const clients: Client[] = [];

beforeAll(async () => {
  await setupTestDatabase();
  server = await listenOnLoopback();
  endpoint = new URL(`http://127.0.0.1:${server.port}/api/mcp`);
});
afterAll(async () => {
  server.close();
  await teardownTestDatabase();
});
beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  await resetRateLimits();
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

type Headers = Record<string, string>;

const SESSION: Headers = { Authorization: `Bearer ${getAuthToken()}` };

async function setCodeMode(enabled: boolean): Promise<void> {
  await request.put('/api/settings/code-mode').set(authHeader()).send({ enabled }).expect(200);
}

async function readOnly(): Promise<Client> {
  return connectMcpClient(endpoint, (await seedApiToken({ scope: 'READ_ONLY' })).header, clients);
}

async function readWrite(): Promise<Client> {
  return connectMcpClient(endpoint, (await seedApiToken({ scope: 'READ_WRITE' })).header, clients);
}

async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name);
}

interface TextResult {
  isError?: boolean;
  content?: unknown;
}

function textOf(result: TextResult): string {
  const [content] = result.content as { type: string; text: string }[];
  expect(content?.type).toBe('text');
  return content!.text;
}

async function runTool(client: Client, name: 'search' | 'execute', code: string) {
  return (await client.callTool({ name, arguments: { code } })) as TextResult;
}

/** What the code returned, from a run that must succeed. */
async function valueOf(client: Client, name: 'search' | 'execute', code: string): Promise<unknown> {
  const result = await runTool(client, name, code);
  expect(result.isError, textOf(result)).toBeFalsy();
  return JSON.parse(textOf(result));
}

/** The text of a run that must fail. */
async function errorOf(client: Client, name: 'search' | 'execute', code: string): Promise<string> {
  const result = await runTool(client, name, code);
  expect(result.isError).toBe(true);
  return textOf(result);
}

/** Code that sends one request and answers its result, or the status, body and message of its error. */
function attempt(options: Record<string, unknown>): string {
  return `async () => {
    try {
      return { sent: await codemode.request(${JSON.stringify(options)}) };
    } catch (error) {
      return { status: error.status, body: error.body, message: error.message };
    }
  }`;
}

const ALL_OPERATIONS = `async () => {
  const spec = await codemode.spec();
  return Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => method.toUpperCase() + ' ' + path));
}`;

describe('the Code Mode setting', () => {
  it('should be off by default: no search nor execute, and calling them fails', async () => {
    const settings = await request.get('/api/settings').set(authHeader());
    expect(settings.body.codeModeEnabled).toBe(false);

    const client = await readWrite();

    expect(await toolNames(client)).toEqual(TOOL_CATALOG.map((tool) => tool.name));
    await expect(runTool(client, 'search', 'async () => 1')).rejects.toThrow(/search not found/);
    await expect(runTool(client, 'execute', 'async () => 1')).rejects.toThrow(/execute not found/);
  });

  it('should list search and execute once the admin turns it on, and hide them again once off', async () => {
    await setCodeMode(true);
    const client = await readOnly();

    expect(await toolNames(client)).toEqual(expect.arrayContaining(['search', 'execute']));
    expect(client.getInstructions()).toContain('Code Mode is on');
    expect(await valueOf(client, 'execute', 'async () => "on"')).toBe('on');

    await setCodeMode(false);

    // The next MCP request reads the setting again
    expect(await toolNames(client)).not.toContain('execute');
    await expect(runTool(client, 'execute', 'async () => 1')).rejects.toThrow(/execute not found/);
  });

  it('should refuse every API token on the route that turns it on, a read and write one too', async () => {
    const { header } = await seedApiToken({ scope: 'READ_WRITE' });

    const res = await request.put('/api/settings/code-mode').set(header).send({ enabled: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe(
      'API tokens cannot use this route: sign in to the admin panel instead',
    );
    expect(
      (await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 } })).codeModeEnabled,
    ).toBe(false);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await setCodeMode(true);
  });

  it('should run code on the document of the operations the token may call', async () => {
    const operations = (await valueOf(await readWrite(), 'search', ALL_OPERATIONS)) as string[];

    expect(operations).toEqual(
      expect.arrayContaining([
        'GET /api/cocktails',
        'PUT /api/bottles/{id}',
        'POST /api/cocktails',
      ]),
    );
    // Neither deletions, nor the routes of the session, nor the public ones, nor files to send
    expect(operations.filter((operation) => operation.startsWith('DELETE'))).toEqual([]);
    for (const left of [
      '/api/api-tokens',
      '/api/settings/profile',
      '/api/settings/code-mode',
      '/api/auth/logout-all',
      '/api/backup/export',
      '/api/public/',
      '/api/auth/login',
      '/api/health',
      '/api/bottles/import/preview',
      '/api/cocktails/{id}/image',
    ]) {
      expect(operations.filter((operation) => operation.includes(left))).toEqual([]);
    }
  });

  it('should give a read-only token the operations that read only', async () => {
    const operations = (await valueOf(await readOnly(), 'search', ALL_OPERATIONS)) as string[];

    expect(operations.length).toBeGreaterThan(10);
    expect(operations.every((operation) => operation.startsWith('GET '))).toBe(true);
  });

  it('should resolve every reference of the document inline', async () => {
    const code = `async () => {
      const spec = await codemode.spec();
      const op = spec.paths['/api/units/{id}'].get;
      return { json: JSON.stringify(spec).includes('"$ref"'), unit: op.responses['200'].content['application/json'].schema.type };
    }`;

    expect(await valueOf(await readOnly(), 'search', code)).toEqual({
      json: false,
      unit: 'object',
    });
  });

  it('should have no network: no request function, no fetch', async () => {
    expect(
      await valueOf(
        await readWrite(),
        'search',
        'async () => [typeof codemode.request, typeof fetch, typeof require, typeof process]',
      ),
    ).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
  });
});

describe('execute', () => {
  beforeEach(async () => {
    await setCodeMode(true);
  });

  it('should call the API with the token of the connection and answer status and body', async () => {
    const rum = await seedCategory({ name: 'Rum', type: 'SPIRIT' });
    await seedBottle({ name: 'Old rum', categoryId: rum.id, remainingPercent: 10 });
    await seedBottle({ name: 'New rum', categoryId: rum.id, remainingPercent: 90 });
    const code = `async () => {
      const { status, body } = await codemode.request({ method: 'GET', path: '/api/bottles', query: { type: 'SPIRIT' } });
      return { status, low: body.filter((bottle) => bottle.remainingPercent < 20).map((bottle) => bottle.name) };
    }`;

    expect(await valueOf(await readOnly(), 'execute', code)).toEqual({
      status: 200,
      low: ['Old rum'],
    });
  });

  it('should write with a read and write token, as the API route does', async () => {
    const bottle = await seedBottle({ remainingPercent: 100 });
    const code = `async () => (await codemode.request({ method: 'PUT', path: '/api/bottles/${bottle.id}', body: { remainingPercent: 35 } })).body.remainingPercent`;

    expect(await valueOf(await readWrite(), 'execute', code)).toBe(35);
    expect(
      (await prisma.bottle.findUniqueOrThrow({ where: { id: bottle.id } })).remainingPercent,
    ).toBe(35);
  });

  it('should reject an error answer with the status and body of the API', async () => {
    expect(
      await valueOf(
        await readOnly(),
        'execute',
        attempt({ method: 'GET', path: '/api/bottles/999' }),
      ),
    ).toEqual({
      status: 404,
      body: { error: 'Resource not found' },
      message: 'GET /api/bottles/999 answered 404: Resource not found',
    });
  });

  it('should answer the validation details of the API', async () => {
    const bottle = await seedBottle();
    const result = (await valueOf(
      await readWrite(),
      'execute',
      attempt({
        method: 'PUT',
        path: `/api/bottles/${bottle.id}`,
        body: { remainingPercent: 'a lot' },
      }),
    )) as { status: number; body: { details: { path: string }[] } };

    expect(result.status).toBe(400);
    expect(result.body.details.map((issue) => issue.path)).toContain('body.remainingPercent');
  });

  it('should send at most the number of requests of a run', async () => {
    const code = `async () => {
      let sent = 0;
      try {
        for (;;) {
          await codemode.request({ method: 'GET', path: '/api/units' });
          sent += 1;
        }
      } catch (error) {
        return { sent, status: error.status };
      }
    }`;

    expect(await valueOf(await readOnly(), 'execute', code)).toEqual({
      sent: SANDBOX_LIMITS.maxHostCalls,
      status: 429,
    });
  });

  it('should cut a huge answer with a mark', async () => {
    const text = textOf(await runTool(await readOnly(), 'execute', 'async () => "x".repeat(1e6)'));

    expect(text.length).toBeLessThan(SANDBOX_LIMITS.outputChars + 300);
    expect(text).toContain(TRUNCATION_MARKER);
    expect(text.startsWith('"xxx')).toBe(true);
  });

  it('should refuse code longer than the limit, and code that is not a function', async () => {
    const client = await readOnly();

    expect(
      await errorOf(client, 'execute', `async () => ${'1'.padEnd(MAX_CODE_LENGTH, '0')}`),
    ).toBe('Error: The code is too long: see the limits in the description of the tool');
    expect(
      await errorOf(client, 'execute', 'codemode.request({ method: "GET", path: "/api/units" })'),
    ).toBe('Error: The code must be an async arrow function, such as: async () => { … }');
    const missing = (await client.callTool({ name: 'execute', arguments: {} })) as TextResult;
    expect(missing.isError).toBe(true);
  });

  it('should report the error the code throws', async () => {
    expect(
      await errorOf(await readOnly(), 'execute', 'async () => { throw new Error("broken") }'),
    ).toBe('Error: Error: broken');
  });

  it('should stop an endless loop at the CPU limit and answer in the language of the client', async () => {
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });
    const client = await connectMcpClient(
      endpoint,
      { ...header, 'Accept-Language': 'fr' },
      clients,
    );

    expect(await errorOf(client, 'execute', 'async () => { while (true) {} }')).toBe(
      'Error: Le code a calculé trop longtemps : il a été arrêté',
    );
  });

  it('should stop a recursion too deep, and keep serving', async () => {
    const client = await readOnly();
    const deep = 'let o = {}; for (let i = 0; i < 100000; i++) o = { o };';

    expect(await errorOf(client, 'execute', `async () => { ${deep} return o }`)).toBe(
      'Error: InternalError: stack overflow',
    );
    expect(await valueOf(client, 'execute', 'async () => "served"')).toBe('served');
  });

  it('should refuse a run at once when the sandbox is full, in the form of the API errors', async () => {
    const client = await readOnly();
    const accepted = MAX_CONCURRENT_RUNS + MAX_QUEUED_RUNS;
    const calls = Array.from({ length: accepted + 1 }, () =>
      runTool(client, 'execute', 'async () => { while (true) {} }'),
    );

    const refused = await calls[accepted]!;
    const results = await Promise.all(calls.slice(0, accepted));

    expect(refused.isError).toBe(true);
    expect(JSON.parse(textOf(refused))).toEqual({
      status: 429,
      error: 'The server is already running as much code as it may: try again in a moment',
    });
    expect(results.map(textOf)).toEqual(
      Array(accepted).fill('Error: The code computed for too long: it was stopped'),
    );
  });

  it('should keep this server serving other requests while code runs', async () => {
    const client = await readOnly();
    const busy = runTool(client, 'execute', 'async () => { while (true) {} }');
    // Let the run start in its worker
    await new Promise((resolve) => setTimeout(resolve, 200));

    const started = Date.now();
    await request.get('/api/public/settings').expect(200);
    expect(Date.now() - started).toBeLessThan(200);
    await busy;
  });
});

describe('the answer of a run', () => {
  const caller: Caller = {
    origin: 'http://127.0.0.1',
    authorization: '',
    clientIp: '127.0.0.1',
    translate: (key) => i18next.getFixedT('en')(key),
  };
  const textOfResult = (result: Parameters<typeof toolResultOf>[1]) =>
    textOf(toolResultOf(caller, result));

  it('should mark an answer or an error message cut by the sandbox', () => {
    expect(textOfResult({ ok: true, json: '"short"', length: 7 })).toBe('"short"');
    expect(textOfResult({ ok: true, json: 'x', length: SANDBOX_LIMITS.outputChars + 1 })).toContain(
      TRUNCATION_MARKER,
    );
    expect(
      textOfResult({ ok: false, reason: 'thrown', message: 'Error: long', length: 1e6 }),
    ).toContain(TRUNCATION_MARKER);
  });

  it.each([
    ['notAFunction', 'Error: The code must be an async arrow function, such as: async () => { … }'],
    ['cpuTime', 'Error: The code computed for too long: it was stopped'],
    ['wallTime', 'Error: The code did not finish in time: it was stopped'],
    [
      'crashed',
      'Error: The code exhausted the resources of the sandbox (stack or memory): it was stopped',
    ],
    ['cancelled', 'Error: The call was cancelled before its code ran'],
  ] as const)('should explain a run ended by %s', (reason, text) => {
    const result = toolResultOf(caller, { ok: false, reason });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(text);
  });
});

describe('execute against hostile code', () => {
  beforeEach(async () => {
    await setCodeMode(true);
  });

  it('should refuse every DELETE, even with the session of the admin, and delete nothing', async () => {
    const bottle = await seedBottle();
    const client = await connectMcpClient(endpoint, SESSION, clients);

    for (const path of [`/api/bottles/${bottle.id}`, '/api/api-tokens/1', '/api/nothing']) {
      expect(await valueOf(client, 'execute', attempt({ method: 'delete', path }))).toEqual({
        status: 403,
        body: { error: 'Code Mode cannot delete anything: the admin deletes in the app' },
        message: `DELETE ${path} answered 403: Code Mode cannot delete anything: the admin deletes in the app`,
      });
    }
    expect(await prisma.bottle.count()).toBe(1);
  });

  it('should refuse the routes of the session, even with the session of the admin', async () => {
    const { id } = await seedApiToken({ scope: 'READ_ONLY' });
    const client = await connectMcpClient(endpoint, SESSION, clients);
    const sessionOnly = [
      { method: 'GET', path: '/api/api-tokens' },
      { method: 'POST', path: '/api/api-tokens', body: { name: 'Stolen' } },
      { method: 'PUT', path: '/api/settings/profile', body: { email: 'thief@example.com' } },
      { method: 'PUT', path: '/api/settings/code-mode', body: { enabled: false } },
      { method: 'POST', path: '/api/auth/logout-all' },
      { method: 'GET', path: '/api/backup/export' },
      { method: 'POST', path: '/api/backup/import' },
    ];

    for (const options of sessionOnly) {
      expect(await valueOf(client, 'execute', attempt(options))).toMatchObject({
        status: 403,
        body: { error: 'Code Mode cannot use this route: the admin uses it in the app' },
      });
    }
    // Nothing changed: the tokens, the account, the setting, the sessions
    expect(await prisma.apiToken.findMany({ select: { id: true } })).toEqual([{ id }]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 1 } })).email).not.toBe(
      'thief@example.com',
    );
    expect(await toolNames(client)).toContain('execute');
  });

  it('should refuse a path that is not an admin operation of the document', async () => {
    const client = await readWrite();
    const unknown = { status: 404, body: { error: expect.stringMatching(/^No admin operation/) } };
    const invalid = { status: 400, body: { error: expect.stringMatching(/^The path must start/) } };

    for (const [options, expected] of [
      [{ method: 'POST', path: '/api/mcp' }, unknown],
      [{ method: 'GET', path: '/api/public/settings' }, unknown],
      [{ method: 'POST', path: '/api/auth/login' }, unknown],
      [{ method: 'GET', path: '/etc/passwd' }, unknown],
      [{ method: 'GET', path: '/api/bottles/../api-tokens' }, unknown],
      [{ method: 'GET', path: '//evil.example/api/bottles' }, unknown],
      // An empty path parameter, refused by the check of path parameters
      [{ method: 'GET', path: '/api/bottles/' }, { status: 400 }],
      [{ method: 'PATCH', path: '/api/bottles' }, unknown],
      [{ method: 'GET', path: 'http://evil.example/api/bottles' }, invalid],
      [{ method: 'GET', path: 'api/bottles' }, invalid],
      [{ method: 'GET', path: '/api/bottles?type=SPIRIT' }, invalid],
      [{ method: 'GET', path: '/api/bottles#x' }, invalid],
      [{ method: 'GET', path: '/api\\bottles' }, invalid],
      [{ method: 'GET', path: '/api/bottles/%E0%A4%A' }, invalid],
    ] as const) {
      expect(await valueOf(client, 'execute', attempt(options)), options.path).toMatchObject(
        expected,
      );
    }
  });

  it('should refuse a path parameter that would change the path', async () => {
    const client = await readWrite();

    for (const id of ['%2e%2e', '.', '%2E', 'abc%2F..%2Fapi-tokens']) {
      const result = (await valueOf(
        client,
        'execute',
        attempt({ method: 'GET', path: `/api/bottles/${id}` }),
      )) as { status: number };
      expect(result.status, id).toBe(400);
    }
  });

  it('should refuse a route that takes a file', async () => {
    expect(
      await valueOf(
        await readWrite(),
        'execute',
        attempt({ method: 'POST', path: '/api/bottles/import/preview', body: {} }),
      ),
    ).toMatchObject({
      status: 400,
      body: { error: 'This operation takes a file, which Code Mode cannot send' },
    });
  });

  it('should refuse options that are not a request', async () => {
    expect(await valueOf(await readWrite(), 'execute', attempt({ method: 'GET' }))).toMatchObject({
      status: 400,
      body: { error: 'Validation error', details: [{ path: 'options.path' }] },
    });
  });

  it('should keep a read-only token from writing, and change nothing', async () => {
    const bottle = await seedBottle({ remainingPercent: 100 });

    expect(
      await valueOf(
        await readOnly(),
        'execute',
        attempt({
          method: 'PUT',
          path: `/api/bottles/${bottle.id}`,
          body: { remainingPercent: 0 },
        }),
      ),
    ).toMatchObject({
      status: 403,
      body: { error: 'This API token is read-only: create a read and write token to change data' },
    });
    expect(
      (await prisma.bottle.findUniqueOrThrow({ where: { id: bottle.id } })).remainingPercent,
    ).toBe(100);
  });

  it('should give the code no host object to reach', async () => {
    const code = `async () => [
      typeof require, typeof process, typeof globalThis.fetch, typeof setTimeout,
      await codemode.request.constructor('return typeof process')(),
      await (async () => { try { await import('fs'); return 'imported' } catch { return 'refused' } })(),
    ]`;

    expect(await valueOf(await readWrite(), 'execute', code)).toEqual([
      'undefined',
      'undefined',
      'undefined',
      'undefined',
      'undefined',
      'refused',
    ]);
  });

  it('should refuse a revoked token at the next request', async () => {
    const { id, header } = await seedApiToken({ scope: 'READ_ONLY' });
    const client = await connectMcpClient(endpoint, header, clients);
    await request.delete(`/api/api-tokens/${id}`).set(authHeader()).expect(200);

    await expect(runTool(client, 'execute', 'async () => 1')).rejects.toThrow();
  });
});

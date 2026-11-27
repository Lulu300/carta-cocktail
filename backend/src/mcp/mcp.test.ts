import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  Client,
  type ClientOptions,
  SdkHttpError,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { appVersion } from '../config';
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
  seedUnit,
  seedIngredient,
  seedFullCocktail,
  seedMenu,
  addBottleToMenu,
  findSystemMenu,
  listenOnLoopback,
  type ListeningServer,
  prisma,
} from '../test/helpers';
import { TOOL_CATALOG } from './catalog';
import { callOperation } from './callOperation';
import { operationToolsOf } from './operationTools';
import app from '../app';

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

/** An MCP client of the endpoint, connected with these headers (the 2025 handshake by default). */
async function connect(headers: Headers, options: ClientOptions = {}): Promise<Client> {
  const client = new Client({ name: 'carta-test', version: '1.0.0' }, options);
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers } }));
  return client;
}

async function readOnlyHeader(): Promise<Headers> {
  return (await seedApiToken({ scope: 'READ_ONLY' })).header;
}

async function readWriteHeader(): Promise<Headers> {
  return (await seedApiToken({ scope: 'READ_WRITE' })).header;
}

async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((tool) => tool.name);
}

// The tools whose route is a GET, in the order of the catalog: a read-only token sees these only
const READ_TOOLS = [
  'list_cocktails',
  'get_cocktail',
  'list_cocktail_availability',
  'get_cocktail_availability',
  'list_shortages',
  'list_bottles',
  'get_bottle',
  'list_categories',
  'list_ingredients',
  'list_units',
  'list_menus',
  'get_menu',
];
const ALL_TOOLS = TOOL_CATALOG.map((tool) => tool.name);

/** Walks a JSON value and lists every `$ref`. */
function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key === '$ref' ? [String(entry)] : refsIn(entry),
  );
}

describe('protocol', () => {
  it('should answer the 2025 handshake with the server, its version and its tools', async () => {
    const client = await connect(await readOnlyHeader());

    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getServerVersion()).toMatchObject({
      name: 'carta-cocktail',
      version: appVersion(),
    });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toContain('Carta Cocktail');
  });

  it('should serve the 2026-07-28 revision too', async () => {
    const client = await connect(await readOnlyHeader(), {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    });

    expect(client.getProtocolEra()).toBe('modern');
    expect(await toolNames(client)).toEqual(READ_TOOLS);
    const result = await client.callTool({ name: 'list_units', arguments: {} });
    expect(result.isError).toBeFalsy();
  });

  it('should answer 405 to GET and DELETE: there are no sessions', async () => {
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });

    expect((await request.get('/api/mcp').set(header)).status).toBe(405);
    expect((await request.delete('/api/mcp').set(header)).status).toBe(405);
  });
});

describe('tokens and scope', () => {
  it('should refuse a request without a token with the API error', async () => {
    const res = await request.post('/api/mcp').send({ jsonrpc: '2.0', id: 1, method: 'ping' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('should refuse a revoked token', async () => {
    const { id, header } = await seedApiToken({ scope: 'READ_ONLY' });
    await request.delete(`/api/api-tokens/${id}`).set(authHeader()).expect(200);

    const refused = await connect(header).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(SdkHttpError);
    expect((refused as SdkHttpError).status).toBe(401);
  });

  it('should refuse an expired token', async () => {
    const { header } = await seedApiToken({
      scope: 'READ_WRITE',
      expiresInDays: 30,
      createdAt: new Date(Date.now() - 31 * 24 * 60 * 60_000),
    });

    const refused = await connect(header).catch((error: unknown) => error);
    expect((refused as SdkHttpError).status).toBe(401);
  });

  it('should list only the tools that read to a read-only token', async () => {
    const client = await connect(await readOnlyHeader());

    expect(await toolNames(client)).toEqual(READ_TOOLS);
    expect(READ_TOOLS).toContain('list_cocktails');
    expect(READ_TOOLS).not.toContain('update_bottle');
  });

  it('should refuse a tool that writes to a read-only token, and change nothing', async () => {
    const bottle = await seedBottle({ remainingPercent: 100 });
    const client = await connect(await readOnlyHeader());

    await expect(
      client.callTool({ name: 'update_bottle', arguments: { id: bottle.id, remainingPercent: 0 } }),
    ).rejects.toThrow(/update_bottle not found/);
    expect(
      (await prisma.bottle.findUniqueOrThrow({ where: { id: bottle.id } })).remainingPercent,
    ).toBe(100);
  });

  it('should leave the scope to the API too: its route refuses the write of a read-only token', async () => {
    const bottle = await seedBottle({ remainingPercent: 100 });
    const { header } = await seedApiToken({ scope: 'READ_ONLY' });
    const updateBottle = operationToolsOf(app).find((tool) => tool.name === 'update_bottle')!;

    const response = await callOperation(
      { origin: endpoint.origin, authorization: header.Authorization!, clientIp: '127.0.0.1' },
      updateBottle,
      { id: bottle.id, remainingPercent: 0 },
    );

    expect(response).toEqual({
      status: 403,
      body: {
        error: 'This API token is read-only: create a read and write token to change data',
      },
    });
  });

  it('should list every tool to a read and write token, and to the session of the admin', async () => {
    expect(await toolNames(await connect(await readWriteHeader()))).toEqual(ALL_TOOLS);
    expect(await toolNames(await connect({ Authorization: `Bearer ${getAuthToken()}` }))).toEqual(
      ALL_TOOLS,
    );
  });
});

describe('tool schemas', () => {
  it('should give every tool an object input and output schema without references', async () => {
    const { tools } = await (await connect(await readWriteHeader())).listTools();

    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema?.type).toBe('object');
      expect(refsIn(tool)).toEqual([]);
      expect(tool.description).toContain('Example:');
    }
  });

  it('should keep the tools a client sees: a change of an API schema shows here', async () => {
    // Update with `npx vitest run src/mcp/mcp.test.ts -u` after a deliberate change of the API
    const { tools } = await (await connect(await readWriteHeader())).listTools();

    await expect(`${JSON.stringify(tools, null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/tools.json',
    );
  });
});

describe('tool calls', () => {
  // Each test of this block records the tools it calls: the last one checks none was forgotten
  const called = new Set<string>();
  let client: Client;

  beforeEach(async () => {
    client = await connect(await readWriteHeader());
  });

  /** Calls a tool that must succeed, and returns its structured result. */
  async function call(name: string, args: Record<string, unknown> = {}) {
    called.add(name);
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(structured) }]);
    return structured;
  }

  it('should read cocktails and what the stock allows', async () => {
    const cocktail = await seedFullCocktail({ name: 'Daiquiri' });

    expect(await call('list_cocktails')).toMatchObject({ items: [{ id: cocktail.id }] });
    expect(await call('get_cocktail', { id: cocktail.id })).toMatchObject({ name: 'Daiquiri' });
    expect(await call('list_cocktail_availability')).toMatchObject({
      [cocktail.id]: { cocktailId: cocktail.id, isAvailable: true },
    });
    expect(await call('get_cocktail_availability', { id: cocktail.id })).toMatchObject({
      cocktailId: cocktail.id,
      maxServings: expect.any(Number),
    });
  });

  it('should read the stock and the shortages', async () => {
    const rum = await seedCategory({ name: 'Rum', type: 'SPIRIT', desiredStock: 2 });
    const syrup = await seedCategory({ name: 'Syrup', type: 'SYRUP' });
    const bottle = await seedBottle({ name: 'Havana', categoryId: rum.id, remainingPercent: 40 });
    await seedBottle({ name: 'Orgeat', categoryId: syrup.id });
    await seedIngredient({ name: 'Lime' });

    expect(await call('list_bottles', { type: 'SPIRIT' })).toMatchObject({
      items: [{ id: bottle.id, name: 'Havana' }],
    });
    expect(await call('list_bottles', { categoryId: syrup.id })).toMatchObject({
      items: [{ name: 'Orgeat' }],
    });
    expect(await call('get_bottle', { id: bottle.id })).toMatchObject({ remainingPercent: 40 });
    expect(await call('list_shortages')).toMatchObject({
      items: [{ category: { id: rum.id }, totalPercent: 40, requiredPercent: 130 }],
    });
    expect((await call('list_categories')).items).toHaveLength(2);
    expect(await call('list_ingredients')).toMatchObject({ items: [{ name: 'Lime' }] });
    expect((await call('list_units')).items).toEqual(expect.any(Array));
  });

  it('should adjust the stock of a bottle', async () => {
    const bottle = await seedBottle({ remainingPercent: 100 });

    expect(await call('update_bottle', { id: bottle.id, remainingPercent: 35 })).toMatchObject({
      id: bottle.id,
      remainingPercent: 35,
    });
    expect(
      (await prisma.bottle.findUniqueOrThrow({ where: { id: bottle.id } })).remainingPercent,
    ).toBe(35);
  });

  it('should create and update a cocktail', async () => {
    const unit = await seedUnit();
    const category = await seedCategory({ name: 'Rum' });

    const created = await call('create_cocktail', {
      name: 'Daiquiri',
      tags: ['classic'],
      ingredients: [
        { sourceType: 'CATEGORY', categoryId: category.id, quantity: 6, unitId: unit.id },
      ],
      instructions: ['Shake with ice'],
    });
    expect(created).toMatchObject({ name: 'Daiquiri', tags: 'classic' });

    const updated = await call('update_cocktail', { id: created.id, isAvailable: false });
    expect(updated).toMatchObject({ id: created.id, isAvailable: false, ingredients: [{}] });
  });

  it('should compose and publish a menu', async () => {
    const cocktail = await seedFullCocktail();
    const menu = await seedMenu({ isPublic: false });

    expect(await call('list_menus')).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: menu.id })]),
    });
    await call('update_menu', {
      id: menu.id,
      isPublic: true,
      cocktails: [{ cocktailId: cocktail.id }],
    });
    expect(await call('get_menu', { id: menu.id })).toMatchObject({
      isPublic: true,
      cocktails: [{ cocktailId: cocktail.id }],
    });
  });

  it('should remove bottles from a system menu and put them back', async () => {
    const aperitifs = await findSystemMenu('aperitifs');
    const bottle = await seedBottle({ isApero: true });
    await addBottleToMenu(aperitifs.id, bottle.id);

    await call('exclude_menu_bottles', { menuId: aperitifs.id, bottleIds: [bottle.id] });
    expect(await prisma.menuBottle.count({ where: { menuId: aperitifs.id } })).toBe(0);

    await call('restore_menu_bottles', { menuId: aperitifs.id, bottleIds: [bottle.id] });
    expect(await prisma.menuBottle.count({ where: { menuId: aperitifs.id } })).toBe(1);
  });

  it('should preview a cocktail import without writing anything', async () => {
    const preview = await call('preview_cocktail_import', {
      version: 1,
      cocktail: {
        name: 'Negroni',
        ingredients: [
          { sourceType: 'CATEGORY', sourceName: 'Gin', quantity: 3, unit: { abbreviation: 'cl' } },
        ],
      },
    });

    expect(preview).toMatchObject({ cocktail: { name: 'Negroni', alreadyExists: false } });
    expect(await prisma.cocktail.count()).toBe(0);
  });

  it('should have called every tool of the catalog', () => {
    expect([...called].sort()).toEqual([...ALL_TOOLS].sort());
  });
});

describe('tool errors', () => {
  it('should answer the status and the message of the API', async () => {
    const client = await connect(await readOnlyHeader());

    const result = await client.callTool({ name: 'get_cocktail', arguments: { id: 999 } });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ status: 404, error: 'Resource not found' }) },
    ]);
  });

  it('should answer the validation details of the API, in the language of the request', async () => {
    const bottle = await seedBottle();
    const client = await connect({ ...(await readWriteHeader()), 'Accept-Language': 'fr' });

    const result = await client.callTool({
      name: 'update_bottle',
      arguments: { id: bottle.id, remainingPercent: 150 },
    });

    expect(result.isError).toBe(true);
    const [content] = result.content as { text: string }[];
    expect(JSON.parse(content!.text)).toMatchObject({
      status: 400,
      error: 'Erreur de validation',
      details: [{ path: 'body.remainingPercent', code: 'too_big' }],
    });
  });
});

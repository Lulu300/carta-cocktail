import {
  type CallToolResult,
  McpServer,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import { appVersion } from '../config';
import type { JsonSchema } from '../openapi/jsonSchemas';
import { type Caller, callOperation, type OperationResponse } from './callOperation';
import { type CodeModeApi, codeModeTools } from './codeMode';
import type { OperationTool } from './operationTools';

const INSTRUCTIONS = `Tools of a Carta Cocktail instance: cocktail recipes, bottle stock and published menus.
Ids come from the list tools. Names are stored in the admin's language; \`nameTranslations\` holds the others.
Tools that write are only listed for a read and write token. Deleting, restoring a backup and signing out everywhere are not possible here: the admin does them in the app.`;

const CODE_MODE_INSTRUCTIONS = `Code Mode is on: \`search\` runs JavaScript on the OpenAPI document of the operations this token may call, and \`execute\` runs JavaScript that calls them with codemode.request(), in a sandbox on the server. Use them for what the other tools do not cover, or to combine many calls in one.`;

/**
 * A schema the SDK advertises as it is, and does not check: the API checks the request
 * (validate() of the route, with its error details), and the contract tests check its
 * responses. Checking twice would answer some errors in another form than the API.
 */
function advertisedOnly(schema: JsonSchema): StandardSchemaWithJSON<Record<string, unknown>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'carta-cocktail',
      validate: (value) => ({ value: value as Record<string, unknown> }),
      jsonSchema: { input: () => schema, output: () => schema },
    },
  };
}

function textOf(value: unknown): CallToolResult['content'] {
  return [{ type: 'text', text: JSON.stringify(value) }];
}

/** The response of the API as a tool result: the body on success, the API's error otherwise. */
function toolResult(tool: OperationTool, response: OperationResponse): CallToolResult {
  const succeeded = response.status >= 200 && response.status < 300;
  if (!succeeded) {
    const error =
      typeof response.body === 'object' && response.body !== null
        ? response.body
        : { error: response.body };
    return { isError: true, content: textOf({ status: response.status, ...error }) };
  }
  const structuredContent = (tool.wrapsItems ? { items: response.body } : response.body) as Record<
    string,
    unknown
  >;
  return { content: textOf(structuredContent), structuredContent };
}

/** Registers `search` and `execute` (codeMode.ts). */
function registerCodeModeTools(
  server: McpServer,
  codeMode: CodeModeApi,
  caller: Caller,
  canWrite: boolean,
): void {
  for (const tool of codeModeTools(codeMode, caller, canWrite)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: advertisedOnly(tool.inputSchema),
        annotations: { title: tool.title, ...tool.annotations },
      },
      (args, ctx) => tool.run(args, ctx.mcpReq.signal),
    );
  }
}

/**
 * The MCP server of one request: the tools `caller` may call. A read-only token does not see
 * the tools that write; were one called anyway, its API request would get the API's 403.
 * `codeMode`, when the admin turned it on, adds `search` and `execute`.
 */
export function createCartaMcpServer(
  tools: OperationTool[],
  caller: Caller,
  canWrite: boolean,
  codeMode?: CodeModeApi,
): McpServer {
  const instructions = codeMode ? `${INSTRUCTIONS}\n${CODE_MODE_INSTRUCTIONS}` : INSTRUCTIONS;
  const server = new McpServer(
    { name: 'carta-cocktail', title: 'Carta Cocktail', version: appVersion() },
    { instructions },
  );
  for (const tool of tools) {
    if (tool.writes && !canWrite) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: advertisedOnly(tool.inputSchema),
        outputSchema: advertisedOnly(tool.outputSchema),
        annotations: { title: tool.title, ...tool.annotations },
      },
      async (args, ctx) =>
        toolResult(tool, await callOperation(caller, tool, args, ctx.mcpReq.signal)),
    );
  }
  if (codeMode) registerCodeModeTools(server, codeMode, caller, canWrite);
  return server;
}

import {
  type CallToolResult,
  McpServer,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import { appVersion } from '../config';
import type { JsonSchema } from '../openapi/jsonSchemas';
import { type Caller, callOperation, type OperationResponse } from './callOperation';
import type { OperationTool } from './operationTools';

const INSTRUCTIONS = `Tools of a Carta Cocktail instance: cocktail recipes, bottle stock and published menus.
Ids come from the list tools. Names are stored in the admin's language; \`nameTranslations\` holds the others.
Tools that write are only listed for a read and write token. Deleting, restoring a backup and signing out everywhere are not possible here: the admin does them in the app.`;

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

/**
 * The MCP server of one request: the tools `caller` may call. A read-only token does not see
 * the tools that write; were one called anyway, its API request would get the API's 403.
 */
export function createCartaMcpServer(
  tools: OperationTool[],
  caller: Caller,
  canWrite: boolean,
): McpServer {
  const server = new McpServer(
    { name: 'carta-cocktail', title: 'Carta Cocktail', version: appVersion() },
    { instructions: INSTRUCTIONS },
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
  return server;
}

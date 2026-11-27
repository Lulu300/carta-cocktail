import type { Application } from 'express';
import { z } from 'zod';
import { isReadMethod } from '../middleware/auth';
import { type DocumentedRoute, documentedRoutes } from '../openapi/document';
import { inputSchema, type JsonSchema, standaloneOutputSchema } from '../openapi/jsonSchemas';
import { type ApiRoute, collectApiRoutes } from '../openapi/operations';
import { TOOL_CATALOG, type ToolDefinition, type ToolHints } from './catalog';

/*
 * Turns each tool of the catalog into what an MCP client sees, from the route of its operation
 * as Express runs it (the same reading as the OpenAPI document, F-14): the input schema is the
 * route's path parameters, query and body side by side, the output schema its success
 * response. Nothing is written twice: a schema that changes in src/validation/ changes the tool.
 */

export type RequestPart = 'params' | 'query' | 'body';

const REQUEST_PARTS: RequestPart[] = ['params', 'query', 'body'];

export interface OperationTool {
  name: string;
  title: string;
  description: string;
  operationId: string;
  /** Lowercase, as Express lists it: `put`. */
  method: string;
  /** OpenAPI form: `/api/bottles/{id}`. */
  path: string;
  /** A read-only API token may not call it (authMiddleware): the tool is hidden from it. */
  writes: boolean;
  /** An object whose properties are the arguments, without references. */
  inputSchema: JsonSchema;
  /** An object, without references: the response, or `{ items }` for a list. */
  outputSchema: JsonSchema;
  /** Where each argument goes in the request. */
  argumentParts: Record<string, RequestPart>;
  /** The route's schema of its path parameters: checked before they go into the URL. */
  paramsSchema?: z.ZodType;
  /** The response is an array, sent as `{ items }`: a structured result is an object. */
  wrapsItems: boolean;
  annotations: Required<ToolHints> & { idempotentHint: boolean; openWorldHint: boolean };
}

interface ObjectSchema {
  type?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

function toolError(tool: ToolDefinition, message: string): Error {
  return new Error(`MCP tool ${tool.name} (${tool.operationId}): ${message}`);
}

/** The arguments of the tool: the properties of the request parts, which must not overlap. */
function argumentsOf(tool: ToolDefinition, route: ApiRoute) {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const argumentParts: Record<string, RequestPart> = {};
  for (const part of REQUEST_PARTS) {
    const schema = route.schemas[part];
    if (!schema) continue;
    const converted = inputSchema(schema) as ObjectSchema;
    if (converted.type !== 'object' || !converted.properties) {
      throw toolError(tool, `the ${part} of the request is not an object`);
    }
    for (const [name, property] of Object.entries(converted.properties)) {
      if (name in argumentParts) {
        throw toolError(tool, `"${name}" is both in the ${argumentParts[name]} and the ${part}`);
      }
      properties[name] = property;
      argumentParts[name] = part;
    }
    required.push(...(converted.required ?? []));
  }
  const schema: JsonSchema = {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
    additionalProperties: false,
  };
  return { schema, argumentParts };
}

/** The one JSON response a route answers on success. */
function successSchema(tool: ToolDefinition, route: DocumentedRoute): z.ZodType {
  const schemas = Object.entries(route.doc.responses)
    .filter(([status]) => Number(status) >= 200 && Number(status) < 300)
    .map(([, response]) => response)
    .filter((response): response is z.ZodType => response instanceof z.ZodType);
  if (schemas.length !== 1) throw toolError(tool, 'the route has no single JSON success response');
  return schemas[0] as z.ZodType;
}

function outputOf(tool: ToolDefinition, route: DocumentedRoute) {
  const schema = standaloneOutputSchema(successSchema(tool, route));
  if (schema.type === 'object') return { schema, wrapsItems: false };
  if (schema.type !== 'array')
    throw toolError(tool, 'the response is neither an object nor a list');
  return {
    schema: { type: 'object', properties: { items: schema }, required: ['items'] },
    wrapsItems: true,
  };
}

function describe(tool: ToolDefinition, route: ApiRoute): string {
  return `${tool.description}\n\nAPI operation: ${route.method.toUpperCase()} ${route.path} (${tool.operationId}). Errors carry the status, message and details of the API.`;
}

/** The tools of `catalog`, read from `routes`. Throws when an operation is missing or cannot be a tool. */
export function buildOperationTools(
  routes: ApiRoute[],
  catalog: ToolDefinition[] = TOOL_CATALOG,
): OperationTool[] {
  const byOperationId = new Map(
    documentedRoutes(routes, 'full').map((route) => [route.doc.operationId, route]),
  );
  return catalog.map((tool) => {
    const route = byOperationId.get(tool.operationId);
    if (!route) throw toolError(tool, 'no route has this operationId');
    if (route.method === 'delete') throw toolError(tool, 'deletions stay out of the MCP server');
    if (route.access !== 'admin') throw toolError(tool, `the route is ${route.access}, not admin`);

    const input = argumentsOf(tool, route);
    const output = outputOf(tool, route);
    const writes = !isReadMethod(route.method);
    return {
      name: tool.name,
      title: tool.title,
      description: describe(tool, route),
      operationId: tool.operationId,
      method: route.method,
      path: route.path,
      writes,
      inputSchema: input.schema,
      outputSchema: output.schema,
      argumentParts: input.argumentParts,
      paramsSchema: route.schemas.params,
      wrapsItems: output.wrapsItems,
      annotations: {
        readOnlyHint: tool.hints?.readOnlyHint ?? !writes,
        destructiveHint: tool.hints?.destructiveHint ?? false,
        idempotentHint: !writes || route.method === 'put',
        openWorldHint: false,
      },
    };
  });
}

// The routes do not change once the app is built: the tools are read on the first MCP request
const toolsByApp = new WeakMap<Application, OperationTool[]>();

/** The tools of the app, read once. */
export function operationToolsOf(app: Application): OperationTool[] {
  const tools = toolsByApp.get(app) ?? buildOperationTools(collectApiRoutes(app));
  toolsByApp.set(app, tools);
  return tools;
}

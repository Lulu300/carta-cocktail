import { z } from 'zod';
import * as auth from '../validation/auth';
import * as availability from '../validation/availability';
import * as backup from '../validation/backup';
import * as bottleImport from '../validation/bottleImport';
import * as bottles from '../validation/bottles';
import * as categories from '../validation/categories';
import * as categoryTypes from '../validation/categoryTypes';
import * as cocktailImport from '../validation/cocktailImport';
import * as cocktails from '../validation/cocktails';
import * as common from '../validation/common';
import * as errors from '../validation/errors';
import * as ingredients from '../validation/ingredients';
import * as menuBottles from '../validation/menuBottles';
import * as menus from '../validation/menus';
import * as menuSections from '../validation/menuSections';
import * as openapi from '../validation/openapi';
import * as publicResponses from '../validation/public';
import * as settings from '../validation/settings';
import * as system from '../validation/system';
import * as units from '../validation/units';

/*
 * zod schemas to JSON Schema 2020-12, the dialect of OpenAPI 3.1, with zod 4's own
 * `z.toJSONSchema`. A response schema exported by a module of src/validation/ becomes a
 * component named after its export (`Unit`, `PublicMenu`...), so that each one is described
 * once and referred to everywhere. Request schemas are written in full where they are used:
 * they describe what a client sends (`io: 'input'`, before trims and transforms), while a
 * component describes what the API sends back.
 */

export type JsonSchema = Record<string, unknown>;

/** The modules of src/validation/ whose exports become components. A test checks the list is complete. */
export const VALIDATION_MODULES = {
  auth,
  availability,
  backup,
  bottleImport,
  bottles,
  categories,
  categoryTypes,
  cocktailImport,
  cocktails,
  common,
  errors,
  ingredients,
  menuBottles,
  menus,
  menuSections,
  openapi,
  public: publicResponses,
  settings,
  system,
  units,
};

const COMPONENTS_PATH = '#/components/schemas/';
const DEFS_PATH = '#/$defs/';

function namedSchemas(): z.core.$ZodRegistry<{ id: string }> {
  const registry = z.registry<{ id: string }>();
  for (const module of Object.values(VALIDATION_MODULES)) {
    for (const [name, value] of Object.entries(module)) {
      if (value instanceof z.ZodType) registry.add(value, { id: name });
    }
  }
  return registry;
}

const names = namedSchemas();

/** Points the `#/$defs/` references zod writes to the components of the OpenAPI document. */
function toComponentRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toComponentRefs);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const isDefsRef = key === '$ref' && typeof entry === 'string' && entry.startsWith(DEFS_PATH);
      return [
        key,
        isDefsRef ? COMPONENTS_PATH + entry.slice(DEFS_PATH.length) : toComponentRefs(entry),
      ];
    }),
  );
}

/** zod's output without the keys a schema inside an OpenAPI document does not carry. */
function withoutKeys(schema: JsonSchema, ...keys: string[]): JsonSchema {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)));
}

/** Collects the components the responses of a document refer to. */
export class SchemaComponents {
  readonly schemas: Record<string, JsonSchema> = {};

  /** The schema of a response body; the named schemas it holds are added to the components. */
  output(schema: z.ZodType): JsonSchema {
    const converted = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      io: 'output',
      metadata: names,
    }) as JsonSchema;
    const defs = (converted.$defs ?? {}) as Record<string, JsonSchema>;
    for (const [name, definition] of Object.entries(defs)) {
      this.schemas[name] = toComponentRefs(definition) as JsonSchema;
    }
    return toComponentRefs(withoutKeys(converted, '$schema', '$defs')) as JsonSchema;
  }
}

/** The schema of what a client sends, written in full. */
export function inputSchema(schema: z.ZodType): JsonSchema {
  const converted = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as JsonSchema;
  // zod only writes definitions for a recursive schema, which no request has
  if ('$defs' in converted) throw new Error('Recursive request schemas are not supported');
  return withoutKeys(converted, '$schema');
}

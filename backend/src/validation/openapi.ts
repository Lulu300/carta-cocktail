import { z } from 'zod';

// Response of routes/openapi.ts: an OpenAPI 3.1 document, checked in full by its own test.

export const OpenApiDocument = z.looseObject({
  openapi: z.string(),
  info: z.looseObject({ title: z.string(), version: z.string() }),
  paths: z.record(z.string(), z.unknown()),
});

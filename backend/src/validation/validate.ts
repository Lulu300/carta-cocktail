import { z } from 'zod';
import type { RequestHandler, Response } from 'express';
import { BadRequestError } from '../errors';
import type { ValidationIssue as ValidationIssueSchema } from './errors';

const REQUEST_PARTS = ['params', 'query', 'body'] as const;

export type Schemas = Partial<Record<(typeof REQUEST_PARTS)[number], z.ZodType>>;

/** The parsed request parts, typed from the schemas given to `validate`. */
export type Validated<S extends Schemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

export type ValidationIssue = z.output<typeof ValidationIssueSchema>;

/** A zod issue as sent in `details`, its path prefixed with where the parsed value sits in the request. */
export function toValidationIssue(prefix: PropertyKey[], issue: z.core.$ZodIssue): ValidationIssue {
  return {
    path: [...prefix, ...issue.path].map(String).join('.'),
    code: issue.code,
    message: issue.message,
  };
}

// The schemas of each middleware built by `validate`, read by the OpenAPI document
const schemasByMiddleware = new WeakMap<RequestHandler, Schemas>();

/** The schemas `handler` validates, when it was built by `validate`. */
export function validatedSchemas(handler: unknown): Schemas | undefined {
  return typeof handler === 'function'
    ? schemasByMiddleware.get(handler as RequestHandler)
    : undefined;
}

/**
 * Parses the request parts against their schemas. On success the parsed values are
 * stored in `res.locals.valid` (read them with `valid(res)`); on failure the request
 * ends with a 400 whose `details` lists every issue of every part.
 */
export function validate(schemas: Schemas): RequestHandler {
  const middleware: RequestHandler = (req, res, next) => {
    const parsed: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];
    for (const part of REQUEST_PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
      } else {
        issues.push(...result.error.issues.map((issue) => toValidationIssue([part], issue)));
      }
    }
    if (issues.length > 0) {
      next(new BadRequestError('errors.validationError', issues));
      return;
    }
    res.locals.valid = parsed;
    // req.query is a getter in Express 5 and cannot be assigned: handlers read valid(res)
    if ('body' in parsed) req.body = parsed.body;
    next();
  };
  schemasByMiddleware.set(middleware, schemas);
  return middleware;
}

/** Returns the request parts parsed by the `validate` middleware of the route. */
export function valid<S extends Schemas>(res: Response): Validated<S> {
  return res.locals.valid as Validated<S>;
}

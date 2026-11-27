import { z } from 'zod';
import { DeletionImpact } from './common';

// The body of every error answer, written by middleware/errorHandler.ts. The OpenAPI document
// describes it once (components ApiError and ValidationIssue) and every error response refers to it.

/** One rule a request broke, as `validate()` lists them in `details` of a 400. */
export const ValidationIssue = z.strictObject({
  /** Where the value sits in the request, e.g. `body.ingredients.0.bottleId`. */
  path: z.string(),
  /** zod issue code, e.g. `too_small` or `invalid_type`. */
  code: z.string(),
  /** English message of the rule. */
  message: z.string(),
});

export const ApiError = z.strictObject({
  /** Message in the language of the request (Accept-Language), English by default. */
  error: z.string(),
  /**
   * Present on some errors only: the issues of a refused request (400), what a deletion would
   * break (409), or the values of the message (an import file refused, for example).
   */
  details: z
    .union([z.array(ValidationIssue), DeletionImpact, z.record(z.string(), z.unknown())])
    .optional(),
});

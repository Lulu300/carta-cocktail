import { z } from 'zod';
import { Id, RequiredText, Timestamp } from './common';

/** READ_ONLY tokens may only send GET and HEAD requests; READ_WRITE tokens may write too. */
export const API_TOKEN_SCOPES = ['READ_ONLY', 'READ_WRITE'] as const;
export const ApiTokenScope = z.enum(API_TOKEN_SCOPES);

/** Every token expires: the admin picks one of these lifetimes, in days. */
export const API_TOKEN_LIFETIME_DAYS = [30, 90, 365] as const;
export const DEFAULT_API_TOKEN_LIFETIME_DAYS = 90;

const MAX_API_TOKEN_NAME_LENGTH = 100;

export const ApiTokenCreate = z.object({
  name: RequiredText.max(MAX_API_TOKEN_NAME_LENGTH),
  scope: ApiTokenScope.default('READ_ONLY'),
  expiresInDays: z.literal(API_TOKEN_LIFETIME_DAYS).default(DEFAULT_API_TOKEN_LIFETIME_DAYS),
});

/** A token as the list shows it: never its secret, nor its hash. */
export const ApiToken = z.strictObject({
  id: Id,
  name: z.string(),
  scope: ApiTokenScope,
  /** Last characters of the token, to tell tokens apart. */
  lastFour: z.string(),
  createdAt: Timestamp,
  expiresAt: Timestamp,
  lastUsedAt: Timestamp.nullable(),
});

/** Answer of a creation: the only time the server sends the token itself. */
export const CreatedApiToken = ApiToken.extend({ token: z.string() });

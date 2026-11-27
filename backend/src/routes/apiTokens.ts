import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authenticatedUserId } from '../middleware/auth';
import { apiDocs } from '../openapi/routeDoc';
import { valid, validate } from '../validation/validate';
import { idRequest, MessageResponse } from '../validation/common';
import { ApiToken, ApiTokenCreate, CreatedApiToken } from '../validation/apiTokens';
import {
  createApiToken,
  listApiTokens,
  MAX_ACTIVE_API_TOKENS,
  revokeApiToken,
} from '../services/apiTokenService';

// Reserved to the admin's session: app.ts refuses API tokens here (SESSION_ONLY_ROUTES)
const router = Router();
const doc = apiDocs('API tokens');

router.get(
  '/',
  doc({
    operationId: 'listApiTokens',
    summary: 'List the API tokens',
    description:
      'Every token of the admin, expired ones included, newest first. Never the token itself: only its last characters.',
    responses: { 200: z.array(ApiToken) },
  }),
  async (req: AuthRequest, res: Response) => {
    res.json(await listApiTokens(authenticatedUserId(req)));
  },
);

const createSchemas = { body: ApiTokenCreate };

router.post(
  '/',
  doc({
    operationId: 'createApiToken',
    summary: 'Create an API token',
    description:
      'The answer is the only one that carries the token (`carta_…`): the server keeps its SHA-256 hash only.',
    responses: { 201: CreatedApiToken },
    errors: { 409: `The admin already has ${MAX_ACTIVE_API_TOKENS} tokens that have not expired.` },
  }),
  validate(createSchemas),
  async (req: AuthRequest, res: Response) => {
    const created = await createApiToken(
      authenticatedUserId(req),
      valid<typeof createSchemas>(res).body,
    );
    res.status(201).json(created);
  },
);

router.delete(
  '/:id',
  doc({
    operationId: 'revokeApiToken',
    summary: 'Revoke an API token',
    description: 'Deletes the token: it gets 401 from its next request on.',
    responses: { 200: MessageResponse },
    errors: { 404: 'No token of the admin has this id.' },
  }),
  validate(idRequest),
  async (req: AuthRequest, res: Response) => {
    await revokeApiToken(authenticatedUserId(req), valid<typeof idRequest>(res).params.id);
    res.json({ message: req.t('apiTokens.revoked') });
  },
);

export default router;

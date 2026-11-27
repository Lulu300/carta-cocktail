import { Router, Response } from 'express';
import { AuthRequest, authenticatedUserId } from '../middleware/auth';
import { valid, validate } from '../validation/validate';
import { idRequest } from '../validation/common';
import { ApiTokenCreate } from '../validation/apiTokens';
import { createApiToken, listApiTokens, revokeApiToken } from '../services/apiTokenService';

// Reserved to the admin's session: app.ts refuses API tokens here (SESSION_ONLY_ROUTES)
const router = Router();

router.get('/', async (req: AuthRequest, res: Response) => {
  res.json(await listApiTokens(authenticatedUserId(req)));
});

const createSchemas = { body: ApiTokenCreate };

router.post('/', validate(createSchemas), async (req: AuthRequest, res: Response) => {
  const created = await createApiToken(
    authenticatedUserId(req),
    valid<typeof createSchemas>(res).body,
  );
  res.status(201).json(created);
});

router.delete('/:id', validate(idRequest), async (req: AuthRequest, res: Response) => {
  await revokeApiToken(authenticatedUserId(req), valid<typeof idRequest>(res).params.id);
  res.json({ message: req.t('apiTokens.revoked') });
});

export default router;

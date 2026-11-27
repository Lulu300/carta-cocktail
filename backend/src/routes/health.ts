import { Router } from 'express';
import { appVersion } from '../config';
import { prisma } from '../lib/prisma';
import { apiDocs } from '../openapi/routeDoc';
import { HealthResponse } from '../validation/system';

const router = Router();
const doc = apiDocs('Health');

// Called by the Docker healthcheck, and public through nginx: it answers the status and the
// version only, nothing about the host or the database.
router.get(
  '/',
  doc({
    operationId: 'getHealth',
    summary: 'Check the health of the backend',
    description: 'The Docker healthcheck. Not rate limited.',
    responses: {
      200: HealthResponse,
      503: {
        description: 'The database does not answer.',
        content: { 'application/json': HealthResponse },
      },
    },
  }),
  async (_req, res) => {
    // Caught here instead of in errorHandler: a failed query is the answer of this route, a 503
    // that Docker reads as "unhealthy", not an error to translate.
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      res.status(503).json({ status: 'unavailable' });
      return;
    }
    res.json({ status: 'ok', version: appVersion() });
  },
);

export default router;

import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Called by the Docker healthcheck, and public through nginx: it answers the status and the
// version only, nothing about the host or the database.
router.get('/', async (_req, res) => {
  // Caught here instead of in errorHandler: a failed query is the answer of this route, a 503
  // that Docker reads as "unhealthy", not an error to translate.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    res.status(503).json({ status: 'unavailable' });
    return;
  }
  res.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
});

export default router;

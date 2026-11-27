import { Router } from 'express';
import { appVersion, config } from '../config';
import { prisma } from '../lib/prisma';
import { acknowledgeUpgradeNotice, pendingUpgradeNotice } from '../services/upgradeNoticeService';
import { apiDocs } from '../openapi/routeDoc';
import { UpgradeNotice } from '../validation/system';

const router = Router();
const doc = apiDocs('System');

router.get(
  '/upgrade-notice',
  doc({
    operationId: 'getUpgradeNotice',
    summary: 'Get the required actions of the last upgrade',
    description: 'Until the admin confirms them.',
    responses: {
      200: UpgradeNotice,
      204: { description: 'No upgrade is waiting for a confirmation.' },
    },
  }),
  async (_req, res) => {
    const notice = await pendingUpgradeNotice(prisma, appVersion(), config.releasesDir);
    if (!notice) {
      res.status(204).end();
      return;
    }
    res.json(notice);
  },
);

router.post(
  '/upgrade-notice/acknowledge',
  doc({
    operationId: 'acknowledgeUpgradeNotice',
    summary: 'Confirm the required actions of the last upgrade',
    responses: { 204: { description: 'Confirmed, or nothing to confirm.' } },
  }),
  async (_req, res) => {
    await acknowledgeUpgradeNotice(prisma);
    res.status(204).end();
  },
);

export default router;

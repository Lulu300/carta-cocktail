import { Router } from 'express';
import { appVersion, config } from '../config';
import { prisma } from '../lib/prisma';
import { acknowledgeUpgradeNotice, pendingUpgradeNotice } from '../services/upgradeNoticeService';

const router = Router();

// The required actions of the last upgrade, until the admin confirms them; 204 when there is none
router.get('/upgrade-notice', async (_req, res) => {
  const notice = await pendingUpgradeNotice(prisma, appVersion(), config.releasesDir);
  if (!notice) {
    res.status(204).end();
    return;
  }
  res.json(notice);
});

router.post('/upgrade-notice/acknowledge', async (_req, res) => {
  await acknowledgeUpgradeNotice(prisma);
  res.status(204).end();
});

export default router;

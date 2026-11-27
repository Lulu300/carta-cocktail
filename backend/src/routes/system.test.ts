import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../config';
import { recordStartup } from '../services/upgradeNoticeService';
import { UpgradeNotice } from '../validation/system';
import {
  authHeader,
  cleanDatabase,
  expectContract,
  prisma,
  request,
  seedAppState,
  seedRequiredData,
  setupTestDatabase,
  teardownTestDatabase,
} from '../test/helpers';

const NOTES_1_6_0 = `---
version: 1.6.0
date: 2026-10-10
breaking: true
required_actions:
  - when: before
    action: "Back up the database."
  - when: after
    action: "Check the backend log."
---
`;

const defaultReleasesDir = config.releasesDir;
let notesDir: string;

beforeAll(async () => {
  await setupTestDatabase();
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-releases-'));
  fs.writeFileSync(path.join(notesDir, 'v1.6.0.md'), NOTES_1_6_0);
  config.releasesDir = notesDir;
});

afterAll(async () => {
  config.releasesDir = defaultReleasesDir;
  fs.rmSync(notesDir, { recursive: true, force: true });
  await teardownTestDatabase();
});

beforeEach(async () => {
  await cleanDatabase();
  await seedRequiredData();
  vi.stubEnv('APP_VERSION', '1.6.0');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The start of 1.6.0 on a database where 1.5.0 ran last. */
async function upgradeFrom150(): Promise<void> {
  await seedAppState({ lastRunVersion: '1.5.0' });
  await recordStartup(prisma, '1.6.0', notesDir);
}

describe('GET /api/system/upgrade-notice', () => {
  it('should answer 401 without a token', async () => {
    expect((await request.get('/api/system/upgrade-notice')).status).toBe(401);
  });

  it('should answer 204 when there is no notice', async () => {
    const res = await request.get('/api/system/upgrade-notice').set(authHeader());

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('should send the upgrade and its required actions after an upgrade', async () => {
    await upgradeFrom150();

    const res = await request.get('/api/system/upgrade-notice').set(authHeader());

    expect(res.status).toBe(200);
    expect(expectContract(UpgradeNotice, res.body)).toEqual({
      from: '1.5.0',
      to: '1.6.0',
      actions: [
        { version: '1.6.0', when: 'before', action: 'Back up the database.' },
        { version: '1.6.0', when: 'after', action: 'Check the backend log.' },
      ],
    });
  });

  it('should answer 204 on a dev build, whatever the database holds', async () => {
    await upgradeFrom150();
    vi.stubEnv('APP_VERSION', 'dev');

    expect((await request.get('/api/system/upgrade-notice').set(authHeader())).status).toBe(204);
  });
});

describe('POST /api/system/upgrade-notice/acknowledge', () => {
  it('should answer 401 without a token', async () => {
    expect((await request.post('/api/system/upgrade-notice/acknowledge')).status).toBe(401);
  });

  it('should end the notice', async () => {
    await upgradeFrom150();

    const res = await request.post('/api/system/upgrade-notice/acknowledge').set(authHeader());

    expect(res.status).toBe(204);
    expect((await request.get('/api/system/upgrade-notice').set(authHeader())).status).toBe(204);
  });

  it('should answer 204 when there is no notice to confirm', async () => {
    expect(
      (await request.post('/api/system/upgrade-notice/acknowledge').set(authHeader())).status,
    ).toBe(204);
  });
});

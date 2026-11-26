import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '../generated/prisma/client';
import { cleanDatabase, prisma, seedAppState, setupTestDatabase, teardownTestDatabase } from '../test/helpers';
import {
  APP_STATE_ID,
  acknowledgeUpgradeNotice,
  compareVersions,
  isReleaseVersion,
  loadReleaseNotes,
  pendingUpgradeNotice,
  recordStartup,
  reportStartupVersion,
  requiredActionsBetween,
  type ReleaseNote,
} from './upgradeNoticeService';

const REPOSITORY_NOTES_DIR = path.resolve(__dirname, '../../../docs/releases');

let notesDir: string;

/** Writes docs/releases/v<version>.md with these required actions, as TEMPLATE.md shows them. */
function writeNotes(version: string, actions: { when: 'before' | 'after'; action: string }[], fileName = `v${version}.md`): void {
  const list = actions.length === 0
    ? 'required_actions: []'
    : ['required_actions:', ...actions.flatMap(({ when, action }) => [`  - when: ${when}`, `    action: ${JSON.stringify(action)}`])].join('\n');
  const content = ['---', `version: ${version}`, 'date: 2026-10-20', 'breaking: false', list, '---', '', '## Summary', ''].join('\n');
  fs.writeFileSync(path.join(notesDir, fileName), content);
}

/** Notes for 1.6.0 (two actions) and 1.7.0 (one action), the upgrade of the acceptance criteria. */
function writeNotesUpTo170(): void {
  writeNotes('1.5.0', [{ when: 'before', action: 'Action of 1.5.0' }]);
  writeNotes('1.6.0', [
    { when: 'before', action: 'First action of 1.6.0' },
    { when: 'after', action: 'Second action of 1.6.0' },
  ]);
  writeNotes('1.7.0', [{ when: 'after', action: 'Action of 1.7.0' }]);
}

function note(version: string, ...actions: string[]): ReleaseNote {
  return { version, requiredActions: actions.map((action) => ({ when: 'after', action })) };
}

function appState() {
  return prisma.appState.findUnique({ where: { id: APP_STATE_ID } });
}

function silenceWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

beforeAll(async () => { await setupTestDatabase(); });
afterAll(async () => { await teardownTestDatabase(); });

beforeEach(async () => {
  await cleanDatabase();
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-releases-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(notesDir, { recursive: true, force: true });
});

describe('compareVersions', () => {
  it('should compare each number as a number, not as text', () => {
    expect(compareVersions('1.5.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.5.10', '1.5.9')).toBeGreaterThan(0);
  });

  it('should put a pre-release before its release, and pre-releases in their order', () => {
    expect(compareVersions('1.5.0-rc.1', '1.5.0')).toBeLessThan(0);
    expect(compareVersions('1.5.0-rc.2', '1.5.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('1.5.0-rc.10', '1.5.0-rc.9')).toBeGreaterThan(0);
    expect(compareVersions('1.5.0-rc.1', '1.4.9')).toBeGreaterThan(0);
  });

  it('should find equal versions equal', () => {
    expect(compareVersions('1.5.0', '1.5.0')).toBe(0);
    expect(compareVersions('1.5.0-rc.1', '1.5.0-rc.1')).toBe(0);
  });

  it('should refuse a version that is not X.Y.Z or X.Y.Z-rc.N', () => {
    expect(() => compareVersions('dev', '1.5.0')).toThrow('Not a release version: dev');
  });
});

describe('isReleaseVersion', () => {
  it.each(['1.5.0', '0.1.0', '1.16.0-rc.2'])('should accept %s', (version) => {
    expect(isReleaseVersion(version)).toBe(true);
  });

  it.each(['dev', '', 'v1.5.0', '1.5', '1.05.0', '1.5.0-beta.1', '1.5.0-rc.1-x'])('should refuse "%s"', (version) => {
    expect(isReleaseVersion(version)).toBe(false);
  });

  it('should refuse a missing value', () => {
    expect(isReleaseVersion(null)).toBe(false);
    expect(isReleaseVersion(undefined)).toBe(false);
  });
});

describe('requiredActionsBetween', () => {
  const notes = [note('1.7.0', 'g'), note('1.5.0', 'a'), note('1.6.0', 'b', 'c'), note('1.10.0', 'h')];

  function actionsBetween(from: string, to: string, notesRead: ReleaseNote[] = notes): string[] {
    return requiredActionsBetween(notesRead, from, to).map(({ version, action }) => `${version}:${action}`);
  }

  it('should leave out the version of departure and keep the version of arrival', () => {
    expect(actionsBetween('1.5.0', '1.6.0')).toEqual(['1.6.0:b', '1.6.0:c']);
  });

  it('should list the versions from the oldest, and the actions of a version in the order of its file', () => {
    expect(actionsBetween('1.5.0', '1.10.0')).toEqual(['1.6.0:b', '1.6.0:c', '1.7.0:g', '1.10.0:h']);
  });

  it('should keep the timing of each action', () => {
    const actions = requiredActionsBetween(
      [{ version: '1.6.0', requiredActions: [{ when: 'before', action: 'b' }, { when: 'after', action: 'c' }] }],
      '1.5.0',
      '1.6.0',
    );

    expect(actions).toEqual([
      { version: '1.6.0', when: 'before', action: 'b' },
      { version: '1.6.0', when: 'after', action: 'c' },
    ]);
  });

  it('should be empty when no version lies in between, or none has an action', () => {
    expect(actionsBetween('1.7.0', '1.7.0')).toEqual([]);
    expect(actionsBetween('1.7.0', '1.8.0')).toEqual([]);
    expect(actionsBetween('1.5.0', '1.6.0', [])).toEqual([]);
  });

  it('should ignore a pre-release file when the final file of its release exists', () => {
    const withPreRelease = [...notes, note('1.6.0-rc.1', 'rc')];

    expect(actionsBetween('1.5.0', '1.6.0', withPreRelease)).toEqual(['1.6.0:b', '1.6.0:c']);
  });

  it('should use the newest pre-release file of a release that has no final file yet', () => {
    const preReleasesOnly = [note('1.8.0-rc.1', 'rc1'), note('1.8.0-rc.2', 'rc2')];

    expect(actionsBetween('1.7.0', '1.8.0-rc.2', preReleasesOnly)).toEqual(['1.8.0-rc.2:rc2']);
  });

  it('should give a pre-release the actions of its release, and nothing new when that release follows', () => {
    expect(actionsBetween('1.5.0', '1.6.0-rc.1')).toEqual(['1.6.0:b', '1.6.0:c']);
    expect(actionsBetween('1.6.0-rc.1', '1.6.0')).toEqual([]);
    expect(actionsBetween('1.6.0-rc.1', '1.7.0')).toEqual(['1.7.0:g']);
  });
});

describe('loadReleaseNotes', () => {
  it('should read the version and the required actions of each file', () => {
    writeNotes('1.6.0', [{ when: 'before', action: 'Set JWT_SECRET: at least 32 characters, "quoted" words' }]);
    writeNotes('1.7.0', []);

    expect(loadReleaseNotes(notesDir)).toEqual([
      { version: '1.6.0', requiredActions: [{ when: 'before', action: 'Set JWT_SECRET: at least 32 characters, "quoted" words' }] },
      { version: '1.7.0', requiredActions: [] },
    ]);
  });

  it('should leave out TEMPLATE.md and files that are not notes', () => {
    writeNotes('1.6.0', [], 'TEMPLATE.md');
    writeNotes('1.6.0', [], 'README.md');
    writeNotes('1.6.0', [], 'v1.6.0.txt');

    expect(loadReleaseNotes(notesDir)).toEqual([]);
  });

  it.each([
    ['without front matter', '## Summary\n\nNo front matter.\n', 'no front matter'],
    ['whose front matter is not closed', '---\nversion: 1.6.0\nrequired_actions: []\n', 'no front matter'],
    ['with invalid YAML', '---\nversion: 1.6.0\nrequired_actions: [\n---\n', 'Flow sequence'],
    ['with a version that is not X.Y.Z', '---\nversion: 1.6\nrequired_actions: []\n---\n', 'TEMPLATE.md'],
    ['with an unknown timing', '---\nversion: 1.6.0\nrequired_actions:\n  - when: during\n    action: "x"\n---\n', 'TEMPLATE.md'],
    ['with an empty action', '---\nversion: 1.6.0\nrequired_actions:\n  - when: after\n    action: ""\n---\n', 'TEMPLATE.md'],
    ['without required_actions', '---\nversion: 1.6.0\n---\n', 'TEMPLATE.md'],
  ])('should ignore a file %s, with a warning, and read the others', (_case, content, reason) => {
    fs.writeFileSync(path.join(notesDir, 'v1.6.0.md'), content);
    writeNotes('1.7.0', [{ when: 'after', action: 'Kept' }]);
    const warn = silenceWarnings();

    expect(loadReleaseNotes(notesDir)).toEqual([
      { version: '1.7.0', requiredActions: [{ when: 'after', action: 'Kept' }] },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(path.join(notesDir, 'v1.6.0.md'));
    expect(warn.mock.calls[0][0]).toContain(reason);
  });

  it('should read a file with CRLF line endings', () => {
    fs.writeFileSync(path.join(notesDir, 'v1.6.0.md'), '---\r\nversion: 1.6.0\r\nrequired_actions: []\r\n---\r\n');

    expect(loadReleaseNotes(notesDir)).toEqual([{ version: '1.6.0', requiredActions: [] }]);
  });

  it('should warn and return no note when the folder cannot be read', () => {
    const warn = silenceWarnings();

    expect(loadReleaseNotes(path.join(notesDir, 'missing'))).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('cannot be read');
  });

  it('should read every notes file of the repository without a warning', () => {
    const warn = silenceWarnings();
    const fileCount = fs.readdirSync(REPOSITORY_NOTES_DIR).filter((name) => /^v.+\.md$/.test(name)).length;

    const notes = loadReleaseNotes(REPOSITORY_NOTES_DIR);

    expect(warn).not.toHaveBeenCalled();
    expect(notes).toHaveLength(fileCount);
    // YAML escapes are read as the release workflow (yq) reads them
    const portAction = notes.find(({ version }) => version === '1.8.0')!.requiredActions[1].action;
    expect(portAction).toContain('from "<port>:80" to "<port>:8080"');
  });
});

describe('recordStartup', () => {
  it('should record the version of a first start without any notice', async () => {
    writeNotesUpTo170();

    expect(await recordStartup(prisma, '1.7.0', notesDir)).toEqual([]);

    expect(await appState()).toEqual({
      id: APP_STATE_ID, lastRunVersion: '1.7.0', pendingNoticeFrom: null, pendingNoticeTo: null, noticeAcknowledgedAt: null,
    });
  });

  it('should record the version over a row without a valid version', async () => {
    await seedAppState({ lastRunVersion: 'dev' });

    expect(await recordStartup(prisma, '1.7.0', notesDir)).toEqual([]);

    expect((await appState())?.lastRunVersion).toBe('1.7.0');
  });

  it('should list the actions of the skipped versions in order and keep the notice, after an upgrade', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });

    const actions = await recordStartup(prisma, '1.7.0', notesDir);

    expect(actions).toEqual([
      { version: '1.6.0', when: 'before', action: 'First action of 1.6.0' },
      { version: '1.6.0', when: 'after', action: 'Second action of 1.6.0' },
      { version: '1.7.0', when: 'after', action: 'Action of 1.7.0' },
    ]);
    expect(await appState()).toMatchObject({
      lastRunVersion: '1.7.0', pendingNoticeFrom: '1.5.0', pendingNoticeTo: '1.7.0', noticeAcknowledgedAt: null,
    });
  });

  it('should keep no notice after an upgrade without required actions', async () => {
    writeNotes('1.8.0', []);
    await seedAppState({ lastRunVersion: '1.7.0' });

    expect(await recordStartup(prisma, '1.8.0', notesDir)).toEqual([]);

    expect(await appState()).toMatchObject({ lastRunVersion: '1.8.0', pendingNoticeFrom: null, pendingNoticeTo: null });
  });

  it('should change nothing when the same version starts again', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });
    await recordStartup(prisma, '1.7.0', notesDir);
    const stateAfterUpgrade = await appState();

    expect(await recordStartup(prisma, '1.7.0', notesDir)).toEqual([]);

    expect(await appState()).toEqual(stateAfterUpgrade);
  });

  it('should warn and change nothing when an older version starts', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.7.0' });
    const warn = silenceWarnings();

    expect(await recordStartup(prisma, '1.6.0', notesDir)).toEqual([]);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('1.6.0 is older than 1.7.0');
    expect(await appState()).toMatchObject({ lastRunVersion: '1.7.0', pendingNoticeFrom: null });
    expect(await pendingUpgradeNotice(prisma, '1.6.0', notesDir)).toBeNull();
  });

  it.each(['dev', ''])('should record nothing for APP_VERSION "%s"', async (version) => {
    expect(await recordStartup(prisma, version, notesDir)).toEqual([]);
    expect(await appState()).toBeNull();

    await seedAppState({ lastRunVersion: '1.5.0' });
    expect(await recordStartup(prisma, version, notesDir)).toEqual([]);
    expect((await appState())?.lastRunVersion).toBe('1.5.0');
  });

  it('should start a new notice from an unconfirmed one: its actions are still to check', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });
    await recordStartup(prisma, '1.6.0', notesDir);

    const actions = await recordStartup(prisma, '1.7.0', notesDir);

    expect(actions.map(({ version }) => version)).toEqual(['1.6.0', '1.6.0', '1.7.0']);
    expect(await appState()).toMatchObject({ pendingNoticeFrom: '1.5.0', pendingNoticeTo: '1.7.0' });
  });

  it('should start a new notice from the last version once the previous one is confirmed', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });
    await recordStartup(prisma, '1.6.0', notesDir);
    await acknowledgeUpgradeNotice(prisma);

    const actions = await recordStartup(prisma, '1.7.0', notesDir);

    expect(actions.map(({ version }) => version)).toEqual(['1.7.0']);
    expect(await appState()).toMatchObject({ pendingNoticeFrom: '1.6.0', pendingNoticeTo: '1.7.0', noticeAcknowledgedAt: null });
  });
});

describe('pendingUpgradeNotice and acknowledgeUpgradeNotice', () => {
  beforeEach(async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });
    await recordStartup(prisma, '1.7.0', notesDir);
  });

  it('should give the upgrade and its actions to the version that recorded it', async () => {
    const notice = await pendingUpgradeNotice(prisma, '1.7.0', notesDir);

    expect(notice).toMatchObject({ from: '1.5.0', to: '1.7.0' });
    expect(notice?.actions.map(({ action }) => action)).toEqual([
      'First action of 1.6.0', 'Second action of 1.6.0', 'Action of 1.7.0',
    ]);
  });

  it('should give no notice to another version, dev included', async () => {
    expect(await pendingUpgradeNotice(prisma, '1.6.0', notesDir)).toBeNull();
    expect(await pendingUpgradeNotice(prisma, 'dev', notesDir)).toBeNull();
  });

  it('should give no notice when the notes of its versions are gone', async () => {
    fs.rmSync(path.join(notesDir, 'v1.6.0.md'));
    fs.rmSync(path.join(notesDir, 'v1.7.0.md'));

    expect(await pendingUpgradeNotice(prisma, '1.7.0', notesDir)).toBeNull();
  });

  it('should give no notice once confirmed, after a restart of the same version too', async () => {
    await acknowledgeUpgradeNotice(prisma);
    const acknowledgedAt = (await appState())?.noticeAcknowledgedAt;

    await recordStartup(prisma, '1.7.0', notesDir);
    await acknowledgeUpgradeNotice(prisma);

    expect(acknowledgedAt).toBeInstanceOf(Date);
    expect((await appState())?.noticeAcknowledgedAt).toEqual(acknowledgedAt);
    expect(await pendingUpgradeNotice(prisma, '1.7.0', notesDir)).toBeNull();
  });
});

describe('reportStartupVersion', () => {
  it('should log the actions of an upgrade, one line each, with their version and timing', async () => {
    writeNotesUpTo170();
    await seedAppState({ lastRunVersion: '1.5.0' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await reportStartupVersion(prisma, '1.7.0', notesDir);

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      expect.stringContaining('Upgraded to 1.7.0'),
      '  v1.6.0, before the upgrade: First action of 1.6.0',
      '  v1.6.0, after the upgrade: Second action of 1.6.0',
      '  v1.7.0, after the upgrade: Action of 1.7.0',
    ]);
  });

  it('should log nothing without an upgrade', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await reportStartupVersion(prisma, '1.7.0', notesDir);

    expect(log).not.toHaveBeenCalled();
  });

  it('should warn instead of throwing when the version cannot be recorded', async () => {
    const failingDb = { appState: { findUnique: () => Promise.reject(new Error('no such table: AppState')) } };
    const warn = silenceWarnings();

    await expect(reportStartupVersion(failingDb as unknown as PrismaClient, '1.7.0', notesDir)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Upgrade guide skipped'), expect.any(Error));
  });
});

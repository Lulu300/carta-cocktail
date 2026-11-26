import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AppState, PrismaClient } from '../generated/prisma/client';

/**
 * In-app upgrade guide: remembers the version that ran last and, when a newer
 * one starts, the required actions of the versions in between, read from the
 * front matter of the release notes (docs/releases/vX.Y.Z.md, see TEMPLATE.md).
 * UPGRADING.md and the release notes stay the reference: the actions to do
 * before an upgrade can only be shown once it is done, as a reminder.
 */

export const APP_STATE_ID = 1;

export type ActionTiming = 'before' | 'after';

export interface RequiredAction {
  version: string;
  when: ActionTiming;
  action: string;
}

export interface ReleaseNote {
  version: string;
  requiredActions: { when: ActionTiming; action: string }[];
}

export interface UpgradeNotice {
  from: string;
  to: string;
  actions: RequiredAction[];
}

// The tags the release workflow accepts: X.Y.Z and X.Y.Z-rc.N, without a leading v
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/;

// The shape the release workflow checks (verify job), keys of the template's front matter
const FrontMatter = z.object({
  version: z.string().regex(VERSION_PATTERN),
  required_actions: z.array(z.object({
    when: z.enum(['before', 'after']),
    action: z.string().min(1),
  })),
});

/** True for a released version; false for `dev`, an empty value or any other build. */
export function isReleaseVersion(version: string | null | undefined): version is string {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

/** [major, minor, patch, rc], rc being Infinity for a final release, which comes after its pre-releases. */
function versionParts(version: string): number[] {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Not a release version: ${version}`);
  const [, major, minor, patch, rc] = match;
  return [Number(major), Number(minor), Number(patch), rc === undefined ? Infinity : Number(rc)];
}

/** Negative when a comes before b, 0 when equal, positive after. Throws on a version that is not X.Y.Z or X.Y.Z-rc.N. */
export function compareVersions(a: string, b: string): number {
  const partsA = versionParts(a);
  const partsB = versionParts(b);
  for (let i = 0; i < partsA.length; i++) {
    if (partsA[i] !== partsB[i]) return partsA[i] < partsB[i] ? -1 : 1;
  }
  return 0;
}

/** X.Y.Z of X.Y.Z-rc.N: the release a pre-release leads to. */
function releaseOf(version: string): string {
  return version.split('-')[0];
}

/** The YAML between the opening `---` line and the next one, or null without front matter. */
function frontMatterOf(content: string): string | null {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  return end === -1 ? null : lines.slice(1, end).join('\n');
}

/** The note of one file, or null with a warning: a bad file never stops the startup. */
function readReleaseNote(filePath: string): ReleaseNote | null {
  try {
    const frontMatter = frontMatterOf(fs.readFileSync(filePath, 'utf8'));
    if (frontMatter === null) throw new Error('no front matter');
    const parsed = FrontMatter.safeParse(parseYaml(frontMatter));
    if (!parsed.success) throw new Error('the front matter does not match docs/releases/TEMPLATE.md');
    return { version: parsed.data.version, requiredActions: parsed.data.required_actions };
  } catch (err) {
    console.warn(`Release notes ${filePath} ignored by the upgrade guide: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Front matter of every vX.Y.Z.md file of the folder (TEMPLATE.md left out). */
export function loadReleaseNotes(dir: string): ReleaseNote[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    console.warn(`Release notes folder ${dir} cannot be read, no upgrade guide: ${err instanceof Error ? err.message : err}`);
    return [];
  }
  return names
    .filter((name) => /^v.+\.md$/.test(name))
    .sort()
    .flatMap((name) => readReleaseNote(path.join(dir, name)) ?? []);
}

/**
 * Required actions of the versions after `from`, up to `to` included: oldest
 * version first, and within a version in the order of its file.
 *
 * Versions are compared by release (X.Y.Z), because a pre-release uses the
 * notes of its target release unless it has a file of its own: X.Y.Z-rc.1
 * shows the actions of vX.Y.Z.md, and moving on to X.Y.Z shows nothing new.
 * Of the files of one release, the newest version applies: the final file over
 * a pre-release file.
 */
export function requiredActionsBetween(notes: ReleaseNote[], from: string, to: string): RequiredAction[] {
  const fromRelease = releaseOf(from);
  const toRelease = releaseOf(to);
  const noteOfRelease = new Map<string, ReleaseNote>();
  for (const note of notes) {
    const release = releaseOf(note.version);
    const kept = noteOfRelease.get(release);
    if (!kept || compareVersions(note.version, kept.version) > 0) noteOfRelease.set(release, note);
  }
  return [...noteOfRelease.entries()]
    .filter(([release]) => compareVersions(release, fromRelease) > 0 && compareVersions(release, toRelease) <= 0)
    .sort(([a], [b]) => compareVersions(a, b))
    .flatMap(([, note]) => note.requiredActions.map((action) => ({ version: note.version, ...action })));
}

type PendingState = AppState & { pendingNoticeFrom: string; pendingNoticeTo: string };

/** An upgrade notice the admin has not confirmed yet. */
function hasPendingNotice(state: AppState | null): state is PendingState {
  return state !== null && isReleaseVersion(state.pendingNoticeFrom) && isReleaseVersion(state.pendingNoticeTo)
    && state.noticeAcknowledgedAt === null;
}

/**
 * Records the version that starts, and returns the required actions of an
 * upgrade, empty otherwise. `dev` and other builds record nothing. The first
 * start that records a version (new install, or first version with this
 * guide) has no notice: the version that ran before is unknown. A version
 * older than the recorded one only logs a warning.
 */
export async function recordStartup(db: PrismaClient, currentVersion: string, dir: string): Promise<RequiredAction[]> {
  if (!isReleaseVersion(currentVersion)) return [];

  const state = await db.appState.findUnique({ where: { id: APP_STATE_ID } });
  const lastRunVersion = state?.lastRunVersion;
  if (!isReleaseVersion(lastRunVersion)) {
    await db.appState.upsert({
      where: { id: APP_STATE_ID },
      create: { id: APP_STATE_ID, lastRunVersion: currentVersion },
      update: { lastRunVersion: currentVersion },
    });
    return [];
  }

  const order = compareVersions(currentVersion, lastRunVersion);
  if (order === 0) return [];
  if (order < 0) {
    console.warn(
      `Version ${currentVersion} is older than ${lastRunVersion}, the version that ran last: no upgrade guide, `
      + `the recorded version stays ${lastRunVersion}. The database may hold changes this version does not know.`,
    );
    return [];
  }

  // A notice not confirmed yet keeps its start: its actions still have to be checked
  const from = hasPendingNotice(state) ? state.pendingNoticeFrom : lastRunVersion;
  const actions = requiredActionsBetween(loadReleaseNotes(dir), from, currentVersion);
  const hasActions = actions.length > 0;
  await db.appState.update({
    where: { id: APP_STATE_ID },
    data: {
      lastRunVersion: currentVersion,
      pendingNoticeFrom: hasActions ? from : null,
      pendingNoticeTo: hasActions ? currentVersion : null,
      noticeAcknowledgedAt: null,
    },
  });
  return actions;
}

/**
 * Calls recordStartup and writes the actions to the log, one line each. Runs
 * at startup, before the server listens. Never throws: the guide is a reminder,
 * it must not keep the backend from starting.
 */
export async function reportStartupVersion(db: PrismaClient, currentVersion: string, dir: string): Promise<void> {
  try {
    const actions = await recordStartup(db, currentVersion, dir);
    if (actions.length === 0) return;
    console.log(
      `Upgraded to ${currentVersion}. Required actions of the versions since the last confirmed upgrade `
      + '(UPGRADING.md is the reference; also shown in the admin until confirmed):',
    );
    for (const { version, when, action } of actions) {
      console.log(`  v${version}, ${when} the upgrade: ${action}`);
    }
  } catch (err) {
    console.warn('Upgrade guide skipped: the running version could not be recorded.', err);
  }
}

/**
 * The upgrade notice the admin has not confirmed, or null. Only the version
 * that recorded it shows it: after going back to an older version, or with a
 * `dev` build, there is none.
 */
export async function pendingUpgradeNotice(db: PrismaClient, currentVersion: string, dir: string): Promise<UpgradeNotice | null> {
  const state = await db.appState.findUnique({ where: { id: APP_STATE_ID } });
  if (!hasPendingNotice(state) || state.pendingNoticeTo !== currentVersion) return null;
  const actions = requiredActionsBetween(loadReleaseNotes(dir), state.pendingNoticeFrom, state.pendingNoticeTo);
  if (actions.length === 0) return null;
  return { from: state.pendingNoticeFrom, to: state.pendingNoticeTo, actions };
}

/** The admin has done the actions: the notice is not shown again, after a restart either. */
export async function acknowledgeUpgradeNotice(db: PrismaClient): Promise<void> {
  await db.appState.updateMany({
    where: { id: APP_STATE_ID, noticeAcknowledgedAt: null },
    data: { noticeAcknowledgedAt: new Date() },
  });
}

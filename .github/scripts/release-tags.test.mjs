import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chooseTags } from './release-tags.mjs';

const cli = fileURLToPath(new URL('./release-tags.mjs', import.meta.url));
const ALL = { latest: true, major: true, minor: true };
const NONE = { latest: false, major: false, minor: false };

describe('chooseTags', () => {
  it('moves every tag for the first final release', () => {
    assert.deepEqual(chooseTags('v1.0.0', []), ALL);
    assert.deepEqual(chooseTags('v1.0.0', ['v1.0.0-rc.1', 'v1.0.0']), ALL);
  });

  it('moves every tag for a higher version, and when the highest tag is re-run', () => {
    const tags = ['v1.15.0', 'v1.16.0-rc.1', 'v1.16.0', 'v1.16.1'];
    assert.deepEqual(chooseTags('v1.16.1', tags), ALL);
    assert.deepEqual(chooseTags('v1.17.0', tags), ALL);
  });

  it('sorts numerically, not alphabetically', () => {
    assert.deepEqual(chooseTags('v1.10.0', ['v1.9.0', 'v1.2.0']), ALL);
    assert.deepEqual(chooseTags('v1.9.1', ['v1.9.0', 'v1.10.0']), { ...NONE, minor: true });
  });

  it('moves only :X.Y for a fix of an older minor', () => {
    assert.deepEqual(chooseTags('v1.15.1', ['v1.15.0', 'v1.16.0']), {
      latest: false,
      major: false,
      minor: true,
    });
  });

  it('moves nothing for a version lower than another of its minor', () => {
    assert.deepEqual(chooseTags('v1.15.1', ['v1.15.0', 'v1.15.2', 'v1.16.0']), NONE);
  });

  it('moves :X and :X.Y but not latest for an older major', () => {
    assert.deepEqual(chooseTags('v1.20.1', ['v1.20.0', 'v2.0.0']), {
      latest: false,
      major: true,
      minor: true,
    });
    assert.deepEqual(chooseTags('v1.19.1', ['v1.20.0', 'v2.0.0']), {
      latest: false,
      major: false,
      minor: true,
    });
  });

  it('moves nothing for a pre-release, even a higher one', () => {
    assert.deepEqual(chooseTags('v1.17.0-rc.1', ['v1.16.0']), NONE);
    assert.deepEqual(chooseTags('v1.15.1-rc.1', ['v1.16.0']), NONE);
  });

  it('ignores pre-releases of other versions when ranking', () => {
    assert.deepEqual(chooseTags('v1.16.0', ['v1.17.0-rc.1']), ALL);
  });
});

describe('release-tags.mjs CLI', () => {
  function run(args, input) {
    return spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf-8' });
  }

  it('prints GITHUB_OUTPUT lines', () => {
    const result = run(['v1.15.1'], 'v1.15.0\nv1.16.0\nv1.16.0-rc.1\n');
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'latest=false\nmajor=false\nminor=true\n');
  });

  it('fails without a tag', () => {
    assert.equal(run([], '').status, 2);
  });
});

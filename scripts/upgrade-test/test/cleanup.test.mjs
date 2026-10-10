import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listWorkDirs, removeDirectories, workDirOf } from '../lib/cleanup.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-cleanup-test-'));
  for (const name of ['111-friend-naive', '111-official-conformant', '222-friend-naive']) {
    fs.mkdirSync(path.join(root, name, 'instance', 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, name, 'instance', 'data', 'carta_cocktail.db'), 'copy');
  }
  return root;
}

test('workDirOf and listWorkDirs select the folders of one run, or all of them', () => {
  const root = makeRoot();
  try {
    assert.equal(workDirOf('111', 'friend', 'naive', root), path.join(root, '111-friend-naive'));
    assert.deepEqual(listWorkDirs(root, '111').map((dir) => path.basename(dir)).sort(),
      ['111-friend-naive', '111-official-conformant']);
    assert.equal(listWorkDirs(root).length, 3);
    assert.deepEqual(listWorkDirs(path.join(root, 'missing'), '111'), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removeDirectories deletes the folders even when the helper fails, and never throws', () => {
  const root = makeRoot();
  try {
    const calls = [];
    const failingHelper = (parentDir, name) => {
      calls.push([parentDir, name]);
      throw new Error('no docker');
    };
    const warnings = removeDirectories(listWorkDirs(root, '111'), { removeAsRoot: failingHelper });
    assert.deepEqual(warnings, []);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], root);
    assert.deepEqual(fs.readdirSync(root), ['222-friend-naive']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removeDirectories reports a folder that is still there', () => {
  const root = makeRoot();
  const dir = path.join(root, '111-friend-naive');
  const originalRmSync = fs.rmSync;
  try {
    fs.rmSync = () => {
      throw new Error('EACCES');
    };
    const warnings = removeDirectories([dir], { removeAsRoot: () => {} });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /cannot delete .*111-friend-naive: EACCES/);
  } finally {
    fs.rmSync = originalRmSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

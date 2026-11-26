// node --test docs/plan/build.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { listFieldErrors, parseFrontmatter } from './build.mjs';

const header = (lines) => parseFrontmatter(`---\n${lines.join('\n')}\n---\n`).data;

test('accepts bracketed lists, empty lists and absent fields', () => {
  assert.deepEqual(listFieldErrors('T.md', header(['depends_on: [A-01]', 'touches: [a/, b.ts]', 'sources: []'])), []);
  assert.deepEqual(listFieldErrors('T.md', header(['id: T-01'])), []);
});

for (const [name, lines] of [
  ['scalar', ['touches: scripts/upgrade-test/']],
  ['scalar followed by a list', ['touches: scripts/upgrade-test/, [backend/]']],
  ['missing closing bracket', ['touches: [a, b']],
  ['empty value', ['touches:']],
  ['multi-line YAML list', ['touches:', '  - a', '  - b']],
]) {
  test(`refuses ${name}, naming the file and the field`, () => {
    const errors = listFieldErrors('T-01-x.md', header(lines));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^T-01-x\.md : champ « touches » : liste attendue entre crochets/);
  });
}

test('checks depends_on and sources too', () => {
  const errors = listFieldErrors('T.md', header(['depends_on: A-01', 'sources: "01-report.md §x"']));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /« depends_on »/);
  assert.match(errors[1], /« sources »/);
});

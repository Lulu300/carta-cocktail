// Markdown report: one table per step and per mode. Counts and statuses only.
import { unexpectedFailures } from './expectations.mjs';

const RESULT_LABELS = { ok: 'OK', ko: 'KO', info: 'info', skip: 'skipped' };

function cell(text) {
  return String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((columns) => `| ${columns.map(cell).join(' | ')} |`),
  ].join('\n');
}

function stepTitle(step) {
  return step.from ? `${step.from} → ${step.to}` : `Start ${step.to}`;
}

export function resultLabel(check) {
  const label = RESULT_LABELS[check.status] ?? check.status;
  return check.expected ? `${label} (expected: ${check.expected})` : label;
}

/** OK, "OK, n expected failures" or "KO: <groups>" for the summary table. */
export function stepVerdict(step) {
  const rows = [...step.actions, ...step.checks];
  const unexpected = unexpectedFailures(rows);
  if (unexpected.length) {
    const labels = [...new Set(unexpected.map((result) => result.label ?? result.step))];
    return `**KO**: ${labels.join(', ')}`;
  }
  const expected = rows.filter((result) => result.expected).length;
  return expected ? `OK, ${expected} expected failure(s)` : 'OK';
}

function renderStep(step, mode) {
  const parts = [`### ${stepTitle(step)} (${mode})`];
  if (step.actions.length) {
    parts.push('Required actions of the release notes:', table(
      ['Notes', 'Action', 'Result', 'Details'],
      step.actions.map((action) => [action.step, action.note, action.status, action.detail]),
    ));
  }
  parts.push(table(['Check', 'Result', 'Details'], step.checks.map((check) => [check.label, resultLabel(check), check.detail])));
  return parts.join('\n\n');
}

function renderSummary(runs) {
  const titles = runs[0].steps.map(stepTitle);
  for (const run of runs) {
    for (const step of run.steps) if (!titles.includes(stepTitle(step))) titles.push(stepTitle(step));
  }
  const rows = titles.map((title) => [title, ...runs.map((run) => {
    const step = run.steps.find((candidate) => stepTitle(candidate) === title);
    return step ? stepVerdict(step) : 'not run';
  })]);
  return table(['Step', ...runs.map((run) => run.mode)], rows);
}

function renderImages(images) {
  return table(['Step', 'Backend image', 'Frontend image', 'Platform', 'Note'],
    Object.entries(images).map(([label, image]) => [label, image.backend, image.frontend, image.platform, image.note ?? '']));
}

export function renderReport({ generatedAt, layout, pathLabels, images, runs }) {
  const setup = runs.find((run) => run.setup?.tables)?.setup ?? {};
  const sections = [
    `# Upgrade test: ${layout.name} layout, ${pathLabels.join(' → ')}`,
    `Generated ${generatedAt} by scripts/upgrade-test. The report holds counts and statuses only.`,
    '## Setup',
    [
      `- Layout \`${layout.name}\`: ${layout.description}.`,
      `- Fixture: ${setup.tables} tables, ${setup.rows} rows, journal mode \`${setup.journalMode}\`; `
        + `${setup.photosInArchive} photos in the archive, ${setup.photosReferenced} referenced by cocktails.`,
      `- Credentials: in the working copy, the admin email was replaced by a placeholder and the password hash `
        + `(${setup.users} user(s)) by a bcrypt hash of a random test password. The env file holds random values `
        + `of the lengths given by the layout (${Object.entries(layout.envSecrets).map(([name, length]) => `${name}: ${length}`).join(', ')}).`,
      '- Modes: **naive** changes the image tags only; **conformant** applies the required actions of the release '
        + 'notes of every version crossed by the jump (hook files in scripts/upgrade-test/hooks/).',
    ].join('\n'),
    renderImages(images),
    '## Summary',
    renderSummary(runs),
  ];
  for (const run of runs) {
    sections.push(`## ${run.mode} mode`);
    if (run.error) sections.push(`**Bench error**: ${run.error}`);
    if (run.kept) sections.push(`Environment kept for inspection: compose project \`${run.kept.project}\`, folder \`${run.kept.workDir}\`.`);
    sections.push(...run.steps.map((step) => renderStep(step, run.mode)));
  }
  return `${sections.join('\n\n')}\n`;
}

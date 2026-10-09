#!/usr/bin/env node
// Génère la page de suivi du plan d'action et répond à « quelles tâches lancer maintenant ? ».
// Aucune dépendance : node docs/plan/build.mjs [--check | --ready | --json] [--max N] [--out fichier.html]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLAN_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(PLAN_DIR, '../..');
const TASKS_DIR = path.join(PLAN_DIR, 'tasks');
const REVIEW_DIR = path.join(ROOT, 'docs/review');
const TEMPLATE = path.join(PLAN_DIR, 'template.html');

export const PHASES = {
  A: { name: 'Urgences', desc: 'Perte de données et failles en production. Petites PR indépendantes, à faire d\'abord.' },
  B: { name: 'Socle', desc: 'Dépendances à jour, outillage et couverture de tests fiables avant les gros chantiers.' },
  C: { name: 'Fiabilité backend', desc: 'Migrations, erreurs, validation, services : un backend robuste et prévisible.' },
  D: { name: 'Infra & CI/CD', desc: 'Images Docker sûres, CI qui attrape les régressions, releases maîtrisées.' },
  E: { name: 'Frontend', desc: 'Architecture, design system, accessibilité et expérience de la carte publique.' },
  F: { name: 'Évolutions', desc: 'Améliorations à planifier une fois les bases posées.' },
};
export const LANES = {
  backend: 'Backend', frontend: 'Frontend', infra: 'Infra', ci: 'CI / tests', deps: 'Dépendances', docs: 'Docs / repo',
};
export const CRITICITES = { critique: 0, haute: 1, moyenne: 2, basse: 3 };
export const EFFORTS = { S: '< ½ jour', M: '1-2 jours', L: '> 2 jours' };
export const STATUSES = {
  todo: 'À faire', 'in-progress': 'En cours', review: 'En relecture', done: 'Terminée', blocked: 'Bloquée', dropped: 'Abandonnée',
};
export const OWNERS = { agent: 'Agent', human: 'Humain', mixed: 'Agent + humain' };
const CLOSED = new Set(['done', 'dropped']);
const REQUIRED = ['id', 'title', 'phase', 'lane', 'criticite', 'effort', 'status'];

// ───────────────────────── Frontmatter ─────────────────────────

function parseValue(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    const out = [];
    let cur = '';
    let quote = null;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (quote) {
        if (ch === '\\' && inner[i + 1] === quote) { cur += quote; i++; continue; }
        if (ch === quote) { quote = null; continue; }
        cur += ch;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.filter(Boolean);
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = parseValue(kv[2]);
  }
  return { data, body: text.slice(m[0].length) };
}

// ───────────────────────── Markdown (sous-ensemble GFM) ─────────────────────────

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section';
}

function inline(src, ctx) {
  const codes = [];
  let s = String(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const safe = /^(https?:|#|\.{0,2}\/|[\w.-]+\.(md|html)\b)/.test(href) ? href : '#';
    const ext = /^https?:/.test(safe);
    return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  if (ctx?.taskIds) {
    s = s.split(/(<a\b[^>]*>[\s\S]*?<\/a>|<[^>]+>)/).map((part) => (
      part.startsWith('<') ? part : part.replace(/\b([A-F]-\d{2})\b/g, (id) => (
        ctx.taskIds.has(id) ? `<a href="#/tache/${id}" class="tref">${id}</a>` : id))
    )).join('');
  }
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

const RE = {
  fence: /^(\s*)(```|~~~)\s*([\w+-]*)\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  quote: /^\s{0,3}>\s?(.*)$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};
const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;

function splitRow(line) {
  let l = line.trim().replace(/\\\|/g, '\u0001');
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim().replace(/\u0001/g, '|'));
}

export function md(src, ctx = {}) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = (l, next) => RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.item.test(l)
    || RE.quote.test(l) || (l.includes('|') && next !== undefined && RE.tableSep.test(next));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const f = line.match(RE.fence);
    if (f) {
      const fence = f[2];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      const ind = f[1].length;
      const code = body.map((b) => b.slice(Math.min(ind, indentOf(b)))).join('\n');
      out.push(`<pre><code${f[3] ? ` class="lang-${esc(f[3])}"` : ''}>${esc(code)}</code></pre>`);
      continue;
    }

    const h = line.match(RE.heading);
    if (h) {
      const level = h[1].length;
      const html = inline(h[2], ctx);
      const id = ctx.anchor ? ctx.anchor(h[2]) : slugify(h[2]);
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
      continue;
    }

    if (RE.hr.test(line) && !RE.item.test(line)) { out.push('<hr>'); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => {
          const key = (r[0] || '').replace(/\*\*/g, '').trim();
          const id = ctx.anchor && /^[A-Z]{0,2}\d+(\.\d+)?$/.test(key) ? ` id="${ctx.anchor(`${key} ${r[1] || ''}`, 2)}"` : '';
          return `<tr${id}>${head.map((_, k) => `<td>${inline(r[k] ?? '', ctx)}</td>`).join('')}</tr>`;
        }).join('')
      }</tbody></table></div>`);
      continue;
    }

    if (RE.quote.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim() && RE.quote.test(lines[i])) body.push(lines[i++].match(RE.quote)[1]);
      out.push(`<blockquote>${md(body.join('\n'), ctx)}</blockquote>`);
      continue;
    }

    const it = line.match(RE.item);
    if (it) {
      const base = indentOf(line);
      const ordered = /\d/.test(it[2]);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(RE.item);
        if (m && indentOf(l) <= base + 1 && /\d/.test(m[2]) === ordered) {
          items.push([m[3]]);
          i++;
          continue;
        }
        if (!l.trim()) {
          const next = lines.slice(i + 1).find((x) => x.trim());
          if (next !== undefined && indentOf(next) > base) { items[items.length - 1].push(''); i++; continue; }
          break;
        }
        if (indentOf(l) > base && items.length) { items[items.length - 1].push(l); i++; continue; }
        if (!isBlockStart(l, lines[i + 1]) && items.length && indentOf(l) >= base) { items[items.length - 1].push(l); i++; continue; }
        break;
      }
      const lis = items.map((parts) => {
        const contIndent = Math.min(...parts.slice(1).filter((p) => p.trim()).map(indentOf), Infinity);
        const rest = parts.slice(1).map((p) => (Number.isFinite(contIndent) ? p.slice(contIndent) : p));
        let first = parts[0];
        let cls = '';
        const cb = first.match(/^\[( |x|X)\]\s+(.*)$/);
        if (cb) {
          first = cb[2];
          cls = ' class="task-item"';
          first = `\u0002${cb[1].trim() ? 'x' : ' '}\u0002${first}`;
        }
        let html = md([first, ...rest].join('\n'), ctx);
        const single = html.match(/^<p>([\s\S]*?)<\/p>([\s\S]*)$/);
        if (single && !single[1].includes('<p>')) html = single[1] + single[2];
        html = html.replace(/\u0002(x| )\u0002/, (_, c) => `<input type="checkbox" disabled${c === 'x' ? ' checked' : ''}> `);
        return `<li${cls}>${html}</li>`;
      });
      out.push(ordered ? `<ol>${lis.join('')}</ol>` : `<ul>${lis.join('')}</ul>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    const text = inline(para.join(' '), ctx);
    const bold = para[0].match(/^\*\*(.+?)\*\*/);
    const id = bold && ctx.anchor ? ` id="${ctx.anchor(bold[1], 1)}"` : '';
    out.push(`<p${id}>${text}</p>`);
  }
  return out.join('\n');
}

const stripMd = (s) => String(s).replace(/```[\s\S]*?```/g, ' ').replace(/[`*_>#|[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();

// ───────────────────────── Chargement ─────────────────────────

function loadReports(taskIds) {
  if (!fs.existsSync(REVIEW_DIR)) return [];
  const dirs = fs.readdirSync(REVIEW_DIR).filter((d) => fs.statSync(path.join(REVIEW_DIR, d)).isDirectory()).sort();
  const reports = [];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(path.join(REVIEW_DIR, dir)).filter((f) => f.endsWith('.md')).sort()) {
      const raw = fs.readFileSync(path.join(REVIEW_DIR, dir, file), 'utf8');
      const id = file.replace(/\.md$/, '');
      const anchors = [];
      const used = new Map();
      const anchor = (text, kind = 0) => {
        let a = `${id}--${slugify(text)}`;
        const n = used.get(a) || 0;
        used.set(a, n + 1);
        if (n) a += `-${n}`;
        anchors.push({ id: a, kind, text: stripMd(text), raw: String(text).replace(/\*\*|`/g, '').trim() });
        return a;
      };
      const html = md(raw, { anchor, taskIds });
      const title = (raw.match(/^#\s+(.+)$/m) || [, id])[1];
      reports.push({ id, file, dir, path: `docs/review/${dir}/${file}`, title: stripMd(title), html, anchors });
    }
  }
  return reports;
}

function resolveSource(label, reports) {
  const m = label.match(/^\s*([\w.-]+?)(?:\.md)?\s*(?:§\s*(.+))?$/);
  if (!m) return { label, report: null, anchor: null };
  const report = reports.find((r) => r.id === m[1] || r.file === m[1]);
  if (!report) return { label, report: null, anchor: null };
  const token = m[2]?.trim();
  if (!token) return { label, report: report.id, anchor: null };
  const t = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = (s) => s.replace(/^(\s*(\[[^\]]*\]|[^\p{L}\p{N}[]+))+/u, '').trim();
  const starts = new RegExp(`^${t}(?![\\w]|\\.\\d)`, 'i');
  const contains = new RegExp(`(?:^|[^\\w.])${t}(?![\\w]|\\.\\d)`, 'i');
  const byKind = [...report.anchors].sort((x, y) => x.kind - y.kind);
  const hit = byKind.find((a) => starts.test(clean(a.raw))) || byKind.find((a) => contains.test(a.raw));
  return { label, report: report.id, anchor: hit ? hit.id : null };
}

function gitBranches() {
  try {
    return execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function gitInfo() {
  const run = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  return { branch: run(['rev-parse', '--abbrev-ref', 'HEAD']), commit: run(['rev-parse', '--short', 'HEAD']) };
}

function globToRe(g) {
  return new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0003').replace(/\*/g, '[^/]*').replace(/\u0003/g, '(?:.*/)?')}`);
}
export function overlap(a, b) {
  const p = a.replace(/^\.\//, '');
  const q = b.replace(/^\.\//, '');
  if (p === q || p.startsWith(q) || q.startsWith(p)) return true;
  for (const [x, y] of [[p, q], [q, p]]) {
    if (x.includes('*')) {
      if (globToRe(x).test(y)) return true;
      const stat = x.slice(0, x.indexOf('*'));
      if (stat.startsWith(y) || y.startsWith(stat)) return true;
    }
  }
  return false;
}
const conflictFiles = (a, b) => a.touches.filter((x) => b.touches.some((y) => overlap(x, y)));

export function loadPlan() {
  const errors = [];
  const warnings = [];
  const files = fs.existsSync(TASKS_DIR) ? fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.md')).sort() : [];
  const raw = files.map((file) => {
    const text = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(text);
    return { file, data, body };
  });
  const taskIds = new Set(raw.map((r) => r.data?.id).filter(Boolean));
  const reports = loadReports(taskIds);
  const tasks = [];
  const seen = new Map();
  for (const { file, data, body } of raw) {
    if (!data) { errors.push(`${file} : frontmatter absent`); continue; }
    for (const k of REQUIRED) if (!data[k]) errors.push(`${file} : champ « ${k} » manquant`);
    if (seen.has(data.id)) errors.push(`${file} : id ${data.id} déjà utilisé par ${seen.get(data.id)}`);
    seen.set(data.id, file);
    if (data.phase && !PHASES[data.phase]) errors.push(`${file} : phase inconnue « ${data.phase} »`);
    if (data.id && data.phase && data.id[0] !== data.phase) warnings.push(`${file} : l'id ${data.id} ne commence pas par la phase ${data.phase}`);
    if (data.lane && !LANES[data.lane]) errors.push(`${file} : lane inconnue « ${data.lane} »`);
    if (data.criticite && !(data.criticite in CRITICITES)) errors.push(`${file} : criticité inconnue « ${data.criticite} »`);
    if (data.effort && !EFFORTS[data.effort]) errors.push(`${file} : effort inconnu « ${data.effort} »`);
    if (data.status && !STATUSES[data.status]) errors.push(`${file} : statut inconnu « ${data.status} »`);
    const owner = data.owner || 'agent';
    if (!OWNERS[owner]) errors.push(`${file} : owner inconnu « ${owner} »`);
    const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const unchecked = (body.match(/^\s*[-*] \[ \]/gm) || []).length;
    const checked = (body.match(/^\s*[-*] \[[xX]\]/gm) || []).length;
    if (!stripMd(body.replace(/^##.*$/gm, '').replace(/- \d{4}-\d{2}-\d{2} :.*$/gm, ''))) warnings.push(`${file} : corps vide`);
    tasks.push({
      id: data.id, file, path: `docs/plan/tasks/${file}`, slug: file.replace(/\.md$/, '').replace(`${data.id}-`, ''),
      title: data.title, phase: data.phase, lane: data.lane, criticite: data.criticite, effort: data.effort,
      status: data.status, owner, depends_on: arr(data.depends_on), touches: arr(data.touches),
      sourcesRaw: arr(data.sources), branch: data.branch || '', pr: data.pr || '',
      body, checks: { done: checked, total: checked + unchecked },
    });
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) for (const d of t.depends_on) if (!byId.has(d)) errors.push(`${t.file} : dépendance inconnue « ${d} »`);

  // Cycles
  const state = new Map();
  const visit = (t, trail) => {
    if (state.get(t.id) === 2) return;
    if (state.get(t.id) === 1) { errors.push(`cycle de dépendances : ${[...trail, t.id].join(' → ')}`); return; }
    state.set(t.id, 1);
    for (const d of t.depends_on) if (byId.has(d)) visit(byId.get(d), [...trail, t.id]);
    state.set(t.id, 2);
  };
  tasks.forEach((t) => visit(t, []));

  // Vagues (niveau topologique)
  const waveMemo = new Map();
  const wave = (t, guard = new Set()) => {
    if (waveMemo.has(t.id)) return waveMemo.get(t.id);
    if (guard.has(t.id)) return 1;
    guard.add(t.id);
    const w = 1 + Math.max(0, ...t.depends_on.filter((d) => byId.has(d)).map((d) => wave(byId.get(d), guard)));
    waveMemo.set(t.id, w);
    return w;
  };

  // Statut effectif (branche détectée = en cours)
  const branches = gitBranches();
  for (const t of tasks) {
    t.wave = wave(t);
    t.effStatus = t.status;
    const re = new RegExp(`(^|/)${t.id}(-|$)`, 'i');
    t.detectedBranches = branches.filter((b) => re.test(b));
    if ((t.status === 'todo' || t.status === 'blocked') && t.detectedBranches.length) t.effStatus = 'in-progress';
    t.dependents = tasks.filter((o) => o.depends_on.includes(t.id)).map((o) => o.id);
  }
  for (const t of tasks) {
    t.blockedBy = t.depends_on.filter((d) => byId.has(d) && !CLOSED.has(byId.get(d).effStatus));
    t.ready = t.effStatus === 'todo' && t.blockedBy.length === 0;
    t.conflicts = tasks.filter((o) => o.id !== t.id && conflictFiles(t, o).length).map((o) => ({ id: o.id, files: conflictFiles(t, o) }));
    t.sources = t.sourcesRaw.map((s) => resolveSource(s, reports));
    for (const s of t.sources) if (!s.report) warnings.push(`${t.file} : source introuvable « ${s.label} »`);
    const kind = t.phase === 'A' ? 'fix' : t.lane === 'deps' || t.lane === 'ci' || t.lane === 'infra' ? 'chore' : t.lane === 'docs' ? 'docs' : 'feature';
    t.suggestedBranch = t.branch || `${kind}/${t.id}-${t.slug}`;
  }
  return { tasks, byId, reports, errors, warnings };
}

// Lot de tâches lançables ensemble : prêtes, sans fichier commun entre elles ni avec le travail en cours.
export function recommendLot(tasks, max = 4) {
  const active = tasks.filter((t) => t.effStatus === 'in-progress' || t.effStatus === 'review');
  const ready = tasks.filter((t) => t.ready)
    .sort((a, b) => CRITICITES[a.criticite] - CRITICITES[b.criticite] || a.phase.localeCompare(b.phase) || a.id.localeCompare(b.id));
  const picked = [];
  const clash = (t) => [...active, ...picked].find((o) => conflictFiles(t, o).length);
  for (const pass of [true, false]) {
    for (const t of ready) {
      if (picked.length >= max) break;
      if (picked.includes(t) || clash(t)) continue;
      if (pass && picked.some((p) => p.lane === t.lane)) continue;
      picked.push(t);
    }
  }
  const others = ready.filter((t) => !picked.includes(t)).map((t) => {
    const c = clash(t);
    return { id: t.id, reason: c ? `fichiers communs avec ${c.id} (${conflictFiles(t, c).join(', ')})` : `lot limité à ${max} tâches` };
  });
  return { picked: picked.map((t) => t.id), others, active: active.map((t) => t.id) };
}

function summary(tasks) {
  const by = (k) => Object.fromEntries(Object.keys(k === 'phase' ? PHASES : STATUSES).map((v) => [v, 0]));
  const status = by('status');
  tasks.forEach((t) => { status[t.effStatus]++; });
  const phases = Object.fromEntries(Object.keys(PHASES).map((p) => {
    const ts = tasks.filter((t) => t.phase === p);
    return [p, { total: ts.length, closed: ts.filter((t) => CLOSED.has(t.effStatus)).length }];
  }));
  return { total: tasks.length, closed: tasks.filter((t) => CLOSED.has(t.effStatus)).length, status, phases };
}

// ───────────────────────── Sorties ─────────────────────────

function buildHtml(plan, max) {
  const { tasks, reports } = plan;
  const taskIds = new Set(tasks.map((t) => t.id));
  const guide = fs.existsSync(path.join(PLAN_DIR, 'README.md')) ? fs.readFileSync(path.join(PLAN_DIR, 'README.md'), 'utf8') : '';
  const data = {
    generatedAt: new Date().toISOString(),
    git: gitInfo(),
    phases: PHASES, lanes: LANES, criticites: CRITICITES, efforts: EFFORTS, statuses: STATUSES, owners: OWNERS,
    summary: summary(tasks),
    lot: recommendLot(tasks, max),
    warnings: plan.warnings,
    guide: md(guide, { taskIds, anchor: (t) => `guide--${slugify(t)}` }),
    reports: reports.map(({ anchors, ...r }) => r),
    tasks: tasks.map(({ body, sourcesRaw, ...t }) => ({
      ...t,
      html: md(body.replace(/^#\s+.*\n/, ''), { taskIds, anchor: (x) => `t-${t.id}--${slugify(x)}` }),
      text: stripMd(body).slice(0, 4000),
    })),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  return fs.readFileSync(TEMPLATE, 'utf8').replace('/*__PLAN_DATA__*/null', () => json);
}

function printReady(plan, max) {
  const { tasks, byId } = plan;
  const lot = recommendLot(tasks, max);
  const line = (t) => `  ${t.id.padEnd(5)} ${`[${t.lane}]`.padEnd(11)} ${t.criticite.padEnd(8)} ${t.effort}  ${t.title}`;
  const s = summary(tasks);
  console.log(`\nAvancement : ${s.closed}/${s.total} tâches terminées\n`);
  if (lot.active.length) {
    console.log('En cours (branche détectée ou statut) :');
    lot.active.forEach((id) => console.log(`${line(byId.get(id))}  ← ${byId.get(id).detectedBranches[0] || byId.get(id).branch || ''}`));
    console.log('');
  }
  console.log(`Lot recommandé (${lot.picked.length} tâches lançables en parallèle, couloirs distincts en priorité) :`);
  if (!lot.picked.length) console.log('  (aucune tâche prête)');
  lot.picked.forEach((id) => console.log(`${line(byId.get(id))}\n         branche : ${byId.get(id).suggestedBranch}   fichier : ${byId.get(id).path}`));
  if (lot.others.length) {
    console.log('\nAutres tâches prêtes, à lancer après :');
    lot.others.forEach((o) => console.log(`${line(byId.get(o.id))}\n         ${o.reason}`));
  }
  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const max = Number(opt('--max') || 4);
  const plan = loadPlan();
  const report = () => {
    plan.warnings.forEach((w) => console.warn(`⚠ ${w}`));
    plan.errors.forEach((e) => console.error(`✖ ${e}`));
  };
  if (args.includes('--json')) {
    const { tasks } = plan;
    console.log(JSON.stringify({
      summary: summary(tasks), lot: recommendLot(tasks, max), errors: plan.errors, warnings: plan.warnings,
      tasks: tasks.map(({ body, sourcesRaw, ...t }) => t),
    }, null, 2));
    process.exitCode = plan.errors.length ? 1 : 0;
    return;
  }
  report();
  if (plan.errors.length) { process.exitCode = 1; return; }
  if (args.includes('--check')) { console.log(`✔ ${plan.tasks.length} tâches valides`); return; }
  if (args.includes('--ready')) { printReady(plan, max); return; }
  const out = path.resolve(opt('--out') || path.join(PLAN_DIR, 'index.html'));
  fs.writeFileSync(out, buildHtml(plan, max));
  const s = summary(plan.tasks);
  console.log(`✔ ${path.relative(process.cwd(), out)} généré : ${s.total} tâches, ${s.closed} terminées, ${plan.tasks.filter((t) => t.ready).length} prêtes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

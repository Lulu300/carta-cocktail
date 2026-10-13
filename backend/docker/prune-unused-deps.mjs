// Removes from node_modules the packages that the image never loads.
//
// usage: node prune-unused-deps.mjs <parent>:<dependency>...
//
// Each argument cuts dependency edges of the installed tree: `prisma:mysql2`
// cuts one, `@prisma/studio-core:*` cuts every dependency of that package (the
// package itself stays). The script then keeps every package still reachable
// from the dependencies of package.json and deletes the others. A package that
// something else still needs stays: cutting an edge can leave a package in the
// image, never remove one that a kept package declares. An argument that cuts
// nothing (renamed or dropped by an update) stops the build, so the list stays
// current.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = '.';
const ALL_DEPENDENCIES = '*';

function readManifest(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

// Every installed package folder, nested ones included ("node_modules/a/node_modules/b").
function listInstalled(dir, found = new Set()) {
  const modules = path.join(dir, 'node_modules');
  if (!existsSync(modules)) return found;
  for (const entry of readdirSync(modules)) {
    if (entry.startsWith('.')) continue;
    const names = entry.startsWith('@')
      ? readdirSync(path.join(modules, entry)).map((child) => `${entry}/${child}`)
      : [entry];
    for (const name of names) {
      const packageDir = path.join(modules, name);
      found.add(packageDir);
      listInstalled(packageDir, found);
    }
  }
  return found;
}

// Node's lookup: the closest node_modules folder that holds the package, going up.
function resolve(installed, fromDir, name) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (installed.has(candidate)) return candidate;
    if (dir === ROOT) return undefined;
    dir = path.dirname(dir);
  }
}

// Optional and peer dependencies count too: a package loads them when they are installed.
function dependencyNames(dir, manifest) {
  if (dir === ROOT) return Object.keys(manifest.dependencies ?? {});
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  });
}

function parseCuts(args) {
  return args.map((arg) => {
    const separator = arg.indexOf(':', 1);
    if (separator < 0) throw new Error(`Expected <parent>:<dependency>, got "${arg}"`);
    return { arg, parent: arg.slice(0, separator), dependency: arg.slice(separator + 1) };
  });
}

function findCut(cuts, parent, dependency) {
  return cuts.find(
    (cut) =>
      cut.parent === parent &&
      (cut.dependency === dependency || cut.dependency === ALL_DEPENDENCIES),
  );
}

function findReachable(installed, cuts) {
  const usedCuts = new Set();
  const reachable = new Set([ROOT]);
  const queue = [ROOT];
  while (queue.length > 0) {
    const dir = queue.shift();
    const manifest = readManifest(dir);
    for (const name of dependencyNames(dir, manifest)) {
      const cut = findCut(cuts, manifest.name, name);
      if (cut) {
        usedCuts.add(cut.arg);
        continue;
      }
      const target = resolve(installed, dir, name);
      if (target && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  return { reachable, usedCuts };
}

function removeDanglingBinLinks(dirs) {
  for (const dir of dirs) {
    const bin = path.join(dir, 'node_modules', '.bin');
    if (!existsSync(bin)) continue;
    for (const link of readdirSync(bin)) {
      const linkPath = path.join(bin, link);
      // statSync follows the link: it throws when the target was removed.
      try {
        statSync(linkPath);
      } catch {
        rmSync(linkPath, { force: true });
      }
    }
  }
}

const cuts = parseCuts(process.argv.slice(2));
const installed = listInstalled(ROOT);
const { reachable, usedCuts } = findReachable(installed, cuts);

const unusedCuts = cuts.filter((cut) => !usedCuts.has(cut.arg)).map((cut) => cut.arg);
if (unusedCuts.length > 0) {
  console.error(
    `No such dependency in the installed tree: ${unusedCuts.join(', ')}. Update the list in the Dockerfile.`,
  );
  process.exit(1);
}

// Sorted so that a package goes before the packages nested in it.
const unused = [...installed].filter((dir) => !reachable.has(dir)).sort();
for (const dir of unused) {
  rmSync(dir, { recursive: true, force: true });
}
removeDanglingBinLinks([...reachable]);
console.log(`Removed ${unused.length} unused packages:`);
console.log(unused.map((dir) => `  ${dir}`).join('\n'));

#!/usr/bin/env node
// Decides which moving image tags a release may publish, so that a final
// version lower than a published one (a v1.15.1 fix after v1.16.0) never moves
// them backwards.
//
// Usage: git tag --list 'v*' | node release-tags.mjs <tag>
// Prints key=value lines for $GITHUB_OUTPUT:
//   latest   the tag is the highest final version: moves :latest (and the GitHub "Latest" badge)
//   major    the tag is the highest final version of its major: moves :X
//   minor    the tag is the highest final version of its minor: moves :X.Y
// :X.Y.Z is always published. A pre-release moves nothing.

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const FINAL_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseFinal(tag) {
  const match = FINAL_TAG.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function isHighest(version, versions) {
  return versions.every((other) => compare(other, version) <= 0);
}

export function chooseTags(currentTag, existingTags) {
  const current = parseFinal(currentTag);
  if (!current) {
    return { latest: false, major: false, minor: false };
  }
  // The current tag counts even when the list misses it, and a re-run of the
  // highest tag finds itself in the list: equal is highest.
  const finals = [...existingTags.map(parseFinal).filter(Boolean), current];
  const [major, minor] = current;
  return {
    latest: isHighest(current, finals),
    major: isHighest(
      current,
      finals.filter((v) => v[0] === major),
    ),
    minor: isHighest(
      current,
      finals.filter((v) => v[0] === major && v[1] === minor),
    ),
  };
}

function main() {
  const [tag] = process.argv.slice(2);
  if (!tag) {
    console.error('Usage: git tag --list "v*" | node release-tags.mjs <tag>');
    process.exit(2);
  }
  const existing = readFileSync(0, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const [key, value] of Object.entries(chooseTags(tag, existing))) {
    console.log(`${key}=${value}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

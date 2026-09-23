#!/usr/bin/env node
//
// Regenerate a handbook's reference/source-map.md from every page's frontmatter `sources:` list.
//
// The map is what create-handbook update mode reads: a changed path or glob in column one, the
// pages it makes suspect in column two. Node stdlib only, no YAML dependency — a `sources:` entry
// is a `  - value` line, optionally quoted.
//
// The table is sorted, so the output is deterministic. The file's frontmatter and intro text are
// preserved; `updated` and the generated-on summary line move only when the table actually changes.
//
// Usage:
//   node .agents/skills/create-handbook/generate-source-map.mjs [<handbook-root>] [--check]
//
//   <handbook-root>  handbook directory; default docs/handbooks/cloud, resolved from the repository
//                    root (the directory three levels above this script)
//   --check          write nothing; exit 1 if the file would change. Run it straight after a
//                    generate: a second run must be a no-op.
//
// Exit codes:
//   0  The file was rewritten, or it was already up to date
//   1  --check found a difference, or the handbook root or its source-map page is unusable

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';

/** The generated page itself: it is an output, not an input. */
const SELF = 'reference/source-map.md';
const TABLE_HEAD = '| Source path or glob | Pages made suspect |';
const SUMMARY_LINE = /^\d+ source paths? across \d+ pages?, generated \d{4}-\d{2}-\d{2}\.$/m;
const UPDATED_LINE = /^updated: '\d{4}-\d{2}-\d{2}'$/m;

/** Print the reason and exit 1. */
const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

/** Code-unit order, which is what the table is sorted in. */
const ascending = (a, b) => {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};

/** Frontmatter `sources:` entries of one page, in file order. */
const readSources = (text) => {
  const lines = text.split('\n');
  if (lines[0] !== '---') {
    return [];
  }
  const fence = lines.indexOf('---', 1);
  const frontmatter = lines.slice(1, fence === -1 ? lines.length : fence);
  const start = frontmatter.indexOf('sources:');
  if (start === -1) {
    return [];
  }
  const entries = [];
  for (const line of frontmatter.slice(start + 1)) {
    const entry = /^\s+-\s+(.*)$/.exec(line);
    if (!entry) {
      break;
    }
    entries.push(entry[1].trim().replaceAll(/^["']|["']$/g, ''));
  }
  return entries;
};

const main = () => {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const given = args.find((argument) => !argument.startsWith('--'));
  const root = given ? resolve(given) : resolve(import.meta.dirname, '../../..', 'docs/handbooks/cloud');

  let pages;
  try {
    pages = readdirSync(root, { recursive: true })
      .map((entry) => entry.split(sep).join('/'))
      .filter((entry) => entry.endsWith('.md') && entry !== SELF)
      .sort(ascending);
  } catch (error) {
    return fail(`cannot read handbook root ${root}: ${String(error)}`);
  }

  /** @type {Map<string, Set<string>>} */
  const bySource = new Map();
  const contributing = new Set();
  for (const page of pages) {
    for (const source of readSources(readFileSync(join(root, page), 'utf8'))) {
      const pagesForSource = bySource.get(source) ?? new Set();
      pagesForSource.add(page);
      bySource.set(source, pagesForSource);
      contributing.add(page);
    }
  }
  if (bySource.size === 0) {
    return fail(`no page under ${root} declares a sources: list`);
  }

  const table = [
    TABLE_HEAD,
    '| --- | --- |',
    ...[...bySource.keys()].sort(ascending).map((source) => {
      const links = [...(bySource.get(source) ?? [])]
        .sort(ascending)
        .map((page) => `[${page}](../${page})`)
        .join(', ');
      return `| \`${source}\` | ${links} |`;
    }),
  ].join('\n');

  const mapPath = join(root, SELF);
  let current;
  try {
    current = readFileSync(mapPath, 'utf8');
  } catch (error) {
    return fail(`cannot read ${mapPath}: ${String(error)}`);
  }
  const tableStart = current.indexOf(TABLE_HEAD);
  if (tableStart === -1) {
    return fail(`${mapPath} has no table header line: ${TABLE_HEAD}`);
  }

  const counts = `${bySource.size} source paths across ${contributing.size} pages`;
  if (current.slice(tableStart).trimEnd() === table) {
    console.log(`✓ ${mapPath} is up to date (${counts})`);
    return;
  }
  if (check) {
    return fail(`${mapPath} is out of date (${counts}); run the generator`);
  }

  const head = current.slice(0, tableStart);
  if (!SUMMARY_LINE.test(head)) {
    return fail(`${mapPath} has no "<n> source paths across <n> pages, generated <date>." line`);
  }
  if (!UPDATED_LINE.test(head)) {
    return fail(`${mapPath} has no single-quoted updated: line`);
  }
  const today = new Date().toISOString().slice(0, 10);

  writeFileSync(
    mapPath,
    `${head
      .replace(UPDATED_LINE, `updated: '${today}'`)
      .replace(SUMMARY_LINE, `${counts}, generated ${today}.`)}${table}\n`,
  );
  console.log(`✓ wrote ${mapPath} (${counts})`);
};

try {
  main();
} catch (error) {
  console.error('generate-source-map failed:', error);
  process.exit(1);
}

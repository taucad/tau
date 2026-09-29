/*
 * The timer gate (SC-A8, T9): every substrate timer has a row in `specs/timeouts.json`, every row's token is still at
 * its site, and every Peer row names the work package that deletes it. The table lists the paths it scans.
 * ponytail: runs in agent-host, which owns the table, not the `formal` project: agent-host, host and revisions import
 * `@taucad/formal`, so `formal`'s implicitDependencies on them would close a cycle. A timer added in a scanned
 * project that agent-host does not depend on fails here, but does not make this lane affected on its own.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { checkTimerInventory } from '@taucad/formal/drift';
import type { TimeoutRow } from '@taucad/formal/drift';

const root = path.resolve(import.meta.dirname, '../../../..');
const table = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../specs/timeouts.json'), 'utf8')) as {
  readonly scan: readonly string[];
  readonly rows: readonly TimeoutRow[];
};

const isSource = (file: string): boolean =>
  /\.tsx?$/.test(file) &&
  !/\.(test|spec|stories|test-d)\.tsx?$|\.d\.ts$/.test(file) &&
  !/\/(test|testing|fixtures)\//.test(file);

/** Every source file under a scanned path, keyed by its repository path. */
const scanned = (): Record<string, string> => {
  const files: Record<string, string> = {};
  const visit = (relative: string): void => {
    const absolute = path.join(root, relative);
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute)) {
        visit(`${relative}/${name}`);
      }
    } else if (isSource(relative)) {
      files[relative] = readFileSync(absolute, 'utf8');
    }
  };
  for (const entry of table.scan) {
    visit(entry);
  }
  return files;
};

/**
 * Timer sites `checkTimerInventory` does not match: a bound handed to `AbortSignal.timeout(` is a timer too (W6.r1
 * round 3). A row's token within the call's line and the three after it covers it, as there; doc examples are no site.
 */
const abortTimeoutSites = (files: Readonly<Record<string, string>>): string[] => {
  const problems: string[] = [];
  for (const [site, text] of Object.entries(files)) {
    const rows = table.rows.filter((row) => row.site === site);
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (!/\bAbortSignal\.timeout\s*\(/.test(line) || /^\s*(?:\*|\/\/)/.test(line)) {
        continue;
      }
      const window = lines.slice(index, index + 4).join('\n');
      if (!rows.some((row) => window.includes(row.token))) {
        problems.push(`${site}:${String(index + 1)}: AbortSignal.timeout with no timeout-table row`);
      }
    }
  }
  return problems;
};

describe('timeouts.json', () => {
  it('should have a row for every substrate timer, and a deleting work package for every Peer wait', () => {
    expect(checkTimerInventory(scanned(), table.rows)).toEqual([]);
  });

  it('should have a row for every AbortSignal.timeout bound', () => {
    expect(abortTimeoutSites(scanned())).toEqual([]);
  });

  it('should scan every site a row names', () => {
    const files = scanned();
    expect(table.rows.filter((row) => files[row.site] === undefined).map((row) => row.id)).toEqual([]);
  });
});

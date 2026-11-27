/* eslint-disable @typescript-eslint/naming-convention -- Runs are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { emptyState, ingestRun, parseOutcomes, parseState, serializeState } from '#ci-flake-ledger-state.js';
import type { IngestRun, LedgerState, OutcomeRow } from '#ci-flake-ledger-state.js';
import { promotionBody, promotionBranch, promotionTitle, readyRows } from '#ci-shadow-rows-promote-cli.js';
import {
  countShadowRun,
  maximumHistory,
  meetsShadowBar,
  promoteProjectJson,
  queueTarget,
  renderShadowMarkdown,
  retainShadowRows,
  shadowBar,
  shadowRowKey,
  shadowRowsOf,
  shadowTarget,
  streakFromHistory,
} from '#ci-shadow-rows.js';
import type { ShadowRow, ShadowRowState } from '#ci-shadow-rows.js';

const journeyA: ShadowRow = {
  project: 'ui-e2e',
  target: 'test:e2e:journey-a',
  projectFile: 'apps/ui-e2e/project.json',
};
const journeyB: ShadowRow = {
  project: 'react-e2e',
  target: 'test:e2e:journey-b',
  projectFile: 'apps/react-e2e/project.json',
};
const registry = [journeyB, journeyA];

const run = (id: number, attempt = 1): IngestRun => ({
  id,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-${id}-${'a'.repeat(40)}`,
  head_sha: id.toString(16).padStart(40, '0'),
  status: 'completed',
  conclusion: 'success',
  created_at: new Date(Date.UTC(2026, 10, 1) + (id - 2000) * 3_600_000).toISOString(),
  updated_at: new Date(Date.UTC(2026, 10, 1) + (id - 2000) * 3_600_000 + 1_800_000).toISOString(),
  html_url: `https://github.com/taucad/tau/actions/runs/${id}`,
  run_attempt: attempt,
});

/*
 * The fixture: 170 merge-queue runs (2001 to 2170) of two shadow rows, as the outcome rows their jobs upload.
 * `ui-e2e:test:e2e:journey-a` runs in every run; `react-e2e:test:e2e:journey-b` in every even run but 2062.
 *
 * | Run  | journey-a                                                           | journey-b      |
 * | ---- | ------------------------------------------------------------------- | -------------- |
 * | 2021 | a test failed on Firefox                                            |                |
 * | 2031 | did not run (only a `host` unit test ran)                           |                |
 * | 2032 | a module failed (no test failed)                                    | passed         |
 * | 2040 | a test passed on its recorded retry                                 | passed         |
 * | 2061 | its rows are replays of run 2050, restored from the cache           |                |
 * | 2062 | attempt 1 failed on Firefox, attempt 2 (a re-run) passed            | did not run    |
 * | 2090 | ran as two shards (`:shard-1`, `:shard-2`), both passed             | passed         |
 * | 2095 | passed; a `host` unit test failed in the same run                   |                |
 * | 2150 | passed                                                              | a test failed  |
 * | else | passed                                                              | passed if even |
 *
 * The hand count, journey-a: runs counted are 2001–2030 (30), 2032 (1), 2033–2060 (28), 2062 at two attempts (2) and
 * 2063–2170 (108): 169. The last failure is 2062 attempt 1; after it, 2062 attempt 2 and 2063–2170 pass: 1 + 108 =
 * 109 consecutive passing runs, none of them with a retried pass (the one in 2040 is before the last failure). The count
 * reached 100 at 2161 (2062 attempt 2 is the first, 2063 + 98 = 2161 the hundredth).
 *
 * journey-b: the even runs 2002–2170 are 85, less 2062: 84 counted. The last failure is 2150; 2152–2170 are 10 even
 * runs, all passing: 10.
 */
const fixtureRows = (): OutcomeRow[] => {
  const parsed = parseOutcomes(
    readFileSync(resolve(import.meta.dirname, 'fixtures/shadow-rows/runs.outcomes.jsonl'), 'utf8'),
    'shadow-rows',
  );
  expect(parsed.problems).toEqual([]);
  return parsed.rows;
};

/** The fixture as the ledger reads it: one run's artifacts at a time, in run order, with the run at its attempt. */
const fixtureRuns = (): Array<{ run: IngestRun; rows: OutcomeRow[] }> => {
  const byRun = new Map<number, OutcomeRow[]>();
  const rows = fixtureRows();
  for (const row of rows) {
    // A replayed row carries the run that executed it; it was uploaded by the run of its hash (`h<run>`).
    const uploadedBy = Number(row.hash?.slice(1));
    byRun.set(uploadedBy, [...(byRun.get(uploadedBy) ?? []), row]);
  }
  return [...byRun.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, runRows]) => ({ run: run(id, Math.max(...runRows.map((row) => row.attempt ?? 1))), rows: runRows }));
};

const ingestFixture = (upTo = Number.POSITIVE_INFINITY): LedgerState => {
  const state = emptyState(new Date('2026-11-01T00:00:00Z'));
  for (const { run: ingest, rows } of fixtureRuns().filter((entry) => entry.run.id <= upTo)) {
    countShadowRun(state, { run: ingest, rows, registry });
    ingestRun(state, { run: ingest, rows, artifacts: 1, rejected: 0 });
  }
  return state;
};

/**
 * An independent recount straight from the fixture rows, for one row: each (run, attempt) of the row's own rows is a
 * run, failed if any of them failed; the streak is the passing runs after the last failed one.
 */
const recount = (rows: readonly OutcomeRow[], row: ShadowRow): { runs: number; streak: number } => {
  const verdicts = new Map<string, boolean>();
  for (const entry of rows) {
    const uploadedBy = Number(entry.hash?.slice(1));
    if (entry.project !== row.project || !entry.target.startsWith(row.target) || entry.run !== uploadedBy) {
      continue;
    }
    const key = `${String(entry.run).padStart(8, '0')}.${entry.attempt}`;
    verdicts.set(key, (verdicts.get(key) ?? true) && entry.state === 'passed');
  }
  const ordered = [...verdicts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, passed]) => passed);
  return { runs: ordered.length, streak: ordered.length - (ordered.lastIndexOf(false) + 1) };
};

const rowState = (state: LedgerState, key: string): ShadowRowState => {
  const found = state.shadowRows?.[key];
  if (!found) {
    throw new Error(`${key} is not counted`);
  }
  return found;
};

describe('shadow rows in the flake ledger', () => {
  it('should count a shadow row to the same number as a hand count over the same runs', () => {
    const state = ingestFixture();
    const a = rowState(state, 'ui-e2e:test:e2e:journey-a');
    const b = rowState(state, 'react-e2e:test:e2e:journey-b');
    // The hand count of the fixture table above.
    expect({ runs: a.runs, streak: a.streak }).toEqual({ runs: 169, streak: 109 });
    expect({ runs: b.runs, streak: b.streak }).toEqual({ runs: 84, streak: 10 });
    // The same runs recounted from the rows alone, and from the history the state keeps.
    const rows = fixtureRows();
    expect(recount(rows, journeyA)).toEqual({ runs: 169, streak: 109 });
    expect(recount(rows, journeyB)).toEqual({ runs: 84, streak: 10 });
    expect(streakFromHistory(a.history)).toBe(109);
    expect(streakFromHistory(b.history)).toBe(10);
    expect(a.lastFailure).toMatchObject({ run: 2062, attempt: 1, passed: false });
    expect(b.lastFailure).toMatchObject({
      run: 2150,
      passed: false,
      failed: ['react-e2e › src/journey-b.spec.ts > journey b > should sign in'],
    });
    expect(meetsShadowBar(a)).toBe(true);
    expect(meetsShadowBar(b)).toBe(false);
  });

  it('should reach the bar on the hundredth consecutive passing run and not before', () => {
    expect(rowState(ingestFixture(2160), 'ui-e2e:test:e2e:journey-a').streak).toBe(shadowBar - 1);
    expect(meetsShadowBar(rowState(ingestFixture(2160), 'ui-e2e:test:e2e:journey-a'))).toBe(false);
    expect(rowState(ingestFixture(2161), 'ui-e2e:test:e2e:journey-a').streak).toBe(shadowBar);
    expect(meetsShadowBar(rowState(ingestFixture(2161), 'ui-e2e:test:e2e:journey-a'))).toBe(true);
  });

  it('should reset on a failed test or module, pass a retried test, and leave a run the row missed alone', () => {
    const history = (upTo: number): ShadowRowState => rowState(ingestFixture(upTo), 'ui-e2e:test:e2e:journey-a');
    expect(history(2020).streak).toBe(20);
    expect(history(2021)).toMatchObject({ streak: 0, lastFailure: { run: 2021, tests: 4 } });
    expect(history(2030).streak).toBe(9);
    // 2031: the row did not run.
    expect(history(2031)).toMatchObject({ streak: 9, runs: 30 });
    // 2032: a module row failed and no test did.
    expect(history(2032).lastFailure).toMatchObject({ run: 2032, failed: ['ui-e2e › src/journey-a.spec.ts'] });
    expect(history(2032).streak).toBe(0);
    // 2040: a retried pass passes, and is counted beside the streak.
    expect(history(2040)).toMatchObject({ streak: 8, streakRetried: 1 });
    expect(history(2040).history.at(-1)).toMatchObject({ run: 2040, passed: true, retried: 1 });
    // 2061: replayed rows are not a run of the row.
    expect(history(2061).runs).toBe(history(2060).runs);
    // 2062: a re-run attempt is a run of its own.
    expect(history(2062).history.slice(-2)).toMatchObject([
      { run: 2062, attempt: 1, passed: false },
      { run: 2062, attempt: 2, passed: true },
    ]);
    // 2090: two shards of one target in one attempt are one run.
    expect(history(2090).history.at(-1)).toMatchObject({ run: 2090, tests: 2, passed: true });
    expect(history(2090).runs - history(2089).runs).toBe(1);
    // 2095: another project's failure in the same run is not the row's.
    expect(history(2095).history.at(-1)).toMatchObject({ run: 2095, passed: true });
  });

  it('should count an attempt once, keep a bounded history and survive the state round trip', () => {
    const state = ingestFixture();
    const before = structuredClone(state.shadowRows);
    const [last] = fixtureRuns().slice(-1);
    if (!last) {
      throw new Error('no runs');
    }
    // The ledger records the attempt as ingested, so a second read of the same run counts nothing.
    expect(countShadowRun(state, { run: last.run, rows: last.rows, registry })).toEqual([]);
    expect(state.shadowRows).toEqual(before);
    expect(rowState(state, 'ui-e2e:test:e2e:journey-a').history).toHaveLength(maximumHistory);
    expect(parseState(serializeState(state)).shadowRows).toEqual(state.shadowRows);
    // A state with no shadow rows serializes as it did before FQ-13.
    expect(serializeState(emptyState(new Date('2026-11-01T00:00:00Z')))).not.toContain('shadowRows');
  });

  it('should drop the count of a row that is no longer a shadow row', () => {
    const state = ingestFixture(2010);
    expect(retainShadowRows(state, [journeyA])).toEqual(['react-e2e:test:e2e:journey-b']);
    expect(Object.keys(state.shadowRows ?? {})).toEqual(['ui-e2e:test:e2e:journey-a']);
  });

  it('should report each row against the bar', () => {
    const state = ingestFixture();
    const markdown = renderShadowMarkdown(state, { rows: registry, problems: ['x: y'] });
    expect(markdown).toContain('| react-e2e:test:e2e:journey-b | 10 | 0 | 84 | run 2150 (2026-11-07)');
    expect(markdown).toContain(
      '| ui-e2e:test:e2e:journey-a | 109 | 0 | 169 | run 2062 (2026-11-03): ui-e2e › src/journey-a.spec.ts > journey a > should open a project | yes |',
    );
    expect(markdown).toContain('- x: y');
    expect(renderShadowMarkdown(state, { rows: [], problems: [] })).toContain(
      `No project lists a suite in \`${shadowTarget}\``,
    );
  });
});

describe('the shadow-row registry', () => {
  it('should read the rows from test:e2e:shadow and refuse a suite that is not a target or already gates', () => {
    const registered = shadowRowsOf([
      {
        file: 'apps/ui-e2e/project.json',
        config: {
          name: 'ui-e2e',
          targets: {
            'test:e2e:a': {},
            'test:e2e:b': {},
            [queueTarget]: { dependsOn: ['test:e2e:b'] },
            [shadowTarget]: { dependsOn: ['test:e2e:a', 'test:e2e:b', 'test:e2e:missing', 7] },
          },
        },
      },
      { file: 'libs/x/project.json', config: { name: 'x', targets: { test: {} } } },
    ]);
    expect(registered.rows).toEqual([
      { project: 'ui-e2e', target: 'test:e2e:a', projectFile: 'apps/ui-e2e/project.json' },
    ]);
    expect(registered.problems).toEqual([
      'ui-e2e:test:e2e:b is in both test:e2e:shadow and test:e2e:queue',
      'ui-e2e:test:e2e:shadow depends on "test:e2e:missing", which is not a target of ui-e2e',
      'ui-e2e:test:e2e:shadow depends on 7, which is not a target of ui-e2e',
    ]);
  });

  it("should read the workspace's shadow rows: the ui-e2e journey families and service worker suite (DC-25), and the DC-27 rows", async () => {
    const { readShadowRegistry } = await import('#ci-shadow-rows.js');
    const workspace = await readShadowRegistry(resolve(import.meta.dirname, '../..'));
    // No entry is refused, so none is also a gating suite (ruling 7: a suite is in one list or the other).
    expect(workspace.problems).toEqual([]);
    const keys = workspace.rows.map((row) => shadowRowKey(row));
    expect(keys).toContain('ui-e2e:test:e2e:service-worker');
    expect(keys.filter((key) => key.startsWith('ui-e2e:test:e2e:journey-')).length).toBeGreaterThanOrEqual(15);
    expect(keys).toContain('ui-e2e:test:e2e:browser-host-chat');
    expect(keys.filter((key) => key.startsWith('desktop-e2e:'))).toEqual([
      'desktop-e2e:test:e2e:chat',
      'desktop-e2e:test:e2e:onboarding',
      'desktop-e2e:test:e2e:project',
    ]);
    expect(new Set(workspace.rows.map((row) => row.projectFile))).toEqual(
      new Set(['apps/desktop-e2e/project.json', 'apps/ui-e2e/project.json']),
    );
  });
});

describe('the promotion pull request', () => {
  const project = `{
  "name": "ui-e2e",
  "targets": {
    "test:e2e:queue": {
      "executor": "nx:noop",
      "dependsOn": ["test:e2e:adaptive", "test:e2e:deploy-skew"],
      "metadata": {
        "description": "The gate."
      }
    },
    "test:e2e:shadow": {
      "executor": "nx:noop",
      "dependsOn": ["test:e2e:journey-a", "test:e2e:journey-c"],
      "metadata": {
        "description": "On probation."
      }
    }
  }
}
`;

  it('should move only the suite from test:e2e:shadow to test:e2e:queue, keeping the layout', () => {
    expect(promoteProjectJson(project, 'test:e2e:journey-a')).toBe(
      project
        .replace(
          '["test:e2e:adaptive", "test:e2e:deploy-skew"]',
          '["test:e2e:adaptive", "test:e2e:deploy-skew", "test:e2e:journey-a"]',
        )
        .replace('["test:e2e:journey-a", "test:e2e:journey-c"]', '["test:e2e:journey-c"]'),
    );
  });

  it('should break a list that no longer fits in 120 columns one entry a line, as oxfmt does', () => {
    const long = project.replace(
      '["test:e2e:adaptive", "test:e2e:deploy-skew"]',
      '["test:e2e:adaptive", "test:e2e:daemon-host", "test:e2e:deploy-skew", "test:e2e:development"]',
    );
    expect(promoteProjectJson(long, 'test:e2e:journey-a')).toContain(`      "dependsOn": [
        "test:e2e:adaptive",
        "test:e2e:daemon-host",
        "test:e2e:deploy-skew",
        "test:e2e:development",
        "test:e2e:journey-a"
      ],`);
  });

  it('should create test:e2e:queue when the project has none, and leave an empty shadow list', () => {
    const withoutQueue = `{
  "name": "react-e2e",
  "targets": {
    "test:e2e:shadow": {
      "executor": "nx:noop",
      "dependsOn": ["test:e2e:journey-b"]
    }
  }
}
`;
    const edited = promoteProjectJson(withoutQueue, 'test:e2e:journey-b');
    const parsed = JSON.parse(edited) as { targets: Record<string, { executor?: string; dependsOn?: string[] }> };
    expect(parsed.targets[queueTarget]).toMatchObject({ executor: 'nx:noop', dependsOn: ['test:e2e:journey-b'] });
    expect(parsed.targets[shadowTarget]?.dependsOn).toEqual([]);
    expect(edited.indexOf(`"${queueTarget}"`)).toBeLessThan(edited.indexOf(`"${shadowTarget}"`));
    expect(edited).toContain(
      `  "targets": {\n    "test:e2e:queue": {\n      "executor": "nx:noop",\n      "dependsOn": ["test:e2e:journey-b"],`,
    );
  });

  it('should refuse a suite that is not a shadow row', () => {
    expect(() => promoteProjectJson(project, 'test:e2e:adaptive')).toThrow(
      'test:e2e:adaptive is not in test:e2e:shadow',
    );
  });

  it('should propose a row only at the bar, with the runs it counted', () => {
    const state = ingestFixture();
    const ready = readyRows(registry, state.shadowRows);
    expect(ready.map(({ row }) => row)).toEqual([journeyA]);
    const [first] = ready;
    if (!first) {
      throw new Error('no row is ready');
    }
    expect(promotionBranch(first.row)).toBe('flake-ledger/promote-ui-e2e-test-e2e-journey-a');
    expect(promotionTitle(first.row)).toBe('test(ui-e2e): Gate test:e2e:journey-a in the merge queue');
    expect(promotionTitle({ project: 'ui-e2e', target: `test:e2e:${'x'.repeat(40)}` }).length).toBeLessThanOrEqual(72);
    const body = promotionBody(first.row, first.state, { repository: 'taucad/tau' });
    expect(body).toContain('passed 109 consecutive runs, the Q1 bar of 100');
    expect(body).toContain('is not merged automatically');
    expect(body).toContain('The 109 runs counted');
    expect(body).toContain('| [2062](https://github.com/taucad/tau/actions/runs/2062/attempts/2) | 2 |');
    expect(body).not.toContain('| [2062](https://github.com/taucad/tau/actions/runs/2062/attempts/1)');
    expect(body.match(/^\| \[\d+\]/gmu)).toHaveLength(109);
    // The workflow token's pull request starts no CI, so the reviewer reruns it; the flake bot's starts CI itself.
    expect(body).toContain('close and reopen it to run CI');
    const appBody = promotionBody(first.row, first.state, { repository: 'taucad/tau', startsCi: true });
    expect(appBody).toContain('is not merged automatically');
    expect(appBody).toContain('CI runs on it: review it, then enable auto-merge.');
    expect(appBody).not.toContain('close and reopen');
    expect(readyRows(registry, ingestFixture(2160).shadowRows)).toEqual([]);
  });
});

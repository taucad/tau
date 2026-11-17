/* eslint-disable @typescript-eslint/naming-convention -- Runs and jobs are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  entriesOf,
  expiredLedgerEntries,
  expiredMarkers,
  ledgerProblems,
  lineageOf,
  needsAction,
  pairFailures,
  parseJobLog,
  renderFlakeMarkdown,
  repeatOffenders,
  sameDiff,
  scanExpectedFailureMarkers,
  testFile,
  touchesFailingTest,
  overlongMarkers,
  unlabelledMarkers,
} from '#ci-flake-ledger.js';
import type { FlakeEntry, FlakeReport, Ledger } from '#ci-flake-ledger.js';
import type { RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

const base = (n: number): string => n.toString(16).padStart(40, '0');

const queueRun = ({
  id,
  pr,
  baseSha,
  headSha,
  conclusion,
  at,
}: {
  id: number;
  pr: number;
  baseSha: string;
  headSha: string;
  conclusion: string;
  at: string;
}): WorkflowRun => ({
  id,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-${pr}-${baseSha}`,
  head_sha: headSha,
  status: 'completed',
  conclusion,
  created_at: at,
  updated_at: at,
  html_url: `https://github.com/taucad/tau/actions/runs/${id}`,
});

const job = (id: number, name: string, conclusion: string): WorkflowJob => ({
  id,
  name,
  status: 'completed',
  conclusion,
  created_at: '2026-11-10T10:00:00Z',
  started_at: '2026-11-10T10:01:00Z',
  completed_at: '2026-11-10T10:10:00Z',
  html_url: `https://github.com/taucad/tau/actions/runs/1/job/${id}`,
});

const gate = (conclusion: string): WorkflowJob => job(9, 'Run affected tasks', conclusion);

describe('lineageOf', () => {
  it('should read the PR and base of a merge group and the branch of a push', () => {
    expect(
      lineageOf(
        queueRun({
          id: 1,
          pr: 2386,
          baseSha: base(7),
          headSha: base(8),
          conclusion: 'failure',
          at: '2026-11-10T10:00:00Z',
        }),
      ),
    ).toEqual({
      kind: 'queue',
      key: 'pr-2386',
      pr: 2386,
      base: base(7),
    });
    expect(
      lineageOf({
        ...queueRun({ id: 1, pr: 1, baseSha: base(1), headSha: base(2), conclusion: 'failure', at: 'x' }),
        event: 'push',
        head_branch: 'main',
      }),
    ).toEqual({ kind: 'push', key: 'push:main' });
    expect(
      lineageOf({
        ...queueRun({ id: 1, pr: 1, baseSha: base(1), headSha: base(2), conclusion: 'failure', at: 'x' }),
        event: 'pull_request',
      }),
    ).toBeUndefined();
  });
});

describe('pairFailures', () => {
  it('should pair a failed lane job with the next run of the same PR that passed it', () => {
    const evidence: RunEvidence[] = [
      {
        run: queueRun({
          id: 1,
          pr: 10,
          baseSha: base(100),
          headSha: base(101),
          conclusion: 'failure',
          at: '2026-11-10T10:00:00Z',
        }),
        jobs: [job(11, 'Affected (test-3)', 'failure'), gate('failure')],
      },
      {
        run: queueRun({
          id: 2,
          pr: 10,
          baseSha: base(200),
          headSha: base(201),
          conclusion: 'success',
          at: '2026-11-10T12:00:00Z',
        }),
        jobs: [job(21, 'Affected (test-3)', 'success'), gate('success')],
      },
    ];
    const { pairs, inherited, unresolved } = pairFailures(evidence);
    expect(pairs.map((pair) => [pair.job, pair.failed.run.id, pair.passed.run.id])).toEqual([
      ['Affected (test-3)', 1, 2],
    ]);
    expect(inherited).toBe(0);
    expect(unresolved).toBe(0);
  });

  it('should not pair a failure inherited from the group it was built on', () => {
    const evidence: RunEvidence[] = [
      {
        run: queueRun({
          id: 1,
          pr: 10,
          baseSha: base(100),
          headSha: base(101),
          conclusion: 'failure',
          at: '2026-11-10T10:00:00Z',
        }),
        jobs: [job(11, 'API tests', 'failure')],
      },
      {
        run: queueRun({
          id: 2,
          pr: 11,
          baseSha: base(101),
          headSha: base(102),
          conclusion: 'failure',
          at: '2026-11-10T10:01:00Z',
        }),
        jobs: [job(12, 'API tests', 'failure')],
      },
      {
        run: queueRun({
          id: 3,
          pr: 11,
          baseSha: base(300),
          headSha: base(301),
          conclusion: 'success',
          at: '2026-11-10T11:00:00Z',
        }),
        jobs: [job(13, 'API tests', 'success')],
      },
    ];
    const { pairs, inherited, unresolved } = pairFailures(evidence);
    expect(pairs).toEqual([]);
    expect(inherited).toBe(1);
    expect(unresolved).toBe(1);
  });

  it('should leave a failure unresolved when the next run of the job fails again', () => {
    const evidence: RunEvidence[] = [
      {
        run: queueRun({
          id: 1,
          pr: 10,
          baseSha: base(1),
          headSha: base(2),
          conclusion: 'failure',
          at: '2026-11-10T10:00:00Z',
        }),
        jobs: [job(11, 'Lint', 'failure')],
      },
      {
        run: queueRun({
          id: 2,
          pr: 10,
          baseSha: base(3),
          headSha: base(4),
          conclusion: 'failure',
          at: '2026-11-10T11:00:00Z',
        }),
        jobs: [job(21, 'Lint', 'failure')],
      },
      {
        run: queueRun({
          id: 3,
          pr: 10,
          baseSha: base(5),
          headSha: base(6),
          conclusion: 'success',
          at: '2026-11-10T12:00:00Z',
        }),
        jobs: [job(31, 'Lint', 'success')],
      },
    ];
    const { pairs, unresolved } = pairFailures(evidence);
    expect(pairs.map((pair) => pair.failed.run.id)).toEqual([2]);
    expect(unresolved).toBe(1);
  });
});

describe('sameDiff and touchesFailingTest', () => {
  it('should compare file names and blob ids, in any order', () => {
    expect(
      sameDiff(
        [
          { filename: 'a', sha: '1' },
          { filename: 'b', sha: '2' },
        ],
        [
          { filename: 'b', sha: '2' },
          { filename: 'a', sha: '1' },
        ],
      ),
    ).toBe(true);
    expect(sameDiff([{ filename: 'a', sha: '1' }], [{ filename: 'a', sha: '9' }])).toBe(false);
  });

  it('should match a project-relative test file against the repository path that changed', () => {
    const tests = ['files-ui:test › src/components/files/export-format-grid.test.tsx > ExportFormatGrid > clicks'];
    expect(testFile(tests[0] ?? '')).toBe('src/components/files/export-format-grid.test.tsx');
    expect(
      touchesFailingTest([{ filename: 'apps/libs/files-ui/src/components/files/export-format-grid.test.tsx' }], tests),
    ).toBe(true);
    expect(touchesFailingTest([{ filename: 'apps/libs/files-ui/src/other.ts' }], tests)).toBe(false);
  });
});

describe('parseJobLog', () => {
  it('should read failed tasks and the failing tests under the task that printed them', () => {
    const log = [
      '2026-11-15T23:34:49.0937363Z ##[group]🔁 > nx run utils:build  [remote cache]',
      '2026-11-15T23:34:49.0937363Z ##[endgroup]',
      '2026-11-15T23:47:00.0000000Z ##[group]> nx run files-ui:test',
      '2026-11-15T23:47:43.2742901Z  \u001B[31m×\u001B[39m src/a.test.tsx > A > clicks 91ms',
      '2026-11-15T23:47:43.2757797Z \u001B[41m\u001B[1m FAIL \u001B[22m\u001B[49m src/a.test.tsx\u001B[2m > \u001B[22mA\u001B[2m > \u001B[22mclicks',
      '2026-11-15T23:47:43.2757797Z ##[endgroup]',
      '2026-11-15T23:49:42.6169487Z \u001B[2mFailed tasks:\u001B[22m',
      '2026-11-15T23:49:42.6169642Z ',
      '2026-11-15T23:49:42.6169789Z - files-ui:test',
      '2026-11-15T23:49:42.6169947Z ',
      '2026-11-15T23:49:42.6229206Z nx-guard: remote cache: waiting',
      '2026-11-15T23:49:43.0930821Z \u001B[41m\u001B[1m FAIL \u001B[22m\u001B[49m src/a.test.tsx\u001B[2m > \u001B[22mA\u001B[2m > \u001B[22mclicks',
    ].join('\n');
    expect(parseJobLog(log)).toEqual({
      tasks: ['files-ui:test'],
      tests: ['files-ui:test › src/a.test.tsx > A > clicks'],
    });
  });
});

const flake = (key: string, failedRun: number, at: string): FlakeEntry => ({
  key,
  job: 'API tests',
  lineage: 'pr-1',
  at,
  failedRun,
  failedJobUrl: `https://github.com/taucad/tau/actions/runs/${failedRun}`,
  passedRun: failedRun + 1,
});

describe('repeatOffenders', () => {
  const now = new Date('2026-11-17T07:23:00Z');

  it('should flag a key with two flakes inside 14 days and match it to its ledger entry', () => {
    const entries = [
      flake('api:test › src/a.test.ts > grant', 1, '2026-11-05T10:00:00Z'),
      flake('api:test › src/a.test.ts > grant', 2, '2026-11-12T10:00:00Z'),
      flake('task ui:test', 3, '2026-11-12T10:00:00Z'),
    ];
    expect(repeatOffenders(entries, { entries: [] }, now).map((offender) => [offender.key, offender.status])).toEqual([
      ['api:test › src/a.test.ts > grant', 'unowned'],
    ]);
    const ledger: Ledger = {
      entries: [
        {
          key: 'api:test › src/a.test.ts > grant',
          owner: 'rifont',
          recorded: '2026-11-12',
          expiryDay: '2026-11-16',
          note: 'runs 1, 2',
        },
      ],
    };
    expect(repeatOffenders(entries, ledger, now)[0]?.status).toBe('expired');
    expect(
      repeatOffenders(entries, { entries: [{ ...ledger.entries[0]!, expiryDay: '2026-11-26' }] }, now)[0]?.status,
    ).toBe('owned');
  });

  it('should not flag two flakes more than 14 days apart', () => {
    const entries = [flake('k', 1, '2026-10-01T10:00:00Z'), flake('k', 2, '2026-10-20T10:00:00Z')];
    expect(repeatOffenders(entries, { entries: [] }, now)).toEqual([]);
  });
});

describe('ledger', () => {
  it('should accept the checked-in ledger', () => {
    const ledger = JSON.parse(readFileSync(resolve(import.meta.dirname, 'flake-ledger.json'), 'utf8')) as Ledger;
    expect(ledgerProblems(ledger)).toEqual([]);
  });

  it('should reject a bad owner, a duplicate and an expiry over 28 days', () => {
    const entry = { key: 'k', owner: 'rifont', recorded: '2026-11-01', expiryDay: '2026-11-10', note: 'n' };
    expect(
      ledgerProblems({
        entries: [
          entry,
          entry,
          { ...entry, key: 'j', owner: '@rifont' },
          { ...entry, key: 'l', expiryDay: '2026-12-30' },
        ],
      }),
    ).toEqual([
      'flake-ledger.json "k": listed twice',
      'flake-ledger.json "j": owner must be a GitHub login without @, got "@rifont"',
      'flake-ledger.json "l": expiryDay must be 0 to 28 days after recorded',
    ]);
    expect(expiredLedgerEntries({ entries: [entry] }, new Date('2026-11-11T00:00:00Z'))).toEqual([entry]);
    expect(expiredLedgerEntries({ entries: [entry] }, new Date('2026-11-10T23:00:00Z'))).toEqual([]);
  });
});

describe('scanExpectedFailureMarkers', () => {
  /* Built from parts so this file holds no marker of its own. */
  const fails = ['', 'fails('].join('.');
  const text = [
    '/** Rows stay `it.fails` until fixed. */',
    '// Expected-failure: @rifont until 2026-12-01',
    `it${fails}'I10: holds', () => {});`,
    `test${fails}'unlabelled', () => {});`,
    '// Expected-failure: intended, proves the guard fails a test',
    `it${fails}'guard', () => {});`,
    'knownDefect("F6", {',
    '  // Expected-failure: @rifont until 2026-11-01',
    `  expectedFailure: ${String(true)},`,
    '  expectedFailure: false,',
    '});',
  ].join('\n');
  const markers = scanExpectedFailureMarkers([{ path: 'a.test.ts', text }]);

  it('should find each marker with the owner and expiry above it, and skip prose', () => {
    expect(markers).toEqual([
      { path: 'a.test.ts', line: 3, owner: 'rifont', until: '2026-12-01' },
      { path: 'a.test.ts', line: 4 },
      { path: 'a.test.ts', line: 6, intended: true },
      { path: 'a.test.ts', line: 9, owner: 'rifont', until: '2026-11-01' },
    ]);
    expect(unlabelledMarkers(markers).map((marker) => marker.line)).toEqual([4]);
    expect(expiredMarkers(markers, new Date('2026-11-17T00:00:00Z')).map((marker) => marker.line)).toEqual([9]);
  });
});

describe('overlongMarkers', () => {
  it('should count whole days, so a marker 28 days ahead stands at any hour of today', () => {
    const marker = { path: 'a.test.ts', line: 1, owner: 'rifont', until: '2026-12-15' };
    expect(overlongMarkers([marker], new Date('2026-11-17T00:00:01Z'))).toEqual([]);
    expect(overlongMarkers([marker], new Date('2026-11-16T23:59:59Z'))).toEqual([marker]);
  });

  it('should find a fails() chained after another modifier', () => {
    const fails = ['', 'fails('].join('.');
    const text = `it.runIf(ready)${fails}'row', () => {});`;
    expect(scanExpectedFailureMarkers([{ path: 'b.test.ts', text }])).toEqual([{ path: 'b.test.ts', line: 1 }]);
  });
});

describe('the flake report', () => {
  it('should need action for an unowned offender and propose a ledger entry for it', () => {
    const entries = [flake('k', 1, '2026-11-10T10:00:00Z'), flake('k', 2, '2026-11-11T10:00:00Z')];
    const now = new Date('2026-11-17T07:23:00Z');
    const report: FlakeReport = {
      window: { from: '2026-11-03T07:23:00Z', to: '2026-11-17T07:23:00Z' },
      flakes: entries,
      fixedBetween: 1,
      unconfirmed: 0,
      inherited: 2,
      unresolved: 3,
      offenders: repeatOffenders(entries, { entries: [] }, now),
      expiredLedger: [],
      expiredMarkers: [],
    };
    expect(needsAction(report)).toBe(true);
    const markdown = renderFlakeMarkdown(report, now);
    expect(markdown).toContain('2 flaky failures (2 ledger entries)');
    expect(markdown).toContain('"expiryDay": "2026-12-01"');
    expect(needsAction({ ...report, offenders: [] })).toBe(false);
  });

  it('should key entries by test, else task, else job', () => {
    const run = queueRun({
      id: 1,
      pr: 10,
      baseSha: base(1),
      headSha: base(2),
      conclusion: 'failure',
      at: '2026-11-10T10:00:00Z',
    });
    const pair = {
      lineage: lineageOf(run)!,
      job: 'Affected (test-3)',
      failed: { run, job: job(11, 'Affected (test-3)', 'failure') },
      passed: { run: { ...run, id: 2 }, job: job(21, 'Affected (test-3)', 'success') },
    };
    expect(
      entriesOf(pair, { tasks: ['ui:test'], tests: ['ui:test › src/a.test.ts > b'] }).map((entry) => entry.key),
    ).toEqual(['ui:test › src/a.test.ts > b']);
    expect(entriesOf(pair, { tasks: ['ui:test'], tests: [] }).map((entry) => entry.key)).toEqual(['task ui:test']);
    expect(entriesOf(pair, { tasks: [], tests: [] }).map((entry) => entry.key)).toEqual(['job Affected (test-3)']);
  });
});

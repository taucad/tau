/* eslint-disable @typescript-eslint/naming-convention -- Runs and jobs are GitHub REST JSON. */
import { describe, expect, it } from 'vitest';

import { emptyState } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, LedgerState, ReleaseTrack } from '#ci-flake-ledger-state.js';
import {
  debtStats,
  flakeFailureRuns,
  hoursToQuarantine,
  landingStats,
  metricRows,
  originBreakdown,
  previousWeek,
  queuePullNumber,
  releaseStats,
  renderMetricsMarkdown,
  retryStats,
  uiAffected,
} from '#ci-flake-metrics.js';
import type { Landing, OwnerIssue } from '#ci-flake-metrics.js';
import { operatorLabel, removalMarker, returnMarker } from '#ci-flake-quarantine-release.js';
import type { Annotation, RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

const window = { from: '2026-11-19T00:00:00Z', to: '2026-11-26T00:00:00Z' };
const today = '2026-11-26';
const sha = (n: number): string => String(n).padStart(40, '0');

const run = (id: number, overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id,
  head_sha: sha(id),
  head_branch: `gh-readonly-queue/main/pr-${id + 1000}-${sha(1)}`,
  event: 'merge_group',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-20T10:00:00Z',
  updated_at: '2026-11-20T10:30:00Z',
  html_url: `https://github.com/taucad/tau/actions/runs/${id}`,
  ...overrides,
});

let jobId = 0;
const job = (name: string, conclusion: string, minutes = 10): WorkflowJob => {
  jobId += 1;
  return {
    id: jobId,
    name,
    status: 'completed',
    conclusion,
    created_at: '2026-11-20T10:00:00Z',
    started_at: '2026-11-20T10:01:00Z',
    completed_at: new Date(Date.parse('2026-11-20T10:01:00Z') + minutes * 60_000).toISOString(),
  };
};

const uiRow = 'Browser end-to-end (ui-e2e test:e2e:daemon-host)';

/** A merge-group run: green, or failed in `failed` with every other lane cancelled behind it. */
const evidence = (
  id: number,
  options: {
    ui: boolean;
    failed?: string;
    annotations?: Annotation[];
    conclusion?: string;
  },
): RunEvidence => {
  const jobs = [
    job('Plan affected lanes', 'success'),
    job(uiRow, options.ui ? (options.failed === uiRow ? 'failure' : 'success') : 'skipped'),
    job('Affected (lint)', options.failed === 'Affected (lint)' ? 'failure' : 'success'),
  ];
  return {
    run: run(id, {
      conclusion: options.conclusion ?? (options.failed ? 'cancelled' : 'success'),
    }),
    jobs,
    ...(options.annotations ? { annotations: options.annotations } : {}),
  };
};

const event = (overrides: Partial<FlakeEvent>): FlakeEvent => ({
  kind: 'same-hash',
  at: '2026-11-20T12:00:00Z',
  run: 9000,
  attempt: 1,
  failedRun: 9000,
  failedAttempt: 1,
  variant: 'linux-x64',
  execution: 1,
  ...overrides,
});

const identity = (events: FlakeEvent[], overrides: Partial<IdentityState> = {}): IdentityState => ({
  project: 'ui-e2e',
  targetKey: 'test:e2e:daemon-host',
  file: 'src/daemon-host.test.ts',
  firstSeen: '2026-11-01T00:00:00Z',
  lastSeen: '2026-11-25T00:00:00Z',
  lastFailure: '2026-11-20T00:00:00Z',
  executions: 200,
  failures: events.length,
  retriedPasses: 0,
  passStreak: 0,
  variants: {},
  events,
  openFailures: [],
  passHashes: [],
  failureShas: [],
  aliases: [],
  ...overrides,
});

const state = (identities: Record<string, IdentityState>, extra: Partial<LedgerState> = {}): LedgerState => ({
  ...emptyState(new Date('2026-11-25T00:00:00Z')),
  identities,
  ...extra,
});

describe('flake quarantine metrics (FQ-11, D9)', () => {
  describe('origin failures of ui-affected entries', () => {
    it('should call a run ui-affected only when its first attempt dispatched a ui-e2e browser row', () => {
      expect(uiAffected(evidence(1, { ui: true }))).toBe(true);
      expect(uiAffected(evidence(2, { ui: false }))).toBe(false);
      expect(uiAffected({ run: run(3) })).toBe(false);
    });

    it('should split origin failures into flake, infrastructure, deterministic and unattributed', () => {
      const infrastructure: Annotation = {
        path: '.github',
        annotation_level: 'failure',
        title: 'infra-retry',
        message: 'apt-install failed after 3 attempts: connection-failed',
      };
      const runs = [
        evidence(1, { ui: true }),
        evidence(2, { ui: true }),
        evidence(3, { ui: true, failed: uiRow }),
        evidence(4, {
          ui: true,
          failed: 'Affected (lint)',
          annotations: [infrastructure],
        }),
        evidence(5, { ui: true, failed: 'Affected (lint)' }),
        // A workflow-level failure: no failed job.
        evidence(6, { ui: true, conclusion: 'failure' }),
        // Not ui-affected: left out.
        evidence(7, { ui: false, failed: 'Affected (lint)' }),
        // Jobs not fetched: left out.
        { run: run(8, { conclusion: 'failure' }) },
      ];
      const flakes = flakeFailureRuns(
        state({
          'ui-e2e › a': identity([event({ failedRun: 3 }), event({ kind: 'retry', failedRun: 5 })]),
          'ui-e2e › b': identity([event({ failedRun: 4, shadow: true })]),
        }),
      );
      expect([...flakes]).toEqual([3]);
      expect(originBreakdown(runs, flakes)).toEqual({
        runs: 6,
        origin: 4,
        flake: 1,
        infrastructure: 1,
        deterministic: 1,
        unattributed: 1,
      });
      // Without the ledger a flake cannot be told apart from a deterministic failure.
      expect(originBreakdown(runs, undefined)).toMatchObject({
        flake: 0,
        deterministic: 2,
      });
    });
  });

  describe('landings', () => {
    it('should read the pull request a merge-group run tested', () => {
      expect(queuePullNumber(run(1, { head_branch: `gh-readonly-queue/main/pr-2878-${sha(2)}` }))).toBe(2878);
      expect(queuePullNumber(run(1, { head_branch: 'main' }))).toBeUndefined();
    });

    it('should measure first enqueue to merge and runs per landing over pull requests merged in the window', () => {
      const landings: Landing[] = [
        {
          number: 1,
          firstEnqueuedAt: '2026-11-20T10:00:00Z',
          mergedAt: '2026-11-20T10:20:00Z',
        },
        {
          number: 2,
          firstEnqueuedAt: '2026-11-21T10:00:00Z',
          mergedAt: '2026-11-21T11:00:00Z',
        },
        {
          number: 3,
          firstEnqueuedAt: '2026-11-22T10:00:00Z',
          mergedAt: '2026-11-22T10:30:00Z',
        },
        // Merged without the queue: landed, but not timed.
        { number: 4, mergedAt: '2026-11-22T10:30:00Z' },
        // Outside the window.
        {
          number: 5,
          firstEnqueuedAt: '2026-11-10T10:00:00Z',
          mergedAt: '2026-11-10T10:30:00Z',
        },
      ];
      const pr = (n: number, id: number): WorkflowRun =>
        run(id, { head_branch: `gh-readonly-queue/main/pr-${n}-${sha(id)}` });
      const stats = landingStats(landings, [pr(1, 1), pr(2, 2), pr(2, 3), pr(2, 4), pr(3, 5), pr(5, 6)], window);
      expect(stats).toEqual({
        landed: 4,
        queued: 3,
        p50Minutes: 30,
        p90Minutes: 60,
        runsPerLanding: 5 / 3,
      });
    });
  });

  describe('retried passes', () => {
    it('should count retry events per 1,000 executions and the runs with one, against the week before', () => {
      const ledger = state(
        {
          'ui-e2e › a': identity([
            event({ kind: 'retry', run: 11, at: '2026-11-20T12:00:00Z' }),
            event({ kind: 'retry', run: 11, at: '2026-11-20T12:01:00Z' }),
            event({ kind: 'same-hash', run: 12, at: '2026-11-21T12:00:00Z' }),
            event({ kind: 'retry', run: 1, at: '2026-11-14T12:00:00Z' }),
          ]),
        },
        {
          ingested: [
            {
              run: 11,
              attempt: 1,
              event: 'merge_group',
              at: '2026-11-20T11:00:00Z',
              artifacts: 3,
              counted: 1500,
              replayed: 0,
              rejected: 0,
            },
            {
              run: 12,
              attempt: 1,
              event: 'merge_group',
              at: '2026-11-21T11:00:00Z',
              artifacts: 3,
              counted: 500,
              replayed: 0,
              rejected: 0,
            },
            {
              run: 1,
              attempt: 1,
              event: 'push',
              at: '2026-11-14T11:00:00Z',
              artifacts: 3,
              counted: 4000,
              replayed: 0,
              rejected: 0,
            },
          ],
        },
      );
      expect(retryStats(ledger, window)).toEqual({
        executions: 2000,
        retriedPasses: 2,
        perThousand: 1,
        runs: 2,
        runsWithRetry: 1,
      });
      expect(previousWeek(window)).toEqual({
        from: '2026-11-12T00:00:00.000Z',
        to: window.from,
      });
      expect(retryStats(ledger, previousWeek(window))).toMatchObject({
        perThousand: 0.25,
        runsWithRetry: 1,
      });
    });
  });

  describe('quarantine debt', () => {
    it('should count entries, test-days and the oldest, and name the fullest file', () => {
      const entry = (test: string, created: string): Record<string, unknown> => ({
        test,
        created,
        expires: '2026-12-31',
      });
      const files = [
        {
          path: 'apps/ui-e2e/quarantine.json',
          text: JSON.stringify({
            entries: [entry('a', '2026-11-20'), entry('b', '2026-11-06')],
          }),
        },
        {
          path: 'apps/ui/quarantine.json',
          text: JSON.stringify({ entries: [entry('c', '2026-11-26')] }),
        },
        { path: 'libs/broken/quarantine.json', text: '{ not json' },
      ];
      expect(debtStats(files, today)).toEqual({
        entries: 3,
        testDays: 26,
        oldestDays: 20,
        overFourteen: 1,
        fullest: { path: 'apps/ui-e2e/quarantine.json', entries: 2 },
      });
      expect(debtStats([], today)).toEqual({
        entries: 0,
        testDays: 0,
        oldestDays: 0,
        overFourteen: 0,
        fullest: undefined,
      });
    });
  });

  describe('time to quarantine', () => {
    const track = (id: string, since: string): ReleaseTrack => ({
      path: 'apps/ui-e2e/quarantine.json',
      id,
      since,
      executions: 0,
      failures: 0,
      streak: 0,
      streakRuns: [],
    });

    it('should time each entry from the event that met the entry rule to its first sight on main', () => {
      const ledger = state(
        {
          // An old lone event, then two inside 80 executions: the second meets the rule.
          'ui-e2e › a': identity([
            event({ execution: 10, at: '2026-10-01T00:00:00Z' }),
            event({ execution: 150, at: '2026-11-20T08:00:00Z' }),
            event({ execution: 170, at: '2026-11-20T10:00:00Z' }),
            // After the entry landed: not the onset.
            event({ execution: 190, at: '2026-11-20T13:00:00Z' }),
          ]),
          // Shadow events never meet the rule.
          'ui-e2e › b': identity([
            event({ execution: 1, shadow: true, at: '2026-11-20T08:00:00Z' }),
            event({ execution: 2, shadow: true, at: '2026-11-20T09:00:00Z' }),
          ]),
          'ui-e2e › c': identity([event({ execution: 1 }), event({ execution: 2, at: '2026-11-21T00:00:00Z' })]),
        },
        {
          quarantineTracks: {
            a: track('ui-e2e › a', '2026-11-20T11:30:00Z'),
            b: track('ui-e2e › b', '2026-11-20T11:30:00Z'),
            // Seen before the window.
            c: track('ui-e2e › c', '2026-11-10T00:00:00Z'),
            // Its identity has left the state.
            d: track('ui-e2e › gone', '2026-11-20T11:30:00Z'),
          },
        },
      );
      expect(hoursToQuarantine(ledger, window)).toEqual([1.5]);
    });
  });

  describe('releases', () => {
    const record = {
      identity: 'abc',
      path: 'apps/ui-e2e/quarantine.json',
      created: '2026-11-10',
      expires: '2026-11-24',
    };
    const released = (day: string, extra: Record<string, unknown> = {}): string =>
      removalMarker('released', { ...record, ...extra, released: day });

    it('should take MTTR, the share released without a human and returns from the last 30 days of markers', () => {
      const issues: OwnerIssue[] = [
        {
          number: 1,
          labels: ['flake', 'flake:released'],
          comments: [released('2026-11-16')],
        },
        {
          number: 2,
          labels: ['flake', 'flake:released'],
          comments: [
            released('2026-11-20', { identity: 'def' }),
            returnMarker({ identity: 'def', released: '2026-11-20' }),
          ],
        },
        {
          number: 3,
          labels: ['flake', 'flake:released', operatorLabel],
          comments: [
            released('2026-11-24', {
              identity: 'ghi',
              renewal: { by: 'rifont', on: '2026-11-20' },
            }),
          ],
        },
        {
          number: 4,
          labels: ['flake', operatorLabel],
          comments: [
            removalMarker('expiry', {
              ...record,
              identity: 'jkl',
              expires: '2026-11-25',
            }),
          ],
        },
        // Older than 30 days.
        {
          number: 5,
          labels: ['flake:released'],
          comments: [released('2026-10-01', { identity: 'old' })],
        },
        // A person's text is not a marker; the CLI passes only automation comments.
        {
          number: 6,
          labels: ['flake:released'],
          comments: ['released on 2026-11-20'],
        },
      ];
      expect(releaseStats(issues, today)).toEqual({
        releases: 3,
        expiries: 1,
        mttrDays: 10,
        withoutHuman: 2,
        returned: 1,
      });
    });
  });

  describe('the table', () => {
    it('should show every D9 row from live data when every input is given', () => {
      const rows = metricRows({
        window,
        today,
        queue: {
          evidence: [evidence(1, { ui: true }), evidence(2, { ui: true, failed: uiRow })],
          mergedNothingShare: 0.25,
        },
        landings: {
          landings: [
            {
              number: 1,
              firstEnqueuedAt: '2026-11-20T10:00:00Z',
              mergedAt: '2026-11-20T10:20:00Z',
            },
          ],
          queueRuns: [],
        },
        ledger: state({}),
        quarantines: [],
        issues: [],
        usage: { runs: 4, runnerMinutes: 120 },
      });
      expect(rows.map((row) => row.metric)).toEqual([
        'Origin failure rate, `ui`-affected entries',
        'of which flake / infrastructure / deterministic / unattributed (points)',
        'Share of queue minutes that merge nothing',
        'First enqueue → merge, p50 / p90',
        'Runs per landing',
        'Retried passes per 1,000 test executions; runs with at least one',
        'Quarantine debt: entries, test-days, oldest',
        'Time from second flake event to quarantined',
        'Time from quarantine to release (MTTR), p50',
        'Share released without a human',
        'Returns within 30 days of release',
        'Stress and agent runner-minutes per week',
      ]);
      for (const row of rows) {
        expect(row.value, row.metric).not.toContain('not measured');
      }
      expect(rows[0]?.value).toBe('50.0 % (1 of 2 runs)');
      expect(rows[1]?.value).toBe('0.0 / 0.0 / 50.0 / 0.0 (runs 0 / 0 / 1 / 0)');
      expect(rows[2]?.value).toBe('25.0 %');
      expect(rows[3]?.value).toContain('20.0 / 20.0 min');
      expect(rows[6]?.value).toBe('0 of 20, 0 test-days, oldest 0 days');
      expect(rows[11]?.value).toBe('120 (4 runs)');
      const markdown = renderMetricsMarkdown(rows, window);
      expect(markdown).toContain('## Flake quarantine metrics (D9)');
      expect(markdown.split('\n').filter((line) => line.startsWith('| '))).toHaveLength(rows.length + 2);
    });

    it('should name the weekly report for the rows the ledger job leaves to it', () => {
      const rows = metricRows({
        window,
        today,
        ledger: state({}),
        quarantines: [],
        issues: [],
      });
      const unmeasured = rows.filter((row) => row.value.startsWith('not measured here'));
      expect(unmeasured.map((row) => row.source)).toEqual([
        '`ci-queue-health`',
        'Outcome records and classes',
        '`ci-queue-health`',
        '`merged-prs` method',
        '`merged-prs` method',
        'Workflow usage',
      ]);
      expect(unmeasured[0]?.value).toContain('weekly `ci-queue-health` report');
    });

    it('should scale runner minutes to a week and keep pipes out of a cell', () => {
      const rows = metricRows({
        window: { from: '2026-11-25T00:00:00Z', to: '2026-11-26T00:00:00Z' },
        today,
        usage: { runs: 1, runnerMinutes: 10 },
      });
      expect(rows.at(-1)?.value).toBe('70 (1 run)');
      expect(
        renderMetricsMarkdown([{ metric: 'a | b', value: 'c', phase2: '', phase3: '', source: '' }], window),
      ).toContain(String.raw`| a \| b |`);
    });
  });
});

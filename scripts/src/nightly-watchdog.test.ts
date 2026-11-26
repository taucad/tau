import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  alertPayload,
  candidateRunNumber,
  judge,
  judgeCandidates,
  judgeDebt,
  judgeLedgerJob,
  ledgerJobVerdict,
  judgeNeverQuarantine,
  judgeQuarantine,
  judgeRuns,
  maxAge,
  scheduledWorkflows,
} from '#nightly-watchdog.js';
import type { CandidateRun, LedgerRun, RunJob, ScheduledRun, ScheduledWorkflow } from '#nightly-watchdog.js';
import { emptyState } from '#ci-flake-ledger-state.js';
import type { FlakeEvent, IdentityState, LedgerState } from '#ci-flake-ledger-state.js';
import type { WorkspaceProject } from '#ci-flake-quarantine-entry.js';

const now = new Date('2026-11-08T18:30:00Z');
const daily: ScheduledWorkflow = { file: 'e2e-nightly.yml', name: 'E2E nightly', crons: ['23 13 * * *'] };
const weekly: ScheduledWorkflow = { file: 'pin-freshness.yml', name: 'Pin freshness', crons: ['17 6 * * 1'] };
const run = (createdAt: string, status: string, conclusion: string | undefined): ScheduledRun => ({
  status,
  conclusion,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub REST field.
  created_at: createdAt,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub REST field.
  html_url: 'https://github.com/taucad/tau/actions/runs/1',
});

describe('nightly watchdog', () => {
  it('should allow a daily cron 36 hours and a weekly cron 8 days', () => {
    expect(maxAge(daily.crons)).toBe(36 * 60 * 60 * 1000);
    expect(maxAge(weekly.crons)).toBe(8 * 24 * 60 * 60 * 1000);
  });

  it('should pass a successful or skipped run in its window', () => {
    expect(judge(daily, run('2026-11-08T13:23:00Z', 'completed', 'success'), now).state).toBe('ok');
    expect(judge(daily, run('2026-11-08T13:23:00Z', 'completed', 'skipped'), now).state).toBe('ok');
  });

  it('should fail a red or cancelled run', () => {
    expect(judge(daily, run('2026-11-08T13:23:00Z', 'completed', 'failure'), now).state).toBe('failed');
    expect(judge(daily, run('2026-11-08T13:23:00Z', 'completed', 'cancelled'), now).state).toBe('failed');
  });

  it('should report a run still in progress as pending', () => {
    expect(judge(daily, run('2026-11-08T13:23:00Z', 'in_progress', undefined), now).state).toBe('pending');
  });

  it('should report a missing or stale scheduled run', () => {
    expect(judge(daily, undefined, now).state).toBe('missing');
    expect(judge(daily, run('2026-11-07T06:23:00Z', 'completed', 'success'), now).state).toBe('missing');
    expect(judge(weekly, run('2026-11-02T04:17:00Z', 'completed', 'success'), now).state).toBe('ok');
  });

  it('should build one alert per day that names each problem', () => {
    const payload = alertPayload(
      [judge(daily, run('2026-11-08T13:23:00Z', 'completed', 'failure'), now), judge(weekly, undefined, now)],
      now,
      'https://github.com/taucad/tau/actions/runs/9',
    );
    expect(payload.alert_uid).toBe('tau-nightly-2026-11-08');
    expect(payload.title).toBe('2 Tau nightly workflows need attention');
    expect(payload.message).toContain('E2E nightly (e2e-nightly.yml): failed, failure');
    expect(payload.message).toContain('Pin freshness (pin-freshness.yml): missing');
  });

  it('should find every scheduled workflow in the repository, including itself', async () => {
    const found = await scheduledWorkflows(resolve(import.meta.dirname, '../../.github/workflows'));
    const files = found.map((workflow) => workflow.file);
    expect(files).toEqual(expect.arrayContaining(['nightly-watchdog.yml', 'release-gate.yml']));
    // Retired nightlies (§ 5b): the release gate and the drift check replace them, so the watchdog skips them.
    expect(files).not.toContain('formal-nightly.yml');
    expect(files).not.toContain('shell-conformance.yml');
    // The e2e nightly is dispatch-only (operator ruling Q4), so it can never read as a missing scheduled run.
    expect(files).not.toContain('e2e-nightly.yml');
  });

  describe('a workflow scheduled more than once a day (release gate, C3)', () => {
    const gate: ScheduledWorkflow = {
      file: 'release-gate.yml',
      name: 'Release gate',
      crons: ['17 2 * * *', '23 10 * * *', '47 21 * * *'],
    };

    it('should watch the release gate as a daily scheduled workflow', async () => {
      const found = await scheduledWorkflows(resolve(import.meta.dirname, '../../.github/workflows'));
      expect(found.find((workflow) => workflow.file === 'release-gate.yml')).toMatchObject({
        name: 'Release gate',
        crons: gate.crons,
      });
      expect(maxAge(gate.crons)).toBe(36 * 60 * 60 * 1000);
    });

    it('should report a red run of the last 24 h even when a newer run passed or is running', () => {
      const red = judgeRuns(
        gate,
        [
          run('2026-11-08T10:23:00Z', 'completed', 'success'),
          run('2026-11-08T02:17:00Z', 'completed', 'failure'),
          run('2026-11-07T21:47:00Z', 'completed', 'success'),
        ],
        now,
      );
      expect(red.state).toBe('failed');
      expect(red.detail).toContain('failure');
      expect(
        judgeRuns(
          gate,
          [
            run('2026-11-08T10:23:00Z', 'in_progress', undefined),
            run('2026-11-08T02:17:00Z', 'completed', 'cancelled'),
          ],
          now,
        ).state,
      ).toBe('failed');
    });

    it('should judge by the newest run when nothing in the last 24 h was red', () => {
      const runs = [
        run('2026-11-08T10:23:00Z', 'completed', 'success'),
        run('2026-11-08T02:17:00Z', 'completed', 'skipped'),
        run('2026-11-07T10:23:00Z', 'completed', 'failure'),
      ];
      expect(judgeRuns(gate, runs, now).state).toBe('ok');
      expect(judgeRuns(gate, [run('2026-11-08T10:23:00Z', 'completed', 'failure')], now).state).toBe('failed');
      expect(judgeRuns(gate, [], now).state).toBe('missing');
      expect(judgeRuns(daily, [run('2026-11-08T13:23:00Z', 'in_progress', undefined)], now).state).toBe('pending');
    });
  });

  describe('drift check (WD-1b)', () => {
    // `drift-check.yml` waits for every workflow it dispatches and fails on a red one, so its own newest scheduled
    // run being green and recent covers both "it ran in the last 36 h" and "every dispatch it made is green".
    it('should watch the drift check as a daily scheduled workflow', async () => {
      const found = await scheduledWorkflows(resolve(import.meta.dirname, '../../.github/workflows'));
      const drift = found.find((workflow) => workflow.file === 'drift-check.yml');
      expect(drift).toMatchObject({ name: 'Drift check', crons: ['17 6 * * *'] });
      expect(maxAge(drift!.crons)).toBe(36 * 60 * 60 * 1000);
    });

    it('should report a missing drift run, and a drift run whose dispatch was red', () => {
      const drift: ScheduledWorkflow = { file: 'drift-check.yml', name: 'Drift check', crons: ['17 6 * * *'] };
      // Synthetic: the newest drift run is 37 h old, so the check did not run in its window.
      expect(judge(drift, run('2026-11-07T05:30:00Z', 'completed', 'success'), now).state).toBe('missing');
      expect(judge(drift, undefined, now).state).toBe('missing');
      expect(judge(drift, run('2026-11-08T06:20:00Z', 'completed', 'failure'), now).state).toBe('failed');
      expect(judge(drift, run('2026-11-08T06:20:00Z', 'completed', 'success'), now).state).toBe('ok');
    });
  });

  describe('candidate shell and packaged gates (WD-1a, WD-1c)', () => {
    const candidate = (number: number, createdAt: string): CandidateRun => ({
      id: number * 10,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub REST field.
      run_number: number,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub REST field.
      created_at: createdAt,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub REST field.
      html_url: `https://github.com/taucad/tau/actions/runs/${number * 10}`,
    });
    const job = (name: string, conclusion: string | undefined, status = 'completed'): RunJob => ({
      name,
      status,
      conclusion,
    });
    const greenShell = [
      job('Shell gate / Shell conformance on LNX-U', 'success'),
      job('Shell gate / Shell conformance on MAC-A', 'success'),
    ];
    const greenPackaged = [job('Packaged desktop gate / Packaged desktop end-to-end (darwin-arm64)', 'success')];
    const green = [...greenShell, ...greenPackaged];

    it('should read the build number from a candidate tag', () => {
      expect(candidateRunNumber('desktop-staging@0.4.1-staging.953')).toBe(953);
      expect(candidateRunNumber('desktop@0.4.1')).toBeUndefined();
    });

    it('should pass a recent candidate whose gate jobs are green', () => {
      const verdicts = judgeCandidates({
        tags: ['desktop-staging@0.4.1-staging.953'],
        runs: [candidate(953, '2026-11-08T03:17:00Z')],
        jobsOf: () => green,
        now,
      });
      expect(verdicts.map((verdict) => [verdict.workflow.name, verdict.state])).toEqual([
        ['Candidate shell gate', 'ok'],
        ['Candidate packaged gate', 'ok'],
      ]);
    });

    it('should fail a recent candidate whose gate is red, cancelled or absent', () => {
      const runs = [
        candidate(951, '2026-11-08T01:00:00Z'),
        candidate(952, '2026-11-08T02:00:00Z'),
        candidate(953, '2026-11-08T03:00:00Z'),
      ];
      const jobs: Record<number, readonly RunJob[]> = {
        9510: [job('Shell gate / Shell conformance on LNX-U', 'failure'), job('Packaged desktop gate', 'skipped')],
        9520: [job('Shell gate / Shell conformance on MAC-X', 'cancelled'), ...greenPackaged],
        9530: [job('Tag the staging desktop candidate', 'success')],
      };
      const verdicts = judgeCandidates({
        tags: [
          'desktop-staging@0.4.1-staging.951',
          'desktop-staging@0.4.1-staging.952',
          'desktop-staging@0.4.1-staging.953',
        ],
        runs,
        jobsOf: (run) => jobs[run.id] ?? [],
        now,
      });
      expect(verdicts.map((verdict) => verdict.state)).toEqual([
        'failed',
        'failed',
        'failed',
        'ok',
        'failed',
        'failed',
      ]);
      expect(verdicts[1]?.detail).toContain('packaged desktop gate not green (skipped)');
      expect(verdicts[4]?.detail).toContain('no gate jobs');
    });

    it('should fail a recent candidate whose shell gate is green but whose packaged gate is red or absent (WD-1c)', () => {
      const runs = [candidate(961, '2026-11-08T01:00:00Z'), candidate(962, '2026-11-08T02:00:00Z')];
      const jobs: Record<number, readonly RunJob[]> = {
        9610: [...greenShell, job('Packaged desktop gate / Packaged desktop end-to-end (darwin-arm64)', 'failure')],
        9620: greenShell,
      };
      const verdicts = judgeCandidates({
        tags: ['desktop-staging@0.4.1-staging.961', 'desktop-staging@0.4.1-staging.962'],
        runs,
        jobsOf: (run) => jobs[run.id] ?? [],
        now,
      });
      expect(verdicts.map((verdict) => [verdict.workflow.name, verdict.state])).toEqual([
        ['Candidate shell gate', 'ok'],
        ['Candidate packaged gate', 'failed'],
        ['Candidate shell gate', 'ok'],
        ['Candidate packaged gate', 'failed'],
      ]);
      expect(verdicts[1]?.detail).toContain('packaged desktop gate not green (failure)');
      expect(verdicts[3]?.detail).toContain('packaged desktop gate not green (no gate jobs)');
    });

    it('should flag a synthetic candidate tag that no release run cut', () => {
      const verdicts = judgeCandidates({
        tags: ['desktop-staging@0.4.1-staging.999'],
        runs: [candidate(953, '2026-11-08T03:17:00Z')],
        jobsOf: () => green,
        now,
      });
      expect(verdicts.map((verdict) => verdict.state)).toEqual(['missing']);
      expect(verdicts[0]?.detail).toContain('no release run cut it');
    });

    it('should ignore candidates older than 36 hours and tags of runs outside the listed page', () => {
      const verdicts = judgeCandidates({
        tags: ['desktop-staging@0.4.1-staging.900', 'desktop-staging@0.4.1-staging.950'],
        runs: [candidate(950, '2026-11-06T03:17:00Z'), candidate(953, '2026-11-08T03:17:00Z')],
        jobsOf: () => [],
        now,
      });
      expect(verdicts).toEqual([]);
    });
  });

  describe('flake quarantine expiry (FQ-9)', () => {
    const entry = (expiryDay: string, renewed = false): Record<string, unknown> => ({
      test: 'src/store.test.ts > store > should keep the order',
      issue: 12,
      expires: expiryDay,
      ...(renewed ? { renewal: { by: 'rifont', on: '2026-12-01' } } : {}),
    });
    const file = (entries: unknown[]): { path: string; text: string } => ({
      path: 'packages/host/quarantine.json',
      text: JSON.stringify({ entries }),
    });

    it('should page for an entry on its expiry day and every day after, and not before', () => {
      const verdicts = judgeQuarantine(
        [file([entry('2026-12-04'), entry('2026-12-01', true), entry('2026-12-05'), 'not an entry'])],
        '2026-12-04',
      );

      expect(verdicts.map((verdict) => [verdict.state, verdict.detail])).toEqual([
        [
          'failed',
          'src/store.test.ts > store > should keep the order (owner issue #12) expires today: the flake ledger removes the entry and the test gates again; the operator may renew it once, to 28 days',
        ],
        [
          'failed',
          'src/store.test.ts > store > should keep the order (owner issue #12) expired on 2026-12-01: the flake ledger removes the entry and the test gates again',
        ],
      ]);
      expect(verdicts[0]).toMatchObject({
        workflow: { file: 'packages/host/quarantine.json', name: 'Flake quarantine expiry' },
        url: 'https://github.com/taucad/tau/issues/12',
      });
    });

    it('should read nothing from a malformed quarantine.json', () => {
      expect(judgeQuarantine([{ path: 'a/quarantine.json', text: 'not json' }], '2026-12-04')).toEqual([]);
    });
  });

  describe('flake ledger job (FQ-11)', () => {
    const ledgerRun = (createdAt: string, conclusion: string, event = 'workflow_run'): LedgerRun => ({
      ...run(createdAt, 'completed', conclusion),
      event,
    });

    it('should pass when no ledger run of the last 24 h failed', () => {
      expect(judgeLedgerJob([], now)).toMatchObject({ state: 'ok', workflow: { file: 'flake-ledger.yml' } });
      // Older than 24 h, a scheduled run (the scheduled-workflow row reports it) and a replaced run.
      expect(
        judgeLedgerJob(
          [
            ledgerRun('2026-11-07T10:00:00Z', 'failure'),
            ledgerRun('2026-11-08T04:41:00Z', 'failure', 'schedule'),
            ledgerRun('2026-11-08T12:00:00Z', 'cancelled'),
          ],
          now,
        ).state,
      ).toBe('ok');
    });

    it('should fail on a red or timed-out ledger run of the last 24 h, linking the newest', () => {
      const verdict = judgeLedgerJob(
        [ledgerRun('2026-11-08T09:00:00Z', 'failure'), ledgerRun('2026-11-08T12:00:00Z', 'timed_out')],
        now,
      );
      expect(verdict.state).toBe('failed');
      expect(verdict.detail).toMatch(/^2 red ledger runs in the last 24 h \(newest timed_out\)/u);
      expect(verdict.url).toBe('https://github.com/taucad/tau/actions/runs/1');
      expect(judgeLedgerJob([ledgerRun('2026-11-08T12:00:00Z', 'startup_failure')], now).state).toBe('failed');
    });

    it('should report a ledger run listing it cannot read as a failed row, not stop the report', async () => {
      const failed = await ledgerJobVerdict(async () => {
        throw new Error('GitHub API 503');
      }, now);
      expect(failed).toMatchObject({
        workflow: { file: 'flake-ledger.yml' },
        state: 'failed',
        detail: "the ledger job's runs could not be read: GitHub API 503",
      });
      const read = await ledgerJobVerdict(async () => [ledgerRun('2026-11-08T12:00:00Z', 'success')], now);
      expect(read.state).toBe('ok');
    });
  });

  describe('flake quarantine debt (FQ-11)', () => {
    const file = (path: string, count: number): { path: string; text: string } => ({
      path,
      text: JSON.stringify({ entries: Array.from({ length: count }, (_, index) => ({ test: `t${index}` })) }),
    });

    it('should pass below both caps and name the fullest file', () => {
      const verdict = judgeDebt([file('apps/ui/quarantine.json', 3), file('apps/ui-e2e/quarantine.json', 7)]);
      expect(verdict).toMatchObject({
        state: 'ok',
        detail: '10 of 20 entries in the workspace; fullest apps/ui-e2e/quarantine.json 7 of 8',
      });
      expect(judgeDebt([]).detail).toBe('0 of 20 entries in the workspace');
    });

    it('should page when a project or the workspace is at its cap', () => {
      const project = judgeDebt([file('apps/ui-e2e/quarantine.json', 8)]);
      expect(project.state).toBe('failed');
      expect(project.detail).toContain('; apps/ui-e2e/quarantine.json 8 of 8: a new qualifying flake is refused');
      const workspace = judgeDebt([0, 1, 2, 3].map((index) => file(`libs/p${index}/quarantine.json`, 5)));
      expect(workspace.state).toBe('failed');
      expect(workspace.detail).toMatch(/^the quarantine debt is full: 20 of 20 entries in the workspace: /u);
      expect(judgeDebt([{ path: 'a/quarantine.json', text: 'not json' }]).state).toBe('ok');
    });
  });

  describe('never-quarantine flake (FQ-11)', () => {
    const projects = new Map<string, WorkspaceProject>([
      ['api', { name: 'api', root: 'apps/api', tags: [] }],
      ['ui', { name: 'ui', root: 'apps/ui', tags: [] }],
    ]);
    const event = (at: string, shadow = false): FlakeEvent => ({
      kind: 'same-hash',
      at,
      run: 2,
      attempt: 1,
      failedRun: 1,
      failedAttempt: 1,
      variant: 'linux-x64',
      execution: 1,
      ...(shadow ? { shadow: true } : {}),
    });
    const identity = (project: string, file: string, events: FlakeEvent[]): IdentityState => ({
      project,
      targetKey: 'test',
      file,
      firstSeen: '2026-11-01T00:00:00Z',
      lastSeen: '2026-11-08T00:00:00Z',
      lastFailure: '2026-11-08T00:00:00Z',
      executions: 10,
      failures: 1,
      retriedPasses: 0,
      passStreak: 0,
      variants: {},
      events,
      openFailures: [],
      passHashes: [],
      failureShas: [],
      aliases: [],
    });
    const state = (identities: Record<string, IdentityState>): LedgerState => ({ ...emptyState(now), identities });

    it('should page on a gating flake event of the last 24 h of a never-quarantine test', () => {
      const verdicts = judgeNeverQuarantine(
        state({
          'api › src/billing/charge.test.ts > charge > should charge once': identity(
            'api',
            'src/billing/charge.test.ts',
            [event('2026-11-08T10:00:00Z')],
          ),
          // Quarantinable: the entry rule handles it.
          'ui › src/viewer.test.ts > viewer > should render': identity('ui', 'src/viewer.test.ts', [
            event('2026-11-08T10:00:00Z'),
          ]),
          // Older than 24 h, a shadow row's event, a project the checkout lacks.
          'api › src/auth/old.test.ts > a': identity('api', 'src/auth/old.test.ts', [event('2026-11-07T10:00:00Z')]),
          'api › src/auth/shadow.test.ts > a': identity('api', 'src/auth/shadow.test.ts', [
            event('2026-11-08T10:00:00Z', true),
          ]),
          'gone › src/auth/x.test.ts > a': identity('gone', 'src/auth/x.test.ts', [event('2026-11-08T10:00:00Z')]),
        }),
        projects,
        now,
      );
      expect(verdicts).toEqual([
        {
          workflow: { file: 'flake-ledger', name: 'Never-quarantine flake', crons: [] },
          state: 'failed',
          detail:
            'api › src/billing/charge.test.ts > charge > should charge once (money (billing)): 1 flake event in the last 24 h, failing run 1: it keeps gating; the agent owes a class within 24 hours',
        },
      ]);
    });

    it('should report a healthy row with no such event or no ledger state', () => {
      expect(judgeNeverQuarantine(state({}), projects, now)).toMatchObject([{ state: 'ok' }]);
      expect(judgeNeverQuarantine(undefined, projects, now)).toMatchObject([
        { state: 'ok', detail: 'no ledger state yet' },
      ]);
    });
  });
});

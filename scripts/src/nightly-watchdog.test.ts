import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  alertPayload,
  candidateRunNumber,
  judge,
  judgeCandidates,
  maxAge,
  scheduledWorkflows,
} from '#nightly-watchdog.js';
import type { CandidateRun, RunJob, ScheduledRun, ScheduledWorkflow } from '#nightly-watchdog.js';

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
    expect(files).toEqual(expect.arrayContaining(['e2e-nightly.yml', 'formal-nightly.yml', 'nightly-watchdog.yml']));
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
});

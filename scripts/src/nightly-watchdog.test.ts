import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { alertPayload, judge, maxAge, scheduledWorkflows } from '#nightly-watchdog.js';
import type { ScheduledRun, ScheduledWorkflow } from '#nightly-watchdog.js';

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
});

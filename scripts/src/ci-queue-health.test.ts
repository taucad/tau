/* eslint-disable @typescript-eslint/naming-convention -- Runs, jobs and annotations are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  attributeFailures,
  buildReport,
  cancelledWaste,
  classifyRuns,
  classTotals,
  countConclusions,
  criticalPath,
  failedJobs,
  countInfraRetries,
  failedSuites,
  infraRetryEvents,
  fetchOrder,
  firstFailedJob,
  jobWaits,
  landedFromCompare,
  latestAttempt,
  quantile,
  queueBase,
  renderMarkdown,
  reportWindow,
  runFailed,
  runWaits,
  secondsBetween,
  splitWindow,
} from '#ci-queue-health.js';
import type { Annotation, RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

/*
 * The fixtures are GitHub API JSON trimmed to the fields the report reads, from three merge-group runs of
 * 2026-11-08/09: a success that Part 5a's F10 measured by hand (42571798873, 64 % runner wait), a run whose lint
 * lane failed with a file annotation (42482090801) and a run cancelled after its API tests failed (42567843419),
 * which concluded `cancelled` as every failed queue run has since the `Fail fast` jobs landed.
 */
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/ci-queue-health', name), 'utf8')) as T;
const success = fixture<{ run: WorkflowRun; jobs: WorkflowJob[] }>('run-42571798873.json');
const failure = fixture<{ run: WorkflowRun; jobs: WorkflowJob[] }>('run-42482090801.json');
const cancelled = fixture<{ run: WorkflowRun; jobs: WorkflowJob[] }>('run-42567843419.json');
const lintAnnotations = fixture<Annotation[]>('annotations-128736767386.json');

const run = (overrides: Partial<WorkflowRun>): WorkflowRun => ({
  id: 1,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-09T00:00:00Z',
  updated_at: '2026-11-09T00:10:00Z',
  html_url: 'https://github.com/taucad/tau/actions/runs/1',
  ...overrides,
});

const job = (overrides: Partial<WorkflowJob>): WorkflowJob => ({
  id: 10,
  name: 'Affected (lint)',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-09T00:00:00Z',
  started_at: '2026-11-09T00:01:00Z',
  completed_at: '2026-11-09T00:04:00Z',
  ...overrides,
});

const evidence: RunEvidence[] = [
  success,
  { ...failure, annotations: lintAnnotations },
  cancelled,
  { run: run({ id: 2, status: 'in_progress', conclusion: undefined }) },
];

describe('ci queue health', () => {
  describe('time helpers', () => {
    it('should count whole seconds and never go negative', () => {
      expect(secondsBetween('2026-11-09T00:00:00Z', '2026-11-09T00:01:30Z')).toBe(90);
      expect(secondsBetween('2026-11-09T00:01:30Z', '2026-11-09T00:00:00Z')).toBe(0);
    });

    it('should take nearest-rank quantiles and 0 for nothing', () => {
      expect(quantile([], 0.5)).toBe(0);
      expect(quantile([5, 1, 3], 0.5)).toBe(3);
      expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
      expect(quantile([4], 0)).toBe(4);
    });

    it('should end the window at now, to the second', () => {
      expect(reportWindow(new Date('2026-11-09T07:23:45.678Z'), 7)).toEqual({
        from: '2026-11-02T07:23:45Z',
        to: '2026-11-09T07:23:45Z',
      });
    });

    it('should split a window into two halves that share the middle', () => {
      expect(
        splitWindow({
          from: '2026-11-02T00:00:00Z',
          to: '2026-11-09T00:00:00Z',
        }),
      ).toEqual([
        { from: '2026-11-02T00:00:00Z', to: '2026-11-05T12:00:00Z' },
        { from: '2026-11-05T12:00:00Z', to: '2026-11-09T00:00:00Z' },
      ]);
    });
  });

  describe('conclusions', () => {
    it('should count finished runs by conclusion and leave unfinished runs out of the share', () => {
      const counts = countConclusions([
        ...evidence.map((entry) => entry.run),
        run({ conclusion: 'cancelled' }),
        run({ conclusion: 'timed_out' }),
      ]);
      expect(counts).toEqual({
        total: 6,
        unfinished: 1,
        success: 1,
        failure: 1,
        cancelled: 2,
        other: 1,
        cancelledShare: 0.4,
      });
    });

    it('should report a zero share when nothing finished', () => {
      expect(countConclusions([]).cancelledShare).toBe(0);
    });
  });

  describe('failure attribution', () => {
    it('should blame the lane that failed first, not the gate that failed after it', () => {
      expect(firstFailedJob(failure.jobs)?.name).toBe('Affected (lint)');
      expect(firstFailedJob(success.jobs)).toBeUndefined();
    });

    it('should count a timed-out job and break a completion tie by name', () => {
      const jobs = [
        job({ id: 1, name: 'b', conclusion: 'timed_out' }),
        job({ id: 2, name: 'a', conclusion: 'failure' }),
        job({ id: 3, name: 'c', conclusion: 'failure', completed_at: undefined }),
      ];
      expect(firstFailedJob(jobs)?.name).toBe('a');
      expect(firstFailedJob([jobs[0]!])?.name).toBe('b');
    });

    it('should name the file and rule of a failure annotation and skip the exit-code annotation', () => {
      const lint = firstFailedJob(failure.jobs)!;
      expect(failedSuites(lint, lintAnnotations)).toEqual([
        'app/components/chat/chat-composer-static-bar.tsx (typescript(no-unnecessary-boolean-literal-compare))',
      ]);
      const bare: Annotation = {
        path: 'src/a.ts',
        annotation_level: 'failure',
        title: '',
        message: 'boom',
      };
      expect(failedSuites(lint, [bare, bare])).toEqual(['src/a.ts']);
    });

    it('should fall back to the failed step when only the exit code is annotated', () => {
      const lint = firstFailedJob(failure.jobs)!;
      const exitOnly = lintAnnotations.filter((annotation) => annotation.path === '.github');
      expect(failedSuites(lint, exitOnly)).toEqual(["step: Run the lane's tasks"]);
      expect(failedSuites(job({ steps: undefined }), [])).toEqual([]);
    });

    describe('infrastructure step retries', () => {
      const retried = (step: string, attempt: number, signature: string): Annotation => ({
        path: '.github',
        annotation_level: 'warning',
        title: 'infra-retry',
        message: `${step} attempt ${attempt} of 3 failed: ${signature}; retrying in 10s`,
      });
      const exhausted = (step: string, signature: string): Annotation => ({
        path: '.github',
        annotation_level: 'failure',
        title: 'infra-retry',
        message: `${step} failed after 3 attempts: ${signature}`,
      });

      it('should read retried and exhausted events and skip other annotations', () => {
        expect(
          infraRetryEvents([
            retried('apt-install', 1, 'connection-failed'),
            exhausted('playwright-install', 'timeout'),
            { path: '.github', annotation_level: 'warning', title: 'infra-retry', message: 'something else' },
            {
              path: '.github',
              annotation_level: 'warning',
              title: 'other',
              message: 'apt-install attempt 1 of 3 failed: x; retrying in 1s',
            },
            ...lintAnnotations,
          ]),
        ).toEqual([
          { step: 'apt-install', signature: 'connection-failed', exhausted: false },
          { step: 'playwright-install', signature: 'timeout', exhausted: true },
        ]);
      });

      it('should name a job that failed in setup as infrastructure, not by its step or file', () => {
        const lint = firstFailedJob(failure.jobs)!;
        expect(
          failedSuites(lint, [
            retried('apt-install', 1, 'dpkg-interrupted'),
            exhausted('apt-install', 'dpkg-interrupted'),
            ...lintAnnotations,
          ]),
        ).toEqual(['infrastructure: apt-install (dpkg-interrupted)']);
        // A retry that recovered leaves the job named by what failed afterwards.
        expect(failedSuites(lint, [retried('apt-install', 1, 'dns'), ...lintAnnotations])).toEqual([
          'app/components/chat/chat-composer-static-bar.tsx (typescript(no-unnecessary-boolean-literal-compare))',
        ]);
      });

      it('should count events by step and signature, most frequent first', () => {
        expect(
          countInfraRetries([
            { run: run({ id: 1 }), annotations: [retried('apt-install', 1, 'dns'), retried('apt-install', 2, 'dns')] },
            {
              run: run({ id: 2 }),
              annotations: [retried('pnpm-download', 1, 'connection-reset'), exhausted('apt-install', 'dns')],
            },
            { run: run({ id: 3 }) },
          ]),
        ).toEqual([
          { step: 'apt-install', signature: 'dns', retries: 2, exhausted: 1 },
          { step: 'pnpm-download', signature: 'connection-reset', retries: 1, exhausted: 0 },
        ]);
      });
    });

    it('should group failed runs by lane with their suites and newest examples', () => {
      const failed = (id: number, createdAt: string, steps: WorkflowJob['steps']): RunEvidence => ({
        run: run({
          id,
          conclusion: 'failure',
          created_at: createdAt,
          html_url: `run-${id}`,
        }),
        jobs: [job({ id, name: 'API tests', conclusion: 'failure', steps })],
      });
      const result = attributeFailures([
        ...evidence,
        failed(3, '2026-11-09T01:00:00Z', [{ name: 'Run API suites', conclusion: 'failure' }]),
        failed(4, '2026-11-09T02:00:00Z', [{ name: 'Run API suites', conclusion: 'failure' }]),
        failed(5, '2026-11-09T03:00:00Z', [{ name: 'Migrate', conclusion: 'failure' }]),
        { run: run({ id: 6, conclusion: 'failure' }) },
        { run: run({ id: 7, conclusion: 'failure' }), jobs: [job({})] },
      ]);
      expect(result.unattributed).toBe(2);
      expect(result.lanes.map((lane) => [lane.lane, lane.runs])).toEqual([
        ['API tests', 3],
        ['Affected (lint)', 1],
        ['API tests (Postgres + MinIO)', 1],
      ]);
      expect(result.lanes[0]?.suites).toEqual([
        { name: 'step: Run API suites', runs: 2 },
        { name: 'step: Migrate', runs: 1 },
      ]);
      expect(result.lanes[0]?.examples).toEqual(['run-5', 'run-4', 'run-3']);
      expect(result.lanes[1]?.examples).toEqual([
        'https://github.com/taucad/tau/actions/runs/42482090801/job/128736767386',
      ]);
    });

    it('should order lanes with equal counts by name', () => {
      const failed = (id: number, name: string): RunEvidence => ({
        run: run({ id, conclusion: 'failure' }),
        jobs: [job({ id, name, conclusion: 'failure' })],
      });
      expect(attributeFailures([failed(1, 'b'), failed(2, 'a')]).lanes.map((lane) => lane.lane)).toEqual(['a', 'b']);
    });
  });

  describe('run classes (global review 2026-11-24, ruling 9)', () => {
    const sha = (n: number): string => n.toString(16).padStart(40, '0');
    const queued = (id: number, base: number, overrides: Partial<WorkflowRun> = {}): WorkflowRun =>
      run({
        id,
        head_sha: sha(id),
        head_branch: `gh-readonly-queue/main/pr-${id}-${sha(base)}`,
        ...overrides,
      });
    const lane = (overrides: Partial<WorkflowJob>): WorkflowJob =>
      job({ name: 'Affected (test-1)', conclusion: 'failure', ...overrides });
    const gate = job({
      id: 90,
      name: 'Run affected tasks',
      conclusion: 'failure',
    });
    const failFast = job({
      id: 91,
      name: 'Fail fast (affected-lane)',
      conclusion: 'failure',
    });

    it('should read the base commit of a merge group from its branch', () => {
      expect(queueBase(queued(5, 4))).toBe(sha(4));
      expect(queueBase(run({ head_branch: 'main' }))).toBeUndefined();
      expect(queueBase(run({}))).toBeUndefined();
    });

    it('should not count the gate or a Fail fast job as a failed job', () => {
      expect(failedJobs([gate, failFast, job({})])).toEqual([]);
      expect(failedJobs([gate, failFast, lane({ id: 1 })]).map((entry) => entry.id)).toEqual([1]);
      expect(firstFailedJob([gate, failFast])).toBeUndefined();
    });

    it('should not count a failed shadow row, which gates nothing (operator ruling Q1)', () => {
      const shadow = job({ id: 92, name: 'Shadow end-to-end (ui-e2e test:e2e:journey-chat-1)', conclusion: 'failure' });
      expect(failedJobs([shadow])).toEqual([]);
      expect(runFailed({ run: queued(6, 5, { conclusion: 'success' }), jobs: [shadow] })).toBe(false);
      expect(failedJobs([shadow, lane({ id: 1 })]).map((entry) => entry.id)).toEqual([1]);
    });

    it('should judge a run by its first attempt and measure waits on its latest', () => {
      const jobs = [lane({ id: 1, run_attempt: 1 }), lane({ id: 2, conclusion: 'success', run_attempt: 2 })];
      expect(failedJobs(jobs).map((entry) => entry.id)).toEqual([1]);
      expect(latestAttempt(jobs).map((entry) => entry.id)).toEqual([2]);
      expect(latestAttempt([job({ id: 3 })]).map((entry) => entry.id)).toEqual([3]);
    });

    it('should call a run failed by its jobs, whatever it concluded', () => {
      expect(
        runFailed({
          run: run({ conclusion: 'cancelled' }),
          jobs: [lane({}), gate, failFast],
        }),
      ).toBe(true);
      expect(
        runFailed({
          run: run({ conclusion: 'cancelled' }),
          jobs: [gate, failFast],
        }),
      ).toBe(false);
      expect(runFailed({ run: run({ conclusion: 'cancelled' }) })).toBeUndefined();
      expect(runFailed({ run: run({ conclusion: 'failure' }) })).toBe(true);
      expect(runFailed({ run: run({ conclusion: 'failure' }), jobs: [job({})] })).toBe(true);
      expect(runFailed({ run: run({ conclusion: 'success' }) })).toBe(false);
    });

    it('should split origin, inherited and victim runs along the queue', () => {
      const chain: RunEvidence[] = [
        // Built on main, failed and cancelled by Fail fast: an origin failure.
        {
          run: queued(1, 100, { conclusion: 'cancelled' }),
          jobs: [lane({}), gate, failFast],
        },
        // Built on the failed run 1 and failed with it: inherited.
        {
          run: queued(2, 1, { conclusion: 'cancelled' }),
          jobs: [lane({}), gate],
        },
        // Built on run 2 and cancelled before anything failed: a victim.
        {
          run: queued(3, 2, { conclusion: 'cancelled' }),
          jobs: [job({ conclusion: 'cancelled' })],
        },
        // Built on the victim: its own failure is an origin.
        { run: queued(4, 3, { conclusion: 'failure' }), jobs: [lane({})] },
        // Failed in its first attempt, green when re-run: still an origin failure.
        {
          run: queued(5, 100, { conclusion: 'success' }),
          jobs: [lane({ run_attempt: 1 }), lane({ conclusion: 'success', run_attempt: 2 })],
        },
        { run: queued(6, 5, { conclusion: 'success' }), jobs: [job({})] },
        { run: queued(7, 6, { conclusion: 'startup_failure' }), jobs: [] },
        { run: queued(8, 6, { conclusion: 'cancelled' }) },
        { run: queued(9, 6, { status: 'in_progress', conclusion: undefined }) },
      ];
      expect(Object.fromEntries(classifyRuns(chain))).toEqual({
        1: 'origin',
        2: 'inherited',
        3: 'victim',
        4: 'origin',
        5: 'origin',
        6: 'success',
        7: 'other',
        8: 'unfetched',
      });
      expect(attributeFailures(chain).lanes).toEqual([expect.objectContaining({ lane: 'Affected (test-1)', runs: 3 })]);
    });

    it('should sum every attempt of each class and the share of runs that merged nothing', () => {
      const minutes = (count: number, attempt = 1): WorkflowJob =>
        job({
          id: count * 10 + attempt,
          name: `job-${count}`,
          run_attempt: attempt,
          started_at: '2026-11-09T00:00:00Z',
          completed_at: `2026-11-09T00:${String(count).padStart(2, '0')}:00Z`,
        });
      const totals = classTotals([
        {
          run: queued(1, 100, { conclusion: 'cancelled' }),
          jobs: [lane({}), gate],
        },
        {
          run: queued(2, 1, { conclusion: 'cancelled' }),
          jobs: [lane({}), minutes(2)],
        },
        { run: queued(3, 2, { conclusion: 'cancelled' }), jobs: [minutes(5)] },
        { run: queued(4, 100), jobs: [minutes(10), minutes(9, 2)] },
      ]);
      expect(totals.origin).toEqual({ runs: 1, runnerMinutes: 6 });
      expect(totals.inherited).toEqual({ runs: 1, runnerMinutes: 5 });
      expect(totals.victim).toEqual({ runs: 1, runnerMinutes: 5 });
      expect(totals.success).toEqual({ runs: 1, runnerMinutes: 19 });
      expect(totals.runnerMinutes).toBe(35);
      expect(totals.mergedNothingShare).toBeCloseTo(16 / 35, 5);
      expect(classTotals([]).mergedNothingShare).toBe(0);
    });
  });

  describe('runner wait', () => {
    it('should reproduce F10 for run 42571798873: plan, test-3 and the gate, 468 s of a 733 s wall', () => {
      expect(criticalPath(success.run, success.jobs)).toEqual({
        wallSeconds: 733,
        waitSeconds: 468,
        jobs: ['Plan affected lanes', 'Affected (test-3)', 'Run affected tasks'],
      });
    });

    it('should follow the dependency, not a parallel job that finished seconds later', () => {
      expect(criticalPath(failure.run, failure.jobs)?.jobs).toEqual([
        'Plan affected lanes',
        'Affected (test-3)',
        'Run affected tasks',
      ]);
    });

    it('should have no critical path when no job ran', () => {
      expect(criticalPath(run({}), [job({ conclusion: 'skipped' })])).toBeUndefined();
      expect(criticalPath(run({}), [job({ started_at: undefined })])).toBeUndefined();
    });

    it('should measure each job over finished, non-cancelled runs only', () => {
      const waits = jobWaits(evidence);
      const lint = waits.find((entry) => entry.job === 'Affected (lint)');
      expect(lint?.instances).toBe(2);
      expect(waits.every((entry) => entry.instances <= 2)).toBe(true);
      const plan = waits.find((entry) => entry.job === 'Plan affected lanes');
      expect(plan?.runnerWaitMedianSeconds).toBe(33);
      expect(waits.map((entry) => entry.runnerWaitShare)).toEqual(
        waits.map((entry) => entry.runnerWaitShare).sort((a, b) => b - a),
      );
    });

    it('should order jobs with equal shares by name and give a zero-length job a zero share', () => {
      const jobs = [
        job({
          id: 1,
          name: 'b',
          started_at: '2026-11-09T00:00:00Z',
          completed_at: '2026-11-09T00:00:00Z',
        }),
        job({
          id: 2,
          name: 'a',
          started_at: '2026-11-09T00:00:00Z',
          completed_at: '2026-11-09T00:00:00Z',
        }),
      ];
      expect(jobWaits([{ run: run({}), jobs }]).map((entry) => [entry.job, entry.runnerWaitShare])).toEqual([
        ['a', 0],
        ['b', 0],
      ]);
    });

    it('should summarise wall and critical-path share over measurable runs', () => {
      const result = runWaits([...evidence, { run: run({}), jobs: [] }]);
      expect(result.runs).toBe(2);
      expect(result.wallMedianSeconds).toBe(733);
      expect(result.criticalPathWaitShareMedian).toBeCloseTo(316 / 1027, 5);
      expect(result.criticalPathWaitShareP90).toBeCloseTo(468 / 733, 5);
    });

    it('should count what every cancelled run had spent, a failed one too, and victims not checked for landing', () => {
      const result = cancelledWaste([...evidence, { run: run({ conclusion: 'cancelled' }) }]);
      expect(result.runs).toBe(2);
      expect(result.jobs).toBe(18);
      expect(result.runnerMinutes).toBe(75.8);
      expect(result.landed).toEqual({ runs: 0, runnerMinutes: 0 });
      // The fixture's API tests failed, so it is no victim; the run without jobs cannot be told apart.
      expect(result.unchecked).toBe(1);
    });

    it('should keep a victim whose commit landed in the total and name it apart (F14)', () => {
      const victim: RunEvidence = {
        run: cancelled.run,
        jobs: cancelled.jobs.map((entry) =>
          entry.conclusion === 'failure' ? { ...entry, conclusion: 'cancelled' } : entry,
        ),
      };
      const landed = cancelledWaste([{ ...victim, landed: true }]);
      const dead = cancelledWaste([{ ...victim, landed: false }]);
      expect(landed.runs).toBe(1);
      expect(landed.runnerMinutes).toBe(75.8);
      expect(landed.landed).toEqual({ runs: 1, runnerMinutes: 75.8 });
      expect(dead.runnerMinutes).toBe(75.8);
      expect(dead.landed).toEqual({ runs: 0, runnerMinutes: 0 });
      expect(dead.unchecked).toBe(0);
      // A failed run never landed, whatever the CLI was told.
      expect(cancelledWaste([{ ...cancelled, landed: true }]).landed.runs).toBe(0);
    });

    it('should count every attempt once: a re-run attempt repeats the jobs it did not re-run', () => {
      const first = job({
        id: 1,
        name: 'a',
        conclusion: 'cancelled',
        run_attempt: 1,
      });
      const rerun = job({
        id: 2,
        name: 'a',
        conclusion: 'cancelled',
        run_attempt: 2,
        started_at: '2026-11-09T01:00:00Z',
        completed_at: '2026-11-09T01:02:00Z',
      });
      const carried = job({ id: 3, name: 'b', run_attempt: 1 });
      const result = cancelledWaste([
        {
          run: run({ conclusion: 'cancelled' }),
          jobs: [first, carried, rerun, { ...carried, id: 4, run_attempt: 2 }],
        },
      ]);
      expect(result.jobs).toBe(3);
      expect(result.runnerMinutes).toBe(8);
    });

    it('should ignore the landing of a run that was not cancelled', () => {
      const result = cancelledWaste([{ ...success, landed: true }]);
      expect(result).toEqual({
        runs: 0,
        jobs: 0,
        runnerMinutes: 0,
        landed: { runs: 0, runnerMinutes: 0 },
        unchecked: 0,
      });
    });

    it.each([
      ['identical', true],
      ['ahead', true],
      ['behind', false],
      ['diverged', false],
      [undefined, false],
    ])('should read compare status %s as landed=%s', (status, expected) => {
      expect(landedFromCompare(status)).toBe(expected);
    });
  });

  describe('fetch order', () => {
    it('should fetch failures and cancellations, then successes, then others, newest first, and skip unfinished runs', () => {
      const runs = [
        run({
          id: 1,
          conclusion: 'cancelled',
          created_at: '2026-11-09T01:00:00Z',
        }),
        run({ id: 2, conclusion: 'success' }),
        run({ id: 3, conclusion: 'timed_out' }),
        run({ id: 4, status: 'queued', conclusion: undefined }),
        run({
          id: 5,
          conclusion: 'failure',
          created_at: '2026-11-08T00:00:00Z',
        }),
        run({
          id: 6,
          conclusion: 'failure',
          created_at: '2026-11-09T00:00:00Z',
        }),
        run({
          id: 7,
          conclusion: 'cancelled',
          created_at: '2026-11-08T00:00:00Z',
        }),
      ];
      runs.push(run({ id: 8, conclusion: 'startup_failure' }));
      expect(fetchOrder(runs).map((entry) => entry.id)).toEqual([1, 3, 6, 5, 7, 2, 8]);
    });
  });

  describe('report', () => {
    const report = buildReport({
      repository: 'taucad/tau',
      workflow: 'ci.yml',
      event: 'merge_group',
      window: { from: '2026-11-02T00:00:00Z', to: '2026-11-09T00:00:00Z' },
      generatedAt: '2026-11-09T00:00:00Z',
      evidence: [...evidence, { run: run({ id: 8, conclusion: 'cancelled' }) }],
    });

    it('should assemble counts, classes, attribution, waits, waste and coverage', () => {
      expect(report.runs.total).toBe(5);
      expect(report.classes.origin.runs).toBe(2);
      expect(report.classes.unfetched.runs).toBe(1);
      expect(report.failures.lanes.map((lane) => lane.lane)).toEqual([
        'Affected (lint)',
        'API tests (Postgres + MinIO)',
      ]);
      expect(report.runWait.runs).toBe(2);
      expect(report.cancelled.jobs).toBe(18);
      expect(report.coverage).toEqual({ runsWithJobs: 3, finishedRuns: 4 });
    });

    it('should render the owner table, the partial note and the wait table as Markdown', () => {
      const markdown = renderMarkdown(report);
      expect(markdown).toContain('| 5 | 1 | 1 | 2 | 0 | 1 | 50 % |');
      expect(markdown).toContain(
        '| Affected (lint) | 1 | app/components/chat/chat-composer-static-bar.tsx (typescript(no-unnecessary-boolean-literal-compare)) (1) | [1](https://github.com/taucad/tau/actions/runs/42482090801/job/128736767386) |',
      );
      expect(markdown).toContain('> Partial: jobs were fetched for 3 of 4 finished runs');
      expect(markdown).toContain('| Origin failure | 2 | 168 | 85 % |');
      expect(markdown).toContain('| Cancelled, jobs not fetched | 1 | 0 | 0 % |');
      expect(markdown).not.toMatch(/^\| Other \| \d/mu);
      expect(markdown).toContain(
        'Runs that merged nothing (origin, inherited, victim) used 85 % of 198.5 runner minutes. Cancelled runs: 2, which dispatched 18 jobs and used 75.8 runner minutes; of those, victims whose commit had landed: 0 (0 runner minutes), victims not checked for landing: 1.',
      );
      expect(markdown).toContain('| Plan affected lanes | 2 |');
      expect(markdown).not.toContain('had no failed job');
      expect(markdown).toContain('No `infra-retry` events in the failed jobs whose annotations were read.');
      const retries = renderMarkdown({
        ...report,
        infraRetries: [{ step: 'apt-install', signature: 'connection-failed', retries: 3, exhausted: 1 }],
      });
      expect(retries).toContain('| apt-install | connection-failed | 3 | 1 |');
    });

    it('should say so when nothing failed, note unattributed runs and escape table cells', () => {
      const quiet = renderMarkdown({
        ...report,
        failures: { lanes: [], unattributed: 2 },
        coverage: { runsWithJobs: 4, finishedRuns: 4 },
        jobs: [
          {
            job: 'a | b',
            instances: 1,
            runnerWaitMedianSeconds: 1,
            runnerWaitP90Seconds: 1,
            runnerWaitShare: 0.5,
          },
        ],
      });
      expect(quiet).toContain('No origin failures were attributed to a lane.');
      expect(quiet).toContain('2 origin failures had no failed job to attribute.');
      expect(quiet).toContain(String.raw`| a \| b | 1 | 1 s | 1 s | 50 % |`);
      expect(quiet).not.toContain('Partial');
      const landed = renderMarkdown({
        ...report,
        cancelled: { runs: 1, jobs: 3, runnerMinutes: 4.5, landed: { runs: 2, runnerMinutes: 60 }, unchecked: 0 },
      });
      expect(landed).toContain(
        'Cancelled runs: 1, which dispatched 3 jobs and used 4.5 runner minutes; of those, victims whose commit had landed: 2 (60 runner minutes). ',
      );
      const unnamed = renderMarkdown({
        ...report,
        failures: {
          lanes: [{ lane: 'x', runs: 1, suites: [], examples: [] }],
          unattributed: 0,
        },
      });
      expect(unnamed).toContain('| x | 1 | none named |  |');
    });
  });
});

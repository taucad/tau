/* eslint-disable @typescript-eslint/naming-convention -- Runs, jobs and annotations are GitHub REST JSON. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  attributeFailures,
  buildReport,
  cancelledWaste,
  countConclusions,
  criticalPath,
  failedSuites,
  fetchOrder,
  firstFailedJob,
  jobWaits,
  quantile,
  renderMarkdown,
  reportWindow,
  runWaits,
  secondsBetween,
  splitWindow,
} from '#ci-queue-health.js';
import type { Annotation, RunEvidence, WorkflowJob, WorkflowRun } from '#ci-queue-health.js';

/*
 * The fixtures are GitHub API JSON trimmed to the fields the report reads, from three merge-group runs of
 * 2026-11-08/09: a success that Part 5a's F10 measured by hand (42571798873, 64 % runner wait), a run whose lint
 * lane failed with a file annotation (42482090801) and a run cancelled by a queue rebuild (42567843419).
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

    it('should count what the cancelled runs had already spent', () => {
      const result = cancelledWaste([...evidence, { run: run({ conclusion: 'cancelled' }) }]);
      expect(result.runs).toBe(2);
      expect(result.jobs).toBe(18);
      expect(result.runnerMinutes).toBe(75.8);
    });
  });

  describe('fetch order', () => {
    it('should fetch failures, then successes, then cancellations and others, newest first, and skip unfinished runs', () => {
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
      expect(fetchOrder(runs).map((entry) => entry.id)).toEqual([6, 5, 2, 1, 7, 3]);
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

    it('should assemble counts, attribution, waits, waste and coverage', () => {
      expect(report.runs.total).toBe(5);
      expect(report.failures.lanes[0]?.lane).toBe('Affected (lint)');
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
      expect(markdown).toContain('| Plan affected lanes | 2 |');
      expect(markdown).not.toContain('had no failed job');
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
      expect(quiet).toContain('No failed runs were attributed to a lane.');
      expect(quiet).toContain('2 failed runs had no failed job to attribute.');
      expect(quiet).toContain(String.raw`| a \| b | 1 | 1 s | 1 s | 50 % |`);
      expect(quiet).not.toContain('Partial');
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

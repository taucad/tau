import { describe, expect, it } from 'vitest';

import {
  burnIn,
  detectionProbability,
  isTestFile,
  ownerOf,
  planBurnIn,
  renderSummary,
  runOutcomes,
  runSeed,
  schedule,
  summarizeFile,
} from '#burn-in.js';
import type { BurnInReport, GraphNodes } from '#burn-in.js';
import { seededDraw } from '#fixtures/flake-repro/seeded-draw.js';

/*
 * FQ-10 (Brain research/ci-flake-quarantine-blueprint.md, operator decision O6 B): changed test files run ten times
 * with shuffle, capped at 5 minutes. These pin the file → target mapping, the cap's run order and the outcome rules;
 * `burn-in-cli.test.ts` runs Vitest for real on the FQ-7 fixtures.
 */
const workspace = '/w';
const vitestTarget = (command = 'vitest', cwd = '{projectRoot}') => ({
  executor: 'nx:run-commands',
  options: { cwd, command },
});
const nodes: GraphNodes = {
  workspace: { data: { root: '.', targets: {} } },
  core: { data: { root: 'packages/core', tags: ['type:package'], targets: { test: vitestTarget() } } },
  nested: { data: { root: 'packages/core/nested', targets: { test: vitestTarget() } } },
  api: { data: { root: 'apps/api', tags: ['scope:api'], targets: { test: vitestTarget() } } },
  quarantined: { data: { root: 'apps/runtime-e2e', tags: ['ci:quarantined'], targets: { test: vitestTarget() } } },
  untested: { data: { root: 'libs/untested', targets: { build: vitestTarget() } } },
  noop: { data: { root: 'apps/react-e2e', targets: { test: { executor: 'nx:noop' } } } },
  listed: {
    data: {
      root: 'apps/ui-e2e',
      targets: {
        test: vitestTarget('vitest run --dir apps/ui-e2e apps/ui-e2e/src/support/a.test.ts --environment=node', ''),
      },
    },
  },
};

describe('burn-in budget (O6 B)', () => {
  it('runs ten times capped at five minutes', () => {
    expect(burnIn).toEqual({ runs: 10, minutes: 5 });
  });

  it('catches a 20 % flake 89 % of the time and a 5 % one 40 %', () => {
    expect(detectionProbability(0.2)).toBeCloseTo(0.8926, 4);
    expect(detectionProbability(0.05)).toBeCloseTo(0.4013, 4);
    expect(detectionProbability(0.05, 50)).toBeCloseTo(0.923, 3);
  });

  it('catches the seeded 20 % fixture flake in about 89 % of burn-ins', () => {
    // A burn-in with first seed s runs seeds s … s + 9; the fixture fails a run whose seed draws under the rate.
    const burnIns = 4000;
    let caught = 0;
    for (let seed = 1; seed <= burnIns; seed++) {
      const seeds = Array.from({ length: burnIn.runs }, (_, run) => runSeed(seed * 1000, run));
      if (seeds.some((value) => seededDraw(value) < 0.2)) {
        caught++;
      }
    }
    expect(caught / burnIns).toBeGreaterThan(0.87);
    expect(caught / burnIns).toBeLessThan(0.915);
  });
});

describe('file → target mapping', () => {
  it('recognises Vitest test files', () => {
    for (const file of ['a.test.ts', 'b.spec.tsx', 'c.test.mjs', 'd.browser.test.ts', 'e.test.cts']) {
      expect(isTestFile(file), file).toBe(true);
    }
    for (const file of ['a.ts', 'polluter.fixture.ts', 'test.ts', 'a.test.ts.snap', 'vitest.config.ts']) {
      expect(isTestFile(file), file).toBe(false);
    }
  });

  it('maps a file to the deepest project root above it, else the workspace project', () => {
    expect(ownerOf(nodes, 'packages/core/src/a.test.ts')).toBe('core');
    expect(ownerOf(nodes, 'packages/core/nested/src/a.test.ts')).toBe('nested');
    expect(ownerOf(nodes, 'packages/core-other/a.test.ts')).toBe('workspace');
    expect(ownerOf({ core: nodes['core'] ?? { data: { root: '' } } }, 'docs/a.test.ts')).toBeUndefined();
  });

  it('groups each changed test file under its project’s test target and ignores other files', () => {
    const plan = planBurnIn(
      [
        'packages/core/src/b.test.ts',
        'packages/core/src/a.test.ts',
        'packages/core/src/a.test.ts',
        'packages/core/src/index.ts',
        'packages/core/nested/src/n.spec.ts',
        'apps/ui-e2e/src/support/a.test.ts',
      ],
      nodes,
      workspace,
    );
    expect(plan.units).toEqual([
      { project: 'core', target: 'test', files: ['packages/core/src/a.test.ts', 'packages/core/src/b.test.ts'] },
      { project: 'listed', target: 'test', files: ['apps/ui-e2e/src/support/a.test.ts'] },
      { project: 'nested', target: 'test', files: ['packages/core/nested/src/n.spec.ts'] },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('leaves out, with the reason, the files the pull request’s test lanes do not run', () => {
    const plan = planBurnIn(
      [
        'apps/api/src/a.test.ts',
        'apps/runtime-e2e/src/a.test.ts',
        'libs/untested/src/a.test.ts',
        'apps/react-e2e/src/a.test.ts',
        'apps/ui-e2e/src/journey.test.ts',
      ],
      nodes,
      workspace,
    );
    expect(plan.units).toEqual([]);
    const reasons = new Map(plan.skipped.map(({ file, reason }) => [file, reason]));
    expect([...reasons.keys()].toSorted()).toEqual(
      [
        'apps/api/src/a.test.ts',
        'apps/react-e2e/src/a.test.ts',
        'apps/runtime-e2e/src/a.test.ts',
        'apps/ui-e2e/src/journey.test.ts',
        'libs/untested/src/a.test.ts',
      ].toSorted(),
    );
    expect(reasons.get('apps/api/src/a.test.ts')).toContain('API suite');
    expect(reasons.get('apps/runtime-e2e/src/a.test.ts')).toContain('ci:quarantined');
    expect(reasons.get('libs/untested/src/a.test.ts')).toBe('`untested` has no `test` target');
    expect(reasons.get('apps/react-e2e/src/a.test.ts')).toContain('only nx:run-commands Vitest targets');
    expect(reasons.get('apps/ui-e2e/src/journey.test.ts')).toBe('`listed:test` names its files, and not this one');
  });

  it('plans nothing for a pull request that changes no test file, so it adds no job', () => {
    expect(planBurnIn(['packages/core/src/index.ts', 'README.md'], nodes, workspace)).toEqual({
      units: [],
      skipped: [],
    });
    expect(planBurnIn([], nodes, workspace).units).toEqual([]);
  });
});

describe('the cap', () => {
  it('orders runs run-major, so a cut leaves every unit within one run of the others', () => {
    const order = schedule(['a', 'b', 'c'], 3).map(({ unit, run }) => `${unit}${run}`);
    expect(order).toEqual(['a0', 'b0', 'c0', 'a1', 'b1', 'c1', 'a2', 'b2', 'c2']);
    // Cut after any prefix: the per-unit counts differ by at most one.
    for (let cut = 0; cut <= order.length; cut++) {
      const counts = ['a', 'b', 'c'].map(
        (unit) => order.slice(0, cut).filter((entry) => entry.startsWith(unit)).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('counts a run the cap killed as neither a pass nor a failure, and marks the file cut short', () => {
    const row = summarizeFile(
      { project: 'core', target: 'test', file: 'a.test.ts' },
      [
        { outcome: 'passed', seed: 5 },
        { outcome: 'failed', seed: 6, message: 'boom' },
        { outcome: 'cut', seed: 7 },
      ],
      10,
    );
    expect(row).toEqual({
      project: 'core',
      target: 'test',
      file: 'a.test.ts',
      runs: 2,
      planned: 10,
      failures: 1,
      seeds: [5, 6],
      failingSeeds: [6],
      firstFailure: 'boom',
      cutShort: true,
    });
    expect(summarizeFile({ project: 'p', target: 't', file: 'f' }, [{ outcome: 'passed', seed: 1 }], 1).cutShort).toBe(
      false,
    );
  });

  it('gives each run its own seed, the same for every unit', () => {
    expect([0, 1, 9].map((run) => runSeed(100, run))).toEqual([100, 101, 109]);
  });
});

describe('run outcomes', () => {
  const absolute = (file: string): string => `/w/${file}`;
  const files = ['a.test.ts', 'b.test.ts'];

  it('reads each file’s result, a failed assertion or a failed suite counting as a failure', () => {
    const outcomes = runOutcomes(files, {
      report: {
        testResults: [
          {
            name: '/w/a.test.ts',
            status: 'failed',
            assertionResults: [
              { fullName: 'a ok', status: 'passed' },
              { fullName: 'a flaky', status: 'failed', failureMessages: ['expected 1 to be 2'] },
            ],
          },
          { name: '/w/b.test.ts', status: 'passed', assertionResults: [{ fullName: 'b', status: 'passed' }] },
        ],
      },
      exitCode: 1,
      cut: false,
      absolute,
    });
    expect(Object.fromEntries(outcomes)).toEqual({
      'a.test.ts': { outcome: 'failed', message: 'a flaky: expected 1 to be 2' },
      'b.test.ts': { outcome: 'passed' },
    });
    const suite = runOutcomes(['a.test.ts'], {
      report: {
        testResults: [{ name: '/w/a.test.ts', status: 'failed', message: 'Cannot find module', assertionResults: [] }],
      },
      exitCode: 1,
      cut: false,
      absolute,
    });
    expect(suite.get('a.test.ts')).toEqual({ outcome: 'failed', message: 'Cannot find module' });
  });

  it('fails closed: no report, a file missing from it, or an unhandled error is an error', () => {
    expect(runOutcomes(files, { report: undefined, exitCode: 137, cut: false, absolute }).get('a.test.ts')).toEqual({
      outcome: 'error',
      message: 'Vitest exited 137 with no report',
    });
    expect(
      runOutcomes(files, { report: { testResults: [] }, exitCode: 0, cut: false, absolute }).get('b.test.ts')?.outcome,
    ).toBe('error');
    const unhandled = runOutcomes(files, {
      report: {
        testResults: files.map((file) => ({ name: absolute(file), status: 'passed', assertionResults: [] })),
      },
      exitCode: 1,
      cut: false,
      absolute,
    });
    expect([...unhandled.values()].map((run) => run.outcome)).toEqual(['error', 'error']);
  });

  it('marks every file of a run the cap killed as cut', () => {
    const cut = runOutcomes(files, { report: undefined, exitCode: undefined, cut: true, absolute });
    expect([...cut.values()]).toEqual([{ outcome: 'cut' }, { outcome: 'cut' }]);
  });
});

describe('summary', () => {
  const report = (rows: BurnInReport['rows'], cutShort = false): BurnInReport => ({
    schema: 'burn-in/1',
    seed: 40,
    runs: 10,
    capMinutes: 5,
    startedAt: '2026-11-25T00:00:00.000Z',
    finishedAt: '2026-11-25T00:02:00.000Z',
    minutes: 2,
    rows,
    notCollected: [{ file: 'x.browser.test.ts', reason: 'not collected' }],
    failed: rows.some((row) => row.failures > 0),
    cutShort,
  });
  const row = {
    project: 'core',
    target: 'test',
    file: 'a.test.ts',
    runs: 10,
    planned: 10,
    failures: 2,
    seeds: [],
    failingSeeds: [41, 47],
    firstFailure: 'a | b',
    cutShort: false,
  };

  it('names the failing files, their seeds and the way to reproduce, and the files not burned in', () => {
    const text = renderSummary(report([row]), [{ file: 'api.test.ts', reason: 'an API suite' }]);
    expect(text).toContain('## Burn-in: 1 of 1 files failed');
    expect(text).toContain('seeds 40–49');
    expect(text).toContain('| `a.test.ts` | `core:test` | 2 / 10 | 41, 47 | a \\| b |');
    expect(text).toContain('--sequence.seed=<seed>');
    expect(text).toContain('- `x.browser.test.ts`: not collected');
    expect(text).toContain('- `api.test.ts`: an API suite');
  });

  it('says when the cap cut files short', () => {
    const text = renderSummary(report([{ ...row, failures: 0, failingSeeds: [], runs: 4, cutShort: true }], true));
    expect(text).toContain('## Burn-in: 1 files passed');
    expect(text).toContain('**the cap cut some files short**');
    expect(text).toContain('0 / 4 (cut short, 10 planned)');
    expect(text).not.toContain('--sequence.seed=<seed>');
  });
});

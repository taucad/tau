import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { retryBudget } from '@taucad/vitest-ci/retry-policy';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */

/*
 * Testing policy § 16.2 (CI flake quarantine blueprint FQ-4, RT-1 and RT-4). Every Vitest config that reports through
 * `testReporters` sets `retry: testRetry()`, one in-process retry in CI, and no config sets a higher count: `ui-e2e`
 * and `react-e2e` came down from 2. The required gate `Run affected tasks` fails a run with more than five retried
 * passes across its lanes' outcome artifacts; each task's reporter enforces its own cap of three.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** Configs that set `retry: 0` on purpose: a run that measures, where a retry would turn a sample into a reading. */
const noRetry = new Map([
  ['apps/ui-e2e/src/filesystem-scenarios/vitest.config.ts', 'filesystem scenarios record one timed run per scenario'],
]);

const reportingConfigs = execFileSync('git', ['grep', '-l', '-z', 'reporters: testReporters(', '--', '*.config.*'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter((file) => file !== '');

describe('the recorded retry in every Vitest config (RT-1)', () => {
  it('sets retry: testRetry() beside testReporters, and no other retry', () => {
    expect(reportingConfigs.length).toBeGreaterThan(150);
    const wrong: string[] = [];
    for (const file of reportingConfigs) {
      const retries = [...read(file).matchAll(/^\s*retry:\s*(.+?),?\s*$/gmu)].map((match) => match[1]);
      const expected = noRetry.has(file) ? ['0'] : ['testRetry()'];
      if (JSON.stringify(retries) !== JSON.stringify(expected)) {
        wrong.push(`${file}: retry ${retries.join(', ') || 'unset'} (expected ${expected.join(', ')})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('gives CI one retry and no suite a higher count', () => {
    expect(retryBudget).toEqual({ retries: 1, task: 3, run: 5 });
  });
});

type Step = {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly env?: Record<string, unknown>;
  readonly with?: Record<string, unknown>;
};
const ci = load(read('.github/workflows/ci.yml')) as {
  readonly jobs: Record<string, { readonly steps?: readonly Step[] }>;
};
const gate = ci.jobs['affected']?.steps ?? [];
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
const download = gate.find((step) => step.name === 'Download test outcomes');
const check = gate.find((step) => step.name === "Check the run's retried passes");

describe("ci.yml's run budget for retried passes (RT-4)", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'retry-budget-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  /** Runs the gate's check against artifacts laid out as `download-artifact` writes them, one directory each. */
  const runCheck = (artifacts: Record<string, ReadonlyArray<Record<string, unknown>>>) => {
    for (const [name, rows] of Object.entries(artifacts)) {
      const file = join(directory, 'test-outcomes', name, 'project', 'test.outcomes.jsonl');
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
    }
    const summary = join(directory, 'summary.md');
    try {
      const output = execFileSync('bash', ['-c', check?.run ?? 'exit 2'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env['PATH'],
          RUNNER_TEMP: directory,
          GITHUB_RUN_ID: '42',
          GITHUB_STEP_SUMMARY: summary,
          RUN_BUDGET: String(check?.env?.['RUN_BUDGET']),
        },
      });
      return { status: 0, output, summary: readFileSync(summary, 'utf8') };
    } catch (error) {
      const failed = error as { status: number; stdout: string };
      return {
        status: failed.status,
        output: failed.stdout,
        summary: readFileSync(summary, 'utf8'),
      };
    }
  };

  const flaky = (id: string, run = 42) => ({
    kind: 'test',
    id,
    flaky: true,
    run,
  });

  it('downloads every lane’s outcome artifact into a directory of its own, after the lanes are required', () => {
    expect(download?.uses).toMatch(/^actions\/download-artifact@[\da-f]{40}$/u);
    expect(download?.with).toEqual({
      pattern: 'test-outcomes-*',
      path: `${expression('runner.temp')}/test-outcomes`,
    });
    expect(gate.findIndex((step) => step.name === 'Download test outcomes')).toBeGreaterThan(
      gate.findIndex((step) => step.name === 'Require every affected lane'),
    );
    expect(check?.env?.['RUN_BUDGET']).toBe(retryBudget.run);
  });

  it('passes five retried passes of this run and lists them in the summary', () => {
    const result = runCheck({
      'test-outcomes-a': [
        flaky('a › 1'),
        flaky('a › 2'),
        flaky('a › 3'),
        { kind: 'test', id: 'a › 4', flaky: false, run: 42 },
      ],
      'test-outcomes-b': [
        flaky('b › 1'),
        flaky('b › 2'),
        flaky('b › old', 41),
        { kind: 'module', id: 'b', flaky: true, run: 42 },
      ],
    });
    expect(result.status).toBe(0);
    expect(result.output).toContain('5 retried passes in this run, within the budget of 5.');
    expect(result.summary).toContain('### Retried passes in this run: 5 (budget 5)\n- a › 1\n');
  });

  it('fails a sixth retried pass in the run', () => {
    const result = runCheck({
      'test-outcomes-a': [flaky('a › 1'), flaky('a › 2'), flaky('a › 3')],
      'test-outcomes-b': [flaky('b › 1'), flaky('b › 2'), flaky('b › 3')],
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain('::error title=Retry policy::6 retried passes in this run, over the budget of 5');
  });

  it('counts nothing when no lane uploaded outcomes', () => {
    const result = runCheck({});
    expect(result.status).toBe(0);
    expect(result.summary).toContain('### Retried passes in this run: 0 (budget 5)');
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */

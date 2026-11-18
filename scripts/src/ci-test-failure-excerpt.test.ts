import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * F3 (CI throughput review, merge-queue ejection review): a failed affected test shard names every failing test.
 * The shard streams its Nx output, because a `static` task's output reached the log and `affected-test.log` cut
 * off before Vitest's summary, and the failure excerpt prints the `FAIL` lines before any longer report.
 */

const root = resolve(import.meta.dirname, '../..');
type Step = { readonly name?: string; readonly run?: string };
const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
  readonly jobs: Record<string, { readonly steps?: readonly Step[] }>;
};
const steps = ci.jobs['affected-lane']?.steps ?? [];
const lane = steps.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
const summary = steps.find((step) => step.name === 'Summarize failed affected tests')?.run ?? '';
const excerpt = summary.slice(summary.indexOf('if [ -f "$RUNNER_TEMP/affected-test.log" ]'));

const directory = mkdtempSync(join(tmpdir(), 'ci-test-excerpt-'));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Runs the excerpt over a test log and returns what it printed. */
const runExcerpt = (log: string): string => {
  writeFileSync(join(directory, 'affected-test.log'), log);
  const result = spawnSync('bash', ['-e', '-c', excerpt], {
    encoding: 'utf8',
    env: { ...process.env, ...Object.fromEntries([['RUNNER_TEMP', directory]]) },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
};

const prefix = '\u001B[1m\u001B[94mui:\u001B[39m\u001B[22m';

describe('affected test lane failure output (F3)', () => {
  it('should stream the shard output into the log and affected-test.log', () => {
    // Whole projects, then each project's dealt `test:shard-<n>` tasks, all appended to one log.
    expect(lane).toContain(': > "$RUNNER_TEMP/affected-test.log"');
    expect(lane).toContain(
      'pnpm nx run-many -t test --projects "$projects" --parallel=1 --outputStyle=stream 2>&1 | tee -a "$RUNNER_TEMP/affected-test.log" || status=1',
    );
    expect(lane).toContain(
      'pnpm nx run-many -t $targets --projects "$project" --parallel=1 --outputStyle=stream 2>&1 | tee -a "$RUNNER_TEMP/affected-test.log" || status=1',
    );
    expect(lane).not.toContain('--outputStyle=static');
  });

  it('should print each failing test, coloured and prefixed by Nx, before the reports', () => {
    const report = Array.from({ length: 400 }, (_, index) => `${prefix} AssertionError detail ${index}`);
    const log = [
      `${prefix}  \u001B[32m✓\u001B[39m app/a.test.ts > passes`,
      `${prefix} \u001B[31m⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯\u001B[39m`,
      `${prefix}  \u001B[41m FAIL \u001B[49m app/a.test.ts > suite > first failing case`,
      ...report,
      `${prefix}  \u001B[41m FAIL \u001B[49m app/b.test.ts > suite > second failing case`,
      `${prefix}  Test Files  2 failed | 1 passed (3)`,
    ].join('\n');
    const lines = runExcerpt(`${log}\n`).split('\n');
    expect(lines.slice(0, 3)).toEqual([
      'Failing tests:',
      'ui:   FAIL  app/a.test.ts > suite > first failing case',
      'ui:   FAIL  app/b.test.ts > suite > second failing case',
    ]);
  });

  it('should say so when the log holds no FAIL line', () => {
    expect(runExcerpt('ui: vitest stopped\n').split('\n')[1]).toBe(
      'No Vitest FAIL line in the test log; see the task output above.',
    );
  });
});

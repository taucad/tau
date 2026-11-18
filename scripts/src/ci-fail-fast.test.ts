import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * Merge-queue fail-fast in `ci.yml` (CI throughput review, merge-queue ejection review MQ-7). In the merge queue
 * only, a `fail-fast-<lane>` job per required lane cancels the rest of its own run once that lane failed, and the
 * required gate `Run affected tasks` still runs in the cancelled run and ends `failure`, never skipped (GitHub
 * counts a skipped required check as passed). Pull requests and pushes run none of it.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly name?: string;
  readonly run?: string;
  readonly env?: Record<string, string>;
};
type Job = {
  readonly name?: string;
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly permissions?: Record<string, string>;
  readonly steps?: readonly Step[];
  readonly strategy?: {
    readonly 'fail-fast'?: boolean | string;
    readonly matrix?: unknown;
  };
  readonly 'timeout-minutes'?: number;
};
type Workflow = {
  readonly permissions?: unknown;
  readonly jobs: Record<string, Job>;
};

const ci = load(read('.github/workflows/ci.yml')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

const gate = ci.jobs['affected'];
const gateNeeds = (gate?.needs ?? []) as readonly string[];
/** Every job whose failure fails a required check: the gate's lanes and `Validate workspace`. */
const requiredLanes = ['workspace', ...gateNeeds];
const failFastJobs = Object.keys(ci.jobs).filter((job) => job.startsWith('fail-fast-'));

/** The state of one run that a job-level `if` reads. */
type RunState = {
  readonly event: 'pull_request' | 'push' | 'merge_group';
  readonly cancelled: boolean;
  readonly needs: Record<string, 'success' | 'failure' | 'cancelled' | 'skipped'>;
};

/**
 * Evaluates the subset of the GitHub Actions expression language these job conditions use: `&&`, `||`, `!`,
 * `==`, `!=`, parentheses, single-quoted strings, `github.event_name`, `needs.<job>.result` and the status
 * functions. Without a status function the condition is `success() && (…)`, as on GitHub.
 */
const evaluate = (condition: string, state: RunState): boolean => {
  const body = /^\$\{\{(.*)\}\}$/su.exec(condition.trim())?.[1] ?? condition;
  const tokens = body.match(/\|\||&&|==|!=|!|\(|\)|'[^']*'|[\w.()-]+\(\)|[\w.-]+/gu) ?? [];
  let index = 0;
  const failed = Object.values(state.needs).includes('failure');
  const succeeded = Object.values(state.needs).every((result) => result === 'success');
  const value = (token: string): boolean | string => {
    switch (token) {
      case 'always()': {
        return true;
      }
      case 'cancelled()': {
        return state.cancelled;
      }
      case 'failure()': {
        return failed;
      }
      case 'success()': {
        return !state.cancelled && succeeded;
      }
      case 'github.event_name': {
        return state.event;
      }
      default: {
        if (token.startsWith("'")) {
          return token.slice(1, -1);
        }
        const need = /^needs\.([\w-]+)\.result$/u.exec(token);
        if (need?.[1] !== undefined) {
          return state.needs[need[1]] ?? 'skipped';
        }
        throw new Error(`Unsupported token ${token} in ${condition}`);
      }
    }
  };
  const primary = (): boolean | string => {
    const token = tokens[index++] ?? '';
    if (token === '!') {
      return !primary();
    }
    if (token === '(') {
      const inner = or();
      index++;
      return inner;
    }
    const left = value(token);
    if (tokens[index] === '==' || tokens[index] === '!=') {
      const negate = tokens[index++] === '!=';
      return (left === value(tokens[index++] ?? '')) !== negate;
    }
    return left;
  };
  const and = (): boolean | string => {
    let left = primary();
    while (tokens[index] === '&&') {
      index++;
      const right = primary();
      left = Boolean(left) && right;
    }
    return left;
  };
  function or(): boolean | string {
    let left = and();
    while (tokens[index] === '||') {
      index++;
      const right = and();
      left = Boolean(left) || right;
    }
    return left;
  }
  const result = Boolean(or());
  const hasStatus = /\b(?:always|cancelled|failure|success)\(\)/u.test(body);
  return hasStatus ? result : !state.cancelled && succeeded && result;
};

describe('ci.yml merge-queue fail-fast (MQ-7)', () => {
  it('should give every required lane, and only those, one fail-fast job', () => {
    expect(gateNeeds.length).toBeGreaterThan(0);
    expect(failFastJobs.toSorted()).toEqual(requiredLanes.map((lane) => `fail-fast-${lane}`).toSorted());
  });

  it.each(requiredLanes)('should cancel the run when %s failed, in the merge queue only', (lane) => {
    const job = ci.jobs[`fail-fast-${lane}`];
    expect(job?.needs).toEqual([lane]);
    expect(job?.if).toBe(
      expression(`failure() && github.event_name == 'merge_group' && needs.${lane}.result == 'failure'`),
    );
    const condition = job?.if ?? '';
    // Fires on its own lane's failure in a merge-group run.
    expect(
      evaluate(condition, {
        event: 'merge_group',
        cancelled: false,
        needs: { [lane]: 'failure' },
      }),
    ).toBe(true);
    // Never on a pull request or a push, whatever failed.
    for (const event of ['pull_request', 'push'] as const) {
      expect(
        evaluate(condition, {
          event,
          cancelled: false,
          needs: { [lane]: 'failure' },
        }),
      ).toBe(false);
    }
    // Never when its lane passed, was skipped after the plan failed, or was cancelled by the sweep or another job.
    for (const result of ['success', 'skipped', 'cancelled'] as const) {
      expect(
        evaluate(condition, {
          event: 'merge_group',
          cancelled: true,
          needs: { [lane]: result },
        }),
      ).toBe(false);
    }
  });

  it('should fail a matrix lane fast in the merge queue only, so its first failed row ends it', () => {
    const matrixLanes = requiredLanes.filter((lane) => ci.jobs[lane]?.strategy?.matrix !== undefined);
    expect(matrixLanes.toSorted()).toEqual(['affected-lane', 'cli-e2e', 'e2e-queue', 'formal', 'pkgcheck']);
    for (const lane of matrixLanes) {
      // `fail-fast: true` cancels the other rows once one fails: true in the merge queue, false on pull requests and
      // pushes, which keep every row's result. (The first version had it inverted, so queue runs held their slot.)
      expect(ci.jobs[lane]?.strategy?.['fail-fast'], lane).toBe(expression("github.event_name == 'merge_group'"));
    }
  });

  it('should grant actions: write to the fail-fast jobs alone, and nothing else to them', () => {
    expect(ci.permissions).toBeUndefined();
    for (const [name, job] of Object.entries(ci.jobs)) {
      if (name.startsWith('fail-fast-')) {
        expect(job.permissions, name).toEqual({ actions: 'write' });
        expect(job['timeout-minutes'], name).toBe(5);
      } else {
        expect(job.permissions?.['actions'], name).not.toBe('write');
      }
    }
  });

  describe('cancel step', () => {
    const steps = ci.jobs['fail-fast-workspace']?.steps ?? [];
    const script = steps[0]?.run ?? '';
    const directory = mkdtempSync(join(tmpdir(), 'ci-fail-fast-'));
    afterAll(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    /** Runs the step with a stub `gh` that records its arguments and exits with `status`. */
    const runStep = (
      status: number,
    ): {
      readonly status: number | undefined;
      readonly stdout: string;
      readonly calls: string;
    } => {
      const calls = join(directory, `calls-${status}.txt`);
      writeFileSync(join(directory, 'gh'), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\nexit ${status}\n`);
      chmodSync(join(directory, 'gh'), 0o755);
      writeFileSync(calls, '');
      const result = spawnSync('bash', ['-e', '-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...Object.fromEntries([
            ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
            ['GITHUB_REPOSITORY', 'taucad/tau'],
            ['GITHUB_RUN_ID', '4242'],
          ]),
        },
      });
      return {
        status: result.status ?? undefined,
        stdout: result.stdout,
        calls: readFileSync(calls, 'utf8'),
      };
    };

    it('should be one step that every fail-fast job shares', () => {
      expect(steps).toHaveLength(1);
      expect(steps[0]?.env).toEqual(Object.fromEntries([['GH_TOKEN', expression('github.token')]]));
      for (const job of failFastJobs) {
        expect(ci.jobs[job]?.steps, job).toEqual(steps);
      }
    });

    it('should cancel its own run and no other, without force-cancel', () => {
      const result = runStep(0);
      expect(result.status).toBe(0);
      expect(result.calls).toBe('api -X POST repos/taucad/tau/actions/runs/4242/cancel\n');
      expect(result.stdout).toContain('cancelled the rest of run 4242');
      // Force-cancel would also stop the `always()` gate; the step lists no runs, so it cannot reach another.
      expect(script).not.toMatch(/force-cancel|actions\/runs\?|run_id|--paginate/u);
      expect(script.match(/actions\/runs\/\$\{GITHUB_RUN_ID\}\/cancel/gu)).toHaveLength(1);
    });

    it('should not fail when the run is already cancelling', () => {
      const result = runStep(1);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('::warning::Could not cancel run 4242');
    });
  });

  describe('required gate in a cancelled merge-queue run', () => {
    const condition = gate?.if ?? '';
    const step = gate?.steps?.[0];

    /** Runs the gate's check with every planned lane required and the given results; the rest passed. */
    const runGate = (results: Record<string, string>): number | undefined => {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(step?.env ?? {})) {
        if (key.endsWith('_REQUIRED')) {
          env[key] = 'true';
        } else if (key.endsWith('_RESULT')) {
          env[key] = 'success';
        } else {
          env[key] = '';
        }
      }
      env['EVENT'] = 'merge_group';
      env['DRAFT'] = 'false';
      Object.assign(env, results);
      return (
        spawnSync('bash', ['-e', '-c', step?.run ?? ''], {
          encoding: 'utf8',
          env: { ...process.env, ...env },
        }).status ?? undefined
      );
    };

    it('should run the gate in a cancelled merge-queue run and keep !cancelled() elsewhere', () => {
      expect(condition).toBe(expression("github.event_name == 'merge_group' && always() || !cancelled()"));
      expect(
        evaluate(condition, {
          event: 'merge_group',
          cancelled: true,
          needs: { plan: 'success' },
        }),
      ).toBe(true);
      expect(
        evaluate(condition, {
          event: 'merge_group',
          cancelled: false,
          needs: { plan: 'failure' },
        }),
      ).toBe(true);
      // Pull requests and pushes: exactly `!cancelled()`, as before.
      for (const event of ['pull_request', 'push'] as const) {
        for (const cancelled of [true, false]) {
          const needs = { plan: 'failure' } as const;
          expect(evaluate(condition, { event, cancelled, needs }), `${event} ${cancelled}`).toBe(
            evaluate(expression('!cancelled()'), { event, cancelled, needs }),
          );
        }
      }
    });

    it('should pass only when every lane passed', () => {
      expect(runGate({})).toBe(0);
    });

    it.each(Object.keys(step?.env ?? {}).filter((key) => key.endsWith('_RESULT')))(
      'should end failure when %s failed or was cancelled by fail-fast',
      (key) => {
        expect(runGate({ [key]: 'failure' })).not.toBe(0);
        expect(runGate({ [key]: 'cancelled' })).not.toBe(0);
      },
    );

    it('should end failure when a failed lane cancelled the run and every other lane reports cancelled', () => {
      const results = Object.fromEntries(
        Object.keys(step?.env ?? {})
          .filter((key) => key.endsWith('_RESULT') && key !== 'PLAN_RESULT')
          .map((key) => [key, key === 'BROWSER_RESULT' ? 'failure' : 'cancelled']),
      );
      expect(runGate(results)).not.toBe(0);
    });
  });

  it('should run no lane in the gate or a fail-fast job', () => {
    for (const job of ['affected', ...failFastJobs]) {
      expect(ci.jobs[job]?.steps?.map((step) => step.run ?? '').join('\n'), job).not.toMatch(/\bnx\b/u);
    }
  });

  it('should leave the merge-queue sweep as it was: other runs, deleted queue branches, never its own', () => {
    const sweep = read('.github/workflows/merge-queue-sweep.yml');
    expect(sweep).toContain('[ "$id" = "$GITHUB_RUN_ID" ] && continue');
    expect(sweep).toContain('if grep -qxF -- "$branch" <<< "$live"; then');
    expect(sweep).not.toContain('force-cancel');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { burnIn } from '#burn-in.js';

/*
 * FQ-10 (operator decision O6 B) in `ci.yml`: the burn-in runs on pull requests only, as part of the pull request's own
 * checks, never in the merge queue; a pull request with no changed test file gets no job; a failure fails the required
 * gate `Run affected tasks`, so branch protection needs no new check.
 */
type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
};
type Job = {
  readonly name?: string;
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly outputs?: Record<string, string>;
  readonly 'timeout-minutes'?: number;
  readonly steps?: readonly Step[];
};
const ci = load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')) as {
  readonly jobs: Record<string, Job>;
};
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
const job = ci.jobs['burn-in'];
const plan = ci.jobs['plan'];
const gate = ci.jobs['affected'];

describe('ci.yml burn-in (FQ-10)', () => {
  it('plans the burn-in from the pull request’s own added and modified files, on pull requests only', () => {
    const step = plan?.steps?.find((candidate) => candidate.id === 'burn-in');
    expect(step?.if).toBe("github.event_name == 'pull_request'");
    expect(step?.run).toContain('git diff --name-only --no-renames --diff-filter=AM --relative');
    expect(step?.run).toContain('node scripts/src/burn-in-cli.ts plan --graph "$RUNNER_TEMP/graph.json"');
    // After the step that writes the graph it reads.
    const steps = plan?.steps ?? [];
    expect(steps.findIndex((candidate) => candidate.id === 'burn-in')).toBeGreaterThan(
      steps.findIndex((candidate) => candidate.id === 'plan'),
    );
    expect(plan?.outputs?.['burn-in']).toBe(expression('steps.burn-in.outputs.burn-in'));
    expect(plan?.outputs?.['burn-in-units']).toBe(expression('steps.burn-in.outputs.burn-in-units'));
  });

  it('adds no job without a changed test file, and never runs in the merge queue or on a push', () => {
    expect(job?.needs).toBe('plan');
    expect(job?.if).toBe("github.event_name == 'pull_request' && needs.plan.outputs.burn-in == 'true'");
  });

  it('runs the planned files ten times with shuffle, capped at five minutes, with a recorded seed', () => {
    const run = job?.steps?.find((step) => step.name === 'Burn in the changed tests');
    expect(run?.env?.['UNITS']).toBe(expression('needs.plan.outputs.burn-in-units'));
    expect(run?.run).toContain(`--runs ${burnIn.runs} --minutes ${burnIn.minutes}`);
    expect(run?.run).toContain('--seed "$(( GITHUB_RUN_ID % 1000000000 ))"');
    expect(run?.run).toContain('--summary "$GITHUB_STEP_SUMMARY"');
    // The cap bounds the runs; the job's limit leaves room for setup and the targets' dependencies.
    expect(job?.['timeout-minutes']).toBeGreaterThan(burnIn.minutes);
    expect(job?.steps?.at(-1)).toMatchObject({ name: 'Upload the burn-in report', if: 'always()' });
  });

  it('fails the required gate when a planned burn-in did not pass (only a pull request plans one)', () => {
    expect(gate?.needs).toContain('burn-in');
    const check = gate?.steps?.[0];
    expect(check?.env?.['BURN_IN_REQUIRED']).toBe(expression('needs.plan.outputs.burn-in'));
    expect(check?.env?.['BURN_IN_RESULT']).toBe(expression('needs.burn-in.result'));
    expect(check?.run).toContain(
      'if [ "$BURN_IN_REQUIRED" = true ]; then test "$BURN_IN_RESULT" = success; fi',
    );
  });
});

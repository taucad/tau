import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { limits, modeVariants } from '#flake-repro.js';

/*
 * `flake-repro.yml` (FQ-7) is the flake agent's only source of proof, so its guardrails are pinned here: dispatch
 * only, a read-only token and no secrets, a gate before any setup, a per-dispatch minute cap, the kill switch that
 * needs no setup, and a harness taken from the workflow's own commit rather than the ref under test.
 */
const text = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/flake-repro.yml'), 'utf8');

type Step = {
  readonly name: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string>;
};
type Workflow = {
  readonly on: Record<
    string,
    { readonly inputs?: Record<string, { readonly type: string; readonly default?: unknown }> }
  >;
  readonly permissions: Record<string, string>;
  readonly concurrency?: unknown;
  readonly jobs: Record<
    string,
    {
      readonly 'timeout-minutes': string;
      readonly if?: string;
      readonly environment?: unknown;
      readonly permissions?: unknown;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const [job] = Object.values(workflow.jobs);
const steps = job?.steps ?? [];
/** An Actions expression, `${{ … }}`. */
const expression = (body: string): string => `\${{ ${body} }}`;
const index = (name: string): number => steps.findIndex((step) => step.name === name);

describe('flake repro workflow', () => {
  it('runs only on dispatch, with the identity, modes, attempts, seed, ref and minutes as inputs', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(workflow.on['workflow_dispatch']?.inputs ?? {})).toEqual([
      'ref',
      'project',
      'target',
      'file',
      'test',
      'modes',
      'attempts',
      'seed',
      'minutes',
      'command-index',
    ]);
    expect(text).toContain(`'Modes: ${Object.keys(modeVariants).join(', ')}; mode:variant for one variant'`);
  });

  it('only reads, with no secrets, environment or cache writes', () => {
    expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
    expect(job?.environment).toBeUndefined();
    expect(job?.permissions).toBeUndefined();
    expect(text).not.toMatch(/secrets\./u);
    expect(text).not.toContain('nx-cache-write');
    expect(steps.find((step) => step.uses === './.github/actions/setup-nx')?.with).toEqual({
      'save-pnpm-store': 'false',
    });
    for (const step of steps.filter((entry) => entry.uses && !entry.uses.startsWith('./'))) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
      expect(step.uses?.startsWith('actions/cache')).toBe(false);
    }
  });

  it('caps each dispatch at its minutes, at most the dispatch limit', () => {
    expect(job?.['timeout-minutes']).toBe(
      expression(`inputs.minutes <= ${limits.dispatchMinutes} && inputs.minutes || ${limits.dispatchMinutes}`),
    );
    expect(steps[0]?.run).toContain(`MINUTES < ${limits.dispatchMinutes} ? MINUTES : ${limits.dispatchMinutes}`);
  });

  it('gates only on FLAKE_AGENT_ENABLED not being false, so an unset variable needs no setup', () => {
    expect(job?.if).toBe("vars.FLAKE_AGENT_ENABLED != 'false'");
    expect(text.match(/FLAKE_AGENT_ENABLED/gu)?.length).toBe(2);
  });

  it('admits the run (three at once, the weekly minutes) before the setup spends any', () => {
    expect(index('Admit the run')).toBeGreaterThan(0);
    expect(index('Admit the run')).toBeLessThan(index('Setup Nx Environment'));
    expect(steps[index('Admit the run')]?.run).toContain('flake-repro-cli.ts" gate');
    expect(workflow.concurrency).toBeUndefined();
  });

  it('measures with the harness of its own commit, not the ref under test', () => {
    const harness = steps[index("Checkout the harness from this workflow's commit")];
    expect(harness?.with?.['ref']).toBe(expression('github.sha'));
    expect(steps[index('Checkout the ref under test')]?.with?.['ref']).toBe(expression('inputs.ref'));
    for (const step of steps.filter((entry) => entry.run?.includes('flake-repro-cli.ts'))) {
      expect(step.run).toContain('node "$RUNNER_TEMP/flake-repro/scripts/src/flake-repro-cli.ts"');
    }
  });

  it('passes every input through the environment and uploads the report even on failure', () => {
    const reproduce = steps[index('Reproduce')];
    expect(reproduce?.run).not.toMatch(/\$\{\{/u);
    expect(steps[index('Upload the report')]).toMatchObject({ if: 'always()' });
  });
});

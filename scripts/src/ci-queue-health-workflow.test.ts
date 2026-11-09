import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The weekly queue-health report (DC-21) only reads: it gets `actions: read` and `contents: read`, no
 * environment, so it can never reach the `nx-cache-write` token, and it posts nothing.
 */
const text = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci-queue-health.yml'), 'utf8');

type Step = { readonly uses?: string; readonly run?: string };
type Workflow = {
  readonly on: {
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly environment?: unknown;
      readonly permissions?: unknown;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;

describe('ci queue health workflow', () => {
  it('should run weekly and on dispatch', () => {
    expect(workflow.on.schedule).toEqual([{ cron: '23 7 * * 1' }]);
    expect(workflow.on.workflow_dispatch).toBeDefined();
  });

  it('should only read, with no environment and no cache-write token', () => {
    expect(workflow.permissions).toEqual({ actions: 'read', contents: 'read' });
    for (const job of Object.values(workflow.jobs)) {
      expect(job.environment).toBeUndefined();
      expect(job.permissions).toBeUndefined();
    }
    expect(text).not.toContain('nx-cache-write');
    expect(text).not.toMatch(/secrets\./u);
  });

  it('should pin every external action to a commit and run the report CLI', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    for (const step of steps.filter((entry) => entry.uses && !entry.uses.startsWith('./'))) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }
    expect(steps.some((step) => step.run?.startsWith('node scripts/src/ci-queue-health-cli.ts'))).toBe(true);
  });
});

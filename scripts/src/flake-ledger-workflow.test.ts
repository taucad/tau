import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The flake ledger ingestion (FQ-2) runs after every completed CI run, so its reach is kept to what it needs: it
 * lists runs and downloads artifacts (`actions: read`) and writes its own state branch (`contents: write`), with no
 * environment, no secret and no persisted checkout credential, and it skips a pull request's run before a runner
 * starts.
 */
const text = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/flake-ledger.yml'), 'utf8');

type Step = { readonly uses?: string; readonly run?: string; readonly with?: Record<string, unknown> };
type Workflow = {
  readonly on: {
    readonly workflow_run?: { readonly workflows: readonly string[]; readonly types: readonly string[] };
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly concurrency: { readonly group: string; readonly 'cancel-in-progress': boolean };
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly environment?: unknown;
      readonly permissions?: Record<string, string>;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const ciName = (
  load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')) as {
    name: string;
  }
).name;

describe('flake ledger workflow', () => {
  it('should run when a CI run completes, daily to catch up, and on dispatch', () => {
    expect(workflow.on.workflow_run).toEqual({ workflows: [ciName], types: ['completed'] });
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch).toBeDefined();
  });

  it('should queue one writer at a time without cancelling it', () => {
    expect(workflow.concurrency).toEqual({ group: 'flake-ledger', 'cancel-in-progress': false });
  });

  it('should ingest only the merge queue and pushes to main', () => {
    const [job] = Object.values(workflow.jobs);
    expect(job?.if).toContain("github.event.workflow_run.event == 'merge_group'");
    expect(job?.if).toContain(
      "github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main'",
    );
  });

  it('should hold only actions: read and contents: write, with no environment, secret or persisted credential', () => {
    expect(workflow.permissions).toEqual({});
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toEqual({ actions: 'read', contents: 'write' });
      expect(job.environment).toBeUndefined();
    }
    expect(text).not.toMatch(/secrets\./u);
    expect(text).not.toContain('nx-cache-write');
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    for (const step of steps.filter((entry) => entry.uses?.startsWith('actions/checkout@'))) {
      expect(step.with?.['persist-credentials']).toBe(false);
    }
  });

  it('should pin every external action, pass dispatch input through the environment and run the ingestion CLI', () => {
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    for (const step of steps.filter((entry) => entry.uses && !entry.uses.startsWith('./'))) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }
    const ingest = steps.find((step) => step.run?.startsWith('node scripts/src/ci-flake-ledger-ingest-cli.ts'));
    expect(ingest?.run).toContain('--runs "$RUNS"');
    expect(ingest?.run).not.toContain('${{');
  });

  it('should check out every module the ingestion imports', () => {
    const checkout = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .find((step) => step.uses?.startsWith('actions/checkout@'));
    const sparse = String(checkout?.with?.['sparse-checkout'] ?? '')
      .split('\n')
      .filter((line) => line !== '');
    const imported = new Set<string>(['scripts/src/ci-flake-ledger-ingest-cli.ts']);
    for (let changed = true; changed; ) {
      changed = false;
      for (const file of [...imported]) {
        const source = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
        for (const match of source.matchAll(/from '#([\w-]+)\.js'/gu)) {
          const next = `scripts/src/${match[1]}.ts`;
          if (!imported.has(next)) {
            imported.add(next);
            changed = true;
          }
        }
        expect(source, file).not.toMatch(/from '(?!node:|#)[^']+'/u);
      }
    }
    expect(sparse).toEqual(
      expect.arrayContaining([...imported, 'scripts/package.json', 'scripts/src/flake-ledger.json']),
    );
  });
});

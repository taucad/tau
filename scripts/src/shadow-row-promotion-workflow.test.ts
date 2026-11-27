import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The shadow-row promotion (FQ-13) runs after each flake-ledger ingestion. Promotion changes the gate, so it only
 * proposes: it pushes a branch and opens a pull request, with no environment, no secret, no persisted checkout
 * credential and no merge.
 */
const text = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/shadow-row-promotion.yml'), 'utf8');

type Step = { readonly uses?: string; readonly run?: string; readonly with?: Record<string, unknown> };
type Workflow = {
  readonly on: {
    readonly workflow_run?: { readonly workflows: readonly string[]; readonly types: readonly string[] };
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly concurrency?: { readonly group: string; readonly 'cancel-in-progress': boolean };
      readonly environment?: unknown;
      readonly permissions?: Record<string, string>;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const ledgerName = (
  load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/flake-ledger.yml'), 'utf8')) as {
    name: string;
  }
).name;
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

describe('shadow-row promotion workflow', () => {
  it('should run after each ledger ingestion, daily, and on dispatch', () => {
    expect(workflow.on.workflow_run).toEqual({ workflows: [ledgerName], types: ['completed'] });
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch).toBeDefined();
  });

  it('should propose one row at a time without a secret, an environment, a persisted credential or a merge', () => {
    expect(workflow.permissions).toEqual({});
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
      expect(job.environment).toBeUndefined();
      expect(job.concurrency).toEqual({ group: 'shadow-row-promotion', 'cancel-in-progress': false });
    }
    expect(text).not.toMatch(/secrets\./u);
    const code = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/auto[-_]merge|gh pr merge|\/merge\b/u);
    for (const step of steps.filter((entry) => entry.uses?.startsWith('actions/checkout@'))) {
      expect(step.with?.['persist-credentials']).toBe(false);
    }
    for (const step of steps.filter((entry) => entry.uses && !entry.uses.startsWith('./'))) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/u);
    }
    const source = readFileSync(resolve(import.meta.dirname, 'ci-shadow-rows-promote-cli.ts'), 'utf8');
    expect(source).not.toMatch(/auto_merge|\/merge'/u);
  });

  it('should check out every module the promotion imports, and every project.json', () => {
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    const listed = checkout?.with?.['sparse-checkout'];
    const sparse = (typeof listed === 'string' ? listed : '').split('\n').filter((line) => line !== '');
    const imported = new Set<string>(['scripts/src/ci-shadow-rows-promote-cli.ts']);
    // A Set's iteration visits what is added during it, so this walks the whole import graph.
    for (const file of imported) {
      const source = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8');
      for (const match of source.matchAll(/from '#([\w-]+)\.js'/gu)) {
        imported.add(`scripts/src/${match[1]}.ts`);
      }
      // Only `node:` modules and workspace-local `#` imports: the job installs nothing.
      expect(source, file).not.toMatch(/from '(?!node:|#)[^']+'/u);
    }
    for (const file of [...imported, 'scripts/package.json', 'project.json']) {
      expect(sparse).toContain(file);
    }
    expect(
      steps.find((step) => step.run?.startsWith('node scripts/src/ci-shadow-rows-promote-cli.ts'))?.run,
    ).not.toContain('${{');
  });
});

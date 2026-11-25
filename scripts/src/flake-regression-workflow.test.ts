import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * `flake-regression.yml` (FQ-12) dispatches `flake-repro.yml` and writes to issues, so its guardrails are pinned
 * here: it follows the ledger, it holds the workflow token's three scopes and no secret, one bisect runs at a time,
 * the shared kill switch stops it, and its sparse checkout carries every module the CLI imports.
 */
const workflows = resolve(import.meta.dirname, '../../.github/workflows');
const text = readFileSync(resolve(workflows, 'flake-regression.yml'), 'utf8');

type Step = { readonly name: string; readonly run?: string; readonly with?: Record<string, string> };
type Workflow = {
  readonly name: string;
  readonly on: Record<
    string,
    { readonly workflows?: string[]; readonly types?: string[]; readonly inputs?: Record<string, unknown> }
  >;
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly concurrency?: { readonly group: string; readonly 'cancel-in-progress': boolean };
      readonly 'timeout-minutes': number;
      readonly permissions?: Record<string, string>;
      readonly environment?: unknown;
      readonly steps: Step[];
    }
  >;
};
const workflow = load(text) as Workflow;
const [job] = Object.values(workflow.jobs);
const steps = job?.steps ?? [];

/** `#name.js` imports of a module under `scripts/src`, followed transitively. */
const importsOf = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const source = readFileSync(resolve(import.meta.dirname, file), 'utf8');
    for (const match of source.matchAll(/from '#([\w-]+)\.js'/gu)) {
      visit(`${match[1]}.ts`);
    }
  };
  visit(entry);
  return seen;
};

describe('flake regression workflow', () => {
  it('should run after each flake ledger ingestion, or on an operator dispatch', () => {
    const ledger = load(readFileSync(resolve(workflows, 'flake-ledger.yml'), 'utf8')) as Workflow;
    expect(Object.keys(workflow.on)).toEqual(['workflow_run', 'workflow_dispatch']);
    expect(workflow.on['workflow_run']).toEqual({ workflows: [ledger.name], types: ['completed'] });
    expect(Object.keys(workflow.on['workflow_dispatch']?.inputs ?? {})).toEqual([
      'id',
      'good',
      'bad',
      'modes',
      'dry-run',
    ]);
    expect(job?.if).toContain("github.event.workflow_run.conclusion == 'success'");
  });

  it('should hold only the workflow token, with three scopes and no secret or environment', () => {
    expect(workflow.permissions).toEqual({});
    expect(job?.permissions).toEqual({ actions: 'write', contents: 'read', issues: 'write' });
    expect(job?.environment).toBeUndefined();
    expect(text).not.toMatch(/secrets\./u);
    expect(
      steps.find((step) => step.name === 'Checkout the scripts and project roots')?.with?.['persist-credentials'],
    ).toBe(false);
  });

  it('should run one bisect at a time and stop on the flake agent kill switch', () => {
    expect(job?.concurrency).toEqual({ group: 'flake-regression', 'cancel-in-progress': false });
    expect(job?.if).toContain("vars.FLAKE_AGENT_ENABLED != 'false'");
    expect(job?.['timeout-minutes']).toBeLessThanOrEqual(360);
  });

  it('should check out every module the CLI imports, and the project roots', () => {
    const sparse = steps
      .find((step) => step.name === 'Checkout the scripts and project roots')
      ?.with?.['sparse-checkout']?.split('\n')
      .filter((line) => line !== '');
    expect(sparse).toContain('project.json');
    expect(sparse).toContain('scripts/package.json');
    for (const file of importsOf('flake-regression-cli.ts')) {
      expect(sparse).toContain(`scripts/src/${file}`);
    }
  });

  it('should dispatch flake-repro.yml only with inputs it declares', () => {
    const repro = load(readFileSync(resolve(workflows, 'flake-repro.yml'), 'utf8')) as Workflow;
    const declared = Object.keys(repro.on['workflow_dispatch']?.inputs ?? {});
    const cli = readFileSync(resolve(import.meta.dirname, 'flake-regression-cli.ts'), 'utf8');
    const dispatch = /deps\.dispatch\(\{([^}]*)\}\)/su.exec(cli)?.[1] ?? '';
    const passed = [...dispatch.matchAll(/^\s*([\w-]+):/gmu)].map((match) => match[1]);
    expect(passed.length).toBeGreaterThan(0);
    expect(passed.filter((input) => !declared.includes(input ?? ''))).toEqual([]);
  });
});

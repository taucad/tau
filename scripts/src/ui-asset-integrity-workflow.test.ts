import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The UI asset integrity WebKit-on-macOS leg runs on ready pull request heads only (Wave 0M, AF-7).
 * A draft pull request runs the Linux three-browser leg and requests no macOS runner: the matrix
 * drops the macOS leg, never a workflow-level filter. `ready_for_review` starts both legs once the
 * draft is ready, and a newer push to the head branch cancels the outdated pull request run; a
 * dispatch is never cancelled by it. The two legs, their engines and their timed engines are the
 * same as before; only when the macOS one runs moved.
 */

const root = resolve(import.meta.dirname, '../..');

type Leg = { readonly label: string; readonly runner: string; readonly engines: string; readonly timed: string };
type Workflow = {
  readonly on: {
    readonly pull_request?: { readonly types?: readonly string[]; readonly paths?: readonly string[] };
    readonly workflow_dispatch?: unknown;
  };
  readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: string | boolean };
  readonly jobs: Record<
    string,
    { readonly 'runs-on'?: string; readonly strategy?: { readonly matrix?: { readonly include?: unknown } } }
  >;
};

const workflow = load(readFileSync(resolve(root, '.github/workflows/ui-asset-integrity.yml'), 'utf8')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

/** The two `fromJSON` arguments of `fromJSON(draft && 'a' || 'b')`. */
const draftBranches = (value: unknown): { readonly draft: readonly Leg[]; readonly ready: readonly Leg[] } => {
  const text = String(value);
  expect(text).toMatch(/^\$\{\{ fromJSON\(github\.event\.pull_request\.draft\s/u);
  const literals = [...text.matchAll(/'(\[[^']*\])'/gu)].map(([, literal]) => JSON.parse(literal ?? '') as Leg[]);
  expect(literals).toHaveLength(2);
  return { draft: literals[0] ?? [], ready: literals[1] ?? [] };
};

const linux: Leg = {
  label: 'three browsers',
  runner: 'ubuntu-latest',
  engines: 'chromium,firefox,webkit',
  timed: 'chromium,firefox',
};
const mac: Leg = { label: 'WebKit on macos-26', runner: 'macos-26', engines: 'webkit', timed: 'webkit' };

describe('the UI asset integrity workflow', () => {
  it('should run again when a draft is marked ready for review', () => {
    expect(workflow.on.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review']);
  });

  it('should keep its path filter and its dispatch', () => {
    expect(workflow.on.pull_request?.paths).toContain('.github/workflows/ui-asset-integrity.yml');
    expect(workflow.on.pull_request?.paths).toContain('packages/runtime/src/framework/wasm-loader.ts');
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('should run only the Linux leg on a draft and both legs once ready', () => {
    const { integrity } = workflow.jobs;
    expect(integrity?.['runs-on']).toBe(expression('matrix.runner'));
    expect(draftBranches(integrity?.strategy?.matrix?.include)).toEqual({ draft: [linux], ready: [linux, mac] });
  });

  it('should cancel an outdated run on pull requests only, keyed on the head branch', () => {
    expect(workflow.concurrency?.group).toBe(
      `ui-asset-integrity-${expression("github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id")}`,
    );
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(expression("github.event_name == 'pull_request'"));
  });
});

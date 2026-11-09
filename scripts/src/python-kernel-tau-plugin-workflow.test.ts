import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The Python kernels' macOS golden targets run on ready pull request heads only (Wave 0M, AF-7).
 * The shared workflow seals the darwin targets on a pull request only for a caller that sets
 * `test-python`; on a draft its matrix keeps the two Linux targets and requests no macOS runner,
 * never a workflow-level filter. Each such caller re-runs on `ready_for_review`, so the darwin
 * targets run once the draft is ready, and a newer push to the head branch cancels the outdated
 * pull request run; a dispatch, which records the golden receipts, is never cancelled by it.
 */

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.github/workflows');

type Target = { readonly target: string; readonly runner: string };
type Workflow = {
  readonly on: {
    readonly pull_request?: { readonly types?: readonly string[]; readonly paths?: readonly string[] };
    readonly workflow_dispatch?: unknown;
  };
  readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: string | boolean };
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly uses?: string;
      readonly with?: Record<string, unknown>;
      readonly 'runs-on'?: string;
      readonly strategy?: { readonly matrix?: { readonly include?: unknown } };
    }
  >;
};

const workflow = (file: string): Workflow => load(readFileSync(resolve(directory, file), 'utf8')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

/** The two `fromJSON` arguments of `fromJSON(draft && 'a' || 'b')`. */
const draftBranches = (value: unknown): { readonly draft: readonly Target[]; readonly ready: readonly Target[] } => {
  const text = String(value);
  expect(text).toMatch(/^\$\{\{ fromJSON\(github\.event\.pull_request\.draft\s/u);
  const literals = [...text.matchAll(/'(\[[^']*\])'/gu)].map(([, literal]) => JSON.parse(literal ?? '') as Target[]);
  expect(literals).toHaveLength(2);
  return { draft: literals[0] ?? [], ready: literals[1] ?? [] };
};

const shared = 'python-kernel-tau-plugin.yml';
const linux: readonly Target[] = [
  { target: 'linux-x64-glibc', runner: 'ubuntu-24.04' },
  { target: 'linux-arm64-glibc', runner: 'ubuntu-24.04-arm' },
];
const darwin: readonly Target[] = [
  { target: 'darwin-arm64', runner: 'macos-26' },
  { target: 'darwin-x64', runner: 'macos-26-intel' },
];

/** Every workflow that calls the shared Python kernel workflow, with the `test-python` it passes. */
const callers = readdirSync(directory)
  .filter((file) => file.endsWith('.yml'))
  .flatMap((file) =>
    Object.values(workflow(file).jobs)
      .filter((job) => job.uses === `./.github/workflows/${shared}`)
      .map((job) => ({ file, testPython: job.with?.['test-python'] === true })),
  );

describe('the shared Python kernel golden targets', () => {
  it('should seal on dispatch, or on a pull request only for a caller that tests Python', () => {
    const { golden } = workflow(shared).jobs;
    expect(golden?.if).toBe("github.event_name == 'workflow_dispatch' || inputs.test-python");
    expect(golden?.['runs-on']).toBe(expression('matrix.runner'));
  });

  it('should seal the Linux targets only on a draft and all four once ready', () => {
    const { golden } = workflow(shared).jobs;
    expect(draftBranches(golden?.strategy?.matrix?.include)).toEqual({ draft: linux, ready: [...linux, ...darwin] });
  });

  it('should keep the generator check on every pull request, draft or not', () => {
    const { check } = workflow(shared).jobs;
    expect(check?.if).toBe("github.event_name == 'pull_request'");
    expect(check?.['runs-on']).toBe('ubuntu-24.04');
  });
});

describe('the Python kernel callers', () => {
  it('should be the kernels this row reviewed', () => {
    // A new caller that tests Python on pull requests requests macOS runners: it must join the
    // ready-for-review and cancellation checks below.
    expect(callers).toEqual([
      { file: 'build123d-tau-plugin.yml', testPython: false },
      { file: 'smlibpy-tau-plugin.yml', testPython: true },
    ]);
  });

  it.each(callers.filter(({ testPython }) => testPython).map(({ file }) => file))(
    'should run %s again when a draft is marked ready for review, and cancel only outdated pull request runs',
    (file) => {
      const { on, concurrency } = workflow(file);
      expect(on.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review']);
      expect(on.pull_request?.paths).toContain(`.github/workflows/${file}`);
      expect(on.pull_request?.paths).toContain(`.github/workflows/${shared}`);
      expect(on).toHaveProperty('workflow_dispatch');
      expect(concurrency?.group).toBe(
        `${file.replace(/\.yml$/u, '')}-${expression("github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id")}`,
      );
      expect(concurrency?.['cancel-in-progress']).toBe(expression("github.event_name == 'pull_request'"));
    },
  );
});

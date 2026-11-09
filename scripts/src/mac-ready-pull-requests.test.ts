import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The macOS rows run on ready pull request heads only (Wave 0M, AF-2). A draft pull request requests no
 * macOS runner: a job-level `if`, or a matrix that drops its macOS legs, never a workflow-level
 * filter, so a check that is required elsewhere is never left Pending. `ready_for_review` starts the
 * rows once the draft is ready, and a newer push to the head branch cancels the outdated pull request
 * run; pushes to `main`, the nightly and dispatches are never cancelled by it.
 */

const root = resolve(import.meta.dirname, '../..');

type Job = {
  readonly if?: string;
  readonly 'runs-on'?: string;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
};
type Workflow = {
  readonly on: { readonly pull_request?: { readonly types?: readonly string[] } };
  readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: string | boolean };
  readonly jobs: Record<string, Job>;
};

const workflow = (path: string): Workflow => load(readFileSync(resolve(root, path), 'utf8')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

/** The two `fromJSON` arguments of `draft && fromJSON(a) || fromJSON(b)` or `fromJSON(draft && 'a' || 'b')`. */
const draftBranches = (value: unknown): { readonly draft: unknown; readonly ready: unknown } => {
  const text = String(value);
  expect(text).toMatch(/^\$\{\{ (?:fromJSON\()?github\.event\.pull_request\.draft\s/u);
  const literals = [...text.matchAll(/'(\[[^']*\])'/gu)].map(([, literal]) => JSON.parse(literal ?? '') as unknown);
  expect(literals).toHaveLength(2);
  return { draft: literals[0], ready: literals[1] };
};

const workflows = [
  '.github/workflows/native-darwin.yml',
  '.github/workflows/desktop-packaging.yml',
  '.github/workflows/build123d-native.yml',
] as const;

describe.each(workflows)('the pull request trigger of %s', (path) => {
  const { on, concurrency } = workflow(path);

  it('should run again when a draft is marked ready for review', () => {
    expect(on.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review']);
  });

  it('should cancel an outdated run on pull requests only', () => {
    expect(concurrency?.['cancel-in-progress']).toBe(expression("github.event_name == 'pull_request'"));
  });
});

describe('macOS jobs on draft pull requests', () => {
  it('should skip the native-darwin row on a draft', () => {
    const { jobs } = workflow('.github/workflows/native-darwin.yml');
    expect(jobs['native-darwin']?.['runs-on']).toBe('macos-26');
    expect(jobs['native-darwin']?.if).toBe("needs.plan.outputs.projects != '' && !github.event.pull_request.draft");
  });

  it('should skip the DMG window preview on a draft and keep only the Linux and Windows assembly legs', () => {
    const { jobs } = workflow('.github/workflows/desktop-packaging.yml');
    expect(jobs['dmg-window-preview']?.['runs-on']).toBe('macos-26');
    expect(jobs['dmg-window-preview']?.if).toBe(
      expression("!cancelled() && needs.select.outputs.run != 'false' && !github.event.pull_request.draft"),
    );
    expect(draftBranches(jobs['assembly']?.strategy?.matrix?.['os'])).toEqual({
      draft: ['ubuntu-24.04', 'windows-2025'],
      ready: ['ubuntu-24.04', 'windows-2025', 'macos-15'],
    });
  });

  it('should keep only the Linux and Windows Build123d legs on a draft', () => {
    const { jobs } = workflow('.github/workflows/build123d-native.yml');
    const linuxAndWindows = [
      { os: 'ubuntu-24.04', target: 'linux-x64' },
      { os: 'ubuntu-24.04-arm', target: 'linux-arm64' },
      { os: 'windows-latest', target: 'win32-x64' },
    ];
    expect(draftBranches(jobs['native']?.strategy?.matrix?.['include'])).toEqual({
      draft: linuxAndWindows,
      ready: [
        { os: 'macos-15', target: 'darwin-arm64' },
        { os: 'macos-15-intel', target: 'darwin-x64' },
        ...linuxAndWindows,
      ],
    });
  });

  it.each(workflows)('should gate every macOS job of %s by job or matrix, never by the workflow', (path) => {
    const { jobs } = workflow(path);
    for (const [name, job] of Object.entries(jobs)) {
      const matrix = JSON.stringify(job.strategy?.matrix ?? {});
      const mac = /macos/u.test(job['runs-on'] ?? '') || /macos/u.test(matrix);
      if (!mac || name === 'benchmarks') {
        // The benchmark gates run only nightly and on dispatch, never on a pull request.
        continue;
      }
      expect(`${job.if ?? ''} ${matrix}`, `${path} ${name}`).toContain('github.event.pull_request.draft');
    }
  });
});

describe('outdated pull request runs', () => {
  it.each(['.github/workflows/desktop-packaging.yml', '.github/workflows/build123d-native.yml'])(
    'should key %s on the head branch for pull requests and on the run otherwise',
    (path) => {
      expect(workflow(path).concurrency?.group).toContain(
        expression("github.event_name == 'pull_request' && github.head_ref || github.run_id"),
      );
    },
  );

  it('should never cancel a native-darwin push to main, nightly or dispatch', () => {
    const { group } = workflow('.github/workflows/native-darwin.yml').concurrency ?? {};
    // Each event has its own group; pull requests are keyed per pull request.
    expect(group).toContain('github.event_name');
    expect(group).toContain('github.event.pull_request.number || github.ref');
  });
});

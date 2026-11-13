import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- Process environment keys and GitHub API fields are exact external names. */

/*
 * The release gate (CI throughput review RG-1): an uncached sweep of every project, the formal matrix with a
 * fresh seed and the cross-root read lint, on the exact commit being shipped. It starts by itself when
 * `release-build.yml` is requested for a tag and records one verdict per commit. The desktop promotion and
 * production forward deploys only read that verdict (never run or wait for the gate); a renewal, a rollback
 * and a redeploy do not read it. Only verdicts from `main`'s copy of the gate count.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly name?: string;
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly outputs?: Record<string, string>;
  readonly permissions?: Record<string, string>;
  readonly strategy?: { readonly matrix?: { readonly lane?: readonly string[] } };
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<string, { readonly inputs?: Record<string, { type?: string; required?: boolean }> }>;
  readonly env?: Record<string, string>;
  readonly concurrency?: unknown;
  readonly jobs: Record<string, Job>;
};

const gateText = read('.github/workflows/release-gate.yml');
const gate = load(gateText) as Workflow;
const actionText = read('.github/actions/release-gate-verdict/action.yml');
const action = load(actionText) as { readonly runs: { readonly steps: readonly Step[] } };
const promotion = load(read('.github/workflows/desktop-route-promotion.yml')) as Workflow;
const production = load(read('.github/workflows/deploy-production.yml')) as Workflow;
const sha = 'a'.repeat(40);

describe('release-gate.yml', () => {
  it('should start on a requested release build and on a dispatch, one run per commit at a time', () => {
    expect(Object.keys(gate.on).toSorted()).toEqual(['workflow_dispatch', 'workflow_run']);
    expect(gate.on['workflow_dispatch']?.inputs?.['ref']).toMatchObject({ type: 'string', required: true });
    expect(Object.keys(gate.on['workflow_dispatch']?.inputs ?? {})).toEqual(['ref']);
    expect(gate.on['workflow_run']).toEqual({ workflows: ['Release build'], types: ['requested'] });
    expect(gate.concurrency).toEqual({
      group: `release-gate-${expression('inputs.ref || github.event.workflow_run.head_sha')}`,
      'cancel-in-progress': false,
    });
  });

  it('should read no cache, local or remote', () => {
    expect(gate.env).toEqual({ NX_SKIP_NX_CACHE: 'true', NX_NO_CLOUD: 'true' });
    expect(gateText).not.toContain('NX_SELF_HOSTED_REMOTE_CACHE');
    expect(gateText).not.toContain('secrets.');
    expect(gateText).not.toMatch(/\bnx affected\b/u);
  });

  it('should name the gated commit once and look for its verdict before running anything', () => {
    const { reuse } = gate.jobs;
    const name = reuse?.steps?.find((step) => step.id === 'ref');
    expect(name?.env?.['REF']).toBe(expression('inputs.ref || github.event.workflow_run.head_sha'));
    const find = reuse?.steps?.find((step) => step.id === 'find');
    expect(find?.uses).toBe('./.github/actions/release-gate-verdict');
    expect(find?.with).toEqual({
      sha: expression('steps.ref.outputs.ref'),
      'github-token': expression('github.token'),
    });
    expect(reuse?.outputs).toEqual({
      ref: expression('steps.ref.outputs.ref'),
      'run-id': expression('steps.find.outputs.run-id'),
    });
  });

  it('should sweep every project in the ci.yml lanes plus the cross-root read lint', () => {
    const { sweep } = gate.jobs;
    expect(sweep?.strategy?.matrix?.lane).toEqual([
      'lint',
      'typecheck',
      'build',
      'pkgcheck-1',
      'pkgcheck-2',
      'pkgcheck-3',
      'test-1',
      'test-2',
      'test-3',
      'cross-root-reads',
    ]);
    const checkout = sweep?.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toEqual({ ref: expression('needs.reuse.outputs.ref'), 'persist-credentials': false });
    const run = sweep?.steps?.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
    expect(run).toContain('lint) pnpm nx run-many -t lint --parallel=1 ;;');
    expect(run).toContain('typecheck) pnpm nx run-many -t typecheck --parallel=1 ;;');
    expect(run).toContain('build) pnpm nx run-many -t build size check-desktop-payload --parallel=1 ;;');
    expect(run).toContain('pnpm nx run-many -t test --exclude tag:scope:api,tag:ci:quarantined');
    expect(run).toContain('cross-root-reads) pnpm nx run scripts:validate-cross-root-reads ;;');
    expect(sweep?.if).toBe("needs.reuse.result == 'success' && needs.reuse.outputs.run-id == ''");
  });

  it('should run the whole formal matrix beside the sweep, with this run id as the seed source', () => {
    const { formal } = gate.jobs;
    expect(formal?.uses).toBe('./.github/workflows/formal-nightly.yml');
    expect(formal?.needs).toEqual(['reuse']);
    expect(formal?.with).toEqual({ ref: expression('needs.reuse.outputs.ref'), seed: expression('github.run_id') });
    expect(formal?.if).toBe("needs.reuse.result == 'success' && needs.reuse.outputs.run-id == ''");
  });

  it('should name the verdict by its commit and pass only on a reuse or a green sweep and matrix', () => {
    const { verdict } = gate.jobs;
    expect(verdict?.name).toBe(
      `Release gate verdict (${expression('inputs.ref || github.event.workflow_run.head_sha')})`,
    );
    expect(verdict?.needs).toEqual(['reuse', 'sweep', 'formal']);
    expect(verdict?.if).toBe(expression('!cancelled()'));
    const script = verdict?.steps?.[0]?.run ?? '';
    const judge = (env: Record<string, string>): number | undefined =>
      spawnSync('bash', ['-c', script], { env: { PATH: process.env['PATH'] ?? '', ...env } }).status ?? undefined;
    const green = Object.fromEntries([
      ['REUSE_RESULT', 'success'],
      ['REUSED', ''],
      ['SWEEP_RESULT', 'success'],
      ['FORMAL_RESULT', 'success'],
    ]);
    expect(judge(green)).toBe(0);
    expect(judge({ ...green, SWEEP_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, FORMAL_RESULT: 'cancelled' })).not.toBe(0);
    expect(judge({ ...green, FORMAL_RESULT: 'skipped' })).not.toBe(0);
    expect(judge({ ...green, REUSE_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, REUSED: '42', SWEEP_RESULT: 'skipped', FORMAL_RESULT: 'skipped' })).toBe(0);
  });
});

describe('release-gate-verdict action', () => {
  const script = action.runs.steps[0]?.run ?? '';
  type GateRun = { id: number; head_branch: string; event: string };
  /** Runs the lookup with `gh` answering from `runs` and `jobs` (run id → jobs); returns status, output and stderr. */
  const lookup = ({
    ref,
    runs = [],
    jobs = {},
    require = 'false',
  }: {
    readonly ref: string;
    readonly runs?: readonly GateRun[];
    readonly jobs?: Record<string, ReadonlyArray<{ name: string; conclusion: string }>>;
    readonly require?: string;
  }): { status: number | undefined; output: string; stdout: string } => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-release-gate-'));
    try {
      writeFileSync(join(directory, 'runs.json'), JSON.stringify({ workflow_runs: runs }));
      writeFileSync(join(directory, 'jobs.json'), JSON.stringify(jobs));
      writeFileSync(
        join(directory, 'gh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'case "$*" in',
          '  *"/workflows/release-gate.yml/runs?"*)',
          '    filter=""; previous=""',
          '    for arg in "$@"; do [ "$previous" = --jq ] && filter=$arg; previous=$arg; done',
          '    jq -r "$filter" "$FIXTURES/runs.json" ;;',
          '  *"/jobs?"*)',
          String.raw`    run=$(printf "%s\n" "$@" | grep "/runs/" | sed -E "s#.*/runs/([0-9]+)/jobs.*#\1#")`,
          String.raw`    jq --arg run "$run" "{jobs: (.[\$run] // [])}" "$FIXTURES/jobs.json" ;;`,
          '  *) echo "unexpected gh $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      const output = join(directory, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
          ['FIXTURES', directory],
          ['GITHUB_OUTPUT', output],
          ['GH_REPO', 'taucad/tau'],
          ['SHA', ref],
          ['REQUIRE', require],
        ]),
      });
      return { status: result.status ?? undefined, output: readFileSync(output, 'utf8'), stdout: result.stdout };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  const verdict = (commit: string, conclusion: string) => [{ name: `Release gate verdict (${commit})`, conclusion }];

  it('should find a green verdict from a tag-started run or a dispatch from main', () => {
    const tagged = lookup({
      ref: sha,
      runs: [{ id: 7, head_branch: 'desktop-staging@0.2.0-staging.1', event: 'workflow_run' }],
      jobs: { '7': verdict(sha, 'success') },
    });
    expect(tagged.status).toBe(0);
    expect(tagged.output).toBe('run-id=7\n');
    const dispatched = lookup({
      ref: sha,
      runs: [{ id: 8, head_branch: 'main', event: 'workflow_dispatch' }],
      jobs: { '8': verdict(sha, 'success') },
    });
    expect(dispatched.output).toBe('run-id=8\n');
  });

  it("should ignore a red verdict, another commit's verdict and a dispatch from another branch", () => {
    const result = lookup({
      ref: sha,
      runs: [
        { id: 7, head_branch: 'main', event: 'workflow_dispatch' },
        { id: 9, head_branch: 'main', event: 'workflow_dispatch' },
        { id: 11, head_branch: 'feature', event: 'workflow_dispatch' },
      ],
      jobs: { '7': verdict(sha, 'failure'), '9': verdict('b'.repeat(40), 'success'), '11': verdict(sha, 'success') },
    });
    expect(result.status).toBe(0);
    expect(result.output).toBe('');
  });

  it('should fail with the way to get a verdict only when one is required', () => {
    const required = lookup({ ref: sha, require: 'true' });
    expect(required.status).not.toBe(0);
    expect(required.stdout).toContain(`dispatch release-gate.yml from main with ref ${sha}`);
    expect(lookup({ ref: sha }).status).toBe(0);
  });

  it('should refuse a ref that is not a full commit sha', () => {
    expect(lookup({ ref: 'main' }).status).not.toBe(0);
    expect(lookup({ ref: sha.slice(0, 12) }).status).not.toBe(0);
  });
});

describe('release gate readers', () => {
  const stepsOf = (job: Job | undefined): readonly Step[] => job?.steps ?? [];

  it('should require a verdict on the candidate commit for every desktop route promotion, and none for a renewal', () => {
    const steps = stepsOf(promotion.jobs['publication']);
    const commit = steps.find((step) => step.id === 'candidate-commit');
    const require = steps.find((step) => step.uses === './.github/actions/release-gate-verdict');
    const guard = "steps.selected.outputs.run == 'true' && inputs.operation == 'promote-routes'";
    expect(commit?.if).toBe(guard);
    expect(require?.if).toBe(guard);
    expect(require?.with).toEqual({
      sha: expression('steps.candidate-commit.outputs.sha'),
      'github-token': expression('github.token'),
      require: 'true',
    });
    // Read before any signing material is loaded or anything is published.
    const index = (name: string): number => steps.findIndex((step) => step.name === name);
    expect(steps.indexOf(require!)).toBeLessThan(index('Load protected signing inputs'));
    expect(steps.indexOf(require!)).toBeLessThan(index('Publish or renew under the shared channel lock'));
  });

  it('should require a verdict for a forward production deploy, and none for a rollback or a redeploy', () => {
    const steps = stepsOf(production.jobs['promote']);
    const require = steps.find((step) => step.uses === './.github/actions/release-gate-verdict');
    expect(require?.if).toBe("steps.release.outputs.action == 'forward'");
    expect(require?.with).toEqual({
      sha: expression('steps.release.outputs.commit'),
      'github-token': expression('github.token'),
      require: 'true',
    });
    expect(steps.indexOf(require!)).toBe(steps.findIndex((step) => step.name === 'Deploy the release at its tag') - 1);
  });

  it('should never run or wait for the gate from a reader', () => {
    for (const workflow of [promotion, production]) {
      for (const job of Object.values(workflow.jobs)) {
        expect(job.uses).not.toBe('./.github/workflows/release-gate.yml');
      }
    }
    expect(read('.github/workflows/release-build.yml')).not.toContain('release-gate');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End exact external names. */

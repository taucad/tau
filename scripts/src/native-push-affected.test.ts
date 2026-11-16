import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * The native rows' own row selection. Neither workflow has a push trigger any more (CI throughput review
 * Q-2, Q-3): `ci.yml` calls each in the merge queue and on a push the queue did not prove, with its own
 * plan's rows. native-darwin's plan takes those rows from the caller, runs every row on a dispatch, the
 * affected ones on a labelled pull request (Nx affected against the base `nrwl/nx-set-shas` exported) and
 * none on the nightly, which runs only the benchmark gates; native-hosts' plan serves its nightly and a
 * dispatch with every row. The scripts run here with `pnpm` stubbed, so each event's selection is pinned by
 * behaviour, not by text.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly id?: string;
  readonly if?: string;
  readonly run?: string;
  readonly env?: Record<string, string>;
};
type Workflow = {
  readonly jobs: { readonly plan: { readonly steps: readonly Step[] } };
};

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

const darwinPath = '.github/workflows/native-darwin.yml';
const hostsPath = '.github/workflows/native-hosts.yml';

const step = (path: string, id: string): Step => {
  const workflow = load(readFileSync(resolve(root, path), 'utf8')) as Workflow;
  const found = workflow.jobs.plan.steps.find((candidate) => candidate.id === id);
  expect(found, `${path} plan step ${id}`).toBeDefined();
  return found!;
};

const stubs = mkdtempSync(join(tmpdir(), 'tau-native-push-'));
afterAll(() => {
  rmSync(stubs, { recursive: true, force: true });
});

// `gh` prints the successful push runs' head shas, newest first; `git merge-base --is-ancestor`
// succeeds for the shas in ANCESTORS; `git diff --quiet` records its arguments and exits DIFF_EXIT
// (0, no change, by default); `pnpm nx show projects` records its arguments and answers
// AFFECTED_* for `--affected`, ALL_* otherwise (HOSTS_* for the `--projects` query).
writeFileSync(
  join(stubs, 'gh'),
  '#!/bin/sh\necho "gh $*" >> "$CALLS"\n[ -n "$GH_FAIL" ] && exit 1\nprintf "%s\\n" $RUNS\n',
  {
    mode: 0o700,
  },
);
writeFileSync(
  join(stubs, 'git'),
  [
    '#!/bin/sh',
    'if [ "$1 $2" = "diff --quiet" ]; then echo "git $*" >> "$CALLS"; exit "$DIFF_EXIT"; fi',
    '[ "$1 $2 $4" = "merge-base --is-ancestor $GITHUB_SHA" ] || exit 2',
    'for a in $ANCESTORS; do [ "$a" = "$3" ] && exit 0; done',
    'exit 1',
    '',
  ].join('\n'),
  { mode: 0o700 },
);
writeFileSync(
  join(stubs, 'pnpm'),
  [
    '#!/bin/sh',
    'echo "pnpm $*" >> "$CALLS"',
    'echo "nx log line"',
    'case "$*" in',
    '  *--affected*--projects*) echo "$AFFECTED_HOSTS" ;;',
    '  *--projects*) echo "$ALL_HOSTS" ;;',
    '  *--affected*) echo "$AFFECTED" ;;',
    '  *) echo "$ALL" ;;',
    'esac',
    '',
  ].join('\n'),
  { mode: 0o700 },
);

type Run = {
  readonly status: number | undefined;
  readonly outputs: Record<string, string>;
  readonly calls: string;
};

const run = (script: string, env: ReadonlyArray<readonly [string, string]>): Run => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-native-push-run-'));
  try {
    const output = join(directory, 'output');
    const calls = join(directory, 'calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: Object.fromEntries([
        ['PATH', `${stubs}:${process.env['PATH'] ?? ''}`],
        ['GITHUB_OUTPUT', output],
        ['GITHUB_REPOSITORY', 'taucad/tau'],
        ['GITHUB_SHA', 'head'],
        ['CALLS', calls],
        ['DIFF_EXIT', '0'],
        ...env,
      ]),
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    return {
      status: result.status ?? undefined,
      outputs,
      calls: readFileSync(calls, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('native-darwin row selection', () => {
  const planStep = step(darwinPath, 'plan');
  const plan = planStep.run ?? '';
  const select = (event: string, called: readonly [string, string] = ['', '']) =>
    run(plan, [
      ['GITHUB_EVENT_NAME', event],
      ['CALLED_REF', called[0]],
      ['CALLED_PROJECTS', called[1]],
      ['BENCHMARKS', 'false'],
      ['ALL', '["build123d","cli","picogk"]'],
      ['AFFECTED', '["cli"]'],
    ]);

  it('should take the rows from the caller when ci.yml or the candidate gate calls it (Q-2)', () => {
    const queue = select('merge_group', ['head', 'cli,picogk']);
    expect(queue.status).toBe(0);
    expect(queue.outputs['projects']).toBe('cli,picogk');
    expect(queue.calls).not.toContain('test:native-darwin');
    // The candidate gate passes no rows, only the benchmarks.
    const candidate = run(plan, [
      ['GITHUB_EVENT_NAME', 'workflow_run'],
      ['CALLED_REF', 'candidate'],
      ['CALLED_PROJECTS', ''],
      ['BENCHMARKS', 'true'],
      ['ALL', '["build123d","picogk"]'],
    ]);
    expect(candidate.outputs).toMatchObject({ projects: '', benchmarks: 'build123d,picogk' });
    expect(candidate.calls).toContain('nx show projects --with-target benchmark-native --json');
    expect(planStep.env?.['CALLED_REF']).toBe(expression('inputs.ref'));
    expect(planStep.env?.['CALLED_PROJECTS']).toBe(expression('inputs.projects'));
  });

  it('should run every row on a dispatch', () => {
    const result = select('workflow_dispatch');
    expect(result.outputs['projects']).toBe('build123d,cli,picogk');
    expect(result.calls).not.toContain('--affected');
  });

  it('should keep Nx affected against the exported base on a labelled pull request', () => {
    const result = select('pull_request');
    expect(result.outputs['projects']).toBe('cli');
    expect(result.calls).toContain('nx show projects --affected --with-target test:native-darwin --json');
    expect(result.calls).not.toContain('--base=');
  });

  it('should run on no push, and on a pull request only while it carries the native-darwin label', () => {
    const workflow = load(readFileSync(resolve(root, darwinPath), 'utf8')) as {
      readonly on: Record<string, unknown>;
      readonly jobs: Record<string, { readonly if?: string; readonly steps?: readonly Step[] }>;
    };
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'workflow_call', 'workflow_dispatch']);
    expect(workflow.jobs['plan']?.if).toBe(
      "github.event_name != 'pull_request' || " +
        "(contains(github.event.pull_request.labels.*.name, 'native-darwin') && " +
        "(github.event.action != 'labeled' || github.event.label.name == 'native-darwin') && " +
        "github.triggering_actor != 'dependabot[bot]')",
    );
    expect(workflow.jobs['plan']?.steps?.some((candidate) => candidate.id === 'push-base')).toBe(false);
  });

  it("should list this workflow and every oracle source outside the native closure as ci.yml's lane paths", () => {
    const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
      readonly jobs: Record<string, { readonly steps?: readonly Step[] }>;
    };
    const lanePaths = ci.jobs['plan']?.steps?.find((candidate) => candidate.id === 'plan')?.env?.[
      'NATIVE_DARWIN_LANE_PATHS'
    ];
    const paths = JSON.parse(lanePaths ?? '[]') as readonly string[];
    expect(paths).toContain(darwinPath);
    expect(paths).toContain('libs/tau-examples/src/standalone/picogk');
    const oracle = readFileSync(resolve(root, 'scripts/src/check-standalone-project.ts'), 'utf8');
    const sources = [
      'scripts/src/check-standalone-project.ts',
      ...[...oracle.matchAll(/from '\.\.\/\.\.\/([^']+)'/gu)].map(([, path]) => path ?? ''),
      ...[...oracle.matchAll(/from '#([\w-]+)\.js'/gu)].map(([, name]) => `scripts/src/${name ?? ''}.ts`),
    ];
    // `libs/types` is in the closure of every native project, so Nx affected already covers it.
    expect(sources.filter((path) => !path.startsWith('libs/types/') && !paths.includes(path))).toEqual([]);
  });
});

describe('native-hosts row selection', () => {
  const plan = step(hostsPath, 'plan');

  // The native-hosts workflow has no push trigger (Q-3): `ci.yml` calls it in the merge queue and on a push the queue
  // did not prove, with its own plan's rows, so the plan here serves a dispatch only (the drift check's or a manual one).
  it('should run every row and every test:native-linux project', () => {
    const result = run(plan.run!, [['ALL', '["picogk"]']]);
    expect(result.status).toBe(0);
    expect(result.outputs).toMatchObject({ linux: 'true', intel: 'true', 'native-linux': 'picogk' });
    expect(result.calls).toContain('nx show projects --with-target test:native-linux');
    expect(result.calls).not.toContain('--affected');
  });

  it('should run on no pull request or push, and skip its plan when ci.yml calls it', () => {
    const workflow = load(readFileSync(resolve(root, hostsPath), 'utf8')) as {
      readonly on: Record<string, unknown>;
      readonly jobs: Record<string, { readonly if?: string; readonly steps?: readonly Step[] }>;
    };
    expect(Object.keys(workflow.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(workflow.jobs['plan']?.if).toBe("inputs.intel == ''");
    expect(workflow.jobs['plan']?.steps?.some((candidate) => candidate.id === 'push-base')).toBe(false);
  });
});

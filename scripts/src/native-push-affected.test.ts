import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

/*
 * The push-to-`main` native rows run only for affected work (Wave 0M, AF-1): the plan selects the
 * projects affected since the newest successful push run of the same workflow on `main`, and every
 * project when there is none. Dispatches (and native-hosts' nightly) keep every row; native-darwin's
 * pull requests keep Nx affected against the base `nrwl/nx-set-shas` exported. native-hosts has no push
 * or pull request trigger (Q-3): `ci.yml` calls it with its own plan's rows. The scripts run here with `gh`,
 * `git` and `pnpm` stubbed, so each event's selection is pinned by behaviour, not by text.
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

describe.each([darwinPath])('the push base of %s', (path) => {
  const base = step(path, 'push-base');

  it('should look up only on a push, through this workflow file', () => {
    expect(base.if).toBe("github.event_name == 'push'");
    expect(base.env?.['WORKFLOW']).toBe(basename(path));
    expect(base.env?.['GH_TOKEN']).toBe(expression('github.token'));
    expect(step(path, 'plan').env?.['PUSH_BASE']).toBe(expression('steps.push-base.outputs.sha'));
  });

  it('should query successful push runs of this workflow on main', () => {
    const { calls } = run(base.run!, [
      ['WORKFLOW', basename(path)],
      ['RUNS', ''],
      ['ANCESTORS', ''],
    ]);
    expect(calls).toContain(`actions/workflows/${basename(path)}/runs?branch=main&event=push&status=success`);
  });

  it.each([
    {
      name: 'the newest ancestor',
      runs: 'gone older oldest',
      ancestors: 'older oldest',
      expected: 'older',
    },
    {
      name: 'not this commit itself (a re-run)',
      runs: 'head older',
      ancestors: 'head older',
      expected: 'older',
    },
    {
      name: 'none when no run is an ancestor',
      runs: 'gone',
      ancestors: '',
      expected: '',
    },
    {
      name: 'none when there is no successful run',
      runs: '',
      ancestors: '',
      expected: '',
    },
  ])('should pick $name', ({ runs, ancestors, expected }) => {
    const result = run(base.run!, [
      ['WORKFLOW', basename(path)],
      ['RUNS', runs],
      ['ANCESTORS', ancestors],
    ]);
    expect(result.status).toBe(0);
    expect(result.outputs['sha']).toBe(expected);
  });

  it('should fall back to no base when the API fails', () => {
    const result = run(base.run!, [
      ['WORKFLOW', basename(path)],
      ['RUNS', 'older'],
      ['ANCESTORS', 'older'],
      ['GH_FAIL', '1'],
    ]);
    expect(result.status).toBe(0);
    expect(result.outputs['sha']).toBe('');
  });
});

describe('native-darwin row selection', () => {
  const planStep = step(darwinPath, 'plan');
  const plan = planStep.run ?? '';
  const fullRowPaths = planStep.env?.['FULL_ROW_PATHS'] ?? '';
  const select = (event: string, pushBase = '', diffExit = '0') =>
    run(plan, [
      ['GITHUB_EVENT_NAME', event],
      ['PUSH_BASE', pushBase],
      ['BENCHMARKS', 'false'],
      ['FULL_ROW_PATHS', fullRowPaths],
      ['DIFF_EXIT', diffExit],
      ['ALL', '["build123d","cli","picogk"]'],
      ['AFFECTED', '["cli"]'],
    ]);

  it('should run every row when a push changes this workflow or a nuget oracle source', () => {
    const result = select('push', 'older', '1');
    expect(result.outputs['projects']).toBe('build123d,cli,picogk');
    expect(result.calls).toContain(`git diff --quiet older head -- ${fullRowPaths}`);
    expect(result.calls).not.toContain('--affected');
  });

  it('should list this workflow and every oracle source outside the native closure as full-row paths', () => {
    const paths = fullRowPaths.split(' ');
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

  it('should run only the rows affected since the last successful push run on a push to main', () => {
    const result = select('push', 'older');
    expect(result.outputs['projects']).toBe('cli');
    expect(result.calls).toContain(
      'nx show projects --affected --base=older --head=head --with-target test:native-darwin --json',
    );
  });

  it('should run no row when a push to main affects none', () => {
    const result = run(plan, [
      ['GITHUB_EVENT_NAME', 'push'],
      ['PUSH_BASE', 'older'],
      ['BENCHMARKS', 'false'],
      ['ALL', '["build123d","cli","picogk"]'],
      ['AFFECTED', '[]'],
    ]);
    expect(result.status).toBe(0);
    expect(result.outputs['projects']).toBe('');
  });

  it.each([
    ['push', ''],
    ['workflow_dispatch', ''],
  ])('should run every row on %s with base %j', (event, pushBase) => {
    const result = select(event, pushBase);
    expect(result.outputs['projects']).toBe('build123d,cli,picogk');
    expect(result.calls).not.toContain('--affected');
  });

  it('should keep Nx affected against the exported base on a pull request', () => {
    const result = select('pull_request');
    expect(result.outputs['projects']).toBe('cli');
    expect(result.calls).toContain('nx show projects --affected --with-target test:native-darwin --json');
    expect(result.calls).not.toContain('--base=');
  });

  it('should select no row on the nightly, which runs only the gates', () => {
    expect(select('schedule').outputs['projects']).toBe('');
  });
});

describe('native-hosts row selection', () => {
  const plan = step(hostsPath, 'plan');

  // The native-hosts workflow has no push trigger (Q-3): `ci.yml` calls it in the merge queue and on a push the queue
  // did not prove, with its own plan's rows, so the plan here serves the nightly and a dispatch only.
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
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_call', 'workflow_dispatch']);
    expect(workflow.jobs['plan']?.if).toBe("inputs.intel == ''");
    expect(workflow.jobs['plan']?.steps?.some((candidate) => candidate.id === 'push-base')).toBe(false);
  });
});

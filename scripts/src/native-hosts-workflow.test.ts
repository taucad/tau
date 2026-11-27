import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * ST-3 (lane budget, operator approval 2026-11-18): the native rows run one job per host and project, so
 * the slowest job is one project's checks rather than all of them in series. In one job each, darwin-x64
 * took 24.9 / 28.8 min (p50 / p90), darwin-arm64 17.4 / 20.4 and linux-x64 9.7 / 11.3. These tests pin
 * that every check of the old single job runs in exactly one of the new jobs, after the steps it needs,
 * and that the queue's required check still needs every job.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly run?: string;
  readonly env?: Record<string, string>;
};
type Job = {
  readonly name?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly with?: Record<string, string>;
  readonly secrets?: unknown;
  readonly env?: Record<string, string>;
  readonly needs?: string | readonly string[];
  readonly 'runs-on'?: string;
  readonly strategy?: {
    readonly 'fail-fast'?: boolean;
    readonly matrix?: { readonly include?: ReadonlyArray<Record<string, string>>; readonly project?: unknown };
  };
  readonly steps?: readonly Step[];
};
type Workflow = { readonly jobs: Record<string, Job> };

const workflow = (name: string): Workflow =>
  load(readFileSync(resolve(root, `.github/workflows/${name}.yml`), 'utf8')) as Workflow;
const hosts = workflow('native-hosts');
const darwin = workflow('native-darwin');
const staging = workflow('release-desktop-staging');

/**
 * Whether a step runs in a matrix row, reading only its `matrix.*` comparisons joined by `&&`; any other
 * term (`steps.*`, `github.*`, `!cancelled()`) is taken as true, since it does not depend on the row.
 */
const runsIn = (step: Step, row: Record<string, string>): boolean =>
  (step.if ?? '')
    .replaceAll(/^\$\{\{\s*|\s*\}\}$/gu, '')
    .split('&&')
    .every((term) => {
      const match = /matrix\.(\w+)\s*(==|!=)\s*'([^']*)'/u.exec(term);
      if (!match) {
        return true;
      }
      const [, key = '', operator, value] = match;
      return operator === '==' ? row[key] === value : row[key] !== value;
    });

/** The names of the steps a matrix row runs, in order. */
const stepsOf = (job: Job | undefined, row: Record<string, string>): string[] =>
  (job?.steps ?? []).filter((step) => runsIn(step, row)).map((step) => step.name ?? '');

/** Every row's projects and steps, keyed `<target> (<project>)`. */
const linuxRows = (hosts.jobs['linux']?.strategy?.matrix?.include ?? []).map((row) => ({
  key: `${row['target'] ?? ''} (${row['project'] ?? ''})`,
  target: row['target'] ?? '',
  steps: stepsOf(hosts.jobs['linux'], row),
}));
const intelProjects = hosts.jobs['intel']?.strategy?.matrix?.project as readonly string[];
const intelRows = intelProjects.map((project) => ({
  key: `darwin-x64 (${project})`,
  target: 'darwin-x64',
  steps: stepsOf(hosts.jobs['intel'], { project }),
}));

/** The check steps of the old single job per host, each of which must run in exactly one new job. */
const checks: Record<string, readonly string[]> = {
  'linux-x64-glibc': [
    'Prepare Build123d with tau prepare',
    'Run the Build123d suites',
    'Accept glibc 2.28 selection and refuse musl',
    'Refuse a host without libGL',
  ],
  'linux-arm64-glibc': ['Prepare Build123d with tau prepare', 'Run the Build123d suites'],
  'darwin-x64': [
    'Prepare Build123d with tau prepare',
    'Run the Build123d suites',
    'Refuse PicoGK on Intel and an undeclared forced target',
  ],
};

describe('native host rows, one job per host and project', () => {
  it('should run a build123d and a cli job on each Linux host and three projects on darwin-x64', () => {
    expect(linuxRows.map((row) => row.key)).toEqual([
      'linux-x64-glibc (build123d)',
      'linux-x64-glibc (cli)',
      'linux-arm64-glibc (build123d)',
      'linux-arm64-glibc (cli)',
    ]);
    expect(intelProjects).toEqual(['build123d', 'cli', 'picogk']);
    expect(hosts.jobs['linux']?.name).toBe(`Native kernels on \${{ matrix.target }} (\${{ matrix.project }})`);
    expect(hosts.jobs['intel']?.name).toBe(`Native kernels on darwin-x64 (\${{ matrix.project }})`);
    for (const job of ['linux', 'intel', 'native-linux']) {
      expect(hosts.jobs[job]?.strategy?.['fail-fast'], job).toBe(false);
    }
  });

  it.each(Object.entries(checks))('should run every %s check in exactly one job', (target, names) => {
    const rows = [...linuxRows, ...intelRows].filter((row) => row.target === target);
    for (const name of names) {
      expect(
        rows.filter((row) => row.steps.includes(name)).map((row) => row.key),
        name,
      ).toHaveLength(1);
    }
    // No row runs a check of the old job that is not in the list.
    const all = new Set(rows.flatMap((row) => row.steps));
    for (const name of Object.values(checks).flat()) {
      if (all.has(name)) {
        expect(names, `${target} ${name}`).toContain(name);
      }
    }
  });

  it('should build the CLI before each check that runs it and fill the seed before each that reads it', () => {
    const cliChecks = new Set([
      'Prepare Build123d with tau prepare',
      'Accept glibc 2.28 selection and refuse musl',
      'Refuse a host without libGL',
      'Refuse PicoGK on Intel and an undeclared forced target',
    ]);
    const seedChecks = new Set([
      'Prepare Build123d with tau prepare',
      'Run the Build123d suites',
      'Refuse a host without libGL',
    ]);
    for (const row of [...linuxRows, ...intelRows]) {
      for (const check of row.steps.filter((name) => cliChecks.has(name))) {
        expect(row.steps.indexOf('Build the CLI'), `${row.key} ${check}`).toBeGreaterThanOrEqual(0);
        expect(row.steps.indexOf('Build the CLI')).toBeLessThan(row.steps.indexOf(check));
      }
      for (const check of row.steps.filter((name) => seedChecks.has(name))) {
        const seed = row.steps.indexOf('Fill the seed from the pinned origins');
        expect(seed, `${row.key} ${check}`).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(row.steps.indexOf(check));
      }
      // A row builds the CLI only when one of its checks runs it.
      if (row.steps.includes('Build the CLI')) {
        expect(
          row.steps.some((name) => cliChecks.has(name)),
          row.key,
        ).toBe(true);
      }
    }
    // The Linux rows keep the sandbox prerequisites, which the kernel sandbox and libGL check use.
    for (const row of linuxRows) {
      expect(row.steps, row.key).toContain('Setup Linux sandbox prerequisites');
    }
  });

  it('should list the test:native-linux projects from the same selection as the Build123d rows', () => {
    const list = hosts.jobs['native-linux-rows'];
    expect(list?.if).toBe(hosts.jobs['linux']?.if);
    const script = list?.steps?.find((step) => step.id === 'list')?.run ?? '';
    const filter = /jq -cn --arg list "\$NATIVE_LINUX" '([^']+)'/u.exec(script)?.[1] ?? '';
    const deal = (value: string): unknown =>
      JSON.parse(execFileSync('jq', ['-cn', '--arg', 'list', value, filter], { encoding: 'utf8' }));
    expect(deal('picogk')).toEqual(['picogk']);
    expect(deal('a,b')).toEqual(['a', 'b']);
    expect(deal('')).toEqual([]);
  });

  it('should run each test:native-linux project in a linux-x64 job of its own, after the sandbox setup', () => {
    const rows = hosts.jobs['native-linux'];
    expect(rows?.needs).toEqual(['native-linux-rows']);
    expect(rows?.['runs-on']).toBe('ubuntu-24.04');
    expect(rows?.name).toBe(`Native kernels on linux-x64-glibc (\${{ matrix.project }})`);
    expect(rows?.strategy?.matrix?.project).toBe(`\${{ fromJSON(needs.native-linux-rows.outputs.projects) }}`);
    const names = (rows?.steps ?? []).map((step) => step.name);
    expect(names.indexOf('Setup Linux sandbox prerequisites')).toBeLessThan(
      names.indexOf('Run the linux-x64 native rows'),
    );
    const run = rows?.steps?.find((step) => step.id === 'rows');
    expect(run?.env?.['PROJECTS']).toBe(`\${{ matrix.project }}`);
    expect(run?.run).toContain('pnpm nx run-many -t test:native-linux --projects "$PROJECTS"');
    // No Build123d row runs the native-linux projects any more.
    expect(linuxRows.flatMap((row) => row.steps)).not.toContain('Run the linux-x64 native rows');
  });
});

/**
 * Whether a job of `native-hosts.yml` runs when called with `inputs`: its `if` evaluated with the plan job
 * skipped (a call skips it, so its outputs are empty) and `native-linux-rows` succeeding with one project when
 * it runs. Only the expression forms this workflow uses are supported; anything else fails the evaluation.
 */
const runsWhenCalled = (name: string, inputs: Record<string, string>): boolean => {
  const job = hosts.jobs[name];
  const listRuns = name === 'native-linux' ? runsWhenCalled('native-linux-rows', inputs) : true;
  const source = (job?.if ?? 'true')
    .replaceAll(/^\$\{\{\s*|\s*\}\}$/gu, '')
    .replaceAll('!cancelled()', 'true')
    .replaceAll(/inputs\.([\w-]+)/gu, (_, key: string) => JSON.stringify(inputs[key] ?? ''))
    .replaceAll(/needs\.plan\.outputs\.[\w-]+/gu, "''")
    .replaceAll('needs.native-linux-rows.result', listRuns ? "'success'" : "'skipped'")
    .replaceAll('needs.native-linux-rows.outputs.projects', `'["picogk"]'`)
    .replaceAll('==', '===');
  expect(source, `${name}: ${source}`).toMatch(/^[\s\w'"[\]&|()!=]*$/u);
  // The pinned workflow's own `if`, checked above to hold only literals, comparisons and logic.
  const result: unknown = runInNewContext(source);
  return Boolean(result);
};

/** The `<host> (<project>)` rows and their steps that run when `native-hosts.yml` is called with `inputs`. */
const rowsWhenCalled = (inputs: Record<string, string>) => [
  ...(runsWhenCalled('linux', inputs) ? linuxRows : []),
  ...(runsWhenCalled('intel', inputs) ? intelRows : []),
  ...(runsWhenCalled('native-linux', inputs)
    ? [{ key: 'linux-x64-glibc (native-linux)', target: 'native-linux' }]
    : []),
];

/*
 * INTEL-1 (operator approval 2026-11-18, ping 2, as MAC-X left the queue in tau #2505): the darwin-x64 rows were the
 * merge queue's slowest jobs (cli 33.2, build123d 29.6, picogk 25.6 min p95) and leave it for the desktop candidate
 * gate, which runs every one of their checks on the candidate's own commit before its tag exists.
 */
describe('darwin-x64 rows at the desktop candidate gate, not in the merge queue (INTEL-1)', () => {
  const call = Object.values(workflow('ci').jobs).filter((job) => job.uses === './.github/workflows/native-hosts.yml');
  const gate = staging.jobs['intel-native'];

  it('should call the Linux rows alone from ci.yml, so the merge queue runs no darwin-x64 row', () => {
    expect(call).toHaveLength(1);
    expect(call[0]?.with?.['hosts']).toBe('linux');
    expect(call[0]?.with).not.toHaveProperty('intel');
    const rows = rowsWhenCalled(call[0]?.with ?? {});
    expect(rows.map((row) => row.key)).toEqual([...linuxRows.map((row) => row.key), 'linux-x64-glibc (native-linux)']);
    expect(rows.filter((row) => row.target === 'darwin-x64')).toEqual([]);
    expect(hosts.jobs['intel']?.['runs-on']).toBe('macos-26-intel');
    expect(hosts.jobs['linux']?.['runs-on']).not.toContain('macos');
  });

  it('should run every darwin-x64 check of the old queue job exactly once at the candidate gate, and nothing else', () => {
    expect(gate?.uses).toBe('./.github/workflows/native-hosts.yml');
    const rows = rowsWhenCalled(gate?.with ?? {});
    expect(rows.map((row) => row.key)).toEqual(intelProjects.map((project) => `darwin-x64 (${project})`));
    const steps = intelRows.flatMap((row) => row.steps);
    for (const check of checks['darwin-x64'] ?? []) {
      expect(
        steps.filter((name) => name === check),
        check,
      ).toHaveLength(1);
    }
    expect(intelProjects).toEqual(['build123d', 'cli', 'picogk']);
  });

  it('should check out the candidate commit, uncached, beside the shell gate', () => {
    expect(gate?.name).toBe('Intel native gate');
    expect(gate?.needs).toEqual(['prerelease']);
    expect(gate?.if).toBe("needs.prerelease.outputs.release == 'true'");
    expect(gate?.with).toEqual({ hosts: 'intel', ref: `\${{ needs.prerelease.outputs.sha }}` });
    // No cache token: the called workflow has no remote cache server, and every Nx task runs fresh.
    expect(gate?.secrets).toBeUndefined();
    expect(hosts.jobs['intel']?.env?.['NX_SKIP_NX_CACHE']).toBe(`\${{ inputs.hosts == 'intel' }}`);
    for (const job of ['plan', 'linux', 'native-linux', 'intel']) {
      const checkout = hosts.jobs[job]?.steps?.find((step) => step.name === 'Checkout') as
        | { readonly with?: Record<string, unknown> }
        | undefined;
      expect(checkout?.with?.['ref'], job).toBe(`\${{ inputs.ref }}`);
    }
  });

  it('should tag no candidate without a green Intel native gate on its own commit', () => {
    const { tag } = staging.jobs;
    expect(tag?.needs).toContain('intel-native');
    expect(tag?.if).toContain("needs.intel-native.result == 'success'");
    expect(tag?.steps?.find((step) => step.id === 'release')?.run).toMatch(
      /^\s*Intel native gate: run \$\{RUN_ID\}$/mu,
    );
  });

  it('should keep every row on a dispatch', () => {
    const plan = hosts.jobs['plan']?.steps?.find((step) => step.id === 'plan')?.run ?? '';
    expect(plan).toContain('echo "linux=true"');
    expect(plan).toContain('echo "intel=true"');
    expect(hosts.jobs['intel']?.if).toContain("needs.plan.outputs.intel == 'true'");
  });
});

describe('native darwin rows, one job per project', () => {
  const { 'native-darwin': rows, nuget } = darwin.jobs;

  it('should run each selected test:native-darwin project in a darwin-arm64 job of its own', () => {
    expect(rows?.name).toBe(`Native kernels on darwin-arm64 (\${{ matrix.project }})`);
    expect(rows?.strategy?.['fail-fast']).toBe(false);
    expect(rows?.strategy?.matrix?.project).toBe(`\${{ fromJSON(needs.plan.outputs.rows) }}`);
    const run = rows?.steps?.find((step) => step.id === 'rows');
    expect(run?.env?.['PROJECTS']).toBe(`\${{ matrix.project }}`);
    expect(run?.run).toContain('pnpm nx run-many -t test:native-darwin --projects "$PROJECTS"');
    const names = (rows?.steps ?? []).map((step) => step.name);
    expect(names).not.toContain('Check every nuget template outside Tau');
    expect(names).not.toContain('Install the .NET 10 SDK');
  });

  it('should run the nuget row once, in a job of its own with the same selection, whether or not the rows pass', () => {
    expect(nuget?.name).toBe('Standalone nuget projects on darwin-arm64');
    expect(nuget?.if).toBe(rows?.if);
    expect(nuget?.needs).toEqual(['plan']);
    expect(nuget?.['runs-on']).toBe('macos-26');
    const names = (nuget?.steps ?? []).map((step) => step.name);
    expect(names.indexOf('Install the .NET 10 SDK')).toBeLessThan(
      names.indexOf('Check every nuget template outside Tau'),
    );
    const checks = Object.values(darwin.jobs).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.run?.includes('check-standalone-project.ts --ecosystem nuget')),
    );
    expect(checks).toHaveLength(1);
  });
});

describe('the queue gate', () => {
  it('should require every job of both called workflows', () => {
    const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as Workflow;
    const script = Object.values(ci.jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? '')
      .join('\n');
    expect(script).toContain('if [ "$NATIVE_HOSTS_REQUIRED" = true ]; then test "$NATIVE_HOSTS_RESULT" = success; fi');
    expect(script).toContain(
      'if [ "$NATIVE_DARWIN_REQUIRED" = true ]; then test "$NATIVE_DARWIN_RESULT" = success; fi',
    );
  });
});

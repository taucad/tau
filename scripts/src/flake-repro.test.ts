/* eslint-disable @typescript-eslint/naming-convention -- Environment variable names and GitHub REST JSON fields. */
import { describe, expect, it } from 'vitest';

import {
  admit,
  attemptPlan,
  browsersFor,
  binomialCdf,
  exactInterval,
  findPolluter,
  limits,
  namePattern,
  parseModes,
  pollutionUnits,
  proofRuns,
  renderSummary,
  resolveLauncher,
  splitCommand,
  summarizeRow,
  testOutcome,
  unavailable,
  wilsonInterval,
} from '#flake-repro.js';
import type { Attempt, GateRun, PlanOptions, Report, VitestJsonReport } from '#flake-repro.js';

const options: PlanOptions = {
  seed: 10,
  file: '/repo/app/src/a.test.ts',
  test: 'group does (a) thing',
  copies: 4,
  faketimeLibrary: '/usr/lib/faketime/libfaketime.so.1',
  taskset: true,
  netPreload: '/repo/out/flake-repro/net-preload.mjs',
  netLatency: 250,
  heapMb: 256,
  year: 2026,
  projectFilters: ['src/a.test.ts', 'src/b.test.ts'],
};

describe('rate intervals', () => {
  it('computes the Wilson score interval', () => {
    const none = wilsonInterval(0, 100);
    expect(none.lower).toBe(0);
    expect(none.upper).toBeCloseTo(0.037, 4);
    const five = wilsonInterval(5, 100);
    expect(five.lower).toBeCloseTo(0.0215, 3);
    expect(five.upper).toBeCloseTo(0.1118, 3);
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
    const all = wilsonInterval(10, 10);
    expect(all.upper).toBe(1);
    expect(all.lower).toBeCloseTo(10 / 13.8415, 3);
  });

  it('computes the Clopper–Pearson exact interval', () => {
    const none = exactInterval(0, 100);
    expect(none.lower).toBe(0);
    expect(none.upper).toBeCloseTo(1 - 0.025 ** (1 / 100), 6);
    const five = exactInterval(5, 100);
    expect(five.lower).toBeCloseTo(0.0164, 4);
    expect(five.upper).toBeCloseTo(0.1128, 4);
    const all = exactInterval(7, 7);
    expect(all.upper).toBe(1);
    expect(all.lower).toBeCloseTo(0.025 ** (1 / 7), 6);
    expect(exactInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
  });

  it('sums the binomial distribution', () => {
    expect(binomialCdf(0, 10, 0.5)).toBeCloseTo(1 / 1024, 10);
    expect(binomialCdf(5, 10, 0.5)).toBeCloseTo(638 / 1024, 10);
    expect(binomialCdf(-1, 10, 0.5)).toBe(0);
    expect(binomialCdf(10, 10, 0.5)).toBe(1);
    expect(binomialCdf(3, 10, 0)).toBe(1);
    expect(binomialCdf(3, 10, 1)).toBe(0);
    expect(binomialCdf(20, 5000, 0.01)).toBeLessThan(1e-5);
  });

  it('asks for the passes that bound a reproduced rate under 1 %, at least 100', () => {
    expect(proofRuns(0, 100)).toBeUndefined();
    expect(proofRuns(5, 100)).toBe(100);
    expect(proofRuns(1, 100)).toBe(459);
    expect(proofRuns(3, 3)).toBe(100);
  });
});

describe('parseModes', () => {
  it('expands a mode to its variants and keeps the table order', () => {
    expect(parseModes('shuffle, repeat suite:file')).toEqual([
      { mode: 'repeat', variant: 'alone' },
      { mode: 'suite', variant: 'file' },
      { mode: 'shuffle', variant: 'file' },
      { mode: 'shuffle', variant: 'project' },
    ]);
    expect(parseModes('repeat,repeat:alone')).toHaveLength(1);
  });

  it('rejects unknown modes, variants and an empty list', () => {
    expect(() => parseModes('stress')).toThrow('unknown mode `stress`');
    expect(() => parseModes('cpu:hot')).toThrow('unknown variant `cpu:hot`');
    expect(() => parseModes(' , ')).toThrow('no mode given');
  });
});

describe('attemptPlan', () => {
  const plan = (key: string, index = 0) => {
    const [mode, variant] = key.split(':') as [never, string];
    return attemptPlan({ mode, variant }, index, options);
  };
  const alone = [options.file, '--testNamePattern', String.raw`^(?:group does \(a\) thing)$`];

  it('runs the test alone with its seed in the environment', () => {
    expect(plan('repeat:alone', 3)).toEqual({
      seed: 13,
      args: alone,
      env: { TAU_FLAKE_REPRO_SEED: '13', TAU_FLAKE_REPRO_ATTEMPT: '3' },
      nodeOptions: [],
      wrapper: [],
      copies: 1,
      cpuStress: false,
    });
  });

  it('widens to the file and to the target suite', () => {
    expect(plan('suite:file').args).toEqual([options.file]);
    expect(plan('suite:project').args).toEqual(['src/a.test.ts', 'src/b.test.ts']);
  });

  it('shuffles over consecutive seeds', () => {
    expect(plan('shuffle:file', 2).args).toEqual([options.file, '--sequence.shuffle', '--sequence.seed=12']);
    expect(plan('shuffle:project').args).toEqual([
      '--no-file-parallelism',
      'src/a.test.ts',
      'src/b.test.ts',
      '--sequence.shuffle',
      '--sequence.seed=10',
    ]);
  });

  it('builds the contention, parallel, clock, network and memory variants', () => {
    expect(plan('cpu:stress')).toMatchObject({ args: alone, cpuStress: true });
    expect(plan('cpu:pinned').wrapper).toEqual(['taskset', '-c', '0']);
    expect(plan('parallel:copies')).toMatchObject({ args: [...alone, '--file-parallelism'], copies: 4 });
    expect(attemptPlan({ mode: 'parallel', variant: 'copies' }, 0, { ...options, copies: 1 }).copies).toBe(2);
    expect(plan('clock:tz-plus14').env['TZ']).toBe('Pacific/Kiritimati');
    expect(plan('clock:tz-minus11').env['TZ']).toBe('Pacific/Pago_Pago');
    expect(plan('clock:year-end').env).toMatchObject({
      LD_PRELOAD: options.faketimeLibrary,
      FAKETIME: '@2026-12-31 23:59:50',
      FAKETIME_DONT_FAKE_MONOTONIC: '1',
      TZ: 'UTC',
    });
    expect(plan('clock:dst').env).toMatchObject({ FAKETIME: '@2026-03-08 01:59:50', TZ: 'America/New_York' });
    expect(attemptPlan({ mode: 'clock', variant: 'dst' }, 0, { ...options, year: 2027 }).env['FAKETIME']).toBe(
      '@2027-03-14 01:59:50',
    );
    expect(plan('net:latency')).toMatchObject({
      env: { TAU_FLAKE_REPRO_NET_LATENCY_MS: '250' },
      nodeOptions: ['--import=file:///repo/out/flake-repro/net-preload.mjs'],
    });
    expect(plan('mem:tight-heap').nodeOptions).toEqual(['--max-old-space-size=256', '--max-semi-space-size=1']);
  });

  it('names the variants this machine cannot run', () => {
    const bare = { ...options, faketimeLibrary: undefined, taskset: false };
    expect(unavailable({ mode: 'clock', variant: 'year-end' }, bare)).toMatch(/libfaketime/u);
    expect(unavailable({ mode: 'clock', variant: 'tz-plus14' }, bare)).toBeUndefined();
    expect(unavailable({ mode: 'cpu', variant: 'pinned' }, bare)).toMatch(/taskset/u);
    expect(unavailable({ mode: 'cpu', variant: 'pinned' }, options)).toBeUndefined();
  });

  it('matches exactly the named tests', () => {
    const pattern = new RegExp(namePattern(['a (b)', 'c.d']), 'u');
    expect(pattern.test('a (b)')).toBe(true);
    expect(pattern.test('c.d')).toBe(true);
    expect(pattern.test('cxd')).toBe(false);
    expect(pattern.test('a (b) more')).toBe(false);
  });
});

describe('reading a Vitest report', () => {
  /** As Vitest writes it, `null` included. */
  const report = JSON.parse(`{
    "testResults": [
      {
        "name": "/repo/a.test.ts",
        "assertionResults": [
          { "fullName": "x", "status": "passed" },
          { "fullName": "y", "status": "failed", "failureMessages": ["boom"] },
          { "fullName": "z", "status": "failed", "failureMessages": null },
          { "fullName": "w", "status": "skipped" }
        ]
      },
      { "name": "/repo/b.test.ts", "assertionResults": [] }
    ]
  }`) as VitestJsonReport;

  it('finds the outcome of the target test', () => {
    expect(testOutcome(report, '/repo/a.test.ts', 'x')).toEqual({ outcome: 'passed' });
    expect(testOutcome(report, '/repo/a.test.ts', 'y')).toEqual({ outcome: 'failed', message: 'boom' });
    expect(testOutcome(report, '/repo/a.test.ts', 'z')).toEqual({ outcome: 'failed' });
    expect(testOutcome(report, '/repo/a.test.ts', 'w')).toEqual({ outcome: 'missing' });
    expect(testOutcome(report, '/repo/c.test.ts', 'x')).toEqual({ outcome: 'missing' });
    expect(testOutcome(undefined, '/repo/a.test.ts', 'x')).toEqual({ outcome: 'error' });
  });

  it('lists the polluter candidates of each scope', () => {
    expect(pollutionUnits(report, { file: '/repo/a.test.ts', test: 'x', scope: 'file' })).toEqual(['y', 'z']);
    expect(pollutionUnits(report, { file: '/repo/a.test.ts', test: 'x', scope: 'project' })).toEqual([
      '/repo/b.test.ts',
    ]);
    expect(pollutionUnits(undefined, { file: '/repo/a.test.ts', test: 'x', scope: 'file' })).toEqual([]);
  });
});

describe('findPolluter', () => {
  const units = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('bisects to the one unit that makes the victim fail', async () => {
    const result = await findPolluter(units, async (set) => set.includes('f'));
    expect(result).toEqual({ polluter: 'f', candidates: ['f'], probes: 6 });
  });

  it('reports the candidates when the pollution needs two units', async () => {
    const result = await findPolluter(units, async (set) => set.includes('a') && set.includes('g'));
    expect(result.polluter).toBeUndefined();
    expect(result.candidates).toEqual(units);
    expect(result.note).toMatch(/needs both/u);
  });

  it('stops when the budget runs out or nothing else ran', async () => {
    const spent = await findPolluter(units, async () => undefined);
    expect(spent.note).toMatch(/budget/u);
    const alone = await findPolluter([], async () => true);
    expect(alone.note).toMatch(/no other test/u);
    const innocent = await findPolluter(['a'], async () => false);
    expect(innocent.note).toMatch(/did not reproduce/u);
    let calls = 0;
    const late = await findPolluter(['a', 'b'], async () => (++calls === 1 ? true : undefined));
    expect(late.note).toMatch(/budget/u);
  });
});

describe('summarizeRow and renderSummary', () => {
  const attempt = (index: number, outcome: Attempt['outcome'], durationMs = 1000): Attempt => ({
    index,
    seed: 100 + index,
    outcome,
    durationMs,
    ...(outcome === 'failed' ? { message: 'x'.repeat(2000), log: `out/a-${index}.log` } : {}),
  });

  it('counts failures, crashes and timeouts over the attempts that ran the test', () => {
    const row = summarizeRow(
      { mode: 'repeat', variant: 'alone' },
      [
        attempt(0, 'passed', 500),
        attempt(1, 'failed', 3000),
        attempt(2, 'timeout', 9000),
        attempt(3, 'missing', 100),
        attempt(4, 'passed', 700),
      ],
      { planned: 6 },
    );
    expect(row).toMatchObject({
      attempts: 4,
      failures: 2,
      rate: 0.5,
      proofRuns: 100,
      outcomes: { passed: 2, failed: 1, timeout: 1, missing: 1 },
      seeds: [100, 101, 102, 103, 104],
      failingSeeds: [101, 102],
      durationMs: { total: 13_300, median: 700, p90: 9000, max: 9000 },
      truncated: true,
    });
    expect(row.firstFailures[0]?.message).toHaveLength(1000);
    expect(row.firstFailures[1]).toEqual({ index: 2, seed: 102, outcome: 'timeout' });
    expect(summarizeRow({ mode: 'mem', variant: 'tight-heap' }, [], { planned: 5, unavailable: 'no' })).toMatchObject({
      attempts: 0,
      rate: 0,
      truncated: false,
      durationMs: { median: 0, max: 0 },
    });
  });

  it('renders the rows, the unavailable variants and the polluter', () => {
    const rows = [
      summarizeRow(
        { mode: 'shuffle', variant: 'file' },
        Array.from({ length: 12 }, (_, index) => attempt(index, 'failed')),
        { planned: 12, polluter: { polluter: 'order polluter', candidates: ['order polluter'], probes: 4 } },
      ),
      summarizeRow({ mode: 'shuffle', variant: 'project' }, [attempt(0, 'failed')], {
        planned: 1,
        polluter: { polluter: undefined, candidates: ['a', 'b'], probes: 3, note: 'neither half fails alone' },
      }),
      summarizeRow({ mode: 'clock', variant: 'dst' }, [], { planned: 4, unavailable: 'libfaketime is not installed' }),
      summarizeRow({ mode: 'repeat', variant: 'alone' }, [attempt(0, 'passed')], { planned: 2 }),
    ];
    const report: Report = {
      schema: 'flake-repro/1',
      identity: { project: 'p', target: 'test', file: 'src/a.test.ts', test: 'victim' },
      ref: 'main',
      sha: '0123456789abcdef',
      seed: 1,
      attemptsPerVariant: 12,
      startedAt: '',
      finishedAt: '',
      minutes: 2.25,
      launcher: { cwd: '.', command: ['vitest'], prepare: [] },
      environment: {},
      rows,
      verdict: 'reproduced',
      truncated: true,
    };
    const text = renderSummary(report);
    expect(text).toContain('## Flake reproduction: reproduced');
    expect(text).toContain('Ref `main` (0123456789ab), seed 1, 12 attempts per variant, 2.3 min, **cut short');
    expect(text).toContain('| `shuffle:file` | 12 / 12 | 100.0 % |');
    expect(text).toContain('100, 101, 102, 103, 104, 105, 106, 107, 108, 109, …');
    expect(text).toContain('| `clock:dst` | not run: libfaketime is not installed |');
    expect(text).toContain('| `repeat:alone` (cut short) | 0 / 1 | 0.0 % |');
    expect(text).toContain('**Polluter (`shuffle:file`):** `order polluter`, isolated in 4 probes.');
    expect(text).toContain('not isolated after 3 probes; neither half fails alone (2 candidates left)');
    expect(
      renderSummary({ ...report, verdict: 'not-reproduced', ref: undefined, sha: undefined, truncated: false }),
    ).toContain('Ref `HEAD` (unknown), seed 1, 12 attempts per variant, 2.3 min.');
  });
});

describe('admit', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const run = (id: number, status: string, [minutesAgo, minutes]: readonly [number, number]): GateRun => ({
    id,
    status,
    created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    run_started_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    updated_at: new Date(now.getTime() - (minutesAgo - minutes) * 60_000).toISOString(),
  });

  it('admits under three earlier runs going and under the weekly minutes', () => {
    const decision = admit(
      [run(1, 'completed', [600, 60]), run(2, 'in_progress', [30, 0]), run(9, 'in_progress', [1, 0])],
      9,
      now,
    );
    expect(decision).toMatchObject({ admitted: true, ahead: [2] });
    expect(decision.weekMinutes).toBeCloseTo(90, 6);
  });

  it('refuses a fourth concurrent run, but not one that started after this one', () => {
    const going = [run(1, 'in_progress', [5, 0]), run(2, 'queued', [4, 0]), run(3, 'waiting', [3, 0])];
    expect(admit([...going, run(4, 'in_progress', [1, 0])], 4, now)).toMatchObject({
      admitted: false,
      ahead: [1, 2, 3],
    });
    expect(
      admit([run(1, 'in_progress', [5, 0]), run(2, 'in_progress', [4, 0]), run(5, 'queued', [1, 0])], 4, now).admitted,
    ).toBe(true);
  });

  it('refuses once the week has used its minutes', () => {
    const runs = Array.from({ length: 30 }, (_, index) => run(index + 1, 'completed', [6000 - index * 120, 100]));
    const decision = admit(runs, 99, now);
    expect(decision.admitted).toBe(false);
    expect(decision.reason).toContain(`limit ${limits.weeklyMinutes}`);
    const unstarted = admit(
      [{ id: 1, status: 'completed', created_at: now.toISOString(), updated_at: now.toISOString() }],
      2,
      now,
    );
    expect(unstarted.weekMinutes).toBe(0);
  });
});

describe('resolveLauncher', () => {
  const roots = { workspace: '/repo', project: '/repo/apps/e2e' };
  const at = (file: string, commandIndex?: number) => ({
    ...roots,
    file,
    ...(commandIndex === undefined ? {} : { commandIndex }),
  });

  it('reads an inferred Vitest target', () => {
    expect(
      resolveLauncher(
        { executor: 'nx:run-commands', options: { cwd: 'apps/e2e', command: 'vitest' } },
        at('apps/e2e/a.test.ts'),
      ),
    ).toEqual({ cwd: '/repo/apps/e2e', args: [], filters: [], env: {}, prepare: [] });
  });

  it('keeps the target flags, splits off its file filters and the flags it owns, and runs its build first', () => {
    const launcher = resolveLauncher(
      {
        executor: 'nx:run-commands',
        options: {
          cwd: '{projectRoot}',
          env: { TAU_FLAG: 'on' },
          commands: [
            { command: 'pnpm --dir ../.. exec nx run ui:build' },
            'vitest run --config vitest.config.ts --project chromium --retry 0 --reporter=verbose --testNamePattern "cloud tier|^N1: " src/a.spec.ts --outputFile.json=x.json',
            'pnpm --dir ../.. exec vitest run --project firefox src/b.spec.ts',
          ],
        },
      },
      at('apps/e2e/src/b.spec.ts'),
    );
    expect(launcher).toEqual({
      cwd: '/repo',
      args: ['--project', 'firefox'],
      filters: ['src/b.spec.ts'],
      env: { TAU_FLAG: 'on' },
      prepare: ['pnpm --dir ../.. exec nx run ui:build'],
    });
    const first = resolveLauncher(
      {
        executor: 'nx:run-commands',
        options: { commands: ['vitest run -t x --run src/a.spec.ts', 'vitest src/b.spec.ts'] },
      },
      at('apps/e2e/src/c.spec.ts'),
    );
    expect(first).toMatchObject({ cwd: '/repo', args: [], filters: ['src/a.spec.ts'] });
    expect(
      resolveLauncher(
        { executor: 'nx:run-commands', options: { commands: ['vitest src/a.spec.ts', 'vitest src/b.spec.ts'] } },
        at('apps/e2e/src/a.spec.ts', 1),
      ).filters,
    ).toEqual(['src/b.spec.ts']);
  });

  it('refuses a target that does not run plain Vitest', () => {
    expect(() => resolveLauncher({ executor: '@nx/jest:jest' }, at('a.test.ts'))).toThrow('only nx:run-commands');
    expect(() => resolveLauncher({}, at('a.test.ts'))).toThrow('executor is unset');
    expect(() =>
      resolveLauncher({ executor: 'nx:run-commands', options: { command: 'node x.mts && vitest' } }, at('a.test.ts')),
    ).toThrow('no plain `vitest` command');
    expect(() =>
      resolveLauncher({ executor: 'nx:run-commands', options: { command: 'jest' } }, at('a.test.ts')),
    ).toThrow('no plain `vitest` command');
    expect(() =>
      resolveLauncher({ executor: 'nx:run-commands', options: { command: 'vitest' } }, at('a.test.ts', 3)),
    ).toThrow('command 3 of the target is not a Vitest command');
  });

  it('names the browsers a launcher selects', () => {
    expect(
      browsersFor({ args: ['--project', 'chromium', '--project=firefox', '--project', 'node', '--config'] }),
    ).toEqual(['chromium', 'firefox']);
    expect(browsersFor({ args: ['--project'] })).toEqual([]);
  });

  it('splits a command without running shell syntax', () => {
    expect(splitCommand(`vitest -t "a b" 'c d' e`)).toEqual(['vitest', '-t', 'a b', 'c d', 'e']);
    expect(() => splitCommand('vitest $(whoami)')).toThrow('shell syntax');
    expect(() => splitCommand('a; b')).toThrow('shell syntax');
  });
});

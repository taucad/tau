import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutcomeRecording } from '#outcome-reporter.js';
import { OutcomeReporter } from '#outcome-reporter.js';
import type { QuarantineEntry } from '#quarantine.js';
import { utcDay } from '#quarantine.js';
import type { VerdictInput, VerdictTest } from '#quarantine-verdict.js';
import { decideVerdict, QuarantineVerdict } from '#quarantine-verdict.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */

const packageRoot = dirname(import.meta.dirname);
const today = utcDay();
const daysFromToday = (days: number): string => utcDay(new Date(Date.now() + days * 86_400_000));

const quarantineEntry = (test: string, overrides: Partial<QuarantineEntry> = {}): QuarantineEntry => ({
  test,
  owner: 'rifont',
  issue: 2787,
  class: 'race',
  created: today,
  expires: daysFromToday(14),
  evidence: '2 flake events in 61 executions',
  ...overrides,
});

describe('decideVerdict', () => {
  const test = (name: string, state: string, overrides: Partial<VerdictTest> = {}): VerdictTest => ({
    file: 'src/a.test.ts',
    name,
    state,
    browser: undefined,
    ...overrides,
  });
  const input = (overrides: Partial<VerdictInput>): VerdictInput => ({
    tests: [],
    executedFiles: new Set(['src/a.test.ts']),
    otherFailures: [],
    entries: [],
    os: 'linux',
    target: 'test',
    recorded: () => true,
    ...overrides,
  });

  it('passes when every failure is a recorded quarantined failure, and fails on any other', () => {
    const entry = quarantineEntry('src/a.test.ts > quarantined');
    const quarantined = test('quarantined', 'failed');
    expect(decideVerdict(input({ tests: [test('passes', 'passed'), quarantined], entries: [entry] }))).toEqual({
      pass: true,
      excused: [{ test: quarantined, entry }],
      gating: [],
    });

    const verdict = decideVerdict(
      input({ tests: [quarantined, test('real', 'failed')], entries: [entry], otherFailures: ['interrupted'] }),
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.gating).toEqual([
      'interrupted',
      'src/a.test.ts > real failed and no valid quarantine entry covers it',
    ]);
  });

  it('fails a quarantined failure the outcome file does not hold', () => {
    const verdict = decideVerdict(
      input({
        tests: [test('quarantined', 'failed')],
        entries: [quarantineEntry('src/a.test.ts > quarantined')],
        recorded: () => false,
      }),
    );
    expect(verdict).toEqual({
      pass: false,
      excused: [],
      gating: ['src/a.test.ts > quarantined is quarantined, but the outcome file holds no record of its failure'],
    });
  });

  it('applies an entry only to its variant', () => {
    const entry = quarantineEntry('src/a.test.ts > quarantined', { variant: { browser: 'webkit' } });
    const inChromium = test('quarantined', 'failed', { browser: 'chromium' });
    expect(decideVerdict(input({ tests: [inChromium], entries: [entry] })).pass).toBe(false);
    expect(
      decideVerdict(input({ tests: [test('quarantined', 'failed', { browser: 'webkit' })], entries: [entry] })).pass,
    ).toBe(true);
  });

  it('fails an entry that matches no test of a file the run executed, and ignores files it did not run', () => {
    const stale = quarantineEntry('src/a.test.ts > renamed away');
    expect(decideVerdict(input({ tests: [test('passes', 'passed')], entries: [stale] })).gating).toEqual([
      'quarantine entry "src/a.test.ts > renamed away" (#2787) matches no test in src/a.test.ts',
    ]);
    const elsewhere = quarantineEntry('src/b.test.ts > not run here');
    expect(decideVerdict(input({ tests: [test('passes', 'passed')], entries: [elsewhere] })).pass).toBe(true);
    const otherBrowser = quarantineEntry('src/a.test.ts > renamed away', { variant: { browser: 'webkit' } });
    expect(decideVerdict(input({ tests: [test('passes', 'passed')], entries: [otherBrowser] })).pass).toBe(true);
  });
});

type FakeModule = Parameters<QuarantineVerdict['onTestRunEnd']>[0][number];

const fakeModule = (
  moduleId: string,
  cases: Array<{
    name: string;
    state: string;
    browser?: { enabled?: boolean; name?: string };
  }>,
  errors: { module?: string[]; suite?: string[] } = {},
): FakeModule => ({
  moduleId,
  errors: () => (errors.module ?? []).map((message) => ({ message })),
  children: {
    allTests: () =>
      cases.map((testCase) => ({
        fullName: testCase.name,
        project: { config: { browser: testCase.browser } },
        result: () => ({ state: testCase.state }),
      })),
    allSuites: () => [{ fullName: 'suite', errors: () => (errors.suite ?? []).map((name) => ({ name })) }],
  },
});

describe('QuarantineVerdict', () => {
  let workspace: string;
  let projectRoot: string;
  let recording: OutcomeRecording;
  let lines: string[];
  let exitCodeBefore: typeof process.exitCode;

  const execution = { hash: 'hash-1', run: 101, attempt: 1, job: 'lane', sha: 'abc' };

  beforeEach(() => {
    exitCodeBefore = process.exitCode;
    workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-verdict-'));
    projectRoot = join(workspace, 'packages', 'example');
    mkdirSync(projectRoot, { recursive: true });
    const file = join(workspace, 'out', 'test-results', 'example', 'test.outcomes.jsonl');
    mkdirSync(dirname(file), { recursive: true });
    recording = { file, workspaceRoot: workspace, projectRoot, project: 'example', target: 'test:shard-1', execution };
    lines = [];
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeQuarantine = (entries: unknown[]): void => {
    writeFileSync(join(projectRoot, 'quarantine.json'), JSON.stringify({ entries }));
  };

  const writeOutcomes = (rows: Array<Record<string, unknown>>): void => {
    writeFileSync(recording.file, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  };

  const failedRow = (file: string, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    kind: 'test',
    file,
    name,
    state: 'failed',
    ...execution,
    ...overrides,
  });

  const verdict = (
    env: Record<string, string> = {},
    vitest?: Parameters<QuarantineVerdict['onInit']>[0],
  ): QuarantineVerdict => {
    const reporter = new QuarantineVerdict(
      { recording },
      { env, log: (line) => lines.push(line), now: () => new Date() },
    );
    reporter.onInit(vitest ?? { config: {} });
    process.exitCode = undefined;
    reporter.onTestRunStart();
    return reporter;
  };

  /** Vitest's own step: a failed run sets the exit code before `onTestRunEnd`. */
  const end = (
    reporter: QuarantineVerdict,
    modules: FakeModule[],
    run: { unhandled?: Array<{ message?: string }>; reason?: 'passed' | 'failed' | 'interrupted' } = {},
  ): typeof process.exitCode => {
    const { unhandled = [], reason = 'failed' } = run;
    reporter.onTestModuleEnd();
    if (reason !== 'passed' || unhandled.length > 0) {
      process.exitCode = 1;
    }
    reporter.onTestRunEnd(modules, unhandled, reason);
    const code = process.exitCode;
    process.exitCode = exitCodeBefore;
    return code;
  };

  const spikeModule = (real = false): FakeModule =>
    fakeModule(join(projectRoot, 'src', 'a.test.ts'), [
      { name: 'passes', state: 'passed' },
      { name: 'quarantined', state: 'failed' },
      ...(real ? [{ name: 'real', state: 'failed' }] : []),
    ]);

  it('passes a run whose only failure is quarantined and recorded, with a notice and a summary row', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined'), { kind: 'test', state: 'passed' }]);
    const summary = join(workspace, 'summary.md');
    const reporter = verdict({ GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary });
    expect(end(reporter, [spikeModule()])).toBe(0);
    expect(lines[0]).toMatch(
      /^::notice title=Quarantined failure::quarantined failure, non-gating, #2787 \(race, owner rifont, expires [\d-]+\): src\/a.test.ts > quarantined$/,
    );
    expect(lines[1]).toBe('quarantine: 1 quarantined failure(s) did not gate; every other test passed');
    expect(readFileSync(summary, 'utf8')).toContain('| example | src/a.test.ts > quarantined | #2787 | race |');
  });

  it('fails when an unquarantined test fails too', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined'), failedRow('src/a.test.ts', 'real')]);
    expect(end(verdict(), [spikeModule(true)])).toBe(1);
    expect(lines[0]).toMatch(/^quarantine: quarantined failure, non-gating, #2787 /);
    expect(lines.at(-1)).toBe(
      'quarantine: gating: src/a.test.ts > real failed and no valid quarantine entry covers it',
    );
  });

  it('counts a missing or unreadable outcome file, or a row of another execution, as a failure', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    expect(end(verdict(), [spikeModule()])).toBe(1);
    expect(lines.at(-1)).toBe(
      'quarantine: gating: src/a.test.ts > quarantined is quarantined, but the outcome file holds no record of its failure',
    );

    writeFileSync(recording.file, '{"kind":"test"}\nnot json\n');
    expect(end(verdict(), [spikeModule()])).toBe(1);

    writeOutcomes([failedRow('src/a.test.ts', 'quarantined', { attempt: 2 })]);
    expect(end(verdict(), [spikeModule()])).toBe(1);

    // Outside GitHub Actions the identifiers are absent, and the recorder writes them as null.
    recording = {
      ...recording,
      execution: { hash: 'hash-1', run: undefined, attempt: undefined, job: undefined, sha: undefined },
    };
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined', { run: null, attempt: null, job: null, sha: null })]);
    expect(end(verdict(), [spikeModule()])).toBe(0);
  });

  it('counts an expired entry as a failure and says it was not honoured', () => {
    writeQuarantine([
      quarantineEntry('src/a.test.ts > quarantined', { created: daysFromToday(-20), expires: daysFromToday(-6) }),
    ]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    expect(end(verdict({ GITHUB_ACTIONS: 'true' }), [spikeModule()])).toBe(1);
    expect(lines[0]).toMatch(/^::warning title=Quarantine entry not honoured::.*expired on/);
    expect(end(verdict(), [spikeModule()])).toBe(1);
    expect(lines.at(-1)).toMatch(/^quarantine: not honoured: .*expired on/);
  });

  it('fails an entry for an executed file that matches no test, even when every test passed', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > renamed away')]);
    const modules = [fakeModule('src/a.test.ts', [{ name: 'passes', state: 'passed' }])];
    expect(end(verdict(), modules, { reason: 'passed' })).toBe(1);
    expect(lines).toEqual([
      'quarantine: gating: quarantine entry "src/a.test.ts > renamed away" (#2787) matches no test in src/a.test.ts',
    ]);
  });

  it('keeps a run failed on a module, suite or unhandled error, an interruption or a coverage run', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    const file = join(projectRoot, 'src', 'a.test.ts');
    const cases = [{ name: 'quarantined', state: 'failed' }];
    expect(end(verdict(), [fakeModule(file, cases, { module: ['boom'] })])).toBe(1);
    expect(end(verdict(), [fakeModule(file, cases, { suite: ['HookError'] })])).toBe(1);
    expect(lines).toContain('quarantine: gating: src/a.test.ts > suite failed in a hook: HookError');
    expect(end(verdict(), [spikeModule()], { unhandled: [{ message: 'late' }, {}] })).toBe(1);
    expect(lines.at(-1)).toBe('quarantine: gating: 2 unhandled error(s): late; Error');
    expect(end(verdict(), [spikeModule()], { reason: 'interrupted' })).toBe(1);
    expect(end(verdict({}, { config: { coverage: { enabled: true } } }), [spikeModule()])).toBe(1);
    expect(lines.at(-1)).toMatch(/coverage is on/);
    expect(end(verdict({}, { config: { coverage: { enabled: true, reportOnFailure: true } } }), [spikeModule()])).toBe(
      0,
    );
  });

  it('never lowers an exit code set before the run ended', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    const reporter = verdict();
    process.exitCode = 1;
    reporter.onTestModuleEnd();
    reporter.onTestRunEnd([spikeModule()], [], 'failed');
    expect(process.exitCode).toBe(1);
  });

  it('honours a browser variant and ignores a summary it cannot write', () => {
    writeQuarantine([
      quarantineEntry('src/a.test.ts > quarantined', { variant: { browser: 'webkit', target: 'test' } }),
    ]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    const module = (name: string): FakeModule =>
      fakeModule(join(projectRoot, 'src', 'a.test.ts'), [
        { name: 'quarantined', state: 'failed', browser: { enabled: true, name } },
      ]);
    expect(end(verdict({ GITHUB_STEP_SUMMARY: workspace }), [module('webkit')])).toBe(0);
    expect(end(verdict(), [module('chromium')])).toBe(1);
  });

  it('leaves the exit code alone with nothing quarantined, and when recording or the run is off', () => {
    const failing = [spikeModule()];
    expect(end(verdict(), failing)).toBe(1);
    expect(lines).toEqual([]);
    expect(
      end(verdict(), [fakeModule('src/a.test.ts', [{ name: 'passes', state: 'passed' }])], { reason: 'passed' }),
    ).toBe(undefined);

    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    const watching = verdict({}, { config: { watch: true } });
    expect(end(watching, failing)).toBe(1);
    const unrecorded = new QuarantineVerdict({ recording: undefined });
    unrecorded.onInit({ config: {} });
    unrecorded.onTestRunStart();
    expect(end(unrecorded, failing)).toBe(1);
  });

  it('defaults to the process environment, the clock and the console', () => {
    writeQuarantine([quarantineEntry('src/a.test.ts > quarantined')]);
    writeOutcomes([failedRow('src/a.test.ts', 'quarantined')]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const reporter = new QuarantineVerdict({ recording });
      reporter.onInit({ config: {} });
      reporter.onTestRunStart();
      expect(end(reporter, [spikeModule()])).toBe(0);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('OutcomeReporter.recording', () => {
  it('tells the verdict where the recorder writes, once recording is on', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-recording-'));
    try {
      const recorder = new OutcomeReporter({
        env: { NX_TASK_TARGET_PROJECT: 'example', NX_TASK_TARGET_TARGET: 'test:shard-1' },
        workspaceRoot: workspace,
        projectRoot: join(workspace, 'example'),
      });
      expect(recorder.recording).toBeUndefined();
      recorder.onInit({ config: { root: workspace } });
      expect(recorder.recording).toEqual({
        file: join(workspace, 'out', 'test-results', 'example', 'test-shard-1.outcomes.jsonl'),
        workspaceRoot: workspace,
        projectRoot: join(workspace, 'example'),
        project: 'example',
        target: 'test:shard-1',
        execution: { hash: undefined, run: undefined, attempt: undefined, job: undefined, sha: undefined },
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('QuarantineVerdict in a real Vitest run (the blueprint spike)', () => {
  let workspace: string;
  let quarantineFile: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-spike-'));
    quarantineFile = join(workspace, 'quarantine.json');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  type SpikeRow = { name: string; state: string; retryCount: number; flaky: boolean };

  const runSpike = (
    env: Record<string, string> = {},
  ): { status: number | undefined; stdout: string; rows: SpikeRow[] } => {
    const require = createRequire(import.meta.url);
    const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !/^(VITEST|NX_|GITHUB_|CI$|TAU_E2E_|REAL$)/.test(key)) {
        childEnv[key] = value;
      }
    }
    Object.assign(childEnv, {
      NX_WORKSPACE_ROOT: workspace,
      NX_TASK_TARGET_PROJECT: 'spike',
      NX_TASK_TARGET_TARGET: 'test',
      NX_TASK_HASH: 'spike-hash',
      GITHUB_ACTIONS: 'true',
      TAU_QUARANTINE_FIXTURE: quarantineFile,
      ...env,
    });
    const child = spawnSync(
      process.execPath,
      [vitestBin, 'run', '--config', join(packageRoot, 'fixtures', 'quarantine', 'vitest.config.ts')],
      { cwd: packageRoot, env: childEnv, encoding: 'utf8' },
    );
    const outcomes = join(workspace, 'out', 'test-results', 'spike', 'test.outcomes.jsonl');
    const rows = readFileSync(outcomes, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as SpikeRow);
    return {
      status: child.status ?? undefined,
      stdout: `${child.stdout}${child.stderr}`,
      rows,
    };
  };

  const spikeEntry = (overrides: Partial<QuarantineEntry> = {}): void => {
    writeFileSync(
      quarantineFile,
      JSON.stringify({ entries: [quarantineEntry('spike.fixture.ts > quarantined: always fails here', overrides)] }),
    );
  };

  it('exits 0 with a retried pass and a quarantined failure, annotating it and writing a row per test', () => {
    spikeEntry();
    const run = runSpike();
    expect(run.status, run.stdout).toBe(0);
    expect(run.stdout).toContain('::notice title=Quarantined failure::quarantined failure, non-gating, #2787');
    expect(run.rows.map((row) => [row.name, row.state, row.retryCount, row.flaky])).toEqual([
      ['passes first time', 'passed', 0, false],
      ['flaky: passes on the retry', 'passed', 1, true],
      ['quarantined: always fails here', 'failed', 1, false],
    ]);
  }, 60_000);

  it('exits 1 once an unquarantined test fails too', () => {
    spikeEntry();
    const run = runSpike({ REAL: '1' });
    expect(run.status, run.stdout).toBe(1);
    expect(run.stdout).toContain('quarantine: gating: spike.fixture.ts > real regression: always fails failed');
    expect(run.rows).toHaveLength(4);
  }, 60_000);

  it('exits 1 when the entry has expired or there is none', () => {
    spikeEntry({ created: daysFromToday(-15), expires: daysFromToday(-1) });
    const expired = runSpike();
    expect(expired.status, expired.stdout).toBe(1);
    expect(expired.stdout).toContain('::warning title=Quarantine entry not honoured::');

    rmSync(quarantineFile);
    expect(runSpike().status).toBe(1);
  }, 60_000);
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */

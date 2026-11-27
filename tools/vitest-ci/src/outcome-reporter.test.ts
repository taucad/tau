import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OutcomeEnvironment, OutcomeRow } from '#outcome-reporter.js';
import {
  normalizeTarget,
  OutcomeReporter,
  outcomeFileName,
  outcomeSchemaVersion,
  readExecution,
} from '#outcome-reporter.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */

const packageRoot = dirname(import.meta.dirname);

const readRows = (file: string): OutcomeRow[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as OutcomeRow);

type FakeCase = Parameters<OutcomeReporter['onTestCaseResult']>[0];

const fakeCase = (options: {
  moduleId: string;
  fullName: string;
  state: string;
  errors?: Array<{ message?: string; name?: string }>;
  retryCount?: number;
  flaky?: boolean;
  duration?: number;
  projectName?: string;
  browser?: { enabled?: boolean; name?: string };
  noDiagnostic?: boolean;
}): FakeCase => ({
  fullName: options.fullName,
  module: { moduleId: options.moduleId },
  project: { name: options.projectName ?? '', config: { browser: options.browser } },
  result: () => ({ state: options.state, errors: options.errors }),
  diagnostic: () =>
    options.noDiagnostic
      ? undefined
      : {
          duration: options.duration ?? 1.4,
          retryCount: options.retryCount ?? 0,
          flaky: options.flaky ?? false,
        },
});

const nxEnvironment = (overrides: Record<string, string> = {}): OutcomeEnvironment => ({
  NX_TASK_TARGET_PROJECT: 'example',
  NX_TASK_TARGET_TARGET: 'test:shard-2',
  NX_TASK_HASH: 'hash-1',
  GITHUB_RUN_ID: '101',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_JOB: 'affected-lane',
  GITHUB_SHA: 'abc123',
  ...overrides,
});

describe('normalizeTarget', () => {
  it('drops a shard suffix and keeps any other target', () => {
    expect(normalizeTarget('test:shard-3')).toBe('test');
    expect(normalizeTarget('test:e2e:deploy-skew')).toBe('test:e2e:deploy-skew');
    expect(normalizeTarget('test')).toBe('test');
  });
});

describe('outcomeFileName', () => {
  it('names a file that is valid on every OS', () => {
    expect(outcomeFileName('test')).toBe('test.outcomes.jsonl');
    expect(outcomeFileName('test:e2e:deploy-skew')).toBe('test-e2e-deploy-skew.outcomes.jsonl');
  });
});

describe('readExecution', () => {
  it('reads the Nx hash and the GitHub Actions identifiers', () => {
    expect(readExecution(nxEnvironment())).toEqual({
      hash: 'hash-1',
      run: 101,
      attempt: 1,
      job: 'affected-lane',
      sha: 'abc123',
    });
  });

  it('leaves a missing, empty or malformed identifier undefined', () => {
    expect(readExecution({ NX_TASK_HASH: '', GITHUB_RUN_ID: 'x1', GITHUB_RUN_ATTEMPT: undefined })).toEqual({
      hash: undefined,
      run: undefined,
      attempt: undefined,
      job: undefined,
      sha: undefined,
    });
  });
});

describe('OutcomeReporter', () => {
  let workspace: string;
  let projectRoot: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-'));
    projectRoot = join(workspace, 'packages', 'example');
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'nx.json'), '{}');
    writeFileSync(join(projectRoot, 'package.json'), '{}');
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const vitestAt = (configFile: string | undefined, watch = false) => ({
    config: { root: projectRoot, watch },
    vite: { config: { configFile } },
  });

  const run = (
    reporter: OutcomeReporter,
    cases: FakeCase[],
    options: {
      modules?: Array<{ moduleId: string; errors: () => Array<{ message?: string; name?: string }> }>;
      unhandled?: Array<{ message?: string; name?: string }>;
    } = {},
  ): void => {
    for (const testCase of cases) {
      reporter.onTestCaseResult(testCase);
    }
    reporter.onTestRunEnd(options.modules ?? [], options.unhandled ?? []);
  };

  it('writes one row per executed test with identity, variant, state, retries and execution ids, absent values as null', () => {
    const reporter = new OutcomeReporter({ env: nxEnvironment({ TAU_E2E_FLAG_STATE: 'all-on' }) });
    reporter.onInit(vitestAt(join(projectRoot, 'src', 'nested.vitest.config.ts')));
    const file = join(workspace, 'out', 'test-results', 'example', 'test-shard-2.outcomes.jsonl');
    expect(reporter.outcomeFile).toBe(file);

    run(reporter, [
      fakeCase({ moduleId: join(projectRoot, 'src', 'a.test.ts'), fullName: 'suite > passes', state: 'passed' }),
      fakeCase({
        moduleId: join(projectRoot, 'src', 'a.test.ts'),
        fullName: 'suite > retried',
        state: 'passed',
        retryCount: 1,
        flaky: true,
        errors: [{ name: 'AssertionError', message: 'expected 1 to be greater than 1\n  at line' }],
        projectName: 'chromium',
        browser: { enabled: true, name: 'chromium' },
      }),
      fakeCase({
        moduleId: join(projectRoot, 'src', 'a.test.ts'),
        fullName: 'suite > fails',
        state: 'failed',
        retryCount: 1,
        errors: [
          { name: 'Error', message: 'Error: first' },
          { message: '' },
          { name: 'TypeError', message: 'x'.repeat(600) },
          { name: 'AbortError' },
        ],
        projectName: 'node',
        browser: { enabled: false, name: 'chromium' },
      }),
      fakeCase({ moduleId: join(projectRoot, 'src', 'a.test.ts'), fullName: 'suite > skipped', state: 'skipped' }),
      fakeCase({ moduleId: join(projectRoot, 'src', 'a.test.ts'), fullName: 'suite > pending', state: 'pending' }),
      fakeCase({
        moduleId: 'virtual:relative.test.ts',
        fullName: 'no diagnostic',
        state: 'passed',
        noDiagnostic: true,
      }),
    ]);

    const rows = readRows(file);
    expect(rows.map((row) => row.name)).toEqual([
      'suite > passes',
      'suite > retried',
      'suite > fails',
      'no diagnostic',
    ]);
    expect(rows[0]).toEqual({
      schema: outcomeSchemaVersion,
      kind: 'test',
      id: 'example › src/a.test.ts > suite > passes',
      project: 'example',
      target: 'test:shard-2',
      targetKey: 'test',
      file: 'src/a.test.ts',
      name: 'suite > passes',
      variant: {
        vitestProject: null,
        browser: null,
        os: process.platform,
        arch: process.arch,
        flagState: 'all-on',
      },
      state: 'passed',
      retryCount: 0,
      flaky: false,
      durationMs: 1,
      errors: [],
      hash: 'hash-1',
      run: 101,
      attempt: 1,
      job: 'affected-lane',
      sha: 'abc123',
    });
    expect(rows[1]).toMatchObject({
      retryCount: 1,
      flaky: true,
      errors: ['AssertionError: expected 1 to be greater than 1'],
      variant: { vitestProject: 'chromium', browser: 'chromium' },
    });
    expect(rows[2]?.state).toBe('failed');
    expect(rows[2]?.variant).toMatchObject({ vitestProject: 'node', browser: null });
    expect(rows[2]?.errors[0]).toBe('Error: first');
    expect(rows[2]?.errors[1]).toBe('Error');
    expect(rows[2]?.errors[2]).toHaveLength(500);
    expect(rows[2]?.errors[2]?.endsWith('…')).toBe(true);
    expect(rows[2]?.errors[3]).toBe('AbortError');
    expect(rows[3]).toMatchObject({ file: 'virtual:relative.test.ts', retryCount: 0, flaky: false, durationMs: 0 });
  });

  it('records a module that failed outside its tests and the run’s unhandled errors', () => {
    const reporter = new OutcomeReporter({ env: nxEnvironment() });
    reporter.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(reporter, [], {
      modules: [
        { moduleId: join(projectRoot, 'src', 'broken.test.ts'), errors: () => [{ name: 'Error', message: 'boom' }] },
        { moduleId: join(projectRoot, 'src', 'fine.test.ts'), errors: () => [] },
      ],
      unhandled: [{ name: 'Error', message: 'late rejection' }],
    });
    const rows = readRows(reporter.outcomeFile ?? '');
    expect(rows.map((row) => [row.kind, row.id, row.state, row.errors])).toEqual([
      ['module', 'example › src/broken.test.ts', 'failed', ['Error: boom']],
      ['unhandled', 'example › <unhandled>', 'failed', ['Error: late rejection']],
    ]);
  });

  it('appends for a second Vitest process of the same task execution and replaces a different execution', () => {
    const first = new OutcomeReporter({ env: nxEnvironment() });
    first.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(first, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'one', state: 'passed' })]);

    const second = new OutcomeReporter({ env: nxEnvironment() });
    second.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(second, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'two', state: 'passed' })]);
    // A later run in the same process appends to its own rows.
    run(second, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'three', state: 'passed' })]);
    const file = first.outcomeFile ?? '';
    expect(readRows(file).map((row) => row.name)).toEqual(['one', 'two', 'three']);

    const rerun = new OutcomeReporter({ env: nxEnvironment({ GITHUB_RUN_ATTEMPT: '2' }) });
    rerun.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(rerun, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'again', state: 'passed' })]);
    expect(readRows(file).map((row) => [row.name, row.attempt])).toEqual([['again', 2]]);
  });

  it('replaces an empty or unreadable file and writes an empty file for a run with no executed test', () => {
    const file = join(workspace, 'out', 'test-results', 'example', 'test-shard-2.outcomes.jsonl');
    mkdirSync(dirname(file), { recursive: true });
    for (const previous of ['', 'not json\n']) {
      writeFileSync(file, previous);
      const reporter = new OutcomeReporter({ env: nxEnvironment() });
      reporter.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
      run(reporter, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'fresh', state: 'passed' })]);
      expect(readRows(file).map((row) => row.name)).toEqual(['fresh']);
    }

    const empty = new OutcomeReporter({ env: nxEnvironment({ NX_TASK_HASH: 'hash-2' }) });
    empty.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(empty, []);
    expect(readFileSync(file, 'utf8')).toBe('');
  });

  it('derives the roots, project and target when Nx does not name them', () => {
    const reporter = new OutcomeReporter({ env: { CI: 'true' } });
    reporter.onInit(vitestAt(undefined));
    expect(reporter.outcomeFile).toBe(
      join(workspace, 'out', 'test-results', 'packages-example', 'vitest.outcomes.jsonl'),
    );

    const atRoot = new OutcomeReporter({ env: { CI: '1' }, workspaceRoot: workspace, projectRoot: workspace });
    atRoot.onInit(vitestAt(undefined));
    expect(atRoot.outcomeFile).toBe(join(workspace, 'out', 'test-results', 'workspace', 'vitest.outcomes.jsonl'));
    run(atRoot, [fakeCase({ moduleId: join(workspace, 'b.test.ts'), fullName: 'b', state: 'passed' })]);
    expect(readRows(atRoot.outcomeFile ?? '')[0]).toMatchObject({
      id: 'workspace › b.test.ts > b',
      hash: null,
      run: null,
    });
  });

  it('falls back to the Vitest root when no ancestor has an nx.json', () => {
    rmSync(join(workspace, 'nx.json'));
    rmSync(join(projectRoot, 'package.json'));
    const reporter = new OutcomeReporter({ env: { GITHUB_ACTIONS: 'true' } });
    reporter.onInit({ config: { root: projectRoot } });
    expect(reporter.outcomeFile).toBe(join(projectRoot, 'out', 'test-results', 'workspace', 'vitest.outcomes.jsonl'));
  });

  it('records nothing in watch mode or outside both Nx and CI unless forced', () => {
    const watching = new OutcomeReporter({ env: nxEnvironment() });
    watching.onInit(vitestAt(join(projectRoot, 'vitest.config.ts'), true));
    const local = new OutcomeReporter({ env: {} });
    local.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    for (const reporter of [watching, local]) {
      run(reporter, [fakeCase({ moduleId: join(projectRoot, 'a.test.ts'), fullName: 'x', state: 'passed' })]);
      expect(reporter.outcomeFile).toBeUndefined();
    }

    const forced = new OutcomeReporter({ env: {}, force: true });
    forced.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    expect(forced.outcomeFile).toBe(
      join(workspace, 'out', 'test-results', 'packages-example', 'vitest.outcomes.jsonl'),
    );
  });

  it('defaults to the process environment', () => {
    const reporter = new OutcomeReporter({ workspaceRoot: workspace, projectRoot });
    reporter.onInit(vitestAt(join(projectRoot, 'vitest.config.ts')));
    run(reporter, []);
    const recording =
      (process.env['NX_TASK_TARGET_PROJECT'] ?? '') !== '' ||
      process.env['CI'] === 'true' ||
      process.env['CI'] === '1' ||
      process.env['GITHUB_ACTIONS'] === 'true';
    expect(reporter.outcomeFile !== undefined).toBe(recording);
  });
});

describe('OutcomeReporter in a real Vitest run', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-run-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('records a pass, a retried pass, a failure and a module error, and skips the skipped test', () => {
    const require = createRequire(import.meta.url);
    const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !/^(VITEST|NX_|GITHUB_|CI$|TAU_E2E_)/.test(key)) {
        env[key] = value;
      }
    }
    Object.assign(env, nxEnvironment({ NX_WORKSPACE_ROOT: workspace, NX_TASK_TARGET_PROJECT: 'vitest-ci' }));

    const child = spawnSync(
      process.execPath,
      [vitestBin, 'run', '--config', join(packageRoot, 'fixtures', 'retry', 'vitest.config.ts')],
      { cwd: packageRoot, env, encoding: 'utf8' },
    );
    const file = join(workspace, 'out', 'test-results', 'vitest-ci', 'test-shard-2.outcomes.jsonl');
    expect(existsSync(file), child.stderr).toBe(true);
    expect(child.status, child.stderr).toBe(1);

    const rows = readRows(file);
    const byName = new Map(rows.map((row) => [`${row.kind}:${row.file}:${row.name}`, row]));
    expect([...byName.keys()].toSorted()).toEqual([
      'module:fixtures/retry/broken.fixture.ts:',
      'test:fixtures/retry/outcomes.fixture.ts:outcomes > fails every attempt',
      'test:fixtures/retry/outcomes.fixture.ts:outcomes > passes first time',
      'test:fixtures/retry/outcomes.fixture.ts:outcomes > passes on the retry',
    ]);
    expect(byName.get('test:fixtures/retry/outcomes.fixture.ts:outcomes > passes first time')).toMatchObject({
      id: 'vitest-ci › fixtures/retry/outcomes.fixture.ts > outcomes > passes first time',
      state: 'passed',
      retryCount: 0,
      flaky: false,
      hash: 'hash-1',
      run: 101,
      attempt: 1,
      job: 'affected-lane',
    });
    expect(byName.get('test:fixtures/retry/outcomes.fixture.ts:outcomes > passes on the retry')).toMatchObject({
      state: 'passed',
      retryCount: 1,
      flaky: true,
      errors: ['AssertionError: expected 1 to be greater than 1'],
    });
    expect(byName.get('test:fixtures/retry/outcomes.fixture.ts:outcomes > fails every attempt')).toMatchObject({
      state: 'failed',
      retryCount: 1,
      flaky: false,
      errors: [
        'AssertionError: expected 1 to be 2 // Object.is equality',
        'AssertionError: expected 1 to be 2 // Object.is equality',
      ],
    });
    expect(byName.get('module:fixtures/retry/broken.fixture.ts:')?.errors).toEqual(['Error: broken on import']);
  }, 60_000);
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */

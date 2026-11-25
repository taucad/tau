import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { utcDay } from '#quarantine.js';
import type { ChangedFiles, RetriedPass, RetryEnvironment } from '#retry-policy.js';
import {
  judgeRetries,
  onCi,
  readChangedFiles,
  retryBudget,
  RetryPolicyReporter,
  underVerification,
} from '#retry-policy.js';
import { testRetry } from '#test-reporters.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */

const packageRoot = dirname(import.meta.dirname);
const fixtures = join(packageRoot, 'fixtures', 'retry-policy');

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A temporary repository with a base commit; returns its directory. */
const repository = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'vitest-ci-retry-'));
  git(directory, 'init', '--quiet', '--initial-branch=main');
  git(directory, 'config', 'user.email', 'fixture@example.invalid');
  git(directory, 'config', 'user.name', 'Fixture');
  git(directory, 'config', 'commit.gpgsign', 'false');
  return directory;
};

const commitAll = (directory: string, message: string): string => {
  git(directory, 'add', '--all');
  git(directory, 'commit', '--quiet', '--allow-empty', '-m', message);
  return git(directory, 'rev-parse', 'HEAD');
};

const pass = (file: string, name = 'suite > retried'): RetriedPass => ({
  file,
  name,
  retryCount: 1,
});

describe('testRetry', () => {
  it('gives one retry on CI and none locally', () => {
    expect(testRetry({ CI: 'true' })).toBe(1);
    expect(testRetry({ CI: '1' })).toBe(1);
    expect(testRetry({ GITHUB_ACTIONS: 'true' })).toBe(1);
    expect(testRetry({})).toBe(0);
    expect(testRetry({ CI: 'false' })).toBe(0);
    expect(retryBudget.retries).toBe(1);
  });

  it('gives no retry under the flake harness (RT-5)', () => {
    expect(testRetry({ CI: 'true', TAU_FLAKE_REPRO_SEED: '7' })).toBe(0);
    expect(testRetry({ CI: 'true', TAU_FLAKE_REPRO_ATTEMPT: '0' })).toBe(0);
    expect(testRetry({ CI: 'true', TAU_FLAKE_REPRO_SEED: '' })).toBe(1);
    expect(underVerification({})).toBe(false);
    expect(onCi({ GITHUB_ACTIONS: 'false' })).toBe(false);
  });

  it('defaults to the process environment', () => {
    expect(testRetry()).toBe(testRetry(process.env));
  });
});

describe('readChangedFiles', () => {
  let directory: string;

  beforeEach(() => {
    directory = repository();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('is none without NX_BASE', () => {
    expect(readChangedFiles({}, directory)).toEqual({ kind: 'none' });
    expect(readChangedFiles({ NX_BASE: '' }, directory)).toEqual({
      kind: 'none',
    });
  });

  it('lists the files changed from the merge base, a rename as its new path, as absolute paths', () => {
    mkdirSync(join(directory, 'src'));
    writeFileSync(join(directory, 'src', 'kept.test.ts'), 'kept\n');
    writeFileSync(join(directory, 'src', 'old.test.ts'), 'old\n');
    const base = commitAll(directory, 'base');
    writeFileSync(join(directory, 'src', 'new.test.ts'), 'new\n');
    git(directory, 'mv', 'src/old.test.ts', 'src/renamed.test.ts');
    const head = commitAll(directory, 'change');
    const top = git(directory, 'rev-parse', '--show-toplevel');

    const changed = readChangedFiles({ NX_BASE: base, NX_HEAD: head }, join(directory, 'src'));
    expect(changed.kind).toBe('known');
    const files = changed.kind === 'known' ? [...changed.files].toSorted() : [];
    expect(files).toEqual(
      ['src/new.test.ts', 'src/old.test.ts', 'src/renamed.test.ts'].map((name) => `${top}/${name}`),
    );
    // NX_HEAD defaults to HEAD.
    expect(readChangedFiles({ NX_BASE: base }, directory)).toEqual(changed);
    // On GitHub, a pull request and a merge-queue entry have a change; a push or a schedule does not.
    expect(readChangedFiles({ NX_BASE: base, GITHUB_EVENT_NAME: 'merge_group' }, directory)).toEqual(changed);
    expect(readChangedFiles({ NX_BASE: base, GITHUB_EVENT_NAME: 'pull_request' }, directory)).toEqual(changed);
    expect(readChangedFiles({ NX_BASE: base, GITHUB_EVENT_NAME: 'push' }, directory)).toEqual({ kind: 'none' });
    expect(readChangedFiles({ NX_BASE: base, GITHUB_EVENT_NAME: 'schedule' }, directory)).toEqual({ kind: 'none' });
  });

  it('is unknown when git cannot answer, with the first line of the error', () => {
    const missing = readChangedFiles({ NX_BASE: 'no-such-revision' }, directory);
    expect(missing.kind).toBe('unknown');
    expect(missing.kind === 'unknown' ? missing.reason : '').toMatch(/^Command failed: git merge-base [^\n]+$/u);
    const fails = (thrown: unknown) => () => {
      throw thrown;
    };
    expect(readChangedFiles({ NX_BASE: 'x' }, directory, fails(new Error('one line')))).toEqual({
      kind: 'unknown',
      reason: 'one line',
    });
    expect(readChangedFiles({ NX_BASE: 'x' }, directory, fails('not an error'))).toEqual({
      kind: 'unknown',
      reason: 'not an error',
    });
  });
});

describe('judgeRetries', () => {
  const none: ChangedFiles = { kind: 'none' };

  it('credits a retried pass in an unchanged file and fails nothing', () => {
    const verdict = judgeRetries({
      passes: [pass('/w/a.test.ts')],
      taskCount: 1,
      overRetried: [],
      changed: { kind: 'known', files: new Set(['/w/b.test.ts']) },
      verifying: false,
    });
    expect(verdict.passes).toEqual([{ ...pass('/w/a.test.ts'), credit: true, reason: '' }]);
    expect(verdict.failures).toEqual([]);
    expect(
      judgeRetries({
        passes: [pass('/w/a.test.ts')],
        taskCount: 1,
        overRetried: [],
        changed: none,
        verifying: false,
      }).failures,
    ).toEqual([]);
  });

  it('gives no credit to a retried pass in a changed file (RT-3), with unknown changes, or under verification (RT-5)', () => {
    const changed = judgeRetries({
      passes: [pass(String.raw`C:\w\a.test.ts`), pass('/w/b.test.ts')],
      taskCount: 2,
      overRetried: [],
      changed: { kind: 'known', files: new Set(['C:/w/a.test.ts']) },
      verifying: false,
    });
    expect(changed.passes.map((judged) => [judged.credit, judged.reason])).toEqual([
      [false, 'its file is changed by this change (RT-3)'],
      [true, ''],
    ]);
    expect(changed.failures).toEqual(['1 retried pass earns no retry credit']);

    const unknown = judgeRetries({
      passes: [pass('/w/a.test.ts'), pass('/w/b.test.ts')],
      taskCount: 2,
      overRetried: [],
      changed: { kind: 'unknown', reason: 'shallow clone' },
      verifying: false,
    });
    expect(unknown.passes[0]?.reason).toBe(
      'the changed files are unknown (shallow clone), so no retry earns credit (RT-3)',
    );
    expect(unknown.failures).toEqual(['2 retried passes earn no retry credit']);

    const verifying = judgeRetries({
      passes: [pass('/w/a.test.ts')],
      taskCount: 1,
      overRetried: [],
      changed: none,
      verifying: true,
    });
    expect(verifying.passes[0]?.reason).toBe('the flake harness verifies a test by its unretried run (RT-5)');
  });

  it('fails a task over its budget (RT-4) and a test retried more than once (RT-1)', () => {
    const atBudget = judgeRetries({
      passes: [],
      taskCount: 3,
      overRetried: [],
      changed: none,
      verifying: false,
    });
    expect(atBudget.failures).toEqual([]);
    const over = judgeRetries({
      passes: [],
      taskCount: 4,
      overRetried: [{ ...pass('/w/a.test.ts'), retryCount: 2 }],
      changed: none,
      verifying: false,
    });
    expect(over.failures).toEqual([
      '4 retried passes in this task, over the budget of 3 (RT-4): a broken environment or change',
      '1 test was retried more than 1 time (RT-1): no suite sets a higher retry',
    ]);
    const twice = judgeRetries({
      passes: [],
      taskCount: 0,
      overRetried: [pass('/w/a.test.ts'), pass('/w/b.test.ts')],
      changed: none,
      verifying: false,
    });
    expect(twice.failures).toEqual(['2 tests were retried more than 1 time (RT-1): no suite sets a higher retry']);
  });
});

type FakeCase = Parameters<RetryPolicyReporter['onTestCaseResult']>[0];

const fakeCase = (options: {
  moduleId: string;
  fullName: string;
  state?: string;
  retryCount?: number;
  flaky?: boolean;
  noDiagnostic?: boolean;
}): FakeCase => ({
  fullName: options.fullName,
  module: { moduleId: options.moduleId },
  result: () => ({ state: options.state ?? 'passed' }),
  diagnostic: () =>
    options.noDiagnostic ? undefined : { retryCount: options.retryCount ?? 0, flaky: options.flaky ?? false },
});

describe('RetryPolicyReporter', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'vitest-ci-policy-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  const reporterWith = (env: RetryEnvironment, changed: ChangedFiles, outcomeFile?: string) => {
    const lines: string[] = [];
    const fail = vi.fn();
    const changedFiles = vi.fn(() => changed);
    const reporter = new RetryPolicyReporter({
      env,
      outcome: { outcomeFile },
      changedFiles,
      write: (line) => lines.push(line),
      fail,
    });
    reporter.onInit({ config: { root: workspace } });
    return { reporter, lines, fail, changedFiles };
  };

  const retried = (name: string, file = join(workspace, 'src', 'a.test.ts')): FakeCase =>
    fakeCase({ moduleId: file, fullName: name, retryCount: 1, flaky: true });

  it('records a credited retried pass as a warning annotation and a summary row, and leaves the task green', () => {
    const summary = join(workspace, 'summary.md');
    const { reporter, lines, fail, changedFiles } = reporterWith(
      {
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKSPACE: workspace,
        GITHUB_STEP_SUMMARY: summary,
        NX_BASE: 'base',
      },
      {
        kind: 'known',
        files: new Set([join(workspace, 'src', 'other.test.ts')]),
      },
    );
    reporter.onTestCaseResult(
      fakeCase({
        moduleId: join(workspace, 'src', 'a.test.ts'),
        fullName: 'plain',
      }),
    );
    reporter.onTestCaseResult(
      fakeCase({
        moduleId: 'virtual',
        fullName: 'no diagnostic',
        noDiagnostic: true,
      }),
    );
    reporter.onTestCaseResult(
      fakeCase({
        moduleId: 'virtual',
        fullName: 'failed',
        state: 'failed',
        retryCount: 1,
        flaky: false,
      }),
    );
    reporter.onTestCaseResult(retried('suite > a, b: 100% | done'));
    reporter.onTestRunEnd();

    expect(lines).toEqual([
      '::warning file=src/a.test.ts,title=Retried pass (flake event)::suite > a, b: 100%25 | done passed on its retry: a flake event, recorded (testing policy § 16.2)',
    ]);
    expect(changedFiles).toHaveBeenCalledWith(expect.objectContaining({ NX_BASE: 'base' }), workspace);
    expect(fail).not.toHaveBeenCalled();
    expect(reporter.verdict?.failures).toEqual([]);
    expect(readFileSync(summary, 'utf8')).toBe(
      [
        '',
        '### Retried passes (1 in this task, budget 3)',
        '',
        '| File | Test | Verdict |',
        '| --- | --- | --- |',
        String.raw`| src/a.test.ts | suite > a, b: 100% \| done | flake event, credited |`,
        '',
        '',
      ].join('\n'),
    );
  });

  it('fails the task for a retried pass in a changed file, with error annotations', () => {
    const file = join(workspace, 'src', 'a.test.ts');
    const summary = join(workspace, 'summary.md');
    const { reporter, lines, fail } = reporterWith(
      {
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKSPACE: workspace,
        GITHUB_STEP_SUMMARY: summary,
      },
      { kind: 'known', files: new Set([file]) },
    );
    reporter.onTestCaseResult(retried('changed'));
    reporter.onTestRunEnd();
    expect(lines).toEqual([
      '::error file=src/a.test.ts,title=Retried pass without credit::changed passed on its retry but earns no credit: its file is changed by this change (RT-3)',
      '::error title=Retry policy::Task failed: 1 retried pass earns no retry credit',
    ]);
    expect(fail).toHaveBeenCalledOnce();
    expect(readFileSync(summary, 'utf8')).toContain(
      '| src/a.test.ts | changed | no credit: its file is changed by this change (RT-3) |\n\n- **Task failed:** 1 retried pass earns no retry credit\n',
    );

    const plain = reporterWith({}, { kind: 'known', files: new Set([file]) });
    plain.reporter.onTestCaseResult(retried('changed'));
    plain.reporter.onTestRunEnd();
    expect(plain.lines).toEqual([
      'Error: src/a.test.ts: changed passed on its retry but earns no credit: its file is changed by this change (RT-3)',
      'Error: 1 retried pass earns no retry credit',
    ]);
  });

  it('counts the task’s retried passes from the outcome file across Vitest processes', () => {
    const outcomeFile = join(workspace, 'outcomes.jsonl');
    const rows = [
      { kind: 'test', flaky: true },
      { kind: 'test', flaky: true },
      { kind: 'test', flaky: false },
      { kind: 'module', flaky: true },
      { kind: 'test', flaky: true },
    ];
    writeFileSync(
      outcomeFile,
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\nnot json\n\n{"kind":"test","flaky":true}\n`,
    );
    const { reporter, lines, fail } = reporterWith({}, { kind: 'none' }, outcomeFile);
    reporter.onTestCaseResult(retried('one'));
    reporter.onTestRunEnd();
    expect(reporter.verdict?.taskCount).toBe(4);
    expect(lines).toEqual([
      `Warning: src/a.test.ts: one passed on its retry: a flake event, recorded (testing policy § 16.2)`,
      'Error: 4 retried passes in this task, over the budget of 3 (RT-4): a broken environment or change',
    ]);
    expect(fail).toHaveBeenCalledOnce();

    // Without a readable outcome file the process counts its own.
    const missing = reporterWith({}, { kind: 'none' }, join(workspace, 'missing.jsonl'));
    for (const name of ['1', '2', '3', '4']) {
      missing.reporter.onTestCaseResult(retried(name));
    }
    missing.reporter.onTestRunEnd();
    expect(missing.reporter.verdict?.taskCount).toBe(4);
    expect(missing.fail).toHaveBeenCalledOnce();
  });

  it('fails a test retried more than once on CI, and lists it without a summary table', () => {
    const summary = join(workspace, 'summary.md');
    const { reporter, lines, fail, changedFiles } = reporterWith(
      { CI: 'true', GITHUB_STEP_SUMMARY: summary },
      { kind: 'none' },
    );
    reporter.onTestCaseResult(
      fakeCase({
        moduleId: join(workspace, 'b.test.ts'),
        fullName: 'thrice',
        state: 'failed',
        retryCount: 2,
      }),
    );
    reporter.onTestRunEnd();
    expect(lines).toEqual([
      'Error: b.test.ts: thrice ran 3 attempts; CI allows 2',
      'Error: 1 test was retried more than 1 time (RT-1): no suite sets a higher retry',
    ]);
    expect(changedFiles).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    expect(readFileSync(summary, 'utf8')).toContain(
      '### Retried passes (0 in this task, budget 3)\n\n- **Task failed:**',
    );

    const github = reporterWith({ GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: workspace }, { kind: 'none' });
    github.reporter.onTestCaseResult(
      fakeCase({
        moduleId: join(workspace, 'b.test.ts'),
        fullName: 'x',
        retryCount: 2,
      }),
    );
    github.reporter.onTestRunEnd();
    expect(github.lines[0]).toBe('::error file=b.test.ts,title=Retry over policy::x ran 3 attempts; CI allows 2');

    const local = reporterWith({}, { kind: 'none' });
    local.reporter.onTestCaseResult(
      fakeCase({
        moduleId: join(workspace, 'b.test.ts'),
        fullName: 'x',
        retryCount: 2,
      }),
    );
    local.reporter.onTestRunEnd();
    expect(local.reporter.verdict).toEqual({
      passes: [],
      taskCount: 0,
      overRetried: [],
      failures: [],
    });
    expect(local.fail).not.toHaveBeenCalled();
  });

  it('does nothing in watch mode', () => {
    const { reporter, lines, fail } = reporterWith({ CI: 'true' }, { kind: 'none' });
    reporter.onInit({ config: { root: workspace, watch: true } });
    reporter.onTestCaseResult(retried('watched'));
    reporter.onTestRunEnd();
    expect(reporter.verdict).toBeUndefined();
    expect(lines).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
  });

  it('defaults to the process environment, git, standard error and the process exit code', () => {
    const previousExitCode = process.exitCode;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const reporter = new RetryPolicyReporter();
      reporter.onInit({ config: { root: workspace } });
      for (const name of ['1', '2', '3', '4']) {
        reporter.onTestCaseResult(retried(name));
      }
      reporter.onTestRunEnd();
      expect(reporter.verdict?.failures).toContain(
        '4 retried passes in this task, over the budget of 3 (RT-4): a broken environment or change',
      );
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('over the budget of 3'));
      expect(process.exitCode).toBe(1);
    } finally {
      stderr.mockRestore();
      process.exitCode = previousExitCode;
    }
  });
});

describe('the recorded retry in a real Vitest run (FQ-4 acceptance)', () => {
  let directory: string;

  beforeEach(() => {
    directory = repository();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  /**
   * Runs fixtures as a CI task whose change is `NX_BASE..NX_HEAD` of the temporary repository. The config is this
   * package's fixture config unless the repository holds its own copy, which makes the repository the project root.
   */
  const runTask = (
    fixture: string | readonly string[],
    base: string,
    head: string,
    config = join(fixtures, 'vitest.config.ts'),
  ) => {
    const filters = typeof fixture === 'string' ? [fixture] : fixture;
    const label = filters.join('+');
    const require = createRequire(import.meta.url);
    const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !/^(VITEST|NX_|GITHUB_|CI$|TAU_)/.test(key)) {
        env[key] = value;
      }
    }
    const summary = join(directory, '..', `${label}.summary.md`);
    Object.assign(env, {
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKSPACE: directory,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_NAME: 'merge_group',
      NX_BASE: base,
      NX_HEAD: head,
      NX_WORKSPACE_ROOT: directory,
      NX_TASK_TARGET_PROJECT: 'fixture',
      NX_TASK_TARGET_TARGET: 'test',
      TAU_RETRY_FIXTURE_ROOT: directory,
    });
    const child = spawnSync(process.execPath, [vitestBin, 'run', '--config', config, ...filters], {
      cwd: packageRoot,
      env,
      encoding: 'utf8',
    });
    let summaryText = '';
    try {
      summaryText = readFileSync(summary, 'utf8');
      rmSync(summary);
    } catch {
      // No summary: the task had no retried pass.
    }
    return {
      status: child.status,
      output: `${child.stdout}\n${child.stderr}`,
      summary: summaryText,
    };
  };

  /** Copies a fixture in; the repository's untracked `node_modules/vitest` links to this package's Vitest. */
  const place = (fixture: string): void => {
    copyFileSync(join(fixtures, fixture), join(directory, fixture));
  };

  beforeEach(() => {
    const require = createRequire(import.meta.url);
    mkdirSync(join(directory, 'node_modules'));
    symlinkSync(dirname(require.resolve('vitest/package.json')), join(directory, 'node_modules', 'vitest'), 'dir');
    writeFileSync(join(directory, '.gitignore'), 'node_modules/\nout/\n');
  });

  it('a retried pass exits 0 with a warning', () => {
    place('one-retried-pass.fixture.ts');
    const base = commitAll(directory, 'base');
    writeFileSync(join(directory, 'unrelated.txt'), 'change\n');
    const head = commitAll(directory, 'unrelated change');

    const task = runTask('one-retried-pass', base, head);
    expect(task.status, task.output).toBe(0);
    expect(task.output).toContain(
      '::warning file=one-retried-pass.fixture.ts,title=Retried pass (flake event)::one retried pass > passes on the retry passed on its retry',
    );
    expect(task.summary).toContain(
      '| one-retried-pass.fixture.ts | one retried pass > passes on the retry | flake event, credited |',
    );
    const rows = readFileSync(join(directory, 'out', 'test-results', 'fixture', 'test.outcomes.jsonl'), 'utf8');
    expect(rows).toContain('"flaky":true');
  }, 60_000);

  it('the same retried pass in a file the change touches exits 1', () => {
    const base = commitAll(directory, 'base');
    place('one-retried-pass.fixture.ts');
    const head = commitAll(directory, 'add the test');

    const task = runTask('one-retried-pass', base, head);
    expect(task.status, task.output).toBe(1);
    expect(task.output).toContain('earns no credit: its file is changed by this change (RT-3)');
    expect(task.output).toContain('::error title=Retry policy::Task failed: 1 retried pass earns no retry credit');
  }, 60_000);

  it('four retried passes in a task exit 1', () => {
    place('four-retried-passes.fixture.ts');
    const base = commitAll(directory, 'base');
    const head = commitAll(directory, 'no change');

    const task = runTask('four-retried-passes', base, head);
    expect(task.status, task.output).toBe(1);
    expect(task.output).toContain('Task failed: 4 retried passes in this task, over the budget of 3 (RT-4)');
  }, 60_000);

  describe('beside a quarantined failure: the retry policy runs after the quarantine verdict', () => {
    const quarantined = 'quarantined-failure.fixture.ts > quarantined: always fails here';

    /** Makes the repository a project with its own config and a `quarantine.json` that names the quarantined test. */
    const quarantineProject = (): string => {
      mkdirSync(join(directory, 'node_modules', '@taucad'));
      symlinkSync(packageRoot, join(directory, 'node_modules', '@taucad', 'vitest-ci'), 'dir');
      writeFileSync(
        join(directory, 'package.json'),
        `${JSON.stringify({ name: 'fixture', private: true, type: 'module' })}\n`,
      );
      copyFileSync(join(fixtures, 'vitest.config.ts'), join(directory, 'vitest.config.ts'));
      const today = utcDay();
      writeFileSync(
        join(directory, 'quarantine.json'),
        `${JSON.stringify({
          entries: [
            {
              test: quarantined,
              owner: 'rifont',
              issue: 2787,
              class: 'race',
              created: today,
              expires: utcDay(new Date(Date.now() + 14 * 86_400_000)),
              evidence: '2 flake events in 61 executions',
            },
          ],
        })}\n`,
      );
      place('quarantined-failure.fixture.ts');
      return join(directory, 'vitest.config.ts');
    };

    it('a quarantined failure alone exits 0', () => {
      const config = quarantineProject();
      const base = commitAll(directory, 'base');
      const head = commitAll(directory, 'no change');

      const task = runTask('quarantined-failure', base, head, config);
      expect(task.status, task.output).toBe(0);
      expect(task.output).toContain(`::notice title=Quarantined failure::quarantined failure, non-gating, #2787`);
    }, 60_000);

    it('a quarantined failure with four retried passes exits 1 (RT-4)', () => {
      const config = quarantineProject();
      place('four-retried-passes.fixture.ts');
      const base = commitAll(directory, 'base');
      const head = commitAll(directory, 'no change');

      const task = runTask(['quarantined-failure', 'four-retried-passes'], base, head, config);
      expect(task.status, task.output).toBe(1);
      expect(task.output).toContain('::notice title=Quarantined failure::');
      expect(task.output).toContain('Task failed: 4 retried passes in this task, over the budget of 3 (RT-4)');
    }, 60_000);

    it('a quarantined failure with a retried pass in a file the change touches exits 1 (RT-3)', () => {
      const config = quarantineProject();
      const base = commitAll(directory, 'base');
      place('one-retried-pass.fixture.ts');
      const head = commitAll(directory, 'add the test');

      const task = runTask(['quarantined-failure', 'one-retried-pass'], base, head, config);
      expect(task.status, task.output).toBe(1);
      expect(task.output).toContain('::notice title=Quarantined failure::');
      expect(task.output).toContain('earns no credit: its file is changed by this change (RT-3)');
    }, 60_000);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End wire names. */

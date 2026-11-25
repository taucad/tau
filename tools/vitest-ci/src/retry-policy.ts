/**
 * The recorded retry of testing policy § 16.2 (CI flake quarantine blueprint, D6 rules RT-1 to RT-5).
 *
 * - RT-1: `testRetry` (`@taucad/vitest-ci`) is the `retry` of every Vitest config: one in-process retry in CI, none
 *   elsewhere; this reporter fails a test that ran more attempts.
 * - RT-2: {@link RetryPolicyReporter} prints every retried pass as a warning annotation and a job summary row; the
 *   outcome row (`flaky: true`) is the flake event the ledger counts.
 * - RT-3: a retried pass of a test in a file the change touches (the diff from the merge base of `NX_BASE` and
 *   `NX_HEAD`) earns no credit and fails the task. A new test is in a file the change touches, so the rule covers it.
 * - RT-4: more than {@link retryBudget}`.task` retried passes fail the task. The run cap is counted by the CI gate
 *   from the run's outcome artifacts, because no single Vitest process sees a whole run.
 * - RT-5: under the flake harness (`flake-repro.yml`, the burn-in), which sets `TAU_FLAKE_REPRO_SEED`, a test has no
 *   retry, and a retried pass there fails.
 *
 * Every Vitest config imports this module, and some are type-checked under other projects' compiler options, so it
 * imports nothing but `node:` modules and `vitest` types.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

import type { Reporter } from 'vitest/node';

/** The environment the retry policy reads. @public */
export type RetryEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The bounds of the recorded retry: `retries` is the in-process retry count in CI, `task` and `run` the most
 * retried passes a task and a CI run may hold and stay green.
 *
 * @public
 */
export const retryBudget = { retries: 1, task: 3, run: 5 } as const;

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

/**
 * Whether the process runs on CI (`CI` is `true` or `1`, or `GITHUB_ACTIONS` is `true`).
 *
 * @param env - The environment to read.
 * @returns `true` on CI.
 * @public
 */
export const onCi = (env: RetryEnvironment): boolean =>
  env['CI'] === 'true' || env['CI'] === '1' || env['GITHUB_ACTIONS'] === 'true';

/**
 * Whether the process is a flake-harness run (`flake-repro.yml` or the burn-in), which verifies a test by its
 * unretried result (RT-5). The harness sets `TAU_FLAKE_REPRO_SEED` on every attempt.
 *
 * @param env - The environment to read.
 * @returns `true` under the harness.
 * @public
 */
export const underVerification = (env: RetryEnvironment): boolean =>
  nonEmpty(env['TAU_FLAKE_REPRO_SEED']) !== undefined || nonEmpty(env['TAU_FLAKE_REPRO_ATTEMPT']) !== undefined;

/**
 * The files the change under test touches: `none` when there is no change to compare (no `NX_BASE`, or a push or
 * scheduled run), `known` with absolute POSIX paths, or `unknown` when `NX_BASE` is set and git cannot answer.
 *
 * @public
 */
export type ChangedFiles =
  | { readonly kind: 'none' }
  | { readonly kind: 'known'; readonly files: ReadonlySet<string> }
  | { readonly kind: 'unknown'; readonly reason: string };

/** Runs git in `cwd` and returns its standard output. @public */
export type GitRunner = (args: readonly string[], cwd: string) => string;

const runGit: GitRunner = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const toPosix = (path: string): string => path.replaceAll('\\', '/');

const absolutePosix = (path: string, base: string): string => toPosix(resolve(base, path));

/** The GitHub events whose run tests one change: a pull request and a merge-queue entry. */
const changeEvents: ReadonlySet<string> = new Set(['pull_request', 'merge_group']);

/**
 * The files the change touches: the diff from the merge base of `NX_BASE` and `NX_HEAD` (default `HEAD`) to
 * `NX_HEAD`, the same comparison as `nx affected` and the burn-in plan. A rename is an added path. A push or a
 * scheduled run tests no single change, so on GitHub only a pull request or a merge-queue entry has one.
 *
 * @param env - The environment to read `NX_BASE` and `NX_HEAD` from.
 * @param cwd - A directory inside the repository.
 * @param git - The git runner; tests replace it.
 * @returns The changed files, `none` without `NX_BASE` or a change, or `unknown` when git fails.
 * @public
 */
export const readChangedFiles = (env: RetryEnvironment, cwd: string, git: GitRunner = runGit): ChangedFiles => {
  const base = nonEmpty(env['NX_BASE']);
  const event = nonEmpty(env['GITHUB_EVENT_NAME']);
  if (base === undefined || (event !== undefined && !changeEvents.has(event))) {
    return { kind: 'none' };
  }
  const head = nonEmpty(env['NX_HEAD']) ?? 'HEAD';
  try {
    const top = git(['rev-parse', '--show-toplevel'], cwd).trim();
    const mergeBase = git(['merge-base', base, head], cwd).trim();
    const names = git(['diff', '--name-only', '--no-renames', '-z', mergeBase, head], cwd)
      .split('\0')
      .filter((name) => name !== '');
    return {
      kind: 'known',
      files: new Set(names.map((name) => absolutePosix(name, top))),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const newline = message.indexOf('\n');
    return {
      kind: 'unknown',
      reason: newline === -1 ? message : message.slice(0, newline),
    };
  }
};

/** One test that passed on a retry, with its absolute file. @public */
export type RetriedPass = {
  readonly file: string;
  readonly name: string;
  readonly retryCount: number;
};

/** A retried pass and whether it earns the retry's credit; `reason` says why not, and is empty with credit. @public */
export type JudgedPass = RetriedPass & {
  readonly credit: boolean;
  readonly reason: string;
};

/** The task's retry verdict. @public */
export type RetryVerdict = {
  readonly passes: readonly JudgedPass[];
  /** Retried passes in the whole task, this process's and earlier ones'. */
  readonly taskCount: number;
  /** Tests retried more often than the policy allows (a suite set a higher `retry`). */
  readonly overRetried: readonly RetriedPass[];
  /** Why the task fails; empty when the retries leave it green. */
  readonly failures: readonly string[];
};

/**
 * Judges a task's retried passes against RT-3, RT-4 and RT-5. A pure function; the reporter gathers its input.
 *
 * @param input - The retried passes of this process, the task's total, any over-retried test, the changed files
 *   and whether the run verifies a fix.
 * @returns The verdict; the task fails when `failures` is not empty.
 * @public
 */
export const judgeRetries = (input: {
  readonly passes: readonly RetriedPass[];
  readonly taskCount: number;
  readonly overRetried: readonly RetriedPass[];
  readonly changed: ChangedFiles;
  readonly verifying: boolean;
}): RetryVerdict => {
  const passes = input.passes.map((pass): JudgedPass => {
    if (input.verifying) {
      return {
        ...pass,
        credit: false,
        reason: 'the flake harness verifies a test by its unretried run (RT-5)',
      };
    }
    if (input.changed.kind === 'unknown') {
      return {
        ...pass,
        credit: false,
        reason: `the changed files are unknown (${input.changed.reason}), so no retry earns credit (RT-3)`,
      };
    }
    if (input.changed.kind === 'known' && input.changed.files.has(toPosix(pass.file))) {
      return {
        ...pass,
        credit: false,
        reason: 'its file is changed by this change (RT-3)',
      };
    }
    return { ...pass, credit: true, reason: '' };
  });
  const failures: string[] = [];
  const rejected = passes.filter((pass) => !pass.credit).length;
  if (rejected > 0) {
    failures.push(`${rejected} retried ${rejected === 1 ? 'pass earns' : 'passes earn'} no retry credit`);
  }
  if (input.taskCount > retryBudget.task) {
    failures.push(
      `${input.taskCount} retried passes in this task, over the budget of ${retryBudget.task} (RT-4): a broken environment or change`,
    );
  }
  if (input.overRetried.length > 0) {
    failures.push(
      `${input.overRetried.length} ${input.overRetried.length === 1 ? 'test was' : 'tests were'} retried more than ${retryBudget.retries} time (RT-1): no suite sets a higher retry`,
    );
  }
  return {
    passes,
    taskCount: input.taskCount,
    overRetried: input.overRetried,
    failures,
  };
};

/** Escapes a GitHub workflow command's message. */
const escapeData = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** Escapes a GitHub workflow command's property value. */
const escapeProperty = (text: string): string => escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');

/** Structural view of the Vitest test case the reporter reads (a subset of `TestCase` in `vitest/node`). */
type TestCaseLike = {
  readonly fullName: string;
  readonly module: { readonly moduleId: string };
  result(): { readonly state: string };
  diagnostic(): { readonly retryCount: number; readonly flaky: boolean } | undefined;
};

/** Structural view of the Vitest instance the reporter reads in `onInit`. */
type VitestLike = {
  readonly config: { readonly root: string; readonly watch?: boolean };
};

/** Options for {@link RetryPolicyReporter}; every field defaults from the process. @public */
export type RetryPolicyReporterOptions = {
  /** Environment to read CI, harness, diff and GitHub Actions variables from. Defaults to `process.env`. */
  env?: RetryEnvironment;
  /** The task's outcome recorder, whose file counts the task's retried passes across Vitest processes. */
  outcome?: { readonly outcomeFile: string | undefined };
  /** Reads the changed files; defaults to {@link readChangedFiles} with git. */
  changedFiles?: (env: RetryEnvironment, cwd: string) => ChangedFiles;
  /** Writes a line of output. Defaults to standard error. */
  write?: (line: string) => void;
  /** Fails the process. Defaults to setting `process.exitCode` to 1. */
  fail?: () => void;
};

/** Fails the Vitest process without ending it: Vitest exits with `process.exitCode` once its reporters finish. */
const failProcess = (): void => {
  process.exitCode = 1;
};

/** Retried passes recorded in an outcome file: `kind: "test"` rows with `flaky: true`. */
const countRetriedRows = (file: string | undefined): number => {
  if (file === undefined || !existsSync(file)) {
    return 0;
  }
  let count = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line === '') {
      continue;
    }
    try {
      const row = JSON.parse(line) as { kind?: unknown; flaky?: unknown };
      if (row.kind === 'test' && row.flaky === true) {
        count += 1;
      }
    } catch {
      // An unreadable line is the outcome recorder's to report, not a retried pass.
    }
  }
  return count;
};

/**
 * Applies the recorded retry to a Vitest process: prints each retried pass as a flake event and fails the task when
 * a rule of § 16.2 is broken. `testReporters` adds it after the outcome recorder, so that recorder's file of the
 * task is complete when this reporter counts it at the end of the run.
 *
 * @public
 */
export class RetryPolicyReporter implements Reporter {
  readonly #options: RetryPolicyReporterOptions;
  readonly #passes: RetriedPass[] = [];
  readonly #overRetried: RetriedPass[] = [];
  #enabled = false;
  #root = '';
  #verdict: RetryVerdict | undefined;

  /**
   * @param options - Overrides for the environment, the outcome file, git and output; tests use them.
   */
  public constructor(options: RetryPolicyReporterOptions = {}) {
    this.#options = options;
  }

  /** The verdict of the last run, once `onTestRunEnd` has run. */
  public get verdict(): RetryVerdict | undefined {
    return this.#verdict;
  }

  public onInit(vitest: VitestLike): void {
    this.#enabled = vitest.config.watch !== true;
    this.#root = vitest.config.root;
  }

  public onTestCaseResult(testCase: TestCaseLike): void {
    if (!this.#enabled) {
      return;
    }
    const diagnostic = testCase.diagnostic();
    if (diagnostic === undefined) {
      return;
    }
    const pass = {
      file: testCase.module.moduleId,
      name: testCase.fullName,
      retryCount: diagnostic.retryCount,
    };
    if (diagnostic.retryCount > retryBudget.retries && onCi(this.#env)) {
      this.#overRetried.push(pass);
    }
    if (diagnostic.flaky && testCase.result().state === 'passed') {
      this.#passes.push(pass);
    }
  }

  public onTestRunEnd(): void {
    if (!this.#enabled) {
      return;
    }
    const passes = this.#passes.splice(0);
    const overRetried = this.#overRetried.splice(0);
    if (passes.length === 0 && overRetried.length === 0) {
      this.#verdict = {
        passes: [],
        taskCount: 0,
        overRetried: [],
        failures: [],
      };
      return;
    }
    const env = this.#env;
    const readChanged = this.#options.changedFiles ?? readChangedFiles;
    const verdict = judgeRetries({
      passes,
      overRetried,
      taskCount: Math.max(passes.length, countRetriedRows(this.#options.outcome?.outcomeFile)),
      changed: passes.length > 0 ? readChanged(env, this.#root) : { kind: 'none' },
      verifying: underVerification(env),
    });
    this.#verdict = verdict;
    this.#report(verdict);
    if (verdict.failures.length > 0) {
      (this.#options.fail ?? failProcess)();
    }
  }

  get #env(): RetryEnvironment {
    return this.#options.env ?? process.env;
  }

  #report(verdict: RetryVerdict): void {
    const env = this.#env;
    const write = this.#options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
    const github = env['GITHUB_ACTIONS'] === 'true';
    const workspace = nonEmpty(env['GITHUB_WORKSPACE']) ?? this.#root;
    const display = (file: string): string => toPosix(relative(workspace, file));
    for (const pass of verdict.passes) {
      const message = pass.credit
        ? `${pass.name} passed on its retry: a flake event, recorded (testing policy § 16.2)`
        : `${pass.name} passed on its retry but earns no credit: ${pass.reason}`;
      write(
        github
          ? `::${pass.credit ? 'warning' : 'error'} file=${escapeProperty(display(pass.file))},title=${escapeProperty(pass.credit ? 'Retried pass (flake event)' : 'Retried pass without credit')}::${escapeData(message)}`
          : `${pass.credit ? 'Warning' : 'Error'}: ${display(pass.file)}: ${message}`,
      );
    }
    for (const test of verdict.overRetried) {
      const message = `${test.name} ran ${test.retryCount + 1} attempts; CI allows ${retryBudget.retries + 1}`;
      write(
        github
          ? `::error file=${escapeProperty(display(test.file))},title=Retry over policy::${escapeData(message)}`
          : `Error: ${display(test.file)}: ${message}`,
      );
    }
    for (const failure of verdict.failures) {
      write(github ? `::error title=Retry policy::${escapeData(`Task failed: ${failure}`)}` : `Error: ${failure}`);
    }
    const summary = nonEmpty(env['GITHUB_STEP_SUMMARY']);
    if (summary !== undefined) {
      appendFileSync(summary, this.#summary(verdict, display));
    }
  }

  #summary(verdict: RetryVerdict, display: (file: string) => string): string {
    const cell = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');
    const rows = verdict.passes.map(
      (pass) =>
        `| ${cell(display(pass.file))} | ${cell(pass.name)} | ${pass.credit ? 'flake event, credited' : cell(`no credit: ${pass.reason}`)} |`,
    );
    const failures = verdict.failures.map((failure) => `- **Task failed:** ${failure}`);
    return [
      '',
      `### Retried passes (${verdict.taskCount} in this task, budget ${retryBudget.task})`,
      '',
      ...(rows.length > 0 ? ['| File | Test | Verdict |', '| --- | --- | --- |', ...rows, ''] : []),
      ...failures,
      '',
    ].join('\n');
  }
}

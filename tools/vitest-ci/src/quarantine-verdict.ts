/**
 * The task's verdict under quarantine (testing policy § 16.1 and § 16.3): a quarantined test still runs and reports,
 * and only the pass/fail verdict ignores its failure.
 *
 * Vitest sets `process.exitCode` to 1 for any failed test just before it calls `onTestRunEnd`. This reporter, last in
 * the list `testReporters` builds, lowers it to 0 only when every failure of the run is a failed test named by a valid
 * entry in the project's `quarantine.json` and recorded in the outcome file the `OutcomeReporter` just wrote. Anything
 * else keeps the run failed: an unhandled error, a module or suite error, an interrupted run, a failure no entry
 * covers, an entry that is expired, malformed or in the never-quarantine set, a missing or unreadable outcome file, or
 * a coverage run whose thresholds Vitest skips once a test failed. An entry for a file the run executed that matches
 * no test fails the run even when every test passed. The verdict never turns a failure Vitest saw before the run's end
 * into a pass, and it is off whenever recording is off (watch mode, a local run outside Nx and CI), so there Vitest's
 * own exit code stands.
 *
 * Every Vitest config imports this module through `testReporters`, so it imports nothing but `node:` modules, its
 * siblings and `vitest` types.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import process from 'node:process';

import type { OutcomeEnvironment, OutcomeExecution, OutcomeRecording } from '@taucad/vitest-ci/outcome-reporter';
import { normalizeTarget } from '@taucad/vitest-ci/outcome-reporter';
import type { ExecutionVariant, QuarantineEntry } from '@taucad/vitest-ci/quarantine';
import { quarantineFileName, readQuarantine, testSeparator, utcDay, variantCovers } from '@taucad/vitest-ci/quarantine';
import type { Reporter } from 'vitest/node';

/** Structural view of a Vitest error. */
type ErrorLike = { readonly message?: string; readonly name?: string };

/** Structural view of the Vitest test case the verdict reads. */
type VerdictCaseLike = {
  readonly fullName: string;
  readonly project: { readonly config: { readonly browser?: { readonly enabled?: boolean; readonly name?: string } } };
  result(): { readonly state: string };
};

/** Structural view of the Vitest test module the verdict reads. */
type VerdictModuleLike = {
  readonly moduleId: string;
  readonly children: {
    allTests(): Iterable<VerdictCaseLike>;
    allSuites(): Iterable<{ readonly fullName: string; errors(): readonly ErrorLike[] }>;
  };
  errors(): readonly ErrorLike[];
};

/** Structural view of the Vitest instance the verdict reads in `onInit`. */
type VerdictVitestLike = {
  readonly config: {
    readonly watch?: boolean;
    readonly coverage?: { readonly enabled?: boolean; readonly reportOnFailure?: boolean };
  };
};

/** The recorder the verdict follows: where it wrote. */
type RecorderLike = { readonly recording: OutcomeRecording | undefined };

/** One test the run executed, as the verdict sees it. @public */
export type VerdictTest = {
  /** File relative to the project root. */
  file: string;
  /** Vitest's full name: suites and title joined by ` > `. */
  name: string;
  state: string;
  browser: string | undefined;
};

/** What `decideVerdict` reads. @public */
export type VerdictInput = {
  tests: readonly VerdictTest[];
  /** Files (relative to the project root) the run executed. */
  executedFiles: ReadonlySet<string>;
  /** Failures outside a test case: module, suite and unhandled errors, an interrupted run. */
  otherFailures: readonly string[];
  /** Entries valid today. */
  entries: readonly QuarantineEntry[];
  os: string;
  /** The target without a shard suffix. */
  target: string;
  /** Whether the outcome file holds a failed row for this test in this execution. */
  recorded: (test: VerdictTest) => boolean;
};

/** The verdict. @public */
export type Verdict = {
  /** `true` when the run may pass: nothing gates and at least the failures it saw are excused. */
  pass: boolean;
  /** Failed tests an entry excuses: still printed, annotated and recorded. */
  excused: Array<{ test: VerdictTest; entry: QuarantineEntry }>;
  /** Why the run fails, one line each. */
  gating: string[];
};

const identity = (test: VerdictTest): string => `${test.file}${testSeparator}${test.name}`;

/**
 * Decides a run's verdict from what it executed and the project's valid entries.
 *
 * @param input - The run's tests, other failures, entries and variant.
 * @returns The verdict, the excused failures and every reason the run fails.
 * @public
 */
export const decideVerdict = (input: VerdictInput): Verdict => {
  const gating = [...input.otherFailures];
  const excused: Verdict['excused'] = [];
  const variantOf = (test: VerdictTest): ExecutionVariant => ({
    browser: test.browser,
    os: input.os,
    target: input.target,
  });
  for (const test of input.tests) {
    if (test.state !== 'failed') {
      continue;
    }
    const entry = input.entries.find(
      (candidate) => candidate.test === identity(test) && variantCovers(candidate.variant, variantOf(test)),
    );
    if (entry === undefined) {
      gating.push(`${identity(test)} failed and no valid quarantine entry covers it`);
    } else if (input.recorded(test)) {
      excused.push({ test, entry });
    } else {
      gating.push(`${identity(test)} is quarantined, but the outcome file holds no record of its failure`);
    }
  }
  for (const entry of input.entries) {
    const file = entry.test.slice(0, entry.test.indexOf(testSeparator));
    if (!input.executedFiles.has(file)) {
      continue;
    }
    const covered = input.tests.filter((test) => test.file === file && variantCovers(entry.variant, variantOf(test)));
    if (covered.length > 0 && !covered.some((test) => identity(test) === entry.test)) {
      gating.push(`quarantine entry "${entry.test}" (#${entry.issue}) matches no test in ${file}`);
    }
  }
  return { pass: gating.length === 0, excused, gating };
};

/** Options for {@link QuarantineVerdict}; every field defaults from the process. @public */
export type QuarantineVerdictOptions = {
  /** Environment to read `GITHUB_ACTIONS` and `GITHUB_STEP_SUMMARY` from. Defaults to `process.env`. */
  env?: OutcomeEnvironment;
  /** The clock entries are dated against. Defaults to the current time. */
  now?: () => Date;
  /** The quarantine file. Defaults to `quarantine.json` at the recorder's project root. */
  quarantineFile?: string;
  /** Where the verdict prints. Defaults to `console.log`. */
  log?: (line: string) => void;
};

const toPosix = (path: string): string => path.replaceAll('\\', '/');

const readText = (file: string): string | undefined => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

type RecordedRow = { kind?: unknown; file?: unknown; name?: unknown; state?: unknown } & Partial<OutcomeExecution>;

const executionKeys = ['hash', 'run', 'attempt', 'job', 'sha'] as const;

/** Whether a row belongs to this execution; the recorder writes an absent identifier as `null`. */
const sameExecution = (row: RecordedRow, execution: OutcomeExecution): boolean =>
  executionKeys.every((key) => (row[key] ?? undefined) === execution[key]);

/** The failed test rows of this execution in the outcome file, or `undefined` when the file is missing or unreadable. */
const recordedFailures = (recording: OutcomeRecording): Set<string> | undefined => {
  const text = readText(recording.file);
  if (text === undefined) {
    return undefined;
  }
  const failures = new Set<string>();
  for (const line of text.split('\n')) {
    if (line === '') {
      continue;
    }
    let row: RecordedRow;
    try {
      row = JSON.parse(line) as RecordedRow;
    } catch {
      return undefined;
    }
    if (row.kind === 'test' && row.state === 'failed' && sameExecution(row, recording.execution)) {
      failures.add(`${String(row.file)}${testSeparator}${String(row.name)}`);
    }
  }
  return failures;
};

const escapeAnnotation = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

const describeErrors = (errors: readonly ErrorLike[]): string =>
  errors.map((error) => error.message ?? error.name ?? 'Error').join('; ');

/** What the run executed, read from Vitest's modules: every test, the files and every failure outside a test. */
const readRun = (
  testModules: readonly VerdictModuleLike[],
  projectRoot: string,
): { tests: VerdictTest[]; executedFiles: Set<string>; otherFailures: string[] } => {
  const tests: VerdictTest[] = [];
  const executedFiles = new Set<string>();
  const otherFailures: string[] = [];
  for (const testModule of testModules) {
    const file = toPosix(
      isAbsolute(testModule.moduleId) ? relative(projectRoot, testModule.moduleId) : testModule.moduleId,
    );
    executedFiles.add(file);
    const moduleErrors = testModule.errors();
    if (moduleErrors.length > 0) {
      otherFailures.push(`${file} failed outside its tests: ${describeErrors(moduleErrors)}`);
    }
    for (const suite of testModule.children.allSuites()) {
      const suiteErrors = suite.errors();
      if (suiteErrors.length > 0) {
        otherFailures.push(`${file}${testSeparator}${suite.fullName} failed in a hook: ${describeErrors(suiteErrors)}`);
      }
    }
    for (const testCase of testModule.children.allTests()) {
      const { browser } = testCase.project.config;
      tests.push({
        file,
        name: testCase.fullName,
        state: testCase.result().state,
        browser: browser?.enabled === true && browser.name ? browser.name : undefined,
      });
    }
  }
  return { tests, executedFiles, otherFailures };
};

/** Appends the excused failures to the GitHub Actions job summary; the summary is a convenience, never the record. */
const writeSummary = (summary: string | undefined, project: string, excused: Verdict['excused']): void => {
  if (summary === undefined || summary === '' || excused.length === 0) {
    return;
  }
  const rows = excused.map(
    ({ test, entry }) =>
      `| ${project} | ${identity(test).replaceAll('|', String.raw`\|`)} | #${entry.issue} | ${entry.class} | ${entry.expires} |`,
  );
  try {
    appendFileSync(
      summary,
      [
        '',
        '| Project | Quarantined failure (non-gating) | Issue | Class | Expires |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
        '',
      ].join('\n'),
    );
  } catch {
    // The annotation and the outcome row carry the record.
  }
};

const defaultLog = (line: string): void => {
  console.log(line);
};

/**
 * Sets the task's verdict from the outcome record and the project's `quarantine.json`. Add it through
 * `testReporters`, which places it after the {@link OutcomeReporter} it reads.
 *
 * @public
 */
export class QuarantineVerdict implements Reporter {
  readonly #recorder: RecorderLike;
  readonly #options: QuarantineVerdictOptions;
  #watch = false;
  #coverageHidesThresholds = false;
  #exitCodeBefore: number | string | undefined;

  /**
   * @param recorder - The outcome recorder of the same reporter list.
   * @param options - Overrides for tests; configs pass none.
   */
  public constructor(recorder: RecorderLike, options: QuarantineVerdictOptions = {}) {
    this.#recorder = recorder;
    this.#options = options;
  }

  public onInit(vitest: VerdictVitestLike): void {
    const { watch, coverage } = vitest.config;
    this.#watch = watch === true;
    this.#coverageHidesThresholds = coverage?.enabled === true && coverage.reportOnFailure !== true;
  }

  public onTestRunStart(): void {
    this.#exitCodeBefore = process.exitCode ?? undefined;
  }

  public onTestModuleEnd(): void {
    this.#exitCodeBefore = process.exitCode ?? undefined;
  }

  public onTestRunEnd(
    testModules: readonly VerdictModuleLike[],
    unhandledErrors: readonly ErrorLike[],
    reason?: 'passed' | 'interrupted' | 'failed',
  ): void {
    const { recording } = this.#recorder;
    if (this.#watch || recording === undefined) {
      return;
    }
    const env = this.#options.env ?? process.env;
    const log = this.#options.log ?? defaultLog;
    const onGitHub = env['GITHUB_ACTIONS'] === 'true';
    const quarantine = this.#readEntries(recording, onGitHub, log);
    const run = readRun(testModules, recording.projectRoot);
    if (unhandledErrors.length > 0) {
      run.otherFailures.push(`${unhandledErrors.length} unhandled error(s): ${describeErrors(unhandledErrors)}`);
    }
    if (reason === 'interrupted') {
      run.otherFailures.push('the run was interrupted');
    }
    let recorded: Set<string> | undefined;
    let recordRead = false;
    const verdict = decideVerdict({
      ...run,
      entries: quarantine,
      os: process.platform,
      target: normalizeTarget(recording.target),
      recorded: (test) => {
        if (!recordRead) {
          recorded = recordedFailures(recording);
          recordRead = true;
        }
        return recorded?.has(identity(test)) ?? false;
      },
    });
    if (verdict.excused.length > 0 && this.#coverageHidesThresholds) {
      verdict.pass = false;
      verdict.gating.push(
        'coverage is on: Vitest skips its thresholds once a test fails, so a quarantined failure cannot pass',
      );
    }
    for (const { test, entry } of verdict.excused) {
      const message = `quarantined failure, non-gating, #${entry.issue} (${entry.class}, owner ${entry.owner}, expires ${entry.expires}): ${identity(test)}`;
      log(onGitHub ? `::notice title=Quarantined failure::${escapeAnnotation(message)}` : `quarantine: ${message}`);
    }
    writeSummary(env['GITHUB_STEP_SUMMARY'], recording.project, verdict.excused);
    this.#settle(verdict, quarantine.length > 0, log);
  }

  /** The entries valid today; each one that is not is printed, and excuses nothing. */
  #readEntries(recording: OutcomeRecording, onGitHub: boolean, log: (line: string) => void): QuarantineEntry[] {
    const quarantineFile = this.#options.quarantineFile ?? join(recording.projectRoot, quarantineFileName);
    const text = readText(quarantineFile);
    if (text === undefined) {
      return [];
    }
    const today = utcDay(this.#options.now?.() ?? new Date());
    const projectRoot = toPosix(relative(recording.workspaceRoot, recording.projectRoot));
    const { entries, problems } = readQuarantine(text, { projectRoot }, today);
    for (const problem of problems) {
      const line = `${quarantineFile}: ${problem}`;
      log(
        onGitHub
          ? `::warning title=Quarantine entry not honoured::${escapeAnnotation(line)}`
          : `quarantine: not honoured: ${line}`,
      );
    }
    return entries;
  }

  /** Sets the exit code: lowered to 0 only for a run whose every failure is excused, raised to 1 otherwise. */
  #settle(verdict: Verdict, hasEntries: boolean, log: (line: string) => void): void {
    if (verdict.pass) {
      const before = this.#exitCodeBefore;
      if (verdict.excused.length > 0 && (before === undefined || Number(before) === 0)) {
        process.exitCode = 0;
        log(`quarantine: ${verdict.excused.length} quarantined failure(s) did not gate; every other test passed`);
      }
      return;
    }
    if (hasEntries || verdict.excused.length > 0) {
      for (const line of verdict.gating) {
        log(`quarantine: gating: ${line}`);
      }
    }
    process.exitCode = 1;
  }
}

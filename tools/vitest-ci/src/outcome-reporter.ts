/**
 * The outcome recorder: one JSON line per test execution in `out/test-results/<project>/<target>.outcomes.jsonl`.
 *
 * It only records. The quarantine verdict (`QuarantineVerdict`) reads what it wrote; retry policy is not here. A config adds it
 * through `testReporters` (`@taucad/vitest-ci`), never by hand.
 *
 * Every Vitest config in the workspace imports this module, and some are type-checked under other projects'
 * compiler options (some with a `#*` path alias), so it imports nothing but `node:` modules and `vitest` types.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';

import type { Reporter } from 'vitest/node';

/** Version of the row shape in {@link OutcomeRow}; a reader rejects a version it does not know. @public */
export const outcomeSchemaVersion = 1;

/** Directory, under the workspace root, that holds every project's outcome files. @public */
export const outcomeDirectory = 'out/test-results';

/** What a row describes: a test case, a module that failed outside its tests, or an unhandled error. @public */
export type OutcomeKind = 'test' | 'module' | 'unhandled';

/**
 * Where a row ran: the Vitest project (a browser instance, say), the browser, the OS and architecture, and the
 * end-to-end flag state (`TAU_E2E_FLAG_STATE`). A quarantine may narrow an identity to a variant.
 *
 * @public
 */
export type OutcomeVariant = {
  vitestProject: string | undefined;
  browser: string | undefined;
  os: string;
  arch: string;
  flagState: string | undefined;
};

/**
 * The CI execution that produced a row: workflow run id, run attempt, job id and commit. Unset outside
 * GitHub Actions. A cache replay restores the row with the ids of the run that executed it.
 *
 * @public
 */
export type OutcomeExecution = {
  hash: string | undefined;
  run: number | undefined;
  attempt: number | undefined;
  job: string | undefined;
  sha: string | undefined;
};

/**
 * One line of an outcome file: one test execution, or one failure outside a test.
 *
 * `id` is `<project> › <file relative to the project> > <suite> > <title>`, the identity a ledger joins history on.
 * `targetKey` is the target with a `:shard-<n>` suffix removed, so a re-deal keeps a history. `state` is the final
 * state after any in-process retry; `retryCount` and `flaky` say whether it took more than one attempt. `errors`
 * holds the first line of each error the test raised, one per failed attempt. A field that is `undefined` here is
 * written as `null`, so every line carries every key.
 *
 * @public
 */
export type OutcomeRow = {
  schema: typeof outcomeSchemaVersion;
  kind: OutcomeKind;
  id: string;
  project: string;
  target: string;
  targetKey: string;
  file: string | undefined;
  name: string;
  variant: OutcomeVariant;
  state: 'passed' | 'failed';
  retryCount: number;
  flaky: boolean;
  durationMs: number;
  errors: string[];
} & OutcomeExecution;

/**
 * Where a recorder writes and what it records under: the outcome file, the workspace and project roots (absolute), the
 * project, the target and the execution identifiers.
 *
 * @public
 */
export type OutcomeRecording = {
  file: string;
  workspaceRoot: string;
  projectRoot: string;
  project: string;
  target: string;
  execution: OutcomeExecution;
};

/** The environment the recorder reads. @public */
export type OutcomeEnvironment = Readonly<Record<string, string | undefined>>;

/** Structural view of the Vitest error the recorder reads. */
type ErrorLike = { readonly message?: string; readonly name?: string };

/** Structural view of the Vitest test case the recorder reads (a subset of `TestCase` in `vitest/node`). */
type TestCaseLike = {
  readonly fullName: string;
  readonly module: { readonly moduleId: string };
  readonly project: {
    readonly name: string;
    readonly config: { readonly browser?: { readonly enabled?: boolean; readonly name?: string } };
  };
  result(): { readonly state: string; readonly errors?: readonly ErrorLike[] };
  diagnostic(): { readonly duration: number; readonly retryCount: number; readonly flaky: boolean } | undefined;
};

/** Structural view of the Vitest test module the recorder reads. */
type TestModuleLike = {
  readonly moduleId: string;
  errors(): readonly ErrorLike[];
};

/** Structural view of the Vitest instance the recorder reads in `onInit`. */
type VitestLike = {
  readonly config: { readonly root: string; readonly watch?: boolean };
  readonly vite?: { readonly config?: { readonly configFile?: string | undefined } };
};

/** Options for {@link OutcomeReporter}; every field defaults from the process. @public */
export type OutcomeReporterOptions = {
  /** Environment to read Nx and GitHub Actions identifiers from. Defaults to `process.env`. */
  env?: OutcomeEnvironment;
  /** Workspace root. Defaults to `NX_WORKSPACE_ROOT`, else the nearest ancestor of the config with an `nx.json`. */
  workspaceRoot?: string;
  /** Nx project root, absolute. Defaults to the nearest ancestor of the config with a `project.json` or `package.json`. */
  projectRoot?: string;
  /** Record even outside Nx and CI. Defaults to recording only under an Nx task or on CI. */
  force?: boolean;
};

const maximumErrorLength = 500;
const maximumErrorsPerRow = 10;

const lineOne = (text: string): string => {
  const newline = text.indexOf('\n');
  return newline === -1 ? text : text.slice(0, newline);
};

const firstLine = (error: ErrorLike): string => {
  const text = (error.message ?? '').trim() || (error.name ?? 'Error');
  const line = lineOne(text);
  const prefixed = error.name && !line.startsWith(error.name) ? `${error.name}: ${line}` : line;
  return prefixed.length > maximumErrorLength ? `${prefixed.slice(0, maximumErrorLength - 1)}…` : prefixed;
};

const errorLines = (errors: readonly ErrorLike[] | undefined): string[] =>
  (errors ?? []).slice(0, maximumErrorsPerRow).map((error) => firstLine(error));

const toPosix = (path: string): string => path.replaceAll('\\', '/');

const parseInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
};

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

/**
 * The target with a trailing `:shard-<n>` removed: `test:shard-3` is `test`.
 *
 * @param target - An Nx target name.
 * @returns The target a history is kept under.
 * @public
 */
export const normalizeTarget = (target: string): string => target.replace(/:shard-\d+$/, '');

/**
 * The outcome file name for a target: characters outside `[A-Za-z0-9._-]` become `-`, so a target with colons is a
 * valid file name on every OS. `test:e2e:deploy-skew` is `test-e2e-deploy-skew.outcomes.jsonl`.
 *
 * @param target - An Nx target name.
 * @returns The file name, without a directory.
 * @public
 */
export const outcomeFileName = (target: string): string => `${target.replaceAll(/[^\w.-]/g, '-')}.outcomes.jsonl`;

/**
 * The execution identifiers of the current process: the Nx task hash and the GitHub Actions run, attempt, job and
 * commit.
 *
 * @param env - The environment to read.
 * @returns The identifiers; each is `undefined` when its variable is unset or malformed.
 * @public
 */
export const readExecution = (env: OutcomeEnvironment): OutcomeExecution => ({
  hash: nonEmpty(env['NX_TASK_HASH']),
  run: parseInteger(env['GITHUB_RUN_ID']),
  attempt: parseInteger(env['GITHUB_RUN_ATTEMPT']),
  job: nonEmpty(env['GITHUB_JOB']),
  sha: nonEmpty(env['GITHUB_SHA']),
});

const sameExecution = (left: OutcomeExecution, right: Partial<OutcomeExecution>): boolean =>
  left.hash === right.hash &&
  left.run === right.run &&
  left.attempt === right.attempt &&
  left.job === right.job &&
  left.sha === right.sha;

const writeAbsentAsNull = (_key: string, value: unknown): unknown => value ?? null;

const hasMarker = (directory: string, markers: readonly string[]): boolean =>
  markers.some((marker) => existsSync(join(directory, marker)));

const findAncestor = (start: string, stop: string | undefined, markers: readonly string[]): string | undefined => {
  let directory = resolve(start);
  for (;;) {
    if (hasMarker(directory, markers)) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory || (stop !== undefined && directory === resolve(stop))) {
      return undefined;
    }
    directory = parent;
  }
};

/**
 * Records one row per test execution to the target's outcome file. Add it through `testReporters` rather than
 * by hand, so every config records the same way.
 *
 * Several Vitest processes inside one Nx task (a target that runs `vitest` once per browser project, say) append to
 * the same file; a process whose execution identifiers differ from the file's first row replaces it. The recorder is
 * off in watch mode and, unless `force` is set, outside both an Nx task and CI.
 *
 * @public
 */
export class OutcomeReporter implements Reporter {
  readonly #options: OutcomeReporterOptions;
  readonly #rows: OutcomeRow[] = [];
  #enabled = false;
  #wrote = false;
  #file: string | undefined;
  #workspaceRoot = '';
  #project = '';
  #target = '';
  #projectRoot = '';
  #flagState: string | undefined;
  #execution: OutcomeExecution = readExecution({});

  /**
   * @param options - Overrides for the environment and the roots; tests use them, configs do not.
   */
  public constructor(options: OutcomeReporterOptions = {}) {
    this.#options = options;
  }

  /** The file this reporter writes, once `onInit` has run and recording is on. */
  public get outcomeFile(): string | undefined {
    return this.#file;
  }

  /** Where this reporter records, once `onInit` has run and recording is on; the quarantine verdict reads it. */
  public get recording(): OutcomeRecording | undefined {
    return this.#file === undefined
      ? undefined
      : {
          file: this.#file,
          workspaceRoot: this.#workspaceRoot,
          projectRoot: this.#projectRoot,
          project: this.#project,
          target: this.#target,
          execution: this.#execution,
        };
  }

  public onInit(vitest: VitestLike): void {
    const env = this.#options.env ?? process.env;
    const underNx = nonEmpty(env['NX_TASK_TARGET_PROJECT']) !== undefined;
    const onCi = env['CI'] === 'true' || env['CI'] === '1' || env['GITHUB_ACTIONS'] === 'true';
    this.#enabled = vitest.config.watch !== true && (this.#options.force === true || underNx || onCi);
    if (!this.#enabled) {
      return;
    }
    const configFile = vitest.vite?.config?.configFile;
    const configDirectory = configFile ? dirname(configFile) : vitest.config.root;
    const workspaceRoot =
      this.#options.workspaceRoot ??
      nonEmpty(env['NX_WORKSPACE_ROOT']) ??
      findAncestor(configDirectory, undefined, ['nx.json']) ??
      vitest.config.root;
    this.#workspaceRoot = workspaceRoot;
    this.#projectRoot =
      this.#options.projectRoot ??
      findAncestor(configDirectory, workspaceRoot, ['project.json', 'package.json']) ??
      workspaceRoot;
    this.#project =
      nonEmpty(env['NX_TASK_TARGET_PROJECT']) ??
      toPosix(relative(workspaceRoot, this.#projectRoot)).replaceAll('/', '-');
    if (this.#project === '') {
      this.#project = 'workspace';
    }
    this.#target = nonEmpty(env['NX_TASK_TARGET_TARGET']) ?? 'vitest';
    this.#execution = readExecution(env);
    this.#flagState = nonEmpty(env['TAU_E2E_FLAG_STATE']);
    this.#file = join(workspaceRoot, outcomeDirectory, this.#project, outcomeFileName(this.#target));
  }

  public onTestCaseResult(testCase: TestCaseLike): void {
    if (!this.#enabled) {
      return;
    }
    const result = testCase.result();
    if (result.state !== 'passed' && result.state !== 'failed') {
      return;
    }
    const diagnostic = testCase.diagnostic();
    const file = this.#relativeFile(testCase.module.moduleId);
    const { browser } = testCase.project.config;
    this.#rows.push(
      this.#row({
        kind: 'test',
        file,
        name: testCase.fullName,
        vitestProject: nonEmpty(testCase.project.name),
        browser: browser?.enabled === true ? nonEmpty(browser.name) : undefined,
        state: result.state,
        retryCount: diagnostic?.retryCount ?? 0,
        flaky: diagnostic?.flaky ?? false,
        durationMs: Math.round(diagnostic?.duration ?? 0),
        errors: errorLines(result.errors),
      }),
    );
  }

  public onTestRunEnd(testModules: readonly TestModuleLike[], unhandledErrors: readonly ErrorLike[]): void {
    if (!this.#enabled || this.#file === undefined) {
      return;
    }
    for (const testModule of testModules) {
      const errors = testModule.errors();
      if (errors.length > 0) {
        this.#rows.push(
          this.#row({
            kind: 'module',
            file: this.#relativeFile(testModule.moduleId),
            name: '',
            vitestProject: undefined,
            browser: undefined,
            state: 'failed',
            retryCount: 0,
            flaky: false,
            durationMs: 0,
            errors: errorLines(errors),
          }),
        );
      }
    }
    if (unhandledErrors.length > 0) {
      this.#rows.push(
        this.#row({
          kind: 'unhandled',
          file: undefined,
          name: '',
          vitestProject: undefined,
          browser: undefined,
          state: 'failed',
          retryCount: 0,
          flaky: false,
          durationMs: 0,
          errors: errorLines(unhandledErrors),
        }),
      );
    }
    this.#write(this.#file);
  }

  #relativeFile(moduleId: string): string {
    const path = isAbsolute(moduleId) ? relative(this.#projectRoot, moduleId) : moduleId;
    return toPosix(path);
  }

  #row(fields: {
    kind: OutcomeKind;
    file: string | undefined;
    name: string;
    vitestProject: string | undefined;
    browser: string | undefined;
    state: 'passed' | 'failed';
    retryCount: number;
    flaky: boolean;
    durationMs: number;
    errors: string[];
  }): OutcomeRow {
    const location = [fields.file, fields.name].filter((part) => part !== undefined && part !== '').join(' > ');
    return {
      schema: outcomeSchemaVersion,
      kind: fields.kind,
      id: `${this.#project} › ${location === '' ? `<${fields.kind}>` : location}`,
      project: this.#project,
      target: this.#target,
      targetKey: normalizeTarget(this.#target),
      file: fields.file,
      name: fields.name,
      variant: {
        vitestProject: fields.vitestProject,
        browser: fields.browser,
        os: process.platform,
        arch: process.arch,
        flagState: this.#flagState,
      },
      state: fields.state,
      retryCount: fields.retryCount,
      flaky: fields.flaky,
      durationMs: fields.durationMs,
      errors: fields.errors,
      ...this.#execution,
    };
  }

  #write(file: string): void {
    const lines = this.#rows.map((row) => `${JSON.stringify(row, writeAbsentAsNull)}\n`).join('');
    this.#rows.length = 0;
    mkdirSync(dirname(file), { recursive: true });
    if (this.#wrote || this.#continuesFile(file)) {
      appendFileSync(file, lines);
    } else {
      writeFileSync(file, lines);
    }
    this.#wrote = true;
  }

  /** Whether the file already holds rows of this execution (an earlier Vitest process in the same Nx task). */
  #continuesFile(file: string): boolean {
    if (!existsSync(file)) {
      return false;
    }
    const firstRow = lineOne(readFileSync(file, 'utf8'));
    if (firstRow === '') {
      return false;
    }
    try {
      return sameExecution(this.#execution, JSON.parse(firstRow) as Partial<OutcomeExecution>);
    } catch {
      return false;
    }
  }
}

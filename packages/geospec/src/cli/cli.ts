/**
 * The `geospec` CLI (D-S4).
 *
 * Everything it does is assembled from parts that already exist — discovery
 * and filtering are runner functions, execution is the pool host, models come
 * from the exporters `geospec.config.*` declares — which is the point: a CLI
 * run and an embedded run take the same path, so a verdict never depends on
 * how the spec was invoked.
 *
 * Three deliberate choices:
 *
 * - **`--json` is the machine contract.** It prints exactly one JSON document
 *   on stdout and nothing else, so an agent can pipe it. Human output goes to
 *   stdout too, but the two modes never interleave.
 * - **The exit code is the verdict.** `0` only when the run succeeded; any
 *   failure, any run-level issue, and any empty selection is `1`. An empty
 *   selection failing is not pedantry — a filter typo that silently "passes"
 *   is the single easiest way to make a suite look green.
 * - **Nothing is retried and nothing is timed out by default.** The per-shard
 *   watchdog is opt-in (`--shard-timeout`); the deterministic work-unit budget
 *   inside the matchers is what bounds a healthy run.
 *
 * @module
 */

import { geoSpecCheckSpecPath, planGeoSpecCheck } from '#cli/check.js';
import type { GeoSpecCliCheckOptions } from '#cli/check.js';
import { protocolWireValue } from '#cli/wire-value.js';
import type { GeoSpecConfigData } from '#config/types.js';
import { discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';
import type { GeoSpecRunner, GeoSpecRunnerResult } from '#runner/worker/runner-types.js';

/** Parsed CLI invocation, or the reason it could not be parsed. */
export type GeoSpecCliCommand =
  | { kind: 'run'; options: GeoSpecCliRunOptions }
  | { kind: 'check'; options: GeoSpecCliCheckOptions }
  | { kind: 'help'; message: string }
  | { kind: 'error'; message: string };

/** Everything `geospec run` accepts. */
export type GeoSpecCliRunOptions = {
  projectPath: string;
  files: string[];
  include: string[];
  exclude: string[];
  testNamePattern?: string;
  testTimeout?: number;
  bail: boolean;
  json: boolean;
  /** Run in a worker pool. `0` means "auto-size". */
  workers?: number;
  shardTimeout?: number;
  /** `geospec.config.*` to use instead of the one in `projectPath`. */
  config?: string;
};

/** The CLI's usage text. Also the answer to `--help` and to a parse error. */
export const geoSpecCliUsage = `geospec — CAD geometry specs

Usage:
  geospec run [projectPath] [options]
  geospec check <file.step|file.stp|file.glb> [--components <n>] [--json]

Options:
  --file <path>              GeoSpec file or directory root (repeatable)
  --include <glob>           Include glob (repeatable, default **/*.geospec.{ts,js})
  --exclude <glob>           Exclude glob (repeatable)
  -t, --test-name-pattern <re>  JavaScript regex matched against 'suite > test'
  --test-timeout <ms>        Per-test async timeout (GEOSPEC_TEST_TIMEOUT)
  --workers [n]              Run in a worker pool; omit n to auto-size
  --shard-timeout <ms>       Non-verdict per-shard watchdog (GEOSPEC_SHARD_TIMEOUT)
  --bail                     Stop after the first failing file
  --config <path>            geospec.config.* to use (default: the one in projectPath)
  --json                     Print one JSON result document and nothing else
  -h, --help                 Show this help

Check:
  geospec check runs one bundled validity spec on a STEP or GLB file, with no
  *.geospec.ts to write: no error diagnostics, closed edge incidence and a
  bounding box with positive size, plus mesh integrity for GLB or a valid BRep
  with closed shells for STEP. --components <n> also requires exactly n
  connected components. The file's folder is the project root; the exit code
  is the verdict.

Timeouts:
  Every host reports wall-clock timeouts with one code family. None of them is
  a geometry verdict, and nothing is timed out unless asked.
  GEOSPEC_TEST_TIMEOUT   a test outlived --test-timeout (test_model testTimeout);
                         the test still settles before the run moves on
  GEOSPEC_SHARD_TIMEOUT  a pool shard outlived --shard-timeout; its worker is
                         terminated
  GEOSPEC_RUN_TIMEOUT    a browser run outlived its host run budget; completed
                         requirements are still reported
  The engine's work-unit budget (MATCHER_TIMEOUT) is deterministic, not a clock.
`;

const numericFlag = (raw: string | undefined, flag: string): number | { error: string } => {
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && value >= 0 ? value : { error: `${flag} needs a number.` };
};

/**
 * Parse the arguments after `check`; like `run`, every unrecognized flag is an error.
 *
 * @param argv - Arguments after `check`.
 * @returns The parsed command.
 */
const parseCheckArguments = (argv: readonly string[]): GeoSpecCliCommand => {
  let file: string | undefined;
  let components: number | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '-h' || argument === '--help') {
      return { kind: 'help', message: geoSpecCliUsage };
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--components') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        return { kind: 'error', message: '--components needs a whole number of at least 1.' };
      }
      components = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      return { kind: 'error', message: `Unknown option '${argument}'.` };
    }
    if (file !== undefined) {
      return { kind: 'error', message: `Unexpected argument '${argument}'.` };
    }
    file = argument;
  }
  if (file === undefined) {
    return { kind: 'error', message: 'geospec check needs a STEP or GLB file.' };
  }
  return { kind: 'check', options: { file, json, ...(components === undefined ? {} : { components }) } };
};

/**
 * Parse an argument vector.
 *
 * Pure: no filesystem, no environment, no process. Every unrecognized flag is
 * an error rather than a silent ignore — a mistyped `--exlude` that quietly
 * ran everything would be a false green.
 *
 * @param argv - Arguments after the executable and script.
 * @returns The parsed command.
 * @public
 */
export const parseGeoSpecCliArguments = (argv: readonly string[]): GeoSpecCliCommand => {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    return { kind: 'help', message: geoSpecCliUsage };
  }
  if (argv[0] === 'check') {
    return parseCheckArguments(argv.slice(1));
  }
  if (argv[0] !== 'run') {
    return { kind: 'error', message: `Unknown command '${argv[0]}'.` };
  }

  const options: GeoSpecCliRunOptions = {
    projectPath: '.',
    files: [],
    include: [],
    exclude: [],
    bail: false,
    json: false,
  };
  let sawProjectPath = false;

  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index]!;
    const next = argv[index + 1];
    switch (argument) {
      case '-h':
      case '--help': {
        return { kind: 'help', message: geoSpecCliUsage };
      }
      case '--file': {
        if (next === undefined) {
          return { kind: 'error', message: '--file needs a path.' };
        }
        options.files.push(next);
        index += 1;
        continue;
      }
      case '--config': {
        if (next === undefined) {
          return { kind: 'error', message: '--config needs a path.' };
        }
        options.config = next;
        index += 1;
        continue;
      }
      case '--include':
      case '--exclude': {
        if (next === undefined) {
          return { kind: 'error', message: `${argument} needs a glob.` };
        }
        (argument === '--include' ? options.include : options.exclude).push(next);
        index += 1;
        continue;
      }
      case '-t':
      case '--test-name-pattern': {
        if (next === undefined) {
          return { kind: 'error', message: `${argument} needs a pattern.` };
        }
        options.testNamePattern = next;
        index += 1;
        continue;
      }
      case '--test-timeout':
      case '--shard-timeout': {
        const parsed = numericFlag(next, argument);
        if (typeof parsed !== 'number') {
          return { kind: 'error', message: parsed.error };
        }
        if (argument === '--test-timeout') {
          options.testTimeout = parsed;
        } else {
          options.shardTimeout = parsed;
        }
        index += 1;
        continue;
      }
      case '--workers': {
        // `--workers` alone auto-sizes; `--workers 4` pins the count.
        if (next === undefined || next.startsWith('-')) {
          options.workers = 0;
          continue;
        }
        const parsed = numericFlag(next, argument);
        if (typeof parsed !== 'number') {
          return { kind: 'error', message: parsed.error };
        }
        options.workers = parsed;
        index += 1;
        continue;
      }
      case '--bail': {
        options.bail = true;
        continue;
      }
      case '--json': {
        options.json = true;
        continue;
      }
      default: {
        if (argument.startsWith('-')) {
          return { kind: 'error', message: `Unknown option '${argument}'.` };
        }
        if (sawProjectPath) {
          return { kind: 'error', message: `Unexpected argument '${argument}'.` };
        }
        options.projectPath = argument;
        sawProjectPath = true;
      }
    }
  }

  return { kind: 'run', options };
};

const fullName = (test: GeoSpecTestCase): string => [...test.suite, test.name].join(' > ');

/** The per-test label: only a failed test prints `fail`; an undecided one names its status. */
const testLabel: Readonly<Record<GeoSpecTestCase['status'], string>> = {
  passed: 'pass',
  failed: 'fail',
  inconclusive: 'inconclusive',
  unsupported: 'unsupported',
  'not-run': 'not-run',
  skipped: 'skip',
};

/**
 * Render one file's result as human-readable lines.
 *
 * A failing test prints every diagnostic it produced, with the code first: the
 * code is what an agent greps for and what a human searches the docs with.
 *
 * @param file - The GeoSpec file.
 * @param result - Its module result.
 * @returns The lines to print.
 * @public
 */
export const formatFileReport = (file: string, result: GeoSpecRunResult): string[] => {
  if (!result.success) {
    return [`FAIL ${file}`, ...result.issues.map((issue) => `  ${issue.code}: ${issue.message}`)];
  }
  const lines = [`${result.passed ? 'PASS' : 'FAIL'} ${file}`];
  for (const test of result.tests) {
    if (test.status === 'passed') {
      continue;
    }
    lines.push(`  ${testLabel[test.status]} ${fullName(test)}`);
    // The collector copies an assertion's diagnostics onto the test, so the two
    // lists overlap; printing both verbatim doubles every line.
    const seen = new Set<string>();
    for (const diagnostic of [
      ...test.diagnostics,
      ...test.assertions.flatMap((assertion) => assertion.diagnostics ?? []),
    ]) {
      const line = `    ${diagnostic.code}: ${diagnostic.message}`;
      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }
  }
  return lines;
};

/**
 * Render the whole run as human-readable lines.
 *
 * @param result - The aggregate result.
 * @returns The lines to print.
 * @public
 */
export const formatRunReport = (result: GeoSpecRunnerResult): string[] => {
  const lines: string[] = [];
  for (const file of result.files) {
    lines.push(...formatFileReport(file.file, file.result));
  }
  for (const issue of result.issues ?? []) {
    lines.push(`${issue.code}: ${issue.message}`);
  }
  lines.push(formatRunHeadline(result));
  return lines;
};

/**
 * The run's headline: its status, passed and failed, then each non-zero undecided or skipped count. It is the line
 * `test_model` prints over MCP (`formatTestModelHeadline` in `@taucad/chat`, which this published CLI cannot import),
 * and both test suites pin the same text.
 *
 * @param result - The aggregate result.
 * @returns For example `GeoSpec inconclusive: 5 passed, 0 failed, 5 inconclusive of 10.`
 * @internal
 */
export const formatRunHeadline = (result: GeoSpecRunnerResult): string => {
  const { accounting } = result;
  const counts = {
    passed: accounting?.passed ?? result.passed,
    failed: accounting?.failed ?? result.failed,
    inconclusive: accounting?.inconclusive ?? 0,
    unsupported: accounting?.unsupported ?? 0,
    notRun: accounting?.notRun ?? 0,
    skipped: accounting?.skipped ?? 0,
    total: accounting?.selected ?? result.selectedTests,
  };
  const status =
    counts.failed > 0
      ? 'failed'
      : counts.inconclusive > 0 || accounting?.cancelled === true
        ? 'inconclusive'
        : counts.unsupported > 0
          ? 'unsupported'
          : counts.total === counts.skipped
            ? 'not-run'
            : result.success
              ? 'passed'
              : 'inconclusive';
  const parts = [`${String(counts.passed)} passed`, `${String(counts.failed)} failed`];
  for (const [count, label] of [
    [counts.inconclusive, 'inconclusive'],
    [counts.unsupported, 'unsupported'],
    [counts.notRun, 'not run'],
    [counts.skipped, 'skipped'],
  ] as const) {
    if (count > 0) {
      parts.push(`${String(count)} ${label}`);
    }
  }
  return `GeoSpec ${status}: ${parts.join(', ')} of ${String(counts.total)}.`;
};

/**
 * The platform the CLI runs against. Injected so the whole command — argument
 * parsing, discovery, execution, reporting, exit code — is testable without a
 * process.
 *
 * @public
 */
export type GeoSpecCliHost = {
  /** Absolute project root for a relative `projectPath`. */
  cwd(): string;
  write(line: string): void;
  /** Recursive discovery filesystem. */
  discoveryFileSystem(projectPath: string): Parameters<typeof discoverGeoSpecFiles>[0]['filesystem'];
  /**
   * Import the project's `geospec.config.*`, or the explicit one, for its data fields.
   * @throws Error when the config is ambiguous, invalid or fails to import.
   */
  loadConfig(options: {
    projectPath: string;
    configPath: string | undefined;
  }): Promise<{ readonly configPath?: string; readonly options: GeoSpecConfigData }>;
  /** Build the runner the selected files execute on; its workers import the same config for its exporters. */
  createRunner(options: {
    projectPath: string;
    configPath: string | undefined;
    workers: number | undefined;
    shardTimeout: number | undefined;
    /** In-memory spec sources keyed by project-rooted path, served in place of the disk (`geospec check`). */
    sources?: Readonly<Record<string, string>>;
  }): GeoSpecRunner;
};

/**
 * The `--json` report: the run projected onto what a consumer can act on.
 *
 * A `GeoSpecRunnerResult` is an in-process structure — every assertion holds
 * the **live geometry subject** it was made against, mesh analysis records and
 * all. Serializing it whole produced a 1.5 GB document for a single file (and
 * threw `RangeError: Invalid string length` before that), so the machine
 * -readable path was unusable exactly where it matters. The report carries the
 * verdicts and the diagnostics; the geometry stays where it belongs.
 *
 * @param result - The run result.
 * @returns The JSON-shaped report.
 * @public
 */
export const runReportJson = (result: GeoSpecRunnerResult): Record<string, unknown> => ({
  success: result.success,
  passed: result.passed,
  failed: result.failed,
  selectedTests: result.selectedTests,
  ...(result.accounting === undefined ? {} : { accounting: result.accounting }),
  ...(result.lineageStatus === undefined ? {} : { lineageStatus: result.lineageStatus }),
  ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
  ...(result.issues === undefined ? {} : { issues: result.issues }),
  files: result.files.map((file) => ({
    file: file.file,
    success: file.result.success && file.result.passed,
    ...(file.result.accounting === undefined ? {} : { accounting: file.result.accounting }),
    ...(file.result.lineage === undefined ? {} : { lineage: protocolWireValue(file.result.lineage) }),
    ...(file.durationMs === undefined ? {} : { durationMs: file.durationMs }),
    ...(file.result.tests === undefined
      ? {}
      : {
          tests: file.result.tests.map((test) => ({
            suite: test.suite,
            name: test.name,
            ...(test.ordinal === undefined ? {} : { ordinal: test.ordinal }),
            status: test.status,
            ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
            diagnostics: [...test.diagnostics, ...test.assertions.flatMap((assertion) => assertion.diagnostics ?? [])],
            ...(test.assertions.some((assertion) => assertion.report !== undefined)
              ? {
                  reports: test.assertions.flatMap((assertion) => {
                    const { report } = assertion;
                    return report === undefined
                      ? []
                      : [
                          {
                            claimId: report.claimId,
                            status: report.status,
                            polarity: report.polarity,
                            claim: structuredClone(report.claim),
                            result: structuredClone(report.result),
                            diagnostics: structuredClone(report.diagnostics),
                            ...(report.evidence === undefined ? {} : { evidence: structuredClone(report.evidence) }),
                            ...(assertion.loadId === undefined ? {} : { loadId: assertion.loadId }),
                            canonical: {
                              claim: [...report.canonicalClaim],
                              plan: [...report.canonicalPlan],
                              result: [...report.canonicalResult],
                            },
                          },
                        ];
                  }),
                }
              : {}),
          })),
        }),
    ...(file.result.success ? {} : { issues: file.result.issues }),
  })),
});

/**
 * Chunk size above which a value is serialized structurally rather than whole.
 *
 * Well under V8's maximum string length: `JSON.stringify` throws `RangeError:
 * Invalid string length` past it, which is how the whole `--json` path became
 * unavailable on exactly the corpus it exists for.
 */
const maxJsonChunkLength = 64 * 1024 * 1024;

/** `JSON.stringify`, or `undefined` when the value is unrepresentable or too long to build. */
const tryStringify = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value);
  } catch {
    /* v8 ignore next -- Only a RangeError from an over-long document reaches here. */
    return undefined;
  }
};

/**
 * Serialize a value as JSON in bounded chunks.
 *
 * Whole values are emitted whole; only a value too long to build as one string
 * is descended into, one member at a time, until the pieces fit. The
 * concatenation is exactly the document `JSON.stringify` would have produced —
 * the caller may join the chunks with any JSON whitespace, which is what makes
 * a line-writing host safe to stream through.
 *
 * @param value - The value to serialize.
 * @param limit - Maximum chunk length before descending.
 * @returns The JSON document, in order.
 * @public
 */
export function* jsonChunks(value: unknown, limit: number = maxJsonChunkLength): Generator<string> {
  const encoded = tryStringify(value);
  if (encoded !== undefined && encoded.length <= limit) {
    yield encoded;
    return;
  }
  // A leaf too long to split is emitted whole or not at all; only containers
  // have members to stream.
  if (typeof value !== 'object' || value === null) {
    yield encoded ?? 'null';
    return;
  }
  if (Array.isArray(value)) {
    yield '[';
    for (const [index, item] of value.entries()) {
      if (index > 0) {
        yield ',';
      }
      yield* jsonChunks(item, limit);
    }
    yield ']';
    return;
  }
  // `JSON.stringify` omits own properties holding undefined, a function or a
  // symbol; so does this. (Testing representability by re-stringifying would
  // read "too long to build" as "omit me" and silently drop the payload.)
  const entries = Object.entries(value).filter(
    ([, member]) => member !== undefined && typeof member !== 'function' && typeof member !== 'symbol',
  );
  yield '{';
  for (const [index, [key, member]] of entries.entries()) {
    yield `${index > 0 ? ',' : ''}${JSON.stringify(key)}:`;
    yield* jsonChunks(member, limit);
  }
  yield '}';
}

/**
 * Run the CLI.
 *
 * @param argv - Arguments after the executable and script.
 * @param host - The injected platform.
 * @returns The process exit code.
 * @public
 */
export const runGeoSpecCli = async (argv: readonly string[], host: GeoSpecCliHost): Promise<number> => {
  const command = parseGeoSpecCliArguments(argv);
  if (command.kind === 'help') {
    host.write(command.message);
    return 0;
  }
  if (command.kind === 'error') {
    host.write(`${command.message}\n\n${geoSpecCliUsage}`);
    return 1;
  }

  if (command.kind === 'check') {
    return runGeoSpecCheck(command.options, host);
  }

  const { options } = command;
  const projectPath = options.projectPath.startsWith('/')
    ? options.projectPath
    : `${host.cwd()}/${options.projectPath}`.replace(/\/\.$/u, '');

  let config: Awaited<ReturnType<GeoSpecCliHost['loadConfig']>>;
  try {
    config = await host.loadConfig({ projectPath, configPath: options.config });
  } catch (error) {
    const message = `GeoSpec config: ${error instanceof Error ? error.message : String(error)}`;
    host.write(options.json ? JSON.stringify({ success: false, error: message }) : message);
    return 1;
  }
  // A flag replaces the config's field; the config replaces the runner's default.
  const include = options.include.length > 0 ? options.include : config.options.include;
  const exclude = options.exclude.length > 0 ? options.exclude : config.options.exclude;
  const testNamePattern = options.testNamePattern ?? config.options.testNamePattern;
  const testTimeout = options.testTimeout ?? config.options.testTimeout;
  const bail = options.bail || config.options.bail === true;

  const discovery = await discoverGeoSpecFiles({
    filesystem: host.discoveryFileSystem(projectPath),
    projectPath,
    ...(options.files.length > 0 ? { files: options.files } : {}),
    ...(include === undefined ? {} : { include }),
    ...(exclude === undefined ? {} : { exclude }),
  });

  if (discovery.files.length === 0) {
    // Discovery reports an unmatched root for every root that selected
    // nothing, and it always has at least one root, so the list is never empty
    // here — naming it is what turns "no tests ran" from a mystery into a typo.
    const message = `No GeoSpec files matched (unmatched: ${discovery.unmatchedRoots.join(', ')}).`;
    host.write(options.json ? JSON.stringify({ success: false, error: message, ...discovery }) : message);
    return 1;
  }

  const runner = host.createRunner({
    projectPath,
    configPath: config.configPath,
    workers: options.workers,
    shardTimeout: options.shardTimeout,
  });
  let result: GeoSpecRunnerResult;
  try {
    result = await runner.run({
      files: discovery.files,
      ...(testNamePattern === undefined ? {} : { testNamePattern }),
      ...(testTimeout === undefined ? {} : { testTimeout }),
      ...(bail ? { bail: true } : {}),
    });
  } finally {
    await runner.close();
  }

  writeRunResult(result, options.json, host);
  return result.success ? 0 : 1;
};

/**
 * Print a run's report: one JSON document under `--json`, otherwise the human lines.
 *
 * @param result - The run result.
 * @param json - Whether to print the JSON document.
 * @param host - The injected platform.
 */
const writeRunResult = (result: GeoSpecRunnerResult, json: boolean, host: GeoSpecCliHost): void => {
  if (json) {
    for (const chunk of jsonChunks(runReportJson(result))) {
      host.write(chunk);
    }
  } else {
    host.write(formatRunReport(result).join('\n'));
  }
};

/**
 * Whether a path names a file, without throwing for a missing one.
 *
 * @param filesystem - The discovery filesystem.
 * @param path - Absolute path.
 * @returns True for an existing file.
 */
const isFile = async (
  filesystem: ReturnType<GeoSpecCliHost['discoveryFileSystem']>,
  path: string,
): Promise<boolean> => {
  try {
    const entry = await filesystem.stat(path);
    return entry.kind === 'file';
  } catch {
    return false;
  }
};

/**
 * Run `geospec check`: the bundled validity spec, served from memory, in the model's folder.
 *
 * @param options - The parsed check options.
 * @param host - The injected platform.
 * @returns The process exit code.
 */
const runGeoSpecCheck = async (options: GeoSpecCliCheckOptions, host: GeoSpecCliHost): Promise<number> => {
  const refuse = (message: string): number => {
    host.write(options.json ? JSON.stringify({ success: false, error: message }) : message);
    return 1;
  };
  const plan = planGeoSpecCheck(options, host.cwd());
  if ('error' in plan) {
    return refuse(plan.error);
  }
  if (!(await isFile(host.discoveryFileSystem(plan.projectPath), `${plan.projectPath}/${plan.file}`))) {
    return refuse(`geospec check found no file at '${options.file}'.`);
  }
  const runner = host.createRunner({
    projectPath: plan.projectPath,
    configPath: undefined,
    workers: undefined,
    shardTimeout: undefined,
    sources: plan.sources,
  });
  let result: GeoSpecRunnerResult;
  try {
    result = await runner.run({ files: [geoSpecCheckSpecPath] });
  } finally {
    await runner.close();
  }
  writeRunResult(result, options.json, host);
  return result.success ? 0 : 1;
};

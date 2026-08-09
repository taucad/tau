#!/usr/bin/env node
import { readFile, mkdir, stat, writeFile, readdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { defaultGeoSpecInclude, discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import {
  createGeoSpecNodeInvocationContext,
  createGeoSpecNodeInvocationContextStats,
} from '#runner/node/invocation-context.js';
import { createGeoSpecNodePoolRunner, createGeoSpecNodeRunner } from '#runner/node/index.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { createGeoSpecRunProfile } from '#runner/profile.js';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from '#runner/worker/index.js';
import type { GeoSpecTestCase } from '#runner/types.js';
import { flushGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { installNodeEvidenceCache } from '#cache/node-evidence-store.js';
import { processPeakRssBytes, writeGeoSpecTimings } from '#cache/timings.js';
import type { GeoSpecFileTiming } from '#cache/timings.js';
import { loadStep } from '#step/index.js';

/**
 * Options accepted by the GeoSpec Node CLI runner.
 *
 * @public
 */
export type GeoSpecCliOptions = {
  argv?: string[];
  cwd?: string;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

/**
 * File and test filters accepted by the GeoSpec CLI and agent-facing Tau
 * runner bridge.
 *
 * @public
 */
export type GeoSpecCliRunOptions = {
  files: string[];
  include: string[];
  exclude: string[];
  testNamePattern?: string;
  /** Milliseconds. */
  testTimeout?: number;
  json: boolean;
  /** Streaming machine-readable reporter: one JSON object per runner event (R1). */
  reporter?: 'jsonl';
  /** Stop after the first failing file (R1). Never the default: reward runs want the complete red set. */
  bail: boolean;
  /** Worker-pool size (R3): 1 = serial engine; omit for container-correct auto-sizing (R15). */
  workers?: number;
};

const resolveNodeVmPath = (options: { root: string; path: string }): string =>
  isAbsolute(options.path) ? options.path : join(options.root, options.path);

const createNodeDiscoveryFileSystem = (root: string): GeoSpecDiscoveryFileSystem => ({
  async readdir(path: string): Promise<readonly string[]> {
    return readdir(resolveNodeVmPath({ root, path }));
  },
  async stat(path: string) {
    const fileStat = await stat(resolveNodeVmPath({ root, path }));
    return { kind: fileStat.isDirectory() ? 'directory' : 'file' };
  },
});

const helpText = `Usage: geospec [run] [project-directory] [options]

Runs *.geospec.ts and *.geospec.js files through the GeoSpec VM runner.

Options:
  --file <path>                 GeoSpec file or directory root to run; repeatable
  --include <glob>              GeoSpec file include glob; repeatable
  --exclude <glob>              GeoSpec file exclude glob; repeatable
  --testNamePattern <regexp>    RegExp matched against full suite > test names
  --test-name-pattern <regexp>  Alias for --testNamePattern
  -t <regexp>                   Alias for --testNamePattern
  --test-timeout <ms>           Async test timeout in milliseconds
  --json                        Print machine-readable JSON
  --reporter jsonl              Stream one JSON line per runner event to stdout
  --bail                        Stop after the first failing file
  --workers <n>                 Worker-pool size; 1 = serial, default = auto (cpus/memory aware)
  -h, --help                    Show this help
`;

const printHelp = (stdout: (message: string) => void): void => {
  stdout(helpText);
};

type ParsedCliArgs =
  | { help: true; errors: string[] }
  | { help: false; projectDirectory: string; run: GeoSpecCliRunOptions; errors: string[] };

const flagNamesWithValues = new Set([
  '--include',
  '--exclude',
  '--file',
  '--testNamePattern',
  '--test-name-pattern',
  '-t',
  '--test-timeout',
  '--pattern',
  '--reporter',
  '--workers',
]);

const parseIntegerFlag = (options: {
  flag: string;
  value: string | undefined;
  errors: string[];
}): number | undefined => {
  if (options.value === undefined || options.value.trim() === '') {
    options.errors.push(`${options.flag} requires a value.`);
    return undefined;
  }

  const parsed = Number.parseInt(options.value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    options.errors.push(`${options.flag} must be a positive integer.`);
    return undefined;
  }

  return parsed;
};

const parseCliArgs = (argv: readonly string[]): ParsedCliArgs => {
  const errors: string[] = [];
  const run: GeoSpecCliRunOptions = {
    files: [],
    include: [],
    exclude: [],
    json: false,
    bail: false,
  };
  let index = 0;
  let projectDirectory = '.';
  let sawProjectDirectory = false;

  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, errors };
  }

  if (argv.includes('--json') && argv.includes('--reporter')) {
    errors.push('--json and --reporter jsonl are mutually exclusive; choose one machine-readable output.');
  }

  if (argv[index] === 'run') {
    index += 1;
  }

  while (index < argv.length) {
    const token = argv[index]!;
    if (token === '--json') {
      run.json = true;
      index += 1;
      continue;
    }
    if (token === '--bail') {
      run.bail = true;
      index += 1;
      continue;
    }
    if (flagNamesWithValues.has(token)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) {
        errors.push(`${token} requires a value.`);
        index += 1;
        continue;
      }
      switch (token) {
        case '--pattern': {
          run.include = [value];
          break;
        }
        case '--file': {
          run.files.push(value);
          break;
        }
        case '--include': {
          run.include.push(value);
          break;
        }
        case '--exclude': {
          run.exclude.push(value);
          break;
        }
        case '--test-timeout': {
          run.testTimeout = parseIntegerFlag({ flag: token, value, errors });
          break;
        }
        case '--workers': {
          run.workers = parseIntegerFlag({ flag: token, value, errors });
          break;
        }
        case '--testNamePattern':
        case '--test-name-pattern':
        case '-t': {
          run.testNamePattern = value;
          break;
        }
        case '--reporter': {
          if (value === 'jsonl') {
            run.reporter = value;
          } else {
            errors.push(`--reporter supports only 'jsonl', got '${value}'.`);
          }
          break;
        }
      }
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      errors.push(`Unknown option: ${token}`);
      index += 1;
      continue;
    }
    if (sawProjectDirectory) {
      errors.push(`Unexpected argument: ${token}. Use --file to select GeoSpec files or directories.`);
    } else {
      projectDirectory = token;
      sawProjectDirectory = true;
    }
    index += 1;
  }

  return { help: false, projectDirectory, run, errors };
};

type GeoSpecCliIssue = { code: string; message: string; severity: string; type: string };
type GeoSpecCliDiagnostic = {
  code: string;
  message: string;
  severity: string;
  suggestion?: string;
  details?: unknown;
};

type GeoSpecCliFileResult = {
  file: string;
  success: boolean;
  durationMs?: number;
  issues?: GeoSpecCliIssue[];
  tests?: Array<{
    name: string;
    suite: string[];
    status: string;
    durationMs?: number;
    diagnostics?: GeoSpecCliDiagnostic[];
  }>;
};

type GeoSpecCliJsonResult = {
  success: boolean;
  passed: number;
  failed: number;
  durationMs?: number;
  issues?: GeoSpecCliIssue[];
  files: GeoSpecCliFileResult[];
};

const cliDiagnostics = (diagnostics: readonly GeometryDiagnostic[]): GeoSpecCliDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
  }));

const diagnosticsForTest = (test: GeoSpecTestCase): readonly GeometryDiagnostic[] => {
  const assertionDiagnostics = test.assertions.flatMap((assertion) => assertion.diagnostics ?? []);
  return assertionDiagnostics.length > 0 ? assertionDiagnostics : test.diagnostics;
};

const profilePathEnvironmentKey = 'GEOSPEC_PROFILE_JSON_PATH';

const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * Aggregate per-matcher duration totals from collected assertions (R1:
 * "per-matcher totals to the profile JSON").
 */
const aggregateMatcherTotals = (
  files: ReadonlyArray<{ result: { success: boolean; tests?: GeoSpecTestCase[] } }>,
): Record<string, { count: number; totalMs: number; maxMs: number }> => {
  const totals: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  for (const { result } of files) {
    if (!result.success || !result.tests) {
      continue;
    }
    for (const test of result.tests) {
      for (const assertion of test.assertions) {
        if (assertion.durationMs === undefined) {
          continue;
        }
        const entry = (totals[assertion.kind] ??= { count: 0, totalMs: 0, maxMs: 0 });
        entry.count += 1;
        entry.totalMs += assertion.durationMs;
        entry.maxMs = Math.max(entry.maxMs, assertion.durationMs);
      }
    }
  }
  return totals;
};

/**
 * Run the GeoSpec command-line interface.
 *
 * @param options - command arguments and output sinks.
 * @returns process exit code.
 * @public
 */
export const runGeoSpecCli = async (options: GeoSpecCliOptions = {}): Promise<number> => {
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;
  const parsed = parseCliArgs(options.argv ?? process.argv.slice(2));
  if (parsed.help) {
    printHelp(stdout);
    return 0;
  }
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) {
      stderr(error);
    }
    return 1;
  }

  const projectPath = resolve(options.cwd ?? process.cwd(), parsed.projectDirectory);
  // R5: authenticated out-of-tree evidence cache (GEOSPEC_EVIDENCE_CACHE=0 disables).
  installNodeEvidenceCache(projectPath);
  const filesystem = createNodeVmFileSystem(projectPath);
  const discovery = await discoverGeoSpecFiles({
    filesystem: createNodeDiscoveryFileSystem(projectPath),
    projectPath,
    files: parsed.run.files,
    include: parsed.run.include.length > 0 ? parsed.run.include : defaultGeoSpecInclude,
    exclude: parsed.run.exclude,
  });
  const { files } = discovery;

  if (files.length === 0) {
    stderr('No matching *.geospec.ts or *.geospec.js files found.');
    return 1;
  }

  const profilePath = process.env[profilePathEnvironmentKey];
  const invocationStats = profilePath ? createGeoSpecNodeInvocationContextStats() : undefined;
  const runProfile = profilePath ? createGeoSpecRunProfile() : undefined;

  // R3 routing: the worker pool is the default for multi-file runs; the serial
  // engine remains `--workers 1`, single-file runs, and profiled runs (whose
  // in-process counters a pool cannot observe).
  const environmentWorkers = Number(process.env['GEOSPEC_WORKERS']);
  const requestedWorkers =
    parsed.run.workers ??
    (Number.isFinite(environmentWorkers) && environmentWorkers >= 1 ? Math.floor(environmentWorkers) : undefined);
  const usePool = files.length > 1 && requestedWorkers !== 1 && !profilePath;

  const invocationContext = usePool
    ? undefined
    : createGeoSpecNodeInvocationContext({
        projectPath,
        ...(invocationStats ? { stats: invocationStats } : {}),
      });

  // R1: stream lifecycle events to stderr by default; a heartbeat covers the
  // long silent stretch inside a heavy file (exit criterion: no >10 s silence).
  const fileLabel = (file: string): string => (isAbsolute(file) ? relative(projectPath, file) : file);
  const jsonl = parsed.run.reporter === 'jsonl';
  const emitJsonl = (record: Record<string, unknown>): void => {
    if (jsonl) {
      stdout(JSON.stringify(record));
    }
  };
  const running = new Map<string, number>();
  const fileTelemetry: Record<string, GeoSpecFileTiming> = {};
  const heartbeat = setInterval(() => {
    for (const [label, startedAt] of running) {
      stderr(`[geospec] … ${label} running ${formatSeconds(performance.now() - startedAt)}`);
    }
  }, 10_000);
  heartbeat.unref();

  const onEvent = (event: GeoSpecRunnerEvent): void => {
    switch (event.type) {
      case 'run-start': {
        stderr(`[geospec] run ${event.files.length} file(s)`);
        emitJsonl({ event: 'run-start', files: event.files.map(fileLabel) });
        break;
      }
      case 'file-start': {
        const label = fileLabel(event.file);
        running.set(label, performance.now());
        stderr(`[geospec] ▶ ${label}`);
        emitJsonl({ event: 'file-start', file: label });
        break;
      }
      case 'file-complete': {
        const label = fileLabel(event.file);
        running.delete(label);
        const durationMs = event.durationMs ?? 0;
        fileTelemetry[label] = {
          durationMs,
          processPeakRssBytes: processPeakRssBytes(),
          ...(event.primaryLoadKey === undefined ? {} : { primaryLoadKey: event.primaryLoadKey }),
          ...(event.workerMemoryBytes === undefined ? {} : { workerMemoryBytes: event.workerMemoryBytes }),
          updatedAt: new Date().toISOString(),
        };
        if (event.result.success) {
          const failedTests = event.result.tests.filter((test) => test.status === 'failed').length;
          const outcome = failedTests === 0 ? 'pass' : `fail (${failedTests})`;
          stderr(`[geospec] ${failedTests === 0 ? '✓' : '✗'} ${label} ${outcome} ${formatSeconds(durationMs)}`);
          emitJsonl({
            event: 'file-complete',
            file: label,
            success: failedTests === 0,
            durationMs,
            tests: event.result.tests.map((test) => ({
              name: test.name,
              suite: test.suite,
              status: test.status,
              ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
            })),
          });
        } else {
          stderr(`[geospec] ✗ ${label} module failure ${formatSeconds(durationMs)}`);
          emitJsonl({
            event: 'file-complete',
            file: label,
            success: false,
            durationMs,
            issues: event.result.issues.map((issue) => issue.code),
          });
        }
        break;
      }
      case 'run-complete': {
        emitJsonl({
          event: 'run-complete',
          success: event.result.success,
          passed: event.result.passed,
          failed: event.result.failed,
          ...(event.result.durationMs === undefined ? {} : { durationMs: event.result.durationMs }),
        });
        break;
      }
      case 'abort': {
        stderr(`[geospec] aborted${event.reason ? `: ${event.reason}` : ''}`);
        emitJsonl({ event: 'abort', ...(event.reason ? { reason: event.reason } : {}) });
        break;
      }
      case 'close': {
        break;
      }
    }
  };

  let runner: GeoSpecRunner;
  if (usePool) {
    // R15: all pool workers share this process's libuv threadpool — size it
    // before the first worker spawns so multi-MB artifact reads never
    // serialize on the default 4 threads.
    process.env['UV_THREADPOOL_SIZE'] ??= String(availableParallelism() + 2);
    runner = createGeoSpecNodePoolRunner({
      projectPath,
      ...(requestedWorkers === undefined ? {} : { workers: requestedWorkers }),
      onEvent,
    });
  } else {
    runner = createGeoSpecNodeRunner({
      filesystem,
      projectPath,
      modelLoader: invocationContext!.modelLoader,
      stepLoader: async (input) => loadStep(input),
      onEvent,
      ...(runProfile ? { internalProfile: runProfile } : {}),
    });
  }
  const aggregate = await runner
    .run({
      files: files.sort(),
      testNamePattern: parsed.run.testNamePattern,
      testTimeout: parsed.run.testTimeout,
      bail: parsed.run.bail,
    })
    .finally(async () => {
      clearInterval(heartbeat);
      // R9: land any write-behind evidence entries before the process winds down.
      await flushGeoSpecEvidenceStore();
      await writeGeoSpecTimings(projectPath, fileTelemetry);
      try {
        await runner.close();
      } finally {
        await invocationContext?.dispose();
        if (profilePath && invocationStats && runProfile) {
          await mkdir(dirname(profilePath), { recursive: true });
          await writeFile(
            profilePath,
            JSON.stringify(
              {
                version: 1,
                runtime: invocationStats,
                runner: runProfile,
              },
              null,
              2,
            ),
            'utf8',
          );
        }
      }
    });

  // R1: per-matcher totals appended to the profile JSON after results exist.
  if (profilePath) {
    try {
      const raw = await readFile(profilePath, 'utf8');
      const profileJson: Record<string, unknown> = JSON.parse(raw) as Record<string, unknown>;
      profileJson['matchers'] = aggregateMatcherTotals(aggregate.files);
      await writeFile(profilePath, JSON.stringify(profileJson, null, 2), 'utf8');
    } catch {
      // Profile augmentation must never fail the run.
    }
  }

  const fileResults: GeoSpecCliFileResult[] = [];

  for (const { file, result, durationMs } of aggregate.files) {
    const label = isAbsolute(file) ? relative(projectPath, file) : file;
    if (!result.success) {
      fileResults.push({
        file: label,
        success: false,
        ...(durationMs === undefined ? {} : { durationMs }),
        issues: result.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
          type: issue.type,
        })),
      });
      stderr(`FAIL ${label}`);
      for (const issue of result.issues) {
        stderr(`  ${issue.message}`);
      }
      continue;
    }

    for (const test of result.tests) {
      if (test.status === 'skipped') {
        continue;
      }
      if (test.status === 'failed') {
        stderr(`FAIL ${label} ${[...test.suite, test.name].join(' > ')}`);
        for (const diagnostic of diagnosticsForTest(test)) {
          stderr(`  ${diagnostic.message}`);
        }
      }
    }
    fileResults.push({
      file: label,
      success: result.tests.every((test) => test.status !== 'failed'),
      ...(durationMs === undefined ? {} : { durationMs }),
      tests: result.tests.map((test) => {
        const diagnostics = diagnosticsForTest(test);
        return {
          name: test.name,
          suite: test.suite,
          status: test.status,
          ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
          ...(diagnostics.length === 0 ? {} : { diagnostics: cliDiagnostics(diagnostics) }),
        };
      }),
    });
  }

  const runIssues: GeoSpecCliIssue[] = (aggregate.issues ?? []).map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: issue.severity,
    type: issue.type,
  }));
  for (const issue of runIssues) {
    stderr(issue.message);
  }

  if (parsed.run.json) {
    const jsonResult: GeoSpecCliJsonResult = {
      success: aggregate.success,
      passed: aggregate.passed,
      failed: aggregate.failed,
      ...(aggregate.durationMs === undefined ? {} : { durationMs: aggregate.durationMs }),
      ...(runIssues.length > 0 ? { issues: runIssues } : {}),
      files: fileResults,
    };
    stdout(JSON.stringify(jsonResult, null, 2));
  } else if (!jsonl) {
    const duration = aggregate.durationMs === undefined ? '' : ` in ${formatSeconds(aggregate.durationMs)}`;
    stdout(`${aggregate.passed} passed, ${aggregate.failed} failed${duration}`);
  }
  return aggregate.failed === 0 ? 0 : 1;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = await runGeoSpecCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

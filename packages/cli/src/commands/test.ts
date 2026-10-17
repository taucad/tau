/**
 * `tau test` — run a project's GeoSpec suites headlessly (charter D29, C1 R2).
 *
 * The host already runs GeoSpec for MCP `test_model` with `createHostGeoSpecRunner` over a runtime client; this verb
 * runs that runner over the CLI runtime `tau export` and `tau check` use, so CI can run a project's own tests without
 * an agent. Discovery is GeoSpec's own (`*.geospec.ts` under the project, or the files named). Native kernels are
 * composed from the payload store's receipts and nothing is downloaded (I5): a suite over an unprepared `.py` model
 * fails with the kernel's `KERNEL_NOT_PREPARED` refusal and exits 3.
 *
 * Exit codes: 0 every selected test passed, 1 a test failed, 2 an unusable request, 3 nothing ran because the runtime
 * declined (no GeoSpec engine, no suite found, a kernel not prepared).
 *
 * @module
 */
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createHostGeoSpecRunner } from '@taucad/host/agent-tools';
import type { HostGeoSpecRunner, HostGeoSpecRuntimeClient } from '@taucad/host/agent-tools';
import { createNodeClient } from '@taucad/runtime/node';
import { defineCommand } from 'citty';

import { composeNativeKernels } from '#native-kernels.js';
import { cliError, createOutput, emit, exitCodes, sanitize } from '#output.js';
import { loadCliRuntime } from '#runtime-options.js';
import { authorizeCliZooProxy, cliZooProxyUrl } from '#zoo-proxy.js';

/** One test as the `test` record carries it. */
export type TestCaseRecord = Readonly<{
  file: string;
  name: string;
  status: string;
  message?: string;
}>;

/** What `tau test --json` prints. */
export type TestRecord = Readonly<{
  kind: 'test';
  ok: boolean;
  status: 'passed' | 'failed' | 'refused';
  project: string;
  files: readonly string[];
  passed: number;
  failed: number;
  selected: number;
  tests: readonly TestCaseRecord[];
  issues: ReadonlyArray<Readonly<{ code: string; message: string }>>;
}>;

/** Issue codes that mean the runtime declined the request rather than a test failing. */
const refusedCodes = new Set(['KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING', 'KERNEL_NOT_PREPARED']);

/** A diagnostic as GeoSpec reports it on a test, an assertion or a run. */
type Diagnostic = Readonly<{ code: string; message: string; severity?: string }>;

/** The parts of a GeoSpec run result `tau test` reads (`GeoSpecRunnerResult` from `geospec/runner/worker`). */
type RunResult = Readonly<{
  success: boolean;
  passed: number;
  failed: number;
  selectedTests: number;
  issues?: readonly Diagnostic[];
  files: ReadonlyArray<
    Readonly<{
      file: string;
      result: Readonly<{
        issues?: readonly Diagnostic[];
        tests?: ReadonlyArray<
          Readonly<{
            name: string;
            suite: readonly string[];
            status: string;
            diagnostics: readonly Diagnostic[];
            assertions: ReadonlyArray<Readonly<{ passed?: boolean; diagnostics?: readonly Diagnostic[] }>>;
          }>
        >;
      }>;
    }>
  >;
}>;

/**
 * Project a GeoSpec run into the `test` record.
 *
 * @internal
 * @param project - The project root.
 * @param files - The project-relative suites that ran.
 * @param result - The runner's result.
 * @returns The record, `refused` when nothing passed and a diagnostic names a request the runtime declined.
 */
export const testRecord = (project: string, files: readonly string[], result: RunResult): TestRecord => {
  const diagnostics: Diagnostic[] = [];
  const tests = result.files.flatMap(({ file, result: fileResult }) =>
    (fileResult.tests ?? []).map((test): TestCaseRecord => {
      const failures = [
        ...test.diagnostics,
        ...test.assertions.flatMap((assertion) => (assertion.passed === false ? (assertion.diagnostics ?? []) : [])),
      ].filter((diagnostic) => diagnostic.severity !== 'info');
      diagnostics.push(...failures);
      const [first] = failures;
      return {
        file,
        name: [...test.suite, test.name].join(' > '),
        status: test.status,
        ...(test.status === 'passed' || first === undefined ? {} : { message: sanitize(first.message) }),
      };
    }),
  );
  const issues = [
    ...(result.issues ?? []),
    ...result.files.flatMap(({ result: fileResult }) => fileResult.issues ?? []),
  ];
  const refused =
    !result.success &&
    result.passed === 0 &&
    [...issues, ...diagnostics].some(
      (diagnostic) =>
        refusedCodes.has(diagnostic.code) || [...refusedCodes].some((code) => diagnostic.message.includes(code)),
    );
  return {
    kind: 'test',
    ok: result.success,
    status: result.success ? 'passed' : refused ? 'refused' : 'failed',
    project,
    files,
    passed: result.passed,
    failed: result.failed,
    selected: result.selectedTests,
    tests,
    issues: issues.map(({ code, message }) => ({ code, message: sanitize(message) })),
  };
};

const exitFor: Readonly<Record<TestRecord['status'], number>> = {
  passed: exitCodes.ok,
  failed: exitCodes.error,
  refused: exitCodes.refused,
};

/**
 * The run's one-line totals, naming the inconclusive tests that are neither passed nor failed.
 *
 * @internal
 * @param record - The run's record.
 * @returns The summary line.
 */
export const testSummary = (record: TestRecord): string => {
  const inconclusive = record.tests.filter((test) => test.status === 'inconclusive').length;
  return `${String(record.passed)} passed, ${String(record.failed)} failed of ${String(record.selected)} selected${inconclusive === 0 ? '' : `, ${String(inconclusive)} inconclusive`}`;
};

/**
 * `tau test` command.
 *
 * @example <caption>Run a project's GeoSpec suites in CI</caption>
 * ```bash
 * tau test
 * tau test ./bracket --file=bracket.geospec.ts --json
 * ```
 */
export const testCommand = defineCommand({
  meta: {
    name: 'test',
    description: 'Run a project’s GeoSpec suites; exit 0 passed, 1 failed, 3 refused',
  },
  args: {
    project: {
      type: 'positional',
      description: 'Project directory (defaults to the current directory)',
      required: false,
    },
    file: {
      type: 'string',
      description: 'GeoSpec file or directory to run, relative to the project (repeatable; defaults to every suite)',
      required: false,
      multiple: true,
    },
    testNamePattern: {
      type: 'string',
      description: 'Regular expression matched against full "suite > test" names',
      required: false,
    },
    plugin: {
      type: 'string',
      description: 'Default-invoked plugin package or path installed in the invoking project (repeatable)',
      required: false,
      multiple: true,
    },
    config: {
      type: 'string',
      description: 'Configuration module exporting an invoked "plugins" array',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON test record to stdout',
      required: false,
    },
  },
  async run({ args }) {
    const output = await createOutput();
    const projectRoot = resolve(typeof args.project === 'string' ? args.project : process.cwd());
    try {
      const entry = await stat(projectRoot);
      if (!entry.isDirectory()) {
        throw new Error('not a directory');
      }
    } catch {
      throw cliError('PROJECT_NOT_FOUND', `Project directory not found: ${projectRoot}.`, exitCodes.usage);
    }
    const requested = Array.isArray(args.file)
      ? args.file.filter((value): value is string => typeof value === 'string')
      : typeof args.file === 'string'
        ? [args.file]
        : [];

    const { discoverGeoSpecFiles } = await import('geospec/runner');
    const discovery = await discoverGeoSpecFiles({
      filesystem: {
        readdir: async (path) => readdir(path),
        stat: async (path) => {
          const entry = await stat(path);
          return { kind: entry.isDirectory() ? 'directory' : 'file' };
        },
      },
      projectPath: projectRoot,
      ...(requested.length === 0 ? {} : { files: requested }),
    });
    if (discovery.files.length === 0) {
      throw cliError(
        'GEOSPEC_NO_SUITES',
        `No GeoSpec suite found under ${projectRoot}${requested.length === 0 ? '' : ` for ${requested.join(', ')}`}. Name suites *.geospec.ts, or pass --file.`,
        exitCodes.refused,
      );
    }

    const native = await composeNativeKernels();
    authorizeCliZooProxy(process.env);
    const runtime = await loadCliRuntime({
      projectRoot: process.cwd(),
      plugin: args.plugin,
      config: args.config,
      ...(native.build123d === undefined ? {} : { build123d: native.build123d }),
      ...(native.picogk === undefined ? {} : { picogk: native.picogk }),
      unavailableKernels: native.unavailable,
      zooProxyUrl: cliZooProxyUrl(process.env),
    });
    const client = await createNodeClient({ runtime, projectPath: projectRoot });
    client.on('log', (entry) => {
      const level = entry.level as 'info' | 'warn' | 'error' | 'debug';
      if (level in output) {
        output[level](sanitize(entry.message));
      }
    });
    let runner: HostGeoSpecRunner | undefined;
    const onSignal = (signal: NodeJS.Signals): void => {
      runner?.abort(`tau test cancelled by ${signal}`);
      process.exitCode = signal === 'SIGINT' ? exitCodes.interrupted : exitCodes.terminated;
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    let record: TestRecord;
    try {
      try {
        runner = await createHostGeoSpecRunner(projectRoot, client as unknown as HostGeoSpecRuntimeClient);
      } catch (error) {
        /* The GeoSpec engine is an optional peer of the host; without it nothing can run. */
        if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
          throw cliError(
            'GEOSPEC_UNAVAILABLE',
            `The GeoSpec engine is not installed beside this CLI, so tau test cannot run: ${(error as Error).message}`,
            exitCodes.refused,
          );
        }
        throw error;
      }
      output.start(`Running ${String(discovery.files.length)} GeoSpec suite(s) in ${projectRoot}`);
      const result = await runner.run({
        files: discovery.files,
        ...(args.testNamePattern === undefined ? {} : { testNamePattern: args.testNamePattern }),
      });
      record = testRecord(projectRoot, discovery.files, result as RunResult);
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      try {
        await runner?.close();
      } finally {
        await client.shutdown();
      }
    }

    if (args.json) {
      await emit(record);
    }
    for (const test of record.tests) {
      const line = `${test.file} › ${test.name}${test.message === undefined ? '' : `: ${test.message}`}`;
      if (test.status === 'passed') {
        output.success(line);
      } else if (test.status === 'skipped' || test.status === 'todo') {
        output.info(`${line} (${test.status})`);
      } else {
        output.error(line);
      }
    }
    for (const issue of record.issues) {
      output.error(`${issue.code}: ${issue.message}`);
    }
    const summary = testSummary(record);
    if (record.status === 'passed') {
      output.success(summary);
      return;
    }
    /* Exactly one record on stdout, as `tau check` reports it. */
    process.stderr.write(`GeoSpec ${record.status === 'refused' ? 'refused' : 'failed'}: ${summary}\n`);
    process.exitCode = exitFor[record.status];
  },
});

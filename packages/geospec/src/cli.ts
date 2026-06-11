#!/usr/bin/env node
import { readFile, mkdir, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { defaultGeoSpecInclude, discoverGeoSpecFiles } from '#runner/discovery.js';
import type { GeoSpecDiscoveryFileSystem } from '#runner/discovery.js';
import {
  createGeoSpecNodeInvocationContext,
  createGeoSpecNodeInvocationContextStats,
} from '#runner/node/invocation-context.js';
import { createGeoSpecNodeRunner } from '#runner/node/index.js';
import { createGeoSpecRunProfile } from '#runner/profile.js';
import type { GeoSpecTestCase } from '#runner/types.js';
import { loadStep } from '#step/index.js';
import type { VmFileSystem } from '@taucad/vm';

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
};

const createNodeVmFileSystem = (root: string): VmFileSystem => {
  async function readNodeVmFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readNodeVmFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readNodeVmFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = await readFile(resolveNodeVmPath({ root, path }));
    if (encoding === 'utf8') {
      return content.toString('utf8');
    }
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return copy;
  }

  return {
    async exists(path: string): Promise<boolean> {
      try {
        await stat(resolveNodeVmPath({ root, path }));
        return true;
      } catch {
        return false;
      }
    },

    readFile: readNodeVmFile,

    async writeFile(path: string, content: string): Promise<void> {
      await writeFile(resolveNodeVmPath({ root, path }), content, 'utf8');
    },

    async ensureDir(path: string): Promise<void> {
      await mkdir(resolveNodeVmPath({ root, path }), { recursive: true });
    },
  };
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
  };
  let index = 0;
  let projectDirectory = '.';
  let sawProjectDirectory = false;

  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, errors };
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
        case '--testNamePattern':
        case '--test-name-pattern':
        case '-t': {
          run.testNamePattern = value;
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
  issues?: GeoSpecCliIssue[];
  tests?: Array<{ name: string; suite: string[]; status: string; diagnostics?: GeoSpecCliDiagnostic[] }>;
};

type GeoSpecCliJsonResult = {
  success: boolean;
  passed: number;
  failed: number;
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
  const invocationContext = createGeoSpecNodeInvocationContext({
    projectPath,
    ...(invocationStats ? { stats: invocationStats } : {}),
  });
  const runner = createGeoSpecNodeRunner({
    filesystem,
    projectPath,
    modelLoader: invocationContext.modelLoader,
    stepLoader: async (input) => loadStep(input),
    ...(runProfile ? { internalProfile: runProfile } : {}),
  });
  const aggregate = await runner
    .run({
      files: files.sort(),
      testNamePattern: parsed.run.testNamePattern,
      testTimeout: parsed.run.testTimeout,
    })
    .finally(async () => {
      try {
        await runner.close();
      } finally {
        await invocationContext.dispose();
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

  const fileResults: GeoSpecCliFileResult[] = [];

  for (const { file, result } of aggregate.files) {
    const label = isAbsolute(file) ? relative(projectPath, file) : file;
    if (!result.success) {
      fileResults.push({
        file: label,
        success: false,
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
      tests: result.tests.map((test) => {
        const diagnostics = diagnosticsForTest(test);
        return {
          name: test.name,
          suite: test.suite,
          status: test.status,
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
      ...(runIssues.length > 0 ? { issues: runIssues } : {}),
      files: fileResults,
    };
    stdout(JSON.stringify(jsonResult, null, 2));
  } else {
    stdout(`${aggregate.passed} passed, ${aggregate.failed} failed`);
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

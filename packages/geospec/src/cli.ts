#!/usr/bin/env node
import { readdir, readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from '#model/index.js';
import { runGeoSpecModule } from '#runner/index.js';
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
  pattern: string;
  files: string[];
  testNamePattern?: string;
  /** Milliseconds. */
  testTimeout?: number;
  json: boolean;
};

const defaultGeoSpecPattern = '**/*.geospec.{ts,js}';
const geoSpecFileNamePattern = /\.geospec\.[jt]s$/u;

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

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);

const normalizeCliPath = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//u, '');

const escapeRegExp = (value: string): string => value.replaceAll(/[|\\{}()[\]^$+?.]/gu, String.raw`\$&`);

const globPatternToRegExp = (pattern: string): RegExp => {
  const normalizedPattern = normalizeCliPath(pattern);
  let source = '^';
  for (let index = 0; index < normalizedPattern.length; ) {
    const character = normalizedPattern[index];
    if (character === undefined) {
      break;
    }
    const next = normalizedPattern[index + 1];
    if (character === '*' && next === '*') {
      if (normalizedPattern[index + 2] === '/') {
        source += String.raw`(?:.*\/)?`;
        index += 3;
      } else {
        source += '.*';
        index += 2;
      }
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }
    if (character === '{') {
      const closeIndex = normalizedPattern.indexOf('}', index + 1);
      if (closeIndex !== -1) {
        const alternatives = normalizedPattern
          .slice(index + 1, closeIndex)
          .split(',')
          .map((alternative) => escapeRegExp(alternative));
        source += `(?:${alternatives.join('|')})`;
        index = closeIndex + 1;
        continue;
      }
    }
    source += character === '/' ? String.raw`\/` : escapeRegExp(character);
    index += 1;
  }

  return new RegExp(`${source}$`, 'u');
};

const matchesGeoSpecFilePattern = (path: string, pattern: string): boolean =>
  globPatternToRegExp(pattern).test(normalizeCliPath(path));

const collectGeoSpecFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  const directories: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        directories.push(fullPath);
      }
      continue;
    }

    if (geoSpecFileNamePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  const nestedFiles = await Promise.all(
    directories.map(async (nestedDirectory) => collectGeoSpecFiles(nestedDirectory)),
  );
  files.push(...nestedFiles.flat());

  return files;
};

export const discoverGeoSpecFiles = async (
  directory: string,
  options: { pattern?: string; files?: readonly string[] } = {},
): Promise<string[]> => {
  if (options.files && options.files.length > 0) {
    return options.files.map((file) => resolve(directory, file)).filter((file) => geoSpecFileNamePattern.test(file));
  }

  const pattern = options.pattern ?? defaultGeoSpecPattern;
  const files = await collectGeoSpecFiles(directory);
  return files.filter((file) => matchesGeoSpecFilePattern(relative(directory, file), pattern));
};

const helpText = `Usage: geospec [run] [project-directory] [options]

Runs *.geospec.ts and *.geospec.js files through the GeoSpec VM runner.

Options:
  --pattern <glob>              File glob, default: ${defaultGeoSpecPattern}
  --file <path>                 Specific GeoSpec file to run; repeatable
  --test-name-pattern <text>    Case-insensitive substring matched against suite > test names
  -t, --grep <text>             Alias for --test-name-pattern
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

const flagNamesWithValues = new Set(['--pattern', '--file', '--test-name-pattern', '--grep', '-t', '--test-timeout']);

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
    pattern: defaultGeoSpecPattern,
    files: [],
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
      if (token === '--pattern') {
        run.pattern = value;
      } else if (token === '--file') {
        run.files.push(value);
      } else {
        switch (token) {
          case '--test-timeout': {
            run.testTimeout = parseIntegerFlag({ flag: token, value, errors });
            break;
          }
          case '--test-name-pattern':
          case '--grep':
          case '-t': {
            run.testNamePattern = value;
            break;
          }
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
      errors.push(`Unexpected argument: ${token}. Use --file to select specific tests.`);
    } else {
      projectDirectory = token;
      sawProjectDirectory = true;
    }
    index += 1;
  }

  return { help: false, projectDirectory, run, errors };
};

type GeoSpecCliFileResult = {
  file: string;
  success: boolean;
  issues?: Array<{ code: string; message: string; severity: string; type: string }>;
  tests?: Array<{ name: string; suite: string[]; status: string }>;
};

type GeoSpecCliJsonResult = {
  success: boolean;
  passed: number;
  failed: number;
  files: GeoSpecCliFileResult[];
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
  const filesystem = createNodeVmFileSystem(projectPath);
  const files = await discoverGeoSpecFiles(projectPath, {
    pattern: parsed.run.pattern,
    files: parsed.run.files,
  });

  if (files.length === 0) {
    stderr('No matching *.geospec.ts or *.geospec.js files found.');
    return 1;
  }

  let failed = 0;
  let passed = 0;
  const fileResults: GeoSpecCliFileResult[] = [];
  const runs = await Promise.all(
    files.sort().map(async (file) => ({
      file,
      result: await runGeoSpecModule({
        filesystem,
        projectPath,
        entryPath: file,
        testNamePattern: parsed.run.testNamePattern,
        testTimeout: parsed.run.testTimeout,
        modelLoader: async (input) => ('source' in input ? loadModel(input) : loadModel({ projectPath, ...input })),
        stepLoader: async (input) => loadStep(input),
      }),
    })),
  );

  for (const { file, result } of runs) {
    const label = relative(projectPath, file);
    if (!result.success) {
      failed += 1;
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
        failed += 1;
        stderr(`FAIL ${label} ${[...test.suite, test.name].join(' > ')}`);
        for (const diagnostic of test.diagnostics) {
          stderr(`  ${diagnostic.message}`);
        }
      } else {
        passed += 1;
      }
    }
    fileResults.push({
      file: label,
      success: result.tests.every((test) => test.status !== 'failed'),
      tests: result.tests.map((test) => ({
        name: test.name,
        suite: test.suite,
        status: test.status,
      })),
    });
  }

  if (parsed.run.json) {
    const jsonResult: GeoSpecCliJsonResult = {
      success: failed === 0,
      passed,
      failed,
      files: fileResults,
    };
    stdout(JSON.stringify(jsonResult, null, 2));
  } else {
    stdout(`${passed} passed, ${failed} failed`);
  }
  return failed === 0 ? 0 : 1;
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = await runGeoSpecCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

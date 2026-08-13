/* eslint-disable @typescript-eslint/naming-convention -- VM and host paths are object keys here. */
import { describe, expect, it, vi } from 'vitest';
import type { GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';
import {
  formatFileReport,
  formatRunReport,
  geoSpecCliUsage,
  jsonChunks,
  parseGeoSpecCliArguments,
  runGeoSpecCli,
  runReportJson,
} from '#cli/cli.js';
import type { GeoSpecCliHost } from '#cli/cli.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecRunResult } from '#runner/types.js';

const bundle = { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };

const parsed = (...argv: string[]) => {
  const command = parseGeoSpecCliArguments(argv);
  if (command.kind !== 'run') {
    throw new Error(`expected a run command, got ${command.kind}: ${command.message}`);
  }
  return command.options;
};

/** A CLI host over a fixed file tree and a canned run result. */
const cliHost = (options: {
  tree?: Readonly<Record<string, string[]>>;
  result?: GeoSpecRunnerResult;
}): GeoSpecCliHost & { written: string[]; runs: unknown[]; closed: () => number; flushed: () => number } => {
  const written: string[] = [];
  const runs: unknown[] = [];
  let closed = 0;
  let flushed = 0;
  const tree = options.tree ?? { '/project': ['a.geospec.ts'] };
  return {
    written,
    runs,
    closed: () => closed,
    flushed: () => flushed,
    cwd: () => '/project',
    write: (line) => written.push(line),
    discoveryFileSystem: () => ({
      readdir: async (path: string) => tree[path] ?? [],
      stat: async (path: string) => {
        const kind: 'directory' | 'file' = path in tree ? 'directory' : 'file';
        return { kind };
      },
    }),
    createRunner: (runnerOptions) => {
      runs.push(runnerOptions);
      return {
        run: async (runOptions) => {
          runs.push(runOptions);
          return (
            options.result ?? {
              success: true,
              passed: 1,
              failed: 0,
              selectedTests: 1,
              files: [],
            }
          );
        },
        on: () => () => undefined,
        abort: () => undefined,
        close: async () => {
          closed += 1;
        },
      };
    },
    flush: async () => {
      flushed += 1;
    },
  };
};

const forensicCliHost = () => {
  const host = cliHost({});
  const unsubscribe = vi.fn();
  host.createRunner = () => {
    let handler: ((event: GeoSpecRunnerEvent) => void) | undefined;
    return {
      run: async () => {
        handler?.({ type: 'forensic', name: 'runner.file', value: 4, unit: 'milliseconds' });
        handler?.({ type: 'forensic', shardId: 2, name: 'proof.classify', value: 3, unit: 'count' });
        return { success: true, passed: 1, failed: 0, selectedTests: 1, files: [] };
      },
      on: (_type, next) => {
        handler = next as (event: GeoSpecRunnerEvent) => void;
        return unsubscribe;
      },
      abort: () => undefined,
      close: async () => undefined,
    };
  };
  return { host, unsubscribe };
};

describe('parseGeoSpecCliArguments', () => {
  it('should show usage for no arguments and for --help', () => {
    expect(parseGeoSpecCliArguments([])).toStrictEqual({ kind: 'help', message: geoSpecCliUsage });
    expect(parseGeoSpecCliArguments(['--help']).kind).toBe('help');
    expect(parseGeoSpecCliArguments(['-h']).kind).toBe('help');
    expect(parseGeoSpecCliArguments(['run', '--help']).kind).toBe('help');
    expect(parseGeoSpecCliArguments(['run', '-h']).kind).toBe('help');
  });

  it('should reject an unknown command', () => {
    expect(parseGeoSpecCliArguments(['walk'])).toStrictEqual({ kind: 'error', message: "Unknown command 'walk'." });
  });

  it('should default to the current directory', () => {
    expect(parsed('run')).toMatchObject({
      projectPath: '.',
      files: [],
      include: [],
      exclude: [],
      bail: false,
      json: false,
    });
  });

  it('should accept one positional project path', () => {
    expect(parsed('run', 'packages/app').projectPath).toBe('packages/app');
  });

  it('should reject a second positional argument', () => {
    expect(parseGeoSpecCliArguments(['run', 'a', 'b'])).toStrictEqual({
      kind: 'error',
      message: "Unexpected argument 'b'.",
    });
  });

  it('should reject an unknown option', () => {
    expect(parseGeoSpecCliArguments(['run', '--exlude', 'x'])).toStrictEqual({
      kind: 'error',
      message: "Unknown option '--exlude'.",
    });
  });

  it('should collect repeatable file, include and exclude flags', () => {
    const options = parsed(
      'run',
      '--file',
      'a.geospec.ts',
      '--file',
      'lib',
      '--include',
      'parts/**',
      '--exclude',
      '**/*.slow.geospec.ts',
    );

    expect(options).toMatchObject({
      files: ['a.geospec.ts', 'lib'],
      include: ['parts/**'],
      exclude: ['**/*.slow.geospec.ts'],
    });
  });

  it('should accept both spellings of the test-name pattern', () => {
    expect(parsed('run', '-t', 'volume').testNamePattern).toBe('volume');
    expect(parsed('run', '--test-name-pattern', 'volume').testNamePattern).toBe('volume');
  });

  it('should parse the numeric flags', () => {
    expect(
      parsed('run', '--test-timeout', '30000', '--shard-timeout', '600000', '--matcher-wall-backstop', '9000'),
    ).toMatchObject({
      testTimeout: 30_000,
      shardTimeout: 600_000,
      matcherWallBackstop: 9000,
    });
  });

  it('should parse the operational cache and forensic flags', () => {
    expect(parsed('run', '--cache-directory', '/tmp/evidence', '--forensic')).toMatchObject({
      cacheDirectory: '/tmp/evidence',
      forensic: true,
    });
    expect(parsed('run', '--no-cache').cache).toBe(false);
  });

  it('should auto-size --workers when no count follows it', () => {
    expect(parsed('run', '--workers').workers).toBe(0);
    expect(parsed('run', '--workers', '--json')).toMatchObject({ workers: 0, json: true });
    expect(parsed('run', '--workers', '4').workers).toBe(4);
  });

  it('should set the boolean flags', () => {
    expect(parsed('run', '--bail', '--json')).toMatchObject({ bail: true, json: true });
  });

  it('should reject a flag whose value is missing or not a number', () => {
    for (const argv of [
      ['run', '--file'],
      ['run', '--include'],
      ['run', '--exclude'],
      ['run', '-t'],
      ['run', '--test-timeout'],
      ['run', '--test-timeout', 'soon'],
      ['run', '--workers', 'lots'],
      ['run', '--cache-directory'],
      ['run', '--matcher-wall-backstop'],
      ['run', '--matcher-wall-backstop', '0'],
      ['run', '--matcher-wall-backstop', '-1'],
    ]) {
      expect(parseGeoSpecCliArguments(argv).kind).toBe('error');
    }
    expect(parseGeoSpecCliArguments(['run', '--no-cache', '--cache-directory', '/tmp/evidence'])).toMatchObject({
      kind: 'error',
    });
  });
});

describe('formatFileReport', () => {
  it('should print the issues of a file that could not execute', () => {
    const result: GeoSpecRunResult = {
      success: false,
      issues: [{ code: 'BUNDLER_FAILED', message: 'boom', severity: 'error', type: 'compilation' }],
    };

    expect(formatFileReport('a.geospec.ts', result)).toStrictEqual(['FAIL a.geospec.ts', '  BUNDLER_FAILED: boom']);
  });

  it('should print only the non-passing tests, with every diagnostic', () => {
    const result: GeoSpecRunResult = {
      success: true,
      passed: false,
      bundle,
      tests: [
        { suite: ['s'], name: 'ok', assertions: [], status: 'passed', diagnostics: [] },
        { suite: ['s'], name: 'todo', assertions: [], status: 'skipped', diagnostics: [] },
        {
          suite: ['s'],
          name: 'bad',
          status: 'failed',
          diagnostics: [{ code: 'TEST_FAILED', severity: 'error', message: 'threw' }],
          assertions: [
            {
              kind: 'volume',
              subject: undefined,
              expected: {},
              diagnostics: [{ code: 'GEOSPEC_MEASUREMENT_MISMATCH', severity: 'error', message: 'off by 3' }],
            },
            { kind: 'volume', subject: undefined, expected: {} },
          ],
        },
      ],
    };

    expect(formatFileReport('a.geospec.ts', result)).toStrictEqual([
      'FAIL a.geospec.ts',
      '  skip s > todo',
      '  fail s > bad',
      '    TEST_FAILED: threw',
      '    GEOSPEC_MEASUREMENT_MISMATCH: off by 3',
    ]);
  });

  it('should print a diagnostic once even though the collector records it twice', () => {
    const diagnostic: GeometryDiagnostic = {
      code: 'GEOSPEC_MEASUREMENT_MISMATCH',
      severity: 'error',
      message: 'off by 3',
    };
    const result: GeoSpecRunResult = {
      success: true,
      passed: false,
      bundle,
      tests: [
        {
          suite: ['s'],
          name: 'bad',
          status: 'failed',
          diagnostics: [diagnostic],
          assertions: [{ kind: 'volume', subject: undefined, expected: {}, diagnostics: [diagnostic] }],
        },
      ],
    };

    expect(formatFileReport('a.geospec.ts', result)).toStrictEqual([
      'FAIL a.geospec.ts',
      '  fail s > bad',
      '    GEOSPEC_MEASUREMENT_MISMATCH: off by 3',
    ]);
  });

  it('should print PASS for a green file', () => {
    expect(formatFileReport('a.geospec.ts', { success: true, passed: true, tests: [], bundle })).toStrictEqual([
      'PASS a.geospec.ts',
    ]);
  });
});

describe('formatRunReport', () => {
  it('should end with the totals and surface run-level issues', () => {
    const lines = formatRunReport({
      success: false,
      passed: 1,
      failed: 2,
      selectedTests: 3,
      files: [{ file: 'a.geospec.ts', result: { success: true, passed: true, tests: [], bundle } }],
      issues: [{ code: 'GEOSPEC_RUNNER_BAILED', message: 'stopped', severity: 'error', type: 'runtime' }],
    });

    expect(lines).toStrictEqual([
      'PASS a.geospec.ts',
      'GEOSPEC_RUNNER_BAILED: stopped',
      '1 passed, 2 failed, 3 selected',
    ]);
  });
});

describe('runReportJson', () => {
  const diagnostic = { code: 'GEOSPEC_X', message: 'bad', severity: 'error' } as const;

  it('should carry verdicts and diagnostics without the live geometry subjects', () => {
    const report = runReportJson({
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      durationMs: 12,
      issues: [{ code: 'GEOSPEC_RUNNER_BAILED', message: 'stopped', severity: 'error', type: 'runtime' }],
      files: [
        {
          file: 'a.geospec.ts',
          durationMs: 5,
          result: {
            success: true,
            passed: false,
            bundle,
            tests: [
              {
                suite: ['s'],
                name: 't',
                status: 'failed',
                durationMs: 3,
                diagnostics: [],
                // The whole subject rides on the assertion in process; none of
                // it may reach the report.
                assertions: [
                  { kind: 'volume', subject: { mesh: { huge: true } }, expected: 1, diagnostics: [diagnostic] },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(report).toStrictEqual({
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      durationMs: 12,
      issues: [{ code: 'GEOSPEC_RUNNER_BAILED', message: 'stopped', severity: 'error', type: 'runtime' }],
      files: [
        {
          file: 'a.geospec.ts',
          success: false,
          durationMs: 5,
          tests: [{ suite: ['s'], name: 't', status: 'failed', durationMs: 3, diagnostics: [diagnostic] }],
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('huge');
  });

  it('should omit an absent duration and tolerate an assertion with no diagnostics', () => {
    const report = runReportJson({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [
        {
          file: 'a.geospec.ts',
          result: {
            success: true,
            passed: true,
            bundle,
            tests: [
              {
                suite: [],
                name: 't',
                status: 'passed',
                diagnostics: [],
                assertions: [{ kind: 'volume', subject: {}, expected: 1 }],
              },
            ],
          },
        },
      ],
    });

    expect(report['files']).toStrictEqual([
      { file: 'a.geospec.ts', success: true, tests: [{ suite: [], name: 't', status: 'passed', diagnostics: [] }] },
    ]);
  });

  it('should report a file that never ran as its issues', () => {
    const report = runReportJson({
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 0,
      files: [
        {
          file: 'a.geospec.ts',
          result: { success: false, issues: [{ ...diagnostic, type: 'runtime' }] },
        },
      ],
    });

    expect(report['files']).toStrictEqual([
      { file: 'a.geospec.ts', success: false, issues: [{ ...diagnostic, type: 'runtime' }] },
    ]);
  });
});

describe('runGeoSpecCli', () => {
  it('should print usage and succeed for --help', async () => {
    const host = cliHost({});

    expect(await runGeoSpecCli(['--help'], host)).toBe(0);
    expect(host.written[0]).toBe(geoSpecCliUsage);
  });

  it('should print the error plus usage and fail for a bad invocation', async () => {
    const host = cliHost({});

    expect(await runGeoSpecCli(['fly'], host)).toBe(1);
    expect(host.written[0]).toContain("Unknown command 'fly'.");
    expect(host.written[0]).toContain('Usage:');
  });

  it('should resolve a relative project path against the cwd', async () => {
    const host = cliHost({ tree: { '/project/sub': ['a.geospec.ts'] } });

    await runGeoSpecCli(['run', 'sub'], host);

    expect(host.runs[0]).toMatchObject({ projectPath: '/project/sub' });
  });

  it('should keep an absolute project path', async () => {
    const host = cliHost({ tree: { '/elsewhere': ['a.geospec.ts'] } });

    await runGeoSpecCli(['run', '/elsewhere'], host);

    expect(host.runs[0]).toMatchObject({ projectPath: '/elsewhere' });
  });

  it('should treat a bare dot as the cwd', async () => {
    const host = cliHost({});

    await runGeoSpecCli(['run', '.'], host);

    expect(host.runs[0]).toMatchObject({ projectPath: '/project' });
  });

  it('should FAIL when the filters select no files', async () => {
    const host = cliHost({ tree: { '/project': [] } });

    const code = await runGeoSpecCli(['run', '.'], host);

    expect(code).toBe(1);
    expect(host.written[0]).toContain('No GeoSpec files matched');
  });

  it('should report an empty selection as JSON under --json', async () => {
    const host = cliHost({ tree: { '/project': [] } });

    await runGeoSpecCli(['run', '.', '--json', '--file', 'nope'], host);

    expect(JSON.parse(host.written[0] ?? '{}')).toMatchObject({ success: false, unmatchedRoots: ['nope'] });
  });

  it('should thread the run filters through and close and flush exactly once', async () => {
    const host = cliHost({});

    const code = await runGeoSpecCli(['run', '.', '-t', 'volume', '--test-timeout', '9000', '--bail'], host);

    expect(code).toBe(0);
    expect(host.runs[1]).toMatchObject({
      files: ['a.geospec.ts'],
      testNamePattern: 'volume',
      testTimeout: 9000,
      bail: true,
    });
    expect([host.closed(), host.flushed()]).toStrictEqual([1, 1]);
  });

  it('should ask for a pool only when --workers is given', async () => {
    const serial = cliHost({});
    const pooled = cliHost({});

    await runGeoSpecCli(['run', '.'], serial);
    await runGeoSpecCli(['run', '.', '--workers', '3', '--shard-timeout', '1000'], pooled);

    expect(serial.runs[0]).toMatchObject({ workers: undefined });
    expect(pooled.runs[0]).toMatchObject({ workers: 3, shardTimeout: 1000 });
  });

  it('should map operational flags directly to the runner factory and run', async () => {
    const host = cliHost({});

    await runGeoSpecCli(['run', '.', '--no-cache', '--forensic', '--matcher-wall-backstop', '1234'], host);

    expect(host.runs[0]).toMatchObject({ cache: false, cacheDirectory: undefined });
    expect(host.runs[1]).toMatchObject({ forensic: true, matcherWallBackstop: 1234 });
  });

  it('should stream forensic events into the text report and unsubscribe', async () => {
    const { host, unsubscribe } = forensicCliHost();

    await runGeoSpecCli(['run', '.', '--forensic'], host);

    expect(host.written.join('\n')).toContain('FORENSIC runner.file 4 milliseconds');
    expect(host.written.join('\n')).toContain('FORENSIC shard=2 proof.classify 3 count');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should include forensic events in the JSON report', async () => {
    const { host } = forensicCliHost();

    await runGeoSpecCli(['run', '.', '--forensic', '--json'], host);

    expect(JSON.parse(host.written.join('\n'))).toMatchObject({
      forensic: [{ name: 'runner.file' }, { shardId: 2, name: 'proof.classify' }],
    });
  });

  it('should print exactly one JSON document under --json', async () => {
    const host = cliHost({});

    await runGeoSpecCli(['run', '.', '--json'], host);

    // Streamed one chunk per file so a flagship corpus cannot exceed V8's
    // maximum string; the chunks are still one document, newline-separated.
    expect(JSON.parse(host.written.join('\n'))).toMatchObject({ success: true, passed: 1 });
  });

  describe('jsonChunks', () => {
    const rejoin = (value: unknown, limit: number): unknown => JSON.parse([...jsonChunks(value, limit)].join('\n'));

    it('should emit a value that fits as one chunk', () => {
      expect([...jsonChunks({ a: 1, b: [2, 3] }, 1024)]).toEqual(['{"a":1,"b":[2,3]}']);
    });

    it('should descend into arrays and objects that do not fit', () => {
      const value = { files: [{ name: 'a', rows: [1, 2, 3] }, { name: 'b' }], ok: true };

      expect(rejoin(value, 8)).toEqual(value);
      expect([...jsonChunks(value, 8)].length).toBeGreaterThan(1);
    });

    it('should omit undefined members exactly as JSON.stringify does', () => {
      const value = { kept: 'a'.repeat(40), dropped: undefined, also: () => 1 };

      expect(rejoin(value, 8)).toEqual({ kept: 'a'.repeat(40) });
    });

    it('should emit an unsplittable leaf whole', () => {
      expect([...jsonChunks('a'.repeat(40), 8)]).toEqual([`"${'a'.repeat(40)}"`]);
      expect([...jsonChunks([undefined], 1)]).toEqual(['[', 'null', ']']);
    });
  });

  it('should return 1 when the run failed', async () => {
    const host = cliHost({
      result: { success: false, passed: 0, failed: 1, selectedTests: 1, files: [] },
    });

    expect(await runGeoSpecCli(['run', '.'], host)).toBe(1);
  });

  it('should close and flush even when the run throws', async () => {
    const host = cliHost({});
    const failing: GeoSpecCliHost = {
      ...host,
      createRunner: () => ({
        run: async () => {
          throw new Error('runner exploded');
        },
        on: () => () => undefined,
        abort: () => undefined,
        close: host.createRunner({ projectPath: '/project', workers: undefined, shardTimeout: undefined }).close,
      }),
    };

    await expect(runGeoSpecCli(['run', '.'], failing)).rejects.toThrow('runner exploded');
    expect(host.flushed()).toBe(1);
  });

  it('should include the glob filters in discovery', async () => {
    const discovery = vi.fn(() => ({
      readdir: async () => ['a.geospec.ts', 'b.slow.geospec.ts'],
      stat: async (path: string) => {
        const kind: 'directory' | 'file' = path === '/project' ? 'directory' : 'file';
        return { kind };
      },
    }));
    const host: GeoSpecCliHost = { ...cliHost({}), discoveryFileSystem: discovery };

    await runGeoSpecCli(['run', '.', '--include', '**/*.geospec.ts', '--exclude', '**/*.slow.geospec.ts'], host);

    expect(discovery).toHaveBeenCalledWith('/project');
  });
});

describe('the empty-selection message', () => {
  it('should name the roots that matched nothing', async () => {
    const host = cliHost({ tree: { '/project': [] } });

    await runGeoSpecCli(['run', '.'], host);

    expect(host.written[0]).toBe('No GeoSpec files matched (unmatched: .).');
  });
});

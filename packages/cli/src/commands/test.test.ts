import { describe, expect, it } from 'vitest';

import { exitFor, exporterModuleUrl, testRecord, testSummary } from '#commands/test.js';

const test = (name: string, status: string, message?: string) => ({
  name,
  suite: ['block'],
  status,
  diagnostics: [],
  assertions:
    message === undefined ? [] : [{ passed: false, diagnostics: [{ code: 'BOUNDS', message, severity: 'error' }] }],
});

describe('testRecord', () => {
  it('should report a passing run with each test named by its suite', () => {
    const record = testRecord('/project', ['block.geospec.ts'], {
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [{ file: 'block.geospec.ts', result: { tests: [test('is 20 mm', 'passed')] } }],
    });

    expect(record).toMatchObject({ kind: 'test', ok: true, status: 'passed', passed: 1, failed: 0, selected: 1 });
    expect(record.tests).toEqual([{ file: 'block.geospec.ts', name: 'block > is 20 mm', status: 'passed' }]);
  });

  it("should report a failure with the first failed assertion's message", () => {
    const record = testRecord('/project', ['block.geospec.ts'], {
      success: false,
      passed: 1,
      failed: 1,
      selectedTests: 2,
      files: [
        {
          file: 'block.geospec.ts',
          result: { tests: [test('is 20 mm', 'passed'), test('is 21 mm', 'failed', 'off on size.x')] },
        },
      ],
    });

    expect(record.status).toBe('failed');
    expect(record.tests[1]).toMatchObject({ status: 'failed', message: 'off on size.x' });
  });

  it('should be refused when nothing passed because a kernel is not prepared', () => {
    const record = testRecord('/project', ['part.geospec.ts'], {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      files: [
        {
          file: 'part.geospec.ts',
          result: {
            tests: [
              {
                ...test('loads', 'failed'),
                diagnostics: [
                  { code: 'KERNEL_NOT_PREPARED', message: 'run `tau prepare build123d`', severity: 'error' },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(record.status).toBe('refused');
  });
});

describe('testSummary', () => {
  it('should name the inconclusive tests, which are neither passed nor failed', () => {
    const passing = testRecord('/project', ['block.geospec.ts'], {
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: [{ file: 'block.geospec.ts', result: { tests: [test('is 20 mm', 'passed')] } }],
    });
    const refusal = 'Primary geometry is 68.7 MiB; the configured binary subject limit is 64 MiB.';
    const undecided = testRecord('/project', ['knot.geospec.ts'], {
      success: false,
      passed: 0,
      failed: 0,
      selectedTests: 2,
      files: [
        {
          file: 'knot.geospec.ts',
          result: {
            tests: [test('is watertight', 'inconclusive', refusal), test('is one piece', 'inconclusive', refusal)],
          },
        },
      ],
    });

    expect(testSummary(passing)).toBe('GeoSpec passed: 1 passed, 0 failed of 1.');
    expect(testSummary(undecided)).toBe('GeoSpec inconclusive: 0 passed, 0 failed, 2 inconclusive of 2.');
  });
});

describe('testRecord status', () => {
  const run = (statuses: readonly string[], failed = 0): ReturnType<typeof testRecord> =>
    testRecord('/project', ['main.geospec.ts'], {
      success: false,
      passed: statuses.filter((status) => status === 'passed').length,
      failed,
      selectedTests: statuses.length,
      files: [
        {
          file: 'main.geospec.ts',
          result: { tests: statuses.map((status, index) => test(`t${String(index)}`, status, 'not decided')) },
        },
      ],
    });

  it('should record a run with no failure and an undecided test as inconclusive, still exiting 1', () => {
    expect(run(['passed', 'inconclusive']).status).toBe('inconclusive');
    expect(run(['unsupported', 'not-run']).status).toBe('inconclusive');
    expect(exitFor.inconclusive).toBe(exitFor.failed);
    expect(exitFor.inconclusive).toBe(1);
  });

  it('should record a run with any failed test as failed', () => {
    expect(run(['failed', 'inconclusive'], 1).status).toBe('failed');
    expect(run(['inconclusive'], 1).status).toBe('failed');
  });
});

describe('exporterModuleUrl', () => {
  it("should name the exporter module beside this command, with the run's composition in its query", () => {
    const url = new URL(exporterModuleUrl({ pluginRoot: '/work', plugins: ['./a.mjs', './b.mjs'], config: './c.mjs' }));

    expect(url.pathname).toMatch(/\/geospec\/exporter-module\.ts$/u);
    expect(url.searchParams.get('pluginRoot')).toBe('/work');
    expect(url.searchParams.getAll('plugin')).toEqual(['./a.mjs', './b.mjs']);
    expect(url.searchParams.get('config')).toBe('./c.mjs');
  });

  it('should leave out a configuration module the run did not name', () => {
    expect(new URL(exporterModuleUrl({ pluginRoot: '/work', plugins: [] })).searchParams.has('config')).toBe(false);
  });
});

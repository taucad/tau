import { describe, expect, it } from 'vitest';

import { testRecord, testSummary } from '#commands/test.js';

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

    expect(testSummary(passing)).toBe('1 passed, 0 failed of 1 selected');
    expect(testSummary(undecided)).toBe('0 passed, 0 failed of 2 selected, 2 inconclusive');
  });
});

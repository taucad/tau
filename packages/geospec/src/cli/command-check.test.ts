import { execFile } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const main = join(import.meta.dirname, 'main.ts');
// Two disjoint cubes, hand-authored STEP.
const twoCubes = join(import.meta.dirname, '../../fixtures/selector/second-producer-transformed/model.step');

type Report = {
  success: boolean;
  files: Array<{ tests: Array<{ name: string; status: string; diagnostics: Array<{ code: string }> }> }>;
};

/**
 * Run `geospec check` over the fixture; the exit code is the verdict, so a failing run still prints its report.
 * @param flags - Flags after the file.
 * @returns The exit code and the `--json` report.
 */
const check = async (...flags: string[]): Promise<{ exitCode: number; report: Report }> => {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', main, 'check', twoCubes, '--json', ...flags],
      { timeout: 60_000 },
    );
    return { exitCode: 0, report: JSON.parse(stdout) as Report };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { exitCode: code, report: JSON.parse(stdout) as Report };
  }
};

const verdicts = (report: Report) =>
  report.files.flatMap(({ tests }) =>
    tests.map(({ name, status, diagnostics }) => ({
      name,
      status,
      codes: [...new Set(diagnostics.map(({ code }) => code))],
    })),
  );

describe('geospec check on a STEP file with no spec', () => {
  it('should pass the bundled validity claims', async () => {
    const { exitCode, report } = await check();

    expect(exitCode).toBe(0);
    expect(verdicts(report)).toStrictEqual([
      { name: 'loads without error diagnostics', status: 'passed', codes: [] },
      { name: 'is a valid BRep with closed shells', status: 'passed', codes: [] },
      { name: 'is watertight', status: 'passed', codes: [] },
      { name: 'has a bounding box with positive size', status: 'passed', codes: [] },
    ]);
  }, 90_000);

  it('should fail a component count the model does not have', async () => {
    const { exitCode, report } = await check('--components', '1');

    expect(exitCode).toBe(1);
    expect(report.success).toBe(false);
    expect(verdicts(report).at(-1)).toStrictEqual({
      name: 'has 1 connected component',
      status: 'failed',
      codes: ['GEOSPEC_CONNECTED_COMPONENTS_MISMATCH'],
    });
  }, 90_000);
});

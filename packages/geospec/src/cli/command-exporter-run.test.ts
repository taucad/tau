import { execFile } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const main = join(import.meta.dirname, 'main.ts');
const project = join(import.meta.dirname, '../../host-tests/installed-cli/box-project');

type Report = {
  success: boolean;
  files: Array<{ tests: Array<{ name: string; status: string; diagnostics: Array<{ code: string }> }> }>;
};

/**
 * Run the `geospec` bin over the fixture project; the exit code is the verdict, so a failing run still prints its report.
 * @returns The exit code and the `--json` report.
 */
const run = async (): Promise<{ exitCode: number; report: Report }> => {
  try {
    const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', main, 'run', project, '--json'], {
      timeout: 60_000,
    });
    return { exitCode: 0, report: JSON.parse(stdout) as Report };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { exitCode: code, report: JSON.parse(stdout) as Report };
  }
};

describe('geospec run with a non-Tau commandExporter', () => {
  it("should pass, fail and refuse on the models the project config's command exports", async () => {
    const { exitCode, report } = await run();

    expect(exitCode).toBe(1);
    expect(report.success).toBe(false);
    expect(
      report.files.flatMap(({ tests }) =>
        tests.map(({ name, status, diagnostics }) => ({
          name,
          status,
          codes: [...new Set(diagnostics.map(({ code }) => code))],
        })),
      ),
    ).toStrictEqual([
      { name: 'passes: the box is 10 mm', status: 'passed', codes: [] },
      { name: 'passes: parameters resize the box', status: 'passed', codes: [] },
      { name: 'fails: the box is not 12 mm', status: 'failed', codes: ['GEOSPEC_BOUNDING_BOX_MISMATCH'] },
      { name: 'refuses: the exporter writes no GLB', status: 'failed', codes: ['GEOSPEC_EXPORTER_UNSUPPORTED'] },
    ]);
  }, 90_000);
});

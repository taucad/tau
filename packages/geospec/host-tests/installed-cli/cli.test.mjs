/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- JSON documents cross an untyped process boundary. */
// The installed `geospec` bin, from the packed tarball, runs a project whose models come from a non-Tau command
// through `commandExporter`: one pass, one parameterised pass, one fail and one capability refusal.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const consumerRoot = resolve(import.meta.dirname, '../..');
const packageRoot = join(consumerRoot, 'node_modules/geospec');
/** @type {{ bin: { geospec: string } }} */
const { bin } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const project = join(import.meta.dirname, 'box-project');

void test('the installed geospec bin passes, fails and refuses on a non-Tau exporter', async () => {
  let exitCode = 0;
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(process.execPath, [join(packageRoot, bin.geospec), 'run', project, '--json'], {
      timeout: 120_000,
    }));
  } catch (error) {
    // The exit code is the verdict, so a failing run still prints its report.
    ({ code: exitCode, stdout } = /** @type {{ code: number; stdout: string }} */ (error));
  }
  /** @type {{ files: Array<{ tests: Array<{ name: string; status: string; diagnostics: Array<{ code: string }> }> }> }} */
  const report = JSON.parse(stdout);

  assert.equal(exitCode, 1);
  assert.deepEqual(
    report.files.flatMap(({ tests }) =>
      tests.map(({ name, status, diagnostics }) => ({
        name,
        status,
        codes: [...new Set(diagnostics.map(({ code }) => code))],
      })),
    ),
    [
      { name: 'passes: the box is 10 mm', status: 'passed', codes: [] },
      { name: 'passes: parameters resize the box', status: 'passed', codes: [] },
      { name: 'fails: the box is not 12 mm', status: 'failed', codes: ['GEOSPEC_BOUNDING_BOX_MISMATCH'] },
      { name: 'refuses: the exporter writes no GLB', status: 'failed', codes: ['GEOSPEC_EXPORTER_UNSUPPORTED'] },
    ],
  );
});

/**
 * Regression gate for the tau-examples `.geospec.ts` suites.
 *
 * The suites live beside their example source (they load models by relative
 * path), so they can't move here — instead this drives the GeoSpec CLI against
 * each example directory and asserts the AP242/BRep spatial-requirement
 * assertions all pass. This is the first automated CI coverage for those
 * suites; before this they only ran by hand.
 */
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, it, expect } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tsxBin = resolve(repoRoot, 'node_modules/.bin/tsx');
const geospecCli = resolve(repoRoot, 'packages/geospec/src/cli.ts');

type GeoSpecRunReport = { success: boolean; passed: number; failed: number };

const runGeoSpecSuite = async (exampleDirectory: string): Promise<GeoSpecRunReport> => {
  try {
    const { stdout } = await execFileAsync(
      tsxBin,
      [geospecCli, 'run', exampleDirectory, '--test-timeout', '300000', '--json'],
      { cwd: repoRoot, maxBuffer: 128 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as GeoSpecRunReport;
  } catch (error) {
    // The CLI exits non-zero when a suite fails; its JSON report is still on
    // stdout, so parse it to surface passed/failed in the assertion.
    const { stdout } = error as { stdout?: string };
    if (stdout) {
      return JSON.parse(stdout) as GeoSpecRunReport;
    }
    throw error;
  }
};

describe('geospec example suites (regression backbone)', () => {
  it('logo-keychain geospec suite passes', { timeout: 180_000 }, async () => {
    const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/replicad/logo-keychain');
    expect(report.failed).toBe(0);
    expect(report.success).toBe(true);
  });
});

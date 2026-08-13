/**
 * Regression gate for the tau-examples `.geospec.ts` suites.
 *
 * The suites live beside their example source (they load models by relative
 * path), so they can't move here — instead this drives the GeoSpec CLI against
 * each example directory. The Wave-1 corpus is spec-first, so its exact mix of
 * expected red and green rows is compared with the immutable parity ledger.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, it, expect } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const nodeBin = process.execPath;
const geospecCli = resolve(repoRoot, 'packages/geospec-engine/src/cli/main.ts');
const parityVerifier = resolve(repoRoot, 'packages/geospec-engine/scripts/wave1-parity.mts');
const parityLedger = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/geospec-engine/verification/wave1-parity-ledger.json'), 'utf8'),
) as {
  expected: { files: number; tests: number; passed: number; failed: number };
};

type GeoSpecReportFile = {
  file: string;
  durationMs?: number;
  tests?: Array<{ suite: string[]; name: string; status: string; diagnostics?: Array<{ code?: unknown }> }>;
};

type GeoSpecRunReport = {
  success: boolean;
  passed: number;
  failed: number;
  durationMs?: number;
  files?: GeoSpecReportFile[];
};

const verifyWave1Parity = async (report: GeoSpecRunReport): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), 'geospec-wave1-parity-'));
  try {
    const reportPath = join(directory, 'report.json');
    await writeFile(reportPath, JSON.stringify(report));
    await execFileAsync(nodeBin, [parityVerifier, '--verify', reportPath], { cwd: repoRoot });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const runGeoSpecSuite = async (
  exampleDirectory: string,
  options: { workers?: number | 'auto' } = {},
): Promise<GeoSpecRunReport> => {
  const environment: Record<string, string | undefined> = { ...process.env };
  // R16: persistent V8 compile cache shaves the per-invocation tsx boot floor.
  environment['NODE_COMPILE_CACHE'] = resolve(repoRoot, 'node_modules/.cache/geospec-compile-cache');
  // R10: control the CLI's pool explicitly so vitest-level parallelism never
  // multiplies worker pools (oversubscription, A10). These e2e cases run
  // serially in this file; 'auto' hands sizing to the CLI's R15 logic.
  const workerArguments = options.workers === 'auto' ? ['--workers'] : ['--workers', String(options.workers ?? 1)];
  try {
    const { stdout } = await execFileAsync(
      nodeBin,
      [
        '--import',
        'tsx',
        geospecCli,
        'run',
        exampleDirectory,
        '--test-timeout',
        '300000',
        ...workerArguments,
        '--json',
      ],
      { cwd: repoRoot, maxBuffer: 128 * 1024 * 1024, env: environment },
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

  it('v8-engine-rev2 matches the exact Wave-1 parity ledger', { timeout: 1_500_000 }, async () => {
    // R10: the flagship suite is SPEC-FIRST — reds are expected reward
    // signal while the model iterates. Exact red/green identity is the gate.
    const startedAt = performance.now();
    const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/replicad/v8-engine-rev2', { workers: 1 });
    /** Milliseconds. */
    const suiteWall = performance.now() - startedAt;
    // Benchmark record: suite + per-file walls for the CI log (R10).
    // oxlint-disable-next-line no-console -- benchmark output is the point.
    console.log(
      `[geospec-benchmark] v8-engine-rev2 wall=${Math.round(suiteWall)}ms cli=${Math.round(report.durationMs ?? 0)}ms passed=${report.passed} failed=${report.failed}`,
    );
    for (const file of report.files ?? []) {
      // oxlint-disable-next-line no-console -- benchmark output is the point.
      console.log(
        `[geospec-benchmark]   ${file.file} durationMs=${Math.round(file.durationMs ?? 0)} tests=${file.tests?.length ?? 0}`,
      );
    }
    // Wall time is benchmark evidence only. The Vitest timeout above is the
    // non-verdict watchdog; parity is exact per-test data below.
    expect(report.files).toBeDefined();
    await verifyWave1Parity(report);
    expect(report.passed).toBe(parityLedger.expected.passed);
    expect(report.failed).toBe(parityLedger.expected.failed);
    expect(report.files).toHaveLength(parityLedger.expected.files);
    expect(report.files?.flatMap((file) => file.tests ?? [])).toHaveLength(parityLedger.expected.tests);
  });
});

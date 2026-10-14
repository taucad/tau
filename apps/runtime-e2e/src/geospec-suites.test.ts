/**
 * Regression gate for the tau-examples `.geospec.ts` suites.
 *
 * The suites live beside their example source (they load models by relative
 * path), so they can't move here — instead this drives the GeoSpec CLI against
 * each example directory. The corpus is spec-first: requirements the model does
 * not yet satisfy are `it.skip`, so every runnable row must be green.
 */
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createNodeVmFileSystem } from '@taucad/geospec-engine/node-filesystem';
import { Engine } from '@taucad/geospec-engine-native/node';
import { createExampleRuntimeClient } from '@taucad/tau-examples/runtime';
import type { GeoSpecRuntimeClient } from 'geospec/model';
import { createNativeGeoSpecRunner } from 'geospec/runner/native';
import { describe, it, expect } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const nodeBin = process.execPath;
const geospecCli = resolve(repoRoot, 'packages/geospec-engine/src/cli/main.ts');

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

const runGeoSpecSuite = async (
  exampleDirectory: string,
  options: { workers?: number | 'auto' } = {},
): Promise<GeoSpecRunReport> => {
  const environment: Record<string, string | undefined> = { ...process.env };
  // R16: persistent V8 compile cache shaves the per-invocation tsx boot floor.
  environment['NODE_COMPILE_CACHE'] = resolve(repoRoot, 'node_modules/.cache/geospec');
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
  it.each(['bench-vise', 'spur-gearbox', 'standing-fan', 'wheelbarrow', 'kestrel-240-quadcopter'])(
    'Community motion assembly %s geospec suite passes',
    { timeout: 1_500_000 },
    async (name) => {
      const report = await runGeoSpecSuite(`libs/tau-examples/src/kernels/replicad/${name}`);
      const unpassed = (report.files ?? []).flatMap(({ file, tests }) =>
        (tests ?? [])
          .filter(({ status }) => status !== 'passed')
          .map(({ suite, name: test, status, diagnostics }) => ({
            test: [file, ...suite, test].join(' > '),
            status,
            codes: diagnostics?.map(({ code }) => code),
          })),
      );
      expect(unpassed).toStrictEqual([]);
      expect(report.success).toBe(true);
    },
  );

  it('PicoVoxel hello-world geospec suite passes on the exact serial path', { timeout: 180_000 }, async () => {
    const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/picovoxel/hello-world');
    expect(report.failed).toBe(0);
    expect(report.success).toBe(true);
  });

  it('PicoVoxel lead-screw-stage geospec suite passes', { timeout: 180_000 }, async () => {
    const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/picovoxel/lead-screw-stage');
    expect(report.failed, JSON.stringify(report.files)).toBe(0);
    expect(report.success).toBe(true);
  });

  it('logo-keychain geospec suite passes', { timeout: 180_000 }, async () => {
    const report = await runGeoSpecSuite('libs/tau-examples/src/kernels/replicad/logo-keychain');
    expect(report.failed).toBe(0);
    expect(report.success).toBe(true);
  });

  it.skipIf(!process.env['TAU_PICOGK_RESOURCE_ROOT'])(
    'PicoGK turbofan geospec suite passes with its native SDK resource',
    { timeout: 1_500_000 },
    async () => {
      const projectPath = resolve(repoRoot, 'libs/tau-examples/src/kernels/picogk/turbofan');
      const engine = new Engine();
      const runner = createNativeGeoSpecRunner({
        filesystem: createNodeVmFileSystem(projectPath),
        nativeAssertions: { engine },
        model: {
          projectPath,
          runtime: async () => createExampleRuntimeClient(projectPath) as unknown as GeoSpecRuntimeClient,
        },
      });
      try {
        const report = await runner.run({ files: ['main.geospec.ts'], testTimeout: 300_000 });
        expect(report.failed, JSON.stringify(report.files, null, 2)).toBe(0);
        expect(report.success).toBe(true);
      } finally {
        await runner.close();
        engine.close();
      }
    },
  );

  it('v8-engine-rev2 geospec suite passes', { timeout: 1_500_000 }, async () => {
    /*
     * The flagship suite is SPEC-FIRST: requirements the model does not yet
     * satisfy are `it.skip`, so the runnable set must be green. Un-skip a row
     * when the model earns it; never leave a red row in the corpus.
     */
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
    expect(report.files).toHaveLength(9);
    expect(report.failed).toBe(0);
    expect(report.success).toBe(true);
  });
});

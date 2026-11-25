import { testReporters } from '@taucad/vitest-ci';
import { configDefaults, defineConfig } from 'vitest/config';

/*
 * Wall-clock ratio gates measure a ~1 ms native/wasm gap. Run next to the heavy
 * suites (picovoxel renders, two-process sockets, GeoSpec) on the hosted macOS
 * runner, their warm medians inflated 7-20x and the ratio swung 0.75-1.15 on
 * the same code. They run as a later group, one file at a time, once every
 * other suite has finished.
 */
const timingGates = ['src/benchmarks/native-speedup.bench.test.ts', 'src/benchmarks/parameter-commit.bench.test.ts'];

/*
 * The handle ledger rebuilds each heavy matrix model nine times on single-thread
 * wasm (planetary-gear-system's tier-off test takes 153 s alone on a Linux host).
 * Run next to the other suites on the hosted macOS runner, the same tests took
 * 300-322 s and a different model's test crossed the per-test budget each night
 * (#342). It runs on its own after the suites and before the timing gates.
 */
const isolatedSuites = ['src/replicad-handle-ledger.test.ts'];

const shared = {
  environment: 'node',
  // Fixture render + geospec suites are heavy (cold OCCT wasm); give them room.
  testTimeout: 300_000,
  hookTimeout: 120_000,
} as const;

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/runtime-e2e',
    },
    maxWorkers: 4,
    reporters: testReporters('verbose'),
    projects: [
      {
        extends: true,
        test: {
          ...shared,
          name: 'suites',
          exclude: [...configDefaults.exclude, ...timingGates, ...isolatedSuites],
        },
      },
      {
        extends: true,
        test: {
          ...shared,
          name: 'isolated',
          include: isolatedSuites,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          ...shared,
          name: 'timing-gates',
          include: timingGates,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});

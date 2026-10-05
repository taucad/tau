import { configDefaults, defineConfig } from 'vitest/config';

/*
 * Wall-clock ratio gates measure a ~1 ms native/wasm gap. Run next to the heavy
 * suites (picovoxel renders, two-process sockets, GeoSpec) on the hosted macOS
 * runner, their warm medians inflated 7-20x and the ratio swung 0.75-1.15 on
 * the same code. They run as a later group, one file at a time, once every
 * other suite has finished.
 */
const timingGates = ['src/benchmarks/native-speedup.bench.test.ts', 'src/benchmarks/parameter-commit.bench.test.ts'];

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
    reporters: ['verbose'],
    projects: [
      {
        extends: true,
        test: { ...shared, name: 'suites', exclude: [...configDefaults.exclude, ...timingGates] },
      },
      {
        extends: true,
        test: {
          ...shared,
          name: 'timing-gates',
          include: timingGates,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

/*
 * A `test:shard-<k>` target (tools/test-shards.plugin.ts, test-shards.json) names its files here, comma-separated;
 * `test` sets nothing and runs every file.
 */
const shardFiles = process.env['TAU_VITEST_SHARD_FILES']?.split(',');

export default defineConfig({
  test: {
    environment: 'node',
    ...(shardFiles ? { include: shardFiles.filter((file) => !file.endsWith('.test-d.ts')) } : {}),
    typecheck: {
      enabled: true,
      include: shardFiles ? shardFiles.filter((file) => file.endsWith('.test-d.ts')) : ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/revisions',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});

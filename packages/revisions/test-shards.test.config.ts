import { defineConfig, mergeConfig } from 'vitest/config';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vitest configuration lives outside the src/ import map.
import { DurationShardSequencer } from './test-shards.test-utils.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vitest configuration lives outside the src/ import map.
import vitestConfig from './vitest.config.js';

/**
 * `revisions`' test configuration for the CI test shards, `revisions:test:shard-<n>`: `vitest.config.ts` unchanged,
 * with `DurationShardSequencer` dealing the files for `--shard=<n>/<count>` by measured seconds. Named so the Nx Vitest
 * plugin infers no target from it; `revisions:test`, which runs every file, still reads `vitest.config.ts` alone.
 */
export default mergeConfig(vitestConfig, defineConfig({ test: { sequence: { sequencer: DurationShardSequencer } } }));

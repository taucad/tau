// oxlint-disable-next-line eslint/no-restricted-imports -- Vitest configuration lives outside the app alias root.
import { DurationShardSequencer } from './test-shards.test.sequencer.js';
import { defineConfig, mergeConfig } from 'vitest/config';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vitest configuration lives outside the app alias root.
import viteConfig from './vite.config.js';

/**
 * `ui`'s test configuration for the CI test shards, `ui:test:shard-<n>`: `vite.config.ts` unchanged, with
 * `DurationShardSequencer` dealing the files for `--shard=<n>/<count>` by measured seconds. Named so the Nx Vitest
 * plugin infers no target from it; `ui:test`, which runs every file, still reads `vite.config.ts` alone.
 */
export default defineConfig((environment) =>
  mergeConfig(viteConfig(environment), { test: { sequence: { sequencer: DurationShardSequencer } } }),
);

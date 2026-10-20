import { bundlePattern, workspace } from '@taucad/nx';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const packageConfig: UserConfig = {
  // Entries are the `geospec` bin, the two public subpaths, and the pool worker's thread entry — a worker
  // loads a URL, so its module must exist as a real file beside the runner that spawns it.
  entry: [
    'src/cli/main.ts',
    'src/runner/node/native-pool-worker-entry.ts',
    'src/runner/node/native-pool-runner.ts',
    'src/runner/node/node-vm-filesystem.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  format: 'esm',
  outDir: 'dist',
};

// The private `@taucad/agent-tools` exporter is bundled into the worker entry; its declarations stay out of the API.
export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'geospec-engine');
  return { ...packageConfig, deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } } } satisfies UserConfig;
});

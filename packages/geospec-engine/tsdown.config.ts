import { bundlePattern, workspace } from '@taucad/nx';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const packageConfig: UserConfig = {
  // Entries are the `geospec` bin, the two public subpaths, and the default exporter module each pool worker
  // imports by URL, so it must exist as a real file.
  entry: [
    'src/cli/main.ts',
    'src/model/default-exporter.ts',
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

// The private `@taucad/agent-tools` exporter is bundled into the default exporter module; its declarations stay out of the API.
export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'geospec-engine');
  return { ...packageConfig, deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } } } satisfies UserConfig;
});

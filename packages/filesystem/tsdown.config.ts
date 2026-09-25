import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/backend/index.ts',
    'src/backend/node/index.ts',
    'src/composed-view.ts',
    'src/content-metadata.ts',
    'src/path-registry.ts',
    'src/backend/stream-utils.ts',
    'src/content-ops/index.ts',
    'src/storage-root-key.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'filesystem'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'filesystem');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});

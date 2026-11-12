import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/native-kernel-adopter.ts',
    'src/store.ts',
    'src/shell.ts',
    'src/shell/srt-supervisor.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) =>
      assembleBundledDeclarations(process.cwd(), options.outDir, 'native-process-core'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'native-process-core');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});

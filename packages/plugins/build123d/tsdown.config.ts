import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/native.ts'],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'build123d'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'build123d');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    // The package's own tau-plugin.json stays a runtime import of the published file, not a bundled copy.
    deps: {
      alwaysBundle: [pattern],
      neverBundle: [/^@taucad\/build123d\/tau-plugin\.json$/u],
      dts: { neverBundle: [pattern] },
    },
  } satisfies UserConfig;
});

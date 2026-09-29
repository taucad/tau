import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/algorithms/index.ts',
    'src/node/index.ts',
    'src/revision-effects.ts',
    'src/revision-projection.ts',
    'src/project-revisions.machine.ts',
    'src/turn.machine.ts',
    'src/turn-placement.ts',
    'src/checkout.machine.ts',
    'src/restore.machine.ts',
    'src/checkouts.machine.ts',
    'src/branch.machine.ts',
    'src/resolution.machine.ts',
    'src/remote.machine.ts',
    'src/sync.machine.ts',
    'src/publish.machine.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'revisions'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'revisions');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});

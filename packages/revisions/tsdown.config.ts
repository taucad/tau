import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/algorithms/index.ts',
    'src/node/index.ts',
    'src/revision-effects.ts',
    'src/project-revisions.machine.ts',
    'src/turn.machine.ts',
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
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);

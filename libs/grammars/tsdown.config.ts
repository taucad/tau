import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/fixtures.ts',
    'src/bash/index.ts',
    'src/csharp/index.ts',
    'src/jsonc/index.ts',
    'src/kcl/index.ts',
    'src/openscad/index.ts',
    'src/stepfile/index.ts',
    'src/stl/index.ts',
    'src/sysml/index.ts',
    'src/usd/index.ts',
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

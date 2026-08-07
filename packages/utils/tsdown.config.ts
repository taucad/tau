import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/id.utils.ts',
    'src/path.utils.ts',
    'src/file.utils.ts',
    'src/import.utils.ts',
    'src/schema.utils.ts',
    'src/dispose.utils.ts',
    'src/error.utils.ts',
    'src/cache.utils.ts',
    'src/hash.utils.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
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

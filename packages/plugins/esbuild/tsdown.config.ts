import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/vm/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  copy: ({ outDir }) => [{ from: 'src/vm/wasm', to: `${outDir}/vm` }],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig({
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
} satisfies UserConfig);

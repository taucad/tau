import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/engine-connection.ts', 'src/proxy.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  // The offline engine's own libcascade build (glue, WASM and types) stays beside the modules that load it.
  copy: ({ outDir }) => [{ from: 'src/offline/wasm', to: `${outDir}/offline` }],
  external: [/\/wasm\/libcascade_kcl\.js$/],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);

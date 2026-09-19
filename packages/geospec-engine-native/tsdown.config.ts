import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/node.ts', 'src/wasm.ts'],
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
  deps: { neverBundle: ['#native-binding', '#mixed-wasm-binding'] },
  copy: [
    { from: 'bindings/emscripten/generated/*.mjs', to: 'dist/bindings/mixed-wasm' },
    { from: 'bindings/emscripten/generated/*.wasm', to: 'dist/bindings/mixed-wasm' },
    { from: 'bindings/node/generated/*.js', to: 'dist/native' },
    { from: 'bindings/node/generated/*.node', to: 'dist/native' },
  ],
};

export default defineConfig(packageConfig);

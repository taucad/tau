import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/*
 * Packages that must remain external from the CLI bin bundle. Bundling them
 * inlines `new URL(literal, import.meta.url)` references and breaks every
 * runtime asset/dynamic-plugin lookup at execution time. The CLI bin is a
 * thin shim that loads the runtime and its WASM-bearing deps from
 * `node_modules` at runtime so the upstream `import.meta.url` survives.
 *
 * @see docs/research/runtime-zero-config-bundling.md (R1, R9)
 */
const cliExternals: Array<RegExp | string> = [
  /^@taucad\//,
  'replicad',
  'replicad-opencascadejs',
  'opencascade.js',
  'manifold-3d',
  '@kittycad/lib',
  'esbuild-wasm',
  'openscad-wasm-prebuilt',
  'jszip',
];

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
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

const cliConfig: UserConfig = {
  entry: { taucad: 'src/bin.ts' },
  format: 'esm',
  outDir: 'dist/bin',
  platform: 'node',
  target: 'node22',
  clean: ['dist/bin'],
  dts: false,
  minify: false,
  sourcemap: false,
  tsconfig: 'tsconfig.build.json',
  deps: { neverBundle: cliExternals },
  banner: { js: '#!/usr/bin/env node' },
};

export default defineConfig([packageConfig, cliConfig]);

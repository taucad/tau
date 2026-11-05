import { defineConfig } from 'vitest/config';

// The kernel worker's resolution (see `src/engine/svg-to-png.ts`): inline the converter so its board-layer chunks
// resolve to the kernel's rasterizer, as every Tau bundler does, instead of the native binding.
const boardTexture = new URL('src/engine/svg-to-png.ts', import.meta.url).pathname;

export default defineConfig({
  resolve: { alias: [{ find: /^\.\/svg-to-png-(?:browser-)?[\dA-Z]+\.js$/u, replacement: boardTexture }] },
  test: {
    environment: 'node',
    server: { deps: { inline: ['circuit-json-to-gltf'] } },
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/packages/plugins/tscircuit',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});

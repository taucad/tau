/**
 * Compiles the lean T11 harness (`test/bench/observability-bench.ts`) for plain `node`.
 *
 * The live runtime modules the benches import through `#…` are not compiled again: they resolve to the package's own
 * `dist`, so the benches measure the published build. Only the harness and the frozen reference are compiled here, with
 * the package build's target and minifier. Run `runtime:build` first; a missing `dist` module fails the build.
 */

import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const outDirectory = join(packageRoot, '../../node_modules/.cache/runtime-bench');

export default defineConfig({
  entry: ['test/bench/observability-bench.ts'],
  outDir: outDirectory,
  clean: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  minify: true,
  sourcemap: true,
  dts: false,
  tsconfig: 'tsconfig.spec.json',
  plugins: [
    {
      name: 'runtime-bench:compiled-runtime',
      resolveId: {
        order: 'pre',
        handler(source) {
          if (!source.startsWith('#')) {
            return undefined;
          }
          const compiled = join(packageRoot, 'dist', source.slice(1).replace(/\.js$/u, '.mjs'));
          if (!existsSync(compiled)) {
            throw new Error(`${source} has no compiled module at ${compiled}; run pnpm nx build runtime first.`);
          }
          return { id: `./${relative(outDirectory, compiled).split(sep).join('/')}`, external: true };
        },
      },
    },
  ],
});

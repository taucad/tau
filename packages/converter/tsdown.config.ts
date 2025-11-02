import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: ['src/index.ts', 'src/constants/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  copy: (options) => [
    {
      from: 'src/assets',
      to: `${options.outDir}/assets`,
    },
  ],
  tsconfig: 'tsconfig.build.json',
  /**
   * IMPORTANT: This is required for the WASM file paths to be resolved consistently in both
   * source code and bundled (built) code.
   *
   * This is possible via the following pattern:
   * `new URL('./relative-path', import.meta.url)`
   *
   * Note: this causes a minor 2-3% increase in the bundle size.
   *
   * @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
   */
  unbundle: true,
};

const cjsConfig: Options = {
  ...baseConfig,
  format: 'cjs',
  outDir: 'dist/cjs',
};

const esmConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist/esm',
};

export default defineConfig([esmConfig, cjsConfig]);

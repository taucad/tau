import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/**
 * Everything `libcascade build` + `libcascade assemble` leave in
 * `native/opencascade/dist/`, copied verbatim.
 *
 * The assembled `init.js` resolves the glue with
 * `new URL('./geospec_opencascade_single.js', import.meta.url)` and the glue
 * resolves its `.wasm` the same way, so all three must stay siblings. That is
 * also why `@taucad/geospec-engine/native/opencascade/single` stays external:
 * bundling `init.js` would relocate it away from its siblings.
 */
const nativeOpenCascadeArtifacts = [
  'init.js',
  'init.d.ts',
  'index.js',
  'index.d.ts',
  'types.d.ts',
  'variant.d.ts',
  'geospec_opencascade_single.js',
  'geospec_opencascade_single.d.ts',
  'geospec_opencascade_single.wasm',
  'geospec_opencascade_single.build-manifest.json',
  'geospec_opencascade_single.provenance.json',
] as const;

const packageConfig: UserConfig = {
  // Four entries: the library, the side-effect registration, the `geospec`
  // bin, and the pool worker's thread entry — a worker loads a URL, so its
  // module must exist as a real file beside the runner that spawns it.
  entry: ['src/index.ts', 'src/register.ts', 'src/cli/main.ts', 'src/runner/node/pool-worker-entry.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  format: 'esm',
  outDir: 'dist',
  external: ['@taucad/geospec-engine/native/opencascade/single'],
  copy: nativeOpenCascadeArtifacts.map((artifact) => ({
    from: `native/opencascade/dist/${artifact}`,
    to: 'dist/native/opencascade',
  })),
};

export default defineConfig(packageConfig);

import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/**
 * The subset of `native/opencascade/dist/` that the published subpath reaches,
 * copied verbatim: `init.js`, the only declaration file it imports, and the
 * glue it loads.
 *
 * `libcascade.config.ts` declares a single variant (closeout C1), so `init.js`
 * has nothing to select: no capability probe, one glue URL.
 *
 * It resolves that glue with
 * `new URL('./geospec_opencascade_single.js', import.meta.url)` and the glue
 * resolves its `.wasm` the same way, so all three must stay siblings. That is
 * also why `@taucad/geospec-engine/native/opencascade/single` stays external:
 * bundling `init.js` would relocate it away from its siblings.
 *
 * The eager `index` root and the raw-glue `variant.d.ts` are deliberately
 * absent — nothing published imports them.
 */
const nativeOpenCascadeArtifacts = [
  'init.js',
  'init.d.ts',
  'types.d.ts',
  'geospec_opencascade_single.js',
  'geospec_opencascade_single.d.ts',
  'geospec_opencascade_single.wasm',
  'geospec_opencascade_single.build-manifest.json',
  'geospec_opencascade_single.provenance.json',
] as const;

const packageConfig: UserConfig = {
  // Six entries: the library, the host-neutral and Node registrations, the
  // `geospec` bin, the light WASM URL, and the pool worker's thread entry — a worker loads a URL,
  // so its module must exist as a real file beside the runner that spawns it.
  entry: [
    'src/index.ts',
    'src/register.ts',
    'src/register-node.ts',
    'src/cli/main.ts',
    'src/runner/node/pool-worker-entry.ts',
    'src/native/opencascade-wasm.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  format: 'esm',
  outDir: 'dist',
  deps: { neverBundle: ['@taucad/geospec-engine/native/opencascade/single'] },
  copy: nativeOpenCascadeArtifacts.map((artifact) => ({
    from: `native/opencascade/dist/${artifact}`,
    to: 'dist/native/opencascade',
  })),
};

export default defineConfig(packageConfig);

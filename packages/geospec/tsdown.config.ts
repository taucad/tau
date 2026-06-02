import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const nativeOpenCascadeArtifacts = [
  'geospec_opencascade_single.wasm',
  'geospec_opencascade_single.build-manifest.json',
  'geospec_opencascade_single.provenance.json',
] as const;

const nativeOpenCascadeCopyEntries = (outDirectory: string): NonNullable<Options['copy']> =>
  nativeOpenCascadeArtifacts.map((artifact) => ({
    from: `native/opencascade/${artifact}`,
    to: `${outDirectory}/native/opencascade/${artifact}`,
  }));

const baseConfig: Options = {
  entry: [
    'src/index.ts',
    'src/brep/index.ts',
    'src/config/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/runner/index.ts',
    'src/step/index.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const cjsConfig: Options = {
  ...baseConfig,
  format: 'cjs',
  outDir: 'dist/cjs',
  dts: true,
  copy: nativeOpenCascadeCopyEntries('dist/cjs'),
};

const esmConfig: Options = {
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/brep/index.ts',
    'src/config/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/runner/index.ts',
    'src/step/index.ts',
  ],
  format: 'esm',
  outDir: 'dist/esm',
  copy: nativeOpenCascadeCopyEntries('dist/esm'),
};

export default defineConfig([esmConfig, cjsConfig]);

import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const nativeOpenCascadeArtifacts = [
  'geospec_opencascade_single.d.ts',
  'geospec_opencascade_single.wasm',
  'geospec_opencascade_single.build-manifest.json',
  'geospec_opencascade_single.provenance.json',
] as const;

const nativeOpenCascadeCopyEntries = (outDirectory: string): NonNullable<UserConfig['copy']> =>
  nativeOpenCascadeArtifacts.map((artifact) => ({
    from: `native/opencascade/${artifact}`,
    to: `${outDirectory}/native/opencascade`,
  }));

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/brep/index.ts',
    'src/config/index.ts',
    'src/inspection/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/proofs/index.ts',
    'src/runner/index.ts',
    'src/runner/node/index.ts',
    'src/runner/web/index.ts',
    'src/runner/worker/index.ts',
    'src/selector/index.ts',
    'src/step/index.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/brep/index.ts',
    'src/config/index.ts',
    'src/inspection/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/proofs/index.ts',
    'src/runner/index.ts',
    'src/runner/node/index.ts',
    'src/runner/web/index.ts',
    'src/runner/worker/index.ts',
    'src/selector/index.ts',
    'src/step/index.ts',
  ],
  format: 'esm',
  outDir: 'dist',
  copy: nativeOpenCascadeCopyEntries('dist'),
};

export default defineConfig(packageConfig);

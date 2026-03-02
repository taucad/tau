import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: [
    'src/index.ts',
    'src/react/index.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/postprocessing',
  ],
};

const cjsConfig: Options = {
  ...baseConfig,
  format: 'cjs',
  outDir: 'dist/cjs',
  dts: false,
};

const esmConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist/esm',
};

export default defineConfig([esmConfig, cjsConfig]);

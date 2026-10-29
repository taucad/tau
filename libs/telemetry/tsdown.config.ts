import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const externalDependencies = [/^zod(\/|$)/];

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/client.ts', 'src/node.ts', 'src/node-host.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  deps: {
    neverBundle: externalDependencies,
    dts: { neverBundle: externalDependencies },
  },
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);

import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/*
 * Built only so the bundle owners can mirror these declarations into their `dist/libs/sandbox`: `native-process-core`
 * (every entry) and `host`, through `shell-service`, which imports the stateless `./shell/*` subpaths only.
 */
const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/shell.ts',
    'src/shell/srt-supervisor.ts',
    'src/shell/shell-baseline.ts',
    'src/shell/shell-environment.ts',
    'src/shell/shell-identity.ts',
    'src/shell/shell-provider.ts',
  ],
  sourcemap: false,
  clean: true,
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

export default defineConfig(packageConfig);

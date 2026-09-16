import { bundlePattern, workspace } from '@taucad/nx';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/schema-admission.ts',
    'src/bounded-json.ts',
    'src/authority.ts',
    'src/parameter-set.machine.ts',
    'src/parameter-input.machine.ts',
  ],
  copy: [
    { from: '../../license', to: 'dist', rename: 'LICENSE' },
    { from: '../../license-deps', to: 'dist', rename: 'THIRD_PARTY_LICENSES.md' },
    { from: 'NOTICE', to: 'dist' },
  ],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'parameters');
  return { ...baseConfig, format: 'esm', outDir: 'dist', deps: { alwaysBundle: [pattern] } } satisfies UserConfig;
});

import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'mcp'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: false,
  platform: 'node',
  target: 'node24',
  deps: { neverBundle: [/^@modelcontextprotocol\/sdk(?:\/|$)/u, 'zod'] },
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'mcp');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: {
      ...baseConfig.deps,
      alwaysBundle: [pattern],
      dts: { neverBundle: [pattern] },
    },
  } satisfies UserConfig;
});

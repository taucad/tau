import { readFileSync } from 'node:fs';
import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/** Every exported source module is an entry, so `publishConfig.exports` and the build cannot drift. */
const entries = Object.values(
  (JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { exports: Record<string, string> })
    .exports,
).filter((target) => /^\.\/src\/.+\.tsx?$/u.test(target));

const baseConfig: UserConfig = {
  entry: entries,
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  copy: ({ outDir }) => [
    { from: 'src/styles/panes.css', to: `${outDir}/styles` },
    { from: 'src/styles/panes.css.d.ts', to: `${outDir}/styles` },
    { from: 'src/styles/pane-resize.css', to: `${outDir}/styles` },
  ],
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'workbench-panes'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'workbench-panes');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});

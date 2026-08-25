import { bundlePattern, workspace } from '@taucad/nx';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';
// oxlint-disable-next-line no-restricted-imports -- Build config consumes its adjacent declaration assembly hook.
import { assembleBundledDeclarations } from './scripts/assemble-bundled-declarations.mts';

export const runtimeCopyTargets = (outDirectory: string): Array<{ from: string; to: string; rename?: string }> => [
  {
    from: '../../license',
    to: outDirectory,
    rename: 'LICENSE',
  },
  {
    from: '../../license-deps',
    to: outDirectory,
    rename: 'THIRD_PARTY_LICENSES.md',
  },
  {
    from: 'src/nextjs/package-assets-loader.mjs',
    to: `${outDirectory}/nextjs`,
  },
];

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/types/index.ts',
    'src/plugins/plugin-entry.ts',
    'src/plugins/kernel-plugin-entry.ts',
    'src/plugins/middleware-entry.ts',
    'src/plugins/bundler-entry.ts',
    'src/plugins/transcoder-entry.ts',
    'src/transport/index.ts',
    'src/transport/in-process.ts',
    'src/transport/web.ts',
    'src/transport/node.ts',
    'src/transport/websocket.ts',
    'src/transport/websocket-host.ts',
    'src/electron/main.ts',
    'src/electron/preload.ts',
    'src/electron/renderer.ts',
    'src/electron/utility.ts',
    'src/electron/vite.ts',
    'src/node.ts',
    'src/filesystem/index.ts',
    'src/filesystem/from-node-fs.ts',
    'src/filesystem/from-browser-fs.ts',
    'src/framework/kernel-runtime-worker.ts',
    'src/worker/index.ts',
    'src/worker/web.ts',
    'src/cross-origin-isolation/index.ts',
    'src/cross-origin-isolation/express.ts',
    'src/react-router/index.ts',
    'src/vite/index.ts',
    'src/nextjs/config.ts',
    'src/nextjs/browser-node-builtins.ts',
    'src/utils/package-info.ts',
  ],
  sourcemap: true,
  clean: ['dist'],
  dts: true,
  minify: true,
  copy: ({ outDir }) => runtimeCopyTargets(outDir),
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir),
  },
  tsconfig: 'tsconfig.build.json',
  target: 'es2024',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'runtime');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});

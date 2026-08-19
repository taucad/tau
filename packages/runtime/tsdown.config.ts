import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';
// oxlint-disable-next-line no-restricted-imports -- Build config consumes its adjacent declaration assembly hook.
import { assembleBundledDeclarations } from './scripts/assemble-bundled-declarations.mts';
// oxlint-disable-next-line no-restricted-imports -- Build config consumes adjacent private bundle metadata.
import { runtimeBundledPackages } from './scripts/runtime-bundled-packages.mts';

// oxlint-disable-next-line unicorn-js/prefer-export-from -- The local binding also feeds the bundle matcher below.
export const bundledWorkspaceDependencies = runtimeBundledPackages;
const bundledWorkspaceDependencyPattern = new RegExp(`^@taucad/(${runtimeBundledPackages.join('|')})(/|$)`);

export const runtimeCopyTargets = (outDirectory: string): Array<{ from: string; to: string; rename?: string }> => [
  {
    from: 'src/kernels/replicad/fonts',
    to: `${outDirectory}/kernels/replicad`,
  },
  {
    from: 'src/kernels/replicad/wasm',
    to: `${outDirectory}/kernels/replicad`,
  },
  {
    // `replicad.kernel.ts` resolves `sourcemaps/replicad.js.map` relative to
    // itself so library frames keep source mapping in shipped error traces.
    from: 'src/kernels/replicad/sourcemaps',
    to: `${outDirectory}/kernels/replicad`,
  },
  {
    from: 'src/kernels/zoo/wasm',
    to: `${outDirectory}/kernels/zoo`,
  },
  {
    from: 'src/kernels/manifold/wasm',
    to: `${outDirectory}/kernels/manifold`,
  },
  {
    from: 'src/kernels/opencascade/wasm',
    to: `${outDirectory}/kernels/opencascade`,
  },
  {
    from: '../../libs/vm/src/wasm',
    to: `${outDirectory}/libs/vm/src`,
  },
  {
    from: '../../libs/converter/src/assets',
    to: `${outDirectory}/libs/converter/src`,
  },
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
];

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/types/index.ts',
    'src/plugins/presets.ts',
    'src/plugins/kernel-plugin-entry.ts',
    'src/plugins/kernels-entry.ts',
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
    'src/vm.ts',
    'src/filesystem/index.ts',
    'src/filesystem/from-node-fs.ts',
    'src/filesystem/from-browser-fs.ts',
    'src/testing/index.ts',
    'src/framework/kernel-runtime-worker.ts',
    'src/worker/index.ts',
    'src/worker/web.ts',
    'src/worker/node.ts',
    'src/kernels/replicad/replicad.kernel.ts',
    'src/kernels/replicad/annotations/index.ts',
    'src/kernels/replicad/replicad-wasm-single-loader.ts',
    'src/kernels/replicad/replicad-wasm-multi-loader.ts',
    'src/kernels/jscad/jscad.kernel.ts',
    'src/kernels/manifold/manifold.kernel.ts',
    'src/kernels/opencascade/opencascade.kernel.ts',
    'src/kernels/zoo/zoo.kernel.ts',
    'src/kernels/zoo/engine-connection.ts',
    'src/kernels/tau/tau.kernel.ts',
    'src/bundler/esbuild.bundler.ts',
    'src/middleware/parameter-file-resolver.middleware.ts',
    'src/middleware/parameter-cache.middleware.ts',
    'src/middleware/geometry-cache.middleware.ts',
    'src/middleware/gltf-coordinate-transform.middleware.ts',
    'src/middleware/gltf-edge-detection.middleware.ts',
    'src/cross-origin-isolation/index.ts',
    'src/cross-origin-isolation/express.ts',
    'src/react-router/index.ts',
    'src/vite/index.ts',
    'src/nextjs/index.ts',
    'src/nextjs/config.ts',
    'src/nextjs/browser-node-builtins.ts',
    'src/utils/package-info.ts',
  ],
  sourcemap: true,
  clean: ['dist'],
  dts: true,
  minify: true,
  copy: ({ outDir }) => runtimeCopyTargets(outDir),
  deps: {
    alwaysBundle: [bundledWorkspaceDependencyPattern],
    dts: { neverBundle: [bundledWorkspaceDependencyPattern] },
  },
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir),
  },
  tsconfig: 'tsconfig.build.json',
  target: 'es2024',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);

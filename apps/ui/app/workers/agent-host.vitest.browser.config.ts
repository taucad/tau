/* oxlint-disable import/extensions -- The composed source fixture is replaced by the package export when FIX-PROJ adds the UI dependency. */
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import type { BrowserProviderOption } from 'vitest/node';
import { tauRuntime } from '@taucad/runtime/vite';
// eslint-disable-next-line @nx/enforce-module-boundaries -- This composed browser contract fixture exercises the package wire through the UI worker until FIX-PROJ adds the UI package dependency.
import { authoritativeGatewayWireFixtures } from '../../../../packages/agent-host/src/transport/gateway-wire.fixture.js';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    {
      name: 'agent-host-gateway-fixture',
      configureServer(server) {
        server.middlewares.use('/v1/llm/openai/v1/chat/completions', (_request, response) => {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'x-tau-operation-id': 'operation-browser-fixture',
          });
          for (const frame of authoritativeGatewayWireFixtures.browserTurn) {
            response.write(frame);
          }
          response.end();
        });
      },
    },
    tauRuntime(),
  ],
  server: {
    host: '127.0.0.1',
    // Vite 8's fs check must admit the monorepo root (worker + package imports).
    fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] },
  },
  /* `isomorphic-git` and its `buffer`: RM-A22's worker; the kernel worker's dependencies, which a project host's
   * runtime client loads. Each found late is optimised mid-run, and the reload that follows flakes the suite. */
  optimizeDeps: {
    include: [
      '@taucad/gltf > draco3dgltf',
      'buffer',
      '@taucad/revisions > isomorphic-git',
      '@jscad/modeling',
      '@taucad/kcl-wasm-lib',
      '@taulabs/openrscad-engine',
      'culori',
      'es-module-lexer',
      'esbuild',
      'esbuild-wasm',
      '@taucad/assimp > libassimp',
      'libcascade/multi/init',
      'libcascade/single/init',
      'manifold-3d',
      'manifold-3d/lib/garbage-collector.js',
      'manifold-3d/lib/gltf-io.js',
      'manifold-3d/lib/gltf-node.js',
      'manifold-3d/lib/level-of-detail.js',
      'manifold-3d/lib/scene-builder.js',
      'manifold-3d/lib/wasm.js',
      'manifold-3d/manifoldCAD',
      '@taucad/image > nanoraster/options',
      '@taucad/brep > occt-import-js',
      'replicad',
      'replicad-opencascadejs/multi/init',
      'replicad-opencascadejs/single/init',
      '@taucad/rhino > rhino3dm',
      'vitest-mock-extended',
    ],
  },
  test: {
    include: [
      'app/workers/agent-host.browser.test.ts',
      'app/workers/agent-host-resident.browser.test.ts',
      'app/workers/agent-host-executor-view.browser.test.ts',
      'app/workers/seam.browser.test.ts',
      'app/workers/gltf-codec.browser.test.ts',
      'app/workers/headless-capture-in-worker.browser.test.ts',
      'app/workers/skill-resources.browser.test.ts',
      'app/machines/file-manager.browser.test.ts',
      'app/machines/web-locks.browser.test.ts',
      'app/machines/revisions-opfs.browser.test.ts',
      'app/components/geometry/loader/metal-morph-spinner.browser.test.tsx',
      'app/components/geometry/graphics/three/materials/section-clip.browser.test.ts',
    ],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // `--enable-unsafe-webgpu` is what `apps/ui-e2e` launches with; the
      // headless capture probe needs a real adapter or its answer is vacuous.
      // CI's GPU-less lane sets the software profile, which takes SwiftShader's
      // adapter exactly as `apps/ui-e2e`'s `webGpuLaunchArguments` does.
      // `@vitest/browser-playwright` resolves a second `vitest` peer variant (its jsdom lacks
      // the optional `supports-color` peer), so the option it returns is nominally — not
      // structurally — distinct from this program's own `vitest/node` declaration. This is the
      // only vitest config inside a typecheck program, so no other config surfaces the split.
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- duplicated `vitest` declarations leave no narrower bridge
      provider: playwright({
        launchOptions: {
          channel: 'chromium',
          args: [
            '--enable-unsafe-webgpu',
            ...(process.env['TAU_E2E_WEBGPU_PROFILE'] === 'software' ? ['--use-webgpu-adapter=swiftshader'] : []),
          ],
        },
      }) as unknown as BrowserProviderOption,
      instances: [{ browser: 'chromium' }],
    },
  },
});

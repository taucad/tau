/* oxlint-disable import/extensions -- The composed source fixture is replaced by the package export when FIX-PROJ adds the UI dependency. */
import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';
// eslint-disable-next-line @nx/enforce-module-boundaries -- This composed browser contract fixture exercises the package wire through the UI worker until FIX-PROJ adds the UI package dependency.
import { authoritativeGatewayWireFixtures } from '../../../../packages/agent-host/src/transport/gateway-wire.fixture.js';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  define: { tauTelemetryHostCloudBuild: 'false' },
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
   * runtime client loads, and since WP-12 step 7 an admitted turn warms that runtime, so its image and import codecs
   * load too. Each found late is optimised mid-run, and the reload that follows flakes the suite. */
  optimizeDeps: {
    include: [
      '@taucad/gltf > draco3dgltf',
      'buffer',
      '@taucad/revisions > isomorphic-git',
      '@taucad/smlib > @classcad/smlibwasm',
      '@taucad/smlib > @classcad/smlibwasm/kernel',
      '@jscad/modeling',
      '@taucad/kcl-wasm-lib',
      '@taulabs/openrscad-engine',
      'culori',
      'es-module-lexer',
      'esbuild',
      'esbuild-wasm',
      '@taucad/assimp > libassimp',
      '@taucad/assimp > libassimp/capabilities',
      '@taucad/cadmpeg > cadmpeg-ts/core',
      '@taucad/cadmpeg > cadmpeg-ts/digests',
      '@taucad/heif > libheif-js/libheif-wasm/libheif.js',
      'libcascade/multi/init',
      'libcascade/single/init',
      'manifold-3d',
      'manifold-3d/lib/garbage-collector.js',
      'manifold-3d/lib/gltf-io.js',
      'manifold-3d/lib/gltf-node.js',
      'manifold-3d/lib/level-of-detail.js',
      'manifold-3d/lib/material.js',
      'manifold-3d/lib/scene-builder.js',
      'manifold-3d/lib/wasm.js',
      'manifold-3d/manifoldCAD',
      '@taucad/image > @jsquash/avif/codec/dec/avif_dec.js',
      '@taucad/image > @jsquash/jpeg/codec/dec/mozjpeg_dec.js',
      '@taucad/image > @jsquash/jpeg/codec/enc/mozjpeg_enc.js',
      '@taucad/image > @jsquash/jpeg/meta.js',
      '@taucad/image > @jsquash/png/codec/pkg/squoosh_png.js',
      '@taucad/image > @jsquash/resize/lib/resize/pkg/squoosh_resize.js',
      '@taucad/image > @jsquash/webp/codec/dec/webp_dec.js',
      '@taucad/image > @jsquash/webp/codec/enc/webp_enc.js',
      '@taucad/image > @jsquash/webp/meta.js',
      '@taucad/image > jpeg-js',
      '@taucad/image > nanoraster/options',
      '@taucad/image > omggif',
      '@taucad/image > utif2',
      '@taucad/brep > occt-import-js',
      '@taucad/picovoxel > picovoxel',
      '@taucad/picovoxel > picovoxel/latticelibrary',
      '@taucad/picovoxel > picovoxel/multi',
      '@taucad/picovoxel > picovoxel/numerics',
      '@taucad/picovoxel > picovoxel/shapekernel',
      '@taucad/picovoxel > picovoxel/slicing',
      'replicad',
      'replicad-opencascadejs/multi/init',
      'replicad-opencascadejs/single/init',
      'vitest-mock-extended',
      'vscode-uri',
    ],
  },
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    include: [
      'app/workers/agent-host.browser.test.ts',
      'app/workers/agent-host-resident.browser.test.ts',
      'app/workers/agent-host-recovery.browser.test.ts',
      'app/workers/agent-host-executor-view.browser.test.ts',
      'app/workers/seam.browser.test.ts',
      'app/workers/gltf-codec.browser.test.ts',
      'app/workers/headless-capture-in-worker.browser.test.ts',
      'app/workers/skill-resources.browser.test.ts',
      'app/machines/file-manager.browser.test.ts',
      'app/machines/web-locks.browser.test.ts',
      'app/machines/revisions-opfs.browser.test.ts',
      'app/components/geometry/loader/metal-morph-spinner.browser.test.tsx',
      'app/components/markdown/chat-markdown-hyperlink.browser.test.tsx',
    ],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // `--enable-unsafe-webgpu` is what `apps/ui-e2e` launches with; the
      // headless capture probe needs a real adapter or its answer is vacuous.
      // CI's GPU-less lane uses SwiftShader as in apps/ui-e2e.
      provider: playwright({
        launchOptions: {
          channel: 'chromium',
          args: [
            '--enable-unsafe-webgpu',
            ...(process.env['TAU_E2E_WEBGPU_PROFILE'] === 'software'
              ? [
                  '--use-webgpu-adapter=swiftshader',
                  '--use-angle=swiftshader',
                  '--enable-features=Vulkan',
                  '--use-vulkan=swiftshader',
                ]
              : []),
          ],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});

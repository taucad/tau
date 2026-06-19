import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePluginNode as vitePluginNode } from 'vite-plugin-node';
import { oxcRuntimeEsm } from '@taucad/vite/oxc-runtime-esm';
import { tsModuleUrlServePlugin } from '@taucad/vite/ts-module-url';
import { corsBaseConfiguration } from '#constants/cors.constant.js';
import { createApiDevViteNodeLifecycle } from '#api-dev-vite-node-lifecycle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';
  const apiDevPlugins = isTest
    ? []
    : (() => {
        const apiDevLifecycle = createApiDevViteNodeLifecycle();

        return [
          apiDevLifecycle.plugin,
          vitePluginNode({
            adapter: apiDevLifecycle.adapter,
            appPath: './app/main.ts',
            outputFormat: 'module',
            exportName: 'viteNodeApp',
            initAppOnBoot: false,
          }),
        ];
      })();

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/api',
    build: {
      outDir: 'dist',
    },
    server: {
      // Vite server configs, for details see [vite doc](https://vitejs.dev/config/#server-host)
      port: Number(process.env.PORT),
      cors: {
        origin: [process.env.TAU_FRONTEND_URL],
        ...corsBaseConfiguration,
      },
    },
    plugins: [
      oxcRuntimeEsm(),
      tsModuleUrlServePlugin(),
      nxViteTsPaths(),
      viteStaticCopy({
        // `vite-plugin-node` builds an SSR environment; the plugin defaults to
        // 'client' and silently no-ops without this override (broke when
        // vite-plugin-static-copy went 3 -> 4, which introduced the option).
        environment: 'ssr',
        targets: [
          {
            src: 'app/database/migrations/**/*',
            dest: 'migrations',
            // Strip the `app/database/migrations/` prefix so files land at
            // `dist/migrations/<file>` (drizzle expects `meta/_journal.json`
            // directly under the migrations folder).
            rename: { stripBase: 3 },
          },
        ],
      }),
      ...apiDevPlugins,
    ],
    optimizeDeps: {
      // Vite does not work well with optionnal dependencies,
      // mark them as ignored for now
      exclude: [
        // May need to list dependencies here, e.g.:
        // '@nestjs/microservices',
      ],
    },
    test: {
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
        NODE_ENV: 'test',
      },
      environment: 'node',
      typecheck: {
        enabled: true,
        include: ['**/*.test-d.ts'],
        tsconfig: './tsconfig.spec.json',
        ignoreSourceErrors: true,
      },
      setupFiles: ['./vitest.setup.ts'],
      reporter: ['verbose'], // Ensure detailed test output
      coverage: {
        provider: 'v8',
        reportsDirectory: '../../coverage/apps/api',
        include: ['app/**/*'],
        exclude: ['app/**/*.{test,spec}.ts', 'app/main.ts'],
      },
    },
  };
});

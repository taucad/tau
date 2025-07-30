import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePluginNode as vitePluginNode } from 'vite-plugin-node';
import swc from 'unplugin-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test';

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/apps/api',
    build: {
      outDir: 'dist',
    },
    server: {
      // Vite server configs, for details see [vite doc](https://vitejs.dev/config/#server-host)
      port: Number(process.env.PORT),
    },
    plugins: [
      nxViteTsPaths(),
      tsconfigPaths(),
      viteStaticCopy({
        targets: [
          {
            src: 'app/database/migrations/**/*',
            dest: 'migrations',
          },
        ],
      }),
      ...(isTest
        ? [
            // Use SWC for proper decorator and metadata support in tests
            swc.vite(),
          ]
        : [
            // Only include vite-plugin-node for non-test mode
            vitePluginNode({
              // Nodejs native Request adapter
              // currently this plugin support 'express', 'nest', 'koa' and 'fastify' out of box,
              // you can also pass a function if you are using other frameworks, see Custom Adapter section
              adapter: 'nest',
              // Tell the plugin where is your project entry
              appPath: './app/main.ts',
              outputFormat: 'module',
              // Optional, default: 'viteNodeApp'
              // the name of named export of you app from the appPath file
              exportName: 'viteNodeApp',
              // Optional, default: false
              // if true, the app will be initialized on plugin boot
              initAppOnBoot: true,
              // Optional, default: 'esbuild'
              // The TypeScript compiler you want to use
              // by default this plugin is using vite default ts compiler which is esbuild
              // 'swc' compiler is supported to use as well for frameworks
              // like Nestjs (esbuild dont support 'emitDecoratorMetadata' yet)
              // you need to INSTALL `@swc/core` as dev dependency if you want to use swc
              tsCompiler: 'swc',
            }),
          ]),
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

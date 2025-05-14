import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePluginNode as vitePluginNode } from 'vite-plugin-node';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  build: {
    outDir: '../../dist/apps/api',
  },
  server: {
    // Vite server configs, for details see \[vite doc\](https://vitejs.dev/config/#server-host)
    port: Number(process.env.PORT),
  },
  plugins: [
    nxViteTsPaths(),
    tsconfigPaths(),
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
  ],
  optimizeDeps: {
    // Vite does not work well with optionnal dependencies,
    // mark them as ignored for now
    exclude: [
      // May need to list dependencies here, e.g.:
      // '@nestjs/microservices',
    ],
  },
});

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
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
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/api',
      include: ['app/**/*'],
      exclude: [
        'app/**/*.spec.ts',
        'app/**/*.test.ts',
        'app/**/index.ts',
        'app/main.ts',
      ],
    },
    pool: 'forks', // Use forks for better isolation in Node.js environment
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

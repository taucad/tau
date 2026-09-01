import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('src/', import.meta.url));

export default defineConfig({
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: [
      {
        find: /^#components\/(.+)\.variants\.js$/,
        replacement: `${sourceRoot}components/$1.variants.ts`,
      },
      { find: /^#components\/(.+)\.js$/, replacement: `${sourceRoot}components/$1.tsx` },
      { find: /^#hooks\/(.+)\.js$/, replacement: `${sourceRoot}hooks/$1.ts` },
      { find: /^#utils\/(.+)\.js$/, replacement: `${sourceRoot}utils/$1.ts` },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/ui',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});

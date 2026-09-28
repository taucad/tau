import path from 'node:path';
import mdx from 'fumadocs-mdx/vite';
import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Vitest loads the Fumadocs config before app aliases are active.
import * as MdxConfig from './app/lib/fumadocs/source.config.js';

const projectRoot = import.meta.dirname;
const collectionsDirectory = path.resolve(projectRoot, '../../node_modules/.cache/fumadocs/apps/docs');

export default defineConfig({
  root: projectRoot,
  cacheDir: '../../node_modules/.vite/apps/docs-test',
  resolve: {
    alias: [
      {
        find: 'fumadocs-core/server',
        replacement: path.resolve(projectRoot, 'app/lib/fumadocs/server-compat.ts'),
      },
      { find: /^fumadocs-mdx:collections\//u, replacement: `${collectionsDirectory}/` },
    ],
  },
  plugins: [
    mdx(MdxConfig, {
      configPath: path.resolve(projectRoot, 'app/lib/fumadocs/source.config.ts'),
      outDir: collectionsDirectory,
    }),
  ],
  test: {
    environment: 'node',
    include: ['*.test.ts', 'app/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['verbose'],
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/docs',
      provider: 'v8',
      include: ['app/**/*.{ts,tsx}'],
      exclude: ['app/**/*.{test,spec}.{ts,tsx}'],
    },
  },
});

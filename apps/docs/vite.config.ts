import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactRouter } from '@react-router/dev/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Vite loads the Fumadocs config before app aliases are active.
import * as MdxConfig from './app/lib/fumadocs/source.config.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the `#*` subpath imports of this app and of `@taucad/ui`.
 *
 * `nxViteTsPaths` covers the build and the test runner, but not Vite's dev SSR
 * environment, where these specifiers otherwise fail to resolve. Runs `pre` so
 * it answers before React Router's own resolvers.
 */
const createDocsSourceAliasPlugin = (): Plugin => {
  const appRoot = path.resolve(projectRoot, 'app');
  const designSystemRoot = path.resolve(projectRoot, '../../packages/ui/src');

  return {
    name: 'tau-docs-source-alias',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith('#')) {
        return null;
      }

      const [specifier, query] = source.split('?', 2);
      if (specifier === undefined || importer === undefined) {
        return null;
      }

      // `@taucad/ui` modules use the same `#` prefix for their own internals,
      // so the importer decides which source root the specifier belongs to.
      const resolvedImporter = path.resolve(importer);
      const insideDesignSystem = resolvedImporter.startsWith(`${designSystemRoot}${path.sep}`);
      if (!insideDesignSystem && !resolvedImporter.startsWith(`${projectRoot}${path.sep}`)) {
        return null;
      }

      const sourcePath = path.resolve(insideDesignSystem ? designSystemRoot : appRoot, specifier.slice(1));
      const candidates = [sourcePath];
      if (specifier.endsWith('.js')) {
        const base = sourcePath.slice(0, -'.js'.length);
        candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`);
      }

      const match = candidates.find((candidate) => existsSync(candidate));
      if (match === undefined) {
        return null;
      }

      return query === undefined ? match : `${match}?${query}`;
    },
  };
};
const isNxGraphCreation =
  (globalThis as typeof globalThis & { NX_GRAPH_CREATION?: boolean }).NX_GRAPH_CREATION === true;

export default defineConfig({
  root: projectRoot,
  cacheDir: '../../node_modules/.vite/apps/docs',
  plugins: [
    // Nx resolves every Vite config concurrently while creating the project graph.
    // React Router stores its app directory globally, so a second instance can make
    // the existing UI app discover this app's routes. The task process still loads it.
    createDocsSourceAliasPlugin(),
    ...(isNxGraphCreation ? [] : [reactRouter()]),
    tailwindcss(),
    nxViteTsPaths(),
    mdx(MdxConfig, {
      configPath: path.resolve(projectRoot, 'app/lib/fumadocs/source.config.ts'),
      outDir: path.resolve(projectRoot, '../../node_modules/.cache/fumadocs/apps/docs'),
    }),
  ],
  build: {
    target: 'es2022',
  },
  ssr: {
    external: ['fumadocs-mdx'],
  },
  server: {
    allowedHosts: true,
    port: 3002,
  },
});

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');
const artifactsRoot = resolve(repoRoot, 'docs/research/artifacts');

export const resolveCanvasRoot = (input = process.env['TAU_CANVAS_PATH'], allowedRoot = artifactsRoot): string => {
  if (!input) {
    throw new Error('Set TAU_CANVAS_PATH to a directory under docs/research/artifacts');
  }

  const candidate = realpathSync(isAbsolute(input) ? input : resolve(repoRoot, input));
  const pathFromArtifacts = relative(realpathSync(allowedRoot), candidate);
  if (pathFromArtifacts.startsWith('..') || isAbsolute(pathFromArtifacts)) {
    throw new Error('TAU_CANVAS_PATH must be under docs/research/artifacts');
  }
  for (const entry of ['index.html', 'main.tsx']) {
    if (!existsSync(resolve(candidate, entry))) {
      throw new Error(`Canvas is missing ${entry}`);
    }
  }
  return candidate;
};

const sharedStyles = resolve(import.meta.dirname, '../canvas/styles.css');

export const createCanvasConfig = (
  canvasRoot = resolveCanvasRoot(),
  outputRoot = resolve(repoRoot, 'out/research/canvas'),
  allowedRoot = artifactsRoot,
): UserConfig => {
  const root = resolveCanvasRoot(canvasRoot, allowedRoot);
  const appRoot = resolve(repoRoot, 'apps/ui/app');
  const uiRoot = resolve(repoRoot, 'packages/ui/src');
  const sourceRoots = [appRoot, realpathSync(allowedRoot)];
  const aliases = new Map<string, string>();
  const aliasesPath = resolve(root, 'canvas.aliases.json');
  if (existsSync(aliasesPath)) {
    const entries: unknown = JSON.parse(readFileSync(aliasesPath, 'utf8'));
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error('canvas.aliases.json must map app # imports to repository-relative fixture files');
    }
    for (const [specifier, target] of Object.entries(entries)) {
      if (!specifier.startsWith('#') || typeof target !== 'string' || isAbsolute(target)) {
        throw new Error('Canvas aliases require # imports and repository-relative fixture paths');
      }
      const fixture = realpathSync(resolve(repoRoot, target));
      if (!fixture.startsWith(`${repoRoot}${sep}`)) {
        throw new Error('Canvas fixture aliases must remain inside the Tau checkout');
      }
      aliases.set(specifier, fixture);
    }
  }
  const styleSources = new Set([
    root,
    ...(aliases.size > 0 ? [appRoot, ...Array.from(aliases.values(), dirname)] : []),
  ]);
  return defineConfig({
    root,
    base: './',
    publicDir: false,
    resolve: {
      alias: {
        '@taucad/ui': resolve(repoRoot, 'packages/ui/src'),
        react: resolve(repoRoot, 'scripts/node_modules/react'),
        'react-dom': resolve(repoRoot, 'packages/ui/node_modules/react-dom'),
      },
    },
    plugins: [
      {
        name: 'tau-canvas-styles',
        enforce: 'pre',
        resolveId: (source, importer) => {
          if (source === 'package.json' && importer?.startsWith(`${appRoot}${sep}`)) {
            return resolve(appRoot, '../package.json');
          }
          if (!source.startsWith('#') || !importer) {
            return undefined;
          }
          // @taucad/ui's own `#*.js` subpath imports map to `./src/*.ts`; its components are `.tsx`.
          if (importer.startsWith(`${uiRoot}${sep}`)) {
            const candidate = resolve(uiRoot, source.slice(1).replace(/\.js$/, ''));
            return ['.ts', '.tsx'].map((extension) => `${candidate}${extension}`).find((path) => existsSync(path));
          }
          if (!sourceRoots.some((directory) => importer.startsWith(`${directory}${sep}`))) {
            return undefined;
          }
          const fixture = aliases.get(source);
          if (fixture) {
            return fixture;
          }
          // Asset imports such as `sprite.svg?raw` keep their query for Vite's asset plugins.
          const [specifier = '', query] = source.split('?');
          const candidate = resolve(appRoot, specifier.slice(1).replace(/\.js$/, ''));
          if (!candidate.startsWith(`${appRoot}${sep}`)) {
            return undefined;
          }
          const found = ['', '.tsx', '.ts']
            .map((extension) => `${candidate}${extension}`)
            .find((path) => existsSync(path));
          return found !== undefined && query !== undefined ? `${found}?${query}` : found;
        },
        transform: {
          order: 'pre',
          handler: (code, id) => {
            if (id.split('?')[0] === sharedStyles) {
              return `${code}\n${Array.from(styleSources, (directory) => `@source ${JSON.stringify(directory)};`).join('\n')}`;
            }
            return undefined;
          },
        },
        transformIndexHtml: {
          order: 'pre',
          handler: () => [
            {
              tag: 'link',
              attrs: { rel: 'stylesheet', href: `/@fs/${sharedStyles}` },
              injectTo: 'head-prepend',
            },
          ],
        },
      },
      tailwindcss(),
    ],
    server: {
      host: '127.0.0.1',
      strictPort: true,
      fs: { allow: [repoRoot, root] },
    },
    build: {
      outDir: resolve(outputRoot, relative(realpathSync(allowedRoot), root)),
      emptyOutDir: true,
    },
  });
};

const canvasConfig = (): UserConfig => createCanvasConfig();

export default canvasConfig;

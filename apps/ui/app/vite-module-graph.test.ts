// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line no-restricted-imports -- this test exercises the application-owned Vite plugin directly.
import { createUiSourceAliasPlugin } from '../vite.config.js';

const roots: string[] = [];
const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(import.meta.dirname, '../../..');

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('desktop module graph', () => {
  it('should retain rendered module and asset provenance when output names are hashed', async () => {
    const cacheRoot = path.resolve('node_modules/.cache/tau-ui-module-graph');
    await mkdir(cacheRoot, { recursive: true });
    const root = await mkdtemp(path.join(cacheRoot, 'fixture-'));
    roots.push(root);
    await writeFile(
      path.join(root, 'entry.js'),
      "import 'virtual:allowed-wasm-assets'; void import('./wrapper.js').then(({ value }) => value);\n",
    );
    await writeFile(path.join(root, 'wrapper.js'), "export { value } from './implementation.js';\n");
    await writeFile(path.join(root, 'implementation.js'), "export const value = 'retained';\n");
    await writeFile(path.join(root, 'server-entry.js'), "export const server = 'retained';\n");
    await writeFile(path.join(root, 'index.html'), '<script type="module" src="/entry.js"></script>\n');
    const sourceAliasPlugin = createUiSourceAliasPlugin({ emitModuleGraph: true });

    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [
        {
          name: 'allowed-wasm-assets',
          resolveId(id) {
            return id === 'virtual:allowed-wasm-assets' ? `\0${id}` : null;
          },
          load(id) {
            return id === '\0virtual:allowed-wasm-assets'
              ? "import kcl from '@taucad/kcl-wasm-lib/kcl.wasm?url'; import clipper from 'clipper2-wasm/dist/es/clipper2z.wasm?url'; document.body.dataset.assets = kcl + ',' + clipper;"
              : null;
          },
        },
        {
          name: 'late-css-proxy-cleanup-fixture',
          async writeBundle(outputOptions, bundle) {
            if (outputOptions.dir === undefined) {
              throw new Error('Expected directory output');
            }
            const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
            const wrapper = chunks.find((chunk) => chunk.facadeModuleId?.endsWith('/wrapper.js'));
            const implementation = chunks.find((chunk) => chunk.name === 'implementation');
            if (wrapper === undefined || implementation === undefined) {
              throw new Error('Expected wrapper and implementation chunks');
            }
            await writeFile(path.resolve(outputOptions.dir, wrapper.fileName), '/* empty css */\n');
            await rm(path.resolve(outputOptions.dir, implementation.fileName));
          },
        },
        sourceAliasPlugin,
      ],
      build: {
        assetsInlineLimit: 0,
        rollupOptions: {
          output: {
            assetFileNames: 'assets/[name]-[hash][extname]',
            manualChunks(id) {
              return id.endsWith('/implementation.js') ? 'implementation' : undefined;
            },
          },
        },
      },
    });

    const files = await readdir(path.join(root, 'dist', 'assets'));
    const manifestName = files.find((file) => /^tau-module-graph-[\w-]+\.json$/u.test(file));
    expect(manifestName).toBeDefined();
    const manifest = JSON.parse(await readFile(path.join(root, 'dist', 'assets', manifestName ?? ''), 'utf8')) as {
      assets: Array<{ fileName: string; sourcePath: string; sha256: string }>;
      chunks: Array<{ fileName: string; moduleIds: string[]; imports: string[]; forwardingOnly: boolean }>;
    };
    expect(
      manifest.chunks.some((chunk) =>
        chunk.moduleIds.some((moduleId) => moduleId.includes('virtual:allowed-wasm-assets')),
      ),
    ).toBe(true);
    expect(manifest.chunks.some((chunk) => chunk.moduleIds.some((moduleId) => moduleId.endsWith('/wrapper.js')))).toBe(
      true,
    );
    expect(manifest.chunks.every((chunk) => chunk.moduleIds.length > 0)).toBe(true);
    const wrapperChunk = manifest.chunks.find((chunk) =>
      chunk.moduleIds.some((moduleId) => moduleId.endsWith('/wrapper.js')),
    );
    expect(wrapperChunk?.forwardingOnly).toBe(true);
    expect(wrapperChunk?.imports).toHaveLength(0);
    expect(manifest.chunks.some((chunk) => chunk.fileName.includes('implementation'))).toBe(false);
    for (const chunk of manifest.chunks) {
      expect(files).toContain(path.basename(chunk.fileName));
    }
    expect(manifest.assets).toHaveLength(2);
    const approvedAssets = await Promise.all(
      ['@taucad/kcl-wasm-lib/kcl.wasm', 'clipper2-wasm/dist/es/clipper2z.wasm'].map(async (specifier) => {
        const sourcePath = await realpath(require.resolve(specifier));
        const sourceHash = createHash('sha256')
          .update(await readFile(sourcePath))
          .digest('hex');
        return { sourceHash, sourcePath };
      }),
    );
    const emittedAssets = await Promise.all(
      manifest.assets.map(async (candidate) => ({
        candidate,
        resolvedPath: await realpath(path.resolve(workspaceRoot, candidate.sourcePath)),
      })),
    );
    for (const { sourceHash, sourcePath } of approvedAssets) {
      const asset = emittedAssets.find((candidate) => candidate.resolvedPath === sourcePath)?.candidate;
      expect(asset, JSON.stringify(manifest.assets)).toBeDefined();
      expect(asset?.fileName.endsWith('.wasm')).toBe(true);
      expect(asset?.sha256).toBe(sourceHash);
    }

    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [sourceAliasPlugin],
      build: {
        outDir: 'server',
        ssr: path.join(root, 'server-entry.js'),
      },
    });
    const serverFiles = await readdir(path.join(root, 'server'));
    expect(serverFiles.some((file) => file.startsWith('tau-module-graph-'))).toBe(false);
  });
});

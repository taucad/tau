import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { definePlugin, deriveImportExtensions } from '@taucad/runtime/plugin';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { createCliRuntime } from '#cli-runtime.js';
import type { CliRuntimeOptions, DefaultInvocablePluginFactory } from '#cli-runtime.js';

/*
 * Plugin/capability order is the CLI's kernel-selection precedence. The ids come from the
 * plugin packages themselves (`defineKernel({ id })`) — this test pins the composition, not
 * the format tables, which the CLI must never restate.
 */
const builtInKernelIds = [
  'replicad',
  'opencascade',
  'openrscad',
  'jscad',
  'manifold',
  'picovoxel',
  'gltf',
  'brep',
  'rhino',
  'assimp',
];

const composeCli = async (options: CliRuntimeOptions = {}) =>
  resolveRuntimeDefinition(await createCliRuntime(options), undefined);

const taucadImports = (source: string): string[] =>
  ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter((specifier) => specifier.startsWith('@taucad/'))
    .map((specifier) => specifier.split('/').slice(0, 2).join('/'));

const novelPlugin = definePlugin({
  meta: { name: '@example/novel' },
  kernels: { novel: () => ({ id: 'novel', extensions: ['novel'] }) },
  presets: { default: ['kernels.novel'] },
});

const configuredReplicad = definePlugin({
  meta: { name: '@taucad/replicad' },
  kernels: { configured: () => ({ id: 'configured-replicad', extensions: ['configured'] }) },
  presets: { default: ['kernels.configured'] },
});

const requiresOptions = definePlugin({
  meta: { name: '@example/requires-options' },
  kernels: {
    configured: (options: { readonly endpoint: string }) => ({
      id: options.endpoint,
      extensions: ['required'],
    }),
  },
  presets: { default: ['kernels.configured'] },
});

describe('createCliRuntime', () => {
  it('keeps the built-in plugin roster equal to production package dependencies', async () => {
    const sourceUrl = new URL('cli-runtime.ts', import.meta.url);
    const manifestUrl = new URL('../package.json', import.meta.url);
    const [source, manifestSource] = await Promise.all([readFile(sourceUrl, 'utf8'), readFile(manifestUrl, 'utf8')]);
    const manifest = JSON.parse(manifestSource) as { dependencies?: Record<string, string> };
    const expected = Object.keys(manifest.dependencies ?? {}).filter(
      (name) => name.startsWith('@taucad/') && name !== '@taucad/runtime',
    );
    const actual = taucadImports(source).filter((name) => name !== '@taucad/runtime');

    expect(actual.toSorted()).toEqual(expected.toSorted());
  });

  it('composes every built-in plugin in declared order', async () => {
    const runtime = await composeCli();

    expect(runtime.kernels.map(({ id }) => id)).toEqual(builtInKernelIds);
    expect(runtime.bundlers.map(({ id }) => id)).toEqual(['esbuild']);
    expect(runtime.middleware.length).toBeGreaterThan(0);
    expect(runtime.transcoders.map(({ id }) => id)).toEqual(['gltf', 'assimp', 'image', 'svg-image']);
  });

  it('registers the assimp import kernel through the pinned "all" preset', async () => {
    const runtime = await composeCli();
    const extensions = deriveImportExtensions(runtime);

    expect(extensions).toContain('ts');
    expect(extensions).toContain('obj');
  });

  it('pins the built-in PicoVoxel kernel to pthread WASM', async () => {
    const runtime = await composeCli();

    expect(runtime.kernels.find(({ id }) => id === 'picovoxel')?.options).toEqual({ wasm: 'multi' });
  });

  it('rejects an explicit plugin that duplicates a built-in', async () => {
    const { gltf } = await import('@taucad/gltf');

    await expect(composeCli({ explicitFactories: [gltf] })).rejects.toThrow(
      'Tau plugin "@taucad/gltf" from --plugin collides with a built-in. Use --config',
    );
  });

  it('appends a novel explicit plugin after the built-ins', async () => {
    const runtime = await composeCli({ explicitFactories: [novelPlugin] });

    expect(runtime.kernels.map(({ id }) => id)).toEqual([...builtInKernelIds, 'novel']);
  });

  it('replaces a configured built-in in place', async () => {
    const runtime = await composeCli({ configuredPlugins: [configuredReplicad()] });

    expect(runtime.kernels.map(({ id }) => id)).toEqual(['configured-replicad', ...builtInKernelIds.slice(1)]);
  });

  it('appends a configured novel plugin after the built-ins', async () => {
    const runtime = await composeCli({ configuredPlugins: [novelPlugin()] });

    expect(runtime.kernels.map(({ id }) => id)).toEqual([...builtInKernelIds, 'novel']);
  });

  it('explains that --plugin invokes factories with defaults', async () => {
    await expect(
      composeCli({ explicitFactories: [requiresOptions as unknown as DefaultInvocablePluginFactory] }),
    ).rejects.toThrow('Tau plugin "@example/requires-options" could not be invoked with defaults for --plugin');
  });

  /*
   * The CLI must never restate format knowledge the plugin packages own; the forbidden
   * literals are derived from the composed runtime rather than listed here, so this guard
   * grows with the plugins instead of drifting from them.
   */
  it('restates no plugin-owned extension literal in CLI source', async () => {
    const runtime = await composeCli();
    const extensions = deriveImportExtensions(runtime);
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const entries = await readdir(sourceDirectory, { recursive: true, withFileTypes: true });
    const sources = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test'),
    );

    const offenders: string[] = [];
    await Promise.all(
      sources.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        const content = await readFile(path, 'utf8');
        for (const extension of extensions) {
          if (content.includes(`'${extension}'`)) {
            offenders.push(`${entry.name}: '${extension}'`);
          }
        }
      }),
    );

    expect(offenders).toEqual([]);
  });
});

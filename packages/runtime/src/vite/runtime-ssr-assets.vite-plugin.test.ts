import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeAssetsPlugin } from '#vite/runtime-ssr-assets.vite-plugin.js';

const temporaryDirectories: string[] = [];
const importer = fileURLToPath(import.meta.url);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type TransformContext = {
  addWatchFile: ReturnType<typeof vi.fn>;
  emitFile: ReturnType<typeof vi.fn>;
  resolve: ReturnType<typeof vi.fn>;
};

const configure = async (
  plugin: Plugin,
  { ssr, command = 'build' }: { readonly ssr: boolean; readonly command?: 'build' | 'serve' },
  context: TransformContext,
): Promise<void> => {
  type ConfigResolvedHook = (config: ResolvedConfig) => void;
  (plugin.configResolved as ConfigResolvedHook)({ build: { ssr }, command } as ResolvedConfig);
  type BuildStartHook = (this: TransformContext) => void | Promise<void>;
  await (plugin.buildStart as unknown as BuildStartHook).call(context);
};

const transform = async ({
  plugin,
  code,
  id,
  context,
}: {
  plugin: Plugin;
  code: string;
  id: string;
  context: TransformContext;
}) => {
  type TransformHook = (
    this: TransformContext,
    code: string,
    id: string,
  ) => { code: string } | undefined | Promise<{ code: string } | undefined>;
  const hook = plugin.transform as unknown as { handler: TransformHook };
  return hook.handler.call(context, code, id);
};

const createContext = (): TransformContext => ({
  addWatchFile: vi.fn(),
  emitFile: vi.fn().mockReturnValue('asset-ref'),
  resolve: vi.fn().mockResolvedValue(undefined),
});

describe('runtimeAssetsPlugin', () => {
  it('should expose the internal runtime asset behavior', () => {
    const plugin = runtimeAssetsPlugin();

    expect(plugin.name).toBe('taucad-runtime:assets');
    expect(plugin.apply).toBeUndefined();
    expect(plugin.enforce).toBe('pre');
    expect(plugin.config).toBeTypeOf('function');
    expect(plugin.transform).toMatchObject({ filter: { code: 'import.meta' } });
  });

  it('should emit existing package assets once and preserve URL value shapes', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    context.emitFile.mockReturnValueOnce('font-ref').mockReturnValueOnce('wasm-ref');
    await configure(plugin, { ssr: true }, context);

    const code = [
      `const license = new URL('../../LICENSE', import.meta.url);`,
      `const manifest = new URL('../../package.json', import.meta.url).href;`,
      `const duplicate = new URL('../../package.json', import.meta.url).href;`,
    ].join('\n');
    const result = await transform({ plugin, code, id: importer, context });

    expect(context.emitFile).toHaveBeenCalledTimes(2);
    expect(context.addWatchFile).toHaveBeenCalledTimes(3);
    expect(result?.code).toContain('new URL(import.meta.ROLLUP_FILE_URL_font-ref)');
    expect(result?.code).toContain('import.meta.ROLLUP_FILE_URL_wasm-ref');
  });

  it('should emit exported package assets in client builds', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    await configure(plugin, { ssr: false }, context);

    const result = await transform({
      plugin,
      code: 'const wasm = new URL(import.meta.resolve(`manifold-3d/manifold.wasm`)).href;',
      id: importer,
      context,
    });

    expect(context.emitFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'manifold.wasm', type: 'asset' }));
    expect(result?.code).toContain('import.meta.ROLLUP_FILE_URL_asset-ref');
  });

  it('should serve exported package assets through Vite without copying them', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    await configure(plugin, { ssr: false, command: 'serve' }, context);

    const result = await transform({
      plugin,
      code: `const wasm = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;`,
      id: importer,
      context,
    });

    expect(result?.code).toContain('new URL("/@fs//');
    expect(result?.code).toContain('manifold.wasm');
    expect(context.emitFile).not.toHaveBeenCalled();
  });

  it('should emit every non-TypeScript asset class', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    await configure(plugin, { ssr: true }, context);

    const code = [
      `new URL('../../package.json', import.meta.url);`,
      `new URL('../../LICENSE', import.meta.url);`,
      `new URL('../../tsconfig.json', import.meta.url);`,
    ].join('\n');
    await transform({ plugin, code, id: importer, context });

    expect(context.emitFile.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual([
      'package.json',
      'LICENSE',
      'tsconfig.json',
    ]);
  });

  it('should emit assets owned by a consumer module', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    const fixtureDirectory = mkdtempSync(path.resolve(tmpdir(), 'tau-runtime-consumer-assets-'));
    temporaryDirectories.push(fixtureDirectory);
    const entry = path.join(fixtureDirectory, 'entry.mjs');
    writeFileSync(path.join(fixtureDirectory, 'fixture.wasm'), 'fixture');
    await configure(plugin, { ssr: true }, context);

    await transform({ plugin, code: `new URL('./fixture.wasm', import.meta.url)`, id: entry, context });

    expect(context.emitFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'fixture.wasm', type: 'asset' }));
  });

  it('should ignore client builds and TypeScript targets', async () => {
    const clientPlugin = runtimeAssetsPlugin();
    const clientContext = createContext();
    await configure(clientPlugin, { ssr: false }, clientContext);
    expect(
      await transform({
        plugin: clientPlugin,
        code: `new URL('../../package.json', import.meta.url);`,
        id: importer,
        context: clientContext,
      }),
    ).toBeUndefined();

    const ssrPlugin = runtimeAssetsPlugin();
    const ssrContext = createContext();
    await configure(ssrPlugin, { ssr: true }, ssrContext);
    expect(
      await transform({
        plugin: ssrPlugin,
        code: `new URL('./runtime-invariants.ts', import.meta.url);`,
        id: importer,
        context: ssrContext,
      }),
    ).toBeUndefined();
    expect(ssrContext.emitFile).not.toHaveBeenCalled();
  });

  it('should ignore prose, non-literals, external URLs, directories, and missing targets', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    await configure(plugin, { ssr: true }, context);
    const code = [
      `/* new URL('../../package.json', import.meta.url) */`,
      `const prose = "new URL('../../package.json', import.meta.url)";`,
      `new URL(assetPath, import.meta.url);`,
      `new URL('https://example.com/asset.wasm', import.meta.url);`,
      `new URL('file:///tmp/asset.wasm', import.meta.url);`,
      `new URL('data:application/wasm;base64,AA==', import.meta.url);`,
      `new URL('./', import.meta.url);`,
      `new URL('./missing.wasm', import.meta.url);`,
    ].join('\n');

    expect(await transform({ plugin, code, id: importer, context })).toBeUndefined();
    expect(context.emitFile).not.toHaveBeenCalled();
  });

  it('should bound literal stripping for large generated sources while retaining a real asset edge', async () => {
    const plugin = runtimeAssetsPlugin();
    const context = createContext();
    await configure(plugin, { ssr: true }, context);
    const code = [
      `const embedded = "${'a'.repeat(1024 * 1024)}";`,
      `const asset = new URL('../../package.json', import.meta.url).href;`,
    ].join('\n');

    const result = await transform({ plugin, code, id: importer, context });

    expect(context.emitFile).toHaveBeenCalledOnce();
    expect(result?.code).toContain('import.meta.ROLLUP_FILE_URL_asset-ref');
  });

  it('should emit a real consumer-owned WASM asset in a Vite SSR build', async () => {
    const fixtureDirectory = mkdtempSync(path.resolve(tmpdir(), 'tau-runtime-ssr-assets-'));
    const outputDirectory = path.join(fixtureDirectory, 'dist');
    temporaryDirectories.push(fixtureDirectory);
    const entry = path.join(fixtureDirectory, 'entry.mjs');
    writeFileSync(entry, `export const asset = new URL('./fixture.wasm', import.meta.url).href;`);
    writeFileSync(path.join(fixtureDirectory, 'fixture.wasm'), 'fixture');

    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [runtimeAssetsPlugin()],
      build: { ssr: entry, outDir: outputDirectory },
    });

    const emitted = readdirSync(outputDirectory, { recursive: true }).map(String);
    expect(emitted.some((file) => /fixture-[\w-]+\.wasm$/.test(file))).toBe(true);
  });

  it('should emit a real exported dependency WASM asset in a Vite client build', async () => {
    const fixtureDirectory = mkdtempSync(path.join(path.dirname(importer), '.tau-runtime-client-assets-'));
    const outputDirectory = path.join(fixtureDirectory, 'dist');
    temporaryDirectories.push(fixtureDirectory);
    const entry = path.join(fixtureDirectory, 'entry.mjs');
    writeFileSync(entry, `export const asset = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;`);

    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [runtimeAssetsPlugin()],
      build: { lib: { entry, formats: ['es'] }, outDir: outputDirectory },
    });

    const emitted = readdirSync(outputDirectory, { recursive: true }).map(String);
    expect(emitted.some((file) => /manifold(?:-[\w-]+)?\.wasm$/.test(file))).toBe(true);
  });

  it('should emit a real exported dependency WASM asset from a Vite worker build', async () => {
    const fixtureDirectory = mkdtempSync(path.join(path.dirname(importer), '.tau-runtime-worker-assets-'));
    const outputDirectory = path.join(fixtureDirectory, 'dist');
    temporaryDirectories.push(fixtureDirectory);
    const entry = path.join(fixtureDirectory, 'entry.mjs');
    writeFileSync(entry, `new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });`);
    writeFileSync(
      path.join(fixtureDirectory, 'worker.mjs'),
      `globalThis.asset = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;`,
    );

    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [runtimeAssetsPlugin()],
      worker: { format: 'es', plugins: () => [runtimeAssetsPlugin()] },
      build: { lib: { entry, formats: ['es'] }, outDir: outputDirectory },
    });

    const emitted = readdirSync(outputDirectory, { recursive: true }).map(String);
    expect(emitted.some((file) => /manifold(?:-[\w-]+)?\.wasm$/.test(file))).toBe(true);
  });
});

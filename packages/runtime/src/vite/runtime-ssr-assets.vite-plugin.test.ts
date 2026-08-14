import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeSsrAssetsPlugin } from '#vite/runtime-ssr-assets.vite-plugin.js';

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

const configure = async (plugin: Plugin, ssr: boolean, context: TransformContext): Promise<void> => {
  type ConfigResolvedHook = (config: ResolvedConfig) => void;
  (plugin.configResolved as ConfigResolvedHook)({ build: { ssr } } as ResolvedConfig);
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

describe('runtimeSsrAssetsPlugin', () => {
  it('should expose only the internal SSR build behavior', () => {
    const plugin = runtimeSsrAssetsPlugin();

    expect(plugin.name).toBe('taucad-runtime:ssr-assets');
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
    expect(plugin.config).toBeTypeOf('function');
    expect(plugin.transform).toMatchObject({ filter: { code: 'import.meta.url' } });
  });

  it('should emit existing runtime-owned assets once and preserve URL value shapes', async () => {
    const plugin = runtimeSsrAssetsPlugin();
    const context = createContext();
    context.emitFile.mockReturnValueOnce('font-ref').mockReturnValueOnce('wasm-ref');
    await configure(plugin, true, context);

    const code = [
      `const font = new URL('../kernels/replicad/fonts/Geist-Regular.ttf', import.meta.url);`,
      `const wasm = new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url).href;`,
      `const duplicate = new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url).href;`,
    ].join('\n');
    const result = await transform({ plugin, code, id: importer, context });

    expect(context.emitFile).toHaveBeenCalledTimes(2);
    expect(context.addWatchFile).toHaveBeenCalledTimes(2);
    expect(result?.code).toContain('new URL(import.meta.ROLLUP_FILE_URL_font-ref)');
    expect(result?.code).toContain('import.meta.ROLLUP_FILE_URL_wasm-ref');
  });

  it('should emit WASM, font, and source-map asset classes', async () => {
    const plugin = runtimeSsrAssetsPlugin();
    const context = createContext();
    await configure(plugin, true, context);

    const code = [
      `new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url);`,
      `new URL('../kernels/replicad/fonts/Geist-Regular.ttf', import.meta.url);`,
      `new URL('../kernels/replicad/sourcemaps/replicad.js.map', import.meta.url);`,
    ].join('\n');
    await transform({ plugin, code, id: importer, context });

    expect(context.emitFile.mock.calls.map((call) => (call[0] as { name: string }).name)).toEqual([
      'replicad_single.wasm',
      'Geist-Regular.ttf',
      'replicad.js.map',
    ]);
  });

  it('should ignore client builds, TypeScript targets, and application-owned modules', async () => {
    const clientPlugin = runtimeSsrAssetsPlugin();
    const clientContext = createContext();
    await configure(clientPlugin, false, clientContext);
    expect(
      await transform({
        plugin: clientPlugin,
        code: `new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url);`,
        id: importer,
        context: clientContext,
      }),
    ).toBeUndefined();

    const ssrPlugin = runtimeSsrAssetsPlugin();
    const ssrContext = createContext();
    await configure(ssrPlugin, true, ssrContext);
    expect(
      await transform({
        plugin: ssrPlugin,
        code: `new URL('./runtime-invariants.ts', import.meta.url);`,
        id: importer,
        context: ssrContext,
      }),
    ).toBeUndefined();
    expect(
      await transform({
        plugin: ssrPlugin,
        code: `new URL('./private.key', import.meta.url);`,
        id: '/tmp/application/entry.ts',
        context: ssrContext,
      }),
    ).toBeUndefined();
    expect(ssrContext.emitFile).not.toHaveBeenCalled();
  });

  it('should ignore prose, non-literals, external URLs, directories, and missing targets', async () => {
    const plugin = runtimeSsrAssetsPlugin();
    const context = createContext();
    await configure(plugin, true, context);
    const code = [
      `/* new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url) */`,
      `const prose = "new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url)";`,
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
    const plugin = runtimeSsrAssetsPlugin();
    const context = createContext();
    await configure(plugin, true, context);
    const code = [
      `const embedded = "${'a'.repeat(1024 * 1024)}";`,
      `const asset = new URL('../kernels/replicad/wasm/replicad_single.wasm', import.meta.url).href;`,
    ].join('\n');

    const result = await transform({ plugin, code, id: importer, context });

    expect(context.emitFile).toHaveBeenCalledOnce();
    expect(result?.code).toContain('import.meta.ROLLUP_FILE_URL_asset-ref');
  });

  it('should tolerate optional runtime asset packages that cannot be resolved', async () => {
    const plugin = runtimeSsrAssetsPlugin();
    const context = createContext();

    await expect(configure(plugin, true, context)).resolves.toBeUndefined();
    expect(context.resolve).toHaveBeenCalled();
  });

  it('should emit a real runtime WASM asset in a Vite SSR build', async () => {
    const outputDirectory = mkdtempSync(path.resolve(tmpdir(), 'tau-runtime-ssr-assets-'));
    temporaryDirectories.push(outputDirectory);
    const entry = fileURLToPath(new URL('../kernels/replicad/replicad.kernel.ts', import.meta.url));

    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [runtimeSsrAssetsPlugin()],
      build: { ssr: entry, outDir: outputDirectory },
    });

    const emitted = readdirSync(outputDirectory, { recursive: true }).map(String);
    expect(emitted.some((file) => /replicad_single-[\w-]+\.wasm$/.test(file))).toBe(true);
  });
});

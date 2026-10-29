import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPicogkBrowserAssets } from '#picogk-browser-assets.js';

const resource = (path: string) => ({ path, sha256: 'a'.repeat(64), byteLength: 4 });
const variant = () => ({
  archiveInputReceipt: 'c'.repeat(64),
  bootstrap: '_framework/dotnet.js',
  compilerIdentity: 'b'.repeat(64),
  runtimeFiles: [resource('_framework/dotnet.js')],
  references: [resource('refs/PicoGK.dll')],
});
const manifest = () => ({
  format: 'tau-picogk-browser-v2',
  protocolVersion: 9,
  toolchain: {
    sdk: '11.0.100-rc.3.26522.148',
    workload: '11.0.100-rc.3.26524.4',
    emscriptenPackage: '6.0.2',
    emscriptenCompiler: '6.0.3',
    emscriptenRevision: '6ea9c28c38cdd40c1032fa04400c9d16230ee180',
  },
  single: variant(),
});
const setup = (value: unknown = manifest()) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(bytes));
  vi.stubGlobal('fetch', fetcher);
  return {
    fetcher,
    options: {
      manifest: {
        url: 'https://example.test/bundle/manifest.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      wasm: 'auto',
      isolated: false,
      signal: new AbortController().signal,
    } satisfies Parameters<typeof loadPicogkBrowserAssets>[0],
  };
};
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PicoGK browser bundle admission', () => {
  it('should pin the manifest bytes and resolve its runtime and reference URLs', async () => {
    const { fetcher, options } = setup();
    const result = await loadPicogkBrowserAssets(options);
    expect(result.mode).toBe('single');
    expect(result.assets.bootstrapUrl).toBe('https://example.test/bundle/_framework/dotnet.js');
    expect(result.assets.runtimeFiles[0]!.url).toBe(result.assets.bootstrapUrl);
    expect(result.assets.references[0]!.url).toBe('https://example.test/bundle/refs/PicoGK.dll');
    expect(result.assets.compilerIdentity).toBe('b'.repeat(64));
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(options.manifest.url, {
      signal: options.signal,
      redirect: 'error',
    });
  });
  it('should select an available isolated multi mode and respect an explicit single mode', async () => {
    const { options } = setup({ ...manifest(), multi: variant() });
    await expect(loadPicogkBrowserAssets({ ...options, isolated: true })).resolves.toMatchObject({ mode: 'multi' });
    await expect(loadPicogkBrowserAssets({ ...options, isolated: true, wasm: 'single' })).resolves.toMatchObject({
      mode: 'single',
    });
    await expect(loadPicogkBrowserAssets(options)).resolves.toMatchObject({ mode: 'single' });
    const serial = setup();
    await expect(loadPicogkBrowserAssets({ ...serial.options, isolated: true })).resolves.toMatchObject({
      mode: 'single',
    });
  });
  it('should refuse requested multi execution without isolation or a matching bundle', async () => {
    const { options } = setup();
    await expect(loadPicogkBrowserAssets({ ...options, wasm: 'multi' })).rejects.toThrow('cross-origin isolation');
    await expect(loadPicogkBrowserAssets({ ...options, wasm: 'multi', isolated: true })).rejects.toThrow(
      'requested execution mode',
    );
  });
  it.each([
    'file:///manifest.json',
    'https://user:pass@example.test/manifest.json',
    'https://example.test/manifest.json#hash',
  ])('should reject an unsafe manifest URL %s', async (url) => {
    const { fetcher, options } = setup();
    await expect(loadPicogkBrowserAssets({ ...options, manifest: { ...options.manifest, url } })).rejects.toThrow(
      'Invalid PicoGK browser manifest URL',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('should reject HTTP failure and modified manifest bytes', async () => {
    const { fetcher, options } = setup();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(loadPicogkBrowserAssets(options)).rejects.toThrow('download failed: 404');
    await expect(
      loadPicogkBrowserAssets({ ...options, manifest: { ...options.manifest, sha256: '0'.repeat(64) } }),
    ).rejects.toThrow('integrity mismatch');
  });
  it('should reject a mismatched protocol or unmatched compiler even when its document hash matches', async () => {
    const protocol = setup({ ...manifest(), protocolVersion: 8 });
    await expect(loadPicogkBrowserAssets(protocol.options)).rejects.toThrow('expected 9');
    const value = manifest();
    value.toolchain.emscriptenCompiler = '6.0.13';
    const compiler = setup(value);
    await expect(loadPicogkBrowserAssets(compiler.options)).rejects.toThrow('6.0.3');
  });
  it.each(['../outside.js', '/outside.js', '%2e%2e/outside.js', 'a//b.js', 'a/./b.js'])(
    'should reject resource traversal %s',
    async (path) => {
      const value = manifest();
      value.single.runtimeFiles = [resource(path)];
      const { options } = setup(value);
      await expect(loadPicogkBrowserAssets(options)).rejects.toThrow();
    },
  );
  it('should reject case-colliding resources and an unlisted or non-JS bootstrap', async () => {
    const value = manifest();
    value.single.references.push(resource('REFS/PICOGK.DLL'));
    await expect(loadPicogkBrowserAssets(setup(value).options)).rejects.toThrow('duplicate resource paths');
    value.single.references.pop();
    value.single.bootstrap = 'absent.js';
    await expect(loadPicogkBrowserAssets(setup(value).options)).rejects.toThrow('bootstrap module');
    value.single.bootstrap = 'runtime.wasm';
    value.single.runtimeFiles = [resource('runtime.wasm')];
    await expect(loadPicogkBrowserAssets(setup(value).options)).rejects.toThrow('bootstrap module');
  });
  it('should cancel before fetching and before returning a completed download', async () => {
    const { fetcher, options } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(loadPicogkBrowserAssets({ ...options, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
    const active = new AbortController();
    fetcher.mockImplementationOnce(async () => {
      active.abort();
      return new Response(JSON.stringify(manifest()));
    });
    await expect(loadPicogkBrowserAssets({ ...options, signal: active.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

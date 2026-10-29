import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePicogkBrowserRuntime } from '#picogk-browser-runtime.js';

const bootstrapUrl = 'https://example.test/_framework/dotnet.js';
const js = new TextEncoder().encode('export const base = import.meta.url;');
const wasm = new Uint8Array([0, 97, 115, 109]);
const file = (url: string, bytes: Uint8Array<ArrayBuffer>) => ({
  url,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.length,
});
const bootstrap = file(bootstrapUrl, js);
const binary = file('https://example.test/_framework/runtime.wasm', wasm);
const integrity = (bytes: Uint8Array<ArrayBuffer>) => `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
const setup = () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) => new Response(input === bootstrapUrl ? js : wasm));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PicoGK browser runtime integrity', () => {
  it('should execute verified module bytes with the original base URL and verify binary downloads', async () => {
    const fetcher = setup();
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (!(blob instanceof Blob)) {
        throw new Error('Expected module blob');
      }
      blobs.push(blob);
      return `blob:verified-${blobs.length}`;
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const loader = await preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap, binary] });
    expect(loader.bootstrapUrl).toBe('blob:verified-1');
    const bootstrapCode = await blobs[0]!.text();
    expect(bootstrapCode).toContain(`export const base = ${JSON.stringify(bootstrapUrl)};`);
    expect(bootstrapCode).toContain('super(import.meta.url, options)');
    expect(bootstrapCode).toContain(`requested !== ${JSON.stringify(bootstrapUrl)}`);
    expect(bootstrapCode).toContain('Unlisted PicoGK runtime worker bootstrap.');
    expect(loader.loadResource('dotnetjs', 'dotnet.js', bootstrapUrl, integrity(js))).toBe(loader.bootstrapUrl);
    const response = await loader.loadResource('dotnetwasm', 'runtime.wasm', './runtime.wasm', integrity(wasm));
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error('Expected verified response');
    }
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wasm);
    expect(response.headers.get('Content-Type')).toBe('application/wasm');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(binary.url, { redirect: 'error' });
    loader.dispose();
    loader.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:verified-1');
    expect((): string | Promise<Response> => loader.loadResource('dotnetwasm', 'runtime.wasm', binary.url, '')).toThrow(
      'loader is closed',
    );
  });

  it('should hand every worker destination the already-verified blob and refuse any other script', async () => {
    setup();
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (!(blob instanceof Blob)) {
        throw new Error('Expected module blob');
      }
      blobs.push(blob);
      return `blob:verified-${blobs.length}`;
    });
    await preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap, binary] });
    // The guard is injected code, so proving it means running it: a worker destination is the one
    // place the runtime would otherwise fetch the bootstrap again, unverified.
    const spawned: { script: unknown; type: unknown }[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor(script: unknown, options?: { type?: string }) {
          spawned.push({ script, type: options?.type });
        }
      },
    );
    const evaluated = `data:text/javascript;base64,${Buffer.from(await blobs[0]!.text()).toString('base64')}`;
    await import(/* @vite-ignore */ evaluated);
    const Guarded = globalThis.Worker;
    new Guarded(bootstrapUrl, { type: 'module' });
    new Guarded('./dotnet.js', { type: 'module' });
    new Guarded(evaluated, { type: 'module' });
    expect(spawned).toEqual([
      { script: evaluated, type: 'module' },
      { script: evaluated, type: 'module' },
      { script: evaluated, type: 'module' },
    ]);
    expect(() => new Guarded('https://example.test/_framework/other.js', { type: 'module' })).toThrow(
      'Unlisted PicoGK runtime worker bootstrap.',
    );
    expect(() => new Guarded('https://elsewhere.test/dotnet.js', { type: 'module' })).toThrow(
      'Unlisted PicoGK runtime worker bootstrap.',
    );
    expect(spawned).toHaveLength(3);
  });

  it.each([
    { ...bootstrap, url: 'file:///dotnet.js' },
    { ...bootstrap, url: 'https://user:pass@example.test/dotnet.js' },
    { ...bootstrap, url: bootstrapUrl + '#fragment' },
    { ...bootstrap, sha256: 'bad' },
    { ...bootstrap, byteLength: -1 },
    { ...bootstrap, byteLength: 0.5 },
  ])('should reject an invalid resource inventory $url', async (invalid) => {
    const fetcher = setup();
    await expect(preparePicogkBrowserRuntime({ bootstrapUrl, files: [invalid] })).rejects.toThrow(
      'Invalid PicoGK runtime resource inventory',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should reject duplicate resources and missing or non-module bootstraps before downloading', async () => {
    const fetcher = setup();
    await expect(preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap, bootstrap] })).rejects.toThrow(
      'Invalid PicoGK runtime resource inventory',
    );
    await expect(preparePicogkBrowserRuntime({ bootstrapUrl, files: [] })).rejects.toThrow('bootstrap is absent');
    await expect(preparePicogkBrowserRuntime({ bootstrapUrl: binary.url, files: [binary] })).rejects.toThrow(
      'bootstrap is absent',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should reject altered executable bytes and release earlier verified module blobs', async () => {
    const fetcher = setup();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verified');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    fetcher.mockResolvedValueOnce(new Response(js)).mockResolvedValueOnce(new Response(wasm));
    await expect(
      preparePicogkBrowserRuntime({
        bootstrapUrl,
        files: [bootstrap, { ...bootstrap, url: 'https://example.test/other.js' }],
      }),
    ).rejects.toThrow('integrity mismatch');
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:verified');
  });

  it('should reject wrong hashes even when byte lengths match and reject HTTP failures', async () => {
    const fetcher = setup();
    await expect(
      preparePicogkBrowserRuntime({ bootstrapUrl, files: [{ ...bootstrap, sha256: '0'.repeat(64) }] }),
    ).rejects.toThrow('integrity mismatch');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap] })).rejects.toThrow(
      'download failed: 404',
    );
  });

  it('should reject unlisted resources, configuration disagreement and binary-as-code requests', async () => {
    setup();
    const loader = await preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap, binary] });
    try {
      expect((): string | Promise<Response> => loader.loadResource('assembly', 'bad', './absent.wasm', '')).toThrow(
        'Unlisted',
      );
      expect((): string | Promise<Response> =>
        loader.loadResource('assembly', 'bad', binary.url, integrity(js)),
      ).toThrow('configuration disagrees');
      expect((): string | Promise<Response> => loader.loadResource('dotnetjs', 'bad', binary.url, '')).toThrow(
        'unverified executable',
      );
    } finally {
      loader.dispose();
    }
  });

  it('should bind immutable metadata and verify non-WASM resource bytes', async () => {
    setup();
    const data = { ...binary, url: 'https://example.test/data.dat' };
    const loader = await preparePicogkBrowserRuntime({ bootstrapUrl, files: [bootstrap, data] });
    data.sha256 = '0'.repeat(64);
    try {
      const response = await loader.loadResource('globalization', 'data.dat', data.url, '');
      if (!(response instanceof Response)) {
        throw new Error('Expected verified response');
      }
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(wasm);
    } finally {
      loader.dispose();
    }
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadWasmBinary, compileWasmStreaming } from '#framework/wasm-loader.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadWasmBinary', () => {
  it('should load WASM binary via fetch when available', async () => {
    const wasmBytes = new ArrayBuffer(8);
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(wasmBytes),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    try {
      const result = await loadWasmBinary('https://example.com/module.wasm');
      expect(fetch).toHaveBeenCalledWith('https://example.com/module.wasm');
      expect(result).toBe(wasmBytes);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should throw when fetch returns non-ok status for non-file URL', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    try {
      await expect(loadWasmBinary('https://example.com/missing.wasm')).rejects.toThrow('Failed to fetch WASM binary');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should fall back to Node fs readFile for file:// URLs when fetch fails', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const os = await import('node:os');

    const temporaryFile = path.join(os.tmpdir(), `wasm-loader-test-${Date.now()}.wasm`);
    const wasmBytes = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await writeFile(temporaryFile, wasmBytes);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch not supported')));

    try {
      const result = await loadWasmBinary(pathToFileURL(temporaryFile).href);
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(result)).toEqual(new Uint8Array(wasmBytes));
    } finally {
      vi.unstubAllGlobals();
      await unlink(temporaryFile).catch(() => undefined);
    }
  });

  it('should read file:// URLs directly without probing fetch', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const os = await import('node:os');

    const temporaryFile = path.join(os.tmpdir(), `wasm-loader-direct-file-test-${Date.now()}.wasm`);
    const wasmBytes = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await writeFile(temporaryFile, wasmBytes);

    const fetchSpy = vi.fn().mockRejectedValue(new Error('file fetch must not run'));
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const result = await loadWasmBinary(pathToFileURL(temporaryFile).href);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(new Uint8Array(result)).toEqual(new Uint8Array(wasmBytes));
    } finally {
      vi.unstubAllGlobals();
      await unlink(temporaryFile).catch(() => undefined);
    }
  });
});

describe('compileWasmStreaming', () => {
  it('should use WebAssembly.compileStreaming when available', async () => {
    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
    vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(mockModule);

    try {
      const result = await compileWasmStreaming('https://example.com/streaming.wasm');
      expect(result).toBe(mockModule);
      expect(WebAssembly.compileStreaming).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should fall back to compile when streaming fails', async () => {
    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    const wasmBytes = new ArrayBuffer(8);

    vi.spyOn(WebAssembly, 'compileStreaming').mockRejectedValue(new Error('streaming not supported'));
    vi.spyOn(WebAssembly, 'compile').mockResolvedValue(mockModule);

    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(wasmBytes),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    try {
      const result = await compileWasmStreaming('https://example.com/fallback.wasm');
      expect(result).toBe(mockModule);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should compile file:// URLs directly without compileStreaming or fetch', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const os = await import('node:os');

    const temporaryFile = path.join(os.tmpdir(), `wasm-compile-direct-file-test-${Date.now()}.wasm`);
    const wasmBytes = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await writeFile(temporaryFile, wasmBytes);

    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    const fetchSpy = vi.fn().mockRejectedValue(new Error('file fetch must not run'));
    vi.stubGlobal('fetch', fetchSpy);
    const streamingSpy = vi.spyOn(WebAssembly, 'compileStreaming');
    vi.spyOn(WebAssembly, 'compile').mockResolvedValue(mockModule);

    try {
      const result = await compileWasmStreaming(pathToFileURL(temporaryFile).href);
      expect(result).toBe(mockModule);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(streamingSpy).not.toHaveBeenCalled();
      expect(WebAssembly.compile).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    } finally {
      vi.unstubAllGlobals();
      await unlink(temporaryFile).catch(() => undefined);
    }
  });

  it('should attach tracer span when tracer provided', async () => {
    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
    vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(mockModule);

    const endSpy = vi.fn();
    const tracer = {
      startSpan: vi.fn().mockReturnValue({ end: endSpy }),
    };

    try {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- tracer mock only implements startSpan
      await compileWasmStreaming('https://example.com/traced.wasm', tracer as unknown as RuntimeSpanTracer);
      expect(tracer.startSpan).toHaveBeenCalledWith('wasm.compile', { url: 'https://example.com/traced.wasm' });
      expect(endSpy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should throw combined error when both streaming and fallback fail', async () => {
    vi.spyOn(WebAssembly, 'compileStreaming').mockRejectedValue(new Error('streaming failed'));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      }),
    );

    vi.spyOn(WebAssembly, 'compile').mockRejectedValue(new Error('compile failed'));

    try {
      await expect(compileWasmStreaming('https://example.com/broken.wasm')).rejects.toThrow(
        /Failed to compile WASM module/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('coalesces concurrent compilation by canonical URL', async () => {
    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
    const compileSpy = vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(mockModule);

    try {
      const [first, second] = await Promise.all([
        compileWasmStreaming('https://example.com/shared.wasm'),
        compileWasmStreaming('https://example.com/./shared.wasm'),
      ]);

      expect(first).toBe(mockModule);
      expect(second).toBe(mockModule);
      expect(compileSpy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('evicts rejected compilation so the same URL can be retried', async () => {
    // oxlint-disable-next-line consistent-type-assertions -- WebAssembly.Module is opaque; empty object suffices for mock
    const mockModule = {} as WebAssembly.Module;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));
    const streamingSpy = vi
      .spyOn(WebAssembly, 'compileStreaming')
      .mockRejectedValueOnce(new Error('compile failed'))
      .mockResolvedValueOnce(mockModule);

    try {
      await expect(compileWasmStreaming('https://example.com/retry.wasm')).rejects.toThrow(/Failed to compile/u);
      await expect(compileWasmStreaming('https://example.com/retry.wasm')).resolves.toBe(mockModule);
      expect(streamingSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createModule = vi.hoisted(() => vi.fn(async (_options?: unknown) => ({})));
vi.mock('#mixed-wasm-binding', () => ({ default: createModule }));

beforeEach(() => {
  vi.resetModules();
  createModule.mockClear();
});

describe('mixed WASM input', () => {
  it('should borrow supplied ArrayBuffer bytes without detaching or copying them', async () => {
    const source = Uint8Array.from([0, 97, 255]).buffer;
    const { initializeMixedWasm } = await import('./mixed-wasm-loader');
    await initializeMixedWasm(source);

    const options = createModule.mock.calls[0]?.[0] as { wasmBinary: Uint8Array<ArrayBuffer> };
    expect(options.wasmBinary.buffer).toBe(source);
    expect([...options.wasmBinary]).toEqual([0, 97, 255]);
    expect(source.byteLength).toBe(3);
  });

  it('should retain a supplied byte view and buffer response bytes for the glue', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const { initializeMixedWasm } = await import('./mixed-wasm-loader');
    await initializeMixedWasm(bytes);
    expect(createModule.mock.calls[0]?.[0]).toMatchObject({ wasmBinary: bytes });

    vi.resetModules();
    createModule.mockClear();
    const responseLoader = await import('./mixed-wasm-loader');
    await responseLoader.initializeMixedWasm(new Response(bytes));
    const options = createModule.mock.calls[0]?.[0] as { wasmBinary: Uint8Array<ArrayBuffer> };
    expect([...options.wasmBinary]).toEqual([1, 2, 3]);
    expect(options.wasmBinary.buffer).not.toBe(bytes.buffer);
  });

  it('should leave URL resolution to Emscripten for streaming and byte fallback', async () => {
    const url = new URL('https://example.test/geospec.wasm');
    const { initializeMixedWasm } = await import('./mixed-wasm-loader');
    await initializeMixedWasm(Promise.resolve(url));
    const options = createModule.mock.calls[0]?.[0] as { locateFile: (path: string) => string };
    expect(options.locateFile('geospec_engine_native.wasm')).toBe(url.href);
    expect(options).not.toHaveProperty('wasmBinary');
  });
});

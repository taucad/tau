import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createModule = vi.hoisted(() => vi.fn(async (_options?: unknown) => ({})));
vi.mock('#mixed-wasm-binding', () => ({ default: createModule }));

beforeEach(() => {
  vi.resetModules();
  createModule.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const standInPageBytes = 65_536;

/**
 * Stand-in MT module over real shared memory. Its HEAPU8, like the main thread's after a pthread grew memory, is
 * never refreshed: every registration grows memory by a page and lands in the new page.
 * @returns The module; `input_free` is a spy.
 */
/* eslint-disable @typescript-eslint/naming-convention -- The stand-in mirrors Emscripten's exported names. */
const standInMtModule = () => {
  const wasmMemory = new WebAssembly.Memory({ initial: 1, maximum: 16, shared: true });
  let next = standInPageBytes;
  let result = { pointer: 0, length: 0 };
  return {
    HEAPU8: new Uint8Array(wasmMemory.buffer),
    wasmMemory,
    _geospec_engine_native_engine_new_with_execution_permits: () => 1,
    _geospec_engine_native_input_alloc: (_length: number): number => {
      wasmMemory.grow(1);
      next += standInPageBytes;
      return next - standInPageBytes;
    },
    _geospec_engine_native_input_free: vi.fn(),
    _geospec_engine_native_canonicalize: (pointer: number, length: number) => {
      result = { pointer, length };
      return 1;
    },
    // Echo the last resource through the resource table.
    _geospec_engine_native_ingest_subject: (...args: number[]) => {
      const [table = 0, count = 0] = args.slice(5);
      const view = new DataView(wasmMemory.buffer);
      const entry = table + (count - 1) * 8;
      result = { pointer: view.getUint32(entry, true), length: view.getUint32(entry + 4, true) };
      return 1;
    },
    _geospec_engine_native_result_is_error: () => 0,
    _geospec_engine_native_result_length: () => result.length,
    _geospec_engine_native_result_pointer: () => result.pointer,
    _geospec_engine_native_result_drop: () => undefined,
  };
};
/* eslint-enable @typescript-eslint/naming-convention -- Resume ordinary property naming. */

/**
 * Write a hash-valid MT product whose glue returns the supplied stand-in module.
 * @param directory - Empty product directory.
 * @param module - Stand-in module the glue returns.
 * @returns The product's asset receipt URL.
 */
const writeStandInProduct = async (directory: string, module: Record<string, unknown>): Promise<URL> => {
  vi.stubGlobal('geospecStandInModule', module);
  const glueSource = 'export default async () => globalThis.geospecStandInModule;\n';
  const glue = { file: 'geospec_engine_native.mjs', bytes: Buffer.byteLength(glueSource), sha256: sha256(glueSource) };
  const wasm = { file: 'geospec_engine_native.wasm', bytes: 1, sha256: sha256('w') };
  const buildReceipt = JSON.stringify({
    schema: 'geospec-mixed-build-receipt-mt-v1',
    mtSettings: { executionPermits: 2 },
    artifacts: [glue, wasm].map((asset) => ({ ...asset, path: join(directory, asset.file) })),
  });
  await writeFile(join(directory, 'build-receipt.json'), buildReceipt);
  await writeFile(join(directory, glue.file), glueSource);
  await writeFile(join(directory, wasm.file), 'w');
  const receiptPath = join(directory, 'geospec_engine_native.mt.json');
  await writeFile(
    receiptPath,
    JSON.stringify({
      schema: 'geospec-mixed-mt-assets-v1',
      permits: 2,
      buildReceipt: {
        file: 'build-receipt.json',
        bytes: Buffer.byteLength(buildReceipt),
        sha256: sha256(buildReceipt),
      },
      glue,
      wasm,
      worker: glue,
    }),
  );
  return pathToFileURL(receiptPath);
};

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

  it('should reject an unavailable MT product before loading or constructing an ST engine', async () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const loader = await import('./mixed-wasm-loader');
    await expect(loader.initializeMixedWasm(undefined, { variant: 'mt', permits: 4, receipt: '' })).rejects.toThrow(
      'mt-permits-4',
    );
    expect(createModule).not.toHaveBeenCalled();

    await loader.initializeMixedWasm();
    expect(createModule).toHaveBeenCalledTimes(1);
    expect(() => new loader.MixedWasmBinding({ variant: 'mt', permits: 4, receipt: '' })).toThrow('mt-permits-4');
    const wasm = await import('./wasm');
    expect(() => new wasm.Engine({ variant: 'mt', permits: 4, receipt: '' })).toThrow('mt-permits-4');
    expect(createModule).toHaveBeenCalledTimes(1);
  });

  it('should reject invalid MT permits and missing browser isolation', async () => {
    const { initializeMixedWasm } = await import('./mixed-wasm-loader');
    await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 0, receipt: '' })).rejects.toMatchObject({
      code: 'invalid-request',
    });
    await expect(
      initializeMixedWasm(undefined, { variant: 'mt', permits: 2 ** 32, receipt: '' }),
    ).rejects.toMatchObject({
      code: 'invalid-request',
    });
    vi.stubGlobal('crossOriginIsolated', false);
    vi.stubGlobal('process', undefined);
    await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 2, receipt: '' })).rejects.toMatchObject({
      code: 'unsupported-capability',
    });
    await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 2, receipt: '' })).rejects.toThrow(
      'cross-origin-isolated',
    );
    expect(createModule).not.toHaveBeenCalled();
  });

  it('should reject a mismatched MT receipt and still initialize the ST product', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-receipt-'));
    try {
      const receiptPath = join(directory, 'geospec_engine_native.mt.json');
      await writeFile(receiptPath, JSON.stringify({ schema: 'geospec-mixed-mt-assets-v1', permits: 2 }));
      const loader = await import('./mixed-wasm-loader');
      await expect(
        loader.initializeMixedWasm(undefined, { variant: 'mt', permits: 4, receipt: pathToFileURL(receiptPath) }),
      ).rejects.toMatchObject({ code: 'unsupported-capability' });
      expect(createModule).not.toHaveBeenCalled();
      await loader.initializeMixedWasm();
      expect(createModule).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should admit a smaller grant against a larger MT product and refuse a larger one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-width-'));
    try {
      const receiptPath = join(directory, 'geospec_engine_native.mt.json');
      await writeFile(receiptPath, JSON.stringify({ schema: 'geospec-mixed-mt-assets-v1', permits: 4, glue: null }));
      const receipt = pathToFileURL(receiptPath);
      const { initializeMixedWasm } = await import('./mixed-wasm-loader');
      // Past the width gate, the next refusal is the missing glue asset.
      await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 1, receipt })).rejects.toThrow(
        'no valid geospec_engine_native.mjs',
      );
      await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 5, receipt })).rejects.toThrow(
        'mt-permits-5',
      );
      expect(createModule).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should refuse malformed untrusted MT and build receipt shapes before module import', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-untrusted-'));
    try {
      const receiptPath = join(directory, 'geospec_engine_native.mt.json');
      const receipt = pathToFileURL(receiptPath);
      const { initializeMixedWasm } = await import('./mixed-wasm-loader');
      for (const value of [
        'null',
        '[]',
        JSON.stringify({ schema: 'geospec-mixed-mt-assets-v1', permits: 2, glue: null }),
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- Rewrite one receipt path only after its prior import has failed.
        await writeFile(receiptPath, value);
        // oxlint-disable-next-line no-await-in-loop -- The same URL must be retried after each rejected module promise.
        await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 2, receipt })).rejects.toMatchObject({
          code: 'unsupported-capability',
        });
      }
      const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
      const buildReceipt = JSON.stringify({
        schema: 'geospec-mixed-build-receipt-mt-v1',
        mtSettings: { executionPermits: 2 },
        artifacts: [null],
      });
      await writeFile(join(directory, 'build-receipt.json'), buildReceipt);
      const glue = { file: 'geospec_engine_native.mjs', bytes: 1, sha256: hash('g') };
      await writeFile(
        receiptPath,
        JSON.stringify({
          schema: 'geospec-mixed-mt-assets-v1',
          permits: 2,
          buildReceipt: {
            file: 'build-receipt.json',
            bytes: Buffer.byteLength(buildReceipt),
            sha256: hash(buildReceipt),
          },
          glue,
          wasm: { file: 'geospec_engine_native.wasm', bytes: 1, sha256: hash('w') },
          worker: glue,
        }),
      );
      await expect(initializeMixedWasm(undefined, { variant: 'mt', permits: 2, receipt })).rejects.toThrow(
        'qualified build receipt',
      );
      expect(createModule).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should canonicalize through the MT module in a host that initialized only an MT product', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-only-'));
    try {
      // The stand-in canonicalize echoes its input, so the returned bytes prove which module ran.
      const receipt = await writeStandInProduct(directory, standInMtModule());
      const input = new TextEncoder().encode('{"b":1}');
      const wasmFacade = await import('./wasm');
      expect(() => wasmFacade.canonicalize(input)).toThrow('Call initialize() before using the GeoSpec WASM engine.');

      await wasmFacade.initialize(undefined, { variant: 'mt', permits: 1, receipt });
      expect([...wasmFacade.canonicalize(input)]).toEqual([...input]);
      expect(createModule).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should read and write MT memory past a main-thread view that another thread outgrew', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-stale-view-'));
    try {
      const module = standInMtModule();
      const receipt = await writeStandInProduct(directory, module);
      const loader = await import('./mixed-wasm-loader');
      await loader.initializeMixedWasm(undefined, { variant: 'mt', permits: 1, receipt });
      const input = new TextEncoder().encode('{"b":1}');
      expect([...loader.canonicalizeMixedWasm(input)]).toEqual([...input]);

      const binding = new loader.MixedWasmBinding({ variant: 'mt', permits: 1, receipt });
      const resource = Uint8Array.from([7, 8, 9]);
      // Echoing the resource proves both its copy and the DataView resource table used current memory.
      expect([...binding.ingestSubject(input, Uint8Array.from([1]), [resource])]).toEqual([7, 8, 9]);
      expect(module.HEAPU8.byteLength).toBe(standInPageBytes);
      expect(module.wasmMemory.buffer.byteLength).toBeGreaterThan(4 * standInPageBytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should refuse an MT product that does not export its memory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-no-memory-'));
    try {
      const receipt = await writeStandInProduct(directory, { ...standInMtModule(), wasmMemory: undefined });
      const wasmFacade = await import('./wasm');
      const refusal = wasmFacade.initialize(undefined, { variant: 'mt', permits: 1, receipt });
      await expect(refusal).rejects.toMatchObject({ code: 'unsupported-capability' });
      await expect(refusal).rejects.toThrow('MT module does not export wasmMemory; relink the MT product.');
      expect(() => wasmFacade.canonicalize(Uint8Array.from([0x7b, 0x7d]))).toThrow('Call initialize()');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should free a registered input whose copy into module memory fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-input-leak-'));
    try {
      const module = standInMtModule();
      // A pointer two bytes before the end of memory cannot hold the input, so the copy throws after registration.
      const pointer = standInPageBytes - 2;
      module._geospec_engine_native_input_alloc = () => pointer;
      const receipt = await writeStandInProduct(directory, module);
      const loader = await import('./mixed-wasm-loader');
      await loader.initializeMixedWasm(undefined, { variant: 'mt', permits: 1, receipt });
      const input = new TextEncoder().encode('{"b":1}');
      expect(() => loader.canonicalizeMixedWasm(input)).toThrow(RangeError);
      expect(module._geospec_engine_native_input_free).toHaveBeenCalledExactlyOnceWith(pointer, input.byteLength);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('should refuse a changed MT worker/glue asset before importing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'geospec-mt-assets-'));
    try {
      const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
      const glue = { file: 'geospec_engine_native.mjs', bytes: 8, sha256: hash('expected') };
      const wasm = { file: 'geospec_engine_native.wasm', bytes: 1, sha256: hash('w') };
      const buildReceipt = JSON.stringify({
        schema: 'geospec-mixed-build-receipt-mt-v1',
        mtSettings: { executionPermits: 2 },
        artifacts: [glue, wasm].map((asset) => ({ ...asset, path: join(directory, asset.file) })),
      });
      await writeFile(join(directory, 'build-receipt.json'), buildReceipt);
      await writeFile(join(directory, glue.file), 'tampered');
      const receiptPath = join(directory, 'geospec_engine_native.mt.json');
      await writeFile(
        receiptPath,
        JSON.stringify({
          schema: 'geospec-mixed-mt-assets-v1',
          permits: 2,
          buildReceipt: {
            file: 'build-receipt.json',
            bytes: Buffer.byteLength(buildReceipt),
            sha256: hash(buildReceipt),
          },
          glue,
          wasm,
          worker: glue,
        }),
      );
      const { initializeMixedWasm } = await import('./mixed-wasm-loader');
      await expect(
        initializeMixedWasm(undefined, { variant: 'mt', permits: 2, receipt: pathToFileURL(receiptPath) }),
      ).rejects.toThrow('does not match');
      expect(createModule).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

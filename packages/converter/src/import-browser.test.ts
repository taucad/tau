/* eslint-disable new-cap -- External library uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- External library uses PascalCase method names */
/**
 * Browser-simulation tests for USDZ import.
 *
 * These tests catch the "memory access out of bounds" crash that occurs in
 * browsers when importing large USDZ files (e.g. DamagedHelmet).
 *
 * Root cause: tinyusdz decodes JPEG textures to RGBA float arrays by default,
 * requiring ~486MB of WASM memory — exceeding typical browser allocation limits
 * and causing NULL-pointer dereferences on failed malloc.
 *
 * The fix (load_texture_assets = false) keeps textures as compressed JPEG/PNG,
 * so the conversion fits within the initial ~72MB allocation without any
 * memory growth.
 *
 * These tests validate that:
 * 1. Textures are embedded in the GLB via bufferView (not external URIs)
 * 2. WASM memory after conversion stays under 128MB (browser-safe)
 * 3. The module works when memory growth is blocked (simulating browser OOM)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const wasmPath = join(import.meta.dirname, 'assets', 'assimpjs', 'assimpjs-all.wasm');

const loadFixtureRaw = (fixtureName: string): Uint8Array<ArrayBuffer> => {
  const fixturePath = join(import.meta.dirname, 'fixtures', fixtureName);
  return new Uint8Array(readFileSync(fixturePath));
};

const parseGlbJson = (glb: Uint8Array<ArrayBuffer>): Record<string, unknown> => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonString = new TextDecoder().decode(glb.slice(20, 20 + jsonChunkLength));
  return JSON.parse(jsonString) as Record<string, unknown>;
};

type AssimpModule = {
  FileList: new () => {
    AddFile: (name: string, data: Uint8Array<ArrayBuffer>) => void;
  };
  ConvertFileList: (
    fileList: unknown,
    format: string,
  ) => {
    IsSuccess: () => boolean;
    FileCount: () => number;
    GetFile: (index: number) => { GetContent: () => Uint8Array<ArrayBuffer> };
    GetErrorCode: () => string;
  };
};

type ConvertResult = {
  glb: Uint8Array<ArrayBuffer>;
  memoryAfterMegabytes: number;
};

const convertUsdzToGlb = async (options?: { blockGrowth?: boolean }): Promise<ConvertResult> => {
  const data = loadFixtureRaw('cube-textures.usdz');
  const wasmBytes = readFileSync(wasmPath);
  const wasmModule = await WebAssembly.compile(wasmBytes);

  const assimpjsModule = await import('assimpjs/all');
  const assimpjs = assimpjsModule.default as (options: Record<string, unknown>) => Promise<AssimpModule>;

  let wasmMemory: WebAssembly.Memory | undefined;

  const ajs = await assimpjs({
    locateFile: () => wasmPath,

    instantiateWasm(imports: WebAssembly.Imports, callback: (instance: WebAssembly.Instance) => void) {
      if (options?.blockGrowth) {
        const envImports = imports['env'] as Record<string, unknown> | undefined;
        if (envImports?.['emscripten_resize_heap']) {
          envImports['emscripten_resize_heap'] = (requestedSize: number) => {
            const currentSize = wasmMemory?.buffer.byteLength ?? 0;
            const requestedMb = (requestedSize / (1024 * 1024)).toFixed(1);
            const currentMb = (currentSize / (1024 * 1024)).toFixed(1);
            throw new WebAssembly.RuntimeError(
              `memory access out of bounds (simulated browser OOM: ` +
                `requested ${requestedMb} MB, current ${currentMb} MB)`,
            );
          };
        }
      }

      // eslint-disable-next-line promise/prefer-await-to-then -- Emscripten's instantiateWasm requires synchronous return + async callback
      void WebAssembly.instantiate(wasmModule, imports).then((instance) => {
        wasmMemory = instance.exports['memory'] as WebAssembly.Memory | undefined;
        callback(instance);
      });

      return {};
    },
  });

  const fileList = new ajs.FileList();
  fileList.AddFile('damaged-helmet.usdz', data);
  const result = ajs.ConvertFileList(fileList, 'glb2');

  if (!result.IsSuccess()) {
    throw new Error(`USDZ conversion failed: ${result.GetErrorCode()}`);
  }

  const memoryAfterBytes = wasmMemory?.buffer.byteLength ?? 0;
  const glb = new Uint8Array(result.GetFile(0).GetContent());

  return { glb, memoryAfterMegabytes: memoryAfterBytes / (1024 * 1024) };
};

describe('USDZ browser-safe import', () => {
  it('should embed textures via bufferView, not external URIs', async () => {
    const { glb } = await convertUsdzToGlb();
    const json = parseGlbJson(glb);
    const images = json['images'] as Array<Record<string, unknown>> | undefined;

    expect(images).toBeDefined();
    expect(images!.length).toBeGreaterThan(0);

    for (const image of images!) {
      expect(image).toHaveProperty('bufferView');
      expect(image).toHaveProperty('mimeType');
      expect(image).not.toHaveProperty('uri');
    }
  }, 30_000);

  it('should complete USDZ conversion within browser-safe memory', async () => {
    const { memoryAfterMegabytes } = await convertUsdzToGlb();

    // With load_texture_assets=false, conversion fits within the initial
    // ~72MB allocation. The old code path (decoding textures to RGBA floats)
    // required ~486MB — causing "memory access out of bounds" in browsers
    // when growth failed or exceeded limits.
    expect(memoryAfterMegabytes).toBeLessThan(128);
  }, 30_000);

  it('should succeed without any memory growth (no emscripten_resize_heap calls)', async () => {
    // When blockGrowth is true, any attempt to grow memory throws
    // RuntimeError (simulating the browser crash). If the conversion
    // succeeds, it proves no memory growth was needed.
    const { glb, memoryAfterMegabytes } = await convertUsdzToGlb({ blockGrowth: true });

    expect(glb.length).toBeGreaterThan(0);
    expect(memoryAfterMegabytes).toBeLessThan(128);
  }, 30_000);
});

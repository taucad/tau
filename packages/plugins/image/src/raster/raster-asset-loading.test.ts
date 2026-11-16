/**
 * Each codec's WASM file is read and checked against its pinned digest on the first image that needs it, through
 * the runtime, and is kept for the worker's life. A JPEG conversion never reads the WebP, AVIF or PNG codecs.
 */

import { readFileSync } from 'node:fs';
import type * as fsPromises from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { rasterTranscoder } from '#raster/raster.transcoder.js';

/** Every file the runtime reads from disk, by base name; in Node the runtime reads `file:` assets this way. */
const reads = vi.hoisted((): string[] => []);

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof fsPromises>();
  return {
    ...original,
    readFile: vi.fn(async (...args: Parameters<typeof original.readFile>) => {
      const [path] = args;
      reads.push((path instanceof URL ? path.pathname : typeof path === 'string' ? path : '').replace(/^.*[/\\]/u, ''));
      return original.readFile(...args);
    }),
  };
});

const wasmReads = (): string[] => reads.filter((name) => name.endsWith('.wasm'));

const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

const transcoderRuntime: AnyRuntimeDefinition = defineRuntime({ transcoders: [rasterTranscoder()] });

describe('raster codec loading through the runtime', () => {
  let client: ReturnType<typeof createRuntimeClient>;

  beforeAll(() => {
    client = createRuntimeClient({
      transport: inProcessTransport({
        // A transcoder-only runtime has no kernel render capabilities; the client is used untyped, as in parity.
        runtime: transcoderRuntime,
        fileSystem: fromMemoryFs({}),
      }),
    });
  });

  afterAll(async () => {
    await client.shutdown();
  });

  const convert = async (request: {
    readonly from: string;
    readonly to: string;
    readonly name: string;
    readonly options?: Record<string, unknown>;
  }) => {
    const result = await client.transcode({
      from: request.from,
      to: request.to,
      files: [{ name: request.name, bytes: fixture(request.name), mimeType: 'application/octet-stream' }],
      options: request.options ?? {},
    });
    if (!result.success) {
      expect.fail(result.issues.map(({ message }) => message).join('; '));
    }
  };

  it('should read only the JPEG codecs for a JPEG conversion, the resizer when it resizes, and each file once', async () => {
    await convert({ from: 'jpeg', to: 'jpeg', name: 'small.jpg' });
    expect(wasmReads().toSorted()).toEqual(['mozjpeg_dec.wasm', 'mozjpeg_enc.wasm']);

    await convert({ from: 'jpeg', to: 'jpeg', name: 'small.jpg', options: { maxEdge: 600 } });
    expect(wasmReads().toSorted()).toEqual(['mozjpeg_dec.wasm', 'mozjpeg_enc.wasm', 'squoosh_resize_bg.wasm']);

    await convert({ from: 'jpeg', to: 'jpeg', name: 'small.jpg', options: { maxEdge: 300 } });
    expect(wasmReads()).toHaveLength(3);
  });

  it('should read a further codec only when a later format needs it', async () => {
    await convert({ from: 'png', to: 'jpeg', name: 'small.png' });
    expect(wasmReads().toSorted()).toEqual([
      'mozjpeg_dec.wasm',
      'mozjpeg_enc.wasm',
      'squoosh_png_bg.wasm',
      'squoosh_resize_bg.wasm',
    ]);
    expect(wasmReads()).not.toContain('avif_dec.wasm');
    expect(wasmReads()).not.toContain('webp_dec.wasm');
    expect(wasmReads()).not.toContain('webp_enc.wasm');
  });
});

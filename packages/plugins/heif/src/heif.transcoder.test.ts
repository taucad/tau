/**
 * Admission and failure behaviour of the HEIF transcoder, through the runtime. The header is checked before libheif
 * is read: a 16384×16384 HEIC is refused from its `ispe` property without any WASM file being fetched.
 */

import { readFileSync } from 'node:fs';
import type * as fsPromises from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { deriveTranscodeSources } from '@taucad/runtime/plugin';
import { probeImage } from '@taucad/utils/image-probe';
import { heifTranscoder } from '#heif.transcoder.js';

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

const heifRuntime: AnyRuntimeDefinition = defineRuntime({ transcoders: [heifTranscoder()] });

type Request = {
  readonly from?: string;
  readonly to?: string;
  readonly files: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> }>;
  readonly options?: Record<string, unknown>;
};

describe('HEIF transcoder', () => {
  let client: ReturnType<typeof createRuntimeClient>;

  beforeAll(() => {
    client = createRuntimeClient({
      transport: inProcessTransport({ runtime: heifRuntime, fileSystem: fromMemoryFs({}) }),
    });
  });

  afterAll(async () => {
    await client.shutdown();
  });

  beforeEach(() => {
    reads.length = 0;
  });

  const transcode = async ({ from = 'heic', to = 'jpeg', files, options = {} }: Request) =>
    client.transcode({
      from,
      to,
      files: files.map((file) => ({ ...file, mimeType: 'application/octet-stream' })),
      options,
    });

  const refusal = async (request: Request) => {
    const result = await transcode(request);
    if (result.success) {
      expect.fail('expected a refusal');
    }
    const [issue] = result.issues;
    return { message: issue?.message, code: (issue?.details as { code?: string } | undefined)?.code };
  };

  it('should declare HEIC and HEIF sources to JPEG, PNG and WebP', () => {
    expect(deriveTranscodeSources(heifRuntime, 'jpeg')).toEqual(['heic', 'heif']);
    expect(deriveTranscodeSources(heifRuntime, 'png')).toEqual(['heic', 'heif']);
    expect(deriveTranscodeSources(heifRuntime, 'webp')).toEqual(['heic', 'heif']);
  });

  it('should refuse a 16384×16384 HEIC from its header in under 100 ms, without fetching libheif', async () => {
    const bytes = fixture('bomb-16384.heic');
    expect(probeImage(bytes)).toMatchObject({ format: 'heic', width: 16_384, height: 16_384 });
    const started = performance.now();
    const result = await refusal({ files: [{ name: 'bomb.heic', bytes }] });
    expect(performance.now() - started).toBeLessThan(100);
    expect(result).toEqual({ code: 'limit', message: 'HEIC of 16384×16384 exceeds the 50000000-pixel limit' });
    expect(wasmReads()).toEqual([]);
  });

  it('should apply a lowered maxPixels and refuse a raised one', async () => {
    expect(
      await refusal({ files: [{ name: 'small.heic', bytes: fixture('small.heic') }], options: { maxPixels: 900_000 } }),
    ).toEqual({
      code: 'limit',
      message: 'HEIC of 1200×800 exceeds the 900000-pixel limit',
    });
    expect(
      await refusal({
        files: [{ name: 'small.heic', bytes: fixture('small.heic') }],
        options: { maxPixels: 60_000_000 },
      }),
    ).toEqual({
      code: undefined,
      message: 'Transcoder heic → jpeg option maxPixels: Too big: expected number to be <=50000000',
    });
  });

  it('should apply the container rotation, so heic-rot6.heic comes out 800×1200', async () => {
    const result = await transcode({ files: [{ name: 'photo.heic', bytes: fixture('heic-rot6.heic') }] });
    if (!result.success) {
      expect.fail(result.issues.map(({ message }) => message).join('; '));
    }
    const [output] = result.data;
    expect(output?.name).toBe('photo.jpg');
    expect(output?.mimeType).toBe('image/jpeg');
    expect(probeImage(output!.bytes)).toMatchObject({ format: 'jpeg', width: 800, height: 1200 });
  });

  it('should fail a HEIC cut inside its image data as a decode failure', async () => {
    await expect(refusal({ files: [{ name: 'cut.heic', bytes: fixture('truncated.heic') }] })).resolves.toMatchObject({
      code: 'decode',
    });
  });

  it('should refuse bytes that are not HEIC', async () => {
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array.from({ length: 24 }, () => 0),
    ]);
    await expect(refusal({ files: [{ name: 'x.heic', bytes: new Uint8Array(16) }] })).resolves.toMatchObject({
      code: 'input',
    });
    await expect(refusal({ files: [{ name: 'x.heic', bytes: png }] })).resolves.toMatchObject({ code: 'input' });
  });

  it('should refuse more than 64 MiB before reading the header', async () => {
    const bytes = new Uint8Array(64 * 1024 * 1024 + 1);
    bytes.set(fixture('small.heic'));
    await expect(refusal({ files: [{ name: 'big.heic', bytes }] })).resolves.toMatchObject({ code: 'limit' });
    expect(wasmReads()).toEqual([]);
  });

  it('should refuse two files in one request, and unknown options', async () => {
    const bytes = fixture('small.heic');
    await expect(
      refusal({
        files: [
          { name: 'a.heic', bytes },
          { name: 'b.heic', bytes },
        ],
      }),
    ).resolves.toMatchObject({ code: 'input' });
    const unknownOption = await refusal({ files: [{ name: 'a.heic', bytes }], options: { colour: 'red' } });
    expect(unknownOption.message).toContain('colour');
  });
});

describe('HEIF codec loading through the runtime', () => {
  it('should fetch libheif and only the encoders the target needs, each once per worker', async () => {
    reads.length = 0;
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime: heifRuntime, fileSystem: fromMemoryFs({}) }),
    });
    try {
      for (const name of ['small.heic', 'heic-rot6.heic']) {
        // oxlint-disable-next-line no-await-in-loop -- the second conversion must find the first one's codecs loaded.
        const result = await client.transcode({
          from: 'heic',
          to: 'png',
          files: [{ name, bytes: fixture(name), mimeType: 'application/octet-stream' }],
          options: {},
        });
        expect(result.success).toBe(true);
      }
      expect(wasmReads().toSorted()).toEqual(['libheif.wasm', 'squoosh_png_bg.wasm']);
    } finally {
      await client.shutdown();
    }
  });
});

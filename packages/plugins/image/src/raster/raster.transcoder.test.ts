import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { probeImage } from '@taucad/utils/image-probe';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscodeResult, TranscoderServices } from '@taucad/runtime/transcoder';
import { loadWasmBinary } from '@taucad/runtime/transcoder';
import type { WasmCompiler } from '#raster/raster-codecs.js';
import { createRasterContext, rasterTranscoder } from '#raster/raster.transcoder.js';
import { rasterMaxInputBytes } from '#raster/raster-options.js';

const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

const createServices = (): TranscoderServices => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), custom: vi.fn() },
  tracer: { startSpan: () => ({ end: vi.fn(), setAttribute: vi.fn(), addEvent: vi.fn() }) },
  signal: new AbortController().signal,
});

/** A compiler that records every WASM file it is asked for, so a test can prove no codec loaded. */
const createCompiler = () => {
  const urls: string[] = [];
  const compile = vi.fn<WasmCompiler>(async ({ url }) => {
    urls.push(url.replace(/^.*\//u, ''));
    return WebAssembly.compile(await loadWasmBinary(url));
  });
  return { compile, urls };
};

const definition = await resolveRuntimePluginDefinition('transcoder', rasterTranscoder());

type Request = Parameters<typeof definition.transcode>[0];

const run = async (
  request: Omit<Request, 'files'> & { readonly bytes: Uint8Array<ArrayBuffer>; readonly name?: string },
  compile = createCompiler().compile,
): Promise<TranscodeResult> =>
  definition.transcode(
    {
      from: request.from,
      to: request.to,
      options: request.options,
      files: [{ name: request.name ?? 'source.bin', bytes: request.bytes, mimeType: 'application/octet-stream' }],
    } as Request,
    createServices(),
    createRasterContext(compile),
  );

const issueOf = (result: TranscodeResult) => {
  expect(result.success).toBe(false);
  return result.success ? undefined : result.issues[0];
};

const outputOf = (result: TranscodeResult) => {
  if (!result.success) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  expect(result.data).toHaveLength(1);
  return result.data[0]!;
};

/** Decode a PNG output to RGBA through the transcoder's own PNG decoder. */
const pixelsOf = async (png: Uint8Array<ArrayBuffer>) =>
  createRasterContext(async ({ url }) => WebAssembly.compile(await loadWasmBinary(url))).decoders.decodePng(png);

const pixelAt = (image: { data: Uint8ClampedArray; width: number }, x: number, y: number): number[] => {
  const offset = (y * image.width + x) * 4;
  return [...image.data.subarray(offset, offset + 4)];
};

describe('raster transcoder', () => {
  describe('declaration', () => {
    it('should declare id raster with every source to every target as one edge each', () => {
      expect(rasterTranscoder().id).toBe('raster');
      const pairs = definition.edges.map(({ from, to }) => `${from}→${to}`);
      const sources = ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'];
      expect(pairs.toSorted()).toEqual(
        sources.flatMap((from) => ['jpeg', 'png', 'webp'].map((to) => `${from}→${to}`)).toSorted(),
      );
      expect(definition.edges.every((edge) => !('fidelity' in edge))).toBe(true);
    });

    it('should pin every WASM file it loads with its SHA-256', async () => {
      const assets = definition.implementationAssets ?? [];
      expect(assets.map(({ id }) => id).toSorted()).toEqual([
        'wasm:avif_dec',
        'wasm:mozjpeg_dec',
        'wasm:mozjpeg_enc',
        'wasm:squoosh_png_bg',
        'wasm:squoosh_resize_bg',
        'wasm:webp_dec',
        'wasm:webp_enc',
      ]);
      const { createHash } = await import('node:crypto');
      for (const asset of assets) {
        // oxlint-disable-next-line no-await-in-loop -- each digest names its own asset in the failure
        const bytes = new Uint8Array(await loadWasmBinary(asset.url));
        expect({ id: asset.id, sha256: createHash('sha256').update(bytes).digest('hex') }).toEqual({
          id: asset.id,
          sha256: asset.sha256,
        });
      }
    });

    it('should load no codec during initialize', async () => {
      const { compile, urls } = createCompiler();
      createRasterContext(compile);
      expect(urls).toEqual([]);
      const context = await definition.initialize({}, createServices());
      expect(Object.keys(context as Record<string, unknown>).toSorted()).toEqual(['decoders', 'encoders']);
    });

    it('should load only the codecs the format pair needs, once per context', async () => {
      const { compile, urls } = createCompiler();
      const context = createRasterContext(compile);
      const request: Request = {
        from: 'png',
        to: 'png',
        options: {},
        files: [{ name: 'a.png', bytes: fixture('small.png'), mimeType: 'image/png' }],
      };
      outputOf(await definition.transcode(request, createServices(), context));
      outputOf(await definition.transcode(request, createServices(), context));
      expect(urls).toEqual(['squoosh_png_bg.wasm', 'squoosh_png_bg.wasm']);
    });
  });

  describe('limits and safety', () => {
    it('should refuse a 16384×16384 PNG from its header in under 100 ms without loading a decoder', async () => {
      const { compile, urls } = createCompiler();
      const started = performance.now();
      const issue = issueOf(
        await run({ from: 'png', to: 'jpeg', options: {}, bytes: fixture('bomb-268mp-head.png') }, compile),
      );
      const elapsed = performance.now() - started;

      expect(issue).toMatchObject({
        message: 'PNG of 16384×16384 exceeds the 50000000-pixel limit',
        details: { type: 'transcode', code: 'limit' },
      });
      expect(elapsed).toBeLessThan(100);
      expect(urls).toEqual([]);
    });

    it('should let maxPixels lower the pixel limit but never raise it', async () => {
      const lowered = issueOf(
        await run({ from: 'png', to: 'png', options: { maxPixels: 1000 }, bytes: fixture('small.png') }),
      );
      expect(lowered?.message).toBe('PNG of 1200×800 exceeds the 1000-pixel limit');

      const raised = issueOf(
        await run({
          from: 'png',
          to: 'png',
          options: { maxPixels: 300_000_000 },
          bytes: fixture('bomb-268mp-head.png'),
        }),
      );
      expect(raised?.details).toEqual({ type: 'transcode', code: 'input' });
      expect(raised?.message).toContain('maxPixels');
    });

    it('should refuse an input larger than 64 MiB before reading its header', async () => {
      const { compile, urls } = createCompiler();
      const bytes = new Uint8Array(rasterMaxInputBytes + 1);
      bytes.set(fixture('small.png').subarray(0, 64));
      const issue = issueOf(await run({ from: 'png', to: 'jpeg', options: {}, bytes }, compile));

      expect(issue?.message).toBe(`PNG input of ${rasterMaxInputBytes + 1} bytes exceeds the 67108864-byte limit`);
      expect(urls).toEqual([]);
    });

    it('should refuse an animated WebP by name before decoding', async () => {
      const { compile, urls } = createCompiler();
      const issue = issueOf(await run({ from: 'webp', to: 'jpeg', options: {}, bytes: fixture('anim.webp') }, compile));

      expect(issue).toMatchObject({
        message: 'Animated WebP is not supported; export one frame as PNG or JPEG',
        details: { type: 'transcode', code: 'unsupported' },
      });
      expect(urls).toEqual([]);
    });

    it('should convert a CMYK JPEG through the pure-JavaScript decoder with a red square centre', async () => {
      expect(probeImage(fixture('cmyk.jpg'))?.components).toBe(4);
      const { compile, urls } = createCompiler();
      const output = outputOf(await run({ from: 'jpeg', to: 'png', options: {}, bytes: fixture('cmyk.jpg') }, compile));
      const image = await pixelsOf(output.bytes);
      // The card's red square spans x 100–499 and y 200–599.
      const [red, green, blue] = pixelAt(image, 300, 400);

      expect(urls).not.toContain('mozjpeg_dec.wasm');
      expect(red).toBeGreaterThan(200);
      expect(green).toBeLessThan(60);
      expect(blue).toBeLessThan(60);
    });

    it('should apply EXIF orientation 6 so exif-rotated.jpg comes out 800×1200', async () => {
      const output = outputOf(await run({ from: 'jpeg', to: 'jpeg', options: {}, bytes: fixture('exif-rotated.jpg') }));
      expect(probeImage(output.bytes)).toMatchObject({ format: 'jpeg', width: 800, height: 1200 });
    });

    it('should accept a truncated JPEG, whose missing rows decode grey', async () => {
      const output = outputOf(await run({ from: 'jpeg', to: 'png', options: {}, bytes: fixture('truncated.jpg') }));
      const image = await pixelsOf(output.bytes);
      expect(pixelAt(image, 10, image.height - 2)).toEqual([128, 128, 128, 255]);
    });

    it('should take the first frame of an animated GIF', async () => {
      const output = outputOf(await run({ from: 'gif', to: 'png', options: {}, bytes: fixture('anim.gif') }));
      const image = await pixelsOf(output.bytes);
      expect(pixelAt(image, 160, 120)).toEqual([255, 0, 0, 255]);
    });

    it('should fail when a decoder returns no image', async () => {
      const context = createRasterContext(createCompiler().compile);
      const result = await definition.transcode(
        {
          from: 'tiff',
          to: 'png',
          options: {},
          // A valid TIFF header whose only directory holds no image data.
          files: [{ name: 'empty.tiff', bytes: emptyTiff(), mimeType: 'image/tiff' }],
        } as Request,
        createServices(),
        context,
      );
      expect(issueOf(result)?.details).toEqual({ type: 'transcode', code: 'decode' });
      expect(issueOf(result)?.message).toMatch(/^TIFF decoding failed: /u);
    });
  });

  describe('admission', () => {
    it('should refuse bytes that are not the declared format and name both formats', async () => {
      const issue = issueOf(await run({ from: 'jpeg', to: 'png', options: {}, bytes: fixture('small.webp') }));
      expect(issue?.message).toBe('The source was declared JPEG but its bytes are WebP');
    });

    it('should refuse unreadable bytes', async () => {
      const issue = issueOf(await run({ from: 'gif', to: 'png', options: {}, bytes: new Uint8Array([1, 2, 3]) }));
      expect(issue).toMatchObject({
        message: 'The source is not a readable GIF image',
        details: { type: 'transcode', code: 'input' },
      });
    });

    it('should refuse anything but exactly one source file', async () => {
      const empty: Request = { from: 'png', to: 'png', options: {}, files: [] };
      const result = await definition.transcode(empty, createServices(), createRasterContext(createCompiler().compile));
      expect(issueOf(result)?.message).toBe('Raster transcoding expected exactly one source image, received 0');
    });

    it('should refuse unknown options', async () => {
      const issue = issueOf(
        await run({ from: 'png', to: 'png', options: { quality: 0.5 }, bytes: fixture('small.png') }),
      );
      expect(issue?.details).toEqual({ type: 'transcode', code: 'input' });
    });
  });

  describe('output', () => {
    it('should name the output after the source with the target extension', async () => {
      const output = outputOf(
        await run({ from: 'png', to: 'webp', options: {}, bytes: fixture('small.png'), name: 'shots/card.final.png' }),
      );
      expect(output).toMatchObject({ name: 'card.final.webp', mimeType: 'image/webp' });
    });

    it('should composite transparency on the background for JPEG and keep it for PNG and WebP', async () => {
      const asPng = await pixelsOf(
        outputOf(await run({ from: 'png', to: 'png', options: {}, bytes: fixture('alpha.png') })).bytes,
      );
      expect(pixelAt(asPng, 5, 5)[3]).toBe(0);

      const jpeg = outputOf(await run({ from: 'png', to: 'jpeg', options: {}, bytes: fixture('alpha.png') }));
      const flattened = await pixelsOf(
        outputOf(await run({ from: 'jpeg', to: 'png', options: {}, bytes: jpeg.bytes })).bytes,
      );
      expect(pixelAt(flattened, 5, 5)).toEqual([255, 255, 255, 255]);
    });

    it('should step quality down the ladder, then shrink to 800 px, to fit maxBytes', async () => {
      const full = outputOf(await run({ from: 'png', to: 'jpeg', options: {}, bytes: fixture('small.png') }));
      const stepped = outputOf(
        await run({ from: 'png', to: 'jpeg', options: { maxBytes: 16_000 }, bytes: fixture('small.png') }),
      );
      const shrunk = outputOf(
        await run({ from: 'png', to: 'jpeg', options: { maxBytes: 9000 }, bytes: fixture('small.png') }),
      );

      expect(full.bytes.length).toBeGreaterThan(16_000);
      expect(stepped.bytes.length).toBeLessThanOrEqual(16_000);
      expect(probeImage(stepped.bytes)).toMatchObject({ width: 1200, height: 800 });
      expect(shrunk.bytes.length).toBeLessThanOrEqual(9000);
      expect(probeImage(shrunk.bytes)).toMatchObject({ width: 800, height: 533 });
    });

    it('should fail a PNG over maxBytes and a JPEG that cannot fit even at 800 px', async () => {
      const png = issueOf(
        await run({ from: 'png', to: 'png', options: { maxBytes: 1000 }, bytes: fixture('small.png') }),
      );
      expect(png).toMatchObject({
        message: 'PNG output of 37410 bytes exceeds the 1000-byte limit',
        details: { type: 'transcode', code: 'size' },
      });

      const jpeg = issueOf(
        await run({ from: 'png', to: 'jpeg', options: { maxBytes: 100 }, bytes: fixture('small.png') }),
      );
      expect(jpeg?.message).toMatch(/^JPEG output of \d+ bytes exceeds the 100-byte limit$/u);
    });
  });
});

/** A little-endian TIFF with one directory that declares a 4×4 image but no strips. */
function emptyTiff(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8 + 2 + 3 * 12 + 4);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 3, true);
  const entries: Array<[number, number, number]> = [
    [256, 3, 4],
    [257, 3, 4],
    [262, 3, 2],
  ];
  for (const [index, [tag, type, value]] of entries.entries()) {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint16(offset + 8, value, true);
  }
  return bytes;
}

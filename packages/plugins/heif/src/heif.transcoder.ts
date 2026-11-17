/**
 * HEIF Transcoder
 *
 * Converts HEIC/HEIF stills to JPEG, PNG or WebP. A request is admitted from the container header before anything
 * is decoded: the buffer size and the pixel count read from the image's `ispe` property. libheif decodes the primary
 * image to eight-bit RGBA with its rotation and mirror applied, and `encodeRasterImage` from `@taucad/image` fits,
 * mattes and encodes it, so the output matches what the raster transcoder produces for the same pixels.
 *
 * Blueprint: docs/research/composer-image-format-support.md (Final Design, WP7)
 */

import { probeImage } from '@taucad/utils/image-probe';
import type { ImageProbe } from '@taucad/utils/image-probe';
import { defineTranscoder } from '@taucad/runtime/transcoder';
import type { ImplementationAssetLoader, TranscodeInput, TranscodeResult } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import {
  createRasterEncoders,
  encodeRasterImage,
  rasterEncoderAssets,
  rasterJpegOptionsSchema,
  rasterMaxInputBytes,
  rasterMaxPixels,
  rasterPngOptionsSchema,
  rasterTargetExtensions,
  rasterWebpOptionsSchema,
  RasterImageError,
} from '@taucad/image/raster';
import type { RasterEncodeRequest, RasterEncoders, RasterImage } from '@taucad/image/raster';
import { createHeifDecoder, libheifAsset } from '#heif-decoder.js';
import type { HeifDecoder, HeifWasmCompiler } from '#heif-decoder.js';

const jpeg = rasterJpegOptionsSchema;
const png = rasterPngOptionsSchema;
const webp = rasterWebpOptionsSchema;

/**
 * Both names a HEIF still goes by, to every target `encodeRasterImage` writes. `heic` is the name the image probe
 * gives the container; `heif` is accepted for callers that name a source by its `.heif` extension.
 */
const edges = [
  { from: 'heic', to: 'jpeg', optionsSchema: jpeg },
  { from: 'heic', to: 'png', optionsSchema: png },
  { from: 'heic', to: 'webp', optionsSchema: webp },
  { from: 'heif', to: 'jpeg', optionsSchema: jpeg },
  { from: 'heif', to: 'png', optionsSchema: png },
  { from: 'heif', to: 'webp', optionsSchema: webp },
] as const;

/** Source formats the HEIF transcoder decodes. @public */
export const heifSourceFormats = ['heic', 'heif'] as const;

const failure = (error: RasterImageError): TranscodeResult => ({
  success: false,
  issues: [
    {
      message: error.message,
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'error',
      details: { type: 'transcode', code: error.code },
    },
  ],
});

/**
 * Admit one source from its header, before libheif is loaded.
 *
 * @param bytes - The source file.
 * @param maxPixels - The caller's pixel limit, never above 50 megapixels.
 * @returns The header facts.
 * @throws {RasterImageError} When the source is too large, unreadable, not HEIF or over the pixel limit.
 */
const admit = (bytes: Uint8Array<ArrayBuffer>, maxPixels: number): ImageProbe => {
  if (bytes.byteLength > rasterMaxInputBytes) {
    throw new RasterImageError(
      'limit',
      `HEIC input of ${bytes.byteLength} bytes exceeds the ${rasterMaxInputBytes}-byte limit`,
    );
  }
  const probe = probeImage(bytes);
  if (probe === undefined) {
    throw new RasterImageError('input', 'The source is not a readable HEIC image');
  }
  if (probe.format !== 'heic') {
    throw new RasterImageError('input', `The source was declared HEIC but its bytes are ${probe.format}`);
  }
  const limit = Math.min(maxPixels, rasterMaxPixels);
  if (probe.width * probe.height > limit) {
    throw new RasterImageError('limit', `HEIC of ${probe.width}×${probe.height} exceeds the ${limit}-pixel limit`);
  }
  return probe;
};

const encodeRequest = (input: TranscodeInput<typeof edges>): RasterEncodeRequest => {
  switch (input.to) {
    case 'jpeg': {
      return { to: 'jpeg', options: input.options };
    }
    case 'png': {
      return { to: 'png', options: input.options };
    }
    case 'webp': {
      return { to: 'webp', options: input.options };
    }
  }
};

const outputName = (sourceName: string, to: keyof typeof rasterTargetExtensions): string => {
  const stem = sourceName.replace(/^.*\//u, '').replace(/\.[^.]*$/u, '');
  return `${stem === '' ? 'image' : stem}.${rasterTargetExtensions[to]}`;
};

type HeifContext = {
  readonly decoder: HeifDecoder;
  readonly encoders: RasterEncoders;
};

/**
 * Compile each WASM file from the bytes the runtime fetched and checked against the asset's pinned digest.
 *
 * @param loader - The runtime's implementation asset loader.
 * @returns A compiler that never compiles unverified bytes.
 */
const verifiedCompiler =
  (loader: ImplementationAssetLoader | undefined): HeifWasmCompiler =>
  async ({ id }) => {
    if (loader === undefined) {
      throw new RasterImageError('decode', 'The HEIF transcoder needs the runtime to load its codecs');
    }
    return WebAssembly.compile(await loader.load(id));
  };

/** HEIC/HEIF transcoder: HEIF stills to JPEG, PNG and WebP. @public */
export const heifTranscoder = defineTranscoder({
  id: 'heif',
  name: 'HeifTranscoder',
  // Bump whenever output bytes change for identical input and options (libheif-js, a raster encoder or an encode
  // setting), or persisted export caches keep serving the previous bytes. golden.json changes in the same commit.
  version: '1.0.0',
  implementationAssets: [libheifAsset, ...rasterEncoderAssets],
  // The libheif WASM file is fetched and checked on the first HEIC image, and each encoder on the first output
  // that needs it.
  implementationAssetLoading: 'on-use',
  edges,

  async initialize(_options, { implementationAssets: loader }) {
    const compile = verifiedCompiler(loader);
    return { decoder: createHeifDecoder(compile), encoders: createRasterEncoders(compile) } satisfies HeifContext;
  },

  async transcode(input, services, context: HeifContext): Promise<TranscodeResult> {
    if (input.files.length !== 1) {
      return failure(
        new RasterImageError(
          'input',
          `HEIC transcoding expected exactly one source image, received ${input.files.length}`,
        ),
      );
    }
    const [file] = input.files as [ExportFile];
    const parsedOptions = (input.to === 'jpeg' ? jpeg : input.to === 'png' ? png : webp).safeParse(input.options);
    if (!parsedOptions.success) {
      return failure(new RasterImageError('input', parsedOptions.error.message));
    }
    const span = services.tracer.startSpan('heif.transcode', { from: input.from, to: input.to });
    try {
      const probe = admit(file.bytes, parsedOptions.data.maxPixels);
      services.logger.log(`Converting HEIC ${probe.width}×${probe.height} → ${input.to}`);
      let image: RasterImage;
      try {
        image = await context.decoder.decode(file.bytes);
      } catch (error) {
        if (error instanceof RasterImageError) {
          throw error;
        }
        throw new RasterImageError(
          'decode',
          `HEIC decoding failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      const encoded = await encodeRasterImage(context.encoders, image, encodeRequest(input));
      return {
        success: true,
        data: [{ name: outputName(file.name, input.to), mimeType: encoded.mimeType, bytes: encoded.bytes }],
        issues: [],
      };
    } catch (error) {
      return failure(
        error instanceof RasterImageError ? error : new RasterImageError('decode', String(error), { cause: error }),
      );
    } finally {
      span.end();
    }
  },
});

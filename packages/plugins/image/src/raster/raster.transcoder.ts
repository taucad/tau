/**
 * Raster Transcoder
 *
 * Converts JPEG, PNG, WebP, GIF, AVIF, BMP and TIFF to JPEG, PNG or WebP with one portable implementation per
 * codec, so every host produces the same bytes. A request is admitted from the image header before anything is
 * decoded: the buffer size, the pixel count and the variants that crash or fool a codec (CMYK JPEG goes to a
 * pure-JavaScript decoder; animated WebP is refused by name). Decoding yields eight-bit RGBA, which
 * {@link encodeRasterImage} fits, mattes and encodes.
 *
 * Blueprint: docs/research/composer-image-format-support.md (Final Design, WP3)
 */

import { probeImage } from '@taucad/utils/image-probe';
import type { ImageProbe } from '@taucad/utils/image-probe';
import { defineTranscoder } from '@taucad/runtime/transcoder';
import type { ImplementationAssetLoader, TranscodeInput, TranscodeResult } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import type { RasterDecoders, WasmCompiler } from '#raster/raster-codecs.js';
import {
  createRasterDecoders,
  createRasterEncoders,
  rasterDecoderAssets,
  rasterEncoderAssets,
} from '#raster/raster-codecs.js';
import { encodeRasterImage, RasterImageError } from '#raster/raster-encode.js';
import type { RasterEncodeRequest } from '#raster/raster-encode.js';
import type { RasterImage } from '#raster/raster-image.js';
import {
  rasterJpegOptionsSchema,
  rasterMaxInputBytes,
  rasterMaxPixels,
  rasterPngOptionsSchema,
  rasterTargetExtensions,
  rasterWebpOptionsSchema,
} from '#raster/raster-options.js';
import type { RasterSourceFormat } from '#raster/raster-options.js';

const jpeg = rasterJpegOptionsSchema;
const png = rasterPngOptionsSchema;
const webp = rasterWebpOptionsSchema;

/** Every source format to every target format: one edge per pair, each with its target's options. */
const edges = [
  { from: 'jpeg', to: 'jpeg', optionsSchema: jpeg },
  { from: 'png', to: 'jpeg', optionsSchema: jpeg },
  { from: 'webp', to: 'jpeg', optionsSchema: jpeg },
  { from: 'gif', to: 'jpeg', optionsSchema: jpeg },
  { from: 'avif', to: 'jpeg', optionsSchema: jpeg },
  { from: 'bmp', to: 'jpeg', optionsSchema: jpeg },
  { from: 'tiff', to: 'jpeg', optionsSchema: jpeg },
  { from: 'jpeg', to: 'png', optionsSchema: png },
  { from: 'png', to: 'png', optionsSchema: png },
  { from: 'webp', to: 'png', optionsSchema: png },
  { from: 'gif', to: 'png', optionsSchema: png },
  { from: 'avif', to: 'png', optionsSchema: png },
  { from: 'bmp', to: 'png', optionsSchema: png },
  { from: 'tiff', to: 'png', optionsSchema: png },
  { from: 'jpeg', to: 'webp', optionsSchema: webp },
  { from: 'png', to: 'webp', optionsSchema: webp },
  { from: 'webp', to: 'webp', optionsSchema: webp },
  { from: 'gif', to: 'webp', optionsSchema: webp },
  { from: 'avif', to: 'webp', optionsSchema: webp },
  { from: 'bmp', to: 'webp', optionsSchema: webp },
  { from: 'tiff', to: 'webp', optionsSchema: webp },
] as const;

const formatNames: Readonly<Record<string, string>> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  heic: 'HEIC',
  psd: 'Photoshop (PSD)',
};

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
 * Admit one source from its header, before any codec is loaded.
 *
 * @param bytes - The source file.
 * @param request - The declared source format and the pixel limit.
 * @returns The header facts.
 * @throws {RasterImageError} When the source is too large, unreadable, not the declared format, over the pixel
 * limit or a variant no decoder handles.
 */
const admit = (
  bytes: Uint8Array<ArrayBuffer>,
  { from, maxPixels }: { readonly from: RasterSourceFormat; readonly maxPixels: number },
): ImageProbe => {
  const declared = formatNames[from]!;
  if (bytes.byteLength > rasterMaxInputBytes) {
    throw new RasterImageError(
      'limit',
      `${declared} input of ${bytes.byteLength} bytes exceeds the ${rasterMaxInputBytes}-byte limit`,
    );
  }
  const probe = probeImage(bytes);
  if (probe === undefined) {
    throw new RasterImageError('input', `The source is not a readable ${declared} image`);
  }
  if (probe.format !== from) {
    throw new RasterImageError(
      'input',
      `The source was declared ${declared} but its bytes are ${formatNames[probe.format] ?? probe.format}`,
    );
  }
  const limit = Math.min(maxPixels, rasterMaxPixels);
  if (probe.width * probe.height > limit) {
    throw new RasterImageError(
      'limit',
      `${declared} of ${probe.width}×${probe.height} exceeds the ${limit}-pixel limit`,
    );
  }
  if (from === 'webp' && probe.animated) {
    throw new RasterImageError('unsupported', 'Animated WebP is not supported; export one frame as PNG or JPEG');
  }
  return probe;
};

const decode = async (
  decoders: RasterDecoders,
  bytes: Uint8Array<ArrayBuffer>,
  { probe, maxPixels }: { readonly probe: ImageProbe; readonly maxPixels: number },
): Promise<RasterImage> => {
  switch (probe.format) {
    case 'jpeg': {
      // MozJPEG aborts on four-component (CMYK or YCCK) JPEG; the pure-JavaScript decoder reads it.
      return probe.components === 4 ? decoders.decodeCmykJpeg(bytes, maxPixels) : decoders.decodeJpeg(bytes);
    }
    case 'png': {
      return decoders.decodePng(bytes);
    }
    case 'webp': {
      return decoders.decodeWebp(bytes);
    }
    case 'avif': {
      return decoders.decodeAvif(bytes);
    }
    case 'gif': {
      return decoders.decodeGif(bytes);
    }
    case 'tiff': {
      return decoders.decodeTiff(bytes);
    }
    case 'bmp': {
      return decoders.decodeBmp(bytes, maxPixels);
    }
    default: {
      throw new RasterImageError('unsupported', `${formatNames[probe.format] ?? probe.format} is not supported`);
    }
  }
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

type RasterContext = {
  readonly decoders: RasterDecoders;
  readonly encoders: ReturnType<typeof createRasterEncoders>;
};

/**
 * Create the per-worker codec context. Exposed for tests that supply their own compiler.
 *
 * @param compile - Compiles a declared WASM file.
 * @returns Lazily loading decoders and encoders.
 */
export const createRasterContext = (compile: WasmCompiler): RasterContext => ({
  decoders: createRasterDecoders(compile),
  encoders: createRasterEncoders(compile),
});

/**
 * Compile each codec from the bytes the runtime fetched and checked against the asset's pinned digest.
 *
 * @param loader - The runtime's implementation asset loader.
 * @returns A compiler that never compiles unverified bytes.
 */
const verifiedCompiler =
  (loader: ImplementationAssetLoader | undefined): WasmCompiler =>
  async ({ id }) => {
    if (loader === undefined) {
      throw new RasterImageError('decode', 'The raster transcoder needs the runtime to load its codecs');
    }
    return WebAssembly.compile(await loader.load(id));
  };

const implementationAssets = [
  ...rasterDecoderAssets,
  ...rasterEncoderAssets.filter(({ id }) => !rasterDecoderAssets.some((asset) => asset.id === id)),
];

/** Raster image transcoder: seven source formats to JPEG, PNG and WebP. @public */
export const rasterTranscoder = defineTranscoder({
  id: 'raster',
  name: 'RasterTranscoder',
  // Bump whenever output bytes change for identical input and options (a codec release or an encode setting), or
  // persisted export caches keep serving the previous bytes. golden.json changes in the same commit.
  version: '1.0.0',
  implementationAssets,
  // A request needs one decoder and one encoder, so each WASM file is fetched and checked against its digest on the
  // first image that needs it rather than all seven before the first conversion.
  implementationAssetLoading: 'on-use',
  edges,

  async initialize(_options, { implementationAssets: loader }) {
    return createRasterContext(verifiedCompiler(loader));
  },

  async transcode(input, services, context: RasterContext): Promise<TranscodeResult> {
    if (input.files.length !== 1) {
      return failure(
        new RasterImageError(
          'input',
          `Raster transcoding expected exactly one source image, received ${input.files.length}`,
        ),
      );
    }
    const [file] = input.files as [ExportFile];
    const parsedOptions = (input.to === 'jpeg' ? jpeg : input.to === 'png' ? png : webp).safeParse(input.options);
    if (!parsedOptions.success) {
      return failure(new RasterImageError('input', parsedOptions.error.message));
    }
    const { maxPixels } = parsedOptions.data;
    const span = services.tracer.startSpan('raster.transcode', { from: input.from, to: input.to });
    try {
      const probe = admit(file.bytes, { from: input.from, maxPixels });
      services.logger.log(`Converting ${formatNames[input.from]} ${probe.width}×${probe.height} → ${input.to}`);
      let image: RasterImage;
      try {
        image = await decode(context.decoders, file.bytes, { probe, maxPixels });
      } catch (error) {
        if (error instanceof RasterImageError) {
          throw error;
        }
        throw new RasterImageError(
          'decode',
          `${formatNames[input.from]} decoding failed: ${error instanceof Error ? error.message : String(error)}`,
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

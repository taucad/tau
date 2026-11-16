/**
 * Lazily loaded raster codecs.
 *
 * Every WASM file is an implementation asset with a pinned SHA-256, addressed with `import.meta.resolve` so the
 * runtime's Vite plugin emits it. On the first image that needs a codec, its glue module is imported and its WASM
 * file is compiled, so no codec is in the package's static import graph. The raster transcoder fetches each file
 * through the runtime, which checks it against its digest on that first use. The compiled codec is kept by the
 * object that `initialize` returns, not by this module.
 */

import { compileWasmStreaming } from '@taucad/runtime/transcoder';
import type { RasterImage } from '#raster/raster-image.js';
import { ensureImageData } from '#raster/raster-image.js';

/**
 * A WASM file a codec loads, in the shape of a transcoder's `implementationAssets` entry: its digest takes part in
 * the identity of every artifact the transcoder produces.
 * @public
 */
export type RasterCodecAsset = { readonly id: string; readonly url: string; readonly sha256: string };

const mozjpegDecoderUrl = new URL(import.meta.resolve('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')).href;
const mozjpegEncoderUrl = new URL(import.meta.resolve('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm')).href;
const pngUrl = new URL(import.meta.resolve('@jsquash/png/codec/pkg/squoosh_png_bg.wasm')).href;
const webpDecoderUrl = new URL(import.meta.resolve('@jsquash/webp/codec/dec/webp_dec.wasm')).href;
const webpEncoderUrl = new URL(import.meta.resolve('@jsquash/webp/codec/enc/webp_enc.wasm')).href;
const avifDecoderUrl = new URL(import.meta.resolve('@jsquash/avif/codec/dec/avif_dec.wasm')).href;
const resizeUrl = new URL(import.meta.resolve('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm')).href;

const asset = (id: string, url: string, sha256: string): RasterCodecAsset => ({ id, url, sha256 });

const mozjpegEncoderAsset = asset(
  'wasm:mozjpeg_enc',
  mozjpegEncoderUrl,
  '24d4177f1c4963e2058b107189249651c61fdef125570e79b1dfb63c8bb49326',
);
const pngAsset = asset(
  'wasm:squoosh_png_bg',
  pngUrl,
  '263d6e658808a74b72a1a99c5cc1d619237e70c150db6e41d5d84d3d117ab9be',
);
const webpEncoderAsset = asset(
  'wasm:webp_enc',
  webpEncoderUrl,
  'b6085bb6702f144e9dc6016d58d230b34a84976bf0d080b7390b4b4b137d6ab7',
);
const resizeAsset = asset(
  'wasm:squoosh_resize_bg',
  resizeUrl,
  '5b1f702d502c4d0a70b99f78691bd554d566ba95859e4c57af5435955a1d74a5',
);
const mozjpegDecoderAsset = asset(
  'wasm:mozjpeg_dec',
  mozjpegDecoderUrl,
  'a7c4b12169817e779ff4af137981393ae924944e167ad1bd95747c9199162d3e',
);
const webpDecoderAsset = asset(
  'wasm:webp_dec',
  webpDecoderUrl,
  '30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344',
);
const avifDecoderAsset = asset(
  'wasm:avif_dec',
  avifDecoderUrl,
  '5c35dde23dfd862088a49a6b8a9fe81f9f9a1a46aaa27de7efd7baa7611c4b47',
);

/**
 * The WASM files {@link createRasterEncoders} loads: MozJPEG and libwebp encoders, the PNG codec and the resizer.
 * A transcoder that encodes through {@link encodeRasterImage} declares these among its implementation assets.
 * @public
 */
export const rasterEncoderAssets: readonly RasterCodecAsset[] = [
  mozjpegEncoderAsset,
  pngAsset,
  webpEncoderAsset,
  resizeAsset,
];

/** The WASM decoders the raster transcoder loads in addition to {@link rasterEncoderAssets}. */
export const rasterDecoderAssets: readonly RasterCodecAsset[] = [
  mozjpegDecoderAsset,
  webpDecoderAsset,
  avifDecoderAsset,
];

/**
 * Compiles one declared WASM file. In the raster transcoder it compiles the bytes the runtime fetched and verified
 * against the asset's pinned digest; {@link createRasterEncoders} on its own streams the asset's URL.
 * @public
 */
export type WasmCompiler = (asset: RasterCodecAsset) => Promise<WebAssembly.Module>;

type EmscriptenOverrides = {
  readonly noInitialRun: boolean;
  readonly instantiateWasm: (
    imports: WebAssembly.Imports,
    receive: (instance: WebAssembly.Instance) => void,
  ) => WebAssembly.Exports;
};

type EmscriptenFactory<Module> = (overrides: EmscriptenOverrides) => Promise<Module>;

type DecodedImageData = { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number };

type MozjpegDecoder = { decode(data: BufferSource, preserveOrientation: boolean): DecodedImageData | undefined };
type WebpDecoder = { decode(data: BufferSource): DecodedImageData | undefined };
type AvifDecoder = { decode(data: BufferSource, bitDepth: 8): DecodedImageData | undefined };
type EmscriptenEncoder<Options> = {
  encode(data: BufferSource, width: number, height: number, options: Options): Uint8Array<ArrayBuffer> | undefined;
};
type MozjpegEncodeOptions = Readonly<Record<string, number | boolean>>;
type WebpEncodeOptions = Readonly<Record<string, number>>;

/**
 * Instantiate an Emscripten module from an already compiled `WebAssembly.Module`, so the glue never fetches.
 *
 * @param factory - The glue module's default export.
 * @param module - The compiled WASM file.
 * @returns The ready module.
 */
const instantiateEmscripten = async <Module>(
  factory: EmscriptenFactory<Module>,
  module: WebAssembly.Module,
): Promise<Module> =>
  factory({
    noInitialRun: true,
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(module, imports);
      receive(instance);
      return instance.exports;
    },
  });

/**
 * Memoise one asynchronous load in the caller's closure; a failed load is retried on the next call.
 *
 * @param load - The load to run once.
 * @returns A function returning the load's shared promise.
 */
const lazily = <Value>(load: () => Promise<Value>): (() => Promise<Value>) => {
  let pending: Promise<Value> | undefined;
  const attempt = async (): Promise<Value> => {
    try {
      return await load();
    } catch (error) {
      pending = undefined;
      throw error;
    }
  };
  return async () => {
    pending ??= attempt();
    return pending;
  };
};

/**
 * The CommonJS readers expose their API on `default` when Node imports them, and as named exports under a bundler.
 *
 * @param module - The dynamically imported namespace.
 * @returns The API object.
 */
const interopDefault = <Namespace extends Record<string, unknown>>(module: Namespace): Namespace => {
  const commonJsExports: unknown = Reflect.get(module, 'default');
  return typeof commonJsExports === 'object' && commonJsExports !== null ? (commonJsExports as Namespace) : module;
};

const toImage = (decoded: DecodedImageData | undefined, format: string): RasterImage => {
  if (
    !decoded ||
    !(decoded.width > 0) ||
    !(decoded.height > 0) ||
    decoded.data.length !== decoded.width * decoded.height * 4
  ) {
    throw new Error(`The ${format} decoder returned no image`);
  }
  return {
    data: new Uint8ClampedArray(
      decoded.data.buffer,
      decoded.data.byteOffset,
      decoded.data.length,
    ) as Uint8ClampedArray<ArrayBuffer>,
    width: decoded.width,
    height: decoded.height,
  };
};

const ownedBytes = (bytes: ArrayLike<number> | undefined, format: string): Uint8Array<ArrayBuffer> => {
  if (!bytes || bytes.length === 0) {
    throw new Error(`The ${format} encoder returned no bytes`);
  }
  return new Uint8Array(bytes);
};

/**
 * Encoders and the resizer behind {@link encodeRasterImage}, each loaded on first use.
 * @public
 */
export type RasterEncoders = {
  /** Encode JPEG with MozJPEG at a quality from 0 to 100, baseline, standard Huffman optimisation. */
  readonly encodeJpeg: (image: RasterImage, quality: number) => Promise<Uint8Array<ArrayBuffer>>;
  /** Encode eight-bit RGBA PNG. */
  readonly encodePng: (image: RasterImage) => Promise<Uint8Array<ArrayBuffer>>;
  /** Encode lossy WebP with libwebp at a quality from 0 to 100, keeping alpha. */
  readonly encodeWebp: (image: RasterImage, quality: number) => Promise<Uint8Array<ArrayBuffer>>;
  /** Resample with Lanczos-3 on premultiplied sRGB values. */
  readonly resize: (image: RasterImage, width: number, height: number) => Promise<RasterImage>;
};

/**
 * Create the encoders and resizer. Nothing is loaded until a method is first called; each WASM file is then
 * compiled once and kept by the returned object. Create it in a transcoder's `initialize` and keep it in the
 * context, so a worker loads each codec at most once.
 *
 * @param compile - Compiles a declared WASM file. Defaults to streaming its URL with the runtime's helper.
 * @returns The lazily loading encoders.
 * @public
 */
export const createRasterEncoders = (
  compile: WasmCompiler = async ({ url }) => compileWasmStreaming(url),
): RasterEncoders => {
  ensureImageData();
  const jpeg = lazily(async () => {
    const [glue, meta, module] = await Promise.all([
      import('@jsquash/jpeg/codec/enc/mozjpeg_enc.js'),
      import('@jsquash/jpeg/meta.js'),
      compile(mozjpegEncoderAsset),
    ]);
    const encoder = await instantiateEmscripten(
      glue.default as unknown as EmscriptenFactory<EmscriptenEncoder<MozjpegEncodeOptions>>,
      module,
    );
    return { encoder, defaults: meta.defaultOptions };
  });
  const webp = lazily(async () => {
    const [glue, meta, module] = await Promise.all([
      import('@jsquash/webp/codec/enc/webp_enc.js'),
      import('@jsquash/webp/meta.js'),
      compile(webpEncoderAsset),
    ]);
    const encoder = await instantiateEmscripten(
      glue.default as unknown as EmscriptenFactory<EmscriptenEncoder<WebpEncodeOptions>>,
      module,
    );
    return { encoder, defaults: meta.defaultOptions };
  });
  const png = lazily(async () => loadPng(compile));
  const resizer = lazily(async () => {
    const [glue, module] = await Promise.all([
      import('@jsquash/resize/lib/resize/pkg/squoosh_resize.js'),
      compile(resizeAsset),
    ]);
    glue.initSync(module);
    return glue;
  });

  return {
    async encodeJpeg(image, quality) {
      const { encoder, defaults } = await jpeg();
      return ownedBytes(
        encoder.encode(image.data, image.width, image.height, { ...defaults, quality, progressive: false }),
        'JPEG',
      );
    },
    async encodePng(image) {
      const glue = await png();
      return ownedBytes(
        glue.encode(
          new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length),
          image.width,
          image.height,
          8,
        ),
        'PNG',
      );
    },
    async encodeWebp(image, quality) {
      const { encoder, defaults } = await webp();
      return ownedBytes(encoder.encode(image.data, image.width, image.height, { ...defaults, quality }), 'WebP');
    },
    async resize(image, width, height) {
      const glue = await resizer();
      const lanczos3 = 3;
      const data = glue.resize(
        new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length),
        image.width,
        image.height,
        width,
        height,
        lanczos3,
        true,
        false,
      );
      return toImage({ data, width, height }, 'resize');
    },
  };
};

const loadPng = async (compile: WasmCompiler) => {
  const [glue, module] = await Promise.all([import('@jsquash/png/codec/pkg/squoosh_png.js'), compile(pngAsset)]);
  glue.initSync(module);
  return glue;
};

/**
 * Decoders of the raster transcoder, each loaded on first use. Pure JavaScript readers (CMYK JPEG, GIF, TIFF) and
 * the BMP reader are imported dynamically too.
 */
export type RasterDecoders = {
  readonly decodeJpeg: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeCmykJpeg: (bytes: Uint8Array<ArrayBuffer>, maxPixels: number) => Promise<RasterImage>;
  readonly decodePng: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeWebp: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeAvif: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeGif: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeTiff: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
  readonly decodeBmp: (bytes: Uint8Array<ArrayBuffer>, maxPixels: number) => Promise<RasterImage>;
};

/**
 * Create the decoders. Nothing is loaded until a method is first called.
 *
 * @param compile - Compiles a declared WASM file.
 * @returns The lazily loading decoders.
 */
export const createRasterDecoders = (compile: WasmCompiler): RasterDecoders => {
  ensureImageData();
  const jpeg = lazily(async () => {
    const [glue, module] = await Promise.all([
      import('@jsquash/jpeg/codec/dec/mozjpeg_dec.js'),
      compile(mozjpegDecoderAsset),
    ]);
    return instantiateEmscripten(glue.default as unknown as EmscriptenFactory<MozjpegDecoder>, module);
  });
  const webp = lazily(async () => {
    const [glue, module] = await Promise.all([
      import('@jsquash/webp/codec/dec/webp_dec.js'),
      compile(webpDecoderAsset),
    ]);
    return instantiateEmscripten(glue.default as unknown as EmscriptenFactory<WebpDecoder>, module);
  });
  const avif = lazily(async () => {
    const [glue, module] = await Promise.all([
      import('@jsquash/avif/codec/dec/avif_dec.js'),
      compile(avifDecoderAsset),
    ]);
    return instantiateEmscripten(glue.default as unknown as EmscriptenFactory<AvifDecoder>, module);
  });
  const png = lazily(async () => loadPng(compile));

  return {
    async decodeJpeg(bytes) {
      // `preserveOrientation: true` makes MozJPEG apply the EXIF orientation (the name is misleading; measured).
      const decoder = await jpeg();
      return toImage(decoder.decode(bytes, true), 'JPEG');
    },
    async decodeCmykJpeg(bytes, maxPixels) {
      const { decode } = interopDefault(await import('jpeg-js'));
      /* eslint-disable @typescript-eslint/naming-convention -- jpeg-js option names */
      const decoded = decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        tolerantDecoding: true,
        maxResolutionInMP: maxPixels / 1_000_000,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- end of jpeg-js option names */
      return toImage(
        {
          data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
          width: decoded.width,
          height: decoded.height,
        },
        'CMYK JPEG',
      );
    },
    async decodePng(bytes) {
      const glue = await png();
      return toImage(glue.decode(bytes) as DecodedImageData | undefined, 'PNG');
    },
    async decodeWebp(bytes) {
      const decoder = await webp();
      return toImage(decoder.decode(bytes), 'WebP');
    },
    async decodeAvif(bytes) {
      const decoder = await avif();
      return toImage(decoder.decode(bytes, 8), 'AVIF');
    },
    async decodeGif(bytes) {
      const { GifReader: gifReader } = interopDefault(await import('omggif'));
      // oxlint-disable-next-line new-cap -- The dynamically imported class is held in a camel-case variable by naming policy.
      const reader = new gifReader(bytes);
      const data = new Uint8ClampedArray(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(0, data);
      return toImage({ data, width: reader.width, height: reader.height }, 'GIF');
    },
    async decodeTiff(bytes) {
      const utif = interopDefault(await import('utif2'));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const [first] = utif.decode(buffer);
      if (first === undefined) {
        throw new Error('The TIFF has no image');
      }
      utif.decodeImage(buffer, first);
      const rgba = utif.toRGBA8(first);
      return toImage(
        {
          data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length),
          width: first.width,
          height: first.height,
        },
        'TIFF',
      );
    },
    async decodeBmp(bytes, maxPixels) {
      const { decodeBmp } = await import('#raster/bmp-decoder.js');
      return decodeBmp(bytes, maxPixels);
    },
  };
};

/**
 * The HEIC decoder, libheif, loaded on first use.
 *
 * `libheif-js` is an external LGPL-3.0 dependency. Its non-bundled Emscripten glue is imported dynamically, and its
 * `libheif.wasm` is a separate implementation asset with a pinned SHA-256, compiled from the bytes the runtime
 * fetched and verified. The base64-inlined bundle the package also ships is never imported, so the WASM file stays a
 * separate, replaceable file (blueprint invariant I7).
 */

import type { RasterCodecAsset, RasterImage } from '@taucad/image/raster';
import { RasterImageError } from '@taucad/image/raster';

const libheifUrl = new URL(import.meta.resolve('libheif-js/libheif-wasm/libheif.wasm')).href;

/**
 * The libheif WASM file: libheif 1.23.5 with libde265 1.0.15, as compiled into `libheif-js` 1.23.5. Its digest takes part in the identity
 * of every artifact the transcoder produces.
 */
export const libheifAsset: RasterCodecAsset = {
  id: 'wasm:libheif',
  url: libheifUrl,
  sha256: '184d3d20f8323877f13e9f5254f9c6a0ce272c9a3a2f823b0b2bcd2ee9f73f80',
};

/** Compiles one declared WASM file from bytes the runtime verified. */
export type HeifWasmCompiler = (asset: RasterCodecAsset) => Promise<WebAssembly.Module>;

type HeifEnumValue = { readonly value: number };

type HeifError = { readonly code: HeifEnumValue | number; readonly message: string };

type HeifChannel = {
  readonly id: HeifEnumValue | number;
  readonly data: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
  readonly stride: number;
};

type HeifDecodedImage = {
  readonly image: unknown;
  readonly code?: unknown;
  readonly channels?: readonly HeifChannel[];
};

/* eslint-disable @typescript-eslint/naming-convention -- libheif's embind names */
/** The part of libheif's embind API the decoder calls. */
type Libheif = {
  readonly heif_get_version: () => string;
  readonly heif_context_alloc: () => unknown;
  readonly heif_context_free: (context: unknown) => void;
  readonly heif_context_read_from_memory: (context: unknown, bytes: Uint8Array<ArrayBuffer>) => HeifError;
  readonly heif_js_context_get_primary_image_handle: (context: unknown) => unknown;
  readonly heif_image_handle_get_width: (handle: unknown) => number;
  readonly heif_image_handle_get_height: (handle: unknown) => number;
  readonly heif_image_handle_release: (handle: unknown) => void;
  readonly heif_js_decode_image2: (handle: unknown, colorspace: unknown, chroma: unknown) => HeifDecodedImage;
  readonly heif_image_release: (image: unknown) => void;
  readonly heif_colorspace: { readonly heif_colorspace_RGB: unknown };
  readonly heif_chroma: { readonly heif_chroma_interleaved_RGBA: unknown };
  readonly heif_channel: { readonly heif_channel_interleaved: HeifEnumValue | number };
};
/* eslint-enable @typescript-eslint/naming-convention -- end of libheif's embind names */

type LibheifFactory = (overrides: {
  readonly instantiateWasm: (
    imports: WebAssembly.Imports,
    receive: (instance: WebAssembly.Instance) => void,
  ) => WebAssembly.Exports;
}) => Promise<Libheif>;

const enumValue = (value: HeifEnumValue | number): number => (typeof value === 'number' ? value : value.value);

/**
 * The Emscripten glue is CommonJS: Node exposes `module.exports` as `default`, a bundler may expose it directly.
 *
 * @param module - The dynamically imported namespace.
 * @returns The module factory.
 */
const factoryOf = (module: unknown): LibheifFactory => {
  const candidate: unknown =
    typeof module === 'function' || typeof module !== 'object' || module === null
      ? module
      : Reflect.get(module, 'default');
  if (typeof candidate !== 'function') {
    throw new TypeError('libheif-js did not export its module factory');
  }
  return candidate as LibheifFactory;
};

/** The decoder behind the HEIF transcoder. */
export type HeifDecoder = {
  /**
   * Decode the primary image to eight-bit RGBA, with the container's rotation (`irot`), mirror (`imir`) and crop
   * (`clap`) applied.
   */
  readonly decode: (bytes: Uint8Array<ArrayBuffer>) => Promise<RasterImage>;
};

/**
 * Create the decoder. Nothing is loaded until the first decode; the WASM module is then compiled once and kept by
 * the returned object, which the transcoder keeps in its per-worker context.
 *
 * @param compile - Compiles {@link libheifAsset} from verified bytes.
 * @returns The lazily loading decoder.
 */
export const createHeifDecoder = (compile: HeifWasmCompiler): HeifDecoder => {
  let pending: Promise<Libheif> | undefined;
  const load = async (): Promise<Libheif> => {
    const [glue, module] = await Promise.all([import('libheif-js/libheif-wasm/libheif.js'), compile(libheifAsset)]);
    return factoryOf(glue)({
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(module, imports);
        receive(instance);
        return instance.exports;
      },
    });
  };
  const attempt = async (): Promise<Libheif> => {
    try {
      return await load();
    } catch (error) {
      // A failed load is retried on the next image.
      pending = undefined;
      throw error;
    }
  };

  return {
    async decode(bytes) {
      pending ??= attempt();
      const libheif = await pending;
      const context = libheif.heif_context_alloc();
      let handle: unknown;
      let decoded: HeifDecodedImage | undefined;
      try {
        const read = libheif.heif_context_read_from_memory(context, bytes);
        if (enumValue(read.code) !== 0) {
          throw new RasterImageError('decode', `HEIC decoding failed: ${read.message}`);
        }
        handle = libheif.heif_js_context_get_primary_image_handle(context);
        if (!isHandle(handle)) {
          throw new RasterImageError('decode', 'HEIC decoding failed: the file has no primary image');
        }
        decoded = libheif.heif_js_decode_image2(
          handle,
          libheif.heif_colorspace.heif_colorspace_RGB,
          libheif.heif_chroma.heif_chroma_interleaved_RGBA,
        );
        return toRgba(libheif, decoded);
      } finally {
        if (decoded?.image !== undefined) {
          libheif.heif_image_release(decoded.image);
        }
        if (isHandle(handle)) {
          libheif.heif_image_handle_release(handle);
        }
        libheif.heif_context_free(context);
      }
    },
  };
};

/**
 * A libheif call that fails returns a `heif_error` object, which carries `code`, instead of a handle.
 *
 * @param value - What the call returned.
 * @returns Whether it is a handle.
 */
const isHandle = (value: unknown): boolean => typeof value === 'object' && value !== null && !('code' in value);

/**
 * Copy the interleaved RGBA plane out of libheif's memory, dropping any row padding.
 *
 * @param libheif - The loaded module.
 * @param decoded - What `heif_js_decode_image2` returned.
 * @returns Eight-bit RGBA pixels owned by JavaScript.
 * @throws {RasterImageError} When libheif returned no usable plane.
 */
const toRgba = (libheif: Libheif, decoded: HeifDecodedImage | undefined): RasterImage => {
  if (decoded?.code !== undefined) {
    throw new RasterImageError('decode', 'HEIC decoding failed: libheif returned no image');
  }
  const interleaved = enumValue(libheif.heif_channel.heif_channel_interleaved);
  const channel = decoded?.channels?.find(({ id }) => enumValue(id) === interleaved);
  if (
    channel === undefined ||
    !(channel.width > 0) ||
    !(channel.height > 0) ||
    channel.stride < channel.width * 4 ||
    channel.data.length < channel.stride * (channel.height - 1) + channel.width * 4
  ) {
    throw new RasterImageError('decode', 'HEIC decoding failed: libheif returned no RGBA plane');
  }
  const { width, height, stride } = channel;
  const row = width * 4;
  const data = new Uint8ClampedArray(row * height);
  for (let y = 0; y < height; y += 1) {
    data.set(channel.data.subarray(y * stride, y * stride + row), y * row);
  }
  return { data, width, height };
};

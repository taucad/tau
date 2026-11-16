/** The resize, matte and encode half of a raster conversion, shared by every transcoder that decodes to RGBA. */

import type { z } from 'zod';
import type { RasterEncoders } from '#raster/raster-codecs.js';
import type { RasterImage } from '#raster/raster-image.js';
import {
  rasterJpegOptionsSchema,
  rasterLastResortEdge,
  rasterPngOptionsSchema,
  rasterQualityLadder,
  rasterTargetMediaTypes,
  rasterWebpOptionsSchema,
} from '#raster/raster-options.js';
import type {
  RasterJpegOptions,
  RasterPngOptions,
  RasterTargetFormat,
  RasterWebpOptions,
} from '#raster/raster-options.js';

/** Why a raster conversion failed. @public */
export type RasterImageErrorCode = 'input' | 'limit' | 'unsupported' | 'decode' | 'encode' | 'size';

/** A failed raster conversion, with a message that names the format or limit. @public */
export class RasterImageError extends Error {
  public readonly code: RasterImageErrorCode;

  public constructor(code: RasterImageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RasterImageError';
    this.code = code;
  }
}

/** What to encode, and how. @public */
export type RasterEncodeRequest =
  | { readonly to: 'jpeg'; readonly options?: RasterJpegOptions }
  | { readonly to: 'png'; readonly options?: RasterPngOptions }
  | { readonly to: 'webp'; readonly options?: RasterWebpOptions };

/** One encoded image. @public */
export type RasterEncodeResult = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: (typeof rasterTargetMediaTypes)[RasterTargetFormat];
  readonly width: number;
  readonly height: number;
};

type ParsedRequest =
  | ({ readonly to: 'jpeg' } & z.output<typeof rasterJpegOptionsSchema>)
  | ({ readonly to: 'png' } & z.output<typeof rasterPngOptionsSchema>)
  | ({ readonly to: 'webp' } & z.output<typeof rasterWebpOptionsSchema>);

/**
 * Average each `factor` × `factor` cell. Cheap and exact for the integer part of a large reduction, which leaves
 * Lanczos less than a factor of two to cover.
 *
 * @param image - The source.
 * @param factor - Integer cell size, at least 2.
 * @returns The reduced image.
 */
const boxReduce = (image: RasterImage, factor: number): RasterImage => {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const source = image.data;
  const data = new Uint8ClampedArray(width * height * 4);
  const cell = factor * factor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let row = 0; row < factor; row += 1) {
        let offset = ((y * factor + row) * image.width + x * factor) * 4;
        for (let column = 0; column < factor; column += 1) {
          red += source[offset]!;
          green += source[offset + 1]!;
          blue += source[offset + 2]!;
          alpha += source[offset + 3]!;
          offset += 4;
        }
      }
      const out = (y * width + x) * 4;
      data[out] = red / cell;
      data[out + 1] = green / cell;
      data[out + 2] = blue / cell;
      data[out + 3] = alpha / cell;
    }
  }
  return { data, width, height };
};

/**
 * Fit an image inside `maxEdge` pixels on its longer side; never enlarge it.
 *
 * @param encoders - Supplies the Lanczos resampler.
 * @param image - The source.
 * @param maxEdge - The largest edge, or `undefined` to keep the size.
 * @returns The fitted image (the source itself when it already fits).
 */
const fit = async (encoders: RasterEncoders, image: RasterImage, maxEdge: number | undefined): Promise<RasterImage> => {
  const scale = maxEdge === undefined ? 1 : Math.min(1, maxEdge / Math.max(image.width, image.height));
  if (scale >= 1) {
    return image;
  }
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const factor = Math.floor(Math.min(image.width / width, image.height / height));
  const reduced = factor >= 2 ? boxReduce(image, factor) : image;
  return encoders.resize(reduced, width, height);
};

/**
 * Composite every pixel that is not opaque on `background`, in place, and make it opaque.
 *
 * @param image - The image to flatten.
 * @param background - `#RRGGBB`.
 */
const matte = (image: RasterImage, background: string): void => {
  const red = Number.parseInt(background.slice(1, 3), 16);
  const green = Number.parseInt(background.slice(3, 5), 16);
  const blue = Number.parseInt(background.slice(5, 7), 16);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]!;
    if (alpha !== 255) {
      const rest = 255 - alpha;
      data[index] = (data[index]! * alpha + red * rest) / 255;
      data[index + 1] = (data[index + 1]! * alpha + green * rest) / 255;
      data[index + 2] = (data[index + 2]! * alpha + blue * rest) / 255;
      data[index + 3] = 255;
    }
  }
};

const encodeAt = async (
  encoders: RasterEncoders,
  image: RasterImage,
  { to, quality }: { readonly to: 'jpeg' | 'webp'; readonly quality: number },
): Promise<Uint8Array<ArrayBuffer>> =>
  to === 'jpeg'
    ? encoders.encodeJpeg(image, Math.round(quality * 100))
    : encoders.encodeWebp(image, Math.round(quality * 100));

const tooLarge = (format: string, size: number, maxBytes: number): RasterImageError =>
  new RasterImageError('size', `${format} output of ${size} bytes exceeds the ${maxBytes}-byte limit`);

const encodeLossy = async (
  encoders: RasterEncoders,
  image: RasterImage,
  options: Extract<ParsedRequest, { readonly quality: number }>,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly image: RasterImage }> => {
  const ladder = [options.quality, ...rasterQualityLadder.filter((quality) => quality < options.quality)];
  let bytes = new Uint8Array(0);
  for (const quality of ladder) {
    // oxlint-disable-next-line no-await-in-loop -- each step runs only when the previous one is too large
    bytes = await encodeAt(encoders, image, { to: options.to, quality });
    if (options.maxBytes === undefined || bytes.length <= options.maxBytes) {
      return { bytes, image };
    }
  }
  const lowest = Math.min(rasterQualityLadder.at(-1)!, options.quality);
  const smaller = await fit(encoders, image, rasterLastResortEdge);
  const lastResort = smaller === image ? bytes : await encodeAt(encoders, smaller, { to: options.to, quality: lowest });
  if (lastResort.length > options.maxBytes!) {
    throw tooLarge(options.to === 'jpeg' ? 'JPEG' : 'WebP', lastResort.length, options.maxBytes!);
  }
  return { bytes: lastResort, image: smaller };
};

const parseWith = <Schema extends z.ZodType>(schema: Schema, options: unknown): z.output<Schema> => {
  const parsed = schema.safeParse(options ?? {});
  if (!parsed.success) {
    throw new RasterImageError('input', parsed.error.message, { cause: parsed.error });
  }
  return parsed.data;
};

const parseOptions = (request: RasterEncodeRequest): ParsedRequest => {
  switch (request.to) {
    case 'jpeg': {
      return { to: 'jpeg', ...parseWith(rasterJpegOptionsSchema, request.options) };
    }
    case 'png': {
      return { to: 'png', ...parseWith(rasterPngOptionsSchema, request.options) };
    }
    case 'webp': {
      return { to: 'webp', ...parseWith(rasterWebpOptionsSchema, request.options) };
    }
  }
};

/**
 * Encode a decoded image: fit it inside `maxEdge`, matte transparency for JPEG, and encode it. For JPEG and WebP the
 * quality steps down 0.85, 0.7, 0.5 and 0.3 until the output fits `maxBytes`, then the image is fitted inside
 * 800 pixels at 0.3; PNG that does not fit fails. The output is byte-identical in every host for the same input,
 * options and codec versions.
 *
 * `image` may be modified in place.
 *
 * @param encoders - Created once per worker with {@link createRasterEncoders}.
 * @param image - Eight-bit RGBA pixels.
 * @param request - The target format and its options.
 * @returns The encoded bytes, their media type and the output size.
 * @throws {RasterImageError} When the options are invalid (`input`), an encoder fails (`encode`) or the output
 * cannot fit `maxBytes` (`size`).
 * @public
 */
export const encodeRasterImage = async (
  encoders: RasterEncoders,
  image: RasterImage,
  request: RasterEncodeRequest,
): Promise<RasterEncodeResult> => {
  const options = parseOptions(request);
  const mimeType = rasterTargetMediaTypes[options.to];
  try {
    const fitted = await fit(encoders, image, options.maxEdge);
    if (options.to === 'png') {
      const bytes = await encoders.encodePng(fitted);
      if (options.maxBytes !== undefined && bytes.length > options.maxBytes) {
        throw tooLarge('PNG', bytes.length, options.maxBytes);
      }
      return { bytes, mimeType, width: fitted.width, height: fitted.height };
    }
    if (options.to === 'jpeg') {
      matte(fitted, options.background);
    }
    const encoded = await encodeLossy(encoders, fitted, options);
    return { bytes: encoded.bytes, mimeType, width: encoded.image.width, height: encoded.image.height };
  } catch (error) {
    if (error instanceof RasterImageError) {
      throw error;
    }
    throw new RasterImageError('encode', error instanceof Error ? error.message : String(error), { cause: error });
  }
};

/** Formats, limits and per-target option schemas of the raster transcoder. */

import { z } from 'zod';

/** Source formats the raster transcoder decodes. @public */
export const rasterSourceFormats = ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'] as const;

/** Target formats the raster transcoder and {@link encodeRasterImage} encode. @public */
export const rasterTargetFormats = ['jpeg', 'png', 'webp'] as const;

/** A format the raster transcoder decodes. @public */
export type RasterSourceFormat = (typeof rasterSourceFormats)[number];

/** A format {@link encodeRasterImage} encodes. @public */
export type RasterTargetFormat = (typeof rasterTargetFormats)[number];

/** Largest input the transcoder accepts: 64 MiB. Larger buffers are refused before they are read. @public */
export const rasterMaxInputBytes = 64 * 1024 * 1024;

/** Largest decoded image: 50 megapixels. The `maxPixels` option may lower it, never raise it. @public */
export const rasterMaxPixels = 50_000_000;

/** Largest edge a resize may target, matching the largest edge a decoder can return. */
const maxEdgeLimit = 65_535;

/** Quality steps tried in order when an encoded JPEG or WebP exceeds `maxBytes`. @public */
export const rasterQualityLadder = [0.85, 0.7, 0.5, 0.3] as const;

/** Largest edge of the last-resort encode, which runs at the ladder's lowest quality. @public */
export const rasterLastResortEdge = 800;

/** Media type of each target format. @public */
export const rasterTargetMediaTypes = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const satisfies Record<RasterTargetFormat, string>;

/** Canonical file extension of each target format. @public */
export const rasterTargetExtensions = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
} as const satisfies Record<RasterTargetFormat, string>;

const sizeOptions = {
  maxEdge: z
    .number()
    .int()
    .min(1)
    .max(maxEdgeLimit)
    .optional()
    .describe('Fit the image inside this many pixels on its longer side. Images are never enlarged'),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Largest acceptable output. JPEG and WebP step quality down to fit; PNG fails when it does not fit'),
  maxPixels: z
    .number()
    .int()
    .min(1)
    .max(rasterMaxPixels)
    .default(rasterMaxPixels)
    .describe('Refuse a source whose header declares more pixels than this, before decoding it'),
};

const quality = z
  .number()
  .min(0)
  .max(1)
  .default(rasterQualityLadder[0])
  .describe('Encoder quality from 0 to 1; the first step of the quality ladder');

/** Options of every edge that encodes JPEG. @public */
export const rasterJpegOptionsSchema = z
  .object({
    ...sizeOptions,
    quality,
    background: z
      .string()
      .regex(/^#[\dA-Fa-f]{6}$/u, 'Expected #RRGGBB')
      .default('#FFFFFF')
      .describe('Colour that transparent pixels are composited on, because JPEG has no alpha'),
  })
  .strict();

/** Options of every edge that encodes PNG. Alpha is kept. @public */
export const rasterPngOptionsSchema = z.object(sizeOptions).strict();

/** Options of every edge that encodes WebP. Alpha is kept. @public */
export const rasterWebpOptionsSchema = z.object({ ...sizeOptions, quality }).strict();

/** Option schema of each target format. @public */
export const rasterOptionsSchemas = {
  jpeg: rasterJpegOptionsSchema,
  png: rasterPngOptionsSchema,
  webp: rasterWebpOptionsSchema,
} as const satisfies Record<RasterTargetFormat, z.ZodType>;

/** Accepted JPEG encode options. @public */
export type RasterJpegOptions = z.input<typeof rasterJpegOptionsSchema>;
/** Accepted PNG encode options. @public */
export type RasterPngOptions = z.input<typeof rasterPngOptionsSchema>;
/** Accepted WebP encode options. @public */
export type RasterWebpOptions = z.input<typeof rasterWebpOptionsSchema>;

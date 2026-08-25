/**
 * Image transcoder export options.
 *
 * Per-target Zod schemas mirroring nanoraster's `RenderImageOptions`
 * (which mirrors the Rust `render_core::RenderRequest` wire contract). The
 * schemas validate + default caller options and feed UI form generation via
 * `.describe()`. `format` is not part of the schema — it comes from the edge's
 * `to` target.
 *
 * PNG/WebP default to a transparent background (alpha preserved). JPEG has no
 * alpha channel, so its schema defaults `background` to opaque white — the
 * render core errors on any translucent pixel, so an opaque default keeps the
 * common JPEG export path from failing.
 */

import { z } from 'zod';
import type { FileExtension } from '@taucad/runtime/types';
import {
  renderImageAnnotatedMinDimension,
  renderImageBackgroundPattern,
  renderImageDimensionRange,
  renderImageLabelMaxLength,
  renderImageLabelPattern,
  renderImageMarginRange,
  renderImageQualityRange,
  renderImageViewIdPattern,
} from 'nanoraster';

const hexColor = z.string().regex(renderImageBackgroundPattern, 'Expected #RRGGBB or #RRGGBBAA');

const imageExportModeSchema = z.enum(['single', 'batch']);
const imageLabelSchema = z
  .string()
  .min(1, 'Label must not be empty')
  .max(renderImageLabelMaxLength, `Label must contain at most ${renderImageLabelMaxLength} characters`)
  .refine((label) => label.trim().length > 0, 'Label must not contain only whitespace')
  .regex(renderImageLabelPattern, 'Label contains an unsupported character')
  .describe('Caller-authored view label rendered verbatim');

const imageDimensionSchema = z.number().int().min(renderImageDimensionRange[0]).max(renderImageDimensionRange[1]);

const imageQualitySchema = z.number().min(renderImageQualityRange[0]).max(renderImageQualityRange[1]);

/** Fields shared by every image edge. */
const baseImageShape = {
  width: imageDimensionSchema.default(768).describe('Output width in pixels'),
  height: imageDimensionSchema.default(432).describe('Output height in pixels'),
  margin: z
    .number()
    .min(renderImageMarginRange[0])
    .max(renderImageMarginRange[1])
    .default(0.1)
    .describe('Corner-fit padding fraction (0–0.5)'),
  projection: z.enum(['perspective', 'orthographic']).default('perspective').describe('Camera projection'),
  axes: z.boolean().default(false).describe('Include a camera-aware XYZ orientation indicator'),
  scaleBar: z
    .boolean()
    .default(false)
    .describe(
      'Include a physical scale bar; perspective labels use @ center for the subject-center plane, while orthographic scale is depth-invariant',
    ),
} as const;

const validateAnnotatedDimensions = (
  options: {
    readonly width: number;
    readonly height: number;
    readonly annotated: boolean;
    readonly path?: ReadonlyArray<string | number>;
  },
  context: z.RefinementCtx,
): void => {
  if (!options.annotated) {
    return;
  }
  if (options.width < renderImageAnnotatedMinDimension) {
    context.addIssue({
      code: 'custom',
      path: [...(options.path ?? []), 'width'],
      message: `Annotated images require width ≥ ${renderImageAnnotatedMinDimension}`,
    });
  }
  if (options.height < renderImageAnnotatedMinDimension) {
    context.addIssue({
      code: 'custom',
      path: [...(options.path ?? []), 'height'],
      message: `Annotated images require height ≥ ${renderImageAnnotatedMinDimension}`,
    });
  }
};

const createImageSchema = <const SharedShape extends z.ZodRawShape, const ViewShape extends z.ZodRawShape>({
  sharedShape,
  viewShape,
}: {
  readonly sharedShape: SharedShape;
  readonly viewShape: ViewShape;
}) => {
  const commonShape = { ...baseImageShape, ...sharedShape };
  const imageViewSchema = z
    .object({
      id: z.string().regex(renderImageViewIdPattern, 'Expected 1–64 letters, digits, underscores, or hyphens'),
      label: imageLabelSchema.optional(),
      phi: z.number().describe('Polar camera angle from the up axis, degrees'),
      theta: z.number().describe('Right-handed azimuth around the selected up axis, degrees'),
      width: imageDimensionSchema.optional().describe('Output width override for this view, pixels'),
      height: imageDimensionSchema.optional().describe('Output height override for this view, pixels'),
      ...viewShape,
    })
    .strict();
  const imageViewsSchema = z
    .array(imageViewSchema)
    .min(1)
    .superRefine((views, context) => {
      const ids = new Set<string>();
      for (const [index, view] of (views as ReadonlyArray<{ readonly id: string }>).entries()) {
        if (ids.has(view.id)) {
          context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate view id "${view.id}"` });
        }
        ids.add(view.id);
      }
    });
  const single = z
    .object({
      ...commonShape,
      mode: imageExportModeSchema.extract(['single']).default('single').describe('Image export mode'),
      label: imageLabelSchema.optional(),
      phi: z.number().default(60).describe('Polar camera angle from the up axis, degrees'),
      theta: z.number().default(-45).describe('Right-handed azimuth around the selected up axis, degrees'),
    })
    .strict()
    .superRefine((value, context) => {
      const options = value as unknown as {
        width: number;
        height: number;
        axes: boolean;
        scaleBar: boolean;
        label?: string;
      };
      validateAnnotatedDimensions(
        { ...options, annotated: options.axes || options.scaleBar || options.label !== undefined },
        context,
      );
    })
    .meta({ title: 'Single' });
  const batch = z
    .object({
      ...commonShape,
      mode: imageExportModeSchema.extract(['batch']).describe('Image export mode'),
      views: imageViewsSchema.describe('Ordered camera views'),
    })
    .strict()
    .superRefine((value, context) => {
      const options = value as unknown as {
        width: number;
        height: number;
        axes: boolean;
        scaleBar: boolean;
        views: ReadonlyArray<{ label?: string; width?: number; height?: number }>;
      };
      for (const [index, view] of options.views.entries()) {
        validateAnnotatedDimensions(
          {
            width: view.width ?? options.width,
            height: view.height ?? options.height,
            annotated: options.axes || options.scaleBar || view.label !== undefined,
            path: ['views', index],
          },
          context,
        );
      }
    })
    .meta({ title: 'Batch' });

  return z.union([single, batch]);
};

const transparentBackgroundShape = {
  background: hexColor.optional().describe('sRGB #RRGGBB or #RRGGBBAA clear color; omit for transparent'),
} as const;

/** PNG: transparent background by default (alpha preserved). */
const pngImageSchema = createImageSchema({
  sharedShape: transparentBackgroundShape,
  viewShape: {},
});

/** WebP: transparent background and lossless encoding by default. */
const webpImageSchema = createImageSchema({
  sharedShape: {
    ...transparentBackgroundShape,
    quality: imageQualitySchema.default(1).describe('WebP quality 0–1; 1 is lossless and lower values are lossy'),
  },
  viewShape: {
    quality: imageQualitySchema.optional().describe('WebP quality override for this view'),
  },
});

/** JPEG: no alpha channel, so default to opaque white to avoid an encode error. */
const jpegImageSchema = createImageSchema({
  sharedShape: {
    quality: imageQualitySchema.default(0.92).describe('JPEG encoder quality 0–1'),
    background: hexColor.default('#FFFFFF').describe('sRGB #RRGGBB background (JPEG is always opaque)'),
  },
  viewShape: {
    quality: imageQualitySchema.optional().describe('JPEG quality override for this view'),
  },
});

/**
 * Per-target edge option schemas for the image transcoder. Single source of
 * truth shared by the {@link imageTranscoder} plugin factory's compile-time
 * `EdgeMap` and the runtime `defineTranscoder` `edges` tuple (each edge's
 * `optionsSchema` points back here).
 *
 * @public
 */
export const imageEdgeSchemas = {
  png: pngImageSchema,
  webp: webpImageSchema,
  jpeg: jpegImageSchema,
} as const satisfies Partial<Record<FileExtension, z.ZodType>>;

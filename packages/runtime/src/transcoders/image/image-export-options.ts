/**
 * Image transcoder export options.
 *
 * Per-target Zod schemas mirroring `@taucad/render`'s `RenderImageOptions`
 * (which mirrors the Rust `render_core::RenderRequest` wire contract). The
 * schemas validate + default caller options and feed UI form generation via
 * `.describe()`. `format` is not part of the schema — it comes from the edge's
 * `to` target.
 *
 * PNG/WebP default to a transparent background (alpha preserved). JPEG has no
 * alpha channel, so its schema defaults `background` to opaque white — the
 * render core errors on any translucent pixel, so an opaque default keeps the
 * common "thumbnail.jpeg" path from failing.
 */

import { z } from 'zod';
import type { FileExtension } from '@taucad/types';

const hexColor = z.string().regex(/^#[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/, 'Expected #RRGGBB or #RRGGBBAA');

const imageExportModeSchema = z.enum(['single', 'batch']);
const annotatedMinDimension = 192;
const labelPattern = /^[\u0020-\u007E\u00B5\u2014\u2212]+$/u;
const imageLabelSchema = z
  .string()
  .min(1, 'Label must not be empty')
  .max(64, 'Label must contain at most 64 characters')
  .refine((label) => label.trim().length > 0, 'Label must not contain only whitespace')
  .regex(labelPattern, 'Label contains an unsupported character')
  .describe('Caller-authored view label rendered verbatim');

const imageViewSchema = z
  .object({
    id: z.string().regex(/^[\dA-Za-z][\w-]{0,63}$/, 'Expected 1–64 letters, digits, underscores, or hyphens'),
    label: imageLabelSchema.optional(),
    phi: z.number().describe('Polar camera angle from the up axis, degrees'),
    theta: z.number().describe('Right-handed azimuth around the selected up axis, degrees'),
  })
  .strict();

const imageViewsSchema = z
  .array(imageViewSchema)
  .min(1)
  .superRefine((views, context) => {
    const ids = new Set<string>();
    for (const [index, view] of views.entries()) {
      if (ids.has(view.id)) {
        context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate view id "${view.id}"` });
      }
      ids.add(view.id);
    }
  });

/** Fields shared by every image edge. */
const baseImageShape = {
  width: z.number().int().min(16).max(4096).default(768).describe('Output width in pixels'),
  height: z.number().int().min(16).max(4096).default(432).describe('Output height in pixels'),
  margin: z.number().min(0).max(0.5).default(0.1).describe('Corner-fit padding fraction (0–0.5)'),
  projection: z.enum(['perspective', 'orthographic']).default('perspective').describe('Camera projection'),
  includeAxes: z.boolean().default(false).describe('Include a camera-aware XYZ orientation indicator'),
  includeLabel: z.boolean().default(false).describe('Include the caller-authored label verbatim'),
  includeScale: z
    .boolean()
    .default(false)
    .describe(
      'Include a physical scale; perspective labels use @ center for the subject-center plane, while orthographic scale is depth-invariant',
    ),
} as const;

const validateAnnotatedDimensions = (
  value: { width: number; height: number; includeAxes: boolean; includeLabel: boolean; includeScale: boolean },
  context: z.RefinementCtx,
): void => {
  if (!(value.includeAxes || value.includeLabel || value.includeScale)) {
    return;
  }
  if (value.width < annotatedMinDimension) {
    context.addIssue({
      code: 'custom',
      path: ['width'],
      message: `Annotated images require width ≥ ${annotatedMinDimension}`,
    });
  }
  if (value.height < annotatedMinDimension) {
    context.addIssue({
      code: 'custom',
      path: ['height'],
      message: `Annotated images require height ≥ ${annotatedMinDimension}`,
    });
  }
};

type ConditionalSingleLabel<Value> = Omit<Value, 'includeLabel' | 'label'> &
  ({ includeLabel: true; label: string } | { includeLabel?: false; label?: string });

type BatchViews<Value> = Value extends { views: infer Views extends ReadonlyArray<{ label?: string }> }
  ? Views
  : ReadonlyArray<{ id: string; label?: string; phi: number; theta: number }>;

type ConditionalBatchLabel<Value> = Omit<Value, 'includeLabel' | 'views'> &
  (
    | {
        includeLabel: true;
        views: ReadonlyArray<Omit<BatchViews<Value>[number], 'label'> & { label: string }>;
      }
    | { includeLabel?: false; views: BatchViews<Value> }
  );

const createImageSchema = <const Shape extends z.ZodRawShape>(shape: Shape) => {
  const commonShape = { ...baseImageShape, ...shape };
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
        includeAxes: boolean;
        includeLabel: boolean;
        includeScale: boolean;
        label?: string;
      };
      validateAnnotatedDimensions(options, context);
      if (options.includeLabel && options.label === undefined) {
        context.addIssue({ code: 'custom', path: ['label'], message: 'Label is required when includeLabel is true' });
      }
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
        includeAxes: boolean;
        includeLabel: boolean;
        includeScale: boolean;
        views: ReadonlyArray<{ label?: string }>;
      };
      validateAnnotatedDimensions(options, context);
      if (!options.includeLabel) {
        return;
      }
      for (const [index, view] of options.views.entries()) {
        if (view.label === undefined) {
          context.addIssue({
            code: 'custom',
            path: ['views', index, 'label'],
            message: 'Label is required when includeLabel is true',
          });
        }
      }
    })
    .meta({ title: 'Batch' });

  const schema = z.union([single, batch]);
  type SingleInput = ConditionalSingleLabel<z.input<typeof single>>;
  type SingleOutput = ConditionalSingleLabel<z.output<typeof single>>;
  type BatchInput = ConditionalBatchLabel<z.input<typeof batch>>;
  type BatchOutput = ConditionalBatchLabel<z.output<typeof batch>>;
  return schema as unknown as z.ZodType<SingleOutput | BatchOutput, SingleInput | BatchInput>;
};

/** PNG/WebP: transparent background by default (alpha preserved). */
const transparentImageSchema = createImageSchema({
  background: hexColor.optional().describe('sRGB #RRGGBB or #RRGGBBAA clear color; omit for transparent'),
});

/** JPEG: no alpha channel, so default to opaque white to avoid an encode error. */
const opaqueImageSchema = createImageSchema({
  quality: z.number().min(0).max(1).default(0.92).describe('JPEG encoder quality 0–1'),
  background: hexColor.default('#FFFFFF').describe('sRGB #RRGGBB background (JPEG is always opaque)'),
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
  png: transparentImageSchema,
  webp: transparentImageSchema,
  jpeg: opaqueImageSchema,
} as const satisfies Partial<Record<FileExtension, z.ZodType>>;

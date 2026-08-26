/** Strict per-target image transcoder export schemas. */

import { z } from 'zod';
import type { FileExtension } from '@taucad/runtime/types';
import {
  renderImageAnnotatedMinDimension,
  renderImageBackgroundPattern,
  renderImageDimensionRange,
  renderImageLabelMaxLength,
  renderImageLabelPattern,
  renderImageLineWidthRange,
  renderImageMarginRange,
  renderImageQualityRange,
  renderImageVerticalFieldOfViewRange,
  renderImageViewIdPattern,
  renderImageZoomRange,
} from 'nanoraster';

const imageMaxSections = 6;

const hexColor = z.string().regex(renderImageBackgroundPattern, 'Expected #RRGGBB or #RRGGBBAA');
const finiteNumber = z.number();
const positiveNumber = finiteNumber.positive();
const cameraVectorSchema = z.tuple([finiteNumber, finiteNumber, finiteNumber]).readonly();
const nonZeroCameraVectorSchema = cameraVectorSchema.refine(
  (value) => Math.hypot(...value) > 1e-6,
  'Camera vector must have non-zero length',
);
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
const imageZoomSchema = z.number().min(renderImageZoomRange[0]).max(renderImageZoomRange[1]);
const imageVerticalFieldOfViewSchema = z
  .number()
  .min(renderImageVerticalFieldOfViewRange[0])
  .max(renderImageVerticalFieldOfViewRange[1]);
const primitiveReferenceSchema = z
  .object({
    nodeIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    meshIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    primitiveIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const visiblePrimitivesSchema = z.array(primitiveReferenceSchema).superRefine((references, context) => {
  const seen = new Set<string>();
  for (const [index, reference] of references.entries()) {
    const key = `${reference.nodeIndex}/${reference.meshIndex}/${reference.primitiveIndex}`;
    if (seen.has(key)) {
      context.addIssue({ code: 'custom', path: [index], message: 'Duplicate primitive reference' });
    }
    seen.add(key);
  }
});
const sectionPlaneSchema = z
  .object({
    point: cameraVectorSchema,
    normal: nonZeroCameraVectorSchema,
  })
  .strict();
const sectionsSchema = z
  .object({
    planes: z.array(sectionPlaneSchema).min(1).max(imageMaxSections),
    clipSurfaces: z.boolean().default(true),
    clipLines: z.boolean().default(true),
  })
  .strict();

const perspectiveFitProjectionSchema = z
  .object({
    kind: z.literal('perspective'),
    verticalFieldOfView: imageVerticalFieldOfViewSchema.default(45),
  })
  .strict();
const perspectiveFixedProjectionSchema = perspectiveFitProjectionSchema.extend({ zoom: imageZoomSchema.default(1) });
const fitCameraSchema = z
  .object({
    framing: z.literal('fit'),
    direction: nonZeroCameraVectorSchema.default([0.612_372_435_7, -0.612_372_435_7, 0.5]),
    up: nonZeroCameraVectorSchema.default([0, 0, 1]),
    margin: z.number().min(renderImageMarginRange[0]).max(renderImageMarginRange[1]).default(0.1),
    projection: z
      .discriminatedUnion('kind', [
        perspectiveFitProjectionSchema,
        z.object({ kind: z.literal('orthographic') }).strict(),
      ])
      .default({ kind: 'perspective', verticalFieldOfView: 45 }),
  })
  .strict();
const fixedCameraSchema = z
  .object({
    framing: z.literal('fixed'),
    position: cameraVectorSchema,
    target: cameraVectorSchema,
    up: nonZeroCameraVectorSchema,
    projection: z
      .discriminatedUnion('kind', [
        perspectiveFixedProjectionSchema,
        z
          .object({
            kind: z.literal('orthographic'),
            verticalSpan: positiveNumber,
            zoom: imageZoomSchema.default(1),
          })
          .strict(),
      ])
      .default({ kind: 'perspective', verticalFieldOfView: 45, zoom: 1 }),
    clipping: z.object({ near: positiveNumber, far: positiveNumber }).strict().optional(),
  })
  .strict();

const crossLength = (left: readonly number[], right: readonly number[]): number =>
  Math.hypot(
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  );

const imageCameraSchema = z
  .discriminatedUnion('framing', [fitCameraSchema, fixedCameraSchema])
  .superRefine((camera, context) => {
    const direction =
      camera.framing === 'fit'
        ? camera.direction
        : ([
            camera.position[0] - camera.target[0],
            camera.position[1] - camera.target[1],
            camera.position[2] - camera.target[2],
          ] as const);
    if (Math.hypot(...direction) <= 1e-6) {
      context.addIssue({ code: 'custom', path: ['position'], message: 'Camera position must differ from target' });
    } else if (crossLength(direction, camera.up) <= 1e-6) {
      context.addIssue({ code: 'custom', path: ['up'], message: 'Camera direction and up must not be collinear' });
    }
    if (camera.framing === 'fixed' && camera.clipping && camera.clipping.far <= camera.clipping.near) {
      context.addIssue({
        code: 'custom',
        path: ['clipping', 'far'],
        message: 'Far clipping distance must exceed near',
      });
    }
  });

const defaultImageCamera = (): z.output<typeof fitCameraSchema> => ({
  framing: 'fit',
  direction: [0.612_372_435_7, -0.612_372_435_7, 0.5] as const,
  up: [0, 0, 1] as const,
  margin: 0.1,
  projection: { kind: 'perspective', verticalFieldOfView: 45 },
});

/** Fields shared by every image edge. */
const baseImageShape = {
  width: imageDimensionSchema.default(768).describe('Output width in pixels'),
  height: imageDimensionSchema.default(432).describe('Output height in pixels'),
  lineWidth: z
    .number()
    .min(renderImageLineWidthRange[0])
    .max(renderImageLineWidthRange[1])
    .default(2)
    .describe('Edge line width in output pixels'),
  surfaces: z.boolean().default(true).describe('Draw triangle surfaces'),
  lines: z.boolean().default(true).describe('Draw authored line primitives'),
  visiblePrimitives: visiblePrimitivesSchema.optional().describe('Source glTF primitive instances to draw'),
  sections: sectionsSchema.optional().describe('World-space retained-half-space section planes'),
  axes: z.boolean().default(false).describe('Include a camera-aware XYZ orientation indicator'),
  scaleBar: z
    .boolean()
    .default(false)
    .describe('Include a physical scale bar at the fitted centre or fixed camera target plane'),
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
      camera: imageCameraSchema.default(defaultImageCamera),
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
      camera: imageCameraSchema.default(defaultImageCamera),
    })
    .strict()
    .superRefine((value, context) => {
      const options = value as unknown as {
        readonly width: number;
        readonly height: number;
        readonly axes: boolean;
        readonly scaleBar: boolean;
        readonly label?: string;
      };
      validateAnnotatedDimensions(
        {
          width: options.width,
          height: options.height,
          annotated: options.axes || options.scaleBar || options.label !== undefined,
        },
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
        readonly width: number;
        readonly height: number;
        readonly axes: boolean;
        readonly scaleBar: boolean;
        readonly views: ReadonlyArray<{
          readonly label?: string;
          readonly width?: number;
          readonly height?: number;
        }>;
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

const pngImageSchema = createImageSchema({ sharedShape: transparentBackgroundShape, viewShape: {} });
const webpImageSchema = createImageSchema({
  sharedShape: {
    ...transparentBackgroundShape,
    quality: imageQualitySchema.default(1).describe('WebP quality 0–1; 1 is lossless and lower values are lossy'),
  },
  viewShape: { quality: imageQualitySchema.optional().describe('WebP quality override for this view') },
});
const jpegImageSchema = createImageSchema({
  sharedShape: {
    quality: imageQualitySchema.default(0.92).describe('JPEG encoder quality 0–1'),
    background: hexColor.default('#FFFFFF').describe('sRGB #RRGGBB background (JPEG is always opaque)'),
  },
  viewShape: { quality: imageQualitySchema.optional().describe('JPEG quality override for this view') },
});

/** Per-target option schemas for the image transcoder. @public */
export const imageEdgeSchemas = {
  png: pngImageSchema,
  webp: webpImageSchema,
  jpeg: jpegImageSchema,
} as const satisfies Partial<Record<FileExtension, z.ZodType>>;

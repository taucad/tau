import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';

/**
 * Input schema for screenshot tool.
 * @public
 */
export const screenshotInputSchema = z
  .object({
    mode: z
      .enum(['single', 'multi_angle'])
      .default('single')
      .describe('single (default): deterministic perspective isometric view. multi_angle: all 6 orthographic views'),
    targetFile: rootedFilePathSchema.describe(
      'Source file path of the geometry unit to screenshot (e.g. "main.ts", "lib/bracket.scad").',
    ),
    view: z.string().optional().describe('A view ID offered by evaluate_model; omit for the default view.'),
    instance: z.string().optional().describe('A sheet or drawing ID offered under that view; omit for the first.'),
    options: z
      .any()
      .describe('JSON object of options declared by the selected view.')
      .pipe(z.record(z.string(), z.json()))
      .optional(),
  })
  .strict();
/** @public */
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/** Canonical camera angles produced by screenshot capture of a 3D view. @public */
export const screenshotAngleSchema = z.enum(['isometric', 'front', 'back', 'right', 'left', 'top', 'bottom']);
/** @public */
export type ScreenshotAngle = z.infer<typeof screenshotAngleSchema>;

/**
 * Screenshot image entry.
 * @public
 */
export const screenshotImageSchema = z
  .object({
    view: z.string().describe('Kernel view ID captured.'),
    instance: z.string().optional().describe('Captured sheet or drawing ID.'),
    angle: screenshotAngleSchema.optional().describe('Camera angle for a 3D view only.'),
    dataUrl: z.string().describe('Base64 data URL of the captured image'),
  })
  .strict();

/** A persisted image returned to an external agent without inline image bytes. @public */
export const screenshotArtifactImageSchema = z
  .object({
    view: z.string().describe('Kernel view ID captured.'),
    instance: z.string().optional().describe('Captured sheet or drawing ID.'),
    angle: screenshotAngleSchema.optional().describe('Camera angle for a 3D view only.'),
    path: z
      .string()
      .regex(/^attachments\/[\da-f]{64}\.(?:png|webp)$/u)
      .describe('Chat attachment reference'),
    absolutePath: z.string().min(1).describe('Local image path readable by the agent image viewer'),
    mimeType: z.enum(['image/png', 'image/webp']),
    byteLength: z.number().int().positive(),
    sha256: z.string().regex(/^[\da-f]{64}$/u),
  })
  .strict();

/** MCP screenshot result: full bytes live in the chat attachment, not the tool response. @public */
export const screenshotMcpOutputSchema = z
  .object({
    images: z.array(screenshotArtifactImageSchema).min(1),
    sourceRevision: sourceRevisionSchema.optional(),
    message: z.string().optional(),
  })
  .strict();

/**
 * Output schema for screenshot tool.
 * @public
 */
export const screenshotOutputSchema = z
  .object({
    images: z
      .array(z.union([screenshotImageSchema, screenshotArtifactImageSchema]))
      .min(1)
      .describe('Array of captured screenshot images'),
    sourceRevision: sourceRevisionSchema
      .optional()
      .describe('Digests of the source the captured geometry was computed from (R4).'),
    message: z.string().optional().describe('What the images leave out of the viewer, such as a section cut.'),
  })
  .strict();
/** @public */
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;

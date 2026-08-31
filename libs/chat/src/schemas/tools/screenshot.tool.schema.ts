import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/**
 * Input schema for screenshot tool.
 * @public
 */
export const screenshotInputSchema = z
  .object({
    mode: z
      .enum(['single', 'multi_angle'])
      .describe('single: deterministic perspective isometric view. multi_angle: all 6 orthographic views'),
    targetFile: rootedFilePathSchema.describe(
      'Source file path of the geometry unit to screenshot (e.g. "main.ts", "lib/bracket.scad").',
    ),
  })
  .strict();
/** @public */
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/** Canonical view identifiers produced by screenshot capture. @public */
export const screenshotViewSchema = z.enum(['isometric', 'front', 'back', 'right', 'left', 'top', 'bottom', 'drawing']);
/** @public */
export type ScreenshotView = z.infer<typeof screenshotViewSchema>;

/**
 * Screenshot image entry.
 * @public
 */
export const screenshotImageSchema = z
  .object({
    view: screenshotViewSchema.describe('Canonical captured view'),
    dataUrl: z.string().describe('Base64 data URL of the captured image'),
  })
  .strict();

/**
 * Output schema for screenshot tool.
 * @public
 */
export const screenshotOutputSchema = z
  .object({
    images: z.array(screenshotImageSchema).min(1).describe('Array of captured screenshot images'),
  })
  .strict();
/** @public */
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;

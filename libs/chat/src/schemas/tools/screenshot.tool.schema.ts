import { z } from 'zod';

/**
 * Input schema for screenshot tool.
 * @public
 */
export const screenshotInputSchema = z
  .object({
    mode: z
      .enum(['single', 'multi_angle'])
      .describe('single: deterministic perspective isometric view. multi_angle: all 6 orthographic views'),
    targetFile: z
      .string()
      .describe('Source file path of the geometry unit to screenshot (e.g. "main.ts", "lib/bracket.scad").'),
  })
  .strict();
/** @public */
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/**
 * Screenshot image entry.
 * @public
 */
export const screenshotImageSchema = z.object({
  view: z.string().describe('Name of the view (e.g. "current", "front", "back")'),
  dataUrl: z.string().describe('Base64 data URL of the captured image'),
});

/**
 * Output schema for screenshot tool.
 * @public
 */
export const screenshotOutputSchema = z.object({
  images: z.array(screenshotImageSchema).min(1).describe('Array of captured screenshot images'),
});
/** @public */
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;

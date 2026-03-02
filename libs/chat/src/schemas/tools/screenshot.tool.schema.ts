import { z } from 'zod';

/**
 * Input schema for screenshot tool.
 */
export const screenshotInputSchema = z.object({
  mode: z
    .enum(['single', 'multi_angle'])
    .describe('single: current camera perspective. multi_angle: all 6 orthographic views'),
});
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/**
 * Screenshot image entry.
 */
export const screenshotImageSchema = z.object({
  view: z.string().describe('Name of the view (e.g. "current", "front", "back")'),
  dataUrl: z.string().describe('Base64 data URL of the captured image'),
});

/**
 * Output schema for screenshot tool.
 */
export const screenshotOutputSchema = z.object({
  images: z.array(screenshotImageSchema).describe('Array of captured screenshot images'),
});
export type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>;

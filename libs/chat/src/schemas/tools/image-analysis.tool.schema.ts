import { z } from 'zod';

export const imageAnalysisInputSchema = z.object({
  requirements: z.array(z.string()),
});

export const imageAnalysisOutputSchema = z.object({
  analysis: z.string(),
  screenshot: z.string(),
  codeErrors: z.array(z.unknown()).optional(),
  kernelError: z.unknown().optional(),
});

export type ImageAnalysisInput = z.infer<typeof imageAnalysisInputSchema>;
export type ImageAnalysisOutput = z.infer<typeof imageAnalysisOutputSchema>;

export const IMAGE_ANALYSIS_TOOL_NAME = 'analyze_image' as const;


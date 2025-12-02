import { z } from 'zod';

export const imageAnalysisInputSchema = z.object({
  requirements: z.array(z.string()),
});

export const imageAnalysisOutputSchema = z.object({
  analysis: z.string(),
  screenshot: z.string(),
});

export type ImageAnalysisInput = z.infer<typeof imageAnalysisInputSchema>;
export type ImageAnalysisOutput = z.infer<typeof imageAnalysisOutputSchema>;


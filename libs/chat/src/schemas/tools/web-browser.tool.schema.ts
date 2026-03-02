import { z } from 'zod';

export const webBrowserInputSchema = z.object({
  urls: z.array(z.url()).min(1).max(5).describe('One or more URLs to extract content from (max 5)'),
  query: z.string().optional().describe('Optional query to rerank extracted chunks by relevance'),
  extractDepth: z
    .enum(['basic', 'advanced'])
    .optional()
    .describe(
      'Extraction depth. Use "basic" (default) for fast text extraction. Use "advanced" for JS-heavy or complex pages that fail with basic extraction.',
    ),
});

export const webBrowserOutputSchema = z.array(
  z.object({
    url: z.string(),
    content: z.string(),
  }),
);

export type WebBrowserInput = z.infer<typeof webBrowserInputSchema>;
export type WebBrowserOutput = z.infer<typeof webBrowserOutputSchema>;

import { z } from 'zod';

export const webSearchInputSchema = z.object({
  query: z.string().describe('The search query'),
});

export const webSearchOutputSchema = z.array(
  z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
  }),
);

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;


import { z } from 'zod';

export const webBrowserInputSchema = z.object({
  url: z.string().url().describe('A valid URL to browse including protocol (e.g., https://)'),
  query: z.string().optional().describe('What to find on the page, used for the Vector Search'),
});

export const webBrowserOutputSchema = z.string();

export type WebBrowserInput = z.infer<typeof webBrowserInputSchema>;
export type WebBrowserOutput = z.infer<typeof webBrowserOutputSchema>;

export const WEB_BROWSER_TOOL_NAME = 'web_browser' as const;


import type { InferUITools, Tool, UIMessage } from 'ai';
import z from 'zod';
import type { FileEditInput, FileEditOutput } from '#schemas/tools/file-edit.tool.schema.js';
import type { ImageAnalysisInput, ImageAnalysisOutput } from '#schemas/tools/image-analysis.tool.schema.js';
import type { WebBrowserInput, WebBrowserOutput } from '#schemas/tools/web-browser.tool.schema.js';
import type { WebSearchInput, WebSearchOutput } from '#schemas/tools/web-search.tool.schema.js';

const metadataSchema = z.object({
  usageCost: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cachedReadTokens: z.number(),
    cachedWriteTokens: z.number().optional(),
    usageCost: z.number().optional(),
  }),
});

export type MyMetadata = z.infer<typeof metadataSchema>;

const dataPartSchema = z.object({
  // Add data parts here
});

export type MyDataPart = z.infer<typeof dataPartSchema>;

export type MyTools = InferUITools<{
  editFile: Tool<FileEditInput, FileEditOutput>;
  analyzeImage: Tool<ImageAnalysisInput, ImageAnalysisOutput>;
  webBrowser: Tool<WebBrowserInput, WebBrowserOutput>;
  webSearch: Tool<WebSearchInput, WebSearchOutput>;
}>;

// eslint-disable-next-line @typescript-eslint/naming-convention -- AI SDK naming convention
export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;

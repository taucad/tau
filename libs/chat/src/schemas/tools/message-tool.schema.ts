import type { ZodArray, ZodObject, ZodString } from 'zod';
import { fileEditInputSchema, fileEditOutputSchema } from '#schemas/tools/file-edit.tool.schema.js';
import { imageAnalysisInputSchema, imageAnalysisOutputSchema } from '#schemas/tools/image-analysis.tool.schema.js';
import { webBrowserInputSchema, webBrowserOutputSchema } from '#schemas/tools/web-browser.tool.schema.js';
import { webSearchInputSchema, webSearchOutputSchema } from '#schemas/tools/web-search.tool.schema.js';
import { toolName } from '#constants/tool.constants.js';
import type { ToolName } from '#types/tool.types.js';

export const messageTools = [
  {
    name: toolName.webSearch,
    input: webSearchInputSchema,
    output: webSearchOutputSchema,
  },
  {
    name: toolName.webBrowser,
    input: webBrowserInputSchema,
    output: webBrowserOutputSchema,
  },
  {
    name: toolName.fileEdit,
    input: fileEditInputSchema,
    output: fileEditOutputSchema,
  },
  {
    name: toolName.imageAnalysis,
    input: imageAnalysisInputSchema,
    output: imageAnalysisOutputSchema,
  },
] as const satisfies Array<{
  //
  name: ToolName;
  input: ZodObject;
  output: ZodObject | ZodArray | ZodString;
}>;

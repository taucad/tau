import type { InferUITools, Tool as AiTool } from 'ai';
import type { toolName, toolMode } from '#constants/tool.constants.js';
import type { FileEditInput, FileEditOutput } from '#schemas/tools/file-edit.tool.schema.js';
import type { ImageAnalysisInput, ImageAnalysisOutput } from '#schemas/tools/image-analysis.tool.schema.js';
import type { WebBrowserInput, WebBrowserOutput } from '#schemas/tools/web-browser.tool.schema.js';
import type { WebSearchInput, WebSearchOutput } from '#schemas/tools/web-search.tool.schema.js';

export type ToolName = (typeof toolName)[keyof typeof toolName];

/**
 * The tool mode. One of:
 * - none: No tools are allowed
 * - auto: Let AI decide which tools to use
 * - any: Require tool use (all available)
 * - custom: Make these tools available
 */
export type ToolMode = (typeof toolMode)[keyof typeof toolMode];

/**
 * The tool selection is either a tool mode or an array of tool names.
 */
export type ToolSelection = ToolMode | ToolName[];

export type MyTools = InferUITools<{
  editFile: AiTool<FileEditInput, FileEditOutput>;
  analyzeImage: AiTool<ImageAnalysisInput, ImageAnalysisOutput>;
  webBrowser: AiTool<WebBrowserInput, WebBrowserOutput>;
  webSearch: AiTool<WebSearchInput, WebSearchOutput>;
}>;

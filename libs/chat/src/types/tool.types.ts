import type { InferUITools, Tool as AiTool } from 'ai';
import type { toolName, toolMode } from '#constants/tool.constants.js';
import type { FileEditInput, FileEditOutput } from '#schemas/tools/file-edit.tool.schema.js';
import type { ImageAnalysisInput, ImageAnalysisOutput } from '#schemas/tools/image-analysis.tool.schema.js';
import type { WebBrowserInput, WebBrowserOutput } from '#schemas/tools/web-browser.tool.schema.js';
import type { WebSearchInput, WebSearchOutput } from '#schemas/tools/web-search.tool.schema.js';
import type {
  TransferToCadExpertInput,
  TransferToCadExpertOutput,
} from '#schemas/tools/transfer-to-cad-expert.tool.schema.js';
import type {
  TransferToResearchExpertInput,
  TransferToResearchExpertOutput,
} from '#schemas/tools/transfer-to-research-expert.tool.schema.js';
import type {
  TransferBackToSupervisorInput,
  TransferBackToSupervisorOutput,
} from '#schemas/tools/transfer-back-to-supervisor.tool.schema.js';

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
  [toolName.fileEdit]: AiTool<FileEditInput, FileEditOutput>;
  [toolName.imageAnalysis]: AiTool<ImageAnalysisInput, ImageAnalysisOutput>;
  [toolName.webBrowser]: AiTool<WebBrowserInput, WebBrowserOutput>;
  [toolName.webSearch]: AiTool<WebSearchInput, WebSearchOutput>;
  [toolName.transferToCadExpert]: AiTool<TransferToCadExpertInput, TransferToCadExpertOutput>;
  [toolName.transferToResearchExpert]: AiTool<TransferToResearchExpertInput, TransferToResearchExpertOutput>;
  [toolName.transferBackToSupervisor]: AiTool<TransferBackToSupervisorInput, TransferBackToSupervisorOutput>;
}>;

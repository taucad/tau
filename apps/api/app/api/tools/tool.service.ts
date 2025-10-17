import { Injectable } from '@nestjs/common';
import type { StructuredTool } from '@langchain/core/tools';
import { OpenAI, OpenAIEmbeddings } from '@langchain/openai';
import type { Tool, ToolSelection, ToolWithSelection } from '@taucad/types';
import { tool, toolSelection } from '@taucad/types/constants';
import { createWebBrowserTool } from '#api/tools/tools/tool-web-browser.js';
import { fileEditTool } from '#api/tools/tools/tool-file-edit.js';
import { imageAnalysisTool } from '#api/tools/tools/tool-image-analysis.js';
import { parseWebSearchResults, webSearchTool } from '#api/tools/tools/tool-web-search.js';

export const toolChoiceFromToolName = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Tavily search tool name
  tavily_search: tool.webSearch,
} as const satisfies Record<string, Tool>;

@Injectable()
export class ToolService {
  public getTools(selectedToolChoice: ToolWithSelection): {
    tools: Partial<Record<Tool, StructuredTool>>;
    resolvedToolChoice: string;
  } {
    const model = new OpenAI({ temperature: 0 });
    const embeddings = new OpenAIEmbeddings();
    // Define the tools for the agent to use
    const toolCategoryToTool: Record<Tool, StructuredTool> = {
      [tool.webSearch]: webSearchTool,
      [tool.webBrowser]: createWebBrowserTool({
        model,
        embeddings,
        chunkSize: 2000,
        chunkOverlap: 200,
        maxChunks: 4,
        maxResults: 4,
        forceSummary: false,
      }),
      [tool.fileEdit]: fileEditTool,
      [tool.imageAnalysis]: imageAnalysisTool,
    };

    const toolNameFromToolCategory: Record<Tool, string> = {
      [tool.webSearch]: toolCategoryToTool[tool.webSearch].name,
      [tool.webBrowser]: toolCategoryToTool[tool.webBrowser].name,
      [tool.fileEdit]: toolCategoryToTool[tool.fileEdit].name,
      [tool.imageAnalysis]: toolCategoryToTool[tool.imageAnalysis].name,
    };

    const toolNameFromToolChoice = {
      ...toolNameFromToolCategory,
      ...toolSelection,
    } as const satisfies Record<Tool | ToolSelection, string>;

    // Handle array of specific tools
    if (Array.isArray(selectedToolChoice)) {
      const filteredTools: Partial<Record<Tool, StructuredTool>> = {};
      for (const toolChoiceItem of selectedToolChoice) {
        filteredTools[toolChoiceItem] = toolCategoryToTool[toolChoiceItem];
      }

      return { tools: filteredTools, resolvedToolChoice: 'required' };
    }

    const resolvedToolChoice = toolNameFromToolChoice[selectedToolChoice];

    return { tools: toolCategoryToTool, resolvedToolChoice };
  }

  public getToolParsers(): Partial<Record<Tool, (content: string) => unknown[]>> {
    return {
      [tool.webSearch]: parseWebSearchResults,
    };
  }
}

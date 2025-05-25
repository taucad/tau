import { Injectable } from '@nestjs/common';
import type { DynamicStructuredTool, Tool } from '@langchain/core/tools';
import { OpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { createWebBrowserTool } from '~/tools/tools/tool-web-browser.js';
import { fileEditTool } from '~/tools/tools/tool-file-edit.js';
import { parseWebSearchResults, webSearchTool } from '~/tools/tools/tool-web-search.js';

export const toolCategory = {
  webSearch: 'web_search',
  webBrowser: 'web_browser',
  fileEdit: 'file_edit',
} as const satisfies Record<string, string>;

export const toolChoice = {
  none: 'none',
  auto: 'auto',
  any: 'any',
} as const satisfies Record<string, string>;

export type ToolCategory = (typeof toolCategory)[keyof typeof toolCategory];
export type ToolChoice = (typeof toolChoice)[keyof typeof toolChoice];
export type ToolChoiceWithCategory = ToolChoice | ToolCategory;

export const toolChoiceFromToolName = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Tavily search tool name
  tavily_search: toolCategory.webSearch,
} as const satisfies Record<string, ToolCategory>;

@Injectable()
export class ToolService {
  public getTools(selectedToolChoice: ToolChoiceWithCategory): {
    tools: Record<ToolCategory, Tool | DynamicStructuredTool>;
    resolvedToolChoice: string;
  } {
    const model = new OpenAI({ temperature: 0 });
    const embeddings = new OpenAIEmbeddings();
    // Define the tools for the agent to use
    const toolCategoryToTool: Record<ToolCategory, Tool | DynamicStructuredTool> = {
      [toolCategory.webSearch]: webSearchTool,
      [toolCategory.webBrowser]: createWebBrowserTool({
        model,
        embeddings,
        chunkSize: 2000,
        chunkOverlap: 200,
        maxChunks: 4,
        maxResults: 4,
        forceSummary: false,
      }),
      [toolCategory.fileEdit]: fileEditTool,
    };

    const toolNameFromToolCategory: Record<ToolCategory, string> = {
      [toolCategory.webSearch]: toolCategoryToTool[toolCategory.webSearch].name,
      [toolCategory.webBrowser]: toolCategoryToTool[toolCategory.webBrowser].name,
      [toolCategory.fileEdit]: toolCategoryToTool[toolCategory.fileEdit].name,
    };

    const toolNameFromToolChoice = {
      ...toolNameFromToolCategory,
      ...toolChoice,
    } as const satisfies Record<ToolChoiceWithCategory, string>;

    const resolvedToolChoice = toolNameFromToolChoice[selectedToolChoice];

    return { tools: toolCategoryToTool, resolvedToolChoice };
  }

  public getToolParsers(): Partial<Record<ToolCategory, (content: string) => unknown[]>> {
    return {
      [toolCategory.webSearch]: parseWebSearchResults,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import type { Tool } from '@langchain/core/tools.js';

export const toolCategory = {
  web: 'web',
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
  [SearxngSearch.name]: toolCategory.web,
} as const satisfies Record<string, ToolCategory>;

type WebResult = {
  title: string;
  link: string;
  snippet: string;
};

@Injectable()
export class ToolService {
  public getTools(selectedToolChoice: ToolChoiceWithCategory): {
    tools: Tool[];
    resolvedToolChoice: string;
  } {
    // Define the tools for the agent to use
    const toolCategoryToTool: Record<ToolCategory, Tool> = {
      [toolCategory.web]: new SearxngSearch({
        params: {
          format: 'json',
          engines: 'google,bing,duckduckgo,wikipedia,youtube',
          numResults: 10,
        },
        apiBase: 'http://localhost:42114',
        headers: {},
      }),
    };

    const toolNameFromToolCategory: Record<ToolCategory, string> = {
      [toolCategory.web]: toolCategoryToTool[toolCategory.web].name,
    };

    const toolNameFromToolChoice = {
      ...toolNameFromToolCategory,
      ...toolChoice,
    } as const satisfies Record<ToolChoiceWithCategory, string>;

    const resolvedToolChoice = toolNameFromToolChoice[selectedToolChoice];
    const tools = Object.values(toolCategoryToTool);

    return { tools, resolvedToolChoice };
  }

  public getToolParsers(): Record<string, (content: string) => unknown[]> {
    return {
      [toolCategory.web]: this.parseWebResults,
    };
  }

  private parseWebResults(content: string): WebResult[] {
    try {
      const results = JSON.parse(`[${content}]`) as WebResult;
      if (!Array.isArray(results)) {
        Logger.warn('Expected web results to be an array');
        return [];
      }

      return results;
    } catch (error) {
      Logger.error('Failed to parse web results', error);
      return [];
    }
  }
}

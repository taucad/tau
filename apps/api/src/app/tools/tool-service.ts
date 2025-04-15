import { Injectable, Logger } from '@nestjs/common';
import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import type { DynamicStructuredTool, Tool } from '@langchain/core/tools.js';
import { OpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { createWebBrowserTool } from './tools/tool-web-browser.js';

export const toolCategory = {
  web: 'web',
  webBrowser: 'web_browser',
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
    tools: Array<Tool | DynamicStructuredTool>;
    resolvedToolChoice: string;
  } {
    const model = new OpenAI({ temperature: 0 });
    const embeddings = new OpenAIEmbeddings();
    // Define the tools for the agent to use
    const toolCategoryToTool: Record<ToolCategory, Tool | DynamicStructuredTool> = {
      [toolCategory.web]: new SearxngSearch({
        params: {
          format: 'json',
          engines: 'google,bing,duckduckgo,wikipedia',
          numResults: 10,
        },
        apiBase: 'http://localhost:42114',
        headers: {},
      }),
      [toolCategory.webBrowser]: createWebBrowserTool({
        model,
        embeddings,
        chunkSize: 2000,
        chunkOverlap: 200,
        maxChunks: 4,
        maxResults: 4,
        forceSummary: false,
      }),
    };

    const toolNameFromToolCategory: Record<ToolCategory, string> = {
      [toolCategory.web]: toolCategoryToTool[toolCategory.web].name,
      [toolCategory.webBrowser]: toolCategoryToTool[toolCategory.webBrowser].name,
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
      [toolCategory.web]: this.parseSearxngResults,
    };
  }

  private parseSearxngResults(content: string): WebResult[] {
    try {
      // Searxng returns a comma-separated list of JSON objects, e.g.:
      // `{"json": "..."},{"json": "..."}`
      // So we need to parse it as an array of JSON objects.
      const results = JSON.parse(`[${content}]`) as WebResult[];
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

import { TavilySearch } from '@langchain/tavily';
import type { TavilyBaseSearchResponse } from '@langchain/tavily';
import { toolName } from '@taucad/chat/constants';

type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

type CreateWebSearchToolOptions = {
  tavilyApiKey: string;
};

export const createWebSearchTool = ({ tavilyApiKey }: CreateWebSearchToolOptions): TavilySearch => {
  return new TavilySearch({
    maxResults: 5,
    topic: 'general',
    tavilyApiKey,
    name: toolName.webSearch,
    // IncludeAnswer: false,
    // includeRawContent: false,
    // includeImages: false,
    // includeImageDescriptions: false,
    // searchDepth: "basic",
    // timeRange: "day",
    // includeDomains: [],
    // excludeDomains: [],
  });
};

export const parseWebSearchResults = (content: string): WebSearchResult[] => {
  const parsedContent = JSON.parse(content) as TavilyBaseSearchResponse;
  return parsedContent.results;
};

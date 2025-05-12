import { TavilySearch } from '@langchain/tavily';
import type { TavilyBaseSearchResponse } from '@langchain/tavily';
import { Logger } from '@nestjs/common';

type WebSearchResult = {
  title: string;
  link: string;
  content: string;
};

export const webSearchTool = new TavilySearch({
  maxResults: 5,
  topic: 'general',
  // IncludeAnswer: false,
  // includeRawContent: false,
  // includeImages: false,
  // includeImageDescriptions: false,
  // searchDepth: "basic",
  // timeRange: "day",
  // includeDomains: [],
  // excludeDomains: [],
});

export const parseWebSearchResults = (content: string): WebSearchResult[] => {
  Logger.log(content);
  const parsedContent = JSON.parse(content) as TavilyBaseSearchResponse;
  return parsedContent.results;
  // Try {
  //   // Searxng returns a comma-separated list of JSON objects, e.g.:
  //   // `{"json": "..."},{"json": "..."}`
  //   // So we need to parse it as an array of JSON objects.
  //   const results = JSON.parse(`[${content}]`) as WebSearchResult[];
  //   if (!Array.isArray(results)) {
  //     Logger.warn('Expected web results to be an array');
  //     return [];
  //   }

  //   return results;
  // } catch (error) {
  //   Logger.error('Failed to parse web results', error);
  //   return [];
  // }
};

// Export const webSearchTool = new SearxngSearch({
//   params: {
//     format: 'json',
//     engines: 'google,bing,duckduckgo,wikipedia',
//     numResults: 10,
//   },
//   apiBase: 'http://localhost:42114',
//   headers: {},
// });

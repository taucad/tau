import { SearxngSearch } from '@langchain/community/tools/searxng_search';
import { Logger } from '@nestjs/common';

type WebSearchResult = {
  title: string;
  link: string;
  snippet: string;
};

export const webSearchTool = new SearxngSearch({
  params: {
    format: 'json',
    engines: 'google,bing,duckduckgo,wikipedia',
    numResults: 10,
  },
  apiBase: 'http://localhost:42114',
  headers: {},
});

export const parseWebSearchResults = (content: string): WebSearchResult[] => {
  try {
    // Searxng returns a comma-separated list of JSON objects, e.g.:
    // `{"json": "..."},{"json": "..."}`
    // So we need to parse it as an array of JSON objects.
    const results = JSON.parse(`[${content}]`) as WebSearchResult[];
    if (!Array.isArray(results)) {
      Logger.warn('Expected web results to be an array');
      return [];
    }

    return results;
  } catch (error) {
    Logger.error('Failed to parse web results', error);
    return [];
  }
};

import type { BaseLanguageModelInterface } from '@langchain/core/language_models/base';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type * as cheerio from 'cheerio';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { TextSplitter } from 'langchain/text_splitter';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { formatDocumentsAsString } from 'langchain/util/document';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { z } from 'zod/v4';

// Schema for tool input
const webBrowserSchema = z.object({
  url: z.string().url().describe('A valid URL to browse including protocol (e.g., https://)'),
  query: z.string().optional().describe('What to find on the page, used for the Vector Search'),
});

// Type for schema inference
type WebBrowserInput = z.infer<typeof webBrowserSchema>;

// Interface for WebBrowser options
export type WebBrowserOptions = {
  model: BaseLanguageModelInterface;
  embeddings: EmbeddingsInterface;
  textSplitter?: TextSplitter;
  forceSummary?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  maxChunks?: number;
  maxResults?: number;
};

/**
 * Implementation function for the web browser tool
 */
const webBrowserImpl = async (input: WebBrowserInput, options: WebBrowserOptions): Promise<string> => {
  try {
    // Extract values from input object
    const baseUrl = input.url;
    const query = input.query ?? '';

    const {
      model,
      embeddings,
      textSplitter,
      forceSummary,
      chunkSize = 2000,
      chunkOverlap = 200,
      maxChunks = 4,
      maxResults = 4,
    } = options;

    const splitter = textSplitter ?? new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });

    // Determine if we should summarize
    const doSummary = forceSummary ?? !query;

    // Fetch and process HTML content

    // For summaries, we only need the body content
    const rootElement = doSummary ? 'body ' : '*';
    const selector = `${rootElement}:not(style):not(script):not(svg)`;

    const loader = new CheerioWebBaseLoader(baseUrl, {
      selector: selector as cheerio.SelectorType,
    });
    const docs = await loader.load();

    // Split text into chunks
    const texts = await splitter.splitDocuments(docs);
    let context: string;

    // Process differently based on whether we want a summary or search
    if (doSummary) {
      // Take more chunks for better summaries, limited by maxChunks
      context = texts
        .slice(0, maxChunks)
        .map((doc) => doc.pageContent)
        .join('\n');
    } else {
      // For searching, use vector search to find relevant sections
      const vectorStore = await MemoryVectorStore.fromDocuments(texts, embeddings);

      const results = await vectorStore.similaritySearch(query, maxResults, undefined);

      context = formatDocumentsAsString(results);
    }

    // Prepare the prompt for the model
    const modelInput = `Text:${context}\n\nI need ${
      doSummary ? 'a summary' : query
    } from the above text, also provide up to 5 markdown links from within that would be of interest (always including URL and text). Links should be provided, if present, in markdown syntax as a list under the heading "Relevant Links:".`;

    // Process with the model
    const chain = RunnableSequence.from([model, new StringOutputParser()]);
    const result = await chain.invoke(modelInput);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }

    return 'There was a problem processing the webpage';
  }
};

/**
 * Creates a web browser tool that fetches and processes web content.
 * This version uses the functional API from LangChain.
 */
export const createWebBrowserTool = (options: WebBrowserOptions): DynamicStructuredTool => {
  return tool(
    async (input: WebBrowserInput) => {
      return webBrowserImpl(input, options);
    },
    {
      name: 'web_browser',
      description: 'Useful for when you need to find something on or summarize a webpage.',
      schema: webBrowserSchema,
    },
  );
};

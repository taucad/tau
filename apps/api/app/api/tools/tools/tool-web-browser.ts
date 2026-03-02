import { TavilyExtract } from '@langchain/tavily';
import type { TavilyExtractResponse } from '@langchain/tavily';
import { StructuredTool } from '@langchain/core/tools';
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { z } from 'zod';
import { toolName } from '@taucad/chat/constants';
import { ToolError } from '@taucad/chat/utils';
import type { WebBrowserOutput } from '@taucad/chat';

type CreateWebBrowserToolOptions = {
  tavilyApiKey: string;
};

const webBrowserInputSchema = z.object({
  urls: z.array(z.string()).min(1).max(5).describe('One or more URLs to extract content from (max 5)'),
  query: z.string().optional().describe('Optional query to rerank extracted chunks by relevance'),
  extractDepth: z
    .enum(['basic', 'advanced'])
    .optional()
    .describe(
      'Extraction depth. Use "basic" (default) for fast text extraction. Use "advanced" for JS-heavy or complex pages that fail with basic extraction.',
    ),
});

/**
 * Custom web browser tool that wraps TavilyExtract and transforms its output.
 *
 * The raw Tavily response contains `{ results: [...], failed_results: [...], ... }`,
 * but we only need the `results` array mapped to `{ url, content }`. This wrapper
 * uses TavilyExtract internally but returns only the transformed results array.
 */
class WebBrowserTool extends StructuredTool {
  public override name = toolName.webBrowser;
  public override description =
    'Extract content from one or more web pages. Accepts an array of URLs (max 5) to batch-extract in a single call. Use after web_search to read full page content from promising results. Optionally pass a query to get only relevant chunks.';

  public override schema = webBrowserInputSchema;

  private readonly tavilyApiKey: string;

  public constructor(tavilyApiKey: string) {
    super();
    this.tavilyApiKey = tavilyApiKey;
  }

  protected override async _call(
    input: z.infer<typeof webBrowserInputSchema>,
    _runManager?: CallbackManagerForToolRun,
  ): Promise<WebBrowserOutput> {
    const tavilyTool = new TavilyExtract({
      extractDepth: input.extractDepth ?? 'basic',
      includeImages: false,
      format: 'markdown',
      tavilyApiKey: this.tavilyApiKey,
    });

    const rawResult = (await tavilyTool.invoke({
      urls: input.urls,
      ...(input.query ? { query: input.query } : {}),
    })) as TavilyExtractResponse | { error: string };

    if ('error' in rawResult) {
      const isNoResults = typeof rawResult.error === 'string' && rawResult.error.startsWith('No extracted results');

      if (isNoResults) {
        throw new ToolError({
          errorCode: 'TOOL_NO_RESULTS',
          message:
            'No content could be extracted from the requested URLs. The pages may block automated access, require JavaScript rendering, or be behind authentication. Try alternative sources via web_search, or retry with extractDepth: "advanced" for complex pages.',
          toolName: this.name,
          toolCallId: _runManager?.runId ?? 'unknown',
        });
      }

      throw new Error(String(rawResult.error));
    }

    return rawResult.results.map((result) => ({
      url: result.url,
      content: result.raw_content,
    }));
  }
}

export const createWebBrowserTool = ({ tavilyApiKey }: CreateWebBrowserToolOptions): WebBrowserTool =>
  new WebBrowserTool(tavilyApiKey);

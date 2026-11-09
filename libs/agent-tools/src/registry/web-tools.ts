/**
 * The `web_search` and `web_browser` tools (regression review R1). Direct host tools like `shell`, not RPCs: the work
 * runs on Tau's API, which holds the search provider's key and fetches pages server-side, so no key reaches a device.
 *
 * The registry lists both only when the host hands in a {@link WebResearchClient}. Hosts build one with
 * {@link createGatewayWebResearchClient} over the same API origin and credential their model transport uses.
 *
 * @module
 */
import type { ToolInputValidationError, WebBrowserOutput, WebSearchOutput } from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { toProviderToolJsonSchema } from '@taucad/chat/schemas/provider-tool-schemas';
import { webBrowserInputSchema } from '@taucad/chat/schemas/tools/web-browser';
import { webSearchInputSchema } from '@taucad/chat/schemas/tools/web-search';
import { z } from 'zod';

import type { HostToolDefinition, HostToolInvocation, HostToolResult, JsonObject, JsonValue } from '@taucad/agent-host';

/**
 * The narrow client the registry needs: Tau's API, which runs the search and the page extraction.
 *
 * Each method throws an `Error` carrying a string `code` when the call fails; the registry returns that code to the
 * model as a tool error.
 *
 * @public
 */
export type WebResearchClient = Readonly<{
  search: (request: Readonly<{ query: string; signal: AbortSignal }>) => Promise<WebSearchOutput>;
  browse: (
    request: Readonly<{
      urls: readonly string[];
      query?: string | undefined;
      signal: AbortSignal;
    }>,
  ) => Promise<WebBrowserOutput>;
}>;

/** The names this module serves. @internal */
export const webToolNames: ReadonlySet<string> = new Set([toolName.webSearch, toolName.webBrowser]);

/** Both web tool definitions, in a stable order. @internal */
export const webToolDefinitions: readonly HostToolDefinition[] = [
  {
    name: toolName.webSearch,
    description: toolDescriptions[toolName.webSearch],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
    inputSchema: toProviderToolJsonSchema(webSearchInputSchema) as JsonObject,
  },
  {
    name: toolName.webBrowser,
    description: toolDescriptions[toolName.webBrowser],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
    inputSchema: toProviderToolJsonSchema(webBrowserInputSchema) as JsonObject,
  },
];

const codedErrorSchema = z.object({ code: z.string() });

const validationFailure = (invocation: HostToolInvocation, error: z.ZodError): HostToolResult => ({
  content: {
    errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
    message: z.prettifyError(error),
    toolName: invocation.toolName,
    toolCallId: invocation.toolCallId,
    validationErrors: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  } satisfies ToolInputValidationError,
  isError: true,
});

/**
 * Validate and run one web tool call through the host's client.
 *
 * @param client - The host's web research client.
 * @param invocation - The call; its name is one of {@link webToolNames}.
 * @returns The tool result.
 * @internal
 */
export const invokeWebTool = async (
  client: WebResearchClient,
  invocation: HostToolInvocation,
): Promise<HostToolResult> => {
  try {
    if (invocation.toolName === toolName.webSearch) {
      const parsed = webSearchInputSchema.safeParse(invocation.input);
      if (!parsed.success) {
        return validationFailure(invocation, parsed.error);
      }
      const results = await client.search({
        query: parsed.data.query,
        signal: invocation.signal,
      });
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- search results are JSON by construction.
      return { content: structuredClone(results) as JsonValue, isError: false };
    }
    const parsed = webBrowserInputSchema.safeParse(invocation.input);
    if (!parsed.success) {
      return validationFailure(invocation, parsed.error);
    }
    const pages = await client.browse({
      urls: parsed.data.urls,
      ...(parsed.data.query === undefined ? {} : { query: parsed.data.query }),
      signal: invocation.signal,
    });
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- extracted pages are JSON by construction.
    return { content: structuredClone(pages) as JsonValue, isError: false };
  } catch (error) {
    if (invocation.signal.aborted) {
      throw invocation.signal.reason instanceof Error
        ? invocation.signal.reason
        : new DOMException('The operation was aborted.', 'AbortError');
    }
    return {
      content: {
        errorCode: codedErrorSchema.safeParse(error).data?.code ?? 'WEB_RESEARCH_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      isError: true,
    };
  }
};

/** Options for {@link createGatewayWebResearchClient}. @public */
export type GatewayWebResearchClientOptions = Readonly<{
  /** The Tau API origin the model transport also uses; the client appends `v1/llm/tools/...`. */
  baseUrl: string;
  /**
   * Bearer token provider for hosts with no cookie jar (desktop, daemon). Omitted or resolving to `undefined`, the
   * request carries no `Authorization` header and stays cookie-authenticated, as the browser's does.
   */
  auth?: (() => string | undefined | Promise<string | undefined>) | undefined;
  fetch?: typeof globalThis.fetch | undefined;
}>;

const searchResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })),
  }),
  z.object({
    success: z.literal(false),
    errorCode: z.string(),
    message: z.string(),
  }),
]);

const browseResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    pages: z.array(z.object({ url: z.string(), content: z.string() })),
  }),
  z.object({
    success: z.literal(false),
    errorCode: z.string(),
    message: z.string(),
  }),
]);

const codedError = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/**
 * A {@link WebResearchClient} over Tau's API gateway (`POST /v1/llm/tools/web-search` and `/web-browser`).
 *
 * @param options - The API origin, the host's credential and an optional fetch.
 * @returns The client.
 * @public
 *
 * @example <caption>A browser host, authenticated by its session cookie</caption>
 * ```typescript
 * import { createGatewayWebResearchClient } from '@taucad/agent-tools/registry';
 *
 * const web = createGatewayWebResearchClient({ baseUrl: 'https://api.tau.new', auth: () => undefined });
 * ```
 */
export const createGatewayWebResearchClient = (options: GatewayWebResearchClientOptions): WebResearchClient => {
  const root = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
  const post = async (path: string, body: JsonObject, signal: AbortSignal): Promise<unknown> => {
    const headers = new Headers({ 'content-type': 'application/json' });
    const token = await options.auth?.();
    if (token !== undefined) {
      headers.set('authorization', `Bearer ${token}`);
    }
    const fetch = options.fetch ?? globalThis.fetch;
    const response = await fetch(`${root}v1/llm/tools/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
      signal,
    });
    if (!response.ok) {
      throw codedError(
        `WEB_RESEARCH_HTTP_${String(response.status)}`,
        `Tau's web research service answered HTTP ${String(response.status)}.`,
      );
    }
    return response.json();
  };
  return {
    search: async ({ query, signal }) => {
      const parsed = searchResponseSchema.parse(await post('web-search', { query }, signal));
      if (!parsed.success) {
        throw codedError(parsed.errorCode, parsed.message);
      }
      return parsed.results;
    },
    browse: async ({ urls, query, signal }) => {
      const parsed = browseResponseSchema.parse(
        await post('web-browser', { urls: [...urls], ...(query === undefined ? {} : { query }) }, signal),
      );
      if (!parsed.success) {
        throw codedError(parsed.errorCode, parsed.message);
      }
      return parsed.pages;
    },
  };
};

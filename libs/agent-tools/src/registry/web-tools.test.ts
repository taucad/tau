import { describe, expect, it, vi } from 'vitest';

import type { JsonValue } from '@taucad/agent-host';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import { toolName } from '@taucad/chat/constants';
import { cadProviderFacingToolNames } from '@taucad/chat/schemas/provider-tool-schemas';

import { isMachineToolName } from '#registry/machine-tool-registry.js';
import { createChatToolRegistry, servedToolNames } from '#registry/tool-registry.js';
import { createGatewayWebResearchClient } from '#registry/web-tools.js';
import type { WebResearchClient } from '#registry/web-tools.js';

/* The web tools never touch the filesystem. */
const fileSystem = {} as unknown as RpcFileSystem;

const webClient = (overrides: Partial<WebResearchClient> = {}): WebResearchClient => ({
  search: vi.fn(async () => [
    {
      title: 'ISO 4762',
      url: 'https://example.com/iso-4762',
      content: 'Socket head cap screws',
    },
  ]),
  browse: vi.fn<WebResearchClient['browse']>(async ({ urls }) => urls.map((url) => ({ url, content: `# ${url}` }))),
  ...overrides,
});

const registryWith = (web?: WebResearchClient) =>
  createChatToolRegistry({
    fileSystemFor: () => fileSystem,
    testingEnabled: false,
    ...(web === undefined ? {} : { web }),
  });

const invoke = async (web: WebResearchClient, name: string, input: unknown) =>
  registryWith(web).invoke({
    toolCallId: 'call-1',
    toolName: name,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- tests exercise unvalidated JSON.
    input: input as JsonValue,
    signal: new AbortController().signal,
  });

describe('schema to registry parity', () => {
  it('should serve every provider-facing tool name through some registry route', () => {
    const unserved = cadProviderFacingToolNames.filter(
      (name) => !servedToolNames.has(name) && !isMachineToolName(name) && name !== toolName.shell,
    );

    expect(unserved).toEqual([]);
  });
});

describe('web research tools', () => {
  it('should not list web_search or web_browser without a web client', () => {
    const names = registryWith()
      .list()
      .map((tool) => tool.name);

    expect(names).not.toContain(toolName.webSearch);
    expect(names).not.toContain(toolName.webBrowser);
  });

  it('should list web_search and web_browser with their descriptions when a web client is supplied', () => {
    const tools = registryWith(webClient()).list();
    const search = tools.find((tool) => tool.name === toolName.webSearch);
    const browser = tools.find((tool) => tool.name === toolName.webBrowser);

    expect(search?.description).toContain('web_browser');
    expect(browser?.description).toContain('web_search');
    expect(search?.inputSchema).toMatchObject({
      properties: { query: { type: 'string' } },
    });
  });

  it('should route web_search to the client and return its results', async () => {
    const client = webClient();

    const result = await invoke(client, toolName.webSearch, {
      query: 'M3 cap screw head height',
    });

    expect(client.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'M3 cap screw head height' }));
    expect(result).toEqual({
      content: [
        {
          title: 'ISO 4762',
          url: 'https://example.com/iso-4762',
          content: 'Socket head cap screws',
        },
      ],
      isError: false,
    });
  });

  it('should route web_browser to the client with every url', async () => {
    const client = webClient();

    const result = await invoke(client, toolName.webBrowser, {
      urls: ['https://example.com/a', 'https://example.com/b'],
    });

    expect(client.browse).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['https://example.com/a', 'https://example.com/b'],
      }),
    );
    expect(result.isError).toBe(false);
  });

  it('should refuse invalid input without calling the client', async () => {
    const client = webClient();

    const result = await invoke(client, toolName.webBrowser, { urls: [] });

    expect(client.browse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' },
      isError: true,
    });
  });

  it('should return a coded tool error when the client fails', async () => {
    const client = webClient({
      search: vi.fn(async () => {
        throw Object.assign(new Error('Web search is not configured on this server.'), {
          code: 'WEB_SEARCH_UNAVAILABLE',
        });
      }),
    });

    const result = await invoke(client, toolName.webSearch, {
      query: 'anything',
    });

    expect(result).toEqual({
      content: {
        errorCode: 'WEB_SEARCH_UNAVAILABLE',
        message: 'Web search is not configured on this server.',
      },
      isError: true,
    });
  });
});

describe('createGatewayWebResearchClient', () => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('should post a search to the gateway with the bearer token and no cookies dropped', async () => {
    const fetch = vi.fn(async () =>
      ok({
        success: true,
        results: [{ title: 't', url: 'https://x.test', content: 'c' }],
      }),
    );
    const client = createGatewayWebResearchClient({
      baseUrl: 'https://api.tau.test',
      auth: () => 'token-1',
      fetch,
    });

    const results = await client.search({
      query: 'q',
      signal: new AbortController().signal,
    });

    expect(results).toEqual([{ title: 't', url: 'https://x.test', content: 'c' }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tau.test/v1/llm/tools/web-search');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'q' });
  });

  it('should send no authorization header when the host has no bearer token', async () => {
    const fetch = vi.fn(async () => ok({ success: true, pages: [] }));
    const client = createGatewayWebResearchClient({
      baseUrl: 'https://api.tau.test/',
      fetch,
    });

    await client.browse({
      urls: ['https://x.test'],
      signal: new AbortController().signal,
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tau.test/v1/llm/tools/web-browser');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('should throw a coded error for a refusal the gateway reports', async () => {
    const fetch = vi.fn(async () =>
      ok({
        success: false,
        errorCode: 'WEB_SEARCH_UNAVAILABLE',
        message: 'Web search is not configured.',
      }),
    );
    const client = createGatewayWebResearchClient({
      baseUrl: 'https://api.tau.test',
      fetch,
    });

    await expect(client.search({ query: 'q', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'WEB_SEARCH_UNAVAILABLE',
      message: 'Web search is not configured.',
    });
  });

  it('should throw a coded error for an HTTP failure', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 401 }));
    const client = createGatewayWebResearchClient({
      baseUrl: 'https://api.tau.test',
      fetch,
    });

    await expect(client.search({ query: 'q', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'WEB_RESEARCH_HTTP_401',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createProjectModelResolver, mapProjectCatalogModel } from '#tau/project-model-resolver.js';

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'chosen',
  provider: { id: 'openai' },
  details: {
    contextWindow: 200_000,
    maxTokens: 16_000,
    cost: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0.1, cacheWriteTokens: 0.2 },
  },
  configuration: { reasoning: { effort: 'high', summary: 'auto' } },
  ...overrides,
});

describe('desktop Tau child catalog resolver', () => {
  it('uses the latest token and projects the exact selected catalog row', async () => {
    let token = 'old';
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([catalogRow()]));
    const resolve = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => token,
      fetch: fetcher,
    });
    token = 'new';
    const model = await resolve({ modelId: 'chosen', signal: new AbortController().signal });
    expect(model).toEqual({
      id: 'chosen',
      providerKind: 'openai',
      contextWindow: 200_000,
      maxTokens: 16_000,
      cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
      reasoning: { effort: 'high', summary: 'auto' },
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://api.example.test/v1/models'),
      expect.objectContaining({
        headers: { authorization: 'Bearer new' },
        redirect: 'error',
      }),
    );
  });

  it.each([
    [catalogRow({ provider: { id: 'unknown' } })],
    [catalogRow({ details: { contextWindow: 0, maxTokens: 1, cost: {} } })],
    [catalogRow({ configuration: { reasoning: { effort: 'impossible' } } })],
  ])('rejects invalid catalog admission rows', (row) => {
    expect(mapProjectCatalogModel(row)).toBeUndefined();
  });

  it('matches Anthropic and Vertex default reasoning semantics', () => {
    expect(
      mapProjectCatalogModel(
        catalogRow({
          provider: { id: 'anthropic' },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic catalog uses snake_case.
          configuration: { thinking: { type: 'enabled', budget_tokens: 4096 } },
        }),
      )?.reasoning,
    ).toEqual({ budgetTokens: 4096 });
    expect(
      mapProjectCatalogModel(
        catalogRow({
          provider: { id: 'anthropic' },
          configuration: { thinking: { type: 'adaptive', display: 'summarized' }, outputConfig: { effort: 'max' } },
        }),
      )?.reasoning,
    ).toEqual({ effort: 'max', display: 'summarized' });
    expect(
      mapProjectCatalogModel(
        catalogRow({
          provider: { id: 'vertexai' },
          configuration: { thinkingLevel: 'HIGH' },
        }),
      )?.reasoning,
    ).toEqual({ effort: 'high' });
  });

  it('fails safely on missing selection, bad responses and cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([catalogRow()]));
    const resolve = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => 'secret',
      fetch: fetcher,
    });
    await expect(resolve({ modelId: 'missing', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
      message: 'The requested Tau model is unavailable on this host.',
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(resolve({ modelId: 'chosen', signal: aborted.signal })).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(new Response('private body', { status: 500 }));
    await expect(resolve({ modelId: 'chosen', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
      message: 'The requested Tau model is unavailable on this host.',
    });
  });

  it('should reject a redirect without forwarding the session token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.redirect).toBe('error');
      throw new TypeError('redirect blocked');
    });
    const resolve = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => 'secret',
      fetch: fetcher,
    });
    await expect(resolve({ modelId: 'chosen', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
      message: 'The requested Tau model is unavailable on this host.',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('should abort a catalog read in flight before returning a model', async () => {
    const controller = new AbortController();
    let readStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      readStarted = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          readStarted?.();
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('catalog request aborted'));
          });
        }),
    );
    const resolve = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => 'secret',
      fetch: fetcher,
    });
    const pending = resolve({ modelId: 'chosen', signal: controller.signal });
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('should reject malformed JSON and avoid fetching without a live session', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{invalid json', { status: 200 }));
    const resolve = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => 'secret',
      fetch: fetcher,
    });
    await expect(resolve({ modelId: 'chosen', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
      message: 'The requested Tau model is unavailable on this host.',
    });
    const signedOut = createProjectModelResolver({
      apiBaseUrl: 'https://api.example.test/',
      authToken: () => undefined,
      fetch: fetcher,
    });
    await expect(signedOut({ modelId: 'chosen', signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'TASK_UNAVAILABLE',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

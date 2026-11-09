import { describe, expect, it, vi } from 'vitest';

import { createHostWebResearchClient } from '#agent-tools.js';

describe('createHostWebResearchClient', () => {
  it('should read the credential at each call and send its bearer to the API origin', async () => {
    let credential: { apiBaseUrl: string; authorization: string } | undefined = {
      apiBaseUrl: 'https://api.tau.test',
      authorization: 'Bearer first',
    };
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ success: true, results: [] }));
    const client = createHostWebResearchClient(() => credential, fetch as unknown as typeof globalThis.fetch);

    await client.search({ query: 'q', signal: new AbortController().signal });
    credential = {
      apiBaseUrl: 'https://api.tau.test',
      authorization: 'Bearer second',
    };
    await client.search({ query: 'q', signal: new AbortController().signal });

    const headers = fetch.mock.calls.map(([, init]) => new Headers(init.headers).get('authorization'));
    expect(headers).toEqual(['Bearer first', 'Bearer second']);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.tau.test/v1/llm/tools/web-search');
  });

  it('should refuse with a coded error while signed out, without a request', async () => {
    const fetch = vi.fn();
    const client = createHostWebResearchClient(() => undefined, fetch);

    await expect(
      client.browse({
        urls: ['https://x.test'],
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'WEB_RESEARCH_SIGNED_OUT' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

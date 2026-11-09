import { describe, expect, it, vi } from 'vitest';

import { htmlToText, isPublicAddress, browseWeb, searchWeb, maxPageCharacters } from '#web-research/web-research.js';
import type { WebResearchDependencies } from '#web-research/web-research.js';

const signal = (): AbortSignal => new AbortController().signal;

const publicLookup: WebResearchDependencies['lookup'] = async () => [{ address: '93.184.216.34', family: 4 }];

const html = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });

describe('searchWeb', () => {
  it('should post the query to Tavily with the key as a bearer and return title, url and content', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: 'ISO 4762',
            url: 'https://example.com/iso',
            content: 'Cap screws',
            score: 0.9,
          },
        ],
      }),
    );

    const outcome = await searchWeb({ query: 'M3 cap screw', apiKey: 'tvly-test', signal: signal() }, { fetch });

    expect(outcome).toEqual({
      success: true,
      results: [
        {
          title: 'ISO 4762',
          url: 'https://example.com/iso',
          content: 'Cap screws',
        },
      ],
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tvly-test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      query: 'M3 cap screw',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Tavily's wire field name.
      max_results: 5,
    });
  });

  it('should refuse with WEB_SEARCH_UNAVAILABLE when no key is configured, without calling out', async () => {
    const fetch = vi.fn();

    const outcome = await searchWeb({ query: 'q', apiKey: undefined, signal: signal() }, { fetch });

    expect(outcome).toMatchObject({
      success: false,
      errorCode: 'WEB_SEARCH_UNAVAILABLE',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should report WEB_SEARCH_FAILED when the provider answers an error', async () => {
    const fetch = vi.fn(async () => new Response('{"detail":"bad key"}', { status: 401 }));

    const outcome = await searchWeb({ query: 'q', apiKey: 'tvly-test', signal: signal() }, { fetch });

    expect(outcome).toMatchObject({
      success: false,
      errorCode: 'WEB_SEARCH_FAILED',
    });
  });
});

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('should refuse the non-public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])('should admit the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('htmlToText', () => {
  it('should drop scripts and styles, keep headings and paragraphs, and decode entities', () => {
    const text = htmlToText(
      '<html><head><title>T</title><style>p{}</style></head><body><script>evil()</script><h1>Bolts &amp; nuts</h1><p>M3&nbsp;head is 5.5&#160;mm.</p><ul><li>One</li><li>Two</li></ul></body></html>',
    );

    expect(text).toBe('# Bolts & nuts\n\nM3 head is 5.5 mm.\n\n- One\n- Two');
  });
});

describe('browseWeb', () => {
  it('should extract each page and keep a failed one as an extraction-failed entry', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/ok') ? html('<p>Hello</p>') : new Response('gone', { status: 404, statusText: 'Not Found' }),
    );

    const outcome = await browseWeb(
      {
        urls: ['https://example.com/ok', 'https://example.com/missing'],
        signal: signal(),
      },
      { fetch, lookup: publicLookup },
    );

    expect(outcome).toEqual({
      success: true,
      pages: [
        { url: 'https://example.com/ok', content: 'Hello' },
        {
          url: 'https://example.com/missing',
          content: '[Extraction failed] HTTP 404 Not Found. Try a different source via web_search.',
        },
      ],
    });
  });

  it('should refuse a host that resolves to a private address without fetching it', async () => {
    const fetch = vi.fn();

    const outcome = await browseWeb(
      { urls: ['http://metadata.internal/latest'], signal: signal() },
      {
        fetch,
        lookup: async () => [{ address: '169.254.169.254', family: 4 }],
      },
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      success: false,
      errorCode: 'WEB_BROWSER_NO_RESULTS',
    });
  });

  it('should re-check every redirect hop and refuse one into a private address', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/admin' },
        }),
    );

    const outcome = await browseWeb(
      { urls: ['https://example.com/redirect'], signal: signal() },
      {
        fetch,
        lookup: async (host) => [
          {
            address: host === '127.0.0.1' ? '127.0.0.1' : '93.184.216.34',
            family: 4,
          },
        ],
      },
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ success: false });
  });

  it('should refuse a non-http scheme', async () => {
    const fetch = vi.fn();

    const outcome = await browseWeb(
      { urls: ['file:///etc/passwd'], signal: signal() },
      { fetch, lookup: publicLookup },
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ success: false });
  });

  it('should truncate a long page and say how much was left out', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('x'.repeat(maxPageCharacters + 10), {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    );

    const outcome = await browseWeb(
      { urls: ['https://example.com/long'], signal: signal() },
      { fetch, lookup: publicLookup },
    );

    expect(outcome.success).toBe(true);
    const content = outcome.success ? (outcome.pages[0]?.content ?? '') : '';
    expect(content.startsWith('x'.repeat(maxPageCharacters))).toBe(true);
    expect(content).toContain('[Truncated: 10 more characters]');
  });
});

import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import {
  browseWeb,
  fetchAtAddress,
  htmlToText,
  isPublicAddress,
  maxPageCharacters,
  searchWeb,
} from '#web-research/web-research.js';
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

  it('should connect each hop to the address it checked, and ask the resolver once per hop', async () => {
    /* A name that answers a public address, then a private one. */
    const answers = ['93.184.216.34', '127.0.0.1'];
    const lookup = vi.fn(async () => [{ address: answers.shift() ?? '127.0.0.1', family: 4 }]);
    const fetch = vi.fn(async () => html('<p>Public</p>'));

    const outcome = await browseWeb({ urls: ['http://changing.example/page'], signal: signal() }, { fetch, lookup });

    expect(outcome).toMatchObject({ success: true, pages: [{ content: 'Public' }] });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://changing.example/page', expect.anything(), [
      { address: '93.184.216.34', family: 4 },
    ]);
  });

  it('should release the body of every response it does not read', async () => {
    const released: string[] = [];
    const tracked = (name: string, init: ResponseInit): Response =>
      new Response(
        new ReadableStream({
          pull: (controller) => {
            controller.enqueue(new TextEncoder().encode('unread'));
          },
          cancel: () => {
            released.push(name);
          },
        }),
        init,
      );
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/start')
        ? tracked('redirect', { status: 302, headers: { location: '/missing' } })
        : url.endsWith('/missing')
          ? tracked('not found', { status: 404 })
          : tracked('binary', { status: 200, headers: { 'content-type': 'application/zip' } }),
    );

    await browseWeb(
      { urls: ['https://example.com/start', 'https://example.com/archive.zip'], signal: signal() },
      { fetch, lookup: publicLookup },
    );

    expect(released.toSorted()).toEqual(['binary', 'not found', 'redirect']);
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

describe('fetchAtAddress', () => {
  it('should connect to the given address, not to what the host name resolves to', async () => {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'text/plain');
      response.end(`host ${request.headers.host ?? ''}`);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      /* `.invalid` never resolves (RFC 6761): only a pinned connection reaches the server. */
      const response = await fetchAtAddress(`http://pinned.invalid:${String(port)}/`, { signal: signal() }, [
        { address: '127.0.0.1', family: 4 },
      ]);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`host pinned.invalid:${String(port)}`);
    } finally {
      server.close();
    }
  });

  it('should fall back to the next checked address when the first refuses the connection', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'text/plain');
      response.end('reached');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      /* 127.0.0.2 is loopback with nothing listening on this port. */
      const response = await fetchAtAddress(`http://pinned.invalid:${String(port)}/`, { signal: signal() }, [
        { address: '127.0.0.2', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);

      expect(await response.text()).toBe('reached');
    } finally {
      server.close();
    }
  });

  it('should answer a 205 with no body, and reject a status the Fetch API cannot carry', async () => {
    /* A raw server: Node's own refuses to write a status outside 100 to 999's usual range. */
    const server = createNetServer((socket) => {
      socket.once('data', (chunk) => {
        const status = chunk.toString().startsWith('GET /reset') ? '205 Reset Content' : '600 Odd';
        socket.end(`HTTP/1.1 ${status}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`);
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    const at = [{ address: '127.0.0.1', family: 4 }] as const;
    try {
      const reset = await fetchAtAddress(`http://pinned.invalid:${String(port)}/reset`, { signal: signal() }, at);

      expect(reset.status).toBe(205);
      expect(reset.body).toBeNull();
      await expect(
        fetchAtAddress(`http://pinned.invalid:${String(port)}/odd`, { signal: signal() }, at),
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });

  it('should decode a gzip or brotli body, and refuse a coding it cannot decode', async () => {
    const page = 'compressed page text';
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'text/plain');
      if (request.url === '/gzip') {
        response.setHeader('content-encoding', 'gzip');
        response.end(gzipSync(page));
      } else if (request.url === '/br') {
        response.setHeader('content-encoding', 'br');
        response.end(brotliCompressSync(page));
      } else {
        response.setHeader('content-encoding', 'zstd');
        response.end('opaque');
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    const at = [{ address: '127.0.0.1', family: 4 }] as const;
    const get = async (path: string) =>
      fetchAtAddress(`http://pinned.invalid:${String(port)}${path}`, { signal: signal() }, at);
    try {
      for (const path of ['/gzip', '/br']) {
        // oxlint-disable-next-line no-await-in-loop -- one request at a time against one server.
        const response = await get(path);
        expect(response.headers.get('content-encoding')).toBeNull();
        // oxlint-disable-next-line no-await-in-loop -- one request at a time against one server.
        expect(await response.text()).toBe(page);
      }
      await expect(get('/zstd')).rejects.toThrow('Unsupported content encoding: zstd');
    } finally {
      server.close();
    }
  });

  it('should close the connection of a compressed body the reader cancels', async () => {
    let closed: () => void = () => undefined;
    const socketClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const server = createServer((_request, response) => {
      response.socket?.once('close', () => {
        closed();
      });
      response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      /* The start of a body that never ends. */
      response.write(gzipSync('<p>start</p>').subarray(0, 10));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const response = await fetchAtAddress(`http://pinned.invalid:${String(port)}/`, { signal: signal() }, [
        { address: '127.0.0.1', family: 4 },
      ]);

      await response.body?.cancel();

      await expect(socketClosed).resolves.toBeUndefined();
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it('should reject at once when its signal is already aborted', async () => {
    const aborted = AbortSignal.abort();

    await expect(
      fetchAtAddress('http://pinned.invalid/', { signal: aborted }, [{ address: '127.0.0.1', family: 4 }]),
    ).rejects.toThrow();
  });
});

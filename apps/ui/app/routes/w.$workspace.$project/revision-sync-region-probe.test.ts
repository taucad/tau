/**
 * The *Change backup* probe (R2), over a scripted git proxy.
 *
 * The real port and the real transport, so the request it makes and the
 * sentence a refusal reads in are the ones the connect path's `validate` would
 * produce; only `fetch` is scripted.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeRemote } from '#routes/w.$workspace.$project/revision-sync-region-probe.js';

const apiBaseUrl = 'https://api.test';

const pkt = (line: string): string => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;

/* A v1 smart-HTTP advertisement holding one branch. */
const advertisement = (): Response =>
  new Response(
    `${pkt('# service=git-upload-pack\n')}0000${pkt(`${'a'.repeat(40)} refs/heads/main\0side-band-64k\n`)}0000`,
    { status: 200, headers: { 'content-type': 'application/x-git-upload-pack-advertisement' } },
  );

const stubFetch = (answer: () => Response): ReturnType<typeof vi.fn<typeof globalThis.fetch>> => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => answer());
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

const requested = (fetch: ReturnType<typeof stubFetch>): Readonly<{ url: string; headers: Headers }> => {
  const [input, init] = fetch.mock.calls[0] ?? [];
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
  return { url, headers: new Headers(init?.headers) };
};

describe('probeRemote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should ask the new repository for its advertisement through the git proxy with its own credential', async () => {
    const fetch = stubFetch(advertisement);

    await probeRemote(
      {
        url: 'https://github.com/o/r.git',
        authorization: 'Basic token',
        provider: 'github',
        repositoryId: '99',
      },
      apiBaseUrl,
    );

    const { url, headers } = requested(fetch);
    expect(url).toBe(
      `${apiBaseUrl}/v1/git/proxy?url=${encodeURIComponent('https://github.com/o/r.git/info/refs?service=git-upload-pack')}`,
    );
    expect(headers.get('x-tau-proxy-authorization')).toBe('Basic token');
  });

  it('should reject with the refusal a sync would show when the repository is not there', async () => {
    stubFetch(() => new Response('', { status: 404 }));

    await expect(
      probeRemote(
        { url: 'https://github.com/o/gone.git', authorization: 'Basic token', provider: 'github', repositoryId: '7' },
        apiBaseUrl,
      ),
    ).rejects.toThrow('This remote has no repository at this address for your account.');
  });

  it('should reject an anonymous remote that asks for a sign-in in D94’s words', async () => {
    const fetch = stubFetch(() => new Response('', { status: 401 }));

    await expect(probeRemote({ url: 'https://gitlab.example.com/o/r.git' }, apiBaseUrl)).rejects.toThrow(
      'This remote asked for a sign-in Tau does not have, or has no repository at this address.',
    );
    expect(requested(fetch).headers.get('x-tau-proxy-authorization')).toBeNull();
  });
});

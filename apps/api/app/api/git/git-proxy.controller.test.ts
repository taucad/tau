/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names are not identifiers */
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GitProxyController } from '#api/git/git-proxy.controller.js';

const request = (headers: Record<string, string>, method = 'GET'): FastifyRequest =>
  ({ headers, method, raw: Readable.from([]) }) as unknown as FastifyRequest;

const reply = (): FastifyReply =>
  // oxlint-disable-next-line unicorn/prefer-event-target -- a fake Fastify `reply.raw`, which is a Node EventEmitter
  ({ status: vi.fn(), header: vi.fn(), raw: new EventEmitter() }) as unknown as FastifyReply;

describe('GitProxyController', () => {
  it('forwards the remote credential from its own header and never the Tau session', async () => {
    const calls: Array<{ url: string; authorization: string | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          authorization: new Headers(init.headers).get('authorization') ?? undefined,
        });
        return new Response('001e# service=git-upload-pack\n0000', {
          status: 200,
        });
      }),
    );

    const controller = new GitProxyController();
    await controller.proxyGet(
      { url: 'https://github.com/tau/example.git/info/refs' },
      request({
        authorization: 'Bearer tau-session-token',
        'x-tau-proxy-authorization': 'Bearer github-token',
      }),
      reply(),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://github.com/tau/example.git/info/refs');
    expect(calls[0]?.authorization).toBe('Bearer github-token');

    await controller.proxyGet(
      { url: 'https://github.com/tau/example.git/info/refs' },
      request({ authorization: 'Bearer tau-session-token' }),
      reply(),
    );
    expect(calls[1]?.authorization).toBeUndefined();

    vi.unstubAllGlobals();
  });

  // Red pin (e): the review reproduced a 302 from an allowed host to loopback
  // being followed with no re-check — an SSRF hole into the Fly private network.
  it('refuses a redirect to a blocked host instead of following it', async () => {
    const calls: string[] = [];
    const redirects: RequestRedirect[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(String(url));
        redirects.push(init.redirect ?? 'follow');
        return new Response(undefined, {
          status: 302,
          headers: { location: 'http://127.0.0.1:62781/latest/meta-data' },
        });
      }),
    );

    const controller = new GitProxyController();
    await expect(
      controller.proxyGet({ url: 'https://github.com/tau/example.git/info/refs' }, request({}), reply()),
    ).rejects.toThrow();

    // The hop was never taken: the upstream saw exactly one request, and it was
    // made with `redirect: 'manual'` so undici could not take it either.
    expect(calls).toEqual(['https://github.com/tau/example.git/info/refs']);
    expect(redirects).toEqual(['manual']);

    vi.unstubAllGlobals();
  });

  it('follows a redirect that stays on an allowed git endpoint, up to the hop cap', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return calls.length <= 2
          ? new Response(undefined, {
              status: 301,
              headers: { location: `https://github.com/tau/example.git/info/refs?hop=${String(calls.length)}` },
            })
          : new Response('001e# service=git-upload-pack\n0000', { status: 200 });
      }),
    );

    const controller = new GitProxyController();
    await controller.proxyGet({ url: 'https://gitlab.com/tau/example.git/info/refs' }, request({}), reply());
    expect(calls).toHaveLength(3);

    // One hop past the cap is a refusal, not a silent truncation.
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response(undefined, {
          status: 302,
          headers: { location: 'https://github.com/tau/example.git/info/refs' },
        });
      }),
    );
    await expect(
      controller.proxyGet({ url: 'https://gitlab.com/tau/example.git/info/refs' }, request({}), reply()),
    ).rejects.toThrow();
    expect(calls).toHaveLength(3);

    vi.unstubAllGlobals();
  });

  it('refuses a target that is not an https git endpoint', async () => {
    const controller = new GitProxyController();
    const refusals = [
      'http://github.com/tau/x.git/info/refs',
      'https://user:token@github.com/tau/x.git/info/refs',
      'https://github.com/tau/x.git/info/refs?token=secret',
      'https://127.0.0.1/x.git/info/refs',
      'https://10.0.0.4/x.git/info/refs',
      'https://metadata.internal/x.git/info/refs',
      'https://github.com/tau/x.git/objects/info/packs',
      // Host forms that a string-prefix test on `URL.hostname` misses. The
      // WHATWG parser already folds the decimal, hex and octal IPv4 spellings
      // to dotted-quad; the IPv4-mapped IPv6 form and these ranges do not.
      'https://[::ffff:127.0.0.1]/x.git/info/refs',
      'https://[::1]/x.git/info/refs',
      'https://[fdaa:0:1::3]/x.git/info/refs',
      'https://0.0.0.0/x.git/info/refs',
      'https://100.64.0.1/x.git/info/refs',
      'https://169.254.169.254/latest/x.git/info/refs',
      'https://2130706433/x.git/info/refs',
      'https://0x7f.0.0.1/x.git/info/refs',
    ];

    for (const url of refusals) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(controller.proxyGet({ url }, request({}), reply()), url).rejects.toThrow();
    }
  });
});

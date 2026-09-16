/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names are not identifiers */
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { GitProxyController } from '#api/git/git-proxy.controller.js';
import type { RedisService } from '#redis/redis.service.js';

/** The proxy reads exactly one setting: ruling P50's dev-only relaxation. */
const proxyController = (allowPrivate = false, redis?: RedisService): GitProxyController =>
  new GitProxyController(
    {
      get: (key: string) => (key === 'TAU_API_URL' ? 'https://api.tau.test' : allowPrivate ? '1' : '0'),
    } as unknown as ConfigService<Environment, true>,
    redis ??
      ({
        client: { get: vi.fn(), set: vi.fn() },
      } as unknown as RedisService),
    globalThis.fetch,
  );

const request = (headers: Record<string, string>, method = 'GET'): FastifyRequest =>
  ({ headers, method, raw: Readable.from([]) }) as unknown as FastifyRequest;

const reply = (): FastifyReply => {
  const value = {
    // oxlint-disable-next-line unicorn/prefer-event-target -- a fake Fastify `reply.raw`, which is a Node EventEmitter
    raw: new EventEmitter(),
  } as unknown as FastifyReply;
  value.status = vi.fn(() => value);
  value.header = vi.fn(() => value);
  return value;
};

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

    const controller = proxyController();
    await controller.proxyGet(
      'user-1',
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
      'user-1',
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

    const controller = proxyController();
    await expect(
      controller.proxyGet('user-1', { url: 'https://github.com/tau/example.git/info/refs' }, request({}), reply()),
    ).rejects.toThrow();

    // The hop was never taken: the upstream saw exactly one request, and it was
    // made with `redirect: 'manual'` so undici could not take it either.
    expect(calls).toEqual(['https://github.com/tau/example.git/info/refs']);
    expect(redirects).toEqual(['manual']);

    vi.unstubAllGlobals();
  });

  /**
   * C33 (policy Rule 11): a GitHub App installation token is scoped to one
   * *repository*, and a renamed or transferred repository redirects to a
   * different path on the **same** origin — so dropping the credential only on
   * a cross-origin hop replayed it at a repository it was never issued for.
   * A request that carried a proxy credential now follows nothing.
   */
  it('refuses a same-origin redirect on a request that carried a proxy credential', async () => {
    const calls: Array<{ url: string; authorization: string | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          authorization: new Headers(init.headers).get('authorization') ?? undefined,
        });
        return new Response(undefined, {
          status: 301,
          headers: { location: 'https://github.com/someone-else/renamed.git/info/refs' },
        });
      }),
    );

    const controller = proxyController();
    await expect(
      controller.proxyGet(
        'user-1',
        { url: 'https://github.com/tau/example.git/info/refs' },
        request({ 'x-tau-proxy-authorization': 'Bearer ghs_installation_token' }),
        reply(),
      ),
    ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_REDIRECTED_CREDENTIAL' } });

    /* The second repository never saw the token, because the hop was never
       taken: one upstream request, and it was the one the caller named. */
    expect(calls).toEqual([
      { url: 'https://github.com/tau/example.git/info/refs', authorization: 'Bearer ghs_installation_token' },
    ]);

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

    const controller = proxyController();
    await controller.proxyGet('user-1', { url: 'https://gitlab.com/tau/example.git/info/refs' }, request({}), reply());
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
    const loopingController = proxyController();
    await expect(
      loopingController.proxyGet(
        'user-1',
        { url: 'https://gitlab.com/tau/example.git/info/refs' },
        request({}),
        reply(),
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(3);

    vi.unstubAllGlobals();
  });

  it('refuses a target that is not an https git endpoint', async () => {
    const controller = proxyController();
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
      await expect(controller.proxyGet('user-1', { url }, request({}), reply()), url).rejects.toThrow();
    }
  });

  /**
   * Ruling P50 (W18 DEF-3). The relaxation is one operator env and it moves
   * exactly two refusals — the scheme and the address range. Everything the
   * guard refuses for a *different* reason stays refused, which is what keeps
   * it a test posture rather than an open proxy.
   */
  it('reaches a local git http-backend only when TAU_GIT_REMOTE_ALLOW_PRIVATE is set', async () => {
    const local = 'http://127.0.0.1:5014/two-client.git/info/refs';
    await expect(proxyController().proxyGet('user-1', { url: local }, request({}), reply())).rejects.toThrow();

    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response('001e# service=git-upload-pack\n0000', { status: 200 });
      }),
    );
    const relaxed = proxyController(true);
    await relaxed.proxyGet('user-1', { url: local }, request({}), reply());
    expect(calls).toEqual([local]);

    for (const url of [
      'http://127.0.0.1:5014/two-client.git/objects/info/packs',
      'http://user:token@127.0.0.1:5014/two-client.git/info/refs',
      'ftp://127.0.0.1/two-client.git/info/refs',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(relaxed.proxyGet('user-1', { url }, request({}), reply()), url).rejects.toThrow();
    }
    expect(calls).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  it('replaces Git LFS signed actions with short-lived user-bound relay handles', async () => {
    const records = new Map<string, string>();
    const redis = {
      client: {
        set: vi.fn(async (key: string, value: string) => {
          records.set(key, value);
          return 'OK';
        }),
        get: vi.fn(async (key: string) => records.get(key) ?? null),
      },
    } as unknown as RedisService;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              objects: [
                {
                  oid: 'a'.repeat(64),
                  size: 3,
                  actions: {
                    download: {
                      href: 'https://127.0.0.1/signed/object?secret=yes',
                      header: { Authorization: 'signed', Host: 'metadata.internal', Cookie: 'secret=cookie' },
                    },
                  },
                },
              ],
            }),
            { headers: { 'content-type': 'application/vnd.git-lfs+json' } },
          ),
      ),
    );
    const controller = proxyController(true, redis);
    const result = await controller.proxyPost(
      'user-1',
      { url: 'http://127.0.0.1/repo.git/info/lfs/objects/batch' },
      request({}, 'POST'),
      reply(),
    );
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of result.getStream()) {
      chunks.push(Uint8Array.from(chunk as Uint8Array<ArrayBuffer>));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    expect(body).toContain('https://api.tau.test/v1/git/lfs/');
    expect(body).not.toContain('secret=yes');
    expect(records.size).toBe(1);
    const stored = [...records.values()][0] ?? '';
    expect(stored).toContain('Authorization');
    expect(stored).not.toContain('metadata.internal');
    expect(stored).not.toContain('secret=cookie');

    const key = [...records.keys()][0];
    if (key === undefined) {
      throw new Error('Missing LFS relay record');
    }
    const handle = key.slice('git:lfs:relay:'.length);
    await expect(controller.relayGet('user-2', handle, request({}), reply())).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

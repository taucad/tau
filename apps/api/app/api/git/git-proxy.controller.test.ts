/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names are not identifiers */
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '@nestjs/config';
import { PayloadTooLargeException } from '@nestjs/common';
import type { StreamableFile } from '@nestjs/common';
import type { Environment } from '#config/environment.config.js';
import { z } from 'zod';
import { GitProxyController, sealRelayRecord } from '#api/git/git-proxy.controller.js';
import type { RedisService } from '#redis/redis.service.js';

/* Hermetic DNS: every hostname answers one public address unless a test says otherwise. */
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: dns.lookup }));
beforeEach(() => {
  dns.lookup.mockResolvedValue([{ address: '140.82.112.3', family: 4 }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  dns.lookup.mockReset();
});

/** The proxy reads exactly one setting: ruling P50's dev-only relaxation. */
const proxyController = (
  allowPrivate = false,
  redis?: RedisService,
  fetch: typeof globalThis.fetch | 'pinned' = globalThis.fetch,
): GitProxyController =>
  new GitProxyController(
    {
      get: (key: string) => (key === 'TAU_API_URL' ? 'https://api.tau.test' : allowPrivate ? '1' : '0'),
    } as unknown as ConfigService<Environment, true>,
    redis ??
      ({
        client: { get: vi.fn(), set: vi.fn(), eval: vi.fn(async () => 1) },
      } as unknown as RedisService),
    fetch === 'pinned' ? undefined : fetch,
  );

const request = (headers: Record<string, string>, method = 'GET', raw: Readable = Readable.from([])): FastifyRequest =>
  ({ headers, method, raw }) as unknown as FastifyRequest;

const text = async (file: StreamableFile): Promise<string> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of file.getStream()) {
    chunks.push(Uint8Array.from(chunk as Uint8Array<ArrayBuffer>));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const relayHandle = '0f8fad5b-d9cb-469f-a165-70867728950e';

/** The key the batch issued for the relay record in {@link verifyRelayRedis}. */
let relayKey = '';

/** A Redis holding one sealed verify relay record for `user-1`, aimed at `url`. */
const verifyRelayRedis = (url: string): RedisService => {
  const { sealed, key } = sealRelayRecord(relayHandle, {
    userId: 'user-1',
    oid: 'a'.repeat(64),
    size: 3,
    url,
    method: 'POST',
    headers: { Authorization: 'signed' },
    expiresAt: Date.now() + 60_000,
  });
  relayKey = key;
  return {
    client: {
      get: vi.fn(async () => sealed),
      set: vi.fn(),
      eval: vi.fn(async () => 1),
    },
  } as unknown as RedisService;
};

const lfsMediaType = 'application/vnd.git-lfs+json';

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
          headers: {
            location: 'https://someone:pw@github.com/someone-else/renamed.git/info/refs?service=git-upload-pack&sig=x',
          },
        });
      }),
    );

    /* D11: still refused, but as a typed 409 that names where the repository
       went — without the query or userinfo the upstream put on the Location. */
    const controller = proxyController();
    const answer = reply();
    const body = await text(
      await controller.proxyGet(
        'user-1',
        { url: 'https://github.com/tau/example.git/info/refs' },
        request({ 'x-tau-proxy-authorization': 'Bearer ghs_installation_token' }),
        answer,
      ),
    );
    expect(answer.status).toHaveBeenCalledWith(409);
    expect(JSON.parse(body)).toMatchObject({
      code: 'GIT_PROXY_REDIRECTED_CREDENTIAL',
      location: 'https://github.com/someone-else/renamed.git/info/refs',
    });
    expect(body).not.toContain('sig=x');
    expect(body).not.toContain('pw@');

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
        eval: vi.fn(async () => 1),
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
    /* Sealed at rest (D22): nothing of the signed action is readable in Redis. */
    const stored = [...records.values()][0] ?? '';
    for (const secret of ['Authorization', 'signed', '127.0.0.1', 'metadata.internal', 'secret=cookie']) {
      expect(stored).not.toContain(secret);
    }
    const issued = z
      .object({
        objects: z.array(
          z.object({ actions: z.object({ download: z.object({ header: z.record(z.string(), z.string()) }) }) }),
        ),
      })
      .parse(JSON.parse(body)).objects[0]?.actions.download.header['x-tau-lfs-key'];
    expect(issued).toMatch(/^[\w-]{43}$/u);

    const storedKey = [...records.keys()][0];
    if (storedKey === undefined || issued === undefined) {
      throw new Error('Missing LFS relay record');
    }
    const handle = storedKey.slice('git:lfs:relay:'.length);
    const refused = { response: { code: 'GIT_LFS_HANDLE_REFUSED' } };
    await expect(controller.relayGet('user-1', handle, request({}), reply())).rejects.toMatchObject(refused);
    await expect(
      controller.relayGet('user-1', handle, request({ 'x-tau-lfs-key': 'A'.repeat(43) }), reply()),
    ).rejects.toMatchObject(refused);
    await expect(
      controller.relayGet('user-2', handle, request({ 'x-tau-lfs-key': issued }), reply()),
    ).rejects.toMatchObject(refused);
    vi.unstubAllGlobals();
  });

  it('forwards the git-lfs Accept on batch and verify, and keeps */* otherwise (D5)', async () => {
    const accepts: Array<string | undefined> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        accepts.push(new Headers(init.headers).get('accept') ?? undefined);
        return new Response(JSON.stringify({ objects: [] }), { status: 200 });
      }),
    );

    const controller = proxyController();
    await controller.proxyPost(
      'user-1',
      { url: 'https://github.com/tau/x.git/info/lfs/objects/batch' },
      request({ accept: lfsMediaType, 'content-type': lfsMediaType }, 'POST'),
      reply(),
    );
    await controller.proxyGet(
      'user-1',
      { url: 'https://github.com/tau/x.git/info/refs' },
      request({ accept: 'text/html' }),
      reply(),
    );
    await proxyController(false, verifyRelayRedis('https://lfs.example.com/verify')).relayPost(
      'user-1',
      relayHandle,
      request({ accept: lfsMediaType, 'x-tau-lfs-key': relayKey }, 'POST', Readable.from([Buffer.from('{}')])),
      reply(),
    );

    expect(accepts).toEqual([lfsMediaType, '*/*', lfsMediaType]);
  });

  it('refuses a credentialed redirect to a blocked host as a moved repository without echoing it (D11)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(undefined, { status: 302, headers: { location: 'https://10.0.0.4/tau/x.git/info/refs' } }),
      ),
    );
    const answer = reply();

    const body = await text(
      await proxyController().proxyGet(
        'user-1',
        { url: 'https://github.com/tau/x.git/info/refs' },
        request({ 'x-tau-proxy-authorization': 'Bearer ghs_installation_token' }),
        answer,
      ),
    );

    expect(answer.status).toHaveBeenCalledWith(409);
    expect(JSON.parse(body)).toStrictEqual({
      statusCode: 409,
      code: 'GIT_PROXY_REDIRECTED_CREDENTIAL',
      error: 'The repository moved; confirm its new location before sending the credential there',
    });
    expect(body).not.toContain('10.0.0.4');
  });

  it.each([
    ['a credentialed', { 'x-tau-proxy-authorization': 'Bearer ghs_installation_token' }],
    ['an anonymous', {}],
  ])('answers %s redirect with a malformed Location as an upstream failure', async (_case, headers) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(undefined, { status: 302, headers: { location: 'https://[not-an-address' } })),
    );

    await expect(
      proxyController().proxyGet(
        'user-1',
        { url: 'https://github.com/tau/x.git/info/refs' },
        request(headers),
        reply(),
      ),
    ).rejects.toMatchObject({ status: 502, response: { code: 'GIT_PROXY_UPSTREAM_FAILED' } });
  });

  it('proxies only the default https port unless local development relaxes it (D21)', async () => {
    const upstream = vi.fn(async () => new Response('0000', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const controller = proxyController();

    await expect(
      controller.proxyGet('user-1', { url: 'https://github.com:8443/tau/x.git/info/refs' }, request({}), reply()),
    ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_PORT_REFUSED' } });
    // `:443` is the default port and the URL parser drops it.
    await controller.proxyGet('user-1', { url: 'https://github.com:443/tau/x.git/info/refs' }, request({}), reply());
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('answers every upstream failure with one 502 but keeps the caller its own 413 (D21)', async () => {
    const controller = (): GitProxyController => proxyController();
    for (const failure of [
      Object.assign(new Error('connect ECONNREFUSED 140.82.112.3:443'), { code: 'ECONNREFUSED' }),
      new Error('The upstream git host did not answer in time.'),
      new TypeError('fetch failed', { cause: new Error('certificate has expired') }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw failure;
        }),
      );
      // oxlint-disable-next-line no-await-in-loop -- one failure at a time, by design
      await expect(
        controller().proxyGet('user-1', { url: 'https://github.com/tau/x.git/info/refs' }, request({}), reply()),
        failure.message,
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_UPSTREAM_FAILED' } });
    }

    // A batch answer that is not JSON, or not a batch, is the same upstream failure.
    for (const answer of ['<html>', '{"objects":"none"}']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(answer, { status: 200 })),
      );
      // oxlint-disable-next-line no-await-in-loop -- one failure at a time, by design
      await expect(
        controller().proxyPost(
          'user-1',
          { url: 'https://github.com/tau/x.git/info/lfs/objects/batch' },
          request({}, 'POST'),
          reply(),
        ),
        answer,
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_UPSTREAM_FAILED' } });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed', {
          cause: new PayloadTooLargeException({ code: 'GIT_PROXY_REQUEST_TOO_LARGE' }),
        });
      }),
    );
    await expect(
      controller().proxyPost(
        'user-1',
        { url: 'https://github.com/tau/x.git/git-receive-pack' },
        request({}, 'POST'),
        reply(),
      ),
    ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_REQUEST_TOO_LARGE' } });
  });

  it('refuses NAT64 and IPv4-compatible IPv6 forms that embed a private IPv4 address (D21)', async () => {
    const upstream = vi.fn(async () => new Response('0000', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const controller = proxyController();

    for (const url of [
      'https://[::127.0.0.1]/x.git/info/refs',
      'https://[::a00:4]/x.git/info/refs',
      'https://[64:ff9b::10.0.0.1]/x.git/info/refs',
      'https://[64:ff9b::a9fe:a9fe]/x.git/info/refs',
      'https://[::ffff:192.168.0.1]/x.git/info/refs',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(controller.proxyGet('user-1', { url }, request({}), reply()), url).rejects.toMatchObject({
        response: { code: 'GIT_PROXY_HOST_REFUSED' },
      });
    }
    // The resolver prints these with a dotted tail; its answers meet the same rule.
    for (const address of ['::ffff:10.0.0.1', '::127.0.0.1', '64:ff9b::192.168.1.1', '64:ff9b::a00:1']) {
      dns.lookup.mockResolvedValueOnce([{ address, family: 6 }]);
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(
        controller.proxyGet('user-1', { url: 'https://git.example.com/x.git/info/refs' }, request({}), reply()),
        address,
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_HOST_REFUSED' } });
    }
    expect(upstream).not.toHaveBeenCalled();

    // A NAT64 route to a public host is ordinary on an IPv6-only network.
    await controller.proxyGet('user-1', { url: 'https://[64:ff9b::808:808]/x.git/info/refs' }, request({}), reply());
    dns.lookup.mockResolvedValueOnce([{ address: '64:ff9b::8.8.8.8', family: 6 }]);
    await controller.proxyGet('user-1', { url: 'https://git.example.com/x.git/info/refs' }, request({}), reply());
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('refuses SIIT, 6to4, local-use NAT64 and site-local IPv6 forms that reach a private network', async () => {
    const upstream = vi.fn(async () => new Response('0000', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const controller = proxyController();

    for (const address of [
      '::ffff:0:10.0.0.1',
      '::ffff:0:7f00:1',
      '2002:a00:1::1',
      '2002:c0a8:101::',
      '64:ff9b:1::8.8.8.8',
      '64:ff9b:1:a00:1::',
      'fec0::1',
      'feff::1',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(
        controller.proxyGet('user-1', { url: `https://[${address}]/x.git/info/refs` }, request({}), reply()),
        address,
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_HOST_REFUSED' } });
      dns.lookup.mockResolvedValueOnce([{ address, family: 6 }]);
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time, by design
      await expect(
        controller.proxyGet('user-1', { url: 'https://git.example.com/x.git/info/refs' }, request({}), reply()),
        address,
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_HOST_REFUSED' } });
    }
    expect(upstream).not.toHaveBeenCalled();

    // The same forms around a public IPv4 address stay reachable.
    for (const address of ['::ffff:0:808:808', '2002:808:808::1']) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by design
      await controller.proxyGet('user-1', { url: `https://[${address}]/x.git/info/refs` }, request({}), reply());
    }
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('refuses a caller past the per-minute proxy budget before reaching the host (D21)', async () => {
    const upstream = vi.fn(async () => new Response('0000', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const counted = vi.fn(async () => 600);
    const redis = { client: { get: vi.fn(), set: vi.fn(), eval: counted } } as unknown as RedisService;
    const controller = proxyController(false, redis);
    const url = 'https://github.com/tau/x.git/info/refs';

    await controller.proxyGet('user-1', { url }, request({}), reply());
    counted.mockResolvedValueOnce(601);
    await expect(controller.proxyGet('user-1', { url }, request({}), reply())).rejects.toMatchObject({
      response: { code: 'GIT_PROXY_RATE_LIMITED' },
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(counted.mock.calls.map((call: unknown[]) => call[2])).toEqual([
      expect.stringMatching(/^git:proxy:rl:user-1:/u),
      expect.stringMatching(/^git:proxy:rl:user-1:/u),
    ]);
  });

  it('reaches a named host through the pinned socket fetch (D32)', async () => {
    // Node's connect asks the pinned lookup with `all: true`; answering with a
    // bare address failed every real upstream as ERR_INVALID_IP_ADDRESS.
    const server = createServer((incoming, outgoing) => {
      incoming.resume();
      outgoing.writeHead(200, { 'content-type': 'application/x-git-upload-pack-advertisement' });
      outgoing.end('0000');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      dns.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
      const controller = proxyController(true, undefined, 'pinned');
      const answer = await controller.proxyGet(
        'user-1',
        { url: `http://localhost:${String(port)}/tau/x.git/info/refs?service=git-upload-pack` },
        request({}),
        reply(),
      );
      expect(await text(answer)).toBe('0000');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it('bounds a relayed verify body and answers 413 without waiting on the host (D22)', async () => {
    // A host that never answers: without the bound the relay streamed on, and
    // a failed body waited out the 60 s upstream timeout.
    const server = createServer((incoming) => {
      incoming.resume();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    try {
      const controller = proxyController(true, verifyRelayRedis(`http://127.0.0.1:${String(port)}/verify`), 'pinned');
      await expect(
        controller.relayPost(
          'user-1',
          relayHandle,
          request(
            { accept: lfsMediaType, 'x-tau-lfs-key': relayKey },
            'POST',
            Readable.from([Buffer.alloc(128 * 1024)]),
          ),
          reply(),
        ),
      ).rejects.toMatchObject({ response: { code: 'GIT_PROXY_REQUEST_TOO_LARGE' } });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

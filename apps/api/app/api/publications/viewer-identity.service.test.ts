import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedException } from '@nestjs/common';
import { publicationApiCode, publicationViewCookieName } from '@taucad/types/constants';
import type { Environment } from '#config/environment.config.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';

type ApiConfigService = ConfigService<Environment, true>;

function createConfigService(): ApiConfigService {
  const get = vi.fn((key: string) => {
    if (key === 'TAU_VIEW_COOKIE_SECRET') {
      return 'integration-test-cookie-secret-32-chars';
    }

    if (key === 'NODE_ENV') {
      return 'test';
    }

    return undefined;
  });

  return { get } as unknown as ApiConfigService;
}

type ReplyMock = FastifyReply & {
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- Fastify unsignCookie surface uses null
  unsignCookie: (value: string) => { valid: boolean; renew: boolean; value: string | null };
  setCookie: ReturnType<typeof vi.fn>;
};

function createReply(): ReplyMock {
  const setCookie = vi.fn();
  const unsignCookie = (value: string) =>
    value === '__tampered'
      ? { valid: false, renew: false, value: null }
      : { valid: true, renew: false, value: value.replace(/^__valid:/u, '') };

  return { setCookie, unsignCookie } as unknown as ReplyMock;
}

function createRequest(args: { cookie?: string; ip?: string }): FastifyRequest {
  return {
    cookies: args.cookie === undefined ? {} : { [publicationViewCookieName]: args.cookie },
    ip: args.ip ?? '203.0.113.7',
  } as unknown as FastifyRequest;
}

describe('ViewerIdentityService', () => {
  it('should issue a fresh signed cookie on first anonymous request', () => {
    const service = new ViewerIdentityService(createConfigService());
    const reply = createReply();
    const request = createRequest({});

    const identity = service.resolveForRequest({ request, reply });

    expect(identity.viewerHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity.sessionUserId).toBeUndefined();
    expect(reply.setCookie).toHaveBeenCalledTimes(1);
    const setCookieCall = reply.setCookie.mock.calls[0];
    expect(setCookieCall?.[0]).toBe(publicationViewCookieName);
    expect(setCookieCall?.[2]).toMatchObject({ signed: true, httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('should keep viewerHash stable across calls when cookie persists', () => {
    const service = new ViewerIdentityService(createConfigService());
    const reply1 = createReply();
    const request1 = createRequest({});
    service.resolveForRequest({ request: request1, reply: reply1 });
    const issued = reply1.setCookie.mock.calls[0]?.[1] as string;

    const reply2 = createReply();
    const first = service.resolveForRequest({ request: createRequest({ cookie: `__valid:${issued}` }), reply: reply2 });

    const reply3 = createReply();
    const second = service.resolveForRequest({
      request: createRequest({ cookie: `__valid:${issued}` }),
      reply: reply3,
    });

    expect(second.viewerHash).toBe(first.viewerHash);
    expect(reply2.setCookie).not.toHaveBeenCalled();
    expect(reply3.setCookie).not.toHaveBeenCalled();
  });

  it('should reject tampered cookies with INVALID_VIEW_COOKIE', () => {
    const service = new ViewerIdentityService(createConfigService());
    const reply = createReply();
    const request = createRequest({ cookie: '__tampered' });

    expect(() => service.resolveForRequest({ request, reply })).toThrow(UnauthorizedException);
    try {
      service.resolveForRequest({ request, reply });
    } catch (error) {
      const body = (error as UnauthorizedException).getResponse() as { code?: string };
      expect(body.code).toBe(publicationApiCode.INVALID_VIEW_COOKIE);
    }
  });

  it('should derive a stable anonymous hash from request.ip when the cookie is absent', () => {
    const service = new ViewerIdentityService(createConfigService());

    const first = service.resolveForRequest({
      request: createRequest({ ip: '198.51.100.4' }),
      reply: createReply(),
    });
    const second = service.resolveForRequest({
      request: createRequest({ ip: '198.51.100.4' }),
      reply: createReply(),
    });
    const other = service.resolveForRequest({
      request: createRequest({ ip: '198.51.100.5' }),
      reply: createReply(),
    });

    expect(second.viewerHash).toBe(first.viewerHash);
    expect(other.viewerHash).not.toBe(first.viewerHash);
  });

  it('should not issue a cookie when authenticated', () => {
    const service = new ViewerIdentityService(createConfigService());
    const reply = createReply();
    const request = createRequest({});

    const identity = service.resolveForRequest({ request, reply, sessionUserId: 'user-123' });

    expect(identity.viewerHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity.sessionUserId).toBe('user-123');
    expect(reply.setCookie).not.toHaveBeenCalled();
  });
});

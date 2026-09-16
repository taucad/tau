import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';

type ApiConfigService = ConfigService<Environment, true>;

function createConfigService(): ApiConfigService {
  return {
    get: vi.fn((key: string) =>
      key === 'TAU_VIEW_COOKIE_SECRET' ? 'integration-test-cookie-secret-32-chars' : undefined,
    ),
  } as unknown as ApiConfigService;
}

function createRequest(ip: string): FastifyRequest {
  return { ip } as unknown as FastifyRequest;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ViewerIdentityService', () => {
  it('should derive a stable daily anonymous hash without a persistent identifier', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    const service = new ViewerIdentityService(createConfigService());

    const first = service.resolveForRequest({ request: createRequest('198.51.100.4') });
    const second = service.resolveForRequest({ request: createRequest('198.51.100.4') });
    const otherAddress = service.resolveForRequest({ request: createRequest('198.51.100.5') });

    expect(first.viewerHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(second.viewerHash).toBe(first.viewerHash);
    expect(otherAddress.viewerHash).not.toBe(first.viewerHash);
    expect(first.sessionUserId).toBeUndefined();
  });

  it('should rotate the anonymous signal each UTC day', () => {
    vi.useFakeTimers();
    const service = new ViewerIdentityService(createConfigService());
    vi.setSystemTime(new Date('2026-09-14T23:59:59Z'));
    const first = service.resolveForRequest({ request: createRequest('198.51.100.4') });
    vi.setSystemTime(new Date('2026-09-15T00:00:01Z'));
    const nextDay = service.resolveForRequest({ request: createRequest('198.51.100.4') });

    expect(nextDay.viewerHash).not.toBe(first.viewerHash);
  });

  it('should use the authenticated account identity when present', () => {
    const service = new ViewerIdentityService(createConfigService());
    const identity = service.resolveForRequest({
      request: createRequest('198.51.100.4'),
      sessionUserId: 'user-123',
    });

    expect(identity.viewerHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity.sessionUserId).toBe('user-123');
  });
});

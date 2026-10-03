import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RepositoriesController } from '#api/repositories/repositories.controller.js';
import { RepositoriesService } from '#api/repositories/repositories.service.js';
import { getTrustProxyOption, isPrivatePeer, trustFlyProxy } from '#utils/trust-proxy.utils.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
const flyMachineEnvironment = { FLY_APP_NAME: 'tau-api' };

describe('getTrustProxyOption', () => {
  it('trusts the Fly proxy only on a Fly Machine', () => {
    expect(getTrustProxyOption(flyMachineEnvironment)).toBe(trustFlyProxy);
    expect(getTrustProxyOption({})).toBe(false);
  });
});

describe('isPrivatePeer', () => {
  it.each([
    '127.0.0.1',
    '::1',
    '172.16.3.2',
    '172.31.255.1',
    '10.0.0.4',
    '192.168.1.1',
    'fdaa:0:1::2',
    '::ffff:172.19.0.2',
  ])('treats %s as a private peer', (address) => {
    expect(isPrivatePeer(address)).toBe(true);
  });

  it.each(['203.0.113.7', '172.32.0.1', '8.8.8.8', '2001:db8::1', '::ffff:203.0.113.7', 'not-an-ip'])(
    'treats %s as public',
    (address) => {
      expect(isPrivatePeer(address)).toBe(false);
    },
  );
});

/**
 * The per-IP budgets key on `@Ip()`, which is Fastify's `request.ip`. These
 * cases run the real adapter option through a real route, so the key the
 * repositories service receives is the one a Fly deployment would see.
 */
describe('RepositoriesController per-IP key behind Fly Proxy', () => {
  const listBranches = vi.fn().mockResolvedValue({ branches: [], hasMore: false, endCursor: undefined });
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RepositoriesController],
      providers: [{ provide: RepositoriesService, useValue: { listBranches } }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: getTrustProxyOption(flyMachineEnvironment) }),
    );
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    listBranches.mockClear();
  });

  const branchesFrom = async (remoteAddress: string, forwardedFor: string): Promise<unknown> => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/repositories/branches?owner=taucad&repo=tau',
      remoteAddress,
      headers: { 'x-forwarded-for': forwardedFor },
    });
    expect(response.statusCode).toBe(200);
    return listBranches.mock.calls[0]?.[1];
  };

  it('keys on the client address Fly Proxy appended when the peer is private', async () => {
    await expect(branchesFrom('172.16.4.2', '203.0.113.7')).resolves.toBe('203.0.113.7');
  });

  it('ignores addresses a client wrote ahead of the one Fly Proxy appended', async () => {
    await expect(branchesFrom('fdaa:0:1::2', '198.51.100.1, 10.0.0.1, 203.0.113.7')).resolves.toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For from a public peer', async () => {
    await expect(branchesFrom('203.0.113.7', '198.51.100.1')).resolves.toBe('203.0.113.7');
  });
});

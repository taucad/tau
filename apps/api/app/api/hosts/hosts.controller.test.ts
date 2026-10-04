import { HttpException, HttpStatus, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { HostsController, pairingsPerIpPerWindow } from '#api/hosts/hosts.controller.js';
import type { HostsService } from '#api/hosts/hosts.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { RedisService } from '#redis/redis.service.js';

/** A rate limiter over an in-memory counter in place of Redis' `INCRBY` script. */
const createRateLimiter = (): PublicationRateLimiterService => {
  const counts = new Map<string, number>();
  // `eval(script, numberOfKeys, key, expirySeconds, increment)`
  const evaluate = vi.fn(async (...args: unknown[]) => {
    const key = String(args[2]);
    const count = (counts.get(key) ?? 0) + Number(args[4]);
    counts.set(key, count);
    return count;
  });
  return new PublicationRateLimiterService({ client: { eval: evaluate } } as unknown as RedisService);
};

describe('HostsController worker affinity', () => {
  it('authenticates the paired device before returning stable scheduler unavailability', async () => {
    const authenticateDevice = vi.fn(async () => ({ ownerId: 'owner-a' }));
    const controller = new HostsController({ authenticateDevice } as unknown as HostsService, createRateLimiter());

    try {
      await controller.getWorkerAffinity('Bearer paired-credential');
      expect.fail('Worker affinity should be unavailable.');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      expect(error.getResponse()).toMatchObject({ code: 'JOB_SCHEDULER_UNAVAILABLE' });
    }
    expect(authenticateDevice).toHaveBeenCalledWith('Bearer paired-credential');
  });

  it('rejects an invalid or revoked paired-device credential', async () => {
    const controller = new HostsController(
      {
        authenticateDevice: vi.fn(async () => undefined),
      } as unknown as HostsService,
      createRateLimiter(),
    );

    await expect(controller.getWorkerAffinity('Bearer revoked')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('HostsController cloud placement', () => {
  it('provisions this project cloud host for the caller and never returns a credential', async () => {
    const provisionCloudHost = vi.fn(
      async (): Promise<{ deviceId: string; label: string; state: 'existing' | 'provisioned' }> => ({
        deviceId: 'agent_cloud',
        label: 'Tau Cloud',
        state: 'provisioned',
      }),
    );
    const controller = new HostsController({ provisionCloudHost } as unknown as HostsService, createRateLimiter());

    const response = await controller.provisionCloudHost({ projectId: 'project-a' }, 'owner-1');

    expect(provisionCloudHost).toHaveBeenCalledWith({ userId: 'owner-1', projectId: 'project-a' });
    expect(response).toEqual({ deviceId: 'agent_cloud', label: 'Tau Cloud', state: 'provisioned' });
    expect(Object.keys(response)).not.toContain('credential');
  });

  it('lists one host run directory rows for its owner', async () => {
    const listRuns = vi.fn(async () => [
      { runId: 'run-1', chatId: 'chat-1', state: 'running', placement: 'agent_cloud' },
    ]);
    const controller = new HostsController({ listRuns } as unknown as HostsService, createRateLimiter());

    await expect(controller.listRuns('agent_cloud', 'owner-1')).resolves.toMatchObject([{ runId: 'run-1' }]);
    expect(listRuns).toHaveBeenCalledWith('agent_cloud', 'owner-1');
  });
});

describe('HostsController pairing throttle', () => {
  const pairing = {
    deviceCode: 'device-code',
    userCode: 'ABCD-EFGH',
    verificationUri: 'http://localhost:3000/?settings=compute&pair=ABCDEFGH',
    expiresAt: '2026-10-02T00:10:00.000Z',
    pollInterval: 5,
  };

  const createController = () => {
    const createPairing = vi.fn(async () => pairing);
    const controller = new HostsController({ createPairing } as unknown as HostsService, createRateLimiter());
    const reply = { header: vi.fn() };
    const start = async (ip: string) =>
      controller.createPairing({ deviceLabel: 'laptop' }, ip, reply as unknown as FastifyReply);
    return { createPairing, reply, start };
  };

  it('refuses an address past its window budget with 429 and Retry-After', async () => {
    const { createPairing, reply, start } = createController();
    for (let attempt = 0; attempt < pairingsPerIpPerWindow; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- the budget is consumed in order
      await expect(start('203.0.113.7')).resolves.toEqual(pairing);
    }

    const refused = await start('203.0.113.7').catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((refused as HttpException).getResponse()).toMatchObject({ code: 'PAIRING_RATE_LIMITED' });
    expect(reply.header).toHaveBeenCalledWith('retry-after', expect.stringMatching(/^\d+$/u));
    expect(createPairing).toHaveBeenCalledTimes(pairingsPerIpPerWindow);
  });

  it('keeps a separate budget per address', async () => {
    const { start } = createController();
    for (let attempt = 0; attempt < pairingsPerIpPerWindow; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- the budget is consumed in order
      await start('203.0.113.7');
    }

    await expect(start('198.51.100.9')).resolves.toEqual(pairing);
  });
});

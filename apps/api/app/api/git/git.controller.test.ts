import { describe, expect, it } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import type { RedisService } from '#redis/redis.service.js';
import { gitRequestsPerUserPerWindow, gitRequestsPerWindow } from '#api/git/git.constants.js';
import { GitController } from '#api/git/git.controller.js';
import type { GitLfsService } from '#api/git/git-lfs.service.js';
import type { GitRepositoryService } from '#api/git/git.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

/**
 * D22 / charter I11 / L6-F3: every Hosted Remote route spends a per-`(user,
 * project)` budget before it authorizes or hydrates anything, and a spent
 * budget is a `429` carrying `Retry-After`.
 *
 * The limiter is the real one over a Redis whose `eval` keeps the counters the
 * Lua script would, so the key, the window and the wait are all the product's.
 */
const countingRedis = (): RedisService => {
  const counters = new Map<string, number>();
  return {
    client: {
      // oxlint-disable-next-line max-params -- `eval(script, numberOfKeys, key, expiry, count)` is Redis's own signature
      eval: async (_script: string, _keys: number, key: string, _expiry: string, count: string): Promise<number> => {
        const next = (counters.get(key) ?? 0) + Number(count);
        counters.set(key, next);
        return next;
      },
    },
  } as unknown as RedisService;
};

const replyStub = (): { reply: FastifyReply; headers: Record<string, string> } => {
  const headers: Record<string, string> = {};
  const reply = {
    header: (name: string, value: string) => {
      headers[name] = value;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, headers };
};

describe('GitController request budget (D22)', () => {
  it('answers the request past the window with 429 and Retry-After, before authorizing it', async () => {
    let authorized = 0;
    const repositories = {
      authorize: async () => {
        authorized += 1;
        return { projectId: 'proj_w9', ownerId: 'user-owner', role: 'read', remainingBytes: 0, storageLimitBytes: 0 };
      },
      advertiseRefs: async () => new Uint8Array(),
    } as unknown as GitRepositoryService;
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      repositories,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );

    for (let request = 0; request < gitRequestsPerWindow.rpc; request += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by definition: the budget is a count
      await controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-reader', replyStub().reply);
    }
    const { reply, headers } = replyStub();
    await expect(controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-reader', reply)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_RATE_LIMITED' },
    });
    expect(Number(headers['retry-after'])).toBeGreaterThan(0);
    expect(authorized).toBe(gitRequestsPerWindow.rpc);

    /* The budget is per `(user, project)`: another caller on the same project
       is untouched by the first one's loop. */
    await expect(
      controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-someone-else', replyStub().reply),
    ).resolves.toBeDefined();
  });

  /* I11 / RV-W9: cycling project ids cannot buy unbounded authorization reads,
     because one account-wide budget is spent ahead of every project's. */
  it('refuses an account cycling project ids once its account-wide window is spent', async () => {
    let authorized = 0;
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      {
        authorize: async () => {
          authorized += 1;
          return { projectId: 'proj_w9', ownerId: 'user-owner', role: 'read' };
        },
        advertiseRefs: async () => new Uint8Array(),
      } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );

    for (let request = 0; request < gitRequestsPerUserPerWindow; request += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by definition: the budget is a count
      await controller.infoRefs(`proj_cycle${String(request)}`, 'git-upload-pack', 'user-cycler', replyStub().reply);
    }
    const { reply, headers } = replyStub();
    await expect(controller.infoRefs('proj_fresh', 'git-upload-pack', 'user-cycler', reply)).rejects.toMatchObject({
      status: 429,
    });
    expect(headers['retry-after']).toBeDefined();
    expect(authorized).toBe(gitRequestsPerUserPerWindow);
  });

  it('carries the owner’s hydrate-budget wait as Retry-After', async () => {
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      {
        authorize: async () => ({ projectId: 'proj_w9', ownerId: 'user-owner', role: 'read' }),
        advertiseRefs: async () => {
          throw new HttpException(
            { code: 'GIT_HYDRATE_BUDGET_EXHAUSTED', message: 'spent', retryAfterSeconds: 3600 },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        },
      } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );
    const { reply, headers } = replyStub();

    await expect(controller.infoRefs('proj_w9', 'git-upload-pack', 'user-reader', reply)).rejects.toMatchObject({
      status: 429,
    });
    expect(headers['retry-after']).toBe('3600');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { IncomingMessage } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import type { RedisService } from '#redis/redis.service.js';
import { attachHostDevice } from '#auth/auth.guard.js';
import { gitRequestsPerUserPerWindow, gitRequestsPerWindow, quotaRefusalMarker } from '#api/git/git.constants.js';
import { GitController, receivePackOutcome, syncOutcomeOf } from '#api/git/git.controller.js';
import type { GitLfsService } from '#api/git/git-lfs.service.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import type { MetricsService } from '#telemetry/metrics.js';

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

/** A request no cloud host came through: the owner's own session. */
const ownRequest = (): FastifyRequest => ({ raw: mock<IncomingMessage>(), headers: {} }) as unknown as FastifyRequest;

/** A request the git transport admitted as the cloud host `agent_cloud` of `user-owner`. */
const hostRequest = (projectId: string): FastifyRequest => {
  const raw = mock<IncomingMessage>();
  attachHostDevice(raw, { ownerId: 'user-owner', deviceId: 'agent_cloud', projectId });
  return { raw, headers: {} } as unknown as FastifyRequest;
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
      await controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-reader', ownRequest(), replyStub().reply);
    }
    const { reply, headers } = replyStub();
    await expect(
      controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-reader', ownRequest(), reply),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_RATE_LIMITED' },
    });
    expect(Number(headers['retry-after'])).toBeGreaterThan(0);
    expect(authorized).toBe(gitRequestsPerWindow.rpc);

    /* The budget is per `(user, project)`: another caller on the same project
       is untouched by the first one's loop. */
    await expect(
      controller.infoRefs('proj_w9.git', 'git-upload-pack', 'user-someone-else', ownRequest(), replyStub().reply),
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
      await controller.infoRefs(
        `proj_cycle${String(request)}`,
        'git-upload-pack',
        'user-cycler',
        ownRequest(),
        replyStub().reply,
      );
    }
    const { reply, headers } = replyStub();
    await expect(
      controller.infoRefs('proj_fresh', 'git-upload-pack', 'user-cycler', ownRequest(), reply),
    ).rejects.toMatchObject({
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

    await expect(
      controller.infoRefs('proj_w9', 'git-upload-pack', 'user-reader', ownRequest(), reply),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(headers['retry-after']).toBe('3600');
  });
});

describe('GitController cloud host attribution (W10, D21)', () => {
  it('should authorize a push the git transport admitted as a cloud host via that device, and the owner own push via none', async () => {
    const authorized: Array<{ viaDevice?: string | undefined }> = [];
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      {
        authorize: async (args: { viaDevice?: string | undefined }) => {
          authorized.push(args);
          return {
            projectId: 'proj_w10',
            ownerId: 'user-owner',
            role: 'write',
            remainingBytes: 1,
            storageLimitBytes: 1,
          };
        },
        receivePack: async () => new Uint8Array(),
      } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );
    const push = async (request: FastifyRequest): Promise<void> => {
      const { reply } = replyStub();
      Reflect.set(reply, 'raw', { once: () => undefined, writableFinished: true });
      await controller.receivePack('proj_w10', 'user-owner', request, reply);
    };

    await push(hostRequest('proj_w10'));
    await push(ownRequest());

    expect(authorized.map((args) => args.viaDevice)).toEqual(['agent_cloud', undefined]);
  });
});

describe('GitController cloud host budgets (RV-W10 F1, F2)', () => {
  it('should spend a cloud host its own request windows, so a host at its budget leaves the owner admitted', async () => {
    const authorized: Array<{ viaDevice?: string | undefined }> = [];
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      {
        authorize: async (args: { viaDevice?: string | undefined }) => {
          authorized.push(args);
          return {
            projectId: 'proj_w10',
            ownerId: 'user-owner',
            role: 'write',
            remainingBytes: 0,
            storageLimitBytes: 0,
          };
        },
        advertiseRefs: async () => new Uint8Array(),
      } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );

    for (let request = 0; request < gitRequestsPerWindow.rpc; request += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by definition: the budget is a count
      await controller.infoRefs(
        'proj_w10',
        'git-upload-pack',
        'user-owner',
        hostRequest('proj_w10'),
        replyStub().reply,
      );
    }
    await expect(
      controller.infoRefs('proj_w10', 'git-upload-pack', 'user-owner', hostRequest('proj_w10'), replyStub().reply),
    ).rejects.toMatchObject({ status: 429 });

    await expect(
      controller.infoRefs('proj_w10', 'git-upload-pack', 'user-owner', ownRequest(), replyStub().reply),
    ).resolves.toBeDefined();
    expect(authorized[0]?.viaDevice).toBe('agent_cloud');
    expect(authorized.at(-1)?.viaDevice).toBeUndefined();
  });

  it('should authorize the removal verb as the cloud host, which the service holds at write', async () => {
    const authorized: Array<{ viaDevice?: string | undefined; mode?: string }> = [];
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      {
        authorize: async (args: { viaDevice?: string | undefined; mode?: string }) => {
          authorized.push(args);
          throw new HttpException({ code: 'GIT_REF_REMOVAL_OWNER_ONLY' }, HttpStatus.FORBIDDEN);
        },
      } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
    );

    await expect(
      controller.removeRef(
        'proj_w10',
        'refs/tags/v1',
        undefined,
        'user-owner',
        hostRequest('proj_w10'),
        replyStub().reply,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(authorized).toEqual([expect.objectContaining({ mode: 'finalize', viaDevice: 'agent_cloud' })]);
  });
});

/**
 * W36 D1: git answers a refused ref with HTTP 200, so a push's outcome is read
 * from its report-status, plain or inside side-band 1, never from the status.
 */
describe('receivePackOutcome', () => {
  const pkt = (line: string): string => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
  const report = (...lines: string[]): Uint8Array<ArrayBuffer> =>
    Buffer.from(`${lines.map((line) => pkt(line)).join('')}0000`);
  const sideBand = (...lines: string[]): Uint8Array<ArrayBuffer> =>
    report(`\u0001${lines.map((line) => pkt(line)).join('')}0000`);

  it.each([
    ['an accepted push', report('unpack ok\n', 'ok refs/heads/main\n'), 'ok'],
    ['an accepted push over side-band', sideBand('unpack ok\n', 'ok refs/heads/main\n'), 'ok'],
    ['a non-fast-forward refusal', report('unpack ok\n', 'ng refs/heads/main non-fast-forward\n'), 'ref_rejected'],
    [
      'a hook refusal over side-band',
      sideBand('unpack ok\n', 'ng refs/heads/main pre-receive hook declined\n'),
      'ref_rejected',
    ],
    [
      'a quota refusal from the pre-receive hook',
      report(
        `\u0002${quotaRefusalMarker} — this push needs 10 bytes more than the plan allows.\n`,
        '\u0001',
        'unpack ok\n',
        'ng refs/heads/main pre-receive hook declined\n',
      ),
      'quota_refused',
    ],
    ['an unpack failure', report('unpack index-pack abnormal exit\n', 'ng refs/heads/main unpacker error\n'), 'error'],
    ['the flush-only probe before a large push, which is not a push', Buffer.from('0000'), undefined],
  ])('maps %s', (_label, body, outcome) => {
    expect(receivePackOutcome(body)).toBe(outcome);
  });
});

describe('syncOutcomeOf', () => {
  it.each([
    [new HttpException({ code: 'GIT_QUOTA_EXCEEDED' }, HttpStatus.PAYLOAD_TOO_LARGE), 'quota_refused'],
    [new HttpException({ code: 'GIT_SYNC_NOT_ENTITLED' }, HttpStatus.FORBIDDEN), 'unauthorized'],
    [new HttpException({ code: 'PROJECT_NOT_FOUND' }, HttpStatus.NOT_FOUND), 'unauthorized'],
    [new HttpException({ code: 'GIT_PUSH_RACE_LOST' }, HttpStatus.SERVICE_UNAVAILABLE), 'conflict'],
    /* W14 Finding 3: a retryable capacity refusal is busy, so availability is not read off it. */
    [new HttpException({ code: 'GIT_LEASE_OWNER_BUSY' }, HttpStatus.SERVICE_UNAVAILABLE), 'busy'],
    [new HttpException({ code: 'GIT_LEASE_DISK_FULL' }, HttpStatus.SERVICE_UNAVAILABLE), 'busy'],
    [new HttpException({ code: 'GIT_SERVICE_RESTARTING' }, HttpStatus.SERVICE_UNAVAILABLE), 'busy'],
    [new HttpException({ code: 'GIT_HYDRATE_BUDGET_EXHAUSTED' }, HttpStatus.TOO_MANY_REQUESTS), 'busy'],
    [new HttpException({ code: 'GIT_RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS), 'busy'],
    /* A 503 without a capacity code is not a refusal a client is told to wait out. */
    [new HttpException('This project’s storage account is unavailable.', HttpStatus.SERVICE_UNAVAILABLE), 'error'],
    [new HttpException({ code: 'GIT_REPOSITORY_INCOMPLETE' }, HttpStatus.INTERNAL_SERVER_ERROR), 'error'],
    [new Error('socket hang up'), 'error'],
  ])('maps %o to %s', (error, outcome) => {
    expect(syncOutcomeOf(error)).toBe(outcome);
  });
});

describe('GitController sync telemetry', () => {
  const metrics = () => ({
    syncOperations: { add: vi.fn() },
    syncOperationDuration: { record: vi.fn() },
    syncPackBytes: { record: vi.fn() },
    syncRefusals: { add: vi.fn() },
  });
  const controllerWith = (repositories: Partial<GitRepositoryService>, recorded: ReturnType<typeof metrics>) =>
    new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      repositories as GitRepositoryService,
      {} as unknown as GitLfsService,
      new PublicationRateLimiterService(countingRedis()),
      recorded as unknown as MetricsService,
    );
  const access = {
    projectId: 'proj_d1',
    ownerId: 'user-owner',
    role: 'owner',
    remainingBytes: 1,
    storageLimitBytes: 1,
  };
  const push = { raw: mock<IncomingMessage>(), headers: {} } as unknown as FastifyRequest;

  it('counts a push git refused inside its 200 as ref_rejected, once', async () => {
    const recorded = metrics();
    const controller = controllerWith(
      {
        authorize: async () => access as unknown as GitAccess,
        receivePack: async () => Buffer.from('000eunpack ok\n0028ng refs/heads/main non-fast-forward\n0000'),
      },
      recorded,
    );

    const { reply: stub } = replyStub();
    const reply = { header: stub.header, raw: { once: vi.fn() } } as unknown as FastifyReply;
    await controller.receivePack('proj_d1.git', 'user-owner', push, reply);

    expect(recorded.syncOperations.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.sync.operation': 'push',
      outcome: 'ref_rejected',
    });
  });

  /* DB1, W14 SLO-7: the advertisement is answered from the manifest, and its count and latency are its own. */
  it.each(['git-upload-pack', 'git-receive-pack'] as const)(
    'counts a served %s advertisement as advertise ok with its latency, and no push or fetch',
    async (service) => {
      const recorded = metrics();
      const controller = controllerWith(
        {
          authorize: async () => access as unknown as GitAccess,
          advertiseRefs: async () => Buffer.from('0000'),
        },
        recorded,
      );

      await controller.infoRefs('proj_d1.git', service, 'user-owner', ownRequest(), replyStub().reply);

      expect(recorded.syncOperations.add).toHaveBeenCalledExactlyOnceWith(1, {
        'tau.sync.operation': 'advertise',
        outcome: 'ok',
      });
      expect(recorded.syncOperationDuration.record).toHaveBeenCalledExactlyOnceWith(expect.any(Number), {
        'tau.sync.operation': 'advertise',
        outcome: 'ok',
      });
      expect(recorded.syncRefusals.add).not.toHaveBeenCalled();
    },
  );

  it('counts a push refused for quota at the advertisement as quota_refused', async () => {
    const recorded = metrics();
    const controller = controllerWith(
      {
        authorize: async () => {
          throw new HttpException({ code: 'GIT_QUOTA_EXCEEDED' }, HttpStatus.PAYLOAD_TOO_LARGE);
        },
      },
      recorded,
    );

    await expect(
      controller.infoRefs('proj_d1.git', 'git-receive-pack', 'user-owner', ownRequest(), replyStub().reply),
    ).rejects.toBeInstanceOf(HttpException);

    expect(recorded.syncOperations.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.sync.operation': 'push',
      outcome: 'quota_refused',
    });
  });

  /* W14 N1: every typed refusal by code, beside the outcome, so a lost race is a share of pushes. */
  it.each([
    ['GIT_LEASE_OWNER_BUSY', HttpStatus.SERVICE_UNAVAILABLE, 'busy'],
    ['GIT_LEASE_DISK_FULL', HttpStatus.SERVICE_UNAVAILABLE, 'busy'],
    ['GIT_HYDRATE_BUDGET_EXHAUSTED', HttpStatus.TOO_MANY_REQUESTS, 'busy'],
    ['GIT_SERVICE_RESTARTING', HttpStatus.SERVICE_UNAVAILABLE, 'busy'],
    ['GIT_PUSH_RACE_LOST', HttpStatus.SERVICE_UNAVAILABLE, 'conflict'],
    ['GIT_PUSH_NOT_COMMITTABLE', HttpStatus.UNPROCESSABLE_ENTITY, 'error'],
    ['GIT_REPOSITORY_CEILING_EXCEEDED', HttpStatus.PAYLOAD_TOO_LARGE, 'quota_refused'],
  ] as const)(
    'counts a push refused %s (HTTP %i) as one refusal by that code, outcome %s',
    async (code, status, outcome) => {
      const recorded = metrics();
      const controller = controllerWith(
        {
          authorize: async () => access as unknown as GitAccess,
          receivePack: async () => {
            throw new HttpException({ code, message: 'refused' }, status);
          },
        },
        recorded,
      );
      const { reply: stub } = replyStub();
      const reply = {
        header: stub.header,
        raw: { once: vi.fn() },
      } as unknown as FastifyReply;

      await expect(controller.receivePack('proj_d1.git', 'user-owner', push, reply)).rejects.toBeInstanceOf(
        HttpException,
      );

      expect(recorded.syncRefusals.add).toHaveBeenCalledExactlyOnceWith(1, {
        'tau.sync.operation': 'push',
        'tau.sync.refusal.code': code,
        'http.response.status_code': status,
      });
      expect(recorded.syncOperations.add).toHaveBeenCalledExactlyOnceWith(1, {
        'tau.sync.operation': 'push',
        outcome,
      });
    },
  );

  it('counts a fetch refused with an undeclared code as other, and a thrown non-HTTP error as no refusal', async () => {
    const recorded = metrics();
    let call = 0;
    const controller = controllerWith(
      {
        authorize: async () => access as unknown as GitAccess,
        uploadPack: async () => {
          call += 1;
          if (call === 1) {
            throw new HttpException({ code: 'PROJECT_NOT_FOUND', message: 'no' }, HttpStatus.NOT_FOUND);
          }
          throw new Error('socket hang up');
        },
      },
      recorded,
    );
    const { reply: stub } = replyStub();
    const reply = {
      header: stub.header,
      raw: { once: vi.fn() },
    } as unknown as FastifyReply;

    await expect(controller.uploadPack('proj_d1.git', 'user-owner', push, reply)).rejects.toBeInstanceOf(HttpException);
    await expect(controller.uploadPack('proj_d1.git', 'user-owner', push, reply)).rejects.toThrow('socket hang up');

    expect(recorded.syncRefusals.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.sync.operation': 'fetch',
      'tau.sync.refusal.code': 'other',
      'http.response.status_code': HttpStatus.NOT_FOUND,
    });
  });

  it('counts a request refused by the per-window budget as GIT_RATE_LIMITED for its operation', async () => {
    const recorded = metrics();
    const controller = new GitController(
      { get: () => 'https://api.tau.test' } as unknown as ConfigService<Environment, true>,
      { authorize: async () => access } as unknown as GitRepositoryService,
      {} as unknown as GitLfsService,
      {
        consumeWindowBudget: async () => ({
          allowed: false,
          count: 1,
          retryAfterSeconds: 7,
        }),
      } as unknown as PublicationRateLimiterService,
      recorded as unknown as MetricsService,
    );

    await expect(
      controller.infoRefs('proj_d1.git', 'git-receive-pack', 'user-owner', ownRequest(), replyStub().reply),
    ).rejects.toMatchObject({ response: { code: 'GIT_RATE_LIMITED' } });

    expect(recorded.syncRefusals.add).toHaveBeenCalledExactlyOnceWith(1, {
      'tau.sync.operation': 'push',
      'tau.sync.refusal.code': 'GIT_RATE_LIMITED',
      'http.response.status_code': HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});

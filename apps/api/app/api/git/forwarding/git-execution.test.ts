import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { verifyReceipt } from '#api/git/forwarding/contract/receipt.js';
import {
  gitExecutionProvider,
  gitExecutorProvider,
  receiptVerificationProvider,
} from '#api/git/forwarding/forwarding.providers.js';
import { createGitExecution, gitExecutionKey } from '#api/git/forwarding/git-execution.js';
import type { GitExecution } from '#api/git/forwarding/git-execution.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import type { GitExecutor, GrantFacts } from '#api/git/forwarding/git-executor.js';
import { StorageForwarder } from '#api/git/forwarding/storage-forwarder.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { GitRepositoryService, receiptVerificationKey } from '#api/git/git.service.js';
import type { ReceiptVerification } from '#api/git/git.service.js';
import { RedisService } from '#redis/redis.service.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/**
 * DC1, kept releasable: an API with `TAU_STORAGE_URL` set forwards every git
 * RPC to tau-storage and never falls back; an API without it (production,
 * until a production tau-storage exists) runs the same worker in process,
 * which is the pre-DC1 behaviour: a local lease and a `git` child. Either way
 * it says which at boot, once, as `git_execution=forwarded|in_process`.
 */

const facts: GrantFacts = {
  owner: 'user-dc1-mode',
  project: 'proj-dc1-mode',
  callerId: 'user-dc1-mode',
  committedBy: 'user-dc1-mode',
  remainingBytes: 1024 ** 3,
  storageLimitBytes: 1024 ** 3,
  recordedGeneration: 0,
  route: { store: 'r2', authoritative: true },
};

const recorder = (): {
  logger: { log: (fields: Record<string, unknown>, message: string) => void };
  lines: string[];
} => {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      log: (fields, message) => {
        lines.push(`${message} ${JSON.stringify(fields)}`);
      },
    },
  };
};

const build = (
  storageUrl: string | undefined,
  options: {
    readonly log?: ReturnType<typeof recorder>;
    readonly nodeEnvironment?: string;
    readonly affinity?: 'off' | 'rendezvous';
  } = {},
): GitExecution =>
  createGitExecution({
    nodeEnvironment: options.nodeEnvironment ?? 'development',
    storageUrl,
    grantSigningKey: undefined,
    ...(options.affinity === undefined ? {} : { affinity: options.affinity }),
    metrics: new MetricsService(),
    store: createMemoryRepositoryStore(),
    shutdown: new ShutdownService(),
    previews: () => async () => ({ lost: false }),
    applyReceipt: async () => undefined,
    logger: (options.log ?? recorder()).logger,
  });

describe('git execution without TAU_STORAGE_URL (DC1 in_process)', () => {
  it('should run git in this process and say so once at boot', async () => {
    const log = recorder();
    const execution = build(undefined, { log, nodeEnvironment: 'production' });

    expect(execution.mode).toBe('in_process');
    expect(execution.affinity).toBe('off');
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toContain('git_execution=in_process');
    /* A real git child answers: the installed git's dialect. */
    await expect(execution.executor.dialect()).resolves.toBeDefined();
  }, 30_000);

  it('should serve a push in process and verify its receipt with keys no one else holds', async () => {
    const execution = build(undefined, { nodeEnvironment: 'production' });
    const result = await execution.executor.receivePack(facts, {
      body: Readable.from([Buffer.from('0000')]),
      gzipped: false,
    });

    expect(result.bodyBytes).toBe(4);
    expect(execution.receiptKeys).toBeDefined();
    expect([...(execution.receiptKeys?.keys() ?? [])].some((kid) => kid.endsWith('-development'))).toBe(false);
    if (result.receipt !== undefined) {
      expect(verifyReceipt(result.receipt, { keys: execution.receiptKeys ?? new Map() }).ok).toBe(true);
    }
  }, 30_000);
});

describe('git execution with TAU_STORAGE_URL (DC1 forwarded)', () => {
  it('should forward and say so once at boot', () => {
    const log = recorder();
    const execution = build('http://127.0.0.1:1', { log });

    expect(execution.mode).toBe('forwarded');
    expect(execution.executor).toBeInstanceOf(StorageForwarder);
    expect(execution.receiptKeys).toBeUndefined();
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toContain('git_execution=forwarded');
  });

  it('should answer 503 when tau-storage is unreachable rather than run git in process', async () => {
    const execution = build('http://127.0.0.1:1');

    const refused = await execution.executor
      .receivePack(facts, { body: Readable.from([Buffer.from('0000')]), gzipped: false })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(503);
  }, 30_000);

  it('should report the affinity in effect, off unless rendezvous is asked for', () => {
    expect(build('http://127.0.0.1:1').affinity).toBe('off');
    expect(build('http://127.0.0.1:1', { affinity: 'rendezvous' }).affinity).toBe('rendezvous');
  });

  it('should refuse the development grant key in production', () => {
    expect(() => build('http://127.0.0.1:1', { nodeEnvironment: 'production' })).toThrow(/development key/u);
  });
});

describe('git execution as GitModule binds it (DC1)', () => {
  const compile = async (storageUrl: string | undefined): Promise<TestingModule> =>
    Test.createTestingModule({
      providers: [
        gitExecutionProvider,
        gitExecutorProvider,
        receiptVerificationProvider,
        /* Redis is down: only the forwarded ledger may depend on it. */
        {
          provide: RedisService,
          useValue: {
            client: {
              set: async () => {
                throw new Error('Redis is down');
              },
              del: async () => {
                throw new Error('Redis is down');
              },
            },
          },
        },
        /* A stub, not `new ConfigService(...)`, which falls back to `process.env` for an unset key. */
        {
          provide: ConfigService,
          useValue: {
            get: (name: string): string | undefined =>
              new Map([
                ['NODE_ENV', 'development'],
                ['TAU_STORAGE_URL', storageUrl],
              ]).get(name),
          },
        },
        { provide: MetricsService, useValue: new MetricsService() },
        { provide: repositoryStoreKey, useValue: createMemoryRepositoryStore() },
        { provide: ShutdownService, useValue: new ShutdownService() },
        { provide: ObjectStorageService, useValue: {} },
        { provide: GitRepositoryService, useValue: { applyReceipt: async () => undefined } },
      ],
    }).compile();

  it('should bind one in-process executor when TAU_STORAGE_URL is unset', async () => {
    const moduleRef = await compile(undefined);
    const execution = moduleRef.get<GitExecution>(gitExecutionKey);

    expect(execution.mode).toBe('in_process');
    expect(moduleRef.get<GitExecutor>(gitExecutorKey)).toBe(execution.executor);
    await moduleRef.close();
  });

  it('should claim in-process receipts without Redis, and forwarded ones in it (review S4)', async () => {
    const inProcess = await compile(undefined);
    await expect(
      inProcess.get<ReceiptVerification>(receiptVerificationKey).ledger.claim('rid', 'commit'),
    ).resolves.toBe(true);
    await inProcess.close();

    const forwarded = await compile('http://127.0.0.1:1');
    await expect(
      forwarded.get<ReceiptVerification>(receiptVerificationKey).ledger.claim('rid', 'commit'),
    ).rejects.toThrow('Redis is down');
    await forwarded.close();
  });

  it('should bind the forwarder when TAU_STORAGE_URL is set', async () => {
    const moduleRef = await compile('http://127.0.0.1:1');

    expect(moduleRef.get<GitExecution>(gitExecutionKey).mode).toBe('forwarded');
    expect(moduleRef.get<GitExecutor>(gitExecutorKey)).toBeInstanceOf(StorageForwarder);
    await moduleRef.close();
  });
});

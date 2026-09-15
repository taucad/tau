import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
// `vi.mock` is hoisted above this import, so the service sees the stubbed spawn.
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const fakeChild = (): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
} =>
  // oxlint-disable-next-line unicorn/prefer-event-target -- a fake `ChildProcess`, which is a Node EventEmitter
  Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });

const createService = (): InstanceType<typeof GitRepositoryService> =>
  new GitRepositoryService(
    {
      get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? '/tmp/tau-git-root' : ''),
    } as unknown as ConfigService<Environment, true>,
    {} as unknown as DatabaseService,
    {} as unknown as BillingService,
    {} as unknown as ObjectStorageService,
  );

describe('GitRepositoryService.serve', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => fakeChild());
  });

  it('bounds the incoming pack with git receive.maxInputSize', () => {
    const service = createService();
    const abort = new AbortController();

    service.serve({
      repositoryPath: '/tmp/tau-git-root/proj_1.git',
      service: 'git-receive-pack',
      body: Readable.from([]),
      gzipped: false,
      maximumInputBytes: 12_345,
      abort: abort.signal,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [executable, argv, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(executable).toBe('git');
    expect(argv).toEqual([
      '-c',
      'receive.maxInputSize=12345',
      'receive-pack',
      '--stateless-rpc',
      '/tmp/tau-git-root/proj_1.git',
    ]);
    // R7: the child cannot outlive the request or run unbounded.
    expect(options['signal']).toBe(abort.signal);
    expect(options['timeout']).toBeGreaterThan(0);
    expect(options['killSignal']).toBe('SIGKILL');
  });

  it('passes no config override on a fetch', () => {
    const service = createService();

    service.serve({
      repositoryPath: '/tmp/tau-git-root/proj_1.git',
      service: 'git-upload-pack',
      body: Readable.from([]),
      gzipped: false,
    });

    const [, argv] = spawnMock.mock.calls[0] as [string, string[]];
    expect(argv).toEqual(['upload-pack', '--stateless-rpc', '/tmp/tau-git-root/proj_1.git']);
  });

  it('refuses to spawn past the concurrency ceiling instead of queueing without bound', () => {
    const service = createService();
    const spawnOne = (): void => {
      service.serve({
        repositoryPath: '/tmp/tau-git-root/proj_1.git',
        service: 'git-upload-pack',
        body: Readable.from([]),
        gzipped: false,
      });
    };

    for (let index = 0; index < 32; index += 1) {
      spawnOne();
    }

    expect(spawnOne).toThrow(/retry shortly/u);
  });

  it('holds one owner-wide admission across receive-pack and refuses a racing LFS reservation', async () => {
    const service = createService();
    vi.spyOn(service, 'readOwnerUsage').mockResolvedValue({
      storageBytes: 10,
      lfsBytes: 20,
    });
    const access = {
      projectId: 'proj_1',
      ownerId: 'owner_1',
      repositoryPath: '/tmp/tau-git-root/proj_1.git',
      remainingBytes: 70,
      storageLimitBytes: 100,
    };
    const admission = await service.admitGitPush(access);
    expect(admission.remainingBytes).toBe(70);
    await expect(service.reserveLfsObjects({ access, objects: [] })).rejects.toMatchObject({
      response: { code: 'GIT_STORAGE_BUSY' },
    });
    admission.release();
    const reopened = await service.admitGitPush(access);
    expect(reopened.remainingBytes).toBe(70);
    reopened.release();
  });

  it('excludes repository maintenance while receive-pack owns the repository', async () => {
    const service = createService();
    const child = fakeChild();
    spawnMock.mockImplementationOnce(() => child);
    service.serve({
      repositoryPath: '/tmp/tau-git-root/proj_1.git',
      service: 'git-receive-pack',
      body: Readable.from([]),
      gzipped: false,
      accountFor: 'proj_1',
    });

    await expect(service.withRepositoryMaintenance('proj_1', async () => undefined)).rejects.toMatchObject({
      response: { code: 'GIT_REPOSITORY_BUSY' },
    });
    child.emit('close', 0);
  });
});

/*
 * The guard `git.constants.ts` states as an invariant — "anything else never
 * reaches the filesystem" — belongs to the service, not to one controller: W8
 * added a second caller (`POST /v1/publications`) that has no controller of its
 * own to check it (review R1).
 */
describe('GitRepositoryService.ensureRepository', () => {
  /* A real directory, so a regression that gets past the guard writes inside
   * `mktemp` rather than into a path this suite would then have to clean. */
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'tau-git-guard-'));
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      /* Settle, so a regression fails on the assertion instead of hanging on a
       * child that never closes. */
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const rootedService = (): InstanceType<typeof GitRepositoryService> =>
    new GitRepositoryService(
      {
        get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? root : ''),
      } as unknown as ConfigService<Environment, true>,
      {} as unknown as DatabaseService,
      {} as unknown as BillingService,
      {} as unknown as ObjectStorageService,
    );

  it.each([['../../tmp/evil'], ['..'], ['proj_1/../../escape'], ['/absolute'], [''], ['a'.repeat(65)]])(
    'refuses %j before touching the filesystem',
    async (projectId) => {
      await expect(rootedService().ensureRepository(projectId)).rejects.toMatchObject({
        response: { code: 'INVALID_REPOSITORY' },
      });
      expect(spawnMock).not.toHaveBeenCalled();
      expect(readdirSync(root)).toStrictEqual([]);
    },
  );

  it('refuses a traversal id from `repositoryPath` too, so no caller can compose the path itself', () => {
    const service = rootedService();

    expect(() => service.repositoryPath('../../tmp/evil')).toThrow();
    expect(service.repositoryPath('proj_1')).toBe(path.join(root, 'proj_1.git'));
  });
});

/**
 * Storage accounting must never fail open (review R4).
 *
 * `storage_bytes` is what both plan guards subtract from the allowance
 * (`authorize`'s `remainingBytes`, which becomes `receive.maxInputSize` and the
 * `pre-receive` budget), so every way of writing a number that is *lower* than
 * the truth hands the project headroom it has not paid for.
 */
describe('GitRepositoryService storage accounting', () => {
  let root: string;
  /** Every `storage_bytes` the service wrote, in order. */
  let written: number[];

  const accountingService = (): InstanceType<typeof GitRepositoryService> =>
    new GitRepositoryService(
      {
        get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? root : ''),
      } as unknown as ConfigService<Environment, true>,
      {
        database: {
          insert: () => ({
            values: (values: { storageBytes?: number }) => ({
              onConflictDoUpdate: async (update: { set: Record<string, unknown> }): Promise<void> => {
                const next = update.set['storageBytes'] ?? values.storageBytes;
                if (typeof next === 'number') {
                  written.push(next);
                }
              },
            }),
          }),
        },
      } as unknown as DatabaseService,
      {} as unknown as BillingService,
      {} as unknown as ObjectStorageService,
    );

  /** One `receive-pack` request with `body` as its whole payload. */
  const push = async (service: InstanceType<typeof GitRepositoryService>, body: string): Promise<void> => {
    const child = fakeChild();
    spawnMock.mockImplementationOnce(() => child);
    service.serve({
      repositoryPath: path.join(root, 'proj_1.git'),
      service: 'git-receive-pack',
      body: Readable.from([Buffer.from(body, 'utf8')]),
      gzipped: false,
      accountFor: 'proj_1',
      maximumInputBytes: 1024,
    });
    /* The body is piped before the child closes, exactly as a real request. */
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    child.emit('close', 0);
    await service.settled();
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'tau-git-accounting-'));
    written = [];
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => fakeChild());
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the row untouched when the repository cannot be walked', async () => {
    const service = accountingService();
    /* No repository on the volume: the walk fails rather than answering 0. */
    await expect(service.measureRepository(path.join(root, 'missing.git'))).rejects.toThrow();

    await push(service, '0000rest-of-a-pack');
    expect(written).toStrictEqual([]);
  });

  it('does not account for the flush-only request that authenticates a chunked push', async () => {
    mkdirSync(path.join(root, 'proj_1.git'), { recursive: true });
    writeFileSync(path.join(root, 'proj_1.git', 'HEAD'), 'ref: refs/heads/main\n');
    const service = accountingService();

    await push(service, '0000');
    expect(written).toStrictEqual([]);
  });

  it('records what the request that carried a pack measured, once', async () => {
    const repository = path.join(root, 'proj_1.git');
    mkdirSync(path.join(repository, 'objects'), { recursive: true });
    writeFileSync(path.join(repository, 'HEAD'), 'ref: refs/heads/main\n');
    const service = accountingService();

    await push(service, '0000');
    writeFileSync(path.join(repository, 'objects', 'pack-1'), Buffer.alloc(4096));
    await push(service, '0000the commands and the pack');

    /* One write, and it is the one the pack's own walk made: the probe never
       ran a walk at all, so it cannot race it or overwrite it. */
    expect(written).toHaveLength(1);
    expect(written[0]).toBeGreaterThanOrEqual(4096);
  });
});

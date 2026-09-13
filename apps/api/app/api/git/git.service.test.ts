import { EventEmitter } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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

const fakeChild = (): EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough } =>
  // oxlint-disable-next-line unicorn/prefer-event-target -- a fake `ChildProcess`, which is a Node EventEmitter
  Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });

const createService = (): InstanceType<typeof GitRepositoryService> =>
  new GitRepositoryService(
    { get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? '/tmp/tau-git-root' : '') } as unknown as ConfigService<
      Environment,
      true
    >,
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
      { get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? root : '') } as unknown as ConfigService<
        Environment,
        true
      >,
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

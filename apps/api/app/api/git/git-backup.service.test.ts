import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import { GitBackupService } from '#api/git/git-backup.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';

describe('GitBackupService', () => {
  let gitRoot: string;
  let workspace: string;
  let repositories: GitRepositoryService;
  let backups: GitBackupService;
  let objectStorage: ObjectStorageService;
  let configService: ConfigService<Environment, true>;
  const stored = new Map<string, Uint8Array<ArrayBuffer>>();
  const storedSizes = new Map<string, number>();
  const multipartKeys = new Map<string, string>();
  const multipartParts = new Map<string, number[]>();

  beforeAll(async () => {
    gitRoot = await mkdtemp(path.join(tmpdir(), 'tau-git-backup-root-'));
    workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-backup-work-'));
    configService = {
      get: (key: string): unknown => (key === 'TAU_GIT_ROOT' ? gitRoot : 24),
    } as unknown as ConfigService<Environment, true>;
    repositories = new GitRepositoryService(
      configService,
      {} as unknown as DatabaseService,
      {} as unknown as BillingService,
      {} as unknown as ObjectStorageService,
    );
    vi.spyOn(repositories, 'listLfsObjects').mockResolvedValue([]);
    objectStorage = {
      putBlob: async (args: { key: string; body: Uint8Array<ArrayBuffer> }) => {
        stored.set(args.key, args.body);
        storedSizes.set(args.key, args.body.byteLength);
        return { etag: '"x"', alreadyExisted: false };
      },
      headBlob: async (args: { key: string }) => {
        const body = stored.get(args.key);
        const size = body?.byteLength ?? storedSizes.get(args.key);
        return size === undefined
          ? undefined
          : {
              contentType: 'application/x-git-bundle',
              size,
              etag: '"x"',
              cacheControl: '',
            };
      },
      deleteBlob: async (args: { key: string }) => {
        stored.delete(args.key);
        storedSizes.delete(args.key);
      },
      copyBlob: async (args: { sourceKey: string; destinationKey: string }) => {
        const source = stored.get(args.sourceKey);
        if (source !== undefined) {
          stored.set(args.destinationKey, source);
        }
        const size = storedSizes.get(args.sourceKey);
        if (size !== undefined) {
          storedSizes.set(args.destinationKey, size);
        }
      },
      listBlobs: async () => [],
      createMultipartUpload: async (args: { key: string }) => {
        const uploadId = `upload-${String(multipartKeys.size + 1)}`;
        multipartKeys.set(uploadId, args.key);
        multipartParts.set(uploadId, []);
        return uploadId;
      },
      uploadPart: async (args: {
        uploadId: string;
        partNumber: number;
        body: Uint8Array<ArrayBuffer>;
        checksumSha256: string;
      }) => {
        multipartParts.get(args.uploadId)?.push(args.body.byteLength);
        return {
          etag: `part-${String(args.partNumber)}`,
          checksumSha256: args.checksumSha256,
        };
      },
      completeMultipartUpload: async (args: { uploadId: string }) => {
        const key = multipartKeys.get(args.uploadId);
        if (key !== undefined) {
          storedSizes.set(
            key,
            (multipartParts.get(args.uploadId) ?? []).reduce((total, size) => total + size, 0),
          );
        }
      },
      abortMultipartUpload: async (args: { uploadId: string }) => {
        multipartKeys.delete(args.uploadId);
        multipartParts.delete(args.uploadId);
      },
    } as unknown as ObjectStorageService;
    backups = new GitBackupService(configService, repositories, objectStorage);
  });

  afterAll(async () => {
    await rm(gitRoot, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  });

  it('bundles every repository on the volume and skips the empty ones', async () => {
    const repositoryPath = await repositories.ensureRepository('proj_backup');
    await repositories.ensureRepository('proj_empty');

    // A commit through a temporary clone, so the bundle has something to hold.
    const clone = path.join(workspace, 'clone');
    await repositories.run(['clone', repositoryPath, clone], workspace);
    await writeFile(path.join(clone, 'part.ts'), 'export const depth = 4;\n', 'utf8');
    await repositories.run(['add', '.'], clone);
    await repositories.run(
      ['-c', 'user.email=test@tau.new', '-c', 'user.name=Tau Test', 'commit', '-m', 'first'],
      clone,
    );
    // The pre-receive hook is fail-closed: a push that did not come through
    // the API's admission check is refused, so the fixture sets the flag the
    // controller sets.
    await repositories.run(
      ['push', '--receive-pack=env TAU_GIT_PUSH_ADMITTED=1 git-receive-pack', 'origin', 'HEAD:refs/heads/main'],
      clone,
    );

    const snapshots = await backups.snapshotAll();

    expect(snapshots).toBe(1);
    const key = [...stored.keys()].find((candidate) => candidate.startsWith('git-backups/proj_backup/'));
    expect(key).toMatch(/^git-backups\/proj_backup\/\d{4}-\d{2}-\d{2}\.bundle$/u);
    expect(Buffer.from(stored.get(key ?? '') ?? new Uint8Array()).toString('utf8', 0, 15)).toContain('git bundle');
    expect([...stored.keys()].some((candidate) => candidate.startsWith('git-backups/proj_empty/'))).toBe(false);

    // The day's object is the durable marker: a second pass is a no-op, which
    // is what lets the first pass run 60 s after every boot (R9).
    expect(await backups.snapshotAll()).toBe(0);
  });

  /**
   * The charter's restore drill (risk row: "Fly volume is single-attach and
   * single-region | nightly `git bundle` snapshots to R2; restore drill in
   * W11's acceptance"). A snapshot nobody has restored is a belief, not a
   * backup: this clones the produced bundle with stock git and compares its
   * refs and commit ids against the repository it came from.
   */
  it('restores a repository from its bundle with stock git (charter restore drill)', async () => {
    const key = [...stored.keys()].find((candidate) => candidate.startsWith('git-backups/proj_backup/'));
    const bundle = stored.get(key ?? '');
    expect(bundle).toBeDefined();

    const bundlePath = path.join(workspace, 'restore.bundle');
    await writeFile(bundlePath, bundle ?? new Uint8Array());

    const restored = path.join(workspace, 'restored');
    await repositories.run(['clone', bundlePath, restored], workspace);

    // `git bundle verify` needs a repository to verify against; the restored
    // clone is the one the drill just produced. A non-zero exit rejects, so
    // reaching the assertion is itself the verification ("is okay" goes to
    // stderr; the ref listing is what git puts on stdout).
    const verified = await repositories.run(['bundle', 'verify', bundlePath], restored);
    expect(Buffer.from(verified).toString('utf8')).toContain('refs/heads/main');

    const sourceReferences = Buffer.from(
      await repositories.run(
        ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'],
        repositories.repositoryPath('proj_backup'),
      ),
    ).toString('utf8');
    const restoredReferences = Buffer.from(
      await repositories.run(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'], restored),
    ).toString('utf8');

    expect(sourceReferences.trim()).not.toBe('');
    expect(restoredReferences.trim()).toBe(sourceReferences.trim());
    expect(await readFile(path.join(restored, 'part.ts'), 'utf8')).toBe('export const depth = 4;\n');
  });

  it('retains revision ids from every supported record family and its reachable history', async () => {
    const clone = path.join(workspace, 'clone');
    const main = Buffer.from(await repositories.run(['rev-parse', 'HEAD'], clone))
      .toString('utf8')
      .trim();
    await writeFile(path.join(clone, 'chat.json'), JSON.stringify({ revisionId: main }));
    await repositories.run(['add', 'chat.json'], clone);
    await repositories.run(
      ['-c', 'user.email=test@tau.new', '-c', 'user.name=Tau Test', 'commit', '-m', 'chat record'],
      clone,
    );
    await writeFile(path.join(clone, 'chat.json'), JSON.stringify({ status: 'superseded' }));
    await repositories.run(['add', 'chat.json'], clone);
    await repositories.run(
      ['-c', 'user.email=test@tau.new', '-c', 'user.name=Tau Test', 'commit', '-m', 'new record tip'],
      clone,
    );
    await repositories.run(
      [
        'push',
        '--receive-pack=env TAU_GIT_PUSH_ADMITTED=1 git-receive-pack',
        'origin',
        'HEAD:refs/tau/chats/chat-retention',
        'HEAD:refs/tau/evidence/export-retention',
        'HEAD:refs/tau/artifacts/artifact-retention',
      ],
      clone,
    );

    await repositories.reachableLfsOids('proj_backup');
    const retained = Buffer.from(
      await repositories.run(
        ['rev-parse', `refs/tau/retention/records/${main}`],
        repositories.repositoryPath('proj_backup'),
      ),
    )
      .toString('utf8')
      .trim();
    expect(retained).toBe(main);
  });

  it('streams a bundle larger than the removed 256 MiB cap through bounded multipart parts', async () => {
    const bytes = 256 * 1024 * 1024 + 1;
    const fakeRepositories = {
      withRepositoryMaintenance: async <T>(_projectId: string, work: () => Promise<T>) => work(),
      repositoryPath: () => workspace,
      reachableLfsOids: async () => new Set<string>(),
      listLfsObjects: async () => [],
      run: async (args: readonly string[]) => {
        const bundlePath = args[2];
        if (args[0] === 'bundle' && bundlePath !== undefined) {
          const handle = await open(bundlePath, 'w');
          await handle.truncate(bytes);
          await handle.close();
        }
        return new Uint8Array();
      },
    } as unknown as GitRepositoryService;
    const service = new GitBackupService(configService, fakeRepositories, objectStorage);

    await expect(service.snapshot('proj_above_cap')).resolves.toBe(true);
    const finalKey = [...storedSizes.keys()].find((key) => key.startsWith('git-backups/proj_above_cap/'));
    expect(finalKey).toMatch(/\.bundle$/u);
    expect(storedSizes.get(finalKey ?? '')).toBe(bytes);
    expect([...multipartParts.values()].some((parts) => parts.reduce((total, size) => total + size, 0) === bytes)).toBe(
      true,
    );
  }, 30_000);

  it('aborts an interrupted multipart snapshot and retries the same daily key', async () => {
    const bytes = 33 * 1024 * 1024;
    const fakeRepositories = {
      withRepositoryMaintenance: async <T>(_projectId: string, work: () => Promise<T>) => work(),
      repositoryPath: () => workspace,
      reachableLfsOids: async () => new Set<string>(),
      listLfsObjects: async () => [],
      run: async (args: readonly string[]) => {
        const bundlePath = args[2];
        if (args[0] === 'bundle' && bundlePath !== undefined) {
          const handle = await open(bundlePath, 'w');
          await handle.truncate(bytes);
          await handle.close();
        }
        return new Uint8Array();
      },
    } as unknown as GitRepositoryService;
    const uploadPart = objectStorage.uploadPart.bind(objectStorage);
    const abortMultipartUpload = objectStorage.abortMultipartUpload.bind(objectStorage);
    let fail = true;
    let aborted = 0;
    const uploadPartSpy = vi
      .spyOn(objectStorage, 'uploadPart')
      .mockImplementation(async (args: Parameters<ObjectStorageService['uploadPart']>[0]) => {
        if (fail) {
          fail = false;
          throw new Error('interrupted upload');
        }
        return uploadPart(args);
      });
    const abortSpy = vi
      .spyOn(objectStorage, 'abortMultipartUpload')
      .mockImplementation(async (args: Parameters<ObjectStorageService['abortMultipartUpload']>[0]) => {
        aborted += 1;
        await abortMultipartUpload(args);
      });
    const service = new GitBackupService(configService, fakeRepositories, objectStorage);

    try {
      await expect(service.snapshot('proj_retry')).rejects.toThrow('interrupted upload');
      expect(aborted).toBe(1);
      await expect(service.snapshot('proj_retry')).resolves.toBe(true);
    } finally {
      uploadPartSpy.mockRestore();
      abortSpy.mockRestore();
    }
  }, 30_000);

  it('copies finalized LFS bytes beside the bundle before publishing the daily marker', async () => {
    const oid = 'a'.repeat(64);
    const sourceKey = gitLfsObjectKey('proj_lfs', oid);
    const payload = new TextEncoder().encode('large object bytes');
    stored.set(sourceKey, payload);
    storedSizes.set(sourceKey, payload.byteLength);
    const fakeRepositories = {
      withRepositoryMaintenance: async <T>(_projectId: string, work: () => Promise<T>) => work(),
      repositoryPath: () => workspace,
      reachableLfsOids: async () => new Set([oid]),
      listLfsObjects: async () => [
        {
          projectId: 'proj_lfs',
          oid,
          size: payload.byteLength,
          finalized: true,
          createdAt: new Date(),
          finalizedAt: new Date(),
          unreachableAt: undefined,
        },
      ],
      run: async (args: readonly string[]) => {
        const bundlePath = args[2];
        if (args[0] === 'bundle' && bundlePath !== undefined) {
          await writeFile(bundlePath, 'git bundle fixture');
        }
        return new Uint8Array();
      },
    } as unknown as GitRepositoryService;
    const service = new GitBackupService(configService, fakeRepositories, objectStorage);

    await expect(service.snapshot('proj_lfs')).resolves.toBe(true);
    const copied = [...stored.entries()].find(
      ([key]) => key.startsWith('git-backups/proj_lfs/') && key.endsWith(`/lfs/${oid}`),
    );
    expect(copied?.[1]).toStrictEqual(payload);
  });

  it('restores supported refs and reachable LFS bytes into an empty repository', async () => {
    const projectId = 'proj_lfs_restore';
    const repositoryPath = await repositories.ensureRepository(projectId);
    const clone = path.join(workspace, 'lfs-source');
    await repositories.run(['clone', repositoryPath, clone], workspace);
    await repositories.run(['lfs', 'install', '--local'], clone);
    const payload = new TextEncoder().encode('restorable large-object bytes');
    const oid = createHash('sha256').update(payload).digest('hex');
    await writeFile(path.join(clone, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n');
    await writeFile(path.join(clone, 'part.bin'), payload);
    await repositories.run(['add', '.'], clone);
    await repositories.run(
      ['-c', 'user.email=test@tau.new', '-c', 'user.name=Tau Test', 'commit', '-m', 'LFS restore fixture'],
      clone,
    );
    await repositories.run(['update-ref', 'refs/tau/chats/restore', 'HEAD'], clone);
    await repositories.run(
      [
        'push',
        '--receive-pack=env TAU_GIT_PUSH_ADMITTED=1 git-receive-pack',
        'origin',
        'HEAD:refs/heads/main',
        'refs/tau/chats/restore',
      ],
      clone,
    );

    const sourceKey = gitLfsObjectKey(projectId, oid);
    stored.set(sourceKey, payload);
    storedSizes.set(sourceKey, payload.byteLength);
    vi.mocked(repositories.listLfsObjects).mockResolvedValue([
      {
        projectId,
        oid,
        size: payload.byteLength,
        finalized: true,
        createdAt: new Date(),
        finalizedAt: new Date(),
        unreachableAt: undefined,
      },
    ]);
    try {
      await expect(backups.snapshot(projectId)).resolves.toBe(true);
    } finally {
      vi.mocked(repositories.listLfsObjects).mockResolvedValue([]);
    }

    const bundleKey = [...stored.keys()].find(
      (key) => key.startsWith(`git-backups/${projectId}/`) && key.endsWith('.bundle'),
    );
    const backedUpLfs = [...stored.entries()].find(
      ([key]) => key.startsWith(`git-backups/${projectId}/`) && key.endsWith(`/lfs/${oid}`),
    );
    expect(bundleKey).toBeDefined();
    expect(backedUpLfs?.[1]).toStrictEqual(payload);
    const bundlePath = path.join(workspace, `${projectId}.bundle`);
    await writeFile(bundlePath, stored.get(bundleKey ?? '') ?? new Uint8Array());

    const restored = path.join(workspace, 'lfs-restored');
    await repositories.run(['init', '--initial-branch=restore', restored], workspace);
    await repositories.run(
      [
        '-c',
        'filter.lfs.smudge=',
        '-c',
        'filter.lfs.required=false',
        'fetch',
        bundlePath,
        'refs/heads/*:refs/heads/*',
        'refs/tau/*:refs/tau/*',
      ],
      restored,
    );
    await repositories.run(
      ['-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.required=false', 'checkout', '-f', 'main'],
      restored,
    );
    const objectPath = path.join(restored, '.git', 'lfs', 'objects', oid.slice(0, 2), oid.slice(2, 4), oid);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, backedUpLfs?.[1] ?? new Uint8Array());
    await repositories.run(['lfs', 'install', '--local'], restored);
    await repositories.run(['lfs', 'checkout'], restored);

    expect(await readFile(path.join(restored, 'part.bin'))).toStrictEqual(Buffer.from(payload));
    const sourceRefs = Buffer.from(
      await repositories.run(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/tau/'], repositoryPath),
    ).toString('utf8');
    const restoredRefs = Buffer.from(
      await repositories.run(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/tau/'], restored),
    ).toString('utf8');
    expect(restoredRefs.trim()).toBe(sourceRefs.trim());
  }, 30_000);

  it('retains reachable and in-flight LFS objects while collecting only expired proof', async () => {
    const now = new Date('2026-09-15T00:00:00.000Z');
    const old = new Date('2026-07-01T00:00:00.000Z');
    const fresh = new Date('2026-09-14T23:30:00.000Z');
    const records = [
      {
        projectId: 'proj_gc',
        oid: '1'.repeat(64),
        size: 1,
        finalized: false,
        createdAt: old,
        finalizedAt: undefined,
        unreachableAt: undefined,
      },
      {
        projectId: 'proj_gc',
        oid: '2'.repeat(64),
        size: 2,
        finalized: false,
        createdAt: fresh,
        finalizedAt: undefined,
        unreachableAt: undefined,
      },
      {
        projectId: 'proj_gc',
        oid: '3'.repeat(64),
        size: 3,
        finalized: true,
        createdAt: old,
        finalizedAt: old,
        unreachableAt: undefined,
      },
      {
        projectId: 'proj_gc',
        oid: '4'.repeat(64),
        size: 4,
        finalized: true,
        createdAt: old,
        finalizedAt: old,
        unreachableAt: old,
      },
    ] as const;
    const retired: string[] = [];
    const fakeRepositories = {
      reachableLfsOids: async () => new Set(['3'.repeat(64)]),
      listLfsObjects: async () => records,
      markLfsObjectReachability: async () => undefined,
      retireLfsObject: async (record: { oid: string }) => {
        retired.push(record.oid);
        return true;
      },
      retireOrphanLfsObject: async (_projectId: string, oid: string) => {
        retired.push(oid);
        return true;
      },
    } as unknown as GitRepositoryService;
    const orphan = '5'.repeat(64);
    const storage = {
      listBlobs: async () => [
        { key: `git-lfs/proj_gc/${orphan}`, size: 5, lastModified: old },
        {
          key: `git-lfs/proj_gc/${'6'.repeat(64)}`,
          size: 6,
          lastModified: fresh,
        },
      ],
    } as unknown as ObjectStorageService;
    const service = new GitBackupService(configService, fakeRepositories, storage);

    await expect(service.collectLfs('proj_gc', now)).resolves.toBe(3);
    expect(retired).toEqual(['1'.repeat(64), '4'.repeat(64), orphan]);
  });
});

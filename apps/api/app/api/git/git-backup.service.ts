/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';

const singlePartBytes = 32 * 1024 * 1024;
const multipartPartBytes = 64 * 1024 * 1024;
const pendingRetentionMilliseconds = 24 * 60 * 60 * 1000;
const unreferencedRetentionMilliseconds = 30 * 24 * 60 * 60 * 1000;

/** Long enough to stay out of the boot path, short enough to survive a redeploy. */
const startupDelayMilliseconds = 60 * 1000;

/** One object per repository per day; a second pass that day is a no-op. */
const snapshotKey = (projectId: string, at: Date): string =>
  `git-backups/${projectId}/${at.toISOString().slice(0, 10)}.bundle`;
const snapshotPrefix = (projectId: string, at: Date): string =>
  `git-backups/${projectId}/${at.toISOString().slice(0, 10)}`;

/**
 * Nightly `git bundle` snapshots of every repository on the volume to the
 * private bucket (architecture "Retention", D15). A Fly volume is a single
 * attached disk; the bundle is the disaster-recovery copy of the whole graph,
 * restorable with stock `git clone <bundle>`.
 */
@Injectable()
export class GitBackupService implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(GitBackupService.name);
  readonly #shutdown = new AbortController();
  #loop: Promise<void> | undefined;

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly repositories: GitRepositoryService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  public onModuleInit(): void {
    this.#loop = this.run();
  }

  public async onModuleDestroy(): Promise<void> {
    this.#shutdown.abort();
    await this.#loop;
  }

  public async snapshotAll(): Promise<number> {
    const projectIds = await this.repositories.listRepositories();
    let snapshots = 0;
    for (const projectId of projectIds) {
      // oxlint-disable-next-line no-await-in-loop -- bundling is disk-bound; one repository at a time
      const stored = await this.snapshot(projectId).catch((error: unknown) => {
        this.#logger.warn({ err: error, projectId }, 'Repository bundle snapshot failed');
        return false;
      });
      snapshots += stored ? 1 : 0;
      // oxlint-disable-next-line no-await-in-loop -- collection shares the same per-repository disk bound.
      await this.collectLfs(projectId).catch((error: unknown) => {
        this.#logger.warn({ err: error, projectId }, 'Repository LFS retention failed');
      });
    }
    return snapshots;
  }

  public async snapshot(projectId: string): Promise<boolean> {
    const at = new Date();
    const key = snapshotKey(projectId, at);
    const already = await this.objectStorage.headBlob({
      namespace: 'blobs',
      key,
      tier: 'private',
    });
    if (already !== undefined) {
      return false;
    }
    const repositoryPath = this.repositories.repositoryPath(projectId);
    const workspace = await mkdtemp(path.join(tmpdir(), 'tau-git-bundle-'));
    const bundlePath = path.join(workspace, `${projectId}.bundle`);
    try {
      // An empty repository has nothing to bundle; git says so and exits non-zero.
      await this.repositories.reachableLfsOids(projectId);
      await this.repositories.run(['bundle', 'create', bundlePath, '--all'], repositoryPath);
      const info = await stat(bundlePath);
      const stagingKey = `${key}.uploading`;
      await this.storeFile(stagingKey, bundlePath, info.size);
      await this.backupLfs(projectId, at);
      await this.objectStorage.copyBlob({
        namespace: 'blobs',
        sourceKey: stagingKey,
        destinationKey: key,
        tier: 'private',
      });
      await this.objectStorage.deleteBlob({ namespace: 'blobs', key: stagingKey, tier: 'private' });
      return true;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  /** Remove only expired reservations or finalized bytes proven unreachable. */
  public async collectLfs(projectId: string, now = new Date()): Promise<number> {
    const [reachable, records] = await Promise.all([
      this.repositories.reachableLfsOids(projectId),
      this.repositories.listLfsObjects(projectId),
    ]);
    let removed = 0;
    for (const record of records) {
      const oldPending =
        !record.finalized && now.getTime() - record.createdAt.getTime() >= pendingRetentionMilliseconds;
      const oldUnreferenced =
        record.finalized &&
        !reachable.has(record.oid) &&
        record.finalizedAt !== undefined &&
        now.getTime() - record.finalizedAt.getTime() >= unreferencedRetentionMilliseconds;
      if (oldPending || oldUnreferenced) {
        // oxlint-disable-next-line no-await-in-loop -- owner admission serializes each destructive decision.
        removed += (await this.repositories.retireLfsObject(record)) ? 1 : 0;
      }
    }
    const currentRecords = await this.repositories.listLfsObjects(projectId);
    const tracked = new Set(currentRecords.map((record) => record.oid));
    const prefix = `git-lfs/${projectId}/`;
    const objects = await this.objectStorage.listBlobs({ namespace: 'blobs', keyPrefix: prefix, tier: 'private' });
    for (const object of objects) {
      const oid = object.key.slice(object.key.lastIndexOf('/') + 1);
      if (
        !tracked.has(oid) &&
        /^[\da-f]{64}$/u.test(oid) &&
        object.lastModified !== undefined &&
        now.getTime() - object.lastModified.getTime() >= pendingRetentionMilliseconds
      ) {
        // oxlint-disable-next-line no-await-in-loop -- the repository rechecks admission under the owner lock.
        removed += (await this.repositories.retireOrphanLfsObject(projectId, oid)) ? 1 : 0;
      }
    }
    return removed;
  }

  private async backupLfs(projectId: string, at: Date): Promise<void> {
    const records = await this.repositories.listLfsObjects(projectId);
    const finalized = records.filter((record) => record.finalized);
    for (const record of finalized) {
      const destinationKey = `${snapshotPrefix(projectId, at)}/lfs/${record.oid}`;
      // oxlint-disable-next-line no-await-in-loop -- R2 copies are bounded and a completed object is idempotent.
      if (await this.objectStorage.headBlob({ namespace: 'blobs', key: destinationKey, tier: 'private' })) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- server-side copy avoids buffering LFS bytes in the API.
      await this.objectStorage.copyBlob({
        namespace: 'blobs',
        sourceKey: gitLfsObjectKey(projectId, record.oid),
        destinationKey,
        tier: 'private',
      });
    }
  }

  private async storeFile(key: string, file: string, size: number): Promise<void> {
    if (size <= singlePartBytes) {
      const body = await readFile(file);
      await this.objectStorage.putBlob({
        namespace: 'blobs',
        key,
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as Uint8Array<ArrayBuffer>,
        contentType: 'application/x-git-bundle',
        tier: 'private',
      });
      return;
    }
    const uploadId = await this.objectStorage.createMultipartUpload({
      namespace: 'blobs',
      key,
      contentType: 'application/x-git-bundle',
      tier: 'private',
    });
    let completed = false;
    const handle = await open(file, 'r');
    try {
      const parts = [];
      let offset = 0;
      let partNumber = 1;
      while (offset < size) {
        const buffer = Buffer.allocUnsafe(Math.min(multipartPartBytes, size - offset));
        // oxlint-disable-next-line no-await-in-loop -- file parts and multipart numbers are ordered.
        const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, offset);
        if (bytesRead === 0) {
          throw new Error('Repository bundle ended before its measured size.');
        }
        const body = new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
        const checksumSha256 = createHash('sha256').update(body).digest('base64');
        // oxlint-disable-next-line no-await-in-loop -- bounded sequential upload keeps API memory flat.
        const uploaded = await this.objectStorage.uploadPart({
          namespace: 'blobs',
          key,
          uploadId,
          partNumber,
          body,
          checksumSha256,
          tier: 'private',
        });
        parts.push({ partNumber, etag: uploaded.etag, checksumSha256: uploaded.checksumSha256 });
        offset += bytesRead;
        partNumber += 1;
      }
      await this.objectStorage.completeMultipartUpload({ namespace: 'blobs', key, uploadId, parts, tier: 'private' });
      completed = true;
    } finally {
      await handle.close();
      if (!completed) {
        await this.objectStorage.abortMultipartUpload({ namespace: 'blobs', key, uploadId, tier: 'private' });
      }
    }
  }
  private async run(): Promise<void> {
    const intervalMilliseconds =
      this.configService.get('TAU_GIT_BACKUP_INTERVAL_HOURS', { infer: true }) * 60 * 60 * 1000;
    // The first pass runs shortly after boot, not one interval later: a machine
    // that is redeployed more often than the interval would otherwise never
    // snapshot at all. Repeating is cheap rather than suppressed by a timer —
    // the day's object is the durable marker, and a repository whose bundle for
    // today already exists is skipped (`snapshot`).
    let wait = startupDelayMilliseconds;
    while (!this.#shutdown.signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one owner, one snapshot pass at a time
        await delay(wait, undefined, {
          signal: this.#shutdown.signal,
        });
        wait = intervalMilliseconds;
        // oxlint-disable-next-line no-await-in-loop -- one owner, one snapshot pass at a time
        await this.snapshotAll();
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- `delay` rejects when the signal aborts during the wait
        if (this.#shutdown.signal.aborted) {
          return;
        }
        this.#logger.error({ err: error }, 'Repository bundle snapshot pass failed');
      }
    }
  }
}

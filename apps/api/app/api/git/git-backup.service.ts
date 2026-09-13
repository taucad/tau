/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/**
 * Ponytail: a bundle larger than this is logged and skipped rather than read
 * into memory. The upgrade path is the object store's own multipart upload
 * (`createMultipartUpload`/`presignUploadPart`), which is worth writing the
 * first time a real project's bundle crosses the cap.
 */
const maximumBundleBytes = 256 * 1024 * 1024;

/** Long enough to stay out of the boot path, short enough to survive a redeploy. */
const startupDelayMilliseconds = 60 * 1000;

/** One object per repository per day; a second pass that day is a no-op. */
const snapshotKey = (projectId: string, at: Date): string =>
  `git-backups/${projectId}/${at.toISOString().slice(0, 10)}.bundle`;

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
    }
    return snapshots;
  }

  public async snapshot(projectId: string): Promise<boolean> {
    const key = snapshotKey(projectId, new Date());
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
      await this.repositories.run(['bundle', 'create', bundlePath, '--all'], repositoryPath);
      const info = await stat(bundlePath);
      if (info.size > maximumBundleBytes) {
        this.#logger.warn({ projectId, bytes: info.size }, 'Repository bundle exceeds the single-part upload cap');
        return false;
      }
      const body = await readFile(bundlePath);
      await this.objectStorage.putBlob({
        namespace: 'blobs',
        key,
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as Uint8Array<ArrayBuffer>,
        contentType: 'application/x-git-bundle',
        tier: 'private',
      });
      return true;
    } finally {
      await rm(workspace, { recursive: true, force: true });
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

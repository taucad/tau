/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { project, projectGit, projectGitLfsObject } from '#database/schema.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { ProjectRole } from '#api/collaboration/project-access.service.js';
import type { CommercialEntitlementsService } from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import { repositoryStoreKey, storageLimitBytesByTier } from '#api/git/git.constants.js';
import type { GitService as GitSmartService } from '#api/git/git.constants.js';
import { commitLease } from '#api/git/store/commit.js';
import type { MovedRef } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';
import { resolveLfsObjectLocation } from '#api/git/lfs-keys.js';
import { markLfsReachability } from '#api/git/lfs-reachability.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { leaseDiskBytesPerLease, repositoryByteCeiling } from '#api/git/store/limits.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { materializePublishedTags } from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

/**
 * The Tau Hosted Remote's request path over the repository store (charter D1,
 * D3, D4).
 *
 * Every request hydrates a disposable lease from object storage, runs stock
 * git over it and throws it away. Nothing on this machine is durable state
 * (NI1), nothing here holds a per-repository lock (NI3, the manifest's
 * conditional write is the lock), and nothing enumerates every repository
 * (NI10).
 */

/**
 * What the git binaries are allowed to see. Never the API's own environment:
 * the hook is a child process and has no business reading database or
 * object-store credentials. The cast is the workspace's own idiom for a
 * curated child environment (`app/testing/billing-load/cluster.ts`), since
 * `NodeJS.ProcessEnv` is augmented with the validated API schema.
 */
/* eslint-disable @typescript-eslint/naming-convention -- these are process environment variable names, not identifiers */
const childEnvironment = (
  repositoryPath: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: path.dirname(repositoryPath),
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  ...extra,
});
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/** What `authorize` resolved for one request. */
export type GitAccess = {
  readonly projectId: string;
  /** The tenant whose prefix, plan and bill the bytes land on — never the pusher (D27). */
  readonly ownerId: string;
  /** What the authenticated caller may do with this project. */
  readonly role: ProjectRole;
  /** Bytes this project may still add before the plan allowance is spent. */
  readonly remainingBytes: number;
  /** The owner's complete plan allowance, used by serialized write admission. */
  readonly storageLimitBytes: number;
};

export type GitLfsObjectState = {
  readonly oid: string;
  readonly size: number;
  readonly finalized: boolean;
};

export type GitLfsReservation =
  | {
      readonly status: 'reserved';
      readonly objects: readonly GitLfsObjectState[];
    }
  | {
      readonly status: 'quota';
      readonly shortfallBytes: number;
      readonly remainingBytes: number;
      readonly files: ReadonlyArray<{
        readonly oid: string;
        readonly size: number;
      }>;
    };

const gitExecutable = 'git';

/**
 * Whether a process id still names a running process.
 *
 * Signal 0 delivers nothing and only asks the question. `ESRCH` is the one
 * answer that means "gone"; `EPERM` is somebody else's process, which is very
 * much alive and must never have its leases swept.
 *
 * @param pid - The process id a lease directory is named after.
 * @returns True unless the kernel says no such process.
 */
const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/**
 * Bytes under one directory, for the sweep's log line.
 *
 * @param directory - The directory to measure.
 * @returns The sum of its files' sizes.
 */
const directoryBytes = async (directory: string): Promise<number> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const held = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return directoryBytes(held);
      }
      const measured = await stat(held);
      return measured.size;
    }),
  );
  return sizes.reduce((total, size) => total + size, 0);
};

/** A clone of a large repository is slow; an abandoned child is forever. */
const rpcTimeoutMilliseconds = 10 * 60 * 1000;

/** `for-each-ref`, `cat-file`, `--advertise-refs`. */
const commandTimeoutMilliseconds = 60 * 1000;

/** What a 503 from this service tells the client to wait, in seconds. */
export const gitRetryAfterSeconds = 5;

/**
 * One pkt-line flush (`0000`), which is the whole body of the request `git push`
 * sends to authenticate a chunked push. A request no larger than this carried no
 * commands and no pack, so it changed nothing.
 */
const flushPacketBytes = 4;

@Injectable()
export class GitRepositoryService {
  /**
   * Scratch reserved per in-flight lease (D33: 2.5 GiB). Public so the
   * admission suite can raise it past any real disk without a fake `statfs`.
   *
   * ponytail: a mutable field rather than an injected bound; the only other
   * caller that would ever set it is a deployment with a different disk, and
   * that is an environment variable on the day someone has one.
   */
  public leaseDiskBytesPerLease = leaseDiskBytesPerLease;

  /**
   * W2's crash seam (`store/fault-points.ts`), threaded into every commit so a
   * suite can kill a committer at a named point. Unset in a deployment, where
   * it costs one `await` of `undefined` per push.
   */
  public faults: FaultInjector | undefined;

  /**
   * D20's per-repository ceiling on non-LFS bytes. Public for the same reason
   * as the figure above: the refusal suite proves the hook's sentence and its
   * file list without pushing a gigabyte.
   */
  public repositoryByteCeiling = repositoryByteCeiling;

  readonly #logger = new Logger(GitRepositoryService.name);

  /**
   * Where leases are built. The worker's ephemeral disk, which is what D33's
   * admission figure is measured against — never a mounted volume, because
   * there is no longer one.
   */
  readonly #leaseParent = path.join(tmpdir(), 'tau-git-leases', String(process.pid));

  /**
   * In-flight leases, process-local and deliberately so: this counter bounds
   * *this* worker's disk, which no other worker shares. It is the only counter
   * left — the owner and repository gates are gone, because the manifest's
   * conditional write is the repository's lock (NI3) and the owner-keyed
   * advisory lock is LFS and quota's (D18).
   */
  #inFlightLeases = 0;

  /**
   * Work a request started that outlives its response — today only the lease
   * disposal that follows a fetch, whose child closes after the bytes are on
   * the wire. Held in a set rather than fired and forgotten, so a failure has
   * somewhere to be logged and a caller can wait for it.
   */
  readonly #background = new Set<Promise<void>>();

  public constructor(
    private readonly databaseService: DatabaseService,
    @Inject(commercialEntitlementsKey)
    private readonly entitlementsService: CommercialEntitlementsService,
    private readonly storage: ObjectStorageService,
    private readonly projectAccess: ProjectAccessService,
    @Inject(repositoryStoreKey)
    private readonly store: RepositoryStore,
  ) {
    /* A crash restarts a Machine in place on the same rootfs, so boot is the
       first chance to give the dead worker's disk back (W10 defect 2). Tracked
       rather than awaited: nothing may wait on a sweep to serve a request. */
    this.track(this.sweepAbandonedLeases());
  }

  /**
   * Who may do what with this repository, and what the plan still allows.
   *
   * Membership is `ProjectAccessService`'s single answer (W3, D27): a caller
   * with no relation is told the project does not exist, and a collaborator
   * below the role is refused `403`. That service caches a hit for five
   * seconds, which is D22 — there is no second cache here.
   *
   * A read stops after that. The plan facts cost `getEntitlements` plus an
   * account-wide `sum()`, and a read consults neither `canSyncFiles` nor
   * `remainingBytes` (review C28).
   *
   * @param args - The project, the authenticated caller and what it is doing.
   * @returns The owner whose storage answers, and the plan headroom.
   * @throws NotFoundException When the caller has no relation to the project.
   * @throws ForbiddenException When the caller's role is below the need, or the plan cannot sync.
   * @throws PayloadTooLargeException When the plan allowance is already spent.
   */
  public async authorize(args: {
    projectId: string;
    userId: string;
    mode: 'read' | 'write' | 'finalize';
  }): Promise<GitAccess> {
    const access = await this.projectAccess.authorize(
      args.projectId,
      args.userId,
      args.mode === 'read' ? 'read' : 'write',
    );

    if (args.mode === 'read') {
      return {
        projectId: args.projectId,
        ownerId: access.ownerId,
        role: access.role,
        /* A read spends nothing and is offered nothing: every caller that reads
           these two is a write caller (`git.controller.ts`, `git-lfs.service.ts`). */
        remainingBytes: 0,
        storageLimitBytes: 0,
      };
    }

    const entitlements = await this.entitlementsService.getEntitlements(access.ownerId);
    if (!entitlements.canSyncFiles) {
      throw new ForbiddenException({
        code: 'GIT_SYNC_NOT_ENTITLED',
        message: 'Syncing files to Tau Cloud is a paid plan feature.',
      });
    }

    const limit =
      entitlements.storageLimitBytes ??
      (entitlements.tier === undefined ? storageLimitBytesByTier.pro : storageLimitBytesByTier[entitlements.tier]);
    const usage = await this.readOwnerUsage(access.ownerId);
    const remainingBytes = Math.max(0, limit - usage.storageBytes - usage.lfsBytes);
    if (args.mode === 'write' && remainingBytes === 0) {
      throw new PayloadTooLargeException({
        code: 'GIT_QUOTA_EXCEEDED',
        message: `Storage quota reached: ${String(usage.storageBytes + usage.lfsBytes)} of ${String(limit)} bytes used.`,
      });
    }

    return {
      projectId: args.projectId,
      ownerId: access.ownerId,
      role: access.role,
      remainingBytes,
      storageLimitBytes: limit,
    };
  }

  /** Account-wide usage; one plan allowance is shared by all owned projects. */
  public async readOwnerUsage(ownerId: string): Promise<{ storageBytes: number; lfsBytes: number }> {
    const rows = await this.databaseService.database
      .select({
        storageBytes: sql<number>`coalesce(sum(${projectGit.storageBytes}), 0)`,
        lfsBytes: sql<number>`coalesce(sum(${projectGit.lfsBytes}), 0)`,
      })
      .from(project)
      .leftJoin(projectGit, eq(projectGit.projectId, project.id))
      .where(eq(project.ownerId, ownerId));
    const [row] = rows;
    return {
      storageBytes: Number(row?.storageBytes ?? 0),
      lfsBytes: Number(row?.lfsBytes ?? 0),
    };
  }

  /** Finalized LFS identities are the only objects the download API advertises. */
  public async readLfsObjects(projectId: string, oids: readonly string[]): Promise<readonly GitLfsObjectState[]> {
    if (oids.length === 0) {
      return [];
    }
    const rows = await this.databaseService.database
      .select({
        oid: projectGitLfsObject.oid,
        size: projectGitLfsObject.sizeBytes,
        finalizedAt: projectGitLfsObject.finalizedAt,
      })
      .from(projectGitLfsObject)
      .where(and(eq(projectGitLfsObject.projectId, projectId), inArray(projectGitLfsObject.oid, [...new Set(oids)])));
    return rows.map((row) => ({
      oid: row.oid,
      size: row.size,
      finalized: row.finalizedAt !== null,
    }));
  }

  /**
   * Reserve every novel object and its declared bytes in one owner-serialized
   * transaction. Retries see the same primary-key row and charge nothing.
   */
  public async reserveLfsObjects(args: {
    access: GitAccess;
    objects: ReadonlyArray<{ readonly oid: string; readonly size: number }>;
  }): Promise<GitLfsReservation> {
    return this.databaseService.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${args.access.ownerId}, 0))`);
      const requestedByOid = new Map<string, { readonly oid: string; readonly size: number }>();
      for (const object of args.objects) {
        const prior = requestedByOid.get(object.oid);
        if (prior !== undefined && prior.size !== object.size) {
          throw new BadRequestException({
            code: 'GIT_LFS_SIZE_MISMATCH',
            message: `LFS object ${object.oid} was requested with conflicting sizes`,
          });
        }
        requestedByOid.set(object.oid, object);
      }
      const requested = [...requestedByOid.values()];
      const existing =
        requested.length === 0
          ? []
          : await transaction
              .select({
                oid: projectGitLfsObject.oid,
                size: projectGitLfsObject.sizeBytes,
                finalizedAt: projectGitLfsObject.finalizedAt,
              })
              .from(projectGitLfsObject)
              .where(
                and(
                  eq(projectGitLfsObject.projectId, args.access.projectId),
                  inArray(
                    projectGitLfsObject.oid,
                    requested.map((object) => object.oid),
                  ),
                ),
              );
      const byOid = new Map(existing.map((row) => [row.oid, row]));
      for (const object of requested) {
        const row = byOid.get(object.oid);
        if (row !== undefined && row.size !== object.size) {
          throw new BadRequestException({
            code: 'GIT_LFS_SIZE_MISMATCH',
            message: `LFS object ${object.oid} was requested with conflicting sizes`,
          });
        }
      }
      const novel = requested.filter((object) => !byOid.has(object.oid));
      const usageRows = await transaction
        .select({
          storageBytes: sql<number>`coalesce(sum(${projectGit.storageBytes}), 0)`,
          lfsBytes: sql<number>`coalesce(sum(${projectGit.lfsBytes}), 0)`,
        })
        .from(project)
        .leftJoin(projectGit, eq(projectGit.projectId, project.id))
        .where(eq(project.ownerId, args.access.ownerId));
      const usage = usageRows[0];
      const usedBytes = Number(usage?.storageBytes ?? 0) + Number(usage?.lfsBytes ?? 0);
      const remainingBytes = Math.max(0, args.access.storageLimitBytes - usedBytes);
      const incoming = novel.reduce((total, object) => total + object.size, 0);
      if (incoming > remainingBytes) {
        return {
          status: 'quota',
          shortfallBytes: incoming - remainingBytes,
          remainingBytes,
          files: novel,
        };
      }
      if (novel.length > 0) {
        await transaction.insert(projectGitLfsObject).values(
          novel.map((object) => ({
            projectId: args.access.projectId,
            oid: object.oid,
            sizeBytes: object.size,
          })),
        );
        await transaction
          .insert(projectGit)
          .values({ projectId: args.access.projectId, lfsBytes: incoming })
          .onConflictDoUpdate({
            target: projectGit.projectId,
            set: {
              lfsBytes: sql`${projectGit.lfsBytes} + ${incoming}`,
              updatedAt: new Date(),
            },
          });
      }
      const novelOids = new Set(novel.map((object) => object.oid));
      return {
        status: 'reserved',
        objects: requested.map((object) => ({
          ...object,
          finalized: !novelOids.has(object.oid) && byOid.get(object.oid)?.finalizedAt !== null,
        })),
      };
    });
  }

  /** Mark one exact reserved identity finalized; repeated verification is a no-op. */
  public async finalizeLfsObject(args: {
    access: GitAccess;
    oid: string;
    size: number;
  }): Promise<'finalized' | 'already-finalized' | 'unreserved'> {
    return this.databaseService.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${args.access.ownerId}, 0))`);
      const rows = await transaction
        .select({
          size: projectGitLfsObject.sizeBytes,
          finalizedAt: projectGitLfsObject.finalizedAt,
        })
        .from(projectGitLfsObject)
        .where(and(eq(projectGitLfsObject.projectId, args.access.projectId), eq(projectGitLfsObject.oid, args.oid)))
        .limit(1)
        .for('update');
      const [row] = rows;
      if (row === undefined || row.size !== args.size) {
        return 'unreserved';
      }
      if (row.finalizedAt !== null) {
        return 'already-finalized';
      }
      await transaction
        .update(projectGitLfsObject)
        .set({ finalizedAt: new Date() })
        .where(and(eq(projectGitLfsObject.projectId, args.access.projectId), eq(projectGitLfsObject.oid, args.oid)));
      return 'finalized';
    });
  }

  public async readUsage(projectId: string): Promise<{ storageBytes: number; lfsBytes: number }> {
    const rows = await this.databaseService.database
      .select({
        storageBytes: projectGit.storageBytes,
        lfsBytes: projectGit.lfsBytes,
      })
      .from(projectGit)
      .where(eq(projectGit.projectId, projectId))
      .limit(1);
    const [row] = rows;
    return row ?? { storageBytes: 0, lfsBytes: 0 };
  }

  /**
   * Builds a lease for this project, runs `work` against it and disposes it.
   *
   * The one way anything in this application touches a repository. Admission
   * is taken before the hydrate and released after the dispose, so the counter
   * covers the whole window the disk is occupied.
   *
   * @param access - What `authorize` resolved.
   * @param work - What to do with the disposable bare directory.
   * @returns Whatever `work` returned.
   * @throws ServiceUnavailableException When this worker has no disk for another lease.
   */
  public async withLease<T>(access: GitAccess, work: (lease: RepositoryLease) => Promise<T>): Promise<T> {
    const release = await this.admitLease();
    let lease: RepositoryLease | undefined;
    try {
      lease = await hydrateLease({
        store: this.store,
        locator: repositoryLocator({ ownerId: access.ownerId, projectId: access.projectId }),
        parentDirectory: this.#leaseParent,
      });
      return await work(lease);
    } catch (error) {
      throw this.refusalFor(error);
    } finally {
      /* The admission comes back whatever the disposal did, and a disposal
         failure never replaces the refusal this request was about to answer
         (review F2). `rm -rf` suppresses ENOENT but not EBUSY, EACCES or
         EPERM, and a throw here used to skip `release()` for the life of the
         process — after which every request on this worker answered
         `GIT_LEASE_DISK_FULL` forever, and a lost race reached the client as a
         500 instead of the 503 it is. */
      await this.disposeQuietly(lease, access.projectId);
      release();
    }
  }

  /**
   * `info/refs?service=…`: the ref advertisement, over a lease.
   *
   * @param access - What `authorize` resolved.
   * @param service - The service the client named.
   * @returns The advertisement bytes, without the service prefix.
   */
  public async advertiseRefs(access: GitAccess, service: GitSmartService): Promise<Uint8Array<ArrayBuffer>> {
    return this.withLease(access, async (lease) => {
      await this.repairDerivedState(access, lease);
      return this.runGit([service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', '.'], lease.directory);
    });
  }

  /**
   * `git-upload-pack`: a read. Hydrate, serve, dispose; no commit.
   *
   * The child's stdout is streamed rather than buffered — a clone at D20's
   * ceiling is a gigabyte and nothing about a read needs it in memory — and the
   * lease lives until the child closes.
   *
   * @param args - The access, the request body and the client's abort signal.
   * @returns The stream the response is written from.
   */
  public async uploadPack(args: {
    access: GitAccess;
    body: Readable;
    gzipped: boolean;
    maximumInputBytes: number;
    abort?: AbortSignal;
  }): Promise<Readable> {
    const release = await this.admitLease();
    let lease: RepositoryLease | undefined;
    try {
      lease = await hydrateLease({
        store: this.store,
        locator: repositoryLocator({ ownerId: args.access.ownerId, projectId: args.access.projectId }),
        parentDirectory: this.#leaseParent,
      });
      await this.repairDerivedState(args.access, lease);
      const held = lease;
      const child = this.spawnService({
        lease: held,
        service: 'git-upload-pack',
        maximumInputBytes: args.maximumInputBytes,
        ...(args.abort === undefined ? {} : { abort: args.abort }),
      });
      child.on('close', () => {
        this.track(this.disposeAfterFetch(held, release, args.access.projectId));
      });
      this.pipeRequestBody({ ...args, child, service: 'git-upload-pack' });
      return child.stdout;
    } catch (error) {
      // Same shape as `withLease`'s `finally` (review F2).
      await this.disposeQuietly(lease, args.access.projectId);
      release();
      throw this.refusalFor(error);
    }
  }

  /**
   * `git-receive-pack`: a push.
   *
   * The whole response is withheld until `commitLease` resolves (D4, NI2), so
   * git's own report-status is buffered rather than streamed: a client that
   * read `ok refs/heads/main` off the wire before the manifest was durable
   * would have been told a lie the protocol cannot take back. Buffering costs
   * nothing — report-status is a few pkt-lines whatever the pack was.
   *
   * @param args - The access, the pusher, the request body and the abort signal.
   * @returns Git's report-status, verbatim (NI13).
   */
  public async receivePack(args: {
    access: GitAccess;
    /** The authenticated pusher, from the session and never the request (D28, NI16). */
    committedBy: string;
    body: Readable;
    gzipped: boolean;
    maximumInputBytes: number;
    abort?: AbortSignal;
  }): Promise<Uint8Array<ArrayBuffer>> {
    return this.withLease(args.access, async (lease) => {
      await this.repairDerivedState(args.access, lease);
      const ceilingRemaining = Math.max(
        0,
        this.repositoryByteCeiling - (lease.manifest?.packs ?? []).reduce((total, pack) => total + pack.bytes, 0),
      );
      const child = this.spawnService({
        lease,
        service: 'git-receive-pack',
        maximumInputBytes: args.maximumInputBytes,
        ...(args.abort === undefined ? {} : { abort: args.abort }),
        environment: {
          /* The `pre-receive` hook reads all three: it refuses a push that did
             not come through this admission check, one whose quarantine does
             not fit in what is left of the plan, and one that would take the
             repository past D20's ceiling (D17, D20). */
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_PUSH_ADMITTED: '1',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_QUOTA_REMAINING_BYTES: String(args.access.remainingBytes),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_CEILING_REMAINING_BYTES: String(ceilingRemaining),
        },
      });

      const output = this.collect(child.stdout);
      const request = this.pipeRequestBody({ ...args, child, service: 'git-receive-pack' });
      const [body] = await Promise.all([output, this.awaitChild(child), request.done]);

      if (request.counter.bytes <= flushPacketBytes) {
        /* The flush-only body `git push` authenticates a chunked push with.
           Nothing arrived, so there is nothing to commit and no generation to
           record. */
        return body;
      }

      const result = await commitLease({
        store: this.store,
        lease,
        committedBy: args.committedBy,
        byteCeiling: this.repositoryByteCeiling,
        ...(this.faults === undefined ? {} : { faults: this.faults }),
      });
      if (result.committed) {
        await this.recordGeneration(args.access.projectId, result.manifest.generation);
        await this.derive({ access: args.access, lease, manifest: result.manifest, moved: result.moved });
      }
      return body;
    });
  }

  /** Waits for the work a finished request left running. */
  public async settled(): Promise<void> {
    await Promise.all(this.#background);
  }

  /**
   * What the publication materializer needs from this service.
   *
   * Public so the publication routes can materialize through a lease of their
   * own rather than a second git runner (W4c).
   */
  public get materializerDependencies(): MaterializerDependencies {
    return {
      databaseService: this.databaseService,
      storage: this.storage,
      git: async (repositoryPath, args, stdin) => this.runGit(args, repositoryPath, stdin),
      /* The one answer to "where is this object" lives in W4b's leaf module, so
         binding it here keeps the materializer out of the LFS service's import
         cycle. Two statements because the member read of an awaited call is a
         lint error in this workspace. */
      resolveLfsObject: async (object) => {
        const held = await resolveLfsObjectLocation(this.storage, object);
        return held?.location;
      },
    };
  }

  /**
   * Removes the lease directories of workers that are no longer running (W10
   * defect 2).
   *
   * A worker killed mid-push cannot unlink its own lease, and admission counts
   * the *free* bytes of the disk those leases sit on — so every crash used to
   * cost this machine up to `leaseDiskBytesPerLease` of headroom permanently.
   * Leases therefore live under `tau-git-leases/<pid>/`, and a sibling is only
   * removed when its pid is gone: two API processes share one `tmpdir` locally
   * and must never sweep each other.
   *
   * Runs on service init *and* before every admission, because a surviving
   * worker is the only process that will ever boot again after a crash in
   * place, and admission is the moment the leaked bytes matter.
   *
   * ponytail: unthrottled — a `readdir` of a handful of names plus a signal-0
   * per name. Add a throttle if a machine ever hosts thousands of siblings.
   */
  private async sweepAbandonedLeases(): Promise<void> {
    const root = path.dirname(this.#leaseParent);
    let siblings: readonly string[];
    try {
      siblings = await readdir(root);
    } catch {
      /* Nothing has run on this machine yet. */
      return;
    }
    const abandoned = siblings.filter((name) => /^\d+$/u.test(name) && !processAlive(Number(name)));
    if (abandoned.length === 0) {
      return;
    }
    let reclaimed = 0;
    for (const name of abandoned) {
      const held = path.join(root, name);
      try {
        // oxlint-disable-next-line no-await-in-loop -- one dead worker at a time; the list is tiny and the removal is I/O, not CPU
        reclaimed += await directoryBytes(held);
        // oxlint-disable-next-line no-await-in-loop -- as above
        await rm(held, { recursive: true, force: true });
      } catch (error) {
        this.#logger.warn({ err: error, directory: held }, 'A dead worker’s lease directory could not be removed');
      }
    }
    this.#logger.log(
      { directories: abandoned.length, bytes: reclaimed },
      'Reclaimed the lease directories of workers that are no longer running',
    );
  }

  /**
   * Admits one more lease while this worker's disk can hold it (D33).
   *
   * Concurrent leases × the per-lease reservation against the *free* space of
   * the lease parent, read with `statfs` on every admission rather than
   * assumed: an operator who resizes the machine's disk changes the answer
   * without changing a constant. This replaces the flat 32-child ceiling,
   * which bounded the wrong resource — a lease is disk, not CPU.
   *
   * @returns The release, which every path must call.
   * @throws ServiceUnavailableException When another lease would not fit.
   */
  private async admitLease(): Promise<() => void> {
    await this.sweepAbandonedLeases();
    await mkdir(this.#leaseParent, { recursive: true });
    const { bavail, bsize } = await statfs(this.#leaseParent);
    const free = bavail * bsize;
    if ((this.#inFlightLeases + 1) * this.leaseDiskBytesPerLease > free) {
      throw new ServiceUnavailableException({
        code: 'GIT_LEASE_DISK_FULL',
        message: 'This server has no room for another repository right now; retry shortly.',
      });
    }
    this.#inFlightLeases += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#inFlightLeases -= 1;
      }
    };
  }

  /**
   * Turns a store refusal into the HTTP answer the charter names for it.
   *
   * Returns the refusal rather than raising it, so every caller reads as
   * `throw this.refusalFor(error)` and the throw site stays where the control
   * flow is.
   *
   * @param error - Whatever the store, the lease or the commit raised.
   * @returns The exception to throw.
   */
  private refusalFor(error: unknown): Error {
    if (!(error instanceof RepositoryStoreError)) {
      return error instanceof Error ? error : new Error(String(error));
    }
    switch (error.code) {
      case 'lost':
      case 'deadline': {
        /* D4: a lost race is not a failed push, it is a push that has to happen
           again. The client re-pushes against the manifest that won. */
        return new ServiceUnavailableException({
          code: 'GIT_PUSH_RACE_LOST',
          message: 'Another push for this project committed first; retry.',
        });
      }
      case 'incarnation-changed': {
        return new NotFoundException({
          code: 'GIT_REPOSITORY_NOT_FOUND',
          message: 'Repository not found',
        });
      }
      case 'tombstoned': {
        return new GoneException({
          code: 'GIT_REPOSITORY_DELETED',
          message: 'This project has been deleted.',
        });
      }
      case 'ceiling-exceeded': {
        /* `pre-receive` bounds what *arrives*, so the backstop is reachable
           without a bug: a compacting commit repacks the retained pack together
           with the arrival, and a repack that deltifies worse than its inputs
           is larger than the sum the hook measured (review F12). Nothing is
           durable either way — the assertion runs before the first upload. */
        this.#logger.log({ message: error.message }, 'The D20 ceiling was reached past the pre-receive hook');
        return new PayloadTooLargeException({
          code: 'GIT_REPOSITORY_CEILING_EXCEEDED',
          message: error.message,
        });
      }
      case 'loose-objects':
      case 'connectivity': {
        return new UnprocessableEntityException({
          code: 'GIT_PUSH_NOT_COMMITTABLE',
          message: error.message,
        });
      }
      case 'missing-pack': {
        return new InternalServerErrorException({
          code: 'GIT_REPOSITORY_INCOMPLETE',
          message: error.message,
        });
      }
    }
  }

  /**
   * One smart-HTTP RPC child over a lease.
   *
   * @param args - The lease, the service and the bounds.
   * @returns The spawned child.
   */
  private spawnService(args: {
    lease: RepositoryLease;
    service: GitSmartService;
    maximumInputBytes: number;
    environment?: Readonly<Record<string, string>>;
    abort?: AbortSignal;
  }): ChildProcessByStdio<Writable, Readable, Readable> {
    const write = args.service === 'git-receive-pack';
    const child = spawn(
      gitExecutable,
      [
        ...(write ? ['-c', `receive.maxInputSize=${String(args.maximumInputBytes)}`] : []),
        args.service.replace('git-', ''),
        '--stateless-rpc',
        args.lease.directory,
      ],
      {
        env: childEnvironment(args.lease.directory, args.environment) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: rpcTimeoutMilliseconds,
        killSignal: 'SIGKILL',
        ...(args.abort === undefined ? {} : { signal: args.abort }),
      },
    );
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    // An aborted or timed-out child emits `error`; without a listener that is
    // an unhandled exception on the process.
    child.on('error', (error) => {
      this.#logger.warn({ err: error, service: args.service }, 'git smart-HTTP child ended early');
    });
    child.on('close', (code) => {
      if (code !== 0) {
        this.#logger.warn(
          {
            service: args.service,
            code,
            stderr: Buffer.concat(stderr).toString('utf8').slice(0, 2000),
          },
          'git smart-HTTP service exited non-zero',
        );
      }
    });
    return child;
  }

  private track(work: Promise<void>): void {
    const settle = async (): Promise<void> => {
      try {
        await work;
      } catch (error) {
        /* Nothing is awaiting this promise but `settled()`, so an unhandled
           rejection here would be the process's problem rather than the
           request's (review F10). */
        this.#logger.warn({ err: error }, 'Background work after a response failed');
      } finally {
        this.#background.delete(tracked);
      }
    };
    const tracked = settle();
    this.#background.add(tracked);
  }

  /**
   * Disposes a fetch's lease once its child has closed, and gives the
   * admission back. A failure here leaks a temporary directory, which is
   * recoverable; failing the response the client already has is not.
   */
  private async disposeAfterFetch(lease: RepositoryLease, release: () => void, projectId: string): Promise<void> {
    await this.disposeQuietly(lease, projectId);
    release();
  }

  /**
   * Disposes a lease and never raises (review F2).
   *
   * Every caller has something more important to do next — give the admission
   * back, or raise the refusal the request actually earned — and a `rm -rf`
   * that hit EBUSY must not take either of those away. What it costs is a
   * temporary directory, which is recoverable; what the alternative cost was is
   * a worker that refuses every later request.
   */
  private async disposeQuietly(lease: RepositoryLease | undefined, projectId: string): Promise<void> {
    try {
      await lease?.dispose();
    } catch (error) {
      this.#logger.warn({ err: error, projectId }, 'Lease disposal failed; its directory is left behind');
    }
  }

  /** Every byte a child wrote to stdout. */
  private async collect(stream: Readable): Promise<Uint8Array<ArrayBuffer>> {
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Resolves when the child has exited, whatever its status.
   *
   * `receive-pack` exits 0 on a push it refused entirely, so its code is never
   * the commit signal — the ref-map difference is (`store/commit.ts`). This
   * only orders the commit after the child.
   */
  private async awaitChild(child: ChildProcessByStdio<Writable, Readable, Readable>): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      child.once('close', () => {
        resolve();
      });
      child.once('error', () => {
        resolve();
      });
    });
  }

  /**
   * Streams the request body into the child, counting what actually arrived.
   *
   * @returns A promise that also carries the running byte count.
   */
  private pipeRequestBody(args: {
    body: Readable;
    child: ChildProcessByStdio<Writable, Readable, Readable>;
    gzipped: boolean;
    service: GitSmartService;
    maximumInputBytes: number;
  }): { done: Promise<void>; counter: { bytes: number } } {
    const counter = { bytes: 0 };
    const ceiling = args.maximumInputBytes;
    const source = args.gzipped ? args.body.pipe(createGunzip()) : args.body;
    source.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      counter.bytes += chunk.byteLength;
      if (ceiling > 0 && counter.bytes > ceiling) {
        source.destroy(new Error(`The request body exceeded ${String(ceiling)} bytes.`));
      }
    });
    const done = (async (): Promise<void> => {
      try {
        await pipeline(source, args.child.stdin);
      } catch (error) {
        this.#logger.warn({ err: error, service: args.service }, 'git smart-HTTP request body failed');
        args.child.kill('SIGKILL');
      }
    })();
    return { done, counter };
  }

  /**
   * Records the manifest generation this worker just committed (D19).
   *
   * Written before derivation and separately from it, which is the whole
   * mechanism: a worker killed between the two leaves `derived_generation`
   * behind the store, and the next request to touch this project repairs it.
   * There is no reconcile job.
   *
   * Idempotent and monotonic. It is not the row that decides whether a repair
   * is owed — the manifest is (see `repairDerivedState`) — so this write only
   * ever carries the column *forward*: a slow writer for generation 5 landing
   * after generation 6 must not rewind the marker.
   */
  private async recordGeneration(projectId: string, generation: number): Promise<void> {
    await this.databaseService.database
      .insert(projectGit)
      .values({ projectId, generation })
      .onConflictDoUpdate({
        target: projectGit.projectId,
        set: { generation, updatedAt: new Date() },
        setWhere: lt(projectGit.generation, generation),
      });
  }

  /**
   * Re-derives everything that follows from a committed manifest (D19).
   *
   * Byte accounting is the manifest's own live pack bytes, so nothing walks a
   * directory to find out how large a repository is any more. Publications and
   * LFS reachability read through the lease that is already open.
   *
   * A failure here is logged and swallowed on purpose. The push is durable by
   * the time this runs, and telling a client its committed push failed is the
   * one lie this path must not tell; the generation mismatch it leaves behind
   * is what the next request repairs.
   */
  private async derive(args: {
    access: GitAccess;
    lease: RepositoryLease;
    manifest: Manifest;
    /** The refs this commit moved, or every ref of the manifest on a repair. */
    moved: readonly MovedRef[];
  }): Promise<void> {
    const { access, manifest } = args;
    const storageBytes = manifest.packs.reduce((total, pack) => total + pack.bytes, 0);
    try {
      const tags = args.moved.flatMap((ref) =>
        ref.ref.startsWith('refs/tags/') && ref.after !== undefined ? [{ ref: ref.ref, oid: ref.after }] : [],
      );
      if (tags.length > 0) {
        await materializePublishedTags(this.materializerDependencies, {
          projectId: access.projectId,
          ownerId: access.ownerId,
          directory: args.lease.directory,
          tags,
        });
      }
      await markLfsReachability(
        { database: this.databaseService.database },
        {
          projectId: access.projectId,
          ownerId: access.ownerId,
          directory: args.lease.directory,
          at: new Date(),
        },
      );
    } catch (error) {
      this.#logger.warn(
        { err: error, projectId: access.projectId, generation: manifest.generation },
        'Derived state could not be rebuilt; the next request for this project repairs it',
      );
      return;
    }

    await this.databaseService.database
      .insert(projectGit)
      .values({
        projectId: access.projectId,
        storageBytes,
        generation: manifest.generation,
        derivedGeneration: manifest.generation,
      })
      .onConflictDoUpdate({
        target: projectGit.projectId,
        set: {
          storageBytes,
          /* `generation` moves with the marker: this row is the proof that the
             store reached this generation, so a repair that runs because
             `recordGeneration` never did must leave the two columns agreeing
             (review F1). */
          generation: manifest.generation,
          derivedGeneration: manifest.generation,
          updatedAt: new Date(),
        },
        /* Compare-and-swap (review F4). A request repairing generation 5 and a
           request committing generation 6 are not ordered by anything, and the
           slower of the two must not take `derived_generation` — and
           `storage_bytes` with it — backwards. */
        setWhere: lt(projectGit.derivedGeneration, manifest.generation),
      });
  }

  /**
   * Repairs derived state a worker that died after its commit left behind (D19).
   *
   * **The manifest decides, never the row** (review F1). The row was the
   * gate here once — `derived_generation >= generation` — and that made the
   * repair blind to the one window it exists for: a worker killed between
   * `commitLease` and `recordGeneration` leaves the store at N+1 and the row
   * at N/N, which reads as "caught up" forever. The tag is durable and
   * advertised, the publication is never materialized, and the LFS objects the
   * push made reachable keep their `unreachable_at` and become eligible for
   * retirement — W4's "no reachable pointer without bytes" broken permanently.
   *
   * This request already hydrated a lease, so it already holds the only
   * authority on what committed. A missing row is generation 0.
   *
   * One row read per git request. On a mismatch the whole derivation is re-run
   * over the lease this request holds, against every tag the manifest names
   * rather than the ref-map difference of a push nobody recorded.
   */
  private async repairDerivedState(access: GitAccess, lease: RepositoryLease): Promise<void> {
    const { manifest } = lease;
    if (manifest === undefined) {
      return;
    }
    const rows = await this.databaseService.database
      .select({
        generation: projectGit.generation,
        derivedGeneration: projectGit.derivedGeneration,
      })
      .from(projectGit)
      .where(eq(projectGit.projectId, access.projectId))
      .limit(1);
    const derivedGeneration = rows[0]?.derivedGeneration ?? 0;
    if (derivedGeneration >= manifest.generation) {
      return;
    }
    this.#logger.log(
      { projectId: access.projectId, generation: manifest.generation, derivedGeneration },
      'Repairing derived state left behind by an interrupted worker',
    );
    await this.derive({
      access,
      lease,
      manifest,
      moved: Object.entries(manifest.refs).map(([ref, value]) => ({ ref, after: value.oid })),
    });
  }

  /**
   * One bounded git invocation whose whole output is wanted.
   *
   * @param args - Arguments after `git`.
   * @param cwd - Where the child runs; also its `HOME`.
   * @param stdin - Written to the child and closed, when given.
   * @returns The child's whole stdout.
   * @throws Error When git exits non-zero.
   */
  private async runGit(args: readonly string[], cwd: string, stdin?: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
      const child = spawn(gitExecutable, [...args], {
        cwd,
        env: childEnvironment(cwd) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: commandTimeoutMilliseconds,
        killSignal: 'SIGKILL',
      });
      const stdout: Array<Uint8Array<ArrayBuffer>> = [];
      const stderr: Array<Uint8Array<ArrayBuffer>> = [];
      child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdout));
          return;
        }
        reject(new Error(`git ${args.join(' ')} exited ${String(code)}: ${Buffer.concat(stderr).toString('utf8')}`));
      });
      if (stdin !== undefined) {
        child.stdin.end(stdin);
      }
    });
  }
}

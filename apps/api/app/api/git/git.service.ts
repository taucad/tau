/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { storageLimitBytesByTier } from '@taucad/billing';
import { assertActiveProjectLocked, assertProjectActive } from '#database/project-lifecycle.js';
import { withOwnerLock, readOwnerUsage } from '#database/owner-lock.js';
import { DatabaseService } from '#database/database.service.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import type { GitOperation, GitReceiptOutcome } from '#telemetry/metrics.js';
import { project, projectDeletion, projectGit, projectGitLfsObject, publication } from '#database/schema.js';
import { ProjectAccessService } from '#api/collaboration/project-access.service.js';
import type { ProjectRole } from '#api/collaboration/project-access.service.js';
import { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import type {
  CommercialEntitlements,
  CommercialEntitlementsService,
} from '#api/entitlements/commercial-entitlements.js';
import { commercialEntitlementsKey } from '#api/entitlements/commercial-entitlements.js';
import {
  hydratesFromOthersPerOwnerPerDay,
  hydratesPerCallerPerDay,
  isRemovableRef,
  quotaRefusalSentence,
  repositoryStoreKey,
} from '#api/git/git.constants.js';
import type { GitService as GitSmartService, QuotaAudience } from '#api/git/git.constants.js';
import { OwnerInFlightGate } from '#api/git/admission/owner-in-flight.js';
import { advertiseReferences } from '#api/git/advertisement.js';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import { developmentPublicKeysJson } from '#api/git/forwarding/contract/development-keys.js';
import { parsePublicKeys } from '#api/git/forwarding/contract/keys.js';
import type { VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import { verifyReceipt } from '#api/git/forwarding/contract/receipt.js';
import type { StorageReceipt } from '#api/git/forwarding/contract/receipt.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import type { GitExecutor, GrantFacts } from '#api/git/forwarding/git-executor.js';
import { memoryReceiptLedger } from '#api/git/forwarding/receipt-ledger.js';
import type { ReceiptLedger } from '#api/git/forwarding/receipt-ledger.js';
import { unconfiguredExecutor } from '#api/git/forwarding/unconfigured-executor.js';
import { refusalCode, refusalFor } from '#api/git/git-refusals.js';
import { resolveLfsObjectLocation } from '#api/git/lfs-keys.js';
import { copyPendingOnAdvance } from '#api/git/mirror/watermark.js';
import { writeLfsReachability } from '#api/git/lfs-reachability-marks.js';
import { RepositoryRouteGuard } from '#api/git/routing/route-guard.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { decodeManifest, isTombstoned, onlyCompactedSince } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { materializePublishedTags } from '#api/publications/publication-materializer.js';
import type { GitChildRunner, MaterializerDependencies } from '#api/publications/publication-materializer.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

/**
 * The Tau Hosted Remote's request path in tau-api (charter D1, D3, D4; north
 * star DC1).
 *
 * The API authorizes, budgets and accounts; it no longer executes git. Every
 * RPC is forwarded to tau-storage under a grant that carries the facts the
 * worker needs (Z1), and every commit or repair comes back as a receipt the
 * API checks against the manifest it re-reads with its own credential before
 * it changes a row. The API holds no lease, no `git` child and no lease disk:
 * its container runs with a read-only root and no tmpfs. The ref
 * advertisement reads the manifest alone (DB1).
 */

/** One pkt-line flush: the body `git push` authenticates a chunked push with. */
const flushPacketBytes = 4;

/** The caller a derived-state repair is made as: nobody's account, and nobody's hydrate budget. */
const derivedStateCaller = 'system:derived-state';

/** A read lease the publication materializer holds through tau-storage (until DC3). */
export type ReadLease = {
  /** An opaque handle the materializer's git runner ({@link GitRepositoryService.leaseGit}) resolves. */
  readonly directory: string;
  readonly locator: RepositoryLocator;
  /** The manifest the reads are pinned to. `undefined` is generation 0. */
  readonly manifest: Manifest | undefined;
};

/** How the API checks receipts: tau-storage's verification keys and the applied-receipt ledger. */
export type ReceiptVerification = {
  readonly keys: VerificationKeys;
  readonly ledger: ReceiptLedger;
};

/** Injection token for {@link ReceiptVerification}. */
export const receiptVerificationKey = Symbol('ReceiptVerification');

/** What a process outside production checks receipts with when nothing is bound: the development key. */
const developmentReceiptVerification = (): ReceiptVerification => ({
  keys: parsePublicKeys(developmentPublicKeysJson('receipt'), 'TAU_STORAGE_RECEIPT_PUBLIC_KEYS'),
  ledger: memoryReceiptLedger(),
});

/** How long tau-api trusts the git dialect tau-storage last named. */
const dialectTtlMilliseconds = 5 * 60_000;

/** Runs `release` at most once, however many paths reach it. */
const once = (release: () => void): (() => void) => {
  let released = false;
  return () => {
    if (!released) {
      released = true;
      release();
    }
  };
};

/** SHA-256 of a manifest's stored bytes, as a receipt names it. */
const digestOf = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** What `authorize` resolved for one request. */
export type GitAccess = {
  readonly projectId: string;
  /** The tenant whose prefix, plan and bill the bytes land on — never the pusher (D27). */
  readonly ownerId: string;
  /** What the authenticated caller may do with this project. */
  readonly role: ProjectRole;
  /**
   * Who is asking: the authenticated user, a cloud host (`device:<id>`, never
   * its owner's id — RV-W10 F1), or a named system caller such as a
   * publication viewer's repair. Keys the hydrate budgets, so an owner's own
   * reads are never spent by anybody else (D22).
   */
  readonly callerId: string;
  /**
   * The cloud host this request came through (D21), as the git transport
   * resolved it; absent for the account's own request. Recorded as the push's
   * `viaDevice` (EQ11), and it holds the caller at `write` whatever the
   * owner's own role is (I10).
   */
  readonly viaDevice?: string;
  /** Bytes this project may still add before the plan allowance is spent. */
  readonly remainingBytes: number;
  /** The owner's complete plan allowance, used by serialized write admission. */
  readonly storageLimitBytes: number;
  /**
   * Who a quota refusal speaks to (D17), resolved with the plan on a write;
   * absent on a read, which is never refused for storage.
   */
  readonly quotaAudience?: QuotaAudience;
};

/**
 * The allowance an owner's plan grants on the Hosted Remote (D16): nothing
 * without `canSyncFiles`, otherwise the entitlement's own figure (self-host,
 * an Enterprise override) or the tier's.
 *
 * @param entitlements - The owner's commercial entitlements.
 * @returns The allowance in bytes.
 */
const storageLimitOf = (entitlements: CommercialEntitlements): number =>
  entitlements.canSyncFiles
    ? (entitlements.storageLimitBytes ??
      (entitlements.tier === undefined ? storageLimitBytesByTier.pro : storageLimitBytesByTier[entitlements.tier]))
    : 0;

/** A publication a ref removal would leave without its named version (D24). */
export type AffectedPublication = {
  readonly id: string;
  readonly title: string;
  readonly visibility: string;
};

/**
 * Whether `manifest` is `receipt`'s generation with only deferred compactions
 * after it ({@link onlyCompactedSince}) and still holds every ref where the
 * receipt says it moved it — so what the receipt derived from its generation
 * is true of `manifest`.
 */
const compactedOver = (receipt: StorageReceipt, manifest: Manifest): boolean =>
  onlyCompactedSince(manifest, receipt) &&
  receipt.movedRefs.every((moved) => manifest.refs[moved.ref]?.oid === moved.after);

/**
 * What the removal verb answered (D24): a live publication to show the owner
 * before anything changes, or the ref it removed with the tip it held and the
 * publication it retired.
 */
export type RefRemoval =
  | { readonly outcome: 'confirm'; readonly publication: AffectedPublication }
  | {
      readonly outcome: 'removed';
      readonly ref: string;
      readonly tip: string;
      readonly publication?: AffectedPublication;
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

@Injectable()
export class GitRepositoryService {
  readonly #logger = new Logger(GitRepositoryService.name);

  /**
   * Work a request started that outlives its response: the D13 announcement.
   * Held in a set rather than fired and forgotten, so a failure has somewhere
   * to be logged and a caller can wait for it.
   */
  readonly #background = new Set<Promise<void>>();

  /** The read leases open now, by handle: the grant facts and the generation each is pinned to. */
  readonly #readLeases = new Map<string, { readonly facts: GrantFacts; readonly generation: number }>();

  /** The git dialect tau-storage last named, and when it was asked; see {@link storageDialect}. */
  #dialect: { readonly at: number; readonly dialect: Promise<AdvertisementDialect> } | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    @Inject(commercialEntitlementsKey)
    private readonly entitlementsService: CommercialEntitlementsService,
    private readonly storage: ObjectStorageService,
    private readonly projectAccess: ProjectAccessService,
    @Inject(repositoryStoreKey)
    private readonly store: RepositoryStore,
    private readonly rateLimiter: PublicationRateLimiterService,
    private readonly durableEvents: DurableEventsService,
    @Optional() private readonly shutdown: ShutdownService = new ShutdownService(),
    @Optional() private readonly metrics: MetricsService = new MetricsService(),
    /* DW1/DW2: holds a frozen repository's requests before any grant; open outside the module. */
    @Optional() private readonly routes: RepositoryRouteGuard = RepositoryRouteGuard.open(),
    /* DC1: the boot-time git execution (`forwarding/git-execution.ts`). Unbound outside the module, every RPC answers 503. */
    @Optional() @Inject(gitExecutorKey) private readonly executor: GitExecutor = unconfiguredExecutor(),
    @Optional()
    @Inject(receiptVerificationKey)
    private readonly receipts: ReceiptVerification = developmentReceiptVerification(),
    /* DA6: the owner's in-flight cap (10 requests, 5 pushes), taken before a grant is minted; open outside the module. */
    @Optional() private readonly owners: OwnerInFlightGate = OwnerInFlightGate.open(),
  ) {}

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
    /** The cloud host the owner's request came through (D21), when it did. */
    viaDevice?: string | undefined;
  }): Promise<GitAccess> {
    await assertProjectActive(this.databaseService.database, args.projectId, args.userId);
    const access = await this.projectAccess.authorize(
      args.projectId,
      args.userId,
      args.mode === 'read' ? 'read' : 'write',
    );
    const caller =
      args.viaDevice === undefined
        ? { role: access.role, callerId: args.userId }
        : ({
            role: 'write',
            callerId: `device:${args.viaDevice}`,
            viaDevice: args.viaDevice,
          } satisfies Pick<GitAccess, 'role' | 'callerId' | 'viaDevice'>);

    if (args.mode === 'read') {
      return {
        projectId: args.projectId,
        ownerId: access.ownerId,
        ...caller,
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

    const limit = storageLimitOf(entitlements);
    /* D17: the account's own relationship, not the request's — a cloud host
       pushes as its owner's device, and its refusal is the owner's to act on.
       A self-host build has no tier and nothing to sell, so it is the top. */
    const quotaAudience: QuotaAudience =
      access.role === 'owner'
        ? entitlements.tier === undefined || entitlements.tier === 'enterprise'
          ? 'ownerAtTopTier'
          : 'owner'
        : 'collaborator';
    const usage = await this.readOwnerUsage(access.ownerId);
    const remainingBytes = Math.max(0, limit - usage.storageBytes - usage.lfsBytes);
    if (args.mode === 'write' && remainingBytes === 0) {
      throw new PayloadTooLargeException({
        code: 'GIT_QUOTA_EXCEEDED',
        message: quotaRefusalSentence(quotaAudience, limit),
      });
    }

    return {
      projectId: args.projectId,
      ownerId: access.ownerId,
      ...caller,
      remainingBytes,
      storageLimitBytes: limit,
      quotaAudience,
    };
  }

  /**
   * What an owner's account stores against its plan (D18): the figures the Sync
   * region renders and a later `413` quotes, from the same accounting and the
   * same allowance `authorize` enforces.
   *
   * @param ownerId - The account whose allowance is asked about.
   * @returns Live pack bytes, LFS bytes, retained bytes (never charged) and the allowance, all account-wide.
   */
  public async readStorageAllowance(
    ownerId: string,
  ): Promise<{ storageBytes: number; lfsBytes: number; retainedBytes: number; storageLimitBytes: number }> {
    const [entitlements, usage] = await Promise.all([
      this.entitlementsService.getEntitlements(ownerId),
      this.readOwnerUsage(ownerId),
    ]);
    return { ...usage, storageLimitBytes: storageLimitOf(entitlements) };
  }

  /**
   * Account-wide usage; one plan allowance is shared by all owned projects.
   * `retainedBytes` is reported beside it and never charged (D18).
   */
  public async readOwnerUsage(
    ownerId: string,
  ): Promise<{ storageBytes: number; lfsBytes: number; retainedBytes: number }> {
    const rows = await this.databaseService.database
      .select({
        storageBytes: sql<number>`coalesce(sum(case when ${projectDeletion.deletedAt} is null then ${projectGit.storageBytes} else 0 end), 0)`,
        lfsBytes: sql<number>`coalesce(sum(case when ${projectDeletion.deletedAt} is null then ${projectGit.lfsBytes} else 0 end), 0)`,
        retainedBytes: sql<number>`coalesce(sum(case when ${projectDeletion.deletedAt} is null then ${projectGit.retainedBytes} else ${projectDeletion.retainedBytes} end), 0)`,
      })
      .from(project)
      .leftJoin(projectGit, eq(projectGit.projectId, project.id))
      .leftJoin(projectDeletion, eq(projectDeletion.projectId, project.id))
      .where(eq(project.ownerId, ownerId));
    const [row] = rows;
    return {
      storageBytes: Number(row?.storageBytes ?? 0),
      lfsBytes: Number(row?.lfsBytes ?? 0),
      retainedBytes: Number(row?.retainedBytes ?? 0),
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
      await assertActiveProjectLocked(
        transaction,
        args.access.projectId,
        args.access.viaDevice === undefined ? args.access.callerId : args.access.ownerId,
      );
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
      const usage = await readOwnerUsage(transaction, args.access.ownerId);
      const usedBytes = usage.storageBytes + usage.lfsBytes;
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
      if (requested.length > 0) {
        await transaction
          .update(projectGitLfsObject)
          .set({ lastRequestedAt: new Date(), unreachableAt: null })
          .where(
            and(
              eq(projectGitLfsObject.projectId, args.access.projectId),
              inArray(
                projectGitLfsObject.oid,
                requested.map((object) => object.oid),
              ),
            ),
          );
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
    /** Short identity re-check under the retirement lock, after hashing outside the transaction. */
    verifyContent: () => Promise<boolean>;
  }): Promise<'finalized' | 'already-finalized' | 'unreserved' | 'invalid'> {
    return this.databaseService.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${args.access.ownerId}, 0))`);
      await assertActiveProjectLocked(
        transaction,
        args.access.projectId,
        args.access.viaDevice === undefined ? args.access.callerId : args.access.ownerId,
      );
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
      if (!(await args.verifyContent())) {
        return 'invalid';
      }
      await transaction
        .update(projectGitLfsObject)
        .set({ finalizedAt: row.finalizedAt ?? new Date(), unreachableAt: null })
        .where(and(eq(projectGitLfsObject.projectId, args.access.projectId), eq(projectGitLfsObject.oid, args.oid)));
      return row.finalizedAt === null ? 'finalized' : 'already-finalized';
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
   * A read lease over this project's repository, held through tau-storage, for
   * the publication materializer and the publish path (until DC3 moves both
   * to tau-storage).
   *
   * The lease is a handle, not a directory: every git command the work runs
   * through {@link leaseGit} becomes one `git-read` naming the handle as its
   * session, pinned to the generation of the manifest read here. The worker
   * hydrates one lease for the session and runs every command over it, so a
   * materialization costs one hydrate and a push landing between two of its
   * commands moves nothing they read (review S1); a lease hydrated past that
   * generation answers `409` rather than mixing two revisions. In process
   * that is always one lease; forwarded, Fly may spread a session's commands
   * over workers, each of which then holds its own. The session ends with the
   * work. The hydrate budget of whoever asked is spent once, here, as it was
   * for the lease this replaces (D22).
   *
   * @param access - What `authorize` resolved.
   * @param work - What to do with the lease.
   * @param options - `spendBudget: false` for derived-state repair, which is nobody's read.
   * @returns Whatever `work` returned.
   */
  public async withLease<T>(
    access: GitAccess,
    work: (lease: ReadLease) => Promise<T>,
    options: { readonly spendBudget?: boolean } = {},
  ): Promise<T> {
    const routed = await this.routes.admit(access.projectId);
    const handle = `tau-storage-lease:${randomUUID()}`;
    let facts: GrantFacts | undefined;
    try {
      const locator = await this.resolveActiveLocator(access);
      const manifest = await this.readLiveManifest(locator);
      if (options.spendBudget !== false) {
        await this.spendHydrate(access, 'derive');
      }
      facts = await this.grantFacts(access, { committedBy: access.callerId, authoritative: false });
      this.#readLeases.set(handle, { facts, generation: manifest?.generation ?? 0 });
      return await work({ directory: handle, locator, manifest });
    } catch (error) {
      throw refusalFor(error, this.#logger);
    } finally {
      this.#readLeases.delete(handle);
      if (facts !== undefined) {
        /* Best effort: a lost end leaves the worker's idle timer to dispose the lease. */
        await this.executor.endRead(facts, handle).catch((error: unknown) => {
          this.#logger.warn({ err: error, projectId: access.projectId }, 'A read session could not be ended');
        });
      }
      routed();
    }
  }

  /**
   * The publication materializer's git runner over a {@link withLease} handle:
   * one read-only `git-read` per command, all in the handle's session.
   */
  public readonly leaseGit: GitChildRunner = async (directory, args, stdin) => {
    const held = this.#readLeases.get(directory);
    if (held === undefined) {
      throw new Error('No read lease is open at this handle');
    }
    return this.executor.gitRead(held.facts, {
      args,
      ...(stdin === undefined ? {} : { stdin }),
      generation: held.generation,
      session: directory,
    });
  };

  /**
   * `info/refs?service=…`: the ref advertisement, answered from the manifest
   * (Hosted Remote Storage DB1).
   *
   * No lease: no admission, no lease disk, no hydrate budget and no git child,
   * so the first leg of every push and fetch can no longer be refused for this
   * Machine's capacity (TAU-API-5). The project's admission and storage account
   * are checked as for any request, and the one manifest read is the whole
   * object-store cost. The bytes are stock git's over the lease that manifest
   * hydrates (`advertisement.ts`).
   *
   * Derived-state repair (D19) is not done here. Every grant carries the
   * derived generation this API recorded, so the RPC that follows this
   * advertisement repairs a repository whose row trails its manifest (FR5,
   * DC1), and the scheduler repairs an idle one.
   *
   * The route step still applies (DW1/DW2): a frozen repository is held, then
   * answered `429 GIT_REPOSITORY_FROZEN`, before its manifest is read, and a
   * served advertisement counts in flight until it answers, so a drain waits
   * for it like any leased request.
   *
   * @param access - What `authorize` resolved.
   * @param service - The service the client named.
   * @returns The advertisement bytes, without the service prefix.
   * @throws HttpException `429 GIT_REPOSITORY_FROZEN` when the freeze hold is spent, or `429 GIT_OWNER_IN_FLIGHT_LIMIT` over the owner's in-flight cap (DA6).
   */
  public async advertiseRefs(access: GitAccess, service: GitSmartService): Promise<Uint8Array<ArrayBuffer>> {
    const routed = await this.routes.admit(access.projectId);
    let owned: () => void = () => undefined;
    try {
      /* DA6: after the route step, so a held request holds no owner slot; before the manifest read. */
      owned = await this.owners.admit({ ownerId: access.ownerId, operation: 'advertise' });
      const locator = await this.resolveActiveLocator(access);
      const read = await this.store.readManifest(locator);
      const manifest = read === undefined ? undefined : decodeManifest(read.manifest);
      if (isTombstoned(manifest)) {
        throw new RepositoryStoreError(
          'tombstoned',
          `repository ${locator.projectId} is tombstoned and advertises no refs`,
        );
      }
      return advertiseReferences({ service, refs: manifest?.refs ?? {}, dialect: await this.storageDialect() });
    } catch (error) {
      throw refusalFor(error, this.#logger);
    } finally {
      owned();
      routed();
    }
  }

  /**
   * `git-upload-pack`: a read, forwarded to tau-storage.
   *
   * The pack streams from tau-storage to the client without being buffered
   * here, and the request holds its route and owner slots until the stream
   * closes. A repair receipt riding on the response — tau-storage found the
   * manifest ahead of the generation this API recorded (FR5) — is applied
   * before the first byte is relayed, as the lease-side repair was.
   *
   * @param args - The access, the request body and the client's abort signal.
   * @returns The stream the response is written from.
   */
  public async uploadPack(args: {
    access: GitAccess;
    body: Readable;
    gzipped: boolean;
    abort?: AbortSignal;
  }): Promise<Readable> {
    const { access } = args;
    const release = await this.admitRpc(access, 'upload_pack');
    try {
      const facts = await this.grantFacts(access, { committedBy: access.callerId, authoritative: false });
      await this.spendHydrate(access, 'upload_pack');
      const { output, receipt } = await this.executor.uploadPack(facts, {
        body: args.body,
        gzipped: args.gzipped,
        ...(args.abort === undefined ? {} : { abort: args.abort }),
      });
      /* The slot is held until the pack has been relayed; `release` runs once. */
      output.once('end', release);
      output.once('close', release);
      await this.applyReceipt(receipt, access);
      return output;
    } catch (error) {
      release();
      throw refusalFor(error, this.#logger);
    }
  }

  /**
   * `git-receive-pack`: a push, forwarded to tau-storage.
   *
   * tau-storage withholds git's report-status until `commitLease` resolves
   * (D4, NI2), and this API relays it only once the receipt is applied, so a
   * client that reads `ok refs/heads/main` finds the generation, the
   * announcement and the derived state already behind it, as before. That
   * holds when tau-storage's deferred compaction of this push committed
   * before the receipt was applied: the receipt is then applied against the
   * compacted manifest ({@link applyReceipt}).
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
    abort?: AbortSignal;
  }): Promise<Uint8Array<ArrayBuffer>> {
    const { access } = args;
    const release = await this.admitRpc(access, 'receive_pack');
    try {
      const facts = await this.grantFacts(access, { committedBy: args.committedBy, authoritative: true });
      await this.spendHydrate(access, 'receive_pack');
      const result = await this.forwardWrite(access, async () =>
        this.executor.receivePack(facts, {
          body: args.body,
          gzipped: args.gzipped,
          ...(args.abort === undefined ? {} : { abort: args.abort }),
        }),
      );
      if (result.bodyBytes > flushPacketBytes || result.receipt !== undefined) {
        await this.applyReceipt(result.receipt, access);
      }
      return result.report;
    } catch (error) {
      throw refusalFor(error, this.#logger);
    } finally {
      release();
    }
  }

  /**
   * The audited ref-removal verb (D24, charter I2).
   *
   * The push hook refuses every deletion, so this is the only way a ref ever
   * leaves the Hosted Remote, and it is the owner's alone. It removes a named
   * version (`refs/tags/*`) or a conflict line (`refs/heads/conflicts/*`, D14),
   * the latter being how an owner clears an abandoned line another device left.
   *
   * A named version a live publication points at is answered `confirm` with
   * that publication until the caller names it back as `confirmPublicationId`,
   * so the person sees what the removal affects before anything changes. A
   * confirmed removal retires that publication in the same step: it is marked
   * unpublished, so it stops serving and a later push that re-creates the name
   * does not bring it back (`materializePublishedTags` skips it). Publishing it
   * again is the owner's explicit act.
   *
   * The decision and the retirement run inside one transaction holding the
   * project's publication lock, and the transaction commits only once
   * tau-storage answered that the removal's manifest commit landed (DC1): a
   * publish cannot land between the check and the removal, and a failed
   * commit rolls the retirement back. tau-storage refuses the removal if the
   * ref no longer holds the tip read here. The appended attribution record
   * (EQ11), carrying the ref without a tip, plus the log line, is the audit.
   *
   * @param args - The access, the ref, the authenticated caller and the publication they confirmed.
   * @returns `confirm` with the publication to show, or `removed` with the tip it held.
   * @throws ForbiddenException When the caller is not the owner.
   * @throws BadRequestException When the ref is not a named version or a conflict line.
   * @throws NotFoundException When the repository holds no such ref.
   */
  public async removeRef(args: {
    access: GitAccess;
    ref: string;
    committedBy: string;
    confirmPublicationId?: string;
  }): Promise<RefRemoval> {
    const { access, ref } = args;
    if (access.role !== 'owner') {
      throw new ForbiddenException({
        code: 'GIT_REF_REMOVAL_OWNER_ONLY',
        message: 'Only the project’s owner can remove a named version or a conflict line.',
      });
    }
    if (!isRemovableRef(ref)) {
      throw new BadRequestException({
        code: 'GIT_REF_NOT_REMOVABLE',
        message: 'Only a named version (refs/tags/*) or a conflict line (refs/heads/conflicts/*) can be removed.',
      });
    }
    const tag = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : undefined;

    const release = await this.admitRpc(access, 'remove_ref');
    let removal: RefRemoval;
    try {
      const locator = await this.resolveActiveLocator(access);
      const live = await this.readLiveManifest(locator);
      const held = live?.refs[ref]?.oid;
      if (held === undefined) {
        throw new NotFoundException({ code: 'GIT_REF_NOT_FOUND', message: `This repository has no ${ref}.` });
      }
      /* The push's stop gate: a removal that has not started when the process
         begins to stop is refused before it retires a publication. */
      this.refuseWhenStopping('This server is restarting; retry the removal.');
      const facts = await this.grantFacts(access, { committedBy: args.committedBy, authoritative: true });
      await this.spendHydrate(access, 'remove_ref');
      const decided = await this.databaseService.database.transaction(async (transaction) => {
        await assertActiveProjectLocked(
          transaction,
          access.projectId,
          access.viaDevice === undefined ? access.callerId : access.ownerId,
        );
        const [affected] =
          tag === undefined
            ? []
            : await transaction
                .select({ id: publication.id, title: publication.title, visibility: publication.visibility })
                .from(publication)
                .where(
                  and(
                    eq(publication.projectId, access.projectId),
                    eq(publication.tag, tag),
                    isNull(publication.unpublishedAt),
                  ),
                );
        if (affected !== undefined && affected.id !== args.confirmPublicationId) {
          return { outcome: 'confirm', publication: affected } as const;
        }
        if (affected !== undefined) {
          await transaction
            .update(publication)
            .set({ unpublishedAt: new Date() })
            .where(eq(publication.id, affected.id));
        }
        const removed = await this.forwardWrite(access, async () =>
          this.executor.removeRef({ ...facts, ref, tip: held }),
        );
        return { outcome: 'removed', removed, affected } as const;
      });
      if (decided.outcome === 'confirm') {
        removal = decided;
      } else {
        await this.applyReceipt(decided.removed.receipt, access);
        removal = {
          outcome: 'removed',
          ref,
          tip: held,
          ...(decided.affected === undefined ? {} : { publication: decided.affected }),
        };
      }
    } catch (error) {
      throw refusalFor(error, this.#logger);
    } finally {
      release();
    }
    if (removal.outcome === 'removed') {
      this.#logger.log(
        { projectId: access.projectId, ref, tip: removal.tip, by: args.committedBy, retired: removal.publication?.id },
        'Removed a ref through the audited verb',
      );
    }
    return removal;
  }

  /**
   * Repairs one project's derived state with no client waiting (FR5; the
   * scheduler in `forwarding/derive-scheduler.ts`): a `derive` grant, whose
   * receipt is applied like any other. Nobody's hydrate budget is spent.
   *
   * @param target - The project and its owner.
   * @returns The receipt's outcome, or `undefined` when tau-storage found nothing owed.
   */
  public async repairDerivedState(target: {
    readonly projectId: string;
    readonly ownerId: string;
  }): Promise<GitReceiptOutcome | undefined> {
    const access: GitAccess = {
      projectId: target.projectId,
      ownerId: target.ownerId,
      role: 'owner',
      callerId: derivedStateCaller,
      remainingBytes: 0,
      storageLimitBytes: 0,
    };
    const routed = await this.routes.admit(access.projectId);
    try {
      await this.resolveActiveLocator(access);
      const facts = await this.grantFacts(access, { committedBy: derivedStateCaller, authoritative: false });
      const { receipt } = await this.executor.derive(facts);
      return await this.applyReceipt(receipt, access);
    } catch (error) {
      throw refusalFor(error, this.#logger);
    } finally {
      routed();
    }
  }

  /**
   * Applies a receipt tau-storage signed (DC1; W9 Finding 2, "Receipt").
   *
   * In order, and nothing changes until every check passed: the signature
   * under a known `kid` and the receipt's age; the owner and project the
   * request was for (a posted receipt: the project's own owner); then the
   * manifest, re-read here with this API's own read credential, whose SHA-256,
   * generation and incarnation must equal the receipt's. A `retained` receipt,
   * known only after a sweep, needs the same incarnation and a manifest at or
   * past its generation. A `commit` or `repair` receipt whose generation only
   * deferred compactions followed is checked against the push records instead
   * and applied to the compacted manifest. Only then is the `(rid, kind)` claimed in the shared
   * ledger, so a replay to any API Machine changes no row, and the derived
   * state written: the generation, the D13 announcement, the publications the
   * manifest's tags leave stale, the LFS reachability marks from the receipt's
   * whole walk, and the derived generation with the accounting.
   *
   * A receipt that fails is counted and dropped, never raised: the push it
   * follows is durable, and the next grant's `recordedGeneration` repairs what
   * it did not say. A ledger that cannot be reached is logged as an error and
   * counted `ledger_unavailable`. In process the ledger is this process's
   * memory, so derived state never waits on Redis (review S4).
   *
   * @param token - The receipt, if one came back.
   * @param expected - The request's owner and project; omitted for a posted receipt.
   * @returns The outcome, or `undefined` when there was no receipt.
   */
  public async applyReceipt(
    token: string | undefined,
    expected?: Pick<GitAccess, 'ownerId' | 'projectId'>,
  ): Promise<GitReceiptOutcome | undefined> {
    if (token === undefined) {
      return undefined;
    }
    const outcome = await this.checkAndApplyReceipt(token, expected).catch((error: unknown) => {
      this.#logger.warn({ err: error }, 'A storage receipt could not be applied; the next request repairs it');
      const rejected: GitReceiptOutcome = 'rejected';
      return rejected;
    });
    this.metrics.gitReceipts.add(1, { outcome });
    return outcome;
  }

  /** Waits for the work a finished request left running. */
  public async settled(): Promise<void> {
    await Promise.all(this.#background);
  }

  /** Resolves current admission and the persisted account before any repository or LFS bytes are touched. */
  public async resolveActiveLocator(access: GitAccess): Promise<RepositoryLocator> {
    await assertProjectActive(
      this.databaseService.database,
      access.projectId,
      access.viaDevice === undefined ? access.callerId : access.ownerId,
    );
    const [row] = await this.databaseService.database
      .select({ storageAccountId: project.storageAccountId })
      .from(project)
      .where(and(eq(project.id, access.projectId), eq(project.ownerId, access.ownerId)))
      .limit(1);
    if (row === undefined) {
      throw new NotFoundException('Project not found');
    }
    // No fallback: a foreign locator must never read or write the default account.
    if (row.storageAccountId !== null && row.storageAccountId !== this.storage.account.id) {
      throw new ServiceUnavailableException('This project’s storage account is unavailable.');
    }
    return repositoryLocator({
      ownerId: access.ownerId,
      projectId: access.projectId,
      ...(row.storageAccountId === null ? {} : { accountId: row.storageAccountId }),
    });
  }

  /**
   * What the publication materializer needs from this service: the database,
   * the storage driver, and git over a {@link withLease} handle.
   */
  public get materializerDependencies(): MaterializerDependencies {
    return {
      databaseService: this.databaseService,
      storage: this.storage,
      git: this.leaseGit,
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

  private async checkAndApplyReceipt(
    token: string,
    expected: Pick<GitAccess, 'ownerId' | 'projectId'> | undefined,
  ): Promise<GitReceiptOutcome> {
    const verified = verifyReceipt(token, { keys: this.receipts.keys });
    if (!verified.ok) {
      this.#logger.warn({ reason: verified.reason }, 'A storage receipt was refused');
      return 'rejected';
    }
    const { receipt } = verified;
    if (expected === undefined) {
      const [row] = await this.databaseService.database
        .select({ ownerId: project.ownerId })
        .from(project)
        .where(eq(project.id, receipt.project))
        .limit(1);
      if (row?.ownerId !== receipt.owner) {
        this.#logger.warn({ projectId: receipt.project }, 'A posted storage receipt named another owner');
        return 'rejected';
      }
    } else if (receipt.owner !== expected.ownerId || receipt.project !== expected.projectId) {
      this.#logger.warn({ projectId: expected.projectId }, 'A storage receipt named another repository');
      return 'rejected';
    }

    const read = await this.store.readManifest(
      repositoryLocator({ ownerId: receipt.owner, projectId: receipt.project }),
    );
    if (read === undefined) {
      return 'manifest_mismatch';
    }
    const manifest = decodeManifest(read.manifest);
    if (manifest.incarnation !== receipt.incarnation) {
      return 'manifest_mismatch';
    }
    if (receipt.kind === 'retained') {
      if (manifest.generation < receipt.generation) {
        return 'manifest_mismatch';
      }
    } else if (digestOf(read.manifest) !== receipt.manifestSha256 || manifest.generation !== receipt.generation) {
      if (manifest.generation <= receipt.generation) {
        return 'manifest_mismatch';
      }
      /* A later commit already moved the manifest on. When that is only
         tau-storage's deferred compactions, which move no ref, nothing else
         will say what this receipt says — the compaction's own receipt names
         no moved ref, and may never arrive — so it is applied against the
         compacted manifest. Any other later commit says everything this one
         would, so this one is stale rather than forged. */
      if (!compactedOver(receipt, manifest)) {
        return 'stale';
      }
    }

    let claimed: boolean;
    try {
      claimed = await this.receipts.ledger.claim(receipt.rid, receipt.kind);
    } catch (error) {
      /* Loud, not silent (review S4): nothing is derived until the scheduler's
         repair or the next grant, so the outage is an error and its own count. */
      this.#logger.error(
        { err: error, projectId: receipt.project, generation: receipt.generation, kind: receipt.kind },
        'The receipt ledger is unavailable; derived state waits for a repair',
      );
      return 'ledger_unavailable';
    }
    if (!claimed) {
      return 'duplicate';
    }
    try {
      if (receipt.kind === 'retained') {
        await this.recordRetainedBytes(receipt);
      } else {
        await this.recordGenerationQuietly(receipt.project, manifest.generation);
        await this.derive(receipt, manifest);
      }
    } catch (error) {
      await this.receipts.ledger.release(receipt.rid, receipt.kind).catch(() => undefined);
      throw error;
    }
    return 'applied';
  }

  /** The retired bytes a sweep kept (D18), as its listing saw them. */
  private async recordRetainedBytes(receipt: StorageReceipt): Promise<void> {
    const { retainedBytes } = receipt;
    if (retainedBytes === undefined) {
      return;
    }
    await this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, receipt.project);
      await transaction.update(projectGit).set({ retainedBytes }).where(eq(projectGit.projectId, receipt.project));
    });
  }

  /** {@link recordGeneration}, logged rather than raised: the commit it follows is durable. */
  private async recordGenerationQuietly(projectId: string, generation: number): Promise<void> {
    try {
      await this.recordGeneration(projectId, generation);
    } catch (error) {
      this.#logger.warn(
        { err: error, projectId, generation },
        'A committed manifest could not record its generation; the next request repairs it',
      );
    }
  }

  /**
   * Holds the route and owner steps for one forwarded RPC (DW1/DW2, DA6).
   *
   * @returns The release, which every path must call; it runs once.
   * @throws HttpException `429 GIT_REPOSITORY_FROZEN` when the freeze hold is spent, or `429 GIT_OWNER_IN_FLIGHT_LIMIT` over the owner's in-flight cap (DA6).
   */
  private async admitRpc(access: GitAccess, operation: GitOperation): Promise<() => void> {
    /* An API Machine that is stopping takes no new RPC, so its drain is only what it already forwarded. */
    this.refuseWhenStopping('The repository service is restarting; retry shortly.');
    const routed = await this.routes.admit(access.projectId);
    try {
      /* DA6: after the route step, so a held request holds no owner slot, and before a grant is minted. */
      const owned = await this.owners.admit({ ownerId: access.ownerId, operation });
      return once(() => {
        owned();
        routed();
      });
    } catch (error) {
      routed();
      throw error;
    }
  }

  /**
   * The facts a grant carries (Z1): whose repository, who is asking, what the
   * plan allows, the quota sentence, the derived generation this API recorded
   * (FR5) and the route, read past the cache for a write (FR13).
   */
  private async grantFacts(
    access: GitAccess,
    args: { readonly committedBy: string; readonly authoritative: boolean },
  ): Promise<GrantFacts> {
    const [route, [row]] = await Promise.all([
      this.routes.grantRoute(access.projectId, args.authoritative),
      this.databaseService.database
        .select({ derivedGeneration: projectGit.derivedGeneration })
        .from(projectGit)
        .where(eq(projectGit.projectId, access.projectId))
        .limit(1),
    ]);
    return {
      owner: access.ownerId,
      project: access.projectId,
      callerId: access.callerId,
      committedBy: args.committedBy,
      ...(access.viaDevice === undefined ? {} : { viaDevice: access.viaDevice }),
      remainingBytes: access.remainingBytes,
      storageLimitBytes: access.storageLimitBytes,
      ...(access.quotaAudience === undefined
        ? {}
        : { quotaSentence: quotaRefusalSentence(access.quotaAudience, access.storageLimitBytes) }),
      recordedGeneration: row?.derivedGeneration ?? 0,
      route,
    };
  }

  /**
   * Runs a write on tau-storage, answering a race lost to a freeze's fence
   * with the freeze answer rather than the `503` a lost race is (DW2).
   */
  private async forwardWrite<T>(access: GitAccess, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (refusalCode(error) === 'GIT_PUSH_RACE_LOST') {
        throw (await this.routes.refusalForLostRace(access.projectId)) ?? error;
      }
      throw error;
    }
  }

  /** The manifest of a live repository; a tombstoned one is refused. */
  private async readLiveManifest(locator: RepositoryLocator): Promise<Manifest | undefined> {
    const read = await this.store.readManifest(locator);
    const manifest = read === undefined ? undefined : decodeManifest(read.manifest);
    if (isTombstoned(manifest)) {
      throw new RepositoryStoreError('tombstoned', `repository ${locator.projectId} is tombstoned`);
    }
    return manifest;
  }

  /**
   * Refuses work that has not started once the process begins to stop
   * (503 `GIT_SERVICE_RESTARTING`).
   *
   * @param message - What the client is told to retry.
   */
  /**
   * The dialect of tau-storage's git (DB1, DC1), asked at most every five
   * minutes, so an image that changes the pinned git is followed without an
   * API restart; a failed answer is not kept.
   */
  private async storageDialect(): Promise<AdvertisementDialect> {
    const now = Date.now();
    if (this.#dialect === undefined || now - this.#dialect.at > dialectTtlMilliseconds) {
      this.#dialect = { at: now, dialect: this.executor.dialect() };
    }
    const held = this.#dialect;
    try {
      return await held.dialect;
    } catch (error) {
      if (this.#dialect === held) {
        this.#dialect = undefined;
      }
      throw error;
    }
  }

  private refuseWhenStopping(message: string): void {
    if (this.shutdown.signal.aborted) {
      throw new ServiceUnavailableException({ code: 'GIT_SERVICE_RESTARTING', message });
    }
  }

  /**
   * Runs `work` after the reply, held where `settled()` and the shutdown
   * registry both see it.
   */
  private track(work: Promise<void>): void {
    const settle = async (): Promise<void> => {
      try {
        await work;
      } catch (error) {
        this.#logger.warn({ err: error }, 'Background work after a response failed');
      } finally {
        this.#background.delete(tracked);
      }
    };
    const tracked = settle();
    this.#background.add(tracked);
    this.shutdown.track(tracked);
  }

  /**
   * Spends one hydrate from the budgets that bound whose reads reach an
   * owner's repositories (D22, coordinator ruling 2026-09-25).
   *
   * Every caller has its own daily bucket per owner, sized for one always-on
   * client, so the owner's own sync never shares a bucket with anybody else's.
   * Everybody who is not the owner — collaborators, publication viewers
   * repairing derived state — additionally shares one aggregate per owner, so
   * third parties together cannot turn the owner's repositories into unbounded
   * egress, and exhausting it never touches the owner's own bucket.
   *
   * A cloud host is the owner's device (EQ5) but not the owner's bucket
   * (RV-W10 F1): it has its own `caller:device:<id>` bucket and stays out of
   * the aggregate, so a looping host can spend neither the owner's own reads
   * nor the collaborators' allowance.
   *
   * @param access - Whose repository, and who is asking.
   * @param operation - What the read is for, as `tau.git.admissions` labels a refusal.
   * @throws HttpException `429` with `retryAfterSeconds` when a bucket is spent.
   */
  private async spendHydrate(
    access: Pick<GitAccess, 'ownerId' | 'callerId' | 'viaDevice'>,
    operation: GitOperation,
  ): Promise<void> {
    const own = access.callerId === access.ownerId;
    const shared = !own && access.viaDevice === undefined;
    const buckets = [
      {
        key: `git:hydrate:${access.ownerId}:${own ? 'owner' : `caller:${access.callerId}`}`,
        limit: hydratesPerCallerPerDay,
      },
      ...(shared ? [{ key: `git:hydrate:${access.ownerId}:others`, limit: hydratesFromOthersPerOwnerPerDay }] : []),
    ];
    for (const bucket of buckets) {
      // oxlint-disable-next-line no-await-in-loop -- the aggregate is spent only once the caller's own bucket admitted the read
      const budget = await this.rateLimiter.consumeWindowBudget({ ...bucket, windowSeconds: 86_400 });
      if (!budget.allowed) {
        this.metrics.gitAdmissions.add(1, { 'tau.git.operation': operation, outcome: 'budget_exhausted' });
        throw new HttpException(
          {
            code: 'GIT_HYDRATE_BUDGET_EXHAUSTED',
            message: 'Today’s repository reads for this project are used up; retry after midnight UTC.',
            retryAfterSeconds: budget.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
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
    await this.databaseService.database.transaction(async (transaction) => {
      await assertActiveProjectLocked(transaction, projectId);
      await transaction
        .insert(projectGit)
        .values({ projectId, generation, copyPendingSince: new Date() })
        .onConflictDoUpdate({
          target: projectGit.projectId,
          // W13 B4: the B2 copy's lag clock starts in the statement that advances `generation`.
          set: {
            generation,
            copyPendingSince: copyPendingOnAdvance(generation),
            updatedAt: new Date(),
          },
          setWhere: lt(projectGit.generation, generation),
        });
    });
  }

  /**
   * Re-derives everything that follows from a committed manifest (D19), from
   * a receipt the manifest check accepted.
   *
   * Byte accounting is the manifest's own live pack bytes. LFS reachability is
   * the receipt's whole walk, written in the same owner-locked transaction as
   * the derived generation and only while that generation is behind the
   * receipt's, so a slow receipt for generation 5 landing after 6 changes
   * nothing. Publications are materialized for the tags the manifest names
   * whose live publication does not record the commit the tag peels to — a
   * read through tau-storage, and only when one is stale (DC3 moves it there).
   *
   * A failure here is logged and swallowed on purpose: the push is durable,
   * and the generation mismatch it leaves behind is what the next request (or
   * the scheduler) repairs.
   */
  private async derive(receipt: StorageReceipt, manifest: Manifest): Promise<void> {
    const access = { projectId: receipt.project, ownerId: receipt.owner };
    try {
      await assertProjectActive(this.databaseService.database, access.projectId);
    } catch (error) {
      if (error instanceof GoneException) {
        return;
      }
      this.#logger.warn(
        { err: error, projectId: access.projectId },
        'Derived state admission failed after a durable push',
      );
      return;
    }
    /* D13: tell every open client of this project that the remote moved. First
       and whatever the rebuild below does, because the manifest is already
       durable. Tracked rather than awaited, as before. A receipt that moved no
       ref — a deferred compaction's — has nothing to announce. */
    if (receipt.movedRefs.length > 0) {
      this.track(this.announce(access, manifest.generation, receipt.movedRefs));
    }
    const storageBytes = manifest.packs.reduce((total, pack) => total + pack.bytes, 0);
    try {
      await this.materializeStalePublications(access, manifest);
    } catch (error) {
      this.#logger.warn(
        { err: error, projectId: access.projectId, generation: manifest.generation },
        'Derived state could not be rebuilt; the next request for this project repairs it',
      );
      return;
    }

    /* Swallowed like the rebuild above: the push this follows is durable. */
    try {
      await withOwnerLock(this.databaseService.database, access.ownerId, async (transaction) => {
        await assertActiveProjectLocked(transaction, access.projectId);
        const [row] = await transaction
          .select({ derivedGeneration: projectGit.derivedGeneration })
          .from(projectGit)
          .where(eq(projectGit.projectId, access.projectId))
          .limit(1);
        if (row !== undefined && row.derivedGeneration >= manifest.generation) {
          return;
        }
        await writeLfsReachability(transaction, {
          projectId: access.projectId,
          referenced: receipt.reachableLfsOids,
          at: new Date(),
        });
        await transaction
          .insert(projectGit)
          .values({
            projectId: access.projectId,
            storageBytes,
            generation: manifest.generation,
            derivedGeneration: manifest.generation,
            copyPendingSince: new Date(),
          })
          .onConflictDoUpdate({
            target: projectGit.projectId,
            set: {
              storageBytes,
              /* `generation` moves with the marker (review F1). */
              generation: manifest.generation,
              derivedGeneration: manifest.generation,
              copyPendingSince: copyPendingOnAdvance(manifest.generation),
              updatedAt: new Date(),
            },
            /* Compare-and-swap (review F4): the slower of two derivations never
               takes `derived_generation`, or `storage_bytes`, backwards. */
            setWhere: lt(projectGit.derivedGeneration, manifest.generation),
          });
      });
    } catch (error) {
      this.#logger.warn(
        { err: error, projectId: access.projectId, generation: manifest.generation },
        'Derived state could not be recorded; the next request for this project repairs it',
      );
    }
  }

  /**
   * Materializes the live publications whose tag, in this manifest, peels to a
   * commit the row does not record — after a push that moved it, or a crash
   * that lost the push's receipt. One query, and a read lease only when a
   * publication is actually stale.
   */
  private async materializeStalePublications(
    access: Pick<GitAccess, 'projectId' | 'ownerId'>,
    manifest: Manifest,
  ): Promise<void> {
    const rows = await this.databaseService.database
      .select({ tag: publication.tag, revisionId: publication.revisionId, manifestKey: publication.manifestKey })
      .from(publication)
      .where(and(eq(publication.projectId, access.projectId), isNull(publication.unpublishedAt)));
    const stale = rows.flatMap((row) => {
      const ref = `refs/tags/${row.tag}`;
      const held = manifest.refs[ref];
      return held !== undefined && (row.manifestKey === '' || (held.peeled ?? held.oid) !== row.revisionId)
        ? [{ ref, oid: held.oid }]
        : [];
    });
    if (stale.length === 0) {
      return;
    }
    await this.withLease(
      {
        ...access,
        role: 'owner',
        callerId: derivedStateCaller,
        remainingBytes: 0,
        storageLimitBytes: 0,
      },
      async (lease) => {
        await materializePublishedTags(this.materializerDependencies, {
          projectId: access.projectId,
          ownerId: access.ownerId,
          directory: lease.directory,
          tags: stale,
        });
      },
      { spendBudget: false },
    );
  }

  /**
   * One `revision` entry for a committed manifest (D13), with each moved ref's
   * new head so a client that already holds them asks for nothing (W13e); a
   * failure is logged, never raised.
   */
  private async announce(
    access: Pick<GitAccess, 'projectId' | 'ownerId'>,
    generation: number,
    moved: StorageReceipt['movedRefs'],
  ): Promise<void> {
    try {
      await this.durableEvents.appendRevision({
        projectId: access.projectId,
        ownerId: access.ownerId,
        generation,
        refs: moved.map((ref) => ref.ref),
        heads: Object.fromEntries(moved.flatMap((ref) => (ref.after === undefined ? [] : [[ref.ref, ref.after]]))),
      });
    } catch (error) {
      this.#logger.warn(
        { err: error, projectId: access.projectId, generation },
        'Committed manifest not announced on the revision stream; open clients learn of it on their next fetch',
      );
    }
  }
}

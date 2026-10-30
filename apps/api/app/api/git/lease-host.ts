/* oxlint-disable new-cap -- NestJS's Logger is a class each host instantiates once */
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { GitAdmissionAttributes, GitOperation, MetricsService } from '#telemetry/metrics.js';
import { quotaOverrunSlackBytes } from '#api/git/git.constants.js';
import { defaultAdmissionWaitMilliseconds, LeaseAdmission } from '#api/git/admission/lease-admission.js';
import type { LeaseTicket } from '#api/git/admission/lease-admission.js';
import {
  hydratedBytes,
  pushQuarantineBound,
  reservationFloorBytes,
  reservationFor,
} from '#api/git/admission/reservation.js';
import type { LeaseKind } from '#api/git/admission/reservation.js';
import { refusalFor } from '#api/git/git-refusals.js';
import { hydrateLease } from '#api/git/store/lease.js';
import type { PrereadManifest, RepositoryLease } from '#api/git/store/lease.js';
import { PackCache } from '#api/git/store/pack-cache.js';
import { repositoryByteCeiling } from '#api/git/store/limits.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

/**
 * A process that builds repository leases on its own disk: admission by real
 * bytes and owner share (DA3), the hydrate, disposal, and the reclaim of a
 * dead process's lease directories (W10 defect 2).
 *
 * Shared by the two processes that still build leases (DC1): tau-storage,
 * which runs every git RPC over one, and the API, whose publication routes
 * still read a tagged tree through one until DC3 moves them. Nothing here
 * touches a database or Redis, so tau-storage's module graph stays free of
 * both (Z1).
 */

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

/**
 * What each lease operation can write to disk (DA3): only a push brings a
 * quarantine, and no request-path operation runs a full `repack -a -d`.
 */
const leaseKindOf = (operation: GitOperation): LeaseKind =>
  operation === 'receive_pack' ? 'push' : operation === 'compact' ? 'compaction' : 'fetch';

/** The pack bytes a manifest names: what a hydrate draws, and the repository's size once committed. */
export const manifestPackBytes = (manifest: Manifest | undefined): number =>
  (manifest?.packs ?? []).reduce((total, pack) => total + pack.bytes, 0);

/** A manifest read ahead of the hydrate, with the SHA-256 of its stored bytes (a receipt's `manifestSha256`). */
export type DigestedManifest = PrereadManifest & { readonly digest: string | undefined };

/**
 * Reads, decodes and digests the manifest a lease will hydrate.
 *
 * @param store - The repository store.
 * @param locator - Which repository.
 * @returns The decoded manifest, its token and the digest of its bytes.
 */
export const readDigestedManifest = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
): Promise<DigestedManifest> => {
  const read = await store.readManifest(locator);
  return read === undefined
    ? { manifest: undefined, token: 'absent', digest: undefined }
    : {
        manifest: decodeManifest(read.manifest),
        token: read.token,
        digest: createHash('sha256').update(read.manifest).digest('hex'),
      };
};

/** An admitted lease (DA3): its disk ticket, and the manifest its reservation was sized from. */
export type LeaseAdmissionGrant = {
  readonly locator: RepositoryLocator;
  readonly preread: DigestedManifest;
  readonly ticket: LeaseTicket;
  /** Gives the admission back; every path must call it once the lease is disposed. */
  readonly release: () => void;
};

/** What one lease admission needs to know. */
export type LeaseRequest = {
  /** Resolves the repository; a refusal here is mapped like a store refusal. */
  readonly locator: () => Promise<RepositoryLocator>;
  /** Whose share of the lease disk this lease counts against. */
  readonly ownerId: string;
  /** What the plan still allows, which bounds a push's quarantine. */
  readonly remainingBytes: number;
  /**
   * Spent after the reservation and before the hydrate: the API's daily hydrate
   * budgets (D22) for its own leases. A refusal gives the reservation back.
   */
  readonly beforeHydrate?: () => Promise<void>;
};

export class GitLeaseHost {
  /**
   * The per-lease floor every reservation carries (DA3, `admission/reservation.ts`).
   * Public so the admission suites can raise it past any real disk.
   *
   * ponytail: a mutable field rather than an injected bound; a deployment that
   * needs another figure gets an environment variable on the day it has one.
   */
  public leaseReservationFloorBytes = reservationFloorBytes;

  /** How long a refused admission waits for a release (DA3). Public for the same suites. */
  public admissionWaitMilliseconds = defaultAdmissionWaitMilliseconds;

  /**
   * D20's per-repository ceiling on non-LFS bytes. Public for the same reason
   * as the figure above: the refusal suite proves the hook's sentence and its
   * file list without pushing a gigabyte.
   */
  public repositoryByteCeiling = repositoryByteCeiling;

  protected readonly store: RepositoryStore;
  protected readonly shutdown: ShutdownService;
  protected readonly metrics: MetricsService;
  protected readonly logger: Logger;

  /**
   * Where leases are built. The process's ephemeral disk, which is what D33's
   * admission figure is measured against — never a mounted volume, because
   * there is no longer one.
   */
  readonly #leaseParent = path.join(tmpdir(), 'tau-git-leases', String(process.pid));

  /**
   * This process's lease reservations, process-local and deliberately so: they
   * bound *this* process's disk, which no other shares. Reserved by real bytes
   * and shared fairly between owners (DA3, `admission/lease-admission.ts`).
   */
  readonly #admission = new LeaseAdmission({ readFreeBytes: async () => this.recordedLeaseDiskFreeBytes() });

  /**
   * The pack cache of tau-storage (DC2), on the lease filesystem so a lease can
   * hard-link from it; `undefined` where leases read the store every time (the
   * API's in-process fallback). It lives under this process's lease directory,
   * so the boot sweep that reclaims a dead run's leases clears it too.
   */
  readonly #packCache: PackCache | undefined;

  /** The boot sweep, which admission waits on so it never builds a lease the sweep is removing. */
  readonly #bootSweep: Promise<void>;

  /**
   * Work a request started that outlives its response: the lease disposal
   * that follows a fetch, whose child closes after the bytes are on the wire,
   * a push's deferred compaction, a compacting commit's sweep. Held in a set
   * rather than fired and forgotten, so a failure has somewhere to be logged
   * and a caller can wait for it.
   */
  readonly #background = new Set<Promise<void>>();

  /**
   * @param args - The repository store leases hydrate from, the process's stop
   * signal and drain registry, the admission, lease and hydrate series (DA2),
   * and the context this host logs under.
   */
  public constructor(args: {
    readonly store: RepositoryStore;
    readonly shutdown: ShutdownService;
    readonly metrics: MetricsService;
    readonly loggerName: string;
    /**
     * The share of the lease filesystem the pack cache may hold, from 0 to 1
     * (DC2); 0 or absent runs without one. The budget is this fraction of the
     * free bytes `statfs` reads plus what the cache already holds.
     */
    readonly packCacheFraction?: number;
  }) {
    this.store = args.store;
    this.shutdown = args.shutdown;
    this.metrics = args.metrics;
    this.logger = new Logger(args.loggerName);
    const fraction = Math.min(1, Math.max(0, args.packCacheFraction ?? 0));
    this.#packCache = fraction > 0 ? this.#createPackCache(fraction) : undefined;
    /* A crash restarts a Machine in place on the same rootfs, so boot is the
       first chance to give the dead process's disk back (W10 defect 2). Tracked
       rather than awaited: nothing may wait on a sweep to serve a request. */
    this.#bootSweep = this.sweepAbandonedLeases({ atBoot: true });
    this.track(this.#bootSweep);
  }

  /**
   * Free bytes of the lease filesystem, as `statfs` reports them. Public so
   * the admission suites can stand in a 7.3 GiB staging Machine.
   *
   * @returns Free bytes available to this process.
   */
  public async readLeaseDiskFreeBytes(): Promise<number> {
    const { bavail, bsize } = await statfs(this.#leaseParent);
    return bavail * bsize;
  }

  /** The pack cache, when this host runs one (DC2). */
  public get packCache(): PackCache | undefined {
    return this.#packCache;
  }

  /** Lease disk this process holds reserved now; 0 once every lease is released (DA3, DC1's slow-body suite). */
  public get reservedLeaseBytes(): number {
    return this.#admission.reservedBytes;
  }

  /**
   * Waits for the work a finished request left running, and for any that
   * work started in turn (a deferred compaction starts its sweep).
   */
  public async settled(): Promise<void> {
    while (this.#background.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- each round waits for what the round before started
      await Promise.all(this.#background);
    }
  }

  /**
   * Runs `work` after the reply. Every post-reply promise this host starts
   * comes through here, so `settled()` and the shutdown registry, which waits
   * for it until the stop's abandon phase, both see it.
   */
  protected track(work: Promise<void>): void {
    const settle = async (): Promise<void> => {
      try {
        await work;
      } catch (error) {
        /* Nothing is awaiting this promise but `settled()`, so an unhandled
           rejection here would be the process's problem rather than the
           request's (review F10). */
        this.logger.warn({ err: error }, 'Background work after a response failed');
      } finally {
        this.#background.delete(tracked);
      }
    };
    const tracked = settle();
    this.#background.add(tracked);
    this.shutdown.track(tracked);
  }

  /**
   * Admits one more lease while this process's disk can hold what it will
   * write (DA3; blueprint OD2, which replaces D33's flat 2.5 GiB).
   *
   * The manifest is read first, so the reservation is the lease's real bytes
   * by kind (`admission/reservation.ts`): a fetch reserves its packs plus a
   * 64 MiB floor, a push adds the quarantine bound `receive.maxInputSize`
   * enforces. That read is the one the hydrate would have made, so it is
   * handed on and costs nothing extra. Disk and owner fairness are then
   * decided against the free bytes `statfs` reads on every admission: an
   * owner that already holds a lease may hold at most half the lease disk in
   * bytes, and a refusal waits up to {@link admissionWaitMilliseconds} for a
   * release first.
   *
   * Each decision is a `tau.git.admissions` outcome; an admitted lease is held
   * on `tau.git.leases.active` until its release, and the reservation and the
   * free bytes `statfs` read are the two disk gauges (DA2).
   *
   * @param request - The repository, whose share, the plan headroom and the pre-hydrate step.
   * @param operation - What the lease is for, as the admission and lease series label it.
   * @returns The grant, whose release every path must call.
   * @throws ServiceUnavailableException When the lease does not fit, or the owner already holds its share.
   */
  protected async admitLeaseSlot(request: LeaseRequest, operation: GitOperation): Promise<LeaseAdmissionGrant> {
    const admission = (outcome: GitAdmissionAttributes['outcome']): void => {
      this.metrics.gitAdmissions.add(1, { 'tau.git.operation': operation, outcome });
    };
    await this.#bootSweep;
    await this.sweepAbandonedLeases();
    await mkdir(this.#leaseParent, { recursive: true });
    let locator: RepositoryLocator;
    let preread: DigestedManifest;
    try {
      locator = await request.locator();
      preread = await readDigestedManifest(this.store, locator);
    } catch (error) {
      throw refusalFor(error, this.logger);
    }
    const packBytes = (preread.manifest?.packs ?? []).map((pack) => pack.bytes);
    const kind = leaseKindOf(operation);
    const reservationBytes = reservationFor(
      {
        kind,
        packBytes,
        ...(kind === 'push'
          ? {
              quarantineBytes: pushQuarantineBound({
                planRemainingBytes: request.remainingBytes,
                ceilingRemainingBytes: Math.max(0, this.repositoryByteCeiling - manifestPackBytes(preread.manifest)),
                slackBytes: quotaOverrunSlackBytes,
              }),
            }
          : {}),
      },
      this.leaseReservationFloorBytes,
    );
    const decided = await this.#admission.admit({
      ownerId: request.ownerId,
      reservationBytes,
      waitMilliseconds: this.admissionWaitMilliseconds,
    });
    if (!decided.admitted) {
      admission(decided.refusal);
      throw decided.refusal === 'disk_full'
        ? new ServiceUnavailableException({
            code: 'GIT_LEASE_DISK_FULL',
            message: 'This server has no room for another repository right now; retry shortly.',
          })
        : new ServiceUnavailableException({
            code: 'GIT_LEASE_OWNER_BUSY',
            message: 'This account already has repository work running on this server; retry shortly.',
          });
    }
    /* Reserved before the budget's round trip, so the decision and the
       reservation stay one synchronous step and no concurrent admission slips
       between them; a refused budget gives the reservation straight back. */
    const { ticket } = decided;
    let active = false;
    let released = false;
    const release = (): void => {
      if (!released) {
        released = true;
        ticket.release();
        if (active) {
          this.metrics.gitLeasesActive.add(-1, { 'tau.git.operation': operation });
        }
        this.recordReservedBytes();
      }
    };
    try {
      await request.beforeHydrate?.();
      /* A push that committed while this request waited for room would make the read stale, and the
         commit against it a lost race: read again, once, only after a wait. */
      if (decided.waited) {
        preread = await readDigestedManifest(this.store, locator);
      }
    } catch (error) {
      if (
        error instanceof HttpException &&
        (error.getResponse() as { code?: unknown }).code === 'GIT_HYDRATE_BUDGET_EXHAUSTED'
      ) {
        admission('budget_exhausted');
      }
      release();
      throw refusalFor(error, this.logger);
    }
    /* Admission counted the cache's idle bytes as free; make them so before the
       hydrate writes into them (DC2). */
    try {
      await this.#packCache?.reclaim(this.#admission.owedBytes, async () => this.readLeaseDiskFreeBytes());
    } catch (error) {
      /* An unlink that failed leaves the bytes where they were; the hydrate may still fit. */
      this.logger.warn({ err: error }, 'The pack cache could not evict for an admitted lease');
    }
    admission('admitted');
    active = true;
    this.metrics.gitLeasesActive.add(1, { 'tau.git.operation': operation });
    this.recordReservedBytes();
    return { locator, preread, ticket, release };
  }

  /**
   * Hydrates the lease admission sized, from the manifest it read, timed as
   * the `hydrate` lease phase. Once the packs are on disk the ticket says so,
   * and admission stops counting them a second time (DA3).
   */
  protected async hydrate(admitted: LeaseAdmissionGrant): Promise<RepositoryLease> {
    const startedAt = performance.now();
    try {
      const lease = await hydrateLease({
        store: this.store,
        locator: admitted.locator,
        parentDirectory: this.#leaseParent,
        preread: admitted.preread,
        ...(this.#packCache === undefined ? {} : { cache: this.#packCache }),
      });
      admitted.ticket.landed(hydratedBytes((lease.manifest?.packs ?? []).map((pack) => pack.bytes)));
      /* The cache's share is the hydrate bytes DC2 saved; an empty repository reads as one store draw of 0. */
      const { cache, objectStore } = lease.drawnBytes;
      if (cache > 0) {
        this.metrics.gitHydrateBytes.record(cache, { 'tau.git.hydrate.source': 'cache' });
      }
      if (objectStore > 0 || cache === 0) {
        this.metrics.gitHydrateBytes.record(objectStore, { 'tau.git.hydrate.source': 'object_store' });
      }
      return lease;
    } finally {
      this.metrics.syncLeaseDuration.record((performance.now() - startedAt) / 1000, {
        'tau.sync.lease.phase': 'hydrate',
      });
    }
  }

  /**
   * Admits, hydrates, runs `work` and disposes, giving the admission back
   * whatever happened.
   *
   * @param operation - What the lease is for.
   * @param request - What admission needs.
   * @param work - What to do with the disposable bare directory and the manifest's digest.
   * @returns Whatever `work` returned.
   */
  protected async runLease<T>(
    operation: GitOperation,
    request: LeaseRequest,
    work: (lease: RepositoryLease, digest: string | undefined) => Promise<T>,
  ): Promise<T> {
    return this.runLeaseThen(operation, request, async (lease, digest) => ({ value: await work(lease, digest) }));
  }

  /**
   * {@link runLease}, where `work` may hand back an `after` step that still
   * needs the lease once the request has its answer: the answer is returned at
   * once, and the lease is disposed and its admission given back as soon as
   * `after` settles, tracked like every other post-reply step ({@link track}).
   * A push's deferred compaction is one: it runs over the push's lease, inside
   * the reservation the push was admitted with.
   *
   * `after` may answer a last step that needs no lease — posting a receipt,
   * sweeping the store — which runs, still tracked, only once the lease is
   * disposed and its disk reservation and owner share are back.
   *
   * @param operation - What the lease is for.
   * @param request - What admission needs.
   * @param work - The request's work, answering its value and an optional step to run after it.
   * @returns The value `work` answered.
   */
  protected async runLeaseThen<T>(
    operation: GitOperation,
    request: LeaseRequest,
    work: (
      lease: RepositoryLease,
      digest: string | undefined,
    ) => Promise<{ readonly value: T; readonly after?: () => Promise<(() => Promise<void>) | undefined> }>,
  ): Promise<T> {
    const admitted = await this.admitLeaseSlot(request, operation);
    let lease: RepositoryLease | undefined;
    let handedOver = false;
    try {
      lease = await this.hydrate(admitted);
      const { value, after } = await work(lease, admitted.preread.digest);
      if (after !== undefined) {
        const held = lease;
        handedOver = true;
        this.track(
          (async (): Promise<void> => {
            let then: (() => Promise<void>) | undefined;
            try {
              then = await after();
            } finally {
              await this.disposeQuietly(held, admitted.locator.projectId);
              admitted.release();
            }
            await then?.();
          })(),
        );
      }
      return value;
    } catch (error) {
      throw refusalFor(error, this.logger);
    } finally {
      /* The admission comes back whatever the disposal did, and a disposal
         failure never replaces the refusal this request was about to answer
         (review F2). `rm -rf` suppresses ENOENT but not EBUSY, EACCES or
         EPERM, and a throw here used to skip `release()` for the life of the
         process — after which every request on this host answered
         `GIT_LEASE_DISK_FULL` forever. A lease handed to an `after` step is
         that step's to dispose. */
      if (!handedOver) {
        await this.disposeQuietly(lease, admitted.locator.projectId);
        admitted.release();
      }
    }
  }

  /**
   * Disposes a fetch's lease once its child has closed, and gives the
   * admission back. A failure here leaks a temporary directory, which is
   * recoverable; failing the response the client already has is not.
   */
  protected async disposeAfterFetch(lease: RepositoryLease, release: () => void, projectId: string): Promise<void> {
    await this.disposeQuietly(lease, projectId);
    release();
  }

  /**
   * Disposes a lease and never raises (review F2).
   *
   * Every caller has something more important to do next — give the admission
   * back, or raise the refusal the request actually earned — and a `rm -rf`
   * that hit EBUSY must not take either of those away.
   */
  protected async disposeQuietly(lease: RepositoryLease | undefined, projectId: string): Promise<void> {
    try {
      await lease?.dispose();
    } catch (error) {
      this.logger.warn({ err: error, projectId }, 'Lease disposal failed; its directory is left behind');
    }
  }

  /**
   * {@link readLeaseDiskFreeBytes}, recorded on the free-bytes gauge at every
   * admission attempt (DA2). Admission sees the pack cache's idle bytes as
   * free too, because it evicts them before a lease needs the room (DC2).
   */
  private async recordedLeaseDiskFreeBytes(): Promise<number> {
    const free = await this.readLeaseDiskFreeBytes();
    this.metrics.gitDiskFreeBytes.record(free);
    return free + (this.#packCache?.evictableBytes ?? 0);
  }

  /** The lease disk this process has reserved now: the sum of admitted leases' real-byte reservations (DA3). */
  private recordReservedBytes(): void {
    this.metrics.gitLeaseReservedBytes.record(this.#admission.reservedBytes);
  }

  /**
   * Removes the lease directories of processes that are no longer running (W10
   * defect 2).
   *
   * A process killed mid-push cannot unlink its own lease, and admission counts
   * the *free* bytes of the disk those leases sit on — so every crash used to
   * cost this machine that lease's disk headroom permanently. Leases therefore
   * live under `tau-git-leases/<pid>/`, and a sibling is only removed when its
   * pid is gone: two processes share one `tmpdir` locally and must never sweep
   * each other.
   *
   * At boot it also removes this process's own directory. A Machine restarted
   * in place usually starts under the same pid, so the dead run's directory
   * looks alive to the sibling check forever; and at boot this process holds
   * no lease yet, so whatever is there is the dead run's.
   *
   * ponytail: unthrottled — a `readdir` of a handful of names plus a signal-0
   * per name. Add a throttle if a machine ever hosts thousands of siblings.
   */
  private async sweepAbandonedLeases({ atBoot = false }: { readonly atBoot?: boolean } = {}): Promise<void> {
    const root = path.dirname(this.#leaseParent);
    let siblings: readonly string[];
    try {
      siblings = await readdir(root);
    } catch {
      /* Nothing has run on this machine yet. */
      return;
    }
    const abandoned = siblings.filter(
      (name) => /^\d+$/u.test(name) && ((atBoot && Number(name) === process.pid) || !processAlive(Number(name))),
    );
    if (abandoned.length === 0) {
      return;
    }
    let reclaimed = 0;
    for (const name of abandoned) {
      const held = path.join(root, name);
      try {
        // oxlint-disable-next-line no-await-in-loop -- one dead process at a time; the list is tiny and the removal is I/O, not CPU
        reclaimed += await directoryBytes(held);
        // oxlint-disable-next-line no-await-in-loop -- as above
        await rm(held, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn({ err: error, directory: held }, 'A dead worker’s lease directory could not be removed');
      }
    }
    this.logger.log(
      { directories: abandoned.length, bytes: reclaimed },
      'Reclaimed the lease directories of workers that are no longer running',
    );
  }

  /** The cache under this process's lease directory, its budget from `statfs`, its events on `tau.git.cache.*`. */
  #createPackCache(fraction: number): PackCache {
    const cache: PackCache = new PackCache({
      root: path.join(this.#leaseParent, 'pack-cache'),
      budgetBytes: async () => fraction * ((await this.readLeaseDiskFreeBytes()) + cache.bytes),
      events: {
        lookup: (result) => {
          this.metrics.gitCacheLookups.add(1, { result });
        },
        evicted: (bytes) => {
          this.metrics.gitCacheEvictions.add(1);
          this.metrics.gitCacheEvictedBytes.add(bytes);
        },
        fallback: (reason) => {
          this.metrics.gitCacheFallbacks.add(1, { reason });
        },
        occupancy: ({ pinnedBytes, idleBytes, budgetBytes }) => {
          this.metrics.gitCacheBytes.record(pinnedBytes, { state: 'pinned' });
          this.metrics.gitCacheBytes.record(idleBytes, { state: 'idle' });
          this.metrics.gitCacheBudgetBytes.record(budgetBytes);
        },
      },
    });
    return cache;
  }
}

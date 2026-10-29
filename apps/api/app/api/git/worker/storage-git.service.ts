import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import type { GitCommitAttemptAttributes, HotProjectRank } from '#telemetry/metrics.js';
import { isRemovableRef, negotiationInputLimitBytes, quotaOverrunSlackBytes } from '#api/git/git.constants.js';
import type { GitService as GitSmartService } from '#api/git/git.constants.js';
import { pushQuarantineBound } from '#api/git/admission/reservation.js';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import { installedGitDialect } from '#api/git/advertisement-probe.js';
import { isReadOnlyGitCommand } from '#api/git/forwarding/contract/grant.js';
import type { StorageGrant } from '#api/git/forwarding/contract/grant.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import { HotProjects, hotProjectRanks } from '#api/git/hot-projects.js';
import type { HotProject } from '#api/git/hot-projects.js';
import { GitLeaseHost, manifestPackBytes } from '#api/git/lease-host.js';
import type { LeaseRequest } from '#api/git/lease-host.js';
import { LfsReferenceCache } from '#api/git/lfs-references.js';
import { frozenRefusal, isServedStore } from '#api/git/routing/route.js';
import { commitLease, commitTombstone } from '#api/git/store/commit.js';
import type { CommitPhase, CommitResult, DeferredCompactionOutcome, MovedRef } from '#api/git/store/commit.js';
import type { SweepOutcome } from '#api/git/store/sweep.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';
import { isFenceManifest } from '#api/git/store/fence-marker.js';
import { refusalFor } from '#api/git/git-refusals.js';
import { gitChildEnvironment } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { gitRpcTimeoutMilliseconds } from '#api/git/store/limits.js';
import { encodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import type { PreviewWriter } from '#api/projects/project-preview-store.js';

/**
 * Git execution in tau-storage (DC1): every smart-HTTP RPC, the audited ref
 * removal and a derived-state repair, over a lease hydrated from the object
 * store, for a request the API has already authorized and described in a
 * verified grant.
 *
 * Database-free by construction (Z1, W9 M3). What the API used to read from
 * Postgres arrives in the grant; what it used to write after a commit leaves
 * in a receipt the API checks against the committed manifest before applying
 * it. So the worker count never touches the connection budget, and a worker
 * that misbehaves can delay derived state but never forge it.
 */

/** `update-ref` on the removal path. */
const commandTimeoutMilliseconds = 60 * 1000;

/**
 * One pkt-line flush (`0000`), which is the whole body of the request `git push`
 * sends to authenticate a chunked push. A request no larger than this carried no
 * commands and no pack, so it changed nothing.
 */
const flushPacketBytes = 4;

/**
 * Store refusals raised before the conditional manifest write, so they are not CAS attempts:
 * `tau.git.commit.attempts` counts writes, and these reach the client as their own refusal codes.
 */
const refusedBeforeManifestWrite: ReadonlySet<string> = new Set([
  'deadline',
  'loose-objects',
  'connectivity',
  'ceiling-exceeded',
]);

/** Ranks `1`..`10` with what each holds; an empty rank reads 0 so every series keeps reporting. */
const rankedValues = (
  ranked: readonly HotProject[] | undefined,
  value: (project: HotProject) => number,
): Array<[number, HotProjectRank]> =>
  Array.from({ length: hotProjectRanks }, (_, index) => {
    const entry = ranked?.[index];
    return [entry === undefined ? 0 : value(entry), String(index + 1) as HotProjectRank];
  });

/**
 * A read session idles this long after its last command before its lease is
 * disposed, when the API never said it was done (a lost `end`).
 */
const readSessionIdleMilliseconds = 15_000;

/** A read session's whole life: past it, the next command opens a fresh lease. */
const readSessionMaximumMilliseconds = 5 * 60 * 1000;

/**
 * One materialization's lease, held across its git reads (DC1 review S1), so
 * a publication costs one hydrate and a push landing between two of its
 * commands cannot move what they read.
 */
type ReadSession = {
  /** The lease's directory and the generation it was hydrated at, once it is. */
  readonly ready: Promise<{ readonly directory: string; readonly generation: number }>;
  /** Commands running in it now; it is never disposed under one. */
  active: number;
  idle: NodeJS.Timeout | undefined;
  /** Set by `end`, the life cap or a stop: no new command joins it, and it closes when idle. */
  ended: boolean;
  readonly close: () => void;
};

/** A session is its repository's: a grant for another project never joins it. */
const readSessionKey = (grant: StorageGrant, session: string): string => `${grant.owner}/${grant.project}/${session}`;

/** `409 GIT_REVISION_MOVED` when a lease is not at the generation the API is reading. */
const assertReadGeneration = (leased: number, expected: number): void => {
  if (leased !== expected) {
    throw new ConflictException({
      code: 'GIT_REVISION_MOVED',
      message: 'The repository moved while it was being read; retry.',
    });
  }
};

/** SHA-256 of the manifest bytes a commit wrote: `commitLease` writes exactly `encodeManifest(next)`. */
const committedDigest = (manifest: Manifest): string =>
  createHash('sha256').update(encodeManifest(manifest)).digest('hex');

/**
 * How tau-storage's receipts leave it: signed to ride back on the response the
 * API is waiting for, or posted to the API's receipt route when nothing is
 * waiting (the `retained` receipt after a sweep).
 */
export type ReceiptChannel = {
  /** Signs a receipt; the caller returns it with its response. */
  sign(facts: StorageReceiptFacts): string;
  /** Signs and posts a receipt to the API's internal route; best effort, never rejects. */
  post(facts: StorageReceiptFacts): Promise<void>;
};

/** What a smart-HTTP RPC needs besides its grant. */
export type StorageRpcArguments = {
  readonly grant: StorageGrant;
  readonly body: Readable;
  readonly gzipped: boolean;
  readonly abort?: AbortSignal;
};

/** A fetch's answer: git's stream, and a repair receipt when the API was behind the manifest. */
export type UploadPackResult = { readonly output: Readable; readonly receipt: string | undefined };

/** A push's answer: git's report-status, withheld until the commit resolved, and its receipt. */
export type ReceivePackResult = {
  readonly report: Uint8Array<ArrayBuffer>;
  readonly receipt: string | undefined;
  /** Request body bytes that arrived: the API counts a push's size from them. */
  readonly bodyBytes: number;
};

export class StorageGitService extends GitLeaseHost {
  /**
   * W2's crash seam (`store/fault-points.ts`), threaded into every commit so a
   * suite can kill a committer at a named point. Unset in a deployment, where
   * it costs one `await` of `undefined` per push.
   */
  public faults: FaultInjector | undefined;

  /**
   * The slow-body floor (DC1): a request body that moves fewer bytes than this
   * in one window is aborted. Public so a suite can shorten the window; 0
   * disarms it, as the API's in-process worker does.
   */
  public slowBodyMinimumBytes = 8 * 1024;

  /** The slow-body window, in milliseconds. */
  public slowBodyWindowMilliseconds = 30_000;

  private readonly receipts: ReceiptChannel;
  private readonly previews: PreviewWriter | undefined;

  /** Open read sessions, by owner, project and the API's session handle ({@link gitRead}). */
  readonly #readSessions = new Map<string, ReadSession>();

  /** The projects whose sweep is running (`sweepAfterReply`). */
  readonly #sweeping = new Set<string>();

  /**
   * Each project's deferred compactions on this worker (`compactAfterReply`):
   * the newest one owed, which is the only one that may still run, and when
   * the one before it has finished. They run one at a time per project.
   */
  readonly #compactions = new Map<string, { readonly newest: symbol; readonly finished: Promise<void> }>();

  /**
   * The manifest writers this process is serving now — pushes and ref
   * removals — by project: a deferred compaction gives way to any of them
   * (`compactAfterReply`).
   */
  readonly #writersInFlight = new Map<string, Set<symbol>>();

  /** Each repository's last LFS walk, so a receipt's walk covers only what is new (push latency F4). */
  readonly #lfsReferences = new LfsReferenceCache();

  /**
   * Committed writes per project per minute, for the rank-only hot-project
   * gauges (DA2). Project ids leave this process only on the
   * `git.hot_projects` log line, never as a metric label.
   */
  readonly #hotProjects = new HotProjects((closed) => {
    this.logger.log(
      {
        event: 'git.hot_projects',
        minuteStart: closed.minuteStart.toISOString(),
        byCommits: closed.byCommits.map((entry, index) => ({ rank: index + 1, ...entry })),
        byWriters: closed.byWriters.map((entry, index) => ({ rank: index + 1, ...entry })),
      },
      'git.hot_projects',
    );
  });

  /**
   * @param args - The store, the receipt channel, the stop signal and the metrics.
   */
  public constructor(args: {
    readonly store: RepositoryStore;
    readonly receipts: ReceiptChannel;
    readonly shutdown?: ShutdownService;
    readonly metrics?: MetricsService;
    /** Where catalog previews are written; tau-storage's app binds the object store's. */
    readonly previews?: PreviewWriter;
    /** The share of the lease filesystem the pack cache may hold (DC2); 0 or absent runs without one. */
    readonly packCacheFraction?: number;
  }) {
    super({
      store: args.store,
      shutdown: args.shutdown ?? new ShutdownService(),
      metrics: args.metrics ?? new MetricsService(),
      loggerName: 'StorageGitService',
      ...(args.packCacheFraction === undefined ? {} : { packCacheFraction: args.packCacheFraction }),
    });
    this.receipts = args.receipts;
    this.previews = args.previews;
    /* A stop ends every read session, so none holds the drain open past its last command. */
    this.shutdown.signal.addEventListener(
      'abort',
      () => {
        for (const session of this.#readSessions.values()) {
          session.ended = true;
          this.#settleReadSession(session);
        }
      },
      { once: true },
    );
    this.metrics.gitHotProjectCommitRate.addCallback((result) => {
      for (const [rate, rank] of rankedValues(
        this.#hotProjects.lastFullMinute()?.byCommits,
        (entry) => entry.commits / 60,
      )) {
        result.observe(rate, { rank });
      }
    });
    this.metrics.gitHotProjectWriters.addCallback((result) => {
      for (const [writers, rank] of rankedValues(
        this.#hotProjects.lastFullMinute()?.byWriters,
        (entry) => entry.writers,
      )) {
        result.observe(writers, { rank });
      }
    });
  }

  /**
   * Refuses a grant this worker cannot serve whatever its signature says: a
   * store this build does not reach, a route frozen when it was minted, or a
   * storage account other than the one this worker's token opens (D26).
   *
   * @param grant - The verified grant.
   * @throws HttpException `429 GIT_REPOSITORY_FROZEN` for a route this worker must not serve now.
   */
  public assertServable(grant: StorageGrant): void {
    if (!isServedStore(grant.route.store)) {
      throw frozenRefusal();
    }
    if (grant.route.frozenUntil !== undefined && grant.route.frozenUntil * 1000 > Date.now()) {
      throw frozenRefusal();
    }
    if (grant.account !== undefined) {
      throw new ServiceUnavailableException({
        code: 'GIT_SERVICE_RESTARTING',
        message: 'This project’s storage account is not served here yet; retry shortly.',
      });
    }
  }

  /**
   * `git-upload-pack`: a read. Hydrate, serve, dispose; no commit.
   *
   * The child's stdout is streamed rather than buffered — a clone at D20's
   * ceiling is a gigabyte and nothing about a read needs it in memory — and the
   * lease lives until the child closes. A manifest ahead of the grant's
   * recorded generation is repaired first, on a fetch as on a push (FR5).
   *
   * @param args - The grant, the request body and the client's abort signal.
   * @returns Git's output and the repair receipt, if one was owed.
   */
  public async uploadPack(args: StorageRpcArguments): Promise<UploadPackResult> {
    const admitted = await this.admitLeaseSlot(this.leaseRequest(args.grant), 'upload_pack');
    let lease: RepositoryLease | undefined;
    try {
      lease = await this.hydrate(admitted);
      const receipt = await this.repairReceipt(args.grant, lease, admitted.preread.digest);
      const held = lease;
      const child = this.spawnService({
        lease: held,
        service: 'git-upload-pack',
        maximumInputBytes: negotiationInputLimitBytes,
        ...(args.abort === undefined ? {} : { abort: args.abort }),
      });
      child.on('close', () => {
        this.track(this.disposeAfterFetch(held, admitted.release, args.grant.project));
      });
      /* A fetch's body is `want`/`have` negotiation rather than a pack, so it
         gets the flat negotiation ceiling — but it gets one (review C32). */
      this.pipeRequestBody({
        ...args,
        child,
        service: 'git-upload-pack',
        maximumInputBytes: negotiationInputLimitBytes,
      });
      return { output: child.stdout, receipt };
    } catch (error) {
      // Same shape as `runLease`'s `finally` (review F2).
      await this.disposeQuietly(lease, args.grant.project);
      admitted.release();
      throw this.refusal(error);
    }
  }

  /**
   * `git-receive-pack`: a push.
   *
   * The whole response is withheld until `commitLease` resolves (D4, NI2), so
   * git's own report-status is buffered rather than streamed: a client that
   * read `ok refs/heads/main` off the wire before the manifest was durable
   * would have been told a lie the protocol cannot take back.
   *
   * What it withholds the reply for is this push's own commit and receipt. A
   * push that takes the repository past the pack bound commits its own pack
   * only and compacts after the reply, over the same lease
   * ({@link compactAfterReply}); the reply does not wait for that, nor for the
   * sweep.
   *
   * @param args - The grant, the request body and the abort signal.
   * @returns Git's report-status, verbatim (NI13), and the commit's or a repair's receipt.
   */
  public async receivePack(args: StorageRpcArguments): Promise<ReceivePackResult> {
    const { grant } = args;
    const push = this.#writerStarted(grant.project);
    return this.runLeaseThen('receive_pack', this.leaseRequest(grant), async (lease, digest) => {
      const ceilingRemaining = Math.max(0, this.repositoryByteCeiling - manifestPackBytes(lease.manifest));
      const child = this.spawnService({
        lease,
        service: 'git-receive-pack',
        /* The quarantine bound admission reserved (DA3): git stops reading there, so the push
           cannot write more than its reservation whatever the plan has left. */
        maximumInputBytes: pushQuarantineBound({
          planRemainingBytes: grant.remainingBytes,
          ceilingRemainingBytes: ceilingRemaining,
          slackBytes: quotaOverrunSlackBytes,
        }),
        ...(args.abort === undefined ? {} : { abort: args.abort }),
        environment: {
          /* The `pre-receive` hook reads all three: it refuses a push that did
             not come through this admission check, one whose quarantine does
             not fit in what is left of the plan, and one that would take the
             repository past D20's ceiling (D17, D20). */
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_PUSH_ADMITTED: '1',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_QUOTA_REMAINING_BYTES: String(grant.remainingBytes),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
          TAU_GIT_CEILING_REMAINING_BYTES: String(ceilingRemaining),
          /* D17: the plan refusal's sentence, addressed to this caller. */
          ...(grant.quotaSentence === undefined
            ? {}
            : {
                // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
                TAU_GIT_QUOTA_SENTENCE: grant.quotaSentence,
              }),
        },
      });

      const output = this.collect(child.stdout);
      const request = this.pipeRequestBody({
        ...args,
        child,
        service: 'git-receive-pack',
        maximumInputBytes: Number.POSITIVE_INFINITY,
      });
      const [report] = await Promise.all([output, this.awaitChild(child), request.done]);
      if (request.counter.tooSlow) {
        throw new RequestTimeoutException({
          code: 'GIT_REQUEST_BODY_TOO_SLOW',
          message: 'The push arrived too slowly and was abandoned; retry on a faster connection.',
        });
      }

      if (request.counter.bytes <= flushPacketBytes) {
        /* The flush-only body `git push` authenticates a chunked push with.
           Nothing arrived, so there is nothing to commit — but this lease is the
           only one the push's first leg takes, so it is where a trailing
           derived state is repaired (FR5). */
        return {
          value: {
            report,
            receipt: await this.repairReceipt(grant, lease, digest),
            bodyBytes: request.counter.bytes,
          },
        };
      }

      /* The stop gate (D4 makes this safe): a push that has not started to
         commit when the process begins to stop is refused before its first
         upload, and the client re-pushes against a Machine that is staying.
         One that has started finishes, because the drain waits for it. */
      this.refuseWhenStopping('This server is restarting; retry the push.');
      this.metrics.syncPackBytes.record(request.counter.bytes, { 'tau.sync.operation': 'push' });
      const result = await this.commit(grant, {
        store: this.store,
        lease,
        committedBy: grant.committedBy,
        ...(grant.viaDevice === undefined ? {} : { viaDevice: grant.viaDevice }),
        byteCeiling: this.repositoryByteCeiling,
        deferCompaction: true,
        ...(this.faults === undefined ? {} : { faults: this.faults }),
      });
      if (!result.committed) {
        /* Refused refs and nothing moved: the lease still says whether the API trails it. */
        return {
          value: {
            report,
            receipt: await this.repairReceipt(grant, lease, digest),
            bodyBytes: request.counter.bytes,
          },
        };
      }
      const facts = await this.commitFacts(grant, lease, result);
      this.sweepAfterReply(grant, result);
      const value = { report, receipt: this.signQuietly(grant, facts), bodyBytes: request.counter.bytes };
      const { compaction } = result;
      return compaction === undefined
        ? { value }
        : { value, after: async () => this.compactAfterReply({ grant, push, compaction, facts }) };
    }).finally(() => {
      this.#writerEnded(grant.project, push);
    });
  }

  /**
   * The audited ref removal's commit (D24). The API has already decided, under
   * its publication lock, that the removal goes ahead and retired the
   * publication it confirmed; this lease removes the ref and commits like a
   * push, and the API's transaction commits only once this answered.
   *
   * @param grant - The verified grant, naming the ref.
   * @returns The ref, the tip it held, the generation that removed it and the commit's receipt.
   * @throws NotFoundException When the repository holds no such ref.
   */
  public async removeRef(grant: StorageGrant): Promise<{
    readonly ref: string;
    readonly tip: string;
    readonly generation: number;
    readonly receipt: string | undefined;
  }> {
    const { ref } = grant;
    if (ref === undefined || !isRemovableRef(ref)) {
      throw new BadRequestException({
        code: 'GIT_REF_NOT_REMOVABLE',
        message: 'Only a named version (refs/tags/*) or a conflict line (refs/heads/conflicts/*) can be removed.',
      });
    }
    const removal = this.#writerStarted(grant.project);
    return this.runLease('remove_ref', this.leaseRequest(grant), async (lease) => {
      const held = lease.manifest?.refs[ref]?.oid;
      if (held === undefined) {
        throw new NotFoundException({ code: 'GIT_REF_NOT_FOUND', message: `This repository has no ${ref}.` });
      }
      /* The API decided under its publication lock against the tip it read; a
         ref that moved since is a lost race, retried against the new tip. */
      if (grant.tip !== undefined && grant.tip !== held) {
        throw new ServiceUnavailableException({
          code: 'GIT_PUSH_RACE_LOST',
          message: 'Another push for this project committed first; retry.',
        });
      }
      /* The push's stop gate: a removal that has not started to commit when the
         process begins to stop is refused, and the API rolls its retirement back. */
      this.refuseWhenStopping('This server is restarting; retry the removal.');
      await this.runGit(['update-ref', '-d', ref, held], lease.directory);
      const result = await this.commit(grant, {
        store: this.store,
        lease,
        committedBy: grant.committedBy,
        byteCeiling: this.repositoryByteCeiling,
        ...(this.faults === undefined ? {} : { faults: this.faults }),
      });
      if (!result.committed) {
        throw new ServiceUnavailableException({
          code: 'GIT_PUSH_RACE_LOST',
          message: 'Another push for this project committed first; retry.',
        });
      }
      const facts = await this.commitFacts(grant, lease, result);
      this.sweepAfterReply(grant, result);
      return { ref, tip: held, generation: result.manifest.generation, receipt: this.signQuietly(grant, facts) };
    }).finally(() => {
      this.#writerEnded(grant.project, removal);
    });
  }

  /**
   * A repair with no client waiting (OB3's scheduler, FR5): hydrate, and report
   * derived state when the manifest is ahead of the grant's recorded generation.
   *
   * @param grant - The verified repair grant.
   * @returns The repair receipt, or `undefined` when the API is already caught up.
   */
  /**
   * A project deletion's fence: the tombstone manifest through the same
   * conditional write as a push (D10, NI12), so every in-flight writer of the
   * project loses its race. A lost race is retried twice against the newer
   * manifest; then it answers `503 GIT_PUSH_RACE_LOST` and the API's durable
   * recovery tries again.
   *
   * @param grant - The verified grant; `committedBy` is the deletion's requester.
   * @returns When the repository was tombstoned and when its purge may run.
   */
  public async tombstone(grant: StorageGrant): Promise<{ readonly tombstonedAt: string; readonly purgeAfter: string }> {
    this.refuseWhenStopping('This server is restarting; retry the deletion.');
    const locator = repositoryLocator({
      ownerId: grant.owner,
      projectId: grant.project,
      ...(grant.account === undefined ? {} : { accountId: grant.account }),
    });
    for (let attempt = 0; ; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- bounded retry of the same conditional commit
        const { manifest } = await commitTombstone(
          { store: this.store, locator, committedBy: grant.committedBy },
          AbortSignal.timeout(5000),
        );
        if (!manifest.tombstone) {
          throw new Error('The deletion fence wrote no tombstone');
        }
        return { tombstonedAt: manifest.tombstone.tombstonedAt, purgeAfter: manifest.tombstone.purgeAfter };
      } catch (error) {
        if (!(error instanceof RepositoryStoreError) || error.code !== 'lost') {
          throw error;
        }
        if (attempt >= 2) {
          throw new ServiceUnavailableException({
            code: 'GIT_PUSH_RACE_LOST',
            message: 'Another push for this project committed first; retry.',
          });
        }
      }
    }
  }

  /**
   * The dialect of the git this worker spawns, which tau-api's advertisement
   * promises (DB1, DC1). Probed once per process.
   *
   * @returns The installed git's dialect.
   */
  /**
   * Stores a catalog preview tau-api validated, under the repository's prefix
   * (DC1: tau-api writes nothing under `repos/`). The grant names the body's
   * SHA-256, so a request cannot carry other bytes than the API signed for.
   *
   * @param grant - The verified grant; `bodySha256` and `createOnly` are required facts here.
   * @param bytes - The preview.
   * @returns Whether a create-only write met an existing preview.
   */
  public async putPreview(grant: StorageGrant, bytes: Uint8Array<ArrayBuffer>): Promise<{ readonly lost: boolean }> {
    if (this.previews === undefined) {
      throw new ServiceUnavailableException({
        code: 'GIT_SERVICE_RESTARTING',
        message: 'This storage worker stores no previews; retry shortly.',
      });
    }
    if (grant.bodySha256 === undefined || createHash('sha256').update(bytes).digest('hex') !== grant.bodySha256) {
      throw new BadRequestException({
        code: 'PROJECT_PREVIEW_INVALID',
        message: 'The preview is not the one granted.',
      });
    }
    return this.previews({
      ownerId: grant.owner,
      projectId: grant.project,
      bytes,
      createOnly: grant.createOnly === true,
    });
  }

  public async dialect(): Promise<AdvertisementDialect> {
    return installedGitDialect();
  }

  public async derive(grant: StorageGrant): Promise<{ readonly receipt: string | undefined }> {
    return this.runLease('derive', this.leaseRequest(grant), async (lease, digest) => ({
      receipt: await this.repairReceipt(grant, lease, digest),
    }));
  }

  /**
   * One read-only git command over a lease of the manifest the API named, for
   * the publication materializer until DC3 moves it here.
   *
   * With a `session` (the API's `withLease` handle), every command of one
   * materialization runs over the same lease: the first hydrates it, the rest
   * reuse it, and {@link endReadSession} or {@link readSessionIdleMilliseconds}
   * of quiet disposes it (DC1 review S1). Without one, each command hydrates
   * its own lease.
   *
   * @param grant - The verified grant.
   * @param request - The command, its stdin, the generation the API is reading at, and its session.
   * @returns The command's stdout.
   * @throws BadRequestException For anything but the three read-only commands.
   * @throws ConflictException `GIT_REVISION_MOVED` when the manifest is no longer at that generation.
   */
  public async gitRead(
    grant: StorageGrant,
    request: {
      readonly args: readonly string[];
      readonly stdin?: string;
      readonly generation: number;
      readonly session?: string;
    },
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!isReadOnlyGitCommand(request.args)) {
      throw new BadRequestException({ code: 'GIT_READ_REFUSED', message: 'Only read-only git commands are served.' });
    }
    if (request.session === undefined) {
      return this.runLease('derive', this.leaseRequest(grant), async (lease) => {
        assertReadGeneration(lease.manifest?.generation ?? 0, request.generation);
        return this.runGit(request.args, lease.directory, request.stdin);
      });
    }
    const session = this.#joinReadSession(grant, request.session);
    session.active += 1;
    clearTimeout(session.idle);
    try {
      const held = await session.ready;
      assertReadGeneration(held.generation, request.generation);
      return await this.runGit(request.args, held.directory, request.stdin);
    } finally {
      session.active -= 1;
      this.#settleReadSession(session);
    }
  }

  /**
   * Ends a read session: its lease is disposed once its last command is done.
   * Unknown sessions are ignored, since an idle one may already be gone.
   *
   * @param grant - The verified grant.
   * @param session - The API's session handle.
   */
  public endReadSession(grant: StorageGrant, session: string): void {
    const held = this.#readSessions.get(readSessionKey(grant, session));
    if (held !== undefined) {
      held.ended = true;
      this.#settleReadSession(held);
    }
  }

  /** The admission facts of a grant: the locator, whose share, and the plan headroom. */
  private leaseRequest(grant: StorageGrant): LeaseRequest {
    return {
      locator: async () => repositoryLocator({ ownerId: grant.owner, projectId: grant.project }),
      ownerId: grant.owner,
      remainingBytes: grant.remainingBytes,
    };
  }

  /**
   * The receipt facts of a commit this worker made, for the caller to sign;
   * a deferred compaction reports the same facts at its own generation.
   *
   * @returns The facts, or `undefined` when the derivation walk failed (the next grant repairs it).
   */
  private async commitFacts(
    grant: StorageGrant,
    lease: RepositoryLease,
    result: Extract<CommitResult, { committed: true }>,
  ): Promise<StorageReceiptFacts | undefined> {
    return this.receiptFactsFor({
      grant,
      kind: 'commit',
      lease,
      manifest: result.manifest,
      digest: committedDigest(result.manifest),
      moved: result.moved,
    });
  }

  /**
   * Derived-state repair (D19), moved from the API's `info/refs` lease to the
   * grant (FR5): **the manifest decides, never the row.** The grant carries the
   * generation the API last derived; a lease hydrated from a later manifest is
   * re-derived — every ref, a whole LFS walk — and reported in a `repair`
   * receipt. So a worker killed between its compare-and-swap and its receipt
   * leaves a repository whose next request of any kind repairs it.
   *
   * @returns The signed repair receipt, or `undefined` when nothing is owed.
   */
  private async repairReceipt(
    grant: StorageGrant,
    lease: RepositoryLease,
    digest: string | undefined,
  ): Promise<string | undefined> {
    const { manifest } = lease;
    if (manifest === undefined || digest === undefined || manifest.generation <= grant.recordedGeneration) {
      return undefined;
    }
    this.logger.log(
      { projectId: grant.project, generation: manifest.generation, recordedGeneration: grant.recordedGeneration },
      'Reporting derived state the API is behind on',
    );
    const facts = await this.receiptFactsFor({
      grant,
      kind: 'repair',
      lease,
      manifest,
      digest,
      moved: Object.entries(manifest.refs).map(([ref, value]) => ({ ref, after: value.oid })),
    });
    return this.signQuietly(grant, facts);
  }

  /** Signs receipt facts; a failure is logged and answered with no receipt, as a failed walk is. */
  private signQuietly(grant: StorageGrant, facts: StorageReceiptFacts | undefined): string | undefined {
    if (facts === undefined) {
      return undefined;
    }
    try {
      return this.receipts.sign(facts);
    } catch (error) {
      this.logger.warn(
        { err: error, projectId: grant.project, generation: facts.generation },
        'A receipt could not be signed; the next request for this project repairs it',
      );
      return undefined;
    }
  }

  /**
   * Walks a lease for what the API derives from a manifest. A failure is
   * logged and answered with no receipt: the push is durable, and the next
   * grant's recorded generation repairs what this one did not say.
   *
   * The LFS walk starts from this repository's last walk on this process
   * ({@link LfsReferenceCache}): only the objects new since are read, and the
   * set is the same whole walk the receipt promises (`reachableLfsOids`).
   */
  private async receiptFactsFor(args: {
    grant: StorageGrant;
    kind: 'commit' | 'repair';
    lease: RepositoryLease;
    manifest: Manifest;
    digest: string;
    moved: readonly MovedRef[];
  }): Promise<StorageReceiptFacts | undefined> {
    try {
      const { oids: reachable } = await this.#lfsReferences.walk(
        `${args.grant.owner}/${args.grant.project}`,
        args.lease.directory,
        args.manifest.refs,
      );
      return {
        rid: args.grant.rid,
        kind: args.kind,
        owner: args.grant.owner,
        project: args.grant.project,
        generation: args.manifest.generation,
        incarnation: args.manifest.incarnation,
        manifestSha256: args.digest,
        movedRefs: args.moved.map((moved) => ({
          ref: moved.ref,
          ...(moved.before === undefined ? {} : { before: moved.before }),
          ...(moved.after === undefined ? {} : { after: moved.after }),
        })),
        materializedTags: [],
        reachableLfsOids: [...reachable].sort(),
      };
    } catch (error) {
      this.logger.warn(
        { err: error, projectId: args.grant.project, generation: args.manifest.generation },
        'Derived state could not be walked; the next request for this project repairs it',
      );
      return undefined;
    }
  }

  /**
   * Starts a compacting commit's sweep without the reply waiting on it (W13b),
   * and posts the retired bytes it kept to the API (D18) once it has them. At
   * most one runs per project on this worker.
   */
  private sweepAfterReply(
    grant: StorageGrant,
    result: {
      readonly compacted: boolean;
      readonly manifest: Manifest;
      readonly sweep: () => Promise<SweepOutcome | undefined>;
    },
  ): void {
    if (!result.compacted || this.#sweeping.has(grant.project)) {
      return;
    }
    this.#sweeping.add(grant.project);
    this.track(
      (async (): Promise<void> => {
        let outcome: 'ok' | 'error' = 'error';
        try {
          const swept = await result.sweep();
          if (swept !== undefined) {
            await this.receipts.post({
              rid: grant.rid,
              kind: 'retained',
              owner: grant.owner,
              project: grant.project,
              generation: result.manifest.generation,
              incarnation: result.manifest.incarnation,
              manifestSha256: committedDigest(result.manifest),
              movedRefs: [],
              materializedTags: [],
              reachableLfsOids: [],
              retainedBytes: swept.retainedBytes,
            });
          }
          outcome = 'ok';
        } finally {
          this.metrics.syncSweeps.add(1, { outcome });
          this.#sweeping.delete(grant.project);
        }
      })(),
    );
  }

  /**
   * Runs the compaction a push's commit left owed, after the push was answered
   * and over the push's lease (push latency F2: the compacting commit's repack
   * and re-upload were the >5 s tail of the reply).
   *
   * One runs at a time per project on this worker, and only the newest owed
   * one: a push that owes a compaction while another runs waits for it, and
   * any older one still waiting, or still running, gives way to it.
   *
   * It gives way rather than race: it is abandoned before each step while any
   * other manifest writer for the project (a push, a ref removal) is in flight
   * here or the process is stopping, and it stops before the repack and before
   * its first upload once the manifest has moved past the push it follows. A
   * lost conditional write is a lost compaction, never a lost push; a writer
   * elsewhere that hydrated the push's generation rebases over a compaction
   * that won (`rebaseOverCompaction` in `commit.ts`). In every case where it
   * does not commit, the next push past the bound owes it again, and past
   * `deferredCompactionPackLimit` a push compacts inline.
   *
   * @returns What to run once the lease is disposed and its admission given
   *   back, when the compaction committed: its sweep, then a `commit` receipt
   *   for its generation — a fresh request id, no moved refs (it moved none,
   *   and the push's own receipt announces the push), and the push's whole LFS
   *   walk, unchanged because the refs are — so the API records the generation
   *   and the compacted bytes rather than repairing them on the next request.
   *   Never rejects: the push is durable whatever happens here.
   */
  private async compactAfterReply(args: {
    readonly grant: StorageGrant;
    /** The push that owes it, which may still be finishing its answer: not a writer it gives way to. */
    readonly push: symbol;
    readonly compaction: NonNullable<Extract<CommitResult, { committed: true }>['compaction']>;
    readonly facts: StorageReceiptFacts | undefined;
  }): Promise<(() => Promise<void>) | undefined> {
    const { grant } = args;
    const ticket = Symbol(grant.project);
    const before = this.#compactions.get(grant.project)?.finished;
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.#compactions.set(grant.project, { newest: ticket, finished });
    const newest = (): boolean => this.#compactions.get(grant.project)?.newest === ticket;
    try {
      await before;
      if (!newest()) {
        this.logger.log({ projectId: grant.project }, 'A deferred compaction gave way to a newer one owed');
        return undefined;
      }
      const done = await this.runCompaction({
        ...args,
        shouldAbandon: () =>
          this.shutdown.signal.aborted ||
          !newest() ||
          [...(this.#writersInFlight.get(grant.project) ?? [])].some((writer) => writer !== args.push),
      });
      if (done?.outcome !== 'committed') {
        return undefined;
      }
      const { manifest, sweep } = done;
      const { facts } = args;
      return async () => {
        this.sweepAfterReply(grant, { compacted: true, manifest, sweep });
        if (facts !== undefined) {
          await this.receipts.post({
            ...facts,
            rid: randomBytes(16).toString('hex'),
            generation: manifest.generation,
            incarnation: manifest.incarnation,
            manifestSha256: committedDigest(manifest),
            movedRefs: [],
          });
        }
      };
    } finally {
      finish();
      if (this.#compactions.get(grant.project)?.finished === finished) {
        this.#compactions.delete(grant.project);
      }
    }
  }

  /** One deferred compaction, counted and timed as kind `compaction`; `undefined` when it failed. */
  private async runCompaction(args: {
    readonly grant: StorageGrant;
    readonly compaction: NonNullable<Extract<CommitResult, { committed: true }>['compaction']>;
    readonly shouldAbandon: () => boolean;
  }): Promise<DeferredCompactionOutcome | undefined> {
    const { grant } = args;
    const startedAt = performance.now();
    const phases: Array<[CommitPhase, number]> = [];
    const attempt = (outcome: GitCommitAttemptAttributes['outcome']): void => {
      this.metrics.gitCommitAttempts.add(1, {
        outcome,
        'tau.git.commit.kind': 'compaction',
      });
      for (const [phase, seconds] of [...phases, ['total', (performance.now() - startedAt) / 1000] as const]) {
        this.metrics.gitCommitDuration.record(seconds, {
          'tau.git.commit.phase': phase,
          'tau.git.commit.kind': 'compaction',
        });
      }
    };
    let done: DeferredCompactionOutcome;
    try {
      done = await args.compaction({
        shouldAbandon: args.shouldAbandon,
        onPhase: (phase, seconds) => {
          phases.push([phase, seconds]);
        },
        ...(this.faults === undefined ? {} : { faults: this.faults }),
      });
    } catch (error) {
      attempt('error');
      this.logger.warn(
        { err: error, projectId: grant.project },
        'A deferred compaction failed; the next push past the pack bound compacts again',
      );
      return undefined;
    }
    switch (done.outcome) {
      case 'abandoned': {
        this.logger.log(
          { projectId: grant.project },
          'A deferred compaction gave way to another writer or a newer compaction',
        );
        break;
      }
      case 'superseded': {
        this.logger.log({ projectId: grant.project }, 'A deferred compaction stopped: the manifest had moved on');
        break;
      }
      case 'lost': {
        this.metrics.syncManifestConflicts.add(1);
        attempt('lost_race');
        break;
      }
      case 'committed': {
        attempt('committed');
        this.metrics.gitRepositorySize.record(manifestPackBytes(done.manifest));
        break;
      }
    }
    return done;
  }

  /**
   * `commitLease`, timed as the `commit` lease phase, counting a lost conditional manifest write.
   *
   * A lease hydrated from a migration fence commits only under a grant whose
   * route the API read past its cache and found open (FR13): the API reads it
   * so for every write, and a freeze that began after that read drained this
   * request before the fence was written.
   */
  private async commit(grant: StorageGrant, args: Parameters<typeof commitLease>[0]): ReturnType<typeof commitLease> {
    if (isFenceManifest(args.lease.manifest) && !grant.route.authoritative) {
      throw frozenRefusal();
    }
    const startedAt = performance.now();
    /* Held until the attempt is counted, so every phase series counts exactly the commits `total` counts:
       a push that moved no ref, or one refused before its manifest write, records neither. */
    const phases: Array<[CommitPhase, number]> = [];
    const attempt = (outcome: GitCommitAttemptAttributes['outcome']): void => {
      this.metrics.gitCommitAttempts.add(1, { outcome, 'tau.git.commit.kind': 'push' });
      for (const [phase, seconds] of [...phases, ['total', (performance.now() - startedAt) / 1000] as const]) {
        this.metrics.gitCommitDuration.record(seconds, {
          'tau.git.commit.phase': phase,
          'tau.git.commit.kind': 'push',
        });
      }
    };
    try {
      const result = await commitLease({
        ...args,
        onPhase: (phase, seconds) => {
          phases.push([phase, seconds]);
        },
      });
      if (result.committed) {
        attempt('committed');
        this.metrics.gitRepositorySize.record(manifestPackBytes(result.manifest));
        this.#hotProjects.record(
          args.lease.locator.projectId,
          args.viaDevice === undefined ? args.committedBy : `${args.committedBy}:${args.viaDevice}`,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryStoreError && error.code === 'lost') {
        this.metrics.syncManifestConflicts.add(1);
        attempt('lost_race');
      } else if (!(error instanceof RepositoryStoreError && refusedBeforeManifestWrite.has(error.code))) {
        attempt('error');
      }
      throw error;
    } finally {
      this.metrics.syncLeaseDuration.record((performance.now() - startedAt) / 1000, {
        'tau.sync.lease.phase': 'commit',
      });
    }
  }

  /** A refusal as the client should see it: store errors mapped, HTTP answers kept. */
  private refusal(error: unknown): Error {
    return refusalFor(error, this.logger);
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
      'git',
      [
        ...(write ? ['-c', `receive.maxInputSize=${String(args.maximumInputBytes)}`] : []),
        args.service.replace('git-', ''),
        '--stateless-rpc',
        args.lease.directory,
      ],
      {
        env: { ...gitChildEnvironment(args.lease.directory), ...args.environment },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: gitRpcTimeoutMilliseconds,
        killSignal: 'SIGKILL',
        ...(args.abort === undefined ? {} : { signal: args.abort }),
      },
    );
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    // An aborted or timed-out child emits `error`; without a listener that is
    // an unhandled exception on the process.
    child.on('error', (error) => {
      this.logger.warn({ err: error, service: args.service }, 'git smart-HTTP child ended early');
    });
    child.on('close', (code) => {
      if (code !== 0) {
        this.logger.warn(
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

  /**
   * Refuses a commit that has not started once the process begins to stop
   * (503 `GIT_SERVICE_RESTARTING`); one already committing finishes under the drain.
   *
   * @param message - What the client is told to retry.
   */
  private refuseWhenStopping(message: string): void {
    if (this.shutdown.signal.aborted) {
      throw new ServiceUnavailableException({ code: 'GIT_SERVICE_RESTARTING', message });
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
   * A slow-body watchdog runs from the first byte the child can take: a body
   * that moves fewer than {@link slowBodyMinimumBytes} in any
   * {@link slowBodyWindowMilliseconds} is destroyed, the child killed, and the
   * lease slot comes back with the child's close (DC1; W9 "Back-pressure").
   * It is armed here rather than at the API, because only here does it start
   * after the hydrate, which can itself take longer than one window.
   *
   * @returns A promise that also carries the running byte count and whether the watchdog fired.
   */
  private pipeRequestBody(args: {
    body: Readable;
    child: ChildProcessByStdio<Writable, Readable, Readable>;
    gzipped: boolean;
    service: GitSmartService;
    maximumInputBytes: number;
  }): { done: Promise<void>; counter: { bytes: number; tooSlow: boolean } } {
    const counter = { bytes: 0, tooSlow: false };
    const ceiling = args.maximumInputBytes;
    const source = args.gzipped ? args.body.pipe(createGunzip()) : args.body;
    let windowStart = 0;
    let ended = false;
    source.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      counter.bytes += chunk.byteLength;
      if (Number.isFinite(ceiling) && ceiling > 0 && counter.bytes > ceiling) {
        source.destroy(new Error(`The request body exceeded ${String(ceiling)} bytes.`));
      }
    });
    source.once('end', () => {
      ended = true;
    });
    const watch = (): void => {
      if (ended) {
        return;
      }
      if (counter.bytes - windowStart < this.slowBodyMinimumBytes) {
        counter.tooSlow = true;
        this.metrics.gitSlowBodyAborts.add(1, {
          'tau.git.operation': args.service === 'git-receive-pack' ? 'receive_pack' : 'upload_pack',
        });
        this.logger.warn(
          { service: args.service, bytes: counter.bytes, windowSeconds: this.slowBodyWindowMilliseconds / 1000 },
          'A request body moved too slowly; aborting it and releasing its lease slot',
        );
        source.destroy(new Error('The request body moved too slowly.'));
        args.body.destroy();
        return;
      }
      windowStart = counter.bytes;
    };
    const watchdog =
      this.slowBodyMinimumBytes > 0 ? setInterval(watch, this.slowBodyWindowMilliseconds).unref() : undefined;
    const done = (async (): Promise<void> => {
      try {
        await pipeline(source, args.child.stdin);
      } catch (error) {
        this.logger.warn({ err: error, service: args.service }, 'git smart-HTTP request body failed');
        args.child.kill('SIGKILL');
      } finally {
        ended = true;
        clearInterval(watchdog);
      }
    })();
    return { done, counter };
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
      const child = spawn('git', [...args], {
        cwd,
        env: gitChildEnvironment(cwd),
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
      child.stdin.end(stdin);
    });
  }

  /** Records a manifest writer this process now serves, which a deferred compaction of its project gives way to. */
  #writerStarted(project: string): symbol {
    const writer = Symbol(project);
    const inFlight = this.#writersInFlight.get(project) ?? new Set<symbol>();
    inFlight.add(writer);
    this.#writersInFlight.set(project, inFlight);
    return writer;
  }

  /** Forgets a writer once it has answered. */
  #writerEnded(project: string, writer: symbol): void {
    const inFlight = this.#writersInFlight.get(project);
    inFlight?.delete(writer);
    if (inFlight?.size === 0) {
      this.#writersInFlight.delete(project);
    }
  }

  /** The open session for this grant's repository and handle, or a new one whose lease starts hydrating now. */
  #joinReadSession(grant: StorageGrant, handle: string): ReadSession {
    const key = readSessionKey(grant, handle);
    const open = this.#readSessions.get(key);
    if (open !== undefined && !open.ended) {
      return open;
    }
    let close: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      close = resolve;
    });
    let opened: (held: { readonly directory: string; readonly generation: number }) => void = () => undefined;
    let failed: (error: unknown) => void = () => undefined;
    const ready = new Promise<{ readonly directory: string; readonly generation: number }>((resolve, reject) => {
      opened = resolve;
      failed = reject;
    });
    /* No bare `catch` on `ready`: the caller that opened the session awaits it in the same tick. */
    const session: ReadSession = { ready, active: 0, idle: undefined, ended: false, close };
    this.#readSessions.set(key, session);
    const cap = setTimeout(() => {
      session.ended = true;
      this.#settleReadSession(session);
    }, readSessionMaximumMilliseconds);
    cap.unref();
    const held = async (): Promise<void> => {
      try {
        await this.runLease('derive', this.leaseRequest(grant), async (lease) => {
          opened({ directory: lease.directory, generation: lease.manifest?.generation ?? 0 });
          await closed;
        });
      } catch (error) {
        failed(error);
      } finally {
        clearTimeout(cap);
        clearTimeout(session.idle);
        if (this.#readSessions.get(key) === session) {
          this.#readSessions.delete(key);
        }
      }
    };
    this.track(held());
    return session;
  }

  /** Closes an idle session that has ended, or arms its idle timer. */
  #settleReadSession(session: ReadSession): void {
    if (session.active > 0) {
      return;
    }
    clearTimeout(session.idle);
    if (session.ended) {
      session.close();
      return;
    }
    session.idle = setTimeout(session.close, readSessionIdleMilliseconds);
    session.idle.unref();
  }
}

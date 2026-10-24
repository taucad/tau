import type { Readable } from 'node:stream';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import type { StorageGrantFacts } from '#api/git/forwarding/contract/grant.js';

/**
 * Where tau-api's git requests execute (DC1): tau-storage, behind a signed
 * grant. The API authorizes, budgets and applies receipts; forwarded, it
 * holds no lease, no `git` child and no lease disk. `git-execution.ts` picks
 * the executor once at boot: the HTTP forwarder (`storage-forwarder.ts`) when
 * `TAU_STORAGE_URL` is set, otherwise the worker in this process
 * (`in-process-executor.ts`), so both cross the same contract. A set URL
 * never falls back in process.
 */

/** Injection token for the executor. */
export const gitExecutorKey = Symbol('GitExecutor');

/** A grant's facts without the method and path, which the executor fills from the operation. */
export type GrantFacts = Omit<StorageGrantFacts, 'method' | 'path'>;

/** The request body of a smart-HTTP RPC. */
export type RpcBody = {
  readonly body: Readable;
  readonly gzipped: boolean;
  readonly abort?: AbortSignal;
};

export type GitExecutor = {
  /** `git-upload-pack`: git's stream, with the repair receipt read off its front. */
  uploadPack(
    facts: GrantFacts,
    request: RpcBody,
  ): Promise<{ readonly output: Readable; readonly receipt: string | undefined }>;

  /** `git-receive-pack`: report-status once the commit resolved, the receipt, and the body bytes that arrived. */
  receivePack(
    facts: GrantFacts,
    request: RpcBody,
  ): Promise<{
    readonly report: Uint8Array<ArrayBuffer>;
    readonly receipt: string | undefined;
    readonly bodyBytes: number;
  }>;

  /** The audited ref removal's commit; `facts.ref` and `facts.tip` name it. */
  removeRef(facts: GrantFacts): Promise<{
    readonly ref: string;
    readonly tip: string;
    readonly generation: number;
    readonly receipt: string | undefined;
  }>;

  /** A repair with no client waiting: the receipt, when the manifest is ahead of `recordedGeneration`. */
  derive(facts: GrantFacts): Promise<{ readonly receipt: string | undefined }>;

  /**
   * One read-only git command over a lease of the manifest at `generation`,
   * for the publication materializer until DC3 moves it to tau-storage:
   * `rev-parse`, `ls-tree` and `cat-file --batch` only. Commands that name the
   * same `session` share one lease on the worker that serves them, so one
   * materialization costs one hydrate (review S1).
   */
  gitRead(facts: GrantFacts, request: GitReadRequest): Promise<Uint8Array<ArrayBuffer>>;

  /** Ends a read session: its lease is disposed once its last command is done. */
  endRead(facts: GrantFacts, session: string): Promise<void>;

  /**
   * A project deletion's fence (D10, NI12): the tombstone manifest, committed
   * by tau-storage so no repository write is reachable from tau-api's image.
   * Idempotent: an already tombstoned repository answers its tombstone.
   */
  tombstone(facts: GrantFacts, request?: { readonly abort?: AbortSignal }): Promise<StorageTombstone>;

  /**
   * The dialect of the git tau-storage runs (DB1): the advertisement tau-api
   * writes from the manifest promises what that binary will honour.
   */
  dialect(): Promise<AdvertisementDialect>;

  /**
   * Stores a validated catalog preview under the repository's prefix
   * (`facts.bodySha256` and `facts.createOnly` say which bytes and how), so
   * tau-api writes nothing under `repos/` (DC1).
   */
  putPreview(facts: GrantFacts, bytes: Uint8Array<ArrayBuffer>): Promise<{ readonly lost: boolean }>;
};

/** One git read: the command, its stdin, the generation it reads at, and the session it joins. */
export type GitReadRequest = {
  readonly args: readonly string[];
  readonly stdin?: string;
  readonly generation: number;
  readonly session?: string;
};

/** What a tombstone commit reports: the moments the purge is scheduled from. */
export type StorageTombstone = {
  readonly tombstonedAt: string;
  readonly purgeAfter: string;
};

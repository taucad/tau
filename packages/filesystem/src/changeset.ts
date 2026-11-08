/**
 * The changeset: the one mutation primitive (charter D2, D3, D22, D23, I1, I4, I11).
 *
 * A changeset is a set of create/write/append/delete/move/mkdir entries in up
 * to three ordered phases. The pipeline admits every entry before the first
 * I/O, stages bytes that are not in hand before it takes any lock, acquires one
 * lock set, hands each phase to the owning provider's {@link BatchEntry}
 * batch, reports every entry's outcome truthfully, and publishes one change
 * event and one cross-tab notice. A single write is a changeset of one.
 *
 * This module owns the vocabulary both sides of that contract speak: the
 * consumer's {@link Changeset} and {@link ChangesetReceipt}, the provider
 * port's {@link BatchEntry} and {@link BatchReceipt}, the bound one lock hold
 * may carry, and the helpers that keep a larger piece of work inside it.
 *
 * @module
 */

import type { ChangeEvent, PathChangeEvent } from '@taucad/types';
import type { FileMode } from '#types.js';

/** Most entries one changeset may carry, so a concurrent save waits a fraction of a second (D2). @public */
export const maximumChangesetEntries = 256;

/** Most in-hand bytes one changeset may carry; a single larger entry is still a changeset of one (D2). @public */
export const maximumChangesetBytes = 32 * 1024 * 1024;

/**
 * A phase: a later phase starts only after every entry of the earlier one is
 * durable, so completion markers (`tau.json`, a published sibling) go last.
 *
 * @public
 */
export type ChangesetPhase = 0 | 1 | 2;

/**
 * A large object the authority writes from its own repository store, by its
 * id, instead of bytes the caller carries (EQ13, W11.3).
 *
 * No path names the store: the authority resolves `largeObject` against the
 * store it was given for the root, so `.git/**` never enters the mutation
 * vocabulary (I6). Only a provider whose capabilities declare
 * `largeObjectSources` accepts one; everywhere else it is refused before any
 * I/O. The provider clones the object into the write's temp sibling where the
 * file system can (APFS, btrfs, XFS), otherwise copies it, and verifies what
 * landed by its SHA-256 and size.
 *
 * @public
 */
export type LargeObjectWriteSource = Readonly<{
  /** Lowercase hexadecimal SHA-256 of the object, as its LFS pointer names it. */
  largeObject: string;
  /** The object's size in bytes. */
  size: number;
}>;

/**
 * Whether write data is a {@link LargeObjectWriteSource}.
 *
 * @param data - A write entry's data.
 * @returns `true` for a store-resolved large object.
 * @public
 */
export const isLargeObjectSource = (data: unknown): data is LargeObjectWriteSource =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { largeObject?: unknown }).largeObject === 'string' &&
  typeof (data as { size?: unknown }).size === 'number';

/** Bytes a write entry carries: in hand, a `Blob`, a stream the pipeline stages before locking (I11), or a large object the authority resolves. @public */
export type ChangesetWriteData =
  | Uint8Array<ArrayBuffer>
  | Blob
  | ReadableStream<Uint8Array<ArrayBuffer>>
  | string
  | LargeObjectWriteSource;

/**
 * The condition a record-log append is applied under (charter D23).
 *
 * - `expectedLength`: the file's length, in bytes, the writer last knew; an
 *   absent file has length 0.
 * - `token`: the writer's fencing token, monotonic per log; a lower token than
 *   one already applied to the path is a stale writer.
 *
 * @public
 */
export type AppendFence = Readonly<{ expectedLength: number; token?: number }>;

/**
 * How a provider makes an append durable (L1 invariant 16).
 * @public
 */
export type AppendDurability = 'exclusive-append' | 'stream-append' | 'transactional-rewrite' | 'ephemeral';

/**
 * One entry of a changeset, spelled in its caller's namespace.
 *
 * - `write` replaces or creates a file, creating missing parents. `create`
 *   refuses with `EEXIST` when anything is already at the path.
 * - `append` appends at the file's current length under an exclusive handle;
 *   appends to one path keep their entry order (D23). A `fence` makes the
 *   append conditional, checked under the changeset's exclusive token for the
 *   path: it refuses with `EAPPENDSTALE` when the file's length is not
 *   `expectedLength` (another writer appended first), and with `EFENCED` when
 *   `token` is lower than the highest token this authority has applied to the
 *   path (a writer that lost its lease). Without a fence, appends are ordered
 *   only. The receipt names the provider's durability class.
 * - `delete` removes what is at the path. `kind` refuses the other kind
 *   (`EISDIR`/`ENOTDIR`); a directory needs `recursive` unless it is empty.
 * - `move` renames; `replace` lets a file replace an existing file atomically
 *   where the platform can, otherwise the target must be absent (`EEXIST`).
 * - `mkdir` creates a directory; `recursive` creates parents and accepts an
 *   existing directory.
 *
 * @public
 */
export type ChangesetEntry =
  | Readonly<{
      op: 'write';
      path: string;
      data: ChangesetWriteData;
      mode?: FileMode;
      create?: boolean;
      phase?: ChangesetPhase;
    }>
  | Readonly<{
      op: 'append';
      path: string;
      data: Uint8Array<ArrayBuffer> | string;
      fence?: AppendFence;
      phase?: ChangesetPhase;
    }>
  | Readonly<{ op: 'delete'; path: string; kind?: 'file' | 'dir'; recursive?: boolean; phase?: ChangesetPhase }>
  | Readonly<{ op: 'move'; from: string; to: string; replace?: boolean; phase?: ChangesetPhase }>
  | Readonly<{ op: 'mkdir'; path: string; recursive?: boolean; phase?: ChangesetPhase }>;

/**
 * A set of entries applied under one lock set and published as one change.
 *
 * `lifecycle` takes the project token exclusively — the fence a project
 * create, delete, adoption or topology replacement needs (D3); every other
 * changeset takes it shared, so a save waits only on the paths it shares.
 *
 * @public
 */
export type Changeset = Readonly<{
  entries: readonly ChangesetEntry[];
  lifecycle?: boolean;
  /** Abort stops later phases; entries already in flight settle and are reported. */
  signal?: AbortSignal;
}>;

/** How one entry ended: `skipped` never started because an earlier phase failed or the call was aborted. @public */
export type ChangesetEntryOutcome = 'applied' | 'failed' | 'uncertain' | 'skipped';

/** One entry's outcome, in entry order. `failed` and `skipped` changed nothing; `uncertain` may have. @public */
export type ChangesetEntryReceipt = Readonly<{
  index: number;
  outcome: ChangesetEntryOutcome;
  /** What refused or broke the entry, as the provider raised it. */
  error?: unknown;
  /** The kind of entry a `delete` removed or a `move` moved. */
  kind?: 'file' | 'dir';
  /** For an applied append: the provider's declared durability class, when it declares one. */
  durability?: AppendDurability;
  /** For an applied {@link LargeObjectWriteSource} write: the SHA-256 and size of what landed, read back once. */
  largeObject?: LargeObjectWriteSource;
}>;

/** Everything one changeset did. @public */
export type ChangesetReceipt = Readonly<{
  entries: readonly ChangesetEntryReceipt[];
  applied: number;
  failed: number;
  uncertain: number;
  skipped: number;
  state: 'applied' | 'partially-applied' | 'known-not-applied' | 'potentially-applied';
}>;

/**
 * One entry of a provider batch, in provider paths. Streams were staged into a
 * `Blob` before the batch was handed over (I11).
 *
 * @public
 */
export type BatchEntry =
  | Readonly<{
      op: 'write';
      path: string;
      data: Uint8Array<ArrayBuffer> | Blob | LargeObjectWriteSource;
      mode?: FileMode;
      create?: boolean;
    }>
  | Readonly<{ op: 'append'; path: string; data: Uint8Array<ArrayBuffer> }>
  | Readonly<{ op: 'delete'; path: string; kind?: 'file' | 'dir'; recursive?: boolean }>
  | Readonly<{ op: 'move'; from: string; to: string; replace?: boolean }>
  | Readonly<{ op: 'mkdir'; path: string; recursive?: boolean }>;

/**
 * One batch entry's outcome. `failed` is known not applied (the provider
 * refused it before mutating); `uncertain` may have changed bytes.
 *
 * @public
 */
export type BatchReceipt = Readonly<{
  outcome: 'applied' | 'failed' | 'uncertain';
  error?: unknown;
  kind?: 'file' | 'dir';
  /** Whether a `mkdir` created the directory, or a `write` created the file. */
  created?: boolean;
  /** For an applied {@link LargeObjectWriteSource} write: the SHA-256 and size of what landed, read back once. */
  largeObject?: LargeObjectWriteSource;
}>;

/** Options a provider batch takes. @public */
export type BatchOptions = Readonly<{ signal?: AbortSignal }>;

/** Errno codes a provider raises when it refuses an entry before mutating anything. */
const refusalCodes = new Set(['EEXIST', 'ENOENT', 'EISDIR', 'ENOTDIR', 'ENOTEMPTY', 'EINVAL', 'EPERM', 'EBUSY']);

/**
 * Whether a provider error is a refusal that changed nothing.
 *
 * @param error - What a batch entry raised.
 * @returns `true` for an errno refusal or an abort before the entry began.
 * @public
 */
export const isRefusal = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, name } = error as { code?: unknown; name?: unknown };
  return (typeof code === 'string' && refusalCodes.has(code)) || name === 'AbortError';
};

/**
 * Bytes an entry holds in memory, counted against {@link maximumChangesetBytes}.
 *
 * @param entry - A changeset or batch entry.
 * @returns Its in-hand byte count; a stream counts nothing until staged.
 * @public
 */
export const inHandBytes = (entry: ChangesetEntry | BatchEntry): number => {
  if (entry.op !== 'write' && entry.op !== 'append') {
    return 0;
  }
  const { data } = entry;
  if (typeof data === 'string') {
    return data.length;
  }
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }
  /* A large object source is resolved by the authority from its store: nothing is in hand. */
  return data instanceof Blob ? data.size : 0;
};

/**
 * Whether a changeset fits one lock hold.
 *
 * @param entries - The changeset's entries.
 * @returns `true` when it has at most {@link maximumChangesetEntries} entries and
 *   {@link maximumChangesetBytes} in-hand bytes, or is a single entry.
 * @public
 */
export const isBoundedChangeset = (entries: ReadonlyArray<ChangesetEntry | BatchEntry>): boolean =>
  entries.length <= 1 ||
  (entries.length <= maximumChangesetEntries &&
    entries.reduce((total, entry) => total + inHandBytes(entry), 0) <= maximumChangesetBytes);

/**
 * Split a piece of work into a sequence of bounded changesets (D2).
 *
 * Entries keep their order within a phase and every phase-0 entry lands in an
 * earlier or the same changeset as every phase-1 entry, so applying the
 * sequence in order keeps the phase contract across the split.
 *
 * @param entries - Any number of entries.
 * @returns Consecutive changesets, each within the bound.
 * @public
 */
export const splitChangeset = <Entry extends ChangesetEntry>(entries: readonly Entry[]): Entry[][] => {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => (left.entry.phase ?? 0) - (right.entry.phase ?? 0) || left.index - right.index)
    .map(({ entry }) => entry);
  const changesets: Entry[][] = [];
  let current: Entry[] = [];
  let bytes = 0;
  for (const entry of ordered) {
    const size = inHandBytes(entry);
    if (current.length > 0 && (current.length >= maximumChangesetEntries || bytes + size > maximumChangesetBytes)) {
      changesets.push(current);
      current = [];
      bytes = 0;
    }
    current.push(entry);
    bytes += size;
  }
  if (current.length > 0) {
    changesets.push(current);
  }
  return changesets;
};

/**
 * The exact path facts one bus event carries: the entries of a changeset
 * envelope, or the event itself.
 *
 * @param event - One bus event.
 * @returns Its path facts, in order.
 * @public
 */
export const changeEventEntries = (event: ChangeEvent): readonly PathChangeEvent[] =>
  event.type === 'changeSet' ? event.entries : [event];

/**
 * Summarise entry receipts into a changeset receipt.
 *
 * @param entries - Every entry's receipt, in entry order.
 * @returns The receipt with its counts and overall state.
 * @public
 */
export const changesetReceipt = (entries: readonly ChangesetEntryReceipt[]): ChangesetReceipt => {
  const count = (outcome: ChangesetEntryOutcome): number =>
    entries.reduce((total, entry) => total + (entry.outcome === outcome ? 1 : 0), 0);
  const applied = count('applied');
  const failed = count('failed');
  const uncertain = count('uncertain');
  const skipped = count('skipped');
  const state =
    applied === entries.length
      ? 'applied'
      : applied > 0
        ? 'partially-applied'
        : uncertain > 0
          ? 'potentially-applied'
          : 'known-not-applied';
  return { entries, applied, failed, uncertain, skipped, state };
};

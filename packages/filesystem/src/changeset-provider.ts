/**
 * A changeset applied straight to one provider, with no authority above it (D2).
 *
 * The authority's pipeline is where a changeset normally lands: it holds the
 * locks, keeps the derivatives and publishes the change. A surface that *is* a
 * bare provider — the native host's provider client, a test's in-memory
 * provider — has none of that to keep, but its callers speak the same
 * changeset, so they get the same admission, the same phases and the same
 * truthful receipts here.
 *
 * @module
 */

import type {
  BatchEntry,
  BatchReceipt,
  Changeset,
  ChangesetEntry,
  ChangesetEntryReceipt,
  ChangesetReceipt,
} from '#changeset.js';
import { changesetReceipt, isBoundedChangeset, maximumChangesetBytes, maximumChangesetEntries } from '#changeset.js';
import { PhaseAdmission } from '#changeset-admission.js';
import type { Occupancy } from '#changeset-admission.js';
import { applyBatchWithPrimitives } from '#backend/batch.js';
import type { BatchPrimitives } from '#backend/batch.js';
import type { FileSystemProvider } from '#types.js';

const encoder = new TextEncoder();

const errnoError = (code: string, message: string): Error => Object.assign(new Error(`${code}: ${message}`), { code });

/**
 * Whether write data is a stream that must be staged before any lock.
 *
 * @param data - Write data.
 * @returns `true` for a `ReadableStream`.
 * @internal
 */
export const isStreamData = (data: unknown): data is ReadableStream<Uint8Array<ArrayBuffer>> =>
  typeof ReadableStream !== 'undefined' && data instanceof ReadableStream;

/**
 * The provider batch entry one changeset entry becomes.
 *
 * @param entry - The changeset entry, its write data in hand or staged.
 * @param path - Its path (a move's `from`) in provider space.
 * @param to - A move's `to` in provider space.
 * @returns The batch entry.
 * @internal
 */
export const toBatchEntry = (entry: ChangesetEntry, path: string, to?: string): BatchEntry => {
  switch (entry.op) {
    case 'write': {
      const { data } = entry;
      if (isStreamData(data)) {
        throw new TypeError('A streamed write must be staged before it is batched.');
      }
      return {
        op: 'write',
        path,
        data: typeof data === 'string' ? encoder.encode(data) : data,
        ...(entry.mode === undefined ? {} : { mode: entry.mode }),
        ...(entry.create === undefined ? {} : { create: entry.create }),
      };
    }
    case 'append': {
      return {
        op: 'append',
        path,
        data: typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data,
        ...(entry.fenced === undefined ? {} : { fenced: entry.fenced }),
      };
    }
    case 'delete': {
      return {
        op: 'delete',
        path,
        ...(entry.kind === undefined ? {} : { kind: entry.kind }),
        ...(entry.recursive === undefined ? {} : { recursive: entry.recursive }),
      };
    }
    case 'move': {
      if (to === undefined) {
        throw new TypeError(`Move to '${entry.to}' has no resolved target.`);
      }
      return { op: 'move', from: path, to, ...(entry.replace === undefined ? {} : { replace: entry.replace }) };
    }
    case 'mkdir': {
      return { op: 'mkdir', path, ...(entry.recursive === undefined ? {} : { recursive: entry.recursive }) };
    }
  }
};

/**
 * The footprint one batch entry leaves on its paths, in one storage space.
 *
 * @param batch - The batch entry.
 * @param space - The source's storage space.
 * @param targetSpace - A move target's storage space, when it differs.
 * @returns Its occupancies.
 * @internal
 */
export const occupancyOf = (batch: BatchEntry, space: string, targetSpace = space): Occupancy[] => {
  switch (batch.op) {
    case 'write': {
      return [{ space, path: batch.path, kind: 'write' }];
    }
    case 'append': {
      return [{ space, path: batch.path, kind: 'append' }];
    }
    case 'mkdir': {
      return [{ space, path: batch.path, kind: batch.recursive === true ? 'mkdir' : 'write' }];
    }
    case 'delete': {
      return [{ space, path: batch.path, kind: 'destructive' }];
    }
    case 'move': {
      return [
        { space, path: batch.from, kind: 'destructive' },
        { space: targetSpace, path: batch.to, kind: 'destructive' },
      ];
    }
  }
};

/**
 * Refuse a changeset that exceeds one lock hold (D2).
 *
 * @param entries - The changeset's entries.
 * @internal
 */
export const assertBoundedChangeset = (entries: readonly ChangesetEntry[]): void => {
  if (!isBoundedChangeset(entries)) {
    throw errnoError(
      'EINVAL',
      `a changeset holds at most ${String(maximumChangesetEntries)} entries and ${String(maximumChangesetBytes)} bytes; split it with splitChangeset`,
    );
  }
};

/**
 * Apply one changeset directly to a provider: admitted before the first I/O,
 * streams staged first, phases in order (a later phase only once every entry
 * of the earlier one applied), every entry's outcome reported. No locks, no
 * derivatives, no change event — a provider with an authority above it takes
 * the authority's `apply` instead.
 *
 * @param provider - The provider, its paths the changeset's paths.
 * @param changeset - The entries and an abort signal; `lifecycle` has nothing to fence here.
 * @returns Every entry's outcome.
 * @public
 */
export const applyChangesetToProvider = async (
  provider: BatchPrimitives & Partial<Pick<FileSystemProvider, 'applyBatch'>>,
  changeset: Changeset,
): Promise<ChangesetReceipt> => {
  const { signal } = changeset;
  assertBoundedChangeset(changeset.entries);
  signal?.throwIfAborted();
  const entries = await Promise.all(
    changeset.entries.map(
      async (entry): Promise<ChangesetEntry> =>
        entry.op === 'write' && isStreamData(entry.data)
          ? { ...entry, data: await new Response(entry.data).blob() }
          : entry,
    ),
  );
  const phases = new Map<number, PhaseAdmission>();
  const batches = entries.map((entry) => {
    const batch = toBatchEntry(
      entry,
      entry.op === 'move' ? entry.from : entry.path,
      entry.op === 'move' ? entry.to : undefined,
    );
    const phase = entry.phase ?? 0;
    let admission = phases.get(phase);
    if (admission === undefined) {
      admission = new PhaseAdmission();
      phases.set(phase, admission);
    }
    const occupancy = occupancyOf(batch, '');
    const conflict = admission.conflict(occupancy);
    if (conflict !== undefined) {
      throw errnoError('EINVAL', `changeset entries of one phase overlap at '${conflict}'`);
    }
    admission.admit(occupancy);
    return batch;
  });
  const receipts = Array.from<ChangesetEntryReceipt>({ length: entries.length });
  let halted = false;
  for (const phase of [...phases.keys()].sort()) {
    const indexes = entries.flatMap((entry, index) => ((entry.phase ?? 0) === phase ? [index] : []));
    if (halted || signal?.aborted === true) {
      for (const index of indexes) {
        receipts[index] = {
          index,
          outcome: 'skipped',
          ...(signal?.aborted === true ? { error: signal.reason } : {}),
        };
      }
      continue;
    }
    const phaseEntries = indexes.map((index) => batches[index]!);
    const options = signal === undefined ? undefined : { signal };
    let results: BatchReceipt[];
    try {
      // oxlint-disable-next-line no-await-in-loop -- a later phase starts only once the earlier one applied.
      results = await (provider.applyBatch?.(phaseEntries, options) ??
        applyBatchWithPrimitives(provider, phaseEntries, options));
    } catch (error) {
      results = phaseEntries.map(() => ({ outcome: 'uncertain', error }));
    }
    for (const [position, index] of indexes.entries()) {
      const result = results[position] ?? { outcome: 'uncertain', error: new Error('Provider batch lost a receipt.') };
      receipts[index] = {
        index,
        outcome: result.outcome,
        ...(result.error === undefined ? {} : { error: result.error }),
        ...(result.kind === undefined ? {} : { kind: result.kind }),
      };
    }
    halted = indexes.some((index) => receipts[index]!.outcome !== 'applied');
  }
  return changesetReceipt(receipts);
};

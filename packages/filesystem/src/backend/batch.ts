/**
 * A provider batch built from a provider's own primitives (charter D2, D23).
 *
 * Every provider answers {@link FileSystemProvider.applyBatch}; one without a
 * native batch runs this. Entries of one batch name no path twice except an
 * append, and no entry lies inside another's subtree (the pipeline admitted
 * that), so they run in a rolling window; appends to one path keep their entry
 * order. Each entry's receipt is truthful: a provider refusal raised before
 * anything moved is `failed`, anything else after the entry began `uncertain`.
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import type { BatchEntry, BatchOptions, BatchReceipt } from '#changeset.js';
import { isRefusal } from '#changeset.js';
import type { FileSystemProvider } from '#types.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';

/** Writes one batch keeps in flight: enough to hide per-file latency, few enough to bound open handles. */
export const batchConcurrency = 8;

/** The primitives a batch built from them needs. */
export type BatchPrimitives = Pick<
  FileSystemProvider,
  'writeFile' | 'appendFile' | 'readFile' | 'stat' | 'exists' | 'mkdir' | 'unlink' | 'rmdir' | 'rename' | 'readdir'
> &
  Partial<Pick<FileSystemProvider, 'readdirEntries' | 'setFileMode'>>;

const errnoError = (code: string, description: string, path: string): Error =>
  Object.assign(new Error(`${code}: ${description} '${path}'`), { code });

const failedOrUncertain = (error: unknown, began: boolean): BatchReceipt =>
  !began || isRefusal(error) ? { outcome: 'failed', error } : { outcome: 'uncertain', error };

/**
 * Run `task` over `items` with at most `limit` in flight, results in input order.
 *
 * @param items - Inputs.
 * @param limit - Rolling window size.
 * @param task - Per-item work; must not reject.
 * @returns One result per input.
 */
export const mapRolling = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> => {
  const results = Array.from<Result>({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- one worker of a rolling window runs its items in turn.
      results[index] = await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * Bytes of a batch write, read out of a staged `Blob` when need be.
 *
 * @param data - In-hand bytes or a staged blob.
 * @returns The bytes.
 */
export const batchBytes = async (data: Uint8Array<ArrayBuffer> | Blob): Promise<Uint8Array<ArrayBuffer>> =>
  data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());

/**
 * Group a batch into tasks: each entry alone, except appends to one path, which
 * share one task that runs them in entry order.
 *
 * @param entries - The batch.
 * @returns Entry indexes per task, in first-entry order.
 */
export const batchTasks = (entries: readonly BatchEntry[]): number[][] => {
  const tasks: number[][] = [];
  const appendTask = new Map<string, number[]>();
  for (const [index, entry] of entries.entries()) {
    if (entry.op !== 'append') {
      tasks.push([index]);
      continue;
    }
    const existing = appendTask.get(entry.path);
    if (existing === undefined) {
      const task = [index];
      appendTask.set(entry.path, task);
      tasks.push(task);
    } else {
      existing.push(index);
    }
  }
  return tasks;
};

/**
 * Run a batch through `run`, one task per entry (appends to one path in order),
 * `limit` tasks in flight, stopping new entries once `signal` aborts.
 *
 * @param entries - The batch.
 * @param run - One entry's work, returning its receipt; must not reject.
 * @param options - Its abort signal and rolling window size (default {@link batchConcurrency}).
 * @returns One receipt per entry, in entry order.
 */
export const runBatch = async (
  entries: readonly BatchEntry[],
  run: (entry: BatchEntry) => Promise<BatchReceipt>,
  options?: BatchOptions & Readonly<{ limit?: number }>,
): Promise<BatchReceipt[]> => {
  const limit = options?.limit ?? batchConcurrency;
  const receipts = Array.from<BatchReceipt>({ length: entries.length });
  await mapRolling(batchTasks(entries), limit, async (task) => {
    for (const index of task) {
      if (options?.signal?.aborted === true) {
        receipts[index] = { outcome: 'failed', error: options.signal.reason };
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- appends to one path keep their entry order (D23).
      receipts[index] = await run(entries[index]!);
    }
  });
  return receipts;
};

/**
 * Remove a directory and everything below it through the primitives.
 *
 * @param provider - The provider.
 * @param path - Provider path of the directory.
 */
export const removeTree = async (provider: BatchPrimitives, path: string): Promise<void> => {
  const children = await readDirectoryEntries(provider, path);
  for (const child of children) {
    const childPath = joinRelativePath(path, child.name);
    // oxlint-disable-next-line no-await-in-loop -- a recursive removal walks its subtree in order.
    await (child.kind === 'dir' ? removeTree(provider, childPath) : provider.unlink(childPath));
  }
  await provider.rmdir(path);
};

/**
 * The kind at `path`, or `undefined` when nothing is there.
 *
 * @param provider - The provider.
 * @param path - Provider path.
 * @returns `'file'`, `'dir'` or `undefined`.
 */
const kindAt = async (provider: BatchPrimitives, path: string): Promise<'file' | 'dir' | undefined> => {
  try {
    const stat = await provider.stat(path);
    return stat.type;
  } catch (error) {
    const { code } = error as { code?: unknown };
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Apply one batch entry through the provider's primitives.
 *
 * @param provider - The provider.
 * @param entry - One entry, in provider paths.
 * @returns Its receipt; never rejects.
 */
export const applyEntryWithPrimitives = async (provider: BatchPrimitives, entry: BatchEntry): Promise<BatchReceipt> => {
  let began = false;
  try {
    switch (entry.op) {
      case 'write': {
        const existing = entry.create === true ? await kindAt(provider, entry.path) : undefined;
        if (existing !== undefined) {
          return { outcome: 'failed', error: errnoError('EEXIST', 'file already exists', entry.path) };
        }
        const bytes = await batchBytes(entry.data);
        began = true;
        await provider.writeFile(entry.path, bytes);
        if (entry.mode !== undefined) {
          try {
            await provider.setFileMode?.(entry.path, entry.mode);
          } catch (error) {
            /* The bytes landed; only their mode did not. */
            return { outcome: 'uncertain', error };
          }
        }
        return { outcome: 'applied', kind: 'file', ...(entry.create === true ? { created: true } : {}) };
      }
      case 'append': {
        began = true;
        if (provider.appendFile === undefined) {
          let existing: Uint8Array<ArrayBuffer>;
          try {
            existing = await provider.readFile(entry.path);
          } catch (error) {
            if ((error as { code?: unknown }).code !== 'ENOENT') {
              throw error;
            }
            existing = new Uint8Array();
          }
          const combined = new Uint8Array(existing.byteLength + entry.data.byteLength);
          combined.set(existing);
          combined.set(entry.data, existing.byteLength);
          await provider.writeFile(entry.path, combined);
        } else {
          await provider.appendFile(entry.path, entry.data);
        }
        return { outcome: 'applied', kind: 'file' };
      }
      case 'mkdir': {
        if (entry.recursive === true && (await kindAt(provider, entry.path)) === 'dir') {
          return { outcome: 'applied', kind: 'dir', created: false };
        }
        began = true;
        await provider.mkdir(entry.path, entry.recursive === true ? { recursive: true } : undefined);
        return { outcome: 'applied', kind: 'dir', created: true };
      }
      case 'delete': {
        const kind = await kindAt(provider, entry.path);
        if (kind === undefined) {
          return { outcome: 'failed', error: errnoError('ENOENT', 'no such file or directory', entry.path) };
        }
        if (entry.kind !== undefined && entry.kind !== kind) {
          return {
            outcome: 'failed',
            error:
              kind === 'dir'
                ? errnoError('EISDIR', 'is a directory', entry.path)
                : errnoError('ENOTDIR', 'not a directory', entry.path),
          };
        }
        began = true;
        if (kind === 'file') {
          await provider.unlink(entry.path);
        } else if (entry.recursive === true) {
          await removeTree(provider, entry.path);
        } else {
          await provider.rmdir(entry.path);
        }
        return { outcome: 'applied', kind };
      }
      case 'move': {
        const kind = await kindAt(provider, entry.from);
        if (kind === undefined) {
          return { outcome: 'failed', error: errnoError('ENOENT', 'no such file or directory', entry.from) };
        }
        const targetKind = await kindAt(provider, entry.to);
        if (targetKind !== undefined && (entry.replace !== true || kind !== 'file' || targetKind !== 'file')) {
          return { outcome: 'failed', error: errnoError('EEXIST', 'target already exists', entry.to) };
        }
        began = true;
        if (targetKind !== undefined) {
          /* No atomic replace through the primitives: the target goes first, so
           * any failure after it is uncertain, refusal or not. */
          await provider.unlink(entry.to);
          try {
            await provider.rename(entry.from, entry.to);
          } catch (error) {
            return { outcome: 'uncertain', error };
          }
          return { outcome: 'applied', kind };
        }
        await provider.rename(entry.from, entry.to);
        return { outcome: 'applied', kind };
      }
    }
  } catch (error) {
    return failedOrUncertain(error, began);
  }
};

/**
 * Apply a batch through the provider's primitives.
 *
 * @param provider - The provider.
 * @param entries - The batch, in provider paths.
 * @param options - Its abort signal.
 * @returns One receipt per entry, in entry order.
 */
export const applyBatchWithPrimitives = async (
  provider: BatchPrimitives,
  entries: readonly BatchEntry[],
  options?: BatchOptions,
): Promise<BatchReceipt[]> => runBatch(entries, async (entry) => applyEntryWithPrimitives(provider, entry), options);

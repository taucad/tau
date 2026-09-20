/**
 * Writing one tree over a checkout, and recovering the checkout when that fails.
 *
 * Moved out of `createRevisionActors` unchanged (W10.2) as a factory over the
 * seams the group actually reads: the checkout fence and the caller's capture
 * are *passed*, never re-created here, because holding one fence across the
 * capture and the apply is what closes the window `materializeTree` used to
 * refuse (W8c).
 */
import type { FileMode, PathPolicy } from '@taucad/filesystem';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionTreeEntry, RevisionTreeInput } from '#algorithms/index.js';
import { revisionTreeId } from '#git-tree-id.js';
import { equalBytes } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';
import { RevisionPortError } from '#revision-port.js';
import type { Checkout } from '#revision-port.js';
import type { RevisionActorsOptions, RevisionFileSystem, UseCheckoutFileSystem } from '#revision-effects.js';

/** Cancellation, the caller's own capture, and the brackets around one write. */
type MaterializeTreeOptions<Result> = Readonly<{
  signal?: AbortSignal;
  /**
   * The checkout's tree as the caller captured it, under the checkout fence
   * the caller is holding for this call.
   *
   * A caller that computes `target` *from* the live tree hands over the
   * capture it computed it from rather than paying a second walk for the
   * same bytes (CI4) — and, holding the fence across both, closes the window
   * a `validate` would otherwise have to refuse.
   */
  before?: ImmutableRevisionTree;
  validate?: (before: ImmutableRevisionTree) => Promise<void>;
  publish?: () => Promise<Result>;
}>;

/**
 * Build the apply/recover/materialize trio over one project's checkout seams.
 *
 * @param dependencies - Every value the group reads from the actor closure:
 *   how to open a checkout, how to capture one, the fence, the recorded-tree
 *   and object-format readers, and the temporary-sibling pair an apply stages
 *   through.
 * @returns `materializeTree`, and the entry primitives the evidence
 *   reconciliation reads through as well.
 */
export const createApplyTreeEffects = (
  dependencies: Readonly<{
    useFileSystem: UseCheckoutFileSystem;
    capture: (place: Checkout, modeBasis?: ImmutableRevisionTree) => Promise<ImmutableRevisionTree>;
    onApplyingTree: RevisionActorsOptions['onApplyingTree'];
    policy: PathPolicy;
    withCheckoutFence: <Result>(checkoutId: string, operation: () => Promise<Result>) => Promise<Result>;
    recordedTree: (tree: ImmutableRevisionTree) => Promise<ImmutableRevisionTree>;
    formatOf: () => Promise<ObjectFormat>;
    temporarySibling: (path: string) => string;
    unlinkIfPresent: (live: RevisionFileSystem, path: string) => Promise<void>;
  }>,
): Readonly<{
  equalEntry: (
    left: Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined,
    right: Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined,
  ) => boolean;
  entryOf: (
    live: RevisionFileSystem,
    path: string,
  ) => Promise<Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined>;
  materializeTree: <Result = void>(
    place: Checkout,
    target: ImmutableRevisionTree,
    materialization?: MaterializeTreeOptions<Result>,
  ) => Promise<Readonly<{ paths: readonly string[]; result: Result | undefined }>>;
}> => {
  const {
    useFileSystem,
    capture,
    onApplyingTree,
    policy,
    withCheckoutFence,
    recordedTree,
    formatOf,
    temporarySibling,
    unlinkIfPresent,
  } = dependencies;

  const equalEntry = (
    left: Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined,
    right: Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined,
  ): boolean =>
    left === undefined ? right === undefined : right?.mode === left.mode && equalBytes(left.content, right.content);

  const entryOf = async (
    live: RevisionFileSystem,
    path: string,
  ): Promise<Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }> | undefined> => {
    try {
      const content = await live.readFile(path);
      const mode = (await live.getFileMode?.(path)) ?? '100644';
      return { content, mode };
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return undefined;
      }
      throw error;
    }
  };

  /**
   * Stage every file's bytes before the first swap.
   *
   * The one step of the protocol with no order of its own, so it is one batch
   * where the surface has one; the rename / verify / swap chain that follows is
   * ordered and stays sequential (W8d).
   *
   * @param live - The checkout's tree.
   * @param files - Each changed file's bytes and the sibling they stage at.
   */
  const stageFiles = async (
    live: RevisionFileSystem,
    files: ReadonlyArray<Readonly<{ staged: string; entry: RevisionTreeEntry }>>,
  ): Promise<void> => {
    if (files.length === 0) {
      return;
    }
    if (live.writeFiles === undefined) {
      /* Every write settles before the first failure is raised, exactly as the
       * batch does: a write still in flight would land after the cleanup that
       * removes what this call staged. */
      const staged = await Promise.allSettled(
        files.map(async ({ staged: path, entry }) => live.writeFile(path, entry.content)),
      );
      const refused = staged.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (refused !== undefined) {
        throw refused.reason instanceof Error
          ? refused.reason
          : new Error('Staging the bytes of this change failed.', { cause: refused.reason });
      }
      return;
    }
    await live.writeFiles(Object.fromEntries(files.map(({ staged, entry }) => [staged, { content: entry.content }])));
  };

  /**
   * Write one tree over a checkout and verify exactly what it applied.
   *
   * The same primitive a settlement runs and a restore runs — applying a stored
   * revision *is* writing its tree — and it verifies only the paths it wrote,
   * because the preview pipeline writes its own outputs into the same root
   * unfenced and a whole-tree comparison failed on bytes this never touched.
   *
   * @param place - The checkout being written.
   * @param target - The tree it must carry.
   * @param applyOptions - Its already captured tree and optional cancellation signal.
   * @returns The paths this call wrote or removed, sorted.
   */
  const applyTree = async (
    place: Checkout,
    target: ImmutableRevisionTree,
    applyOptions: Readonly<{ from: ImmutableRevisionTree; signal?: AbortSignal }>,
  ): Promise<readonly string[]> =>
    useFileSystem(place, async (live) => {
      const { from, signal } = applyOptions;
      signal?.throwIfAborted();
      assertMaterializableRevisionTree(target, policy);
      const liveFiles = new Map(from.entries().map((entry) => [entry.path, entry]));
      const targetFiles = new Map(target.entries().map((entry) => [entry.path, entry]));
      const removedPaths = [...liveFiles.keys()]
        .filter((path) => !targetFiles.has(path))
        .sort((left, right) => right.length - left.length || right.localeCompare(left));
      const changedFiles = [...targetFiles].filter(([path, entry]) => {
        const current = liveFiles.get(path);
        return current === undefined || !equalBytes(current.content, entry.content) || current.mode !== entry.mode;
      });
      const writtenPaths = changedFiles.map(([path]) => path);
      const release = onApplyingTree?.(place, [...removedPaths, ...writtenPaths].sort());
      try {
        for (const path of removedPaths) {
          signal?.throwIfAborted();
          const expected = liveFiles.get(path);
          const backup = temporarySibling(path);
          // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
          await live.rename(path, backup);
          // oxlint-disable-next-line no-await-in-loop -- the moved bytes prove what the rename removed.
          const moved = await entryOf(live, backup);
          if (!equalEntry(moved, expected)) {
            // oxlint-disable-next-line no-await-in-loop -- recovery belongs to this ordered mutation.
            if (!(await live.exists(path))) {
              // oxlint-disable-next-line no-await-in-loop -- restore the concurrent winner before refusing the operation.
              await live.rename(backup, path);
            }
            throw new RevisionPortError('CHECKOUT_CONFLICT', `${path} changed while these files were being updated.`);
          }
          // oxlint-disable-next-line no-await-in-loop -- the revision retains the removed bytes; the temporary copy is no longer needed.
          await live.unlink(backup);
        }
        const stagedFiles = changedFiles.map(([path, entry]) => ({ path, entry, staged: temporarySibling(path) }));
        signal?.throwIfAborted();
        await stageFiles(live, stagedFiles);
        try {
          for (const { path, entry, staged } of stagedFiles) {
            signal?.throwIfAborted();
            const current = liveFiles.get(path);
            const backup = current === undefined ? undefined : temporarySibling(path);
            let published = false;
            try {
              if (live.setFileMode !== undefined) {
                // oxlint-disable-next-line no-await-in-loop -- mode belongs to the staged file.
                await live.setFileMode(staged, entry.mode);
              }
              if (backup !== undefined) {
                // oxlint-disable-next-line no-await-in-loop -- moving first lets us verify the exact bytes being replaced.
                await live.rename(path, backup);
                // oxlint-disable-next-line no-await-in-loop -- the moved bytes are the replacement precondition.
                const moved = await entryOf(live, backup);
                if (!equalEntry(moved, current)) {
                  // oxlint-disable-next-line no-await-in-loop -- recovery belongs to this ordered mutation.
                  if (!(await live.exists(path))) {
                    // oxlint-disable-next-line no-await-in-loop -- put the concurrent winner back before refusing.
                    await live.rename(backup, path);
                  }
                  throw new RevisionPortError(
                    'CHECKOUT_CONFLICT',
                    `${path} changed while these files were being updated.`,
                  );
                }
                // oxlint-disable-next-line no-await-in-loop -- this is the new-file compare step.
              } else if (await live.exists(path)) {
                throw new RevisionPortError(
                  'CHECKOUT_CONFLICT',
                  `${path} was created while these files were being updated.`,
                );
              }
              // oxlint-disable-next-line no-await-in-loop -- the target must still be absent immediately before publication.
              if (await live.exists(path)) {
                throw new RevisionPortError(
                  'CHECKOUT_CONFLICT',
                  `${path} changed while these files were being updated.`,
                );
              }
              // oxlint-disable-next-line no-await-in-loop -- one atomic rename publishes the already-written file.
              await live.rename(staged, path);
              published = true;
            } finally {
              if (backup !== undefined) {
                /* The bytes this replacement moved aside go back unless the swap
                 * that replaces them completed, or something else already took
                 * the path — so an apply that stops mid-file leaves the file it
                 * was replacing rather than a hole where neither version is. */
                // oxlint-disable-next-line no-await-in-loop -- the backup belongs to this ordered mutation.
                const replaced = published || (await live.exists(path));
                // oxlint-disable-next-line no-await-in-loop -- either the revision retains the prior bytes or the checkout must.
                await (replaced ? unlinkIfPresent(live, backup) : live.rename(backup, path));
              }
            }
          }
        } finally {
          /* Bytes staged and never published are this call's litter, swept
           * before the verification re-reads the tree they would appear in. */
          for (const { staged } of stagedFiles) {
            // oxlint-disable-next-line no-await-in-loop -- one ordered sweep of what this call staged.
            await unlinkIfPresent(live, staged);
          }
        }
        signal?.throwIfAborted();
        const reread = await capture(place, target);
        const verified = new Map(reread.entries().map((entry) => [entry.path, entry]));
        const unverified = [
          ...removedPaths.filter((path) => verified.has(path)),
          ...writtenPaths.filter((path) => {
            const applied = verified.get(path);
            const wanted = targetFiles.get(path);
            return (
              applied === undefined ||
              wanted === undefined ||
              !equalBytes(applied.content, wanted.content) ||
              applied.mode !== wanted.mode
            );
          }),
        ].sort();
        if (unverified.length > 0) {
          throw new RevisionPortError(
            'ENGINE_FAILED',
            `The files you have open did not keep the paths this change wrote: ${unverified.join(', ')}`,
          );
        }
        return [...removedPaths, ...writtenPaths].sort();
      } finally {
        release?.();
      }
    });

  const recoveryTree = (
    before: ImmutableRevisionTree,
    target: ImmutableRevisionTree,
    current: ImmutableRevisionTree,
  ): ImmutableRevisionTree => {
    const beforeFiles = new Map(before.entries().map((entry) => [entry.path, entry]));
    const targetFiles = new Map(target.entries().map((entry) => [entry.path, entry]));
    const currentFiles = new Map(current.entries().map((entry) => [entry.path, entry]));
    const affected = new Set([...beforeFiles.keys(), ...targetFiles.keys()]);
    for (const path of affected) {
      const beforeEntry = beforeFiles.get(path);
      const targetEntry = targetFiles.get(path);
      if (equalEntry(beforeEntry, targetEntry) || !equalEntry(currentFiles.get(path), targetEntry)) {
        continue;
      }
      if (beforeEntry === undefined) {
        currentFiles.delete(path);
      } else {
        currentFiles.set(path, beforeEntry);
      }
    }
    return new ImmutableRevisionTree(
      [...currentFiles.values()].map((entry) => [entry.path, entry.content, entry.mode] as RevisionTreeInput),
    );
  };

  /**
   * Apply bytes and their graph update as one checkout-owned recoverable operation.
   *
   * @param place - The checkout being written.
   * @param target - The tree it must carry.
   * @param materialization - Cancellation, the caller's own capture, and the
   *   validation and graph update that bracket the write.
   * @returns The paths written and whatever `publish` answered.
   */
  const materializeTree = async <Result = void>(
    place: Checkout,
    target: ImmutableRevisionTree,
    materialization: MaterializeTreeOptions<Result> = {},
  ): Promise<Readonly<{ paths: readonly string[]; result: Result | undefined }>> => {
    const materialize = async (
      before: ImmutableRevisionTree,
    ): Promise<Readonly<{ paths: readonly string[]; result: Result | undefined }>> => {
      await materialization.validate?.(before);
      try {
        /* `applyTree` verifies the paths it wrote by re-reading them (C3); that
         * re-read is the settlement's second and last walk, so nothing here
         * captures the tree again to compare it a second time. */
        const paths = await applyTree(place, target, { from: before, signal: materialization.signal });
        materialization.signal?.throwIfAborted();
        return { paths, result: await materialization.publish?.() };
      } catch (error) {
        try {
          const current = await capture(place, before);
          const recovery = recoveryTree(before, target, current);
          if (
            revisionTreeId(await recordedTree(current), await formatOf()) !==
            revisionTreeId(await recordedTree(recovery), await formatOf())
          ) {
            await applyTree(place, recovery, { from: current });
          }
        } catch (recoveryError) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new AggregateError(
            [error, recoveryError],
            `${reason} The prior files could not be restored completely.`,
          );
        }
        throw error;
      }
    };
    return materialization.before === undefined
      ? withCheckoutFence(place.id, async () => materialize(await capture(place)))
      : materialize(materialization.before);
  };

  return { equalEntry, entryOf, materializeTree };
};

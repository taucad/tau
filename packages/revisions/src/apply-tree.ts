/**
 * Writing one tree over a checkout, and recovering the checkout when that fails.
 *
 * Moved out of `createRevisionActors` unchanged (W10.2) as a factory over the
 * seams the group actually reads: the checkout fence and the caller's capture
 * are *passed*, never re-created here, because holding one fence across the
 * capture and the apply is what closes the window `materializeTree` used to
 * refuse (W8c).
 */
import type { ChangesetEntry, ChangesetEntryReceipt, FileMode, PathPolicy } from '@taucad/filesystem';
import { applyChangesetToProvider, maximumChangesetEntries, splitChangeset, workerTimings } from '@taucad/filesystem';
import { walk } from '@taucad/filesystem/content-ops';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionTreeEntry, RevisionTreeInput } from '#algorithms/index.js';
import { equalBytes } from '#object-hash.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';
import { RevisionPortError } from '#revision-port.js';
import type { Checkout } from '#revision-port.js';
import { parseTemporarySibling } from '#revision-temporary-sibling.js';
import type {
  ApplyingTreePurpose,
  RevisionActorsOptions,
  RevisionFileSystem,
  UseCheckoutFileSystem,
} from '#revision-effects.types.js';

/**
 * Recover a checkout an apply died in: put back every backup sibling whose
 * original is missing, and remove every other staged or backup sibling.
 *
 * An apply moves a replaced file aside before it publishes its staged bytes,
 * so between the two the path is absent and the backup is its only copy; this
 * leaves every path holding its old bytes or its new ones (I1). Exported at
 * `@taucad/revisions/apply-tree` beside the apply so the filesystem scenario
 * harness recovers a killed apply exactly as an open does.
 *
 * @param live - The checkout's tree.
 * @param admits - Whether the walk descends into a path (the checkout's versioned paths).
 * @public
 */
export const sweepTemporarySiblings = async (
  live: RevisionFileSystem,
  admits: (path: string) => boolean,
): Promise<void> => {
  try {
    for await (const entry of walk(live, '', { admits })) {
      const temporary = entry.kind === 'file' ? parseTemporarySibling(entry.relativePath) : undefined;
      if (temporary !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- each sibling is recovered as the walk reaches it.
        const originalPresent = await live.exists(temporary.originalPath);
        try {
          // oxlint-disable-next-line no-await-in-loop -- a backup is the only copy when its original is absent.
          await (temporary.role === 'backup' && !originalPresent
            ? live.rename(entry.relativePath, temporary.originalPath)
            : live.unlink(entry.relativePath));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      }
    }
  } catch (error) {
    /* A listing is a snapshot: an entry can be gone before the sweep reaches
     * it. Litter nobody removed is swept at the next open, so a vanished
     * directory is not a project that cannot be opened. */
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as { name?: unknown }).name !== 'NotFoundError') {
      throw error;
    }
  }
};

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
  /** What the host's `onApplyingTree` bracket is told this write is; `apply` unless a fill says otherwise. */
  purpose?: ApplyingTreePurpose;
}>;

/**
 * Build the apply/recover/materialize trio over one project's checkout seams.
 *
 * Exported at `@taucad/revisions/apply-tree` so the filesystem scenario
 * harness (charter W0, S3/S16/S17) drives this exact apply protocol on real
 * OPFS rather than a copy of it; `createRevisionActors` is its production caller.
 *
 * @public
 * @param dependencies - Every value the group reads from the actor closure:
 *   how to open a checkout, how to capture one, the fence, the checkout's
 *   tree-id reader, and the temporary-sibling pair an apply stages through.
 * @returns `materializeTree`, and the entry primitives the evidence
 *   reconciliation reads through as well.
 */
export const createApplyTreeEffects = (
  dependencies: Readonly<{
    useFileSystem: UseCheckoutFileSystem;
    capture: (place: Checkout, modeBasis?: ImmutableRevisionTree) => Promise<ImmutableRevisionTree>;
    onApplyingTree: RevisionActorsOptions['onApplyingTree'];
    /** Prepare the verified target before exposing bytes, and recheck its identity before publication. */
    prepareTarget?: (
      place: Checkout,
      target: ImmutableRevisionTree,
      signal: AbortSignal | undefined,
    ) => Promise<Readonly<{ tree: ImmutableRevisionTree; verify?: () => Promise<void> }>>;
    policy: PathPolicy;
    withCheckoutFence: <Result>(checkoutId: string, operation: () => Promise<Result>) => Promise<Result>;
    /** The tree id a capture of this checkout records as, through its warm memo (E3). */
    checkoutTreeId: (checkoutId: string, tree: ImmutableRevisionTree) => Promise<string>;
    temporarySibling: (path: string, role: 'staged' | 'backup') => string;
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
    checkoutTreeId,
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
   * Apply entries as bounded changesets through the checkout surface's own
   * `apply` (one lock set, one change event and one cross-tab notice each), or
   * straight to a bare provider that has no authority above it.
   *
   * @param live - The checkout's tree.
   * @param changesets - Each changeset's entries, every one within the bound.
   * @param signal - Abort stops later changesets and later phases.
   * @returns Every entry's receipt, in the order given.
   */
  const applyChangesets = async (
    live: RevisionFileSystem,
    changesets: ReadonlyArray<readonly ChangesetEntry[]>,
    signal: AbortSignal | undefined,
  ): Promise<ChangesetEntryReceipt[]> => {
    const receipts: ChangesetEntryReceipt[] = [];
    for (const entries of changesets) {
      if (entries.length === 0) {
        continue;
      }
      /* An abort between changesets skips the rest rather than throwing, so a
       * caller still holds a receipt per entry and can undo what landed. */
      if (signal?.aborted === true) {
        receipts.push(
          ...entries.map((_, index): ChangesetEntryReceipt => ({ index, outcome: 'skipped', error: signal.reason })),
        );
        continue;
      }
      const changeset = { entries, ...(signal === undefined ? {} : { signal }) };
      // oxlint-disable-next-line no-await-in-loop -- bounded changesets land in order so a save can interleave (D2).
      const receipt = await (live.apply === undefined
        ? applyChangesetToProvider(live, changeset)
        : live.apply(changeset));
      receipts.push(...receipt.entries);
    }
    return receipts;
  };

  /**
   * Raise the first entry that did not apply: a create that found its path
   * taken is a checkout conflict, anything else the provider's own error.
   *
   * @param receipts - Receipts, in the order of `paths`.
   * @param paths - The checkout path each receipt is for.
   */
  const raiseRefusal = (receipts: readonly ChangesetEntryReceipt[], paths: readonly string[]): void => {
    const index = receipts.findIndex(({ outcome }) => outcome !== 'applied');
    if (index === -1) {
      return;
    }
    const { error } = receipts[index]!;
    const others = paths.filter(
      (_, position) =>
        position !== index && receipts[position]?.outcome !== undefined && receipts[position].outcome !== 'applied',
    );
    const also =
      others.length === 0
        ? ''
        : ` ${String(others.length)} more ${others.length === 1 ? 'file was' : 'files were'} refused: ${others.join(', ')}.`;
    if ((error as { code?: unknown } | undefined)?.code === 'EEXIST') {
      throw new RevisionPortError(
        'CHECKOUT_CONFLICT',
        `${paths[index]!} was created while these files were being updated.${also}`,
      );
    }
    /* The provider's error is thrown unchanged: a DOMException's message cannot
     * be assigned, so the other refusals are logged instead of appended. */
    if (also !== '') {
      console.warn(`[revisions] ${paths[index]!} could not be published.${also}`);
    }
    throw error instanceof Error ? error : new Error(`Writing ${paths[index]!} did not apply.`, { cause: error });
  };

  /**
   * Move each path aside to its backup and prove the bytes moved are the ones
   * this apply expected to replace. On a mismatch or a refusal every backup
   * goes back where nothing took its path since, and the apply stops.
   *
   * @param live - The checkout's tree.
   * @param moves - Each live path, its expected entry and its backup sibling.
   * @param signal - Abort stops later changesets.
   */
  const moveAsideVerified = async (
    live: RevisionFileSystem,
    moves: ReadonlyArray<Readonly<{ path: string; backup: string; expected: RevisionTreeEntry | undefined }>>,
    signal: AbortSignal | undefined,
  ): Promise<void> => {
    const receipts = await applyChangesets(
      live,
      splitChangeset(moves.map(({ path, backup }): ChangesetEntry => ({ op: 'move', from: path, to: backup }))),
      signal,
    );
    const moved = moves.filter((_, index) => receipts[index]?.outcome === 'applied');
    const verified = await Promise.all(
      moved.map(async (move) => equalEntry(await entryOf(live, move.backup), move.expected)),
    );
    const changed = moved.find((_, index) => !verified[index]);
    if (changed === undefined && moved.length === moves.length) {
      return;
    }
    const free = await Promise.all(moved.map(async ({ path }) => !(await live.exists(path))));
    await applyChangesets(
      live,
      splitChangeset(
        moved.flatMap(({ path, backup }, index): ChangesetEntry[] =>
          free[index] === true ? [{ op: 'move', from: backup, to: path }] : [],
        ),
      ),
      undefined,
    );
    if (changed !== undefined) {
      throw new RevisionPortError('CHECKOUT_CONFLICT', `${changed.path} changed while these files were being updated.`);
    }
    raiseRefusal(
      receipts,
      moves.map(({ path }) => path),
    );
  };

  /**
   * Remove the directories that removing `removedPaths` left empty, as Git does.
   *
   * Without this a directory the tree dropped stays behind empty, and a revision
   * that turns `foo/bar` into a file `foo` finds `foo` already taken. Deepest
   * first, so a parent is tried after its children; the checkout root and every
   * directory the target still writes into are never tried. A directory that
   * still holds anything — an unversioned or ignored file, or a person's own
   * empty folder — refuses a non-recursive `rmdir` and stays, as does a path
   * something else already made a file again.
   *
   * @param live - The checkout's tree.
   * @param removedPaths - The files this apply removed.
   * @param targetPaths - Every file the target tree holds.
   */
  const pruneEmptiedDirectories = async (
    live: RevisionFileSystem,
    removedPaths: readonly string[],
    targetPaths: Iterable<string>,
  ): Promise<void> => {
    const parentsOf = (path: string): string[] =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, index, segments) => segments.slice(0, index + 1).join('/'));
    const kept = new Set([...targetPaths].flatMap((path) => parentsOf(path)));
    const emptied = [...new Set(removedPaths.flatMap((path) => parentsOf(path)))]
      .filter((directory) => !kept.has(directory))
      .sort((left, right) => right.length - left.length || right.localeCompare(left));
    for (const directory of emptied) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- a child must go before its parent can be empty.
        await live.rmdir(directory);
      } catch (error) {
        const code = typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
        if (code !== 'ENOTEMPTY' && code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
      }
    }
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
    applyOptions: Readonly<{ from: ImmutableRevisionTree; signal?: AbortSignal; purpose?: ApplyingTreePurpose }>,
  ): Promise<readonly string[]> =>
    useFileSystem(place, async (live) => {
      const { from, signal, purpose = 'apply' } = applyOptions;
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
      const release = onApplyingTree?.(place, [...removedPaths, ...writtenPaths].sort(), { purpose });
      const heldAt = workerTimings.now();
      try {
        /* Removals: every removed file moves aside, its moved bytes prove it
         * was the file this apply meant to remove, and the backups go — a
         * changeset per bound for each step, not a lock set per file. */
        signal?.throwIfAborted();
        const removals = removedPaths.map((path) => ({
          path,
          backup: temporarySibling(path, 'backup'),
          expected: liveFiles.get(path),
        }));
        await moveAsideVerified(live, removals, signal);
        raiseRefusal(
          await applyChangesets(
            live,
            splitChangeset(
              removals.map(({ backup }): ChangesetEntry => ({ op: 'delete', path: backup, kind: 'file' })),
            ),
            undefined,
          ),
          removals.map(({ backup }) => backup),
        );
        await pruneEmptiedDirectories(live, removedPaths, targetFiles.keys());
        signal?.throwIfAborted();

        /* A path the checkout did not hold has nothing to move aside or verify:
         * it is one `create` write with its mode, refused if anything took it
         * since the capture, and no checkout sibling. The provider publishes a
         * create whole (OPFS stages it under `.tau-staging` and moves it in),
         * so a killed apply leaves the path absent or new, never empty (I1). */
        const created = changedFiles.filter(([path]) => !liveFiles.has(path));
        raiseRefusal(
          await applyChangesets(
            live,
            splitChangeset(
              created.map(
                ([path, entry]): ChangesetEntry => ({
                  op: 'write',
                  path,
                  data: entry.content,
                  mode: entry.mode,
                  create: true,
                }),
              ),
            ),
            signal,
          ),
          created.map(([path]) => path),
        );

        /* A replacement stages its bytes beside the file, moves the file aside
         * and verifies it, then publishes the staged sibling with one native
         * move and drops the backup a phase later — so the checkout holds the
         * old bytes or the new ones at every instant (I1). */
        const replaced = changedFiles
          .filter(([path]) => liveFiles.has(path))
          .map(([path, entry]) => ({
            path,
            entry,
            staged: temporarySibling(path, 'staged'),
            backup: temporarySibling(path, 'backup'),
            expected: liveFiles.get(path),
          }));
        const staged = new Set<string>();
        const published = new Set<string>();
        try {
          const stagedReceipts = await applyChangesets(
            live,
            splitChangeset(
              replaced.map(
                ({ staged: stagedPath, entry }): ChangesetEntry => ({
                  op: 'write',
                  path: stagedPath,
                  data: entry.content,
                  mode: entry.mode,
                  create: true,
                }),
              ),
            ),
            signal,
          );
          for (const [index, { staged: stagedPath }] of replaced.entries()) {
            if (stagedReceipts[index]?.outcome !== 'failed') {
              staged.add(stagedPath);
            }
          }
          raiseRefusal(
            stagedReceipts,
            replaced.map(({ staged: stagedPath }) => stagedPath),
          );
          await moveAsideVerified(live, replaced, signal);
          /* Each replacement is one publish and, a phase later, one backup removal. */
          const pairs = Math.floor(maximumChangesetEntries / 2);
          const chunks: Array<typeof replaced> = [];
          for (let start = 0; start < replaced.length; start += pairs) {
            chunks.push(replaced.slice(start, start + pairs));
          }
          const publishReceipts = await applyChangesets(
            live,
            chunks.map((chunk) => [
              ...chunk.map(({ staged: from, path }): ChangesetEntry => ({ op: 'move', from, to: path })),
              ...chunk.map(({ backup }): ChangesetEntry => ({ op: 'delete', path: backup, kind: 'file', phase: 1 })),
            ]),
            undefined,
          );
          const publications: ChangesetEntryReceipt[] = [];
          const backupsDropped = new Set<string>();
          let offset = 0;
          for (const chunk of chunks) {
            publications.push(...publishReceipts.slice(offset, offset + chunk.length));
            for (const [position, { backup }] of chunk.entries()) {
              if (publishReceipts[offset + chunk.length + position]?.outcome === 'applied') {
                backupsDropped.add(backup);
              }
            }
            offset += chunk.length * 2;
          }
          for (const [index, { staged: from }] of replaced.entries()) {
            if (publications[index]?.outcome === 'applied') {
              published.add(from);
            }
          }
          /* A replacement whose publish did not land puts its backup back; one
           * that did drops a backup its removal phase skipped. */
          await applyChangesets(
            live,
            splitChangeset(
              replaced
                .filter(({ staged: from }) => !published.has(from))
                .map(({ backup, path }): ChangesetEntry => ({ op: 'move', from: backup, to: path })),
            ),
            undefined,
          );
          await Promise.all(
            replaced
              .filter(({ staged: from, backup }) => published.has(from) && !backupsDropped.has(backup))
              .map(async ({ backup }) => unlinkIfPresent(live, backup)),
          );
          raiseRefusal(
            publications,
            replaced.map(({ path }) => path),
          );
        } finally {
          /* Bytes staged and never published are this call's litter, swept
           * before the verification re-reads the tree they would appear in. */
          await Promise.all(
            [...staged].filter((path) => !published.has(path)).map(async (path) => unlinkIfPresent(live, path)),
          );
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
        workerTimings.record('apply.hold', heldAt);
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
      const prepared = (await dependencies.prepareTarget?.(place, target, materialization.signal)) ?? {
        tree: target,
      };
      materialization.signal?.throwIfAborted();
      const recoveryTarget = prepared.tree;
      try {
        /* `applyTree` verifies the paths it wrote by re-reading them (C3); that
         * re-read is the settlement's second and last walk, so nothing here
         * captures the tree again to compare it a second time. */
        const paths = await applyTree(place, prepared.tree, {
          from: before,
          ...(materialization.signal === undefined ? {} : { signal: materialization.signal }),
          ...(materialization.purpose === undefined ? {} : { purpose: materialization.purpose }),
        });
        materialization.signal?.throwIfAborted();
        await prepared.verify?.();
        materialization.signal?.throwIfAborted();
        return { paths, result: await materialization.publish?.() };
      } catch (error) {
        try {
          const current = await capture(place, before);
          const recovery = recoveryTree(before, recoveryTarget, current);
          if ((await checkoutTreeId(place.id, current)) !== (await checkoutTreeId(place.id, recovery))) {
            await applyTree(place, recovery, {
              from: current,
              ...(materialization.purpose === undefined ? {} : { purpose: materialization.purpose }),
            });
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

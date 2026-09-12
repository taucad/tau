/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * Host-neutral turn recorder over {@link RevisionPort}.
 *
 * It lives here rather than in `@taucad/filesystem` because a revision's id is
 * its commit id, and the encoder that computes one is this package's — a
 * recorder left behind in the library would have to import back across the
 * dependency it already sits on top of (S-REVID, N24–N26).
 */

import {
  captureRevisionTree,
  MaterializedWorkspaceAuthority,
  mergeRevisionTrees,
  revisionId,
} from '@taucad/filesystem';
import { pathRegistry } from '@taucad/filesystem/path-registry';
import type {
  ImmutableRevisionTree,
  MaterializedWorkspace,
  MaterializedWorkspaceId,
  MaterializedWorkspaceMode,
  RevisionId,
  RevisionTreeConflict,
  RootedFileSystem,
} from '@taucad/filesystem';
import { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
import type {
  BranchHeadUpdateResult,
  Revision,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
} from '#revision-authority.js';
import { createPortRevisionPersistence } from '#revision-persistence.js';
import type { RevisionPersistenceReceipt } from '#revision-persistence.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';

/**
 * Where one turn writes: `local` binds the live tree in place, `branch`
 * materializes an isolated copy that finalization merges back. @public
 */
export type TurnRevisionMode = MaterializedWorkspaceMode;

/**
 * Rooted paths no turn capture ever walks: every path registry row whose bytes
 * are not versioned, and nothing else.
 *
 * Derived rather than restated, because a capture list that drifted from the
 * engine's ignore file is exactly how `.jj/repo/store/git/HEAD`, `.git/HEAD`,
 * `.tau/artifacts/**` and `node_modules` reached a captured tree. In local mode
 * the live root *is* the agent tree, so an unexcluded entry rides straight into
 * the revision and lands in `changedPaths`. @public
 */
export const defaultTurnCaptureExclusions: readonly string[] = Object.freeze(
  pathRegistry.filter((row) => !row.versioned).map((row) => row.prefix),
);

/** Dependencies for one turn-revision recorder over one authoritative root. @public */
export type TurnRevisionRecorderOptions = Readonly<{
  /** The authoritative live root every turn descends from and merges back into. */
  filesystem: RootedFileSystem;
  /** Defaults to a `.tau/workspaces` authority over `filesystem`. */
  workspaces?: MaterializedWorkspaceAuthority;
  /** Defaults to an authority over {@link TurnRevisionRecorderOptions.port}. */
  revisions?: RevisionAuthority;
  /**
   * The content-addressed store every revision id is minted by.
   *
   * Defaults to the `isomorphic-git` adapter over `filesystem`, so the same
   * tree and headers name the same revision in a page, in a daemon and in the
   * desktop utility. A host with a native-Git repository passes that port
   * instead — **once, at host composition**, never per turn.
   */
  port?: RevisionPort;
  /** Defaults to {@link defaultTurnCaptureExclusions}. */
  excludedDirectories?: readonly string[];
}>;

/** Open one turn workspace over the current live tree. @public */
export type OpenTurnWorkspaceInput = Readonly<{
  workspaceId: MaterializedWorkspaceId;
  mode: TurnRevisionMode;
  /** The lineage this turn belongs to: a chat id in the browser, a session id on a host. */
  lane: string;
  /** Recorded as the base revision's actor; the turn itself carries its own actor. */
  actorId: string;
  /**
   * The revision whose tree this turn descends from. Absent, the base is the
   * live tree as it stands. Present, it selects the base **tree**, which is
   * what makes a candidate checkout of an earlier revision possible.
   */
  baseRevisionId?: RevisionId;
  /** Defaults to `Base for chat <lane>`. */
  summary?: string;
}>;

/** One prepared turn: its writable root, and the branch its revision publishes onto. @public */
export type PreparedTurn = Readonly<{
  workspace: MaterializedWorkspace;
  branch: RevisionBranchName;
}>;

/** Settle one turn into the live tree and mint its revision. @public */
export type FinalizeTurnRevisionInput = Readonly<{
  lane: string;
  workspace: MaterializedWorkspace;
  actorId: string;
  runId?: string;
  summary: string;
}>;

/** Three-way merge of one turn tree against the live root. @public */
export type TurnMergeInput = Readonly<{
  base: ImmutableRevisionTree;
  agent: RootedFileSystem;
  mode: TurnRevisionMode;
}>;

/** Outcome of applying one turn tree to the live root. @public */
export type TurnMergeResult =
  | Readonly<{ status: 'merged'; tree: ImmutableRevisionTree }>
  | Readonly<{ status: 'conflicted'; conflicts: readonly RevisionTreeConflict[] }>;

/** Outcome of one finalized turn. @public */
export type TurnRevisionResult =
  | Readonly<{ status: 'conflicted'; conflicts: readonly RevisionTreeConflict[] }>
  | Readonly<{
      status: 'recorded';
      revision: Revision;
      branch: RevisionBranchName;
      publication: BranchHeadUpdateResult;
      /** Paths that differ between the turn's base tree and its recorded tree. */
      changedPaths: readonly string[];
      persistence: RevisionPersistenceReceipt | undefined;
    }>;

/** Where `prepare` records the branch this turn publishes onto, in workspace-private metadata. */
const preparedBranchPath = 'branch';

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

/** Paths whose bytes differ between two immutable trees, sorted. */
const changedPathsBetween = (base: ImmutableRevisionTree, next: ImmutableRevisionTree): readonly string[] => {
  const baseFiles = new Map(base.entries().map((entry) => [entry.path, entry.content]));
  const nextFiles = new Map(next.entries().map((entry) => [entry.path, entry.content]));
  return [...new Set([...baseFiles.keys(), ...nextFiles.keys()])]
    .filter((path) => {
      const before = baseFiles.get(path);
      const after = nextFiles.get(path);
      return before === undefined || after === undefined || !equalBytes(before, after);
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

/**
 * The publication lane one chat's revisions land on.
 *
 * One branch per lane, not per turn workspace: identity is content-addressed
 * now, so N turns on one chat are N revisions on one branch, each parented on
 * the last. A branch per workspace was the only way to keep a per-workspace id
 * from colliding with itself, and that id is gone.
 *
 * @param lane - The chat or session the turn belongs to.
 * @returns The branded branch name.
 * @public
 */
export const turnRevisionBranch = (lane: string): RevisionBranchName => revisionBranchName(`agent/${lane}`);

/**
 * The trunk. A project's live tree starts on it, a direct turn records onto it,
 * and every candidate branch parents on its head, which is what gives two chats
 * in one project a merge base (operator decisions 2026-09-09, question 11).
 *
 * @public
 */
export const mainRevisionBranch: RevisionBranchName = revisionBranchName('main');

/**
 * Host-neutral prepare → capture → merge → finalize for one agent turn.
 *
 * Every primitive below it is already host-neutral, so the same recorder backs a
 * browser tab's rooted bridge filesystem and a daemon's `NodeFsProvider` root;
 * it holds no React, DOM or browser-only state. Callers own admission, locking
 * and notification.
 *
 * @public
 * @example <caption>Record one direct-mode turn</caption>
 * ```typescript
 * import { materializedWorkspaceId } from '@taucad/filesystem';
 * import type { RootedFileSystem } from '@taucad/filesystem';
 * import { TurnRevisionRecorder } from '@taucad/revisions';
 *
 * declare const filesystem: RootedFileSystem;
 * const recorder = new TurnRevisionRecorder({ filesystem });
 * const { workspace } = await recorder.prepare({
 *   workspaceId: materializedWorkspaceId('run_1'),
 *   mode: 'local',
 *   lane: 'chat_1',
 *   actorId: 'project_1',
 * });
 * const result = await recorder.finalize({
 *   lane: 'chat_1',
 *   workspace,
 *   actorId: 'agent',
 *   summary: 'Add a cube',
 * });
 * ```
 */
export class TurnRevisionRecorder {
  readonly #filesystem: RootedFileSystem;
  readonly #workspaces: MaterializedWorkspaceAuthority;
  readonly #revisions: RevisionAuthority;
  readonly #port: RevisionPort;
  readonly #excludedDirectories: readonly string[];

  public constructor(options: TurnRevisionRecorderOptions) {
    this.#filesystem = options.filesystem;
    this.#workspaces = options.workspaces ?? new MaterializedWorkspaceAuthority({ filesystem: options.filesystem });
    this.#port = options.port ?? createIsomorphicGitRevisionPort({ filesystem: options.filesystem });
    /* One store. The authority's graph and its branch refs are a projection of
     * the content-addressed store the ids come from — not a second copy of
     * every tree beside it (R-W1 §6.1). */
    this.#revisions =
      options.revisions ?? new RevisionAuthority({ persistence: createPortRevisionPersistence({ port: this.#port }) });
    this.#excludedDirectories = options.excludedDirectories ?? defaultTurnCaptureExclusions;
  }

  /** The authoritative live root. */
  public get filesystem(): RootedFileSystem {
    return this.#filesystem;
  }

  /** The materialized-workspace authority this recorder prepares through. */
  public get workspaces(): MaterializedWorkspaceAuthority {
    return this.#workspaces;
  }

  /** The revision graph this recorder mints into. */
  public get revisions(): RevisionAuthority {
    return this.#revisions;
  }

  /** The content-addressed store every revision id comes from. */
  public get port(): RevisionPort {
    return this.#port;
  }

  /**
   * Capture one rooted tree with this recorder's exclusions.
   *
   * One walker, shared with the materialized-workspace substrate: it already
   * skips entries that vanish between the listing and the read, which is what
   * keeps an in-flight atomic write's `.<name>.<pid>.<uuid>.tmp` sibling from
   * failing workspace admission on a node-backed folder.
   *
   * @param filesystem - The rooted view to walk; the live root by default.
   * @returns The captured immutable tree.
   */
  public async captureTree(filesystem: RootedFileSystem = this.#filesystem): Promise<ImmutableRevisionTree> {
    return captureRevisionTree(filesystem, {
      exclude: (path) =>
        this.#excludedDirectories.some((excluded) => path === excluded || path.startsWith(`${excluded}/`)),
    });
  }

  /**
   * Open the turn's writable root over its base revision, and open its branch.
   *
   * `local` binds the live root in place, `branch` materializes a copy of the
   * base tree. The base is the live tree as it stands unless the caller names a
   * revision, in which case that revision's **tree** is the base — the seam a
   * candidate turn branching from an earlier revision runs through.
   *
   * A `local` turn publishes onto the branch the live tree tracks — `main`, and
   * created here on a project's first turn. A `branch` turn publishes onto
   * `agent/<lane>`, whose first base parents on that same head so two lanes in
   * one project share a merge base.
   *
   * @param input - Workspace identity, mode, lane, actor and optional base.
   * @returns The turn's writable workspace and the branch it publishes onto.
   */
  public async prepare(input: OpenTurnWorkspaceInput): Promise<PreparedTurn> {
    await this.#revisions.ready;
    const live = await this.#liveBranch();
    const branch = input.mode === 'branch' ? turnRevisionBranch(input.lane) : live;
    const currentHead = this.#revisions.getBranchHead(branch);
    /* An unborn lane descends from where the live tree is, not from nothing: a
     * parentless base is what left two chats in one project with no merge base,
     * so every cross-chat merge could only ever be add/add (Q11). */
    const descendFrom = currentHead ?? this.#revisions.getBranchHead(live);
    /* A project whose first turn is a candidate still gets its trunk here: a
     * lane rooted in nothing is the missing merge base, whichever mode created
     * it. */
    const trunkless = branch !== live && descendFrom === undefined;
    const selected = input.baseRevisionId;
    const tree = selected === undefined ? await this.captureTree() : await this.#treeOf(selected);
    const head = descendFrom === undefined ? undefined : this.#revisions.getRevision(descendFrom);
    /* A base revision whose tree the branch head already records IS the branch
     * head: minting a second revision for identical bytes would put an empty
     * step between every pair of turns. */
    const reusable = head !== undefined && changedPathsBetween(head.tree, tree).length === 0 ? head.id : undefined;
    const minted =
      selected ??
      reusable ??
      (await this.record({
        parents: descendFrom === undefined ? [] : [descendFrom],
        tree,
        provenance: { source: 'user', actorId: input.actorId, createdAt: Date.now() },
        summary: { generated: input.summary ?? `Base for chat ${input.lane}` },
      }));
    const base = typeof minted === 'string' ? minted : minted.id;
    if (currentHead !== base) {
      /* The branch has to stand on the base the turn descends from, or
       * finalization's expected-old publication can never match. */
      await this.#revisions.updateBranchHead({ branch, expectedHead: currentHead, head: base });
    }
    if (trunkless) {
      await this.#revisions.updateBranchHead({ branch: live, expectedHead: undefined, head: base });
    }
    if (input.mode === 'local' || trunkless) {
      /* The live tree tracks the branch this turn writes it through, which is
       * how a project with no revisions gets `main` on its first turn. A
       * symbolic ref, so recording onto the branch moves the head with it —
       * writing the same value again is a no-op. */
      await this.#port.setHead(live);
    }
    const { workspaceId } = input;
    const workspace =
      input.mode === 'local'
        ? await this.#workspaces.bindInPlace({
            workspaceId,
            baseRevisionId: base,
            tree,
            filesystem: this.#filesystem,
          })
        : await this.#workspaces.materialize({ workspaceId, baseRevisionId: base, tree });
    /* The branch is decided once, here, and `finalize` reads it back: the head
     * reference can move between the two — a checkout in another document, or
     * the renderer's Switch while a host process is the writer — and publishing
     * onto a branch that never held this turn's base can only conflict
     * (c2-review S3). Workspace-private metadata, so it survives the reload a
     * reclaimed claim settles after. */
    await workspace.metadata.writeFile(preparedBranchPath, String(branch));
    return { workspace, branch };
  }

  /**
   * Three-way merge one turn tree against the live root, apply it, and verify.
   *
   * Verification covers **only the paths this merge applied**. The preview and
   * geometry pipeline writes its own outputs (`thumbnail.webp`, parameter and
   * geometry caches) into the live root while the settlement runs, unfenced; a
   * whole-tree comparison therefore failed on bytes the settlement never wrote,
   * and the run retried five times and stopped. Re-reading exactly what was
   * written and unlinked keeps the whole point of the check — a write that
   * silently did not land still refuses to publish — without owning writes that
   * belong to another writer.
   *
   * @param input - The turn's base tree, its agent root and its mode.
   * @returns The merged tree, or the conflicts that stopped it.
   */
  public async merge(input: TurnMergeInput): Promise<TurnMergeResult> {
    const live = this.#filesystem;
    const liveTree = await this.captureTree(live);
    // Local mode binds the live root AS the agent root (`bindInPlace` returns a
    // confining wrapper, never the root object), so a second capture is not a
    // second opinion — it is a second *snapshot*, and a pipeline write landing
    // between the two reads as an agent change.
    const agentTree = input.mode === 'local' ? liveTree : await this.captureTree(input.agent);
    const merged = mergeRevisionTrees(input.base, liveTree, agentTree);
    if (merged.status === 'conflicted') {
      return merged;
    }
    await this.applyTree(merged.tree, liveTree);
    return { status: 'merged', tree: merged.tree };
  }

  /**
   * Write one tree over the live root and verify exactly what it applied.
   *
   * The same primitive a settlement runs and a checkout runs — restoring a
   * stored revision *is* applying its tree — so it lives with the recorder
   * rather than being re-derived by every caller that owns a live root.
   *
   * @param target - The tree the live root must carry.
   * @param from - The live tree as already captured, when the caller has one.
   * @returns The paths this call wrote or removed, sorted.
   */
  public async applyTree(target: ImmutableRevisionTree, from?: ImmutableRevisionTree): Promise<readonly string[]> {
    const live = this.#filesystem;
    const liveTree = from ?? (await this.captureTree(live));
    const liveFiles = new Map(liveTree.entries().map(({ path, content }) => [path, content]));
    const targetFiles = new Map(target.entries().map(({ path, content }) => [path, content]));
    const removedPaths = [...liveFiles.keys()]
      .filter((path) => !targetFiles.has(path))
      .sort((left, right) => right.length - left.length || right.localeCompare(left));
    for (const path of removedPaths) {
      // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
      await live.unlink(path);
    }
    const writtenPaths: string[] = [];
    for (const [path, content] of targetFiles) {
      const current = liveFiles.get(path);
      if (current !== undefined && equalBytes(current, content)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
      await live.writeFile(path, content);
      writtenPaths.push(path);
    }

    const verified = await this.captureTree(live);
    const verifiedFiles = new Map(verified.entries().map(({ path, content }) => [path, content]));
    const unverifiedPaths = [
      ...removedPaths.filter((path) => verifiedFiles.has(path)),
      ...writtenPaths.filter((path) => {
        const applied = verifiedFiles.get(path);
        return applied === undefined || !equalBytes(applied, targetFiles.get(path)!);
      }),
    ].sort();
    if (unverifiedPaths.length > 0) {
      throw Object.assign(
        new Error(
          `Live project verification did not match the paths this merge applied: ${unverifiedPaths.join(', ')}`,
        ),
        { code: 'WORKSPACE_VERIFY_FAILED', paths: Object.freeze(unverifiedPaths) },
      );
    }
    return [...removedPaths, ...writtenPaths].sort();
  }

  /**
   * Settle one turn: merge into the live tree, mint the turn revision with the
   * base as its parent, and publish it onto the chat's branch under an
   * expected-old CAS.
   *
   * Retry-safe by construction rather than by comparison: the id is the commit
   * id of the tree and the headers, so a repeated finalization of the same turn
   * recomputes the same id and finds the revision already recorded.
   *
   * @param input - The turn's lane, workspace, actor, run and summary.
   * @returns The recorded revision and its publication, or the conflicts.
   */
  public async finalize(input: FinalizeTurnRevisionInput): Promise<TurnRevisionResult> {
    const { identity, baseTree } = input.workspace;
    const settled = await this.merge({ base: baseTree, agent: input.workspace.filesystem, mode: identity.mode });
    if (settled.status === 'conflicted') {
      return settled;
    }
    await this.#revisions.ready;
    const branch = await this.#preparedBranch(input.workspace, identity.mode, input.lane);
    const parents = Object.freeze([identity.baseRevisionId]);
    const published = this.#revisions.getBranchHead(branch);
    const settledHead = published === undefined ? undefined : this.#revisions.getRevision(published);
    /* A settlement that runs twice is one revision, not two. Identity is the
     * commit id of the tree and the headers, and every header but the clock is
     * already fixed by this turn — so the branch head this turn would publish,
     * if it is already exactly that, *is* the retry's answer. Recording again
     * would differ only in `createdAt`, which is not a second turn. */
    if (
      settledHead?.parents.length === 1 &&
      settledHead.parents[0] === identity.baseRevisionId &&
      settledHead.summary.generated === input.summary &&
      settledHead.provenance.actorId === input.actorId &&
      settledHead.provenance.runId === input.runId &&
      changedPathsBetween(settledHead.tree, settled.tree).length === 0
    ) {
      return {
        status: 'recorded',
        revision: settledHead,
        branch,
        publication: { status: 'updated', branch, previousHead: identity.baseRevisionId, head: settledHead.id },
        changedPaths: changedPathsBetween(baseTree, settledHead.tree),
        persistence: this.#revisions.getRevisionPersistence(settledHead.id),
      };
    }
    const revision = await this.record({
      parents,
      tree: settled.tree,
      provenance: Object.freeze({
        source: 'agent',
        actorId: input.actorId,
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        createdAt: Date.now(),
      }),
      summary: Object.freeze({ generated: input.summary }),
    });
    const publication: BranchHeadUpdateResult =
      published === revision.id
        ? { status: 'updated', branch, previousHead: identity.baseRevisionId, head: revision.id }
        : await this.#revisions.updateBranchHead({
            branch,
            expectedHead: identity.baseRevisionId,
            head: revision.id,
          });
    return {
      status: 'recorded',
      revision,
      branch,
      publication,
      changedPaths: changedPathsBetween(baseTree, revision.tree),
      persistence: this.#revisions.getRevisionPersistence(revision.id),
    };
  }

  /**
   * Record one revision in the content-addressed store and index it.
   *
   * The port is the identity authority: the id it returns **is** the commit id
   * of this exact tree and these exact headers, so recording the same content
   * twice is one revision on every host, and a retried finalization is a
   * tautology rather than a comparison.
   *
   * Public because a turn is not the only thing that mints a revision: a merge
   * in the branch porcelain mints one with two parents, and a revision minted
   * any other way carries an id no other host can recompute — which the next
   * turn's `writeRevision` then refuses as an invalid parent.
   *
   * @param input - Parents, tree, provenance and summary.
   * @returns The recorded revision, existing or newly minted.
   */
  public async record(input: {
    readonly parents: readonly RevisionId[];
    readonly tree: ImmutableRevisionTree;
    readonly provenance: RevisionProvenance;
    readonly summary: RevisionSummary;
  }): Promise<Revision> {
    const receipt = await this.#port.writeRevision(input);
    const id = revisionId(receipt.commitId);
    await this.#revisions.ready;
    return this.#revisions.getRevision(id) ?? (await this.#revisions.createRevision({ id, ...input }));
  }

  /**
   * The branch the live tree is on: the store's head reference, and `main` when
   * it holds none yet.
   *
   * A direct turn records onto it and a candidate's first base parents on it,
   * so both halves of the ruling read the same one value.
   *
   * @returns The branch the live tree tracks.
   */
  /**
   * The branch `prepare` opened this turn on.
   *
   * A workspace prepared before this record existed — or one whose metadata is
   * gone — falls back to deriving it, which is what every turn did before
   * (c2-review S3).
   *
   * @param workspace - The turn's workspace, carrying the record.
   * @param mode - Its placement, for the fallback.
   * @param lane - The chat or session, for the fallback.
   * @returns The branch this turn publishes onto.
   */
  async #preparedBranch(
    workspace: MaterializedWorkspace,
    mode: TurnRevisionMode,
    lane: string,
  ): Promise<RevisionBranchName> {
    const recorded = (await workspace.metadata.exists(preparedBranchPath))
      ? await workspace.metadata.readFile(preparedBranchPath, 'utf8')
      : '';
    const stored = recorded.trim();
    if (stored !== '') {
      return revisionBranchName(stored);
    }
    return mode === 'branch' ? turnRevisionBranch(lane) : this.#liveBranch();
  }

  async #liveBranch(): Promise<RevisionBranchName> {
    const stored = await this.#port.readHead();
    return stored === undefined ? mainRevisionBranch : revisionBranchName(stored.branch);
  }

  /**
   * The tree one recorded revision carries, from the index or the store.
   *
   * @param id - The revision whose tree is the turn's base.
   * @returns Its immutable tree.
   */
  async #treeOf(id: RevisionId): Promise<ImmutableRevisionTree> {
    await this.#revisions.ready;
    const indexed = this.#revisions.getRevision(id);
    const tree = indexed?.tree ?? (await this.#port.readTree(id));
    if (tree === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', `No recorded revision to descend from: ${id}`);
    }
    return tree;
  }
}

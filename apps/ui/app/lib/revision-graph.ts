import type { Chat } from '@taucad/chat';
import * as revisionFs from '@taucad/filesystem';
import { hashBytes, hashString } from '@taucad/utils/hash';
import { buildRevisions, buildTimeline } from '#lib/file-restore-timeline.js';
import type { FileOp, Revision } from '#lib/file-restore-timeline.js';
import type {
  PersistedBranchPublication,
  PersistedNativeGitStatus,
  PersistedRevisionConflict,
  PersistedRevisionGraphState,
} from '#types/revision.types.js';

type RevisionBranchName = revisionFs.RevisionBranchName;
type RevisionId = revisionFs.RevisionId;
type RevisionProvenance = revisionFs.RevisionProvenance;
type RevisionSummary = revisionFs.RevisionSummary;

export type RevisionDiffSummary = {
  readonly changedPaths: readonly string[];
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
};

/** A chat-derived revision enriched with durable graph and immutable-tree identity. */
export type RevisionGraphNode = {
  readonly id: RevisionId;
  readonly identitySource: 'authoritative' | 'transcript';
  readonly turnId: string;
  readonly parents: readonly RevisionId[];
  readonly baseRevisionId?: RevisionId;
  readonly parentTurnIds: readonly string[];
  readonly parentSource: 'recorded' | 'inferred';
  readonly forkPoint?: RevisionId;
  readonly forkPointTurnId?: string;
  readonly branch: RevisionBranchName;
  readonly tree: revisionFs.ImmutableRevisionTree;
  readonly treeId: RevisionId;
  readonly provenance: RevisionProvenance;
  readonly summary: RevisionSummary;
  readonly diff: RevisionDiffSummary;
  readonly conflict?: PersistedRevisionConflict;
  readonly publication?: PersistedBranchPublication;
  readonly chatId: string;
  readonly chatName: string;
  readonly jobIds: readonly string[];
  readonly workspaceId?: string;
  readonly nativeGit?: PersistedNativeGitStatus;
  readonly revision: Revision;
  /** The legacy materialize-from-chat restore path can address this turn. */
  readonly isRestorable: boolean;
};

export type RevisionGraphBranch = {
  readonly name: RevisionBranchName;
  readonly headId?: RevisionId;
  readonly headTurnId?: string;
  readonly publication?: PersistedBranchPublication;
};

export type RevisionGraph = {
  readonly nodes: readonly RevisionGraphNode[];
  readonly byId: ReadonlyMap<RevisionId, RevisionGraphNode>;
  readonly byTurnId: ReadonlyMap<string, RevisionGraphNode>;
  readonly branches: readonly RevisionGraphBranch[];
  readonly headId?: RevisionId;
};

/** Fresh empty projection for consumers that have not loaded chat evidence. */
export const emptyRevisionGraph = (): RevisionGraph => ({
  nodes: [],
  byId: new Map(),
  byTurnId: new Map(),
  branches: [],
});

type BuildRevisionGraphInput = {
  readonly chats: Chat[];
  readonly persisted?: PersistedRevisionGraphState;
  readonly supersededTurnIds: readonly string[];
  readonly headTurnId: string;
};

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const opaqueRevisionId = (chatId: string, turnId: string): RevisionId =>
  revisionFs.revisionId(`rev:${hashString(`chat:${chatId}`)}:${hashString(`turn:${turnId}`)}`);

const immutableTreeId = (tree: revisionFs.ImmutableRevisionTree): RevisionId => {
  const identity = tree
    .entries()
    .map(({ path, content }) => `${path}\0${content.byteLength}\0${hashBytes(content)}`)
    .join('\0');
  return revisionFs.revisionId(`tree:${tree.size}:${tree.byteLength}:${hashString(identity)}`);
};

const opsByTurn = (timeline: readonly FileOp[]): ReadonlyMap<string, readonly FileOp[]> => {
  const byTurn = new Map<string, FileOp[]>();
  for (const op of timeline) {
    const ops = byTurn.get(op.turnMessageId) ?? [];
    ops.push(op);
    byTurn.set(op.turnMessageId, ops);
  }
  return byTurn;
};

const materializeBranchTree = (
  parent: revisionFs.ImmutableRevisionTree | undefined,
  operations: readonly FileOp[],
): revisionFs.ImmutableRevisionTree => {
  const files = new Map<string, Uint8Array<ArrayBuffer> | string>(
    parent?.entries().map(({ path, content }) => [path, content] as const) ?? [],
  );
  for (const operation of operations) {
    if (!files.has(operation.path) && operation.existedBefore && operation.before !== undefined) {
      files.set(operation.path, operation.before);
    }
    if (operation.after === undefined) {
      files.delete(operation.path);
    } else {
      files.set(operation.path, operation.after);
    }
  }
  return new revisionFs.ImmutableRevisionTree(files);
};

const generatedSummary = (revision: Revision): string => {
  const files = revision.files.length === 1 ? '1 file' : `${revision.files.length} files`;
  return `Changed ${files} (+${revision.linesAdded}/-${revision.linesRemoved})`;
};

const projectFork = (
  forkPointTurnId: string | undefined,
  ids: ReadonlyMap<string, RevisionId>,
): Pick<RevisionGraphNode, 'forkPoint' | 'forkPointTurnId'> | Record<string, never> => {
  if (forkPointTurnId === undefined) {
    return {};
  }
  const forkPoint = ids.get(forkPointTurnId);
  return {
    forkPointTurnId,
    ...(forkPoint === undefined ? {} : { forkPoint }),
  };
};

const projectPersistedNodeMetadata = (
  record: PersistedRevisionGraphState['nodes'][string] | undefined,
  revision: Revision,
): Pick<RevisionGraphNode, 'conflict' | 'jobIds' | 'nativeGit' | 'publication' | 'summary' | 'workspaceId'> => ({
  summary: {
    generated: record?.generatedSummary ?? generatedSummary(revision),
    ...(record?.editedSummary === undefined ? {} : { edited: record.editedSummary }),
  },
  ...(record?.conflict === undefined ? {} : { conflict: record.conflict }),
  ...(record?.publication === undefined ? {} : { publication: record.publication }),
  ...(record?.workspaceId === undefined ? {} : { workspaceId: record.workspaceId }),
  ...(record?.nativeGit === undefined ? {} : { nativeGit: record.nativeGit }),
  jobIds: record?.jobIds ?? [],
});

const inferLegacyMetadata = (
  revisions: readonly Revision[],
  supersededTurnIds: ReadonlySet<string>,
): ReadonlyMap<string, { parentTurnIds: readonly string[]; branchName: string; forkPointTurnId?: string }> => {
  const metadata = new Map<
    string,
    { parentTurnIds: readonly string[]; branchName: string; forkPointTurnId?: string }
  >();
  let activeParent: string | undefined;
  for (const revision of revisions) {
    if (!supersededTurnIds.has(revision.messageId)) {
      metadata.set(revision.messageId, {
        parentTurnIds: activeParent === undefined ? [] : [activeParent],
        branchName: 'main',
      });
      activeParent = revision.messageId;
      continue;
    }
    const branchName = `history/${hashString(`turn:${revision.messageId}`)}`;
    metadata.set(revision.messageId, {
      parentTurnIds: activeParent === undefined ? [] : [activeParent],
      branchName,
      ...(activeParent === undefined ? {} : { forkPointTurnId: activeParent }),
    });
  }
  return metadata;
};

/**
 * Project all chat mutation evidence into a branch graph. Persisted metadata is
 * authoritative; legacy transcripts receive explicitly-labelled inference.
 * Trees contain every path observed by chat tools, including captured pre-edit
 * content, while unrelated imported/manual files remain outside this evidence.
 */
export const buildRevisionGraph = (input: BuildRevisionGraphInput): RevisionGraph => {
  const timeline = buildTimeline(input.chats);
  const revisions = buildRevisions(input.chats, timeline);
  const operations = opsByTurn(timeline);
  const superseded = new Set(input.supersededTurnIds);
  const inferred = inferLegacyMetadata(revisions, superseded);
  const chats = new Map(input.chats.map((chat) => [chat.id, chat]));
  const revisionByTurn = new Map(revisions.map((revision) => [revision.messageId, revision]));
  const ids = new Map(
    revisions.map((revision) => {
      const authoritativeId = input.persisted?.nodes[revision.messageId]?.revisionId;
      return [
        revision.messageId,
        authoritativeId === undefined
          ? opaqueRevisionId(revision.chatId, revision.messageId)
          : revisionFs.revisionId(authoritativeId),
      ];
    }),
  );
  const trees = new Map<string, revisionFs.ImmutableRevisionTree>();
  const visiting = new Set<string>();

  const treeFor = (turnId: string): revisionFs.ImmutableRevisionTree => {
    const cached = trees.get(turnId);
    if (cached) {
      return cached;
    }
    if (visiting.has(turnId)) {
      throw new Error(`Revision graph contains a parent cycle at ${turnId}`);
    }
    visiting.add(turnId);
    const record = input.persisted?.nodes[turnId];
    const legacy = inferred.get(turnId);
    // A record's parents are authoritative even when EMPTY: `[]` is exactly what
    // `registerTurn` writes for a turn with no head, so `parentTurnIds[0] ??`
    // would silently re-parent a persisted ROOT from the legacy chain. When that
    // chain orders a later turn ahead of the root (a seeded/imported turn, or a
    // chat row stamped ahead of a later message), the root inherits its own
    // descendant and `treeFor` trips the cycle guard below.
    const parentTurnId = record ? record.parentTurnIds[0] : legacy?.parentTurnIds[0];
    const parentTree =
      parentTurnId !== undefined && revisionByTurn.has(parentTurnId) ? treeFor(parentTurnId) : undefined;
    const tree = materializeBranchTree(parentTree, operations.get(turnId) ?? []);
    visiting.delete(turnId);
    trees.set(turnId, tree);
    return tree;
  };

  const nodes = revisions.map((revision): RevisionGraphNode => {
    const record = input.persisted?.nodes[revision.messageId];
    const legacy = inferred.get(revision.messageId)!;
    const parentTurnIds = record?.parentTurnIds ?? legacy.parentTurnIds;
    const branchName = record?.branchName ?? legacy.branchName;
    // Same conflation as `treeFor`: a record that records no fork point states
    // that the turn did not fork; it must not borrow the legacy inference's.
    const forkPointTurnId = record ? record.forkPointTurnId : legacy.forkPointTurnId;
    const tree = treeFor(revision.messageId);
    const baseRevisionId = record?.baseRevisionId;
    const parents =
      baseRevisionId === undefined
        ? parentTurnIds.flatMap((turnId) => {
            const id = ids.get(turnId);
            return id === undefined ? [] : [id];
          })
        : [revisionFs.revisionId(baseRevisionId)];
    return {
      id: ids.get(revision.messageId)!,
      identitySource: record?.revisionId === undefined ? 'transcript' : 'authoritative',
      turnId: revision.messageId,
      parents,
      ...(baseRevisionId === undefined ? {} : { baseRevisionId: revisionFs.revisionId(baseRevisionId) }),
      parentTurnIds,
      parentSource: record === undefined ? 'inferred' : 'recorded',
      ...projectFork(forkPointTurnId, ids),
      branch: revisionFs.revisionBranchName(branchName),
      tree,
      treeId: record?.treeId === undefined ? immutableTreeId(tree) : revisionFs.revisionId(record.treeId),
      provenance: record?.provenance ?? {
        source: 'agent',
        actorId: revision.chatId,
        runId: revision.messageId,
        createdAt: Math.max(0, Math.trunc(revision.anchor)),
      },
      ...projectPersistedNodeMetadata(record, revision),
      diff: {
        changedPaths: [...(record?.changedPaths ?? revision.changedPaths)].sort(compareText),
        filesChanged: record?.changedPaths?.length ?? revision.files.length,
        linesAdded: revision.linesAdded,
        linesRemoved: revision.linesRemoved,
      },
      chatId: record?.chatId ?? revision.chatId,
      chatName: chats.get(record?.chatId ?? revision.chatId)?.name ?? 'Untitled chat',
      revision,
      isRestorable: !superseded.has(revision.messageId),
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byTurnId = new Map(nodes.map((node) => [node.turnId, node]));
  const branchNames = new Set([
    ...nodes.map((node) => String(node.branch)),
    ...Object.keys(input.persisted?.branches ?? {}),
  ]);
  const branches = [...branchNames].sort(compareText).map((name): RevisionGraphBranch => {
    const record = input.persisted?.branches[name];
    const fallbackHead = nodes.findLast((node) => node.branch === name);
    const headTurnId = record?.headTurnId ?? fallbackHead?.turnId;
    const headId =
      record?.headRevisionId === undefined
        ? headTurnId === undefined
          ? undefined
          : ids.get(headTurnId)
        : revisionFs.revisionId(record.headRevisionId);
    return {
      name: revisionFs.revisionBranchName(name),
      ...(headTurnId === undefined ? {} : { headTurnId }),
      ...(headId === undefined ? {} : { headId }),
      ...(record?.publication === undefined ? {} : { publication: record.publication }),
    };
  });
  const activeBranch = input.persisted?.activeBranch ?? 'main';
  const branchHead = branches.find((branch) => branch.name === activeBranch)?.headId;
  const latestRestorable = nodes.findLast((node) => node.isRestorable)?.id;
  const headId =
    input.headTurnId === '' ? (branchHead ?? latestRestorable) : (ids.get(input.headTurnId) ?? latestRestorable);
  return { nodes, byId, byTurnId, branches, ...(headId === undefined ? {} : { headId }) };
};

/** Remove unfinished turns without erasing their durable graph metadata. */
export const filterRevisionGraph = (
  graph: RevisionGraph,
  hiddenTurnIds: ReadonlySet<string>,
  visibleRevisions: readonly Revision[],
): RevisionGraph => {
  const revisionByTurn = new Map(visibleRevisions.map((revision) => [revision.messageId, revision]));
  const nodes = graph.nodes
    .filter((node) => !hiddenTurnIds.has(node.turnId))
    .map((node) => ({ ...node, revision: revisionByTurn.get(node.turnId) ?? node.revision }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byTurnId = new Map(nodes.map((node) => [node.turnId, node]));
  const branches = graph.branches.map((branch) => {
    if (branch.headId === undefined || byId.has(branch.headId)) {
      return branch;
    }
    const fallback = nodes.findLast((node) => node.branch === branch.name);
    return {
      ...branch,
      ...(fallback === undefined
        ? { headId: undefined, headTurnId: undefined }
        : { headId: fallback.id, headTurnId: fallback.turnId }),
    };
  });
  const headId =
    graph.headId !== undefined && byId.has(graph.headId)
      ? graph.headId
      : nodes.findLast((node) => node.isRestorable)?.id;
  return { nodes, byId, byTurnId, branches, ...(headId === undefined ? {} : { headId }) };
};

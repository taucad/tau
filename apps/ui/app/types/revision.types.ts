/** JSON-safe provenance copied from the revision authority's finalized record. */
export type PersistedRevisionProvenance = {
  readonly source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  readonly actorId: string;
  readonly runId?: string;
  /** Milliseconds since the Unix epoch. */
  readonly createdAt: number;
};

/** Native Git persistence attached by a native host, or an explicit absence/failure. */
export type PersistedNativeGitStatus =
  | { readonly status: 'not-configured' }
  | {
      readonly status: 'stored';
      readonly commitId: string;
      readonly objectFormat: 'sha1' | 'sha256';
    }
  | { readonly status: 'failed'; readonly errorCode: string };

/** Authoritative expected-old branch-head publication outcome. */
export type PersistedBranchPublication =
  | {
      readonly status: 'updated';
      readonly branchName: string;
      readonly expectedHeadRevisionId: string;
      readonly previousHeadRevisionId?: string;
      readonly headRevisionId: string;
    }
  | {
      readonly status: 'conflicted';
      readonly branchName: string;
      readonly expectedHeadRevisionId: string;
      readonly actualHeadRevisionId?: string;
      readonly proposedHeadRevisionId: string;
    };

/** JSON-safe conflict metadata persisted with a projected revision node. */
export type PersistedRevisionConflict =
  | {
      readonly type: 'stale-head';
      readonly branchName: string;
      readonly expectedHeadRevisionId: string;
      readonly actualHeadRevisionId?: string;
      readonly proposedHeadRevisionId: string;
    }
  | {
      readonly type: 'merge';
      readonly kind: 'add-add' | 'modify-delete' | 'binary' | 'text';
      readonly paths: readonly string[];
    };

/**
 * Narrow authority-to-projection seam. The workspace finalizer supplies this
 * only after the immutable revision and expected-old publication have settled.
 */
export type AuthoritativeRevisionFinalization = {
  readonly turnId: string;
  readonly parentTurnId?: string;
  readonly revisionId: string;
  readonly baseRevisionId: string;
  readonly treeId: string;
  readonly branchName: string;
  readonly publication: PersistedBranchPublication;
  readonly changedPaths: readonly string[];
  readonly provenance: PersistedRevisionProvenance;
  readonly generatedSummary: string;
  readonly chatId: string;
  readonly jobIds: readonly string[];
  readonly workspaceId: string;
  readonly nativeGit: PersistedNativeGitStatus;
};

/** Durable metadata that cannot be recovered reliably from a legacy chat transcript. */
export type PersistedRevisionGraphNode = {
  readonly turnId: string;
  readonly parentTurnIds: readonly string[];
  /**
   * A parent the graph refused to record, kept as inspectable evidence. A turn
   * can never be its own parent; registering the root instead keeps the
   * projection acyclic rather than throwing during a later render.
   */
  readonly parentAnomaly?: 'self-parent';
  readonly forkPointTurnId?: string;
  readonly branchName: string;
  readonly chatId: string;
  readonly jobIds: readonly string[];
  readonly editedSummary?: string;
  readonly status: 'pending' | 'complete';
  readonly conflict?: PersistedRevisionConflict;
  readonly publication?: PersistedBranchPublication;
  /** Present only after the revision authority finalizes the workspace. */
  readonly revisionId?: string;
  readonly baseRevisionId?: string;
  readonly treeId?: string;
  readonly changedPaths?: readonly string[];
  readonly provenance?: PersistedRevisionProvenance;
  readonly generatedSummary?: string;
  readonly workspaceId?: string;
  readonly nativeGit?: PersistedNativeGitStatus;
};

/** One mutable ref in the otherwise immutable revision graph. */
export type PersistedRevisionBranch = {
  readonly name: string;
  readonly headTurnId?: string;
  readonly headRevisionId?: string;
  readonly publication?: PersistedBranchPublication;
};

/** Browser-profile-local revision graph metadata. All fields are structured-clone safe. */
export type PersistedRevisionGraphState = {
  readonly activeBranch: string;
  readonly nodes: Readonly<Record<string, PersistedRevisionGraphNode>>;
  readonly branches: Readonly<Record<string, PersistedRevisionBranch>>;
};

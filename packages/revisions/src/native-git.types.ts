import type { RevisionId, RevisionTreeConflict } from '#algorithms/index.js';
import type { Checkout } from '#revision-port.js';
import type {
  BranchHeadUpdateResult,
  Revision,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
} from '#revision-authority.js';

declare const gitObjectIdBrand: unique symbol;

/** Opaque object identity returned by the repository's configured Git object format. @public */
export type GitObjectId = string & { readonly [gitObjectIdBrand]: true };

/** Stable failure categories emitted by the native Git adapter. @public */
export type NativeGitErrorCode =
  | 'GIT_COMMAND_FAILED'
  | 'INVALID_REPOSITORY'
  | 'INVALID_TRANSPORT'
  | 'UNMANAGED_REVISION'
  | 'UNSUPPORTED_TREE'
  | 'WORKSPACE_CORRUPT'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_OWNED';

/** Typed native Git adapter failure. @public */
export class NativeGitError extends Error {
  public readonly code: NativeGitErrorCode;

  /**
   * Create a stable adapter failure.
   *
   * @param code - Machine-readable failure category.
   * @param message - Safe diagnostic without remote credentials or command arguments.
   */
  public constructor(code: NativeGitErrorCode, message: string) {
    super(message);
    this.name = 'NativeGitError';
    this.code = code;
  }
}

/** Runtime facts verified from the attached native repository. @public */
export type NativeGitCapabilities = Readonly<{
  engine: 'native-git';
  objectFormat: 'sha1' | 'sha256';
  expectedOldRefs: true;
  linkedWorktrees: true;
}>;

/** One Tau-owned detached linked Git worktree. Its path is host-local and is not a handoff identity. @public */
export type NativeGitWorkspace = Readonly<{
  workspaceId: Checkout['id'];
  runId: string;
  rootPath: string;
  baseRevisionId: RevisionId;
  headRevisionId: RevisionId;
  headCommit: GitObjectId;
}>;

/** Input for atomically binding one Tau run to a managed linked worktree. @public */
export type BindNativeGitWorkspaceInput = Readonly<{
  workspaceId: Checkout['id'];
  runId: string;
  baseRevision: Revision;
}>;

/** Input for reopening a worktree after host or process restart. @public */
export type ReopenNativeGitWorkspaceInput = Readonly<{
  workspaceId: Checkout['id'];
  runId: string;
}>;

/** Input for publishing an exact revision to one owned workspace. @public */
export type CommitNativeGitWorkspaceInput = Readonly<{
  workspace: NativeGitWorkspace;
  expectedHead: RevisionId;
  revision: Revision;
}>;

/** Expected-old publication outcome for a managed workspace head. @public */
export type NativeGitWorkspaceUpdateResult =
  | Readonly<{
      status: 'updated';
      previousHead: RevisionId;
      workspace: NativeGitWorkspace;
    }>
  | Readonly<{
      status: 'conflicted';
      expectedHead: RevisionId;
      actualHead: RevisionId;
      proposedHead: RevisionId;
    }>;

/** A revision and its exact native Git commit identity. @public */
export type StoredGitRevision = Readonly<{
  revision: Revision;
  commit: GitObjectId;
}>;

/** Complete Tau revision graph recovered from managed native Git refs. @public */
export type NativeGitRevisionGraph = Readonly<{
  revisions: readonly StoredGitRevision[];
  branchHeads: ReadonlyArray<Readonly<{ branch: RevisionBranchName; head: RevisionId }>>;
}>;

/** Input metadata for a deterministic Tau three-way merge revision. @public */
export type MergeNativeGitRevisionsInput = Readonly<{
  id: RevisionId;
  base: Revision;
  ours: Revision;
  theirs: Revision;
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

/** Native persistence outcome using the same typed conflicts as Tau's C2 merge substrate. @public */
export type NativeGitMergeResult =
  | Readonly<{ status: 'merged'; stored: StoredGitRevision }>
  | Readonly<{ status: 'conflicted'; conflicts: readonly RevisionTreeConflict[] }>;

/** Input for publishing one portable Tau branch through expected-old ref CAS. @public */
export type PublishNativeGitBranchInput = Readonly<{
  branch: RevisionBranchName;
  expectedHead: RevisionId | undefined;
  head: RevisionId;
}>;

/** Generic fetch request. The remote may be a configured name, URL, or repository path. @public */
export type NativeGitFetchInput = Readonly<{
  remote: string;
  refspecs: readonly string[];
  prune?: boolean;
}>;

/** Generic push request using only standard Git refspec semantics. @public */
export type NativeGitPushInput = Readonly<{
  remote: string;
  refspecs: readonly string[];
  atomic?: boolean;
}>;

/** Native adapter configuration. Repository and worktree roots are explicit host locators. @public */
export type NativeGitAdapterOptions = Readonly<{
  repositoryPath: string;
  worktreeRoot: string;
  gitExecutable?: string;
}>;

/** Native Git operations consumed by Tau host processes. @public */
export type NativeGitAdapter = Readonly<{
  inspect(): Promise<NativeGitCapabilities>;
  storeRevision(revision: Revision): Promise<StoredGitRevision>;
  readRevision(revisionId: RevisionId): Promise<Revision | undefined>;
  readRevisionGraph(): Promise<NativeGitRevisionGraph>;
  bindWorkspace(input: BindNativeGitWorkspaceInput): Promise<NativeGitWorkspace>;
  reopenWorkspace(input: ReopenNativeGitWorkspaceInput): Promise<NativeGitWorkspace>;
  commitWorkspace(input: CommitNativeGitWorkspaceInput): Promise<NativeGitWorkspaceUpdateResult>;
  cleanupWorkspace(workspace: NativeGitWorkspace): Promise<boolean>;
  mergeRevisions(input: MergeNativeGitRevisionsInput): Promise<NativeGitMergeResult>;
  updateBranchHead(input: PublishNativeGitBranchInput): Promise<BranchHeadUpdateResult>;
  deleteBranchHead(input: Omit<PublishNativeGitBranchInput, 'head'>): Promise<BranchHeadUpdateResult>;
  resolveRef(ref: string): Promise<GitObjectId | undefined>;
  fetch(input: NativeGitFetchInput): Promise<void>;
  push(input: NativeGitPushInput): Promise<void>;
}>;

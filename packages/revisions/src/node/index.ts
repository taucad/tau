/**
 * Engine-backed adapters. Node only: every module below spawns a process, so
 * this subpath is deliberately not reachable from the package's root barrel.
 */

export { CommandAbortedError, runCommand, runGitCommand } from '#git-command.js';
export type { CommandAbortReason, CommandBounds, GitCommandResult } from '#git-command.js';
export { createNativeGitAdapter } from '#native-git-adapter.js';
export { createNativeGitRevisionPort } from '#native-git-port.js';
export type { NativeGitCheckoutOptions, NativeGitRevisionPortOptions } from '#native-git-port.js';
export { NativeGitError } from '#native-git.types.js';
export type {
  BindNativeGitWorkspaceInput,
  CommitNativeGitWorkspaceInput,
  GitObjectId,
  MergeNativeGitRevisionsInput,
  NativeGitAdapter,
  NativeGitAdapterOptions,
  NativeGitCapabilities,
  NativeGitErrorCode,
  NativeGitFetchInput,
  NativeGitMergeResult,
  NativeGitPushInput,
  NativeGitRevisionGraph,
  NativeGitWorkspace,
  NativeGitWorkspaceUpdateResult,
  PublishNativeGitBranchInput,
  ReopenNativeGitWorkspaceInput,
  StoredGitRevision,
} from '#native-git.types.js';

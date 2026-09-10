/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves these internal source files. */
/**
 * Engine-backed adapters. Node only: every module below spawns a process, so
 * this subpath is deliberately not reachable from the package's root barrel.
 */

export { CommandAbortedError, runCommand, runGitCommand } from '#git-command.js';
export type { CommandAbortReason, CommandBounds, GitCommandResult } from '#git-command.js';
export {
  createJjRevisionPort,
  jjExecutableEnvironmentVariable,
  pinnedJjRelease,
  resolveJjExecutable,
} from '#jj-adapter.js';
export type { JjRevisionPortOptions } from '#jj-adapter.js';
export { createNativeGitAdapter } from '#native-git-adapter.js';
export { createNativeGitRevisionPersistence } from '#native-git-revision-persistence.js';
export { NativeGitError } from '#native-git.types.js';
export type {
  BindNativeGitWorkspaceInput,
  CommitNativeGitWorkspaceInput,
  CreateNativeGitBundleInput,
  FetchNativeGitBundleInput,
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

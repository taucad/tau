/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves these internal source files. */
/**
 * Browser-safe surface: the port, its commit codec and identity layer, the
 * `isomorphic-git` adapter and the turn recorder. Adapters that spawn an engine
 * live on `@taucad/revisions/node`, so a page importing this barrel never pulls
 * `node:child_process` into its bundle.
 */

export { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
export type { IsomorphicGitCheckoutOptions, IsomorphicGitRevisionPortOptions } from '#isomorphic-git-adapter.js';
export { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
export type {
  BranchHeadUpdateResult,
  CreateRevisionInput,
  Revision,
  RevisionAuthorityOptions,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
  StaleBranchHeadConflict,
  UpdateBranchHeadInput,
} from '#revision-authority.js';
export { createPortRevisionPersistence } from '#revision-persistence.js';
export type {
  PersistedRevisionBranchHead,
  PortRevisionPersistenceOptions,
  RevisionPersistenceEntry,
  RevisionPersistencePort,
  RevisionPersistenceReceipt,
  RevisionPersistenceSnapshot,
} from '#revision-persistence.js';
export { decodeCommit, encodeCommit, GitObjectError, parseChangeId, renderChangeId } from '#git-objects.js';
export type {
  CommitInput,
  DecodedCommit,
  EncodedGitObject,
  GitObjectErrorCode,
  GitObjectType,
  GitSignature,
} from '#git-objects.js';
export {
  bytesToHex,
  concatBytes,
  digest,
  digestHex,
  equalBytes,
  hexToBytes,
  objectIdByteLength,
} from '#object-hash.js';
export type { ObjectFormat } from '#object-hash.js';
export {
  deriveChangeId,
  parseRevisionCommitMessage,
  provenanceTrailerPrefix,
  revisionCommitMessage,
} from '#revision-headers.js';
export type { RevisionTrailer } from '#revision-headers.js';
export { RevisionPortError } from '#revision-port.js';
export type {
  AddCheckoutInput,
  Checkout,
  InitRevisionStoreInput,
  RevisionConflict,
  RevisionDiffEntry,
  RevisionDiffInput,
  RevisionDiffKind,
  RevisionEngine,
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  RevisionPort,
  RevisionPortErrorCode,
  RevisionReceipt,
  RevisionRecord,
  RevisionRef,
  RevisionTransportInput,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
export {
  defaultTurnCaptureExclusions,
  mainRevisionBranch,
  TurnRevisionRecorder,
  turnRevisionBranch,
} from '#turn-revision.js';
export type {
  FinalizeTurnRevisionInput,
  OpenTurnWorkspaceInput,
  PreparedTurn,
  TurnMergeInput,
  TurnMergeResult,
  TurnRevisionMode,
  TurnRevisionRecorderOptions,
  TurnRevisionResult,
} from '#turn-revision.js';
export { generatedIgnoreContent, generatedIgnoreEntries, generatedIgnorePath } from '#workspace-config.js';

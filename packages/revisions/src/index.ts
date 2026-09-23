/**
 * Browser-safe surface: the port, its commit codec and identity layer and the
 * `isomorphic-git` adapter. The lifecycle machines and the effects behind them
 * have their own subpaths; adapters that spawn an engine live on
 * `@taucad/revisions/node`, so a page importing this barrel never pulls
 * `node:child_process` into its bundle.
 */

export { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
export type { IsomorphicGitCheckoutOptions } from '#isomorphic-git-adapter.js';
export { bootstrapRemoteRevisionStore } from '#remote-bootstrap.js';
export { revisionBranchName } from '#revision-authority.js';
export type {
  BranchHeadUpdateResult,
  Revision,
  RevisionActor,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
  RevisionUserActor,
} from '#revision-authority.js';
export { decodeCommit, decodeTag, encodeCommit, encodeTag, GitObjectError } from '#git-objects.js';
export type { DecodedCommit, GitSignature } from '#git-objects.js';
export { bytesToHex, concatBytes, digest, digestHex, hexToBytes, objectIdByteLength } from '#object-hash.js';
export type { ObjectFormat } from '#object-hash.js';
export {
  deriveChangeId,
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  taggerSignature,
} from '#revision-headers.js';
export type { RevisionTrailer } from '#revision-headers.js';
export { RevisionPortError } from '#revision-port.js';
export type {
  AddCheckoutInput,
  Checkout,
  CheckoutRecord,
  CreateRevisionTagInput,
  InitRevisionStoreInput,
  RevisionConflict,
  RevisionDiffEntry,
  RevisionDiffInput,
  RevisionEngineDescriptor,
  RevisionHead,
  RevisionLogEntry,
  RevisionLogInput,
  RevisionPort,
  RevisionReceipt,
  RevisionRecord,
  RemoteRef,
  RevisionFetchInput,
  RevisionFetchResult,
  RevisionPushInput,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionPushResult,
  RevisionRef,
  RevisionTag,
  UpdateRevisionRefInput,
  UpdateRevisionRefResult,
  WriteRevisionInput,
} from '#revision-port.js';
export {
  chatIdOfRef,
  chatLogFileName,
  chatRecordFileName,
  chatRecordsPath,
  chatRefName,
  chatRefPrefix,
  projectChats,
  readChatRecord,
  replayChatSegment,
  writeChatRef,
} from '#chat-ref.js';
export { cleanLargeObjects, lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
export type { LfsPointer } from '#lfs.js';
/* `remoteMachine` and `selectRemoteFacet` are deliberately absent: one subpath
 * per machine (P8), which is why `./remote-machine` exists and why no other
 * machine is here either. Keeping them would put `xstate` in the graph of every
 * page that imports a remote *type* from this barrel. */
export type { RemoteActors, RemoteFacet, RemoteMachineEvent } from '#remote.machine.js';
export { createLfsClient, LfsQuotaError, withQuotaPaths } from '#lfs-client.js';
export { createRevisionHttpClient, keepaliveLimitBytes } from '#http-client.js';
export type { RevisionHttpClient, RevisionHttpRequest, RevisionHttpResponse } from '#http-client.js';
/*
 * The sync scheduler's public value types (W13).
 *
 * The machine itself stays on its own subpath (`@taucad/revisions/sync-machine`)
 * so `xstate` is not in the graph of every consumer of this barrel; these are
 * the shapes a *renderer* needs — the Sync row, the header chip and the queue.
 */
export type { SyncFacet, SyncPushOutcome, SyncQueueEntry, SyncQueueRecord, SyncRefOutcome } from '#sync.machine.js';
/* The close flush's last POST (W13): a browser host wraps its client with
 * `recordLastPush` and offers that recorded POST again on `pagehide`. */
export { recordLastPush, sendKeepalivePush } from '#sync-keepalive.js';
export type { KeepalivePushOutcome, PushRecorder } from '#sync-keepalive.js';
/* The marker itself stays module-private: nothing outside this package should
   match on the sentence by hand (AC23 would call it an unimported export). */
export { isCeilingRefusal } from '#refusal-markers.js';
export {
  createGitRemoteTransport,
  gitRemoteUrlProblem,
  isGithubRemoteUrl,
  isHostLocalRef,
  isTauApiUrl,
  lfsRemoteUnsupportedMessage,
  publishFailureMessage,
  publishOverHttp,
  refPatternIsHostLocal,
  registerProjectFailureMessage,
  registerProjectOverHttp,
  remoteCarriesLargeObjects,
  remoteOf,
  remoteTrackingRef,
  remoteTransportError,
  tauRemoteName,
  tauRemoteUrl,
} from '#remotes.js';
export type { GitRemoteCredential, Remote, RemoteKind, RemoteReauthorizationCode } from '#remotes.js';
export { conflictLabels, materializeConflict, readConflictTerms } from '#revision-conflict.js';
export type { RevisionConflictTerms } from '#revision-conflict.js';
export { readRevisionDiff, readRevisionLog, readRevisionPlace } from '#revision-verbs.js';
export type { RevisionLogRequest, RevisionPlace, RevisionRow } from '#revision-verbs.js';
export {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
  isTrackedLargeObjectPath,
  largeObjectThresholdBytes,
} from '#workspace-config.js';

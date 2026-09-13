/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves these internal source files. */
/**
 * Browser-safe surface: the port, its commit codec and identity layer and the
 * `isomorphic-git` adapter. The lifecycle machines and the effects behind them
 * have their own subpaths; adapters that spawn an engine live on
 * `@taucad/revisions/node`, so a page importing this barrel never pulls
 * `node:child_process` into its bundle.
 */

export { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
export type { IsomorphicGitCheckoutOptions, IsomorphicGitRevisionPortOptions } from '#isomorphic-git-adapter.js';
export { RevisionAuthority, revisionBranchName } from '#revision-authority.js';
export type {
  BranchHeadUpdateResult,
  CreateRevisionInput,
  Revision,
  RevisionActor,
  RevisionAgentActor,
  RevisionAuthorityOptions,
  RevisionBranchName,
  RevisionProvenance,
  RevisionSummary,
  RevisionTrigger,
  RevisionUserActor,
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
export {
  decodeCommit,
  decodeTag,
  encodeCommit,
  encodeTag,
  GitObjectError,
  parseChangeId,
  renderChangeId,
} from '#git-objects.js';
export type {
  CommitInput,
  DecodedCommit,
  DecodedTag,
  EncodedGitObject,
  TagInput,
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
  actorTrailerPrefix,
  anonymousActorEmailDomain,
  deriveChangeId,
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  provenanceTrailerPrefix,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  tagTrailerPrefix,
  taggerSignature,
  tauCommitter,
  triggerTrailerPrefix,
} from '#revision-headers.js';
export type { RevisionTagTrailer, RevisionTrailer } from '#revision-headers.js';
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
  RemoteRef,
  RevisionFetchInput,
  RevisionFetchResult,
  RevisionPushInput,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionPushRefStatus,
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
  chatSegmentPath,
  projectChats,
  readChatRecord,
  replayChatSegment,
  writeChatRef,
} from '#chat-ref.js';
export type {
  ChatRefContext,
  ChatRefWriteResult,
  ChatRefWriteStatus,
  ProjectChatsInput,
  ReplayChatSegmentInput,
  WriteChatRefInput,
} from '#chat-ref.js';
export { cleanLargeObjects, lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
export type { LfsPointer } from '#lfs.js';
/* `remoteMachine` and `selectRemoteFacet` are deliberately absent: one subpath
 * per machine (P8), which is why `./remote-machine` exists and why no other
 * machine is here either. Keeping them would put `xstate` in the graph of every
 * page that imports a remote *type* from this barrel. */
export type {
  RemoteActors,
  RemoteFacet,
  RemoteMachineContext,
  RemoteMachineEmitted,
  RemoteMachineEvent,
  RemoteMachineInput,
  RemoteRecord,
} from '#remote.machine.js';
export { createLfsClient, LfsQuotaError, withQuotaPaths } from '#lfs-client.js';
export type { LfsClient, LfsClientOptions, LfsQuotaRefusal } from '#lfs-client.js';
export { createRevisionHttpClient, keepaliveLimitBytes } from '#http-client.js';
export type {
  RevisionAuthorization,
  RevisionHttpClient,
  RevisionHttpClientOptions,
  RevisionHttpRequest,
  RevisionHttpResponse,
} from '#http-client.js';
/*
 * The sync scheduler's public value types (W13).
 *
 * The machine itself stays on its own subpath (`@taucad/revisions/sync-machine`)
 * so `xstate` is not in the graph of every consumer of this barrel; these are
 * the shapes a *renderer* needs — the Sync row, the header chip and the queue.
 */
export type {
  SyncFacet,
  SyncPushOutcome,
  SyncQueueEntry,
  SyncQueueRecord,
  SyncRefOutcome,
  SyncRefStatus,
} from '#sync.machine.js';
/* The close flush's last POST (W13): a browser host wraps its client with
 * `recordLastPush` and offers that recorded POST again on `pagehide`. */
export { recordLastPush, sendKeepalivePush } from '#sync-keepalive.js';
export type { KeepalivePushOptions, KeepalivePushOutcome, PushRecorder, RecordedPush } from '#sync-keepalive.js';
export {
  createGitRemoteTransport,
  gitProxyUrl,
  gitRemoteUrlProblem,
  isGithubRemoteUrl,
  isHostLocalRef,
  isTauApiUrl,
  lfsRemoteUnsupportedMessage,
  reauthorizationRequired,
  refPatternIsHostLocal,
  remoteCarriesLargeObjects,
  remoteKindOf,
  remoteOf,
  remoteTrackingRef,
  tauRemoteName,
  tauRemoteUrl,
} from '#remotes.js';
export type {
  GitRemoteCredential,
  GitRemoteTransport,
  Remote,
  RemoteKind,
  RemoteReauthorizationCode,
} from '#remotes.js';
export { conflictLabels, materializeConflict, readConflictTerms } from '#revision-conflict.js';
export type { MaterializeConflictInput, RevisionConflictTerms } from '#revision-conflict.js';
export { readRevisionDiff, readRevisionLog, readRevisionPlace } from '#revision-verbs.js';
export type { RevisionLogRequest, RevisionPlace, RevisionRow } from '#revision-verbs.js';
export {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnoreEntries,
  generatedIgnorePath,
  isLargeObjectPath,
  isTrackedLargeObjectPath,
  largeObjectExtensions,
  largeObjectThresholdBytes,
} from '#workspace-config.js';

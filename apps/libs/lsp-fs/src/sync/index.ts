/**
 * Tier-2 synchronous FS bridge entry (`@taucad/lsp-fs/sync`).
 *
 * @public
 */
export * from '#sync/sync-fs-protocol.js';
export { createSyncFsClient } from '#sync/sync-fs-client.js';
export type { CreateSyncFsClientOptions, SyncFsClient, SyncFsProbe } from '#sync/sync-fs-client.js';
export { attachSyncFsServer, createSyncFsServerHandler, feedIndexMirror } from '#sync/sync-fs-server.js';
export type { SyncFsIndexSource, SyncFsWorkspaceAdapter } from '#sync/sync-fs-server.js';
export {
  createIndexMirror,
  indexMirrorCovers,
  tauIndexMirrorMessageSchema,
  toIndexMirrorWireEntry,
} from '#sync/index-mirror.js';
export type { IndexMirrorWireEntry, TauIndexMirrorMessage, WorkerIndexMirror } from '#sync/index-mirror.js';

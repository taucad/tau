/**
 * Tier-2 synchronous FS bridge entry (`@taucad/lsp-fs/sync`).
 *
 * @public
 */
export * from '#sync/sync-fs-protocol.js';
export { createSyncFsClient } from '#sync/sync-fs-client.js';
export type { CreateSyncFsClientOptions, SyncFsClient, SyncFsProbe } from '#sync/sync-fs-client.js';
export { attachSyncFsServer, createSyncFsServerHandler } from '#sync/sync-fs-server.js';
export type { SyncFsWorkspaceAdapter } from '#sync/sync-fs-server.js';

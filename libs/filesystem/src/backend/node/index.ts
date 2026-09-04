/**
 * `@taucad/filesystem/backend/node` — the host half of the node storage
 * backend. This entry point pulls in `node:fs`; never re-export it from the
 * browser barrel (`backend/index.ts`), which the file-manager worker bundles.
 */

export { NodeFsProvider } from '#backend/node/provider.js';
export { serveNodeFsProvider } from '#backend/node/host.js';
export type { NodeFsHostOptions } from '#backend/node/host.js';
export { toNodeFsPort } from '#backend/node/port.js';
export type { EmitterPort, NodeFsPort } from '#backend/node/port.js';
export { nodeFsProtocolVersion } from '#backend/node/protocol.js';
export type { NodeFsWatchEvent } from '#backend/node/protocol.js';

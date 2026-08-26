/* oxlint-disable no-barrel-files/no-barrel-files -- public Node-only subpath barrel */

/**
 * Node-only transport entry — `@taucad/runtime/transport/node`.
 *
 * Hosts {@link nodeWorkerTransport}, which statically imports
 * `node:worker_threads`. Importing this subpath from a browser bundle
 * is a contract violation: rolldown / Vite emits the
 * "Module 'node:worker_threads' has been externalized for browser
 * compatibility" warning and inflates the browser module graph until
 * tree-shaking eventually strips the dead code.
 *
 * The split mirrors `@taucad/runtime/filesystem/node` (which gates
 * `fromNodeFs`) so each Node-only primitive lives behind its own
 * environment-tagged subpath. Browser-reachable barrels
 * (`@taucad/runtime`, `@taucad/runtime/transport`) intentionally
 * exclude these symbols.
 *
 * The standalone {@link nodeWorkerHost} factory is also exported here so
 * application-owned worker entries can import it without pulling in the
 * client transport.
 *
 * @public
 */

export { nodeWorkerTransport } from '#transport/node-worker-transport.js';
export type { NodeWorkerLike, NodeWorkerClientOptions } from '#transport/node-worker-client.js';
export type { NodeWorkerHostOptions } from '#transport/node-worker-host.js';
export { nodeWorkerHost } from '#transport/node-worker-host.js';
export { nodeWorkerClient } from '#transport/node-worker-client.js';

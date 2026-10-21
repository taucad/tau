/* oxlint-disable no-barrel-files/no-barrel-files -- Public Node-only runner subpath. */
/** Node bindings of the runner: a project filesystem on the real disk, the engine selector and the worker pool. @module */

export { createNodeVmFileSystem, resolveUnderRoot } from '#runner/node/node-vm-filesystem.js';
export { createNodeGeoSpecEngine } from '#runner/node/engine.js';
export type { CreateNodeGeoSpecEngineOptions, GeoSpecEngineBinding, NodeGeoSpecEngine } from '#runner/node/engine.js';
export { createGeoSpecNodePoolRunner, createNodeWorkerHandle } from '#runner/node/pool-runner.js';
export type { GeoSpecNodePoolOptions, NodeWorkerLike } from '#runner/node/pool-runner.js';
export type { GeoSpecExporterModule } from '#runner/node/pool-worker-entry.js';

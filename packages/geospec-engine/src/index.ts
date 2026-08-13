/**
 * `@taucad/geospec-engine` — the GeoSpec execution engine.
 *
 * The engine implements the `geospec` substrate's executor protocol: matcher
 * bodies, geometry proofs, the evidence ledger and cache, the kernel adapters,
 * the runner hosts, and the `geospec` CLI. Import
 * `@taucad/geospec-engine/register` once at startup to install it.
 *
 * @module
 */

export { geoSpecEngineImplementation } from '#register.js';

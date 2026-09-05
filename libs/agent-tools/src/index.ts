/**
 * The host-neutral chat tool environment.
 *
 * Import the subpath you need — `@taucad/agent-tools/registry`, `/skills`,
 * `/geospec`, `/capture` — so a browser bundle never pulls the GeoSpec graph in
 * to build a file-tool registry.
 *
 * @module
 */

export * from '#registry/index.js';
export * from '#skills/index.js';
export * from '#capture/index.js';

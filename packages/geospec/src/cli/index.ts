/* oxlint-disable no-barrel-files/no-barrel-files -- Public Node-only CLI subpath. */
/** The `geospec` CLI as a library, for hosts that wrap it, such as `tau test`. @module */

export { runGeoSpecCli } from '#cli/cli.js';
export type { GeoSpecCliHost } from '#cli/cli.js';
export { createNodeGeoSpecCliHost } from '#cli/node-host.js';
export type { NodeGeoSpecCliHostOptions } from '#cli/node-host.js';

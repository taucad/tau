/**
 * `@taucad/openscad` — OpenSCAD CAD kernel for `@taucad/runtime`.
 *
 * This package is **GPL-2.0-or-later** because it bundles `openscad-wasm-prebuilt`.
 * The rest of `@taucad/*` (including `@taucad/runtime`) is MIT-licensed.
 *
 * @public
 * @module
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export { openscad } from '#openscad.kernel.js';
export { openscadExportSchemas, openscadRenderSchema, openscadTessellationSchema } from '#openscad.schemas.js';
export type { OpenScadTessellationOptions } from '#openscad.schemas.js';

/**
 * Engine-side handle on the substrate's pure L3 selector resolution.
 *
 * Resolution is substrate work and stays substrate work; the engine binds the
 * entry point so proofs and the migrated oracles reach it through one
 * specifier.
 *
 * @module
 */

import { resolve as resolveSelector } from 'geospec/selector';

/**
 * Resolve one selector against a selector index.
 *
 * @param selector - The selector to resolve.
 * @param index - The per-subject selector index.
 * @returns The structured selection.
 * @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- `no-barrel-files` forbids the `export … from` form outside index.ts.
export const resolve = resolveSelector;

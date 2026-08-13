/**
 * The engine-side collector entry point.
 *
 * The collector itself is substrate-owned (D-S2); these are its public
 * lifecycle symbols, re-exported so engine modules and the migrated oracle
 * suites resolve them through one `#runner/*` specifier (PE2.a's shim
 * pattern).
 *
 * Importing this module also INSTALLS this engine build. A collector with no
 * engine behind it answers every matcher with `GEOSPEC_ENGINE_UNAVAILABLE`, so
 * reaching for the collector from inside the engine package is exactly the
 * moment a host would have imported `@taucad/geospec-engine/register`.
 * Registration is idempotent.
 *
 * @module
 */

// oxlint-disable-next-line import/no-unassigned-import -- The import IS the effect: it installs this engine build, exactly as a host's `@taucad/geospec-engine/register` does.
import '#register-node.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- A one-symbol-set alias shim; `unicorn/prefer-export-from` demands this form and `no-barrel-files` forbids it outside index.ts (PE2.d's recorded conflict).
export { clearCollectorGlobals, createCollector, installCollector } from 'geospec/runner';

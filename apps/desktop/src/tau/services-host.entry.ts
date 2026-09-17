/**
 * Fork entry for the services utility (charter W12, D17).
 *
 * Same shape and the same reasons as `kernel-host.entry.ts`, which carries the
 * explanation: the compile cache has to be enabled before an ESM graph is
 * compiled, the directory cannot travel as `NODE_COMPILE_CACHE`, and a killed
 * utility persists nothing without the flush.
 */

import { enableCompileCache, flushCompileCache } from 'node:module';

enableCompileCache(process.env['TAU_COMPILE_CACHE_DIR']);

await import('#tau/services-host.js');

flushCompileCache();

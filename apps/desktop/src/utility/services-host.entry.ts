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

/* The utilities write into main's rotating diagnostics file, which is the app's (desktop split blueprint D-DS6): hand
 * the library the factory before its graph is imported. Both imports are dynamic so they compile with the cache on. */
const [{ createDiagnosticsLog }, { provideDiagnosticsLog }] = await Promise.all([
  import('#main/diagnostics.js'),
  import('@taucad/desktop-services-host/diagnostics'),
]);
provideDiagnosticsLog(createDiagnosticsLog);

await import('@taucad/desktop-services-host/services-host');

flushCompileCache();

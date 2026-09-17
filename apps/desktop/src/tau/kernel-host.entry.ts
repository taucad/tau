/**
 * Fork entry for the kernel utility (charter W12, D17).
 *
 * This file exists for one reason: to turn Node's on-disk compile cache on
 * *before* the kernel host's module graph is compiled. ESM links and compiles a
 * whole static graph before evaluating any module in it, so the call cannot
 * live in `kernel-host.ts` — by the time that body runs, every chunk it imports
 * has already been compiled and the cache has nothing left to save. Enabling
 * here and reaching the real entry through a dynamic `import()` is what puts
 * that graph on the cached side of the call.
 *
 * Two Electron 43.5.1 behaviours shape the three lines below, both measured:
 *
 * - `NODE_COMPILE_CACHE` must stay *out* of this process's environment. The
 *   utility bootstrap reads it, reports the cache as already enabled, and then
 *   writes nothing; the directory therefore arrives under Tau's own name
 *   (`compileCacheEnvironment`) and is passed to the call.
 * - Node only persists the cache when the process exits cleanly, and main
 *   `kill()`s its utilities, so without the flush the cache never warms across
 *   launches: 166 files / 2.6 MB on a clean exit, 0 on a kill.
 *
 * Deferring the real entry costs nothing at the wire: main posts the boot frame
 * immediately after `utilityProcess.fork`, and Electron queues it on the
 * utility's `parentPort` until `serveElectronRuntime` attaches its listener,
 * which is already a module graph later.
 */

import { enableCompileCache, flushCompileCache } from 'node:module';

enableCompileCache(process.env['TAU_COMPILE_CACHE_DIR']);

await import('#tau/kernel-host.js');

// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
/* ponytail: one flush, for the static graph that fork→hello pays for. What the
 * kernel imports dynamically afterwards (the engine, the wasm loaders) is
 * compiled after this point and stays uncached — flush again from there if a
 * profile ever shows that compile on a hot path. */
flushCompileCache();

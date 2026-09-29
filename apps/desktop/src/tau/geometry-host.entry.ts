/** Enable the utility's compile cache before linking the geometry graph. */
import { enableCompileCache, flushCompileCache } from 'node:module';

enableCompileCache(process.env['TAU_COMPILE_CACHE_DIR']);

await import('#tau/geometry-host.js');

flushCompileCache();

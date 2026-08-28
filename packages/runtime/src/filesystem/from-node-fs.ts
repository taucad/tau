/**
 * Public opaque {@link RuntimeFileSystem} factory backed by Node.js
 * `fs.promises`. Exposed through the
 * `@taucad/runtime/filesystem/node` subpath so the bundle stays free of
 * Node-only imports for the default browser-safe entry.
 *
 * @public
 */

import { _fromNodeFsHandle } from '#transport/_internal/from-node-fs-handle.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

/**
 * Create an opaque {@link RuntimeFileSystem} backed by Node.js
 * `fs.promises`. Pass the result to
 * `inProcessTransport({ runtime, fileSystem })`,
 * `nodeWorkerTransport({ url, fileSystem })`, or `webWorkerTransport({ fileSystem })`.
 *
 * @param basePath - Host filesystem directory used as the runtime filesystem root.
 * Runtime paths are resolved within this directory; the host path itself is
 * not exposed to kernels, bundlers, or middleware.
 * @public
 *
 * @example <caption>Server-side Node.js filesystem</caption>
 * ```typescript
 * import { createRuntimeClient, defineRuntime } from '@taucad/runtime';
 * import type { AnyPluginInstance } from '@taucad/runtime/plugin';
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { fromNodeFs } from '@taucad/runtime/filesystem/node';
 *
 * declare const kernelPlugin: AnyPluginInstance;
 * declare const bundlerPlugin: AnyPluginInstance;
 * const runtime = defineRuntime({ plugins: [kernelPlugin, bundlerPlugin] });
 * const client = createRuntimeClient({
 *   transport: inProcessTransport({
 *     runtime,
 *     fileSystem: fromNodeFs('/path/to/project'),
 *   }),
 * });
 * ```
 */
export const fromNodeFs = (basePath: string): RuntimeFileSystem => wrapAsRuntimeFileSystem(_fromNodeFsHandle(basePath));

/**
 * Opaque runtime filesystem type — the consumer-facing FS handle.
 *
 * `RuntimeFileSystem` is fully opaque: there is no public `kind`,
 * `port`, `fs`, or `handle` accessor. Transports resolve the underlying
 * implementation via the `transport/_internal/runtime-filesystem-handle`
 * helpers — those are reachable only from transport implementations,
 * never from the public surface.
 *
 * Construct with one of the bundled `fromX` factories ({@link fromMemoryFs},
 * {@link fromFsLike}, {@link fromFileSystemBridge}) or one of the subpath-exported
 * factories (`fromNodeFs` from `@taucad/runtime/filesystem/node`,
 * `fromBrowserFs` from `@taucad/runtime/filesystem/browser`).
 *
 * @public
 */

import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import { _fromFsLikeHandle } from '#transport/_internal/from-fs-like-handle.js';
import type { FsLike } from '#transport/_internal/from-fs-like-handle.js';
import { hasRuntimeFileSystemHandle, wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.types.js';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';

export type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.types.js';

/**
 * Type guard: returns `true` when `value` is an opaque
 * {@link RuntimeFileSystem} produced by a `fromX` factory.
 *
 * @public
 */
export const isRuntimeFileSystem = (value: unknown): value is RuntimeFileSystem => hasRuntimeFileSystemHandle(value);

/* ----------------------------------------------------------------- *
 * Bundled factories                                                  *
 * ----------------------------------------------------------------- */

/**
 * Create an opaque {@link RuntimeFileSystem} backed by an in-memory
 * `Map`. Suitable for tests, fixtures, and lightweight playgrounds.
 *
 * @param files - Optional canonical root-relative path-to-content map.
 * @public
 *
 * @example <caption>Seed a runtime client with an in-memory FS</caption>
 * ```typescript
 * import { createRuntimeClient, fromMemoryFs } from '@taucad/runtime';
 *
 * const fs = fromMemoryFs({
 *   'main.ts': 'export default () => "hello";',
 * });
 * ```
 */
export const fromMemoryFs = (files?: Record<string, string | Uint8Array<ArrayBuffer>>): RuntimeFileSystem =>
  wrapAsRuntimeFileSystem(_fromMemoryFsHandle(files));

/**
 * Create an opaque {@link RuntimeFileSystem} from an already-confined
 * `fs.promises`-shaped object such as BrowserFS or memfs. Use `fromNodeFs`
 * for an unconfined Node.js filesystem so the adapter can establish the runtime root.
 *
 * Renamed from `fromFsLikeOpaque` (R7) per v6 Appendix A — public `fromX`
 * factories are always opaque, no `Opaque` suffix.
 *
 * @param fsLike - Already-confined object exposing the {@link FsLike} surface.
 * Runtime paths are resolved within that object; `''` is its root.
 * @public
 */
export const fromFsLike = (fsLike: FsLike): RuntimeFileSystem => wrapAsRuntimeFileSystem(_fromFsLikeHandle(fsLike));

/**
 * Create an opaque {@link RuntimeFileSystem} bridged to a remote filesystem
 * authority through a filesystem bridge connection.
 * The connection must already be rooted; its selected root is exposed to the
 * runtime as `''` without exposing any authority-global or host path.
 *
 * @param openConnection - Opens a fresh filesystem bridge connection for each
 * runtime binding or initialize retry.
 * @public
 */
export const fromFileSystemBridge = (openConnection: () => FileSystemBridgeConnection): RuntimeFileSystem =>
  wrapAsRuntimeFileSystem({
    kind: 'channel',
    create: openConnection,
  });

/* Re-export `FsLike` from this module so the `@taucad/runtime/filesystem`
 * subpath barrel exposes both the type and the factory next to
 * `RuntimeFileSystem`. The type itself lives next to its handle factory
 * inside `transport/_internal/`; only the type is re-exported here. */
export type { FsLike } from '#transport/_internal/from-fs-like-handle.js';

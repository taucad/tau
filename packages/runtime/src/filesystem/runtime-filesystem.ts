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
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';

declare const __runtimeFileSystemBrand: unique symbol;

/**
 * Opaque consumer-facing filesystem handle.
 *
 * Reaching into the value to inspect the underlying handle is a type
 * error — the `[__runtimeFileSystemBrand]` field is a phantom
 * discriminant exposed only to the type system, never assignable from
 * user code.
 *
 * @public
 */
export type RuntimeFileSystem = {
  /**
   * Phantom brand carrier — the symbol is unexported so consumer code
   * can never construct a value satisfying this slot. Marked `@internal`
   * so doc generators (e.g. `fumadocs-typescript` `<auto-type-table>`)
   * filter it out before serialization, instead of emitting the
   * symbol's TS-internal display name (which contains literal `@`
   * characters that break MDX/JSX parsers downstream).
   *
   * @internal
   */
  readonly [__runtimeFileSystemBrand]: true;
};

/**
 * Type guard: returns `true` when `value` is an opaque
 * {@link RuntimeFileSystem} produced by a `fromX` factory.
 *
 * @internal
 */
export const isRuntimeFileSystem = (value: unknown): value is RuntimeFileSystem => hasRuntimeFileSystemHandle(value);

/* ----------------------------------------------------------------- *
 * Bundled factories                                                  *
 * ----------------------------------------------------------------- */

/**
 * Create an opaque {@link RuntimeFileSystem} backed by an in-memory
 * `Map`. Suitable for tests, fixtures, and lightweight playgrounds.
 *
 * @param files - Optional runtime-path-to-content map. Relative keys and keys
 * beginning with `/` are normalized within the in-memory filesystem.
 * @public
 *
 * @example <caption>Seed a runtime client with an in-memory FS</caption>
 * ```typescript
 * import { createRuntimeClient, fromMemoryFs } from '@taucad/runtime';
 *
 * const fs = fromMemoryFs({
 *   '/main.ts': 'export default () => "hello";',
 * });
 * ```
 */
export const fromMemoryFs = (files?: Record<string, string>): RuntimeFileSystem =>
  wrapAsRuntimeFileSystem(_fromMemoryFsHandle(files));

/**
 * Create an opaque {@link RuntimeFileSystem} from any `fs.promises`-shaped
 * object (BrowserFS, memfs, Node `fs.promises`).
 *
 * Renamed from `fromFsLikeOpaque` (R7) per v6 Appendix A — public `fromX`
 * factories are always opaque, no `Opaque` suffix.
 *
 * @param fsLike - Any object exposing the {@link FsLike} surface.
 * @param rootPath - Optional path prefix for all operations.
 * @public
 */
export const fromFsLike = (fsLike: FsLike, rootPath?: string): RuntimeFileSystem =>
  wrapAsRuntimeFileSystem(_fromFsLikeHandle(fsLike, rootPath));

/**
 * Create an opaque {@link RuntimeFileSystem} bridged to a remote filesystem
 * authority through a filesystem bridge connection.
 *
 * @param connection - Filesystem bridge connection opened by `@taucad/fs-bridge`.
 * @public
 */
export const fromFileSystemBridge = (connection: FileSystemBridgeConnection): RuntimeFileSystem =>
  wrapAsRuntimeFileSystem({
    kind: 'channel',
    port: connection.port,
    dispose: connection.dispose,
  });

/* Re-export `FsLike` from this module so the `@taucad/runtime/filesystem`
 * subpath barrel exposes both the type and the factory next to
 * `RuntimeFileSystem`. The type itself lives next to its handle factory
 * inside `transport/_internal/`; only the type is re-exported here. */
export type { FsLike } from '#transport/_internal/from-fs-like-handle.js';

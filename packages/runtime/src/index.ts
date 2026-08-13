/* oxlint-disable no-barrel-files/no-barrel-files -- public API re-export */
// Client
export { createRuntimeClient } from '#client/runtime-client.js';
export {
  RenderTimeoutError,
  isRenderTimeoutError,
  RenderAbortedError,
  isRenderAbortedError,
} from '#framework/runtime-worker-client.js';
export {
  SharedPoolEntryNotFoundError,
  isSharedPoolEntryNotFoundError,
} from '#transport/_internal/shared-pool-errors.js';
export {
  NoRenderOutcomeError,
  isNoRenderOutcomeError,
  RuntimeNotConnectedError,
  isRuntimeNotConnectedError,
  RuntimeConnectionError,
  isRuntimeConnectionError,
  RuntimeTerminatedError,
  isRuntimeTerminatedError,
} from '#client/runtime-client.js';
export type {
  RuntimeClient,
  RuntimeClientOptions,
  FilesystemRuntimeSource,
  InlineRuntimeSource,
  RuntimeExportOptions,
  RuntimeRenderInput,
  RuntimeSetOptionsInput,
  RuntimeSource,
  RuntimeSourceContent,
  RuntimeSourceFiles,
  ExportResult,
  RenderOutcome,
  RenderStatus,
  RuntimeLifecycleState,
  RuntimeConnectionCause,
  RuntimeTerminatedCause,
} from '#client/runtime-client.js';

// Plugin types
export type {
  KernelPlugin,
  MiddlewarePlugin,
  BundlerPlugin,
  TranscoderPlugin,
  CollectExportFormats,
  CollectFormatMap,
  CollectKernelIds,
  CollectRenderOptions,
  CollectTranscodeMap,
  CollectTranscoderTargets,
  ExportFormatsFor,
  ExportContentFor,
  ExportOptionsFor,
  KnownSourceFormats,
  KnownTargetFormats,
  KnownTranscoderIds,
  MergeExportMap,
  RenderOptionsFor,
  RenderContentFor,
} from '#plugins/plugin-types.js';

// Plugin authoring helpers
export { defineKernel } from '#types/runtime-kernel.types.js';
export { defineMiddleware } from '#middleware/runtime-middleware.js';
export { defineBundler } from '#types/runtime-bundler.types.js';
export { defineTranscoder } from '#types/runtime-transcoder.types.js';

// Filesystem factories (browser-safe; `fromNodeFs` is at `@taucad/runtime/filesystem/node`).
// Consumers always work with the opaque `RuntimeFileSystem`; transports
// bridge it internally.
export { fromMemoryFs, fromFsLike, fromFileSystemBridge, isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export type { FsLike, RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export { fromBrowserFs } from '#filesystem/from-browser-fs.js';

// Transport author API + shared types. `TransportDescriptor<Id>` is
// the canonical descriptor type re-exported from
// `@taucad/runtime/transport`.
//
// Concrete transports are deliberately NOT re-exported here. Each
// ships behind its own topology-tagged subpath so consumers signal
// their target topology at import time and cross-environment
// footguns stay impossible:
//
//   - `@taucad/runtime/transport/in-process` — same-isolate
//   - `@taucad/runtime/transport/web`        — browser `Worker`
//   - `@taucad/runtime/transport/node`       — `node:worker_threads`
//
// The Node split is load-bearing for browser bundles
// (`node:worker_threads` would otherwise externalize on every browser
// build); the web/in-process splits round out the symmetry so Node /
// CLI bundles never accidentally drag DOM-flavoured worker code into
// their graph.
export type {
  TransportPlugin,
  RuntimeFromTransport,
  RuntimeTransportClient,
  RuntimeTransportCloseResult,
  RuntimeTransportPreviewReservation,
  RuntimeTransportRenderTarget,
  RuntimeTransportTimeoutRecovery,
  RuntimeTransportHost,
  TransportClientReady,
  TransportHostReady,
} from '#transport/index.js';
export { defineRuntimeTransport } from '#transport/index.js';

// Worker-author primitives (custom transports) live at the
// `@taucad/runtime/worker-internals` subpath — they would eagerly
// pull `esbuild-wasm` into this default browser-safe entry via
// `KernelRuntimeWorker` → `KernelWorker` → `#bundler/esbuild-core.js`,
// which the `browser-compat` jsdom gate forbids.

// Core types (runtime, kernel, bundler, middleware, protocol)
export * from '#types/index.js';

// File content cache (TR11)
export { lruCache, sharedPoolCache } from '#cache/file-content-cache.js';
export type { FileContentCache, LruCacheOptions } from '#cache/file-content-cache.js';

// Helpers
export { createKernelSuccess, createKernelError } from '#kernels/kernel-helpers.js';

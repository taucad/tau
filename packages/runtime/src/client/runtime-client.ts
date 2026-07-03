/**
 * Runtime client entry.
 *
 * The implementation lives in `runtime-client-core.ts` so browser/framework
 * entries and the package root share the same explicit-transport behavior.
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public root client facade over browser-safe core */

export {
  createRuntimeClientWithTransport as createRuntimeClient,
  createRuntimeClientWithTransport,
  NoRenderOutcomeError,
  isNoRenderOutcomeError,
  RuntimeNotConnectedError,
  isRuntimeNotConnectedError,
  RuntimeConnectionError,
  isRuntimeConnectionError,
  RuntimeTerminatedError,
  isRuntimeTerminatedError,
} from '#client/runtime-client-core.js';
export type {
  RuntimeConfigInput,
  RuntimeConfigOutput,
  RuntimeConfigProvider,
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
  RuntimeClientOptionsWithTransport,
  RuntimeConnectionCause,
  RuntimeTerminatedCause,
} from '#client/runtime-client-core.js';

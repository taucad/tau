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
  SelfRenderExportSupersededError,
  isSelfRenderExportSupersededError,
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
  CodeInput,
  FileInput,
  ExportResult,
  RenderOutcome,
  RuntimeLifecycleState,
  RuntimeClientOptionsWithTransport,
  RuntimeConnectionCause,
  RuntimeTerminatedCause,
} from '#client/runtime-client-core.js';

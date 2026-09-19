/**
 * Runtime client entry.
 *
 * The implementation lives in `runtime-client-core.ts` so browser/framework
 * entries and the package root share the same explicit-transport behavior.
 */

/* oxlint-disable no-barrel-files/no-barrel-files -- public root client facade over browser-safe core */

export {
  createRuntimeClient,
  NoRenderOutcomeError,
  isNoRenderOutcomeError,
  RuntimeNotConnectedError,
  isRuntimeNotConnectedError,
  RuntimeConnectionError,
  isRuntimeConnectionError,
  RuntimeTerminatedError,
  isRuntimeTerminatedError,
} from '#client/runtime-client-core.js';
export { TranscodeTimeoutError, isTranscodeTimeoutError } from '#framework/runtime-worker-client.js';
export type {
  RuntimeConfigInput,
  RuntimeConfigOutput,
  RuntimeConfigProvider,
  RuntimeClient,
  RuntimeClientOptions,
  FilesystemRuntimeSource,
  InlineRuntimeSource,
  RuntimeExportOptions,
  RuntimeEvaluateInput,
  RuntimeRenderInput,
  RuntimeSource,
  RuntimeSourceContent,
  RuntimeSourceFiles,
  RuntimeSourceSnapshotAdditionalPath,
  RuntimeSourceSnapshotData,
  RuntimeSourceSnapshotFile,
  RuntimeSourceSnapshotFileRole,
  RuntimeSourceSnapshotInput,
  RuntimeSourceSnapshotResult,
  ExportResult,
  RenderOutcome,
  RenderStatus,
  RuntimeLifecycleState,
  RuntimeClientOptionsWithTransport,
  RuntimeConnectionCause,
  RuntimeTerminatedCause,
  RuntimeTerminatedDetail,
} from '#client/runtime-client-core.js';

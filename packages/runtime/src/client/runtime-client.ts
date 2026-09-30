/** Browser-safe document runtime client entry shared with the package root. */
/* oxlint-disable no-barrel-files/no-barrel-files -- public root client facade */
export { createRuntimeClient } from '#client/runtime-document-client-core.js';
export { RuntimeTerminatedError, isRuntimeTerminatedError } from '#client/runtime-terminated-error.js';
export type {
  RuntimeClient,
  RuntimeClientOptions,
  RuntimeClientOptionsWithTransport,
  RuntimeLifecycleState,
} from '#client/runtime-document-client-core.js';
export type {
  RuntimeSource,
  RuntimeSourceFiles,
  RuntimeSourceContent,
  InlineRuntimeSource,
  FilesystemRuntimeSource,
} from '#client/runtime-document-source.js';
export type {
  RuntimeDocument,
  OpenInput,
  DocumentViewRequest,
  DocumentExportRequest,
  DocumentUpdate,
  Evaluation,
  Rendering,
  Description,
  ExportResult,
  UpdateOutcome,
  ViewUpdateOutcome,
  ViewSubscription,
  ViewOffer,
  ExportOffer,
  DocumentStatus,
  ViewStatus,
  WideViewRequest,
  WideExportRequest,
} from '#client/runtime-document.types.js';
export {
  OperationAbortedError,
  isOperationAbortedError,
  OperationTimeoutError,
  isOperationTimeoutError,
} from '#framework/runtime-operation-errors.js';

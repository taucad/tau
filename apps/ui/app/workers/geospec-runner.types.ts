import type { RunGeoSpecTestsRpcInput, RunGeoSpecTestsRpcResult } from '@taucad/chat';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';

export type GeoSpecRunnerWorkerInitializeRequest = {
  type: 'initialize';
  requestId: string;
  sessionId: string;
  runtimeConfig: UiRuntimeConfigInput;
  fileSystemPort: MessagePort;
};

export type GeoSpecRunnerWorkerRunRequest = {
  type: 'run';
  requestId: string;
  sessionId: string;
  args: RunGeoSpecTestsRpcInput;
  /** Foreign candidate bytes remain untrusted until this run recomputes matching facts. */
  candidates?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  /** A successful device-local consent check in this run, before dispatch. */
  candidateSharingEnabled?: boolean;
};

export type GeoSpecRunnerWorkerAbortRequest = {
  type: 'abort';
  requestId: string;
  sessionId: string;
  targetRequestId: string;
  reason?: string;
};

export type GeoSpecRunnerWorkerCloseRequest = {
  type: 'close';
  requestId: string;
  sessionId?: string;
};

export type GeoSpecRunnerWorkerRequest =
  | GeoSpecRunnerWorkerInitializeRequest
  | GeoSpecRunnerWorkerRunRequest
  | GeoSpecRunnerWorkerAbortRequest
  | GeoSpecRunnerWorkerCloseRequest;

export type GeoSpecRunnerWorkerInitializedResponse = {
  type: 'initialized';
  requestId: string;
  sessionId: string;
};

export type GeoSpecRunnerWorkerResultResponse = {
  type: 'result';
  requestId: string;
  result: RunGeoSpecTestsRpcResult;
  /** Facts established by this same run, outside the authored test result. */
  candidates?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
};

export type GeoSpecRunnerWorkerErrorResponse = {
  type: 'error';
  requestId: string;
  message: string;
};

export type GeoSpecRunnerWorkerClosedResponse = {
  type: 'closed';
  requestId?: string;
  sessionId?: string;
};

export type GeoSpecRunnerWorkerResponse =
  | GeoSpecRunnerWorkerInitializedResponse
  | GeoSpecRunnerWorkerResultResponse
  | GeoSpecRunnerWorkerErrorResponse
  | GeoSpecRunnerWorkerClosedResponse;

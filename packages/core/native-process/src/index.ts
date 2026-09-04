/* oxlint-disable no-barrel-files/no-barrel-files -- public package entry */
export {
  NativeProcessSession,
  NativeWorkerReportedError,
  processEnvironment,
  terminateProcessTree,
} from '#native-process-session.js';
export type {
  NativeArtifact,
  NativeProcessEventSubscription,
  NativeProcessRequest,
  NativeProcessResource,
  NativeProcessSessionOptions,
  NativeProtocolResponse,
} from '#native-process-session.js';
export { createWorkspaceMirror } from '#workspace-mirror.js';
export type { WorkspaceMirror, WorkspaceMirrorOptions } from '#workspace-mirror.js';

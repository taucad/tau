/* oxlint-disable no-barrel-files/no-barrel-files -- library entry: the sandbox surface @taucad/native-process-core re-exports and bundles */
/**
 * `@taucad/sandbox`: the operating-system sandbox every native kernel worker and the contained shell run in, and
 * the host process-table reads their custody uses. Private: `@taucad/native-process-core` bundles it and re-exports
 * the launcher from its root, so nothing outside the workspace imports this name.
 */
export {
  acquireNativeSandbox,
  launchInNativeSandbox,
  nativeSandboxBwrapVariable,
  nativeSandboxPolicy,
  NativeRuntimeUnavailableError,
  releaseNativeSandbox,
  spawnInNativeSandbox,
} from '#native-sandbox.js';
export type { NativeSandboxLaunch, NativeSandboxProfile } from '#native-sandbox.js';
export { linuxChildrenTree, sampleLinuxResident } from '#child-resident.js';
export { ownedProcesses, processTable, terminateOwnedProcesses, trackDescendants } from '#shell/process-tree.js';

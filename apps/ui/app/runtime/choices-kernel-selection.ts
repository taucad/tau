/**
 * The kernel selection a project runtime is built with, derived from a `choices` value (app state orchestration plan
 * § 4 A6a; inventory row S35). It is the selection `useProjectKernelOptions` returns for the same placement, reuse
 * mode and revisions, with the same `key`, so a later lane can replace the hook without rebuilding a runtime that did
 * not need it.
 *
 * Kept apart from `runtime/choices` so the remote kernel's transport stays out of what imports `choices`.
 *
 * @module
 */
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import type { ProjectKernelSelection } from '#hooks/use-project-kernel-options.js';
import type { ProjectChoices } from '#runtime/choices.js';

/**
 * Derive the kernel selection for one project.
 *
 * @param choices - The compute placement, reuse mode and their revisions.
 * @param project - The project and the native kernel it asked for, if any.
 * @returns The options factory, whether it runs on this device, and the key that changes when the runtime must be
 *   rebuilt.
 */
export const selectProjectKernelSelection = (
  choices: Pick<
    ProjectChoices,
    'computePlacement' | 'computeSelectionRevision' | 'computeReuseMode' | 'computeReuseRevision'
  >,
  project: Readonly<{ projectId: string; nativeKernelId?: string }>,
): ProjectKernelSelection => {
  const { computePlacement: placement, computeSelectionRevision, computeReuseMode, computeReuseRevision } = choices;
  const isLocal = placement.state === 'local';
  const key = `${isLocal ? `local:${String(computeReuseRevision)}` : placement.deviceId}:${String(computeSelectionRevision)}`;
  return {
    kernelOptionsFactory: isLocal
      ? localKernelOptions(project.projectId, project.nativeKernelId, computeReuseMode)
      : remoteKernelOptions,
    key,
    isLocal,
  };
};

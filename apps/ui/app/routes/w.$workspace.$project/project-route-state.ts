/**
 * What the project route is showing, as one value (blueprint W1).
 *
 * The route used to decide this inline, inside the branch that also chose what
 * to render, which is why twelve of its states quietly replaced the whole app
 * shell. Here it is a pure function of what the gate already holds, so the gate
 * publishes one state, the shell always mounts, and the route component picks
 * between the editor and a notice.
 *
 * Adding a state is a member here, a case below, and a row in
 * `project-route-notices.tsx`. Nothing else has to learn about it.
 */
import { createContext, useContext } from 'react';
import type { ProjectManifest } from '@taucad/types';
import type { PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import type { ProjectSessionCloseReason } from '#machines/project-session.machine.js';

/** The slugs a project URL was addressed by, for a route that resolved to nothing. */
export type ProjectRouteSlugs = Readonly<{
  workspaceSlug: string;
  projectSlug: string;
}>;

/**
 * Every state `/w/:workspace/:project` can be in.
 *
 * `editor` is the only one that mounts a project's resources; every other
 * member is a notice. @public
 */
export type ProjectRouteState =
  | Readonly<{ kind: 'resolving' }>
  | Readonly<{ kind: 'editor'; projectId: string; project: ProjectManifest }>
  | Readonly<{
      kind: 'closed';
      projectId: string;
      project: ProjectManifest;
      reason: ProjectSessionCloseReason | undefined;
    }>
  | Readonly<{ kind: 'trashed'; projectId: string; project: ProjectManifest }>
  | Readonly<{ kind: 'missing'; slugs: ProjectRouteSlugs | undefined }>
  | Readonly<{ kind: 'conflict'; projectId: string }>
  | Readonly<{ kind: 'unavailable'; projectId: string }>
  | Readonly<{ kind: 'recovering'; projectId: string }>
  | Readonly<{ kind: 'recovery-failed'; projectId: string; reason: PendingProjectRecoveryReason }>
  | Readonly<{ kind: 'native-kernel'; projectId: string; project: ProjectManifest; kernelName: string }>
  | Readonly<{ kind: 'access-error'; projectId: string; error: Error }>
  | Readonly<{ kind: 'flush-error'; error: Error }>;

/** The one state that mounts project resources. @public */
export const isEditorState = (state: ProjectRouteState | undefined): boolean => state?.kind === 'editor';

/** Everything the derivation reads. All of it already exists in the gate. @public */
export type ProjectRouteStateInput = Readonly<{
  /** The resolved `proj_` id, or undefined while slugs resolve or fail to. */
  requestedProjectId: string | undefined;
  /** How the URL addressed the project, for the not-found notice's heading. */
  slugs: ProjectRouteSlugs | undefined;
  /** Whether the slugs are still resolving; a failed resolution is `missing`. */
  isResolvingSlugs: boolean;
  /** The access answer for `requestedProjectId`, once it has arrived. */
  resolvedProjectId: string | undefined;
  access: ProjectRouteAccess | undefined;
  /** A route-level failure: an access check that threw, or a rejected view flush. */
  error: Error | undefined;
  /**
   * Which failure it was.
   *
   * A flush can fail while navigating *to* a project, so the id it carries is
   * the one being requested — the same id a failed access check carries. Only
   * this says which of the two notices the person should see.
   */
  errorKind: 'access' | 'flush' | undefined;
  /** The project a failed access check belongs to. */
  errorProjectId: string | undefined;
  liveProjectIds: readonly string[];
  closedReason: ProjectSessionCloseReason | undefined;
  /** Whether this host can run the kernel a project's entry file needs. */
  nativeKernelRequirement: Readonly<{ kernelName: string; runtimeKernelId: string }> | undefined;
  isKernelAvailable: (runtimeKernelId: string) => boolean;
}>;

/**
 * Derive what the route is showing.
 *
 * Precedence is explicit rather than incidental, because two of these orderings
 * were bugs before:
 *
 * 1. A flush failure outranks everything — the person is leaving a view that
 *    did not save, whether or not they were on their way to another project.
 * 2. `trashed` outranks `closed`. Deleting the open project closes its session
 *    first, so both facts are true at once and the route used to show the
 *    closed notice, whose Reopen would re-mount a trashed project (Finding 2).
 * 3. An access error outranks `resolving`, so a failed check does not spin.
 *
 * @param input - Everything the gate already holds.
 * @returns The state, or undefined when this is not a project route.
 * @public
 */
// oxlint-disable-next-line complexity -- One flat decision table; splitting it would hide the precedence it exists to state.
export const deriveProjectRouteState = (input: ProjectRouteStateInput): ProjectRouteState | undefined => {
  const {
    access,
    closedReason,
    error,
    errorKind,
    errorProjectId,
    isKernelAvailable: isAvailable,
    isResolvingSlugs,
    liveProjectIds,
    nativeKernelRequirement,
    requestedProjectId,
    resolvedProjectId,
    slugs,
  } = input;

  // The view the person is leaving failed to save.
  if (error !== undefined && errorKind === 'flush') {
    return { kind: 'flush-error', error };
  }

  if (requestedProjectId === undefined) {
    if (slugs === undefined) {
      // Not a project route at all.
      return undefined;
    }
    return isResolvingSlugs ? { kind: 'resolving' } : { kind: 'missing', slugs };
  }

  if (error !== undefined && errorProjectId === requestedProjectId) {
    return { kind: 'access-error', projectId: requestedProjectId, error };
  }

  // Access for a different project is a stale answer mid-navigation.
  if (access === undefined || resolvedProjectId !== requestedProjectId) {
    return { kind: 'resolving' };
  }

  const projectId = requestedProjectId;
  switch (access.status) {
    case 'missing': {
      return { kind: 'missing', slugs };
    }
    case 'trashed': {
      return { kind: 'trashed', projectId, project: access.project };
    }
    case 'conflict': {
      return { kind: 'conflict', projectId };
    }
    case 'unavailable': {
      return { kind: 'unavailable', projectId };
    }
    case 'recovering': {
      return { kind: 'recovering', projectId };
    }
    case 'recovery-failed': {
      return { kind: 'recovery-failed', projectId, reason: access.recovery.reason };
    }
    case 'ready': {
      if (nativeKernelRequirement !== undefined && !isAvailable(nativeKernelRequirement.runtimeKernelId)) {
        return {
          kind: 'native-kernel',
          projectId,
          project: access.project,
          kernelName: nativeKernelRequirement.kernelName,
        };
      }
      /*
       * R1/P46: the project on screen obeys the live set exactly like the ones
       * behind it. A policy close — the idle window, the memory budget — takes
       * the focused project's resources with it, and this is what the person
       * sees when it does.
       */
      return liveProjectIds.includes(projectId)
        ? { kind: 'editor', projectId, project: access.project }
        : { kind: 'closed', projectId, project: access.project, reason: closedReason };
    }
  }
};

/**
 * The route state the gate derived, for everything rendered below the outlet.
 *
 * `undefined` means this is not a project route. The provider is
 * `ProjectRouteGate`. @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React context objects are PascalCase; this module is `.ts` because the state is not JSX.
export const ProjectRouteStateContext = createContext<ProjectRouteState | undefined>(undefined);

/**
 * Read what the project route is showing.
 *
 * @returns The current state, or undefined away from a project route.
 * @public
 */
export const useProjectRouteState = (): ProjectRouteState | undefined => useContext(ProjectRouteStateContext);

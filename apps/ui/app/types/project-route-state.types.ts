/**
 * What the project route is showing, as one value (blueprint W1).
 *
 * The type sits below the route layer so `machines/focus.route-state.ts` can derive it without importing a route
 * (workspace-project-policy rule 6). Adding a state is a member here, a case in the selector, and a row in
 * `project-route-notices.tsx`.
 */
import type { Project } from '@taucad/types';
import type { PendingProjectRecoveryReason } from '#types/pending-project-operation.types.js';
import type { ProjectSessionCloseReason } from '#machines/project-session.machine.js';

/** The slugs a project URL was addressed by, for a route that resolved to nothing. @public */
export type ProjectRouteSlugs = Readonly<{
  workspaceSlug: string;
  projectSlug: string;
}>;

/**
 * Every state `/w/:workspace/:project` can be in.
 *
 * `editor` is the only one that mounts a project's resources; every other member is a notice. @public
 */
export type ProjectRouteState =
  | Readonly<{ kind: 'resolving' }>
  | Readonly<{ kind: 'editor'; projectId: string; project: Project }>
  | Readonly<{
      kind: 'closed';
      projectId: string;
      project: Project;
      reason: ProjectSessionCloseReason | undefined;
    }>
  | Readonly<{ kind: 'trashed'; projectId: string; project: Project }>
  | Readonly<{ kind: 'missing'; slugs: ProjectRouteSlugs | undefined }>
  | Readonly<{ kind: 'conflict'; projectId: string }>
  | Readonly<{ kind: 'unavailable'; projectId: string }>
  | Readonly<{ kind: 'recovering'; projectId: string }>
  | Readonly<{ kind: 'recovery-failed'; projectId: string; reason: PendingProjectRecoveryReason }>
  | Readonly<{ kind: 'native-kernel'; projectId: string; project: Project; kernelName: string }>
  | Readonly<{ kind: 'access-error'; projectId: string; error: Error }>
  | Readonly<{ kind: 'flush-error'; error: Error }>;

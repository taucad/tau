/**
 * The project route's state, derived from focus, the registry and the route the router committed (app state
 * orchestration charter D7, D24, D25; I20; plan § 4 A5a; `ProjectFocus.tla`'s `TargetView`).
 *
 * The selector reads the committed route as well as focus, because focus hears a navigation one step after the
 * router commits it. It compares the two by project, never by request id or chat: a committed route for the project
 * focus is on is not a new open, so a chat switch keeps the editor (`SameProjectKeepsEditor`), and a route for another
 * project derives `resolving` until focus has settled on it (`EditorOnlyForCommittedProject`). That includes the
 * server render and the first client render, where focus has heard no request.
 *
 * It is a module-level helper (MC-R20, MC-R25): React reads it through `useSyncExternalStore` over focus and the
 * registry once A5b wires it.
 */
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { FocusMachine, FocusSlugs } from '#machines/focus.machine.js';
import type { SessionsMachineContext } from '#machines/sessions.machine.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';

/** The route the router committed: its slugs, the project the library's slug selector resolves them to, its chat. @public */
export type CommittedProjectRoute = Readonly<{
  slugs: FocusSlugs;
  /** Undefined while the slugs name no project (yet). */
  projectId: string | undefined;
  chatId: string | undefined;
}>;

/** Focus's snapshot as a ref hands it out: the runtime's child and a started focus both fit. @public */
export type FocusSnapshot = SnapshotFrom<ActorRefFrom<FocusMachine>>;

/** What the selector reads of the registry. @public */
export type FocusRegistryView = Pick<SessionsMachineContext, 'status' | 'closed'>;

/** What the person sees after a failed leave flush (today's `project-route.tsx` text). @public */
export const leaveFlushErrorMessage = 'Tau could not save the current project view. Try again before leaving.';

/** What the person sees after a failed access check (today's text). @public */
export const accessErrorMessage = 'Tau could not check this project. Try again.';

/** What the person sees after a session that could not start. @public */
export const startErrorMessage = 'Tau could not open this project. Try again.';

const resolving: ProjectRouteState = { kind: 'resolving' };

/**
 * The committed route names what focus's request names: the same project, or, while the committed slugs have no
 * project (a renamed directory's retained route, or a slug not resolved yet), the same slugs.
 */
const matches = (focus: FocusSnapshot, committed: CommittedProjectRoute): boolean => {
  const { request } = focus.context;
  if (request === undefined || request.home) {
    return false;
  }
  if (committed.projectId !== undefined) {
    return committed.projectId === request.projectId;
  }
  return (
    request.slugs?.workspaceSlug === committed.slugs.workspaceSlug &&
    request.slugs.projectSlug === committed.slugs.projectSlug
  );
};

/**
 * What `/w/:workspace/:project` shows.
 *
 * @param focus - Focus's snapshot.
 * @param registry - The registry's context: each live session's status and why each closed project closed.
 * @param committed - The route the router committed, or undefined away from a project route.
 * @returns The route state; undefined only away from a project route.
 * @public
 */
// oxlint-disable-next-line complexity -- One flat decision table over the model's `TargetView`.
export const selectProjectRouteState = (
  focus: FocusSnapshot,
  registry: FocusRegistryView,
  committed: CommittedProjectRoute | undefined,
): ProjectRouteState | undefined => {
  if (committed === undefined) {
    return undefined;
  }
  // A route focus has not heard, or has not taken, is still resolving (D7). Compared by project, never by id or chat.
  if (!matches(focus, committed)) {
    return resolving;
  }
  const { answer } = focus.context;
  if (focus.hasTag('flush-failed')) {
    return { kind: 'flush-error', error: new Error(leaveFlushErrorMessage) };
  }
  const projectId = answer?.projectId;
  if (focus.hasTag('held') && answer !== undefined) {
    const held = answer.answer;
    if (held.status === 'missing') {
      return { kind: 'missing', slugs: committed.slugs };
    }
    if (projectId === undefined) {
      return resolving;
    }
    switch (held.status) {
      case 'trashed': {
        return { kind: 'trashed', projectId, project: held.project };
      }
      case 'conflict':
      case 'unavailable':
      case 'recovering': {
        return { kind: held.status, projectId };
      }
      case 'recovery-failed': {
        return { kind: 'recovery-failed', projectId, reason: held.recovery.reason };
      }
      case 'error': {
        return { kind: 'access-error', projectId, error: new Error(accessErrorMessage) };
      }
      case 'start-failed': {
        return { kind: 'access-error', projectId, error: new Error(startErrorMessage) };
      }
      case 'ready': {
        return resolving;
      }
    }
  }
  if (answer?.answer.status !== 'ready' || projectId === undefined) {
    return resolving;
  }
  const { project } = answer.answer;
  const focused = focus.hasTag('focused');
  // The project's entry needs a kernel this host does not have: the notice shows over the opening session (A0.2).
  if (focus.hasTag('on-project') && answer.kernel !== undefined && !answer.kernel.available) {
    return { kind: 'native-kernel', projectId, project, kernelName: answer.kernel.kernelName };
  }
  if (!focused) {
    return resolving;
  }
  // `editor` only for a session that is live; a session gone, closing or failed shows the reopen offer.
  return registry.status[projectId]?.state === 'live'
    ? { kind: 'editor', projectId, project }
    : { kind: 'closed', projectId, project, reason: registry.closed[projectId]?.reason };
};

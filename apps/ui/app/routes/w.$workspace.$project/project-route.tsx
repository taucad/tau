import { createContext, Suspense, use, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { Handle } from '#types/matches.types.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
import { Loader } from '@taucad/ui/components/loader';
import {
  ProjectRouteRetryContext,
  ProjectRouteStateContext,
} from '#routes/w.$workspace.$project/project-route-state.js';
import { WorkspaceFrame, WorkspaceOpening } from '#routes/w.$workspace.$project/workspace-frame.js';
import type { LiveProjectSessions as LiveProjectSessionsComponent } from '#routes/w.$workspace.$project/project-live-sessions.js';
import {
  ProjectRouteIntent,
  useCommittedProjectRoute,
  useRouterRouteSink,
} from '#routes/w.$workspace.$project/project-route-intent.js';
import type { ProjectRouteIntentRoute } from '#routes/w.$workspace.$project/project-route-intent.js';
import { useFocus, useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { selectFocusTarget, selectProjectRouteState } from '#machines/focus.route-state.js';
import type { CommittedProjectRoute, FocusRegistryView } from '#machines/focus.route-state.js';
import type { FocusRouteCommand } from '#machines/focus.machine.js';
import type { SessionsMachineContext } from '#machines/sessions.machine.js';
import { loadProjectWorkspace } from '#lib/project-workspace-warmup.js';

/*
 * D19/W21: the CAD workspace is not in the root layout's module graph. Everything a live project
 * needs — three.js and the chat surface — is behind this boundary, which mounts only once a
 * project is live. Project links warm it on navigation intent.
 */
function LiveProjectSessions(props: React.ComponentProps<typeof LiveProjectSessionsComponent>): React.JSX.Element {
  /* `use`, not `lazy`: a chunk that already arrived (warmed by the route below or by a project link)
   * renders in this pass. `lazy` suspends on its first render however settled its import is, and the
   * fallback it commits holds the reveal for React's 300 ms fallback throttle. */
  const { LiveProjectSessions: Sessions } = use(loadProjectWorkspace());
  return <Sessions {...props} />;
}

const ProjectSessionsHostContext = createContext(false);

/** What the route-state selector reads of the registry: each session's status and why each closed project closed. */
const selectFocusRegistryView = (context: SessionsMachineContext): FocusRegistryView => ({
  status: context.status,
  closed: context.closed,
});

const sameRegistryView = (left: FocusRegistryView, right: FocusRegistryView): boolean =>
  left.status === right.status && left.closed === right.closed;

/**
 * The route gate: renders the shell, every live project's subtree and the route state, all derived from focus, the
 * registry and the committed route (plan § 4 A5b). It owns no state and sends nothing in an effect: the committed
 * route reaches focus through `ProjectRouteIntent`, and focus opens, touches and flushes.
 *
 * @param props - The app shell, rendered at one position whatever the route and its state (D24), and the route as
 *   committed.
 * @returns The gate.
 */
export function ProjectRouteGate({
  children,
  committed,
}: {
  readonly children?: React.ReactNode;
  readonly committed: CommittedProjectRoute | undefined;
}): React.ReactNode {
  const { focus } = useFocus();
  const sessions = useSessions();
  const focusSnapshot = useSelector(focus, (snapshot) => snapshot);
  const registry = useSelector(sessions, (snapshot) => selectFocusRegistryView(snapshot.context), sameRegistryView);
  const liveProjectIds = useLiveProjectIds();

  /*
   * W1/W2: one derived state, published once. The shell renders for every state; the route component below the
   * outlet picks between the editor and a notice.
   */
  const state = selectProjectRouteState(focusSnapshot, registry, committed);
  const { target, retained, moving } = selectFocusTarget(focusSnapshot);
  /* Memoised because it is a context value: a new identity on every render would re-render every notice. */
  const handleRetryLoad = useCallback((): void => {
    focus.send({ type: 'retry' });
  }, [focus]);

  /*
   * D24/I19 (A11): the shell renders here, at one tree position on every route: outside the worker gate, the
   * workspace's Suspense boundary and the keyed list of live projects. The focused project's providers are re-homed
   * inside its outlet (`FocusedProjectView`), keyed by project, so the project being left supplies nothing to the next.
   */
  const focused = target === undefined ? undefined : { projectId: target };

  return (
    <ProjectRouteStateContext.Provider value={state}>
      <ProjectRouteRetryContext.Provider value={handleRetryLoad}>
        {/* A move in progress holds the whole page; a held answer only the project it left, so its notice and the
            page around it stay usable (round 2). */}
        <div className='contents' inert={moving || undefined} aria-busy={moving}>
          {/* The worker's wait and failure are the content region's: a project route's outlet holds its own gate
              (`ProjectRouteContent`), so this one waits invisibly. */}
          <SharedWorkerGate shouldReportFailure={false}>
            {/* P72: this keyed resource list stays at one React tree position for every route. It is absent only
                while no project is live at all, where it would render nothing anyway (W21). */}
            {liveProjectIds.length > 0 ? (
              <div className='contents' inert={retained || undefined}>
                <Suspense fallback={null}>
                  <LiveProjectSessions focused={focused} liveProjectIds={liveProjectIds} />
                </Suspense>
              </div>
            ) : null}
          </SharedWorkerGate>
          {children}
        </div>
        {moving ? (
          <div
            className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center'
            role='status'
            aria-label='Opening project'
          >
            <Loader className='size-8' />
          </div>
        ) : null}
      </ProjectRouteRetryContext.Provider>
    </ProjectRouteStateContext.Provider>
  );
}

/** Mount every live project below the app registry, and the app shell at one position beside them (D24). */
export function ProjectSessionsHost({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const route = useCommittedProjectRoute();
  const sink = useRouterRouteSink(route);
  /*
   * W2: the shell is no longer swapped out here either. An unresolvable slug is a route *state* the gate publishes,
   * not a replacement for `children`.
   */
  return (
    <ProjectSessionsHostContext.Provider value>
      <ProjectRouteIntent route={route} sink={sink} />
      <ProjectRouteGate committed={route.committed}>{children}</ProjectRouteGate>
    </ProjectSessionsHostContext.Provider>
  );
}

/**
 * The project route's content. Under the app host it only gates that content on the file-manager worker: the live
 * projects and the shell render beside it (D24). Outside the app host (a suite that mounts the
 * route without the root layout) it reports the given project to focus and shows the focused chat through
 * `onFocusedChatResolved`.
 */
export function ProjectRouteProviders({
  children,
  onFocusedChatResolved,
  projectId,
  requestedChatId,
  createdChatId,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly projectId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
}): React.ReactNode {
  const appHosted = useContext(ProjectSessionsHostContext);
  if (appHosted) {
    /* A15b2: under the app host the shell draws the frame around this (`Page`), so it is in place before the route. */
    return <ProjectRouteGateContent isProjectRoute>{children}</ProjectRouteGateContent>;
  }
  return (
    <DetachedProjectRoute
      projectId={projectId}
      requestedChatId={requestedChatId}
      createdChatId={createdChatId}
      onFocusedChatResolved={onFocusedChatResolved}
    >
      {children}
    </DetachedProjectRoute>
  );
}

/** The route given as props, for a mount with no app host: the project id addresses itself. */
function DetachedProjectRoute({
  children,
  onFocusedChatResolved,
  projectId,
  requestedChatId,
  createdChatId,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly projectId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
}): React.ReactNode {
  const route: ProjectRouteIntentRoute = {
    committed:
      projectId === undefined
        ? undefined
        : { slugs: { workspaceSlug: '', projectSlug: projectId }, projectId, chatId: requestedChatId },
    createdChatId,
    slugsMissing: false,
    cloudOpen: false,
  };
  const latest = useLatestChatShown(onFocusedChatResolved);
  const [sink] = useState(() => (command: FocusRouteCommand): void => {
    if (command.type === 'chatShown') {
      latest.current?.(command.chatId);
    }
  });
  return (
    <>
      <ProjectRouteIntent route={route} sink={sink} />
      <ProjectRouteGate committed={route.committed}>
        <ProjectRouteContent isProjectRoute={route.committed !== undefined}>{children}</ProjectRouteContent>
      </ProjectRouteGate>
    </>
  );
}

/**
 * A project route's content region with no app host (a suite that mounts the route alone): the persistent workspace
 * frame (A15b), with the content over it once this document's file-manager worker exists, or the file service's
 * failure notice in its place. Under the app host the shell draws the frame instead (`Page`, A15b2) and the route
 * renders only the gate. Any other route's content is never held, and keeps its tree position whichever route comes
 * next.
 *
 * @param props - The route's content, and whether the route is a project's.
 * @returns The content, once the worker exists or at once off a project route.
 */
function ProjectRouteContent({
  children,
  isProjectRoute,
}: {
  readonly children?: React.ReactNode;
  readonly isProjectRoute: boolean;
}): React.ReactNode {
  /* One host element whatever the route, so a visit off a project route keeps the content's tree position. */
  return (
    <WorkspaceFrame isDrawn={isProjectRoute}>
      <ProjectRouteGateContent isProjectRoute={isProjectRoute}>{children}</ProjectRouteGateContent>
    </WorkspaceFrame>
  );
}

/** The content region's gate on the file-manager worker, inside whichever frame draws the region. */
function ProjectRouteGateContent({
  children,
  isProjectRoute,
}: {
  readonly children?: React.ReactNode;
  readonly isProjectRoute: boolean;
}): React.ReactNode {
  return (
    <SharedWorkerGate
      shouldReportFailure={isProjectRoute}
      placeholder={isProjectRoute ? <WorkspaceOpening /> : children}
    >
      {children}
    </SharedWorkerGate>
  );
}

/** The latest `onFocusedChatResolved`, read when focus shows a chat. */
function useLatestChatShown(
  onFocusedChatResolved: ((chatId: string) => void) | undefined,
): Readonly<{ current: ((chatId: string) => void) | undefined }> {
  const holder = useRef(onFocusedChatResolved);
  useLayoutEffect(() => {
    holder.current = onFocusedChatResolved;
  }, [onFocusedChatResolved]);
  return holder;
}

/**
 * Chrome shared by every project route. The palette's project items register from the focused project's view
 * (`FocusedProjectView`, A11), not from a route handle.
 */
export const projectRouteHandle: Omit<Handle, 'providers'> = {
  enablePageHeader: false,
};

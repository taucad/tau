import { createContext, lazy, Suspense, use, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { Handle } from '#types/matches.types.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
import { Loader } from '@taucad/ui/components/loader';
import {
  ProjectRouteRetryContext,
  ProjectRouteStateContext,
} from '#routes/w.$workspace.$project/project-route-state.js';
import { WorkspaceSkeleton } from '#routes/w.$workspace.$project/workspace-skeleton.js';
import type { LiveProjectSessions as LiveProjectSessionsComponent } from '#routes/w.$workspace.$project/project-live-sessions.js';
import {
  ProjectRouteIntent,
  useCommittedProjectRoute,
  useRouterRouteSink,
} from '#routes/w.$workspace.$project/project-route-intent.js';
import type { ProjectRouteIntentRoute } from '#routes/w.$workspace.$project/project-route-intent.js';
import { useFocus, useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { selectProjectRouteState } from '#machines/focus.route-state.js';
import type { CommittedProjectRoute, FocusRegistryView, FocusSnapshot } from '#machines/focus.route-state.js';
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

const ProjectCommandPaletteItems = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/project-command-items.js');
  return { default: module.ProjectCommandPaletteItems };
});

const ProjectSessionsHostContext = createContext(false);

/** What the route-state selector reads of the registry: each session's status and why each closed project closed. */
const selectFocusRegistryView = (context: SessionsMachineContext): FocusRegistryView => ({
  status: context.status,
  closed: context.closed,
});

const sameRegistryView = (left: FocusRegistryView, right: FocusRegistryView): boolean =>
  left.status === right.status && left.closed === right.closed;

/**
 * The native kernel id each live session was opened with (S34): read off the open request the session keeps, which
 * replaced the route's `retainedKernels`. A session's request is its input, so the id is fixed for its life.
 */
const selectSessionNativeKernels = (context: SessionsMachineContext): Readonly<Record<string, string | undefined>> =>
  Object.fromEntries(
    Object.entries(context.refs).map(([projectId, ref]) => [
      projectId,
      ref.getSnapshot().context.request?.nativeKernelId,
    ]),
  );

const sameRecord = (
  left: Readonly<Record<string, string | undefined>>,
  right: Readonly<Record<string, string | undefined>>,
): boolean => {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
};

/**
 * The project whose session holds focus's props, whether it is kept behind the route's state, and whether the route is
 * on its way somewhere else.
 *
 * Focus opening or on a project gives that project the props. While focus resolves, leaves, is blocked by a failed
 * leave flush or holds another project's answer, the project it was on keeps them, inert, until the move settles
 * (today's `resolved`/`pending`); a project the route has not settled on never supplies providers to the one being
 * opened. Only a move in progress shows the overlay: a held answer is the notice the person reads.
 */
const selectFocusTarget = (
  focus: FocusSnapshot,
): Readonly<{ target: string | undefined; retained: boolean; moving: boolean }> => {
  const { answer, on, request } = focus.context;
  if (focus.hasTag('on-project')) {
    return { target: answer?.projectId, retained: false, moving: false };
  }
  const away = on !== undefined && (request?.home === true || request?.projectId !== on);
  if (focus.matches('resolving') || focus.matches('leaving') || focus.matches('flushFailed')) {
    return { target: away ? on : undefined, retained: away, moving: away };
  }
  if (focus.matches('held') && away) {
    return { target: on, retained: true, moving: false };
  }
  return { target: undefined, retained: false, moving: false };
};

/**
 * The route gate: renders the shell, every live project's subtree and the route state, all derived from focus, the
 * registry and the committed route (plan § 4 A5b). It owns no state and sends nothing in an effect: the committed
 * route reaches focus through `ProjectRouteIntent`, and focus opens, touches and flushes.
 *
 * @param props - The app shell, and the route as committed.
 * @returns The gate.
 */
export function ProjectRouteGate({
  children,
  committed,
}: {
  readonly children?: React.ReactNode;
  readonly committed: CommittedProjectRoute | undefined;
}): React.ReactNode {
  const { focus, bindings } = useFocus();
  const sessions = useSessions();
  const focusSnapshot = useSelector(focus, (snapshot) => snapshot);
  const registry = useSelector(sessions, (snapshot) => selectFocusRegistryView(snapshot.context), sameRegistryView);
  const nativeKernels = useSelector(sessions, (snapshot) => selectSessionNativeKernels(snapshot.context), sameRecord);
  const liveProjectIds = useLiveProjectIds();

  /*
   * W1/W2: one derived state, published once. The shell renders for every state; the route component below the
   * outlet picks between the editor and a notice.
   */
  const state = selectProjectRouteState(focusSnapshot, registry, committed);
  const { target, retained, moving } = selectFocusTarget(focusSnapshot);
  const { request, forwarded } = focusSnapshot.context;
  const onRequest = !retained && request?.projectId === target;
  const requestedChatId = onRequest ? request?.chatId : target === undefined ? undefined : forwarded[target]?.chatId;
  const createdChatId = onRequest ? request?.createdChatId : undefined;

  /* The editor reports the chat it focused for the route's chat (`requestedChatId`); focus shows it (I18). */
  const handleFocusedChatResolved = useCallback(
    (chatId: string): void => {
      if (target === undefined) {
        return;
      }
      focus.send({
        type: 'focusedChatResolved',
        projectId: target,
        ...(requestedChatId === undefined ? {} : { requestedChatId }),
        chatId,
      });
    },
    [focus, requestedChatId, target],
  );
  /* Memoised because it is a context value: a new identity on every render would re-render every notice. */
  const handleRetryLoad = useCallback((): void => {
    focus.send({ type: 'retry' });
  }, [focus]);

  /*
   * I22/P72: the focused project's subtree hosts the shell when the editor is live, because the editor is the only
   * route state that reads the project's providers (`ProjectChatRoute`). While focus is on its way to another project
   * the person is looking at the `resolving` notice behind the overlay, so the shell renders as a sibling: the project
   * being left must not supply providers to the project being navigated to.
   */
  const isShellHostedByFocusedSession = state?.kind === 'editor' && !retained;
  const focused =
    target === undefined
      ? undefined
      : {
          projectId: target,
          requestedChatId,
          createdChatId,
          children: isShellHostedByFocusedSession ? children : undefined,
        };

  /*
   * This gate is app-wide: `ProjectSessionsHost` mounts it from the root layout on every route, so live projects
   * survive navigation. Only a project URL may wear the project's skeleton while the file service connects. Keep the
   * live resource list at one stable position inside the worker gate, but let non-project shell content render
   * independently beside it.
   */
  const isProjectRoute = committed !== undefined;

  return (
    <ProjectRouteStateContext.Provider value={state}>
      <ProjectRouteRetryContext.Provider value={handleRetryLoad}>
        {/* A move in progress holds the whole page; a held answer only the project it left, so its notice and the
            page around it stay usable (round 2). */}
        <div className='contents' inert={moving || undefined} aria-busy={moving}>
          <SharedWorkerGate
            shouldReportFailure={isProjectRoute}
            withShellFrame={isProjectRoute}
            placeholder={isProjectRoute ? <WorkspaceSkeleton withShellFrame /> : undefined}
          >
            {/* P72: this keyed resource list stays at one React tree position for
                project, loading, error and non-project routes alike. It is absent only while no
                project is live at all, where it would render nothing anyway (W21). */}
            {/* The shell is inside the boundary below once the editor is live, so a null fallback
                would blank the window while the workspace chunk loads. */}
            {liveProjectIds.length > 0 ? (
              <div className='contents' inert={retained || undefined}>
                <Suspense fallback={isShellHostedByFocusedSession ? <WorkspaceSkeleton withShellFrame /> : null}>
                  <LiveProjectSessions
                    focused={focused}
                    liveProjectIds={liveProjectIds}
                    onFocusedChatResolved={retained ? undefined : handleFocusedChatResolved}
                    onFlushRegistration={bindings.registerLeaveFlush}
                    retainedKernels={nativeKernels}
                  />
                </Suspense>
              </div>
            ) : null}
            {isProjectRoute && !isShellHostedByFocusedSession ? children : undefined}
          </SharedWorkerGate>
          {isProjectRoute ? undefined : children}
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

/** Mount every live project below the app registry and place route chrome in the focused one. */
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
 * The live-project host once its focused `proj_` id is known. The app shell
 * owns this; project routes contribute only their focused content. Outside the app host (a suite that mounts the
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
    return children;
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
      <ProjectRouteGate committed={route.committed}>{children}</ProjectRouteGate>
    </>
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

/** Chrome shared by every project route. */
export const projectRouteHandle: Omit<Handle, 'providers'> = {
  commandPalette(match) {
    return (
      <Suspense fallback={null}>
        <ProjectCommandPaletteItems match={match} />
      </Suspense>
    );
  },
  enablePageHeader: false,
};

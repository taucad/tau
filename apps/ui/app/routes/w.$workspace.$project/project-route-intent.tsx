/**
 * The project route's intent: named boundary 1 (app state orchestration charter D15, D7; plan § 4 A5b; rows S8, S10,
 * S29, S30).
 *
 * The router's commit is its only source and `navigate` its only sink. Every committed route is reported to focus,
 * `routeRequested` for a project URL and `routeLeft` for any other, and the commands focus sends its route port are
 * performed here: the focused chat's URL replace (`chatShown`) and the one-time `cloudOpen` marker (`cloudOpenTaken`).
 * Slugs are resolved in render by the library's slug selector, and a renamed project keeps its path's project until
 * the listing names it again (the retained route). Everything else about the route belongs to focus.
 */
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router';
import { tauCloudIntent } from '#hooks/use-cloud-projects.js';
import { useCanonicalProjectUrlCorrection, useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { useFocus } from '#hooks/use-sessions.js';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { stringParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import type { CommittedProjectRoute } from '#machines/focus.route-state.js';
import type { FocusRouteCommand } from '#machines/focus.machine.js';
import { projectChatIdFromSearch, projectUrl } from '#utils/project-url.utils.js';

/** The canonical project URL, for the mounts that ask whether a project is what is opening. @public */
export const projectRoutePath = '/w/:workspace/:project';

/* Module scope: the setter is memoised on the codec's identity. */
const cloudOpenParameter = stringParameter();

/** What the route committed, as focus hears it: the route itself, and what only the request carries. @public */
export type ProjectRouteIntentRoute = Readonly<{
  /** The committed project route; undefined away from one. */
  committed: CommittedProjectRoute | undefined;
  /** The chat the route asked to create and focus (the `focusChatComposer` marker). */
  createdChatId: string | undefined;
  /** The slugs resolved and name no project. */
  slugsMissing: boolean;
  /** The URL carries the `cloudOpen` marker. */
  cloudOpen: boolean;
}>;

/**
 * Read the committed route in render: the `/w/:workspace/:project` match, its slugs resolved by the library's slug
 * selector (or the project its path last resolved to while a rename is listed), and the chat.
 *
 * @returns The route, as focus and the route-state selector read it.
 * @public
 */
export function useCommittedProjectRoute(): ProjectRouteIntentRoute {
  const match = useMatch({ path: projectRoutePath, end: true });
  const location = useLocation();
  const workspace = match?.params.workspace ?? '';
  const project = match?.params.project ?? '';
  const resolution = useProjectIdBySlugs(workspace, project);
  const routePath = match === null ? undefined : location.pathname;
  const resolvedProjectId = resolution.status === 'resolved' ? resolution.value : undefined;
  const [retainedRoute, setRetainedRoute] = useState<Readonly<{ path: string; projectId: string }> | undefined>();
  useEffect(() => {
    if (routePath === undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- Leaving the route invalidates its external-rename cache before a later visit.
      setRetainedRoute(undefined);
    } else if (resolvedProjectId !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- Discovery is the external source; cache its durable id for a same-path rename correction.
      setRetainedRoute((current) =>
        current?.path === routePath && current.projectId === resolvedProjectId
          ? current
          : { path: routePath, projectId: resolvedProjectId },
      );
    }
  }, [resolvedProjectId, routePath]);
  const projectId = resolvedProjectId ?? (retainedRoute?.path === routePath ? retainedRoute?.projectId : undefined);
  const [cloudOpen] = useSearchParameter(searchParameterName.cloudOpen, cloudOpenParameter);
  if (match === null) {
    return { committed: undefined, createdChatId: undefined, slugsMissing: false, cloudOpen: false };
  }
  const chatId = projectId === undefined ? undefined : projectChatIdFromSearch(location.search);
  return {
    committed: { slugs: { workspaceSlug: workspace, projectSlug: project }, projectId, chatId },
    createdChatId: location.state?.focusChatComposer === true ? chatId : undefined,
    slugsMissing: projectId === undefined && resolution.status === 'not-found',
    cloudOpen: cloudOpen === 'tau',
  };
}

/**
 * Report a committed route to focus and bind the sink that performs what focus asks of the route (named boundary 1).
 *
 * @param props - The route as committed, and the sink of focus's route commands.
 * @returns Nothing: this boundary renders no markup.
 * @public
 */
export function ProjectRouteIntent({
  route,
  sink,
}: {
  readonly route: ProjectRouteIntentRoute;
  /** Stable for the mount: `useRouterRouteSink` in the app, a test's own outside a router. */
  readonly sink: (command: FocusRouteCommand) => void;
}): undefined {
  const { focus, bindings } = useFocus();
  const serial = useRef(0);
  const { committed, createdChatId, slugsMissing, cloudOpen } = route;
  const workspaceSlug = committed?.slugs.workspaceSlug;
  const projectSlug = committed?.slugs.projectSlug;
  const projectId = committed?.projectId;
  const chatId = committed?.chatId;

  /* Bound before the first report below (effects run in order): focus answers a request with its route commands in the
   * same send, and a command with no sink bound is lost. */
  useEffect(() => bindings.bindRoute(sink), [bindings, sink]);

  /* Every commit is a request: focus compares it with what it is on, so a same-project commit changes nothing (D7). */
  useEffect(() => {
    serial.current += 1;
    const requestId = `route:${serial.current}`;
    if (workspaceSlug === undefined || projectSlug === undefined) {
      focus.send({ type: 'routeLeft', requestId });
      return;
    }
    focus.send({
      type: 'routeRequested',
      requestId,
      slugs: { workspaceSlug, projectSlug },
      ...(projectId === undefined ? {} : { projectId }),
      ...(chatId === undefined ? {} : { chatId }),
      ...(createdChatId === undefined ? {} : { createdChatId }),
      ...(slugsMissing ? { slugsMissing } : {}),
      ...(cloudOpen ? { cloudOpen } : {}),
    });
  }, [focus, workspaceSlug, projectSlug, projectId, chatId, createdChatId, slugsMissing, cloudOpen]);

  return undefined;
}

/** The route's chat in a URL, read as the route reads it (an empty `chat=` is none). */
const chatOf = (url: string): string | undefined => projectChatIdFromSearch(url.split('?')[1] ?? '');

/**
 * The route port's sink over the app's router: the focused chat's URL replace and the `cloudOpen` latch.
 *
 * @param route - The committed route.
 * @returns The sink, stable for the mount; it reads the latest commit.
 * @public
 */
export function useRouterRouteSink(route: ProjectRouteIntentRoute): (command: FocusRouteCommand) => void {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setCloudOpen] = useSearchParameter(searchParameterName.cloudOpen, cloudOpenParameter);
  const projectId = route.committed?.projectId;
  /* The app's data router, read live when a command arrives; a test's plain router has none. */
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  /* Under the app's router, which drives the address bar, the canonical correction writes only while the bar still
   * shows this commit's path (I2). */
  const canonicalSlugs = useCanonicalProjectUrlCorrection(
    projectId,
    '',
    router === undefined ? undefined : location.pathname,
  );
  const slugs = route.committed?.slugs;
  const currentUrl = `${location.pathname}${location.search}`;
  const navigationState = useContext(UNSAFE_DataRouterStateContext)?.navigation.state;
  const latest = useRef({
    canonicalSlugs,
    currentUrl,
    navigate,
    pathname: location.pathname,
    projectId,
    setCloudOpen,
    slugs,
  });
  /* A command that arrives while the router is moving waits for the commit that ends the move, then is checked again.
   * It keeps the chat the route showed when it arrived: a move the person made that changed it is a request focus has
   * not answered. A move this sink made itself (its own replace) is not the person's, so it never drops a command. */
  const deferred = useRef<Readonly<{ command: FocusRouteCommand; chatId: string | undefined }> | undefined>(undefined);
  /* The sink's own replace while it is in flight. The next commit of a new location either is that replace or
   * superseded it, so it is read there once and cleared: a later visit to the same URL is the person's. */
  const pendingOwn = useRef<string | undefined>(undefined);
  const committedKey = useRef(location.key);
  /* A layout effect: every one runs before any passive effect, so the commit's report to focus, and the commands
   * focus answers it with, find this commit's route here. */
  useLayoutEffect(() => {
    latest.current = {
      canonicalSlugs,
      currentUrl,
      navigate,
      pathname: location.pathname,
      projectId,
      setCloudOpen,
      slugs,
    };
  }, [canonicalSlugs, currentUrl, navigate, location.pathname, projectId, setCloudOpen, slugs]);
  const [sink] = useState(() => (command: FocusRouteCommand): void => {
    const { current } = latest;
    if (command.projectId !== current.projectId) {
      // MC-R18: a command about a project the route has left.
      return;
    }
    /* I2: a navigation the person started (a click to another project) is in flight, or has moved the router past the
     * commit this sink last saw. A replace now would cancel it and land the person back here, so the command waits. */
    const live = router?.state;
    if (
      live !== undefined &&
      (live.navigation.state !== 'idle' || `${live.location.pathname}${live.location.search}` !== current.currentUrl)
    ) {
      deferred.current = { command, chatId: chatOf(current.currentUrl) };
      return;
    }
    if (command.type === 'cloudOpenTaken') {
      /* W7 tier 3: `cloudOpen` is a consume-once marker; the intent is latched because the connection it triggers
       * needs a revision client that does not exist yet. */
      tauCloudIntent.set(command.projectId, 'open');
      current.setCloudOpen(cloudOpenParameter.fallback);
      return;
    }
    const parameters = new URLSearchParams(current.currentUrl.split('?')[1] ?? '');
    parameters.set('chat', command.chatId);
    const path = projectUrl(current.canonicalSlugs ?? current.slugs ?? { workspaceSlug: '', projectSlug: '' });
    const target = `${path}?${parameters.toString()}`;
    if (current.currentUrl !== target) {
      pendingOwn.current = target;
      void current.navigate(target, { replace: true });
    }
  });
  /* After the latest-route effect above: the replay reads the commit that ended the move. */
  useLayoutEffect(() => {
    /* Decided where the move lands: a commit of a new location is the sink's own replace only if it shows its URL. */
    let ownCommit = false;
    if (location.key !== committedKey.current) {
      committedKey.current = location.key;
      ownCommit = pendingOwn.current !== undefined && latest.current.currentUrl === pendingOwn.current;
      pendingOwn.current = undefined;
    }
    if (ownCommit && deferred.current !== undefined) {
      /* The sink's own replace is the chat the person now sees, even while another move loads: a held command is
       * judged against it, so the person's move off it counts as theirs (I18). */
      deferred.current = { ...deferred.current, chatId: chatOf(latest.current.currentUrl) };
    }
    const held = deferred.current;
    if (held === undefined || navigationState === 'loading' || navigationState === 'submitting') {
      return;
    }
    deferred.current = undefined;
    if (held.command.type === 'chatShown' && chatOf(latest.current.currentUrl) !== held.chatId) {
      /* The move asked for another chat (I18): focus answers that commit, not this one. */
      return;
    }
    sink(held.command);
  }, [location.key, navigationState, sink]);
  return sink;
}

/**
 * Whether the shell draws the workspace frame, and whether it draws it ahead of the route (loading-states blueprint,
 * § Client navigation; lane A15b2, F11).
 *
 * React Router hands a navigation's new state to React inside `startTransition`, and the render it starts is
 * time-sliced: on a click from Home it removes Home and mounts the project route in one commit, which landed 30 to
 * 190 ms after the click, so the frame painted that late although the URL had changed in 2 ms. The shell therefore
 * reads the router itself, outside that transition: once the router's location (or the location it is loading) is a
 * project's, the shell draws the frame in a render of its own, synchronous with the router's update, and the
 * transition's commit only fills it. The frame is one element at one tree position through both renders, so
 * nothing is replaced when the route arrives.
 *
 * `pending` is the gap between the two: the frame is drawn for the destination while the page's content is still the
 * page being left, which the frame hides.
 */
import { useContext, useSyncExternalStore } from 'react';
import {
  /* The live router read (F11, A15b2): the router's own state, outside the transition its hooks render in. The context
   * still carries `router` on 8.x; `router-context.test.tsx` fails if it stops. */
  // oxlint-disable-next-line no-restricted-imports -- the shell's live router read above (A15b2, F11).
  UNSAFE_DataRouterContext,
  useLocation,
} from 'react-router';

/** `/w/:workspace/:project`, the URLs the project route matches (`route-classes.ts`, the project class). */
const projectPathPattern = /^\/w\/[^/.]+\/[^/.]+\/?$/iu;

/**
 * Whether a pathname is a project route's.
 *
 * @param pathname - A URL pathname.
 * @returns `true` for `/w/:workspace/:project`.
 */
export const isProjectPath = (pathname: string): boolean => projectPathPattern.test(pathname);

const subscribeToNothing = (): (() => void) => {
  return () => undefined;
};

/** The workspace frame's state for the shell. */
export type WorkspaceFrameState = {
  /** The frame is drawn: the committed route, or the router's destination, is a project's. */
  readonly drawn: boolean;
  /** The frame is drawn for the router's destination before the route has committed. */
  readonly pending: boolean;
  /**
   * The project the frame is drawn for: the destination while pending, else the committed location. The router reports
   * the destination before it pushes the URL, so the frame reads its hint from this, not from the document's URL.
   */
  readonly pathname: string;
};

/**
 * The shell's workspace frame state, from the committed location and the router's own.
 *
 * @returns Whether the frame is drawn, and whether it is drawn ahead of the route.
 */
export function useWorkspaceFrameState(): WorkspaceFrameState {
  const committed = useLocation().pathname;
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  /* The router's own location, read outside React Router's transition: a store update renders synchronously. With
   * no data router (a suite's memory router) or on the server, it is the committed location. */
  const destination = useSyncExternalStore(
    router?.subscribe ?? subscribeToNothing,
    () => (router === undefined ? committed : (router.state.navigation.location ?? router.state.location).pathname),
    () => committed,
  );
  const committedProject = isProjectPath(committed);
  const destinationProject = isProjectPath(destination);
  const pending = destinationProject && !committedProject;
  return { drawn: committedProject || destinationProject, pending, pathname: pending ? destination : committed };
}

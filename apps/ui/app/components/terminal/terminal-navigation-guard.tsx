/**
 * Leaving a project while its Terminal runs (T15). The Terminal's session belongs to one project and ends when the
 * project changes, so a navigation that leaves the project asks first: Keep open stays, Close and stop goes on and the
 * pane's project-change teardown ends the session.
 *
 * The guard is mounted only while a session runs, so the router's one blocker exists only then, and it blocks only a
 * navigation that leaves the open project. Another chat, a search or hash change, or the address bar correcting the
 * project's slug stays in the project and is never asked about.
 */

import { matchPath, useBlocker } from 'react-router';
import type { Location } from 'react-router';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import { useProjects } from '#hooks/use-projects.js';
import { resolveProjectRoute } from '#hooks/use-project-slug-route.js';

/** The project route's own path; anything else, its preview included, unmounts the project. */
const projectRoutePattern = '/w/:workspace/:project';

type ProjectRouteSegments = Readonly<{ workspace: string; project: string }>;

const projectSegments = (pathname: string): ProjectRouteSegments | undefined => {
  const params = matchPath({ path: projectRoutePattern, end: true }, pathname)?.params;
  return params?.workspace === undefined || params.project === undefined
    ? undefined
    : { workspace: params.workspace, project: params.project };
};

const equalsFolded = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * Whether a navigation keeps the open project, and with it the Terminal's session.
 *
 * @param input - The current and next locations, the open project's id, and slug resolution from the listing.
 * @returns `true` when the next location is the same project's route.
 */
export function staysInProject({
  currentLocation,
  nextLocation,
  projectId,
  resolveProject,
}: {
  readonly currentLocation: Pick<Location, 'pathname'>;
  readonly nextLocation: Pick<Location, 'pathname'>;
  readonly projectId: string;
  readonly resolveProject: (workspace: string, project: string) => string | undefined;
}): boolean {
  const next = projectSegments(nextLocation.pathname);
  if (next === undefined) {
    return false;
  }
  if (resolveProject(next.workspace, next.project) === projectId) {
    return true;
  }
  /* Unresolved by the listing: the same address, up to case, is still the same project. */
  const current = projectSegments(currentLocation.pathname);
  return (
    current !== undefined &&
    equalsFolded(current.workspace, next.workspace) &&
    equalsFolded(current.project, next.project)
  );
}

/**
 * Asks before a navigation leaves the project whose Terminal is running. Mount it only while the session runs.
 *
 * @param props - The open project's id and the running session's project label.
 * @returns The confirmation, shown while a navigation is held.
 */
export function TerminalNavigationGuard({
  projectId,
  projectLabel,
}: {
  readonly projectId: string;
  readonly projectLabel: string;
}): React.JSX.Element {
  const { projects } = useProjects({ includeDeleted: true });
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !staysInProject({
        currentLocation,
        nextLocation,
        projectId,
        resolveProject: (workspace, project) => resolveProjectRoute(projects, workspace, project),
      }),
  );
  /* Keep open and Escape close the dialog, which resets the navigation. Close and stop is a plain button, so letting
   * the navigation through never also reports a close that would reset it. */
  return (
    <AlertDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) {
          blocker.reset?.();
        }
      }}
    >
      <AlertDialogContent data-slot='terminal-navigation-guard'>
        <AlertDialogHeader>
          <AlertDialogTitle>Close the Terminal in {projectLabel}?</AlertDialogTitle>
          <AlertDialogDescription>Leaving this project stops its Terminal session.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep open</AlertDialogCancel>
          <Button
            variant='destructive'
            onClick={() => {
              blocker.proceed?.();
            }}
          >
            Close and stop
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

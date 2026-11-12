/**
 * The History pane's two small page-wide facts (C2): whether the pane is
 * shown, which the toolbar chip reads as pressed, and which branch control a
 * palette item asked the header to open.
 *
 * A module store keyed by project, like `revision-reveal`, rather than a
 * field on `useProjectWorkspace`: the chip, the palette and the pane read it
 * without the workspace provider, and the dockview wrapper and the phone panel
 * are the only writers.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

const topic = new Topic<void>({ name: 'revision-pane-requests' });

/** How many History panes each project has on screen. */
const shown = new Map<string, number>();

/**
 * Say that a History pane of this project is on screen while `isShown` holds.
 *
 * @param projectId - The project the pane shows.
 * @param isShown - The pane is visible: its dockview panel and lane are shown, or the phone panel is open.
 */
export const useReportHistoryPaneShown = (projectId: string, isShown: boolean): void => {
  useEffect(() => {
    if (!isShown) {
      return undefined;
    }
    shown.set(projectId, (shown.get(projectId) ?? 0) + 1);
    topic.emit();
    return () => {
      const count = (shown.get(projectId) ?? 1) - 1;
      if (count <= 0) {
        shown.delete(projectId);
      } else {
        shown.set(projectId, count);
      }
      topic.emit();
    };
  }, [projectId, isShown]);
};

/**
 * Whether a History pane of this project is on screen.
 *
 * @param projectId - The project.
 * @returns True while one is shown.
 */
export const useIsHistoryPaneShown = (projectId: string): boolean =>
  useSyncExternalStore(
    (listener) => topic.subscribe(listener),
    () => (shown.get(projectId) ?? 0) > 0,
    () => false,
  );

/** A branch control the palette asked the header to open: the branch menu, or the New branch… form. */
export type BranchRequest = 'switch-branch' | 'new-branch';

const requested = new Map<string, BranchRequest>();

/**
 * Ask the History header to open its branch menu or its New branch… form, once it is shown.
 *
 * @param projectId - The project.
 * @param request - What to open.
 */
export const requestBranchControl = (projectId: string, request: BranchRequest): void => {
  requested.set(projectId, request);
  topic.emit();
};

/**
 * Take the request, so it opens once.
 *
 * @param projectId - The project.
 */
export const consumeBranchControl = (projectId: string): void => {
  if (requested.delete(projectId)) {
    topic.emit();
  }
};

/**
 * The branch control the palette asked for, outside React.
 *
 * @param projectId - The project.
 * @returns The request, or `undefined`.
 */
export const getBranchControlRequest = (projectId: string): BranchRequest | undefined => requested.get(projectId);

/**
 * The branch control the palette asked for, until the header takes it.
 *
 * @param projectId - The project.
 * @returns The request, or `undefined`.
 */
export const useBranchControlRequest = (projectId: string): BranchRequest | undefined =>
  useSyncExternalStore(
    (listener) => topic.subscribe(listener),
    () => requested.get(projectId),
    () => undefined,
  );

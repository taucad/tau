import { useMemo, useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { projectListShapeFromCount, projectListShapeStore } from '#lib/project-list-shape.lib.js';
import type { ProjectListShape } from '#lib/project-list-shape.lib.js';

/** What the home route's loader hands the project list: the count from the request cookie. */
export type ProjectListShapeLoaderData = {
  readonly projectListCount: number | undefined;
};

/** The route whose loader reads the remembered count (`app/routes/_index/route.tsx`). */
export const projectListShapeRouteId = 'routes/_index';

/**
 * The remembered shape of this device's project list (audit R5).
 *
 * The server and the hydrating render read the count the request cookie carried,
 * through the home route's loader, so both draw the same number of slots. After
 * hydration the client reads its own snapshot, which adds the remembered names.
 * Routes without that loader render as an unknown shape until hydration.
 *
 * @returns The shape, or `undefined` when this browser has never listed its projects.
 */
export function useProjectListShape(): ProjectListShape | undefined {
  const count = useRouteLoaderData<ProjectListShapeLoaderData>(projectListShapeRouteId)?.projectListCount;
  const serverShape = useMemo(() => projectListShapeFromCount(count), [count]);
  return useSyncExternalStore(projectListShapeStore.subscribe, projectListShapeStore.get, () => serverShape);
}

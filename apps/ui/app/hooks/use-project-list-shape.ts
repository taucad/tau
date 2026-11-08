import { useMemo, useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { projectListShapeFromCount, projectListShapeStore } from '#lib/project-list-shape.lib.js';
import type { ProjectListShape } from '#lib/project-list-shape.lib.js';

/** What the root loader hands the project list: the count from the request cookie. */
type ProjectListShapeLoaderData = {
  readonly projectListCount?: number;
};

/**
 * The remembered shape of this device's project list (audit R5).
 *
 * The server and the hydrating render read the count the request cookie carried,
 * through the root loader, so both draw the same number of slots. After hydration
 * the client reads its own snapshot, which adds the remembered names. The desktop
 * (SPA) root has no loader, so it renders an unknown shape until hydration.
 *
 * @returns The shape, or `undefined` when this browser has never listed its projects.
 */
export function useProjectListShape(): ProjectListShape | undefined {
  const count = useRouteLoaderData<ProjectListShapeLoaderData>('root')?.projectListCount;
  const serverShape = useMemo(() => projectListShapeFromCount(count), [count]);
  return useSyncExternalStore(projectListShapeStore.subscribe, projectListShapeStore.get, () => serverShape);
}

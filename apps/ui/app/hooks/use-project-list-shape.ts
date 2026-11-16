import { useSyncExternalStore } from 'react';
import { projectListShapeStore } from '#lib/project-list-shape.lib.js';
import type { ProjectListShape } from '#lib/project-list-shape.lib.js';

/**
 * The remembered shape of this device's project list (audit R5).
 *
 * The server and the hydrating render know no shape, so the markup is the same for every visitor; the head script's
 * remembered count reserves the grid before first paint (`#lib/client-facts`). After hydration the client reads its own
 * snapshot.
 *
 * @returns The shape, or `undefined` when this browser has never listed its projects or the page has not hydrated.
 */
export function useProjectListShape(): ProjectListShape | undefined {
  return useSyncExternalStore(projectListShapeStore.subscribe, projectListShapeStore.get, () => undefined);
}

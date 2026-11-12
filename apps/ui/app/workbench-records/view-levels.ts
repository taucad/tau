/**
 * The levels a view's inheritable leaves resolve over on this device (onboarding blueprint, Finding 6): the person's
 * view defaults, present only while `viewerControls` is on, and this device's exceptions for the view, present in
 * every flag state. Turning the flag off stops saved defaults applying; turning it on applies them again. No view file
 * changes either way.
 */
import { useMemo } from 'react';
import { isFeatureEnabled } from '#flags/feature-flags.js';
import { subscribeFeatureFlags, useFeature } from '#flags/use-feature.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import type { ViewResolutionLevels } from '#workbench-records/view-record-binding-changes.js';
import { exceptionsForView, useViewExceptions, viewExceptionsStore } from '#workbench-records/view-exceptions.js';

/**
 * The levels for one view, read now: for a create-only seed outside React's render.
 *
 * @param projectId - The project.
 * @param viewId - The view.
 * @returns The levels.
 */
export const readViewLevels = (projectId: string, viewId: string): ViewResolutionLevels => ({
  ...(isFeatureEnabled('viewerControls') ? { person: personRecordStores.viewer.read().viewDefaults } : {}),
  exceptions: exceptionsForView(viewExceptionsStore.read(), projectId, viewId),
});

/** Where a project's view record sessions read the levels above each view, and hear of their changes. */
export type ViewLevelsSource = Readonly<{
  /** The levels for one view now. */
  read: (viewId: string) => ViewResolutionLevels;
  /** Hear of a change to the flag, the person's defaults or the exceptions, here or in another tab. */
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * The levels on this device for one project's views, outside React: the live view record sessions run in the project
 * machine beside each view's graphics, and read and follow the flag, the person's defaults and the exceptions here.
 *
 * @param projectId - The project.
 * @returns The source.
 */
export const deviceViewLevels = (projectId: string): ViewLevelsSource => ({
  read: (viewId) => readViewLevels(projectId, viewId),
  subscribe: (listener) => {
    const unsubscribes = [
      subscribeFeatureFlags(listener),
      personRecordStores.viewer.subscribe(listener),
      viewExceptionsStore.subscribe(listener),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  },
});

/**
 * The levels for one view in React, for a surface that shows where a leaf's value comes from (a view's menu). It
 * refreshes when the flag, the person's defaults or the exceptions change, here or in another tab.
 *
 * @param projectId - The project.
 * @param viewId - The view.
 * @returns The levels, stable while none of them changes.
 */
export const useViewLevels = (projectId: string, viewId: string): ViewResolutionLevels => {
  const viewerControls = useFeature('viewerControls');
  const { viewer } = usePersonRecord();
  const exceptions = exceptionsForView(useViewExceptions(), projectId, viewId);
  return useMemo(
    () => ({ ...(viewerControls ? { person: viewer.viewDefaults } : {}), exceptions }),
    [exceptions, viewer.viewDefaults, viewerControls],
  );
};

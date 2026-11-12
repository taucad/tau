/**
 * The levels a view's inheritable leaves resolve over on this device (onboarding blueprint, Finding 6): the person's
 * view defaults, present only while `viewerControls` is on, and this device's exceptions for the view, present in
 * every flag state. Turning the flag off stops saved defaults applying; turning it on applies them again. No view file
 * changes either way.
 */
import { isFeatureEnabled } from '#flags/feature-flags.js';
import { subscribeFeatureFlags } from '#flags/use-feature.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import type { ViewResolutionLevels } from '#workbench-records/view-record-binding-changes.js';
import { exceptionsForView, viewExceptionsStore } from '#workbench-records/view-exceptions.js';

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

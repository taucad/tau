import { Topic } from '@taucad/events';
import type { TourStepId } from '@taucad/preferences';

/*
 * The real actions the tour counts, reported from the controls that perform them. This module is all those controls
 * import: the tour itself loads only while one is running, and subscribes here.
 */

const tourActions = new Topic<TourStepId>({ name: 'tour.actions' });

/**
 * Report that the person did what a tip is about: committed a parameter value, opened the activity row that holds a
 * test run, or opened the Export pane. Nothing happens while no tour listens.
 *
 * @param step - The tip whose action was done.
 */
export const reportTourAction = (step: TourStepId): void => {
  tourActions.emit(step);
};

/**
 * Listen for the actions {@link reportTourAction} reports.
 *
 * @param listener - Called with each tip whose action was done.
 * @returns The unsubscribe.
 */
export const subscribeTourActions = (listener: (step: TourStepId) => void): (() => void) =>
  tourActions.subscribe(listener);

/**
 * A ref callback that reports `step` when its element mounts: rendered only while a surface is shown, it reports the
 * surface opening without an effect.
 *
 * @param step - The tip whose action the mount is.
 * @returns The ref callback.
 */
export const reportTourActionOnMount =
  (step: TourStepId) =>
  // oxlint-disable-next-line no-restricted-types -- React passes null to a ref callback on detach.
  (element: HTMLElement | null): void => {
    if (element !== null) {
      reportTourAction(step);
    }
  };

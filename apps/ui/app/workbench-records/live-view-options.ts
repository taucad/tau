import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

/**
 * View options a pane shows before its record has them. The options panel writes here on every change, so the
 * viewer re-renders at once, and saves the record when edits pause; the record is the durable copy.
 */
export type LiveViewOptions = Readonly<{
  /** The kernel view the options belong to. */
  viewId: string;
  options: Record<string, unknown>;
}>;

const drafts = new Map<string, LiveViewOptions>();
const changes = new Topic<void>({ name: 'viewer-live-view-options' });
const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

export const useLiveViewOptions = (paneId: string): LiveViewOptions | undefined =>
  useSyncExternalStore(
    subscribe,
    () => drafts.get(paneId),
    () => undefined,
  );

export const getLiveViewOptions = (paneId: string): LiveViewOptions | undefined => drafts.get(paneId);

export const setLiveViewOptions = (paneId: string, draft: LiveViewOptions | undefined): void => {
  if (draft) {
    drafts.set(paneId, draft);
  } else {
    drafts.delete(paneId);
  }
  changes.emit();
};

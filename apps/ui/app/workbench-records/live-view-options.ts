import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import { canonicalJson } from '@taucad/utils/hash';

/**
 * View options a pane shows before its record has them. The options panel writes here on every change, so the
 * viewer re-renders at once, and saves the record when edits pause; the record is the durable copy.
 *
 * A draft yields only to a record that says the same thing (`settleLiveViewOptions`), never when its write resolves:
 * the pane learns of a write through the record file's watcher, later, so a draft cleared on the write would show the
 * record's older options for a frame and the view would render them in between.
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

/**
 * Retire a pane's draft once its record holds the same options for the same kernel view, so the pane's options never
 * step back to an older record on the way.
 */
export const settleLiveViewOptions = (
  paneId: string,
  kernelViewId: string | undefined,
  savedOptions: Record<string, unknown> | undefined,
): void => {
  const draft = drafts.get(paneId);
  if (
    draft !== undefined &&
    draft.viewId === kernelViewId &&
    canonicalJson(draft.options) === canonicalJson(savedOptions ?? {})
  ) {
    setLiveViewOptions(paneId, undefined);
  }
};

/** Drop a draft that never reached the record (a refused or failed write), unless a newer draft replaced it. */
export const discardLiveViewOptions = (paneId: string, draft: LiveViewOptions): void => {
  if (drafts.get(paneId) === draft) {
    setLiveViewOptions(paneId, undefined);
  }
};

import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

const topic = new Topic<void>({ name: 'revision-reveal' });
/*
 * One pending reveal per project (C47).
 *
 * A single module slot made a *View revision* in project A visible to project
 * B's pane, because both panes read the same scalar — the same reason
 * `revision-outcomes.tsx` keys its notices by project.
 */
const requested = new Map<string, string>();

/**
 * Ask the Revisions pane to bring one revision into view.
 *
 * Held until that project's pane consumes it, so a request made before the pane
 * mounts still lands.
 *
 * @param projectId - The project the revision belongs to.
 * @param revisionId - The revision to reveal.
 * @public
 */
export const requestRevisionReveal = (projectId: string, revisionId: string): void => {
  requested.set(projectId, revisionId);
  topic.emit();
};

/**
 * Mark the pending reveal handled.
 *
 * @param projectId - The project whose pane revealed it.
 * @param revisionId - The revision the pane revealed.
 * @public
 */
export const consumeRevisionReveal = (projectId: string, revisionId: string): void => {
  if (requested.get(projectId) === revisionId) {
    requested.delete(projectId);
    topic.emit();
  }
};

/**
 * The revision this project's pane has been asked to reveal.
 *
 * @param projectId - The project the pane is rooted at.
 * @returns The pending revision id.
 * @public
 */
export const useRevisionReveal = (projectId: string): string | undefined =>
  useSyncExternalStore(
    (listener) => topic.subscribe(listener),
    () => requested.get(projectId),
    () => undefined,
  );

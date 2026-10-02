import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';

/** Evaluation-local instance choices never enter a workbench record. */
export type LocalInstanceChoice = Readonly<{
  evaluationId: string;
  viewId: string;
  instanceId: string;
}>;

const choices = new Map<string, LocalInstanceChoice>();
const changes = new Topic<void>({ name: 'viewer-local-instances' });
const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

export const useLocalInstanceChoice = (paneId: string): LocalInstanceChoice | undefined =>
  useSyncExternalStore(
    subscribe,
    () => choices.get(paneId),
    () => undefined,
  );

export const setLocalInstanceChoice = (paneId: string, choice: LocalInstanceChoice | undefined): void => {
  if (choice) {
    choices.set(paneId, choice);
  } else {
    choices.delete(paneId);
  }
  changes.emit();
};

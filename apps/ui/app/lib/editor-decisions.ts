/**
 * The *Needs your decision* an editor holds when its text and the file's new
 * bytes cannot be merged (RV-W5b2 N1, R2-1).
 *
 * ponytail: the decision lives in this document's memory until W6 records it
 * as a conflicted revision. Until then it is kept from every loss a page can
 * refuse: the toast cannot be dismissed, a project holding one cannot close or
 * be evicted, and a model service that goes away hands the text over rather
 * than dropping it. A reload still loses it.
 */
import { createElement } from 'react';
import { Topic } from '@taucad/events';
import { toast } from 'sonner';

/** One open decision: whose file, what arrived, and how each side is kept. */
export type EditorDecision = {
  readonly projectId: string;
  /** Workspace-relative; follows a rename. */
  path: string;
  /** The bytes that arrived, which *Keep theirs* keeps. */
  theirs: Uint8Array<ArrayBuffer>;
  /** Settle it; the owner closes the decision once the side is kept. */
  keep: (side: 'mine' | 'theirs') => void;
};

/* Each open decision's current toast id. */
const decisions = new Map<EditorDecision, string>();
const changes = new Topic<void>({ name: 'EditorDecisions' });
let raised = 0;

const notify = (): void => {
  changes.emit();
};

const nameOf = (decision: EditorDecision): string => decision.path.split('/').pop() ?? decision.path;

/**
 * Put the toast on screen: not dismissible, never timed out.
 *
 * `cancel` is an element because sonner ignores a non-dismissible toast's
 * cancel button; the attributes keep its styling.
 */
const show = (decision: EditorDecision, id: string): void => {
  toast('Needs your decision', {
    id,
    description: `${nameOf(decision)} changed while you were editing it.`,
    duration: Number.POSITIVE_INFINITY,
    dismissible: false,
    /* Only a programmatic dismiss reaches here; one that did not settle the decision raises it again. */
    onDismiss: () => {
      if (decisions.get(decision) === id) {
        raise(decision);
      }
    },
    action: {
      label: 'Keep mine',
      onClick: (event) => {
        decision.keep('mine');
        if (decisions.has(decision)) {
          event.preventDefault();
        }
      },
    },
    cancel: createElement(
      'button',
      {
        type: 'button',
        'data-button': true,
        'data-cancel': true,
        onClick: () => {
          decision.keep('theirs');
        },
      },
      'Keep theirs',
    ),
  });
};

/* A fresh id, on top: a dismissed toast's id stays marked deleted until sonner unmounts it. */
function raise(decision: EditorDecision): void {
  const previous = decisions.get(decision);
  raised += 1;
  const id = `editor-decision:${decision.projectId}:${decision.path}:${String(raised)}`;
  decisions.set(decision, id);
  show(decision, id);
  if (previous !== undefined) {
    toast.dismiss(previous);
  }
}

/**
 * Ask a person to choose, or ask again with what arrived since.
 *
 * @param decision - The decision; asking again updates its toast in place.
 */
export const openEditorDecision = (decision: EditorDecision): void => {
  const id = decisions.get(decision);
  if (id === undefined) {
    raise(decision);
    notify();
    return;
  }
  show(decision, id);
};

/**
 * The side is kept: take the toast down.
 *
 * @param decision - The decision that settled.
 */
export const closeEditorDecision = (decision: EditorDecision): void => {
  const id = decisions.get(decision);
  if (id === undefined) {
    return;
  }
  decisions.delete(decision);
  toast.dismiss(id);
  notify();
};

/**
 * Whether a project holds an open decision.
 *
 * @param projectId - The project.
 * @returns True while any of its files waits on a person.
 */
export const hasPendingEditorDecision = (projectId: string): boolean =>
  [...decisions.keys()].some((decision) => decision.projectId === projectId);

/**
 * Be told when decisions open or close, for `useSyncExternalStore`.
 *
 * @param listener - Called on every open and close.
 * @returns The unsubscribe.
 */
export const subscribeEditorDecisions = (listener: () => void): (() => void) => changes.subscribe(listener);

/**
 * Refuse a project's close while a person still has to choose, and show them why.
 *
 * @param projectId - The project being closed.
 * @throws Error With the toast's own words, after raising the toast again.
 */
export const refuseCloseWhileDeciding = (projectId: string): void => {
  const open = [...decisions.keys()].find((decision) => decision.projectId === projectId);
  if (open === undefined) {
    return;
  }
  raise(open);
  throw new Error(`Needs your decision: ${nameOf(open)} changed while you were editing it.`);
};

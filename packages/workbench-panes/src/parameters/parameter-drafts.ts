import type { ParametersDrafts, ParametersDraftKey } from '#parameters/parameters-source.js';

/**
 * Drafts kept in memory for a host that keeps none: rows that unmount keep their typed text for as long as the pane
 * lives.
 *
 * @returns A draft store that lives as long as the caller holds it.
 */
export const createParameterDraftStore = (): ParametersDrafts => {
  const drafts = new Map<string, NonNullable<ReturnType<ParametersDrafts['draft']>>>();
  const listeners = new Set<() => void>();
  const keyOf = (key: ParametersDraftKey): string => JSON.stringify([key.entryPath, key.group, key.pointer]);
  return {
    draft: (key) => drafts.get(keyOf(key)),
    setDraft: (key, draft) => {
      if (draft !== undefined) {
        // Typing stays local; only clearing notifies mounted rows.
        drafts.set(keyOf(key), draft);
        return;
      }
      if (drafts.delete(keyOf(key))) {
        for (const listener of listeners) {
          listener();
        }
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

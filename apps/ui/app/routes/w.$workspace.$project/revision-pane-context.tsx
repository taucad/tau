import { createContext, useContext } from 'react';

/** Shared open-state for the Revisions pane (overlay-rail button, chip, command palette). */
export type RevisionPaneState = {
  isOpen: boolean;
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  toggle: () => void;
};

export const RevisionPaneContext = createContext<RevisionPaneState | undefined>(undefined);

export function useRevisionPane(): RevisionPaneState {
  const context = useContext(RevisionPaneContext);
  if (!context) {
    throw new Error('useRevisionPane must be used within a RevisionProvider');
  }
  return context;
}

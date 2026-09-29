import { useCallback, useState } from 'react';
import type { MachineDirectoryEntry } from '@taucad/runtime/machine';

const storageKey = (projectId: string): string => `tau:print:selected-machine:${projectId}`;

const readSelection = (projectId: string): string | undefined => {
  try {
    return globalThis.localStorage.getItem(storageKey(projectId)) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeSelection = (projectId: string, machineId: string): void => {
  try {
    globalThis.localStorage.setItem(storageKey(projectId), machineId);
  } catch {
    /* A private window or SSR pass has no storage; the selection lives for this mount. */
  }
};

/** The machine the Print pane works with and how to change it. @public */
export type MachineSelection = Readonly<{
  selected: MachineDirectoryEntry | undefined;
  select: (machineId: string) => void;
}>;

/**
 * Remember which machine this project prints on.
 *
 * The stored id is a logical machine id, never a credential (api-spec §3). A
 * stored id that no longer exists in the directory falls back to the first
 * entry, so a removed machine never leaves the pane empty.
 *
 * @param projectId - The project the selection belongs to.
 * @param entries - The current directory entries.
 * @returns The selected entry and the selector.
 * @public
 */
export const useMachinesSelection = (
  projectId: string,
  entries: readonly MachineDirectoryEntry[],
): MachineSelection => {
  // ponytail: per-project browser storage behind this one seam; move to `PanelState.printMachineId` once the panel-state types admit it.
  const [state, setState] = useState(() => ({ projectId, machineId: readSelection(projectId) }));
  if (state.projectId !== projectId) {
    setState({ projectId, machineId: readSelection(projectId) });
  }
  const select = useCallback(
    (machineId: string) => {
      writeSelection(projectId, machineId);
      setState({ projectId, machineId });
    },
    [projectId],
  );
  const selected = entries.find((entry) => entry.machineId === state.machineId) ?? entries[0];
  return { selected, select };
};

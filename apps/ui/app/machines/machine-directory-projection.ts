import { mergeComponentObservations } from '@taucad/runtime/machine';
import type { MachineDirectoryFrame, MachineDirectorySnapshot } from '@taucad/runtime/machine';

/**
 * Reduce one admitted directory frame without introducing a second machine state authority.
 *
 * @param current - The projection before the frame.
 * @param frame - One frame from `MachineClient.watch`.
 * @returns The projection after the frame.
 * @public
 */
export const projectMachineDirectoryFrame = (
  current: MachineDirectorySnapshot,
  frame: MachineDirectoryFrame,
): MachineDirectorySnapshot => {
  if (frame.type === 'snapshot' || frame.type === 'resync-required') {
    return frame.snapshot;
  }
  if (frame.type === 'observed') {
    // Latest readings move outside the event tail: the cursor stays where it is.
    return {
      ...current,
      entries: current.entries.map((entry) =>
        entry.machineId === frame.machineId
          ? {
              ...entry,
              snapshot: {
                ...entry.snapshot,
                observedAt: frame.observedAt,
                components: mergeComponentObservations(entry.snapshot.components, frame.components),
              },
            }
          : entry,
      ),
    };
  }
  if (frame.event.type === 'machine-directory-removed') {
    const { machineId } = frame.event;
    return {
      ...current,
      cursor: frame.cursor,
      entries: current.entries.filter((entry) => entry.machineId !== machineId),
    };
  }
  const { entry } = frame.event;
  return {
    ...current,
    cursor: frame.cursor,
    // Telemetry replaces facts in place; receipt order must never choose the printer.
    entries: current.entries.some(({ machineId }) => machineId === entry.machineId)
      ? current.entries.map((candidate) => (candidate.machineId === entry.machineId ? entry : candidate))
      : [...current.entries, entry],
  };
};

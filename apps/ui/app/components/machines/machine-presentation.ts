import { CircleAlert, CircleCheck, Drill, LoaderCircle, PauseCircle, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fffProcessOf } from '@taucad/runtime/machine';
import type { MachineDirectoryEntry, MachineJob } from '@taucad/runtime/machine';

/** Plain orientation copy derived solely from the authoritative directory entry. @public */
export type MachinePresentation = Readonly<{
  label: string;
  icon: LucideIcon;
  /** Color for the glyph only; the text stays neutral (DESIGN, color usage law). */
  iconClassName: string;
}>;

const spinning = 'text-information animate-spin motion-reduce:animate-none';

/** How a job in flight reads while the machine's own report still describes the moment before it. */
const inFlightPresentation: Partial<Record<MachineJob['state'], MachinePresentation>> = {
  approved: { label: 'Sending', icon: LoaderCircle, iconClassName: spinning },
  transferring: { label: 'Sending', icon: LoaderCircle, iconClassName: spinning },
  starting: { label: 'Starting', icon: LoaderCircle, iconClassName: spinning },
  confirming: { label: 'Starting', icon: LoaderCircle, iconClassName: spinning },
  'awaiting-start': {
    label: 'Waiting for the start at the machine',
    icon: PauseCircle,
    iconClassName: 'text-information',
  },
};

/**
 * Where the machine is and what it needs, from the entry and the job this pane has in flight. A job in flight speaks
 * first: the machine keeps reporting its previous state until it takes the start.
 *
 * @param entry - The machine as observed.
 * @param openJob - This machine's unsettled job, if any.
 * @returns The status label and glyph.
 * @public
 */
export const presentMachine = (entry: MachineDirectoryEntry, openJob?: MachineJob): MachinePresentation => {
  const inFlight = openJob === undefined ? undefined : inFlightPresentation[openJob.state];
  const { connection, run, state, activities } = entry.snapshot;
  if (inFlight && entry.freshness === 'current' && connection === 'connected') {
    return inFlight;
  }
  if (entry.freshness === 'stale') {
    return { label: 'Stale observation', icon: CircleAlert, iconClassName: 'text-warning' };
  }
  if (connection !== 'connected') {
    return {
      label:
        connection === 'occupied'
          ? 'In use by another app'
          : connection === 'unreachable'
            ? 'Unreachable'
            : 'Disconnected',
      icon: CircleAlert,
      iconClassName: 'text-feature',
    };
  }
  if (state.status === 'alarm') {
    return { label: 'Alarm', icon: CircleAlert, iconClassName: 'text-feature' };
  }
  if (run?.state === 'paused' || state.status === 'held') {
    return { label: 'Paused', icon: PauseCircle, iconClassName: 'text-warning' };
  }
  if (run?.state === 'running' || run?.state === 'starting' || run?.state === 'finishing') {
    return {
      label: fffProcessOf(entry.descriptor.capabilities) === undefined ? 'Running' : 'Printing',
      icon: fffProcessOf(entry.descriptor.capabilities) === undefined ? Drill : Printer,
      iconClassName: 'text-information',
    };
  }
  const busy = activities.find((activity) => activity.state === 'in-progress' || activity.state === 'needs-person');
  if (busy !== undefined) {
    return { label: busy.label, icon: LoaderCircle, iconClassName: spinning };
  }
  if (state.status === 'ready') {
    return { label: 'Ready', icon: CircleCheck, iconClassName: 'text-success' };
  }
  return {
    label: state.status === 'asleep' ? 'Asleep' : state.status === 'active' ? 'Busy' : 'Not ready',
    icon: CircleAlert,
    iconClassName: 'text-warning',
  };
};

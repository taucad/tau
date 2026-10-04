/**
 * The pure check every surface runs before it offers or sends an action: the same order the host follows, over
 * the machine as last observed. Advisory: `applyAction` repeats every check with facts only the host has.
 *
 * @module
 */

import { isUnattendedAction } from '#machines/machine-actions.js';
import type {
  MachineActionDescriptor,
  MachineFailure,
  MachineHoldDescriptor,
  MachineRemedy,
} from '#machines/machine-actions.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import { componentValue } from '#machines/machine-observation.js';

/** The answer a surface shows before anything is sent. @public */
export type MachineActionCheck =
  | Readonly<{ status: 'available'; descriptor: MachineActionDescriptor | MachineHoldDescriptor }>
  /** An agent may ask, and a person approves this exact intent before it is sent. */
  | Readonly<{ status: 'approval-required'; descriptor: MachineActionDescriptor | MachineHoldDescriptor }>
  | (Readonly<{
      status: 'unavailable';
      descriptor?: MachineActionDescriptor | MachineHoldDescriptor;
      remedy?: MachineRemedy;
    }> &
      MachineFailure);

/** What the pure check reads. @public */
export type MachineActionCheckInput = Readonly<{
  entry: MachineDirectoryEntry;
  componentId: string;
  action: string;
  /** An action, or a hold (a control held down). */
  kind?: 'action' | 'hold';
  /** The run the caller saw; defaults to the run the entry shows. */
  expectedRunId?: string | null;
  /** Who would send it, so a control an agent may not use says so before it tries. */
  caller: 'person' | 'agent';
  /** Whether the person has said they are at the machine. */
  attended: boolean;
  /** Host-adjusted wall-clock instant. Milliseconds. */
  now: number;
}>;

const unavailable = (
  code: MachineFailure['code'],
  message: string,
  extra: Readonly<{ descriptor?: MachineActionDescriptor | MachineHoldDescriptor; remedy?: MachineRemedy }> = {},
): MachineActionCheck => ({ status: 'unavailable', code, message, ...extra });

const statusWords: Readonly<Record<string, string>> = {
  ready: 'only while a job runs',
  active: 'not while the machine is busy',
  held: 'not while the job is paused',
  alarm: 'not while the machine is in alarm',
  asleep: 'not while the machine is asleep',
  unknown: 'not until the machine reports its state',
};

/**
 * The installed descriptor of an action or a hold, when the machine declares it.
 * @param entry - The machine as shown.
 * @param componentId - The component.
 * @param action - The action or hold id.
 * @param kind - Which list to look in.
 * @returns The descriptor, or undefined.
 * @public
 */
export const machineActionOf = (
  entry: MachineDirectoryEntry,
  componentId: string,
  action: string,
  kind: 'action' | 'hold' = 'action',
): MachineActionDescriptor | MachineHoldDescriptor | undefined =>
  (kind === 'action' ? entry.descriptor.capabilities.actions : entry.descriptor.capabilities.holds).find(
    (descriptor) => descriptor.componentId === componentId && descriptor.id === action,
  );

/**
 * Explain what is known to block an action now: connection, declaration, qualification, the provider's own
 * availability, state, run, freshness, interlocks, authority and attendance, in that order.
 * @param input - The machine as last observed, the action, the caller and the time.
 * @returns Available, approval required (an agent), or the refusal and its remedy. No I/O.
 * @public
 */
// oxlint-disable-next-line eslint/complexity -- One ordered pass mirrors the host's admission order.
export const checkMachineAction = (input: MachineActionCheckInput): MachineActionCheck => {
  const { entry, componentId, action, caller } = input;
  const { snapshot } = entry;
  const kind = input.kind ?? 'action';
  if (snapshot.connection !== 'connected') {
    return unavailable(
      'MACHINE_UNAVAILABLE',
      snapshot.connection === 'occupied'
        ? `${entry.name} serves one app at a time and another app holds it.`
        : `${entry.name} is not connected.`,
    );
  }
  const descriptor = machineActionOf(entry, componentId, action, kind);
  if (descriptor === undefined) {
    return unavailable('MACHINE_ACTION_UNDECLARED', `${entry.name} does not declare this control.`);
  }
  if (descriptor.qualification.status === 'unsupported') {
    return unavailable('MACHINE_ACTION_UNSUPPORTED', descriptor.qualification.reason, { descriptor });
  }
  if (descriptor.qualification.status === 'designed' && entry.testing !== true) {
    return unavailable(
      'MACHINE_ACTION_UNQUALIFIED',
      `${descriptor.label} is not yet qualified on this machine. Turn on testing in the machine’s settings to try it.`,
      { descriptor },
    );
  }
  const provider = snapshot.availability.find(
    (availability) => availability.componentId === componentId && availability.id === action,
  );
  if (provider?.state === 'unavailable') {
    return unavailable(provider.code, provider.message, {
      descriptor,
      ...(provider.remedy === undefined ? {} : { remedy: provider.remedy }),
    });
  }
  if (!descriptor.when.includes(snapshot.state.status)) {
    const blocking = snapshot.alerts.find((alert) => alert.blocks !== 'nothing' && alert.remedies?.[0] !== undefined);
    return unavailable(
      'scope' in descriptor && descriptor.scope === 'idle' && snapshot.run !== undefined
        ? 'MACHINE_ACTION_RUN_ACTIVE'
        : 'MACHINE_ACTION_PRECONDITION_FAILED',
      `${descriptor.label}: ${statusWords[snapshot.state.status] ?? 'not now'}.`,
      {
        descriptor,
        ...(blocking?.remedies?.[0] === undefined ? {} : { remedy: blocking.remedies[0] }),
      },
    );
  }
  const runId = snapshot.run?.runId ?? null;
  const expectedRunId = input.expectedRunId === undefined ? runId : input.expectedRunId;
  if ('scope' in descriptor && descriptor.scope === 'run' && (runId === null || expectedRunId !== runId)) {
    return unavailable('MACHINE_ACTION_STALE_RUN', 'The run you saw has ended or changed.', { descriptor });
  }
  for (const required of descriptor.requires) {
    const observation = snapshot.components.find(
      (candidate) => candidate.componentId === required.componentId && candidate.group === required.group,
    );
    const isFresh =
      observation?.knowledge === 'known' &&
      (observation.validUntil === undefined || Date.parse(observation.validUntil) > input.now);
    if (!isFresh) {
      return unavailable('MACHINE_ACTION_STALE_OBSERVATION', `Waiting for ${entry.name} to report its state.`, {
        descriptor,
      });
    }
  }
  const motion = entry.descriptor.capabilities.components.find((component) => component.kind === 'motion');
  if (descriptor.effects.includes('motion') && motion !== undefined && action !== 'motion.home') {
    const trust = componentValue(snapshot.components, motion.id, 'motion')?.trust;
    if (trust === 'lost' || trust === 'unknown') {
      const canHome = machineActionOf(entry, motion.id, 'motion.home') !== undefined;
      return unavailable(
        'MACHINE_ACTION_PRECONDITION_FAILED',
        trust === 'lost' ? 'The position was lost. Home first.' : 'The position is not known yet. Home first.',
        {
          descriptor,
          ...(canHome ? { remedy: { type: 'action', componentId: motion.id, action: 'motion.home' } as const } : {}),
        },
      );
    }
  }
  for (const interlock of descriptor.safety.interlocks) {
    const state = componentValue(snapshot.components, interlock, 'interlock')?.state;
    if (state !== 'safe') {
      const label =
        entry.descriptor.capabilities.components.find((component) => component.id === interlock)?.label ?? interlock;
      return unavailable('MACHINE_ACTION_INTERLOCK', `${label} is not safe.`, {
        descriptor,
        remedy: { type: 'person', instruction: `Make the ${label.toLowerCase()} safe at the machine.` },
      });
    }
  }
  if (caller === 'agent') {
    if (descriptor.safety.authority === 'person' || descriptor.safety.attended) {
      return unavailable(
        'MACHINE_ACTION_PERSON_REQUIRED',
        `Only a person at the machine can ${descriptor.label.toLowerCase()}.`,
        {
          descriptor,
        },
      );
    }
    const componentKind =
      entry.descriptor.capabilities.components.find((component) => component.id === componentId)?.kind ?? '';
    return 'scope' in descriptor &&
      descriptor.qualification.status === 'qualified' &&
      isUnattendedAction(componentKind, descriptor)
      ? { status: 'available', descriptor }
      : { status: 'approval-required', descriptor };
  }
  if (descriptor.safety.attended && !input.attended) {
    return unavailable('MACHINE_ACTION_ATTENDANCE_REQUIRED', 'Say you are at the machine first.', { descriptor });
  }
  return { status: 'available', descriptor };
};

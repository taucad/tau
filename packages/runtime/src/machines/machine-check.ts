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
  MachineStatus,
} from '#machines/machine-actions.js';
import type { MachineApplyActionInput } from '#machines/machine-client.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineManifest } from '#machines/machine-manifest.js';
import { componentValue, withValidity } from '#machines/machine-observation.js';
import type { MachineReport } from '#machines/machine-observation.js';
import type { MachineInstalledCapabilities } from '#machines/machine.js';

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

/**
 * What the check reads of a machine: a directory entry, or a provider's own name, capabilities and latest report.
 * @public
 */
export type MachineActionCheckEntry = Readonly<{
  name: string;
  /** A person let controls not yet qualified on this machine be tried. */
  testing?: boolean;
  descriptor: Readonly<{
    capabilities: Pick<MachineInstalledCapabilities, 'actions' | 'holds' | 'components' | 'processes'>;
  }>;
  snapshot: MachineReport;
}>;

/** What the pure check reads. @public */
export type MachineActionCheckInput = Readonly<{
  entry: MachineActionCheckEntry;
  componentId: string;
  action: string;
  /** An action, or a hold (a control held down). */
  kind?: 'action' | 'hold';
  /** The run the caller saw; defaults to the run the entry shows. */
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run.
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

const recovers: ReadonlySet<string> = new Set(['motion.home', 'controller.wake', 'controller.unlock']);

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
 * @param target - The component, the action or hold id, and which list to look in.
 * @returns The descriptor, or undefined.
 * @public
 */
export const machineActionOf = (
  entry: MachineActionCheckEntry,
  { componentId, action, kind = 'action' }: Readonly<{ componentId: string; action: string; kind?: 'action' | 'hold' }>,
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
  const descriptor = machineActionOf(entry, { componentId, action, kind });
  if (descriptor === undefined) {
    return unavailable('MACHINE_ACTION_UNDECLARED', `${entry.name} does not declare this control.`);
  }
  if (descriptor.qualification.status === 'unsupported') {
    return unavailable('MACHINE_ACTION_UNSUPPORTED', descriptor.qualification.reason, { descriptor });
  }
  // Testing is a person's mode: an agent never sends a control that is not yet qualified, testing or not.
  if (descriptor.qualification.status === 'designed' && (entry.testing !== true || caller === 'agent')) {
    return unavailable(
      'MACHINE_ACTION_UNQUALIFIED',
      caller === 'agent'
        ? `${descriptor.label} is not yet qualified on this machine; only a person testing it may try it.`
        : `${descriptor.label} is not yet qualified on this machine. ` +
            'Turn on testing in the machine’s settings to try it.',
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
  const when: readonly MachineStatus[] = descriptor.when;
  if (!when.includes(snapshot.state.status)) {
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
  // A machine without homing (no `motion.home` installed) only ever works from its work zero; there is nothing to gate.
  const canHome =
    motion !== undefined && machineActionOf(entry, { componentId: motion.id, action: 'motion.home' }) !== undefined;
  // Homing, waking and unlocking are how a machine recovers its position, so they are never gated on it.
  if (descriptor.effects.includes('motion') && motion !== undefined && canHome && !recovers.has(action)) {
    const trust = componentValue(snapshot.components, motion.id, 'motion')?.trust;
    if (trust === 'lost' || trust === 'unknown') {
      return unavailable(
        'MACHINE_ACTION_PRECONDITION_FAILED',
        trust === 'lost' ? 'The position was lost. Home first.' : 'The position is not known yet. Home first.',
        { descriptor, remedy: { type: 'action', componentId: motion.id, action: 'motion.home' } },
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
    const { components, processes } = entry.descriptor.capabilities;
    const componentKind = components.find((component) => component.id === componentId)?.kind ?? '';
    return 'scope' in descriptor &&
      descriptor.qualification.status === 'qualified' &&
      isUnattendedAction(componentKind, descriptor, processes)
      ? { status: 'available', descriptor }
      : { status: 'approval-required', descriptor };
  }
  if (descriptor.safety.attended && !input.attended) {
    return unavailable('MACHINE_ACTION_ATTENDANCE_REQUIRED', 'Say you are at the machine first.', { descriptor });
  }
  return { status: 'available', descriptor };
};

/**
 * A provider's own admission at the moment of sending: the same check over its latest report, so no provider keeps
 * a copy. Qualification, authority and attendance were the host's to admit and are not repeated; state, the run
 * fence, freshness, homing, interlocks and the provider's own availability are. Freshness holds the report to the
 * manifest's `observations` budgets, as the host does, so they are required: a provider cannot skip freshness by
 * leaving them out.
 * @param input - The provider's name for the machine, what is installed, its latest report, its freshness budgets
 * and the intent.
 * @returns The refusal to return as a rejected receipt, or undefined when the action may be sent.
 * @public
 */
export const checkMachineActionAtSend = (
  input: Readonly<{
    name: string;
    capabilities: MachineActionCheckEntry['descriptor']['capabilities'];
    report: MachineReport;
    /** The manifest's observation groups, whose `staleAfter` each observation is valid for from its `receivedAt`. */
    observations: MachineManifest['observations'];
    componentId: string;
    action: string;
    kind?: 'action' | 'hold';
    /** The run the caller saw, as the host passed it; null for an idle action. */
    // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run.
    expectedRunId: string | null;
    /** The provider's clock. Milliseconds. */
    now: number;
  }>,
): MachineFailure | undefined => {
  const check = checkMachineAction({
    entry: {
      name: input.name,
      testing: true,
      descriptor: { capabilities: input.capabilities },
      snapshot: {
        ...input.report,
        components: withValidity(
          input.report.components,
          new Map(input.observations.map(({ group, staleAfter }) => [group, staleAfter])),
        ),
      },
    },
    componentId: input.componentId,
    action: input.action,
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    expectedRunId: input.expectedRunId,
    caller: 'person',
    attended: true,
    now: input.now,
  });
  return check.status === 'unavailable' ? { code: check.code, message: check.message } : undefined;
};

/**
 * The complete request for one declared action as the caller saw it: its machine, revision, version and run.
 * @param entry - The machine as shown.
 * @param descriptor - The action, from that entry.
 * @param intent - The caller-retained operation id, the parameters, who asks, and attendance.
 * @returns The input `applyAction` takes.
 * @public
 */
export const machineActionIntent = (
  entry: MachineDirectoryEntry,
  descriptor: MachineActionDescriptor,
  intent: Pick<MachineApplyActionInput, 'operationId' | 'parameters' | 'requestedBy' | 'attended' | 'signal'>,
): MachineApplyActionInput => ({
  ...intent,
  machineId: entry.machineId,
  componentId: descriptor.componentId,
  capabilityRevision: entry.descriptor.capabilities.revision,
  action: descriptor.id,
  version: descriptor.version,
  expectedRunId: descriptor.scope === 'idle' ? null : (entry.snapshot.run?.runId ?? null),
});

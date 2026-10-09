import { describe, expect, it } from 'vitest';

import { machineActionDescriptorOf, standardMachineAction } from '#machines/machine-actions.js';
import { checkMachineAction, checkMachineActionAtSend, machineActionIntent } from '#machines/machine-check.js';
import type { MachineActionCheckEntry, MachineActionCheckInput } from '#machines/machine-check.js';
import type { MachineDirectoryEntry } from '#machines/machine-directory.js';
import { machineManifestFixture } from '#machines/machine-manifest.fixture.js';
import type { ComponentObservation, MachineRun } from '#machines/machine-observation.js';
import { fixtureDescriptor, fixtureObservation, fixtureReport } from '#machines/machine-session.fixture.js';

const qualified = { status: 'qualified', profileId: 'fixture-simulation' } as const;
const now = Date.parse('2026-09-14T00:00:01.000Z');
const run: MachineRun = {
  runId: 'run-1',
  origin: 'tau',
  delivery: 'stored',
  state: 'running',
  progress: { basis: 'executed', counters: [] },
};
const printing = fixtureReport({ state: { status: 'active' }, run });

/** The fixture printer with a door interlock and a brightness control that needs it closed. */
const capabilities: MachineActionCheckEntry['descriptor']['capabilities'] = {
  ...machineManifestFixture,
  components: [...machineManifestFixture.components, { id: 'door', label: 'Door', kind: 'interlock', guards: 'door' }],
  actions: [
    ...machineManifestFixture.actions,
    machineActionDescriptorOf(
      standardMachineAction({
        id: 'level.set',
        componentId: 'chamber-light',
        componentKind: 'light',
        label: 'Brightness',
        when: ['ready'],
        safety: { interlocks: ['door'] },
        qualification: qualified,
      }),
    ),
    machineActionDescriptorOf(
      standardMachineAction({
        id: 'controller.wake',
        componentId: 'controller',
        label: 'Wake',
        when: ['asleep'],
        qualification: qualified,
      }),
    ),
  ],
};

const check = (
  overrides: Partial<Omit<MachineActionCheckInput, 'entry'>> & Readonly<{ entry?: Partial<MachineActionCheckEntry> }>,
) =>
  checkMachineAction({
    componentId: 'chamber-light',
    action: 'switch.set',
    caller: 'person',
    attended: false,
    now,
    ...overrides,
    entry: { name: 'Fixture printer', descriptor: { capabilities }, snapshot: fixtureReport(), ...overrides.entry },
  });

describe('checkMachineAction', () => {
  it('keeps a designed control from everyone until a person turns on testing, and from an agent even then', () => {
    const home = { componentId: 'motion', action: 'motion.home', attended: true } as const;
    expect(check(home)).toMatchObject({ status: 'unavailable', code: 'MACHINE_ACTION_UNQUALIFIED' });
    expect(check({ ...home, entry: { testing: true } })).toMatchObject({ status: 'available' });
    expect(check({ ...home, caller: 'agent', attended: false, entry: { testing: true } })).toMatchObject({
      status: 'unavailable',
      code: 'MACHINE_ACTION_UNQUALIFIED',
    });
  });

  it('admits an agent unattended only on the low-risk list and asks a person to approve the rest', () => {
    expect(check({ caller: 'agent' })).toMatchObject({ status: 'available' });
    expect(
      check({ caller: 'agent', componentId: 'controller', action: 'run.cancel', entry: { snapshot: printing } }),
    ).toMatchObject({ status: 'approval-required' });
  });

  it('keeps a held jog for a person who says they are at the machine', () => {
    const jog = { componentId: 'motion', action: 'motion.jog', kind: 'hold' } as const;
    expect(check({ ...jog, caller: 'agent' })).toMatchObject({ code: 'MACHINE_ACTION_PERSON_REQUIRED' });
    expect(check(jog)).toMatchObject({ code: 'MACHINE_ACTION_ATTENDANCE_REQUIRED' });
    expect(check({ ...jog, attended: true })).toMatchObject({ status: 'available' });
  });

  it('lets an agent pause a print unattended but not a cut', () => {
    const pause = { caller: 'agent', componentId: 'controller', action: 'run.pause' } as const;
    expect(check({ ...pause, entry: { snapshot: printing } })).toMatchObject({ status: 'available' });
    const router: MachineActionCheckEntry['descriptor']['capabilities'] = {
      ...capabilities,
      processes: [{ type: 'milling', version: 1, simultaneousAxes: 3, features: [], workOffsets: ['G54'] }],
    };
    expect(check({ ...pause, entry: { snapshot: printing, descriptor: { capabilities: router } } })).toMatchObject({
      status: 'approval-required',
    });
  });

  it('fences a run action to the run the caller saw', () => {
    const cancel = { componentId: 'controller', action: 'run.cancel', entry: { snapshot: printing } } as const;
    expect(check(cancel)).toMatchObject({ status: 'available' });
    expect(check({ ...cancel, expectedRunId: 'run-0' })).toMatchObject({ code: 'MACHINE_ACTION_STALE_RUN' });
    expect(check({ ...cancel, expectedRunId: null })).toMatchObject({ code: 'MACHINE_ACTION_STALE_RUN' });
  });

  it('waits for a fresh known observation of every required group', () => {
    const light = (observation: ReturnType<typeof fixtureObservation>) => ({
      entry: { snapshot: fixtureReport({ components: [observation, ...fixtureReport().components.slice(1)] }) },
    });
    const known = fixtureObservation('chamber-light', 'accessories', { kind: 'switch', on: false });
    expect(check(light({ ...known, validUntil: '2026-09-14T00:00:00.500Z' }))).toMatchObject({
      code: 'MACHINE_ACTION_STALE_OBSERVATION',
    });
    expect(
      check(
        light({
          componentId: 'chamber-light',
          group: 'accessories',
          receivedAt: known.receivedAt,
          knowledge: 'unknown',
          reason: 'Unreadable report',
        }),
      ),
    ).toMatchObject({ code: 'MACHINE_ACTION_STALE_OBSERVATION' });
    expect(check(light({ ...known, validUntil: '2026-09-14T00:00:02.000Z' }))).toMatchObject({ status: 'available' });
  });

  it('wakes a machine whose position is unknown but keeps other motion until it is homed', () => {
    const unknownPosition = fixtureReport().components.map(
      (observation): ComponentObservation =>
        observation.knowledge === 'known' && observation.value.kind === 'motion'
          ? { ...observation, value: { ...observation.value, trust: 'unknown' } }
          : observation,
    );
    const asleep = fixtureReport({ state: { status: 'asleep' }, components: unknownPosition });
    expect(
      check({ componentId: 'controller', action: 'controller.wake', attended: true, entry: { snapshot: asleep } }),
    ).toMatchObject({ status: 'available' });
    expect(
      check({
        componentId: 'motion',
        action: 'motion.jog',
        kind: 'hold',
        attended: true,
        entry: { snapshot: fixtureReport({ components: unknownPosition }) },
      }),
    ).toMatchObject({ code: 'MACHINE_ACTION_PRECONDITION_FAILED', remedy: { action: 'motion.home' } });
  });

  it('refuses while an interlock is not safe, naming what makes it safe', () => {
    const door = (state: 'safe' | 'unsafe') => ({
      action: 'level.set',
      entry: {
        snapshot: fixtureReport({
          components: [
            ...fixtureReport().components,
            fixtureObservation('door', 'inputs', { kind: 'interlock', state }),
          ],
        }),
      },
    });
    expect(check(door('unsafe'))).toMatchObject({
      code: 'MACHINE_ACTION_INTERLOCK',
      remedy: { type: 'person', instruction: 'Make the door safe at the machine.' },
    });
    expect(check(door('safe'))).toMatchObject({ status: 'available' });
  });
});

describe('checkMachineActionAtSend', () => {
  const atSend = (action: string, componentId: string, report = fixtureReport()) =>
    checkMachineActionAtSend({
      name: 'Fixture printer',
      capabilities,
      report,
      componentId,
      action,
      expectedRunId: null,
      now,
    });

  it('holds the report to the manifest freshness budgets it is given, as the host does', () => {
    const hold = {
      name: 'Fixture printer',
      capabilities,
      report: fixtureReport(),
      componentId: 'motion',
      action: 'motion.jog',
      kind: 'hold',
      expectedRunId: null,
      // Five seconds after the report: past the position's one-second budget.
      now: now + 5000,
    } as const;
    expect(checkMachineActionAtSend(hold)).toBeUndefined();
    expect(checkMachineActionAtSend({ ...hold, observations: machineManifestFixture.observations })).toMatchObject({
      code: 'MACHINE_ACTION_STALE_OBSERVATION',
    });
  });

  it("repeats the machine's state at sending and leaves qualification and authority to the host", () => {
    expect(atSend('run.pause', 'controller')).toMatchObject({ code: 'MACHINE_ACTION_PRECONDITION_FAILED' });
    expect(atSend('motion.home', 'motion')).toBeUndefined();
    expect(atSend('motion.home', 'motion', printing)).toMatchObject({ code: 'MACHINE_ACTION_RUN_ACTIVE' });
  });
});

describe('machineActionIntent', () => {
  it('addresses the action at the revision, version and run the caller saw', () => {
    const entry: MachineDirectoryEntry = {
      machineId: 'machine-1',
      name: 'Fixture printer',
      providerId: 'fixture-provider',
      descriptor: {
        ...fixtureDescriptor(),
        capabilities: { ...fixtureDescriptor().capabilities, revision: 'revision-1', incarnation: 'incarnation-1' },
      },
      snapshot: { ...printing, operations: [] },
      freshness: 'current',
    };
    const [, pause] = entry.descriptor.capabilities.actions;
    const requestedBy = { kind: 'agent', id: 'agent-1', label: 'Agent' } as const;
    expect(pause && machineActionIntent(entry, pause, { operationId: 'op-1', parameters: {}, requestedBy })).toEqual({
      machineId: 'machine-1',
      componentId: 'controller',
      capabilityRevision: 'revision-1',
      operationId: 'op-1',
      action: 'run.pause',
      version: 1,
      expectedRunId: 'run-1',
      parameters: {},
      requestedBy,
    });
  });
});

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type {
  ComponentObservation,
  MachineArtifactReference,
  MachineCommandReceipt,
  MachineReport,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { slicerTranscoder } from '@taucad/slicer';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import { bambuSubmissionConfiguration } from '#bambu.manifest.js';
import type { BambuModel } from '#bambu.protocol.js';
import { developerModeRemedy } from '#bambu.protocol.js';
import { bambuWireSequenceId } from '#bambu.session.js';
import type { BambuSubmission } from '#bambu.session.js';
import { createBambuSimulator, readBambuSimulatedPlate } from '#bambu.simulator.js';
import type { BambuSimulator, BambuSimulatorFault } from '#bambu.simulator.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */

const { signal } = new AbortController();
// oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- closed static fixture supplies opaque runtime identities.
const artifact = {
  projectId: 'proj_0123456789abcdefghijK',
  path: 'fixture.gcode.3mf',
  digest: `sha256:${'2'.repeat(64)}`,
  length: 4,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
} as MachineArtifactReference;
const configuration: BambuSubmission = {
  amsMapping: [0],
  bedLeveling: true,
  expectedBedType: 'textured-pei',
  operatorConfirmedBedType: 'textured-pei',
  expectedFilamentDiameter: 1.75,
  expectedMaterials: [{ slot: 0, materialId: 'pla' }],
  expectedModel: 'X1C',
  expectedNozzleDiameter: 0.4,
  flowCalibration: true,
  timelapse: false,
};
const encoder = new TextEncoder();
const anyString: unknown = expect.any(String);
const anyNumber: unknown = expect.any(Number);
const digits: unknown = expect.stringMatching(/^\d+$/u);
// Two layers: a 0.2 mm lift and a 100 mm extrusion each, then a half-second dwell.
const plateGcode = [
  'M140 S60',
  'M104 S200',
  'G28',
  'M190 S60',
  'M109 S200',
  'G90',
  'M83',
  'M106 S0',
  ';LAYER_CHANGE',
  'G1 Z0.2 F600',
  'G1 X100 E5 F6000',
  '; CHANGE_LAYER',
  'M106 S255',
  'M106 P2 S128',
  'G1 Z0.4 F600',
  'G1 X0 E5 F6000',
  'G4 P500',
  'M107',
].join('\n');

/** What Bambu Studio records for an X1C 0.4 mm slice on the textured plate with tray 0's white PLA. */
const x1cSlice: Readonly<Record<string, string>> = {
  curr_bed_type: 'Textured PEI Plate',
  filament_colour: '#F2F2F2',
  filament_diameter: '1.75',
  filament_type: 'PLA',
  nozzle_diameter: '0.4',
  printer_model: 'Bambu Lab X1 Carbon',
};
const slices = new Map<string, Uint8Array<ArrayBuffer>>();
/** The host's artifact reader over every container `sliced` made. */
const readSlices: NonNullable<NonNullable<Parameters<typeof createBambuSimulator>[0]>['readArtifact']> =
  async function* ({ artifact: requested }) {
    const bytes = slices.get(requested.digest);
    if (bytes !== undefined) {
      yield bytes;
    }
  };
/**
 * A `.gcode.3mf` whose plate carries these config-block settings, and the reference to it.
 * @param settings - The config block; `x1cSlice` by default.
 * @param used - The 1-based filaments `slice_info.config` lists for the plate; all when omitted.
 */
const sliced = (
  settings: Readonly<Record<string, string>> = x1cSlice,
  used?: readonly number[],
): MachineArtifactReference => {
  const block = Object.entries(settings).map(([key, value]) => `; ${key} = ${value}`);
  const container = zipSync({
    'Metadata/plate_1.gcode': encoder.encode(
      ['; CONFIG_BLOCK_START', ...block, '; CONFIG_BLOCK_END', plateGcode].join('\n'),
    ),
    ...(used === undefined
      ? {}
      : {
          'Metadata/slice_info.config': encoder.encode(
            `<config><plate>${used.map((id) => `<filament id="${String(id)}"/>`).join('')}</plate></config>`,
          ),
        }),
  });
  const digest = `sha256:${createHash('sha256').update(container).digest('hex')}` as MachineArtifactReference['digest'];
  slices.set(digest, Uint8Array.from(container));
  return { ...artifact, digest, length: container.byteLength };
};

/** A clock the test moves by hand, in seconds. */
const manualClock = () => {
  let elapsed = 0;
  return {
    clock: { now: () => new Date(Date.parse('2026-09-14T00:00:00.000Z') + elapsed * 1000).toISOString() },
    advance(seconds: number): void {
      elapsed += seconds;
    },
  };
};

const simulators: BambuSimulator[] = [];
afterEach(async () => {
  await Promise.all(simulators.splice(0).map(async ({ session }) => session.close()));
});

/** Let queued reports and replies reach the session. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const open = async (
  input: Readonly<{
    model?: BambuModel;
    faults?: readonly BambuSimulatorFault[];
    developerMode?: boolean;
    form?: 'a' | 'b' | 'c';
    externalForms?: ReadonlyArray<'a' | 'b' | 'c'>;
    firmware?: string;
    calibrationTable?: boolean;
    readArtifact?: Parameters<typeof createBambuSimulator>[0] extends infer I
      ? I extends { readArtifact?: infer R }
        ? R
        : never
      : never;
  }> = {},
) => {
  const time = manualClock();
  const simulator = await createBambuSimulator({ clock: time.clock, replyWindow: 100, ...input });
  simulators.push(simulator);
  await settle();
  /** Move the printer's clock, let it report and hand back the session's report. */
  const after = async (seconds: number): Promise<MachineReport> => {
    time.advance(seconds);
    simulator.push();
    await settle();
    return simulator.session.getSnapshot({ signal });
  };
  return { simulator, time, after };
};

const actionsOf = (simulator: BambuSimulator) => {
  const { actions } = simulator.session;
  if (actions.type !== 'supported') {
    throw new Error('expected actions');
  }
  return actions;
};

let operations = 0;
/** Apply one action and hand back its receipt and a confirm bound to the same input. */
const act = async (
  simulator: BambuSimulator,
  target: `${string}:${string}`,
  parameters: unknown,
): Promise<Readonly<{ receipt: MachineCommandReceipt; confirm: () => string; operationId: string }>> =>
  applyAction(simulator, target, { parameters });
/** Apply a run control to the run the caller saw. */
const actOnRun = async (
  simulator: BambuSimulator,
  target: `${string}:${string}`,
  { runId, requester = 'user' }: Readonly<{ runId: string; requester?: 'agent' | 'user' }>,
) => applyAction(simulator, target, { parameters: {}, expectedRunId: runId, requester });
const applyAction = async (
  simulator: BambuSimulator,
  target: `${string}:${string}`,
  {
    parameters,
    expectedRunId,
    requester = 'user',
  }: Readonly<{ parameters: unknown; expectedRunId?: string; requester?: 'agent' | 'user' }>,
): Promise<Readonly<{ receipt: MachineCommandReceipt; confirm: () => string; operationId: string }>> => {
  const [componentId = '', action = ''] = target.split(':');
  operations += 1;
  const input = {
    operationId: `op-${String(operations)}`,
    componentId,
    action,
    version: 1,
    expectedRunId: expectedRunId ?? null,
    parameters,
  };
  const actions = actionsOf(simulator);
  const receipt = await actions.apply({ ...input, requestedBy: { kind: requester }, signal });
  await settle();
  return { receipt, confirm: () => actions.confirm(input).status, operationId: input.operationId };
};

/** The last request body the printer received for one command. */
const lastRequest = (simulator: BambuSimulator, command: string): Readonly<Record<string, unknown>> | undefined =>
  simulator
    .requests()
    .map((request) => {
      const root = request as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      return root['print'] ?? root['system'];
    })
    .findLast((body) => body?.['command'] === command);

const component = (report: MachineReport, componentId: string): ComponentObservation | undefined =>
  report.components.find((observation) => observation.componentId === componentId);
const valueOf = (report: MachineReport, componentId: string) => {
  const observation = component(report, componentId);
  return observation?.knowledge === 'known' ? observation.value : undefined;
};
const slots = (report: MachineReport): readonly MaterialSlotSnapshot[] => {
  const value = valueOf(report, 'filament');
  return value?.kind === 'material-system' ? value.slots : [];
};
const slot = (report: MachineReport, slotId: string): MaterialSlotSnapshot | undefined =>
  slots(report).find((candidate) => candidate.slot.slotId === slotId);
const promptIdOf = (awaiting: MachineReport['activities'][number]['awaiting']): string | undefined =>
  awaiting?.kind === 'confirmation' ? awaiting.promptId : undefined;
const a = (index: number) => ({ unitId: 'ams-a', slotId: `a${String(index)}` });
const spool = { unitId: 'external', slotId: 'spool' };

/** Prepare, transfer and start the job; hands back the run id. */
const startJob = async (
  simulator: BambuSimulator,
  runArtifact: MachineArtifactReference = artifact,
  expectedMachineId = 'simulated-x1c',
) => {
  const { jobs } = simulator.session;
  if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
    throw new Error('expected stored jobs');
  }
  const base = {
    operationId: 'job-1',
    expectedMachineId,
    artifact: runArtifact,
    configuration,
    signal,
  };
  const prepared = await jobs.prepare(base);
  if (prepared.status !== 'ready' || prepared.remoteName === undefined) {
    throw new Error(`expected a ready preparation, got ${JSON.stringify(prepared)}`);
  }
  const transfer = await jobs.transfer({
    ...base,
    operationId: 'transfer-1',
    remoteName: prepared.remoteName,
    providerData: prepared.providerData,
  });
  expect(transfer).toMatchObject({ status: 'accepted', transferId: prepared.remoteName });
  const started = await jobs.start({
    ...base,
    operationId: 'start-1',
    remoteName: prepared.remoteName,
    providerData: prepared.providerData,
    ...(transfer.status === 'accepted' && transfer.transferId !== undefined ? { transferId: transfer.transferId } : {}),
  });
  if (started.status !== 'accepted' || started.runId === undefined) {
    throw new Error(`expected an accepted start, got ${JSON.stringify(started)}`);
  }
  await settle();
  return { runId: started.runId, prepared };
};

describe('Simulated X1C plate reading', () => {
  it('should read layer starts, duration, heater set points and fan changes from plate G-code', () => {
    const layerTwo: unknown = expect.closeTo(1.0305, 9);
    const end: unknown = expect.closeTo(2.561, 9);
    expect(readBambuSimulatedPlate(plateGcode)).toEqual({
      layerStarts: [0, layerTwo],
      duration: end,
      nozzleTarget: 200,
      bedTarget: 60,
      fans: {
        part: [
          [0, 0],
          [layerTwo, 100],
          [end, 0],
        ],
        auxiliary: [[layerTwo, 50]],
        chamber: [],
      },
    });
  });

  it.each([';LAYER_CHANGE', '; CHANGE_LAYER', '; LAYER 1 Z0.4'])('should start a layer at the %s marker', (marker) => {
    expect(readBambuSimulatedPlate(`;LAYER_CHANGE\nG1 X10 F600\n${marker}\nG1 X20\n`).layerStarts).toEqual([
      0,
      expect.closeTo(1.0005, 9),
    ]);
  });
});

describe('Simulated X1C report', () => {
  it('should describe itself and report slots, the calibration table and Developer Mode', async () => {
    const { simulator } = await open();
    await expect(simulator.session.getDescriptor({ signal })).resolves.toMatchObject({
      id: 'simulated-x1c',
      vendor: 'Bambu Lab',
      model: 'X1C',
      firmware: 'simulator-2',
    });
    const report = await simulator.session.getSnapshot({ signal });
    expect(report).toMatchObject({ connection: 'connected', state: { status: 'ready' } });
    expect(report.run).toBeUndefined();
    expect(slot(report, 'a1')).toMatchObject({
      state: 'loaded',
      identifiedBy: 'tag',
      material: { materialType: 'PLA', color: '#F2F2F2FF', calibration: { type: 'profile', profileId: '1' } },
      editing: { allowed: false },
    });
    expect(slot(report, 'a2')).toMatchObject({ identifiedBy: 'person', editing: { allowed: true } });
    expect(slot(report, 'a3')).toMatchObject({ identifiedBy: 'unset' });
    expect(slot(report, 'a4')).toMatchObject({ state: 'empty' });
    expect(valueOf(report, 'filament')).toMatchObject({
      calibrations: { revision: '3', rows: [{ profileId: '1', name: 'PLA Basic 0.4' }, { profileId: '2' }] },
      routes: [{ toolheadId: 'tool-0', current: a(1) }],
    });
    expect(valueOf(report, 'bed')).toMatchObject({
      kind: 'readings',
      values: expect.arrayContaining([{ id: 'plate', label: 'Build plate', value: 'textured-pei' }]) as unknown,
    });
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'developer-mode', state: 'passed' }));
    expect(simulator.writes()).toEqual([]);
  });

  it('should make every write unavailable with a person remedy when Developer Mode is off, and send nothing', async () => {
    const { simulator } = await open({ developerMode: false });
    const report = await simulator.session.getSnapshot({ signal });
    expect(report.availability).toContainEqual(
      expect.objectContaining({
        componentId: 'chamber-light',
        code: 'MACHINE_ACTION_UNSUPPORTED',
        remedy: { type: 'person', instruction: developerModeRemedy.instruction },
      }),
    );
    const { receipt } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_UNSUPPORTED' });
    expect(simulator.writes()).toEqual([]);
    simulator.setDeveloperMode(true);
    await settle();
    await expect(act(simulator, 'chamber-light:switch.set', { on: false })).resolves.toMatchObject({
      receipt: { status: 'accepted' },
    });
  });

  it('should learn Developer Mode is off from an A1 mini that refuses a write, as firmware does', async () => {
    const { simulator } = await open({ model: 'A1 mini', developerMode: false });
    const { receipt, confirm } = await act(simulator, 'part-fan:level.set', { ratio: 1 });
    expect(receipt).toMatchObject({ status: 'rejected' });
    expect(confirm()).toBe('refuted');
    const report = await simulator.session.getSnapshot({ signal });
    expect(report.alerts).toContainEqual(
      expect.objectContaining({ code: '0500-0500-0001-0007', blocks: 'everything' }),
    );
    // The next write is refused before sending.
    await act(simulator, 'part-fan:level.set', { ratio: 0 });
    expect(simulator.requests().filter((request) => JSON.stringify(request).includes('gcode_line'))).toHaveLength(1);
  });
});

describe('Simulated X1C accessory actions', () => {
  it('should switch the chamber light with system.ledctrl and confirm from the report', async () => {
    const { simulator } = await open();
    const { receipt, confirm } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'ledctrl')).toEqual({
      command: 'ledctrl',
      sequence_id: digits,
      led_node: 'chamber_light',
      led_mode: 'off',
      led_on_time: 500,
      led_off_time: 500,
      loop_times: 1,
      interval_time: 1000,
    });
    expect(confirm()).toBe('confirmed');
  });

  it('should set a fan with M106 and confirm within one fan step', async () => {
    const { simulator } = await open();
    const { receipt, confirm } = await act(simulator, 'aux-fan:level.set', { ratio: 0.5 });
    expect(receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'gcode_line')).toMatchObject({ param: 'M106 P2 S128 \n' });
    expect(confirm()).toBe('confirmed');
  });

  it('should home and jog with acknowledgement only', async () => {
    const { simulator } = await open();
    await expect(act(simulator, 'motion:motion.home', {})).resolves.toMatchObject({ receipt: { status: 'accepted' } });
    expect(lastRequest(simulator, 'gcode_line')).toMatchObject({ param: 'G28 \n' });
    await expect(act(simulator, 'motion:motion.jog', { axis: 'x', distance: 10, feed: 3000 })).resolves.toMatchObject({
      receipt: { status: 'accepted' },
    });
    expect(lastRequest(simulator, 'gcode_line')?.['param']).toContain('G1 X10.0 F3000');
  });

  it('should dedupe an operation id and refuse it for another action', async () => {
    const { simulator } = await open();
    const actions = actionsOf(simulator);
    const input = {
      operationId: 'same',
      componentId: 'chamber-light',
      action: 'switch.set',
      version: 1,
      expectedRunId: null,
      parameters: { on: true },
      requestedBy: { kind: 'user' },
      signal,
    } as const;
    await actions.apply(input);
    await actions.apply(input);
    expect(simulator.writes().filter((write) => write === 'ledctrl')).toHaveLength(1);
    await expect(actions.apply({ ...input, componentId: 'motion', action: 'motion.home' })).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_OPERATION_ID_CONFLICT',
    });
  });

  it('should accept from the report when the reply is lost, and report unknown when nothing shows it', async () => {
    const { simulator } = await open({ faults: ['reply-lost-after-accept'] });
    const { receipt, confirm } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'accepted' });
    expect(confirm()).toBe('confirmed');
    // Homing confirms by acknowledgement only, so without the reply nothing proves it.
    await expect(act(simulator, 'motion:motion.home', {})).resolves.toMatchObject({
      receipt: { status: 'unknown', reason: 'no-reply' },
    });
  });
});

describe('Simulated X1C jobs and run control', () => {
  it('should upload and start the uploaded plate, then print it layer by layer on the injected clock', async () => {
    const { simulator, after } = await open({ readArtifact: readSlices });
    const { runId } = await startJob(simulator, sliced());
    expect(simulator.writes()).toEqual([expect.stringMatching(/^upload:tau-.*\.gcode\.3mf$/u), 'project_file']);
    expect(lastRequest(simulator, 'project_file')).toMatchObject({
      param: 'Metadata/plate_1.gcode',
      use_ams: true,
      ams_mapping: [0],
      ams_mapping2: [{ ams_id: 0, slot_id: 0 }],
      bed_type: 'auto',
    });
    let report = await simulator.session.getSnapshot({ signal });
    expect(report.run).toMatchObject({ runId, origin: 'tau', delivery: 'stored' });
    report = await after(71.5);
    expect(report.run?.progress.counters).toContainEqual(
      expect.objectContaining({ id: 'layer', current: 2, total: 2 }),
    );
    report = await after(5);
    // A finished printer keeps showing its last run until the next one starts.
    expect(report.run).toMatchObject({ runId, state: 'completed' });
    expect(report.state.status).toBe('ready');
  });

  it('should pause, resume, change speed and cancel the run, each confirmed from the report', async () => {
    const { simulator } = await open();
    const { runId } = await startJob(simulator);
    const pause = await actOnRun(simulator, 'controller:run.pause', { runId });
    expect(lastRequest(simulator, 'pause')).toEqual({ command: 'pause', sequence_id: anyString, param: '' });
    expect(pause.confirm()).toBe('confirmed');
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({ state: { status: 'held' } });
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { paused: { by: 'person' } },
    });
    const resume = await actOnRun(simulator, 'controller:run.resume', { runId });
    expect(resume.confirm()).toBe('confirmed');
    // An agent's pause reads as the agent's, though the printer reports every remote pause alike.
    await actOnRun(simulator, 'controller:run.pause', { runId, requester: 'agent' });
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { paused: { by: 'agent' } },
    });
    await actOnRun(simulator, 'controller:run.resume', { runId });
    const speed = await act(simulator, 'speed:option.set', { option: 'sport' });
    expect(lastRequest(simulator, 'print_speed')).toMatchObject({ param: '3' });
    expect(speed.confirm()).toBe('confirmed');
    await expect(actOnRun(simulator, 'controller:run.pause', { runId: 'another-run' })).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_STALE_RUN' },
    });
    const cancel = await actOnRun(simulator, 'controller:run.cancel', { runId });
    expect(lastRequest(simulator, 'stop')).toMatchObject({ command: 'stop', param: '' });
    expect(cancel.confirm()).toBe('confirmed');
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { runId, state: 'cancelled' },
    });
  });

  it('should not read a later pause as the agent’s when the printer refused the agent’s pause', async () => {
    const { simulator } = await open({ model: 'A1 mini' });
    const { runId } = await startJob(simulator, artifact, 'simulated-a1-mini');
    simulator.setDeveloperMode(false);
    await expect(actOnRun(simulator, 'controller:run.pause', { runId, requester: 'agent' })).resolves.toMatchObject({
      receipt: { status: 'rejected' },
    });
    simulator.setDeveloperMode(true);
    // Paused from another client, as from the screen: the printer reports it like any remote pause.
    const screen = await simulator.connect();
    const { actions } = screen;
    if (actions.type !== 'supported') {
      throw new Error('expected actions');
    }
    await actions.apply({
      operationId: 'screen-pause',
      componentId: 'controller',
      action: 'run.pause',
      version: 1,
      expectedRunId: runId,
      parameters: {},
      requestedBy: { kind: 'user' },
      signal,
    });
    await settle();
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { paused: { by: 'person' } },
    });
    await screen.close();
  });

  it('should stop urgently and reconcile the stop and the start from proof', async () => {
    const { simulator } = await open();
    await startJob(simulator);
    await expect(simulator.session.reconcile({ operationId: 'start-1', kind: 'start', signal })).resolves.toMatchObject(
      {
        status: 'accepted',
      },
    );
    await expect(simulator.session.stop({ operationId: 'stop-1', signal })).resolves.toMatchObject({
      status: 'accepted',
    });
    await settle();
    await expect(simulator.session.reconcile({ operationId: 'stop-1', kind: 'stop', signal })).resolves.toMatchObject({
      status: 'accepted',
    });
    // An X1C ends a stopped print in FAILED with 0500-400E, which reads as a cancelled run.
    const stopped = await simulator.session.getSnapshot({ signal });
    expect(stopped.run).toMatchObject({ state: 'cancelled' });
    expect(stopped.state.status).toBe('ready');
    expect(stopped.alerts).toContainEqual(expect.objectContaining({ code: '0500-400E' }));
  });

  it.each([
    ['storage-full', 'MACHINE_TRANSFER_STORAGE_FULL'],
    ['partial-transfer', 'MACHINE_TRANSFER_PARTIAL'],
  ] as const)('should reject a transfer under %s without starting', async (fault, code) => {
    const { simulator } = await open({ faults: [fault] });
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
      throw new Error('expected stored jobs');
    }
    const base = { operationId: 'job-1', expectedMachineId: 'simulated-x1c', artifact, configuration, signal };
    const prepared = await jobs.prepare(base);
    if (prepared.status === 'refused' || prepared.remoteName === undefined) {
      throw new Error('expected a preparation');
    }
    await expect(
      jobs.transfer({ ...base, remoteName: prepared.remoteName, providerData: prepared.providerData }),
    ).resolves.toMatchObject({ status: 'rejected', code });
    expect(simulator.writes().includes('project_file')).toBe(false);
  });

  it('should refuse a transfer and a start once the session is closed, sending nothing', async () => {
    const { simulator } = await open();
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
      throw new Error('expected stored jobs');
    }
    const base = { operationId: 'job-1', expectedMachineId: 'simulated-x1c', artifact, configuration, signal };
    const prepared = await jobs.prepare(base);
    if (prepared.status === 'refused' || prepared.remoteName === undefined) {
      throw new Error('expected a preparation');
    }
    await simulator.session.close();
    const sent = { ...base, remoteName: prepared.remoteName, providerData: prepared.providerData };
    const unavailable = { status: 'rejected', code: 'MACHINE_UNAVAILABLE' };
    await expect(jobs.transfer({ ...sent, operationId: 'transfer-1' })).resolves.toMatchObject(unavailable);
    await expect(
      jobs.start({ ...sent, operationId: 'start-1', transferId: prepared.remoteName }),
    ).resolves.toMatchObject(unavailable);
    expect(simulator.writes()).toEqual([]);
  });

  it('should block a job whose material does not match the slot', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported') {
      throw new Error('expected jobs');
    }
    // A PETG slice mapped to tray 0's PLA, though the form claims PLA.
    const prepared = await jobs.prepare({
      operationId: 'job-1',
      expectedMachineId: 'simulated-x1c',
      artifact: sliced({ ...x1cSlice, filament_type: 'PETG' }),
      configuration,
      signal,
    });
    expect(prepared).toMatchObject({ status: 'blocked' });
    expect(prepared.status !== 'refused' && prepared.checks.find(({ id }) => id === 'filament')).toMatchObject({
      state: 'blocked',
      detail: 'The slot mapped to the PETG filament holds PLA.',
    });
  });

  it('should isolate a camera failure from machine state', async () => {
    const { simulator } = await open({ faults: ['camera-unavailable'] });
    const capture = simulator.session.stillCapture;
    if (capture.type !== 'supported') {
      throw new Error('expected stills');
    }
    await expect(capture.capture({ signal })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({ connection: 'connected' });
  });

  it.each(['wrong-credential', 'certificate-changed', 'protected-mode', 'timeout'] as const)(
    'should fail to describe itself under %s',
    async (fault) => {
      const { simulator } = await open({ faults: [fault] });
      await expect(simulator.session.getDescriptor({ signal })).rejects.toThrow(/^BAMBU_/u);
    },
  );
});

describe('Simulated X1C filament', () => {
  it('should load an AMS slot through Studio’s steps and confirm once the new filament is in the nozzle', async () => {
    const { simulator, after } = await open();
    const { receipt, confirm } = await act(simulator, 'filament:material.load', { slot: a(2), toolheadId: 'tool-0' });
    expect(receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'ams_change_filament')).toEqual({
      command: 'ams_change_filament',
      sequence_id: anyString,
      curr_temp: anyNumber,
      tar_temp: anyNumber,
      ams_id: 0,
      slot_id: 1,
      target: 1,
    });
    let report = await simulator.session.getSnapshot({ signal });
    const activity = report.activities.find(({ activityId }) => activityId.startsWith('filament-change'));
    expect(activity?.steps.map(({ label }) => label)).toContain('Heat the nozzle');
    expect(confirm()).toBe('pending');
    report = await after(30);
    expect(valueOf(report, 'filament')).toMatchObject({ routes: [{ current: a(2) }] });
    expect(confirm()).toBe('confirmed');
  });

  it('should ask whether the external spool’s filament came out, with a new prompt each time it asks', async () => {
    const { simulator, after } = await open();
    const load = await act(simulator, 'filament:material.load', { slot: spool, toolheadId: 'tool-0' });
    expect(load.receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'ams_change_filament')).toMatchObject({ ams_id: 254, target: 254, slot_id: 0 });
    let report = await after(20);
    const asking = report.activities.find(({ awaiting }) => awaiting !== undefined);
    const first = asking?.awaiting;
    expect(first).toMatchObject({ kind: 'confirmation', answers: [{ id: 'done' }, { id: 'retry' }] });
    const retry = await act(simulator, 'filament:interaction.respond', {
      activityId: asking?.activityId,
      promptId: promptIdOf(first),
      answer: 'retry',
    });
    expect(lastRequest(simulator, 'ams_control')).toMatchObject({ param: 'resume' });
    expect(retry.confirm()).toBe('confirmed');
    await expect(
      act(simulator, 'filament:interaction.respond', {
        activityId: asking?.activityId,
        promptId: promptIdOf(first),
        answer: 'done',
      }),
    ).resolves.toMatchObject({
      receipt: { status: 'rejected', code: expect.stringMatching(/PROMPT_(STALE|CONSUMED)/u) as unknown },
    });
    report = await after(10);
    const again = report.activities.find(({ awaiting }) => awaiting !== undefined);
    expect(promptIdOf(again?.awaiting)).not.toBe(promptIdOf(first));
    await act(simulator, 'filament:interaction.respond', {
      activityId: again?.activityId,
      promptId: promptIdOf(again?.awaiting),
      answer: 'done',
    });
    expect(lastRequest(simulator, 'ams_control')).toMatchObject({ param: 'done' });
    report = await after(10);
    expect(valueOf(report, 'filament')).toMatchObject({ routes: [{ current: spool }] });
    expect(load.confirm()).toBe('confirmed');
  });

  it.each([
    ['b', { ams_id: 255, target: 255, slot_id: 0 }],
    ['c', { curr_temp: -1, tar_temp: -1, ams_id: 255, slot_id: 254, target: 254 }],
  ] as const)('should send the external-spool load in form (%s)', async (form, fields) => {
    const { simulator } = await open({ form });
    await act(simulator, 'filament:material.load', { slot: spool, toolheadId: 'tool-0' });
    expect(lastRequest(simulator, 'ams_change_filament')).toMatchObject(fields);
  });

  it('should abort a filament change and refute the load', async () => {
    const { simulator, after } = await open();
    const load = await act(simulator, 'filament:material.load', { slot: a(2), toolheadId: 'tool-0' });
    await after(1);
    const abort = await act(simulator, 'filament:bambu.filament.abort', {});
    expect(lastRequest(simulator, 'ams_control')).toMatchObject({ param: 'abort' });
    expect(abort.confirm()).toBe('confirmed');
    expect(load.confirm()).toBe('refuted');
  });

  it('should unload, then re-read a tag only with the extruder empty', async () => {
    const { simulator, after } = await open();
    await expect(act(simulator, 'filament:bambu.ams.read-tag', a(2))).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_PRECONDITION_FAILED' },
    });
    const unload = await act(simulator, 'filament:material.unload', { slot: a(1), toolheadId: 'tool-0' });
    expect(lastRequest(simulator, 'ams_change_filament')).toMatchObject({ ams_id: 0, target: 255, slot_id: 255 });
    await after(30);
    expect(unload.confirm()).toBe('confirmed');
    const read = await act(simulator, 'filament:bambu.ams.read-tag', a(2));
    expect(read.receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'gcode_line')).toMatchObject({ param: 'M620 R1\n' });
    expect(read.confirm()).toBe('pending');
    await after(5);
    expect(read.confirm()).toBe('confirmed');
  });

  it('should set and clear a slot’s material, and refuse a tagged slot', async () => {
    const { simulator } = await open();
    const material = {
      materialType: 'PETG',
      color: '#ff8800ff',
      preset: { profileId: 'GFG99', settingId: 'GFSG99' },
      nozzleTemperature: { min: 230, max: 260 },
    };
    const set = await act(simulator, 'filament:material.set', { slot: a(3), material });
    expect(set.receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'ams_filament_setting')).toMatchObject({
      ams_id: 0,
      tray_id: 2,
      slot_id: 2,
      tray_info_idx: 'GFG99',
      setting_id: 'GFSG99',
      tray_type: 'PETG',
      tray_color: 'FF8800FF',
      nozzle_temp_min: 230,
      nozzle_temp_max: 260,
    });
    expect(set.confirm()).toBe('confirmed');
    expect(slot(await simulator.session.getSnapshot({ signal }), 'a3')).toMatchObject({ identifiedBy: 'person' });
    const clear = await act(simulator, 'filament:material.clear', { slot: a(3) });
    expect(lastRequest(simulator, 'ams_filament_setting')).toMatchObject({ tray_color: 'FFFFFF00', tray_type: '' });
    expect(clear.confirm()).toBe('confirmed');
    await expect(act(simulator, 'filament:material.set', { slot: a(1), material })).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_MATERIAL_READ_ONLY' },
    });
  });

  it('should set the external spool with the T6 form the binding names', async () => {
    const { simulator } = await open({ form: 'c' });
    await act(simulator, 'filament:material.set', {
      slot: spool,
      material: {
        materialType: 'PLA',
        color: '#000000FF',
        preset: { profileId: 'GFL99', settingId: '' },
        nozzleTemperature: { min: 190, max: 230 },
      },
    });
    expect(lastRequest(simulator, 'ams_filament_setting')).toMatchObject({ ams_id: 254, tray_id: 254, slot_id: 0 });
  });
});

describe('Simulated X1C calibration', () => {
  it('should run pressure advance, report its result, save it, select it and delete it', async () => {
    const { simulator, after } = await open();
    const run = await act(simulator, 'filament:material.calibration.run', {
      method: 'pressure-advance',
      nozzleId: 'nozzle-0.4',
      slots: [a(1)],
    });
    expect(run.receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'extrusion_cali')).toMatchObject({
      nozzle_diameter: '0.4',
      mode: 0,
      filaments: [
        { ams_id: 0, slot_id: 0, tray_id: 0, filament_id: 'GFA00', setting_id: 'GFSA00', nozzle_id: 'HS00-0.4' },
      ],
    });
    let report = await after(1);
    expect(run.confirm()).toBe('confirmed');
    const calibration = report.activities.find(({ activityId }) => activityId.startsWith('calibration-'));
    expect(calibration).toBeDefined();
    report = await after(130);
    await settle();
    report = await simulator.session.getSnapshot({ signal });
    const finished = report.activities.find(({ activityId }) => activityId === calibration?.activityId);
    expect(finished?.results).toContainEqual(
      expect.objectContaining({
        id: 'result-1',
        value: expect.objectContaining({ unitId: 'ams-a', slotId: 'a1', pressureAdvance: 0.024 }) as unknown,
      }),
    );

    const save = await act(simulator, 'filament:material.calibration.save', {
      source: 'result',
      activityId: calibration?.activityId,
      resultId: 'result-1',
      name: 'PLA measured',
    });
    expect(save.receipt).toMatchObject({ status: 'accepted' });
    expect(lastRequest(simulator, 'extrusion_cali_set')).toMatchObject({
      nozzle_diameter: '0.4',
      filaments: [{ name: 'PLA measured', filament_id: 'GFA00', k_value: '0.024000', tray_id: 0 }],
    });
    await settle();
    expect(save.confirm()).toBe('confirmed');
    report = await simulator.session.getSnapshot({ signal });
    const value = valueOf(report, 'filament');
    const saved =
      value?.kind === 'material-system'
        ? value.calibrations?.rows.find(({ name }) => name === 'PLA measured')
        : undefined;
    expect(saved).toBeDefined();

    const select = await act(simulator, 'filament:material.calibration.select', {
      slot: a(1),
      profileId: saved?.profileId,
    });
    expect(lastRequest(simulator, 'extrusion_cali_sel')).toMatchObject({
      cali_idx: Number(saved?.profileId),
      filament_id: 'GFA00',
      tray_id: 0,
    });
    expect(select.confirm()).toBe('confirmed');

    const remove = await act(simulator, 'filament:material.calibration.delete', { profileId: saved?.profileId });
    expect(lastRequest(simulator, 'extrusion_cali_del')).toMatchObject({ cali_idx: Number(saved?.profileId) });
    await settle();
    expect(remove.confirm()).toBe('confirmed');
  });

  it('should confirm a save from the table even when the printer replies fail', async () => {
    const { simulator } = await open({ faults: ['replies-lie'] });
    const save = await act(simulator, 'filament:material.calibration.save', {
      source: 'manual',
      name: 'PETG hand',
      preset: { profileId: 'GFG99', settingId: 'GFSG99' },
      nozzleId: 'nozzle-0.4',
      pressureAdvance: 0.04,
    });
    expect(save.receipt).toMatchObject({ status: 'accepted' });
    await settle();
    expect(save.confirm()).toBe('confirmed');
  });

  it('should refuse flow ratio on the A1 mini', async () => {
    const { simulator } = await open({ model: 'A1 mini' });
    await expect(
      act(simulator, 'filament:material.calibration.run', {
        method: 'flow-ratio',
        nozzleId: 'nozzle-0.4',
        slots: [a(1)],
      }),
    ).resolves.toMatchObject({ receipt: { status: 'rejected', code: 'MACHINE_ACTION_UNSUPPORTED' } });
  });

  it('should start the printer’s own calibration with the routine bitmask', async () => {
    const { simulator, after } = await open();
    const calibrate = await act(simulator, 'controller:bambu.printer.calibrate', {
      routines: ['bed-levelling', 'vibration'],
    });
    expect(lastRequest(simulator, 'calibration')).toMatchObject({ option: 0b110 });
    await after(1);
    expect(calibrate.confirm()).toBe('confirmed');
  });
});

describe('Simulated X1C admission at the moment of sending', () => {
  it.each([
    ['motion:motion.home', {}],
    ['filament:material.calibration.run', { method: 'pressure-advance', nozzleId: 'nozzle-0.4', slots: [a(1)] }],
    ['controller:bambu.printer.calibrate', { routines: ['bed-levelling'] }],
  ] as const)('should refuse %s during a print and send nothing', async (target, parameters) => {
    const { simulator } = await open();
    await startJob(simulator);
    const before = simulator.writes();
    await expect(act(simulator, target, parameters)).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_RUN_ACTIVE' },
    });
    expect(simulator.writes()).toEqual(before);
  });

  it('should refuse at the moment of sending once the report is older than its group allows', async () => {
    const { simulator, time } = await open();
    const material = {
      materialType: 'PETG',
      color: '#ff8800ff',
      preset: { profileId: 'GFG99', settingId: 'GFSG99' },
      nozzleTemperature: { min: 230, max: 260 },
    };
    // No report for two minutes: setting a slot needs the filament group, good for ninety seconds.
    time.advance(120);
    await expect(act(simulator, 'filament:material.set', { slot: a(3), material })).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_STALE_OBSERVATION' },
    });
    expect(simulator.writes()).toEqual([]);
    simulator.push();
    await settle();
    await expect(act(simulator, 'filament:material.set', { slot: a(3), material })).resolves.toMatchObject({
      receipt: { status: 'accepted' },
    });
  });

  it('should refuse a control the printer does not declare, and anything once the session is closed', async () => {
    const { simulator } = await open({ model: 'A1 mini' });
    await expect(act(simulator, 'chamber-light:switch.set', { on: true })).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_UNDECLARED' },
    });
    await simulator.session.close();
    await expect(act(simulator, 'part-fan:level.set', { ratio: 1 })).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_UNAVAILABLE' },
    });
    expect(simulator.writes()).toEqual([]);
  });

  it('should hide the profiles and refuse to use them on firmware without a pressure-advance table', async () => {
    const { simulator } = await open({ calibrationTable: false });
    const report = await simulator.session.getSnapshot({ signal });
    expect(valueOf(report, 'filament')).not.toHaveProperty('calibrations');
    for (const id of ['material.calibration.select', 'material.calibration.save', 'material.calibration.delete']) {
      expect(report.availability).toContainEqual(
        expect.objectContaining({ componentId: 'filament', id, code: 'MACHINE_ACTION_UNSUPPORTED' }),
      );
    }
    await expect(
      act(simulator, 'filament:material.calibration.select', { slot: a(2), profileId: 'default' }),
    ).resolves.toMatchObject({ receipt: { status: 'rejected', code: 'MACHINE_ACTION_UNSUPPORTED' } });
    expect(simulator.writes()).toEqual([]);
  });

  it('should keep Developer Mode off on an A1 mini until it accepts a command, not until a push lacks the alert', async () => {
    const { simulator } = await open({ model: 'A1 mini', developerMode: false });
    await act(simulator, 'part-fan:level.set', { ratio: 1 });
    // The printer stops raising the alert; it sends no `fun` to say Developer Mode is on.
    simulator.setDeveloperMode(true);
    await settle();
    const report = await simulator.session.getSnapshot({ signal });
    expect(report.alerts).toEqual([]);
    expect(report.availability).toContainEqual(
      expect.objectContaining({ componentId: 'part-fan', id: 'level.set', code: 'MACHINE_ACTION_UNSUPPORTED' }),
    );
    // A new session starts without the refusal.
    const fresh = await simulator.connect();
    await expect(fresh.getSnapshot({ signal })).resolves.toMatchObject({
      checks: expect.arrayContaining([expect.objectContaining({ id: 'developer-mode', state: 'unknown' })]) as unknown,
    });
    await fresh.close();
  });

  it('should move a later operation off a sequence id an earlier one still waits on', async () => {
    const ids = new Map<string, string>();
    let pair: readonly [string, string] | undefined;
    for (let index = 0; pair === undefined; index += 1) {
      const operationId = `collide-${String(index)}`;
      const sequence = bambuWireSequenceId(operationId);
      const other = ids.get(sequence);
      pair = other === undefined ? undefined : [other, operationId];
      ids.set(sequence, operationId);
    }
    const { simulator } = await open({ faults: ['reply-lost-after-accept'] });
    const actions = actionsOf(simulator);
    const send = async (operationId: string, on: boolean) =>
      actions.apply({
        operationId,
        componentId: 'chamber-light',
        action: 'switch.set',
        version: 1,
        expectedRunId: null,
        parameters: { on },
        requestedBy: { kind: 'user' },
        signal,
      });
    await Promise.all([send(pair[0], false), send(pair[1], true)]);
    const sequences = simulator
      .requests()
      .map((request) => (request as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>)['system'])
      .filter((body) => body?.['command'] === 'ledctrl')
      .map((body) => body?.['sequence_id']);
    expect(sequences).toHaveLength(2);
    expect(new Set(sequences).size).toBe(2);
  });
});

describe('Simulated printer reports', () => {
  it('should give a late subscriber a snapshot first, then deltas, and end on abort without throwing', async () => {
    const { simulator, after } = await open();
    await after(1);
    const controller = new AbortController();
    const seen: string[] = [];
    const reading = (async () => {
      for await (const observation of simulator.session.observe({ signal: controller.signal })) {
        seen.push(observation.type);
        if (seen.length === 2) {
          controller.abort();
        }
      }
    })();
    await settle();
    await after(1);
    await expect(reading).resolves.toBeUndefined();
    expect(seen).toEqual(['snapshot', expect.stringMatching(/^(snapshot|changed)$/u)]);
  });

  it('should read proof without sending anything', async () => {
    const { simulator } = await open();
    await startJob(simulator);
    const before = simulator.writes();
    await simulator.session.reconcile({ operationId: 'start-1', kind: 'start', signal });
    await simulator.session.reconcile({ operationId: 'never-sent', kind: 'stop', signal });
    expect(simulator.writes()).toEqual(before);
  });

  it('should mark every qualified action designed on firmware its profile was not proven on', async () => {
    const proven = await open();
    const other = await open({ firmware: 'simulator-1' });
    const qualification = async (simulator: BambuSimulator) => {
      const descriptor = await simulator.session.getDescriptor({ signal });
      return descriptor.capabilities.actions.map((action) => action.qualification);
    };
    const provenQualifications = await qualification(proven.simulator);
    expect(new Set(provenQualifications.map(({ status }) => status))).toEqual(new Set(['qualified']));
    for (const entry of await qualification(other.simulator)) {
      expect(entry).toEqual({
        status: 'designed',
        reason: 'Proven on firmware simulator-2; this printer runs simulator-1.',
      });
    }
  });
});

describe('Simulated printer faults the session must survive', () => {
  it('should keep a confirmation pending while the report lags the reply', async () => {
    const { simulator } = await open({ faults: ['push-lag'] });
    const { receipt, confirm } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'accepted' });
    expect(confirm()).toBe('pending');
    simulator.push();
    await settle();
    expect(confirm()).toBe('confirmed');
  });

  it('should never confirm from a reply alone when the printer acknowledges and ignores', async () => {
    const { simulator } = await open({ faults: ['ack-but-ignore'] });
    const { receipt, confirm } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'accepted' });
    simulator.push();
    await settle();
    expect(confirm()).toBe('pending');
  });

  it('should leave the external spool unchanged when the printer ignores the form sent, and load it when it applies', async () => {
    const ignored = await open({ form: 'b' });
    const load = await act(ignored.simulator, 'filament:material.load', { slot: spool, toolheadId: 'tool-0' });
    const report = await ignored.after(30);
    expect(report.activities).toEqual([]);
    expect(load.confirm()).toBe('pending');

    const applied = await open({ form: 'b', externalForms: ['a', 'b'] });
    await act(applied.simulator, 'filament:material.load', { slot: spool, toolheadId: 'tool-0' });
    const loading = await applied.after(1);
    expect(loading.activities).toContainEqual(expect.objectContaining({ kind: 'material-load' }));
  });

  it('should end a stopped calibration as failed', async () => {
    const { simulator, after } = await open();
    await act(simulator, 'filament:material.calibration.run', {
      method: 'pressure-advance',
      nozzleId: 'nozzle-0.4',
      slots: [a(1)],
    });
    await after(1);
    await simulator.session.stop({ operationId: 'stop-calibration', signal });
    const report = await after(1);
    expect(report.activities).toContainEqual(expect.objectContaining({ kind: 'calibration', state: 'failed' }));
    expect(report.state.status).toBe('ready');
  });
});

describe('Simulated X1C start form', () => {
  /** Complete, validate and prepare a job in the host's order; hands back the form and the blocked checks. */
  const check = async (simulator: BambuSimulator, program: MachineArtifactReference, given: unknown) => {
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.completeConfiguration === undefined) {
      throw new Error('expected a form completion');
    }
    const completed = await jobs.completeConfiguration({
      expectedMachineId: 'simulated-x1c',
      artifact: program,
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- a person's or agent's form is any JSON.
      configuration: given as Parameters<NonNullable<typeof jobs.completeConfiguration>>[0]['configuration'],
      signal,
    });
    const parsed = bambuSubmissionConfiguration.schema.safeParse(completed);
    if (!parsed.success) {
      throw new Error(`expected a valid form, got ${JSON.stringify(completed)}`);
    }
    const prepared = await jobs.prepare({
      operationId: 'check',
      expectedMachineId: 'simulated-x1c',
      artifact: program,
      configuration: parsed.data,
      signal,
    });
    if (prepared.status === 'refused') {
      throw new Error(`expected a preparation, got ${JSON.stringify(prepared)}`);
    }
    return { completed, prepared, blocked: prepared.checks.filter(({ state }) => state === 'blocked') };
  };
  // The person's form as Prepare once filled it from the printer, and the agent's finished program (no form).
  const { operatorConfirmedBedType: _stated, ...personForm } = configuration;
  const paths = [
    ['the person', personForm],
    ['the agent', {}],
  ] as const;

  it('should complete a partial form from the file and the printer, keeping what the caller chose', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    const program = sliced();
    const { completed, blocked } = await check(simulator, program, {});
    expect(completed).toEqual({
      bedLeveling: true,
      flowCalibration: true,
      timelapse: false,
      amsMapping: [0],
      expectedModel: 'X1C',
      expectedNozzleDiameter: 0.4,
      expectedFilamentDiameter: 1.75,
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
    });
    expect(blocked).toEqual([]);
    // A chosen slot wins over the inferred one; what the file was sliced for does not change.
    await expect(check(simulator, program, { amsMapping: [1], timelapse: true })).resolves.toMatchObject({
      completed: { amsMapping: [1], expectedMaterials: [{ slot: 1, materialId: 'PLA' }], timelapse: true },
      blocked: [expect.objectContaining({ id: 'filament', detail: 'The slot mapped to the PLA filament holds PETG.' })],
    });
  });

  it('should pass the model, nozzle, plate and filament checks for a reference-engine slice for the X1C', async () => {
    const quiet = (): void => undefined;
    const services = {
      logger: { log: quiet, debug: quiet, trace: quiet, warn: quiet, error: quiet, custom: quiet },
      tracer: { startSpan: () => ({ end: quiet }) },
      signal,
    };
    const transcoder = await resolveRuntimePluginDefinition('transcoder', slicerTranscoder());
    const result = await transcoder.transcode(
      {
        from: 'glb',
        to: 'gcode.3mf',
        files: [
          {
            name: 'cube.glb',
            // The slicer's own fixture: a 20 mm cube.
            bytes: Uint8Array.from(await readFile(new URL('../../slicer/src/__fixtures__/cube.glb', import.meta.url))),
            mimeType: 'model/gltf-binary',
          },
        ],
        options: { engine: 'reference', filamentType: 'PLA' },
      },
      services,
      await transcoder.initialize({}, services),
    );
    if (!result.success) {
      throw new Error(`expected a slice, got ${JSON.stringify(result.issues)}`);
    }
    const bytes = Uint8Array.from(result.data[0]!.bytes);
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];
    slices.set(digest, bytes);
    const { simulator } = await open({ readArtifact: readSlices });
    const { prepared } = await check(simulator, { ...artifact, digest, length: bytes.byteLength }, {});
    expect(
      prepared.checks
        .filter(({ id }) => ['model', 'nozzle', 'plate', 'filament'].includes(id))
        .map(({ id, state }) => [id, state]),
    ).toEqual([
      ['model', 'passed'],
      ['nozzle', 'passed'],
      ['plate', 'passed'],
      ['filament', 'passed'],
    ]);
  });

  it.each(paths)('should block a file sliced for another printer, nozzle or plate, sent by %s', async (_, form) => {
    const { simulator } = await open({ readArtifact: readSlices });
    const blockedBy = async (settings: Readonly<Record<string, string>>) => {
      const { blocked } = await check(simulator, sliced(settings), form);
      return blocked.map(({ id, detail }) => ({ id, detail }));
    };
    await expect(blockedBy({ ...x1cSlice, printer_model: 'Bambu Lab A1 mini' })).resolves.toEqual([
      { id: 'model', detail: 'The file was sliced for a Bambu Lab A1 mini; this printer is an X1C.' },
    ]);
    await expect(blockedBy({ ...x1cSlice, nozzle_diameter: '0.2' })).resolves.toEqual([
      { id: 'nozzle', detail: 'The file was sliced for a 0.2 mm nozzle; this printer has a 0.4 mm nozzle.' },
    ]);
    await expect(blockedBy({ ...x1cSlice, curr_bed_type: 'Cool Plate' })).resolves.toEqual([
      { id: 'plate', detail: 'Put the Cool Plate the file was sliced for on the printer.' },
    ]);
    // A file that states none of it is blocked on each, with the remedy of slicing it for this printer.
    const silent = await check(simulator, sliced({}), form);
    expect(silent.blocked.map(({ id }) => id)).toEqual(['model', 'nozzle', 'plate', 'filament']);
    expect(silent.blocked[0]).toMatchObject({
      detail: 'The file does not say which printer it was sliced for.',
      remedy: { type: 'person', instruction: 'Slice it in Bambu Studio for this X1C, then send it again.' },
    });
  });

  it('should map each printed filament to a loaded tray of its material, nearest in colour', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    await act(simulator, 'filament:material.set', {
      slot: a(3),
      material: {
        materialType: 'PLA',
        color: '#e01010ff',
        preset: { profileId: 'GFA00', settingId: 'GFSA00' },
        nozzleTemperature: { min: 190, max: 230 },
      },
    });
    const threeFilaments = {
      ...x1cSlice,
      filament_colour: '#FF0000;#1E5AA8;#000000',
      filament_diameter: '1.75,1.75,1.75',
      filament_type: 'PLA;PETG;ABS',
    };
    // The plate prints the red PLA and the PETG; the ABS is the project's, not this plate's.
    await expect(check(simulator, sliced(threeFilaments, [1, 2]), {})).resolves.toMatchObject({
      completed: {
        amsMapping: [2, 1, -1],
        expectedMaterials: [
          { slot: 2, materialId: 'PLA' },
          { slot: 1, materialId: 'PETG' },
        ],
      },
      blocked: [],
    });
    // Printed, the ABS has no tray to come from.
    await expect(check(simulator, sliced(threeFilaments), {})).resolves.toMatchObject({
      completed: { amsMapping: [2, 1, -1] },
      blocked: [
        expect.objectContaining({ id: 'filament', detail: 'Load ABS into a slot and map the filament to it.' }),
      ],
    });
  });

  it('should refuse to complete a form for a file that fails verification, as preparation does', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.completeConfiguration === undefined) {
      throw new Error('expected a form completion');
    }
    // The reader serves nothing for this digest, so the bytes never match it.
    await expect(
      jobs.completeConfiguration({ expectedMachineId: 'simulated-x1c', artifact, configuration: {}, signal }),
    ).rejects.toMatchObject({ code: 'MACHINE_JOB_ARTIFACT_INVALID' });
  });

  it('should keep the plate a person or agent says is installed when the printer reports none', async () => {
    const { simulator } = await open({ readArtifact: readSlices, faults: ['plate-unreported'] });
    const program = sliced();
    await expect(check(simulator, program, { operatorConfirmedBedType: 'textured-pei' })).resolves.toMatchObject({
      completed: { operatorConfirmedBedType: 'textured-pei', expectedBedType: 'textured-pei' },
      blocked: [],
    });
    await expect(check(simulator, program, {})).resolves.toMatchObject({
      blocked: [expect.objectContaining({ id: 'plate', detail: 'Say which plate is on the printer.' })],
    });
  });

  const pla = (color: string) => ({
    materialType: 'PLA',
    color,
    preset: { profileId: 'GFL99', settingId: 'GFSL99' },
    nozzleTemperature: { min: 190, max: 230 },
  });

  it('should map to a loaded AMS tray before the external spool’s remembered setting, unless the spool feeds now', async () => {
    const { simulator, after } = await open({ readArtifact: readSlices });
    await act(simulator, 'filament:material.set', { slot: spool, material: pla('#000000FF') });
    // Tray a1 holds white PLA; the holder only remembers black PLA and cannot report a spool.
    const black = sliced({ ...x1cSlice, filament_colour: '#000000' });
    await expect(check(simulator, black, {})).resolves.toMatchObject({ completed: { amsMapping: [0] } });
    await act(simulator, 'filament:material.load', { slot: spool, toolheadId: 'tool-0' });
    const waiting = await after(20);
    const asking = waiting.activities.find(({ awaiting }) => awaiting !== undefined);
    await act(simulator, 'filament:interaction.respond', {
      activityId: asking?.activityId,
      promptId: promptIdOf(asking?.awaiting),
      answer: 'done',
    });
    expect(valueOf(await after(10), 'filament')).toMatchObject({ routes: [{ current: spool }] });
    await expect(check(simulator, black, {})).resolves.toMatchObject({ completed: { amsMapping: [254] } });
  });

  it('should block a mapping onto a slot that reports no spool, even when the slot still names the material', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    await act(simulator, 'filament:material.set', { slot: a(4), material: pla('#F2F2F2FF') });
    await expect(check(simulator, sliced(), { amsMapping: [3] })).resolves.toMatchObject({
      blocked: [
        expect.objectContaining({
          id: 'filament',
          detail: 'No spool is reported in the slot mapped to the PLA filament.',
        }),
      ],
    });
  });

  it('should say a file states no filament diameter rather than call it a mismatch', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    const { filament_diameter: _diameter, ...unstated } = x1cSlice;
    await expect(check(simulator, sliced(unstated), {})).resolves.toMatchObject({
      blocked: [
        expect.objectContaining({
          id: 'nozzle',
          detail: 'The file does not say which filament diameter it was sliced for.',
        }),
      ],
    });
  });

  it('should keep a hole in a stated mapping where it is', async () => {
    const { simulator } = await open({ readArtifact: readSlices });
    const program = sliced(
      { ...x1cSlice, filament_type: 'PETG;PLA', filament_colour: '#1E5AA8;#F2F2F2', filament_diameter: '1.75,1.75' },
      [2],
    );
    await expect(check(simulator, program, { amsMapping: [null, 0] })).resolves.toMatchObject({
      completed: { amsMapping: [-1, 0] },
      blocked: [],
    });
  });
});

describe('Simulated X1C operations it never sent, stops during filament work and repeated ids', () => {
  it('should leave every confirmation pending for an operation this session never sent', async () => {
    const { simulator } = await open();
    const actions = actionsOf(simulator);
    const never = (target: `${string}:${string}`, parameters: unknown, expectedRunId?: string) => {
      const [componentId = '', action = ''] = target.split(':');
      return actions.confirm({
        operationId: `never-${target}`,
        componentId,
        action,
        version: 1,
        expectedRunId: expectedRunId ?? null,
        parameters,
      });
    };
    // Each of these reads as done or refused from an idle printer's report alone.
    expect(never('controller:run.cancel', {}, 'old-run')).toEqual({ status: 'pending' });
    expect(never('controller:run.pause', {}, 'old-run')).toEqual({ status: 'pending' });
    expect(never('filament:material.load', { slot: a(1), toolheadId: 'tool-0' })).toEqual({ status: 'pending' });
    expect(never('filament:bambu.filament.abort', {})).toEqual({ status: 'pending' });
  });

  it('should stop a filament load with the AMS abort Bambu Studio sends, and accept once the AMS is idle', async () => {
    const { simulator, after } = await open();
    const load = await act(simulator, 'filament:material.load', { slot: a(2), toolheadId: 'tool-0' });
    await after(1);
    await expect(simulator.session.stop({ operationId: 'stop-load', signal })).resolves.toMatchObject({
      status: 'accepted',
    });
    expect(lastRequest(simulator, 'stop')).toBeDefined();
    expect(lastRequest(simulator, 'ams_control')).toMatchObject({ param: 'abort' });
    await after(40);
    expect(load.confirm()).toBe('refuted');
  });

  it('should not call a stop done while a tag read runs on, and reconcile it once the read ends', async () => {
    const { simulator, after } = await open();
    await act(simulator, 'filament:material.unload', { slot: a(1), toolheadId: 'tool-0' });
    await after(30);
    await act(simulator, 'filament:bambu.ams.read-tag', a(2));
    const reconcile = async () => simulator.session.reconcile({ operationId: 'stop-read', kind: 'stop', signal });
    await expect(simulator.session.stop({ operationId: 'stop-read', signal })).resolves.toMatchObject({
      status: 'unknown',
    });
    // A tag read has no abort.
    expect(lastRequest(simulator, 'ams_control')).toBeUndefined();
    await expect(reconcile()).resolves.toMatchObject({ status: 'unknown' });
    await after(5);
    await expect(reconcile()).resolves.toMatchObject({ status: 'accepted' });
  });

  it('should read a later pause as the person’s once an agent’s acknowledged pause never showed', async () => {
    const { simulator, after } = await open({ faults: ['pause-ignored-once'] });
    const { runId } = await startJob(simulator);
    await expect(actOnRun(simulator, 'controller:run.pause', { runId, requester: 'agent' })).resolves.toMatchObject({
      receipt: { status: 'accepted' },
    });
    // The reply window (100 ms here) passes with the run still printing.
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    const printing = await after(1);
    expect(printing.run?.state).not.toBe('paused');
    const screen = await simulator.connect();
    if (screen.actions.type !== 'supported') {
      throw new Error('expected actions');
    }
    await screen.actions.apply({
      operationId: 'screen-pause',
      componentId: 'controller',
      action: 'run.pause',
      version: 1,
      expectedRunId: runId,
      parameters: {},
      requestedBy: { kind: 'user' },
      signal,
    });
    await settle();
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { paused: { by: 'person' } },
    });
    await screen.close();
  });

  it('should send one upload and one start for two calls under one operation id', async () => {
    const { simulator } = await open();
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
      throw new Error('expected stored jobs');
    }
    const base = { operationId: 'job-1', expectedMachineId: 'simulated-x1c', artifact, configuration, signal };
    const prepared = await jobs.prepare(base);
    if (prepared.status !== 'ready' || prepared.remoteName === undefined) {
      throw new Error('expected a ready preparation');
    }
    const { remoteName, providerData } = prepared;
    const transfer = { ...base, operationId: 'transfer-1', remoteName, providerData };
    const transfers = await Promise.all([jobs.transfer(transfer), jobs.transfer(transfer)]);
    expect(transfers).toMatchObject([{ status: 'accepted' }, { status: 'unknown', reason: 'sending' }]);
    const start = { ...base, operationId: 'start-1', remoteName, providerData, transferId: remoteName };
    const starts = await Promise.all([jobs.start(start), jobs.start(start)]);
    expect(starts).toMatchObject([{ status: 'accepted' }, { status: 'unknown', reason: 'sending' }]);
    expect(simulator.writes().filter((write) => write.startsWith('upload:') || write === 'project_file')).toEqual([
      `upload:${remoteName}`,
      'project_file',
    ]);
    // Once settled, the id hands back its receipt; under another kind it is a conflict.
    await expect(jobs.start(start)).resolves.toEqual(starts[0]);
    await expect(jobs.transfer({ ...transfer, operationId: 'start-1' })).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_OPERATION_ID_CONFLICT',
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */

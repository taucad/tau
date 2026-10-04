import { createHash } from 'node:crypto';

import type {
  ComponentObservation,
  MachineArtifactReference,
  MachineCommandReceipt,
  MachineReport,
  MaterialSlotSnapshot,
} from '@taucad/runtime/machine';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import type { BambuModel } from '#bambu.protocol.js';
import { developerModeRemedy } from '#bambu.protocol.js';
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
const actOnRun = async (simulator: BambuSimulator, target: `${string}:${string}`, runId: string) =>
  applyAction(simulator, target, { parameters: {}, expectedRunId: runId });
const applyAction = async (
  simulator: BambuSimulator,
  target: `${string}:${string}`,
  { parameters, expectedRunId }: Readonly<{ parameters: unknown; expectedRunId?: string }>,
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
  const receipt = await actions.apply({ ...input, signal });
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
const startJob = async (simulator: BambuSimulator, runArtifact: MachineArtifactReference = artifact) => {
  const { jobs } = simulator.session;
  if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
    throw new Error('expected stored jobs');
  }
  const base = {
    operationId: 'job-1',
    expectedMachineId: 'simulated-x1c',
    artifact: runArtifact,
    configuration,
    signal,
  };
  const prepared = await jobs.prepare(base);
  if (prepared.status !== 'ready') {
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
      signal,
    };
    await actions.apply(input);
    await actions.apply(input);
    expect(simulator.writes().filter((write) => write === 'ledctrl')).toHaveLength(1);
    await expect(actions.apply({ ...input, componentId: 'motion', action: 'motion.home' })).resolves.toMatchObject({
      status: 'rejected',
      code: 'MACHINE_OPERATION_ID_CONFLICT',
    });
  });

  it('should report unknown when the reply is lost, and still confirm from the report', async () => {
    const { simulator } = await open({ faults: ['reply-lost-after-accept'] });
    const { receipt, confirm } = await act(simulator, 'chamber-light:switch.set', { on: false });
    expect(receipt).toMatchObject({ status: 'unknown', reason: 'no-reply' });
    expect(confirm()).toBe('confirmed');
  });
});

describe('Simulated X1C jobs and run control', () => {
  it('should upload and start the uploaded plate, then print it layer by layer on the injected clock', async () => {
    const container = zipSync({ 'Metadata/plate_1.gcode': encoder.encode(plateGcode) });
    const containerArtifact: MachineArtifactReference = {
      ...artifact,
      digest: `sha256:${createHash('sha256').update(container).digest('hex')}` as MachineArtifactReference['digest'],
      length: container.byteLength,
    };
    const { simulator, after } = await open({
      async *readArtifact() {
        yield Uint8Array.from(container);
      },
    });
    const { runId } = await startJob(simulator, containerArtifact);
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
    const pause = await actOnRun(simulator, 'controller:run.pause', runId);
    expect(lastRequest(simulator, 'pause')).toEqual({ command: 'pause', sequence_id: anyString, param: '' });
    expect(pause.confirm()).toBe('confirmed');
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({ state: { status: 'held' } });
    const resume = await actOnRun(simulator, 'controller:run.resume', runId);
    expect(resume.confirm()).toBe('confirmed');
    const speed = await act(simulator, 'speed:option.set', { option: 'sport' });
    expect(lastRequest(simulator, 'print_speed')).toMatchObject({ param: '3' });
    expect(speed.confirm()).toBe('confirmed');
    await expect(actOnRun(simulator, 'controller:run.pause', 'another-run')).resolves.toMatchObject({
      receipt: { status: 'rejected', code: 'MACHINE_ACTION_STALE_RUN' },
    });
    const cancel = await actOnRun(simulator, 'controller:run.cancel', runId);
    expect(lastRequest(simulator, 'stop')).toMatchObject({ command: 'stop', param: '' });
    expect(cancel.confirm()).toBe('confirmed');
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
    const stopped = await simulator.session.getSnapshot({ signal });
    expect(stopped.run).toBeUndefined();
  });

  it.each([
    ['storage-full', 'STORAGE_FULL'],
    ['partial-transfer', 'TRANSFER_PARTIAL'],
  ] as const)('should reject a transfer under %s without starting', async (fault, code) => {
    const { simulator } = await open({ faults: [fault] });
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
      throw new Error('expected stored jobs');
    }
    const base = { operationId: 'job-1', expectedMachineId: 'simulated-x1c', artifact, configuration, signal };
    const prepared = await jobs.prepare(base);
    if (prepared.status === 'refused') {
      throw new Error('expected a preparation');
    }
    await expect(
      jobs.transfer({ ...base, remoteName: prepared.remoteName, providerData: prepared.providerData }),
    ).resolves.toMatchObject({ status: 'rejected', code });
    expect(simulator.writes().includes('project_file')).toBe(false);
  });

  it('should block a job whose material does not match the slot', async () => {
    const { simulator } = await open();
    const { jobs } = simulator.session;
    if (jobs.type !== 'supported') {
      throw new Error('expected jobs');
    }
    const prepared = await jobs.prepare({
      operationId: 'job-1',
      expectedMachineId: 'simulated-x1c',
      artifact,
      configuration: { ...configuration, expectedMaterials: [{ slot: 0, materialId: 'petg' }] },
      signal,
    });
    expect(prepared).toMatchObject({ status: 'blocked' });
    expect(prepared.status !== 'refused' && prepared.checks.find(({ id }) => id === 'filament')).toMatchObject({
      state: 'blocked',
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
      filaments: [{ name: 'PLA measured', filament_id: 'GFA00', k_value: '0.024', tray_id: 0 }],
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

/* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */

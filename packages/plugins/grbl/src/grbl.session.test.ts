import { setTimeout as sleep } from 'node:timers/promises';

import { componentValue, machineManifestOf } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineCommandReceipt,
  MachineNetworkStream,
  MachineObservation,
  MachineProviderHold,
  MachineReport,
  MachineSession,
} from '@taucad/runtime/machine';
import { afterEach, describe, expect, it } from 'vitest';

import { grblSubmissionConfiguration } from '#grbl.machine.js';
import { grblSimulationProfile, grblSimulatorLid, longMillManifest } from '#grbl.manifest.js';
import { openGrblSession } from '#grbl.session.js';
import type { GrblController, GrblSubmission } from '#grbl.session.js';
import { VirtualGrbl, createVirtualGrblStream, grblDemoProgram } from '#grbl.simulator.js';
import type { VirtualGrblOptions } from '#grbl.simulator.js';

const qualification = { status: 'qualified', profileId: grblSimulationProfile.id } as const;
const manifest = machineManifestOf(
  longMillManifest(qualification, [grblSimulatorLid(qualification)]),
  grblSubmissionConfiguration.manifest,
);
const encoder = new TextEncoder();
const submission: GrblSubmission = { workOffset: 'G54', toolChange: 'pause' };

const artifact = (path: string): MachineArtifactReference =>
  // SAFETY: the reader in these tests never inspects the digest; it serves the program text it closes over.
  ({
    projectId: 'proj_000000000000000000000',
    path,
    digest: 'sha256:0',
    length: 0,
    mediaType: 'text/x.gcode',
    contract: { id: 'tau.toolpath.gcode', version: 1 },
    selectedMember: path,
  }) as unknown as MachineArtifactReference;

type Connected = Readonly<{
  machine: VirtualGrbl;
  /** The serial line; closing it is the cable coming out. */
  stream: MachineNetworkStream;
  session: MachineSession<GrblSubmission>;
  controller: GrblController;
  report: () => Promise<MachineReport>;
  /** Apply `componentId:action`, in the run when one is named, as a person unless an agent is named. */
  act: (
    target: string,
    parameters?: unknown,
    context?: Readonly<{ runId?: string; requester?: 'user' | 'agent' }>,
  ) => Promise<MachineCommandReceipt>;
  until: (condition: (report: MachineReport) => boolean, waitLimit?: number) => Promise<MachineReport>;
}>;

const open: Connected[] = [];
let operation = 0;

type Setup = Readonly<{
  /** `$` settings the controller holds at power-up, over the simulator's own. */
  settings?: Readonly<Record<number, number>>;
  /** The host clock; the wall clock by default. */
  now?: () => string;
}>;

const connect = async (program = '', options: VirtualGrblOptions = {}, setup: Setup = {}): Promise<Connected> => {
  const machine = new VirtualGrbl({ speed: 100, tick: 5, homingSwitches: true, ...options });
  for (const [id, value] of Object.entries(setup.settings ?? {})) {
    machine.settings.set(Number(id), value);
  }
  const stream = createVirtualGrblStream(machine);
  const session = await openGrblSession({
    stream,
    runtime: {
      clock: { now: setup.now ?? (() => new Date().toISOString()) },
      log: async () => undefined,
      async *readArtifact() {
        yield encoder.encode(program);
      },
    },
    manifest,
    id: 'grbl-simulator',
    name: 'Simulated LongMill',
    pollInterval: 20,
    lid: (button) => {
      machine.press(button);
    },
    signal: new AbortController().signal,
  });
  const report = async (): Promise<MachineReport> => session.getSnapshot({ signal: new AbortController().signal });
  const connected: Connected = {
    machine,
    stream,
    session,
    controller: session.controller,
    report,
    act: async (target, parameters, context = {}) => {
      operation += 1;
      const [componentId = '', action = ''] = target.split(':');
      return session.controller.apply({
        operationId: `op-${String(operation)}`,
        componentId,
        action,
        version: 1,
        expectedRunId: context.runId ?? null,
        parameters: parameters ?? {},
        requestedBy: { kind: context.requester ?? 'user' },
        signal: new AbortController().signal,
      });
    },
    until: async (condition, waitLimit = 5000) => {
      const deadline = Date.now() + waitLimit;
      for (;;) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each read follows the controller.
        const current = await report();
        if (condition(current)) {
          return current;
        }
        if (Date.now() > deadline) {
          throw new Error(`Timed out; last state ${JSON.stringify({ state: current.state, run: current.run })}`);
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
        await sleep(10);
      }
    },
  };
  open.push(connected);
  return connected;
};

const motionOf = (report: MachineReport) => componentValue(report.components, 'motion', 'motion')!;
type Xyz = Readonly<Record<'x' | 'y' | 'z', number>>;
const machineAt = (report: MachineReport): Xyz => motionOf(report).position.machine as Xyz;
const originOf = (report: MachineReport): Xyz => motionOf(report).workOffset.origin as Xyz;

/** Apply an action and require the controller to take it. */
const accept = async (connected: Connected, target: string, parameters?: unknown): Promise<MachineCommandReceipt> => {
  const receipt = await connected.act(target, parameters);
  expect(receipt.status === 'rejected' ? `${receipt.code}: ${receipt.message}` : receipt.status).toBe('accepted');
  return receipt;
};

const answer = async (connected: Connected, answerId: string): Promise<void> => {
  // A person can answer once the machine allows it: the plate prompt shows while Z is still lifting off the plate.
  const report = await connected.until(
    (current) =>
      current.activities[0]?.awaiting?.kind === 'confirmation' &&
      (current.state.status === 'ready' || current.state.status === 'held'),
  );
  const activity = report.activities[0]!;
  const awaiting = activity.awaiting as Extract<NonNullable<typeof activity.awaiting>, { kind: 'confirmation' }>;
  await accept(connected, 'controller:interaction.respond', {
    activityId: activity.activityId,
    promptId: awaiting.promptId,
    answer: answerId,
  });
};

const home = async (connected: Connected): Promise<void> => {
  const receipt = await accept(connected, 'motion:motion.home');
  expect(receipt.status === 'accepted' ? receipt.activityId : undefined).toMatch(/^homing-/u);
  await connected.until((report) => motionOf(report).trust === 'homed' && report.state.status === 'ready');
};

const jobsOf = (connected: Connected) => {
  if (connected.session.jobs.type !== 'supported') {
    throw new Error('Jobs are unsupported.');
  }
  return connected.session.jobs;
};

const start = async (connected: Connected, path: string): Promise<MachineCommandReceipt> =>
  jobsOf(connected).start({
    operationId: `start-${path}`,
    expectedMachineId: 'grbl-simulator',
    artifact: artifact(path),
    configuration: submission,
    remoteName: path,
    providerData: {},
    signal: new AbortController().signal,
  });

const holdJog = async (connected: Connected, axis: 'y' | 'z' = 'y'): Promise<MachineProviderHold> => {
  const { holds } = connected.session;
  if (holds.type !== 'supported') {
    throw new Error('Holds are unsupported.');
  }
  const hold = await holds.begin({
    operationId: 'hold-1',
    componentId: 'motion',
    hold: 'motion.jog',
    parameters: { axis, direction: 1, feed: 1500 },
    requestedBy: { kind: 'user' },
    signal: new AbortController().signal,
  });
  if (!('extend' in hold)) {
    throw new Error(hold.message);
  }
  return hold;
};

const jogSegments = (connected: Connected): number =>
  connected.machine.lines.filter((line) => line.startsWith('$J=')).length;

afterEach(async () => {
  for (const connected of open.splice(0)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sessions close one at a time.
    await connected.session.close();
  }
});

describe('grbl session against the virtual controller', () => {
  it('starts locked after the port resets the controller, and homing restores trust', async () => {
    const connected = await connect();
    const report = await connected.until((current) => current.state.status === 'alarm');
    expect(motionOf(report).trust).toBe('unknown');
    const homingAlert = report.alerts.find((alert) => alert.code === 'homing-required');
    expect(homingAlert?.remedies).toEqual([
      { type: 'action', componentId: 'motion', action: 'motion.home' },
      { type: 'action', componentId: 'controller', action: 'controller.unlock' },
    ]);
    const descriptor = await connected.session.getDescriptor({ signal: new AbortController().signal });
    expect(descriptor.firmware).toBe('Grbl 1.1h');
    // The session repeats admission when it sends: a move in alarm is refused before any line reaches Grbl.
    expect(await connected.act('motion:motion.move', { frame: 'machine', position: { x: 10 } })).toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_PRECONDITION_FAILED',
    });
    expect(connected.machine.lines.some((line) => line.startsWith('G90G21'))).toBe(false);
    await home(connected);
    // Parameters are parsed with the action's schema, not cast.
    expect(await connected.act('motion:motion.move', { frame: 'tool', position: { x: 10 } })).toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_PARAMETERS_INVALID',
    });
    const homed = await connected.report();
    expect(machineAt(homed)).toEqual({ x: 0, y: 0, z: 0 });
    expect(homed.alerts).toEqual([]);
    expect(homed.activities[0]).toMatchObject({ kind: 'homing', state: 'succeeded' });
  });

  it('zeroes, jogs while held, probes the plate, runs a job started at the machine, holds and stops keeping the position', async () => {
    const cut = Array.from(
      { length: 40 },
      (_, index) => `G1 X${String(10 + (index % 2) * 60)} Y${String(10 + index)} F1500`,
    );
    const connected = await connect(
      ['G21 G90', 'T1 M6', 'S18000 M3', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-1 F600', ...cut, 'G0 Z5', 'M5', 'M30'].join('\n'),
    );
    await home(connected);

    // Go to the stock corner and zero X and Y there.
    await accept(connected, 'motion:motion.move', { frame: 'machine', position: { x: 100, y: 120, z: -10 } });
    await connected.until((report) => report.state.status === 'ready' && machineAt(report).x === 100);
    const { revision } = motionOf(await connected.report()).workOffset;
    await accept(connected, 'motion:work-offset.set', { offset: 'G54', position: { x: 0, y: 0 } });
    let report = await connected.until((current) => originOf(current).x === 100);
    expect(motionOf(report).workOffset).toMatchObject({ id: 'G54', origin: { x: 100, y: 120 } });
    expect(motionOf(report).workOffset.revision).not.toBe(revision);
    expect(motionOf(report).position.work).toMatchObject({ x: 0, y: 0 });

    // A held jog: renewals send short segments; when they stop, the machine stops by itself.
    const hold = await holdJog(connected);
    for (let renewal = 0; renewal < 6; renewal += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- renewals arrive one lease apart.
      await sleep(50);
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
      await hold.extend();
    }
    const segments = jogSegments(connected);
    expect(segments).toBeGreaterThan(1);
    // The lease lapses: no further segment is sent and the machine comes to rest within the queued travel.
    report = await connected.until((current) => current.state.status === 'ready');
    const travelled = machineAt(report).y - 120;
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThanOrEqual(segments * (1500 / 60_000) * 75 + 1e-6);
    await sleep(100);
    expect(jogSegments(connected)).toBe(segments);
    const released = await hold.release();
    expect(released.status).toBe('accepted');
    await accept(connected, 'motion:motion.move', { frame: 'work', position: { y: 0 } });

    // Probe Z on the 15 mm plate: its top is 15 mm above the stock top at machine Z −40.
    const probe = await accept(connected, 'touch-plate:probe.run', { cycle: 'z', plateThickness: 15 });
    const probeId = `op-${String(operation)}`;
    expect(probe.status === 'accepted' ? probe.activityId : undefined).toMatch(/^probing-/u);
    await answer(connected, 'continue');
    await answer(connected, 'done');
    report = await connected.until(
      (current) =>
        current.activities[0]?.state === 'succeeded' && current.state.status === 'ready' && originOf(current).z < -1,
    );
    expect(originOf(report).z).toBeCloseTo(-40, 1);
    expect(connected.controller.confirm(probeId)).toEqual({ status: 'confirmed' });

    // The job: checked, loaded under a feed hold, and only Play at the machine starts it.
    const preparation = await jobsOf(connected).prepare({
      operationId: 'prepare-1',
      expectedMachineId: 'grbl-simulator',
      artifact: artifact('jobs/sign.gcode'),
      configuration: submission,
      signal: new AbortController().signal,
    });
    expect(preparation).toMatchObject({
      status: 'ready',
      program: { facts: { process: 'milling', tools: [{ number: 1 }], uses: ['tool-change'] } },
    });
    // A streamed program is never stored on the controller, so it has no name there.
    expect(preparation).not.toHaveProperty('remoteName');
    const before = machineAt(await connected.report());
    expect(await start(connected, 'sign.gcode')).toMatchObject({ status: 'accepted', runId: 'run-start-sign.gcode' });
    report = await connected.until((current) => current.state.status === 'held');
    expect(report.run).toMatchObject({ runId: 'run-start-sign.gcode', state: 'starting', delivery: 'streamed' });
    await sleep(100);
    expect(machineAt(await connected.report())).toEqual(before);
    expect(connected.machine.spindle).toBe(false);

    await accept(connected, 'controller:grbl-simulator.lid.press', { button: 'start' });
    await connected.until((current) => current.run?.state === 'running' && current.state.status === 'active');
    await connected.until(() => connected.machine.spindle);

    // Feed hold from Tau: the router keeps turning in the cut.
    const pause = await connected.act('controller:run.pause', {}, { runId: 'run-start-sign.gcode' });
    expect(pause.status).toBe('accepted');
    report = await connected.until((current) => current.state.native === 'Hold:0');
    expect(report.run).toMatchObject({ state: 'paused', paused: { by: 'person' } });
    expect(connected.machine.spindle).toBe(true);

    // Stop at rest: hold, settle, reset. The position is kept and the relay drops.
    const atRest = machineAt(report);
    const stop = await connected.session.stop({ operationId: 'stop-1', signal: new AbortController().signal });
    expect(stop.status).toBe('accepted');
    report = await connected.until((current) => current.state.status === 'ready');
    expect(report.run).toMatchObject({ state: 'cancelled' });
    expect(motionOf(report).trust).toBe('kept');
    expect(machineAt(report)).toEqual(atRest);
    expect(connected.machine.spindle).toBe(false);
    expect(report.alerts).toEqual([]);
  });

  it('raises a critical alarm on a hard limit and loses the position', async () => {
    const connected = await connect();
    await home(connected);
    // Homed at the X switch: a jog past it trips the limit (soft limits are off, as on a stock LongBoard).
    await accept(connected, 'motion:motion.jog', { axis: 'x', distance: -500, feed: 4000 });
    const report = await connected.until((current) => current.state.status === 'alarm' && current.alerts.length > 0);
    expect(motionOf(report).trust).toBe('lost');
    expect(report.alerts[0]).toMatchObject({
      code: 'ALARM:1',
      severity: 'fatal',
      blocks: 'motion',
      remedies: [
        { type: 'action', componentId: 'motion', action: 'motion.home' },
        { type: 'action', componentId: 'controller', action: 'controller.unlock' },
      ],
    });
  });

  it('pauses a program at its bit change for a person, re-probes, and finishes the run', async () => {
    const connected = await connect(
      ['G21 G90', 'T1 M6', 'G0 Z-5', 'G1 X20 F3000', 'T2 M6', 'G0 Z-5', 'G1 X40 F3000', 'M30'].join('\n'),
      { statusMask: 0 },
    );
    await home(connected);
    await start(connected, 'bits.gcode');
    await connected.until((current) => current.run?.state === 'starting' && current.state.native === 'Hold:0');
    connected.machine.press('start');
    let report = await connected.until((current) => current.run?.paused?.by === 'program');
    expect(report.state).toMatchObject({ status: 'held', reason: 'Tool change: fit bit T2' });
    expect(report.activities[0]).toMatchObject({ kind: 'tool-change', runId: 'run-start-bits.gcode' });
    // Work positions come from WPos and WCO in this mode; machine positions are derived.
    expect(machineAt(report).x).toBeCloseTo(20, 3);
    await answer(connected, 'continue');
    await answer(connected, 'done');
    report = await connected.until((current) => current.run?.state === 'completed', 10_000);
    expect(report.run?.progress).toMatchObject({ fraction: 1 });
    expect(componentValue(report.components, 'tools', 'tools')?.current).toBe(2);
    expect(machineAt(report).x).toBeCloseTo(40, 3);
  });

  it('holds the run when a line is refused, since Grbl would keep running the lines after it', async () => {
    const connected = await connect(['G21 G90', 'G1 X5 F3000', 'G41 D1', 'G1 X10', 'M30'].join('\n'));
    await home(connected);
    await start(connected, 'bad.gcode');
    const report = await connected.until((current) => current.run?.paused?.by === 'machine');
    expect(report.alerts.map((alert) => [alert.code, alert.blocks])).toContainEqual(['error:20', 'run']);
  });

  it('runs the demonstration program end to end without overflowing the serial buffer', async () => {
    const connected = await connect(grblDemoProgram(), { speed: 200 });
    await home(connected);
    await accept(connected, 'motion:motion.move', { frame: 'machine', position: { x: 100, y: 100, z: -20 } });
    await connected.until((report) => report.state.status === 'ready' && machineAt(report).x === 100);
    await accept(connected, 'motion:work-offset.set', { offset: 'G54', position: { x: 0, y: 0, z: 0 } });
    await start(connected, 'demo.gcode');
    await connected.until((current) => current.state.native === 'Hold:0');
    connected.machine.press('start');
    await connected.until((current) => current.run?.paused?.by === 'program', 10_000);
    await answer(connected, 'continue');
    await answer(connected, 'done');
    const report = await connected.until((current) => current.run?.state === 'completed', 20_000);
    expect(connected.machine.droppedBytes).toBe(0);
    const [lines] = report.run?.progress.counters ?? [];
    expect(lines?.current).toBe(lines?.total);
  }, 30_000);

  it('works from the work zero on a stock LongMill without homing switches', async () => {
    const connected = await connect(grblDemoProgram(), { speed: 200, homingSwitches: false });
    let report = await connected.until((current) => current.state.status === 'ready');
    const descriptor = await connected.session.getDescriptor({ signal: new AbortController().signal });
    expect(descriptor.capabilities.actions.map((action) => action.id)).not.toContain('motion.home');
    expect(report.availability.map((entry) => entry.id)).not.toContain('motion.home');
    expect(report.alerts).toEqual([]);
    expect(motionOf(report).trust).toBe('unknown');
    expect(report.checks.find((check) => check.id === 'position')).toMatchObject({ state: 'unknown' });

    // Raise Z clear of the plate with a held jog, then probe the stock top.
    const hold = await holdJog(connected, 'z');
    for (let renewal = 0; renewal < 4; renewal += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- renewals arrive one lease apart.
      await sleep(50);
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
      await hold.extend();
    }
    await hold.release();
    await connected.until((current) => current.state.status === 'ready');
    await accept(connected, 'motion:motion.move', { frame: 'machine', position: { z: 20 } });
    await connected.until((current) => current.state.status === 'ready' && machineAt(current).z === 20);
    await accept(connected, 'touch-plate:probe.run', { cycle: 'z', plateThickness: 15 });
    await answer(connected, 'continue');
    await answer(connected, 'done');
    report = await connected.until(
      (current) =>
        current.activities[0]?.state === 'succeeded' && current.state.status === 'ready' && originOf(current).z < -1,
    );
    // The stock top is 10 mm below where the gantry powered up.
    expect(originOf(report).z).toBeCloseTo(-10, 1);
    await accept(connected, 'motion:work-offset.set', { offset: 'G54', position: { x: 0, y: 0 } });

    const preparation = await jobsOf(connected).prepare({
      operationId: 'prepare-demo',
      expectedMachineId: 'grbl-simulator',
      artifact: artifact('jobs/demo.gcode'),
      configuration: submission,
      signal: new AbortController().signal,
    });
    if (preparation.status !== 'ready') {
      throw new Error(`Not ready: ${preparation.status}`);
    }
    expect(preparation.checks.find((check) => check.id === 'travel')).toMatchObject({ state: 'unknown' });
    expect(
      preparation.checks.some((check) => check.remedy?.type === 'action' && check.remedy.action === 'motion.home'),
    ).toBe(false);
    await start(connected, 'demo.gcode');
    await connected.until((current) => current.state.native === 'Hold:0');
    connected.machine.press('start');
    await connected.until((current) => current.run?.paused?.by === 'program', 10_000);
    await answer(connected, 'continue');
    await answer(connected, 'done');
    report = await connected.until((current) => current.run?.state === 'completed', 20_000);
    expect(motionOf(report).trust).toBe('unknown');
    expect(connected.machine.droppedBytes).toBe(0);
  }, 30_000);
});

describe('grbl session stops, admission and observation', () => {
  it('reads $22 as a bitfield, so a grblHAL controller with homing on offers homing', async () => {
    const connected = await connect('', { homingSwitches: false }, { settings: { 22: 79 } });
    const report = await connected.until((current) => current.state.status === 'alarm');
    const descriptor = await connected.session.getDescriptor({ signal: new AbortController().signal });
    expect(descriptor.capabilities.actions.map((action) => action.id)).toContain('motion.home');
    expect(report.alerts.find((alert) => alert.code === 'homing-required')?.remedies?.[0]).toEqual({
      type: 'action',
      componentId: 'motion',
      action: 'motion.home',
    });
  });

  it('checks moves and programs against the travel the controller reports in $130–$132', async () => {
    const connected = await connect('G90 G0 X450', {}, { settings: { 130: 400 } });
    await home(connected);
    // The installed axes say the same travel the checks enforce.
    const { capabilities } = await connected.session.getDescriptor({ signal: new AbortController().signal });
    expect(capabilities.axes.find(({ id }) => id === 'x')).toMatchObject({ travel: { min: 0, max: 400 } });
    expect(await connected.act('motion:motion.move', { frame: 'machine', position: { x: 450 } })).toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_PRECONDITION_FAILED',
    });
    const preparation = await jobsOf(connected).prepare({
      operationId: 'prepare-travel',
      expectedMachineId: 'grbl-simulator',
      artifact: artifact('jobs/wide.gcode'),
      configuration: submission,
      signal: new AbortController().signal,
    });
    if (preparation.status === 'refused') {
      throw new Error(preparation.message);
    }
    expect(preparation.checks.find((check) => check.id === 'travel')).toMatchObject({ state: 'blocked' });
  });

  it('answers a repeated operation id with its first receipt, sending nothing again', async () => {
    const connected = await connect();
    await home(connected);
    const apply = async () =>
      connected.controller.apply({
        operationId: 'once',
        componentId: 'motion',
        action: 'motion.move',
        version: 1,
        expectedRunId: null,
        parameters: { frame: 'machine', position: { x: 10 } },
        requestedBy: { kind: 'user' },
        signal: new AbortController().signal,
      });
    const first = await apply();
    const sent = connected.machine.lines.length;
    await expect(apply()).resolves.toEqual(first);
    expect(connected.machine.lines).toHaveLength(sent);
  });

  it('leaves an operation it never sent pending, and refuses an answer to a replaced question', async () => {
    const connected = await connect();
    await home(connected);
    expect(connected.controller.confirm('never-sent')).toEqual({ status: 'pending' });
    await accept(connected, 'touch-plate:probe.run', { cycle: 'z', plateThickness: 15 });
    const report = await connected.until((current) => current.activities[0]?.awaiting?.kind === 'confirmation');
    expect(
      await connected.act('controller:interaction.respond', {
        activityId: report.activities[0]?.activityId,
        promptId: 'an-older-question',
        answer: 'continue',
      }),
    ).toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_PROMPT_STALE' });
  });

  it('queues the timed router run whole before M3 answers, then refuses a job without writing a feed hold', async () => {
    const connected = await connect('G0X10\n');
    await home(connected);
    const text = (bytes: readonly number[]): string => new TextDecoder().decode(Uint8Array.from(bytes));
    const received: number[] = [];
    // From M3 on, the controller hears nothing until released: M3 stays unanswered.
    let held: Array<Uint8Array<ArrayBuffer>> | 'released' | undefined;
    const receive = connected.machine.receive.bind(connected.machine);
    connected.machine.receive = (bytes) => {
      received.push(...bytes);
      if (held === undefined && text([...bytes]) === 'M3\n') {
        held = [];
      }
      if (Array.isArray(held)) {
        held.push(bytes);
        return;
      }
      receive(bytes);
    };
    const switching = accept(connected, 'router:spindle.set', { mode: 'clockwise', duration: 60 });
    await sleep(50);
    // The dwell and M5 are already on the line, so the router stops on the controller even if Tau goes away now.
    expect(text(received).replaceAll('?', '')).toMatch(/M3\nG4P60\nM5\n$/u);
    for (const bytes of Array.isArray(held) ? held : []) {
      receive(bytes);
    }
    held = 'released';
    await switching;
    await connected.until(() => connected.machine.spindle);
    // Grbl reports Idle during a dwell.
    const dwelling = await connected.report();
    expect(dwelling.state.status).toBe('ready');
    const preparation = await jobsOf(connected).prepare({
      operationId: 'prepare-timed',
      expectedMachineId: 'grbl-simulator',
      artifact: artifact('jobs/timed.gcode'),
      configuration: submission,
      signal: new AbortController().signal,
    });
    expect(preparation).toMatchObject({ status: 'blocked' });
    expect(await start(connected, 'jobs/timed.gcode')).toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_BUSY',
    });
    // No feed hold: it would suspend the dwell with the router on, and the M5 behind it would wait for Play.
    expect(received).not.toContain(0x21);
    expect(connected.machine.state).toBe('Idle');
    expect(connected.machine.spindle).toBe(true);
  });

  it('confirms an answer once its question is no longer awaited', async () => {
    const connected = await connect();
    await home(connected);
    await accept(connected, 'touch-plate:probe.run', { cycle: 'z', plateThickness: 15 });
    const report = await connected.until((current) => current.activities[0]?.awaiting?.kind === 'confirmation');
    const activity = report.activities[0]!;
    const awaiting = activity.awaiting as Extract<NonNullable<typeof activity.awaiting>, { kind: 'confirmation' }>;
    operation += 1;
    const operationId = `op-${String(operation)}`;
    await connected.controller.apply({
      operationId,
      componentId: 'controller',
      action: 'interaction.respond',
      version: 1,
      expectedRunId: null,
      parameters: { activityId: activity.activityId, promptId: awaiting.promptId, answer: 'cancel' },
      requestedBy: { kind: 'user' },
      signal: new AbortController().signal,
    });
    await connected.until(() => connected.controller.confirm(operationId).status === 'confirmed', 2000);
  });

  it('remembers only the latest 256 operations', async () => {
    const connected = await connect();
    for (let index = 0; index < 300; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- operations are remembered in the order they were applied.
      await connected.controller.apply({
        operationId: `undeclared-${String(index)}`,
        componentId: 'controller',
        action: 'grbl.undeclared',
        version: 1,
        expectedRunId: null,
        parameters: {},
        requestedBy: { kind: 'user' },
        signal: new AbortController().signal,
      });
    }
    expect(connected.controller.receipt('undeclared-0')).toBeUndefined();
    expect(connected.controller.receipt('undeclared-299')).toMatchObject({ status: 'rejected' });
  });

  it('switches a timed router off by hold, settle and reset, keeping the work offset, with nothing queued behind it', async () => {
    const connected = await connect();
    await home(connected);
    await accept(connected, 'motion:motion.move', { frame: 'machine', position: { x: 50 } });
    await connected.until((report) => report.state.status === 'ready' && machineAt(report).x === 50);
    await accept(connected, 'motion:work-offset.select', { offset: 'G55' });
    await connected.until((report) => motionOf(report).workOffset.id === 'G55');
    // A start form left blank runs from the zero the machine uses now; a value given wins.
    const complete = async (configuration: Readonly<Record<string, string>>): Promise<unknown> =>
      jobsOf(connected).completeConfiguration?.({
        expectedMachineId: 'grbl-simulator',
        artifact: artifact('jobs/any.gcode'),
        configuration,
        signal: new AbortController().signal,
      });
    expect(await complete({})).toEqual({ workOffset: 'G55' });
    expect(await complete({ workOffset: 'G54', toolChange: 'refuse' })).toEqual({
      workOffset: 'G54',
      toolChange: 'refuse',
    });
    await accept(connected, 'router:spindle.set', { mode: 'clockwise', duration: 600 });
    await connected.until(() => connected.machine.spindle);
    // The dwell holds Grbl's line queue: a line sent now would wait behind it, and the reset that ends it would drop it.
    expect(await connected.act('motion:work-offset.set', { offset: 'G55', position: { x: 0 } })).toMatchObject({
      status: 'rejected',
      code: 'MACHINE_ACTION_BUSY',
    });
    await accept(connected, 'router:spindle.set', { mode: 'off' });
    expect(connected.machine.spindle).toBe(false);
    let report = await connected.until((current) => current.state.status === 'ready');
    expect(motionOf(report)).toMatchObject({ trust: 'kept', workOffset: { id: 'G55' } });
    expect(report.alerts).toEqual([]);
    await accept(connected, 'motion:work-offset.set', { offset: 'G55', position: { x: 0 } });
    report = await connected.until((current) => originOf(current).x === 50);
    expect(motionOf(report).workOffset.id).toBe('G55');
  });

  it('stops a moving job by hold, settle and reset: the position is kept and the router stops', async () => {
    let clock = Date.parse('2026-10-09T12:00:00.000Z');
    const cut = Array.from(
      { length: 20 },
      (_, index) => `G1 X${String(10 + (index % 2) * 300)} Y${String(10 + index)}`,
    );
    const connected = await connect(
      ['G21 G90', 'M3 S18000', 'G1 Z-1 F600', 'F300', ...cut, 'M5', 'M30'].join('\n'),
      {},
      {
        now: () => new Date(clock).toISOString(),
      },
    );
    await home(connected);
    await start(connected, 'moving.gcode');
    await connected.until((current) => current.state.native === 'Hold:0');
    connected.machine.press('start');
    let report = await connected.until((current) => current.run?.state === 'running' && current.state.native === 'Run');
    // Elapsed time comes from the host clock, not the wall clock.
    clock += 5000;
    report = await connected.report();
    expect(report.run?.progress.elapsed).toBe(5000);
    await connected.until(() => connected.machine.spindle);
    const stop = await connected.session.stop({ operationId: 'stop-moving', signal: new AbortController().signal });
    expect(stop.status).toBe('accepted');
    report = await connected.until((current) => current.state.status === 'ready');
    expect(report.run).toMatchObject({ state: 'cancelled' });
    expect(motionOf(report).trust).toBe('kept');
    expect(connected.machine.spindle).toBe(false);
    expect(report.alerts).toEqual([]);
    // A reset while moving shifts the gantry from where Grbl believes it is; a settled one does not.
    expect(connected.machine.drift).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reports a feed hold an agent asked for as paused by the agent', async () => {
    const connected = await connect(['G21 G90', 'F100', 'G1 X300', 'G1 X0', 'M30'].join('\n'));
    await home(connected);
    await start(connected, 'agent-pause.gcode');
    await connected.until((report) => report.state.native === 'Hold:0');
    connected.machine.press('start');
    await connected.until((report) => report.run?.state === 'running' && report.state.native === 'Run');
    const pause = await connected.act(
      'controller:run.pause',
      {},
      {
        runId: 'run-start-agent-pause.gcode',
        requester: 'agent',
      },
    );
    expect(pause.status).toBe('accepted');
    const report = await connected.until((current) => current.state.native === 'Hold:0');
    expect(report.run).toMatchObject({ state: 'paused', paused: { by: 'agent' } });
  });

  it('preempts a queued action when it stops', async () => {
    const connected = await connect();
    await home(connected);
    void connected.controller.send('G4P600');
    const queued = connected.act('motion:work-offset.set', { offset: 'G54', position: { x: 0 } });
    await sleep(50);
    expect(
      await connected.session.stop({ operationId: 'stop-queued', signal: new AbortController().signal }),
    ).toMatchObject({
      status: 'accepted',
    });
    expect(await queued).toMatchObject({ status: 'unknown' });
    const report = await connected.until((current) => current.state.status === 'ready');
    expect(originOf(report)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('reports a stop that could not settle as unknown, with the position lost', async () => {
    const connected = await connect();
    await home(connected);
    await accept(connected, 'motion:motion.move', { frame: 'machine', position: { x: 500 }, feed: 200 });
    await connected.until((report) => report.state.native === 'Run');
    // Freeze the controller mid-move: the hold never reaches Hold:0.
    connected.machine.powerOff();
    const stop = await connected.session.stop({ operationId: 'stop-frozen', signal: new AbortController().signal });
    expect(stop.status).toBe('unknown');
    const report = await connected.until((current) => current.alerts.some((alert) => alert.code === 'ALARM:3'));
    expect(motionOf(report).trust).toBe('lost');
  }, 15_000);

  it('refuses a held jog while a job loads, and never queues more travel than the bound', async () => {
    const connected = await connect('G21 G90\nG1 X20 F600\nM30');
    await home(connected);
    const { holds } = connected.session;
    if (holds.type !== 'supported') {
      throw new Error('Holds are unsupported.');
    }
    const startedAt = performance.now();
    const hold = await holdJog(connected);
    for (let renewal = 0; renewal < 5; renewal += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- renewals arrive back to back, faster than the bound allows.
      await hold.extend();
    }
    const elapsed = performance.now() - startedAt;
    // Segments are half the 150 ms bound: back-to-back renewals queue at most two, plus one per segment already run.
    expect(jogSegments(connected)).toBeLessThanOrEqual(2 + Math.floor(elapsed / 75));
    await hold.release();
    await connected.until((report) => report.state.status === 'ready');

    await start(connected, 'short.gcode');
    await connected.until((report) => report.run?.state === 'starting' && report.state.native === 'Hold:0');
    const refused = await holds.begin({
      operationId: 'hold-during-start',
      componentId: 'motion',
      hold: 'motion.jog',
      parameters: { axis: 'y', direction: 1, feed: 1500 },
      requestedBy: { kind: 'user' },
      signal: new AbortController().signal,
    });
    expect('extend' in refused).toBe(false);
  });

  it('marks a streamed run unknown when the link is lost, and still reconciles its start', async () => {
    const connected = await connect(
      ['G21 G90', 'F100', ...Array.from({ length: 20 }, (_, index) => `G1 X${String(index * 20)}`)].join('\n'),
    );
    await home(connected);
    const started = await start(connected, 'unplugged.gcode');
    await connected.until((report) => report.state.native === 'Hold:0');
    connected.machine.press('start');
    await connected.until((report) => report.run?.state === 'running');
    await connected.stream.close();
    const report = await connected.until((current) => current.connection === 'disconnected');
    expect(report.run).toMatchObject({
      state: 'unknown',
      stage: 'The connection was lost while the job was being fed.',
    });
    expect(
      await connected.session.reconcile({
        operationId: 'start-unplugged.gcode',
        kind: 'start',
        signal: new AbortController().signal,
      }),
    ).toEqual(started);
  });

  it('observes a snapshot first, then only the groups that moved, and ends when aborted', async () => {
    const connected = await connect();
    await home(connected);
    const abort = new AbortController();
    const iterator = connected.session.observe({ signal: abort.signal })[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'snapshot' });
    let next = await iterator.next();
    while (next.value?.type !== 'changed') {
      // oxlint-disable-next-line eslint/no-await-in-loop -- observations arrive one report at a time.
      next = await iterator.next();
    }
    const changed: MachineObservation | undefined = next.done === true ? undefined : next.value;
    if (changed?.type !== 'changed') {
      throw new Error('The observation ended before a change.');
    }
    expect(changed.components.map((observation) => observation.group)).toContain('position');
    abort.abort();
    expect(await iterator.next()).toMatchObject({ done: true });
  });
});

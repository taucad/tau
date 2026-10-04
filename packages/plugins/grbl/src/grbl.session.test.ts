import { setTimeout as sleep } from 'node:timers/promises';

import { componentValue, machineManifestOf } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineCommandReceipt,
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
    mediaType: 'text/x-gcode',
    contract: { id: 'tau.toolpath.gcode', version: 1 },
    selectedMember: path,
  }) as unknown as MachineArtifactReference;

type Connected = Readonly<{
  machine: VirtualGrbl;
  session: MachineSession<GrblSubmission>;
  controller: GrblController;
  report: () => Promise<MachineReport>;
  /** Apply `componentId:action`, in the run when one is named. */
  act: (target: string, parameters?: unknown, runId?: string) => Promise<MachineCommandReceipt>;
  until: (condition: (report: MachineReport) => boolean, waitLimit?: number) => Promise<MachineReport>;
}>;

const open: Connected[] = [];
let operation = 0;

const connect = async (program = '', options: VirtualGrblOptions = {}): Promise<Connected> => {
  const machine = new VirtualGrbl({ speed: 20, tick: 5, ...options });
  const session = await openGrblSession({
    stream: createVirtualGrblStream(machine),
    runtime: {
      clock: { now: () => new Date().toISOString() },
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
    session,
    controller: session.controller,
    report,
    act: async (target, parameters, runId) => {
      operation += 1;
      const [componentId = '', action = ''] = target.split(':');
      return session.controller.apply({
        operationId: `op-${String(operation)}`,
        componentId,
        action,
        version: 1,
        expectedRunId: runId ?? null,
        parameters: parameters ?? {},
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
  expect(receipt.status).toBe('accepted');
  return receipt;
};

const answer = async (connected: Connected, answerId: string): Promise<void> => {
  const report = await connected.until((current) => current.activities[0]?.awaiting?.kind === 'confirmation');
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

const holdJog = async (connected: Connected): Promise<MachineProviderHold> => {
  const { holds } = connected.session;
  if (holds.type !== 'supported') {
    throw new Error('Holds are unsupported.');
  }
  const hold = await holds.begin({
    operationId: 'hold-1',
    componentId: 'motion',
    hold: 'motion.jog',
    parameters: { axis: 'y', direction: 1, feed: 1500 },
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
    await home(connected);
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
    const pause = await connected.act('controller:run.pause', {}, 'run-start-sign.gcode');
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
    await connected.until((report) => report.state.status === 'alarm');
    await accept(connected, 'controller:controller.unlock');
    await connected.until((report) => report.state.status === 'ready');
    // The gantry is physically 400 mm from the X switch while Grbl believes it is at zero.
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
});

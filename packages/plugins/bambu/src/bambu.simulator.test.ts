import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import type { HostRouteGrant } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type { NodeMachineHost, NodeMachineRuntime } from '@taucad/runtime/host/node';
import { connectMachineChannel } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineCandidate,
  MachineClient,
  MachineObservation,
  MachineRunSnapshot,
  MachineSnapshot,
} from '@taucad/runtime/machine';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bambuSubmissionConfiguration } from '#bambu.machine.js';
import { bambuX1cManifest } from '#bambu.manifest.js';
import { createBambuSimulator, defineBambuSimulatorMachine, readBambuSimulatedPlate } from '#bambu.simulator.js';
import type { BambuSimulator } from '#bambu.simulator.js';

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
const configuration = {
  amsMapping: [0],
  bedLeveling: true,
  expectedBedType: 'textured-pei',
  expectedFilamentDiameter: 1.75,
  expectedMaterials: [{ slot: 0, materialId: 'pla' }],
  expectedModel: 'X1C',
  expectedNozzleDiameter: 0.4,
  flowCalibration: true,
  timelapse: false,
} as const;
const operationInput = {
  operationId: 'prepared-1',
  expectedMachineId: 'simulated-x1c',
  artifact,
  configuration,
  signal,
} as const;
const agent = { kind: 'agent', id: 'agent-1', label: 'Tau agent' } as const;
const operator = { kind: 'user', id: 'operator', label: 'Operator' } as const;
const grants: readonly HostRouteGrant[] = (
  [
    'discover',
    'beginBinding',
    'list',
    'get',
    'requestPrint',
    'listPrintRequests',
    'watchPrintRequests',
    'resolvePrintRequest',
    'withdrawPrintRequest',
    'controlRun',
    'reconcileOperation',
  ] as const
).map((operation) => ({ route: 'machines', operation: `machines.${operation}` }));

/** The first observation instant every injected clock starts from. */
const start = Date.parse('2026-09-14T00:00:00.000Z');
/** The tightest freshness budget the X1C manifest declares, in milliseconds. */
const freshnessBudget = Math.min(...bambuX1cManifest.observations.map(({ staleAfter }) => staleAfter));
const encoder = new TextEncoder();
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
    clock: { now: () => new Date(start + elapsed * 1000).toISOString() },
    advance(seconds: number): void {
      elapsed += seconds;
    },
  };
};

/** Prepare, upload and start one run as a host would after approval. */
const startRun = async (simulator: BambuSimulator, runArtifact: MachineArtifactReference = artifact): Promise<void> => {
  const prepared = await simulator.session.preparePrint({ ...operationInput, artifact: runArtifact });
  if (prepared.status !== 'ready') {
    throw new Error('expected simulator preparation');
  }
  const transfer = await simulator.session.uploadPrint({
    ...operationInput,
    artifact: runArtifact,
    operationId: 'upload-1',
    remoteName: prepared.remoteName,
    providerData: prepared.providerData,
  });
  if (transfer.status !== 'transferred') {
    throw new Error('expected simulator transfer');
  }
  await expect(
    simulator.session.submit({
      ...operationInput,
      artifact: runArtifact,
      operationId: 'run-1',
      remoteName: prepared.remoteName,
      transferId: transfer.transferId,
      providerData: prepared.providerData,
    }),
  ).resolves.toMatchObject({ status: 'accepted', providerRunId: 'run-1' });
};

const control = async (simulator: BambuSimulator, command: 'cancel' | 'pause' | 'resume' | 'urgent-stop') =>
  simulator.session.control({ command, operationId: `${command}-1`, expectedProviderRunId: 'run-1', signal });

/** Pull the stream's next sample, moving fake time to the simulator's own sample timer as the directory waits. */
const nextObservation = async (observations: AsyncIterator<MachineObservation>): Promise<MachineSnapshot> => {
  const pending = observations.next();
  await vi.advanceTimersToNextTimerAsync();
  const result = await pending;
  if (result.done === true) {
    throw new Error('expected the observation stream to stay open');
  }
  return result.value.snapshot;
};

const withoutObservedAt = ({ observedAt: _observedAt, ...rest }: MachineSnapshot) => rest;

const temporaryDirectories: string[] = [];
const hosts: NodeMachineHost[] = [];
const closers: Array<() => void> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    close();
  }
  await Promise.allSettled(hosts.splice(0).map(async (host) => host.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const simulatorRoot = async (): Promise<string> => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'tau-bambu-simulator-host-'));
  temporaryDirectories.push(storeRoot);
  return storeRoot;
};

/** Open the real Node host over one machine store, with a provider whose every connection is `simulator`. */
const openSimulatorHost = async (
  storeRoot: string,
  simulator: BambuSimulator,
  onError: (error: unknown) => void = vi.fn(),
) => {
  const clock = { now: () => new Date().toISOString() };
  const runtime: NodeMachineRuntime = {
    discovery: {
      clock,
      async *listenDatagrams() {
        yield* [];
      },
    },
    connection: () => ({
      clock,
      log: async () => undefined,
      connectStream: async () => {
        throw new Error('The simulator never opens sockets.');
      },
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: async () => 'unused',
    }),
  };
  const admission = createHostAdmissionAuthority({ hostId: 'host' });
  const host = await createNodeMachineHost({
    storeRoot,
    hostId: 'host',
    authorityId: 'authority',
    admission,
    providers: [defineBambuSimulatorMachine({ simulator })()],
    runtime,
    onError,
  });
  hosts.push(host);
  return { admission, host };
};

/** Bind one simulator through the real Node host and hand back its admitted client. */
const bindSimulator = async (simulator: BambuSimulator, storeRoot?: string): Promise<MachineClient> => {
  const { host } = await openSimulatorHost(storeRoot ?? (await simulatorRoot()), simulator);
  const session = host.issueSession({ actor: { kind: 'user', id: 'operator' }, grants });
  const ports = new MessageChannel();
  const server = host.serve({ port: ports.port1, session });
  const client = connectMachineChannel(ports.port2);
  closers.push(() => {
    client.close();
    server.dispose();
  });
  await client.ready;
  let candidate: MachineCandidate | undefined;
  for await (const event of client.discover({ providerId: 'bambu-simulator', configuration: { logicalId: 'sim' } })) {
    if (event.type !== 'lost') {
      candidate = event.candidate;
    }
  }
  if (!candidate) {
    throw new Error('expected one simulated candidate');
  }
  const ceremony = await client.beginBinding({ candidate, name: 'simulated-x1c' });
  if (ceremony.status !== 'operator-action-required') {
    throw new Error('expected a binding ceremony');
  }
  await expect(
    host.completeBinding({ ceremonyId: ceremony.ceremonyId, secretRef: 'simulator', serviceTrust: {} }),
  ).resolves.toEqual({ status: 'bound', machineId: 'simulated-x1c' });
  await vi.waitFor(async () => {
    await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
      freshness: 'current',
      snapshot: { connection: 'connected', readiness: 'idle' },
    });
  });
  return client;
};

describe('Bambu simulator fault matrix', () => {
  it('should report the same storage error as the real decoder without a physical write', async () => {
    const simulator = createBambuSimulator({ faults: ['storage-damaged'] });
    const snapshot = await simulator.session.getSnapshot({ signal });
    expect(snapshot.alerts).toEqual([
      {
        code: '0500-402F',
        message:
          'The microSD card has damaged sector data. Back up readable files, then repair or format the card. Replace it if the printer still cannot read it.',
      },
    ]);
    expect(simulator.writes()).toEqual([]);
  });

  it.each([
    ['certificate-changed', 'BAMBU_CERTIFICATE_CHANGED'],
    ['wrong-credential', 'BAMBU_AUTHENTICATION'],
    ['protected-mode', 'BAMBU_PROTECTED_MODE'],
    ['timeout', 'BAMBU_TIMEOUT'],
  ] as const)('should refuse the %s handshake', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    await expect(simulator.session.getDescriptor({ signal })).rejects.toThrow(code);
  });

  it('should prepare without writing anything to the device', async () => {
    const simulator = createBambuSimulator();
    await expect(simulator.session.preparePrint(operationInput)).resolves.toMatchObject({
      status: 'ready',
      remoteName: 'tau-prepared-1.gcode.3mf',
      digest: artifact.digest,
      length: artifact.length,
    });
    expect(simulator.writes()).toEqual([]);
    expect(simulator.uploadedNames()).toEqual([]);
  });

  it.each([
    ['storage-full', 'STORAGE_FULL'],
    ['partial-transfer', 'TRANSFER_PARTIAL'],
  ] as const)('should fail closed on %s without retaining an uploaded name', async (fault, code) => {
    const simulator = createBambuSimulator({ faults: [fault] });
    const prepared = await simulator.session.preparePrint(operationInput);
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    const receipt = await simulator.session.uploadPrint({
      ...operationInput,
      operationId: 'upload-1',
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    expect(receipt).toMatchObject({ status: 'rejected', code });
    expect(simulator.uploadedNames()).toEqual([]);
    expect(simulator.writes()).toEqual([]);
  });

  it('should refuse a start whose transfer never happened', async () => {
    const simulator = createBambuSimulator();
    await expect(
      simulator.session.submit({
        ...operationInput,
        operationId: 'start-1',
        remoteName: 'tau-prepared-1.gcode.3mf',
        transferId: 'tau-prepared-1.gcode.3mf',
        providerData: { memberMd5: '00000000000000000000000000000000' },
      }),
    ).resolves.toMatchObject({ status: 'rejected', code: 'PREPARATION_MISSING' });
    expect(simulator.writes()).toEqual([]);
  });

  it('should never replay a physical write on reconnect or a lost reply', async () => {
    const simulator = createBambuSimulator({
      faults: ['reply-lost-after-accept'],
    });
    const prepared = await simulator.session.preparePrint(operationInput);
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    const transfer = await simulator.session.uploadPrint({
      ...operationInput,
      operationId: 'upload-1',
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    if (transfer.status !== 'transferred') {
      throw new Error('expected simulator transfer');
    }
    const receipt = await simulator.session.submit({
      ...operationInput,
      operationId: 'operation-1',
      remoteName: prepared.remoteName,
      transferId: transfer.transferId,
      providerData: prepared.providerData,
    });
    expect(receipt).toMatchObject({ status: 'unknown' });
    expect(simulator.writes()).toEqual(['upload:tau-prepared-1.gcode.3mf', 'start:operation-1']);
    expect(simulator.uploadedNames()).toEqual(['tau-prepared-1.gcode.3mf']);
    const writes = simulator.writes();
    simulator.reconnect();
    expect(simulator.writes()).toEqual(writes);
    await expect(
      simulator.session.reconcile({ operationId: 'operation-1', command: 'project_file', signal }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('should isolate camera failure from machine state', async () => {
    const simulator = createBambuSimulator({ faults: ['camera-unavailable'] });
    const before = await simulator.session.getSnapshot({ signal });
    const capability = simulator.session.stillCapture;
    if (capability.type !== 'supported') {
      throw new Error('expected simulator camera');
    }
    await expect(capability.capture({ signal })).rejects.toThrow('BAMBU_CAMERA_UNAVAILABLE');
    expect(await simulator.session.getSnapshot({ signal })).toEqual(before);
  });
});

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

describe('Simulated X1C run progression', () => {
  it('should heat before moving, then print layer by layer to a finished idle machine on the injected clock', async () => {
    const time = manualClock();
    const simulator = createBambuSimulator({ clock: time.clock });
    await startRun(simulator);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      readiness: 'busy',
      activeRunId: 'run-1',
      observedAt: '2026-09-14T00:00:00.000Z',
      run: { state: 'preparing', progress: 0, remainingSeconds: 960, stage: 'Heating the bed' },
      temperatures: {
        nozzle: { value: 24.9 },
        nozzleTarget: { value: 220 },
        bed: { value: 24.9 },
        bedTarget: { value: 55 },
      },
      fans: { part: 0, auxiliary: 0, chamber: 0 },
      lights: { chamber: 'on' },
    });
    time.advance(30);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      observedAt: '2026-09-14T00:00:30.000Z',
      run: { state: 'preparing', progress: 0, remainingSeconds: 930 },
      temperatures: { nozzle: { value: 174.9 }, bed: { value: 39.9 }, chamber: { value: 29.9 } },
    });
    time.advance(30);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'printing', progress: 0, currentLayer: 1, totalLayers: 150, remainingSeconds: 900 },
      temperatures: { nozzle: { value: 219.9 }, bed: { value: 54.9 } },
      fans: { part: 0 },
    });
    time.advance(450);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      readiness: 'busy',
      run: { state: 'printing', progress: 50, currentLayer: 76, totalLayers: 150, remainingSeconds: 450 },
      fans: { part: 100 },
    });
    time.advance(450);
    const finished = await simulator.session.getSnapshot({ signal });
    expect(finished).toMatchObject({
      readiness: 'idle',
      run: {
        state: 'succeeded',
        progress: 100,
        currentLayer: 150,
        totalLayers: 150,
        remainingSeconds: 0,
        file: 'tau-prepared-1.gcode.3mf',
      },
      fans: { part: 0, auxiliary: 0, chamber: 0 },
      lights: { chamber: 'off' },
    });
    expect(finished).not.toHaveProperty('activeRunId');
    expect(finished.temperatures).not.toHaveProperty('nozzleTarget');
    time.advance(100);
    // An idle machine reads its settled physics without the running thermistor wobble.
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'succeeded' },
      temperatures: { nozzle: { value: 70 }, bed: { value: 45 } },
    });
    expect(simulator.writes()).toEqual(['upload:tau-prepared-1.gcode.3mf', 'start:run-1']);
  });

  it('should advance progress and layers and count remaining time down monotonically to completion', async () => {
    const time = manualClock();
    const simulator = createBambuSimulator({ clock: time.clock });
    await startRun(simulator);
    const runs: MachineRunSnapshot[] = [];
    for (let second = 0; second <= 1000; second += 10) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each sample reads the machine at one clock instant.
      const { run } = await simulator.session.getSnapshot({ signal });
      runs.push(run ?? { state: 'unknown' });
      time.advance(10);
    }
    const progress = runs.map((run) => run.progress ?? -1);
    const layers = runs.map((run) => run.currentLayer ?? 0);
    const remaining = runs.map((run) => run.remainingSeconds ?? -1);
    expect(progress).toEqual(progress.toSorted((left, right) => left - right));
    expect(layers).toEqual(layers.toSorted((left, right) => left - right));
    expect(remaining).toEqual(remaining.toSorted((left, right) => right - left));
    expect(new Set(runs.map((run) => run.state))).toEqual(new Set(['preparing', 'printing', 'succeeded']));
    expect(runs.at(-1)).toMatchObject({ state: 'succeeded', progress: 100, currentLayer: 150, remainingSeconds: 0 });
  });

  it('should freeze a paused run and continue it from the same point on resume', async () => {
    const time = manualClock();
    const simulator = createBambuSimulator({ clock: time.clock });
    await startRun(simulator);
    time.advance(510);
    await expect(control(simulator, 'pause')).resolves.toMatchObject({ status: 'accepted' });
    const paused = {
      readiness: 'busy',
      activeRunId: 'run-1',
      run: { state: 'paused', progress: 50, currentLayer: 76, remainingSeconds: 450 },
    };
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject(paused);
    time.advance(1000);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject(paused);
    await expect(control(simulator, 'resume')).resolves.toMatchObject({ status: 'accepted' });
    time.advance(225);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'printing', progress: 75, currentLayer: 113, remainingSeconds: 225 },
    });
    time.advance(225);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      readiness: 'idle',
      run: { state: 'succeeded', progress: 100 },
    });
    expect(simulator.writes()).toEqual([
      'upload:tau-prepared-1.gcode.3mf',
      'start:run-1',
      'pause:pause-1',
      'resume:resume-1',
    ]);
  });

  it('should return to idle with the heaters cooling after an urgent stop', async () => {
    const time = manualClock();
    const simulator = createBambuSimulator({ clock: time.clock });
    await startRun(simulator);
    time.advance(510);
    await expect(control(simulator, 'urgent-stop')).resolves.toMatchObject({ status: 'accepted' });
    const stopped = await simulator.session.getSnapshot({ signal });
    expect(stopped).toMatchObject({
      readiness: 'idle',
      run: { state: 'idle' },
      temperatures: { nozzle: { value: 220 }, bed: { value: 55 } },
      fans: { part: 0, auxiliary: 0, chamber: 0 },
      lights: { chamber: 'off' },
    });
    expect(stopped).not.toHaveProperty('activeRunId');
    expect(stopped.temperatures).not.toHaveProperty('bedTarget');
    time.advance(100);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'idle' },
      temperatures: { nozzle: { value: 70 }, bed: { value: 45 } },
    });
    await expect(control(simulator, 'pause')).resolves.toMatchObject({ status: 'rejected', code: 'STALE_RUN' });
    expect(simulator.writes()).toEqual(['upload:tau-prepared-1.gcode.3mf', 'start:run-1', 'urgent-stop:urgent-stop-1']);
  });

  it('should name the run it controlled on every control receipt', async () => {
    const simulator = createBambuSimulator({ clock: manualClock().clock });
    await startRun(simulator);

    await expect(control(simulator, 'pause')).resolves.toMatchObject({ status: 'accepted', providerRunId: 'run-1' });
    await expect(control(simulator, 'resume')).resolves.toMatchObject({ status: 'accepted', providerRunId: 'run-1' });
    await expect(control(simulator, 'urgent-stop')).resolves.toMatchObject({
      status: 'accepted',
      providerRunId: 'run-1',
    });
  });

  it('should describe itself by the model its own submission schema expects, as the LAN provider does', async () => {
    const descriptor = await createBambuSimulator().session.getDescriptor({ signal });

    // A planner copies the reported model into `expectedModel`; the schema pins the normalized code.
    expect(descriptor.model).toBe('X1C');
    expect(bambuSubmissionConfiguration.schema.shape.expectedModel.safeParse(descriptor.model).success).toBe(true);
  });

  it('should declare the demo speed as a titled binding field that starts at real time', () => {
    const { bindingConfiguration } = defineBambuSimulatorMachine()();
    const schema = bindingConfiguration.legacyProjection.inputSchema;

    expect(schema).toHaveProperty('required', ['logicalId']);
    expect(schema).toHaveProperty('properties.speed', {
      type: 'number',
      minimum: 1,
      maximum: 3600,
      default: 1,
      title: 'Demo speed',
      description: 'Simulated seconds per real second, so a long print can be watched in minutes',
    });
  });

  it('should run a demo speed factor as simulated seconds per clock second', async () => {
    const time = manualClock();
    const simulator = createBambuSimulator({ clock: time.clock, speed: 60 });
    await startRun(simulator);
    time.advance(8.5);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      observedAt: '2026-09-14T00:00:08.500Z',
      run: { state: 'printing', progress: 50, currentLayer: 76, remainingSeconds: 450 },
    });
    time.advance(7.5);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      readiness: 'idle',
      run: { state: 'succeeded', progress: 100 },
    });
  });

  it('should run the uploaded plate when the host reads artifacts', async () => {
    const container = zipSync({ 'Metadata/plate_1.gcode': encoder.encode(plateGcode) });
    const containerArtifact: MachineArtifactReference = {
      ...artifact,
      digest: `sha256:${createHash('sha256').update(container).digest('hex')}` as MachineArtifactReference['digest'],
      length: container.byteLength,
    };
    const time = manualClock();
    const simulator = createBambuSimulator({
      clock: time.clock,
      async *readArtifact() {
        yield Uint8Array.from(container);
      },
    });
    await startRun(simulator, containerArtifact);
    // The bed needs 70 s to climb from 25 °C to the plate's 60 °C, then 2.561 s of motion follow.
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'preparing', remainingSeconds: 73 },
      temperatures: { nozzleTarget: { value: 200 }, bedTarget: { value: 60 } },
    });
    time.advance(70);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'printing', currentLayer: 1, totalLayers: 2, remainingSeconds: 3 },
      fans: { part: 0, auxiliary: 0 },
    });
    time.advance(1.5);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      run: { state: 'printing', currentLayer: 2, totalLayers: 2, remainingSeconds: 2 },
      fans: { part: 100, auxiliary: 50 },
    });
    time.advance(2);
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      readiness: 'idle',
      run: { state: 'succeeded', currentLayer: 2, totalLayers: 2 },
    });
  });

  it('should report its loaded spool with a filament profile id', async () => {
    const simulator = createBambuSimulator();
    await expect(simulator.session.getSnapshot({ signal })).resolves.toMatchObject({
      setup: { materials: [{ slot: 0, state: 'loaded', materialId: 'PLA', profileId: 'GFA00' }] },
    });
  });

  it.each([
    ['a Bambu Studio', '; HEADER_BLOCK_START\n; BambuStudio 99.0.0.0\n; HEADER_BLOCK_END\n'],
    ['a reference-engine', '; generated by @taucad/slicer reference engine\n'],
    ['an unnamed', ''],
  ])('should prepare and upload %s archive, unlike a real printer', async (_name, header) => {
    const container = Uint8Array.from(
      zipSync({
        'Metadata/plate_1.gcode': encoder.encode(`${header}${plateGcode}`),
        'Metadata/slice_info.config': encoder.encode(
          '<config><header><header_item key="X-BBL-Client-Type" value="slicer"/></header></config>',
        ),
      }),
    );
    const containerArtifact: MachineArtifactReference = {
      ...artifact,
      digest: `sha256:${createHash('sha256').update(container).digest('hex')}` as MachineArtifactReference['digest'],
      length: container.byteLength,
    };
    const simulator = createBambuSimulator({
      async *readArtifact() {
        yield Uint8Array.from(container);
      },
    });
    const prepared = await simulator.session.preparePrint({ ...operationInput, artifact: containerArtifact });
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    await expect(
      simulator.session.uploadPrint({
        ...operationInput,
        artifact: containerArtifact,
        operationId: 'upload-1',
        remoteName: prepared.remoteName,
        providerData: prepared.providerData,
      }),
    ).resolves.toMatchObject({ status: 'transferred' });
  });

  it('should refuse an upload the host cannot verify without writing to the device', async () => {
    const simulator = createBambuSimulator({
      async *readArtifact() {
        yield Uint8Array.from([1, 2, 3, 4]);
      },
    });
    const prepared = await simulator.session.preparePrint(operationInput);
    if (prepared.status !== 'ready') {
      throw new Error('expected simulator preparation');
    }
    await expect(
      simulator.session.uploadPrint({
        ...operationInput,
        operationId: 'upload-1',
        remoteName: prepared.remoteName,
        providerData: prepared.providerData,
      }),
    ).resolves.toMatchObject({ status: 'rejected', code: 'ARTIFACT_INVALID' });
    expect(simulator.writes()).toEqual([]);
    expect(simulator.uploadedNames()).toEqual([]);
  });

  it('should observe inside the freshness budgets, every sample distinct, while heating, printing, paused and cooling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: start });
    const abort = new AbortController();
    try {
      const simulator = createBambuSimulator({ clock: { now: () => new Date().toISOString() }, speed: 10 });
      await startRun(simulator);
      const observations = simulator.session.observe({ signal: abort.signal })[Symbol.asyncIterator]();
      const samples = [await nextObservation(observations)];
      let hasPaused = false;
      while (samples.filter((sample) => sample.run?.state === 'succeeded').length < 3 && samples.length < 200) {
        const latest = samples.at(-1)?.run;
        if (!hasPaused && latest?.state === 'printing' && (latest.progress ?? 0) >= 50) {
          hasPaused = true;
          // oxlint-disable-next-line eslint/no-await-in-loop -- the pause lands between two samples of the same run.
          await control(simulator, 'pause');
          for (let pausedSample = 0; pausedSample < 3; pausedSample += 1) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- paused samples arrive one at a time.
            samples.push(await nextObservation(observations));
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- the resume lands between two samples of the same run.
          await control(simulator, 'resume');
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- samples arrive one at a time, as the directory reads them.
        samples.push(await nextObservation(observations));
      }
      for (const [index, sample] of samples.entries()) {
        const previous = samples[index - 1];
        if (previous) {
          expect(Date.parse(sample.observedAt) - Date.parse(previous.observedAt)).toBeLessThanOrEqual(freshnessBudget);
          expect(withoutObservedAt(sample)).not.toEqual(withoutObservedAt(previous));
        }
      }
      const states = samples.map((sample) => sample.run?.state);
      expect(new Set(states)).toEqual(new Set(['preparing', 'printing', 'paused', 'succeeded']));
      const pausedProgress = samples
        .filter((sample) => sample.run?.state === 'paused')
        .map((sample) => sample.run?.progress);
      expect(pausedProgress).toHaveLength(3);
      expect(new Set(pausedProgress).size).toBe(1);
      const progress = samples.map((sample) => sample.run?.progress ?? -1);
      expect(progress).toEqual(progress.toSorted((left, right) => left - right));
    } finally {
      abort.abort();
      vi.useRealTimers();
    }
  });
});

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')(
  'Simulated X1C through the Node host',
  () => {
    it('runs request, approval, upload, start, the observed heating run and urgent stop with the exact write sequence', async () => {
      const simulator = createBambuSimulator();
      const client = await bindSimulator(simulator);

      const request = await client.requestPrint({
        requestId: 'request-1',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(request).toMatchObject({
        state: 'awaiting-approval',
        requestedBy: agent,
        summary: { fileName: 'fixture.gcode.3mf' },
        prepared: { machineId: 'simulated-x1c', physicalMachineId: 'simulated-x1c' },
      });
      const remoteName = request.prepared?.remoteName;
      expect(remoteName).toBe(`tau-${request.prepared?.preparedId ?? ''}.gcode.3mf`);
      expect(simulator.writes()).toEqual([]);
      expect(simulator.uploadedNames()).toEqual([]);

      const resolved = await client.resolvePrintRequest({
        requestId: 'request-1',
        decision: 'approve',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-1',
      });
      expect(resolved).toMatchObject({
        state: 'started',
        resolvedBy: operator,
        uploadOperationId: 'upload-1',
        startOperationId: 'start-1',
        transferId: remoteName,
        receipt: { kind: 'start', status: 'accepted', providerRunId: 'start-1' },
      });
      expect(simulator.writes()).toEqual([`upload:${remoteName ?? ''}`, 'start:start-1']);
      expect(simulator.uploadedNames()).toEqual([remoteName]);

      // The fixture simulator keeps its fixed clock, so the run holds at the start of heating.
      await vi.waitFor(async () => {
        await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
          snapshot: {
            readiness: 'busy',
            activeRunId: 'start-1',
            run: { state: 'preparing', progress: 0, remainingSeconds: 960, file: remoteName },
            temperatures: { nozzleTarget: { value: 220 }, bedTarget: { value: 55 } },
            lights: { chamber: 'on' },
          },
        });
      });
      await expect(
        client.controlRun({
          machineId: 'simulated-x1c',
          operationId: 'stop-1',
          command: 'urgent-stop',
          expectedProviderRunId: 'start-1',
        }),
      ).resolves.toMatchObject({ kind: 'urgent-stop', status: 'accepted' });
      expect(simulator.writes()).toEqual([`upload:${remoteName ?? ''}`, 'start:start-1', 'urgent-stop:stop-1']);
      await vi.waitFor(async () => {
        await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
          snapshot: { readiness: 'idle', run: { state: 'idle' }, lights: { chamber: 'off' } },
        });
      });
      await expect(client.listPrintRequests({ machineId: 'simulated-x1c' })).resolves.toMatchObject([
        { requestId: 'request-1', state: 'started' },
      ]);
      await expect(
        client.resolvePrintRequest({ requestId: 'request-1', decision: 'approve', resolvedBy: operator }),
      ).rejects.toThrow('MACHINE_PRINT_REQUEST_NOT_AWAITING');
      expect(simulator.writes()).toHaveLength(3);
    });

    it('keeps the directory observation inside the freshness budgets while the simulated run prints', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: start });
      try {
        const simulator = createBambuSimulator({ clock: { now: () => new Date().toISOString() }, speed: 10 });
        const client = await bindSimulator(simulator);
        await client.requestPrint({
          requestId: 'request-fresh',
          machineId: 'simulated-x1c',
          artifact,
          configuration,
          requestedBy: operator,
        });
        await expect(
          client.resolvePrintRequest({
            requestId: 'request-fresh',
            decision: 'approve',
            resolvedBy: operator,
            uploadOperationId: 'upload-fresh',
            startOperationId: 'start-fresh',
          }),
        ).resolves.toMatchObject({ state: 'started' });
        const runs: MachineRunSnapshot[] = [];
        for (let step = 0; step < 24; step += 1) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- the monitor reads the directory every five seconds.
          await vi.advanceTimersByTimeAsync(5000);
          // oxlint-disable-next-line eslint/no-await-in-loop -- each read follows its own clock step.
          const { snapshot } = await client.get({ machineId: 'simulated-x1c' });
          expect(Date.now() - Date.parse(snapshot.observedAt)).toBeLessThanOrEqual(freshnessBudget);
          runs.push(snapshot.run ?? { state: 'unknown' });
        }
        const progress = runs.map((run) => run.progress ?? -1);
        expect(progress).toEqual(progress.toSorted((left, right) => left - right));
        expect(new Set(runs.map((run) => run.state))).toEqual(new Set(['preparing', 'printing', 'succeeded']));
        expect(runs.at(-1)).toMatchObject({ state: 'succeeded', progress: 100, currentLayer: 150, totalLayers: 150 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('sends nothing to the device before approval (approval-required-not-honored guard)', async () => {
      const simulator = createBambuSimulator({ faults: ['approval-required-not-honored'] });
      const client = await bindSimulator(simulator);

      const request = await client.requestPrint({
        requestId: 'request-guard',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(request.state).toBe('awaiting-approval');
      expect(simulator.writes()).toEqual([]);
      await expect(
        client.resolvePrintRequest({ requestId: 'request-guard', decision: 'deny', resolvedBy: operator }),
      ).resolves.toMatchObject({ state: 'denied', resolvedBy: operator });
      const withdrawn = await client.requestPrint({
        requestId: 'request-withdrawn',
        machineId: 'simulated-x1c',
        artifact,
        configuration,
        requestedBy: agent,
      });
      expect(withdrawn.state).toBe('awaiting-approval');
      await expect(
        client.withdrawPrintRequest({ requestId: 'request-withdrawn', resolvedBy: agent }),
      ).resolves.toMatchObject({ state: 'withdrawn' });
      expect(simulator.writes()).toEqual([]);
      expect(simulator.uploadedNames()).toEqual([]);
      await expect(client.get({ machineId: 'simulated-x1c' })).resolves.toMatchObject({
        snapshot: { readiness: 'idle' },
      });
    });

    it.each([
      ['certificate-changed', 'BAMBU_CERTIFICATE_CHANGED', 0],
      ['timeout', 'BAMBU_TIMEOUT', 1],
    ] as const)(
      'should report a %s handshake at restart as %s and keep %i reconnect pending',
      async (fault, code, reconnects) => {
        const storeRoot = await simulatorRoot();
        await bindSimulator(createBambuSimulator(), storeRoot);
        await hosts.pop()?.close();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
          const onError = vi.fn();
          await openSimulatorHost(storeRoot, createBambuSimulator({ faults: [fault] }), onError);
          expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: code }));
          // A changed certificate needs a new binding; a timeout is retried after 2 s.
          expect(vi.getTimerCount()).toBe(reconnects);
        } finally {
          vi.useRealTimers();
        }
      },
    );
  },
);

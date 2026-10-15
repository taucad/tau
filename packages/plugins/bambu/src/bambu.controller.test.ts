import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { MessageChannel } from 'node:worker_threads';

import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import { connectMachineChannel } from '@taucad/runtime/machine';

import type {
  MachineArtifactReference,
  MachineConnectionRuntime,
  MachineDatagramListenInput,
  MachineNetworkStream,
} from '@taucad/runtime/machine';
import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

import { bambuA1MiniMachine, bambuMachine } from '#bambu.machine.js';
import { bambuA1MiniManifest, bambuServicePort, bambuX1cManifest } from '#bambu.manifest.js';

const report =
  '{"print":{"sequence_id":"8","printer_type":"BL-P001","nozzle_diameter":"0.4","nozzle_temper":215,"nozzle_target_temper":220,"bed_temper":60,"bed_target_temper":65,"gcode_state":"RUNNING","mc_percent":42,"mc_remaining_time":3,"subtask_id":"run-1","subtask_name":"Cube","layer_num":12,"total_layer_num":120,"spd_lvl":2,"spd_mag":100,"stg_cur":1,"hms":[{"attr":201327360,"code":196619}],"cooling_fan_speed":"15","wifi_signal":"-47dBm","sdcard":true,"lights_report":[{"node":"chamber_light","mode":"on"}],"ams":{"tray_exist_bits":"1","tray_now":"0","tray_tar":"0","ams":[{"humidity":"3","temp":"22","tray":[{"tray_type":"PLA","tray_info_idx":"GFA00"},{},{},{}]}]}}}';
const published = vi.hoisted((): string[] => []);
const versionReply = vi.hoisted(() => ({ serial: '00M00A000000001', firmware: '01.08.02.00' }));
// The model and state the mocked printer's status reports; `BL-P001` is the X1C. A non-zero `amsStatus` is reported
// as `ams_status` (main state in bits 8–15).
const statusReply = vi.hoisted(() => ({
  printerType: 'BL-P001',
  externalSpool: false,
  gcodeState: 'RUNNING',
  amsStatus: 0,
}));
// Push the mocked printer's whole status now, as a printer does on its own.
const mockPrinter = vi.hoisted((): { push?: () => void } => ({}));
// A CONNACK return code other than 0 refuses the connection, as MQTT.js reports it.
const connack = vi.hoisted(() => ({ code: 0 }));
const externalSpoolReport =
  '"vt_tray":{"id":"254","tray_type":"PETG","tray_color":"FFFFFFFF","tray_info_idx":"GFG99","remain":0},"ams":{';
// How the mocked printer answers a start: an exact echo, or only its status naming the run by the id or name Tau sent.
const startReply = vi.hoisted((): { mode: 'echo' | 'status-id' | 'status-name' } => ({ mode: 'echo' }));

vi.mock('mqtt', async () => {
  type Listener = (...values: unknown[]) => void;
  class MockMqttClient {
    public connected = false;
    readonly #listeners = new Map<string, Set<Listener>>();

    public constructor(streamBuilder: () => Duplex) {
      const stream = streamBuilder();
      stream.resume();
      // Match MQTT.js packet encoding: cork header and payload until the whole packet is ready.
      stream.cork();
      stream.write(Buffer.from([0x10, 0x02]));
      stream.write(Buffer.from([0x00, 0x00]));
      stream.uncork();
      queueMicrotask(() => {
        if (connack.code !== 0) {
          this.#emit('error', Object.assign(new Error('Connection refused: Not authorized'), { code: connack.code }));
          return;
        }
        this.connected = true;
        this.#emit('connect');
      });
    }

    public on(name: string, listener: Listener): this {
      const listeners = this.#listeners.get(name) ?? new Set();
      listeners.add(listener);
      this.#listeners.set(name, listeners);
      return this;
    }

    public once(name: string, listener: Listener): this {
      const wrapped: Listener = (...values) => {
        this.off(name, wrapped);
        listener(...values);
      };
      return this.on(name, wrapped);
    }

    public off(name: string, listener: Listener): this {
      this.#listeners.get(name)?.delete(listener);
      return this;
    }

    public async subscribeAsync(topic: string): Promise<void> {
      mockPrinter.push = () => {
        this.#emit('message', topic, Buffer.from(this.#status()));
      };
      await Promise.resolve();
    }

    public async publishAsync(topic: string, payload: string): Promise<void> {
      published.push(payload);
      const parsed = JSON.parse(payload) as {
        info?: { command?: string };
        print?: { command?: string; sequence_id?: string; subtask_id?: string; subtask_name?: string };
      };
      if (parsed.print?.command === 'project_file' && startReply.mode !== 'echo') {
        /* eslint-disable @typescript-eslint/naming-convention -- Mocked Bambu wire field names are fixed. */
        const run =
          startReply.mode === 'status-id'
            ? { gcode_state: 'FINISH', subtask_id: parsed.print.subtask_id }
            : { gcode_state: 'RUNNING', subtask_id: '0', subtask_name: parsed.print.subtask_name };
        this.#emit(
          'message',
          topic.replace('/request', '/report'),
          Buffer.from(JSON.stringify({ print: { command: 'push_status', sequence_id: '10', ...run } })),
        );
        /* eslint-enable @typescript-eslint/naming-convention -- Mocked Bambu wire field section ends. */
      } else if (parsed.print?.command) {
        /* eslint-disable @typescript-eslint/naming-convention -- Mocked Bambu wire field names are fixed. */
        this.#emit(
          'message',
          topic.replace('/request', '/report'),
          Buffer.from(
            JSON.stringify({
              print: {
                command: parsed.print.command,
                sequence_id: parsed.print.sequence_id,
                result: 'success',
                subtask_id: 'run-2',
              },
            }),
          ),
        );
        if (parsed.print.command === 'project_file') {
          this.#emit(
            'message',
            topic.replace('/request', '/report'),
            Buffer.from('{"print":{"sequence_id":"9","gcode_state":"FINISH","mc_percent":100,"subtask_id":"run-2"}}'),
          );
        }
        /* eslint-enable @typescript-eslint/naming-convention -- Mocked Bambu wire field section ends. */
      } else if (parsed.info?.command === 'get_version') {
        this.#emit(
          'message',
          topic.replace('/request', '/report'),
          Buffer.from(
            `{"info":{"command":"get_version","sequence_id":"0","module":[{"name":"ota","sw_ver":"${versionReply.firmware}","hw_ver":"OTA","sn":"${versionReply.serial}"}],"result":"success"}}`,
          ),
        );
      } else {
        this.#emit('message', topic.replace('/request', '/report'), Buffer.from(this.#status()));
      }
      await Promise.resolve();
    }

    public async endAsync(): Promise<void> {
      this.connected = false;
      this.#emit('close');
      await Promise.resolve();
    }

    #status(): string {
      return report
        .replace('BL-P001', statusReply.printerType)
        .replace(
          '"gcode_state":"RUNNING"',
          `${statusReply.amsStatus === 0 ? '' : `"ams_status":${String(statusReply.amsStatus)},`}"gcode_state":"${statusReply.gcodeState}"`,
        )
        .replace('"ams":{', statusReply.externalSpool ? externalSpoolReport : '"ams":{');
    }

    #emit(name: string, ...values: unknown[]): void {
      for (const listener of this.#listeners.get(name) ?? []) {
        listener(...values);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- mocked upstream export name.
  return { MqttClient: MockMqttClient };
});

const { connectBambuMachine, discoverBambuMachines } = await import('#bambu.host.js');

type PinnedTrust = Extract<
  NonNullable<Parameters<typeof connectBambuMachine>[0]['connection']['serviceTrust'][string]>,
  { type: 'pinned' }
>;
const pinnedDigest = `sha256:${'1'.repeat(64)}` as PinnedTrust['digest'];
const encoder = new TextEncoder();
const archive = (plate: string, sliceInfo?: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    zipSync({
      'Metadata/plate_1.gcode': encoder.encode(plate),
      ...(sliceInfo === undefined ? {} : { 'Metadata/slice_info.config': encoder.encode(sliceInfo) }),
    }),
  );
// Synthetic stand-ins: the provenance signals each producer writes, with a made-up version, and the facts Bambu
// Studio records for an X1C 0.4 mm slice on the textured plate.
const studio = (filaments: readonly string[]): Uint8Array<ArrayBuffer> =>
  archive(
    '; HEADER_BLOCK_START\n; BambuStudio 99.0.0.0\n; HEADER_BLOCK_END\n; CONFIG_BLOCK_START\n' +
      '; curr_bed_type = Textured PEI Plate\n' +
      `; filament_diameter = ${filaments.map(() => '1.75').join(',')}\n` +
      `; filament_type = ${filaments.join(';')}\n` +
      '; nozzle_diameter = 0.4\n; printer_model = Bambu Lab X1 Carbon\n; CONFIG_BLOCK_END\nG28\n',
    '<config><header><header_item key="X-BBL-Client-Type" value="slicer"/>' +
      '<header_item key="X-BBL-Client-Version" value="99.0.0.0"/></header></config>',
  );
const studioArchive = studio(['PLA']);
const referenceArchive = archive('; generated by @taucad/slicer reference engine\nG28\n');
const unnamedArchive = archive('G28\n');
const artifactOf = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference => ({
  projectId: 'proj_0123456789abcdefghijK',
  path: 'part.gcode.3mf',
  digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'],
  length: bytes.byteLength,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
});
const candidate = {
  id: 'bambu:00M00A000000001',
  name: 'Workshop X1C',
  endpoint: { transport: 'network', address: '192.0.2.10', interface: 'test0' } as const,
  claimedIdentity: { serial: '00M00A000000001', model: 'X1C' },
  observedAt: '2026-09-14T00:00:00.000Z',
  expiresAt: '2026-09-14T00:00:30.000Z',
};

describe('Bambu read-only controller', () => {
  it('should keep secret and trust host-local while reporting X1C status, then prepare, upload and start', async () => {
    published.length = 0;
    versionReply.serial = '00M00A000000001';
    const bytes = studioArchive;
    const artifact = artifactOf(bytes);
    const archives = [studioArchive, referenceArchive, unnamedArchive];
    const configuration = {
      amsMapping: [0],
      bedLeveling: true,
      expectedBedType: 'textured-pei',
      expectedFilamentDiameter: 1.75,
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
      expectedModel: 'X1C',
      expectedNozzleDiameter: 0.4,
      operatorConfirmedBedType: 'textured-pei',
      flowCalibration: true,
      timelapse: false,
    } as const;
    const uploadFile = vi.fn(async () => ({ bytesWritten: bytes.byteLength }));
    const resolveSecret = vi.fn(async () => 'access-code-must-not-escape');
    const connectStream = vi.fn(async () => ({
      readable: (async function* () {
        yield* [];
      })(),
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    }));
    const captureNetworkStill: NonNullable<MachineConnectionRuntime['captureNetworkStill']> = vi.fn(async () =>
      Object.freeze({
        bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        mediaType: 'image/jpeg',
        capturedAt: '2026-09-14T00:00:01.000Z',
        expiresAt: '2026-09-14T00:00:31.000Z',
      }),
    );
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:01.000Z' },
      log: vi.fn(async () => undefined),
      connectStream,
      async *readArtifact({ artifact: requested }) {
        yield Uint8Array.from(archives.find((candidate) => artifactOf(candidate).digest === requested.digest)!);
      },
      resolveSecret,
      uploadFile,
      captureNetworkStill,
    };
    const session = await connectBambuMachine(
      {
        candidate,
        configuration: {},
        connection: {
          secretRef: 'vault:bambu-x1c',
          serviceTrust: {
            mqtt: { type: 'pinned', digest: pinnedDigest },
            camera: { type: 'pinned', digest: pinnedDigest },
          },
        },
        purpose: 'bind',
        signal: new AbortController().signal,
      },
      runtime,
    );
    const { signal } = new AbortController();
    const descriptor = await session.getDescriptor({ signal });
    const snapshot = await session.getSnapshot({ signal });
    expect(() =>
      JSON.stringify(snapshot, (_key, value: unknown) => {
        if (value === undefined) {
          throw new Error('Snapshot contains undefined');
        }
        return value;
      }),
    ).not.toThrow();
    expect(resolveSecret).toHaveBeenCalledWith(expect.objectContaining({ reference: 'vault:bambu-x1c' }));
    expect(connectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        // The ports the provider dials are the ones its manifest declares and the binding pins.
        endpoint: { address: '192.0.2.10', port: bambuServicePort(bambuX1cManifest, 'mqtt') },
        transport: 'tls',
        trust: { type: 'pinned', digest: pinnedDigest },
      }),
    );
    expect(descriptor).toMatchObject({ id: '00M00A000000001', model: 'X1C', firmware: '01.08.02.00' });
    expect(snapshot).toMatchObject({
      connection: 'connected',
      state: { status: 'active' },
      run: {
        runId: 'run-1',
        origin: 'external',
        state: 'running',
        progress: {
          fraction: 0.42,
          remaining: 180_000,
          counters: [{ id: 'layer', current: 12, total: 120 }],
        },
      },
      alerts: [{ code: '0C00-0300-0003-000B', severity: 'warning', blocks: 'nothing' }],
    });
    const filament = snapshot.components.find(({ componentId }) => componentId === 'filament');
    expect(filament).toMatchObject({
      knowledge: 'known',
      value: {
        slots: [
          { slot: { unitId: 'ams-a', slotId: 'a1' }, state: 'loaded', material: { materialType: 'PLA' } },
          { slot: { slotId: 'a2' }, state: 'empty' },
          { slot: { slotId: 'a3' }, state: 'empty' },
          { slot: { slotId: 'a4' }, state: 'empty' },
          { slot: { unitId: 'external', slotId: 'spool' } },
        ],
        routes: [{ toolheadId: 'tool-0', current: { unitId: 'ams-a', slotId: 'a1' } }],
      },
    });
    if (session.stillCapture.type !== 'supported') {
      throw new Error('Expected X1C RTSPS still capability');
    }
    await expect(session.stillCapture.capture({ signal })).resolves.toMatchObject({ mediaType: 'image/jpeg' });
    expect(captureNetworkStill).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: '192.0.2.10', port: bambuServicePort(bambuX1cManifest, 'camera') },
        connectTimeout: 60_000,
        path: '/streaming/live/1',
        secretRef: 'vault:bambu-x1c',
        username: 'bblp',
        trust: { type: 'pinned', digest: pinnedDigest },
      }),
    );
    expect(JSON.stringify({ descriptor, snapshot })).not.toMatch(/access-code|192\.0\.2\.10|sha256:/u);
    expect(published).toEqual(expect.arrayContaining([expect.stringContaining('"command":"get_version"')]));

    const { jobs } = session;
    if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
      throw new Error('Expected stored jobs');
    }
    const base = { operationId: 'prepared-1', expectedMachineId: '00M00A000000001', artifact, configuration, signal };
    const prepared = await jobs.prepare(base);
    if (prepared.status === 'refused' || prepared.remoteName === undefined) {
      throw new Error('Expected a preparation');
    }
    const { remoteName } = prepared;
    // The mocked printer is mid-run: only the idle check blocks.
    expect(prepared.checks.filter(({ state }) => state === 'blocked').map(({ id }) => id)).toEqual(['idle']);
    expect(prepared).toMatchObject({ remoteName: 'tau-prepared-1.gcode.3mf', parser: { id: 'tau.bambu.gcode-3mf' } });
    expect(uploadFile).not.toHaveBeenCalled();
    for (const unqualified of [referenceArchive, unnamedArchive]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each refusal is asserted in turn.
      const refused = await jobs.prepare({ ...base, artifact: artifactOf(unqualified) });
      expect(refused.status !== 'refused' && refused.checks.find(({ id }) => id === 'producer')).toMatchObject({
        state: 'blocked',
      });
    }
    const otherPlate = await jobs.prepare({
      ...base,
      configuration: { ...configuration, operatorConfirmedBedType: 'cool_plate' },
    });
    expect(otherPlate.status !== 'refused' && otherPlate.checks.find(({ id }) => id === 'plate')).toMatchObject({
      state: 'blocked',
    });

    const transfer = await jobs.transfer({
      ...base,
      operationId: 'upload-1',
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
    });
    expect(transfer).toEqual({
      status: 'accepted',
      transferId: 'tau-prepared-1.gcode.3mf',
      observedAt: '2026-09-14T00:00:01.000Z',
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: '192.0.2.10', port: 990 },
        secretRef: 'vault:bambu-x1c',
        remoteName: 'tau-prepared-1.gcode.3mf',
        bytes,
      }),
    );
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(published).not.toEqual(expect.arrayContaining([expect.stringContaining('project_file')]));
    const start = async (operationId: string) =>
      jobs.start({
        ...base,
        operationId,
        remoteName,
        transferId: 'tau-prepared-1.gcode.3mf',
        providerData: prepared.providerData,
      });
    // Prepared while the printer printed; it is still printing, so nothing is sent.
    await expect(start('start-0')).resolves.toMatchObject({ status: 'rejected', code: 'MACHINE_ACTION_RUN_ACTIVE' });
    expect(published).not.toEqual(expect.arrayContaining([expect.stringContaining('project_file')]));
    statusReply.gcodeState = 'IDLE';
    mockPrinter.push?.();
    await expect(start('start-1')).resolves.toMatchObject({ status: 'accepted', runId: 'run-2' });
    const lastStart = (): Record<string, unknown> | undefined =>
      published
        .map((payload) => JSON.parse(payload) as { print?: Record<string, unknown> })
        .findLast((payload) => payload.print?.['command'] === 'project_file')?.print;
    expect(published).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `"command":"project_file","param":"Metadata/plate_1.gcode","url":"ftp://tau-prepared-1.gcode.3mf","file":"tau-prepared-1.gcode.3mf"`,
        ),
      ]),
    );
    const project = lastStart();
    expect(project?.['sequence_id']).toMatch(/^\d{5}$/u);
    expect(project?.['project_id']).toMatch(/^[1-9]\d*$/u);
    expect(project?.['subtask_id']).toBe(project?.['project_id']);
    expect(project?.['task_id']).toBe(project?.['project_id']);
    expect(project?.['bed_type']).toBe('auto');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names are fixed.
    expect(project?.['ams_mapping2']).toEqual([{ ams_id: 0, slot_id: 0 }]);

    // A printer that starts without a correlated echo still proves the start through its status.
    try {
      startReply.mode = 'status-id';
      await expect(start('start-2')).resolves.toMatchObject({ status: 'accepted', runId: lastStart()?.['subtask_id'] });
      startReply.mode = 'status-name';
      await expect(start('start-3')).resolves.toMatchObject({ status: 'accepted' });
      // After a reconnect the transfer name still proves a start whose run carries only that name.
      await expect(
        session.reconcile({ operationId: 'start-8', kind: 'start', transferId: prepared.remoteName, signal }),
      ).resolves.toMatchObject({ status: 'accepted' });
      // A start this session never sent, whose id the printer's run does not carry, stays unproven.
      await expect(session.reconcile({ operationId: 'start-9', kind: 'start', signal })).resolves.toMatchObject({
        status: 'unknown',
        reason: 'no-correlated-provider-reply',
      });
      const logged = vi.mocked(runtime.log).mock.calls.map(([entry]) => entry.message);
      expect(logged.join('\n')).not.toMatch(/00M00A000000001|192\.0\.2\.10/u);
    } finally {
      startReply.mode = 'echo';
      statusReply.gcodeState = 'RUNNING';
    }
    await session.close();
  });

  it('should stop a print during its colour change with Stop alone, never the AMS abort', async () => {
    published.length = 0;
    // RUNNING with the AMS in a filament change (main 1): a multi-colour print swapping spools.
    statusReply.amsStatus = 0x01_00;
    try {
      const session = await connectBambuMachine(
        {
          candidate,
          configuration: {},
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } },
          },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        {
          clock: { now: () => '2026-09-14T00:00:01.000Z' },
          log: vi.fn(async () => undefined),
          connectStream: vi.fn(async () => ({
            readable: (async function* () {
              yield* [];
            })(),
            write: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
          })),
          async *readArtifact() {
            yield* [];
          },
          resolveSecret: vi.fn(async () => 'access-code-must-not-escape'),
        },
      );
      // The stop's reply settles it at once; the bound only keeps a wrongly sent abort, which waits for the AMS to
      // go idle, from hanging the test before the assertions.
      await session.stop({ operationId: 'stop-colour-change', signal: AbortSignal.timeout(1000) });
      const commands = published.map(
        (payload) => (JSON.parse(payload) as { print?: { command?: string } }).print?.command,
      );
      // Bambu Studio's Stop during a print is `stop`; `ams_control abort` is only for a change outside one.
      expect(commands).toContain('stop');
      expect(commands).not.toContain('ams_control');
      await session.close();
    } finally {
      statusReply.amsStatus = 0;
    }
  });

  it('should offer the external spool as slot 254 and start from it with the AMS off', async () => {
    published.length = 0;
    versionReply.serial = '00M00A000000001';
    statusReply.externalSpool = true;
    statusReply.gcodeState = 'IDLE';
    const petgArchive = studio(['PETG']);
    const twoFilamentArchive = studio(['PLA', 'PETG']);
    const artifact = artifactOf(petgArchive);
    const configuration = {
      amsMapping: [254],
      bedLeveling: true,
      expectedBedType: 'textured-pei',
      expectedFilamentDiameter: 1.75,
      expectedMaterials: [{ slot: 254, materialId: 'PETG' }],
      expectedModel: 'X1C',
      expectedNozzleDiameter: 0.4,
      operatorConfirmedBedType: 'textured-pei',
      flowCalibration: true,
      timelapse: false,
    } as const;
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:01.000Z' },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => ({
        readable: (async function* () {
          yield* [];
        })(),
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      })),
      async *readArtifact({ artifact: requested }) {
        yield (
          [petgArchive, twoFilamentArchive, studioArchive].find(
            (bytes) => artifactOf(bytes).digest === requested.digest,
          ) ?? petgArchive
        );
      },
      resolveSecret: vi.fn(async () => 'access-code'),
      uploadFile: vi.fn(async () => ({ bytesWritten: petgArchive.byteLength })),
    };
    const session = await connectBambuMachine(
      {
        candidate,
        configuration: {},
        connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
        purpose: 'bind',
        signal: new AbortController().signal,
      },
      runtime,
    );
    const { signal } = new AbortController();
    try {
      const snapshot = await session.getSnapshot({ signal });
      const filament = snapshot.components.find(({ componentId }) => componentId === 'filament');
      const slots =
        filament?.knowledge === 'known' && filament.value.kind === 'material-system' ? filament.value.slots : [];
      expect(slots.at(-1)).toMatchObject({
        slot: { unitId: 'external', slotId: 'spool' },
        state: 'loaded',
        material: { materialType: 'PETG', color: '#FFFFFFFF', preset: { profileId: 'GFG99' } },
      });
      const { jobs } = session;
      if (jobs.type !== 'supported') {
        throw new Error('Expected jobs');
      }
      const prepare = async (overrides: Readonly<{ amsMapping?: number[] }>, program = petgArchive) =>
        jobs.prepare({
          operationId: 'prepared-external',
          expectedMachineId: '00M00A000000001',
          artifact: artifactOf(program),
          configuration: { ...configuration, ...overrides },
          signal,
        });
      const filamentCheck = async (overrides: Parameters<typeof prepare>[0], program?: Uint8Array<ArrayBuffer>) => {
        const prepared = await prepare(overrides, program);
        return prepared.status === 'refused' ? undefined : prepared.checks.find(({ id }) => id === 'filament');
      };
      await expect(filamentCheck({ amsMapping: [0, 254] }, twoFilamentArchive)).resolves.toMatchObject({
        state: 'blocked',
        detail: 'The external spool can only feed a one-filament print. Map every filament to an AMS slot.',
      });
      // The spool holds PETG; a PLA slice mapped to it is blocked whatever the form claims.
      await expect(filamentCheck({}, studioArchive)).resolves.toMatchObject({ state: 'blocked' });
      const prepared = await prepare({});
      if (prepared.status === 'refused' || prepared.remoteName === undefined) {
        throw new Error('Expected a preparation');
      }
      await expect(
        jobs.start({
          operationId: 'start-external',
          expectedMachineId: '00M00A000000001',
          artifact,
          remoteName: prepared.remoteName,
          transferId: prepared.remoteName,
          providerData: prepared.providerData,
          configuration,
          signal,
        }),
      ).resolves.toMatchObject({ status: 'accepted' });
      const project = published
        .map((payload) => JSON.parse(payload) as { print?: Record<string, unknown> })
        .findLast((payload) => payload.print?.['command'] === 'project_file')?.print;
      /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
      expect(project).toMatchObject({
        use_ams: false,
        ams_mapping: [-1],
        ams_mapping2: [{ ams_id: 255, slot_id: 0 }],
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */
    } finally {
      statusReply.externalSpool = false;
      statusReply.gcodeState = 'RUNNING';
      await session.close();
    }
  });

  it.each([
    {
      model: 'X1C',
      serial: '00M00A000000001',
      printerType: 'BL-P001',
      proven: '01.12.00.00',
      manifest: bambuX1cManifest,
    },
    {
      model: 'A1 mini',
      serial: '0300AA000000001',
      printerType: 'N1',
      proven: '01.03.30.01',
      manifest: bambuA1MiniManifest,
    },
  ] as const)(
    'should keep the $model actions the operator qualified on its firmware, and mark them designed on another',
    async ({ model, serial, printerType, proven, manifest }) => {
      const qualifications = async (firmware: string) => {
        versionReply.serial = serial;
        versionReply.firmware = firmware;
        statusReply.printerType = printerType;
        const session = await connectBambuMachine(
          {
            candidate: { ...candidate, claimedIdentity: { model, serial } },
            configuration: {},
            connection: { secretRef: 'vault:bambu', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
            purpose: 'bind',
            signal: new AbortController().signal,
          },
          {
            clock: { now: () => '2026-10-05T00:00:00.000Z' },
            log: vi.fn(async () => undefined),
            connectStream: vi.fn(async () => ({
              readable: (async function* () {
                yield* [];
              })(),
              write: vi.fn(async () => undefined),
              close: vi.fn(async () => undefined),
            })),
            resolveSecret: vi.fn(async () => '12345678'),
            async *readArtifact() {
              yield* [];
            },
          },
          model,
        );
        try {
          const descriptor = await session.getDescriptor({ signal: new AbortController().signal });
          expect(descriptor.firmware).toBe(firmware);
          return Object.fromEntries(
            descriptor.capabilities.actions.map(({ componentId, id, qualification }) => [
              `${componentId}:${id}`,
              qualification.status,
            ]),
          );
        } finally {
          await session.close();
        }
      };
      try {
        const qualified = manifest.actions
          .filter(({ qualification }) => qualification.status === 'qualified')
          .map(({ componentId, id }) => `${componentId}:${id}`);
        // The operator's evidence: light, fans, home, jog and run control on the X1C; part fan and jog on the A1 mini.
        expect(qualified).toEqual(
          expect.arrayContaining(
            model === 'X1C'
              ? ['chamber-light:switch.set', 'part-fan:level.set', 'motion:motion.jog', 'controller:run.pause']
              : ['part-fan:level.set', 'motion:motion.jog'],
          ),
        );
        const onProven = await qualifications(proven);
        const onOther = await qualifications('01.12.01.00');
        for (const key of qualified) {
          expect([key, onProven[key]]).toEqual([key, 'qualified']);
          expect([key, onOther[key]]).toEqual([key, 'designed']);
        }
      } finally {
        versionReply.serial = '00M00A000000001';
        versionReply.firmware = '01.08.02.00';
        statusReply.printerType = 'BL-P001';
      }
    },
  );

  it.each([
    { providerId: 'bambu', model: 'X1C', serial: '00M00A000000001', printerType: 'BL-P001' },
    { providerId: 'bambu-a1-mini', model: 'A1 mini', serial: '0300AA000000001', printerType: 'N1' },
  ] as const)(
    'should list and connect a $model binding an earlier build stored, address in its configuration',
    async ({ providerId, model, serial, printerType }) => {
      versionReply.serial = serial;
      statusReply.printerType = printerType;
      const root = await mkdtemp(join(tmpdir(), 'tau-bambu-store-'));
      try {
        // Exactly as the store at f1fd08a32 wrote it: an endpoint without `transport`, and the binding form 1.1.0
        // (`logicalId`, `address` and `serial` in the configuration). The strict 2.1.0 form refuses `logicalId` and
        // `address`, so this connects only because a stored configuration is never re-parsed.
        await writeFile(join(root, 'store.json'), JSON.stringify({ version: 1 }), { mode: 0o600 });
        await mkdir(join(root, 'workshop'), { mode: 0o700 });
        await writeFile(
          join(root, 'workshop', 'machine.json'),
          JSON.stringify({
            version: 1,
            id: 'workshop',
            name: 'Workshop',
            providerId,
            physicalId: serial,
            candidate: {
              id: `${providerId}:${serial}`,
              name: 'Workshop',
              endpoint: { address: '192.0.2.10', interface: 'manual' },
              claimedIdentity: { serial, model },
              observedAt: '2026-09-14T00:00:00.000Z',
              expiresAt: '2026-09-14T00:00:30.000Z',
            },
            configuration: { logicalId: 'Workshop', address: '192.0.2.10', serial, wireForm: 'a' },
            connection: { secretRef: 'vault:bambu', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
            boundAt: '2026-09-14T00:00:00.000Z',
          }),
          { mode: 0o600 },
        );
        await chmod(root, 0o700);
        const connectStream = vi.fn(async () => ({
          readable: (async function* () {
            yield* [];
          })(),
          write: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined),
        }));
        const clock = { now: () => new Date().toISOString() };
        const onError = vi.fn();
        const admission = createHostAdmissionAuthority({ hostId: 'host-1' });
        const host = await createNodeMachineHost({
          storeRoot: root,
          hostId: 'host-1',
          authorityId: 'authority-1',
          admission,
          providers: [bambuMachine(), bambuA1MiniMachine()],
          runtime: {
            discovery: {
              clock,
              async *listenDatagrams() {
                yield* [];
              },
            },
            connection: () => ({
              clock,
              log: vi.fn(async () => undefined),
              connectStream,
              resolveSecret: vi.fn(async () => '12345678'),
              async *readArtifact() {
                yield* [];
              },
            }),
          },
          onError,
        });
        const ports = new MessageChannel();
        const server = host.serve({
          port: ports.port1,
          session: host.issueSession({
            actor: { kind: 'user', id: 'operator' },
            grants: [
              { route: 'machines', operation: 'machines.list' },
              { route: 'machines', operation: 'machines.get' },
            ],
          }),
        });
        const client = connectMachineChannel(ports.port2);
        try {
          await client.ready;
          const listed = await client.list({});
          expect(listed.entries.map((entry) => [entry.machineId, entry.providerId])).toEqual([
            ['workshop', providerId],
          ]);
          await vi.waitFor(async () => {
            await expect(client.get({ machineId: 'workshop' })).resolves.toMatchObject({
              freshness: 'current',
              descriptor: { id: serial, model },
            });
          });
          expect(connectStream).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: { address: '192.0.2.10', port: 8883 } }),
          );
          expect(onError).not.toHaveBeenCalled();
        } finally {
          client.close();
          server.dispose();
          await host.close();
        }
      } finally {
        versionReply.serial = '00M00A000000001';
        statusReply.printerType = 'BL-P001';
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('should reject an upload the printer refuses to store and keep a lost transfer unknown', async () => {
    versionReply.serial = '00M00A000000001';
    const artifact = artifactOf(studioArchive);
    const configuration = {
      amsMapping: [0],
      bedLeveling: true,
      expectedBedType: 'textured-pei',
      expectedFilamentDiameter: 1.75,
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
      expectedModel: 'X1C',
      expectedNozzleDiameter: 0.4,
      operatorConfirmedBedType: 'textured-pei',
      flowCalibration: true,
      timelapse: false,
    } as const;
    // The host names a refused store and keeps the printer's reply; a mini with a failing microSD answers a bare 550.
    const refused = new Error('MACHINE_UPLOAD_REFUSED', { cause: Object.assign(new Error('550 '), { code: 550 }) });
    const uploadFile = vi
      .fn<NonNullable<MachineConnectionRuntime['uploadFile']>>()
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(new Error('read ECONNRESET'));
    const log = vi.fn(async () => undefined);
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:01.000Z' },
      log,
      connectStream: vi.fn(async () => ({
        readable: (async function* () {
          yield* [];
        })(),
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      })),
      async *readArtifact() {
        yield studioArchive;
      },
      resolveSecret: vi.fn(async () => 'access-code'),
      uploadFile,
    };
    const session = await connectBambuMachine(
      {
        candidate,
        configuration: {},
        connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
        purpose: 'bind',
        signal: new AbortController().signal,
      },
      runtime,
    );
    const { signal } = new AbortController();
    try {
      const { jobs } = session;
      if (jobs.type !== 'supported' || jobs.delivery !== 'stored') {
        throw new Error('Expected stored jobs');
      }
      const base = { expectedMachineId: '00M00A000000001', artifact, configuration, signal };
      const prepared = await jobs.prepare({ ...base, operationId: 'prepared-refused' });
      if (prepared.status === 'refused' || prepared.remoteName === undefined) {
        throw new Error('Expected a preparation');
      }
      const { remoteName } = prepared;
      const upload = async (operationId: string) =>
        jobs.transfer({ ...base, operationId, remoteName, providerData: prepared.providerData });
      await expect(upload('upload-refused')).resolves.toEqual({
        status: 'rejected',
        code: 'TRANSFER_REFUSED',
        message:
          'The printer refused to store the file (FTP 550), so nothing was started. Its microSD card may be full, ' +
          'damaged or locked: free space on it or format it on the printer, then send again.',
        observedAt: '2026-09-14T00:00:01.000Z',
      });
      expect(log).toHaveBeenCalledWith({
        level: 'warning',
        message: `FTPS upload of ${remoteName} failed: MACHINE_UPLOAD_REFUSED (550 )`,
      });
      // A transfer that broke off may have reached the printer, so its result stays unknown.
      await expect(upload('upload-lost')).resolves.toEqual({
        status: 'unknown',
        reason: 'transfer-result-unavailable',
        observedAt: '2026-09-14T00:00:01.000Z',
      });
    } finally {
      await session.close();
    }
  });

  it('should emit a bounded manual candidate without opening a datagram listener', async () => {
    const listenDatagrams = vi.fn(async function* () {
      yield* [];
    });
    const events = discoverBambuMachines(
      {
        configuration: { serial: '00M00A000000001' },
        endpoint: { transport: 'network', address: 'x1c.local' },
        signal: new AbortController().signal,
      },
      { clock: { now: () => '2026-09-14T00:00:00.000Z' }, listenDatagrams },
    );

    const discovered = [];
    for await (const event of events) {
      discovered.push(event);
    }
    expect(discovered).toMatchObject([
      {
        type: 'found',
        candidate: {
          name: 'X1C at x1c.local',
          endpoint: { transport: 'network', address: 'x1c.local', interface: 'manual' },
        },
      },
    ]);
    expect(listenDatagrams).not.toHaveBeenCalled();
  });

  it('should refuse a manual address, port or serial with a sentence a person can act on', async () => {
    const listenDatagrams = vi.fn(async function* () {
      yield* [];
    });
    const discover = async (entry: Readonly<{ address: string; port?: number; serial?: string }>): Promise<void> => {
      const { serial, ...endpoint } = entry;
      for await (const _event of discoverBambuMachines(
        {
          configuration: serial === undefined ? {} : { serial },
          endpoint: { transport: 'network', ...endpoint },
          signal: new AbortController().signal,
        },
        { clock: { now: () => '2026-09-14T00:00:00.000Z' }, listenDatagrams },
      )) {
        // Refused before anything is yielded.
      }
    };
    await expect(discover({ address: 'http://x1c' })).rejects.toMatchObject({
      code: 'BAMBU_MANUAL_ADDRESS_INVALID',
      message: 'Enter a valid IP address or printer hostname.',
    });
    // Its MQTT, camera and FTPS services each have their own fixed port, so one entered port names none of them.
    await expect(discover({ address: 'x1c.local', port: 8883 })).rejects.toMatchObject({
      code: 'BAMBU_MANUAL_ADDRESS_INVALID',
      message: 'A Bambu printer answers on its own fixed ports; enter the address without a port.',
    });
    // An A1 mini serial is not an X1C serial.
    await expect(discover({ address: 'x1c.local', serial: '0300AA000000001' })).rejects.toMatchObject({
      code: 'BAMBU_SERIAL_INVALID',
      message: 'The serial does not match the selected printer model.',
    });
  });

  it('should listen on UDP 2021 for two advertisement periods so a pass cannot fall between them', async () => {
    const listenDatagrams = vi.fn(async function* () {
      yield* [];
    });
    for await (const _event of discoverBambuMachines(
      { configuration: {}, signal: new AbortController().signal },
      { clock: { now: () => '2026-09-14T00:00:00.000Z' }, listenDatagrams },
    )) {
      // A silent LAN yields nothing.
    }
    /* The X1C advertises about every 5.05 s (5.0–5.1 s measured); a 5 s pass missed it. */
    const [listen] = listenDatagrams.mock.calls[0] as unknown as [MachineDatagramListenInput];
    expect(listen.port).toBe(2021);
    expect(listen.durationMs).toBeGreaterThan(2 * 5100);
  });

  it('should redact host failures and require pinned MQTT trust', async () => {
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:00.000Z' },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => {
        throw new Error('access-code-must-not-escape');
      }),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => 'access-code-must-not-escape'),
    };
    const connect = async (serviceTrust: Parameters<typeof connectBambuMachine>[0]['connection']['serviceTrust']) => {
      return connectBambuMachine(
        {
          candidate,
          configuration: {},
          connection: { secretRef: 'vault:bambu-x1c', serviceTrust },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        runtime,
      );
    };

    await expect(connect({ mqtt: { type: 'system' } })).rejects.toThrow('BAMBU_MQTT_PIN_REQUIRED');
    await expect(connect({ mqtt: { type: 'pinned', digest: pinnedDigest } })).rejects.toThrow(
      'BAMBU_MQTT_TRANSPORT_FAILED',
    );
    // A pin mismatch is the one transport failure a retry cannot fix, so it keeps its own code.
    vi.mocked(runtime.connectStream).mockRejectedValueOnce(new Error('MACHINE_TLS_PIN_MISMATCH'));
    await expect(connect({ mqtt: { type: 'pinned', digest: pinnedDigest } })).rejects.toThrow(
      'BAMBU_CERTIFICATE_CHANGED',
    );
  });

  it('should refuse a firmware reply from a different physical serial', async () => {
    versionReply.serial = 'OTHER-X1C';
    const network: MachineNetworkStream = {
      readable: (async function* () {
        yield* [];
      })(),
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:00.000Z' },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => network),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => 'access-code-must-not-escape'),
    };
    await expect(
      connectBambuMachine(
        {
          candidate,
          configuration: {},
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } },
          },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        runtime,
      ),
    ).rejects.toMatchObject({
      code: 'BAMBU_INITIAL_FACTS_INVALID',
      message: 'The device at this address is not the bound printer, or did not report its serial, model and firmware.',
    });
    versionReply.serial = '00M00A000000001';
  });

  it('should name a refused access code apart from a dropped link', async () => {
    const runtime: MachineConnectionRuntime = {
      clock: { now: () => '2026-09-14T00:00:00.000Z' },
      log: vi.fn(async () => undefined),
      connectStream: vi.fn(async () => ({
        readable: (async function* () {
          yield* [];
        })(),
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      })),
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: vi.fn(async () => 'access-code-must-not-escape'),
    };
    const connect = async (configuration: Readonly<{ serial?: string }>) =>
      connectBambuMachine(
        {
          candidate,
          configuration,
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } },
          },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        runtime,
      );
    try {
      connack.code = 5;
      // Settings shows the message to the person, so it is a sentence; callers branch on the stable code.
      await expect(connect({})).rejects.toMatchObject({
        code: 'BAMBU_ACCESS_CODE_REJECTED',
        message: "The printer refused the access code. Check the code on the printer's screen and bind it again.",
      });
      connack.code = 3;
      await expect(connect({})).rejects.toMatchObject({
        code: 'BAMBU_MQTT_CONNECT_FAILED',
        message: 'Could not connect to the printer. Check that it is on and on this network, then try again.',
      });
    } finally {
      connack.code = 0;
    }
    // The bound serial fences the printer: an advertisement naming another one is not it.
    await expect(connect({ serial: '00M00A000000002' })).rejects.toMatchObject({
      code: 'BAMBU_SERIAL_MISMATCH',
      message: 'The printer at this address reports a different serial.',
    });
    // Neither bound nor advertised: the person is told where to enter it.
    await expect(
      connectBambuMachine(
        {
          candidate: { ...candidate, claimedIdentity: { model: 'X1C' } },
          configuration: {},
          connection: { secretRef: 'vault:bambu-x1c', serviceTrust: {} },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        runtime,
      ),
    ).rejects.toMatchObject({
      code: 'BAMBU_SERIAL_REQUIRED',
      message: "Enter the printer's serial under Printer details, or find the printer on the network to fill it.",
    });
    expect(runtime.connectStream).toHaveBeenCalledTimes(2);
  });

  it('should keep Mini model facts and capture a fragmented bounded TLS JPEG, closing failed captures', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const header = Buffer.alloc(16);
    header.writeUInt32LE(jpeg.length);
    const cameraBytes = Buffer.concat([header, jpeg]);
    const cameraClose = vi.fn(async () => undefined);
    const cameraWrite = vi.fn(async (_bytes: Uint8Array<ArrayBuffer>) => undefined);
    const mqttWrite = vi.fn(async (_bytes: Uint8Array<ArrayBuffer>) => undefined);
    let invalidFrame = false;
    const connectStream = vi.fn(
      async ({
        endpoint,
      }: Parameters<MachineConnectionRuntime['connectStream']>[0]): Promise<MachineNetworkStream> => ({
        readable: (async function* () {
          if (endpoint.port === 6000) {
            yield invalidFrame ? Buffer.alloc(16, 255) : cameraBytes.subarray(0, 5);
            if (!invalidFrame) {
              yield cameraBytes.subarray(5, 18);
              yield cameraBytes.subarray(18);
            }
          }
        })(),
        write: endpoint.port === 6000 ? cameraWrite : mqttWrite,
        close: endpoint.port === 6000 ? cameraClose : vi.fn(async () => undefined),
      }),
    );
    try {
      versionReply.serial = '0300AA000000001';
      statusReply.printerType = 'N1';
      const session = await connectBambuMachine(
        {
          candidate: { ...candidate, claimedIdentity: { model: 'A1 mini', serial: versionReply.serial } },
          configuration: {},
          connection: {
            secretRef: 'vault:mini',
            serviceTrust: {
              mqtt: { type: 'pinned', digest: pinnedDigest },
              camera: { type: 'pinned', digest: pinnedDigest },
            },
          },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        {
          clock: { now: () => '2026-09-30T00:00:00.000Z' },
          log: vi.fn(async () => undefined),
          connectStream,
          resolveSecret: vi.fn(async () => '12345678'),
          async *readArtifact() {
            yield* [];
          },
        },
        'A1 mini',
      );
      expect(mqttWrite).toHaveBeenCalledExactlyOnceWith(Uint8Array.from([0x10, 0x02, 0x00, 0x00]));
      const descriptor = await session.getDescriptor({ signal: new AbortController().signal });
      expect(descriptor).toMatchObject({ model: 'A1 mini' });
      expect(descriptor.capabilities.processes[0]).toMatchObject({
        geometry: { buildVolume: { x: 180, y: 180, z: 180 } },
      });
      const snapshot = await session.getSnapshot({ signal: new AbortController().signal });
      const reported = snapshot.components.map(({ componentId }) => componentId);
      expect(reported).not.toContain('chamber-light');
      expect(reported).not.toContain('chamber');
      expect(reported).not.toContain('aux-fan');
      if (session.stillCapture.type !== 'supported') {
        throw new Error('Expected Mini camera');
      }
      const still = await session.stillCapture.capture({ signal: new AbortController().signal });
      expect(still.bytes).toEqual(jpeg);
      expect(connectStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: { address: '192.0.2.10', port: bambuServicePort(bambuA1MiniManifest, 'camera') },
          trust: { type: 'pinned', digest: pinnedDigest },
          maximumWriteBytes: 80,
        }),
      );
      expect(cameraWrite.mock.calls[0]?.[0]).toHaveLength(80);
      expect(cameraClose).toHaveBeenCalledTimes(1);
      invalidFrame = true;
      await expect(session.stillCapture.capture({ signal: new AbortController().signal })).rejects.toThrow(
        'BAMBU_CAMERA_FRAME_INVALID',
      );
      expect(cameraClose).toHaveBeenCalledTimes(2);
      await session.close();
    } finally {
      versionReply.serial = '00M00A000000001';
      statusReply.printerType = 'BL-P001';
    }
  });

  it('should offer stills only for an X1C whose host captures them over the pinned camera', async () => {
    const captureNetworkStill: NonNullable<MachineConnectionRuntime['captureNetworkStill']> = vi.fn();
    const connect = async (hostCaptures: boolean) =>
      connectBambuMachine(
        {
          candidate,
          configuration: {},
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: {
              mqtt: { type: 'pinned', digest: pinnedDigest },
              camera: { type: 'pinned', digest: pinnedDigest },
            },
          },
          purpose: 'bind',
          signal: new AbortController().signal,
        },
        {
          clock: { now: () => '2026-09-14T00:00:00.000Z' },
          log: vi.fn(async () => undefined),
          connectStream: vi.fn(async () => ({
            readable: (async function* () {
              yield* [];
            })(),
            write: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
          })),
          async *readArtifact() {
            yield* [];
          },
          resolveSecret: vi.fn(async () => 'access-code-must-not-escape'),
          ...(hostCaptures ? { captureNetworkStill } : {}),
        },
      );
    try {
      // Another model's camera needs its own manifest and pin; the X1C's pinned camera service never reaches it.
      statusReply.printerType = 'C12';
      await expect(connect(true)).rejects.toMatchObject({ code: 'BAMBU_INITIAL_FACTS_INVALID' });
      statusReply.printerType = 'BL-P001';
      const withoutHostCapture = await connect(false);
      expect(withoutHostCapture.stillCapture).toEqual({ type: 'unsupported' });
      await withoutHostCapture.close();
    } finally {
      statusReply.printerType = 'BL-P001';
    }
    expect(captureNetworkStill).not.toHaveBeenCalled();
  });
});

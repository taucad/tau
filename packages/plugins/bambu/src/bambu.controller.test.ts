import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';

import type {
  MachineArtifactReference,
  MachineConnectionRuntime,
  MachineDatagramListenInput,
  MachineNetworkStream,
} from '@taucad/runtime/machine';
import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

const report =
  '{"print":{"sequence_id":"8","printer_type":"BL-P001","nozzle_diameter":"0.4","nozzle_temper":215,"nozzle_target_temper":220,"bed_temper":60,"bed_target_temper":65,"gcode_state":"RUNNING","mc_percent":42,"mc_remaining_time":3,"subtask_id":"run-1","subtask_name":"Cube","layer_num":12,"total_layer_num":120,"spd_lvl":2,"spd_mag":100,"stg_cur":1,"hms":[{"attr":201327360,"code":196619}],"cooling_fan_speed":"15","wifi_signal":"-47dBm","sdcard":true,"lights_report":[{"node":"chamber_light","mode":"on"}],"ams":{"tray_exist_bits":"1","tray_now":"0","tray_tar":"0","ams":[{"humidity":"3","temp":"22","tray":[{"tray_type":"PLA","tray_info_idx":"GFA00"},{},{},{}]}]}}}';
const published = vi.hoisted((): string[] => []);
const versionReply = vi.hoisted(() => ({ serial: '00M00A391800004' }));
// The model the mocked printer's status reports; `BL-P001` is the X1C.
const statusReply = vi.hoisted(() => ({ printerType: 'BL-P001', externalSpool: false }));
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

    public async subscribeAsync(): Promise<void> {
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
            `{"info":{"command":"get_version","sequence_id":"0","module":[{"name":"ota","sw_ver":"01.08.02.00","hw_ver":"OTA","sn":"${versionReply.serial}"}],"result":"success"}}`,
          ),
        );
      } else {
        this.#emit(
          'message',
          topic.replace('/request', '/report'),
          Buffer.from(
            report
              .replace('BL-P001', statusReply.printerType)
              .replace('"ams":{', statusReply.externalSpool ? externalSpoolReport : '"ams":{'),
          ),
        );
      }
      await Promise.resolve();
    }

    public async endAsync(): Promise<void> {
      this.connected = false;
      this.#emit('close');
      await Promise.resolve();
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
// Synthetic stand-ins: only the provenance signals each producer writes, with a made-up version.
const studioArchive = archive(
  '; HEADER_BLOCK_START\n; BambuStudio 99.0.0.0\n; HEADER_BLOCK_END\nG28\n',
  '<config><header><header_item key="X-BBL-Client-Type" value="slicer"/>' +
    '<header_item key="X-BBL-Client-Version" value="99.0.0.0"/></header></config>',
);
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
  id: 'bambu:00M00A391800004',
  name: 'Workshop X1C',
  endpoint: { address: '192.0.2.10', interface: 'test0' },
  claimedIdentity: { serial: '00M00A391800004', model: 'X1C' },
  observedAt: '2026-09-14T00:00:00.000Z',
  expiresAt: '2026-09-14T00:00:30.000Z',
};

describe('Bambu read-only controller', () => {
  it('should keep secret and trust host-local while normalizing X1C status and AMS setup', async () => {
    published.length = 0;
    versionReply.serial = '00M00A391800004';
    const bytes = studioArchive;
    const artifact = artifactOf(bytes);
    const artifactDigest = artifact.digest;
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
    const close = vi.fn(async () => undefined);
    const network: MachineNetworkStream = {
      readable: (async function* () {
        yield* [];
      })(),
      write: vi.fn(async () => undefined),
      close,
    };
    const resolveSecret = vi.fn(async () => 'access-code-must-not-escape');
    const connectStream = vi.fn(async () => network);
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
        configuration: { logicalId: 'workshop' },
        connection: {
          secretRef: 'vault:bambu-x1c',
          serviceTrust: {
            mqtt: { type: 'pinned', digest: pinnedDigest },
            camera: { type: 'pinned', digest: pinnedDigest },
          },
        },
        signal: new AbortController().signal,
      },
      runtime,
    );

    const descriptor = await session.getDescriptor({
      signal: new AbortController().signal,
    });
    const snapshot = await session.getSnapshot({
      signal: new AbortController().signal,
    });
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
        endpoint: { address: '192.0.2.10', port: 8883 },
        transport: 'tls',
        trust: { type: 'pinned', digest: pinnedDigest },
      }),
    );
    expect(descriptor).toMatchObject({
      id: '00M00A391800004',
      model: 'X1C',
      firmware: '01.08.02.00',
    });
    expect(snapshot).toMatchObject({
      activeRunId: 'run-1',
      run: {
        state: 'printing',
        progress: 42,
        remainingSeconds: 180,
        name: 'Cube',
        currentLayer: 12,
        totalLayers: 120,
        stage: 'Levelling the bed',
        speedProfile: 'standard',
        speedPercent: 100,
      },
      alerts: [
        {
          code: '0C00-0300-0003-000B',
          severity: 'warning',
          message: "The printer's camera and AI inspection raised a warning.",
          reference: 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0C00_0300_0003_000B',
        },
      ],
      setup: {
        materials: [
          { slot: 0, state: 'loaded', materialId: 'PLA', profileId: 'GFA00' },
          { slot: 1, state: 'empty' },
          { slot: 2, state: 'empty' },
          { slot: 3, state: 'empty' },
        ],
      },
      temperatures: { nozzleTarget: { value: 220 }, bedTarget: { value: 65 } },
      fans: { part: 100 },
      materialSystem: {
        currentSlot: 0,
        targetSlot: 0,
        units: [{ unit: 0, humidityIndex: 3 }],
      },
      network: { wifiSignalDbm: -47 },
      lights: { chamber: 'on' },
      removableStorage: 'present',
    });
    if (session.stillCapture.type !== 'supported') {
      throw new Error('Expected X1C RTSPS still capability');
    }
    await expect(session.stillCapture.capture({ signal: new AbortController().signal })).resolves.toMatchObject({
      mediaType: 'image/jpeg',
    });
    expect(captureNetworkStill).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: { address: '192.0.2.10', port: 322 },
        connectTimeout: 60_000,
        path: '/streaming/live/1',
        secretRef: 'vault:bambu-x1c',
        username: 'bblp',
        trust: { type: 'pinned', digest: pinnedDigest },
      }),
    );
    expect(JSON.stringify({ descriptor, snapshot })).not.toMatch(/access-code|192\.0\.2\.10|sha256:/u);
    expect(published).toEqual(expect.arrayContaining([expect.stringContaining('"command":"get_version"')]));
    const prepared = await session.preparePrint({
      operationId: 'prepared-1',
      expectedMachineId: '00M00A391800004',
      artifact,
      configuration,
      signal: new AbortController().signal,
    });
    expect(prepared).toMatchObject({
      status: 'ready',
      remoteName: 'tau-prepared-1.gcode.3mf',
      digest: artifactDigest,
      length: bytes.byteLength,
    });
    expect(uploadFile).not.toHaveBeenCalled();
    for (const unqualified of [referenceArchive, unnamedArchive]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each refusal is asserted in turn.
      await expect(
        session.preparePrint({
          operationId: 'prepared-unqualified',
          expectedMachineId: '00M00A391800004',
          artifact: artifactOf(unqualified),
          configuration,
          signal: new AbortController().signal,
        }),
      ).resolves.toEqual({
        status: 'rejected',
        code: 'ARTIFACT_UNQUALIFIED',
        message:
          'This file was not sliced by Bambu Studio. Slice it with Bambu Studio in Tau (desktop app with Bambu Studio installed), then send it again.',
        observedAt: '2026-09-14T00:00:01.000Z',
      });
    }
    await expect(
      session.preparePrint({
        operationId: 'prepared-2',
        expectedMachineId: '00M00A391800004',
        artifact,
        configuration: {
          ...configuration,
          operatorConfirmedBedType: 'cool_plate',
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'rejected', code: 'SETUP_UNQUALIFIED' });
    if (prepared.status !== 'ready') {
      throw new Error('Expected ready preparation');
    }
    const transfer = await session.uploadPrint({
      operationId: 'upload-1',
      expectedMachineId: '00M00A391800004',
      artifact,
      remoteName: prepared.remoteName,
      providerData: prepared.providerData,
      configuration,
      signal: new AbortController().signal,
    });
    expect(transfer).toEqual({
      status: 'transferred',
      transferId: 'tau-prepared-1.gcode.3mf',
      digest: artifactDigest,
      length: bytes.byteLength,
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
    if (transfer.status !== 'transferred') {
      throw new Error('Expected transferred upload');
    }
    await expect(
      session.submit({
        operationId: 'start-1',
        expectedMachineId: '00M00A391800004',
        artifact,
        remoteName: prepared.remoteName,
        transferId: transfer.transferId,
        providerData: prepared.providerData,
        configuration,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'accepted', providerRunId: 'run-2' });
    const completed = await session.getSnapshot({
      signal: new AbortController().signal,
    });
    expect(completed).toMatchObject({ readiness: 'idle' });
    expect(completed).not.toHaveProperty('activeRunId');
    // The printer may keep its last stage id after a run ends; a finished run shows no stage.
    expect(completed.run).not.toHaveProperty('stage');
    expect(published).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `"command":"project_file","param":"Metadata/plate_1.gcode","url":"ftp://tau-prepared-1.gcode.3mf","file":"tau-prepared-1.gcode.3mf"`,
        ),
      ]),
    );
    const project = published
      .map((payload) => JSON.parse(payload) as { print?: Record<string, unknown> })
      .find((payload) => payload.print?.['command'] === 'project_file')?.print;
    expect(project?.['sequence_id']).toMatch(/^\d{5}$/u);
    expect(project?.['project_id']).toMatch(/^[1-9]\d*$/u);
    expect(project?.['subtask_id']).toBe(project?.['project_id']);
    expect(project?.['task_id']).toBe(project?.['project_id']);
    expect(project?.['bed_type']).toBe('auto');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names are fixed.
    expect(project?.['ams_mapping2']).toEqual([{ ams_id: 0, slot_id: 0 }]);

    // A printer that starts without a correlated echo still confirms the start through its status, at once.
    const start = async (operationId: string) =>
      session.submit({
        operationId,
        expectedMachineId: '00M00A391800004',
        artifact,
        remoteName: prepared.remoteName,
        transferId: transfer.transferId,
        providerData: prepared.providerData,
        configuration,
        signal: new AbortController().signal,
      });
    const lastStart = (): Record<string, unknown> | undefined =>
      published
        .map((payload) => JSON.parse(payload) as { print?: Record<string, unknown> })
        .findLast((payload) => payload.print?.['command'] === 'project_file')?.print;
    try {
      startReply.mode = 'status-id';
      await expect(start('start-2')).resolves.toMatchObject({
        status: 'accepted',
        providerRunId: lastStart()?.['subtask_id'],
      });
      await expect(
        session.reconcile({ operationId: 'start-2', command: 'project_file', signal: new AbortController().signal }),
      ).resolves.toMatchObject({ status: 'accepted', providerRunId: lastStart()?.['subtask_id'] });
      // How each start settled reaches the host log by id alone, so a slow printer can be diagnosed from it.
      const logged = vi.mocked(runtime.log).mock.calls.map(([entry]) => entry.message);
      expect(logged).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^Start \d+ proven by reply accepted in the start window, \d+ ms and \d+ status reports after publishing;/u,
          ),
          expect.stringMatching(
            /^Start \d+ proven by status in the start window, .*; printer \w+, run id matches, run name \w+\.$/u,
          ),
        ]),
      );
      expect(logged.join('\n')).not.toMatch(/00M00A391800004|192\.0\.2\.10/u);
      startReply.mode = 'status-name';
      await expect(start('start-3')).resolves.toMatchObject({ status: 'accepted', providerRunId: '0' });
      await expect(session.getSnapshot({ signal: new AbortController().signal })).resolves.toMatchObject({
        activeRunId: '0',
      });
      // After a reconnect the transfer name still proves a start whose run carries only that name.
      await expect(
        session.reconcile({
          operationId: 'start-8',
          command: 'project_file',
          transferId: prepared.remoteName,
          signal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({ status: 'accepted', providerRunId: '0' });
      // A start this session never sent, whose id the printer's run does not carry, stays unproven.
      await expect(
        session.reconcile({ operationId: 'start-9', command: 'project_file', signal: new AbortController().signal }),
      ).resolves.toMatchObject({ status: 'unknown', reason: 'no-correlated-provider-reply' });
    } finally {
      startReply.mode = 'echo';
    }
    await session.close();
  });

  it('should offer the external spool as slot 254 and start from it with the AMS off', async () => {
    published.length = 0;
    versionReply.serial = '00M00A391800004';
    statusReply.externalSpool = true;
    const artifact = artifactOf(studioArchive);
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
      async *readArtifact() {
        yield studioArchive;
      },
      resolveSecret: vi.fn(async () => 'access-code'),
      uploadFile: vi.fn(async () => ({ bytesWritten: studioArchive.byteLength })),
    };
    const session = await connectBambuMachine(
      {
        candidate,
        configuration: { logicalId: 'workshop' },
        connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
        signal: new AbortController().signal,
      },
      runtime,
    );
    const { signal } = new AbortController();
    try {
      const snapshot = await session.getSnapshot({ signal });
      expect(snapshot.setup.materials.at(-1)).toEqual({
        slot: 254,
        state: 'loaded',
        materialId: 'PETG',
        profileId: 'GFG99',
        color: '#FFFFFF',
      });
      const prepare = async (
        overrides: Readonly<{
          amsMapping?: readonly number[];
          expectedMaterials?: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
        }>,
      ) =>
        session.preparePrint({
          operationId: 'prepared-external',
          expectedMachineId: '00M00A391800004',
          artifact,
          configuration: { ...configuration, ...overrides },
          signal,
        });
      await expect(
        prepare({
          amsMapping: [0, 254],
          expectedMaterials: [
            { slot: 0, materialId: 'PLA' },
            { slot: 254, materialId: 'PETG' },
          ],
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        code: 'SETUP_UNQUALIFIED',
        message: 'The external spool can only feed a one-filament print. Map every filament to an AMS tray.',
      });
      await expect(prepare({ expectedMaterials: [{ slot: 254, materialId: 'PLA' }] })).resolves.toMatchObject({
        status: 'rejected',
        code: 'SETUP_UNQUALIFIED',
      });
      const prepared = await prepare({});
      if (prepared.status !== 'ready') {
        throw new Error('Expected ready preparation');
      }
      await expect(
        session.submit({
          operationId: 'start-external',
          expectedMachineId: '00M00A391800004',
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
      await session.close();
    }
  });

  it('should reject an upload the printer refuses to store and keep a lost transfer unknown', async () => {
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
        configuration: { logicalId: 'workshop' },
        connection: { secretRef: 'vault:bambu-x1c', serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } } },
        signal: new AbortController().signal,
      },
      runtime,
    );
    const { signal } = new AbortController();
    try {
      const prepared = await session.preparePrint({
        operationId: 'prepared-refused',
        expectedMachineId: '00M00A391800004',
        artifact,
        configuration,
        signal,
      });
      if (prepared.status !== 'ready') {
        throw new Error('Expected ready preparation');
      }
      const upload = async () =>
        session.uploadPrint({
          operationId: 'upload-refused',
          expectedMachineId: '00M00A391800004',
          artifact,
          remoteName: prepared.remoteName,
          providerData: prepared.providerData,
          configuration,
          signal,
        });
      await expect(upload()).resolves.toEqual({
        status: 'rejected',
        code: 'TRANSFER_REFUSED',
        message:
          'The printer refused to store the file (FTP 550), so nothing was started. Its microSD card may be full, ' +
          'damaged or locked: free space on it or format it on the printer, then send again.',
        observedAt: '2026-09-14T00:00:01.000Z',
      });
      expect(log).toHaveBeenCalledWith({
        level: 'warning',
        message: `FTPS upload of ${prepared.remoteName} failed: MACHINE_UPLOAD_REFUSED (550 )`,
      });
      // A transfer that broke off may have reached the printer, so its result stays unknown.
      await expect(upload()).resolves.toEqual({
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
        configuration: {
          logicalId: 'Workshop',
          address: 'x1c.local',
          serial: '00M00A391800004',
        },
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
        candidate: { endpoint: { address: 'x1c.local', interface: 'manual' } },
      },
    ]);
    expect(listenDatagrams).not.toHaveBeenCalled();
  });

  it('should listen on UDP 2021 for two advertisement periods so a pass cannot fall between them', async () => {
    const listenDatagrams = vi.fn(async function* () {
      yield* [];
    });
    for await (const _event of discoverBambuMachines(
      { configuration: { logicalId: 'discovery' }, signal: new AbortController().signal },
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
          configuration: { logicalId: 'workshop' },
          connection: { secretRef: 'vault:bambu-x1c', serviceTrust },
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
          configuration: { logicalId: 'workshop' },
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: { mqtt: { type: 'pinned', digest: pinnedDigest } },
          },
          signal: new AbortController().signal,
        },
        runtime,
      ),
    ).rejects.toThrow('BAMBU_MQTT_CONNECT_FAILED');
    versionReply.serial = '00M00A391800004';
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
      versionReply.serial = '0300EA652800550';
      statusReply.printerType = 'N1';
      const session = await connectBambuMachine(
        {
          candidate: { ...candidate, claimedIdentity: { model: 'A1 mini', serial: versionReply.serial } },
          configuration: { logicalId: 'Mini' },
          connection: {
            secretRef: 'vault:mini',
            serviceTrust: {
              mqtt: { type: 'pinned', digest: pinnedDigest },
              camera: { type: 'pinned', digest: pinnedDigest },
            },
          },
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
      expect(await session.getDescriptor({ signal: new AbortController().signal })).toMatchObject({
        model: 'A1 mini',
        printableEnvelope: { width: 0.18, depth: 0.18, height: 0.18 },
        materialSystem: { slotCount: 4 },
      });
      const snapshot = await session.getSnapshot({ signal: new AbortController().signal });
      expect(snapshot.lights?.chamber).toBeUndefined();
      expect(snapshot.temperatures?.chamber).toBeUndefined();
      expect(snapshot.fans?.auxiliary).toBeUndefined();
      if (session.stillCapture.type !== 'supported') {
        throw new Error('Expected Mini camera');
      }
      const still = await session.stillCapture.capture({ signal: new AbortController().signal });
      expect(still.bytes).toEqual(jpeg);
      expect(connectStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          endpoint: { address: '192.0.2.10', port: 6000 },
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
      versionReply.serial = '00M00A391800004';
      statusReply.printerType = 'BL-P001';
    }
  });

  it('should offer stills only for an X1C whose host captures them over the pinned camera', async () => {
    const captureNetworkStill: NonNullable<MachineConnectionRuntime['captureNetworkStill']> = vi.fn();
    const connect = async (hostCaptures: boolean) =>
      connectBambuMachine(
        {
          candidate,
          configuration: { logicalId: 'workshop' },
          connection: {
            secretRef: 'vault:bambu-x1c',
            serviceTrust: {
              mqtt: { type: 'pinned', digest: pinnedDigest },
              camera: { type: 'pinned', digest: pinnedDigest },
            },
          },
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
      await expect(connect(true)).rejects.toThrow('BAMBU_MQTT_CONNECT_FAILED');
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

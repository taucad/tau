import { createHash, randomUUID } from 'node:crypto';
import { on } from 'node:events';
import { isIP } from 'node:net';
import { Duplex } from 'node:stream';

import type {
  MachineConnectInput,
  MachineConnectionRuntime,
  MachineCommandReceipt,
  MachineDescriptor,
  MachineDiscoveryInput,
  MachineDiscoveryEvent,
  MachineDiscoveryRuntime,
  MachineNetworkStream,
  MachineSession,
  MachineSnapshot,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import { checkOperation, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { Client as FtpClientConstructor } from 'basic-ftp';
import type { MqttClient as MqttClientConstructor } from 'mqtt';

import type { BambuCommandResult, BambuModel, BambuStatus } from '#bambu.protocol.js';
import {
  bambuExternalSpoolSlot,
  bambuRemoteName,
  bambuStage,
  bambuTopic,
  definedFields,
  isBambuSerial,
  parseBambuStill,
  mergeBambuStatus,
  parseBambuCommandPayload,
  parseBambuDiscoveryDatagram,
  parseBambuStatusPayload,
  parseBambuVersionPayload,
} from '#bambu.protocol.js';
import { prepareBambuArtifact } from '#bambu.archive.js';
import { bambuA1MiniManifest, bambuX1cManifest } from '#bambu.manifest.js';

type Binding = Readonly<{
  logicalId: string;
  address?: string;
  serial?: string;
}>;
type Submission = Readonly<{
  amsMapping: readonly number[];
  bedLeveling: boolean;
  expectedBedType: string;
  expectedFilamentDiameter: number;
  expectedMaterials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
  expectedModel: BambuModel;
  expectedNozzleDiameter: number;
  operatorConfirmedBedType?: string;
  flowCalibration: boolean;
  timelapse: boolean;
}>;
const serialIdentifier = /^[A-Za-z0-9_-]{1,64}$/u;
const remoteNamePattern = /^tau-[A-Za-z0-9_-]{1,64}\.gcode\.3mf$/u;
const memberMd5Pattern = /^[0-9a-f]{32}$/u;
const bambuWireId = (operationId: string): string =>
  String(
    Number(BigInt(`0x${createHash('sha256').update(operationId).digest('hex').slice(0, 8)}`) % 2_147_483_646n) + 1,
  );
const bambuWireSequenceId = (operationId: string): string =>
  String(10_000 + (Number(bambuWireId(operationId)) % 90_000));
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const filamentDiameter = createQuantity({
  value: 1.75,
  unit: 'mm',
  kind: quantityKinds.diameter,
  space: 'linear',
  semanticMode: 'declared-only',
});
if (filamentDiameter.status !== 'success') {
  throw new Error('BAMBU_PROVIDER_UNITS_INVALID');
}

/**
 * Every tray the printer reports, by its flat tray id: the AMS trays, then the external spool.
 *
 * @param facts - The merged status.
 * @returns The snapshot's materials.
 */
const observedMaterials = (facts: BambuStatus): NonNullable<BambuStatus['materials']> => [
  ...(facts.materials ?? []),
  ...(facts.externalMaterial ? [facts.externalMaterial] : []),
];

const sameQuantity = (observed: Quantity | undefined, declared: number): boolean => {
  if (!observed) {
    return false;
  }
  const expected = createQuantity({
    value: declared,
    unit: 'mm',
    kind: quantityKinds.diameter,
    space: 'linear',
    semanticMode: 'declared-only',
  });
  if (expected.status !== 'success') {
    return false;
  }
  const compared = checkOperation({
    operator: 'compare',
    left: observed,
    right: expected.value,
  });
  return compared.status === 'success' && compared.value.value === 0;
};

/**
 * How long a discovery pass listens. An X1C advertises on UDP 2021 about every
 * 5.05 s (5.0–5.1 s measured on 192.168.0.112, 2026-09-26), so a pass as long
 * as one period misses the printer whenever it starts just after an
 * advertisement; two periods plus a margin always hear one. Milliseconds.
 */
const advertisementWindow = 11_000;

/** Execute one bounded provider discovery pass through the host-owned datagram port.
 * @param input - Qualified provider configuration and cancellation.
 * @param runtime - Host-owned bounded datagram authority.
 * @param model - Model admitted by this provider.
 * @returns Normalized discovery events.
 */
export async function* discoverBambuMachines(
  input: MachineDiscoveryInput<Binding>,
  runtime: MachineDiscoveryRuntime,
  model: BambuModel = 'X1C',
): AsyncGenerator<MachineDiscoveryEvent> {
  if (input.configuration.address) {
    const { address } = input.configuration;
    if (input.configuration.serial && !isBambuSerial(input.configuration.serial, model)) {
      throw new TypeError('BAMBU_SERIAL_INVALID');
    }
    if (
      (/^[0-9.]+$/u.test(address) && isIP(address) !== 4) ||
      !/^(?=.{1,253}$)(?!.*[\s/\\?#@])(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/u.test(address)
    ) {
      throw new TypeError('BAMBU_MANUAL_ADDRESS_INVALID');
    }
    const observedAt = runtime.clock.now();
    yield Object.freeze({
      type: 'found',
      candidate: Object.freeze({
        id: `${model === 'X1C' ? 'bambu' : 'bambu-a1-mini'}:${input.configuration.serial ?? address}`,
        name: input.configuration.logicalId,
        endpoint: Object.freeze({ address, interface: 'manual' }),
        claimedIdentity: Object.freeze({
          serial: input.configuration.serial,
          model,
        }),
        observedAt,
        expiresAt: new Date(Date.parse(observedAt) + 30_000).toISOString(),
      }),
    });
    return;
  }
  const seen = new Set<string>();
  for await (const datagram of runtime.listenDatagrams({
    port: 2021,
    durationMs: advertisementWindow,
    maximumDatagrams: 128,
    maximumDatagramBytes: 8192,
    signal: input.signal,
  })) {
    input.signal.throwIfAborted();
    try {
      const observedAt = runtime.clock.now();
      const candidate = parseBambuDiscoveryDatagram({
        datagram,
        observedAt,
        expiresAt: new Date(Date.parse(observedAt) + 30_000).toISOString(),
      });
      if (candidate.claimedIdentity.model !== model) {
        continue;
      }
      const type = seen.has(candidate.id) ? 'updated' : 'found';
      seen.add(candidate.id);
      yield Object.freeze({ type, candidate });
    } catch {
      // Malformed advertisements are untrusted ambient LAN noise, not discovery failures.
    }
  }
}

/** Load the two reviewed host protocol libraries without exposing them from the package root.
 * @returns Lazy host-only library constructors.
 */
export const loadBambuHostLibraries = async (): Promise<
  Readonly<{
    ftpClient: typeof FtpClientConstructor;
    mqttClient: typeof MqttClientConstructor;
  }>
> => {
  const [{ Client: ftpClient }, { MqttClient: mqttClient }] = await Promise.all([import('basic-ftp'), import('mqtt')]);
  return Object.freeze({ ftpClient, mqttClient });
};

const toDuplex = (stream: MachineNetworkStream): Duplex => {
  let closing: Promise<void> | undefined;
  const close = async (): Promise<void> => {
    closing ??= stream.close();
    await closing;
    await reading;
  };
  const settle = (operation: Promise<void>, callback: (error?: Error) => void, code: string): void => {
    // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- Node Duplex owns callback settlement.
    void operation.then(
      () => {
        callback();
      },
      () => {
        callback(new Error(code));
      },
    );
  };
  const duplex = new Duplex({
    read() {
      // The host stream pump below owns incoming reads.
    },
    write(chunk, _encoding, callback) {
      if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
        callback(new TypeError('BAMBU_MQTT_WRITE_INVALID'));
        return;
      }
      settle(
        stream.write(Uint8Array.from(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)),
        callback,
        'BAMBU_MQTT_WRITE_FAILED',
      );
    },
    writev(chunks, callback) {
      // MQTT packet encoding corks one packet. Preserve that batch in one TLS write: Mini's broker drops fragmented CONNECTs.
      const bytes = Buffer.concat(
        chunks.map(({ chunk }: { readonly chunk: unknown }) => {
          if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
            throw new TypeError('BAMBU_MQTT_WRITE_INVALID');
          }
          return typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        }),
      );
      settle(stream.write(Uint8Array.from(bytes)), callback, 'BAMBU_MQTT_WRITE_FAILED');
    },
    final(callback) {
      settle(close(), callback, 'BAMBU_MQTT_CLOSE_FAILED');
    },
    destroy(error, callback) {
      settle(
        close(),
        (closeError) => {
          callback(error ?? closeError);
        },
        'BAMBU_MQTT_CLOSE_FAILED',
      );
    },
  });
  const read = async (): Promise<void> => {
    try {
      for await (const chunk of stream.readable) {
        if (!duplex.push(Buffer.from(chunk))) {
          await new Promise<void>((resolve) => {
            duplex.once('resume', resolve);
          });
        }
      }
      duplex.push(null);
    } catch {
      duplex.destroy(new Error('BAMBU_MQTT_READ_FAILED'));
    }
  };
  const reading = read();
  return duplex;
};

const mapRunState = (
  state: ReturnType<typeof parseBambuStatusPayload>['runState'],
): NonNullable<MachineSnapshot['run']>['state'] => {
  switch (state) {
    case 'failed':
    case 'finishing':
    case 'paused':
    case 'printing':
    case 'succeeded': {
      return state;
    }
    case 'downloading':
    case 'heating':
    case 'preparing': {
      return 'preparing';
    }
    case 'none': {
      return 'idle';
    }
    default: {
      return 'unknown';
    }
  }
};

const maximumCameraBytes = 4 * 1024 * 1024;

/**
 * Resolve the printer's access code from the host vault. It stays in the session and never reaches a log or error.
 *
 * @param input - Admitted connection input naming the secret.
 * @param runtime - Host secret resolution.
 * @returns The access code.
 */
const resolveAccessCode = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
): Promise<string> => {
  let accessCode: string;
  try {
    accessCode = await runtime.resolveSecret({
      reference: input.connection.secretRef,
      signal: input.signal,
    });
  } catch {
    throw new Error('BAMBU_SECRET_RESOLUTION_FAILED');
  }
  if (accessCode.length === 0 || accessCode.length > 256 || !accessCode.isWellFormed()) {
    throw new Error('BAMBU_ACCESS_CODE_INVALID');
  }
  return accessCode;
};

/**
 * Open the pinned TLS stream that MQTT runs over.
 *
 * @param input - Admitted connection input naming the printer.
 * @param runtime - Host network authority.
 * @param trust - The MQTT service's pinned trust.
 * @returns The open stream.
 */
const openMqttStream = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  trust: MachineTransportTrust,
): Promise<MachineNetworkStream> => {
  try {
    return await runtime.connectStream({
      endpoint: { address: input.candidate.endpoint.address, port: 8883 },
      transport: 'tls',
      trust,
      connectTimeout: 10_000,
      idleTimeout: 90_000,
      maximumReadBytes: 4 * 1024 * 1024,
      maximumWriteBytes: 256 * 1024,
      signal: input.signal,
    });
  } catch (error) {
    // A certificate that no longer matches its pin needs a new binding, so the host stops retrying it.
    throw new Error(
      error instanceof Error && error.message === 'MACHINE_TLS_PIN_MISMATCH'
        ? 'BAMBU_CERTIFICATE_CHANGED'
        : 'BAMBU_MQTT_TRANSPORT_FAILED',
    );
  }
};

/** Capture one bounded A1 mini JPEG frame over its pinned TLS camera service.
 * @param input - Admitted connection input.
 * @param runtime - Host-owned network and secret authority.
 * @param signal - Cancels this capture independently of the observation session.
 * @returns The first complete JPEG frame.
 */
const captureA1MiniStill = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  signal: AbortSignal,
) => {
  const accessCode = await resolveAccessCode(input, runtime);
  if (Buffer.byteLength(accessCode) > 32) {
    throw new Error('BAMBU_CAMERA_ACCESS_CODE_INVALID');
  }
  const trust = input.connection.serviceTrust['camera'];
  if (trust?.type !== 'pinned') {
    throw new Error('BAMBU_CAMERA_PIN_REQUIRED');
  }
  const captureSignal = AbortSignal.any([signal, input.signal, AbortSignal.timeout(60_000)]);
  const stream = await runtime.connectStream({
    endpoint: { address: input.candidate.endpoint.address, port: 6000 },
    transport: 'tls',
    trust,
    connectTimeout: 10_000,
    idleTimeout: 60_000,
    maximumReadBytes: maximumCameraBytes + 16,
    maximumWriteBytes: 80,
    signal: captureSignal,
  });
  try {
    const auth = Buffer.alloc(80);
    auth.writeUInt32LE(0x40, 0);
    auth.writeUInt32LE(0x30_00, 4);
    auth.write('bblp', 16, 32, 'utf8');
    auth.write(accessCode, 48, 32, 'utf8');
    await stream.write(auth);
    const header = Buffer.alloc(16);
    let headerBytes = 0;
    let frame: Uint8Array<ArrayBuffer> | undefined;
    let frameBytes = 0;
    for await (const chunk of stream.readable) {
      captureSignal.throwIfAborted();
      let offset = 0;
      if (headerBytes < header.length) {
        const count = Math.min(header.length - headerBytes, chunk.length);
        header.set(chunk.subarray(0, count), headerBytes);
        headerBytes += count;
        offset = count;
        if (headerBytes < header.length) {
          continue;
        }
        const length = header.readUInt32LE(0);
        if (length < 4 || length > maximumCameraBytes) {
          throw new Error('BAMBU_CAMERA_FRAME_INVALID');
        }
        frame = new Uint8Array(length);
      }
      if (frame) {
        const count = Math.min(frame.length - frameBytes, chunk.length - offset);
        frame.set(chunk.subarray(offset, offset + count), frameBytes);
        frameBytes += count;
        if (frameBytes === frame.length) {
          return parseBambuStill(frame, runtime.clock.now());
        }
      }
    }
    throw new Error('BAMBU_CAMERA_FRAME_INCOMPLETE');
  } finally {
    await stream.close();
  }
};

/**
 * An X1C's still: the host captures one frame from the pinned RTSPS camera. Another model's camera needs its own
 * manifest and pin; the A1 mini uses framed JPEG over TLS instead.
 *
 * @param input - Admitted connection input with the camera trust and secret.
 * @param runtime - Host capture authority.
 * @param model - The printer's model, from its status or its discovery.
 * @returns The session's still capability.
 */
const bambuStillCapture = (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  model: string | undefined,
): MachineSession<Submission>['stillCapture'] => {
  const trust = input.connection.serviceTrust['camera'];
  const { captureNetworkStill } = runtime;
  if (trust?.type !== 'pinned' || (model !== 'A1 mini' && (model !== 'X1C' || !captureNetworkStill))) {
    return Object.freeze({ type: 'unsupported' });
  }
  return Object.freeze({
    type: 'supported',
    async capture(captureInput: Readonly<{ signal: AbortSignal }>) {
      if (model === 'A1 mini') {
        return captureA1MiniStill(input, runtime, captureInput.signal);
      }
      if (!captureNetworkStill) {
        throw new Error('BAMBU_CAMERA_UNSUPPORTED');
      }
      return captureNetworkStill({
        endpoint: {
          address: input.candidate.endpoint.address,
          port: 322,
        },
        trust,
        secretRef: input.connection.secretRef,
        username: 'bblp',
        path: '/streaming/live/1',
        connectTimeout: 60_000,
        maximumBytes: maximumCameraBytes,
        signal: captureInput.signal,
      });
    },
  });
};

/** Connect one host-owned, pinned MQTTS observation session.
 * @param input - Admitted connection input.
 * @param runtime - Host-owned secret, clock, log and bounded network services.
 * @param model - Model and hardware manifest selected by the provider.
 * @returns One live machine session. The simulator is a separate provider (`bambuSimulatorMachine`).
 */
export const connectBambuMachine = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  model: BambuModel = 'X1C',
): Promise<MachineSession<Submission>> => {
  const manifest = model === 'X1C' ? bambuX1cManifest : bambuA1MiniManifest;
  if (input.candidate.endpoint.address !== 'simulator.invalid') {
    const serial = input.candidate.claimedIdentity.serial ?? input.configuration.serial;
    if (!serial || !isBambuSerial(serial, model)) {
      throw new TypeError('BAMBU_SERIAL_REQUIRED');
    }
    const trust = input.connection.serviceTrust['mqtt'];
    if (trust?.type !== 'pinned') {
      throw new Error('BAMBU_MQTT_PIN_REQUIRED');
    }
    const accessCode = await resolveAccessCode(input, runtime);
    const network = await openMqttStream(input, runtime, trust);
    let client: MqttClientConstructor;
    try {
      const { mqttClient: mqttClientConstructor } = await loadBambuHostLibraries();
      // oxlint-disable-next-line new-cap -- dependency constructor is returned by a lazy camel-case property.
      client = new mqttClientConstructor(() => toDuplex(network), {
        clean: true,
        clientId: `tau-${randomUUID()}`,
        connectTimeout: 10_000,
        keepalive: 30,
        log: () => undefined,
        password: accessCode,
        protocol: 'mqtt',
        protocolVersion: 4,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- upstream MQTT.js option.
        queueQoSZero: false,
        reconnectPeriod: 0,
        resubscribe: false,
        username: 'bblp',
      });
    } catch {
      await network.close().catch(() => undefined);
      throw new Error('BAMBU_MQTT_CLIENT_FAILED');
    }
    const updates = new EventTarget();
    const commandContexts = new Map<string, 'pause' | 'project_file' | 'resume' | 'stop'>();
    // The run name each start in this session asked for; the wire id is derived from the operation.
    const startRunNames = new Map<string, string>();
    const commandResults = new Map<string, Readonly<{ result: BambuCommandResult; observedAt: string }>>();
    let closed = false;
    let firmware: string | undefined;
    let status: ReturnType<typeof parseBambuStatusPayload> | undefined;
    let statusObservedAt: string | undefined;
    /** Status reports merged in this session; start diagnostics count the reports a window saw. */
    let statusReports = 0;
    let versionSerial: string | undefined;
    let versionModel: string | undefined;
    const snapshot = (): MachineSnapshot => {
      const state = status ? mapRunState(status.runState) : 'unknown';
      const active = state === 'paused' || state === 'preparing' || state === 'printing' || state === 'finishing';
      const facts: BambuStatus = status ?? {};
      return Object.freeze({
        connection: client.connected ? 'connected' : 'disconnected',
        readiness: active ? 'busy' : state === 'idle' || state === 'succeeded' ? 'idle' : 'unknown',
        ...definedFields({ activeRunId: active ? facts.providerRunId : undefined }),
        observedAt: statusObservedAt ?? runtime.clock.now(),
        setup: Object.freeze({
          toolId: 'tool-0',
          ...definedFields({ bedType: facts.bedType }),
          materials: observedMaterials(facts),
        }),
        run: Object.freeze({
          state,
          ...definedFields({
            progress: facts.progress,
            remainingSeconds: facts.remainingSeconds,
            name: facts.runName,
            file: facts.runFile,
            currentLayer: facts.currentLayer,
            totalLayers: facts.totalLayers,
            stage: active ? bambuStage(facts.stageId) : undefined,
            printType: facts.printType,
            speedProfile: facts.speedProfile,
            speedPercent: facts.speedPercent,
          }),
        }),
        temperatures: definedFields({
          nozzle: facts.nozzleTemperature,
          nozzleTarget: facts.nozzleTargetTemperature,
          bed: facts.bedTemperature,
          bedTarget: facts.bedTargetTemperature,
          chamber: model === 'X1C' ? facts.chamberTemperature : undefined,
        }),
        fans: definedFields({
          part: facts.partFanPercent,
          auxiliary: model === 'X1C' ? facts.auxiliaryFanPercent : undefined,
          chamber: model === 'X1C' ? facts.chamberFanPercent : undefined,
        }),
        materialSystem: Object.freeze({
          ...definedFields({ currentSlot: facts.currentMaterialSlot, targetSlot: facts.targetMaterialSlot }),
          units: facts.materialUnits ?? [],
        }),
        network: definedFields({ wifiSignalDbm: facts.wifiSignalDbm }),
        lights: definedFields({ chamber: model === 'X1C' ? facts.chamberLight : undefined }),
        ...definedFields({ removableStorage: facts.removableStorage, alerts: facts.alerts }),
      });
    };
    client.on('message', (topic, message) => {
      if (topic !== bambuTopic(serial, 'report')) {
        return;
      }
      try {
        const version = parseBambuVersionPayload(Uint8Array.from(message));
        firmware = version.firmware;
        versionSerial = version.serial;
        versionModel = version.model;
        updates.dispatchEvent(new Event('facts'));
        return;
      } catch {
        // The same bounded provider payload may be a status or command result.
      }
      for (const [sequence, command] of commandContexts) {
        try {
          const result = parseBambuCommandPayload({
            bytes: Uint8Array.from(message),
            command,
            sequence: bambuWireSequenceId(sequence),
          });
          if (result.status !== 'unrelated') {
            commandResults.set(sequence, Object.freeze({ result, observedAt: runtime.clock.now() }));
            updates.dispatchEvent(new Event(`command:${sequence}`));
            return;
          }
        } catch {
          // The same bounded provider payload may be an unrelated status report.
        }
      }
      try {
        status = mergeBambuStatus(status, parseBambuStatusPayload(Uint8Array.from(message)));
        statusObservedAt = runtime.clock.now();
        statusReports += 1;
        updates.dispatchEvent(new Event('facts'));
        updates.dispatchEvent(new CustomEvent('snapshot', { detail: snapshot() }));
      } catch {
        // Untrusted payloads are discarded without retaining bytes or error detail.
      }
    });
    client.on('close', () => {
      updates.dispatchEvent(new CustomEvent('snapshot', { detail: snapshot() }));
    });
    client.on('error', () => {
      runtime.clock.now();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const connected = (): void => {
          cleanup();
          resolve();
        };
        const failed = (): void => {
          cleanup();
          reject(new Error('BAMBU_MQTT_CONNECT_FAILED'));
        };
        const aborted = (): void => {
          cleanup();
          reject(new Error('BAMBU_MQTT_CONNECT_ABORTED'));
        };
        const cleanup = (): void => {
          client.off('connect', connected);
          client.off('error', failed);
          input.signal.removeEventListener('abort', aborted);
        };
        client.once('connect', connected);
        client.once('error', failed);
        input.signal.addEventListener('abort', aborted, { once: true });
      });
      await client.subscribeAsync(bambuTopic(serial, 'report'), { qos: 0 });
      await client.publishAsync(
        bambuTopic(serial, 'request'),
        '{"pushing":{"sequence_id":"0","command":"pushall","version":1,"push_target":1}}',
        { qos: 0 },
      );
      await client.publishAsync(bambuTopic(serial, 'request'), '{"info":{"sequence_id":"0","command":"get_version"}}', {
        qos: 0,
      });
      if (!status || !firmware || !versionSerial) {
        await new Promise<void>((resolve) => {
          const initialFactsTimeout = setTimeout(finish, 15_000);
          function finish(): void {
            clearTimeout(initialFactsTimeout);
            updates.removeEventListener('facts', observed);
            input.signal.removeEventListener('abort', finish);
            resolve();
          }
          function observed(): void {
            if (status && firmware && versionSerial) {
              finish();
            }
          }
          updates.addEventListener('facts', observed);
          input.signal.addEventListener('abort', finish, { once: true });
          observed();
        });
      }
      input.signal.throwIfAborted();
      if (
        !status ||
        !firmware ||
        versionSerial !== serial ||
        (versionModel !== undefined && versionModel !== model) ||
        (status.model !== undefined && status.model !== model)
      ) {
        throw new Error('BAMBU_INITIAL_FACTS_INVALID');
      }
    } catch {
      await client.endAsync(true).catch(() => undefined);
      throw new Error('BAMBU_MQTT_CONNECT_FAILED');
    }
    const close = async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      await client.endAsync(true).catch(() => undefined);
    };
    /**
     * The run a start produced, from the printer's own status: its run carries the `subtask_id` or
     * `subtask_name` the start sent. An X1C may start without an echo Tau can correlate, so the
     * printer's status is start evidence in its own right.
     *
     * @param operationId - The start's operation, whose wire id the command sent.
     * @param transferId - The start's transfer, whose name the command sent; only needed after a reconnect.
     * @returns The printer's run id for that start, or `undefined` while its status shows no such run.
     */
    const startedRunId = (operationId: string, transferId?: string): string | undefined => {
      const wireId = bambuWireId(operationId);
      const runName =
        startRunNames.get(operationId) ??
        (transferId !== undefined && remoteNamePattern.test(transferId)
          ? transferId.replace('.gcode.3mf', '')
          : undefined);
      // A name is reused when the same preparation is sent again, so only a live run proves it.
      const runState = status ? mapRunState(status.runState) : 'unknown';
      const isLive = runState === 'preparing' || runState === 'printing' || runState === 'paused';
      const isOurs =
        status?.providerRunId === wireId || (isLive && runName !== undefined && status?.runName === runName);
      return isOurs ? (status?.providerRunId ?? wireId) : undefined;
    };
    const commandReceipt = (
      operationId: string,
      command: 'pause' | 'project_file' | 'resume' | 'stop',
      transferId?: string,
    ): MachineSubmissionReceipt => {
      const stored = commandResults.get(operationId);
      const runId = command === 'project_file' ? startedRunId(operationId, transferId) : undefined;
      if ((!stored || stored.result.status === 'unrelated') && runId !== undefined) {
        return Object.freeze({
          status: 'accepted',
          providerRunId: runId,
          observedAt: statusObservedAt ?? runtime.clock.now(),
        });
      }
      if (!stored || stored.result.status === 'unrelated') {
        return Object.freeze({
          status: 'unknown',
          reason: 'reply-lost-after-possible-acceptance',
          observedAt: runtime.clock.now(),
        });
      }
      if (stored.result.status === 'rejected') {
        return Object.freeze({
          status: 'rejected',
          code: 'PROVIDER_REJECTED',
          message: stored.result.reason,
          observedAt: stored.observedAt,
        });
      }
      const providerRunId = stored.result.providerRunId ?? runId;
      return Object.freeze({
        status: 'accepted',
        ...(providerRunId ? { providerRunId } : {}),
        observedAt: stored.observedAt,
      });
    };
    /** When each start of this session was published, and how many status reports had arrived by then. */
    const startWindows = new Map<string, Readonly<{ publishedAt: number; reportsBefore: number }>>();
    /**
     * Record how a start settled, or what the printer last showed when it did not, so a start the printer has not proven
     * can be diagnosed from the host log (blueprint x1c-start-confirmation R7). Ids only: no payload bytes, serials or
     * addresses.
     *
     * @param operationId - The start's operation.
     * @param phase - The provider's own start window, or a later reconciliation.
     * @returns Once the log entry is written or dropped.
     */
    const logStart = async (operationId: string, phase: 'window' | 'reconciliation'): Promise<void> => {
      const wireId = bambuWireId(operationId);
      const stored = commandResults.get(operationId);
      const proof = stored ? `reply ${stored.result.status}` : startedRunId(operationId) ? 'status' : undefined;
      const window = startWindows.get(operationId);
      const since = window
        ? `${String(Date.parse(runtime.clock.now()) - window.publishedAt)} ms and ${String(statusReports - window.reportsBefore)} status reports after publishing`
        : 'after a reconnect';
      const facts = `printer ${status?.runState ?? 'unreported'}, run id ${status?.providerRunId === wireId ? 'matches' : 'differs'}, run name ${status?.runName !== undefined && status.runName === startRunNames.get(operationId) ? 'matches' : 'differs'}`;
      await runtime
        .log({
          level: 'info',
          message: `Start ${wireId} ${proof ? `proven by ${proof}` : 'not yet proven'} ${phase === 'window' ? 'in the start window' : 'on reconciliation'}, ${since}; ${facts}.`,
        })
        .catch(() => undefined);
    };
    const sendCommand = async (
      commandInput: Readonly<{
        operationId: string;
        command: 'pause' | 'project_file' | 'resume' | 'stop';
        payload: Readonly<Record<string, unknown>>;
        signal: AbortSignal;
      }>,
    ): Promise<MachineSubmissionReceipt> => {
      if (!serialIdentifier.test(commandInput.operationId)) {
        throw new TypeError('BAMBU_OPERATION_ID_INVALID');
      }
      const existing = commandContexts.get(commandInput.operationId);
      if (existing) {
        if (existing !== commandInput.command) {
          throw new Error('BAMBU_OPERATION_ID_CONFLICT');
        }
        return commandReceipt(commandInput.operationId, commandInput.command);
      }
      // Ponytail: one live session retains at most 128 reconciliation slots; reconnect after operator resolution if exhausted.
      if (commandContexts.size >= 128) {
        return Object.freeze({
          status: 'rejected',
          code: 'COMMAND_LEDGER_FULL',
          message: 'The live provider reconciliation ledger is full.',
          observedAt: runtime.clock.now(),
        });
      }
      commandInput.signal.throwIfAborted();
      commandContexts.set(commandInput.operationId, commandInput.command);
      if (commandInput.command === 'project_file') {
        startWindows.set(commandInput.operationId, {
          publishedAt: Date.parse(runtime.clock.now()),
          reportsBefore: statusReports,
        });
      }
      try {
        await client.publishAsync(bambuTopic(serial, 'request'), JSON.stringify(commandInput.payload), { qos: 0 });
      } catch {
        return commandReceipt(commandInput.operationId, commandInput.command);
      }
      const isSettled = (): boolean =>
        commandResults.has(commandInput.operationId) ||
        (commandInput.command === 'project_file' && startedRunId(commandInput.operationId) !== undefined);
      if (!isSettled()) {
        await new Promise<void>((resolve) => {
          const eventName = `command:${commandInput.operationId}`;
          const commandTimeout = setTimeout(finish, 15_000);
          function finish(): void {
            clearTimeout(commandTimeout);
            updates.removeEventListener(eventName, finish);
            updates.removeEventListener('facts', observed);
            commandInput.signal.removeEventListener('abort', finish);
            resolve();
          }
          function observed(): void {
            if (isSettled()) {
              finish();
            }
          }
          updates.addEventListener(eventName, finish, { once: true });
          updates.addEventListener('facts', observed);
          commandInput.signal.addEventListener('abort', finish, { once: true });
        });
      }
      if (commandInput.command === 'project_file') {
        await logStart(commandInput.operationId, 'window');
      }
      return commandReceipt(commandInput.operationId, commandInput.command);
    };
    const stillCapture = bambuStillCapture(input, runtime, status.model ?? input.candidate.claimedIdentity.model);
    const session: MachineSession<Submission> = {
      stillCapture,
      async getDescriptor(descriptorInput): Promise<MachineDescriptor> {
        descriptorInput.signal.throwIfAborted();
        const descriptor: MachineDescriptor = {
          id: serial,
          name: input.candidate.name,
          vendor: 'Bambu Lab',
          model,
          technology: 'additive.fff',
          firmware: firmware ?? status?.firmware ?? 'unknown',
          accepts: [
            {
              contract: {
                id: 'manufacturing.toolpath.bambu-gcode-3mf',
                version: 1,
              },
              mediaType: 'application/vnd.bambulab.gcode-3mf',
              requiredMembers: ['Metadata/plate_1.gcode'],
              payloadSelection: 'plate',
              technology: 'additive.fff',
            },
          ],
          operations: [
            'observe',
            'prepare',
            'upload',
            'submit',
            'pause',
            'resume',
            'cancel',
            'urgent-stop',
            ...(stillCapture.type === 'supported' ? ['still'] : []),
          ],
          ratedEnvelope: {
            width: manifest.geometry.buildVolume.x / 1000,
            depth: manifest.geometry.buildVolume.y / 1000,
            height: manifest.geometry.buildVolume.z / 1000,
            unit: 'm',
          },
          printableEnvelope: {
            width: manifest.geometry.buildVolume.x / 1000,
            depth: manifest.geometry.buildVolume.y / 1000,
            height: manifest.geometry.buildVolume.z / 1000,
            unit: 'm',
          },
          tools: [
            {
              id: 'tool-0',
              kind: 'extruder',
              ...(status?.nozzleDiameter ? { nozzleDiameter: status.nozzleDiameter } : {}),
            },
          ],
          materialSystem: { kind: model === 'X1C' ? 'ams' : 'ams-lite', slotCount: model === 'X1C' ? 16 : 4 },
          bedTypes: manifest.bed.plates.map(({ id }) => id),
        };
        return Object.freeze(descriptor);
      },
      async getSnapshot(snapshotInput) {
        snapshotInput.signal.throwIfAborted();
        return snapshot();
      },
      async *observe(observeInput) {
        for await (const [value] of on(updates, 'snapshot', {
          signal: observeInput.signal,
        })) {
          const event = value as CustomEvent<MachineSnapshot>;
          yield Object.freeze({ type: 'snapshot', snapshot: event.detail });
        }
      },
      async preparePrint(prepareInput) {
        if (prepareInput.expectedMachineId !== serial) {
          return {
            status: 'rejected',
            code: 'IDENTITY_MISMATCH',
            message: 'The prepared machine identity changed.',
            observedAt: runtime.clock.now(),
          };
        }
        const { configuration } = prepareInput;
        const observedStatus = status;
        const actualModel = observedStatus?.model ?? input.candidate.claimedIdentity.model;
        const actualBedType = observedStatus?.bedType ?? configuration.operatorConfirmedBedType;
        if (configuration.amsMapping.includes(bambuExternalSpoolSlot) && configuration.amsMapping.length > 1) {
          return {
            status: 'rejected',
            code: 'SETUP_UNQUALIFIED',
            message: 'The external spool can only feed a one-filament print. Map every filament to an AMS tray.',
            observedAt: runtime.clock.now(),
          };
        }
        const setupQualified =
          observedStatus !== undefined &&
          actualModel === configuration.expectedModel &&
          actualBedType === configuration.expectedBedType &&
          sameQuantity(observedStatus.nozzleDiameter, configuration.expectedNozzleDiameter) &&
          sameQuantity(filamentDiameter.value, configuration.expectedFilamentDiameter) &&
          configuration.amsMapping.length === configuration.expectedMaterials.length &&
          configuration.expectedMaterials.every(
            (expected, index) =>
              configuration.amsMapping[index] === expected.slot &&
              observedMaterials(observedStatus).some(
                (observed) =>
                  observed.slot === expected.slot &&
                  observed.materialId?.toLowerCase() === expected.materialId.toLowerCase(),
              ),
          );
        if (!setupQualified) {
          return {
            status: 'rejected',
            code: 'SETUP_UNQUALIFIED',
            message: 'The observed model, nozzle, plate, filament, or AMS setup is not qualified.',
            observedAt: runtime.clock.now(),
          };
        }
        try {
          const artifact = await prepareBambuArtifact({
            artifact: prepareInput.artifact,
            runtime,
            signal: prepareInput.signal,
          });
          // Real printers run only Bambu Studio output (blueprint P3); the simulator accepts any producer.
          if (artifact.producer?.name !== 'Bambu Studio') {
            return {
              status: 'rejected',
              code: 'ARTIFACT_UNQUALIFIED',
              message:
                'This file was not sliced by Bambu Studio. Slice it with Bambu Studio in Tau (desktop app with Bambu Studio installed), then send it again.',
              observedAt: runtime.clock.now(),
            };
          }
          return {
            status: 'ready',
            remoteName: bambuRemoteName(prepareInput.operationId),
            digest: artifact.digest,
            length: artifact.length,
            parser: artifact.parser,
            providerData: { memberMd5: artifact.memberMd5 },
            observedAt: runtime.clock.now(),
          };
        } catch {
          return {
            status: 'rejected',
            code: 'ARTIFACT_INVALID',
            message: 'The artifact failed bounded verification.',
            observedAt: runtime.clock.now(),
          };
        }
      },
      async uploadPrint(uploadInput): Promise<MachineTransferReceipt> {
        const providerRecord = isRecord(uploadInput.providerData) ? uploadInput.providerData : undefined;
        if (uploadInput.expectedMachineId !== serial || !remoteNamePattern.test(uploadInput.remoteName)) {
          return {
            status: 'rejected',
            code: 'PREPARATION_INVALID',
            message: 'The prepared artifact identity is invalid.',
            observedAt: runtime.clock.now(),
          };
        }
        if (!runtime.uploadFile) {
          return {
            status: 'rejected',
            code: 'TRANSFER_UNAVAILABLE',
            message: 'The host does not provide bounded FTPS transfer.',
            observedAt: runtime.clock.now(),
          };
        }
        let artifact;
        try {
          artifact = await prepareBambuArtifact({
            artifact: uploadInput.artifact,
            runtime,
            signal: uploadInput.signal,
          });
        } catch {
          return {
            status: 'rejected',
            code: 'ARTIFACT_INVALID',
            message: 'The artifact failed bounded verification.',
            observedAt: runtime.clock.now(),
          };
        }
        if (providerRecord?.['memberMd5'] !== artifact.memberMd5) {
          return {
            status: 'rejected',
            code: 'PREPARATION_INVALID',
            message: 'The artifact changed since it was prepared.',
            observedAt: runtime.clock.now(),
          };
        }
        let bytesWritten: number;
        try {
          ({ bytesWritten } = await runtime.uploadFile({
            endpoint: { address: input.candidate.endpoint.address, port: 990 },
            trust: input.connection.serviceTrust['ftp'] ?? trust,
            secretRef: input.connection.secretRef,
            username: 'bblp',
            remoteName: uploadInput.remoteName,
            bytes: artifact.bytes,
            connectTimeout: 15_000,
            signal: uploadInput.signal,
          }));
        } catch (error) {
          // The host's transport errors name the failure, never the access code; a refusal keeps the printer's reply.
          const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
          await runtime.log({
            level: 'warning',
            message: `FTPS upload of ${uploadInput.remoteName} failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}${cause ? ` (${cause.message.slice(0, 200)})` : ''}`,
          });
          if (error instanceof Error && error.message === 'MACHINE_UPLOAD_REFUSED') {
            // The printer stores uploads on its microSD card; a refused store is the card, not the network.
            const reply = isRecord(cause) && typeof cause['code'] === 'number' ? `FTP ${cause['code']}` : 'FTP refusal';
            return {
              status: 'rejected',
              code: 'TRANSFER_REFUSED',
              message:
                `The printer refused to store the file (${reply}), so nothing was started. Its microSD card may be ` +
                'full, damaged or locked: free space on it or format it on the printer, then send again.',
              observedAt: runtime.clock.now(),
            };
          }
          // A transfer that broke off may have reached the printer, so its result is unknown.
          return {
            status: 'unknown',
            reason: 'transfer-result-unavailable',
            observedAt: runtime.clock.now(),
          };
        }
        if (bytesWritten !== artifact.length) {
          return {
            status: 'rejected',
            code: 'TRANSFER_PARTIAL',
            message: 'The transfer ended before the whole artifact was written.',
            observedAt: runtime.clock.now(),
          };
        }
        // The printer holds exactly one object per remote name, so the name is the transfer evidence.
        return {
          status: 'transferred',
          transferId: uploadInput.remoteName,
          digest: artifact.digest,
          length: artifact.length,
          observedAt: runtime.clock.now(),
        };
      },
      async submit(submitInput) {
        const { providerData } = submitInput;
        const providerRecord = isRecord(providerData) ? providerData : undefined;
        const { memberMd5 } = providerRecord ?? {};
        if (
          submitInput.expectedMachineId !== serial ||
          !remoteNamePattern.test(submitInput.remoteName) ||
          submitInput.transferId !== submitInput.remoteName ||
          !providerRecord ||
          Object.keys(providerRecord).length !== 1 ||
          typeof memberMd5 !== 'string' ||
          !memberMd5Pattern.test(memberMd5)
        ) {
          return Object.freeze({
            status: 'rejected',
            code: 'PREPARATION_INVALID',
            message: 'The prepared artifact identity or provider data is invalid.',
            observedAt: runtime.clock.now(),
          });
        }
        const { configuration } = submitInput;
        const wireId = bambuWireId(submitInput.operationId);
        const runName = submitInput.remoteName.replace('.gcode.3mf', '');
        startRunNames.set(submitInput.operationId, runName);
        /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
        // The external spool prints with the AMS off: firmware takes -1 in `ams_mapping` and holder 255 in
        // `ams_mapping2` for a single-nozzle printer; preflight keeps it to one-filament prints.
        const external = configuration.amsMapping.includes(bambuExternalSpoolSlot);
        const amsMapping = external ? configuration.amsMapping.map(() => -1) : configuration.amsMapping;
        const amsMapping2 = configuration.amsMapping.map((slot) =>
          external ? { ams_id: 255, slot_id: 0 } : { ams_id: Math.floor(slot / 4), slot_id: slot % 4 },
        );
        return sendCommand({
          operationId: submitInput.operationId,
          command: 'project_file',
          signal: submitInput.signal,
          payload: {
            print: {
              command: 'project_file',
              param: submitInput.artifact.selectedMember,
              url: `ftp://${submitInput.remoteName}`,
              file: submitInput.remoteName,
              subtask_name: runName,
              md5: memberMd5,
              flow_cali: configuration.flowCalibration,
              extrude_cali_flag: configuration.flowCalibration ? 1 : 0,
              extrude_cali_manual_mode: 0,
              timelapse: configuration.timelapse,
              bed_leveling: configuration.bedLeveling,
              auto_bed_leveling: configuration.bedLeveling ? 1 : 0,
              vibration_cali: true,
              layer_inspect: model === 'X1C',
              nozzle_offset_cali: 0,
              bed_type: 'auto',
              use_ams: configuration.amsMapping.length > 0 && !external,
              ams_mapping: amsMapping,
              ams_mapping2: amsMapping2,
              cfg: '0',
              profile_id: '0',
              project_id: wireId,
              sequence_id: bambuWireSequenceId(submitInput.operationId),
              subtask_id: wireId,
              task_id: wireId,
            },
          },
        });
        /* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */
      },
      async control(controlInput): Promise<MachineCommandReceipt> {
        const command =
          controlInput.command === 'cancel' || controlInput.command === 'urgent-stop' ? 'stop' : controlInput.command;
        /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
        return sendCommand({
          operationId: controlInput.operationId,
          command,
          signal: controlInput.signal,
          payload: {
            print: {
              sequence_id: bambuWireSequenceId(controlInput.operationId),
              command,
              param: '',
            },
          },
        });
        /* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */
      },
      async reconcile(reconcileInput) {
        const { operationId, command, transferId } = reconcileInput;
        // After a reconnect only a start is still provable: its run carries the operation's wire id or transfer name.
        const isStartOnRecord = command === 'project_file' && startedRunId(operationId, transferId) !== undefined;
        if (commandContexts.get(operationId) !== command && !isStartOnRecord) {
          return Object.freeze({
            status: 'unknown',
            reason: 'no-correlated-provider-reply',
            observedAt: runtime.clock.now(),
          });
        }
        const receipt = commandReceipt(
          operationId,
          command === 'project_file' ? 'project_file' : commandContexts.get(operationId)!,
          transferId,
        );
        // The host re-runs this on every report while a start is unproven; only its settling is worth a log line.
        if (command === 'project_file' && receipt.status !== 'unknown') {
          await logStart(operationId, 'reconciliation');
        }
        return receipt;
      },
      close,
      dispose: close,
    };
    return Object.freeze(session);
  }
  throw new Error('BAMBU_SIMULATOR_IS_A_SEPARATE_PROVIDER');
};

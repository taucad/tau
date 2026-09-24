import { createHash, randomUUID } from 'node:crypto';
import { on } from 'node:events';
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
  MachineQuantityDeclaration,
  MachineSession,
  MachineSnapshot,
  MachineStill,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import { checkOperation, createQuantity, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import type { Client as FtpClientConstructor } from 'basic-ftp';
import type { MqttClient as MqttClientConstructor } from 'mqtt';

import type { BambuCommandResult } from '#bambu.protocol.js';
import {
  bambuRemoteName,
  bambuTopic,
  mergeBambuStatus,
  parseBambuCommandPayload,
  parseBambuDiscoveryDatagram,
  parseBambuStatusPayload,
  parseBambuStill,
  parseBambuVersionPayload,
} from '#bambu.protocol.js';
import { prepareBambuArtifact } from '#bambu.archive.js';

type Binding = Readonly<{
  logicalId: string;
  address?: string;
  serial?: string;
}>;
type Submission = Readonly<{
  amsMapping: readonly number[];
  bedLeveling: boolean;
  expectedBedType: string;
  expectedFilamentDiameter: MachineQuantityDeclaration;
  expectedMaterials: ReadonlyArray<Readonly<{ slot: number; materialId: string }>>;
  expectedModel: 'X1C';
  expectedNozzleDiameter: MachineQuantityDeclaration;
  operatorConfirmedBedType?: string;
  flowCalibration: boolean;
  timelapse: boolean;
}>;
const serialIdentifier = /^[A-Za-z0-9_-]{1,64}$/u;
const x1cSerialIdentifier = /^00M[A-Za-z0-9_-]{1,61}$/u;
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

const sameQuantity = (observed: Quantity | undefined, declared: MachineQuantityDeclaration): boolean => {
  if (!observed) {
    return false;
  }
  const expected = createQuantity({
    ...declared,
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

/** Execute one bounded provider discovery pass through the host-owned datagram port.
 * @param input - Qualified provider configuration and cancellation.
 * @param runtime - Host-owned bounded datagram authority.
 * @returns Normalized discovery events.
 */
export async function* discoverBambuMachines(
  input: MachineDiscoveryInput<Binding>,
  runtime: MachineDiscoveryRuntime,
): AsyncGenerator<MachineDiscoveryEvent> {
  if (input.configuration.address) {
    const { address } = input.configuration;
    if (input.configuration.serial && !x1cSerialIdentifier.test(input.configuration.serial)) {
      throw new TypeError('BAMBU_SERIAL_INVALID');
    }
    if (!/^(?=.{1,253}$)(?!.*[\s/\\?#@])(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/u.test(address)) {
      throw new TypeError('BAMBU_MANUAL_ADDRESS_INVALID');
    }
    const observedAt = runtime.clock.now();
    yield Object.freeze({
      type: 'found',
      candidate: Object.freeze({
        id: `bambu:${input.configuration.serial ?? address}`,
        name: input.configuration.logicalId,
        endpoint: Object.freeze({ address, interface: 'manual' }),
        claimedIdentity: Object.freeze({
          serial: input.configuration.serial,
          model: 'X1C',
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
    durationMs: 5000,
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
const cameraAccessCode = /^[\u0021-\u007E]{1,32}$/u;

/** Capture one encoded Bambu camera frame through a short-lived pinned stream.
 * @internal
 * @param input - Protected camera endpoint, credential, trust, runtime and cancellation.
 * @returns One bounded JPEG that expires quickly and owns no live stream.
 */
export const captureBambuStill = async (
  input: Readonly<{
    address: string;
    accessCode: string;
    trust: MachineTransportTrust;
    runtime: MachineConnectionRuntime;
    signal: AbortSignal;
  }>,
): Promise<MachineStill> => {
  if (!cameraAccessCode.test(input.accessCode) || input.trust.type !== 'pinned') {
    throw new Error('BAMBU_CAMERA_AUTH_INVALID');
  }
  const stream = await input.runtime.connectStream({
    endpoint: { address: input.address, port: 6000 },
    transport: 'tls',
    trust: input.trust,
    connectTimeout: 5000,
    idleTimeout: 5000,
    maximumReadBytes: maximumCameraBytes + 16,
    maximumWriteBytes: 80,
    signal: input.signal,
  });
  try {
    const authentication = new Uint8Array(80);
    const header = new DataView(authentication.buffer);
    header.setUint32(0, 0x40, true);
    header.setUint32(4, 0x30_00, true);
    authentication.set(new TextEncoder().encode('bblp'), 16);
    authentication.set(new TextEncoder().encode(input.accessCode), 48);
    await stream.write(authentication);

    const frame = new Uint8Array(maximumCameraBytes + 16);
    let length = 0;
    let total: number | undefined;
    for await (const chunk of stream.readable) {
      input.signal.throwIfAborted();
      if (chunk.byteLength === 0) {
        continue;
      }
      if (length + chunk.byteLength > frame.byteLength) {
        throw new Error('BAMBU_CAMERA_FRAME_OVERSIZE');
      }
      frame.set(chunk, length);
      length += chunk.byteLength;
      if (total === undefined && length >= 16) {
        const payloadLength = new DataView(frame.buffer, 0, 16).getUint32(0, true);
        if (payloadLength < 4 || payloadLength > maximumCameraBytes) {
          throw new Error('BAMBU_CAMERA_FRAME_INVALID');
        }
        total = payloadLength + 16;
      }
      if (total !== undefined && length >= total) {
        return parseBambuStill(frame.slice(16, total), input.runtime.clock.now());
      }
    }
    throw new Error('BAMBU_CAMERA_FRAME_INCOMPLETE');
  } finally {
    await stream.close().catch(() => undefined);
  }
};

/** Connect one host-owned, pinned MQTTS observation session.
 * @param input - Admitted connection input.
 * @param runtime - Host-owned secret, clock, log and bounded network services.
 * @returns One live machine session. The simulator is a separate provider (`bambuSimulatorMachine`).
 */
export const connectBambuMachine = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
): Promise<MachineSession<Submission>> => {
  if (input.candidate.endpoint.address !== 'simulator.invalid') {
    const serial = input.candidate.claimedIdentity.serial ?? input.configuration.serial;
    if (!serial || !x1cSerialIdentifier.test(serial)) {
      throw new TypeError('BAMBU_SERIAL_REQUIRED');
    }
    const trust = input.connection.serviceTrust['mqtt'];
    if (trust?.type !== 'pinned') {
      throw new Error('BAMBU_MQTT_PIN_REQUIRED');
    }
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
    let network: MachineNetworkStream;
    try {
      network = await runtime.connectStream({
        endpoint: { address: input.candidate.endpoint.address, port: 8883 },
        transport: 'tls',
        trust,
        connectTimeout: 10_000,
        idleTimeout: 90_000,
        maximumReadBytes: 4 * 1024 * 1024,
        maximumWriteBytes: 256 * 1024,
        signal: input.signal,
      });
    } catch {
      throw new Error('BAMBU_MQTT_TRANSPORT_FAILED');
    }
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
    const commandResults = new Map<string, Readonly<{ result: BambuCommandResult; observedAt: string }>>();
    let closed = false;
    let firmware: string | undefined;
    let status: ReturnType<typeof parseBambuStatusPayload> | undefined;
    let statusObservedAt: string | undefined;
    let versionSerial: string | undefined;
    const snapshot = (): MachineSnapshot => {
      const state = status ? mapRunState(status.runState) : 'unknown';
      const active = state === 'paused' || state === 'preparing' || state === 'printing' || state === 'finishing';
      return Object.freeze({
        connection: client.connected ? 'connected' : 'disconnected',
        readiness: active ? 'busy' : state === 'idle' || state === 'succeeded' ? 'idle' : 'unknown',
        ...(active && status?.providerRunId ? { activeRunId: status.providerRunId } : {}),
        observedAt: statusObservedAt ?? runtime.clock.now(),
        setup: Object.freeze({
          toolId: 'tool-0',
          ...(status?.bedType ? { bedType: status.bedType } : {}),
          materials: status?.materials ?? [],
        }),
        run: Object.freeze({
          state,
          ...(status?.progress === undefined ? {} : { progress: status.progress }),
          ...(status?.remainingSeconds === undefined ? {} : { remainingSeconds: status.remainingSeconds }),
          ...(status?.runName ? { name: status.runName } : {}),
          ...(status?.runFile ? { file: status.runFile } : {}),
          ...(status?.currentLayer === undefined ? {} : { currentLayer: status.currentLayer }),
          ...(status?.totalLayers === undefined ? {} : { totalLayers: status.totalLayers }),
          ...(status?.stage ? { stage: status.stage } : {}),
          ...(status?.printType ? { printType: status.printType } : {}),
          ...(status?.speedProfile ? { speedProfile: status.speedProfile } : {}),
          ...(status?.speedPercent === undefined ? {} : { speedPercent: status.speedPercent }),
        }),
        temperatures: Object.freeze({
          ...(status?.nozzleTemperature ? { nozzle: status.nozzleTemperature } : {}),
          ...(status?.nozzleTargetTemperature ? { nozzleTarget: status.nozzleTargetTemperature } : {}),
          ...(status?.bedTemperature ? { bed: status.bedTemperature } : {}),
          ...(status?.bedTargetTemperature ? { bedTarget: status.bedTargetTemperature } : {}),
          ...(status?.chamberTemperature ? { chamber: status.chamberTemperature } : {}),
        }),
        fans: Object.freeze({
          ...(status?.partFanPercent === undefined ? {} : { part: status.partFanPercent }),
          ...(status?.auxiliaryFanPercent === undefined ? {} : { auxiliary: status.auxiliaryFanPercent }),
          ...(status?.chamberFanPercent === undefined ? {} : { chamber: status.chamberFanPercent }),
        }),
        materialSystem: Object.freeze({
          ...(status?.currentMaterialSlot === undefined ? {} : { currentSlot: status.currentMaterialSlot }),
          ...(status?.targetMaterialSlot === undefined ? {} : { targetSlot: status.targetMaterialSlot }),
          units: status?.materialUnits ?? [],
        }),
        network: Object.freeze(status?.wifiSignalDbm === undefined ? {} : { wifiSignalDbm: status.wifiSignalDbm }),
        lights: Object.freeze(status?.chamberLight ? { chamber: status.chamberLight } : {}),
        ...(status?.removableStorage ? { removableStorage: status.removableStorage } : {}),
        ...(status?.alerts ? { alerts: status.alerts } : {}),
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
      if (!status || !firmware || versionSerial !== serial) {
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
    const commandReceipt = (
      stored: Readonly<{ result: BambuCommandResult; observedAt: string }> | undefined,
    ): MachineSubmissionReceipt => {
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
      return Object.freeze({
        status: 'accepted',
        ...(stored.result.providerRunId ? { providerRunId: stored.result.providerRunId } : {}),
        observedAt: stored.observedAt,
      });
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
        return commandReceipt(commandResults.get(commandInput.operationId));
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
      try {
        await client.publishAsync(bambuTopic(serial, 'request'), JSON.stringify(commandInput.payload), { qos: 0 });
      } catch {
        return commandReceipt(undefined);
      }
      if (!commandResults.has(commandInput.operationId)) {
        await new Promise<void>((resolve) => {
          const eventName = `command:${commandInput.operationId}`;
          const commandTimeout = setTimeout(finish, 15_000);
          function finish(): void {
            clearTimeout(commandTimeout);
            updates.removeEventListener(eventName, finish);
            commandInput.signal.removeEventListener('abort', finish);
            resolve();
          }
          updates.addEventListener(eventName, finish, { once: true });
          commandInput.signal.addEventListener('abort', finish, { once: true });
        });
      }
      return commandReceipt(commandResults.get(commandInput.operationId));
    };
    const cameraTrust = input.connection.serviceTrust['camera'];
    const cameraModel = status.model ?? input.candidate.claimedIdentity.model;
    const { captureNetworkStill } = runtime;
    const stillCapture: MachineSession<Submission>['stillCapture'] =
      cameraTrust?.type === 'pinned' && cameraModel === 'X1C' && captureNetworkStill
        ? Object.freeze({
            type: 'supported',
            async capture(captureInput: Readonly<{ signal: AbortSignal }>) {
              return captureNetworkStill({
                endpoint: {
                  address: input.candidate.endpoint.address,
                  port: 322,
                },
                trust: cameraTrust,
                secretRef: input.connection.secretRef,
                username: 'bblp',
                path: '/streaming/live/1',
                connectTimeout: 60_000,
                maximumBytes: maximumCameraBytes,
                signal: captureInput.signal,
              });
            },
          })
        : cameraTrust?.type === 'pinned' && cameraModel !== 'X1C'
          ? Object.freeze({
              type: 'supported',
              async capture(captureInput: Readonly<{ signal: AbortSignal }>) {
                return captureBambuStill({
                  address: input.candidate.endpoint.address,
                  accessCode,
                  trust: cameraTrust,
                  runtime,
                  signal: captureInput.signal,
                });
              },
            })
          : Object.freeze({ type: 'unsupported' });
    const session: MachineSession<Submission> = {
      stillCapture,
      async getDescriptor(descriptorInput): Promise<MachineDescriptor> {
        descriptorInput.signal.throwIfAborted();
        const descriptor: MachineDescriptor = {
          id: serial,
          name: input.candidate.name,
          vendor: 'Bambu Lab',
          model: status?.model ?? input.candidate.claimedIdentity.model ?? 'X1C',
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
            width: 0.256,
            depth: 0.256,
            height: 0.256,
            unit: 'm',
          },
          printableEnvelope: {
            width: 0.256,
            depth: 0.256,
            height: 0.256,
            unit: 'm',
          },
          tools: [
            {
              id: 'tool-0',
              kind: 'extruder',
              ...(status?.nozzleDiameter ? { nozzleDiameter: status.nozzleDiameter } : {}),
            },
          ],
          materialSystem: { kind: 'ams', slotCount: 16 },
          bedTypes: ['cool-plate', 'engineering-plate', 'high-temperature-plate', 'textured-plate'],
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
              observedStatus.materials?.some(
                (observed) =>
                  observed.slot === expected.slot &&
                  observed.materialId?.toLowerCase() === expected.materialId.toLowerCase(),
              ) === true,
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
        } catch {
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
        /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
        const amsMapping2 = configuration.amsMapping.map((slot) => ({
          ams_id: Math.floor(slot / 4),
          slot_id: slot % 4,
        }));
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
              subtask_name: submitInput.remoteName.replace('.gcode.3mf', ''),
              md5: memberMd5,
              flow_cali: configuration.flowCalibration,
              extrude_cali_flag: configuration.flowCalibration ? 1 : 0,
              extrude_cali_manual_mode: 0,
              timelapse: configuration.timelapse,
              bed_leveling: configuration.bedLeveling,
              auto_bed_leveling: configuration.bedLeveling ? 1 : 0,
              vibration_cali: true,
              layer_inspect: true,
              nozzle_offset_cali: 0,
              bed_type: 'auto',
              use_ams: configuration.amsMapping.length > 0,
              ams_mapping: configuration.amsMapping,
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
        if (commandContexts.get(reconcileInput.operationId) !== reconcileInput.command) {
          return Object.freeze({
            status: 'unknown',
            reason: 'no-correlated-provider-reply',
            observedAt: runtime.clock.now(),
          });
        }
        return commandReceipt(commandResults.get(reconcileInput.operationId));
      },
      close,
      dispose: close,
    };
    return Object.freeze(session);
  }
  throw new Error('BAMBU_SIMULATOR_IS_A_SEPARATE_PROVIDER');
};

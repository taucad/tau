import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Duplex } from 'node:stream';

import type {
  MachineCandidate,
  MachineConnectInput,
  MachineConnectionRuntime,
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineNetworkStream,
  MachineSession,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import type { Client as FtpClientConstructor } from 'basic-ftp';
import type { MqttClient as MqttClientConstructor } from 'mqtt';

import { prepareBambuArtifact } from '#bambu.archive.js';
import type { BambuWireForm } from '#bambu.commands.js';
import { bambuFtpsPort, bambuManifests, bambuServicePort } from '#bambu.manifest.js';
import type { BambuModel } from '#bambu.protocol.js';
import {
  BambuProtocolError,
  bambuModels,
  bambuTopic,
  isBambuSerial,
  parseBambuDiscoveryDatagram,
  parseBambuStill,
} from '#bambu.protocol.js';
import { openBambuSession } from '#bambu.session.js';
import type { BambuSubmission } from '#bambu.session.js';

/** The admitted binding; where the printer is lives in the discovery endpoint, not here. @internal */
export type BambuBinding = Readonly<{
  serial?: string;
  /** Which variant of the commands the clients disagree on to send; (a), Bambu Studio's, by default. */
  wireForm?: BambuWireForm;
}>;
type Binding = BambuBinding;

/**
 * How long a discovery pass listens. An X1C advertises on UDP 2021 about every
 * 5.05 s (5.0–5.1 s measured on 192.168.0.112, 2026-09-26), so a pass as long
 * as one period misses the printer whenever it starts just after an
 * advertisement; two periods plus a margin always hear one. Milliseconds.
 */
const advertisementWindow = 11_000;

/**
 * The printer's network address. A Bambu printer is a network machine, so the host never hands it a serial candidate.
 * @internal
 * @param candidate - The candidate being connected.
 * @returns The address its services answer at.
 */
export const bambuCandidateAddress = (candidate: Pick<MachineCandidate, 'endpoint'>): string => {
  if (candidate.endpoint.transport !== 'network') {
    throw new BambuProtocolError('BAMBU_MANUAL_ADDRESS_INVALID', 'A Bambu printer is reached over the network.');
  }
  return candidate.endpoint.address;
};

/** Execute one bounded provider discovery pass through the host-owned datagram port.
 * @param input - Qualified provider configuration, the address a person entered (if any) and cancellation.
 * @param runtime - Host-owned bounded datagram authority.
 * @param model - Model admitted by this provider.
 * @returns Normalized discovery events.
 */
export async function* discoverBambuMachines(
  input: MachineDiscoveryInput<Binding>,
  runtime: MachineDiscoveryRuntime,
  model: BambuModel = 'X1C',
): AsyncGenerator<MachineDiscoveryEvent> {
  if (input.endpoint !== undefined) {
    // A serial endpoint finds nothing: the host refuses one before it reaches a network provider.
    if (input.endpoint.transport !== 'network') {
      return;
    }
    const { address, port } = input.endpoint;
    if (port !== undefined) {
      throw new BambuProtocolError(
        'BAMBU_MANUAL_ADDRESS_INVALID',
        'A Bambu printer answers on its own fixed ports; enter the address without a port.',
      );
    }
    if (input.configuration.serial && !isBambuSerial(input.configuration.serial, model)) {
      throw new BambuProtocolError('BAMBU_SERIAL_INVALID', 'The serial does not match the selected printer model.');
    }
    if (
      (/^[0-9.]+$/u.test(address) && isIP(address) !== 4) ||
      !/^(?=.{1,253}$)(?!.*[\s/\\?#@])(?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/u.test(address)
    ) {
      throw new BambuProtocolError('BAMBU_MANUAL_ADDRESS_INVALID', 'Enter a valid IP address or printer hostname.');
    }
    const observedAt = runtime.clock.now();
    yield Object.freeze({
      type: 'found',
      candidate: Object.freeze({
        id: `${bambuModels[model].providerId}:${input.configuration.serial ?? address}`,
        // What was entered and what it claims to be; the person names the machine at bind. A 253-character hostname
        // would overrun the 256-character candidate name, so it is cut (the address is ASCII).
        name: `${model} at ${address}`.slice(0, 256),
        endpoint: Object.freeze({ transport: 'network', address, interface: 'manual' }),
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

const maximumCameraBytes = 4 * 1024 * 1024;

/**
 * Name an MQTT connect failure by its remedy: CONNACK 4 (bad user name or password) and 5 (not authorized) mean the
 * access code is wrong and the printer must be bound again; anything else is the link, which a retry may fix.
 * @param error - The MQTT.js error; a refused CONNACK is an `ErrorWithReasonCode` whose `code` is the return code.
 * @returns The coded failure, worded for a person.
 */
const connectFailure = (error?: Error): BambuProtocolError =>
  error !== undefined && 'code' in error && (error.code === 4 || error.code === 5)
    ? new BambuProtocolError(
        'BAMBU_ACCESS_CODE_REJECTED',
        "The printer refused the access code. Check the code on the printer's screen and bind it again.",
      )
    : new BambuProtocolError(
        'BAMBU_MQTT_CONNECT_FAILED',
        'Could not connect to the printer. Check that it is on and on this network, then try again.',
      );

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
 * @param service - The MQTT service's pinned trust, and its port as the manifest declares it.
 * @returns The open stream.
 */
const openMqttStream = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  { trust, port }: Readonly<{ trust: MachineTransportTrust; port: number }>,
): Promise<MachineNetworkStream> => {
  try {
    return await runtime.connectStream({
      endpoint: { address: bambuCandidateAddress(input.candidate), port },
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

/** Capture one bounded JPEG frame over a pinned TLS camera service (the A1 mini's framed JPEG stream).
 * @param input - Admitted connection input.
 * @param runtime - Host-owned network and secret authority.
 * @param capture - The camera service's port as the manifest declares it, and the signal that cancels this capture
 *   independently of the observation session.
 * @returns The first complete JPEG frame.
 */
const captureJpegStill = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  { port, signal }: Readonly<{ port: number; signal: AbortSignal }>,
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
    endpoint: { address: bambuCandidateAddress(input.candidate), port },
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
 * A printer's still, by its model's camera: the host captures one RTSPS frame (X1C), or the provider reads one framed
 * JPEG over TLS (A1 mini). Either way from the pinned camera service the manifest declares.
 *
 * @param input - Admitted connection input with the camera trust and secret.
 * @param runtime - Host capture authority.
 * @param model - The printer's model; its manifest declares the camera's port.
 * @returns The session's still capability.
 */
const bambuStillCapture = (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  model: BambuModel,
): MachineSession<BambuSubmission>['stillCapture'] => {
  const trust = input.connection.serviceTrust['camera'];
  const { captureNetworkStill } = runtime;
  const { camera } = bambuModels[model];
  if (trust?.type !== 'pinned' || (camera === 'rtsps' && !captureNetworkStill)) {
    return Object.freeze({ type: 'unsupported' });
  }
  const port = bambuServicePort(bambuManifests[model], 'camera');
  return Object.freeze({
    type: 'supported',
    async capture(captureInput: Readonly<{ signal: AbortSignal }>) {
      if (camera === 'jpeg-tls') {
        return captureJpegStill(input, runtime, { port, signal: captureInput.signal });
      }
      if (!captureNetworkStill) {
        throw new Error('BAMBU_CAMERA_UNSUPPORTED');
      }
      return captureNetworkStill({
        endpoint: {
          address: bambuCandidateAddress(input.candidate),
          port,
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

/** Connect one host-owned, pinned MQTTS session.
 * @param input - Admitted connection input.
 * @param runtime - Host-owned secret, clock, log and bounded network services.
 * @param model - Model and hardware manifest selected by the provider.
 * @returns One live machine session. The simulator is a separate provider (`bambuSimulatorMachine`).
 */
export const connectBambuMachine = async (
  input: MachineConnectInput<Binding>,
  runtime: MachineConnectionRuntime,
  model: BambuModel = 'X1C',
): Promise<MachineSession<BambuSubmission>> => {
  const manifest = bambuManifests[model];
  // The bound serial fences the printer; an advertisement that names another one is a different printer.
  const bound = input.configuration.serial;
  const claimed = input.candidate.claimedIdentity.serial;
  if (bound !== undefined && claimed !== undefined && bound !== claimed) {
    throw new BambuProtocolError('BAMBU_SERIAL_MISMATCH', 'The printer at this address reports a different serial.');
  }
  const serial = bound ?? claimed;
  if (!serial || !isBambuSerial(serial, model)) {
    throw new BambuProtocolError(
      'BAMBU_SERIAL_REQUIRED',
      "Enter the printer's serial under Printer details, or find the printer on the network to fill it.",
    );
  }
  const trust = input.connection.serviceTrust['mqtt'];
  if (trust?.type !== 'pinned') {
    throw new Error('BAMBU_MQTT_PIN_REQUIRED');
  }
  const accessCode = await resolveAccessCode(input, runtime);
  const network = await openMqttStream(input, runtime, { trust, port: bambuServicePort(manifest, 'mqtt') });
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
  client.on('error', (error) => {
    // MQTT.js errors carry no credential; a bounded message is enough to tell a dropped link from a refusal.
    // oxlint-disable-next-line tau-lint/no-async-iife -- an event handler cannot await.
    void runtime
      .log({ level: 'warning', message: `Bambu MQTT error: ${error.message.slice(0, 200)}` })
      // oxlint-disable-next-line promise/prefer-await-to-then -- a failed host log has nowhere else to go.
      .catch(() => undefined);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const connected = (): void => {
        cleanup();
        resolve();
      };
      const failed = (error: Error): void => {
        cleanup();
        reject(connectFailure(error));
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
  } catch (error) {
    await client.endAsync(true).catch(() => undefined);
    throw error instanceof BambuProtocolError || (error instanceof Error && error.message.startsWith('BAMBU_'))
      ? error
      : connectFailure();
  }
  const request = bambuTopic(serial, 'request');
  const report = bambuTopic(serial, 'report');
  return openBambuSession({
    model,
    serial,
    name: input.candidate.name,
    clock: runtime.clock,
    log: async (entry) => runtime.log(entry),
    signal: input.signal,
    manifest,
    form: input.configuration.wireForm ?? 'a',
    requireBambuStudio: true,
    stillCapture: bambuStillCapture(input, runtime, model),
    link: {
      async publish(payload) {
        await client.publishAsync(request, payload, { qos: 0 });
      },
      subscribe(listener) {
        client.on('message', (topic, message) => {
          if (topic === report) {
            listener(Uint8Array.from(message));
          }
        });
      },
      onClose(listener) {
        client.on('close', listener);
      },
      connected: () => client.connected,
      async close() {
        await client.endAsync(true).catch(() => undefined);
      },
    },
    readArtifact: async (artifact, signal) => prepareBambuArtifact({ artifact, runtime, signal }),
    async upload({ remoteName, artifact, signal }) {
      if (!runtime.uploadFile) {
        throw new BambuProtocolError('MACHINE_TRANSFER_UNAVAILABLE');
      }
      const { bytesWritten } = await runtime.uploadFile({
        endpoint: { address: bambuCandidateAddress(input.candidate), port: bambuFtpsPort },
        trust: input.connection.serviceTrust['ftp'] ?? trust,
        secretRef: input.connection.secretRef,
        username: 'bblp',
        remoteName,
        bytes: artifact.bytes,
        connectTimeout: 15_000,
        signal,
      });
      return bytesWritten;
    },
  });
};

#!/usr/bin/env -S node --import @oxc-node/core/register
/**
 * Supervised Bambu X1C hardware qualification.
 *
 * Required env vars:
 *   TAU_X1C_STAGE_CONSENT — "read-only" or "upload-and-start" for the exact selected stage.
 *   TAU_X1C_APPROVED_MQTT_PIN — approved fingerprint for prepare-read-only.
 *   TAU_X1C_APPROVED_CAMERA_PIN — approved fingerprint for prepare-read-only.
 *
 * Optional env vars: TAU_X1C_QUALIFICATION_CONFIG — absolute path to a mode-0600 JSON config.
 *   TAU_X1C_LIVE_VIEW_ORIGIN — exact browser origin for the read-only live-view grant.
 *   TAU_X1C_LIVE_VIEW_PORT — loopback port for the read-only live-view bridge.
 *
 * Usage:
 *   pnpm nx run bambu:qualify-x1c -- --stage=self-check
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=discover-read-only
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=probe-discovered-read-only
 *   TAU_X1C_STAGE_CONSENT=read-only TAU_X1C_APPROVED_MQTT_PIN=sha256:... TAU_X1C_APPROVED_CAMERA_PIN=sha256:... pnpm nx run bambu:qualify-x1c -- --stage=prepare-read-only
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=probe-read-only
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=camera-read-only
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=read-only
 *   TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=serve-read-only
 *   TAU_X1C_STAGE_CONSENT=upload-and-start pnpm nx run bambu:qualify-x1c -- --stage=print-cube
 *
 * Exit codes:
 *   0 — qualification stage succeeded.
 *   1 — validation, consent, trust, credential, transport, or protocol failure.
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSocket } from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { on } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createTcpServer, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import { promisify } from 'node:util';
import process from 'node:process';
import { connect as connectTls } from 'node:tls';
import type { PeerCertificate } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';
import { MessageChannel } from 'node:worker_threads';

import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type {
  MachineArtifactReference,
  MachineConnectionRuntime,
  MachineCandidate,
  MachineDatagram,
  MachineDatagramListenInput,
  MachineDirectoryEntry,
  MachineFileUploadInput,
  MachineFileUploadReceipt,
  MachineNetworkRequest,
  MachineNetworkStillInput,
  MachineNetworkStream,
  MachineOperationReceipt,
  MachineSession,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import { connectMachineChannel } from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { Client as FtpClient } from 'basic-ftp';
import { z } from 'zod';

import { bambuMachine } from '#bambu.machine.js';
import { parseBambuDiscoveryDatagram, parseBambuStill } from '#bambu.protocol.js';

const execFileAsync = promisify(execFile);
const cameraReconnectDelay = 5000;
const maximumCachedStillAge = 5 * 60 * 1000;
const cubeArtifactRelativePath = 'out/hardware/bambu-x1c/tau-x1c-petg-25mm-cube.gcode.3mf';
const cubeArtifactDigest = 'sha256:1691bdaffa902a383ff58fac43864d8d03c9724b1393bbd96130e9695637798d';
const cubeArtifactLength = 60_102;
const printOperationId = 'x1c-petg-cube-1691bdaffa902a38-v7';
const configurationPath =
  process.env['TAU_X1C_QUALIFICATION_CONFIG'] ??
  join(homedir(), 'Library', 'Application Support', 'Tau', 'x1c-qualification.json');
const pinSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const configurationSchema = z
  .strictObject({
    address: z.string().min(1).max(253),
    serial: z.string().regex(/^00M[A-Za-z0-9_-]{1,61}$/u),
    logicalId: z.string().min(1).max(64),
    mode: z.literal('developer-lan'),
    keychain: z.strictObject({
      service: z.string().min(1).max(128),
      account: z.string().min(1).max(128),
    }),
    trust: z.strictObject({ mqtt: pinSchema, camera: pinSchema }).optional(),
  })
  .readonly();
type QualificationConfiguration = z.infer<typeof configurationSchema>;
type QualificationSession = MachineSession;
type PinnedTrust = Extract<MachineTransportTrust, Readonly<{ type: 'pinned' }>>;

class QualificationError extends Error {
  public readonly code: string;

  public constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const failureCode = (error: unknown): string => {
  if (error instanceof QualificationError) {
    return error.code;
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,128}$/u.test(error.message)) {
    return error.message;
  }
  return 'X1C_QUALIFICATION_FAILED';
};

const classifyCameraCaptureFailure = (diagnostic: string): QualificationError => {
  const normalized = diagnostic.toLowerCase();
  if (/401 unauthorized|authorization failed|authentication failed/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_AUTH_FAILED');
  }
  if (/certificate verify failed|unable to get local issuer|hostname mismatch/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_TLS_FAILED');
  }
  if (/protocol not found|protocol .* not on whitelist/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_PROTOCOL_FAILED');
  }
  if (/option .* not found|unrecognized option/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_DECODER_OPTION_FAILED');
  }
  if (/connection refused|network is unreachable|no route to host/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_CONNECT_FAILED');
  }
  if (/timed out|timeout/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_CAPTURE_TIMEOUT');
  }
  if (/invalid data found|error opening input|could not open input/u.test(normalized)) {
    return new QualificationError('X1C_CAMERA_INPUT_FAILED');
  }
  return new QualificationError('X1C_CAMERA_CAPTURE_FAILED');
};

const classifyCameraTimeout = (
  diagnostic: string,
  phase: Readonly<{ tlsConnected: boolean; upstreamResponded: boolean }>,
): QualificationError => {
  const diagnosticFailure = classifyCameraCaptureFailure(diagnostic);
  if (diagnosticFailure.code !== 'X1C_CAMERA_CAPTURE_FAILED') {
    return diagnosticFailure;
  }
  if (!phase.tlsConnected) {
    return new QualificationError('X1C_CAMERA_TLS_TIMEOUT');
  }
  return new QualificationError(phase.upstreamResponded ? 'X1C_CAMERA_FRAME_TIMEOUT' : 'X1C_CAMERA_RTSP_TIMEOUT');
};

const digest = (bytes: Uint8Array<ArrayBuffer>): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const matchesPin = (bytes: Uint8Array<ArrayBuffer>, expected: string): boolean => digest(bytes) === expected;
const pinned = (value: string): PinnedTrust =>
  Object.freeze({ type: 'pinned', digest: value as PinnedTrust['digest'] });

const readConfiguration = async (): Promise<QualificationConfiguration> => {
  if (!isAbsolute(configurationPath)) {
    throw new QualificationError('X1C_CONFIG_PATH_NOT_ABSOLUTE');
  }
  const metadata = await stat(configurationPath).catch(() => undefined);
  // oxlint-disable-next-line no-bitwise -- POSIX group/world permission bits must all be absent.
  if (!metadata?.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new QualificationError('X1C_CONFIG_MUST_BE_MODE_0600');
  }
  try {
    return configurationSchema.parse(JSON.parse(await readFile(configurationPath, 'utf8')));
  } catch {
    throw new QualificationError('X1C_CONFIG_INVALID');
  }
};

const requireReadOnlyConsent = (): void => {
  if (process.env['TAU_X1C_STAGE_CONSENT'] !== 'read-only') {
    throw new QualificationError('X1C_READ_ONLY_CONSENT_REQUIRED');
  }
};

const requirePrintConsent = (): void => {
  if (process.env['TAU_X1C_STAGE_CONSENT'] !== 'upload-and-start') {
    throw new QualificationError('X1C_UPLOAD_AND_START_CONSENT_REQUIRED');
  }
};

const listenDatagrams = async function* (input: MachineDatagramListenInput): AsyncGenerator<MachineDatagram> {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise<void>((resolve, reject) => {
    const failed = (): void => {
      socket.off('listening', ready);
      reject(new QualificationError('X1C_DISCOVERY_LISTENER_FAILED'));
    };
    const ready = (): void => {
      socket.off('error', failed);
      resolve();
    };
    socket.once('error', failed);
    socket.once('listening', ready);
    socket.bind(input.port, '0.0.0.0');
  });
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(input.durationMs)]);
  let count = 0;
  try {
    for await (const [message, remote] of on(socket, 'message', { signal })) {
      if (
        !Buffer.isBuffer(message) ||
        message.byteLength === 0 ||
        message.byteLength > input.maximumDatagramBytes ||
        typeof remote !== 'object' ||
        remote === null
      ) {
        continue;
      }
      const peer = remote as RemoteInfo;
      yield Object.freeze({
        bytes: Uint8Array.from(message),
        peer: Object.freeze({
          address: peer.address,
          interface: 'udp4',
          port: peer.port,
        }),
      });
      count += 1;
      if (count >= input.maximumDatagrams) {
        return;
      }
    }
  } catch {
    if (!signal.aborted) {
      throw new QualificationError('X1C_DISCOVERY_LISTENER_FAILED');
    }
  } finally {
    socket.close();
  }
};

const discoverPassiveX1c = async (): Promise<MachineCandidate> => {
  const cancellation = new AbortController();
  for await (const datagram of listenDatagrams({
    port: 2021,
    durationMs: 30_000,
    maximumDatagrams: 256,
    maximumDatagramBytes: 8192,
    signal: cancellation.signal,
  })) {
    try {
      const observedAt = new Date().toISOString();
      return parseBambuDiscoveryDatagram({
        datagram,
        observedAt,
        expiresAt: new Date(Date.parse(observedAt) + 30_000).toISOString(),
      });
    } catch {
      // Unrelated or malformed ambient LAN datagrams remain unretained.
    }
  }
  throw new QualificationError('X1C_NOT_VISIBLE_ON_LAN');
};

const runPassiveDiscovery = async (): Promise<void> => {
  const candidate = await discoverPassiveX1c();
  process.stdout.write(
    `${JSON.stringify({
      stage: 'discover-read-only',
      available: true,
      model: candidate.claimedIdentity.model,
      ...(candidate.claimedIdentity.serial
        ? {
            identitySha256: digest(Uint8Array.from(Buffer.from(candidate.claimedIdentity.serial))),
          }
        : {}),
      endpointSha256: digest(Uint8Array.from(Buffer.from(candidate.endpoint.address))),
      observedAt: candidate.observedAt,
      expiresAt: candidate.expiresAt,
    })}\n`,
  );
};

const readCertificate = async (address: string, port: number, timeoutMs = 10_000): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) => {
    const socket = connectTls({
      host: address,
      port,
      rejectUnauthorized: false,
      ...(isIP(address) === 0 ? { servername: address } : {}),
    });
    const connectionTimeout = setTimeout(() => {
      socket.destroy();
      reject(new QualificationError('X1C_CERTIFICATE_PROBE_TIMEOUT'));
    }, timeoutMs);
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate(true);
      clearTimeout(connectionTimeout);
      socket.destroy();
      if (certificate.raw.byteLength === 0) {
        reject(new QualificationError('X1C_CERTIFICATE_MISSING'));
        return;
      }
      resolve(Uint8Array.from(certificate.raw));
    });
    socket.once('error', () => {
      clearTimeout(connectionTimeout);
      reject(new QualificationError('X1C_CERTIFICATE_PROBE_FAILED'));
    });
  });

const probeCertificate = async (address: string, port: number): Promise<string> =>
  digest(await readCertificate(address, port));

const relocateConfiguration = (
  configuration: QualificationConfiguration,
  discovered: Readonly<{
    address: string;
    model: string | undefined;
    serial: string | undefined;
  }>,
): QualificationConfiguration => {
  if (discovered.model !== 'X1C' || discovered.serial !== configuration.serial) {
    throw new QualificationError('X1C_DISCOVERED_IDENTITY_MISMATCH');
  }
  return configurationSchema.parse({
    ...configuration,
    address: discovered.address,
  });
};

const resolveCurrentConfiguration = async (
  configuration: QualificationConfiguration,
): Promise<QualificationConfiguration> => {
  if (!configuration.trust) {
    throw new QualificationError('X1C_APPROVED_TRUST_PINS_REQUIRED');
  }
  const configuredAddressMatches = await readCertificate(configuration.address, 8883, 1500).then(
    (certificate) => matchesPin(certificate, configuration.trust?.mqtt ?? ''),
    () => false,
  );
  if (configuredAddressMatches) {
    return configuration;
  }
  const candidate = await discoverPassiveX1c();
  return relocateConfiguration(configuration, {
    address: candidate.endpoint.address,
    model: candidate.claimedIdentity.model,
    serial: candidate.claimedIdentity.serial,
  });
};

const approvedPin = (name: string): string => {
  const value = process.env[name];
  if (!value || !pinSchema.safeParse(value).success) {
    throw new QualificationError('X1C_APPROVED_TRUST_PINS_REQUIRED');
  }
  return value;
};

const prepareReadOnlyConfiguration = async (): Promise<void> => {
  if (!isAbsolute(configurationPath)) {
    throw new QualificationError('X1C_CONFIG_PATH_NOT_ABSOLUTE');
  }
  const mqtt = approvedPin('TAU_X1C_APPROVED_MQTT_PIN');
  const camera = approvedPin('TAU_X1C_APPROVED_CAMERA_PIN');
  const candidate = await discoverPassiveX1c();
  const { serial } = candidate.claimedIdentity;
  if (!serial) {
    throw new QualificationError('X1C_DISCOVERY_SERIAL_MISSING');
  }
  const [observedMqtt, observedCamera] = await Promise.all([
    probeCertificate(candidate.endpoint.address, 8883),
    probeCertificate(candidate.endpoint.address, 322),
  ]);
  if (observedMqtt !== mqtt || observedCamera !== camera) {
    throw new QualificationError('X1C_APPROVED_TRUST_PIN_MISMATCH');
  }
  const configuration = configurationSchema.parse({
    address: candidate.endpoint.address,
    serial,
    logicalId: 'workshop-x1c',
    mode: 'developer-lan',
    keychain: {
      service: 'tau-x1c-qualification',
      account: 'lan-access-code',
    },
    trust: { mqtt, camera },
  });
  await mkdir(dirname(configurationPath), { recursive: true, mode: 0o700 });
  try {
    await writeFile(configurationPath, `${JSON.stringify(configuration, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch {
    throw new QualificationError('X1C_CONFIG_ALREADY_EXISTS_OR_UNWRITABLE');
  }
  process.stdout.write(
    `${JSON.stringify({
      stage: 'prepare-read-only',
      prepared: true,
      identitySha256: digest(Uint8Array.from(Buffer.from(serial))),
      endpointSha256: digest(Uint8Array.from(Buffer.from(candidate.endpoint.address))),
      trustMatched: { mqtt: true, camera: true },
    })}\n`,
  );
};

const readAccessCode = async (configuration: QualificationConfiguration): Promise<string> => {
  try {
    const result = await execFileAsync(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', configuration.keychain.service, '-a', configuration.keychain.account],
      { encoding: 'utf8', maxBuffer: 1024, timeout: 5000 },
    );
    const accessCode = typeof result.stdout === 'string' ? result.stdout.replace(/\r?\n$/u, '') : '';
    if (accessCode.length === 0 || accessCode.length > 256 || !accessCode.isWellFormed()) {
      throw new QualificationError('X1C_KEYCHAIN_SECRET_INVALID');
    }
    return accessCode;
  } catch (error) {
    if (error instanceof QualificationError) {
      throw error;
    }
    throw new QualificationError('X1C_KEYCHAIN_SECRET_UNAVAILABLE');
  }
};

const certificatePem = (bytes: Uint8Array<ArrayBuffer>): string => {
  const lines = Buffer.from(bytes)
    .toString('base64')
    .match(/.{1,64}/gu);
  if (!lines) {
    throw new QualificationError('X1C_FTPS_CERTIFICATE_INVALID');
  }
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
};

const resolveFtpTrust = async (configuration: QualificationConfiguration): Promise<PinnedTrust> => {
  const certificate = await readCertificate(configuration.address, 990);
  const approved = [configuration.trust?.mqtt, configuration.trust?.camera].find(
    (candidate) => candidate && matchesPin(certificate, candidate),
  );
  if (!approved) {
    throw new QualificationError('X1C_FTPS_TRUST_UNAPPROVED');
  }
  return pinned(approved);
};

const uploadBambuFile = async (
  input: MachineFileUploadInput,
  configuration: QualificationConfiguration,
): Promise<MachineFileUploadReceipt> => {
  const { trust } = input;
  if (trust.type !== 'pinned') {
    throw new QualificationError('X1C_FTPS_UPLOAD_REQUEST_INVALID');
  }
  if (
    input.endpoint.address !== configuration.address ||
    input.endpoint.port !== 990 ||
    input.username !== 'bblp' ||
    input.secretRef !== 'keychain:x1c-qualification' ||
    !/^tau-[A-Za-z0-9_-]{1,64}\.gcode\.3mf$/u.test(input.remoteName) ||
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength > 512 * 1024 * 1024
  ) {
    throw new QualificationError('X1C_FTPS_UPLOAD_REQUEST_INVALID');
  }
  input.signal.throwIfAborted();
  const certificate = await readCertificate(configuration.address, 990);
  if (!matchesPin(certificate, trust.digest)) {
    throw new QualificationError('X1C_TLS_PIN_MISMATCH');
  }
  const client = new FtpClient(input.connectTimeout);
  const abortUpload = (): void => {
    client.close();
  };
  input.signal.addEventListener('abort', abortUpload, { once: true });
  try {
    await client.access({
      host: configuration.address,
      port: 990,
      user: input.username,
      password: await readAccessCode(configuration),
      secure: 'implicit',
      secureOptions: {
        ca: certificatePem(certificate),
        checkServerIdentity(_hostname: string, observed: PeerCertificate): Error | undefined {
          return matchesPin(Uint8Array.from(observed.raw), trust.digest)
            ? undefined
            : new Error('X1C_TLS_PIN_MISMATCH');
        },
        allowPartialTrustChain: true,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });
    input.signal.throwIfAborted();
    await client.uploadFrom(Readable.from([Buffer.from(input.bytes)]), input.remoteName);
    input.signal.throwIfAborted();
    if ((await client.size(input.remoteName)) !== input.bytes.byteLength) {
      throw new QualificationError('X1C_FTPS_TRANSFER_MISMATCH');
    }
    return Object.freeze({ bytesWritten: input.bytes.byteLength });
  } catch (error) {
    if (error instanceof QualificationError) {
      throw error;
    }
    const transportCode =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (typeof error.code === 'string' || typeof error.code === 'number')
        ? String(error.code).replaceAll(/[^A-Za-z0-9_-]/gu, '_')
        : 'UNKNOWN';
    process.stderr.write(`X1C_FTPS_TRANSPORT_${transportCode}\n`);
    throw new QualificationError(input.signal.aborted ? 'X1C_FTPS_UPLOAD_ABORTED' : 'X1C_FTPS_UPLOAD_FAILED');
  } finally {
    input.signal.removeEventListener('abort', abortUpload);
    client.close();
  }
};

const createStreamingRtspRequestRewriter = (source: string, replacement: string) => {
  let pending = '';
  const rewriteLine = (line: string): string =>
    /^[A-Z_]+\s/u.test(line) && /\sRTSP\/\d\.\d$/u.test(line) ? line.replace(source, replacement) : line;
  return Object.freeze({
    push(chunk: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
      const input = pending + Buffer.from(chunk).toString('latin1');
      const lines = input.split('\r\n');
      pending = lines.pop() ?? '';
      if (pending.length > 16 * 1024) {
        const output = `${lines.map((line) => rewriteLine(line)).join('\r\n')}${lines.length > 0 ? '\r\n' : ''}${pending}`;
        pending = '';
        return Uint8Array.from(Buffer.from(output, 'latin1'));
      }
      const output = lines.map((line) => rewriteLine(line)).join('\r\n');
      return Uint8Array.from(Buffer.from(`${output}${lines.length > 0 ? '\r\n' : ''}`, 'latin1'));
    },
    flush(): Uint8Array<ArrayBuffer> {
      const output = Uint8Array.from(Buffer.from(rewriteLine(pending), 'latin1'));
      pending = '';
      return output;
    },
  });
};

const createPinnedRtspProxy = async (
  input: Readonly<{
    address: string;
    port: number;
    trust: PinnedTrust;
    connectTimeout: number;
  }>,
) => {
  let proxyFailure: QualificationError | undefined;
  let tlsConnected = false;
  let upstreamResponded = false;
  const clientSockets = new Set<Socket>();
  const upstreamSockets = new Set<ReturnType<typeof connectTls>>();
  let localPort = 0;
  const server = createTcpServer((client) => {
    clientSockets.add(client);
    client.pause();
    const upstream = connectTls({
      host: input.address,
      port: input.port,
      rejectUnauthorized: false,
      ...(isIP(input.address) === 0 ? { servername: input.address } : {}),
    });
    upstreamSockets.add(upstream);
    const connectTimeout = setTimeout(() => {
      proxyFailure ??= new QualificationError('X1C_CAMERA_TLS_TIMEOUT');
      upstream.destroy();
      client.destroy();
    }, input.connectTimeout);
    client.once('error', () => {
      upstream.destroy();
    });
    client.once('close', () => {
      clientSockets.delete(client);
      upstream.destroy();
    });
    upstream.once('error', () => {
      proxyFailure ??= new QualificationError('X1C_CAMERA_TLS_FAILED');
      client.destroy();
    });
    upstream.once('close', () => {
      clearTimeout(connectTimeout);
      upstreamSockets.delete(upstream);
      client.destroy();
    });
    upstream.once('secureConnect', () => {
      clearTimeout(connectTimeout);
      const certificate = upstream.getPeerCertificate(true);
      if (certificate.raw.byteLength === 0 || !matchesPin(Uint8Array.from(certificate.raw), input.trust.digest)) {
        proxyFailure ??= new QualificationError('X1C_TLS_PIN_MISMATCH');
        upstream.destroy();
        client.destroy();
        return;
      }
      tlsConnected = true;
      const remoteAddress = isIP(input.address) === 6 ? `[${input.address}]` : input.address;
      const replacement = createStreamingRtspRequestRewriter(
        `rtsp://127.0.0.1:${localPort}`,
        `rtsps://${remoteAddress}:${input.port}`,
      );
      const rewrite = new Transform({
        transform(chunk: Uint8Array<ArrayBuffer>, _encoding: BufferEncoding, callback: TransformCallback) {
          callback(undefined, replacement.push(Uint8Array.from(chunk)));
        },
        flush(callback) {
          callback(undefined, replacement.flush());
        },
      });
      rewrite.once('error', () => {
        proxyFailure ??= new QualificationError('X1C_CAMERA_PROXY_FAILED');
        upstream.destroy();
        client.destroy();
      });
      client.pipe(rewrite).pipe(upstream);
      upstream.once('data', () => {
        upstreamResponded = true;
      });
      upstream.pipe(client);
      client.resume();
    });
  });
  server.maxConnections = 1;
  await new Promise<void>((resolve, reject) => {
    const fail = (): void => {
      reject(new QualificationError('X1C_CAMERA_PROXY_FAILED'));
    };
    server.once('error', fail);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', fail);
      resolve();
    });
  });
  server.on('error', () => {
    proxyFailure ??= new QualificationError('X1C_CAMERA_PROXY_FAILED');
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new QualificationError('X1C_CAMERA_PROXY_FAILED');
  }
  localPort = address.port;
  return Object.freeze({
    port: localPort,
    failure: (): QualificationError | undefined => proxyFailure,
    phase: () => Object.freeze({ tlsConnected, upstreamResponded }),
    close: async (): Promise<void> => {
      for (const client of clientSockets) {
        client.destroy();
      }
      for (const upstream of upstreamSockets) {
        upstream.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  });
};

const validateRtspsStillInput = (input: MachineNetworkStillInput, configuration: QualificationConfiguration): void => {
  if (
    input.endpoint.address !== configuration.address ||
    input.endpoint.port !== 322 ||
    input.path !== '/streaming/live/1' ||
    input.username !== 'bblp' ||
    input.secretRef !== 'keychain:x1c-qualification' ||
    input.trust.type !== 'pinned' ||
    input.trust.digest !== configuration.trust?.camera ||
    input.connectTimeout < 1000 ||
    input.connectTimeout > 60_000 ||
    input.maximumBytes < 4 ||
    input.maximumBytes > 4 * 1024 * 1024
  ) {
    throw new QualificationError('X1C_CAMERA_REQUEST_INVALID');
  }
  input.signal.throwIfAborted();
};

const splitMjpegFrames = (
  pending: Uint8Array<ArrayBuffer>,
  chunk: Uint8Array<ArrayBuffer>,
  maximumBytes: number,
): Readonly<{
  frames: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  pending: Uint8Array<ArrayBuffer>;
}> => {
  const bytes = Buffer.concat([Buffer.from(pending), Buffer.from(chunk)]);
  const frames: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const start = bytes.indexOf(Buffer.from([0xff, 0xd8]), offset);
    if (start === -1) {
      const tail = bytes.at(-1) === 0xff ? bytes.subarray(-1) : new Uint8Array();
      return { frames, pending: Uint8Array.from(tail) };
    }
    const end = bytes.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
    if (end === -1) {
      const remainder = bytes.subarray(start);
      if (remainder.byteLength > maximumBytes) {
        throw new QualificationError('X1C_CAMERA_READ_LIMIT');
      }
      return { frames, pending: Uint8Array.from(remainder) };
    }
    if (end + 2 - start > maximumBytes) {
      throw new QualificationError('X1C_CAMERA_READ_LIMIT');
    }
    frames.push(Uint8Array.from(bytes.subarray(start, end + 2)));
    offset = end + 2;
  }
  return { frames, pending: new Uint8Array() };
};

const createRtspsStillSampler = async (input: MachineNetworkStillInput, configuration: QualificationConfiguration) => {
  validateRtspsStillInput(input, configuration);
  const accessCode = await readAccessCode(configuration);
  const cancellation = new AbortController();
  const signal = AbortSignal.any([input.signal, cancellation.signal]);
  let latest: ReturnType<typeof parseBambuStill> | undefined;
  let lastFailure: string | undefined;
  let startedAt = new Date().toISOString();

  const running = (async (): Promise<void> => {
    while (!signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- the supervisor owns exactly one camera attempt at a time.
      const temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-x1c-camera-'));
      const inputPath = join(temporaryDirectory, 'camera.ffconcat');
      let proxy: Awaited<ReturnType<typeof createPinnedRtspProxy>> | undefined;
      try {
        startedAt = new Date().toISOString();
        // oxlint-disable-next-line no-await-in-loop -- reconnect attempts must remain serial.
        const activeProxy = await createPinnedRtspProxy({
          address: input.endpoint.address,
          port: input.endpoint.port,
          trust: input.trust as PinnedTrust,
          connectTimeout: input.connectTimeout,
        });
        proxy = activeProxy;
        const cameraUrl = new URL(`rtsp://127.0.0.1:${activeProxy.port}${input.path}`);
        cameraUrl.username = input.username;
        cameraUrl.password = accessCode;
        // oxlint-disable-next-line no-await-in-loop -- each private input belongs to its active attempt.
        await writeFile(
          inputPath,
          [
            'ffconcat version 1.0',
            `file '${cameraUrl.toString().replaceAll("'", '%27')}'`,
            'option rtsp_transport tcp',
            'option rtsp_flags prefer_tcp',
            `option timeout ${input.connectTimeout * 1000}`,
            '',
          ].join('\n'),
          { encoding: 'utf8', mode: 0o600 },
        );
        const child = spawn(
          'ffmpeg',
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-f',
            'concat',
            '-safe',
            '0',
            '-protocol_whitelist',
            'file,tcp,tls,rtp,udp,crypto',
            '-i',
            inputPath,
            '-f',
            'image2pipe',
            '-vcodec',
            'mjpeg',
            '-q:v',
            '2',
            'pipe:1',
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        // oxlint-disable-next-line no-await-in-loop, no-loop-func -- callbacks own only this attempt's child process.
        await new Promise<void>((resolve, reject) => {
          let diagnostic = '';
          let pending = new Uint8Array(new ArrayBuffer(0));
          let failure: QualificationError | undefined;
          let receivedFrame = false;
          let settled = false;
          let forcedStop: ReturnType<typeof setTimeout> | undefined;
          const terminate = (): void => {
            if (child.exitCode !== null || child.signalCode !== null) {
              return;
            }
            child.kill('SIGTERM');
            forcedStop ??= setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                child.kill('SIGKILL');
              }
            }, 2000);
            forcedStop.unref();
          };
          const finish = (error?: QualificationError): void => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(firstFrameTimeout);
            clearTimeout(forcedStop);
            signal.removeEventListener('abort', abortCapture);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };
          const stop = (error: QualificationError): void => {
            failure ??= error;
            terminate();
          };
          const abortCapture = terminate;
          const firstFrameTimeout = setTimeout(() => {
            stop(classifyCameraTimeout(diagnostic, activeProxy.phase()));
          }, input.connectTimeout);
          signal.addEventListener('abort', abortCapture, { once: true });
          child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
            try {
              const decoded = splitMjpegFrames(pending, chunk, input.maximumBytes);
              pending = decoded.pending;
              for (const frame of decoded.frames) {
                latest = parseBambuStill(frame, new Date().toISOString());
                lastFailure = undefined;
                receivedFrame = true;
                clearTimeout(firstFrameTimeout);
              }
            } catch (error) {
              stop(error instanceof QualificationError ? error : new QualificationError('X1C_CAMERA_CAPTURE_FAILED'));
            }
          });
          child.stderr.setEncoding('utf8');
          child.stderr.on('data', (chunk: string) => {
            diagnostic += chunk.slice(0, Math.max(0, 32 * 1024 - diagnostic.length));
          });
          child.once('error', () => {
            finish(new QualificationError('X1C_CAMERA_DECODER_UNAVAILABLE'));
          });
          child.once('close', () => {
            finish(
              signal.aborted
                ? undefined
                : (failure ??
                    activeProxy.failure() ??
                    (receivedFrame
                      ? new QualificationError('X1C_CAMERA_STREAM_ENDED')
                      : classifyCameraCaptureFailure(diagnostic))),
            );
          });
        });
      } catch (error) {
        lastFailure = failureCode(error);
        // oxlint-disable-next-line no-await-in-loop -- bounded backoff prevents a hot reconnect loop.
        await delay(cameraReconnectDelay, undefined, { signal }).catch(() => undefined);
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- attempt cleanup completes before reconnect.
        await proxy?.close();
        // oxlint-disable-next-line no-await-in-loop -- attempt secrets are removed before reconnect.
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
  })();

  const capture = async (signal_: AbortSignal): Promise<ReturnType<typeof parseBambuStill>> => {
    signal_.throwIfAborted();
    const now = Date.now();
    if (!latest || Date.parse(latest.capturedAt) + maximumCachedStillAge <= now) {
      throw new QualificationError(lastFailure ?? 'X1C_CAMERA_WARMING');
    }
    return Object.freeze({
      ...latest,
      bytes: Uint8Array.from(latest.bytes),
      expiresAt: new Date(now + 15_000).toISOString(),
    });
  };
  return Object.freeze({
    capture,
    status: () =>
      Object.freeze({
        state: latest && Date.parse(latest.expiresAt) > Date.now() ? 'ready' : lastFailure ? 'recovering' : 'starting',
        startedAt,
        capturedAt: latest?.capturedAt,
        failure: lastFailure,
      }),
    async waitForFrame(signal_: AbortSignal): Promise<ReturnType<typeof parseBambuStill>> {
      const deadline = Date.now() + input.connectTimeout;
      while (Date.now() < deadline) {
        signal_.throwIfAborted();
        try {
          // oxlint-disable-next-line no-await-in-loop -- this bounded wait observes without opening a connection.
          return await capture(signal_);
        } catch (error) {
          if (
            !(error instanceof QualificationError) ||
            !/^X1C_CAMERA_(?:WARMING|TLS_TIMEOUT|RTSP_TIMEOUT|FRAME_TIMEOUT|CAPTURE_FAILED)$/u.test(error.code)
          ) {
            throw error;
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- the poll is bounded by the caller's connect deadline.
        await delay(50, undefined, { signal: signal_ });
      }
      throw new QualificationError(lastFailure ?? 'X1C_CAMERA_FRAME_TIMEOUT');
    },
    async close(): Promise<void> {
      cancellation.abort();
      await running;
    },
  });
};

const captureRtspsStill = async (
  input: MachineNetworkStillInput,
  configuration: QualificationConfiguration,
): Promise<ReturnType<typeof parseBambuStill>> => {
  const sampler = await createRtspsStillSampler(input, configuration);
  try {
    return await sampler.waitForFrame(input.signal);
  } finally {
    await sampler.close();
  }
};

const configuredX1cStillInput = (
  configuration: QualificationConfiguration,
  signal: AbortSignal,
  connectTimeout = 10_000,
): MachineNetworkStillInput => {
  if (!configuration.trust) {
    throw new QualificationError('X1C_APPROVED_TRUST_PINS_REQUIRED');
  }
  return {
    endpoint: { address: configuration.address, port: 322 },
    trust: pinned(configuration.trust.camera),
    secretRef: 'keychain:x1c-qualification',
    username: 'bblp',
    path: '/streaming/live/1',
    connectTimeout,
    maximumBytes: 4 * 1024 * 1024,
    signal,
  };
};

const captureConfiguredX1cStillOnce = async (
  configuration: QualificationConfiguration,
  signal: AbortSignal,
): Promise<ReturnType<typeof parseBambuStill>> =>
  captureRtspsStill(configuredX1cStillInput(configuration, signal), configuration);

const captureConfiguredX1cStill = async (
  configuration: QualificationConfiguration,
  signal: AbortSignal,
): Promise<ReturnType<typeof parseBambuStill>> => captureConfiguredX1cStillOnce(configuration, signal);

const connectPinnedStream = async (input: MachineNetworkRequest): Promise<MachineNetworkStream> => {
  if (input.transport !== 'tls' || input.trust.type !== 'pinned') {
    throw new QualificationError('X1C_PINNED_TLS_REQUIRED');
  }
  input.signal.throwIfAborted();
  const socket = connectTls({
    host: input.endpoint.address,
    port: input.endpoint.port,
    rejectUnauthorized: false,
    ...(isIP(input.endpoint.address) === 0 ? { servername: input.endpoint.address } : {}),
  });
  const connected = Promise.withResolvers<void>();
  const connectTimeout = setTimeout(() => {
    connected.reject(new QualificationError('X1C_TLS_CONNECT_TIMEOUT'));
  }, input.connectTimeout);
  const abortConnection = (): void => {
    connected.reject(new QualificationError('X1C_TLS_CONNECT_ABORTED'));
  };
  const failConnection = (): void => {
    connected.reject(new QualificationError('X1C_TLS_CONNECT_FAILED'));
  };
  socket.once('secureConnect', () => {
    connected.resolve();
  });
  socket.once('error', failConnection);
  input.signal.addEventListener('abort', abortConnection, { once: true });
  try {
    await connected.promise;
    const certificate = socket.getPeerCertificate(true);
    if (certificate.raw.byteLength === 0 || !matchesPin(Uint8Array.from(certificate.raw), input.trust.digest)) {
      throw new QualificationError('X1C_TLS_PIN_MISMATCH');
    }
  } catch (error) {
    socket.destroy();
    throw error;
  } finally {
    clearTimeout(connectTimeout);
    socket.off('error', failConnection);
    input.signal.removeEventListener('abort', abortConnection);
  }
  socket.setTimeout(input.idleTimeout, () => {
    socket.destroy(new QualificationError('X1C_TLS_IDLE_TIMEOUT'));
  });
  socket.on('error', () => {
    // The bounded async iterator reports stream failures to the provider.
  });
  let readBytes = 0;
  let writtenBytes = 0;
  let closed = false;
  const abortStream = (): void => {
    socket.destroy(new QualificationError('X1C_TLS_STREAM_ABORTED'));
  };
  input.signal.addEventListener('abort', abortStream, { once: true });
  const readable = (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    for await (const raw of socket as AsyncIterable<Uint8Array<ArrayBuffer>>) {
      const chunk = Uint8Array.from(raw);
      readBytes += chunk.byteLength;
      if (readBytes > input.maximumReadBytes) {
        throw new QualificationError('X1C_TLS_READ_LIMIT');
      }
      yield chunk;
    }
  })();
  return Object.freeze({
    readable,
    async write(chunk) {
      writtenBytes += chunk.byteLength;
      if (writtenBytes > input.maximumWriteBytes) {
        throw new QualificationError('X1C_TLS_WRITE_LIMIT');
      }
      await new Promise<void>((resolve, reject) => {
        socket.write(chunk, (error) => {
          if (error) {
            reject(new QualificationError('X1C_TLS_WRITE_FAILED'));
            return;
          }
          resolve();
        });
      });
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      input.signal.removeEventListener('abort', abortStream);
      if (socket.destroyed) {
        return;
      }
      const socketClosed = Promise.withResolvers<void>();
      socket.once('close', () => {
        socketClosed.resolve();
      });
      socket.destroy();
      await socketClosed.promise;
    },
  });
};

const createConnectionRuntime = (
  configuration: QualificationConfiguration,
  cachedStill?: NonNullable<MachineConnectionRuntime['captureNetworkStill']>,
): MachineConnectionRuntime => ({
  clock: { now: () => new Date().toISOString() },
  async log() {
    // Protocol logs are deliberately discarded so endpoint and device details cannot reach qualification evidence.
  },
  connectStream: connectPinnedStream,
  async *readArtifact() {
    yield* [];
    throw new QualificationError('X1C_READ_ONLY_STAGE');
  },
  async resolveSecret(input) {
    if (input.reference !== 'keychain:x1c-qualification') {
      throw new QualificationError('X1C_SECRET_REFERENCE_INVALID');
    }
    input.signal.throwIfAborted();
    return readAccessCode(configuration);
  },
  async captureNetworkStill(input) {
    return cachedStill ? cachedStill(input) : captureRtspsStill(input, configuration);
  },
});

const loadCubeArtifact = async (): Promise<
  Readonly<{ artifact: MachineArtifactReference; bytes: Uint8Array<ArrayBuffer> }>
> => {
  const path = join(process.cwd(), cubeArtifactRelativePath);
  const bytes = Uint8Array.from(await readFile(path));
  if (bytes.byteLength !== cubeArtifactLength || digest(bytes) !== cubeArtifactDigest) {
    throw new QualificationError('X1C_CUBE_ARTIFACT_MISMATCH');
  }
  const artifact: MachineArtifactReference = Object.freeze({
    projectId: 'proj_x1cQualification00000',
    path: cubeArtifactRelativePath,
    digest: cubeArtifactDigest as MachineArtifactReference['digest'],
    length: bytes.byteLength,
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    contract: Object.freeze({ id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 }),
    selectedMember: 'Metadata/plate_1.gcode',
  });
  return Object.freeze({ artifact, bytes });
};

const createPrintConnectionRuntime = (
  configuration: QualificationConfiguration,
  expected: Awaited<ReturnType<typeof loadCubeArtifact>>,
): MachineConnectionRuntime => ({
  ...createConnectionRuntime(configuration),
  async *readArtifact(input) {
    if (
      input.maximumBytes < expected.bytes.byteLength ||
      input.artifact.digest !== expected.artifact.digest ||
      input.artifact.length !== expected.artifact.length ||
      input.artifact.path !== expected.artifact.path ||
      input.artifact.selectedMember !== expected.artifact.selectedMember
    ) {
      throw new QualificationError('X1C_ARTIFACT_READ_DENIED');
    }
    input.signal.throwIfAborted();
    yield Uint8Array.from(expected.bytes);
  },
  async uploadFile(input) {
    return uploadBambuFile(input, configuration);
  },
});

const openSession = async (
  configuration: QualificationConfiguration,
  signal: AbortSignal,
  runtime: MachineConnectionRuntime = createConnectionRuntime(configuration),
): Promise<QualificationSession> => {
  if (!configuration.trust) {
    throw new QualificationError('X1C_APPROVED_TRUST_PINS_REQUIRED');
  }
  const definition = await resolveRuntimePluginDefinition('machine', bambuMachine());
  const observedAt = new Date().toISOString();
  const event = await definition
    .discover(
      { configuration, signal },
      {
        clock: { now: () => new Date().toISOString() },
        async *listenDatagrams() {
          yield* [];
          throw new QualificationError('X1C_MANUAL_BINDING_REQUIRED');
        },
      },
    )
    [Symbol.asyncIterator]()
    .next();
  if (event.done === true || event.value.type === 'lost') {
    throw new QualificationError('X1C_MANUAL_BINDING_FAILED');
  }
  return definition.connect(
    {
      candidate: { ...event.value.candidate, observedAt },
      configuration,
      connection: {
        secretRef: 'keychain:x1c-qualification',
        serviceTrust: {
          mqtt: pinned(configuration.trust.mqtt),
          camera: pinned(configuration.trust.camera),
        },
      },
      signal,
    },
    runtime,
  );
};

const awaitReadOnlyState = async (session: QualificationSession, signal: AbortSignal) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- this bounded loop polls one live session serially.
    const [descriptor, snapshot] = await Promise.all([
      session.getDescriptor({ signal }),
      session.getSnapshot({ signal }),
    ]);
    if (descriptor.firmware !== 'unknown' && snapshot.connection === 'connected') {
      return { descriptor, snapshot };
    }
    // oxlint-disable-next-line no-await-in-loop -- the fixed delay bounds read-only device polling to 2 Hz.
    await delay(500, undefined, { signal });
  }
  throw new QualificationError('X1C_INITIAL_STATUS_TIMEOUT');
};

const closeSession = async (session: QualificationSession | undefined): Promise<void> => {
  if (session) {
    await session.close().catch(() => undefined);
  }
};

const createLiveSessionSupervisor = (
  configuration: QualificationConfiguration,
  camera: Pick<Awaited<ReturnType<typeof createRtspsStillSampler>>, 'capture'>,
  signal: AbortSignal,
) => {
  let session: QualificationSession | undefined;
  let failure = 'BAMBU_MQTT_RECONNECTING';
  const running = (async (): Promise<void> => {
    while (!signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- reconnect attempts are intentionally serialized.
        session = await openSession(
          configuration,
          signal,
          createConnectionRuntime(configuration, async (input) => camera.capture(input.signal)),
        );
        failure = '';
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- this reads the current in-memory session projection.
          const snapshot = await session.getSnapshot({ signal });
          if (snapshot.connection !== 'connected') {
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- one-second health observation owns no network reconnect.
          await delay(1000, undefined, { signal }).catch(() => undefined);
        }
        failure = 'BAMBU_MQTT_DISCONNECTED';
      } catch (error) {
        failure = failureCode(error);
      } finally {
        const closing = session;
        session = undefined;
        // oxlint-disable-next-line no-await-in-loop -- the old epoch closes before a replacement is opened.
        await closeSession(closing);
      }
      // oxlint-disable-next-line no-await-in-loop -- bounded backoff prevents a hot reconnect loop.
      await delay(1000, undefined, { signal }).catch(() => undefined);
    }
  })();
  return Object.freeze({
    current: (): QualificationSession | undefined => session,
    failure: (): string => failure,
    closed: running,
  });
};

const runCameraReadOnly = async (configuration: QualificationConfiguration): Promise<void> => {
  const cancellation = new AbortController();
  try {
    const still = await captureConfiguredX1cStill(configuration, cancellation.signal);
    process.stdout.write(
      `${JSON.stringify({
        stage: 'camera-read-only',
        still: {
          status: 'captured',
          byteLength: still.bytes.byteLength,
          capturedAt: still.capturedAt,
          expiresAt: still.expiresAt,
        },
      })}\n`,
    );
  } finally {
    cancellation.abort();
  }
};

const liveViewOrigin = (): string => {
  const value = process.env['TAU_X1C_LIVE_VIEW_ORIGIN'] ?? 'http://127.0.0.1:4173';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new QualificationError('X1C_LIVE_VIEW_ORIGIN_INVALID');
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== value ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new QualificationError('X1C_LIVE_VIEW_ORIGIN_INVALID');
  }
  return parsed.origin;
};

const liveViewPort = (): number => {
  const value = process.env['TAU_X1C_LIVE_VIEW_PORT'] ?? '4174';
  const port = /^\d{4,5}$/u.test(value) ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new QualificationError('X1C_LIVE_VIEW_PORT_INVALID');
  }
  return port;
};

const matchesLiveViewGrant = (authorization: string | undefined, grant: string): boolean => {
  if (authorization === undefined) {
    return false;
  }
  const actual = Buffer.from(authorization, 'utf8');
  const expected = Buffer.from(`Bearer ${grant}`, 'utf8');
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
};

const isLiveViewRequestGranted = (input: {
  authorization: string | undefined;
  expiresAt: number;
  grant: string;
  method: string | undefined;
  now: number;
  origin: string | undefined;
  requiredOrigin: string;
}): boolean =>
  input.method === 'GET' &&
  input.origin === input.requiredOrigin &&
  input.now < input.expiresAt &&
  matchesLiveViewGrant(input.authorization, input.grant);

const setLiveViewHeaders = (response: ServerResponse, origin: string): void => {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Expose-Headers', 'X-Tau-Captured-At, X-Tau-Error, X-Tau-Expires-At');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  response.setHeader('Vary', 'Origin');
};

const sendLiveViewFailure = (response: ServerResponse, status: number, code: string): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Tau-Error', code);
  response.end(`${JSON.stringify({ code })}\n`);
};

const runLiveReadOnly = async (configuration: QualificationConfiguration): Promise<void> => {
  const activeConfiguration = await resolveCurrentConfiguration(configuration);
  const origin = liveViewOrigin();
  const port = liveViewPort();
  const grant = randomBytes(32).toString('base64url');
  const grantExpiresAt = Date.now() + 4 * 60 * 60 * 1000;
  const liveViewLifetime = new AbortController();
  let serverFailure: QualificationError | undefined;
  const stopped = Promise.withResolvers<void>();
  const stop = (): void => {
    stopped.resolve();
  };
  const camera = await createRtspsStillSampler(
    configuredX1cStillInput(activeConfiguration, liveViewLifetime.signal, 15_000),
    activeConfiguration,
  );
  const liveSession = createLiveSessionSupervisor(activeConfiguration, camera, liveViewLifetime.signal);
  try {
    const server = createHttpServer((request: IncomingMessage, response: ServerResponse) => {
      const handle = async (): Promise<void> => {
        if (request.headers.origin !== origin) {
          sendLiveViewFailure(response, 403, 'X1C_LIVE_VIEW_ORIGIN_DENIED');
          return;
        }
        setLiveViewHeaders(response, origin);
        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.setHeader('Access-Control-Allow-Headers', 'Authorization');
          response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          response.end();
          return;
        }
        if (
          !isLiveViewRequestGranted({
            authorization: request.headers.authorization,
            expiresAt: grantExpiresAt,
            grant,
            method: request.method,
            now: Date.now(),
            origin: request.headers.origin,
            requiredOrigin: origin,
          })
        ) {
          sendLiveViewFailure(response, 403, 'X1C_LIVE_VIEW_GRANT_DENIED');
          return;
        }
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (requestUrl.search || requestUrl.hash) {
          sendLiveViewFailure(response, 404, 'X1C_LIVE_VIEW_ROUTE_UNKNOWN');
          return;
        }
        const requestAbort = new AbortController();
        const abortRequest = (): void => {
          requestAbort.abort();
        };
        request.once('aborted', abortRequest);
        response.once('close', () => {
          if (!response.writableEnded) {
            abortRequest();
          }
        });
        const signal = AbortSignal.any([liveViewLifetime.signal, requestAbort.signal]);
        if (requestUrl.pathname === '/status') {
          const session = liveSession.current();
          if (!session) {
            throw new QualificationError(liveSession.failure());
          }
          const [descriptor, snapshot] = await Promise.all([
            session.getDescriptor({ signal }),
            session.getSnapshot({ signal }),
          ]);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(
            `${JSON.stringify({
              machineId: activeConfiguration.logicalId,
              descriptor: {
                name: descriptor.name,
                vendor: descriptor.vendor,
                model: descriptor.model,
                firmware: descriptor.firmware,
                technology: descriptor.technology,
                accepts: descriptor.accepts,
                operations: descriptor.operations,
                ratedEnvelope: descriptor.ratedEnvelope,
                printableEnvelope: descriptor.printableEnvelope,
                tools: descriptor.tools,
                materialSystem: descriptor.materialSystem,
                bedTypes: descriptor.bedTypes,
              },
              snapshot,
              camera: camera.status(),
            })}\n`,
          );
          return;
        }
        if (requestUrl.pathname !== '/still') {
          sendLiveViewFailure(response, 404, 'X1C_LIVE_VIEW_ROUTE_UNKNOWN');
          return;
        }
        const still = await camera.capture(signal);
        response.statusCode = 200;
        response.setHeader('Content-Type', still.mediaType);
        response.setHeader('Content-Length', String(still.bytes.byteLength));
        response.setHeader('X-Tau-Captured-At', still.capturedAt);
        response.setHeader('X-Tau-Expires-At', still.expiresAt);
        response.end(Buffer.from(still.bytes));
      };
      const handleSafely = async (): Promise<void> => {
        try {
          await handle();
        } catch (error) {
          if (response.headersSent) {
            response.destroy();
            return;
          }
          setLiveViewHeaders(response, origin);
          sendLiveViewFailure(response, 502, failureCode(error));
        }
      };
      // async-iife: Node owns request settlement; handleSafely contains and converts every rejection.
      void handleSafely();
    });
    await new Promise<void>((resolve, reject) => {
      const fail = (): void => {
        reject(new QualificationError('X1C_LIVE_VIEW_SERVER_FAILED'));
      };
      server.once('error', fail);
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        server.off('error', fail);
        resolve();
      });
    });
    server.on('error', () => {
      serverFailure ??= new QualificationError('X1C_LIVE_VIEW_SERVER_FAILED');
      stop();
    });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.stdout.write(
      `${JSON.stringify({
        stage: 'serve-read-only',
        status: 'listening',
        url: `${origin}/x1c#live=${grant}`,
        expiresAt: new Date(grantExpiresAt).toISOString(),
      })}\n`,
    );
    try {
      await stopped.promise;
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      liveViewLifetime.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    if (serverFailure) {
      throw serverFailure;
    }
  } finally {
    liveViewLifetime.abort();
    await liveSession.closed;
    await camera.close();
  }
};

const runReadOnly = async (configuration: QualificationConfiguration): Promise<void> => {
  const cancellation = new AbortController();
  let session: QualificationSession | undefined;
  try {
    session = await openSession(configuration, cancellation.signal);
    const first = await awaitReadOnlyState(session, cancellation.signal);
    if (session.stillCapture.type !== 'supported') {
      throw new QualificationError('X1C_CAMERA_UNAVAILABLE');
    }
    const still = await session.stillCapture
      .capture({ signal: cancellation.signal })
      .then((capture) => ({
        status: 'captured',
        byteLength: capture.bytes.byteLength,
        capturedAt: capture.capturedAt,
        expiresAt: capture.expiresAt,
      }))
      .catch((error: unknown) => ({
        status: 'unavailable',
        code: failureCode(error),
      }));
    await closeSession(session);
    session = await openSession(configuration, cancellation.signal);
    const reconnected = await awaitReadOnlyState(session, cancellation.signal);
    process.stdout.write(
      `${JSON.stringify({
        stage: 'read-only',
        mode: configuration.mode,
        identitySha256: digest(Uint8Array.from(Buffer.from(configuration.serial))),
        descriptor: {
          vendor: first.descriptor.vendor,
          model: first.descriptor.model,
          firmware: first.descriptor.firmware,
          technology: first.descriptor.technology,
          accepts: first.descriptor.accepts,
          operations: first.descriptor.operations,
          ratedEnvelope: first.descriptor.ratedEnvelope,
          printableEnvelope: first.descriptor.printableEnvelope,
          tools: first.descriptor.tools,
          materialSystem: first.descriptor.materialSystem,
          bedTypes: first.descriptor.bedTypes,
        },
        snapshot: {
          connection: first.snapshot.connection,
          readiness: first.snapshot.readiness,
          ...(first.snapshot.activeRunId
            ? {
                activeRunIdentitySha256: digest(Uint8Array.from(Buffer.from(first.snapshot.activeRunId))),
              }
            : {}),
          observedAt: first.snapshot.observedAt,
          setup: first.snapshot.setup,
          run: first.snapshot.run,
          temperatures: first.snapshot.temperatures,
        },
        still,
        reconnect: {
          connection: reconnected.snapshot.connection,
          firmware: reconnected.descriptor.firmware,
          readiness: reconnected.snapshot.readiness,
          setup: reconnected.snapshot.setup,
          run: reconnected.snapshot.run,
          temperatures: reconnected.snapshot.temperatures,
          observedAt: reconnected.snapshot.observedAt,
        },
      })}\n`,
    );
  } finally {
    cancellation.abort();
    await closeSession(session);
  }
};

const waitForCurrentMachine = async (
  client: ReturnType<typeof connectMachineChannel>,
  machineId: string,
  signal: AbortSignal,
): Promise<MachineDirectoryEntry> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- bounded polling waits for the one attached machine projection.
    const entry = await client.get({ machineId, signal }).catch(() => undefined);
    if (
      entry?.freshness === 'current' &&
      entry.snapshot.connection === 'connected' &&
      entry.descriptor.firmware !== 'unknown'
    ) {
      return entry;
    }
    // oxlint-disable-next-line no-await-in-loop -- the fixed delay bounds startup observation to 2 Hz.
    await delay(500, undefined, { signal });
  }
  throw new QualificationError('X1C_PRINT_MACHINE_NOT_CURRENT');
};

/**
 * Refuse to print when the store before `x1c-machine-store` already holds an effect for the fixed start operation.
 * Effects are never imported into a new store, so without this a re-run would send the same start again. The old
 * journal is only read; a missing one means nothing was sent from it. After checking the printer, bump the
 * operation id's `-v` suffix to print again.
 */
const assertStartNotInOldStore = async (): Promise<void> => {
  let journal: string;
  try {
    journal = await readFile(join(dirname(configurationPath), 'x1c-machine-authority', 'machine-events.jsonl'), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  // Every intent, send and result of the start names its operation id as one JSON string.
  if (journal.includes(JSON.stringify(printOperationId))) {
    throw new QualificationError('X1C_PRINT_START_ALREADY_IN_OLD_STORE');
  }
};

const runPrintCube = async (configuration: QualificationConfiguration): Promise<void> => {
  await assertStartNotInOldStore();
  const activeConfiguration = await resolveCurrentConfiguration(configuration);
  const artifact = await loadCubeArtifact();
  const ftpTrust = await resolveFtpTrust(activeConfiguration);
  const { trust } = activeConfiguration;
  if (!trust) {
    throw new QualificationError('X1C_APPROVED_TRUST_PINS_REQUIRED');
  }
  const cancellation = new AbortController();
  const runtime = Object.freeze({
    discovery: Object.freeze({
      clock: Object.freeze({ now: () => new Date().toISOString() }),
      listenDatagrams,
    }),
    connection: () => createPrintConnectionRuntime(activeConfiguration, artifact),
  });
  const admission = createHostAdmissionAuthority({ hostId: 'x1c-qualification-host' });
  await mkdir(join(dirname(configurationPath), 'x1c-machine-store'), {
    recursive: true,
    mode: 0o700,
  });
  const host = await createNodeMachineHost({
    storeRoot: join(dirname(configurationPath), 'x1c-machine-store'),
    hostId: 'x1c-qualification-host',
    authorityId: 'x1c-qualification-authority',
    admission,
    providers: [bambuMachine()],
    runtime,
    onError(error) {
      process.stderr.write(`X1C_HOST_${failureCode(error)}\n`);
    },
  });
  const admitted = host.issueSession({
    actor: { kind: 'user', id: 'operator' },
    grants: [
      { route: 'machines', operation: 'machines.discover' },
      { route: 'machines', operation: 'machines.beginBinding' },
      { route: 'machines', operation: 'machines.list' },
      { route: 'machines', operation: 'machines.get' },
      { route: 'machines', operation: 'machines.preparePrint' },
      { route: 'machines', operation: 'machines.uploadPrint' },
      { route: 'machines', operation: 'machines.startPrint' },
      { route: 'machines', operation: 'machines.reconcileOperation' },
    ],
  });
  const ports = new MessageChannel();
  const server = host.serve({
    port: ports.port1,
    session: admitted,
  });
  const client = connectMachineChannel(ports.port2);
  let phase = 'CHANNEL';
  try {
    await client.ready;
    phase = 'DIRECTORY';
    const listed = await client.list({ signal: cancellation.signal });
    // The store names the printer: its id is the one its binding returned, found again by the printer's serial.
    let machineId = listed.entries.find(
      (entry) => entry.providerId === 'bambu' && entry.descriptor.id === activeConfiguration.serial,
    )?.machineId;
    if (machineId === undefined) {
      phase = 'DISCOVERY';
      let candidate: MachineCandidate | undefined;
      for await (const event of client.discover({
        providerId: 'bambu',
        configuration: {
          logicalId: activeConfiguration.logicalId,
          address: activeConfiguration.address,
          serial: activeConfiguration.serial,
        },
        signal: cancellation.signal,
      })) {
        if (event.type !== 'lost' && event.candidate.claimedIdentity.serial === activeConfiguration.serial) {
          candidate = event.candidate;
          break;
        }
      }
      if (!candidate) {
        throw new QualificationError('X1C_PRINT_BINDING_CANDIDATE_MISSING');
      }
      const ceremony = await client.beginBinding({
        candidate,
        name: activeConfiguration.logicalId,
        signal: cancellation.signal,
      });
      phase = 'BINDING';
      const bound =
        ceremony.status === 'operator-action-required'
          ? await host.completeBinding({
              ceremonyId: ceremony.ceremonyId,
              secretRef: 'keychain:x1c-qualification',
              serviceTrust: {
                mqtt: pinned(trust.mqtt),
                camera: pinned(trust.camera),
                ftp: ftpTrust,
              },
            })
          : ceremony;
      if (bound.status !== 'bound') {
        throw new QualificationError('X1C_PRINT_BINDING_INCOMPLETE');
      }
      ({ machineId } = bound);
    }
    phase = 'SETUP';
    const entry = await waitForCurrentMachine(client, machineId, cancellation.signal);
    const nozzle = entry.descriptor.tools[0]?.nozzleDiameter;
    const material = entry.snapshot.setup.materials.find((row) => row.slot === 0);
    if (
      entry.descriptor.model !== 'X1C' ||
      entry.descriptor.firmware !== '01.12.00.00' ||
      entry.snapshot.readiness !== 'idle' ||
      entry.snapshot.activeRunId !== undefined ||
      nozzle?.value !== 0.4 ||
      nozzle.unit.code !== 'mm' ||
      material?.state !== 'loaded' ||
      material.materialId?.toLowerCase() !== 'petg'
    ) {
      throw new QualificationError('X1C_PRINT_SETUP_UNQUALIFIED');
    }
    phase = 'UPLOAD';
    const prepared = await client.preparePrint({
      machineId,
      artifact: artifact.artifact,
      configuration: {
        amsMapping: [0],
        bedLeveling: true,
        expectedBedType: 'hot_plate',
        expectedFilamentDiameter: {
          value: 1.75,
          unit: 'mm',
          kind: 'http://qudt.org/vocab/quantitykind/Diameter',
          space: 'linear',
        },
        expectedMaterials: [{ slot: 0, materialId: 'PETG' }],
        expectedModel: 'X1C',
        expectedNozzleDiameter: {
          value: 0.4,
          unit: 'mm',
          kind: 'http://qudt.org/vocab/quantitykind/Diameter',
          space: 'linear',
        },
        operatorConfirmedBedType: 'hot_plate',
        flowCalibration: true,
        timelapse: false,
      },
      signal: cancellation.signal,
    });
    const uploaded = await client.uploadPrint({
      machineId,
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
      operationId: `${printOperationId}-upload`,
      signal: cancellation.signal,
    });
    if (uploaded.status !== 'accepted' || uploaded.kind !== 'upload') {
      throw new QualificationError('X1C_UPLOAD_NOT_ACCEPTED');
    }
    process.stdout.write(
      `${JSON.stringify({ stage: 'print-cube', status: 'uploaded', artifactSha256: cubeArtifactDigest.slice(7), amsSlot: 0, bedType: 'hot_plate', nozzleDiameterMm: 0.4 })}\n`,
    );
    phase = 'START';
    let receipt: MachineOperationReceipt = await client.startPrint({
      machineId,
      preparedId: prepared.preparedId,
      preparedDigest: prepared.preparedDigest,
      transferId: uploaded.evidence.transferId,
      expectedSetupDigest: prepared.setupDigest,
      operationId: printOperationId,
      signal: cancellation.signal,
    });
    for (let attempt = 0; receipt.status === 'unknown' && attempt < 15; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- reconciliation observes one possible send and never retransmits it.
      await delay(1000, undefined, { signal: cancellation.signal });
      // oxlint-disable-next-line no-await-in-loop -- exact operation reconciliation is the only safe unknown-result path.
      const reconciled = await client.reconcileOperation({
        machineId,
        operationId: printOperationId,
        signal: cancellation.signal,
      });
      if (reconciled.receipt) {
        receipt = reconciled.receipt;
      }
    }
    if (receipt.status === 'rejected') {
      if (receipt.message.toLowerCase().includes('verify failed')) {
        throw new QualificationError('X1C_DEVELOPER_MODE_REQUIRED');
      }
      throw new QualificationError('X1C_START_REJECTED');
    }
    let observedActive = false;
    let lastProgress = -1;
    const deadline = Date.now() + 90 * 60_000;
    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- supervised monitoring reads one durable machine projection serially.
      const current = await client.get({
        machineId,
        signal: cancellation.signal,
      });
      const { run } = current.snapshot;
      const active = ['preparing', 'printing', 'paused', 'finishing'].includes(run?.state ?? '');
      if (active) {
        observedActive = true;
      }
      if (receipt.status === 'unknown' && !observedActive) {
        throw new QualificationError('X1C_START_UNCONFIRMED');
      }
      if (observedActive && run?.state === 'succeeded') {
        process.stdout.write(
          `${JSON.stringify({ stage: 'print-cube', status: 'completed', progress: run.progress ?? 100, completedAt: new Date().toISOString() })}\n`,
        );
        return;
      }
      if (observedActive && run?.state === 'failed') {
        throw new QualificationError('X1C_PRINT_FAILED');
      }
      const progress = Math.floor(run?.progress ?? 0);
      if (observedActive && progress !== lastProgress) {
        lastProgress = progress;
        process.stdout.write(
          `${JSON.stringify({ stage: 'print-cube', status: run?.state, progress, currentLayer: run?.currentLayer, totalLayers: run?.totalLayers, remainingSeconds: run?.remainingSeconds })}\n`,
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- five-second reads are bounded by the ninety-minute supervised run.
      await delay(5000, undefined, { signal: cancellation.signal });
    }
    throw new QualificationError('X1C_PRINT_MONITOR_TIMEOUT');
  } catch (error) {
    if (failureCode(error) !== 'X1C_QUALIFICATION_FAILED') {
      throw error;
    }
    if (error instanceof z.ZodError) {
      const path =
        error.issues[0]?.path
          .join('_')
          .replaceAll(/[^A-Za-z0-9]/gu, '_')
          .toUpperCase() ?? 'UNKNOWN';
      throw new QualificationError(`X1C_PRINT_${phase}_SCHEMA_${path}`);
    }
    if (error instanceof TypeError) {
      const cachePath = /^Invalid CacheValue at ([A-Za-z0-9_$.[\]]+):/u.exec(error.message)?.[1];
      if (cachePath) {
        throw new QualificationError(
          `X1C_PRINT_${phase}_CACHE_${cachePath.replaceAll(/[^A-Za-z0-9]/gu, '_').toUpperCase()}`,
        );
      }
      throw new QualificationError(`X1C_PRINT_${phase}_TYPE_FAILED`);
    }
    throw new QualificationError(`X1C_PRINT_${phase}_FAILED`);
  } finally {
    cancellation.abort();
    client.close();
    server.dispose();
    await host.close();
  }
};

const selfCheck = async (): Promise<void> => {
  const sample = {
    address: '192.0.2.1',
    serial: '00MREDACTED',
    logicalId: 'workshop-x1c',
    mode: 'developer-lan',
    keychain: { service: 'tau-x1c', account: 'lan-access-code' },
    trust: {
      mqtt: `sha256:${'a'.repeat(64)}`,
      camera: `sha256:${'b'.repeat(64)}`,
    },
  } as const;
  assert.equal(configurationSchema.safeParse(sample).success, true);
  assert.equal(
    relocateConfiguration(sample, {
      address: '192.0.2.2',
      model: 'X1C',
      serial: sample.serial,
    }).address,
    '192.0.2.2',
  );
  assert.throws(
    () =>
      relocateConfiguration(sample, {
        address: '192.0.2.2',
        model: 'X1C',
        serial: '00MOTHER',
      }),
    /X1C_DISCOVERED_IDENTITY_MISMATCH/u,
  );
  assert.equal(
    configurationSchema.safeParse({
      ...sample,
      accessCode: 'must-not-be-admitted',
    }).success,
    false,
  );
  assert.equal(matchesPin(Uint8Array.from([1, 2, 3]), digest(Uint8Array.from([1, 2, 3]))), true);
  assert.equal(matchesPin(Uint8Array.from([1, 2, 3]), `sha256:${'0'.repeat(64)}`), false);
  const redacted = JSON.stringify({
    identitySha256: digest(Uint8Array.from(Buffer.from(sample.serial))),
    mode: sample.mode,
  });
  assert.equal(redacted.includes(sample.address), false);
  assert.equal(redacted.includes(sample.serial), false);
  assert.equal(redacted.includes(sample.trust.mqtt), false);
  assert.equal(failureCode(new Error('BAMBU_MQTT_CONNECT_FAILED')), 'BAMBU_MQTT_CONNECT_FAILED');
  assert.equal(failureCode(new Error('secret detail')), 'X1C_QUALIFICATION_FAILED');
  assert.equal(classifyCameraCaptureFailure('tls: certificate verify failed').code, 'X1C_CAMERA_TLS_FAILED');
  assert.equal(classifyCameraCaptureFailure('server returned 401 Unauthorized').code, 'X1C_CAMERA_AUTH_FAILED');
  assert.equal(
    classifyCameraTimeout('', { tlsConnected: false, upstreamResponded: false }).code,
    'X1C_CAMERA_TLS_TIMEOUT',
  );
  assert.equal(
    classifyCameraTimeout('', { tlsConnected: true, upstreamResponded: false }).code,
    'X1C_CAMERA_RTSP_TIMEOUT',
  );
  assert.equal(
    classifyCameraTimeout('', { tlsConnected: true, upstreamResponded: true }).code,
    'X1C_CAMERA_FRAME_TIMEOUT',
  );
  const firstFrameChunk = splitMjpegFrames(new Uint8Array(), Uint8Array.from([0xff, 0xd8, 1]), 16);
  const secondFrameChunk = splitMjpegFrames(
    firstFrameChunk.pending,
    Uint8Array.from([2, 0xff, 0xd9, 0, 0xff, 0xd8, 3, 0xff, 0xd9]),
    16,
  );
  assert.deepEqual(
    secondFrameChunk.frames.map((frame) => [...frame]),
    [
      [0xff, 0xd8, 1, 2, 0xff, 0xd9],
      [0xff, 0xd8, 3, 0xff, 0xd9],
    ],
  );
  assert.equal(secondFrameChunk.pending.byteLength, 0);
  assert.equal(matchesLiveViewGrant(`Bearer ${'x'.repeat(43)}`, 'x'.repeat(43)), true);
  assert.equal(matchesLiveViewGrant(`Bearer ${'x'.repeat(43)}`, 'y'.repeat(43)), false);
  const liveRequest = {
    authorization: `Bearer ${'x'.repeat(43)}`,
    expiresAt: 2,
    grant: 'x'.repeat(43),
    method: 'GET',
    now: 1,
    origin: 'http://127.0.0.1:4173',
    requiredOrigin: 'http://127.0.0.1:4173',
  } as const;
  assert.equal(isLiveViewRequestGranted(liveRequest), true);
  assert.equal(isLiveViewRequestGranted({ ...liveRequest, now: 2 }), false);
  assert.equal(
    isLiveViewRequestGranted({
      ...liveRequest,
      origin: 'http://localhost:4173',
    }),
    false,
  );
  const replacement = createStreamingRtspRequestRewriter('rtsp://127.0.0.1:1234', 'rtsps://printer:322');
  const rewritten = Buffer.concat([
    replacement.push(Uint8Array.from(Buffer.from('OPTIONS rtsp://127.0.'))),
    replacement.push(
      Uint8Array.from(
        Buffer.from('0.1:1234/stream RTSP/1.0\r\nAuthorization: Digest uri="rtsp://127.0.0.1:1234/stream"\r\n\r\n'),
      ),
    ),
    replacement.flush(),
  ]).toString('latin1');
  assert.equal(
    rewritten,
    'OPTIONS rtsps://printer:322/stream RTSP/1.0\r\nAuthorization: Digest uri="rtsp://127.0.0.1:1234/stream"\r\n\r\n',
  );
  process.stdout.write('X1C qualification self-check passed.\n');
};

const main = async (): Promise<void> => {
  try {
    const stageArgument = process.argv.find((argument) => argument.startsWith('--stage='));
    const stage = stageArgument?.slice('--stage='.length);
    if (stage === 'self-check') {
      await selfCheck();
      return;
    }
    if (stage === 'print-cube') {
      requirePrintConsent();
      await runPrintCube(await readConfiguration());
      return;
    }
    requireReadOnlyConsent();
    if (stage === 'discover-read-only') {
      await runPassiveDiscovery();
      return;
    }
    if (stage === 'probe-discovered-read-only') {
      const candidate = await discoverPassiveX1c();
      process.stdout.write(
        `${JSON.stringify({
          stage: 'probe-discovered-read-only',
          identitySha256: candidate.claimedIdentity.serial
            ? digest(Uint8Array.from(Buffer.from(candidate.claimedIdentity.serial)))
            : undefined,
          endpointSha256: digest(Uint8Array.from(Buffer.from(candidate.endpoint.address))),
          mqtt: await probeCertificate(candidate.endpoint.address, 8883),
          camera: await probeCertificate(candidate.endpoint.address, 322),
        })}\n`,
      );
      return;
    }
    if (stage === 'prepare-read-only') {
      await prepareReadOnlyConfiguration();
      return;
    }
    const configuration = await readConfiguration();
    if (stage === 'probe-read-only') {
      process.stdout.write(
        `${JSON.stringify({
          mqtt: await probeCertificate(configuration.address, 8883),
          camera: await probeCertificate(configuration.address, 322),
        })}\n`,
      );
      return;
    }
    if (stage === 'camera-read-only') {
      await runCameraReadOnly(configuration);
      return;
    }
    if (stage === 'serve-read-only') {
      await runLiveReadOnly(configuration);
      return;
    }
    if (stage === 'read-only') {
      await runReadOnly(configuration);
      return;
    }
    throw new QualificationError('X1C_STAGE_INVALID');
  } catch (error) {
    process.stderr.write(`ERROR: ${failureCode(error)}\n`);
    process.exitCode = 1;
  }
};

// oxlint-disable-next-line unicorn/prefer-top-level-await -- create-script requires one caught main wrapper for operator scripts.
void main();

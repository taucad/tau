/**
 * Host-owned machine services shared by the desktop services utility and the
 * `tau serve --machines` daemon: the network, secret and artifact runtime a
 * `createNodeMachineHost` needs, and its durable identity.
 *
 * Both launchers run this one implementation. The standard protocols it offers
 * providers (TCP and TLS streams, UDP discovery, implicit-FTPS upload, RTSPS
 * stills) take every endpoint, account and limit from the provider's call,
 * and every TLS connection is pinned to the trust the binding ceremony
 * recorded; nothing here knows a vendor.
 *
 * @public
 */

import { createHash, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { on } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { connect as connectTcp, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { connect as connectTls } from 'node:tls';
import type { PeerCertificate, TLSSocket } from 'node:tls';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { connectMachineChannel, withMachineCode } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineClient,
  MachineConnectionRuntime,
  MachineDatagram,
  MachineDatagramListenInput,
  MachineFileUploadInput,
  MachineFileUploadReceipt,
  MachineLogEntry,
  MachineNetworkRequest,
  MachineNetworkStream,
  MachineTransportTrust,
} from '@taucad/runtime/machine';
import type { HostRouteGrant } from '@taucad/runtime/host';
import { createNodeMachineSerial } from '@taucad/runtime/host/node';
import type {
  CreateNodeMachineHostInput,
  NodeMachineRuntime,
  NodeMachineSerialDriver,
} from '@taucad/runtime/host/node';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { projectManifestMaxBytes } from '@taucad/types';
import { z } from 'zod';

import { captureRtspsStill, findFfmpeg } from '#rtsps-still.js';
import { createFileSecretVault, readJson, writeProtected } from '#secret-vault.js';
import type { SecretVault, SecretVaultFacts, SecretVaultWriteOptions } from '#secret-vault.js';

/**
 * A machines facet for the tools composed beside a host: one in-process
 * channel, connected now and served by `serve` once the host is ready, so a
 * registry built synchronously still offers the machine tools.
 *
 * A serve that fails closes both ends, so every call rejects with the channel
 * instead of hanging; closing the facet retires the served session with it.
 * A handshake that fails, or a facet closed before its handshake, closes both
 * ends too: `ready` still rejects for a caller that awaits it, and one that
 * never does leaves no unhandled rejection behind.
 *
 * @param serve - Attach the host's end of the channel, e.g. `host.serve({ port, session })`.
 * @returns The available facet and its close.
 * @public
 */
export const localMachineFacet = (
  serve: (port: MessagePort) => unknown,
): RuntimeTransportFacet<MachineClient> & Readonly<{ close(): void }> => {
  const { port1, port2 } = new MessageChannel();
  const client = connectMachineChannel(port1);
  const attach = async (): Promise<void> => {
    try {
      await serve(port2);
    } catch {
      client.close();
      port2.close();
    }
  };
  void attach();
  const observeReadiness = async (): Promise<void> => {
    try {
      await client.ready;
    } catch {
      client.close();
      port2.close();
    }
  };
  // async-iife: readiness stays caller-visible while this observer owns failed-handshake cleanup.
  void observeReadiness();
  return { available: true, ...client };
};

/**
 * Every operation the machines route answers; a person's session is granted all
 * of them, because the route's operator is the same person who bound the
 * machine. Kept beside the runtime so the desktop utility and the daemon
 * issue identical sessions.
 * @public
 */
export const machineRouteGrants: readonly HostRouteGrant[] = (
  [
    'machines.listProviders',
    'machines.discover',
    'machines.beginBinding',
    'machines.list',
    'machines.get',
    'machines.watch',
    'machines.reconcileOperation',
    'machines.captureStill',
    'machines.checkJob',
    'machines.requestJob',
    'machines.listJobs',
    'machines.watchJobs',
    'machines.resolveJob',
    'machines.withdrawJob',
    'machines.applyAction',
    'machines.approveAction',
    'machines.stop',
    'machines.beginHold',
    'machines.renewHold',
    'machines.endHold',
    'machines.setTesting',
    'machines.removeBinding',
  ] as const
).map((operation) => ({ route: 'machines', operation }));

/* A person's own acts: finding and binding a machine, approving an action or deciding a job (R16), Testing mode,
 * and the held controls a person presses. */
const personOperations: ReadonlySet<string> = new Set([
  'machines.approveAction',
  'machines.resolveJob',
  'machines.discover',
  'machines.beginBinding',
  'machines.removeBinding',
  'machines.setTesting',
  'machines.beginHold',
]);

/**
 * What an agent's machines session is granted: {@link machineRouteGrants} without a person's own acts (discovery,
 * binding, approving an action, deciding a job, Testing mode, holds). The session's actor is `{ kind: 'agent' }`, set by the host that issues it, so the
 * host applies the agent rules whatever a call's payload says.
 * @public
 */
export const machineAgentGrants: readonly HostRouteGrant[] = machineRouteGrants.filter(
  ({ operation }) => !personOperations.has(operation),
);

/**
 * The machine providers every Tau host serves: each first-party provider beside its socket-free simulator. The
 * provider packages load on the first call, so a host that serves no machines never touches them.
 *
 * @returns One fresh registration per provider, for `createNodeMachineHost`.
 * @public
 */
export const defaultMachineProviders = async (): Promise<CreateNodeMachineHostInput['providers']> => {
  const [bambu, grbl, carvera] = await Promise.all([
    import('@taucad/bambu'),
    import('@taucad/grbl'),
    import('@taucad/carvera'),
  ]);
  return [
    bambu.bambuMachine(),
    bambu.bambuA1MiniMachine(),
    bambu.bambuSimulatorMachine(),
    bambu.bambuA1MiniSimulatorMachine(),
    grbl.grblMachine(),
    grbl.grblSimulatorMachine(),
    carvera.carveraMachine(),
    carvera.carveraSimulatorMachine(),
  ];
};

const digestOf = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const certificatePem = (raw: Uint8Array<ArrayBuffer>): string =>
  `-----BEGIN CERTIFICATE-----\n${Buffer.from(raw)
    .toString('base64')
    .replaceAll(/(.{64})/gu, '$1\n')}\n-----END CERTIFICATE-----\n`;

/* Only the id: every other field may be one a stricter reader refuses. */
const manifestIdSchema = z.object({ id: z.string() });

const identitySchema = z.strictObject({
  v: z.literal(1),
  hostId: z.string().min(1).max(256),
  authorityId: z.string().min(1).max(256),
  generation: z.string().min(1).max(256),
});

/** Durable identity of one machine store, minted once per install. @public */
export type MachineHostIdentity = Readonly<{ hostId: string; authorityId: string }>;

/**
 * Read the machine store's identity, minting it on first use.
 *
 * The store's sessions are admitted under `hostId` and `authorityId`, so both
 * survive restarts. The file keeps its `generation` too: an older Tau build that
 * opens the same directory still requires it.
 *
 * @param directory - The machine store root; created `0700` when missing.
 * @returns The stable identity.
 * @public
 */
export const openMachineHostIdentity = async (directory: string): Promise<MachineHostIdentity> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'identity.json');
  const existing = await readJson(path);
  if (existing !== undefined) {
    const { hostId, authorityId } = identitySchema.parse(existing);
    return { hostId, authorityId };
  }
  const minted = { v: 1, hostId: randomUUID(), authorityId: randomUUID(), generation: randomUUID() };
  await writeProtected(path, minted);
  return { hostId: minted.hostId, authorityId: minted.authorityId };
};

/**
 * The `tau.json` id of the project a directory holds, read the way a machine
 * host names a job's project: a bounded read of that one field, so
 * a manifest another rule would refuse still names its project.
 *
 * @param project - The project directory's files, e.g. a `NodeFsProviderClient` rooted at it.
 * @returns The id, or `undefined` when the directory holds no readable manifest.
 * @public
 */
export const readProjectId = async (
  project: Readonly<{
    stat(path: string): Promise<Readonly<{ size: number }>>;
    readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  }>,
): Promise<string | undefined> => {
  try {
    const { size } = await project.stat('tau.json');
    if (size > projectManifestMaxBytes) {
      return undefined;
    }
    const manifest = manifestIdSchema.safeParse(
      JSON.parse(new TextDecoder().decode(await project.readFile('tau.json'))),
    );
    return manifest.success ? manifest.data.id : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Host-local custody of machine credentials, keyed by the opaque references
 * the machine journal stores.
 *
 * A reference names its custody: `vault:<name>` lives in the host's
 * {@link SecretVault}; `secret:<uuid>` is an entry of the first file store,
 * which is read and forgotten but never written again. Any other reference,
 * such as a simulator's `none`, is unknown.
 * @public
 */
export type MachineSecretStore = Readonly<{
  /** The secret a reference names: a staged one first, then the saved one; rejects `MACHINE_SECRET_UNKNOWN` when there is neither. */
  resolve(reference: string): Promise<string>;
  /** Whether a secret is saved under the reference, without reading it; staged secrets are not saved. */
  has(reference: string): Promise<boolean>;
  /** The facts saved beside the reference's secret, without reading it, or `undefined` when nothing is saved. */
  facts(reference: string): Promise<SecretVaultFacts | undefined>;
  /**
   * Resolve `secret` for `reference` in memory for one binding ceremony, so a
   * code that fails to connect never reaches the vault.
   * @returns Its release: drops this staging unless a later one replaced it.
   */
  stage(reference: string, secret: string): () => void;
  /** Save a `vault:` reference's secret; rejects `MACHINE_SECRET_UNKNOWN` for any other reference. */
  save(reference: string, secret: string, options?: SecretVaultWriteOptions): Promise<void>;
  /** Remove the reference's saved secret, if any. */
  forget(reference: string): Promise<void>;
}>;

/**
 * Machine credential custody over a host's vault.
 *
 * @param input - The vault `vault:` references live in, and the protected
 * directory whose `secrets.json` holds legacy `secret:<uuid>` entries.
 * @returns The store the machine runtime resolves provider secrets through.
 * @public
 *
 * @example <caption>A daemon that also reads codes bound before the keychain</caption>
 * ```typescript
 * import { createMachineSecretStore, openSecretVault } from '@taucad/host';
 *
 * const directory = '/var/lib/tau/machines';
 * const secrets = createMachineSecretStore({ vault: openSecretVault({ directory }), legacyDirectory: directory });
 * const release = secrets.stage('vault:machine/acme/SN-0001', '12345678');
 * release();
 * ```
 */
export const createMachineSecretStore = (
  input: Readonly<{ vault: SecretVault; legacyDirectory?: string }>,
): MachineSecretStore => {
  const legacy = input.legacyDirectory === undefined ? undefined : createFileSecretVault(input.legacyDirectory);
  const staged = new Map<string, Readonly<{ secret: string }>>();
  const custody = (reference: string): Readonly<{ vault: SecretVault; name: string }> | undefined => {
    if (reference.startsWith('vault:')) {
      return { vault: input.vault, name: reference.slice('vault:'.length) };
    }
    if (reference.startsWith('secret:') && legacy !== undefined) {
      return { vault: legacy, name: reference };
    }
    return undefined;
  };
  return Object.freeze({
    resolve: async (reference: string) => {
      const stagedSecret = staged.get(reference)?.secret;
      if (stagedSecret !== undefined) {
        return stagedSecret;
      }
      const target = custody(reference);
      const secret = target === undefined ? undefined : await target.vault.read(target.name);
      if (secret === undefined) {
        throw new Error('MACHINE_SECRET_UNKNOWN');
      }
      return secret;
    },
    has: async (reference: string) => {
      const target = custody(reference);
      return target !== undefined && (await target.vault.facts(target.name)) !== undefined;
    },
    facts: async (reference: string) => {
      const target = custody(reference);
      return target === undefined ? undefined : target.vault.facts(target.name);
    },
    stage: (reference: string, secret: string) => {
      const staging = Object.freeze({ secret });
      staged.set(reference, staging);
      return () => {
        if (staged.get(reference) === staging) {
          staged.delete(reference);
        }
      };
    },
    save: async (reference: string, secret: string, options?: SecretVaultWriteOptions) => {
      if (!reference.startsWith('vault:')) {
        throw new Error('MACHINE_SECRET_UNKNOWN');
      }
      await input.vault.write(reference.slice('vault:'.length), secret, options);
    },
    forget: async (reference: string) => {
      const target = custody(reference);
      if (target !== undefined) {
        await target.vault.remove(target.name);
      }
    },
  });
};

const readPeerCertificate = async (
  input: Readonly<{ address: string; port: number; probeTimeout: number; signal?: AbortSignal }>,
): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) => {
    const { address, port, probeTimeout, signal } = input;
    const socket = connectTls({
      host: address,
      port,
      rejectUnauthorized: false,
      ...(isIP(address) === 0 ? { servername: address } : {}),
    });
    const finish = (outcome: () => void): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      outcome();
    };
    const fail = (code: string): void => {
      finish(() => {
        reject(new Error(code));
      });
    };
    const timer = setTimeout(() => {
      fail('MACHINE_CERTIFICATE_PROBE_TIMEOUT');
    }, probeTimeout);
    const onAbort = (): void => {
      fail('MACHINE_CERTIFICATE_PROBE_ABORTED');
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate(true);
      if (certificate.raw.byteLength === 0) {
        fail('MACHINE_CERTIFICATE_MISSING');
        return;
      }
      finish(() => {
        resolve(Uint8Array.from(certificate.raw));
      });
    });
    socket.once('error', () => {
      fail('MACHINE_CERTIFICATE_PROBE_FAILED');
    });
  });

/**
 * Read one service's certificate digest for a trust-on-first-use pin.
 *
 * @param input - Endpoint and bound.
 * @returns The pinned trust the binding ceremony records.
 * @public
 */
export const probeCertificateTrust = async (
  input: Readonly<{ address: string; port: number; probeTimeout?: number; signal?: AbortSignal }>,
): Promise<Extract<MachineTransportTrust, { type: 'pinned' }>> => {
  const raw = await readPeerCertificate({ ...input, probeTimeout: input.probeTimeout ?? 10_000 });
  return { type: 'pinned', digest: digestOf(raw) as Extract<MachineTransportTrust, { type: 'pinned' }>['digest'] };
};

const matchesTrust = (raw: Uint8Array<ArrayBuffer>, trust: MachineTransportTrust): boolean =>
  trust.type === 'system' || digestOf(raw) === trust.digest;

const openSocket = async (
  input: Pick<MachineNetworkRequest, 'connectTimeout' | 'endpoint' | 'signal' | 'transport' | 'trust'>,
): Promise<Socket | TLSSocket> => {
  input.signal.throwIfAborted();
  const socket =
    input.transport === 'tls'
      ? connectTls({
          host: input.endpoint.address,
          port: input.endpoint.port,
          rejectUnauthorized: input.trust.type === 'system',
          ...(isIP(input.endpoint.address) === 0 ? { servername: input.endpoint.address } : {}),
        })
      : connectTcp({ host: input.endpoint.address, port: input.endpoint.port });
  const connected = Promise.withResolvers<void>();
  const timer = setTimeout(() => {
    connected.reject(new Error('MACHINE_CONNECT_TIMEOUT'));
  }, input.connectTimeout);
  const onAbort = (): void => {
    connected.reject(new Error('MACHINE_CONNECT_ABORTED'));
  };
  const onError = (): void => {
    connected.reject(new Error('MACHINE_CONNECT_FAILED'));
  };
  socket.once(input.transport === 'tls' ? 'secureConnect' : 'connect', () => {
    connected.resolve();
  });
  socket.once('error', onError);
  input.signal.addEventListener('abort', onAbort, { once: true });
  try {
    await connected.promise;
    if (input.transport === 'tls') {
      const certificate = (socket as TLSSocket).getPeerCertificate(true);
      if (certificate.raw.byteLength === 0 || !matchesTrust(Uint8Array.from(certificate.raw), input.trust)) {
        throw new Error('MACHINE_TLS_PIN_MISMATCH');
      }
    }
  } catch (error) {
    socket.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
    socket.off('error', onError);
    input.signal.removeEventListener('abort', onAbort);
  }
  return socket;
};

const connectStream = async (input: MachineNetworkRequest): Promise<MachineNetworkStream> => {
  const socket = await openSocket(input);
  socket.setTimeout(input.idleTimeout, () => socket.destroy(new Error('MACHINE_STREAM_IDLE_TIMEOUT')));
  /* The bounded async iterator reports stream failures to the provider. */
  socket.on('error', () => undefined);
  let readBytes = 0;
  let writtenBytes = 0;
  let closed = false;
  const abortStream = (): void => {
    socket.destroy(new Error('MACHINE_STREAM_ABORTED'));
  };
  input.signal.addEventListener('abort', abortStream, { once: true });
  const readable = (async function* (): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    for await (const raw of socket as AsyncIterable<Uint8Array<ArrayBuffer>>) {
      const chunk = Uint8Array.from(raw);
      readBytes += chunk.byteLength;
      if (readBytes > input.maximumReadBytes) {
        throw new Error('MACHINE_STREAM_READ_LIMIT');
      }
      yield chunk;
    }
  })();
  return Object.freeze({
    readable,
    async write(chunk) {
      writtenBytes += chunk.byteLength;
      if (writtenBytes > input.maximumWriteBytes) {
        throw new Error('MACHINE_STREAM_WRITE_LIMIT');
      }
      await new Promise<void>((resolve, reject) => {
        socket.write(chunk, (error) => {
          if (error) {
            reject(new Error('MACHINE_STREAM_WRITE_FAILED'));
          } else {
            resolve();
          }
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

const listenDatagrams = async function* (input: MachineDatagramListenInput): AsyncGenerator<MachineDatagram> {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise<void>((resolve, reject) => {
    const failed = (): void => {
      socket.off('listening', ready);
      reject(new Error('MACHINE_DISCOVERY_LISTENER_FAILED'));
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
      if (!Buffer.isBuffer(message) || message.byteLength === 0 || message.byteLength > input.maximumDatagramBytes) {
        continue;
      }
      const peer = remote as RemoteInfo;
      yield Object.freeze({
        bytes: Uint8Array.from(message),
        peer: Object.freeze({ address: peer.address, interface: 'udp4', port: peer.port }),
      });
      count += 1;
      if (count >= input.maximumDatagrams) {
        return;
      }
    }
  } catch {
    if (!signal.aborted) {
      throw new Error('MACHINE_DISCOVERY_LISTENER_FAILED');
    }
  } finally {
    socket.close();
  }
};

/**
 * The artifact as 64 KiB views, without copying. basic-ftp's transfer watchdog reads progress from the data
 * socket's `bytesWritten`, which counts a chunk the moment it is queued: a whole-file chunk looks stalled for as
 * long as the server takes to drain it, so a healthy upload that outlasts the timeout is aborted.
 * @param bytes - The artifact.
 * @yields Consecutive views of at most 64 KiB.
 */
function* uploadChunks(bytes: Uint8Array<ArrayBuffer>): Generator<Uint8Array<ArrayBuffer>> {
  for (let offset = 0; offset < bytes.byteLength; offset += 64 * 1024) {
    yield new Uint8Array(bytes.buffer, bytes.byteOffset + offset, Math.min(64 * 1024, bytes.byteLength - offset));
  }
}

const uploadFile = async (
  input: MachineFileUploadInput,
  secrets: MachineSecretStore,
): Promise<MachineFileUploadReceipt> => {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > 512 * 1024 * 1024) {
    throw new Error('MACHINE_UPLOAD_REQUEST_INVALID');
  }
  input.signal.throwIfAborted();
  const { trust } = input;
  const certificate =
    trust.type === 'pinned'
      ? await readPeerCertificate({
          address: input.endpoint.address,
          port: input.endpoint.port,
          probeTimeout: input.connectTimeout,
          signal: input.signal,
        })
      : undefined;
  if (certificate !== undefined && !matchesTrust(certificate, trust)) {
    throw new Error('MACHINE_TLS_PIN_MISMATCH');
  }
  const ftp = await import('basic-ftp');
  const client = new ftp.Client(input.connectTimeout);
  const abortUpload = (): void => {
    client.close();
  };
  input.signal.addEventListener('abort', abortUpload, { once: true });
  try {
    await client.access({
      host: input.endpoint.address,
      port: input.endpoint.port,
      user: input.username,
      password: await secrets.resolve(input.secretRef),
      secure: 'implicit',
      secureOptions: {
        ...(certificate === undefined ? {} : { ca: certificatePem(certificate), allowPartialTrustChain: true }),
        checkServerIdentity(_hostname: string, observed: PeerCertificate): Error | undefined {
          return matchesTrust(Uint8Array.from(observed.raw), trust) ? undefined : new Error('MACHINE_TLS_PIN_MISMATCH');
        },
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });
    input.signal.throwIfAborted();
    try {
      await client.uploadFrom(Readable.from(uploadChunks(input.bytes)), input.remoteName);
    } catch (error) {
      // A permanent (5xx) reply to the store command means the printer declined the file, so sending it again
      // cannot help until the printer's storage is fixed. The reply stays as the cause for diagnosis.
      if (error instanceof ftp.FTPError && error.code >= 500) {
        throw new Error('MACHINE_UPLOAD_REFUSED', { cause: error });
      }
      throw error;
    }
    input.signal.throwIfAborted();
    if ((await client.size(input.remoteName)) !== input.bytes.byteLength) {
      throw new Error('MACHINE_UPLOAD_TRANSFER_MISMATCH');
    }
    return Object.freeze({ bytesWritten: input.bytes.byteLength });
  } finally {
    input.signal.removeEventListener('abort', abortUpload);
    client.close();
  }
};

/** Options for {@link createNodeMachineRuntime}. @public */
export type CreateNodeMachineRuntimeOptions = Readonly<{
  secrets: MachineSecretStore;
  /**
   * The native serial driver for controllers on a USB or serial port. Absent, providers see no serial access and
   * serial machines cannot be found or connected.
   */
  serial?: NodeMachineSerialDriver;
  /** Told every entry a provider logs. */
  log?: (entry: MachineLogEntry) => void;
  /**
   * Locate the `ffmpeg` that decodes camera stills, or `undefined` when there
   * is none. By default `PATH`, then Homebrew (`/opt/homebrew/bin`,
   * `/usr/local/bin`) and MacPorts (`/opt/local/bin`); on Windows, `PATH` and
   * then the WinGet, Chocolatey and Scoop directories, for `ffmpeg.exe`.
   */
  findFfmpeg?: () => Promise<string | undefined>;
  /**
   * Read one artifact's bytes from the project its reference names
   * (`artifact.projectId`), rejecting `MACHINE_ARTIFACT_NOT_FOUND` when no
   * candidate holds a file with the reference's digest. The runtime verifies
   * length and digest again before a single byte reaches a provider.
   */
  readArtifact(artifact: MachineArtifactReference, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
}>;

/**
 * The host-owned runtime a machine host discovers, binds and prints with.
 *
 * Its `uploadFile` stores one file over implicit FTPS (see `MachineFileUploadInput`). Its `captureNetworkStill`
 * decodes one JPEG from a pinned RTSPS camera with the system `ffmpeg`, which plays a loopback proxy that answers the
 * camera's authentication itself, so the credential never reaches ffmpeg. Without an ffmpeg, every capture rejects
 * `MACHINE_STILL_FFMPEG_MISSING` rather than the camera reporting stills unsupported.
 *
 * @param options - Secret custody, artifact reader, log sink and `ffmpeg` lookup.
 * @returns The runtime for `createNodeMachineHost`, whose `credentials` answer
 * whether a machine's credential is saved and forget a removed binding's credential.
 * @public
 */
export const createNodeMachineRuntime = (options: CreateNodeMachineRuntimeOptions): NodeMachineRuntime => {
  const clock = Object.freeze({ now: () => new Date().toISOString() });
  const { secrets } = options;
  const serial = options.serial === undefined ? undefined : createNodeMachineSerial(options.serial);
  return Object.freeze({
    credentials: Object.freeze({
      has: async (reference: string) => secrets.has(reference),
      forget: async (reference: string) => secrets.forget(reference),
    }),
    discovery: Object.freeze({
      clock,
      listenDatagrams,
      ...(serial === undefined ? {} : { listSerialPorts: serial.listSerialPorts }),
    }),
    connection: (): MachineConnectionRuntime =>
      Object.freeze({
        clock,
        async log(entry) {
          options.log?.(entry);
        },
        connectStream,
        ...(serial === undefined ? {} : { openSerial: serial.openSerial }),
        async *readArtifact(input) {
          if (input.artifact.length > input.maximumBytes) {
            throw new Error('MACHINE_ARTIFACT_TOO_LARGE');
          }
          const bytes = await options.readArtifact(input.artifact, input.signal);
          if (bytes.byteLength !== input.artifact.length || digestOf(bytes) !== input.artifact.digest) {
            throw new Error('MACHINE_ARTIFACT_MISMATCH');
          }
          input.signal.throwIfAborted();
          yield Uint8Array.from(bytes);
        },
        resolveSecret: async (input) => {
          input.signal.throwIfAborted();
          return options.secrets.resolve(input.reference);
        },
        uploadFile: async (input) => uploadFile(input, options.secrets),
        captureNetworkStill: async (input) => {
          try {
            return await captureRtspsStill(input, {
              ffmpeg: await (options.findFfmpeg ?? findFfmpeg)(),
              password: async () => secrets.resolve(input.secretRef),
              openUpstream: async () =>
                openSocket({
                  endpoint: input.endpoint,
                  transport: 'tls',
                  trust: input.trust,
                  connectTimeout: input.connectTimeout,
                  signal: input.signal,
                }),
            });
          } catch (error) {
            /* Capture refuses as `new Error('MACHINE_STILL_*')`; the provider gets the typed code to keep or map. */
            throw withMachineCode(error);
          }
        },
      }),
  });
};

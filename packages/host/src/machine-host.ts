/**
 * Host-owned machine services shared by the desktop services utility and the
 * `tau serve --machines` daemon: the network, secret and artifact runtime a
 * `createNodeMachineHost` needs, its durable identity, and the workspace
 * identity a project root maps to.
 *
 * Ported from the qualification script's runtime
 * (`packages/plugins/bambu/scripts/qualify-x1c.mts`) so both launchers run one
 * implementation. Every network operation is bounded by the provider's own
 * limits and pinned to the trust the binding ceremony recorded.
 *
 * @public
 */

import { createHash, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import type { RemoteInfo } from 'node:dgram';
import { on } from 'node:events';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { connect as connectTcp, isIP } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { connect as connectTls } from 'node:tls';
import type { PeerCertificate, TLSSocket } from 'node:tls';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { connectMachineChannel } from '@taucad/runtime/machine';
import type {
  MachineArtifactReference,
  MachineClient,
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
import type { NodeMachineRuntime } from '@taucad/runtime/host/node';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { z } from 'zod';

/**
 * A machines facet for the tools composed beside a host: one in-process
 * channel, connected now and served by `serve` once the host is ready, so a
 * registry built synchronously still offers the machine tools.
 *
 * A serve that fails closes both ends, so every call rejects with the channel
 * instead of hanging; closing the facet retires the served session with it.
 *
 * @param serve - Attach the host's end of the channel, e.g. `host.serve({ port, session, workspaceId })`.
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
  return { available: true, ...client };
};

/**
 * Every operation the machines route answers; a served session is granted all
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
    'machines.preparePrint',
    'machines.uploadPrint',
    'machines.startPrint',
    'machines.reconcileOperation',
    'machines.controlRun',
    'machines.captureStill',
    'machines.requestPrint',
    'machines.listPrintRequests',
    'machines.watchPrintRequests',
    'machines.resolvePrintRequest',
    'machines.withdrawPrintRequest',
  ] as const
).map((operation) => ({ route: 'machines', operation }));

const digestOf = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const certificatePem = (raw: Uint8Array<ArrayBuffer>): string =>
  `-----BEGIN CERTIFICATE-----\n${Buffer.from(raw)
    .toString('base64')
    .replaceAll(/(.{64})/gu, '$1\n')}\n-----END CERTIFICATE-----\n`;

const writeProtected = async (path: string, value: unknown): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
};

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

/**
 * The workspace identity one project root maps to on this host.
 *
 * Machine bindings are journaled per workspace, and the directory cursor
 * carries this value back to clients, so it is a digest rather than the path:
 * opaque, stable, and always inside the journal's identity bounds.
 *
 * @param workspaceRoot - Canonical absolute project root.
 * @returns A 64-character hex identity.
 * @public
 */
export const machineWorkspaceId = (workspaceRoot: string): string =>
  createHash('sha256').update(workspaceRoot).digest('hex');

const identitySchema = z.strictObject({
  v: z.literal(1),
  hostId: z.string().min(1).max(256),
  authorityId: z.string().min(1).max(256),
  generation: z.string().min(1).max(256),
});

/** Durable identity of one machine host's journal, minted once per install. @public */
export type MachineHostIdentity = Readonly<{ hostId: string; authorityId: string; generation: string }>;

/**
 * Read this host's machine identity, minting it on first use.
 *
 * `createNodeMachineHost` refuses a journal whose first record names another
 * `hostId`/`authorityId`/`generation`, so the three must survive restarts.
 *
 * @param directory - Protected state directory; created `0700` when missing.
 * @returns The stable identity.
 * @public
 */
export const openMachineHostIdentity = async (directory: string): Promise<MachineHostIdentity> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'identity.json');
  const existing = await readJson(path);
  if (existing !== undefined) {
    const { hostId, authorityId, generation } = identitySchema.parse(existing);
    return { hostId, authorityId, generation };
  }
  const minted = { v: 1, hostId: randomUUID(), authorityId: randomUUID(), generation: randomUUID() };
  await writeProtected(path, minted);
  return { hostId: minted.hostId, authorityId: minted.authorityId, generation: minted.generation };
};

/** Host-local secret custody keyed by the opaque references the machine journal stores. @public */
export type MachineSecretStore = Readonly<{
  /** Keep one secret and return the reference the binding ceremony records. */
  store(secret: string): Promise<string>;
  /** Resolve one reference; rejects an unknown one. */
  resolve(reference: string): Promise<string>;
}>;

const secretsSchema = z.strictObject({ v: z.literal(1), secrets: z.record(z.string(), z.string()) });

/**
 * A file-backed secret store under the protected machine directory.
 *
 * ponytail: plaintext JSON at mode 0600 under the app's protected state, the
 * same custody the daemon's device credential gets. Upgrade path when a
 * stronger claim is needed: encrypt the file with Electron `safeStorage` in
 * main and hand the utility a decrypt seam.
 *
 * @param directory - Protected state directory.
 * @returns Store and resolve seams over the protected file.
 * @public
 */
export const createMachineSecretStore = (directory: string): MachineSecretStore => {
  const path = join(directory, 'secrets.json');
  const read = async (): Promise<Record<string, string>> => {
    const raw = await readJson(path);
    return raw === undefined ? {} : secretsSchema.parse(raw).secrets;
  };
  let chain: Promise<unknown> = Promise.resolve();
  const serialized = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const previous = chain;
    const next = (async (): Promise<Result> => {
      try {
        await previous;
      } catch {
        /* The earlier operation reported its own failure to its own caller. */
      }
      return operation();
    })();
    chain = next;
    return next;
  };
  return {
    store: async (secret) =>
      serialized(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const reference = `secret:${randomUUID()}`;
        await writeProtected(path, { v: 1, secrets: { ...(await read()), [reference]: secret } });
        return reference;
      }),
    resolve: async (reference) =>
      serialized(async () => {
        const secrets = await read();
        const secret = secrets[reference];
        if (secret === undefined) {
          throw new Error('MACHINE_SECRET_UNKNOWN');
        }
        return secret;
      }),
  };
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

const openSocket = async (input: MachineNetworkRequest): Promise<Socket | TLSSocket> => {
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
    await client.uploadFrom(Readable.from([Buffer.from(input.bytes)]), input.remoteName);
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
   * Read one artifact's bytes from the workspace the connection is scoped to.
   * The runtime verifies length and digest against the reference before a
   * single byte reaches a provider; the reader only has to find the file.
   */
  log?: (workspaceId: string, entry: MachineLogEntry) => void;
  readArtifact(
    workspaceId: string,
    artifact: MachineArtifactReference,
    signal: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer>>;
}>;

/**
 * The host-owned runtime a machine host discovers, binds and prints with.
 *
 * ponytail: no `captureNetworkStill` — the RTSPS sampler stays in the
 * qualification script for now, so a real X1C reports stills unsupported while
 * the simulator's own capture works. Port `createRtspsStillSampler` here when
 * stills on hardware are wanted.
 *
 * @param options - Secret custody, artifact reader and log sink.
 * @returns The runtime for `createNodeMachineHost`.
 * @public
 */
export const createNodeMachineRuntime = (options: CreateNodeMachineRuntimeOptions): NodeMachineRuntime => {
  const clock = Object.freeze({ now: () => new Date().toISOString() });
  return Object.freeze({
    discovery: Object.freeze({ clock, listenDatagrams }),
    connection: (workspaceId) =>
      Object.freeze({
        clock,
        async log(entry) {
          options.log?.(workspaceId, entry);
        },
        connectStream,
        async *readArtifact(input) {
          if (input.artifact.length > input.maximumBytes) {
            throw new Error('MACHINE_ARTIFACT_TOO_LARGE');
          }
          const bytes = await options.readArtifact(workspaceId, input.artifact, input.signal);
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
      }),
  });
};

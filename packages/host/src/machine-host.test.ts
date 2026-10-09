import { execFileSync } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createTlsServer } from 'node:tls';

import type { MachineArtifactReference, MachineTransportTrust } from '@taucad/runtime/machine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMachineSecretStore,
  createNodeMachineRuntime,
  machineAgentGrants,
  machineRouteGrants,
  openMachineHostIdentity,
} from '#machine-host.js';
import { createKeychainSecretVaultWith, createMemorySecretVault } from '#secret-vault.js';
import type { SecurityCommand } from '#secret-vault.js';

const sandboxes: string[] = [];
const sandbox = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-machine-host-'));
  sandboxes.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

describe('machineRouteGrants', () => {
  it('should grant a served session the removal of a binding', () => {
    expect(machineRouteGrants).toContainEqual({ route: 'machines', operation: 'machines.removeBinding' });
  });
});

describe('machineAgentGrants', () => {
  it("should withhold a person's own acts from an agent and keep what the machine tools call", () => {
    const operations = machineAgentGrants.map(({ operation }) => operation);
    for (const personal of [
      'machines.approveAction',
      'machines.discover',
      'machines.beginBinding',
      'machines.removeBinding',
      'machines.setTesting',
      'machines.beginHold',
    ]) {
      expect(operations).not.toContain(personal);
    }
    expect(operations).toEqual(
      expect.arrayContaining(['machines.list', 'machines.applyAction', 'machines.stop', 'machines.requestJob']),
    );
    /* Approving is the person's: their session is granted it. */
    expect(machineRouteGrants).toContainEqual({ route: 'machines', operation: 'machines.approveAction' });
  });
});

describe('openMachineHostIdentity', () => {
  it('should mint once and return the same identity on every later open', async () => {
    const directory = join(await sandbox(), 'machines');
    const first = await openMachineHostIdentity(directory);
    const second = await openMachineHostIdentity(directory);
    expect(second).toEqual(first);
    expect(first.hostId).not.toBe(first.authorityId);
    const { mode } = await stat(join(directory, 'identity.json'));
    // oxlint-disable-next-line no-bitwise -- POSIX group/world bits must be absent on protected state.
    expect(mode & 0o077).toBe(0);
    /* An older build opening the same store still reads a `generation`. */
    expect(JSON.parse(await readFile(join(directory, 'identity.json'), 'utf8'))).toEqual({
      v: 1,
      ...first,
      generation: expect.any(String) as string,
    });
  });
});

describe('createMachineSecretStore', () => {
  const reference = 'vault:machine/bambu/00M00A391800004';
  const pin = `sha256:${'a'.repeat(64)}`;

  it('should resolve a staged code before the saved one and release only its own staging', async () => {
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    await expect(secrets.resolve(reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    const releaseFirst = secrets.stage(reference, '11111111');
    await expect(secrets.resolve(reference)).resolves.toBe('11111111');
    await expect(secrets.has(reference)).resolves.toBe(false);
    const releaseSecond = secrets.stage(reference, '11111111');
    releaseFirst();
    await expect(secrets.resolve(reference)).resolves.toBe('11111111');
    await secrets.save(reference, '22222222');
    await expect(secrets.resolve(reference)).resolves.toBe('11111111');
    releaseSecond();
    releaseSecond();
    await expect(secrets.resolve(reference)).resolves.toBe('22222222');
  });

  it('should save only vault references, with facts readable beside the secret', async () => {
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    await secrets.save(reference, '12345678', { label: 'Tau: Workshop access code', facts: { mqtt: pin } });
    await expect(secrets.has(reference)).resolves.toBe(true);
    await expect(secrets.facts(reference)).resolves.toEqual({ mqtt: pin });
    await expect(secrets.resolve(reference)).resolves.toBe('12345678');
    await expect(secrets.save(`secret:${randomUUID()}`, 'code')).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    await expect(secrets.save('none', 'code')).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    await secrets.forget(reference);
    await expect(secrets.has(reference)).resolves.toBe(false);
    await expect(secrets.facts(reference)).resolves.toBeUndefined();
    await expect(secrets.resolve(reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
  });

  it('should resolve and forget a legacy secret:<uuid> reference from the first file store', async () => {
    const directory = join(await sandbox(), 'machines');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const legacyReference = `secret:${randomUUID()}`;
    await writeFile(
      join(directory, 'secrets.json'),
      JSON.stringify({ v: 1, secrets: { [legacyReference]: '12345678' } }),
      { mode: 0o600 },
    );
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault(), legacyDirectory: directory });
    await expect(secrets.resolve(legacyReference)).resolves.toBe('12345678');
    await expect(secrets.has(legacyReference)).resolves.toBe(true);
    await expect(secrets.facts(legacyReference)).resolves.toEqual({});
    await expect(secrets.save(legacyReference, '87654321')).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    await secrets.forget(legacyReference);
    await expect(secrets.resolve(legacyReference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    expect(JSON.parse(await readFile(join(directory, 'secrets.json'), 'utf8'))).toEqual({ v: 2, entries: {} });
  });

  it.each([
    { case: 'the simulator reference', reference: 'none' },
    { case: 'a legacy reference without a legacy directory', reference: `secret:${randomUUID()}` },
  ])('should know nothing of $case', async (input) => {
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    await expect(secrets.resolve(input.reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    await expect(secrets.has(input.reference)).resolves.toBe(false);
    await expect(secrets.facts(input.reference)).resolves.toBeUndefined();
    await expect(secrets.forget(input.reference)).resolves.toBeUndefined();
  });

  it('should answer has and facts over the keychain without reading the secret', async () => {
    const calls: SecurityCommand[] = [];
    const vault = createKeychainSecretVaultWith(async (command) => {
      calls.push(command);
      const comment = `tau1:${Buffer.from(JSON.stringify({ mqtt: pin })).toString('base64url')}`;
      return { exitCode: 0, stdout: command.args.includes('-w') ? '12345678\n' : `    "icmt"<blob>="${comment}"\n` };
    });
    const secrets = createMachineSecretStore({ vault });
    await expect(secrets.has(reference)).resolves.toBe(true);
    await expect(secrets.facts(reference)).resolves.toEqual({ mqtt: pin });
    expect(calls).toHaveLength(2);
    expect(calls.filter(({ args }) => args.includes('-w'))).toEqual([]);
    await expect(secrets.resolve(reference)).resolves.toBe('12345678');
    expect(calls.filter(({ args }) => args.includes('-w'))).toHaveLength(1);
  });
});

describe('createNodeMachineRuntime', () => {
  const bytes = new TextEncoder().encode('G28\n');
  const artifact: MachineArtifactReference = {
    projectId: 'proj_000000000000000000001',
    path: 'part.gcode.3mf',
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'],
    length: bytes.byteLength,
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    selectedMember: 'Metadata/plate_1.gcode',
  };
  const collect = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<Uint8Array<ArrayBuffer>> => {
    const parts: Array<Uint8Array<ArrayBuffer>> = [];
    for await (const chunk of chunks) {
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  };

  it('should hand a provider only artifact bytes whose length and digest match the reference', async () => {
    const readArtifact = vi.fn(async () => bytes);
    const log = vi.fn();
    const runtime = createNodeMachineRuntime({
      secrets: createMachineSecretStore({ vault: createMemorySecretVault() }),
      readArtifact,
      log,
    });
    const connection = runtime.connection();
    const { signal } = new AbortController();
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 1024, signal }))).resolves.toEqual(
      Buffer.from(bytes),
    );
    /* The reference itself names its project; the connection carries no scope. */
    expect(readArtifact).toHaveBeenCalledExactlyOnceWith(artifact, signal);
    await connection.log({ level: 'warning', message: 'MQTT reconnecting' });
    expect(log).toHaveBeenCalledExactlyOnceWith({ level: 'warning', message: 'MQTT reconnecting' });
    readArtifact.mockResolvedValueOnce(new TextEncoder().encode('G29\n'));
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 1024, signal }))).rejects.toThrow(
      'MACHINE_ARTIFACT_MISMATCH',
    );
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 2, signal }))).rejects.toThrow(
      'MACHINE_ARTIFACT_TOO_LARGE',
    );
  });

  it('should resolve secrets through the store and refuse an aborted request', async () => {
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    const reference = 'vault:machine/fixture/printer-1';
    await secrets.save(reference, 'code');
    const connection = createNodeMachineRuntime({ secrets, readArtifact: async () => bytes }).connection();
    await expect(connection.resolveSecret({ reference, signal: new AbortController().signal })).resolves.toBe('code');
    await expect(connection.resolveSecret({ reference, signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it('should tell the node host whether a code is saved and forget it on removal', async () => {
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    const reference = 'vault:machine/fixture/printer-1';
    await secrets.save(reference, 'code');
    const { credentials } = createNodeMachineRuntime({ secrets, readArtifact: async () => bytes });
    if (credentials === undefined) {
      expect.fail('the runtime should carry credential hooks');
    }
    await expect(credentials.has(reference)).resolves.toBe(true);
    await expect(credentials.has('none')).resolves.toBe(false);
    await credentials.forget(reference);
    await expect(credentials.has(reference)).resolves.toBe(false);
    await expect(secrets.resolve(reference)).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
  });

  it('should deliver bounded LAN datagrams with their observed peer', async () => {
    const runtime = createNodeMachineRuntime({
      secrets: createMachineSecretStore({ vault: createMemorySecretVault() }),
      readArtifact: async () => bytes,
    });
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    const sender = createSocket('udp4');
    const received: string[] = [];
    const listening = (async (): Promise<void> => {
      for await (const datagram of runtime.discovery.listenDatagrams({
        port,
        durationMs: 5000,
        maximumDatagrams: 1,
        maximumDatagramBytes: 64,
        signal: new AbortController().signal,
      })) {
        received.push(`${datagram.peer.address}:${Buffer.from(datagram.bytes).toString('utf8')}`);
      }
    })();
    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      sender.send(Buffer.from('NOTIFY'), port, '127.0.0.1');
      await listening;
      expect(received).toEqual(['127.0.0.1:NOTIFY']);
    } finally {
      sender.close();
    }
  });

  it('should open a bounded TCP stream and enforce its write limit', async () => {
    const server = createServer((socket) => {
      socket.on('data', (chunk) => socket.write(chunk));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }
    const runtime = createNodeMachineRuntime({
      secrets: createMachineSecretStore({ vault: createMemorySecretVault() }),
      readArtifact: async () => bytes,
    });
    const stream = await runtime.connection().connectStream({
      endpoint: { address: '127.0.0.1', port: address.port },
      transport: 'tcp',
      trust: { type: 'system' },
      connectTimeout: 1000,
      idleTimeout: 5000,
      maximumReadBytes: 64,
      maximumWriteBytes: 4,
      signal: new AbortController().signal,
    });
    try {
      await stream.write(new TextEncoder().encode('ping'));
      const iterator = stream.readable[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done) {
        throw new Error('The stream ended before the echo');
      }
      expect(new TextDecoder().decode(first.value)).toBe('ping');
      await expect(stream.write(new TextEncoder().encode('x'))).rejects.toThrow('MACHINE_STREAM_WRITE_LIMIT');
    } finally {
      await stream.close();
      server.close();
    }
  });

  it('should finish an FTPS upload that outlasts its timeout while the printer keeps reading', async () => {
    const directory = await sandbox();
    /* The only way Node gets a self-signed certificate without a dependency. */
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=printer',
        '-days',
        '1',
        '-keyout',
        'key.pem',
        '-out',
        'cert.pem',
      ],
      { cwd: directory, stdio: 'ignore' },
    );
    const credentials = {
      cert: await readFile(join(directory, 'cert.pem')),
      key: await readFile(join(directory, 'key.pem')),
    };
    const upload = new Uint8Array(8 * 1024 * 1024).fill(7);
    let received = 0;
    let replyOnControl: ((line: string) => void) | undefined;
    /* The data channel drains about 4 MiB/s, so the 8 MiB upload lasts twice the 1 s timeout. */
    const data = createTlsServer(credentials, (socket) => {
      socket.on('error', () => undefined);
      socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        received += chunk.byteLength;
        socket.pause();
        setTimeout(() => socket.resume(), (chunk.byteLength / (4 * 1024 * 1024)) * 1000);
      });
      socket.on('end', () => replyOnControl?.('226 Transfer complete'));
    });
    data.listen(0, '127.0.0.1');
    await once(data, 'listening');
    const { port: dataPort } = data.address() as AddressInfo;
    /* Implicit FTPS on the control channel, answering only what basic-ftp sends for one upload. */
    const control = createTlsServer(credentials, (socket) => {
      socket.on('error', () => undefined);
      const reply = (line: string): void => {
        socket.write(`${line}\r\n`);
      };
      replyOnControl = reply;
      reply('220 ready');
      socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        for (const line of Buffer.from(chunk).toString('latin1').split('\r\n').filter(Boolean)) {
          const command = line.split(' ')[0]!.toUpperCase();
          const answers = new Map([
            ['USER', '331 password'],
            ['PASS', '230 logged in'],
            ['FEAT', '211 end'],
            ['EPSV', `229 passive (|||${dataPort}|)`],
            ['STOR', '150 ready'],
            ['SIZE', `213 ${received}`],
            ['QUIT', '221 bye'],
          ]);
          reply(answers.get(command) ?? '200 ok');
        }
      });
    });
    control.listen(0, '127.0.0.1');
    await once(control, 'listening');
    const { port } = control.address() as AddressInfo;
    const secrets = createMachineSecretStore({ vault: createMemorySecretVault() });
    secrets.stage('vault:machine/fixture/printer-1', '11111111');
    const { uploadFile } = createNodeMachineRuntime({ secrets, readArtifact: async () => bytes }).connection();
    if (!uploadFile) {
      throw new Error('expected the node runtime to upload files');
    }
    const digest = `sha256:${createHash('sha256').update(new X509Certificate(credentials.cert).raw).digest('hex')}`;
    try {
      await expect(
        uploadFile({
          endpoint: { address: '127.0.0.1', port },
          trust: { type: 'pinned', digest: digest as Extract<MachineTransportTrust, { type: 'pinned' }>['digest'] },
          secretRef: 'vault:machine/fixture/printer-1',
          username: 'bblp',
          remoteName: 'tau-fixture.gcode.3mf',
          bytes: upload,
          connectTimeout: 1000,
          signal: new AbortController().signal,
        }),
      ).resolves.toEqual({ bytesWritten: upload.byteLength });
      expect(received).toBe(upload.byteLength);
    } finally {
      control.close();
      data.close();
    }
  }, 20_000);
});

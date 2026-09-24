import { createHash } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MachineArtifactReference } from '@taucad/runtime/machine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMachineSecretStore,
  createNodeMachineRuntime,
  machineWorkspaceId,
  openMachineHostIdentity,
} from '#machine-host.js';

const sandboxes: string[] = [];
const sandbox = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-machine-host-'));
  sandboxes.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

describe('machineWorkspaceId', () => {
  it('should derive one stable 64-character identity per canonical root', () => {
    expect(machineWorkspaceId('/Users/tester/Projects/widget')).toBe(
      createHash('sha256').update('/Users/tester/Projects/widget').digest('hex'),
    );
    expect(machineWorkspaceId('/Users/tester/Projects/widget')).toHaveLength(64);
    expect(machineWorkspaceId('/Users/tester/Projects/widget')).not.toBe(
      machineWorkspaceId('/Users/tester/Projects/widget-evil'),
    );
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
  });
});

describe('createMachineSecretStore', () => {
  it('should resolve only the references it stored, from a 0600 file', async () => {
    const directory = join(await sandbox(), 'machines');
    const store = createMachineSecretStore(directory);
    const reference = await store.store('12345678');
    expect(reference).toMatch(/^secret:[0-9a-f-]{36}$/u);
    await expect(store.resolve(reference)).resolves.toBe('12345678');
    await expect(store.resolve('secret:unknown')).rejects.toThrow('MACHINE_SECRET_UNKNOWN');
    const { mode } = await stat(join(directory, 'secrets.json'));
    // oxlint-disable-next-line no-bitwise -- POSIX group/world bits must be absent on protected state.
    expect(mode & 0o077).toBe(0);
  });
});

describe('createNodeMachineRuntime', () => {
  const bytes = new TextEncoder().encode('G28\n');
  const artifact: MachineArtifactReference = {
    revision: {
      authorityId: 'a',
      workspaceId: 'w',
      revisionId: 'r1' as MachineArtifactReference['revision']['revisionId'],
      treeDigest: `sha256:${'1'.repeat(64)}` as MachineArtifactReference['digest'],
    },
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
    const runtime = createNodeMachineRuntime({
      secrets: createMachineSecretStore(join(await sandbox(), 'machines')),
      readArtifact,
    });
    const connection = runtime.connection('workspace-1');
    const { signal } = new AbortController();
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 1024, signal }))).resolves.toEqual(
      Buffer.from(bytes),
    );
    expect(readArtifact).toHaveBeenCalledExactlyOnceWith('workspace-1', artifact, signal);
    readArtifact.mockResolvedValueOnce(new TextEncoder().encode('G29\n'));
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 1024, signal }))).rejects.toThrow(
      'MACHINE_ARTIFACT_MISMATCH',
    );
    await expect(collect(connection.readArtifact({ artifact, maximumBytes: 2, signal }))).rejects.toThrow(
      'MACHINE_ARTIFACT_TOO_LARGE',
    );
  });

  it('should resolve secrets through the store and refuse an aborted request', async () => {
    const secrets = createMachineSecretStore(join(await sandbox(), 'machines'));
    const reference = await secrets.store('code');
    const connection = createNodeMachineRuntime({ secrets, readArtifact: async () => bytes }).connection('w');
    await expect(connection.resolveSecret({ reference, signal: new AbortController().signal })).resolves.toBe('code');
    await expect(connection.resolveSecret({ reference, signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it('should deliver bounded LAN datagrams with their observed peer', async () => {
    const runtime = createNodeMachineRuntime({
      secrets: createMachineSecretStore(join(await sandbox(), 'machines')),
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
      secrets: createMachineSecretStore(join(await sandbox(), 'machines')),
      readArtifact: async () => bytes,
    });
    const stream = await runtime.connection('w').connectStream({
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
});

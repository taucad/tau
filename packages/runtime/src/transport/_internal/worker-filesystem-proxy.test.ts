import { describe, expect, it } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import type { Port } from '@taucad/rpc';
import { createBridgeServer } from '@taucad/rpc/bridge';
import {
  createFileSystemBridgeHello,
  fileSystemBridgeProtocolVersion,
  fileSystemBridgeSchemas,
} from '@taucad/fs-bridge';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { extractInlineFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';

/**
 * Two hand-rolled {@link Port}s wired to each other — the shape a socket
 * transport supplies, with no `MessagePort` anywhere. Frames land on a
 * microtask (no re-entrant delivery) and are buffered until a handler
 * registers, so a hello posted during construction is not lost.
 */
const createPortEnd = (): {
  receive: (data: unknown) => void;
  port: (send: (data: unknown) => void) => Port<unknown>;
} => {
  const buffered: unknown[] = [];
  let handler: ((data: unknown) => void) | undefined;
  return {
    receive: (data) => {
      queueMicrotask(() => {
        if (handler) {
          handler(data);
        } else {
          buffered.push(data);
        }
      });
    },
    port: (send) => ({
      postMessage: send,
      onMessage(next) {
        handler = next;
        for (const data of buffered.splice(0)) {
          next(data);
        }
        return () => {
          handler = undefined;
        };
      },
      close: () => undefined,
    }),
  };
};

const createPortPair = (): readonly [Port<unknown>, Port<unknown>] => {
  const a = createPortEnd();
  const b = createPortEnd();
  return [
    a.port((data) => {
      b.receive(data);
    }),
    b.port((data) => {
      a.receive(data);
    }),
  ];
};

describe('createWorkerFileSystemProxy', () => {
  it('connects to the production inline filesystem bridge', async () => {
    const mainPath = 'main.scad';
    const bridge = buildFileSystemBridge(fromMemoryFs({ [mainPath]: 'cube(1);' }));
    expect(bridge).toBeDefined();
    if (!bridge) {
      return;
    }

    try {
      const fileSystem = await createWorkerFileSystemProxy(bridge.port);
      await expect(fileSystem.readFile(mainPath, 'utf8')).resolves.toBe('cube(1);');
      fileSystem.dispose();
    } finally {
      bridge.dispose();
    }
  });

  it('drives a real bridge over a FileSystemBridge whose port is not a MessagePort', async () => {
    const mainPath = 'main.scad';
    const authority = extractInlineFileSystem(fromMemoryFs({ [mainPath]: 'cube(1);' }))!;
    const [serverPort, clientPort] = createPortPair();
    const server = createBridgeServer(authority, serverPort, {
      hello: createFileSystemBridgeHello({
        state: 'ready',
        capabilities: authority.capabilities,
        watchable: typeof authority.watch === 'function',
      }),
      protocolSchemas: fileSystemBridgeSchemas,
    });

    try {
      const fileSystem = await createWorkerFileSystemProxy({ port: clientPort, dispose: () => undefined });
      await expect(fileSystem.readFile(mainPath, 'utf8')).resolves.toBe('cube(1);');
      // The void-result path: msgpack turns the `undefined` response into nil.
      await expect(fileSystem.writeFile('next.scad', 'sphere(1);')).resolves.toBeUndefined();
      await expect(fileSystem.readFile('next.scad', 'utf8')).resolves.toBe('sphere(1);');
      fileSystem.dispose();
    } finally {
      server.dispose();
    }
  });

  it('rejects a missing filesystem bridge version with a typed protocol error', async () => {
    const channel = new MessageChannel();
    const server = createBridgeServer({}, wrapMessagePort(channel.port1), {
      hello: {
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: false,
      },
    });

    await expect(createWorkerFileSystemProxy(channel.port2)).rejects.toMatchObject({
      name: 'FileSystemBridgeProtocolVersionError',
      code: 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH',
      expected: fileSystemBridgeProtocolVersion,
      received: undefined,
    });

    server.dispose();
  });

  it('rejects a mismatched filesystem bridge hello with a typed protocol error', async () => {
    const channel = new MessageChannel();
    const server = createBridgeServer({}, wrapMessagePort(channel.port1), {
      hello: {
        v: fileSystemBridgeProtocolVersion + 1,
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: false,
      },
    });

    await expect(createWorkerFileSystemProxy(channel.port2)).rejects.toMatchObject({
      name: 'FileSystemBridgeProtocolVersionError',
      code: 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH',
      expected: fileSystemBridgeProtocolVersion,
      received: fileSystemBridgeProtocolVersion + 1,
    });

    server.dispose();
  });
});

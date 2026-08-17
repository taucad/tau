import { describe, expect, it } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import { createBridgeServer } from '@taucad/rpc/bridge';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';

describe('createWorkerFileSystemProxy', () => {
  it('connects to the production inline filesystem bridge', async () => {
    const mainPath = '/main.scad';
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
      expected: 1,
      received: undefined,
    });

    server.dispose();
  });

  it('rejects a mismatched filesystem bridge hello with a typed protocol error', async () => {
    const channel = new MessageChannel();
    const server = createBridgeServer({}, wrapMessagePort(channel.port1), {
      hello: {
        v: 2,
        capabilities: { persistent: false, writable: true, quotaBased: false },
        watchable: false,
      },
    });

    await expect(createWorkerFileSystemProxy(channel.port2)).rejects.toMatchObject({
      name: 'FileSystemBridgeProtocolVersionError',
      code: 'FILESYSTEM_BRIDGE_PROTOCOL_VERSION_MISMATCH',
      expected: 1,
      received: 2,
    });

    server.dispose();
  });
});

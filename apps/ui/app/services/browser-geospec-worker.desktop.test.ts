// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { rpcClientErrorCode } from '@taucad/chat';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { createBrowserGeoSpecWorker } from '#services/browser-geospec-worker.desktop.js';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';

describe('createBrowserGeoSpecWorker (desktop)', () => {
  it('should report a failed run without opening a filesystem bridge', async () => {
    const openFileSystemBridge = vi.fn<() => FileSystemBridgeConnection>();
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge,
      runtimeConfig: { tauApiUrl: 'https://api.tau.test', tauWebSocketUrl: 'wss://api.tau.test' },
      createWorker: createBrowserGeoSpecWorker,
    });

    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'The browser GeoSpec runner is unavailable in the desktop app. GeoSpec runs in its services utility.',
    });
    expect(openFileSystemBridge).not.toHaveBeenCalled();
    await client.close();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { extractInlineFileSystem, wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { buildFileSystemBridge } from '#transport/_internal/file-system-bridge.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';

describe('buildFileSystemBridge watch readiness', () => {
  it('does not acknowledge an inline watch before its private native admission settles', async () => {
    const admission = Promise.withResolvers<void>();
    const source = extractInlineFileSystem(fromMemoryFs({ 'main.ts': 'first' }))!;
    const watchReady = vi.fn(() => ({
      unsubscribe: () => undefined,
      ready: admission.promise,
      closed: Promise.resolve(),
    }));
    const fileSystem = wrapAsRuntimeFileSystem({
      kind: 'inline',
      create: () => ({ ...source, watch: () => () => undefined, watchReady }),
    });
    const bridge = buildFileSystemBridge(fileSystem)!;
    const client = await createWorkerFileSystemProxy(bridge.port);
    try {
      const subscription = client.watchReady!({ paths: ['main.ts'] }, () => undefined);
      let acknowledged = false;
      const ready = (async (): Promise<void> => {
        await subscription.ready;
        acknowledged = true;
      })();
      await client.readFile('main.ts', 'utf8');
      expect(acknowledged).toBe(false);
      admission.resolve();
      await ready;
      expect(watchReady).toHaveBeenCalledOnce();
      subscription.unsubscribe();
    } finally {
      admission.resolve();
      client.dispose();
      bridge.dispose();
    }
  });
});

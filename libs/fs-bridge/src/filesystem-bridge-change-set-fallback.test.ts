/**
 * The change-set watch form across a real unrooted authority port (charter D6):
 * the authority-global connection has no change-set watch, so it refuses the
 * form with `ENOTSUP` over the wire, and `watchByChangeSets` falls back to the
 * per-path form on the same connection.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ChangeEventBus,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
  watchByChangeSets,
} from '@taucad/filesystem';
import type { WatchEvent } from '@taucad/filesystem';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  createTransferredFileSystemBridgeProxy,
  exposeFileSystem,
  filesystemBridgeConnectMessageType,
  workspaceBridgeService,
} from '#filesystem-bridge.js';
import { fileSystemBridgeProtocolVersion } from '#filesystem-bridge-protocol.js';

const authority = async () => {
  const registry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:change-set-fallback' } as const;
  const mounts = new MountTable();
  mounts.mount('/', await registry.getProvider(scope), { class: 'authored', ...scope });
  const eventBus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable: mounts,
  });
  return { service, eventBus };
};

describe('the change-set watch form over an unrooted authority port', () => {
  it('crosses the wire as ENOTSUP and falls back to per-path events on the same connection', async () => {
    const { service, eventBus } = await authority();
    const messageSource = new EventTarget();
    const handle = exposeFileSystem(workspaceBridgeService(service), {
      policy: tauPathPolicy,
      changeEventBus: eventBus,
      messageSource,
    });
    const channel = new MessageChannel();
    /* No `root`: the authority-global connection, as trusted administration opens it. */
    messageSource.dispatchEvent(
      new MessageEvent('message', {
        data: { v: fileSystemBridgeProtocolVersion, type: filesystemBridgeConnectMessageType, port: channel.port1 },
      }),
    );
    const proxy = createTransferredFileSystemBridgeProxy(channel.port2);
    try {
      await proxy.ready;
      const refused = proxy.watchChangeSets({ paths: ['/scratch'], recursive: true }, () => undefined);
      await expect(refused.ready).rejects.toMatchObject({ code: 'ENOTSUP' });

      const events: WatchEvent[] = [];
      const watch = watchByChangeSets(proxy, { paths: ['/scratch'], recursive: true }, (event) => {
        events.push(event);
      });
      await watch.ready;
      await service.writeFile('/scratch/main.ts', 'export {};');

      await vi.waitFor(() => {
        expect(events).toContainEqual({ type: 'change', path: '/scratch/main.ts' });
      });
      watch.unsubscribe();
    } finally {
      proxy.dispose();
      handle.cleanup();
      service.dispose();
      channel.port1.close();
    }
  });
});

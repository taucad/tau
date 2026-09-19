/**
 * One rooted connection is the file manager's change transport (charter D12, W12b).
 *
 * The composition under test is the production one, built from the same
 * constructors `file-manager.machine.ts` and `file-manager.worker.ts` use, over
 * the real 500 ms {@link EventCoalescer} the worker installs:
 *
 * ```text
 * createComposedViewClient ──┐
 *                            ├── the project's own rooted 'user' connection ── WorkspaceFileService
 * WorkerChangeChannel ───────┘                                                          │
 *                                                            a peer's rooted connection ┘
 * ```
 *
 * Both halves ride one port, so the bridge's per-port originator suppresses
 * the UI's own writes and only a peer's reach it — every negative assertion
 * here is proved by *ordering* (wait for a later event, then assert the earlier
 * one never came), never by a timeout.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChangeEventBus,
  EventCoalescer,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createFileSystemBridgeProxy, exposeFileSystem, openFileSystemBridge } from '@taucad/fs-bridge';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ComposedViewClient, ComposedViewProxy } from '@taucad/fs-client/composed-view-client';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
import { joinPath } from '@taucad/utils/path';

const projectRoot = '/projects/w12b-change-transport';

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
});

type Harness = {
  /** The file manager's own client: reads, writes and porcelain on its view connection. */
  readonly client: ComposedViewClient;
  /** Every `fileWritten` the file manager was told about, in its own namespace. */
  readonly announced: string[];
  /** A second rooted connection, standing in for another tab's or the agent's writes. */
  readonly peer: FileSystemBridgeProxy;
};

/** The worker's composition: one authority, the production rooted handler, the real coalescer. */
const createHarness = async (): Promise<Harness> => {
  const mountTable = new MountTable();
  mountTable.mount('/', new MemoryProvider(), {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:w12b-home',
  });
  const provider = new MemoryProvider();
  /* Seeded before the authority exists, so no seed event can still be sitting in
   * the coalescer when the connections below register. */
  await provider.writeFile('main.scad', 'cube(1);');
  mountTable.mount(projectRoot, provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: 'memory:w12b-project',
  });
  const eventBus = new ChangeEventBus();
  const fileService = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });

  const messageSource = new EventTarget();
  const exposed = exposeFileSystem(fileService, {
    changeEventBus: eventBus,
    messageSource,
    handlerForRoot: (root, context, consumer) => {
      const filesystem = fileService.createRootedFileSystem(root, context);
      const view =
        consumer === undefined ? filesystem : composeView({ filesystem }, { consumer, policy: tauPathPolicy });
      return withReadContentOps(view, tauPathPolicy);
    },
    /* The window the file manager actually runs with; a self-echo that only a
     * short window hid would still be a self-echo in the product. */
    createCoalescer: (deliver, coalescingWindow, onOverflow) =>
      new EventCoalescer(deliver, { coalescingWindow, onOverflow }),
  });
  const worker = {
    postMessage: (data: unknown) => {
      messageSource.dispatchEvent(new MessageEvent('message', { data }));
    },
  };

  const openRooted = async (): Promise<FileSystemBridgeProxy> => {
    const connection = openFileSystemBridge(worker, { root: projectRoot, consumer: 'user' });
    const proxy = createFileSystemBridgeProxy(connection);
    await proxy.ready;
    disposers.push(() => {
      proxy.dispose();
      connection.dispose();
    });
    return proxy;
  };

  const workspaceConnection = openFileSystemBridge(worker);
  const workspaceProxy = createFileSystemBridgeProxy(workspaceConnection);
  await workspaceProxy.ready;

  const viewProxy = await openRooted();
  const paths = new WorkspacePathResolver(projectRoot);
  const channel = new WorkerChangeChannel({ transport: { listen: viewProxy.listen } });
  const announced: string[] = [];
  channel.onFileWritten({ handler: (event) => announced.push(event.path) });

  const client = createComposedViewClient({
    workspace: workspaceProxy as unknown as FileSystemClient,
    view: viewProxy as unknown as ComposedViewProxy,
    paths,
  });

  disposers.push(() => {
    channel.dispose();
    workspaceProxy.dispose();
    workspaceConnection.dispose();
    exposed.cleanup();
    fileService.dispose();
    provider.dispose();
    eventBus.dispose();
  });

  return { client, announced, peer: await openRooted() };
};

describe('the file manager change transport (charter D12, W12b)', () => {
  it('should not announce the file manager its own write as an external change', async () => {
    const { client, announced, peer } = await createHarness();

    await client.writeFile(joinPath(projectRoot, 'main.scad'), 'cube(2);');
    /* The ordering fence: a peer's write is announced, so the coalescer has
     * flushed everything the self-write could have been batched with. */
    await peer.writeFile('peer.scad', 'cube(3);');

    await vi.waitFor(() => {
      expect(announced).toContain('peer.scad');
    });
    expect(announced).not.toContain('main.scad');
  });

  it("should announce a peer's write under the root in the file manager's own namespace", async () => {
    const { announced, peer } = await createHarness();

    await peer.writeFile('src/nested.scad', 'cube(4);');

    await vi.waitFor(() => {
      expect(announced).toStrictEqual(['src/nested.scad']);
    });
  });
});

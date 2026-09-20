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
import {
  createFileSystemBridgeProxy,
  exposeFileSystem,
  openFileSystemBridge,
  workspaceBridgeService,
} from '@taucad/fs-bridge';
import type { FileSystemBridgeProxy, RootedBridgeConsumer } from '@taucad/fs-bridge';
import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ComposedViewClient, ComposedViewProxy } from '@taucad/fs-client/composed-view-client';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { WorkspaceAuthorityClient } from '@taucad/fs-client/file-system-client';
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
  /** One more connection on the same authority, for the surface a consumer names. */
  readonly openRooted: (consumer: RootedBridgeConsumer) => Promise<FileSystemBridgeProxy>;
};

/**
 * The worker's composition: one authority, the production rooted handler, the real coalescer.
 *
 * @param root - The root the file manager is mounted at; `'/'` is the Home file
 * manager `root-layout.tsx` always mounts, which is where the resolver used to
 * route nothing to the view and hear its own writes back (gate G-D, H1).
 */
const createHarness = async (root: string = projectRoot): Promise<Harness> => {
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
  const exposed = exposeFileSystem(workspaceBridgeService(fileService), {
    changeEventBus: eventBus,
    messageSource,
    handlerForRoot: (root, context, consumer) => {
      const filesystem = fileService.createRootedFileSystem(root, context);
      const view =
        consumer === 'working-copy' ? filesystem : composeView({ filesystem }, { consumer, policy: tauPathPolicy });
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

  const openRooted = async (consumer: RootedBridgeConsumer = 'user'): Promise<FileSystemBridgeProxy> => {
    const connection = openFileSystemBridge(worker, { root, consumer });
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
  const paths = new WorkspacePathResolver(root);
  const channel = new WorkerChangeChannel({ transport: { listen: viewProxy.listen } });
  const announced: string[] = [];
  channel.onFileWritten({ handler: (event) => announced.push(event.path) });

  const client = createComposedViewClient({
    workspace: workspaceProxy as unknown as WorkspaceAuthorityClient,
    view: viewProxy as unknown as ComposedViewProxy,
    /* No dependency mount in this fixture; the arm is wired so the composition is
     * the production one (W11). */
    dependencies: await openRooted(),
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

  return { client, announced, peer: await openRooted(), openRooted };
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

/*
 * The Home file manager is mounted at `/` on every route (`root-layout.tsx`),
 * and `toRelativePath` used to build its prefix as `'//'` — so nothing routed to
 * its view while its change channel listened on the view's port, and it heard
 * every one of its own writes as somebody else's (gate G-D, H1).
 */
describe('the Home file manager change transport (charter D12, gate G-D H1)', () => {
  it('should mask the Home file manager initial listing', async () => {
    const { client, openRooted } = await createHarness('/');
    const workingCopy = await openRooted('working-copy');
    await workingCopy.writeFile('visible.scad', 'cube(1);');
    await workingCopy.mkdir('.git', { recursive: true });
    await workingCopy.writeFile('.git/HEAD', 'ref: refs/heads/main');

    const rows = await client.readDirectory('/');

    expect(rows.map(({ name }) => name)).toContain('visible.scad');
    expect(rows.map(({ name }) => name)).not.toContain('.git');
  });

  it('should not announce the Home file manager its own write as an external change', async () => {
    const { client, announced, peer } = await createHarness('/');

    await client.writeFile('/home.scad', 'cube(2);');
    await peer.writeFile('peer.scad', 'cube(3);');

    await vi.waitFor(() => {
      expect(announced).toContain('peer.scad');
    });
    expect(announced).not.toContain('home.scad');
  });

  it("should announce a peer's write under the Home root root-relative", async () => {
    const { announced, peer } = await createHarness('/');

    await peer.writeFile('src/nested.scad', 'cube(4);');

    await vi.waitFor(() => {
      expect(announced).toStrictEqual(['src/nested.scad']);
    });
  });
});

/*
 * The worker's rooted handler switches on the consumer the connection named
 * (blueprint W2, invariant CI2): `'working-copy'` is the checkout itself, and
 * `'user'` and `'agent'` are masked composed views. `.git/**` is control plane
 * — the one surface that tells them apart.
 */
describe('the surface a rooted consumer names (blueprint W2)', () => {
  it('should serve the working copy unmasked and mask the same path for a user', async () => {
    const { openRooted } = await createHarness();
    const workingCopy = await openRooted('working-copy');
    const user = await openRooted('user');

    await workingCopy.mkdir('.git', { recursive: true });
    await workingCopy.writeFile('.git/HEAD', 'ref: refs/heads/main');

    await expect(workingCopy.readFile('.git/HEAD', 'utf8')).resolves.toBe('ref: refs/heads/main');
    await expect(user.readFile('.git/HEAD', 'utf8')).rejects.toMatchObject({ code: 'EPERM' });
  });
});

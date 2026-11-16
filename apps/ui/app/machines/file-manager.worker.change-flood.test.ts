// @vitest-environment node
/* Node, not jsdom: the transferred port hands back Node's `Uint8Array`, which a
 * jsdom realm's wire validation refuses, and every content read would fail. */
/**
 * What a cold open's tree write costs the page (STO-25 SP2g).
 *
 * The browser's composition, minus the worker realm: a real
 * `WorkspaceFileService` mount, the real `exposeFileSystem` serving a `'user'`
 * connection the way `file-manager.worker.ts` serves it (its event coalescer
 * included), and the page's own `WorkerChangeChannel` and `FileTreeService` on
 * that connection. The revision layer's own `materializeTree` writes a
 * 2,000-file tree into the empty checkout, the shape of a remote project's
 * first open, and the harness counts what crosses the worker boundary: bus
 * events, `fileChanged` messages and their facts, event-channel frames, the
 * change sets the tree is handed, and the listings it re-reads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  ChangeEventBus,
  EventCoalescer,
  MountTable,
  ProviderRegistry,
  ResourceQueue,
  WorkspaceFileService,
} from '@taucad/filesystem';
import type { ChangeSet } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  createTransferredFileSystemBridgeProxy,
  exposeFileSystem,
  fileSystemBridgeProtocolVersion,
  filesystemBridgeConnectMessageType,
  workspaceBridgeService,
} from '@taucad/fs-bridge';
import type { FileSystemBridgeRootedProxy } from '@taucad/fs-bridge';
import { createComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { ComposedViewProxy } from '@taucad/fs-client/composed-view-client';
import type { WorkspaceAuthorityClient } from '@taucad/fs-client/file-system-client';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { headlessVisibilityProvider } from '@taucad/fs-client/visibility-provider';
import { captureRevisionTree, ImmutableRevisionTree } from '@taucad/revisions/algorithms';
import { createApplyTreeEffects } from '@taucad/revisions/apply-tree';
import type { Checkout } from '@taucad/revisions';
import { projectManifestSchemaUrl, serializeProjectManifest } from '@taucad/types';
import type { ChangeEvent } from '@taucad/types';

const projectId = 'alpha';
const root = `/projects/${projectId}`;
const fileCount = 2000;
/** Four facts a replaced file: past the bridge window's 10,000-fact bound. */
const overflowCount = 2600;
const directoryCount = 40;

const liveCheckout: Checkout = {
  id: 'live',
  projectId,
  root: '',
  kind: 'live',
  branch: 'main',
  baseRevisionId: undefined,
};

type Counts = {
  busEvents: number;
  busFacts: number;
  fileChangedMessages: number;
  fileChangedFacts: number;
  eventFrames: number;
  eventFrameEntries: number;
  treeChangeSets: number;
  treeChangeSetEntries: number;
  treeResets: number;
  backendChanged: number;
  listings: number;
  contentReads: number;
  outcomes: number;
  orphanFlips: number;
};

type Harness = Readonly<{
  service: WorkspaceFileService;
  eventBus: ChangeEventBus;
  counts: Counts;
  /** Every path a content read asked the connection for, in order. */
  read: string[];
  tree: FileTreeService;
  content: FileContentService;
  dispose: () => void;
}>;

/** The connection's content reads, whichever the content service uses. */
const readMethods = new Set<PropertyKey>(['readFile', 'readFileWithDigest', 'readFileStream', 'readMany']);

const live: Harness[] = [];

afterEach(() => {
  for (const entry of live.splice(0)) {
    entry.dispose();
  }
  vi.useRealTimers();
});

/** Wait until nothing has crossed for `quiet` milliseconds. */
const settle = async (counts: Counts, quiet = 700): Promise<void> => {
  let seen = '';
  while (seen !== JSON.stringify(counts)) {
    seen = JSON.stringify(counts);
    // oxlint-disable-next-line no-await-in-loop -- polling for quiet is sequential by definition.
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, quiet);
    });
  }
};

const harness = async (): Promise<Harness> => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  mountTable.mount(root, provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:sp2g' });
  const eventBus = new ChangeEventBus();
  const counts: Counts = {
    busEvents: 0,
    busFacts: 0,
    fileChangedMessages: 0,
    fileChangedFacts: 0,
    eventFrames: 0,
    eventFrameEntries: 0,
    treeChangeSets: 0,
    treeChangeSetEntries: 0,
    treeResets: 0,
    backendChanged: 0,
    listings: 0,
    contentReads: 0,
    outcomes: 0,
    orphanFlips: 0,
  };
  eventBus.subscribe((event) => {
    counts.busEvents += 1;
    counts.busFacts += event.type === 'changeSet' ? event.entries.length : 1;
  });
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
    policy: tauPathPolicy,
  });
  const connections = new EventTarget();
  /* As `file-manager.worker.ts` exposes it, its coalescer included. */
  const exposed = exposeFileSystem(workspaceBridgeService(service), {
    // oxlint-disable-next-line max-params -- RootedFileSystemHandlerFactory's own arity.
    handlerForRoot: (handlerRoot, context, consumer, policy) => {
      const filesystem = service.createRootedFileSystem(handlerRoot, context);
      const view = consumer === 'working-copy' ? filesystem : composeView({ filesystem }, { consumer, policy });
      return withReadContentOps(view, policy);
    },
    policy: tauPathPolicy,
    changeEventBus: eventBus,
    createCoalescer: (deliver, coalescingWindow, onOverflow) =>
      new EventCoalescer(deliver, { coalescingWindow, onOverflow }),
    messageSource: connections,
  });
  const channel = new MessageChannel();
  connections.dispatchEvent(
    new MessageEvent('message', {
      data: {
        v: fileSystemBridgeProtocolVersion,
        type: filesystemBridgeConnectMessageType,
        port: channel.port1,
        root,
        consumer: 'user',
      },
    }),
  );
  const viewProxy: FileSystemBridgeRootedProxy = createTransferredFileSystemBridgeProxy(channel.port2);
  await viewProxy.ready;
  const unlisten = viewProxy.listen('fileChanged', (data) => {
    const event = data as ChangeEvent;
    counts.fileChangedMessages += 1;
    counts.fileChangedFacts += event.type === 'changeSet' ? event.entries.length : 1;
  });
  const frames = viewProxy.events((event) => {
    if (event.kind === 'changeSet') {
      counts.eventFrames += 1;
      counts.eventFrameEntries += event.set.entries.length;
    }
  });
  await frames.ready;
  const changeChannel = new WorkerChangeChannel({
    transport: {
      listen: viewProxy.listen,
      closed: viewProxy.closed,
      events: (handler) => viewProxy.events(handler),
      watchChangeSets: (request, handler) => viewProxy.watchChangeSets(request, handler),
      watchReady: (request, handler) => viewProxy.watchReady(request, handler),
    },
  });
  changeChannel.onChangeSet((set: ChangeSet) => {
    counts.treeChangeSets += 1;
    counts.treeChangeSetEntries += set.entries.length;
    counts.treeResets += set.reset === undefined ? 0 : 1;
  });
  changeChannel.onBackendChanged(() => {
    counts.backendChanged += 1;
  });
  const read: string[] = [];
  const listedView = new Proxy(viewProxy, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      const counted =
        property === 'readdirWithStats' ? 'listings' : readMethods.has(property) ? 'contentReads' : undefined;
      if (counted !== undefined && typeof value === 'function') {
        return async (...parameters: unknown[]) => {
          counts[counted] += 1;
          if (counted === 'contentReads' && typeof parameters[0] === 'string') {
            read.push(parameters[0]);
          }
          return (value as (...callParameters: unknown[]) => Promise<unknown>).apply(target, parameters);
        };
      }
      return value;
    },
  }) as unknown as ComposedViewProxy;
  const paths = new WorkspacePathResolver(root);
  const client = createComposedViewClient({
    workspace: mock<WorkspaceAuthorityClient>(),
    view: listedView,
    dependencies: mock<ComposedViewProxy>({
      readdirWithStats: vi.fn().mockResolvedValue([]),
      readdir: vi.fn().mockResolvedValue([]),
    }),
    paths,
  });
  const tree = new FileTreeService({
    proxy: client,
    paths,
    channel: changeChannel,
    visibility: headlessVisibilityProvider,
  });
  const content = new FileContentService({
    proxy: client,
    paths,
    channel: changeChannel,
    refreshGuard: new RefreshGenerationGuard(),
  });
  tree.connectToContentService(content);
  content.onDidChangeOutcome(() => {
    counts.outcomes += 1;
  });
  content.onDidChangeOrphaned(() => {
    counts.orphanFlips += 1;
  });
  const entry: Harness = {
    service,
    eventBus,
    counts,
    read,
    tree,
    content,
    dispose: () => {
      content.dispose();
      tree.dispose();
      changeChannel.dispose();
      frames.unsubscribe();
      unlisten();
      viewProxy.dispose();
      exposed.cleanup();
      service.dispose();
      eventBus.dispose();
      provider.dispose();
    },
  };
  live.push(entry);
  return entry;
};

/** The revision layer's own tree write over the checkout the worker gives it. */
const materialize = async (service: WorkspaceFileService, target: ImmutableRevisionTree): Promise<void> => {
  const checkout = service.createRootedFileSystem(root, undefined, { placeholders: 'raw' });
  const { materializeTree } = createApplyTreeEffects({
    useFileSystem: async (_place, operation) => operation(checkout),
    capture: async () => captureRevisionTree(checkout, { exclude: (path) => path.startsWith('.git') }),
    onApplyingTree: undefined,
    policy: tauPathPolicy,
    withCheckoutFence: async (_checkoutId, operation) => operation(),
    checkoutTreeId: async () => 'tree',
    /* The production spelling (`revision-effects.ts`): a dot-prefixed sibling named by a UUID. */
    temporarySibling: (path, role) => {
      const separator = path.lastIndexOf('/');
      return `${path.slice(0, separator + 1)}.${path.slice(separator + 1)}.tau-${role}.${crypto.randomUUID()}.tmp`;
    },
    unlinkIfPresent: async (filesystem, path) => {
      await filesystem.unlink(path).catch(() => undefined);
    },
  });
  await materializeTree(liveCheckout, target);
};

const groupPath = (group: number): string => `parts/group-${String(group).padStart(2, '0')}`;
const partPath = (index: number): string =>
  `${groupPath(index % directoryCount)}/part-${String(index).padStart(4, '0')}.scad`;

const tree = (count: number, content: (index: number) => string): ImmutableRevisionTree =>
  new ImmutableRevisionTree([
    [
      'tau.json',
      serializeProjectManifest({
        $schema: projectManifestSchemaUrl,
        name: 'Alpha',
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.scad' } },
      }),
    ],
    ['main.scad', 'cube(10);'],
    ...Array.from({ length: count }, (_, index) => [partPath(index), content(index)] as const),
  ]);

/** Run one tree write and count what crossed while it landed and settled. */
const measure = async (
  fixture: Harness,
  label: string,
  write: () => Promise<void>,
): Promise<Readonly<Record<keyof Counts, number>>> => {
  const { counts } = fixture;
  await settle(counts);
  const before = { ...counts };
  fixture.read.length = 0;
  const started = performance.now();
  await write();
  const wrote = performance.now() - started;
  await settle(counts);
  const elapsed = performance.now() - started;
  const delta = Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, value - before[key as keyof Counts]]),
  ) as Record<keyof Counts, number>;
  console.info(
    `[sp2g] ${label}: wrote in ${wrote.toFixed(0)} ms, settled in ${elapsed.toFixed(0)} ms`,
    JSON.stringify(delta),
    JSON.stringify(fixture.read),
  );
  return delta;
};

/** The page shows the root, `parts` and every group, as a person who expanded the tree does. */
const showTree = async (fileTree: FileTreeService): Promise<void> => {
  await fileTree.listDirectory('');
  await fileTree.listDirectory('parts');
  await Promise.all(
    Array.from({ length: directoryCount }, async (_, group) => fileTree.listDirectory(groupPath(group))),
  );
};

const shownDirectories = (): string[] => [
  '',
  'parts',
  ...Array.from({ length: directoryCount }, (_, group) => groupPath(group)),
];

/** Every shown directory's rows, by name. */
const shownListings = async (fileTree: FileTreeService): Promise<Record<string, string[]>> =>
  Object.fromEntries(
    shownDirectories().map((directory) => [
      directory,
      (fileTree.listDirectorySync(directory) ?? []).map(({ name }) => name).toSorted(),
    ]),
  );

/** The same directories as the checkout holds them. */
const diskListings = async (service: WorkspaceFileService): Promise<Record<string, string[]>> => {
  const checkout = service.createRootedFileSystem(root, undefined, { placeholders: 'raw' });
  const listed = await Promise.all(
    shownDirectories().map(async (directory) => {
      const names = await checkout.readdir(directory);
      return [directory, names.filter((name) => !name.startsWith('.git')).toSorted()] as const;
    }),
  );
  return Object.fromEntries(listed);
};

describe('a tree write across the worker boundary (STO-25 SP2g)', () => {
  it('should hand the page a cold open’s 2,000 files in bounded deliveries', async () => {
    const fixture = await harness();
    await fixture.tree.listDirectory('');
    const delta = await measure(fixture, 'cold 2002, root shown', async () =>
      materialize(
        fixture.service,
        tree(fileCount, (index) => `cube(${String(index)});`),
      ),
    );
    expect(delta.busFacts).toBeGreaterThanOrEqual(fileCount);
  }, 60_000);

  it.each([fileCount, overflowCount])(
    'should hand the page a replacement of %i shown files in bounded deliveries',
    async (count) => {
      const fixture = await harness();
      await materialize(
        fixture.service,
        tree(count, (index) => `cube(${String(index)});`),
      );
      await showTree(fixture.tree);
      /* A document the person has open outside the write, and one it replaces. */
      await fixture.content.resolve('main.scad');
      await fixture.content.resolve(partPath(7));
      const delta = await measure(fixture, `replace ${String(count + 2)}, tree shown`, async () =>
        materialize(
          fixture.service,
          tree(count, (index) => `sphere(${String(index)});`),
        ),
      );
      expect(delta.busFacts).toBeGreaterThanOrEqual(count);
      /* A replaced file crosses as its publish and its backup's removal, not its four protocol facts. */
      expect(delta.fileChangedFacts).toBeLessThanOrEqual(2 * count);
      /* Past the window's bound the loss is scoped to the folders written, never a backend swap (Rule 24). */
      expect(delta.backendChanged).toBe(0);
      expect(fixture.read).not.toContain('main.scad');
      /* The open document the write replaced is re-read; no file it replaced ever reads as gone (I7). */
      /* At most twice: its move aside and its publish land in separate change sets, and a
       * read the second one overtakes must run again. */
      expect(fixture.read.filter((path) => path === partPath(7)).length).toBeGreaterThanOrEqual(1);
      expect(fixture.read.filter((path) => path === partPath(7)).length).toBeLessThanOrEqual(2);
      expect(delta.orphanFlips).toBe(0);
      expect(delta.outcomes).toBeLessThanOrEqual(2);
      /* What the page holds is what landed: the replaced document's new text and every listing as on disk (I5). */
      const replaced = fixture.content.peekOutcome(partPath(7));
      expect(replaced.kind === 'text' ? new TextDecoder().decode(replaced.content) : replaced.kind).toBe('sphere(7);');
      expect(await shownListings(fixture.tree)).toEqual(await diskListings(fixture.service));
    },
    60_000,
  );

  it.each([
    ['another project is deleted', '/projects'],
    ['an unmapped path changes outside every project', '/'],
  ])(
    'should leave an open project as it is when %s',
    async (_case, summarized) => {
      const fixture = await harness();
      await materialize(
        fixture.service,
        tree(fileCount, (index) => `cube(${String(index)});`),
      );
      await showTree(fixture.tree);
      await fixture.content.resolve(partPath(7));
      const delta = await measure(fixture, `summary of ${summarized}`, async () => {
        fixture.eventBus.emit({ type: 'directoryChanged', path: summarized, backend: 'memory' });
      });
      expect(delta).toMatchObject({ fileChangedMessages: 0, treeResets: 0, listings: 0, contentReads: 0, outcomes: 0 });
    },
    60_000,
  );
});

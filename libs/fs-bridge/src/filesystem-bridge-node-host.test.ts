/**
 * X8 — the filesystem-bridge authority hosted outside a browser worker.
 *
 * This project runs vitest with `environment: 'node'`, so `self` and `Worker`
 * are genuinely absent here. `MessagePort`, `MessageChannel`, `MessageEvent`
 * and `EventTarget` *are* Node globals (v15+) and are used as such — "no
 * browser globals" is not the criterion and would be unmeetable. What the
 * suite does pin is that the library never imports `node:worker_threads`
 * and never touches the worker global once a message source is injected.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { ChangeEvent } from '@taucad/types';
import type { ExposeFileSystemHandle, FileSystemBridgeProxy, RootedBridgeConsumer } from '@taucad/fs-bridge';
import {
  createTransferredFileSystemBridgeProxy,
  exposeFileSystem,
  fileSystemBridgeProtocolVersion,
  openFileSystemBridge,
  workspaceBridgeService,
} from '@taucad/fs-bridge';

const encoder = new TextEncoder();
const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const projectRoot = `/projects/${projectId}`;

type Workspace = {
  readonly service: WorkspaceFileService;
  readonly bus: ChangeEventBus;
};

const createWorkspace = async (): Promise<Workspace> => {
  const providerRegistry = new ProviderRegistry();
  const rootStorageRootKey = `memory:node-host-root-${Math.random().toString(36).slice(2)}`;
  const rootProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: rootStorageRootKey,
  });
  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, { class: 'authored', backend: 'memory', storageRootKey: rootStorageRootKey });
  const bus = new ChangeEventBus();
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: bus,
    mountTable,
  });
  await service.configureProjectRoots({
    projects: [
      {
        projectId,
        backend: 'memory',
        storageRootKey: `memory:node-host-project-${Math.random().toString(36).slice(2)}`,
        providerBasePath: projectId,
      },
    ],
    roots: [],
  });
  return { service, bus };
};

type NodeHost = {
  readonly exposed: ExposeFileSystemHandle;
  /** The workspace surface takes no arguments; a rooted one names both (CI2). */
  readonly connect: {
    (): { proxy: FileSystemBridgeProxy; dispose: () => void };
    (root: string, consumer: RootedBridgeConsumer): { proxy: FileSystemBridgeProxy; dispose: () => void };
  };
  readonly dispose: () => void;
};

/**
 * Stand the authority up on one end of a Node `worker_threads` channel and
 * post connect envelopes into the other end — the same handshake a browser
 * worker performs, with the worker boundary replaced by a port pair.
 */
const hostOnNode = ({ service, bus }: Workspace): NodeHost => {
  const boundary = new MessageChannel();
  const exposed = exposeFileSystem(workspaceBridgeService(service), {
    policy: tauPathPolicy,
    changeEventBus: bus,
    /*
     * The composition every host performs (charter D2): the connection's view,
     * plus the read content operations served over it. The mask comes with the
     * view, so `versionedOnly` is the only filter left to build.
     */
    handlerForRoot: (root, context, consumer) => {
      const filesystem = service.createRootedFileSystem(root, context);
      const view =
        consumer === 'working-copy' ? filesystem : composeView({ filesystem }, { consumer, policy: tauPathPolicy });
      return withReadContentOps(view, tauPathPolicy);
    },
    messageSource: boundary.port2,
  });
  return {
    exposed,
    connect(
      root?: string,
      consumer: RootedBridgeConsumer = 'working-copy',
    ): {
      proxy: FileSystemBridgeProxy;
      dispose: () => void;
    } {
      const connection = openFileSystemBridge(boundary.port1, root === undefined ? undefined : { root, consumer });
      const proxy = createTransferredFileSystemBridgeProxy(connection.port);
      return {
        proxy,
        dispose() {
          proxy.dispose();
        },
      };
    },
    dispose() {
      exposed.cleanup();
      boundary.port1.close();
      boundary.port2.close();
      service.dispose();
    },
  };
};

describe('filesystem bridge authority on a Node host (X8)', () => {
  it('completes connect, hello, a scoped-root request and disposal with an injected message source', async () => {
    expect('self' in globalThis).toBe(false);
    expect('Worker' in globalThis).toBe(false);

    const workspace = await createWorkspace();
    await workspace.service.writeFile(`${projectRoot}/main.ts`, 'export default 1;\n');
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot, 'working-copy');

    try {
      await client.proxy.ready;
      expect(client.proxy.hello.payload).toMatchObject({ v: fileSystemBridgeProtocolVersion, state: 'ready' });
      await expect(client.proxy.readFile('main.ts', 'utf8')).resolves.toBe('export default 1;\n');

      await client.proxy.writeFile('written.ts', 'export default 2;\n');
      await expect(workspace.service.readFile(`${projectRoot}/written.ts`, 'utf8')).resolves.toBe(
        'export default 2;\n',
      );
      expect(host.exposed.activePorts.size).toBe(1);

      client.dispose();
      // The proxy's `get` trap throws before the call, so nothing is left pending.
      expect(() => {
        void client.proxy.readFile('main.ts', 'utf8');
      }).toThrow(/disposed/u);
    } finally {
      host.dispose();
    }
  });

  it('keeps a scoped port inside its root on the Node host', async () => {
    const workspace = await createWorkspace();
    await workspace.service.writeFile('/outside.ts', 'secret');
    await workspace.service.writeFile(`${projectRoot}/inside.ts`, 'visible');
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot, 'working-copy');

    try {
      await client.proxy.ready;
      await expect(client.proxy.readFile('inside.ts', 'utf8')).resolves.toBe('visible');
      // The scoped handler resolves `/` to the project root, so the authority's
      // own `/outside.ts` is simply not addressable from this port.
      await expect(client.proxy.readFile('outside.ts', 'utf8')).rejects.toThrow();
      await expect(client.proxy.readFile('../outside.ts', 'utf8')).rejects.toThrow();
    } finally {
      client.dispose();
      host.dispose();
    }
  });

  /*
   * The archive and the subtree read are the rooted surface's (charter D2/W3):
   * the same call the palette's whole-project export reaches, over a real
   * channel, against a project whose control plane is on disk.
   */
  it('serves the read content operations over the rooted view, masked and filtered', async () => {
    const workspace = await createWorkspace();
    for (const [path, body] of Object.entries({
      'main.ts': 'export default 1;\n',
      'tau.json': '{}',
      'thumbnail.webp': 'webp',
      '.git/HEAD': 'ref: refs/heads/main',
    })) {
      // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
      await workspace.service.writeFile(`${projectRoot}/${path}`, body);
    }
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot, 'user');

    try {
      await client.proxy.ready;

      /* The control plane is absent because the view never enumerates it — no
       * filter argument, and no second copy of the path policy. */
      await expect(client.proxy.contents('')).resolves.toEqual({
        'main.ts': encoder.encode('export default 1;\n'),
        'tau.json': encoder.encode('{}'),
        'thumbnail.webp': encoder.encode('webp'),
      });
      /* The caller's own filter: the registry's `versioned` rows are the project. */
      await expect(client.proxy.contents('', { versionedOnly: true })).resolves.toEqual({
        'main.ts': encoder.encode('export default 1;\n'),
        'tau.json': encoder.encode('{}'),
      });

      const archived = await client.proxy.archive('', { versionedOnly: true });
      expect(archived).toBeInstanceOf(Blob);
      expect(archived.size).toBeGreaterThan(0);
    } finally {
      client.dispose();
      host.dispose();
    }
  });

  /*
   * Search and recursive stat are the root's index over the same connection
   * (charter D3/W4): additive rooted calls, no protocol version bump.
   */
  it('serves search and recursive stat over the rooted view, masked', async () => {
    const workspace = await createWorkspace();
    for (const [path, body] of Object.entries({
      'main.ts': 'export default 1;\n',
      'src/helper.ts': 'export const helper = 1;\n',
      '.git/HEAD': 'ref: refs/heads/main',
    })) {
      // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
      await workspace.service.writeFile(`${projectRoot}/${path}`, body);
    }
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot, 'user');

    try {
      await client.proxy.ready;

      await expect(client.proxy.search('.ts')).resolves.toMatchObject([{ path: 'main.ts' }, { path: 'src/helper.ts' }]);
      /* `HEAD` lives only in the control plane, which the view never descends. */
      await expect(client.proxy.search('HEAD')).resolves.toEqual([]);
      await expect(client.proxy.statTree('')).resolves.toMatchObject([{ path: 'main.ts' }, { path: 'src/helper.ts' }]);
      await expect(client.proxy.statTree('src')).resolves.toMatchObject([{ path: 'helper.ts' }]);
    } finally {
      client.dispose();
      host.dispose();
    }
  });

  /*
   * The mutating porcelain over the same connection (charter D4/W5): additive
   * rooted calls, protocol still 1. No production client sends these yet — W12
   * migrates the Files pane's copy, duplicate, move and preflights off the
   * authority — so this row is what keeps them honest until it does.
   */
  it('serves the mutating porcelain over the rooted view, mask-checked and wire-shaped', async () => {
    const workspace = await createWorkspace();
    for (const [path, body] of Object.entries({
      'main.ts': 'export default 1;\n',
      'src/helper.ts': 'export const helper = 1;\n',
      '.git/HEAD': 'ref: refs/heads/main',
    })) {
      // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
      await workspace.service.writeFile(`${projectRoot}/${path}`, body);
    }
    const host = hostOnNode(workspace);
    const client = host.connect(projectRoot, 'user');

    try {
      await client.proxy.ready;

      /* One batch copy of the whole project: the control plane is not carried,
       * because the view hands the copy its own mask as the entry filter. */
      await client.proxy.copyTree('', 'backup');
      await expect(client.proxy.contents('backup')).resolves.toEqual({
        'main.ts': encoder.encode('export default 1;\n'),
        'src/helper.ts': encoder.encode('export const helper = 1;\n'),
      });

      await client.proxy.duplicate('main.ts', 'main.copy.ts');
      await expect(client.proxy.readFile('main.copy.ts', 'utf8')).resolves.toBe('export default 1;\n');

      await expect(client.proxy.move('main.ts', 'renamed.ts')).resolves.toMatchObject({ type: 'file' });
      await client.proxy.writeFiles({ 'batch/a.ts': { content: 'a' }, 'batch/b.ts': { content: 'b' } });
      await expect(client.proxy.readFile('batch/b.ts', 'utf8')).resolves.toBe('b');

      /* A typed refusal survives the wire as a `WorkspaceMutationError`, both
       * on a preflight and inside a bulk-move report. */
      await expect(client.proxy.canCreate('renamed.ts', 'file')).resolves.toMatchObject({ code: 'NAME_EXISTS' });
      await expect(client.proxy.canDelete('absent.ts')).resolves.toMatchObject({ code: 'NOT_FOUND' });
      const bulk = await client.proxy.bulkMove([
        { source: 'renamed.ts', target: 'moved.ts' },
        { source: 'absent.ts', target: 'nowhere.ts' },
      ]);
      expect(bulk.moved.map(({ edit }) => edit.target)).toStrictEqual(['moved.ts']);
      expect(bulk.failed.map(({ error }) => error.code)).toStrictEqual(['NOT_FOUND']);

      /* The mask refuses a control-plane operand before any provider I/O. */
      await expect(client.proxy.copyTree('.git', 'stolen')).rejects.toThrow();
    } finally {
      client.dispose();
      host.dispose();
    }
  });

  it('never imports node:worker_threads anywhere in the library', () => {
    const sources = readdirSync(import.meta.dirname, { recursive: true, encoding: 'utf8' }).filter(
      (entry) => entry.endsWith('.ts') && !entry.includes('.test'),
    );
    expect(sources.length).toBeGreaterThan(0);

    const importers = sources.filter((entry) =>
      /(?:from|import|require)\s*\(?\s*['"]node:worker_threads['"]/u.test(
        readFileSync(path.join(import.meta.dirname, entry), 'utf8'),
      ),
    );

    expect(importers).toEqual([]);
  });
});

/*
 * W12(a) — can ONE rooted connection be the file manager's change transport?
 *
 * The FM holds two ports today (`file-manager.machine.ts:474`): reads on the
 * rooted view, writes and `ChangeEvent`s on the workspace surface, because the
 * change channel needs both root-relative paths and echo suppression. These
 * rows answer whether the rooted connection already carries both, over a real
 * `MessageChannel`, against a real authority and a real `ChangeEventBus`.
 *
 * Deliveries are asserted by ordering, never by a timeout: a port is FIFO, so
 * waiting for a later event proves an earlier one was never sent.
 */
describe('one rooted connection as the change transport (W12a)', () => {
  const collect = (proxy: FileSystemBridgeProxy): { events: ChangeEvent[]; stop: () => void } => {
    const events: ChangeEvent[] = [];
    const stop = proxy.listen('fileChanged', (event) => {
      events.push(event as ChangeEvent);
    });
    return { events, stop };
  };

  it('never echoes a write made through the rooted connection back to it', async () => {
    const workspace = await createWorkspace();
    const host = hostOnNode(workspace);
    const rooted = host.connect(projectRoot, 'user');
    const surface = host.connect();
    const observed = collect(rooted.proxy);

    try {
      await rooted.proxy.ready;
      await surface.proxy.ready;

      await rooted.proxy.writeFile('self.ts', 'mine');
      /* A peer write after it, made in the authority's own isolate because the
       * unrooted wire carries no content at all any more (W11): the rooted port
       * is FIFO, so once this arrives the author's own event has had its turn
       * and did not come. */
      await workspace.service.writeFile(`${projectRoot}/peer.ts`, 'theirs');

      await vi.waitFor(() => {
        expect(observed.events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: 'peer.ts' }));
      });
      expect(observed.events).not.toContainEqual(expect.objectContaining({ path: 'self.ts' }));
    } finally {
      observed.stop();
      rooted.dispose();
      surface.dispose();
      host.dispose();
    }
  });

  it('delivers an authority write under the root in the root-relative namespace', async () => {
    const workspace = await createWorkspace();
    const host = hostOnNode(workspace);
    const rooted = host.connect(projectRoot, 'user');
    const surface = host.connect();
    const observed = collect(rooted.proxy);

    try {
      await rooted.proxy.ready;
      await surface.proxy.ready;

      await workspace.service.writeFile(`${projectRoot}/src/peer.ts`, 'theirs');

      await vi.waitFor(() => {
        expect(observed.events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: 'src/peer.ts' }));
      });
      /* The authority spelling never reaches the connection (I6). */
      expect(observed.events).not.toContainEqual(expect.objectContaining({ path: `${projectRoot}/src/peer.ts` }));
    } finally {
      observed.stop();
      rooted.dispose();
      surface.dispose();
      host.dispose();
    }
  });

  it('withholds a write outside the root from the rooted connection', async () => {
    const workspace = await createWorkspace();
    const host = hostOnNode(workspace);
    const rooted = host.connect(projectRoot, 'user');
    const surface = host.connect();
    const observed = collect(rooted.proxy);

    try {
      await rooted.proxy.ready;
      await surface.proxy.ready;

      await workspace.service.writeFile('/outside.ts', 'secret');
      await workspace.service.writeFile(`${projectRoot}/inside.ts`, 'visible');

      await vi.waitFor(() => {
        expect(observed.events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: 'inside.ts' }));
      });
      expect(observed.events.map((event) => JSON.stringify(event)).join('\n')).not.toContain('outside.ts');
    } finally {
      observed.stop();
      rooted.dispose();
      surface.dispose();
      host.dispose();
    }
  });

  /*
   * I5 — batch semantics are unchanged by the root. A `copyTree` is one lock
   * set and one `directoryCopied` summary over per-path facts (Rule 5a,
   * `mutation-pipeline.ts:386`); it is *not* collapsed to a single event, and
   * the coalescer only merges repeats of one path (`event-coalescer.ts:214`).
   * So the pin is equality: the rooted observer sees exactly the sequence the
   * workspace surface sees, translated, with exactly one summary — and the
   * author of the batch sees none of it.
   */
  it('delivers a rooted batch as the surface sequence, translated, with one summary and no self-echo', async () => {
    const workspace = await createWorkspace();
    for (const [path, body] of Object.entries({
      'main.ts': 'export default 1;\n',
      'src/helper.ts': 'export const helper = 1;\n',
    })) {
      // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
      await workspace.service.writeFile(`${projectRoot}/${path}`, body);
    }
    const host = hostOnNode(workspace);
    const author = host.connect(projectRoot, 'user');
    const peer = host.connect(projectRoot, 'user');
    const surface = host.connect();
    const authored = collect(author.proxy);
    const observed = collect(peer.proxy);
    const global = collect(surface.proxy);

    try {
      await author.proxy.ready;
      await peer.proxy.ready;
      await surface.proxy.ready;

      await author.proxy.copyTree('', 'backup');

      await vi.waitFor(() => {
        expect(global.events).toContainEqual(
          expect.objectContaining({ type: 'directoryCopied', targetPath: `${projectRoot}/backup` }),
        );
      });
      await vi.waitFor(() => {
        expect(observed.events).toContainEqual(
          expect.objectContaining({ type: 'directoryCopied', targetPath: 'backup' }),
        );
      });

      const summaries = observed.events.filter((event) => event.type === 'directoryCopied');
      expect(summaries).toStrictEqual([
        { type: 'directoryCopied', sourcePath: '', targetPath: 'backup', backend: 'memory' },
      ]);
      /* Same facts, same order, one namespace apart. */
      expect(observed.events.map((event) => event.type)).toStrictEqual(global.events.map((event) => event.type));
      expect(observed.events).toStrictEqual(
        global.events.map((event) =>
          Object.fromEntries(
            Object.entries(event).map(([key, value]) => [
              key,
              typeof value === 'string' && value.startsWith(projectRoot) ? value.slice(projectRoot.length + 1) : value,
            ]),
          ),
        ),
      );
      /* The batch's author is told nothing it already knows (D12). */
      expect(authored.events).toStrictEqual([]);
    } finally {
      authored.stop();
      observed.stop();
      global.stop();
      author.dispose();
      peer.dispose();
      surface.dispose();
      host.dispose();
    }
  });
});

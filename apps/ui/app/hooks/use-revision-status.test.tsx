/**
 * The page's half of the worker revision root's lifetime (A38, review R2/R3).
 *
 * The root is created by the route and destroyed when the user navigates away,
 * so the page must close its port: on unmount, on `visibilitychange: hidden`
 * through the document's one unload registry, and whenever the file-manager
 * replaces the worker the port was opened on. These cases drive the real
 * registry over a real `projectRevisionsMachine` tree and assert the root
 * actor, not the client's own bookkeeping.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { assign, createActor, setup } from 'xstate';
import { createIsomorphicGitRevisionPort, createRevisionHttpClient } from '@taucad/revisions';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createWorkerRevisionRegistry } from '#machines/file-manager.worker.revisions.js';
import type { WorkerProjectRevisions } from '#machines/file-manager.worker.revisions.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { revisionClientTestApi, useRevisionClient, useRevisionCommands } from '#hooks/use-revision-status.js';
import type { GitRemoteCredential } from '@taucad/revisions';

const projectId = 'alpha';

/** The file-manager's own context, as far as this hook reads it. */
const fileManagerMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as { worker: Worker | undefined },
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as { type: 'worker'; worker: Worker | undefined },
  },
}).createMachine({
  context: { worker: undefined },
  on: { worker: { actions: assign(({ event }) => ({ worker: event.worker })) } },
});

const fileManagerRef = createActor(fileManagerMachine).start();

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId }) }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => ({ fileManagerRef }) }));

let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

const setVisibility = (next: DocumentVisibilityState): void => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
};

const settle = async (turns = 12): Promise<void> => {
  for (let index = 0; index < turns; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- draining is sequential by definition.
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
};

const harness = (
  options: Readonly<{ remoteUrl?: string; files?: Readonly<Record<string, string>> }> = {},
): {
  worker: () => { worker: Worker; registry: ReturnType<typeof createWorkerRevisionRegistry> };
  root: (registry: ReturnType<typeof createWorkerRevisionRegistry>) => Promise<WorkerProjectRevisions>;
  read: (path: string) => Promise<string>;
  /** What the worker still holds for this project's remote, read as the port reads it. */
  credential: () => GitRemoteCredential | undefined;
  dispose: () => void;
} => {
  const provider = new MemoryProvider();
  const mountTable = new MountTable();
  const eventBus = new ChangeEventBus();
  mountTable.mount(`/projects/${projectId}`, provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: `memory:w3d-a2-${projectId}`,
  });
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue: new ResourceQueue(),
    eventBus,
    mountTable,
  });
  let held: (() => GitRemoteCredential | undefined) | undefined;
  const seeded = (async (): Promise<void> => {
    const filesystem = service.createRootedFileSystem(`/projects/${projectId}`);
    for (const [path, content] of Object.entries(options.files ?? {})) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
      await filesystem.writeFile(path, content);
    }
  })();
  void seeded;
  return {
    /* A worker is a `postMessage` and the registry behind it; a replaced worker
     * is a new registry, because the old one died with the thread it ran in. */
    worker: () => {
      const registry = createWorkerRevisionRegistry({
        createPort: async (id, credential) => {
          held = credential;
          const port = createIsomorphicGitRevisionPort({
            filesystem: service.createRootedFileSystem(`/projects/${id}`),
            /* A client with no transport throws on a push, which is what an
             * unreachable remote does; the row below wants a *remote*, not a
             * working one. */
            ...(options.remoteUrl === undefined ? {} : { http: createRevisionHttpClient() }),
          });
          if (options.remoteUrl !== undefined) {
            await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
            await port.setRemote({ name: 'tau', url: options.remoteUrl });
          }
          return port;
        },
        filesystem: (root) => service.createRootedFileSystem(root),
        observe: () => () => undefined,
        authorityEpoch: 'epoch-w3d-a2',
      });
      const worker = {
        postMessage: (message: { type: string; projectId: string; port: MessagePort }) => {
          if (message.type === 'revisionsConnect') {
            registry.connect(message.port, message.projectId);
          }
        },
      } as unknown as Worker;
      return { worker, registry };
    },
    read: async (path: string) => service.createRootedFileSystem(`/projects/${projectId}`).readFile(path, 'utf8'),
    credential: () => held?.(),
    root: async (registry) => {
      const open = registry.roots().get(projectId);
      if (open === undefined) {
        throw new Error('no root is open');
      }
      return open;
    },
    dispose: () => {
      service.dispose();
      eventBus.dispose();
      provider.dispose();
    },
  };
};

const live: Array<{ dispose: () => void }> = [];

afterEach(async () => {
  visibility = 'visible';
  revisionClientTestApi.reset();
  for (const entry of live.splice(0)) {
    entry.dispose();
  }
});

function Consumer(): React.JSX.Element {
  useRevisionClient();
  return <div data-testid='consumer' />;
}

/* The same client, plus the verbs a panel calls, for a row that drives one. */
let commands: ReturnType<typeof useRevisionCommands> | undefined;
let client: ReturnType<typeof useRevisionClient>;

function CommandConsumer(): React.JSX.Element {
  client = useRevisionClient();
  commands = useRevisionCommands();
  return <div data-testid='commands' />;
}

const mount = (): ReturnType<typeof render> =>
  render(
    <UnloadProvider>
      <Consumer />
    </UnloadProvider>,
  );

describe('the page client of the worker revision root', () => {
  it('should stop the root when the project route unmounts', async () => {
    const fixture = harness();
    live.push(fixture);
    const { worker, registry } = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker });

    const view = mount();
    await settle();
    const root = await fixture.root(registry);
    expect(root.inspect().status).toBe('active');

    view.unmount();
    await settle();

    expect(root.inspect()).toMatchObject({ status: 'stopped', children: [] });
    expect(registry.openProjectIds()).toEqual([]);
  });

  it('should keep the root alive when the document is hidden, and stop it at pagehide (W13 P32)', async () => {
    const fixture = harness();
    live.push(fixture);
    const { worker, registry } = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker });

    mount();
    await settle();
    const first = await fixture.root(registry);

    setVisibility('hidden');
    await settle();

    /*
     * `hidden` is the real close, and everything the revision it asks for is
     * *for* happens after it: the cut, the mint, the push, the queue write. The
     * port used to be given back on the same tick, which stopped the tree
     * mid-cut — so the flush recorded nothing, pushed nothing and queued nothing
     * (W13 review 2 R2). The tab coming back is the same root, not a new one.
     */
    expect(first.inspect().status).toBe('active');

    setVisibility('visible');
    await settle();
    expect(await fixture.root(registry)).toBe(first);

    globalThis.dispatchEvent(new Event('pagehide'));
    await settle();

    expect(first.inspect().status).toBe('stopped');
    expect(registry.openProjectIds()).toEqual([]);
  });

  it('should push what `hidden` minted, and record it when the remote cannot be reached (W13 P32/P33)', async () => {
    const fixture = harness({
      /* Nothing listens here: a remote that exists and cannot be reached is the
       * offline close AC21 names. */
      remoteUrl: 'http://127.0.0.1:1/project.git',
      files: { 'bracket.scad': 'cube([1, 1, 1]);\n' },
    });
    live.push(fixture);
    const { worker, registry } = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker });

    mount();
    await settle(40);

    setVisibility('hidden');
    await settle(40);

    /*
     * The whole of the close flush, as the page composes it: the cut is taken,
     * the revision is minted, the scheduler pushes it, the push cannot reach
     * anything, and what is owed is on disk for the next open (D28, AC21). Not
     * one of those steps survived the port being given back at `hidden`.
     */
    await waitFor(
      async () => {
        const stored: unknown = JSON.parse(await fixture.read('.tau/revisions/sync-pending'));
        expect((stored as { entries: ReadonlyArray<{ ref: string }> }).entries.map((entry) => entry.ref)).toEqual([
          'refs/heads/main',
        ]);
      },
      { timeout: 10_000 },
    );

    /* And the row the person reads, live: `Not backed up · 1`. */
    const root = await fixture.root(registry);
    expect(root.status().sync).toMatchObject({ state: 'queued', pendingCount: 1 });
  }, 30_000);

  it('should reopen on the worker the file-manager replaced it with', async () => {
    const fixture = harness();
    live.push(fixture);
    const first = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker: first.worker });

    mount();
    await settle();
    const firstRoot = await fixture.root(first.registry);

    /* A workspace reconnect terminates the worker and creates another. A client
     * that kept the old channel would post into a dead port for the life of the
     * document: every command dropped, the projection frozen. */
    const second = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker: second.worker });
    await settle();

    await waitFor(async () => {
      const secondRoot = await fixture.root(second.registry);
      expect(secondRoot.inspect().status).toBe('active');
    });
    expect(firstRoot.inspect().status).toBe('stopped');
    expect(first.registry.openProjectIds()).toEqual([]);
  });

  /**
   * *Publish* borrows the API origin; it must not revoke the project's remote.
   *
   * The credential frame is W12's *whole* credential, so one carrying only
   * `apiBaseUrl` is how *Disconnect* clears what GitHub minted — and Publish
   * sent exactly that frame before its own command, signing the project out of
   * the remote it was connected to on every publish (review R4).
   */
  it('should keep the connected remote credential when the project publishes (review R4)', async () => {
    const fixture = harness();
    live.push(fixture);
    const { worker } = fixture.worker();
    fileManagerRef.send({ type: 'worker', worker });

    render(
      <UnloadProvider>
        <CommandConsumer />
      </UnloadProvider>,
    );
    await settle();

    client?.remoteCredential({
      apiBaseUrl: 'https://api.tau.test',
      origin: 'https://github.com',
      authorization: 'Bearer gho_kept',
    });
    await settle();
    commands?.publishProject('v1');
    await settle();

    expect(fixture.credential()).toMatchObject({
      origin: 'https://github.com',
      authorization: 'Bearer gho_kept',
    });
  }, 30_000);
});

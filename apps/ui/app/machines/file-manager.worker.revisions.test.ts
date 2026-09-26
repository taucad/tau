/**
 * The browser's revision root, composed exactly as the worker composes it
 * (blueprint S48, jsdom set 1–4 as far as the worker root reaches).
 *
 * These cases drive the real `projectRevisionsMachine` tree over a real
 * `isomorphic-git` port on a real `WorkspaceFileService` mount — the only
 * fake is the `MessagePort` pair, which jsdom supplies. What they hold:
 * one root per opened project, stopped when its last port closes with no
 * child left running; the `RevisionStatus` projection reaching the page once
 * per settled change; restore driven through the port's commands; and the
 * change seam raising one `changed` per content-change event whatever its
 * path count (F9).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import { admissionMilliseconds } from '@taucad/revisions/revision-effects';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import {
  createCheckoutRoutes,
  createRemoteAttention,
  createWorkerRevisionRegistry,
} from '#machines/file-manager.worker.revisions.js';
import type {
  WorkerProjectRevisions,
  WorkerRevisionRequest,
  WorkerRevisionResponse,
} from '#machines/file-manager.worker.revisions.js';

type Harness = {
  readonly service: WorkspaceFileService;
  readonly registry: ReturnType<typeof createWorkerRevisionRegistry>;
  /** A content change under the project's live route. */
  readonly announce: (projectId: string, paths: readonly string[]) => void;
  /** A content change under any checkout route, live or linked. */
  readonly announceAt: (root: string, paths: readonly string[]) => void;
  readonly open: (projectId: string) => Promise<Client>;
  readonly root: (projectId: string) => Promise<WorkerProjectRevisions>;
  readonly dispose: () => void;
};

type Client = {
  readonly port: MessagePort;
  readonly frames: WorkerRevisionResponse[];
  readonly send: (request: WorkerRevisionRequest) => void;
  readonly admit: (input: { turnId: string; chatId: string; runId: string }) => Promise<WorkerRevisionResponse>;
  readonly settle: () => Promise<void>;
};

const live: Harness[] = [];

afterEach(() => {
  for (const entry of live.splice(0)) {
    entry.dispose();
  }
});

/** Let every queued microtask and port message drain. */
const settle = async (turns = 12): Promise<void> => {
  for (let index = 0; index < turns; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- draining is sequential by definition.
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
};

type RevisionPort = ReturnType<typeof createIsomorphicGitRevisionPort>;

const harness = (
  projectIds: readonly string[],
  /* Wraps each project's port, so a row can hold one of its calls. */
  wrapPort: (port: RevisionPort) => RevisionPort = (port) => port,
): Harness => {
  const providers = projectIds.map(() => new MemoryProvider());
  const mountTable = new MountTable();
  const eventBus = new ChangeEventBus();
  const resourceQueue = new ResourceQueue();
  for (const [index, projectId] of projectIds.entries()) {
    mountTable.mount(`/projects/${projectId}`, providers[index]!, {
      class: 'authored',
      backend: 'memory',
      storageRootKey: `memory:w3d-${projectId}`,
    });
  }
  const service = new WorkspaceFileService({
    providerRegistry: new ProviderRegistry(),
    resourceQueue,
    eventBus,
    mountTable,
  });
  const checkoutRoutes = createCheckoutRoutes({ mountTable, fileService: service });
  const observers = new Map<string, (paths: readonly string[]) => void>();
  const registry = createWorkerRevisionRegistry({
    createPort: (projectId) =>
      wrapPort(
        createIsomorphicGitRevisionPort({
          filesystem: service.createRootedFileSystem(`/projects/${projectId}`),
          /* Exactly what `file-manager.worker.ts` gives the real port, so a branch
           * created here is created the way the browser creates one (P24). */
          checkouts: checkoutRoutes(projectId),
        }),
      ),
    filesystem: (root) => service.createRootedFileSystem(root),
    observe: (root, onChanged) => {
      observers.set(root, onChanged);
      return () => observers.delete(root);
    },
    authorityEpoch: 'epoch-w3d',
  });
  const entry: Harness = {
    service,
    registry,
    root: async (projectId) => {
      const open = registry.roots().get(projectId);
      if (open === undefined) {
        throw new Error(`No root is open for ${projectId}`);
      }
      return open;
    },
    announce: (projectId, paths) => observers.get(`/projects/${projectId}`)?.(paths),
    announceAt: (root, paths) => observers.get(root)?.(paths),
    open: async (projectId) => {
      const channel = new MessageChannel();
      registry.connect(channel.port1, projectId);
      const frames: WorkerRevisionResponse[] = [];
      let nextId = 0;
      channel.port2.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionResponse>) => {
        frames.push(data);
      });
      channel.port2.start();
      const client: Client = {
        port: channel.port2,
        frames,
        send: (request) => {
          channel.port2.postMessage(request);
        },
        admit: async (input) => {
          nextId += 1;
          const id = nextId;
          channel.port2.postMessage({ command: 'admitTurn', id, ...input } satisfies WorkerRevisionRequest);
          for (let attempt = 0; attempt < 60; attempt += 1) {
            // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
            await settle(4);
            const answer = frames.find(
              (frame) => (frame.type === 'result' || frame.type === 'error') && frame.id === id,
            );
            if (answer !== undefined) {
              return answer;
            }
          }
          throw new Error(`admitTurn ${id} was never answered`);
        },
        settle: async () => settle(),
      };
      await settle();
      return client;
    },
    dispose: () => {
      service.dispose();
      eventBus.dispose();
      for (const provider of providers) {
        provider.dispose();
      }
    },
  };
  live.push(entry);
  return entry;
};

/*
 * Wait for a turn's own settlement, never a fixed count of event-loop turns.
 *
 * The turn's mint hashes through the real store, so how many turns it takes
 * is a property of the machine's load: under the full suite, `settle(20)` read
 * the head before the turn's revision existed (W2c a1b).
 */
const turnFinalized = async (client: Client, turnId: string): Promise<void> =>
  vi.waitFor(
    () => {
      expect(
        client.frames.some(
          (frame) => frame.type === 'event' && frame.event.type === 'turn.finalized' && frame.event.turnId === turnId,
        ),
      ).toBe(true);
    },
    { timeout: 10_000 },
  );

/** Make a branch through the port and wait for the checkout the registry made for it. */
const branchOff = async (
  client: Client,
  root: WorkerProjectRevisions,
  name: string,
): Promise<Readonly<{ checkoutId: string; checkoutRoot: string }>> => {
  client.send({ command: 'createBranch', name, id: 900 });
  for (
    let attempt = 0;
    attempt < 40 && !client.frames.some((frame) => 'id' in frame && frame.id === 900);
    attempt += 1
  ) {
    // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
    await client.settle();
  }
  const row = root.status().branches.find((branch) => branch.name === name);
  if (row?.checkoutId === undefined || row.checkoutRoot === undefined) {
    throw new Error(`${name} has no checkout`);
  }
  return { checkoutId: row.checkoutId, checkoutRoot: row.checkoutRoot };
};

describe('the file-manager worker revision root (north star S48 jsdom 1–4)', () => {
  it('should start one root per opened project and stop its actor when the last port closes', async () => {
    const fixture = harness(['alpha', 'beta']);
    const alpha = await fixture.open('alpha');
    const beta = await fixture.open('beta');
    const alphaRoot = await fixture.root('alpha');
    const betaRoot = await fixture.root('beta');

    expect([...fixture.registry.openProjectIds()].sort()).toEqual(['alpha', 'beta']);
    expect(alphaRoot.inspect().status).toBe('active');

    /* A second page on the same project holds the root open: the last port is
     * what stops it, not the first. */
    const second = await fixture.open('alpha');
    alpha.send({ command: 'close' });
    await settle();

    expect(alphaRoot.inspect().status).toBe('active');

    second.send({ command: 'close' });
    /* The release records a close cut through the real store first, so it is
     * waited on, not counted in event-loop turns (W2c a1b). */
    await vi.waitFor(() => {
      expect(alphaRoot.inspect()).toMatchObject({ status: 'stopped', children: [] });
    });

    /* The actor itself, not the registry's bookkeeping: a released root has
     * stopped and has no child left running. */
    expect(alphaRoot.inspect()).toMatchObject({ status: 'stopped', children: [] });
    expect(betaRoot.inspect().status).toBe('active');
    expect(fixture.registry.openProjectIds()).toEqual(['beta']);

    beta.send({ command: 'close' });
    await vi.waitFor(() => {
      expect(betaRoot.inspect()).toMatchObject({ status: 'stopped', children: [] });
    });
    expect(fixture.registry.openProjectIds()).toEqual([]);
  });

  it('should serve the projection to a port the moment it connects', async () => {
    const fixture = harness(['alpha']);
    const alpha = await fixture.open('alpha');

    const statuses = alpha.frames.filter((frame) => frame.type === 'status');
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toMatchObject({ type: 'status', status: { projectId: 'alpha', follow: 'chat' } });
  });

  it('should publish a projection frame only when the projection itself moves', async () => {
    const fixture = harness(['alpha']);
    const alpha = await fixture.open('alpha');
    const before = alpha.frames.filter((frame) => frame.type === 'status').length;

    /* Two announcements of the same content change: the tree transitions, but
     * the projection's own fields do not, so the page is told once at most. */
    fixture.announce('alpha', ['main.scad']);
    await settle();
    const afterFirst = alpha.frames.filter((frame) => frame.type === 'status').length;
    fixture.announce('alpha', ['main.scad']);
    await settle();
    const afterSecond = alpha.frames.filter((frame) => frame.type === 'status').length;

    /* Exactly one, not "at most one": the first announcement flips `dirty`, so
     * a projection that never moved at all would be the same bug in reverse. */
    expect(afterFirst - before).toBe(1);
    expect(afterSecond).toBe(afterFirst);
  });

  it('should place two chats on one checkout with no branch created (AC9)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    const first = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    const second = await alpha.admit({ turnId: 'turn-2', chatId: 'chat-2', runId: 'run-2' });

    expect(first.type).toBe('result');
    expect(second.type).toBe('result');
    if (
      first.type !== 'result' ||
      second.type !== 'result' ||
      first.result.kind !== 'placement' ||
      second.result.kind !== 'placement'
    ) {
      throw new Error('both turns must be placed');
    }
    expect(first.result.placement.checkoutId).toBe(second.result.placement.checkoutId);
    expect(first.result.placement.root).toBe('/projects/alpha');

    const branches = await project.readdir('.git/refs/heads');
    expect(branches).toEqual(['main']);

    const leases = await project.readdir('.tau/runs');
    expect([...leases].sort()).toEqual(['run-1.json', 'run-2.json']);
  });

  it('should give a branch its own checkout, route and files (AC22)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    /* A recorded revision first: a branch of an unborn line has no tree to
     * materialize, which is the port's own refusal, not this seam's. */
    alpha.send({ command: 'saveRevision' });
    await alpha.settle();

    alpha.send({ command: 'createBranch', name: 'bracket-fillet' });
    const root = await fixture.root('alpha');
    for (let attempt = 0; attempt < 40 && root.status().branches.length < 2; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the registry's own answer.
      await alpha.settle();
    }

    const status = root.status();
    const created = status.branches.find((row) => row.name === 'bracket-fillet');
    expect(created).toBeDefined();
    expect(created?.checkoutRoot).toBe(`/checkouts/${created?.checkoutId ?? ''}`);

    /* The route is real on both sides of it: the checkout reads its own copy of
     * the tree, and the bytes are beside the project in the space discovery
     * never scans (D4). */
    const checkout = fixture.service.createRootedFileSystem(created?.checkoutRoot ?? '');
    expect(await checkout.readFile('main.scad', 'utf8')).toBe('cube(10);');
    expect(await project.exists(`.tau/checkouts/alpha/${created?.checkoutId ?? ''}/main.scad`)).toBe(true);
  });

  /* The composer's *New branch* is the only always-reachable way out of a fresh
   * project (W7 review R1), and a fresh project has no revision: the branch has
   * to start from the files as they stand, not be refused for lacking a base. */
  it('should give a branch its own checkout on a project that has no revision yet', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    alpha.send({ command: 'createBranch', name: 'isolated-run' });
    const root = await fixture.root('alpha');
    for (let attempt = 0; attempt < 40 && root.status().branches.length < 2; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the registry's own answer.
      await alpha.settle();
    }

    expect(alpha.frames.filter((frame) => frame.type === 'error')).toEqual([]);
    const created = root.status().branches.find((row) => row.name === 'isolated-run');
    expect(created?.checkoutId).toBeDefined();
    const checkout = fixture.service.createRootedFileSystem(created?.checkoutRoot ?? '');
    expect(await checkout.readFile('main.scad', 'utf8')).toBe('cube(10);');
  });

  /* The same rule where the project *has* a head: P3 says a branch starts from
   * what the person sees, so the edits on screen are recorded first and the
   * branch carries them — not the head they were made on top of. */
  it('should carry unrecorded edits into a branch made from a checkout that has a head', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    alpha.send({ command: 'saveRevision' });
    await alpha.settle();
    const root = await fixture.root('alpha');
    const recorded = root.status().headRevisionId;

    await project.writeFile('main.scad', 'cube(20);');
    fixture.announce('alpha', ['main.scad']);
    await alpha.settle();

    alpha.send({ command: 'createBranch', name: 'isolated-run' });
    for (let attempt = 0; attempt < 40 && root.status().branches.length < 2; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the registry's own answer.
      await alpha.settle();
    }

    const created = root.status().branches.find((row) => row.name === 'isolated-run');
    const checkout = fixture.service.createRootedFileSystem(created?.checkoutRoot ?? '');
    expect(await checkout.readFile('main.scad', 'utf8')).toBe('cube(20);');
    /* The live checkout moved too: the edits are in a revision on it now. */
    expect(root.status().headRevisionId).not.toBe(recorded);
  });

  it('should answer a createBranch with the checkout it made once the branch exists', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    alpha.send({ command: 'createBranch', name: 'isolated-run', id: 91 });
    const root = await fixture.root('alpha');
    for (
      let attempt = 0;
      attempt < 40 && !alpha.frames.some((frame) => 'id' in frame && frame.id === 91);
      attempt += 1
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
      await alpha.settle();
    }

    const created = root.status().branches.find((row) => row.name === 'isolated-run');
    expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 91)).toEqual({
      type: 'result',
      id: 91,
      result: {
        kind: 'branch',
        branch: 'isolated-run',
        checkoutId: created?.checkoutId,
        checkoutRoot: created?.checkoutRoot,
      },
    });
  });

  it('should answer a refused createBranch with its code', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    alpha.send({ command: 'saveRevision' });
    await alpha.settle();

    /* `main` already has a checkout, which the registry refuses before any port
     * call — the refusal a person sees most often. */
    alpha.send({ command: 'createBranch', name: 'main', id: 92 });
    for (
      let attempt = 0;
      attempt < 40 && !alpha.frames.some((frame) => 'id' in frame && frame.id === 92);
      attempt += 1
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
      await alpha.settle();
    }

    /* The commonest refusal there is; without its code the page falls back to
       "Tau could not finish that branch change" (review finding 3). */
    expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 92)).toMatchObject({
      type: 'error',
      id: 92,
      code: 'CHECKOUT_CONFLICT',
      message: 'That branch already has a checkout.',
    });
  });

  /*
   * The `branch` child takes `create` in `idle` only, so a second one while the
   * first is in flight is dropped — and the correlated wait had no bound, so
   * the chat's send path waited on a promise nothing would ever settle (review
   * finding 1).
   */
  it('should refuse a createBranch the tree never answers, on the bound', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fixture = harness(['alpha']);
      await fixture.service.createRootedFileSystem('/projects/alpha').writeFile('main.scad', 'cube(10);');
      const alpha = await fixture.open('alpha');

      alpha.send({ command: 'createBranch', name: 'main' });
      alpha.send({ command: 'createBranch', name: 'isolated-run', id: 93 });
      await settle(20);
      await vi.advanceTimersByTimeAsync(60_000);
      await settle(8);

      expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 93)).toMatchObject({
        type: 'error',
        id: 93,
        code: 'BRANCH_UNANSWERED',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not attribute another verb’s refusal to a pending createBranch', async () => {
    /* The dropped verb's own bound is a real 60 s timer, and a case that left
       it pending kept this suite's teardown waiting on it. */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      /* The first verb's cut finds its checkout through `listCheckouts`; held
         there, it is still running when the second arrives, however fast the
         capture behind it is. */
      let hold: Promise<void> | undefined;
      let held = 0;
      const fixture = harness(['alpha'], (port) => ({
        ...port,
        listCheckouts: async () => {
          if (hold !== undefined) {
            held += 1;
            await hold;
          }
          return port.listCheckouts!();
        },
      }));
      const project = fixture.service.createRootedFileSystem('/projects/alpha');
      await project.writeFile('main.scad', 'cube(10);');
      const alpha = await fixture.open('alpha');
      alpha.send({ command: 'saveRevision' });
      await alpha.settle();

      /* `main` is refused; `isolated-run` is dropped while that one runs. The
         refusal the person sees belongs to the branch they already have. */
      const gate = Promise.withResolvers<void>();
      hold = gate.promise;
      alpha.send({ command: 'createBranch', name: 'main' });
      alpha.send({ command: 'createBranch', name: 'isolated-run', id: 94 });
      await settle(40);

      expect(held).toBeGreaterThan(0);
      expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 94)).toBeUndefined();
      hold = undefined;
      gate.resolve();
      /* And the drop is still what the bound answers, once it comes due. */
      await vi.advanceTimersByTimeAsync(60_000);
      await settle(8);
      expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 94)).toMatchObject({
        type: 'error',
        code: 'BRANCH_UNANSWERED',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should adopt a daemon revision into the worker projection', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    alpha.send({
      command: 'adoptHostFinalized',
      checkoutId: 'live',
      revisionId: 'rev-daemon',
      treeId: 'tree-daemon',
      branch: 'main',
    });
    await alpha.settle();

    const root = await fixture.root('alpha');
    expect(root.status()).toMatchObject({
      checkoutId: 'live',
      headRevisionId: 'rev-daemon',
      line: { kind: 'branch', name: 'main' },
    });
  });

  it('should restore a recorded revision through the port commands', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    /* One settled turn, so the checkout has a head to come back to. */
    const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    expect(placed.type).toBe('result');
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');

    const head = alpha.frames.findLast((frame) => frame.type === 'status')?.status.headRevisionId;
    expect(head).toBeDefined();
    expect(await project.readFile('main.scad', 'utf8')).toBe('cube(20);');

    /* A restore to that head from a dirty tree mints the unsaved work first,
     * then the restore, both on `main` (D1): nothing is discarded, nothing
     * detaches, and the dirty bytes are one row back. */
    await project.writeFile('main.scad', 'cube(30);');
    const root = await fixture.root('alpha');
    const before = await root.log();
    alpha.send({ command: 'restore', revisionId: head! });
    /* Two cuts and a plan through a real store: the default 1 s bound flaked under load. */
    await vi.waitFor(
      async () => {
        const rows = await root.log();
        expect(rows).toHaveLength(before.length + 2);
      },
      { timeout: 10_000 },
    );

    expect(await project.readFile('main.scad', 'utf8')).toBe('cube(20);');
    const after = await root.log();
    expect(after).toHaveLength(before.length + 2);
    expect(after[0]?.summary).toMatch(/^Restored Rev \d+$/u);
    expect(after[1]?.summary).toBe('Saved changes (restore)');
    expect(after.slice(0, 2).map((row) => row.trigger)).toEqual(['restore', 'restore']);
    expect(after[0]?.source).toBe('restore');
    expect(after[1]?.source).toBe('user');
    await settle(10);
    expect(root.status()).toMatchObject({
      line: { kind: 'branch', name: 'main' },
      headRevisionId: after[0]?.revisionId,
    });
  });

  /*
   * D3: a save that loses its compare-and-swap is answered at once and out loud.
   *
   * Another writer moved `main` under this checkout. The cut's candidate loses
   * the race; the answer used to reach nothing above the package, so the page
   * waited out the whole bound and said nothing — and the next save rewound
   * the line. Now the request settles on the loss and the toast says so.
   */
  it('should answer a save that lost its compare-and-swap at once, with a toast (D3)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    const answered = async (id: number): Promise<WorkerRevisionResponse | undefined> => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
        await settle(4);
        const answer = alpha.frames.find(
          (frame) => (frame.type === 'result' || frame.type === 'error') && frame.id === id,
        );
        if (answer !== undefined) {
          return answer;
        }
      }
      return undefined;
    };
    alpha.send({ command: 'saveRevision', id: 1, trigger: 'save' });
    await answered(1);
    await project.writeFile('main.scad', 'cube(20);');
    fixture.announce('alpha', ['main.scad']);
    alpha.send({ command: 'saveRevision', id: 2, trigger: 'save' });
    await answered(2);
    const root = await fixture.root('alpha');
    const [second, first] = await root.log();
    expect(first).toBeDefined();

    /* Another writer on the same store moves the line. */
    const other = createIsomorphicGitRevisionPort({
      filesystem: fixture.service.createRootedFileSystem('/projects/alpha'),
    });
    await other.updateRef({
      name: 'main',
      expectedHead: revisionId(second!.revisionId),
      head: revisionId(first!.revisionId),
    });
    await project.writeFile('main.scad', 'cube(30);');
    fixture.announce('alpha', ['main.scad']);
    alpha.send({ command: 'saveRevision', id: 3, trigger: 'save' });

    expect(await answered(3)).toEqual({ type: 'result', id: 3, result: { kind: 'saved' } });
    expect(alpha.frames).toContainEqual({
      type: 'toast',
      toast: {
        type: 'error',
        subject: 'save',
        message: 'Something else changed this project first. Try again.',
        code: 'CAS_LOST',
      },
    });

    /* N6: a cut nobody asked for heals itself in the next idle window, so its loss is quiet. */
    await settle(10);
    const [head] = await root.log();
    /* Moved again, to a revision this checkout does not believe is the head. */
    const elsewhere = head!.revisionId === first!.revisionId ? second! : first!;
    await other.updateRef({
      name: 'main',
      expectedHead: revisionId(head!.revisionId),
      head: revisionId(elsewhere.revisionId),
    });
    await project.writeFile('main.scad', 'cube(40);');
    fixture.announce('alpha', ['main.scad']);
    const toastsBefore = alpha.frames.filter((frame) => frame.type === 'toast').length;
    alpha.send({ command: 'saveRevision', id: 4, trigger: 'hidden' });

    expect(await answered(4)).toMatchObject({ id: 4 });
    /* The hidden cut lost its race rather than minting, and nothing was said. */
    const [latest] = await root.log();
    expect(latest?.revisionId).toBe(elsewhere.revisionId);
    expect(alpha.frames.filter((frame) => frame.type === 'toast')).toHaveLength(toastsBefore);
  });

  /* W7: S38's second half — the comparison whose right-hand side is the working
   * copy rather than another revision. */
  it('should answer an editor conflict with the line it was recorded on (D14)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    alpha.send({ command: 'setDeviceId', deviceId: 'tab:one' });
    alpha.send({ command: 'saveRevision', id: 1, trigger: 'save' });
    await vi.waitFor(() => {
      expect(alpha.frames.some((frame) => 'id' in frame && frame.id === 1)).toBe(true);
    });
    await project.writeFile('main.scad', 'cube(30);');
    fixture.announce('alpha', ['main.scad']);
    alpha.send({ command: 'saveRevision', id: 2, trigger: 'save' });
    await vi.waitFor(() => {
      expect(alpha.frames.some((frame) => 'id' in frame && frame.id === 2)).toBe(true);
    });

    alpha.send({ command: 'recordEditorConflict', id: 3, path: 'main.scad', base: 'cube(10);', mine: 'cube(20);' });

    /* Named by this host's record device, never the tab's device id (R1, EQ10(a)). */
    const line: unknown = expect.stringMatching(/^conflicts\/main\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u);
    await vi.waitFor(
      () => {
        expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 3)).toMatchObject({
          type: 'result',
          result: {
            kind: 'editorConflict',
            outcome: { status: 'recorded', line, into: 'main' },
          },
        });
      },
      { timeout: 10_000 },
    );
    /* Nothing reaches the files; the card is the one surface. */
    expect(await project.readFile('main.scad', 'utf8')).toBe('cube(30);');
    const root = await fixture.root('alpha');
    await vi.waitFor(() => {
      expect(root.status().conflicts.map((conflict) => conflict.branch)).toEqual([line]);
    });
  });

  it('should compare a recorded revision against the files as they are now (S38)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    expect(placed.type).toBe('result');
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');
    const root = await fixture.root('alpha');
    const head = root.status().headRevisionId;
    expect(head).toBeDefined();
    /* The older revision, named while the checkout's head is a newer one: the
     * comparison reads the revision it is given, never the head (W2c a1b). */
    const [, older] = await root.log();
    expect(await root.compare(older!.revisionId, 'main.scad', { against: 'checkout' })).toEqual({
      original: 'cube(10);',
      modified: 'cube(20);',
    });

    /* An edit that is not in any revision yet: the revision's own first parent
     * cannot answer "what have I changed since this". */
    await project.writeFile('main.scad', 'cube(30);');

    expect(await root.compare(head!, 'main.scad', { against: 'checkout' })).toEqual({
      original: 'cube(20);',
      modified: 'cube(30);',
    });
    /* A file the checkout no longer holds reads as an empty right-hand side,
     * which is exactly "deleted since this revision" — never a thrown read. */
    await project.unlink('main.scad');
    expect(await root.compare(head!, 'main.scad', { against: 'checkout' })).toEqual({
      original: 'cube(20);',
      modified: '',
    });
  });

  /*
   * W6-a2 R1, the browser leg: `visibilitychange: hidden` and `pagehide` fire on
   * every tab switch and every unload, including the middle of a turn. A cut
   * taken there would pass the I5 gate on the agent's own bytes, stamp them
   * `source: 'user'`, and leave the turn's settlement with an unchanged tree and
   * no revision at all (AC9).
   */
  it('should record nothing from a running turn when the tab goes hidden', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    expect(placed.type).toBe('result');

    /* The agent's write, then the person switching tab before it settles. */
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'saveRevision', trigger: 'hidden' });
    await settle(20);

    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');

    const root = await fixture.root('alpha');
    const rows = await root.log();
    expect(rows.map((row) => row.source)).not.toContain('user');
    expect(rows[0]?.turnId).toBe('turn-1');
  });

  /*
   * C16 (contract §6), the worker leg. `saveRevision` used to be fire and
   * forget, so the page's `hidden` registrant had nothing to wait for and
   * `pagehide` could offer a pack before the cut existed. The frame the page
   * waits on has to arrive *after* the revision is in the log, not before.
   */
  it('should answer a saveRevision only once its cut has settled (C16)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await settle(20);
    const root = await fixture.root('alpha');
    const beforeRows = await root.log();
    const before = beforeRows.length;

    await project.writeFile('main.scad', 'cube(20);');
    fixture.announce('alpha', ['main.scad']);
    alpha.send({ command: 'saveRevision', id: 77, trigger: 'close' });

    let answer: WorkerRevisionResponse | undefined;
    let rowsWhenAnswered = before;
    for (let attempt = 0; attempt < 60 && answer === undefined; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
      await settle(4);
      answer = alpha.frames.find((frame) => (frame.type === 'result' || frame.type === 'error') && frame.id === 77);
      if (answer !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- read the log at the instant the frame landed.
        const rowsAtAnswer = await root.log();
        rowsWhenAnswered = rowsAtAnswer.length;
      }
    }

    expect(answer).toEqual({ type: 'result', id: 77, result: { kind: 'saved' } });
    expect(rowsWhenAnswered).toBeGreaterThan(before);
  });

  it('should mint one strictly increasing generation per content-change event (F9, F4)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    await fixture.open('alpha');
    const root = await fixture.root('alpha');
    const checkoutId = root.status().checkoutId!;
    const generation = (): number => root.inspect().writeGenerations[checkoutId] ?? 0;
    const before = generation();

    /* Two paths, one event: the checkout takes `Math.max` of the counter across
     * a mint, so a seam that raised one `changed` per *path* would let a write
     * that landed during the mint disappear behind its own cut. */
    fixture.announce('alpha', ['main.scad', 'part.scad']);
    await settle();
    const afterFirst = generation();
    fixture.announce('alpha', ['main.scad']);
    await settle();

    expect(afterFirst).toBe(before + 1);
    expect(generation()).toBe(before + 2);
  });

  it('should raise a change against the checkout whose route it landed under (L2-F4)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    const root = await fixture.root('alpha');
    const liveId = root.status().checkoutId!;
    const linked = await branchOff(alpha, root, 'side');
    const generation = (checkoutId: string): number => root.inspect().writeGenerations[checkoutId] ?? 0;
    const liveBefore = generation(liveId);
    const linkedBefore = generation(linked.checkoutId);

    fixture.announceAt(linked.checkoutRoot, ['main.scad']);
    await settle();
    fixture.announce('alpha', ['main.scad']);
    await settle();

    expect(generation(linked.checkoutId)).toBe(linkedBefore + 1);
    expect(generation(liveId)).toBe(liveBefore + 1);
  });

  it('should record a dirty linked checkout when the page closes, not only the one it shows (close ruling)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    const root = await fixture.root('alpha');
    const linked = await branchOff(alpha, root, 'side');
    const before = await root.log({ branch: 'side' });
    const linkedFiles = fixture.service.createRootedFileSystem(linked.checkoutRoot);
    await linkedFiles.writeFile('main.scad', 'cube(30);');
    fixture.announceAt(linked.checkoutRoot, ['main.scad']);
    await settle();

    alpha.send({ command: 'saveRevision', id: 78, trigger: 'close' });
    for (
      let attempt = 0;
      attempt < 60 && !alpha.frames.some((frame) => 'id' in frame && frame.id === 78);
      attempt += 1
    ) {
      // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
      await settle(4);
    }

    const after = await root.log({ branch: 'side' });
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]).toMatchObject({ trigger: 'close' });
  });

  it('should hold a completion that lands while its turn is still being placed (W3c 7.2)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    /* The page sends the completion without waiting for its admission — the
     * order a fast turn produces. Dropped, the turn would wait out the cut
     * bound; held behind `leased`, it settles like any other. */
    alpha.send({ command: 'admitTurn', id: 1, turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');

    const answer = alpha.frames.find((frame) => frame.type === 'result' || frame.type === 'error');
    expect(answer?.type).toBe('result');
    /* The lease is retired by the completion the root held, so nothing is left
     * holding the checkout open. */
    await expect(project.readdir('.tau/runs')).resolves.toEqual([]);
  });

  /*
   * T4-02: the admission wait is bounded, the root's queue was not.
   *
   * An edit behind a running turn queues on the turn id that turn holds (V8).
   * When the caller's wait expired it refused only its own promise, so the
   * entry stayed in the root and was raised the moment the running turn
   * retired: a turn spawned, took the checkout's lease, and nothing was left to
   * send it `turnCompleted`. The checkout then read as held for the rest of the
   * session — every manual save on it answered `nothingToSave` and recorded
   * nothing.
   */
  it('should abandon an admission whose wait expired, leaving the checkout free to record a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fixture = harness(['alpha']);
      const project = fixture.service.createRootedFileSystem('/projects/alpha');
      await project.writeFile('main.scad', 'cube(10);');
      const alpha = await fixture.open('alpha');
      const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
      expect(placed.type).toBe('result');

      /* The person edits that same message while the first run is still
       * recording, and gives up waiting before it retires. */
      alpha.send({ command: 'admitTurn', id: 77, turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' });
      await settle(8);
      await vi.advanceTimersByTimeAsync(admissionMilliseconds);
      await settle(8);
      expect(alpha.frames.find((frame) => frame.type === 'error' && frame.id === 77)).toBeDefined();

      alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
      await turnFinalized(alpha, 'turn-1');

      /* The abandoned run never takes a lease, so nothing holds the checkout. */
      await expect(project.readdir('.tau/runs')).resolves.toEqual([]);

      const root = await fixture.root('alpha');
      const before = await root.log();
      await project.writeFile('main.scad', 'cube(30);');
      alpha.send({ command: 'saveRevision', trigger: 'save' });
      await settle(40);
      const after = await root.log();

      expect(after.length).toBe(before.length + 1);
      expect(after[0]?.source).toBe('user');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should register the project on Tau Cloud before it asks the remote for anything (P54, W18 DEF-1)', async () => {
    const fixture = harness(['alpha']);
    await fixture.service
      .createRootedFileSystem('/projects/alpha')
      .writeFile('tau.json', JSON.stringify({ name: 'Alpha project' }));
    const alpha = await fixture.open('alpha');
    const requests: Array<{
      method: string;
      url: string;
      credentials: string | undefined;
      body: BodyInit | undefined;
    }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        method: init?.method ?? 'GET',
        url: input instanceof Request ? input.url : input.toString(),
        credentials: init?.credentials,
        body: init?.body ?? undefined,
      });
      /* The registration answers; whatever the advertisement then does is the
       * remote's business, not this pin's. */
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;

    try {
      /* The origin reaches the worker the way the page sends it (I8). */
      alpha.send({ command: 'remoteCredential', apiBaseUrl: 'https://api.test' });
      alpha.send({ command: 'connectRemote', kind: 'tau' });
      await alpha.settle();

      /* First, and only once: a retried *Connect* is one request because the
       * API's insert is `onConflictDoNothing` (P51). */
      expect(requests[0]).toEqual({
        method: 'PUT',
        url: 'https://api.test/v1/projects/alpha',
        credentials: 'include',
        body: JSON.stringify({ name: 'Alpha project' }),
      });
      /* Before the initial sync: an advertisement asked first answers 404,
       * because nothing has written the row the git server authorizes against. */
      const advertisement = requests.findIndex((request) => request.url.includes('/v1/git/alpha.git'));
      expect(advertisement === -1 || advertisement > 0).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  /* W4c: History holds one page, so an older row, a turn's card and ahead/behind are asked of the port by id. */
  it('should answer one older revision by id and how far two heads have gone apart', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');
    const root = await fixture.root('alpha');
    const [head, older] = await root.log();

    alpha.send({ command: 'log', id: 31, from: older!.revisionId, limit: 1 });
    alpha.send({ command: 'divergence', id: 32, head: head!.revisionId, base: older!.revisionId });
    await vi.waitFor(() => {
      expect(alpha.frames.filter((frame) => frame.type === 'result' && frame.id >= 31)).toHaveLength(2);
    });

    expect(alpha.frames.find((frame) => frame.type === 'result' && frame.id === 31)).toMatchObject({
      result: {
        kind: 'log',
        rows: [{ revisionId: older!.revisionId, revisionNumber: older!.revisionNumber, treeId: older!.treeId }],
      },
    });
    expect(alpha.frames.find((frame) => frame.type === 'result' && frame.id === 32)).toMatchObject({
      result: { kind: 'divergence', divergence: { ahead: 1, behind: 0 } },
    });
  });

  /* W1b: a History row's Publish names the revision it was opened on, not the head. */
  it('should name the revision a Publish was opened on, not the branch head', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await turnFinalized(alpha, 'turn-1');
    const root = await fixture.root('alpha');
    const [, older] = await root.log();
    const original = globalThis.fetch;
    /* No cloud here: the push is refused, after the name is already on the revision. */
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof globalThis.fetch;

    try {
      alpha.send({
        command: 'publishProject',
        tag: 'v1',
        revisionId: older!.revisionId,
        apiBaseUrl: 'https://api.test',
      });
      alpha.send({
        command: 'confirmPublish',
        draft: { tag: 'v1', projectName: 'alpha', entryPath: 'main.scad', visibility: 'public', title: 'Alpha' },
      });
      await vi.waitFor(
        async () => {
          const rows = await root.log();
          expect(rows.map((row) => row.tags)).toEqual([[], ['v1']]);
        },
        { timeout: 10_000 },
      );
    } finally {
      globalThis.fetch = original;
    }
  }, 20_000);

  it('should answer an admission whose turn ended before its lease, with the turn’s own reason (W19-b)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    /*
     * Only `prepare` used to refuse an admission, so a turn that ended any
     * other way before its lease — a base cut the checkout could not settle
     * (the browser's `Buffer is not defined`), a lease it could not write, or
     * this abandonment — left the caller waiting out the whole 30 s bound and
     * then hearing "it was never leased", which names nothing (I12).
     */
    const placed = new Promise<WorkerRevisionResponse>((resolve) => {
      alpha.port.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionResponse>) => {
        if ((data.type === 'result' || data.type === 'error') && data.id === 99) {
          resolve(data);
        }
      });
    });
    alpha.send({ command: 'admitTurn', id: 99, turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    alpha.send({ command: 'turnAbandoned', turnId: 'turn-1' });

    const answer = await placed;
    expect(answer.type).toBe('error');
    if (answer.type !== 'error') {
      throw new Error('the admission must be refused, not placed');
    }
    expect(answer.code).toBe('REVISION_PREPARE_FAILED');
    expect(answer.message).toBe(
      'This project could not open a revision for the turn: The turn ended before it recorded a revision.',
    );
  });
});

/*
 * RV-W5b2 N4: the wiring, not the gate alone. The registry's `focus` frame
 * reaches the project's attention and the real stream opens exactly once; a
 * project reopened on a new port streams again once the page re-sends focus
 * (the client does, per port).
 */
describe('the focus frame through the worker registry (RV-W5b2 N4)', () => {
  it('opens exactly one long poll for a focused project, and again after a reconnect re-sends focus', async () => {
    const fixture = harness(['alpha']);
    const files = fixture.service.createRootedFileSystem('/projects/alpha');
    await files.writeFile('tau.json', JSON.stringify({ name: 'Alpha project' }));
    /* A project already connected to Tau Cloud: its store names the `tau` remote. */
    const first = await fixture.open('alpha');
    first.send({ command: 'close', id: 1 });
    await first.settle();
    await createIsomorphicGitRevisionPort({ filesystem: files }).setRemote({
      name: 'tau',
      url: 'https://api.test/v1/git/alpha.git',
    });
    const polls = new Set<number>();
    let pollCount = 0;
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (!url.pathname.startsWith('/v1/streams/')) {
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.searchParams.get('longPollDuration') === '0') {
        return new Response(JSON.stringify({ nextSequence: 0, events: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      pollCount += 1;
      const id = pollCount;
      polls.add(id);
      /* A long poll the server holds until the reader lets go. */
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          polls.delete(id);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    try {
      const alpha = await fixture.open('alpha');
      alpha.send({ command: 'remoteCredential', apiBaseUrl: 'https://api.test' });
      await alpha.settle();
      expect(polls.size, 'an unfocused project holds no long poll').toBe(0);

      alpha.send({ command: 'focus', focused: true });
      await vi.waitFor(
        () => {
          expect(polls.size).toBe(1);
        },
        { timeout: 10_000 },
      );
      alpha.send({ command: 'focus', focused: true });
      await alpha.settle();
      expect(pollCount, 'one stream, not one per frame').toBe(1);

      alpha.send({ command: 'close', id: 7 });
      await vi.waitFor(
        () => {
          expect(polls.size, 'closing the project closes its stream').toBe(0);
        },
        { timeout: 10_000 },
      );

      const reopened = await fixture.open('alpha');
      reopened.send({ command: 'remoteCredential', apiBaseUrl: 'https://api.test' });
      reopened.send({ command: 'focus', focused: true });
      await vi.waitFor(
        () => {
          expect(polls.size).toBe(1);
        },
        { timeout: 10_000 },
      );
      expect(pollCount).toBe(2);
    } finally {
      globalThis.fetch = original;
    }
  });
});

/*
 * RV-W5b F12: up to eight live projects on one HTTP/1.1 origin would each hold
 * a 25 s long poll, past the six sockets a browser gives a host. Only the
 * focused project streams; a project that gains focus pulls once its stream's
 * tail is read, and the one that loses it closes its stream.
 */
describe('the revision long poll follows focus (RV-W5b F12)', () => {
  it('holds exactly one stream across N live projects, and a focus change pulls the new project and closes the old stream', () => {
    const projects = ['prj_a', 'prj_b', 'prj_c'];
    const streams = new Map<string, { readonly tail: () => void }>();
    const pulls: string[] = [];
    const attention = new Map(projects.map((projectId) => [projectId, createRemoteAttention()]));
    for (const projectId of projects) {
      /* The scheduler watches once its open pull starts; the stream is the stand-in for the long poll. */
      attention.get(projectId)!.gate(
        (handlers) => {
          streams.set(projectId, { tail: () => handlers.watching?.() });
          return () => {
            streams.delete(projectId);
          };
        },
        {
          moved: () => {
            pulls.push(projectId);
          },
          refused: () => undefined,
        },
      );
    }
    expect([...streams.keys()], 'no project is focused yet').toEqual([]);

    /* The page binds every live project and says which one is focused. */
    for (const projectId of projects) {
      attention.get(projectId)!.setFocused(projectId === 'prj_a');
    }
    expect([...streams.keys()]).toEqual(['prj_a']);
    streams.get('prj_a')!.tail();
    expect(pulls, 'a focused project pulls once its tail is read').toEqual(['prj_a']);

    /* The person switches to prj_c. */
    attention.get('prj_a')!.setFocused(false);
    attention.get('prj_c')!.setFocused(true);
    expect([...streams.keys()], 'the old stream closed; the new one opened').toEqual(['prj_c']);
    expect(pulls, 'no pull before the new stream reads its tail').toEqual(['prj_a']);
    streams.get('prj_c')!.tail();
    expect(pulls).toEqual(['prj_a', 'prj_c']);
  });
});

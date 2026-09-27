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
import type { RevisionPort } from '@taucad/revisions';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createCheckoutRoutes, createWorkerRevisionRegistry } from '#machines/file-manager.worker.revisions.js';
import type {
  WorkerProjectRevisions,
  WorkerRevisionRegistryOptions,
  WorkerRevisionRequest,
  WorkerRevisionResponse,
} from '#machines/file-manager.worker.revisions.js';
import type { TurnPlacementAdapter } from '@taucad/revisions/turn-placement';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';

type Harness = {
  readonly service: WorkspaceFileService;
  readonly registry: ReturnType<typeof createWorkerRevisionRegistry>;
  readonly announce: (projectId: string, paths: readonly string[]) => void;
  readonly open: (projectId: string) => Promise<Client>;
  readonly root: (projectId: string) => Promise<WorkerProjectRevisions>;
  readonly dispose: () => void;
};

type Client = {
  readonly port: MessagePort;
  readonly frames: WorkerRevisionResponse[];
  readonly send: (request: WorkerRevisionRequest) => void;
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

/** A turn key for a first attempt: the agent host's own shape. */
const turnKey = (index: number) => ({
  chatId: `chat-${index}`,
  turnId: `turn-${index}`,
  runId: `run-${index}`,
  attempt: 1,
});

/** Place one attempt through the root's placement session, the way the agent host does (TS-S5). */
const place = async (
  session: TurnPlacementAdapter<FileSystemBridgeConnection>,
  key: ReturnType<typeof turnKey>,
): Promise<{ checkoutId: string; root: string }> => {
  const answer = await session.admit({ requestId: `admit:${key.runId}:1`, key });
  if (answer.status === 'refused') {
    throw new Error(answer.message);
  }
  return answer.placement;
};

/** Settle a placed attempt with a cut, then acknowledge it once the host would have its row (RM-R10). */
const finish = async (
  session: TurnPlacementAdapter<FileSystemBridgeConnection>,
  key: ReturnType<typeof turnKey>,
): Promise<void> => {
  await expect(session.complete({ requestId: `complete:${key.runId}:1`, key, cut: true })).resolves.toMatchObject({
    status: 'applied',
  });
  await expect(session.acknowledge({ requestId: `acknowledge:${key.runId}:1`, key })).resolves.toMatchObject({
    status: 'applied',
  });
};

const harness = (
  projectIds: readonly string[],
  wrapPort = (port: RevisionPort): RevisionPort => port,
  extra: Pick<WorkerRevisionRegistryOptions, 'servePlacement' | 'clock'> & { onCreatePort?: () => void } = {},
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
    ...(extra.servePlacement === undefined ? {} : { servePlacement: extra.servePlacement }),
    ...(extra.clock === undefined ? {} : { clock: extra.clock }),
    createPort: (projectId) => {
      extra.onCreatePort?.();
      return wrapPort(
        createIsomorphicGitRevisionPort({
          filesystem: service.createRootedFileSystem(`/projects/${projectId}`),
          /* Exactly what `file-manager.worker.ts` gives the real port, so a branch
           * created here is created the way the browser creates one (P24). */
          checkouts: checkoutRoutes(projectId),
        }),
      );
    },
    filesystem: (root) => service.createRootedFileSystem(root),
    observe: (projectId, onChanged) => {
      observers.set(projectId, onChanged);
      return () => observers.delete(projectId);
    },
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
    announce: (projectId, paths) => observers.get(projectId)?.(paths),
    open: async (projectId) => {
      const channel = new MessageChannel();
      registry.connect(channel.port1, projectId);
      const frames: WorkerRevisionResponse[] = [];
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
    await settle();

    /* The actor itself, not the registry's bookkeeping: a released root has
     * stopped and has no child left running. */
    expect(alphaRoot.inspect()).toMatchObject({ status: 'stopped', children: [] });
    expect(betaRoot.inspect().status).toBe('active');
    expect(fixture.registry.openProjectIds()).toEqual(['beta']);

    beta.send({ command: 'close' });
    await settle();

    expect(betaRoot.inspect()).toMatchObject({ status: 'stopped', children: [] });
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
    await fixture.open('alpha');
    const root = await fixture.root('alpha');
    const session = await root.placementSession();

    const first = await place(session, turnKey(1));
    const second = await place(session, turnKey(2));

    expect(first.checkoutId).toBe(second.checkoutId);
    expect(first.root).toBe('/projects/alpha');

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

  /* B7 (W8 TS-S5): the branch child answers every `create` by its id, so no clock may refuse one that is still
   * working. The branch's ref write is held while the clock runs well past the deleted bound. */
  it('should answer a createBranch that outlasts the old bound, never refusing it on the clock', async () => {
    const gate = { held: undefined as PromiseWithResolvers<void> | undefined };
    const fixture = harness(['alpha'], (port) => ({
      ...port,
      updateRef: async (input) => {
        await gate.held?.promise;
        return port.updateRef(input);
      },
    }));
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    await fixture.open('alpha');
    const root = await fixture.root('alpha');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      gate.held = Promise.withResolvers<void>();
      let outcome: unknown;
      const creating = (async (): Promise<void> => {
        try {
          outcome = await root.createBranch('isolated-run');
        } catch (error) {
          outcome = error;
        }
      })();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(outcome).toBeUndefined();

      gate.held.resolve();
      gate.held = undefined;
      await creating;
      expect(outcome).toMatchObject({ branch: 'isolated-run', checkoutId: expect.any(String) as unknown });
    } finally {
      gate.held?.resolve();
      vi.useRealTimers();
    }
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
   * A second `create` while the first is in flight used to be dropped, and the
   * correlated wait had no bound (review finding 1). A busy verb is now refused
   * at once with `REVISIONS_BUSY`, under its own request id (RM-R11, RM-S5).
   */
  it('should refuse a createBranch that arrives while another runs, at once and by its own id', async () => {
    const fixture = harness(['alpha']);
    await fixture.service.createRootedFileSystem('/projects/alpha').writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    alpha.send({ command: 'createBranch', name: 'main' });
    alpha.send({ command: 'createBranch', name: 'isolated-run', id: 93 });
    await settle(20);

    expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 93)).toMatchObject({
      type: 'error',
      id: 93,
      code: 'REVISIONS_BUSY',
    });
  });

  it('should not attribute another verb’s refusal to a pending createBranch', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    alpha.send({ command: 'saveRevision' });
    await alpha.settle();

    /* `main` is refused as a conflict; `isolated-run` arrives while that one runs.
       The answer id 94 hears is its own, never the branch the person already has. */
    alpha.send({ command: 'createBranch', name: 'main' });
    alpha.send({ command: 'createBranch', name: 'isolated-run', id: 94 });
    await settle(40);

    expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 94)).toMatchObject({
      type: 'error',
      code: 'REVISIONS_BUSY',
    });
  });

  /* RM-R5: the daemon's revision is a hint to re-read, never a head to adopt, so the projection shows the store's own. */
  it('should re-read the head a daemon revision moved into the worker projection', async () => {
    const ports: RevisionPort[] = [];
    const fixture = harness(['alpha'], (port) => {
      ports.push(port);
      return port;
    });
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await settle(20);
    const port = ports[0]!;
    const before = await port.readRef('main');
    const receipt = await port.writeRevision({
      parents: before === undefined ? [] : [before],
      tree: new ImmutableRevisionTree([['main.scad', new TextEncoder().encode('cube(10);')]]),
      provenance: { source: 'agent', actorId: 'daemon', createdAt: 1 },
      summary: { generated: 'Daemon turn' },
    });
    await port.updateRef({ name: 'main', expectedHead: before, head: revisionId(receipt.commitId) });

    alpha.send({
      command: 'adoptHostFinalized',
      checkoutId: 'live',
      revisionId: 'rev-not-the-store-head',
      treeId: 'tree-daemon',
      branch: 'main',
    });
    await settle(40);

    const root = await fixture.root('alpha');
    expect(root.status()).toMatchObject({
      checkoutId: 'live',
      headRevisionId: receipt.commitId,
      branch: 'main',
    });
  });

  it('should restore a recorded revision through the port commands', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');

    /* One settled turn, so the checkout has a head to come back to. */
    const root = await fixture.root('alpha');
    const session = await root.placementSession();
    await place(session, turnKey(1));
    await project.writeFile('main.scad', 'cube(20);');
    await finish(session, turnKey(1));
    await settle(20);

    const head = alpha.frames.findLast((frame) => frame.type === 'status')?.status.headRevisionId;
    expect(head).toBeDefined();
    expect(await project.readFile('main.scad', 'utf8')).toBe('cube(20);');

    /* A restore to that head with a dirty tree needs a person: the machine asks
     * and waits, and `confirm` is what applies it (PC9 — W7 renders the ask). */
    await project.writeFile('main.scad', 'cube(30);');
    alpha.send({ command: 'restore', revisionId: head! });
    await settle(20);
    alpha.send({ command: 'confirm' });
    await settle(30);

    expect(await project.readFile('main.scad', 'utf8')).toBe('cube(20);');
  });

  /* W7: S38's second half — the comparison whose right-hand side is the working
   * copy rather than another revision. */
  it('should compare a recorded revision against the files as they are now (S38)', async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    await fixture.open('alpha');
    const root = await fixture.root('alpha');
    const session = await root.placementSession();
    await place(session, turnKey(1));
    await project.writeFile('main.scad', 'cube(20);');
    await finish(session, turnKey(1));
    await settle(20);
    const head = root.status().headRevisionId;
    expect(head).toBeDefined();

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
    const root = await fixture.root('alpha');
    const session = await root.placementSession();
    await place(session, turnKey(1));

    /* The agent's write, then the person switching tab before it settles. */
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'saveRevision', trigger: 'hidden' });
    await settle(20);

    await finish(session, turnKey(1));
    await settle(30);

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
  /* B8 (W8 TS-S5): a `save` or `close` cut is answered by its request id; only `hidden` keeps a bound. A save whose
   * revision write outlasts the old 5 s bound is answered when it is recorded, not when a clock gives up on it. */
  it('should answer a close save only once its revision is recorded, however long the write takes', async () => {
    const gate = { held: undefined as PromiseWithResolvers<void> | undefined };
    const fixture = harness(['alpha'], (port) => ({
      ...port,
      writeRevision: async (input) => {
        await gate.held?.promise;
        return port.writeRevision(input);
      },
    }));
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await settle(20);
    const root = await fixture.root('alpha');
    const beforeRows = await root.log();
    const before = beforeRows.length;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      gate.held = Promise.withResolvers<void>();
      await project.writeFile('main.scad', 'cube(20);');
      fixture.announce('alpha', ['main.scad']);
      alpha.send({ command: 'saveRevision', id: 78, trigger: 'close' });
      await vi.advanceTimersByTimeAsync(60_000);
      await settle(20);
      expect(alpha.frames.find((frame) => 'id' in frame && frame.id === 78)).toBeUndefined();

      gate.held.resolve();
      gate.held = undefined;
      let answer: WorkerRevisionResponse | undefined;
      for (let attempt = 0; attempt < 60 && answer === undefined; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
        await settle(4);
        answer = alpha.frames.find((frame) => 'id' in frame && frame.id === 78);
      }
      expect(answer).toEqual({ type: 'result', id: 78, result: { kind: 'saved' } });
      const after = await root.log();
      expect(after.length).toBeGreaterThan(before);
    } finally {
      gate.held?.resolve();
      vi.useRealTimers();
    }
  });

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

  /* A save whose compare-and-swap lost is settled, not left to the deadline: the next open mints the same bytes. */
  it('should answer a saveRevision whose cut lost its compare-and-swap without waiting out the deadline', async () => {
    let conflictNext = false;
    const fixture = harness(['alpha'], (port) => ({
      ...port,
      updateRef: async (input) => {
        if (!conflictNext) {
          return port.updateRef(input);
        }
        conflictNext = false;
        return {
          status: 'conflicted',
          name: input.name,
          expectedHead: input.expectedHead,
          actualHead: input.expectedHead,
          proposedHead: input.head,
        };
      },
    }));
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const alpha = await fixture.open('alpha');
    await settle(20);

    await project.writeFile('main.scad', 'cube(20);');
    fixture.announce('alpha', ['main.scad']);
    conflictNext = true;
    alpha.send({ command: 'saveRevision', id: 78, trigger: 'save' });

    let answer: WorkerRevisionResponse | undefined;
    for (let attempt = 0; attempt < 60 && answer === undefined; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling the port's own answer.
      await settle(4);
      answer = alpha.frames.find((frame) => (frame.type === 'result' || frame.type === 'error') && frame.id === 78);
    }

    expect(conflictNext).toBe(false);
    expect(answer).toEqual({ type: 'result', id: 78, result: { kind: 'saved' } });
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
});

describe('the placement session (W8 TS-S5)', () => {
  type Served = { session: TurnPlacementAdapter<FileSystemBridgeConnection>; close: () => void };
  const placementHarness = (extra: { onCreatePort?: () => void } = {}) => {
    const served: Served[] = [];
    const fixture = harness(['alpha'], (port) => port, {
      ...extra,
      servePlacement: ({ session }) => {
        let closed = (): void => undefined;
        served.push({
          session,
          close: () => {
            closed();
          },
        });
        return {
          onClose: (handler) => {
            closed = handler;
          },
        };
      },
    });
    return { fixture, served };
  };
  const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 1 };

  it('should keep a project root open while a placement session is live with no page port', async () => {
    const { fixture, served } = placementHarness();
    const page = await fixture.open('alpha');
    fixture.registry.connectPlacement(new MessageChannel().port1, 'alpha');
    await settle();
    const root = await fixture.root('alpha');

    page.send({ command: 'close' });
    await settle();

    expect(served).toHaveLength(1);
    expect(root.inspect().status).toBe('active');

    served[0]!.close();
    await settle();

    expect(root.inspect()).toMatchObject({ status: 'stopped', children: [] });
    expect(fixture.registry.openProjectIds()).toEqual([]);
  });

  it('should answer admit with the clock frozen', async () => {
    const { fixture, served } = placementHarness();
    await fixture.open('alpha');
    fixture.registry.connectPlacement(new MessageChannel().port1, 'alpha');
    await settle();
    /* No timer fires from here on: an answer that only a bound could give never comes (B1). */
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    const answer = await served[0]!.session.admit({ requestId: 'admit:run-1:1', key }).finally(() => {
      vi.useRealTimers();
    });

    expect(answer).toMatchObject({ requestId: 'admit:run-1:1', status: 'applied', placement: { mode: 'direct' } });
  });

  it('should revoke the tool port when complete is answered', async () => {
    const { fixture, served } = placementHarness();
    await fixture.open('alpha');
    fixture.registry.connectPlacement(new MessageChannel().port1, 'alpha');
    await settle();
    const { session } = served[0]!;
    const admitted = await session.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const tools = createFileSystemBridgeProxy(admitted.placement.tools);
    await tools.writeFile('main.ts', 'export const size = 2;\n');

    const completed = await session.complete({ requestId: 'complete:run-1:1', key, cut: true });

    expect(completed).toEqual({ requestId: 'complete:run-1:1', status: 'applied' });
    await expect(tools.writeFile('late.ts', 'export const late = true;\n')).rejects.toThrow(/no longer be changed/u);
  });

  it("should not start the root's opening pull before the page's credential frame when the placement session is brokered first", async () => {
    let ports = 0;
    const { fixture, served } = placementHarness({
      onCreatePort: () => {
        ports += 1;
      },
    });

    fixture.registry.connectPlacement(new MessageChannel().port1, 'alpha');
    await settle();

    expect(ports).toBe(0);
    expect(fixture.registry.openProjectIds()).toEqual([]);

    await fixture.open('alpha');
    await settle();

    expect(ports).toBe(1);
    expect(served).toHaveLength(1);
  });
});

describe('the revisions reader port (W6.r1 finding 9)', () => {
  /** The resident agent host's revisions port, as the worker hands it to `connectReader`. */
  const reader = (fixture: Harness, projectId: string) => {
    const channel = new MessageChannel();
    let closed = false;
    const frames: WorkerRevisionResponse[] = [];
    channel.port2.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionResponse>) => {
      frames.push(data);
    });
    channel.port2.addEventListener('close', () => {
      closed = true;
    });
    channel.port2.start();
    fixture.registry.connectReader(channel.port1, projectId);
    return {
      frames,
      closed: () => closed,
      send: (request: WorkerRevisionRequest) => {
        channel.port2.postMessage(request);
      },
    };
  };

  it("should close the root and take the close cut when the page's port closes with a reader connected", async () => {
    const fixture = harness(['alpha']);
    const project = fixture.service.createRootedFileSystem('/projects/alpha');
    await project.writeFile('main.scad', 'cube(10);');
    const page = await fixture.open('alpha');
    await settle(20);
    const agent = reader(fixture, 'alpha');
    await settle();
    const root = await fixture.root('alpha');
    const before = await root.log();
    await project.writeFile('main.scad', 'cube(20);');
    fixture.announce('alpha', ['main.scad']);

    page.send({ command: 'close', id: 9 });
    await settle(60);

    expect(page.frames).toContainEqual({ type: 'result', id: 9, result: { kind: 'closed' } });
    expect(root.inspect()).toMatchObject({ status: 'stopped', children: [] });
    expect(fixture.registry.openProjectIds()).toEqual([]);
    const after = await root.log();
    expect(after.length).toBeGreaterThan(before.length);
    expect(agent.closed()).toBe(true);
  });

  it('should refuse a reader for a project that is not open, and open no root for it', async () => {
    let ports = 0;
    const fixture = harness(['alpha'], (port) => port, {
      onCreatePort: () => {
        ports += 1;
      },
    });

    const agent = reader(fixture, 'alpha');
    await settle();

    expect(agent.closed()).toBe(true);
    expect(ports).toBe(0);
    expect(fixture.registry.openProjectIds()).toEqual([]);
  });

  it("should keep the root open when a reader closes, and never take the page's credential from it", async () => {
    const fixture = harness(['alpha']);
    const page = await fixture.open('alpha');
    const agent = reader(fixture, 'alpha');
    await settle();
    const root = await fixture.root('alpha');

    agent.send({ command: 'remoteCredential', id: 3, apiBaseUrl: 'https://elsewhere.test' });
    agent.send({ command: 'close', id: 4 });
    await settle();

    expect(agent.frames.find((frame) => frame.type === 'error')).toMatchObject({ id: 3 });
    expect(agent.frames).toContainEqual({ type: 'result', id: 4, result: { kind: 'closed' } });
    expect(root.inspect().status).toBe('active');
    expect(page.frames.some((frame) => frame.type === 'status')).toBe(true);
  });
});

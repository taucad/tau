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
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import {
  createCheckoutRoutes,
  createWorkerRevisionRegistry,
  sameRevisionStatus,
  versionedChangePaths,
} from '#machines/file-manager.worker.revisions.js';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type {
  WorkerProjectRevisions,
  WorkerRevisionRequest,
  WorkerRevisionResponse,
} from '#machines/file-manager.worker.revisions.js';

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

const harness = (projectIds: readonly string[]): Harness => {
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
      createIsomorphicGitRevisionPort({
        filesystem: service.createRootedFileSystem(`/projects/${projectId}`),
        /* Exactly what `file-manager.worker.ts` gives the real port, so a branch
         * created here is created the way the browser creates one (P24). */
        checkouts: checkoutRoutes(projectId),
      }),
    filesystem: (root) => service.createRootedFileSystem(root),
    observe: (projectId, onChanged) => {
      observers.set(projectId, onChanged);
      return () => observers.delete(projectId);
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
    announce: (projectId, paths) => observers.get(projectId)?.(paths),
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

describe('the projection comparator (P52, W18 DEF-6)', () => {
  /*
   * The defect is the comparator, not the transport: connecting a real remote
   * needs a git server this jsdom suite has none of, so the pin drives the one
   * pure function the subscription gates on. What it proves is exactly what
   * broke — a projection whose *only* moved field is a `remote.*` one is not
   * "the same", so the page is told.
   */
  const base = (): RevisionStatusProjection => ({
    projectId: 'proj_1',
    checkoutId: 'checkout-1',
    checkoutRoot: '/projects/proj_1',
    branch: 'main',
    projectDirty: false,
    dirty: false,
    minting: false,
    headRevisionId: 'rev-1',
    follow: 'chat',
    attention: 0,
    restore: { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: undefined },
    remote: {
      kind: 'none',
      url: undefined,
      phase: 'none',
      storage: undefined,
      overQuota: [],
      error: undefined,
      reason: undefined,
      fetchOnly: false,
      provider: undefined,
      repositoryId: undefined,
      quota: undefined,
    } as const,
    publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined } as const,
    sync: {
      state: 'noRemote',
      pendingCount: 0,
      online: true,
      conflictRef: undefined,
      error: undefined,
      reason: undefined,
    } as const,
    branches: [],
    branchVerb: { busy: false, asking: false, operation: undefined, branch: undefined, question: undefined },
    conflicts: [],
  });

  it('repaints the Sync region when the remote connects and nothing else moves', () => {
    const connected = { ...base(), remote: { ...base().remote, kind: 'tau', phase: 'connected' } as const };

    expect(sameRevisionStatus(base(), base())).toBe(true);
    expect(sameRevisionStatus(base(), connected)).toBe(false);
  });

  it.each([
    ['phase', { phase: 'connecting' } as const],
    ['url', { url: 'https://example.test/repo.git' }],
    ['storage', { storage: { used: 1, quota: 2 } }],
    ['overQuota', { overQuota: ['big.stl'] }],
    ['error', { error: 'refused' }],
  ])('repaints when remote.%s moves on its own', (_field, patch) => {
    expect(sameRevisionStatus(base(), { ...base(), remote: { ...base().remote, ...patch } })).toBe(false);
  });

  it('repaints when the restore confirmation or the publish dialog moves on its own', () => {
    expect(sameRevisionStatus(base(), { ...base(), restore: { ...base().restore, asking: true } })).toBe(false);
    expect(sameRevisionStatus(base(), { ...base(), publish: { ...base().publish, phase: 'choosingVersion' } })).toBe(
      false,
    );
  });
});

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

    const branches = await project.readdir('.tau/revisions/refs/heads');
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
      branch: 'main',
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
    const alpha = await fixture.open('alpha');
    const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    expect(placed.type).toBe('result');
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await settle(20);
    const root = await fixture.root('alpha');
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
    const placed = await alpha.admit({ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    expect(placed.type).toBe('result');

    /* The agent's write, then the person switching tab before it settles. */
    await project.writeFile('main.scad', 'cube(20);');
    alpha.send({ command: 'saveRevision', trigger: 'hidden' });
    await settle(20);

    alpha.send({ command: 'turnCompleted', turnId: 'turn-1' });
    await settle(30);

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
    const before = (await root.log()).length;

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
        rowsWhenAnswered = (await root.log()).length;
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
    await settle(40);

    const answer = alpha.frames.find((frame) => frame.type === 'result' || frame.type === 'error');
    expect(answer?.type).toBe('result');
    /* The lease is retired by the completion the root held, so nothing is left
     * holding the checkout open. */
    await expect(project.readdir('.tau/runs')).resolves.toEqual([]);
  });

  it('should raise one change per content-change event whatever its path count (F9)', () => {
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/alpha/src/main.scad', backend: 'memory' },
        '/projects/alpha',
      ),
    ).toEqual(['src/main.scad']);
    expect(
      versionedChangePaths(
        {
          type: 'fileRenamed',
          oldPath: '/projects/alpha/a.scad',
          newPath: '/projects/alpha/b.scad',
          backend: 'memory',
        },
        '/projects/alpha',
      ),
    ).toEqual(['a.scad', 'b.scad']);
    /* Records are not versioned, so the lease the turn itself writes can never
     * make its own checkout dirty. */
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/alpha/.tau/runs/run-1.json', backend: 'memory' },
        '/projects/alpha',
      ),
    ).toEqual([]);
    /* Another project's write is not this project's change. */
    expect(
      versionedChangePaths(
        { type: 'fileWritten', path: '/projects/beta/main.scad', backend: 'memory' },
        '/projects/alpha',
      ),
    ).toEqual([]);
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

/**
 * The turn-placement adapter over a real root and a real port (W8 TS-S3, TS-A8).
 *
 * Each row drives the six verbs as M1 does and reads the durable effects back from the store: the lease directory,
 * the revisions and their provenance, and the files the attempt's tools could write.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { RootedFileSystem } from '@taucad/filesystem';
import { afterEach, describe, expect, it } from 'vitest';
import { waitFor } from 'xstate';

import { revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { createProjectRevisionsActor } from '#revision-effects.js';
import type { ProjectRevisions, RevisionFileSystem } from '#revision-effects.js';
import { createTurnPlacementPort } from '#turn-placement.js';
import type { TurnPlacementAdapter } from '#turn-placement.js';
import type { TurnAttemptKey } from '#turn.types.js';

const roots: string[] = [];
const stops: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const stop of stops.splice(0)) {
    // oxlint-disable-next-line no-await-in-loop -- each tree is stopped and settled before its directory goes.
    await stop();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const key: TurnAttemptKey = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 1 };

type Project = Readonly<{
  filesystem: RootedFileSystem;
  port: RevisionPort;
  /** Start a root over the same store, as a host (re)start does, and one placement session over it. */
  open: () => Readonly<{ revisions: ProjectRevisions; placement: TurnPlacementAdapter<RevisionFileSystem> }>;
}>;

const createProject = async (): Promise<Project> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-turn-placement-'));
  roots.push(root);
  const filesystem: RootedFileSystem = new NodeFsProvider(root);
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'project-1', root: () => filesystem },
  });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  return {
    filesystem,
    port,
    open: () => {
      const revisions = createProjectRevisionsActor({
        port,
        projectId: 'project-1',
        filesystem: () => filesystem,
      });
      revisions.actor.start();
      stops.push(async () => {
        revisions.actor.stop();
        await revisions.settled();
      });
      return {
        revisions,
        placement: createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view }),
      };
    },
  };
};

/** The revisions a turn attempt minted, by `turnCut`, walking first parents from the head. */
const turnCuts = async (port: RevisionPort, of: TurnAttemptKey): Promise<readonly string[]> => {
  const cuts: string[] = [];
  const head = await port.readHead();
  let cursor = head?.head;
  while (cursor !== undefined) {
    // oxlint-disable-next-line no-await-in-loop -- a first-parent walk reads one commit at a time.
    const record = await port.readRevision(revisionId(cursor));
    if (record === undefined) {
      break;
    }
    const { provenance } = record;
    if (provenance.runId === of.runId && provenance.attempt === of.attempt && provenance.turnCut !== undefined) {
      cuts.push(provenance.turnCut);
    }
    cursor = record.parents[0];
  }
  return cuts;
};

/** The first settlement fact a fresh subscription replays or receives. */
const firstSettlement = async (placement: TurnPlacementAdapter<RevisionFileSystem>) => {
  const listening = new AbortController();
  for await (const fact of placement.settlements({ signal: listening.signal })) {
    if (fact.kind === 'settled') {
      listening.abort();
      return fact;
    }
  }
  throw new Error('The settlements listen ended with no settlement.');
};

/** The first `leaseHeld` fact a subscription receives. */
const firstLeaseHeld = async (placement: TurnPlacementAdapter<RevisionFileSystem>) => {
  const listening = new AbortController();
  for await (const fact of placement.settlements({ signal: listening.signal })) {
    if (fact.kind === 'leaseHeld') {
      listening.abort();
      return fact;
    }
  }
  throw new Error('The settlements listen ended with no leaseHeld fact.');
};

describe('createTurnPlacementPort (TS-S3)', () => {
  /* TS-R12 (W8.a2): with no checkout named, the chat record's is the placement intent, not the live checkout. */
  it("should place an attempt on the chat record's checkout when the person named none", async () => {
    const project = await createProject();
    await project.filesystem.writeFile(
      '.tau/chats/chat-1/chat.json',
      JSON.stringify({ id: 'chat-1', name: 'Chat', createdAt: 0, updatedAt: 0, checkoutId: 'missing-checkout' }),
    );
    const { placement } = project.open();

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(answer).toMatchObject({ status: 'refused', code: 'CHECKOUT_UNKNOWN' });
    await expect(project.filesystem.readdir('.tau/runs').catch(() => [])).resolves.toEqual([]);
  });

  it('should answer replayed and mint no second base when an attempt is admitted twice', async () => {
    const project = await createProject();
    /* Unsaved edits the person made before sending: the dirty base the placement pre-mints. */
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const { placement } = project.open();

    const first = await placement.admit({ requestId: 'admit:run-1:1', key });
    const second = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(first).toMatchObject({ requestId: 'admit:run-1:1', status: 'applied' });
    expect(second).toMatchObject({ requestId: 'admit:run-1:1', status: 'replayed' });
    if (first.status === 'refused' || second.status === 'refused') {
      throw new Error('admit was refused');
    }
    expect(first.placement.baseRevisionId).toBeDefined();
    expect(second.placement.baseRevisionId).toBe(first.placement.baseRevisionId);
    expect(first.placement.mode).toBe('direct');
    expect(await turnCuts(project.port, key)).toEqual(['base']);
  });

  it('should derive the settlement from the existing result when complete follows a crash after the cut', async () => {
    const project = await createProject();
    const before = project.open();
    const admitted = await before.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const cut = await before.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const settled = await firstSettlement(before.placement);
    expect(cut.status).toBe('applied');
    /* The host dies between the cut and the settlement row: the lease stays, unacknowledged. */
    before.revisions.actor.stop();
    await before.revisions.settled();

    const after = project.open();
    const again = await after.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });

    expect(again).toEqual({ requestId: 'complete:run-1:1', status: 'applied' });
    const resettled = await firstSettlement(after.placement);
    expect(resettled.row).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(resettled.row).toHaveProperty(
      'revisionId',
      settled.row.type === 'turn.finalized' ? settled.row.revisionId : '',
    );
    /* One result, newest first, over the base the placement pre-minted from the new project's generated files. */
    expect(await turnCuts(project.port, key)).toEqual(['result', 'base']);
  });

  it('should answer a replayed admission after a root restart from the adopted lease', async () => {
    const project = await createProject();
    const before = project.open();
    const first = await before.placement.admit({ requestId: 'admit:run-1:1', key });
    before.revisions.actor.stop();
    await before.revisions.settled();
    const after = project.open();
    await waitFor(after.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const placed: unknown[] = [];
    after.revisions.actor.on('turnPlaced', (event) => {
      placed.push(event.key);
    });

    after.revisions.actor.send({ type: 'admitTurn', key });

    expect(placed).toEqual([key]);
    const again = await after.placement.admit({ requestId: 'admit:run-1:1', key });
    expect(again).toMatchObject({
      status: 'replayed',
      placement: { checkoutId: first.status === 'refused' ? '' : first.placement.checkoutId },
    });
    expect(await turnCuts(project.port, key)).toEqual(['base']);
  });

  it('should refuse a tool write after abandon is answered', async () => {
    const project = await createProject();
    const { placement } = project.open();
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const { tools } = admitted.placement;
    await tools.writeFile('before.ts', 'export const before = true;\n');

    const abandoned = await placement.abandon({ requestId: 'abandon:run-1:1', key });

    expect(abandoned).toEqual({ requestId: 'abandon:run-1:1', status: 'applied' });
    await expect(tools.writeFile('after.ts', 'export const after = true;\n')).rejects.toMatchObject({
      code: 'TOOL_PORT_REVOKED',
    });
    expect(await project.filesystem.exists('after.ts')).toBe(false);
    expect(await placement.abandon({ requestId: 'abandon:run-1:1', key })).toEqual({
      requestId: 'abandon:run-1:1',
      status: 'replayed',
    });
  });

  it('should leave no lease, no revision and no tool port when admit is refused', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const opened: string[] = [];
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => project.filesystem,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({
      revisions,
      openTools: ({ key: attempt }) => {
        opened.push(attempt.runId);
        return attempt.runId;
      },
    });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key, checkoutId: 'checkout-gone' });

    expect(answer).toMatchObject({ requestId: 'admit:run-1:1', status: 'refused', code: 'CHECKOUT_UNKNOWN' });
    expect(await revisions.turns.leases()).toEqual([]);
    expect(await turnCuts(project.port, key)).toEqual([]);
    expect(opened).toEqual([]);
  });

  it('should publish the settlement, then retire the lease on acknowledge', async () => {
    const project = await createProject();
    const { revisions: opened } = project.open();
    /* What the adapter sends the root, observed on the way in. */
    const syncs: unknown[] = [];
    const actor = new Proxy(opened.actor, {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'send') {
          return (event: Parameters<typeof target.send>[0]) => {
            if (event.type === 'sync') {
              syncs.push(event);
            }
            target.send(event);
          };
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const revisions = { ...opened, actor };
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 3;\n');
    await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const settled = await firstSettlement(placement);
    const held = await placement.reconcile({ requestId: 'reconcile:chat-1:1', chatId: 'chat-1' });

    const acknowledged = await placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });

    expect(settled).toMatchObject({ kind: 'settled', key, row: { type: 'turn.finalized', attempt: 1 } });
    expect(held).toMatchObject({ status: 'applied', held: [{ key, checkoutId: admitted.placement.checkoutId }] });
    expect(acknowledged).toEqual({ requestId: 'acknowledge:run-1:1', status: 'applied' });
    expect(await revisions.turns.leases()).toEqual([]);
    expect(await placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toEqual({
      requestId: 'acknowledge:run-1:1',
      status: 'replayed',
    });
    /* The row is durable in the chat's log, so sync records the chats once (W8.a2: the host relay's recordsChanged). */
    expect(syncs).toEqual([{ type: 'sync', event: { type: 'recordsChanged' } }]);
  });

  /* I25, TS-A14, RM-R8 narrowed (W8.r1 H1, probe P1): a second root refuses another live root's attempt. */
  it("should not settle or retire another root's attempt while that root lives", async () => {
    const project = await createProject();
    const a = project.open();
    const admitted = await a.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const b = project.open();
    await waitFor(b.revisions.actor, (snapshot) => snapshot.context.registrySettled);

    const completed = await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    const acknowledged = await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });
    const readmitted = await b.placement.admit({ requestId: 'admit:run-1:1', key });

    expect(completed).toMatchObject({ status: 'refused', code: 'LEASE_HELD_ELSEWHERE' });
    expect(acknowledged).toMatchObject({ status: 'refused', code: 'LEASE_HELD_ELSEWHERE' });
    expect(readmitted).toMatchObject({ status: 'refused', code: 'TURN_ALREADY_LEASED' });
    expect(b.revisions.actor.getSnapshot().context.turnRefs['run-1/1']).toBeUndefined();
    /* No result: only the base A pre-minted from the new project's files. */
    expect(await turnCuts(project.port, key)).toEqual(['base']);
    /* A's attempt is untouched: its tools write, and A settles and retires it. */
    await admitted.placement.tools.writeFile('late.ts', 'export const late = true;\n');
    expect(await a.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'applied',
    });
    const settled = await firstSettlement(a.placement);
    expect(settled.row).toMatchObject({ type: 'turn.finalized' });
    expect(settled.row).toHaveProperty('changedPaths', expect.arrayContaining(['late.ts']));
    expect(await a.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await a.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R16, RM-R8 narrowed: the refused root waits on the holder's mark, says so, and then settles the attempt. */
  it('should report leaseHeld once the holder root stops, and then adopt and settle its attempt', async () => {
    const project = await createProject();
    const a = project.open();
    const admitted = await a.placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    await admitted.placement.tools.writeFile('main.ts', 'export const size = 2;\n');
    const b = project.open();
    const held = firstLeaseHeld(b.placement);
    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      code: 'LEASE_HELD_ELSEWHERE',
    });

    a.revisions.actor.stop();
    await a.revisions.settled();

    expect(await held).toMatchObject({ kind: 'leaseHeld', key, checkoutId: admitted.placement.checkoutId });
    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toEqual({
      requestId: 'complete:run-1:1',
      status: 'applied',
    });
    const { row: adopted } = await firstSettlement(b.placement);
    expect(adopted).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R5 (W8.r1 L1, probe P2): with no actor, the record is gone before `acknowledge` answers. */
  it('should delete the record before an acknowledge with no actor answers', async () => {
    const project = await createProject();
    const a = project.open();
    await a.placement.admit({ requestId: 'admit:run-1:1', key });
    await a.placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
    await firstSettlement(a.placement);
    a.revisions.actor.stop();
    await a.revisions.settled();
    const b = project.open();

    const answer = await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key });

    expect(answer).toEqual({ requestId: 'acknowledge:run-1:1', status: 'applied' });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-Q5 (W8.r1 H2, probe P3): a record written before W5 names no attempt; any attempt's settlement retires it. */
  it('should retire a record written before W5 by the run settlement of any attempt, and free its checkout', async () => {
    const project = await createProject();
    const a = project.open();
    await waitFor(a.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const checkoutId = a.revisions.actor.getSnapshot().context.liveCheckoutId ?? '';
    await project.filesystem.mkdir('.tau/runs', { recursive: true });
    await project.filesystem.writeFile(
      '.tau/runs/run-legacy.json',
      JSON.stringify({
        runId: 'run-legacy',
        turnId: 'turn-legacy',
        chatId: 'chat-1',
        checkoutId,
        authorityEpoch: 'e',
        startedAt: 1,
      }),
    );
    const legacy = { chatId: 'chat-1', turnId: 'turn-legacy', runId: 'run-legacy', attempt: 0 };

    expect(await a.placement.reconcile({ requestId: 'reconcile:1', chatId: 'chat-1' })).toMatchObject({
      held: [{ key: legacy, checkoutId }],
    });
    expect(await a.placement.acknowledge({ requestId: 'acknowledge:run-legacy:0', key: legacy })).toMatchObject({
      status: 'applied',
    });
    await project.filesystem.writeFile('main.ts', 'export const edited = true;\n');
    const minted = new Promise<string>((resolve) => {
      a.revisions.actor.on('revisionMinted', (event) => {
        resolve(event.requestId ?? '');
      });
      a.revisions.actor.on('nothingToSave', (event) => {
        resolve(`nothingToSave ${JSON.stringify(event.heldBy)}`);
      });
    });
    a.revisions.actor.send({ type: 'cut', requestId: 'save:1', trigger: 'save', checkoutId, leaseIds: [] });
    expect(await minted).toBe('save:1');
  });

  /* TS-Q5: a record written before W5 whose run has no row settles as the run's current attempt. */
  it('should settle a record written before W5 as the run current attempt', async () => {
    const project = await createProject();
    const a = project.open();
    await waitFor(a.revisions.actor, (snapshot) => snapshot.context.registrySettled);
    const checkoutId = a.revisions.actor.getSnapshot().context.liveCheckoutId ?? '';
    const head = await project.port.readHead();
    await project.filesystem.mkdir('.tau/runs', { recursive: true });
    await project.filesystem.writeFile(
      '.tau/runs/run-1.json',
      JSON.stringify({
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId,
        baseRevisionId: head?.head,
        startedAt: 1,
      }),
    );
    await project.filesystem.writeFile('main.ts', 'export const size = 5;\n');
    a.revisions.actor.stop();
    await a.revisions.settled();
    const b = project.open();

    expect(await b.placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'applied',
    });
    const { row: adopted } = await firstSettlement(b.placement);
    expect(adopted).toMatchObject({ type: 'turn.finalized', attempt: 1 });
    expect(await b.placement.acknowledge({ requestId: 'acknowledge:run-1:1', key })).toMatchObject({
      status: 'applied',
    });
    expect(await b.revisions.turns.leases()).toEqual([]);
  });

  /* TS-R1 (W8.r1 MU9, L2): a grant that cannot open the checkout answers after the release, naming the base. */
  it('should release a placement whose checkout cannot be opened before refusing, and name its base', async () => {
    const project = await createProject();
    await project.filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => project.filesystem,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({
      revisions: { ...revisions, turns: { ...revisions.turns, open: async () => undefined } },
      openTools: ({ filesystem: view }) => view,
    });

    const answer = await placement.admit({ requestId: 'admit:run-1:1', key });

    expect(await revisions.turns.leases()).toEqual([]);
    const head = await project.port.readHead();
    const [base] = await project.port.log({ heads: [revisionId(head?.head ?? '')] });
    expect(base?.provenance).toMatchObject({ runId: 'run-1', turnCut: 'base' });
    expect(answer).toMatchObject({
      status: 'refused',
      code: 'CHECKOUT_UNKNOWN',
      details: { revisionId: base?.id },
    });
  });

  /*
   * TS-R15 (W8.r1 MU14, L-A): `complete` revokes the tools after the writes they accepted, so the cut holds every byte.
   * The write is held until `complete` answers or 2 s pass: `complete` may answer only after the write settled.
   */
  it('should cut a write the tools accepted before complete was sent', async () => {
    const project = await createProject();
    const gate = Promise.withResolvers<void>();
    const slow = new Proxy(project.filesystem, {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'writeFile') {
          return async (path: string, ...rest: unknown[]): Promise<unknown> => {
            if (path.endsWith('slow.ts')) {
              await gate.promise;
            }
            return (value as (...args: unknown[]) => Promise<unknown>).call(target, path, ...rest);
          };
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => slow,
    });
    revisions.actor.start();
    stops.push(async () => {
      revisions.actor.stop();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }
    const order: string[] = [];

    const write = async (): Promise<void> => {
      await admitted.placement.tools.writeFile('slow.ts', 'export const slow = true;\n');
      order.push('write settled');
    };
    const complete = async () => {
      const answer = await placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
      order.push('complete answered');
      return answer;
    };
    const writing = write();
    const completing = complete();
    const bound = new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    const release = async (): Promise<void> => {
      await Promise.race([completing, bound]);
      gate.resolve();
    };
    const released = release();
    const completed = await completing;
    await writing;
    await released;

    expect(order).toEqual(['write settled', 'complete answered']);
    expect(completed).toMatchObject({ status: 'applied' });
    const { row } = await firstSettlement(placement);
    expect(row).toMatchObject({ type: 'turn.finalized' });
    expect(row).toHaveProperty('changedPaths', expect.arrayContaining(['slow.ts']));
    /* The write is held up to the 2 s bound by design. */
  }, 15_000);

  /* RM-R8 narrowed (W8.r1 L-D): a stopped root keeps its liveness mark until every write it started has settled. */
  it('should hold the root mark after the root stops until its lease write settles', async () => {
    const project = await createProject();
    const gate = Promise.withResolvers<void>();
    const writing = Promise.withResolvers<void>();
    const slow = new Proxy(project.filesystem, {
      get: (target, property): unknown => {
        const value: unknown = Reflect.get(target, property, target);
        if (property === 'writeFile') {
          return async (path: string, ...rest: unknown[]): Promise<unknown> => {
            if (path.endsWith('run-1.json')) {
              writing.resolve();
              await gate.promise;
            }
            return (value as (...args: unknown[]) => Promise<unknown>).call(target, path, ...rest);
          };
        }
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const revisions = createProjectRevisionsActor({
      port: project.port,
      projectId: 'project-1',
      filesystem: () => slow,
    });
    revisions.actor.start();
    stops.push(async () => {
      gate.resolve();
      await revisions.settled();
    });
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    const marks = async (): Promise<readonly string[]> => {
      const { held = [] } = await navigator.locks.query();
      return held.map((lock) => lock.name ?? '').filter((name) => name.startsWith('tau:revisions-root:project-1:'));
    };

    const admitting = placement.admit({ requestId: 'admit:run-1:1', key });
    await writing.promise;
    revisions.actor.stop();
    await admitting;

    expect(await marks()).toHaveLength(1);
    gate.resolve();
    await revisions.settled();
    await expect.poll(marks).toEqual([]);
  });

  /* TS-R6 (W8.r1 L-C, P9): a fence, or the root's stop, answers a `complete` waiting on the root's cut. */
  it.each(['fence', 'root stop'] as const)(
    'should answer a complete waiting on the cut after a %s',
    async (end) => {
      const project = await createProject();
      const cut = Promise.withResolvers<void>();
      let gating = false;
      /* The port is frozen, so the gate wraps a copy: once `gating`, every store call waits for the cut gate. */
      const gated = Object.fromEntries(
        Object.entries(project.port).map(([name, value]: [string, unknown]) => [
          name,
          typeof value === 'function'
            ? async (...args: unknown[]): Promise<unknown> => {
                if (gating) {
                  await cut.promise;
                }
                return (value as (...parameters: unknown[]) => Promise<unknown>).apply(project.port, args);
              }
            : value,
        ]),
      ) as unknown as RevisionPort;
      const revisions = createProjectRevisionsActor({
        port: gated,
        projectId: 'project-1',
        filesystem: () => project.filesystem,
      });
      revisions.actor.start();
      stops.push(async () => {
        cut.resolve();
        revisions.actor.stop();
        await revisions.settled();
      });
      const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
      const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
      if (admitted.status === 'refused') {
        throw new Error(admitted.message);
      }
      await admitted.placement.tools.writeFile('cut.ts', 'export const cut = true;\n');

      gating = true;
      const completing = placement.complete({ requestId: 'complete:run-1:1', key, cut: true });
      await waitFor(revisions.actor, (snapshot) => {
        const turn = snapshot.context.turnRefs['run-1/1'];
        return turn?.getSnapshot().matches('capturing') === true;
      });
      if (end === 'fence') {
        await placement.fence();
      } else {
        revisions.actor.stop();
      }

      expect(await completing).toMatchObject({ status: 'refused', code: 'SESSION_FENCED' });
    },
    15_000,
  );

  it('should refuse a fenced session and revoke its tools while the root keeps the attempt', async () => {
    const project = await createProject();
    const { revisions, placement } = project.open();
    const admitted = await placement.admit({ requestId: 'admit:run-1:1', key });
    if (admitted.status === 'refused') {
      throw new Error(admitted.message);
    }

    await placement.fence();
    const next = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });

    expect(await placement.complete({ requestId: 'complete:run-1:1', key, cut: true })).toMatchObject({
      status: 'refused',
      code: 'SESSION_FENCED',
    });
    await expect(admitted.placement.tools.writeFile('late.ts', '')).rejects.toMatchObject({
      code: 'TOOL_PORT_REVOKED',
    });
    expect(await next.complete({ requestId: 'complete:run-1:1', key, cut: true })).toEqual({
      requestId: 'complete:run-1:1',
      status: 'applied',
    });
  });
});

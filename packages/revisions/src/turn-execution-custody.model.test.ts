/**
 * TurnExecutionCustody projection onto real protected lease records: Hold,
 * stale ReleaseExecution, RecoverRetire, the effect-level checkout Discard
 * check, and Complete racing Hold through the real turn-placement adapter.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createActor } from 'xstate';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createProjectRevisionsActor, createRevisionActors } from '#revision-effects.js';
import { createTurnPlacementPort } from '#turn-placement.js';
import type { RevisionActors } from '#revision-effects.js';

const roots: string[] = [];
const owners: RevisionActors[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) {
    owner.release();
    // oxlint-disable-next-line no-await-in-loop -- finish each root before deleting its records.
    await owner.settled();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const key = { chatId: 'chat', turnId: 'turn', runId: 'run', attempt: 1 };
const path = '.tau/runs/run.json';
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-custody-model-'));
  roots.push(root);
  const filesystem = new NodeFsProvider(root);
  const port = createIsomorphicGitRevisionPort({ filesystem });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  await filesystem.writeFile(path, JSON.stringify({ ...key, checkoutId: 'live', startedAt: 1 }));
  const open = () => {
    const owner = createRevisionActors({ port, projectId: root, filesystem: async () => filesystem });
    owners.push(owner);
    return owner;
  };
  return { filesystem, open };
};

describe('TurnExecutionCustody durable record projection', () => {
  it('should retain the lease after root loss until every exact execution is released', async () => {
    const { filesystem, open } = await fixture();
    const first = open();
    expect(await first.turns.executions.hold({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    expect(await first.turns.executions.hold({ key, executionId: 'two' })).toEqual({ status: 'applied' });
    expect(JSON.parse(await filesystem.readFile(path, 'utf8'))).toMatchObject({ executionIds: ['one', 'two'] });
    first.release();
    const recovered = open();
    expect(await recovered.turns.claim(key.runId)).toBe('held');
    expect(await recovered.turns.retire(key)).toBe('held');
    expect(await recovered.turns.executions.release({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    expect(await recovered.turns.retire(key)).toBe('held');
    expect(await recovered.turns.executions.release({ key, executionId: 'two' })).toEqual({ status: 'applied' });
    expect(await recovered.turns.retire(key)).toBe('retired');
    expect(await filesystem.exists(path)).toBe(false);
  });

  it('should reject stale identities without treating replay as proof of acquisition', async () => {
    const { filesystem, open } = await fixture();
    const { turns } = open();
    expect(await turns.executions.release({ key, executionId: 'never-held' })).toEqual({ status: 'replayed' });
    expect(await turns.executions.hold({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    expect(await turns.executions.hold({ key, executionId: 'one' })).toEqual({ status: 'replayed' });
    expect(await turns.executions.release({ key: { ...key, attempt: 2 }, executionId: 'one' })).toMatchObject({
      status: 'refused',
      code: 'TURN_UNKNOWN',
    });
    expect(JSON.parse(await filesystem.readFile(path, 'utf8'))).toMatchObject({ executionIds: ['one'] });
  });

  it('should not lose either hold when two roots concurrently update the same record', async () => {
    const { filesystem, open } = await fixture();
    const first = open();
    const second = open();
    expect(
      await Promise.all([
        first.turns.executions.hold({ key, executionId: 'one' }),
        second.turns.executions.hold({ key, executionId: 'two' }),
      ]),
    ).toEqual([{ status: 'applied' }, { status: 'applied' }]);
    expect(JSON.parse(await filesystem.readFile(path, 'utf8'))).toMatchObject({ executionIds: ['one', 'two'] });
  });
});

describe('TurnExecutionCustody checkout discard projection', () => {
  it('should refuse to discard a checkout whose lease still holds an execution, even from a stale registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-custody-discard-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const side = await mkdtemp(join(tmpdir(), 'tau-custody-discard-side-'));
    roots.push(side);
    const sideFilesystem = new NodeFsProvider(side);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => sideFilesystem },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await port.setHead('main');
    await filesystem.writeFile('part.ts', 'one\n');
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['part.ts', 'one\n']]),
      provenance: { source: 'user', actorId: 'ada', createdAt: 1 },
      summary: { generated: 'First' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    const added = await port.addCheckout?.({ branch: 'side', from: head });
    const checkoutId = added?.id ?? '';
    await filesystem.writeFile(path, JSON.stringify({ ...key, checkoutId, startedAt: 1 }));
    const owner = createRevisionActors({
      port,
      projectId: 'project-1',
      filesystem: async (place) => (place.kind === 'live' ? filesystem : sideFilesystem),
    });
    owners.push(owner);
    const discard = async (): Promise<void> =>
      new Promise((resolve, reject) => {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- drives the effect's own logic directly.
        const actor = createActor(owner.checkouts.removeCheckout as Parameters<typeof createActor>[0], {
          input: { projectId: 'project-1', id: checkoutId },
        });
        actor.subscribe({
          next: (snapshot) => {
            if (snapshot.status === 'done') {
              resolve();
            }
          },
          error: reject,
        });
        actor.start();
      });
    expect(await owner.turns.executions.hold({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    // Discard with a registry snapshot that no longer lists the lease: the effect itself refuses.
    await expect(discard()).rejects.toThrow('Running work');
    const retained = await port.listCheckouts?.();
    expect(retained?.some((checkout) => checkout.id === checkoutId)).toBe(true);
    expect(await owner.turns.executions.release({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    await discard();
  }, 30_000);
});

describe('TurnExecutionCustody close racing an in-flight hold', () => {
  it('should never close an attempt behind a hold whose record write is still in flight', async () => {
    const { filesystem } = await fixture();
    const gate = Promise.withResolvers<void>();
    const writing = Promise.withResolvers<void>();
    let gating = false;
    const gated = new Proxy(filesystem, {
      get: (target, name) => {
        const value: unknown = Reflect.get(target, name);
        if (name === 'writeFile') {
          return async (...args: Parameters<typeof target.writeFile>) => {
            if (gating) {
              writing.resolve();
              await gate.promise;
            }
            return target.writeFile(...args);
          };
        }
        return typeof value === 'function' ? (value as (...parameters: unknown[]) => unknown).bind(target) : value;
      },
    });
    const port = createIsomorphicGitRevisionPort({ filesystem });
    const owner = createRevisionActors({ port, projectId: 'race', filesystem: async () => gated });
    owners.push(owner);
    // A first hold and release teaches this root the run, so the close below answers from memory.
    expect(await owner.turns.executions.hold({ key, executionId: 'zero' })).toEqual({ status: 'applied' });
    expect(await owner.turns.executions.release({ key, executionId: 'zero' })).toEqual({ status: 'applied' });

    gating = true;
    const holding = owner.turns.executions.hold({ key, executionId: 'one' });
    await writing.promise;
    expect(await owner.turns.executions.close(key)).toBe('held');
    gating = false;
    gate.resolve();
    expect(await holding).toEqual({ status: 'applied' });

    expect(await owner.turns.executions.close(key)).toBe('held');
    expect(await owner.turns.executions.release({ key, executionId: 'one' })).toEqual({ status: 'applied' });
    expect(await owner.turns.executions.close(key)).toBe('closed');
    expect(await owner.turns.executions.hold({ key, executionId: 'two' })).toMatchObject({
      status: 'refused',
      code: 'REVISIONS_BUSY',
    });
  });
});

describe('TurnExecutionCustody completion admission projection', () => {
  it('should refuse settlement while held and refuse a hold once completion has begun', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-custody-complete-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => filesystem },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const revisions = createProjectRevisionsActor({ port, projectId: 'project-1', filesystem: () => filesystem });
    revisions.actor.start();
    const placement = createTurnPlacementPort({ revisions, openTools: ({ filesystem: view }) => view });
    try {
      const admitted = await placement.admit({ requestId: 'admit', key });
      expect(admitted.status).toBe('applied');
      expect(await revisions.turns.executions.hold({ key, executionId: 'one' })).toEqual({ status: 'applied' });

      // Complete while held: a bounded refusal that keeps the lease and announces nothing.
      expect(await placement.complete({ requestId: 'complete-1', key, cut: true })).toMatchObject({
        status: 'refused',
        code: 'CUT_FAILED',
      });
      expect(await filesystem.exists(path)).toBe(true);
      expect(await placement.complete({ requestId: 'complete-2', key, cut: false })).toMatchObject({
        status: 'refused',
        code: 'CUT_FAILED',
      });

      // Confirmed stop releases the hold; completion then settles, and no later hold can slip in behind it.
      expect(await revisions.turns.executions.release({ key, executionId: 'one' })).toEqual({ status: 'applied' });
      expect(await placement.complete({ requestId: 'complete-3', key, cut: true })).toMatchObject({
        status: 'applied',
      });
      expect(await revisions.turns.executions.hold({ key, executionId: 'two' })).toMatchObject({
        status: 'refused',
        code: 'REVISIONS_BUSY',
      });
    } finally {
      await placement.fence();
      revisions.actor.stop();
      await revisions.settled();
    }
  }, 30_000);
});

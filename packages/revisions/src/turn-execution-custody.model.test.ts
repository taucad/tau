/**
 * TurnExecutionCustody projection onto real protected lease records. This slice
 * covers Hold, stale ReleaseExecution, RecoverRetire and the effect-level
 * checkout Discard check; machine closing-turn admission remains a separate gate.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createActor } from 'xstate';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createRevisionActors } from '#revision-effects.js';
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

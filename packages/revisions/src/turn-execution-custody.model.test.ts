/**
 * TurnExecutionCustody projection onto real protected lease records. This slice
 * covers Hold, stale ReleaseExecution and RecoverRetire; the machine admission
 * and checkout-discard composition remain separate gates.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
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
      status: 'refused', code: 'TURN_UNKNOWN',
    });
    expect(JSON.parse(await filesystem.readFile(path, 'utf8'))).toMatchObject({ executionIds: ['one'] });
  });

  it('should not lose either hold when two roots concurrently update the same record', async () => {
    const { filesystem, open } = await fixture();
    const first = open();
    const second = open();
    expect(await Promise.all([
      first.turns.executions.hold({ key, executionId: 'one' }),
      second.turns.executions.hold({ key, executionId: 'two' }),
    ])).toEqual([{ status: 'applied' }, { status: 'applied' }]);
    expect(JSON.parse(await filesystem.readFile(path, 'utf8'))).toMatchObject({ executionIds: ['one', 'two'] });
  });
});

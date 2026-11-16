/**
 * Captures that land together, through the real effects and the composed
 * project tree over a real store (F1).
 *
 * Two saves at once, two roots of one project saving at once, and a save beside
 * the comparison a write starts must each leave every revision they minted on
 * the branch, as one first-parent line, each row with its own parent, and the
 * head holding every byte written. A save that loses the compare-and-swap is
 * told so and records nothing; the bytes stay for the next cut.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { selectRevisionStatus } from '#project-revisions.machine.js';
import { createProjectRevisionsActor } from '#revision-effects.js';
import type { RevisionFileSystem } from '#revision-effects.js';
import type { RevisionPort } from '#revision-port.js';
import { testIdentity } from '#test/identity.js';

const roots: string[] = [];
const settles: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(settles.splice(0).map(async (settle) => settle()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Answer = Readonly<{ type: string; trigger?: string; requestId?: string; revisionId?: string; reason?: unknown }>;

const answerTypes = new Set(['revisionMinted', 'nothingToSave', 'cutFailed', 'casLost', 'cutCancelled']);

const project = async (files: Readonly<Record<string, string>>) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-concurrent-captures-'));
  roots.push(root);
  const filesystem = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, written in order.
    await filesystem.writeFile(path, content);
  }
  const port = createIsomorphicGitRevisionPort({ filesystem });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  return { filesystem, port };
};

/** One root over the project, as a host runs it; `name` keeps two roots' request ids apart. */
const startRoot = async (port: RevisionPort, filesystem: RevisionFileSystem, name: string) => {
  const created = createProjectRevisionsActor({
    identity: testIdentity,
    port,
    projectId: 'project-1',
    filesystem: async () => filesystem,
    mintFloor: 0,
  });
  settles.push(created.settled);
  const { actor } = created;
  const answers: Answer[] = [];
  actor.on('*', (event) => {
    const answer = event as Answer;
    if (answerTypes.has(answer.type) && answer.requestId !== undefined) {
      answers.push(answer);
    }
  });
  actor.start();
  await expect.poll(() => actor.getSnapshot().context.registrySettled, { timeout: 10_000 }).toBe(true);
  let sent = 0;
  /* Sent, not awaited: the caller decides what lands together. */
  const save = (): string => {
    sent += 1;
    const requestId = `${name}-save-${String(sent)}`;
    actor.send({
      type: 'cut',
      requestId,
      trigger: 'save',
      checkoutId: selectRevisionStatus(actor.getSnapshot()).checkoutId,
      leaseIds: [],
    });
    return requestId;
  };
  const answerOf = async (requestId: string): Promise<Answer> => {
    await expect.poll(() => answers.some((answer) => answer.requestId === requestId), { timeout: 20_000 }).toBe(true);
    return answers.find((answer) => answer.requestId === requestId)!;
  };
  return { actor, save, answerOf };
};

/** The branch's first-parent line, newest first, with each row's parents. */
const line = async (
  port: RevisionPort,
): Promise<ReadonlyArray<Readonly<{ id: string; parents: readonly string[] }>>> => {
  const rows: Array<Readonly<{ id: string; parents: readonly string[] }>> = [];
  let cursor = await port.readRef('main');
  while (cursor !== undefined) {
    // oxlint-disable-next-line no-await-in-loop -- a first-parent walk reads one commit at a time.
    const record = await port.readRevision(revisionId(cursor));
    if (record === undefined) {
      break;
    }
    rows.push({ id: record.id, parents: record.parents });
    cursor = record.parents[0];
  }
  return rows;
};

const headHolds = async (port: RevisionPort, path: string, content: string): Promise<boolean> => {
  const head = await port.readRef('main');
  const tree = await port.readTree(revisionId(head ?? ''));
  const bytes = tree?.get(path);
  return bytes !== undefined && new TextDecoder().decode(bytes) === content;
};

/* Every revision these answers name is on the line, once, after the row before it. */
const expectOnTheLine = async (port: RevisionPort, answers: readonly Answer[]): Promise<void> => {
  const rows = await line(port);
  const ids = rows.map((row) => row.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const [index, row] of rows.entries()) {
    expect(row.parents.slice(0, 1)).toEqual(rows[index + 1] === undefined ? [] : [rows[index + 1]!.id]);
  }
  const minted = answers.flatMap((answer) => (answer.type === 'revisionMinted' ? [answer.revisionId!] : []));
  expect(minted.length).toBeGreaterThan(0);
  expect(minted.filter((id) => !ids.includes(id))).toEqual([]);
};

describe('captures that land together (F1)', () => {
  it('should mint two saves sent at once on one root as rows of one line, holding both edits', async () => {
    const { port, filesystem } = await project({ 'a.txt': 'a0\n', 'b.txt': 'b0\n' });
    const root = await startRoot(port, filesystem, 'one');
    const before = await line(port);

    await filesystem.writeFile('a.txt', 'a1\n');
    const first = root.save();
    await filesystem.writeFile('b.txt', 'b1\n');
    const second = root.save();
    const answers = await Promise.all([root.answerOf(first), root.answerOf(second)]);

    /* The second save finds its bytes in the first mint when that cut read after the second write. */
    const [firstAnswer, secondAnswer] = answers;
    expect(firstAnswer.type).toBe('revisionMinted');
    expect(['revisionMinted', 'nothingToSave']).toContain(secondAnswer.type);
    await expectOnTheLine(port, answers);
    /* One mint for both, or one each: never more rows than saves. */
    const after = await line(port);
    const added = after.length - before.length;
    expect(added).toBeGreaterThanOrEqual(1);
    expect(added).toBeLessThanOrEqual(2);
    expect(await headHolds(port, 'a.txt', 'a1\n')).toBe(true);
    expect(await headHolds(port, 'b.txt', 'b1\n')).toBe(true);
    root.actor.stop();
  }, 60_000);

  it('should keep every save of many sent at once, each edit in the head, on one line', async () => {
    const { port, filesystem } = await project({ 'a.txt': 'a0\n' });
    const root = await startRoot(port, filesystem, 'many');

    const sent: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each save follows its own write.
      await filesystem.writeFile(`n${String(index)}.txt`, `${String(index)}\n`);
      sent.push(root.save());
    }
    const answers = await Promise.all(sent.map(async (requestId) => root.answerOf(requestId)));

    /* A save whose bytes an earlier cut already read answers nothing to save; none fails or loses its swap. */
    for (const answer of answers) {
      expect(['revisionMinted', 'nothingToSave'], JSON.stringify(answer)).toContain(answer.type);
    }
    await expectOnTheLine(port, answers);
    for (let index = 1; index <= 6; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one path at a time.
      expect(await headHolds(port, `n${String(index)}.txt`, `${String(index)}\n`)).toBe(true);
    }
    root.actor.stop();
  }, 60_000);

  it('should leave both roots of one project on one line when they save at once, the loser told and nothing orphaned on the branch', async () => {
    const { port, filesystem } = await project({ 'a.txt': 'a0\n' });
    const left = await startRoot(port, filesystem, 'left');
    const right = await startRoot(port, filesystem, 'right');

    await filesystem.writeFile('a.txt', 'a1\n');
    const leftSave = left.save();
    const rightSave = right.save();
    const answers = await Promise.all([left.answerOf(leftSave), right.answerOf(rightSave)]);

    /* A save is minted, finds its bytes already recorded, or loses the swap and records nothing. */
    for (const answer of answers) {
      expect(['revisionMinted', 'nothingToSave', 'casLost'], JSON.stringify(answer)).toContain(answer.type);
    }
    await expectOnTheLine(port, answers);
    expect(await headHolds(port, 'a.txt', 'a1\n')).toBe(true);
    left.actor.stop();
    right.actor.stop();
  }, 60_000);

  it('should mint a save sent while the write before it is still being compared, holding that write', async () => {
    const { port, filesystem } = await project({ 'a.txt': 'a0\n' });
    const root = await startRoot(port, filesystem, 'compare');

    await filesystem.writeFile('a.txt', 'a1\n');
    /* The write's own comparison starts; the save lands beside it. */
    const { checkoutId } = selectRevisionStatus(root.actor.getSnapshot());
    expect(checkoutId).toBeDefined();
    root.actor.send({
      type: 'changed',
      checkoutId: checkoutId ?? '',
      paths: ['a.txt'],
      generation: 1,
    });
    const save = root.save();
    const answer = await root.answerOf(save);

    expect(answer.type).toBe('revisionMinted');
    await expectOnTheLine(port, [answer]);
    expect(await headHolds(port, 'a.txt', 'a1\n')).toBe(true);
    root.actor.stop();
  }, 60_000);
});

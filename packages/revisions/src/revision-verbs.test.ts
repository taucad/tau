/**
 * The read verbs, over a real port.
 *
 * `Rev N` is the claim under test: it is the first-parent ordinal on the branch
 * and nothing else, so a revision merged in from another branch appears in the
 * history with no number of its own, and deleting nothing renumbers anything.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { readRevisionDiff, readRevisionLog, readRevisionPlace } from '#revision-verbs.js';

const roots: string[] = [];
const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const createdAt = Date.UTC(2026, 8, 12, 9, 0, 0);

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const openPort = async (): Promise<RevisionPort> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revision-verbs-'));
  roots.push(root);
  const port = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(root) });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  return port;
};

const record = async (
  port: RevisionPort,
  options: Readonly<{ parents: readonly RevisionId[]; content: string; actorId: string; summary: string }>,
): Promise<RevisionId> => {
  const receipt = await port.writeRevision({
    parents: options.parents,
    tree: new ImmutableRevisionTree([['part.ts', options.content]]),
    provenance: { source: 'user', actorId: options.actorId, createdAt },
    summary: { generated: options.summary },
  });
  return revisionId(receipt.commitId);
};

describe('revision verbs', () => {
  it('numbers the first-parent line and says where the reader is', async () => {
    const port = await openPort();
    await port.setHead('main');
    const first = await record(port, { parents: [], content: 'one', actorId: 'ada', summary: 'First' });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: first });
    const second = await record(port, { parents: [first], content: 'two', actorId: 'grace', summary: 'Second' });
    await port.updateRef({ name: 'main', expectedHead: first, head: second });

    const rows = await readRevisionLog(port);
    expect(rows.map((row) => [row.revisionNumber, row.summary, row.actor])).toStrictEqual([
      [2, 'Second', 'grace'],
      [1, 'First', 'ada'],
    ]);

    const place = await readRevisionPlace(port);
    expect(place.line).toBe('main · Rev 2');
    expect(place.branch).toBe('main');
    expect(place.revisionId).toBe(second);
    expect(place.branches).toStrictEqual([{ name: 'main', revisionNumber: 2, revisionId: second }]);
  });

  /* W6-a2 R3: History folds consecutive autosaves into one row (A20), and the
   * trigger is the only thing that tells one from a save a person asked for. */
  it('carries what asked for each revision onto its row', async () => {
    const port = await openPort();
    await port.setHead('main');
    const saved = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['part.ts', 'one']]),
      provenance: { source: 'user', actorId: 'ada', trigger: 'save', createdAt },
      summary: { generated: 'Saved' },
    });
    const savedId = revisionId(saved.commitId);
    const idle = await port.writeRevision({
      parents: [savedId],
      tree: new ImmutableRevisionTree([['part.ts', 'two']]),
      provenance: { source: 'user', actorId: 'ada', trigger: 'idle', createdAt },
      summary: { generated: 'Autosaved' },
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(idle.commitId) });

    const rows = await readRevisionLog(port);
    expect(rows.map((row) => row.trigger)).toStrictEqual(['idle', 'save']);
  });

  it('gives a merged-in revision no number of its own on this branch', async () => {
    const port = await openPort();
    await port.setHead('main');
    const base = await record(port, { parents: [], content: 'base', actorId: 'ada', summary: 'Base' });
    const side = await record(port, { parents: [base], content: 'side', actorId: 'ada', summary: 'Side' });
    const merge = await record(port, { parents: [base, side], content: 'merged', actorId: 'ada', summary: 'Merge' });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: merge });

    const rows = await readRevisionLog(port);
    const numbers = new Map(rows.map((row) => [row.summary, row.revisionNumber]));
    expect(numbers.get('Merge')).toBe(2);
    expect(numbers.get('Base')).toBe(1);
    // On the merged side, not on this branch's first-parent line.
    expect(numbers.get('Side')).toBeUndefined();
  });

  it('takes the newest rows when a limit is given, and reads a path diff', async () => {
    const port = await openPort();
    await port.setHead('main');
    let head: RevisionId | undefined;
    const ids: RevisionId[] = [];
    for (let index = 1; index <= 4; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a chain is ordered by construction.
      const next = await record(port, {
        parents: head === undefined ? [] : [head],
        content: `v${String(index)}`,
        actorId: 'ada',
        summary: `Rev ${String(index)}`,
      });
      ids.push(next);
      head = next;
    }
    await port.updateRef({ name: 'main', expectedHead: undefined, head: head! });

    const limited = await readRevisionLog(port, { limit: 2 });
    expect(limited.map((row) => row.revisionNumber)).toStrictEqual([4, 3]);
    expect(await readRevisionDiff(port, ids[0], ids[1]!)).toStrictEqual([{ path: 'part.ts', kind: 'modified' }]);
    expect(await readRevisionDiff(port, undefined, ids[0]!)).toStrictEqual([{ path: 'part.ts', kind: 'added' }]);
  });

  /* Review a1 R8: the fix for an epoch-dated import was made on both legs and
   * asserted on one. This is the browser leg's decode, over a history stock
   * `git` wrote — the same thing a person clones. */
  it.runIf(gitOnPath)('dates a revision it did not write by the revision itself', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revision-verbs-stock-'));
    roots.push(root);
    /* Environment names, not identifiers: assigned rather than spelled as keys,
     * so the fixture's commits never pick up the operator's own git config. */
    const environment: NodeJS.ProcessEnv = { ...process.env };
    environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
    environment['GIT_CONFIG_SYSTEM'] = '/dev/null';
    const git = (...args: readonly string[]): void => {
      execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', env: environment });
    };
    git('init', '--quiet', '--initial-branch=main', '.');
    await writeFile(join(root, 'part.ts'), 'export const part = 1;\n');
    git('add', 'part.ts');
    git('-c', 'user.name=ada', '-c', 'user.email=ada@tau.invalid', 'commit', '--quiet', '-m', 'Imported');

    /* The browser leg reading a stock history: same objects, its own store
     * directory pointed at the `.git` git wrote. */
    const port = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(root), gitDirectory: '.git' });
    const rows = await readRevisionLog(port);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe('import');
    expect(rows[0]?.createdAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
  });

  it('answers a project that has no revisions yet without inventing one', async () => {
    const port = await openPort();
    expect(await readRevisionLog(port)).toStrictEqual([]);
    const place = await readRevisionPlace(port);
    expect(place.revisionNumber).toBeUndefined();
    expect(place.line === 'No revisions yet' || place.line.endsWith('no revisions yet')).toBe(true);
  });
});

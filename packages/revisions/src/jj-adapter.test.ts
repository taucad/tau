/**
 * Defects the RC3 S3 vertical measured against the pinned Jujutsu CLI, one cell
 * each: idempotent `init`, expected-old ref racing, and a push whose refspec
 * matched no bookmark. Skipped — never quietly reduced — where the pinned
 * binary does not resolve.
 */

import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance } from '#revision-authority.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createJjRevisionPort } from '#jj-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { runGitCommand } from '#git-command.js';
import { resolveTestJjExecutable } from '#test-artifacts.js';

const jjExecutable = resolveTestJjExecutable();
const suite = jjExecutable === undefined ? describe.skip : describe;
const author = { name: 'Tau', email: 'tau@example.com' };
const encoder = new TextEncoder();
const provenance: RevisionProvenance = {
  source: 'agent',
  actorId: 'actor-lane',
  createdAt: Date.UTC(2026, 8, 8, 12, 0, 0),
};
const tree = (entries: Record<string, string>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(entries).map(([path, content]) => [path, encoder.encode(content)]));

const roots: string[] = [];

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-jj-adapter-'));
  roots.push(root);
  return root;
};

const openPort = (workspaceRoot: string): RevisionPort =>
  createJjRevisionPort({ workspaceRoot, jjExecutable: jjExecutable!, deadline: 120_000 });

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

suite('createJjRevisionPort', () => {
  it('RC3 C1: initializes an already-initialized repository without failing', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    await expect(port.init({ author })).resolves.toBeUndefined();
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance,
      summary: { generated: 'After a second init' },
    });
    expect(receipt.commitId).toMatch(/^[\da-f]{40}$/u);
  }, 180_000);

  it('RC3 C2: admits exactly one of six concurrent expected-old publications', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    const heads: RevisionId[] = [];
    for (let index = 0; index < 6; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each revision must exist before the next names it.
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'a.txt': `racer-${index}\n` }),
        provenance,
        summary: { generated: `Racer ${index}` },
      });
      heads.push(revisionId(receipt.commitId));
    }
    /* Six callers, one process: the linearization point is `git update-ref`'s
     * own ref lockfile, so the property this asserts also holds across
     * processes — which is exactly what an in-process mutex could not give. */
    const results = await Promise.all(
      heads.map(async (head) => port.updateRef({ name: 'tau-race', expectedHead: undefined, head })),
    );
    expect(results.filter((result) => result.status === 'updated')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'conflicted')).toHaveLength(5);
    const winner = results.find((result) => result.status === 'updated')!;
    await expect(port.readRef('tau-race')).resolves.toBe(winner.head);
  }, 300_000);

  it('RC3 C4: refuses a push whose refspec matches no bookmark', async () => {
    const root = await workspace();
    const remote = join(await workspace(), 'remote');
    await mkdir(remote, { recursive: true });
    await runGitCommand({ gitExecutable: 'git', cwd: remote, args: ['init', '--bare'] });
    const port = openPort(root);
    await port.init({ author });
    await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance,
      summary: { generated: 'Only revision' },
    });
    await expect(port.push({ remote, refspecs: ['no-such-bookmark'] })).rejects.toMatchObject({
      name: 'RevisionPortError',
      code: 'UNKNOWN_REVISION',
    });
  }, 180_000);

  it('7-review S2: reads a ref another writer moved through the colocated store without a jj import', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance,
      summary: { generated: 'Moved from outside jj' },
    });
    /* A second host on the same root publishes through `git update-ref` (the
     * CAS `updateRef` uses) and dies before its `jj git import`. */
    const moved = await runGitCommand({
      gitExecutable: 'git',
      cwd: root,
      args: ['update-ref', 'refs/heads/outside', receipt.commitId],
    });
    expect(moved.exitCode).toBe(0);
    await expect(port.readRef('outside')).resolves.toBe(receipt.commitId);
  }, 180_000);

  it('8-review M2: an engine failure names the operation and never quotes the caller\u2019s strings', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    const remote = join(root, 'secret-workspace', 'private-repo');
    const failure = await port.fetch({ remote, refspecs: [] }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toMatchObject({ name: 'RevisionPortError', code: 'ENGINE_FAILED' });
    expect(failure?.message).toBe('Jujutsu failed the git operation.');
    expect(failure?.message).not.toContain('secret-workspace');
  }, 180_000);

  it('deletes a ref from its expected old value, and it leaves listRefs', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance,
      summary: { generated: 'Only revision' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'tau-delete', expectedHead: undefined, head });
    const afterPublish = await port.listRefs();
    expect(afterPublish.map((reference) => reference.name)).toContain('tau-delete');
    await expect(port.updateRef({ name: 'tau-delete', expectedHead: undefined })).resolves.toMatchObject({
      status: 'conflicted',
      actualHead: head,
    });
    await expect(port.updateRef({ name: 'tau-delete', expectedHead: head })).resolves.toMatchObject({
      status: 'updated',
      previousHead: head,
    });
    const afterDelete = await port.listRefs();
    expect(afterDelete.map((reference) => reference.name)).not.toContain('tau-delete');
    await expect(port.readRef('tau-delete')).resolves.toBeUndefined();
  }, 180_000);

  it('RC6 collision 4: materializes a deleted authored `.tau` control file', async () => {
    const root = await workspace();
    const port = openPort(root);
    await port.init({ author });
    const first = await port.writeRevision({
      parents: [],
      tree: tree({ 'a.txt': 'a\n', '.tau/parameters/overrides.json': '{"stale":true}' }),
      provenance,
      summary: { generated: 'With the authored control file' },
    });
    /* The blanket `.tau` in `defaultProtectedEntries` skipped the whole
     * directory, so the previous revision's authored control file was still on
     * disk when the next snapshot ran and rode into the revision that deleted
     * it (RC6 collision 4). */
    const second = await port.writeRevision({
      parents: [revisionId(first.commitId)],
      tree: tree({ 'a.txt': 'a\n' }),
      provenance,
      summary: { generated: 'Without the authored control file' },
    });
    const recovered = await port.readTree(revisionId(second.commitId));
    expect(recovered?.entries().map((entry) => entry.path)).toStrictEqual(['a.txt']);
    await expect(access(join(root, '.tau/parameters/overrides.json'))).rejects.toThrow();
    // The generated config the clear must never remove survives it.
    await expect(access(join(root, '.tau/jj-config.toml'))).resolves.toBeUndefined();
  }, 180_000);
});

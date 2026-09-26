/**
 * A native push leaves every accepted ref's tracking ref where `fetch` would (W13e).
 *
 * `git push` itself updates `refs/remotes/<remote>/*` only for `refs/heads/*`,
 * so a pushed record ref kept a stale tracking ref and `sync.fetch`'s skip,
 * which compares tracking refs, re-fetched it on desktop. The browser leg
 * writes them after a push; this is the disk leg's same row.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(gitToolchainOnPath)('native push tracking refs', () => {
  it('tracks a pushed chat ref at the oid it pushed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-tracking-'));
    roots.push(root);
    const bare = join(root, 'remote.git');
    execFileSync('git', ['init', '--quiet', '--bare', bare]);
    const repositoryPath = join(root, 'project');
    await mkdir(repositoryPath);
    const port = createNativeGitRevisionPort({ repositoryPath });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: bare });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['chat.json', '{}\n']]),
      provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 26) },
      summary: { generated: 'Chat record' },
      largeObjects: false,
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'refs/tau/chats/c1', expectedHead: undefined, head });

    const pushed = await port.push({ remote: 'origin', refs: [{ name: 'refs/tau/chats/c1' }] });

    expect(pushed.refs).toEqual([{ name: 'refs/tau/chats/c1', status: 'updated', head }]);
    expect(await port.readRef('refs/remotes/origin/tau/chats/c1')).toBe(head);
  });
});

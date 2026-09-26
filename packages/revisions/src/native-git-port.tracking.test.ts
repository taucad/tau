/**
 * A native push leaves every accepted ref's tracking ref where `fetch` would (W13e).
 *
 * `git push` itself updates `refs/remotes/<remote>/*` only for `refs/heads/*`,
 * so a pushed record ref kept a stale tracking ref and `sync.fetch`'s skip,
 * which compares tracking refs, re-fetched it on desktop. The browser leg
 * writes them after a push; this is the disk leg's same row.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('reports and tracks what was pushed when the local ref moves as the push settles (RV-W15)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-tracking-race-'));
    roots.push(root);
    const bare = join(root, 'remote.git');
    execFileSync('git', ['init', '--quiet', '--bare', bare]);
    const repositoryPath = join(root, 'project');
    await mkdir(repositoryPath);
    const setup = createNativeGitRevisionPort({ repositoryPath });
    await setup.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await setup.setRemote({ name: 'origin', url: bare });
    const revision = async (parents: readonly string[], body: string) => {
      const receipt = await setup.writeRevision({
        parents: parents.map((parent) => revisionId(parent)),
        tree: new ImmutableRevisionTree([['chat.json', body]]),
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: 'Chat record' },
        largeObjects: false,
      });
      return revisionId(receipt.commitId);
    };
    const pushedHead = await revision([], '{}\n');
    const mintedDuringPush = await revision([pushedHead], '{"turn":1}\n');
    await setup.updateRef({ name: 'refs/tau/chats/c1', expectedHead: undefined, head: pushedHead });
    /* A mint that lands the moment `git push` returns, before the port reads anything back. */
    const gitExecutable = join(root, 'git-racing-mint');
    await writeFile(
      gitExecutable,
      [
        '#!/bin/sh',
        'git "$@"; status=$?',
        'for argument in "$@"; do',
        `  if [ "$argument" = push ]; then git update-ref refs/tau/chats/c1 ${mintedDuringPush}; break; fi`,
        'done',
        'exit $status',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    const port = createNativeGitRevisionPort({ repositoryPath, gitExecutable });

    const pushed = await port.push({ remote: 'origin', refs: [{ name: 'refs/tau/chats/c1' }] });

    expect(
      execFileSync('git', ['--git-dir', bare, 'rev-parse', 'refs/tau/chats/c1'], { encoding: 'utf8' }).trim(),
    ).toBe(pushedHead);
    expect(pushed.refs).toEqual([{ name: 'refs/tau/chats/c1', status: 'updated', head: pushedHead }]);
    expect(await port.readRef('refs/remotes/origin/tau/chats/c1')).toBe(pushedHead);
    expect(await port.readRef('refs/tau/chats/c1')).toBe(mintedDuringPush);
  });
});

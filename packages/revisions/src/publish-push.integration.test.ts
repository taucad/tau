/**
 * *Publish* on the wire: the tag's lease, and the session that carries the push.
 *
 * Two sentences this file makes demonstrable rather than asserted, both against
 * real `git` and never against a Tau stub:
 *
 * - **P38** — a published name may be *moved*. The publish push carries the
 *   tag's lease (`--force-with-lease` on `refs/tags/<name>`, from the last
 *   advertisement), so re-publishing a name this host last saw succeeds, and a
 *   name somebody else moved is refused as `leaseLost` with the history set
 *   refused alongside it. Never `git tag -f`, never a plain `--force`: the
 *   witness is a stock bare repository whose refs stay exactly where the third
 *   party put them.
 * - **P40** — every native leg to a Tau API remote authenticates with the Tau
 *   session as a per-spawn `http.extraHeader`. The witness is a server that
 *   answers `401` without it: the same port, same repository, refuses to push
 *   with no credential held and pushes with one.
 */

import { execFile, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RevisionId } from '@taucad/filesystem/revisions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { TauApiCredential } from '#native-git-port.js';
import type { RevisionPort, RevisionPushRef } from '#revision-port.js';
import type { RevisionProvenance } from '#revision-authority.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';

/* Asynchronous, always: the P40 fixture's HTTP server shares this event loop,
 * and a synchronous `git` blocks the very server it is talking to. */
const runGit = promisify(execFile);

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'tau@example.com' };
const tauSession = 'Bearer tau-session-w8';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tree = (files: Readonly<Record<string, string>>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(files).map(([path, content]) => [path, encoder.encode(content)]));

const provenance = {
  source: 'user',
  actorId: 'actor-w8',
  createdAt: Date.UTC(2026, 8, 13, 11, 0, 0),
} as const satisfies RevisionProvenance;

/**
 * Write one revision on top of `parent` and move `main` to it.
 *
 * @param port - The store under test.
 * @param parent - The revision the new one descends from, or none.
 * @param files - What the revision's tree holds.
 * @returns The revision `main` now names.
 */
const commit = async (
  port: RevisionPort,
  parent: RevisionId | undefined,
  files: Readonly<Record<string, string>>,
): Promise<RevisionId> => {
  const receipt = await port.writeRevision({
    parents: parent === undefined ? [] : [parent],
    tree: tree(files),
    provenance,
    summary: { generated: 'A revision' },
  });
  const head = revisionId(receipt.commitId);
  await port.updateRef({ name: 'main', expectedHead: parent, head });
  return head;
};

/**
 * The publish push, exactly as `revision-effects` offers it: the history set,
 * atomic, with the tag's lease from the last advertisement.
 *
 * The lease *key* is what leases: absent from the object it would mean "force",
 * present and `undefined` means "must not exist". So both refs always carry it.
 *
 * @param port - The store under test.
 * @param remote - The remote's name.
 * @param tag - The version name being published.
 * @returns Each offered ref's status, in the order offered.
 */
const publishPush = async (
  port: RevisionPort,
  remote: string,
  tag: string,
): Promise<ReadonlyArray<readonly [string, string, string | undefined]>> => {
  const advertised = await port.listRemoteRefs(remote).catch(() => []);
  const held = (name: string): RevisionId | undefined => advertised.find((entry) => entry.name === name)?.head;
  const offered: readonly RevisionPushRef[] = [
    { name: 'refs/heads/main', expected: held('refs/heads/main') },
    { name: `refs/tags/${tag}`, expected: held(`refs/tags/${tag}`) },
  ];
  const result = await port.push({ remote, refs: offered, atomic: true });
  return result.refs.map((entry) => [entry.name, entry.status, entry.reason] as const);
};

describe.runIf(gitOnPath)('P38 — publishing a name again carries its lease', () => {
  let root: string;
  let repositoryPath: string;
  let bare: string;
  let port: RevisionPort;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-w8-publish-lease-'));
    repositoryPath = join(root, 'project');
    bare = join(root, 'remote.git');
    await mkdir(repositoryPath, { recursive: true });
    /* Stock `git`, nothing of Tau's: the remote is a bare repository this
     * suite never touches through the port. */
    await runGit('git', ['init', '--bare', '--initial-branch=main', bare]);
    port = createNativeGitRevisionPort({ repositoryPath });
    await port.init({ author });
    await port.setRemote({ name: 'origin', url: bare });
  }, 120_000);

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  /**
   * What the bare repository holds, read by `git` itself.
   *
   * @param ref - The fully-qualified ref to resolve.
   * @returns The object id, or `''` when the ref does not exist.
   */
  const remoteRef = async (ref: string): Promise<string> => {
    const { stdout } = await runGit('git', ['--git-dir', bare, 'for-each-ref', '--format=%(objectname)', ref]);
    return stdout.trim();
  };

  it('publishes a name, then republishes the same name onto a new revision', async () => {
    const first = await commit(port, undefined, { 'part.ts': 'export const a = 1;\n' });
    await port.tag({ name: 'v1', revisionId: first, note: 'First' });

    expect(await publishPush(port, 'origin', 'v1')).toStrictEqual([
      ['refs/heads/main', 'updated', undefined],
      ['refs/tags/v1', 'updated', undefined],
    ]);
    const firstTagObject = await remoteRef('refs/tags/v1');
    expect(firstTagObject).not.toBe('');

    /* The same *name*, a new revision: this is the move P38 allows. */
    const second = await commit(port, first, { 'part.ts': 'export const a = 2;\n' });
    await port.tag({ name: 'v1', revisionId: second, note: 'First, again' });

    expect(await publishPush(port, 'origin', 'v1')).toStrictEqual([
      ['refs/heads/main', 'updated', undefined],
      ['refs/tags/v1', 'updated', undefined],
    ]);
    expect(await remoteRef('refs/heads/main')).toBe(second);
    expect(await remoteRef('refs/tags/v1')).not.toBe(firstTagObject);
  }, 120_000);

  it('refuses a name somebody else moved, and leaves main where it was', async () => {
    const before = await remoteRef('refs/heads/main');
    const held = await remoteRef('refs/tags/v1');

    /* Somebody else, in the remote, between this host's last fetch and its
     * push: a third tag object the client has never seen. */
    await runGit('git', ['--git-dir', bare, 'tag', '-a', '-m', 'Theirs', '--no-sign', 'scratch', before]);
    const { stdout } = await runGit('git', ['--git-dir', bare, 'rev-parse', 'refs/tags/scratch']);
    const theirs = stdout.trim();
    await runGit('git', ['--git-dir', bare, 'update-ref', 'refs/tags/v1', theirs]);

    const mine = await commit(port, revisionId(before), { 'part.ts': 'export const a = 3;\n' });
    await port.tag({ name: 'v1', revisionId: mine, note: 'Mine' });

    /* The client still leases the value it last saw — `held`, not `theirs`. */
    const result = await port.push({
      remote: 'origin',
      refs: [
        { name: 'refs/heads/main', expected: revisionId(before) },
        { name: 'refs/tags/v1', expected: revisionId(held) },
      ],
      atomic: true,
    });

    expect(result.refs.find((entry) => entry.name === 'refs/tags/v1')).toMatchObject({
      status: 'rejected',
      reason: 'leaseLost',
    });
    /* Atomic: the history set is refused with it, and the remote is untouched. */
    expect(await remoteRef('refs/heads/main')).toBe(before);
    expect(await remoteRef('refs/tags/v1')).toBe(theirs);
  }, 120_000);
});

describe.runIf(gitOnPath)('P40 — a native push to a Tau remote carries the session', () => {
  let root: string;
  let repositoryPath: string;
  let remote: Awaited<ReturnType<typeof startGitHttpBackend>>;
  let credential: TauApiCredential | undefined;
  let port: RevisionPort;
  let head: RevisionId;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-w8-publish-auth-'));
    repositoryPath = join(root, 'project');
    await mkdir(repositoryPath, { recursive: true });
    remote = await startGitHttpBackend({
      root: join(root, 'tau-remote'),
      name: 'project',
      /* The Tau API's own rule, in a fixture: no session, no git. */
      requireAuthorization: tauSession,
    });
    port = createNativeGitRevisionPort({ repositoryPath, tauCredential: () => credential });
    await port.init({ author });
    await port.setRemote({ name: 'origin', url: remote.url });
    head = await commit(port, undefined, { 'part.ts': 'export const a = 1;\n' });
    await port.tag({ name: 'v1', revisionId: head, note: 'First' });
  }, 180_000);

  afterAll(async () => {
    await remote.close();
    await rm(root, { force: true, recursive: true });
  });

  it('is refused with no session held, and pushes with one', async () => {
    credential = undefined;
    await expect(
      port.push({
        remote: 'origin',
        refs: [{ name: 'refs/heads/main', expected: undefined }],
        atomic: true,
      }),
    ).rejects.toThrow(/could not reach the remote/iu);
    expect(await remote.git(['for-each-ref', '--format=%(refname)'])).toBe('');

    /* The same port, the same repository: only the held session differs. */
    credential = { apiBaseUrl: new URL(remote.url).origin, authorization: tauSession };
    const pushed = await port.push({
      remote: 'origin',
      refs: [
        { name: 'refs/heads/main', expected: undefined },
        { name: 'refs/tags/v1', expected: undefined },
      ],
      atomic: true,
    });

    expect(pushed.refs.map((entry) => entry.status)).toStrictEqual(['updated', 'updated']);
    expect(await remote.git(['rev-parse', 'refs/heads/main'])).toBe(head);
    expect(remote.authorizations()).toContain(tauSession);
  }, 180_000);

  it('never offers the session to a remote that is not Tau’s', async () => {
    const before = remote.authorizations().length;
    credential = { apiBaseUrl: 'https://api.tau.invalid', authorization: tauSession };
    /* A remote on another origin: `isTauApiUrl` is false, so no header is
     * minted and this fixture's `401` is what answers. */
    await expect(port.listRemoteRefs('origin')).rejects.toThrow();
    expect(remote.authorizations()).toHaveLength(before);
  }, 120_000);
});

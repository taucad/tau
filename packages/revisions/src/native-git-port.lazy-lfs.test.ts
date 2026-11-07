/**
 * Native large objects fill lazily and from wherever they are (D16).
 *
 * A fetch moves refs only, so the bytes behind a pointer arrive when a read
 * needs them, from each remote that carries large objects in turn; a push to
 * another remote brings what it carries from the one that has it; and the
 * store's own copy is re-made whenever a cut finds it gone.
 */

import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { NativeGitRemoteCredential } from '#native-git-port.js';
import type { RevisionPort } from '#revision-port.js';
import { largeObjectThresholdBytes } from '#workspace-config.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { GitHttpBackendFixture, GitHttpBackendOptions } from '#test/git-http-backend.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Lazy fill', email: 'lazy@example.com' };
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const mint = async (port: RevisionPort, tree: ImmutableRevisionTree): Promise<RevisionId> => {
  const receipt = await port.writeRevision({
    parents: [],
    tree,
    provenance: { source: 'user', actorId: 'test', createdAt: 1 },
    summary: { generated: 'Large file' },
  });
  return revisionId(receipt.commitId);
};

/** A project with one large file, pushed to a Tau remote, and a clone that has fetched its refs only. */
const fetchedProject = async (
  options: Readonly<{
    mirror?: Omit<GitHttpBackendOptions, 'root' | 'name'>;
    remoteCredential?: (mirror: GitHttpBackendFixture) => NativeGitRemoteCredential;
  }> = {},
) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-lazy-lfs-'));
  const tau = await startGitHttpBackend({ root: join(root, 'tau') });
  const mirror = await startGitHttpBackend({ root: join(root, 'mirror'), name: 'mirror', ...options.mirror });
  cleanups.push(async () => {
    await Promise.all([tau.close(), mirror.close()]);
    await rm(root, { recursive: true, force: true });
  });
  const tauCredential = () => ({ apiBaseUrl: tau.url, authorization: 'Bearer session-token' });
  const sourcePath = join(root, 'source');
  await mkdir(sourcePath);
  const source = createNativeGitRevisionPort({ repositoryPath: sourcePath, tauCredential });
  await source.init({ author });
  const bytes = new Uint8Array(largeObjectThresholdBytes + 1024).fill(91);
  const head = await mint(
    source,
    new ImmutableRevisionTree([
      ['large.bin', bytes],
      ['small.txt', 'small\n'],
    ]),
  );
  await source.updateRef({ name: 'main', expectedHead: undefined, head });
  await source.setRemote({ name: 'tau', url: tau.url });
  await source.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] });
  const clonePath = join(root, 'clone');
  await mkdir(clonePath);
  const clone = createNativeGitRevisionPort({
    repositoryPath: clonePath,
    tauCredential,
    ...(options.remoteCredential === undefined ? {} : { remoteCredential: () => options.remoteCredential?.(mirror) }),
  });
  await clone.init({ author });
  await clone.setRemote({ name: 'tau', url: tau.url });
  /* Sorted before `tau`, so it is the remote a fill asks first. */
  await clone.setRemote({ name: 'mirror', url: mirror.url, provider: 'github', repositoryId: '7' });
  await clone.fetch({ remote: 'tau', refs: ['refs/heads/main'] });
  const [oid] = [...tau.objects.keys()];
  return { root, tau, mirror, clone, clonePath, head, bytes, oid: oid! };
};

const downloads = (server: GitHttpBackendFixture): number =>
  server.batches().filter(({ operation }) => operation === 'download').length;

describe.runIf(gitToolchainOnPath)('native lazy large objects (D16)', () => {
  it('fills from the next remote when the first lacks the object', async () => {
    const { tau, mirror, clone, head, bytes } = await fetchedProject();
    expect(downloads(tau)).toBe(0);
    const tree = await clone.readTree(head);
    expect(tree?.get('large.bin')).toEqual(bytes);
    /* The mirror was asked first and had nothing; the read did not stop there. */
    expect(downloads(mirror)).toBeGreaterThan(0);
    expect(downloads(tau)).toBe(1);
  }, 120_000);

  it('answers MISSING_LARGE_OBJECT only when every remote says it lacks the object', async () => {
    const { tau, clone, head, oid } = await fetchedProject();
    (tau.objects as Map<string, Uint8Array<ArrayBuffer>>).delete(oid);
    await expect(clone.readTree(head)).rejects.toMatchObject({ code: 'MISSING_LARGE_OBJECT' });
  }, 120_000);

  it('keeps a remote refusal visible rather than calling the object missing', async () => {
    const { tau, clone, head, oid } = await fetchedProject({ mirror: { requireAuthorization: 'Bearer mirror' } });
    /* The one remote that answered lacks it; the one that refused might hold it. */
    (tau.objects as Map<string, Uint8Array<ArrayBuffer>>).delete(oid);
    const rejection = await clone.readTree(head).then(
      () => undefined,
      (error: unknown) => error as { code?: string },
    );
    /* A 401 from a GitHub remote is its credential to grant again (N1), and the person is told so. */
    expect(rejection?.code).toBe('REMOTE_REAUTHORIZATION_REQUIRED');
  }, 120_000);

  it('answers a local read with the real bytes, never the pointer', async () => {
    const { clone, head, bytes } = await fetchedProject();
    const local = await clone.readTree(head, { largeObjects: 'local', paths: ['large.bin'] });
    expect(local?.get('large.bin')).toEqual(bytes);
    expect(readLfsPointer(local!.get('large.bin')!)).toBeUndefined();
  }, 120_000);

  it('makes one transfer for concurrent reads of one commit', async () => {
    const { tau, clone, head, bytes } = await fetchedProject();
    const [left, right] = await Promise.all([clone.readTree(head), clone.readTree(head)]);
    expect(left?.get('large.bin')).toEqual(bytes);
    expect(right?.get('large.bin')).toEqual(bytes);
    expect(downloads(tau)).toBe(1);
  }, 120_000);

  it('brings a pushed large object from the remote that has it before pushing to another', async () => {
    const { mirror, clone, head, bytes } = await fetchedProject({
      remoteCredential: (server) => ({ repositoryUrl: server.url, authorization: 'Bearer mirror' }),
    });
    await clone.updateRef({ name: 'main', expectedHead: undefined, head });
    await clone.push({ remote: 'mirror', refs: [{ name: 'refs/heads/main' }] });
    expect(await mirror.git(['rev-parse', 'refs/heads/main'])).toBe(head);
    expect([...mirror.objects.values()]).toContainEqual(bytes);
  }, 120_000);
});

describe.runIf(gitToolchainOnPath)('native large-object store', () => {
  it('stores a pruned object again and sweeps an abandoned partial write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-lfs-store-'));
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const bytes = new Uint8Array(largeObjectThresholdBytes + 7).fill(5);
    const tree = new ImmutableRevisionTree([['large.bin', bytes]]);
    const { oid } = lfsPointerFor(bytes).pointer;
    const stored = join(root, '.git', lfsObjectPath(oid));
    await mint(port, tree);
    await rm(stored);
    const abandoned = `${stored}.1.left-by-a-crash.partial`;
    const live = `${stored}.2.being-written.partial`;
    await writeFile(abandoned, 'torn');
    await writeFile(live, 'writing');
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(abandoned, longAgo, longAgo);

    const fresh = createNativeGitRevisionPort({ repositoryPath: root });
    await mint(fresh, tree);
    const read = await fresh.readTree(await mint(fresh, tree));
    expect(read?.get('large.bin')).toEqual(bytes);
    const names = await readdir(join(stored, '..'));
    expect(names).toContain(oid);
    expect(names).toContain(`${oid}.2.being-written.partial`);
    expect(names).not.toContain(`${oid}.1.left-by-a-crash.partial`);

    /* The same port, the same tree: a pruned object is stored again rather than remembered as stored. */
    await rm(stored);
    await mint(fresh, tree);
    expect(await readdir(join(stored, '..'))).toContain(oid);
  }, 60_000);
});

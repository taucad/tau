/**
 * Native large objects fill lazily and from wherever they are (D16).
 *
 * A fetch moves refs only, so the bytes behind a pointer arrive when a
 * fetching read needs them, from each remote that carries large objects in
 * turn, or by their own oid; a `local` read never touches the network; a push
 * to another remote brings what it carries from the one that has it; and the
 * store's own copy is re-made whenever a cut finds it gone.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createLargeObjectFill } from '#large-object-fill.js';
import type { RevisionId } from '#algorithms/index.js';
import { lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { NativeGitRemoteCredential } from '#native-git-port.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  largeObjectThresholdBytes,
} from '#workspace-config.js';

import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { GitHttpBackendFixture, GitHttpBackendOptions } from '#test/git-http-backend.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { recordedBy } from '#test/identity.js';

/* Tau's block, so a cut adds a line for each file over the threshold (D16). */
const tauAttributes = [generatedGitattributesPath, generatedGitattributesContent(undefined)] as const;

const author = { name: 'Lazy fill', email: 'lazy@example.com' };
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

const mint = async (port: RevisionPort, tree: ImmutableRevisionTree, parent?: RevisionId): Promise<RevisionId> => {
  const receipt = await port.writeRevision({
    parents: parent === undefined ? [] : [parent],
    tree,
    provenance: { source: 'user', ...recordedBy('test'), createdAt: 1 },
    summary: { generated: 'Large file' },
  });
  return revisionId(receipt.commitId);
};

/** A project with one large file, pushed to a Tau remote, and a clone that has fetched its refs only. */
const fetchedProject = async (
  options: Readonly<{
    tau?: Omit<GitHttpBackendOptions, 'root' | 'name'>;
    mirror?: Omit<GitHttpBackendOptions, 'root' | 'name'>;
    remoteCredential?: (mirror: GitHttpBackendFixture) => NativeGitRemoteCredential;
    /** A `git` the clone runs in place of the toolchain's, given the fixture's root. */
    cloneGit?: (root: string) => Promise<string>;
    /** Give the clone a checkouts directory, so it can open linked checkouts. */
    checkouts?: boolean;
  }> = {},
) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-lazy-lfs-'));
  const tau = await startGitHttpBackend({ root: join(root, 'tau'), ...options.tau });
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
  /* An older revision's object, which the head no longer names: what an undo would write back. */
  const older = new Uint8Array(largeObjectThresholdBytes + 2048).fill(17);
  const first = await mint(source, new ImmutableRevisionTree([tauAttributes, ['older.bin', older]]));
  const bytes = new Uint8Array(largeObjectThresholdBytes + 1024).fill(91);
  const head = await mint(
    source,
    new ImmutableRevisionTree([tauAttributes, ['large.bin', bytes], ['small.txt', 'small\n']]),
    first,
  );
  await source.updateRef({ name: 'main', expectedHead: undefined, head });
  await source.setRemote({ name: 'tau', url: tau.url });
  await source.push({ remote: 'tau', refs: [{ name: 'refs/heads/main' }] });
  const clonePath = join(root, 'clone');
  await mkdir(clonePath);
  const clone = createNativeGitRevisionPort({
    repositoryPath: clonePath,
    tauCredential,
    ...(options.cloneGit === undefined ? {} : { gitExecutable: await options.cloneGit(root) }),
    ...(options.checkouts === true ? { checkouts: { projectId: 'lazy', directory: join(root, 'checkouts') } } : {}),
    ...(options.remoteCredential === undefined ? {} : { remoteCredential: () => options.remoteCredential?.(mirror) }),
  });
  await clone.init({ author });
  await clone.setRemote({ name: 'tau', url: tau.url });
  /* Sorted before `tau`, so it is the remote a fill asks first. */
  await clone.setRemote({ name: 'mirror', url: mirror.url, provider: 'github', repositoryId: '7' });
  await clone.fetch({ remote: 'tau', refs: ['refs/heads/main'] });
  const { pointer } = lfsPointerFor(bytes);
  const olderPointer = lfsPointerFor(older).pointer;
  const forget = (oid: string): void => {
    (tau.objects as Map<string, Uint8Array<ArrayBuffer>>).delete(oid);
  };
  return { root, tau, mirror, clone, clonePath, head, bytes, older, oid: pointer.oid, pointer, olderPointer, forget };
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
    const { tau, clone, head, oid, forget } = await fetchedProject();
    forget(oid);
    /* Two reads of one commit share one fill, and its failure: the second never starts a round of its own. */
    const [left, right] = await Promise.allSettled([clone.readTree(head), clone.readTree(head)]);
    expect(left).toMatchObject({ status: 'rejected', reason: { code: 'MISSING_LARGE_OBJECT' } });
    expect(right).toMatchObject({ status: 'rejected', reason: { code: 'MISSING_LARGE_OBJECT' } });
    expect(downloads(tau)).toBe(1);
  }, 120_000);

  it('reads every remote lacking the object as MISSING_LARGE_OBJECT whatever else git-lfs prints around it', async () => {
    /* A failed `git lfs fetch` that also draws a progress meter (carriage returns, as under load) and a line this
     * port has never seen: its words settle nothing, so each object is asked by its oid, and the verdict is theirs. */
    const chatty = async (root: string): Promise<string> => {
      const shim = join(root, 'git-chatty');
      await writeFile(
        shim,
        `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const at = args.indexOf('lfs');
const result = spawnSync('git', args, { stdio: ['inherit', 'inherit', 'pipe'] });
process.stderr.write(result.stderr ?? '');
if (at !== -1 && args[at + 1] === 'fetch' && result.status !== 0) {
  process.stderr.write('Downloading LFS objects:   0% (0/1), 0 B | 0 B/s\\rDownloading LFS objects:   0% (0/1), 0 B | 0 B/s\\n');
  process.stderr.write('warning: a git-lfs line this port has never seen\\n');
}
process.exit(result.status ?? 1);
`,
        { mode: 0o755 },
      );
      return shim;
    };
    const { clone, head, bytes } = await fetchedProject({ cloneGit: chatty });
    /* The mirror lacks it and says so in words this port does not know; Tau has it. */
    const tree = await clone.readTree(head);
    expect(tree?.get('large.bin')).toEqual(bytes);
    /* Now no remote has the other one, and both reads that share the fill are told so. */
    const other = await fetchedProject({ cloneGit: chatty });
    other.forget(other.oid);
    const [left, right] = await Promise.allSettled([
      other.clone.readTree(other.head),
      other.clone.readTree(other.head),
    ]);
    expect(left).toMatchObject({ status: 'rejected', reason: { code: 'MISSING_LARGE_OBJECT' } });
    expect(right).toMatchObject({ status: 'rejected', reason: { code: 'MISSING_LARGE_OBJECT' } });
  }, 120_000);

  it('keeps a remote that could not be reached visible beside one that lacks the object', async () => {
    const { mirror, clone, head, oid, forget } = await fetchedProject();
    forget(oid);
    await mirror.close();
    const rejection = await clone.readTree(head).then(
      () => undefined,
      (error: unknown) => error as { code?: string },
    );
    expect(rejection?.code).toBeDefined();
    expect(rejection?.code).not.toBe('MISSING_LARGE_OBJECT');
  }, 120_000);

  it('reads a GitHub repository its batch endpoint does not find as a credential to grant again', async () => {
    const { mirror, clone, head, oid, forget } = await fetchedProject();
    forget(oid);
    /* GitHub answers a repository the token cannot see as not found. */
    await clone.setRemote({
      name: 'mirror',
      url: mirror.url.replace('/mirror.git', '/hidden.git'),
      provider: 'github',
      repositoryId: '7',
    });
    await expect(clone.readTree(head)).rejects.toMatchObject({ code: 'REMOTE_REAUTHORIZATION_REQUIRED' });
  }, 120_000);

  it('keeps a remote refusal visible rather than calling the object missing', async () => {
    const { clone, head, oid, forget } = await fetchedProject({ mirror: { requireAuthorization: 'Bearer mirror' } });
    /* The one remote that answered lacks it; the one that refused might hold it. */
    forget(oid);
    const rejection = await clone.readTree(head).then(
      () => undefined,
      (error: unknown) => error as { code?: string },
    );
    /* A 401 from a GitHub remote is its credential to grant again (N1), and the person is told so. */
    expect(rejection?.code).toBe('REMOTE_REAUTHORIZATION_REQUIRED');
  }, 120_000);

  it('answers a whole-tree local read offline, with the pointer of what is not here', async () => {
    const { tau, mirror, clone, head, oid } = await fetchedProject();
    await Promise.all([tau.close(), mirror.close()]);
    const local = await clone.readTree(head, { largeObjects: 'local' });
    expect(readLfsPointer(local!.get('large.bin')!)?.oid).toBe(oid);
    expect(new TextDecoder().decode(local?.get('small.txt'))).toBe('small\n');
  }, 120_000);

  it('answers a local read whose object no remote has, and fetches nothing for it', async () => {
    const { tau, mirror, clone, head, oid, forget, bytes } = await fetchedProject();
    forget(oid);
    const local = await clone.readTree(head, { largeObjects: 'local' });
    expect(readLfsPointer(local!.get('large.bin')!)?.oid).toBe(oid);
    expect(downloads(tau) + downloads(mirror)).toBe(0);
    /* Once the object is here, a local read answers its bytes. */
    (tau.objects as Map<string, Uint8Array<ArrayBuffer>>).set(oid, bytes);
    await clone.readTree(head);
    const filled = await clone.readTree(head, { largeObjects: 'local' });
    expect(filled?.get('large.bin')).toEqual(bytes);
  }, 120_000);

  it('fetches an object no revision it reads names, by its own oid, from the remote that has it', async () => {
    const { tau, mirror, clone, older, olderPointer } = await fetchedProject();
    const arrived: string[] = [];
    const fetched = await clone.fetchLargeObjects!([olderPointer], {
      onLargeObject: (oid) => arrived.push(oid),
    });
    expect(fetched.get(olderPointer.oid)).toEqual(older);
    expect(arrived).toEqual([olderPointer.oid]);
    expect(downloads(mirror)).toBeGreaterThan(0);
    expect(downloads(tau)).toBe(1);
    /* Stored, so a second ask is answered here. */
    await clone.fetchLargeObjects!([olderPointer]);
    expect(downloads(tau)).toBe(1);
  }, 120_000);

  it('fails a by-oid fetch MISSING_LARGE_OBJECT when no remote has the object', async () => {
    const { clone, olderPointer, forget } = await fetchedProject();
    forget(olderPointer.oid);
    await expect(clone.fetchLargeObjects!([olderPointer])).rejects.toMatchObject({ code: 'MISSING_LARGE_OBJECT' });
  }, 120_000);

  it('settles a by-oid fetch whose delivery throws only once every transfer it started has ended', async () => {
    const { tau, clone, bytes, older, pointer, olderPointer } = await fetchedProject();
    const arrived: string[] = [];
    const fetched = await clone.fetchLargeObjects!([olderPointer, pointer], {
      onLargeObject: (oid) => {
        arrived.push(oid);
        if (arrived.length === 1) {
          throw new Error('ENOSPC: no space left on device');
        }
      },
    });
    /* The other object's transfer was already running; it ended, and was delivered, before the fetch settled. */
    expect(arrived.toSorted()).toEqual([olderPointer.oid, pointer.oid].toSorted());
    expect(fetched.get(olderPointer.oid)).toEqual(older);
    expect(fetched.get(pointer.oid)).toEqual(bytes);
    expect(downloads(tau)).toBe(2);
  }, 120_000);

  it('leaves no pointer text at any path once the placeholder fill completes', async () => {
    const { clone, head, pointer, olderPointer } = await fetchedProject();
    const place: Checkout = {
      id: 'live',
      projectId: 'p1',
      root: '/p1',
      kind: 'live',
      branch: 'main',
      baseRevisionId: head,
    };
    /* The head names one placeholder; an undo wrote the other, which no revision read here names. */
    const pointerText = (object: Readonly<{ oid: string; size: number }>): Uint8Array<ArrayBuffer> =>
      new TextEncoder().encode(
        `version https://git-lfs.github.com/spec/v1\noid sha256:${object.oid}\nsize ${String(object.size)}\n`,
      );
    const files = new Map<string, Uint8Array<ArrayBuffer>>([
      ['large.bin', pointerText(pointer)],
      ['restored.bin', pointerText(olderPointer)],
      ['small.txt', new TextEncoder().encode('small\n')],
    ]);
    const fill = createLargeObjectFill({
      port: clone,
      capture: async () => new ImmutableRevisionTree([...files]),
      withCheckoutFence: async (_id, operation) => operation(),
      materializeTree: async (_place, target) => {
        for (const { path, content } of target.entries()) {
          files.set(path, content);
        }
      },
      flushMilliseconds: 1,
      reportMilliseconds: 1,
    });
    await fill.fill(place, head);
    await fill.stop();
    expect([...files].filter(([, content]) => readLfsPointer(content) !== undefined)).toEqual([]);
    expect(files.get('restored.bin')?.byteLength).toBe(olderPointer.size);
  }, 120_000);

  it('opens a linked checkout over a large object that has not arrived, and the fill brings its bytes', async () => {
    const { tau, mirror, clone, head, bytes } = await fetchedProject({ checkouts: true });
    await clone.updateRef({ name: 'side', expectedHead: undefined, head });
    /* The network is down: neither remote answers while the checkout opens. */
    await clone.setRemote({ name: 'tau', url: 'http://127.0.0.1:9/project.git' });
    await clone.setRemote({
      name: 'mirror',
      url: 'http://127.0.0.1:9/mirror.git',
      provider: 'github',
      repositoryId: '7',
    });
    const linked = await clone.addCheckout!({ branch: 'side' });
    const placeholder = await readFile(join(linked.root, 'large.bin'));
    expect(readLfsPointer(new Uint8Array(placeholder))).toMatchObject({ size: bytes.byteLength });
    expect(downloads(tau) + downloads(mirror)).toBe(0);
    /* The network returns, and the host's fill writes the bytes over the placeholder. */
    await clone.setRemote({ name: 'tau', url: tau.url });
    await clone.setRemote({ name: 'mirror', url: mirror.url, provider: 'github', repositoryId: '7' });
    const read = async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
      new Uint8Array(await readFile(join(linked.root, path)));
    const fill = createLargeObjectFill({
      port: clone,
      capture: async () =>
        new ImmutableRevisionTree([
          [generatedGitattributesPath, await read(generatedGitattributesPath)],
          ['large.bin', await read('large.bin')],
          ['small.txt', await read('small.txt')],
        ]),
      withCheckoutFence: async (_id, operation) => operation(),
      materializeTree: async (_place, target) => {
        for (const { path, content } of target.entries()) {
          // oxlint-disable-next-line no-await-in-loop -- three files, in order.
          await writeFile(join(linked.root, path), content);
        }
      },
      flushMilliseconds: 1,
      reportMilliseconds: 1,
    });
    await fill.fill(linked, revisionId(head));
    await fill.stop();
    expect(await read('large.bin')).toEqual(bytes);
    const git = async (...args: string[]): Promise<string> => {
      const { stdout } = await promisify(execFile)('git', ['-C', linked.root, ...args]);
      return stdout;
    };
    expect(await git('status', '--porcelain')).toBe('');
    expect(await git('lfs', 'status', '--porcelain')).toBe('');
  }, 120_000);

  it('makes one transfer for concurrent reads of one commit', async () => {
    const { tau, clone, head, bytes } = await fetchedProject();
    const [left, right] = await Promise.all([clone.readTree(head), clone.readTree(head)]);
    expect(left?.get('large.bin')).toEqual(bytes);
    expect(right?.get('large.bin')).toEqual(bytes);
    expect(downloads(tau)).toBe(1);
  }, 120_000);

  it('brings a pushed large object from the remote that has it before pushing to another', async () => {
    /* Each server takes only its own credential, so the push proves which one went where. */
    const { tau, mirror, clone, head, bytes } = await fetchedProject({
      tau: { requireAuthorization: 'Bearer session-token' },
      mirror: { requireAuthorization: 'Bearer mirror' },
      remoteCredential: (server) => ({ repositoryUrl: server.url, authorization: 'Bearer mirror' }),
    });
    await clone.updateRef({ name: 'main', expectedHead: undefined, head });
    await clone.push({ remote: 'mirror', refs: [{ name: 'refs/heads/main' }] });
    expect(await mirror.git(['rev-parse', 'refs/heads/main'])).toBe(head);
    expect([...mirror.objects.values()]).toContainEqual(bytes);
    expect(downloads(tau)).toBeGreaterThan(0);
    expect(tau.authorizations()).not.toContain('Bearer mirror');
    expect(mirror.authorizations()).not.toContain('Bearer session-token');
  }, 120_000);

  it('refuses any other remote while a GitHub credential is held, a Tau-named one included', async () => {
    const { clone } = await fetchedProject({
      remoteCredential: (server) => ({ repositoryUrl: server.url, authorization: 'Bearer mirror' }),
    });
    await clone.setRemote({ name: 'other', url: 'http://127.0.0.1:9/elsewhere.git' });
    await expect(clone.fetch({ remote: 'other', refs: ['refs/heads/main'] })).rejects.toMatchObject({
      code: 'INVALID_TRANSPORT',
    });
    /* The name is not what makes a remote Tau's: its address is. */
    await clone.setRemote({ name: 'tau', url: 'http://127.0.0.1:9/not-tau.git' });
    await expect(clone.fetch({ remote: 'tau', refs: ['refs/heads/main'] })).rejects.toMatchObject({
      code: 'INVALID_TRANSPORT',
    });
  }, 120_000);
});

describe.runIf(gitToolchainOnPath)('native large-object store', () => {
  it('answers a stored read with the pointer of each object it holds whole, and refuses a short one (W11.3)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-lfs-stored-'));
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const bytes = new Uint8Array(largeObjectThresholdBytes + 9).fill(4);
    const { pointer, bytes: pointerBytes } = lfsPointerFor(bytes);
    const head = await mint(
      port,
      new ImmutableRevisionTree([tauAttributes, ['large.bin', bytes], ['small.txt', 'small\n']]),
    );

    const stored = await port.readTree(head, { largeObjects: 'stored' });
    expect(stored?.get('large.bin')).toStrictEqual(pointerBytes);
    expect(new TextDecoder().decode(stored?.get('small.txt'))).toBe('small\n');

    await writeFile(join(root, '.git', lfsObjectPath(pointer.oid)), bytes.subarray(1));
    await expect(port.readTree(head, { largeObjects: 'stored' })).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
  });

  it('stores a pruned object again and sweeps an abandoned partial write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-lfs-store-'));
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const bytes = new Uint8Array(largeObjectThresholdBytes + 7).fill(5);
    const tree = new ImmutableRevisionTree([tauAttributes, ['large.bin', bytes]]);
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

  /* D9 on the native leg: a read and a store of the repository's own LFS store, never routed through a fetch. */
  it('reads and stores one large object in place, by its pointer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-lfs-store-'));
    cleanups.push(async () => rm(root, { recursive: true, force: true }));
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const bytes = new Uint8Array(4096).fill(8);
    const { pointer } = lfsPointerFor(bytes);
    const stored = join(root, '.git', lfsObjectPath(pointer.oid));

    expect(await port.readLargeObject!(pointer)).toBeUndefined();
    await port.storeLargeObject!(pointer, bytes);
    expect(await port.readLargeObject!(pointer)).toStrictEqual(bytes);
    const names = await readdir(join(stored, '..'));
    expect(names.filter((name) => name.endsWith('.partial'))).toStrictEqual([]);

    /* A repeat writes nothing; a file of the wrong size at the name is no object, and a store replaces it. */
    const first = await stat(stored);
    await port.storeLargeObject!(pointer, bytes);
    const again = await stat(stored);
    expect(again.mtimeMs).toBe(first.mtimeMs);
    await writeFile(stored, 'torn');
    expect(await port.readLargeObject!(pointer)).toBeUndefined();
    await port.storeLargeObject!(pointer, bytes);
    expect(await port.readLargeObject!(pointer)).toStrictEqual(bytes);

    await expect(port.storeLargeObject!(pointer, bytes.subarray(1))).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
    const descriptor = await port.describe();
    expect(descriptor.keepsLargeObjectFiles).toBe(true);
  });
});

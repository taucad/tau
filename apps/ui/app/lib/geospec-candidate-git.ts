/** Private, optional GeoSpec candidate transport; foreign bytes are never proof. */
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import { readBlob, readTree } from 'isomorphic-git';
import { sha256Bytes } from '@taucad/utils/hash';
import type { RootedFileSystem } from '@taucad/filesystem';
import type { RevisionPort, RevisionPushRef } from '@taucad/revisions';
import { candidateConsentChannelName, withCandidateConsentLock } from '#lib/geospec-candidate-consent.js';

export const geoSpecCandidateRef = 'refs/tau/artifacts/geospec-candidates';
const maximumClosureBytes = 16 * 1024 * 1024;
const candidatePath = (hash: string): string => `candidates/${hash}.json`;
const candidatePathPattern = /^candidates\/([0-9a-f]{64})\.json$/u;
const lfsPointer = 'version https://git-lfs.github.com/spec/v1\n';
const decoder = new TextDecoder('utf-8', { fatal: true });
type CandidateGitFileSystem = Pick<RootedFileSystem, 'readFile' | 'readdir' | 'stat'>;

/** Read Git objects in the project root without the revision port's LFS smudge. */
const rawGit = (filesystem: CandidateGitFileSystem) => {
  const at = (path: string): string =>
    path
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
      .join('/');
  const stats = async (path: string) => {
    const stat = await filesystem.stat(at(path));
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      isFile: () => stat.type !== 'dir',
      isDirectory: () => stat.type === 'dir',
      isSymbolicLink: () => false,
    };
  };
  return {
    promises: {
      readFile: async (path: string, encoding?: string | { encoding?: string }) =>
        (typeof encoding === 'string' ? encoding : encoding?.encoding) === 'utf8'
          ? filesystem.readFile(at(path), 'utf8')
          : filesystem.readFile(at(path)),
      readdir: async (path: string) => filesystem.readdir(at(path)),
      stat: stats,
      lstat: stats,
      writeFile: () => {
        throw new Error('Candidate Git reader is read-only.');
      },
      unlink: () => {
        throw new Error('Candidate Git reader is read-only.');
      },
      mkdir: () => {
        throw new Error('Candidate Git reader is read-only.');
      },
      rmdir: () => {
        throw new Error('Candidate Git reader is read-only.');
      },
      readlink: () => {
        throw new Error('Candidate Git reader does not follow symlinks.');
      },
      symlink: () => {
        throw new Error('Candidate Git reader is read-only.');
      },
    },
  };
};

const requireConsent = async (readConsent: () => Promise<boolean>): Promise<void> => {
  if (!(await readConsent())) {
    throw new Error('GeoSpec candidate sharing is off on this device.');
  }
};

export const readCandidateTree = async (
  port: RevisionPort,
  filesystem: CandidateGitFileSystem,
  head: ReturnType<typeof revisionId>,
): Promise<ImmutableRevisionTree> => {
  const record = await port.readRevision(head);
  if (record === undefined) {
    throw new Error('GeoSpec candidate ref must name a parentless snapshot.');
  }
  if (record.parents.length > 0) {
    throw new Error('GeoSpec candidate ref must name a parentless snapshot.');
  }
  const fs = rawGit(filesystem);
  const root = await readTree({ fs, gitdir: '.git', oid: record.treeId });
  const candidateRoot = root.tree[0];
  if (root.tree.length !== 1 || candidateRoot?.path !== 'candidates' || candidateRoot.type !== 'tree') {
    throw new Error('GeoSpec candidate closure contains a foreign path.');
  }
  const { tree } = await readTree({ fs, gitdir: '.git', oid: candidateRoot.oid });
  if (tree.length > 32) {
    throw new Error('GeoSpec candidate closure exceeds its entry limit.');
  }
  const entries: Array<readonly [string, Uint8Array<ArrayBuffer>, '100644']> = [];
  let total = 0;
  for (const entry of tree) {
    const path = `candidates/${entry.path}`;
    if (entry.type !== 'blob' || entry.mode !== '100644' || !candidatePathPattern.test(path)) {
      throw new Error('GeoSpec candidate closure contains a foreign object.');
    }
    // oxlint-disable-next-line no-await-in-loop -- Foreign blobs are bounded and read one at a time.
    const { blob } = await readBlob({ fs, gitdir: '.git', oid: entry.oid });
    total += blob.byteLength;
    if (total > maximumClosureBytes) {
      throw new Error('GeoSpec candidate closure exceeds its byte limit.');
    }
    entries.push([path, new Uint8Array(blob), '100644']);
  }
  return new ImmutableRevisionTree(entries);
};

export const validTree = async (tree: ImmutableRevisionTree): Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>> => {
  if (tree.byteLength > maximumClosureBytes || tree.size > 32) {
    throw new Error('GeoSpec candidate closure exceeds its byte limit.');
  }
  const candidates: Array<Uint8Array<ArrayBuffer>> = [];
  for (const entry of tree.entries()) {
    const match = candidatePathPattern.exec(entry.path);
    if (
      match === null ||
      entry.mode !== '100644' ||
      entry.content.byteLength === 0 ||
      decoder.decode(entry.content).startsWith(lfsPointer) ||
      // oxlint-disable-next-line no-await-in-loop -- The bounded closure is checked sequentially.
      (await sha256Bytes(entry.content)) !== match[1]
    ) {
      throw new Error('GeoSpec candidate closure has a malformed or nonlocal object.');
    }
    candidates.push(entry.content);
  }
  return candidates;
};

/** Fetch one exact candidate ref, then return integrity-checked foreign bytes for local recomputation. */
export const fetchGeoSpecCandidates = async (
  input: Readonly<{
    projectId: string;
    port: RevisionPort;
    filesystem: CandidateGitFileSystem;
    remote: string;
    readConsent: () => Promise<boolean>;
    signal?: AbortSignal;
    abort?: () => void;
  }>,
): Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>> => {
  const channel = new BroadcastChannel(candidateConsentChannelName);
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
    input.abort?.();
  };
  channel.addEventListener('message', (event: MessageEvent<unknown>): void => {
    const value = event.data;
    if (
      typeof value === 'object' &&
      value !== null &&
      'projectId' in value &&
      'enabled' in value &&
      value.projectId === input.projectId &&
      value.enabled === false
    ) {
      abort();
    }
  });
  input.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (input.signal?.aborted) {
      abort();
    }
    await requireConsent(input.readConsent);
    controller.signal.throwIfAborted();
    const fetched = await input.port.fetch({
      remote: input.remote,
      refs: [geoSpecCandidateRef],
      maximumTransferBytes: maximumClosureBytes,
      signal: controller.signal,
    });
    const head = fetched.refs.find(
      (entry) => entry.name === `refs/remotes/${input.remote}/tau/artifacts/geospec-candidates`,
    )?.head;
    const candidates =
      head === undefined ? [] : await validTree(await readCandidateTree(input.port, input.filesystem, head));
    await requireConsent(input.readConsent);
    controller.signal.throwIfAborted();
    return candidates;
  } finally {
    input.signal?.removeEventListener('abort', abort);
    channel.close();
  }
};

/** Publish a locally established candidate only, with a separate exact-ref lease. */
export const publishGeoSpecCandidate = async (
  input: Readonly<{
    projectId: string;
    port: RevisionPort;
    filesystem: CandidateGitFileSystem;
    remote: string;
    candidate: Uint8Array<ArrayBuffer>;
    readConsent: () => Promise<boolean>;
    signal?: AbortSignal;
    abort?: () => void;
  }>,
): Promise<'updated' | 'upToDate' | 'rejected'> => {
  const channel = new BroadcastChannel(candidateConsentChannelName);
  channel.addEventListener('message', (event: MessageEvent<unknown>): void => {
    const value = event.data;
    if (
      typeof value === 'object' &&
      value !== null &&
      'projectId' in value &&
      'enabled' in value &&
      value.projectId === input.projectId &&
      value.enabled === false
    ) {
      input.abort?.();
    }
  });
  try {
    await requireConsent(input.readConsent);
    if (input.candidate.byteLength === 0 || input.candidate.byteLength > maximumClosureBytes) {
      throw new Error('GeoSpec candidate exceeds its byte limit.');
    }
    const remoteHead = await input.port.readRef(`refs/remotes/${input.remote}/tau/artifacts/geospec-candidates`);
    const prior =
      remoteHead === undefined
        ? new ImmutableRevisionTree([])
        : await readCandidateTree(input.port, input.filesystem, remoteHead);
    await validTree(prior);
    const hash = await sha256Bytes(input.candidate);
    const path = candidatePath(hash);
    if (prior.has(path)) {
      return 'upToDate';
    }
    const tree = new ImmutableRevisionTree([
      ...prior.entries().map(({ path: name, content, mode }) => [name, content, mode] as const),
      [path, input.candidate] as const,
    ]);
    await validTree(tree);
    await requireConsent(input.readConsent);
    const receipt = await input.port.writeRevision({
      // A snapshot, not inherited remote history: fetching this exact ref never needs an old chain.
      parents: [],
      tree,
      largeObjects: false,
      provenance: { source: 'user', actorId: 'geospec-candidate', createdAt: Date.now() },
      summary: { generated: 'Share locally verified GeoSpec candidate' },
    });
    const localHead = await input.port.readRef(geoSpecCandidateRef);
    const moved = await input.port.updateRef({
      name: geoSpecCandidateRef,
      expectedHead: localHead,
      head: revisionId(receipt.commitId),
    });
    if (moved.status !== 'updated') {
      return 'rejected';
    }
    return await withCandidateConsentLock(input.projectId, async () => {
      await requireConsent(input.readConsent);
      if (input.signal?.aborted) {
        throw new Error('GeoSpec candidate publication was cancelled.');
      }
      const offer: RevisionPushRef = { name: geoSpecCandidateRef, expected: remoteHead };
      const pushed = await input.port.push({ remote: input.remote, refs: [offer] });
      return pushed.refs[0]?.status ?? 'rejected';
    });
  } finally {
    channel.close();
  }
};

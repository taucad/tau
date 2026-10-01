// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { sha256Bytes } from '@taucad/utils/hash';
import type { RevisionPort } from '@taucad/revisions';
import {
  fetchGeoSpecCandidates,
  publishGeoSpecCandidate,
  readCandidateTree,
  validTree,
} from '#lib/geospec-candidate-git.js';

const encoder = new TextEncoder();
const provenance = { source: 'user', actorId: 'candidate-test', createdAt: 0 } as const;

describe('raw candidate closure', () => {
  it('reads a parentless candidate without the revision port tree reader', async () => {
    const filesystem = new MemoryProvider();
    try {
      const port = createIsomorphicGitRevisionPort({ filesystem });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      const candidate = encoder.encode('{"schema":"candidate-test"}');
      const hash = await sha256Bytes(candidate);
      const tree = new ImmutableRevisionTree([[`candidates/${hash}.json`, candidate]]);
      const receipt = await port.writeRevision({
        parents: [],
        tree,
        largeObjects: false,
        provenance,
        summary: { generated: 'Candidate' },
      });
      const readTree = vi.fn(async () => {
        throw new Error('smudge must not run');
      });
      const loaded = await readCandidateTree({ ...port, readTree }, filesystem, revisionId(receipt.commitId));
      expect(loaded.get(`candidates/${hash}.json`)).toEqual(candidate);
      expect(readTree).not.toHaveBeenCalled();
    } finally {
      filesystem.dispose();
    }
  });

  it('rejects inherited and foreign-path closures before accepting blobs', async () => {
    const filesystem = new MemoryProvider();
    try {
      const port = createIsomorphicGitRevisionPort({ filesystem });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      const tree = new ImmutableRevisionTree([['outside.json', encoder.encode('{}')]]);
      const first = await port.writeRevision({
        parents: [],
        tree,
        largeObjects: false,
        provenance,
        summary: { generated: 'Foreign' },
      });
      await expect(readCandidateTree(port, filesystem, revisionId(first.commitId))).rejects.toThrow('foreign path');
      const second = await port.writeRevision({
        parents: [revisionId(first.commitId)],
        tree,
        largeObjects: false,
        provenance,
        summary: { generated: 'Inherited' },
      });
      await expect(readCandidateTree(port, filesystem, revisionId(second.commitId))).rejects.toThrow('parentless');
    } finally {
      filesystem.dispose();
    }
  });

  it('rejects LFS pointers, tampered names, oversized contents and too many entries', async () => {
    const pointer = encoder.encode(
      'version https://git-lfs.github.com/spec/v1\noid sha256:' + '0'.repeat(64) + '\nsize 1\n',
    );
    const hash = await sha256Bytes(pointer);
    await expect(validTree(new ImmutableRevisionTree([[`candidates/${hash}.json`, pointer]]))).rejects.toThrow(
      'malformed or nonlocal',
    );
    await expect(
      validTree(new ImmutableRevisionTree([[`candidates/${'0'.repeat(64)}.json`, encoder.encode('{}')]])),
    ).rejects.toThrow('malformed or nonlocal');
    await expect(
      validTree(new ImmutableRevisionTree([[`candidates/${hash}.json`, new Uint8Array(16 * 1024 * 1024 + 1)]])),
    ).rejects.toThrow('byte limit');
    const entries = Array.from(
      { length: 33 },
      (_, index) => [`candidates/${index.toString(16).padStart(64, '0')}.json`, encoder.encode('{}')] as const,
    );
    await expect(validTree(new ImmutableRevisionTree(entries))).rejects.toThrow('byte limit');
  });

  it('keeps default-off consent away from fetch and push', async () => {
    const filesystem = new MemoryProvider();
    try {
      const port = mock<RevisionPort>();
      const common = { projectId: 'p1', port, filesystem, remote: 'origin', readConsent: async () => false };
      await expect(fetchGeoSpecCandidates(common)).rejects.toThrow('off on this device');
      await expect(publishGeoSpecCandidate({ ...common, candidate: encoder.encode('{}') })).rejects.toThrow(
        'off on this device',
      );
      expect(port.fetch).not.toHaveBeenCalled();
      expect(port.push).not.toHaveBeenCalled();
    } finally {
      filesystem.dispose();
    }
  });

  it('returns upToDate for the same valid bytes without moving an authored ref', async () => {
    const filesystem = new MemoryProvider();
    try {
      const port = createIsomorphicGitRevisionPort({ filesystem });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      const candidate = encoder.encode('{"schema":"candidate-test"}');
      const hash = await sha256Bytes(candidate);
      const receipt = await port.writeRevision({
        parents: [],
        largeObjects: false,
        tree: new ImmutableRevisionTree([[`candidates/${hash}.json`, candidate]]),
        provenance,
        summary: { generated: 'Candidate' },
      });
      const head = revisionId(receipt.commitId);
      await port.updateRef({
        name: 'refs/remotes/origin/tau/artifacts/geospec-candidates',
        expectedHead: undefined,
        head,
      });
      await port.updateRef({ name: 'refs/heads/main', expectedHead: undefined, head });
      const status = await publishGeoSpecCandidate({
        projectId: 'p1',
        port,
        filesystem,
        remote: 'origin',
        candidate,
        readConsent: async () => true,
      });
      expect(status).toBe('upToDate');
      expect(await port.readRef('refs/heads/main')).toBe(head);
      expect(await port.readRef('refs/tau/artifacts/geospec-candidates')).toBeUndefined();
    } finally {
      filesystem.dispose();
    }
  });

  it('rechecks opt-out under the publication lock before pushing', async () => {
    const filesystem = new MemoryProvider();
    vi.stubGlobal('navigator', {
      locks: {
        request: async (...args: unknown[]) => {
          const work = args.at(-1) as (() => Promise<unknown>) | undefined;
          if (work === undefined) {
            throw new Error('Expected Web Lock callback.');
          }
          return work();
        },
      },
    });
    try {
      const port = createIsomorphicGitRevisionPort({ filesystem });
      await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
      const push = vi.fn();
      let reads = 0;
      await expect(
        publishGeoSpecCandidate({
          projectId: 'p1',
          port: { ...port, push },
          filesystem,
          remote: 'origin',
          candidate: encoder.encode('{}'),
          readConsent: async () => ++reads < 3,
        }),
      ).rejects.toThrow('off on this device');
      expect(reads).toBe(3);
      expect(push).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      filesystem.dispose();
    }
  });
});

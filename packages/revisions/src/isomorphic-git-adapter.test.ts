import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { FileSystemProvider } from '@taucad/filesystem';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = { source: 'user', actorId: 'tag-lock-test', createdAt: 1_756_742_400_000 } as const;
const providers: MemoryProvider[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const tree = (content: string): ImmutableRevisionTree =>
  new ImmutableRevisionTree([['part.scad', encoder.encode(content)]]);

describe('isomorphic-git tag ref locking', () => {
  it('should serialize a local tag move after another materialization of the same ref', async () => {
    const locks = new Map<string, Promise<void>>();
    const requestedLocks: string[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: async <T>(name: string, _options: LockOptions, operation: () => Promise<T>): Promise<T> => {
          if (!name.startsWith('tau:revision-ref:')) {
            return operation();
          }
          requestedLocks.push(name);
          const previous = locks.get(name) ?? Promise.resolve();
          const release = Promise.withResolvers<void>();
          const held = async (): Promise<void> => {
            await previous;
            await release.promise;
          };
          locks.set(name, held());
          await previous;
          try {
            return await operation();
          } finally {
            release.resolve();
          }
        },
      },
    });
    const storage = new MemoryProvider();
    providers.push(storage);
    const materializationReached = Promise.withResolvers<void>();
    const releaseMaterialization = Promise.withResolvers<void>();
    let delayTagWrite = false;
    const filesystem = Object.assign(Object.create(storage) as FileSystemProvider, {
      writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
        if (delayTagWrite && path.endsWith('refs/tags/v1')) {
          delayTagWrite = false;
          materializationReached.resolve();
          await releaseMaterialization.promise;
        }
        await storage.writeFile(path, data);
      },
    });
    const materializer = createIsomorphicGitRevisionPort({ filesystem });
    const mover = createIsomorphicGitRevisionPort({ filesystem: storage });
    await materializer.init({ author });
    const first = await materializer.writeRevision({
      parents: [],
      tree: tree('cube(1);\n'),
      provenance,
      summary: { generated: 'First' },
    });
    const firstRevision = revisionId(first.commitId);
    const second = await materializer.writeRevision({
      parents: [firstRevision],
      tree: tree('cube(2);\n'),
      provenance,
      summary: { generated: 'Second' },
    });
    await materializer.tag({ name: 'v1', revisionId: firstRevision, note: 'Local move', createdAt: 100 });
    await materializer.tag({
      name: 'v1',
      revisionId: revisionId(second.commitId),
      note: 'Fetched version',
      createdAt: 200,
    });
    const previousTag = await materializer.readRef('refs/tags/v1');

    delayTagWrite = true;
    const materializing = materializer.updateRef({
      name: 'refs/tags/v1',
      expectedHead: previousTag,
      head: revisionId(second.commitId),
    });
    await materializationReached.promise;
    const moving = mover.tag({ name: 'v1', revisionId: firstRevision, note: 'Local move', createdAt: 100 });
    const beforeRelease = await Promise.race([
      moving.then(() => 'moved'),
      new Promise<'waiting'>((resolve) => {
        setTimeout(() => {
          resolve('waiting');
        }, 100);
      }),
    ]);
    releaseMaterialization.resolve();
    await Promise.all([materializing, moving]);

    expect(beforeRelease).toBe('waiting');
    expect(await mover.listTags()).toEqual([
      expect.objectContaining({ name: 'v1', revisionId: firstRevision, note: 'Local move' }),
    ]);
    expect(new Set(requestedLocks.filter((name) => name.endsWith('refs/tags/v1')))).toEqual(
      new Set([`tau:revision-ref:${storage.id}:.tau/revisions:refs/tags/v1`]),
    );
  });
});

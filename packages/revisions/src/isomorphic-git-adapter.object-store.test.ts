/**
 * W2 gates for the browser leg's object store (charter D7, I6).
 *
 * - Reads go through Tau's pack reader: `isomorphic-git`'s object readers and
 *   writers are never called, a packed object costs one table lookup and one
 *   range read, and no pack is read whole.
 * - `.git/**` never enters the mutation pipeline: a store driven through a
 *   rooted view raises no change event and takes no pipeline claim for it.
 */
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { FileReadStreamOptions } from '@taucad/filesystem';
import type * as IsomorphicGit from 'isomorphic-git';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { ObjectStore } from '#object-store/object-store.js';

/* Every library object reader and writer, recorded: none may be reached. */
const libraryObjectCalls = vi.hoisted((): string[] => []);

vi.mock('isomorphic-git', async (importOriginal) => {
  const actual = await importOriginal<typeof IsomorphicGit>();
  const recorded =
    <Arguments extends unknown[], Result>(name: string, call: (...input: Arguments) => Promise<Result>) =>
    async (...input: Arguments): Promise<Result> => {
      libraryObjectCalls.push(name);
      return call(...input);
    };
  return {
    ...actual,
    readBlob: recorded('readBlob', actual.readBlob),
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- recorded so that no caller is left.
    readObject: recorded('readObject', actual.readObject),
    readTree: recorded('readTree', actual.readTree),
    isDescendent: recorded('isDescendent', actual.isDescendent),
    packObjects: recorded('packObjects', actual.packObjects),
    writeBlob: recorded('writeBlob', actual.writeBlob),
    writeTree: recorded('writeTree', actual.writeTree),
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- recorded so that no caller is left.
    writeObject: recorded('writeObject', actual.writeObject),
  };
});

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'noreply@tau.new' };
const provenance = { source: 'user', actorId: 'object-store-test', createdAt: 1_756_742_400_000 } as const;
const tree = (): ImmutableRevisionTree =>
  new ImmutableRevisionTree([
    ['main.scad', encoder.encode('cube(1);\n')],
    ['lib/a.scad', encoder.encode('module a() {}\n')],
    ['lib/deep/b.scad', encoder.encode('module b() {}\n')],
  ]);
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  libraryObjectCalls.length = 0;
});

/* A memory provider that reads ranges as OPFS does, recording any whole read of a pack. */
const rangedProvider = (): Readonly<{ provider: MemoryProvider; packReads: string[] }> => {
  const provider = new MemoryProvider();
  cleanups.push(() => {
    provider.dispose();
  });
  const whole = provider.readFile.bind(provider) as (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  const packReads: string[] = [];
  const readFile = provider.readFile.bind(provider);
  vi.spyOn(provider, 'readFile').mockImplementation((async (path: string, encoding?: 'utf8') => {
    if (path.endsWith('.pack')) {
      packReads.push(path);
    }
    return encoding === 'utf8' ? readFile(path, 'utf8') : readFile(path);
  }) as MemoryProvider['readFile']);
  Object.assign(provider, {
    readFileStream: (path: string, options?: FileReadStreamOptions) =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start: async (controller) => {
          const content = await whole(path);
          const start = options?.position ?? 0;
          controller.enqueue(content.slice(start, start + (options?.length ?? content.byteLength)));
          controller.close();
        },
      }),
  });
  return { provider, packReads };
};

describe('reading revisions through the object store (W2)', () => {
  it('reads a packed tree at one lookup and one range read per object, without the library or a whole pack', async () => {
    const { provider, packReads } = rangedProvider();
    let writer: ObjectStore | undefined;
    const port = createIsomorphicGitRevisionPort({
      filesystem: provider,
      onObjectStore: (store) => {
        writer = store;
      },
    });
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree(),
      provenance,
      summary: { generated: 'First' },
    });
    await writer!.repack(true);

    /* A new tab: cold tables over the same store. */
    let reader: ObjectStore | undefined;
    const reopened = createIsomorphicGitRevisionPort({
      filesystem: provider,
      onObjectStore: (store) => {
        reader = store;
      },
    });
    const read = await reopened.readTree(revisionId(receipt.commitId));

    expect(read?.get('lib/deep/b.scad')).toStrictEqual(encoder.encode('module b() {}\n'));
    /* The commit, three trees (root, lib, lib/deep) and three blobs. */
    expect(reader!.counters).toStrictEqual({
      lookups: 7,
      rangeReads: 7,
      deltaHops: 0,
      cacheHits: 0,
      looseReads: 0,
      wholePackLoads: 0,
    });
    expect(packReads).toStrictEqual([]);
    expect(libraryObjectCalls).toStrictEqual([]);
  });

  it('keeps every byte of the store off the mutation pipeline: no change event and no claim for .git', async () => {
    const providerRegistry = new ProviderRegistry({ databasePrefix: 'w2-object-store-gate' });
    const scope = { backend: 'memory', storageRootKey: 'memory:w2-object-store-gate' } as const;
    const mountTable = new MountTable();
    mountTable.mount('/', await providerRegistry.getProvider(scope), { class: 'authored', ...scope });
    const resourceQueue = new ResourceQueue();
    const eventBus = new ChangeEventBus();
    const service = new WorkspaceFileService({ providerRegistry, mountTable, resourceQueue, eventBus });
    cleanups.push(() => {
      service.dispose();
    });
    const controlPlane = /\/\.git(?:\/|")/u;
    const gitEvents: string[] = [];
    let events = 0;
    eventBus.subscribe((event) => {
      events += 1;
      const text = JSON.stringify(event);
      if (controlPlane.test(text)) {
        gitEvents.push(text);
      }
    });
    const gitClaims: string[] = [];
    for (const method of ['queueFor', 'queueForMany', 'queueForClaims'] as const) {
      const original = resourceQueue[method].bind(resourceQueue) as (...input: unknown[]) => unknown;
      vi.spyOn(resourceQueue, method).mockImplementation(((...input: unknown[]) => {
        const text = JSON.stringify(input.filter((argument) => typeof argument !== 'function'));
        if (controlPlane.test(text)) {
          gitClaims.push(text);
        }
        return original(...input);
      }) as (typeof resourceQueue)[typeof method]);
    }
    const rooted = service.createRootedFileSystem('/');
    let store: ObjectStore | undefined;
    const port = createIsomorphicGitRevisionPort({
      filesystem: rooted,
      onObjectStore: (opened) => {
        store = opened;
      },
    });

    await port.init({ author });
    const first = await port.writeRevision({ parents: [], tree: tree(), provenance, summary: { generated: 'First' } });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(first.commitId) });
    await port.tag({ name: 'v1', revisionId: revisionId(first.commitId), note: 'one', actor: undefined });
    await port.setRemote({ name: 'origin', url: 'https://example.test/project.git' });
    await store!.repack(true);
    const second = await port.writeRevision({
      parents: [revisionId(first.commitId)],
      tree: new ImmutableRevisionTree([
        ...tree()
          .entries()
          .map(({ path, content }) => [path, content] as const),
        ['c.scad', encoder.encode('c\n')],
      ]),
      provenance,
      summary: { generated: 'Second' },
    });
    await port.updateRef({ name: 'main', expectedHead: revisionId(first.commitId), head: revisionId(second.commitId) });
    await port.readTree(revisionId(second.commitId));
    await port.log();

    /* The worktree's generated ignore and attributes files are project files and do raise events. */
    expect(events).toBeGreaterThan(0);
    expect(gitEvents).toStrictEqual([]);
    expect(gitClaims).toStrictEqual([]);
    expect(await rooted.privateStore!.exists('.git/HEAD')).toBe(true);
    expect(await port.readRef('main')).toBe(second.commitId);
  });
});

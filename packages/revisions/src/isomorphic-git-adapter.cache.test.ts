import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as IsomorphicGit from 'isomorphic-git';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';

/* Every object read records the `cache` it was handed: isomorphic-git keeps
 * parsed pack indexes and pack bytes there, and without one each read of a
 * packed object reloads the pack and re-hashes it (D-UI-29). */
const reads = vi.hoisted((): Array<{ name: string; cache: unknown }> => []);

vi.mock('isomorphic-git', async (importOriginal) => {
  const actual = await importOriginal<typeof IsomorphicGit>();
  const recorded =
    <Arguments extends { cache?: unknown }, Result>(name: string, read: (input: Arguments) => Promise<Result>) =>
    async (input: Arguments): Promise<Result> => {
      reads.push({ name, cache: input.cache });
      return read(input);
    };
  return {
    ...actual,
    readBlob: recorded('readBlob', actual.readBlob),
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the adapter reads raw commits through it.
    readObject: recorded('readObject', actual.readObject),
    readTree: recorded('readTree', actual.readTree),
  };
});

const encoder = new TextEncoder();
const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

describe('isomorphic-git object cache (D-UI-29)', () => {
  it('reads every object of one operation through one shared pack cache', async () => {
    const filesystem = new MemoryProvider();
    providers.push(filesystem);
    const port = createIsomorphicGitRevisionPort({ filesystem });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['main.scad', encoder.encode('cube(1);\n')],
        ['lib/a.scad', encoder.encode('module a() {}\n')],
        ['lib/deep/b.scad', encoder.encode('module b() {}\n')],
      ]),
      provenance: { source: 'user', actorId: 'cache-test', createdAt: 1_756_742_400_000 },
      summary: { generated: 'First' },
    });
    reads.length = 0;

    await port.readTree(receipt.commitId as Parameters<typeof port.readTree>[0]);

    expect(reads.length).toBeGreaterThan(4);
    const caches = new Set(reads.map((read) => read.cache));
    expect(caches.size).toBe(1);
    expect([...caches][0]).toBeTypeOf('object');
  });
});

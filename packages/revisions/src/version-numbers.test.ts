import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { revisionTagMessage } from '#revision-headers.js';
import { readRevisionLog } from '#revision-verbs.js';
import { recordedBy } from '#test/identity.js';
import { nextVersionNumber, numberVersions, planVersionRenumbering, versionNumberFor } from '#version-numbers.js';

const encoder = new TextEncoder();
const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

describe('numberVersions', () => {
  it('numbers three tags written before numbers V2, V3, V4 in creation order, so the next is V5', () => {
    const numbered = numberVersions([
      { name: 'lid', createdAt: 3000 },
      { name: 'base', createdAt: 1000 },
      { name: 'hinge', createdAt: 2000 },
    ]);
    expect(numbered.map((tag) => [tag.name, tag.number])).toStrictEqual([
      ['lid', 4],
      ['base', 2],
      ['hinge', 3],
    ]);
    expect(nextVersionNumber(numbered)).toBe(5);
  });

  it('keeps every recorded number and numbers the rest around them', () => {
    const numbered = numberVersions([
      { name: 'old', createdAt: 1000 },
      { name: 'new', createdAt: 500, number: 2 },
      { name: 'older', createdAt: 900 },
    ]);
    expect(Object.fromEntries(numbered.map((tag) => [tag.name, tag.number]))).toStrictEqual({
      new: 2,
      older: 3,
      old: 4,
    });
  });

  it('orders tags created in the same second by name, so every host reads the same numbers', () => {
    const numbered = numberVersions([
      { name: 'b', createdAt: 1000 },
      { name: 'a', createdAt: 1000 },
    ]);
    expect(numbered.map((tag) => tag.number)).toStrictEqual([3, 2]);
  });

  it('starts a project with no versions at V2, because V1 is Start', () => {
    expect(nextVersionNumber([])).toBe(2);
    expect(versionNumberFor([], 'First')).toBe(2);
  });

  it('keeps the number of a name that exists, so moving a version keeps it', () => {
    const tags = [
      { name: 'base', number: 2 },
      { name: 'lid', number: 7 },
    ];
    expect(versionNumberFor(tags, 'base')).toBe(2);
    expect(versionNumberFor(tags, 'hinge')).toBe(8);
  });
});

describe('planVersionRenumbering', () => {
  it('moves only the version that is not backed up, to the highest known plus one', () => {
    const tags = [
      { name: 'hinge', createdAt: 2000, number: 4 },
      { name: 'Lid fit', createdAt: 1000, number: 4 },
      { name: 'base', createdAt: 500, number: 3 },
    ];
    expect(planVersionRenumbering(tags, new Set(['hinge', 'base']))).toStrictEqual([
      { name: 'Lid fit', from: 4, to: 5 },
    ]);
  });

  it('moves the later of two versions this device made with one number, and nothing that is free', () => {
    const tags = [
      { name: 'two', createdAt: 2000, number: 3 },
      { name: 'one', createdAt: 1000, number: 3 },
      { name: 'free', createdAt: 3000, number: 6 },
    ];
    expect(planVersionRenumbering(tags, new Set())).toStrictEqual([{ name: 'two', from: 3, to: 7 }]);
  });

  it('moves nothing a backed-up version holds, even when the remote holds a duplicate', () => {
    const tags = [
      { name: 'A', createdAt: 1, number: 2 },
      { name: 'B', createdAt: 2, number: 2 },
    ];
    expect(planVersionRenumbering(tags, new Set(['A', 'B']))).toStrictEqual([]);
  });
});

describe('version numbers in a store', () => {
  const store = async () => {
    const provider = new MemoryProvider();
    providers.push(provider);
    const port = createIsomorphicGitRevisionPort({ filesystem: provider });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['part.scad', encoder.encode('cube(1);')]]),
      provenance: { source: 'user', ...recordedBy('b6'), createdAt: 1_790_000_000_000 },
      summary: { generated: 'Saved' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    return { provider, port, head };
  };

  it('gives each new version the highest known plus one, and a moved version keeps its number', async () => {
    const { port, head } = await store();
    const first = await port.tag({ name: 'base', revisionId: head, createdAt: 1000 });
    const second = await port.tag({ name: 'lid', revisionId: head, createdAt: 2000 });
    expect([first.number, second.number]).toStrictEqual([2, 3]);
    const moved = await port.tag({ name: 'base', revisionId: head, note: 'Renamed note', createdAt: 3000 });
    expect(moved.number).toBe(2);
    const listedAfterMove = await port.listTags();
    expect(listedAfterMove.map((tag) => [tag.name, tag.number])).toStrictEqual([
      ['base', 2],
      ['lid', 3],
    ]);
  });

  it('reads a project with three names written before numbers as V2, V3, V4, and its next version is V5', async () => {
    const { provider, port, head } = await store();
    /* The tags an older build wrote: a `Tau-Tag` trailer with no number. */
    for (const [name, seconds] of [
      ['lid', 1_790_000_300],
      ['base', 1_790_000_100],
      ['hinge', 1_790_000_200],
    ] as const) {
      const body = [
        `object ${head}`,
        'type commit',
        `tag ${name}`,
        `tagger Tau <noreply@tau.new> ${String(seconds)} +0000`,
        '',
        `${name}\n\nTau-Tag: {"version":1,"note":"${name}"}\n`,
      ].join('\n');
      // oxlint-disable-next-line no-await-in-loop -- three fixture tags, in order.
      const oid = await writeLooseTag(provider, body);
      // oxlint-disable-next-line no-await-in-loop -- three fixture refs, in order.
      await provider.writeFile(`.git/refs/tags/${name}`, `${oid}\n`);
    }
    const listed = await port.listTags();
    expect(Object.fromEntries(listed.map((tag) => [tag.name, tag.number]))).toStrictEqual({
      base: 2,
      hinge: 3,
      lid: 4,
    });
    const rows = await readRevisionLog(port, { branch: 'main' });
    expect(rows[0]?.versions).toStrictEqual([
      { name: 'base', number: 2 },
      { name: 'hinge', number: 3 },
      { name: 'lid', number: 4 },
    ]);
    const next = await port.tag({ name: 'print', revisionId: head });
    expect(next.number).toBe(5);
    /* The new tag records its number; the older ones keep reading as they did. */
    const listedAfterNext = await port.listTags();
    expect(Object.fromEntries(listedAfterNext.map((tag) => [tag.name, tag.number]))).toStrictEqual({
      base: 2,
      hinge: 3,
      lid: 4,
      print: 5,
    });
  });

  it('writes the number into the tag message both legs share', async () => {
    const { port, head } = await store();
    await port.tag({ name: 'base', revisionId: head, note: 'base', createdAt: 1000 });
    expect(revisionTagMessage({ name: 'base', note: 'base', actor: undefined, number: 2 })).toContain('"number":2');
    const [listed] = await port.listTags();
    expect(listed?.number).toBe(2);
  });
});

/**
 * Store one tag object loose, as git would, and return its id.
 *
 * @param provider - The store's filesystem.
 * @param body - The tag object's bytes.
 * @returns The object id.
 */
const writeLooseTag = async (provider: MemoryProvider, body: string): Promise<string> => {
  const { deflateSync } = await import('node:zlib');
  const { createHash } = await import('node:crypto');
  const content = encoder.encode(body);
  const framed = new Uint8Array([...encoder.encode(`tag ${String(content.byteLength)}\0`), ...content]);
  const oid = createHash('sha1').update(framed).digest('hex');
  await provider.mkdir(`.git/objects/${oid.slice(0, 2)}`, { recursive: true });
  await provider.writeFile(`.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}`, new Uint8Array(deflateSync(framed)));
  return oid;
};

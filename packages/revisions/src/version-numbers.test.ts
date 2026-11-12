import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { versionTagRef } from '#revision-port.js';
import type { RevisionTag } from '#revision-port.js';
import { readRevisionLog } from '#revision-verbs.js';
import { recordedBy } from '#test/identity.js';
import {
  isSameVersion,
  nextVersionNumber,
  planVersionRenumbering,
  versionNumberOfTag,
  versionTagWrite,
} from '#version-numbers.js';

const encoder = new TextEncoder();
const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const entry = revisionId('a'.repeat(40));
const other = revisionId('b'.repeat(40));
const version = (
  number: number,
  name: string,
  { createdAt, revision = entry }: Readonly<{ createdAt: number; revision?: RevisionTag['revisionId'] }>,
): RevisionTag => Object.freeze({ number, name, revisionId: revision, note: undefined, actor: undefined, createdAt });

describe('version tag refs', () => {
  it('names a version’s ref by its number, whatever its name', () => {
    expect(versionTagRef(4)).toBe('refs/tags/v4');
    expect(versionNumberOfTag('refs/tags/v4')).toBe(4);
    expect(versionNumberOfTag('v12')).toBe(12);
  });

  it.each([
    ['V1, which Start holds', 'v1'],
    ['a name', 'refs/tags/Ready for print'],
    ['a leading zero', 'v02'],
    ['a capital V', 'V3'],
    ['a suffix', 'v3.1'],
  ])('reads no version from %s', (_label, name) => {
    expect(versionNumberOfTag(name)).toBeUndefined();
  });

  it('starts a project with no versions at V2, because V1 is Start', () => {
    expect(nextVersionNumber([])).toBe(2);
    expect(nextVersionNumber([version(2, 'a', { createdAt: 1 }), version(7, 'b', { createdAt: 2 })])).toBe(8);
  });
});

describe('versionTagWrite', () => {
  it('gives a new version the next number and the store’s clock', () => {
    expect(
      versionTagWrite([version(2, 'Base', { createdAt: 1000 })], { name: 'Lid', revisionId: entry }, 5000),
    ).toStrictEqual({
      number: 3,
      name: 'Lid',
      revisionId: entry,
      note: undefined,
      actor: undefined,
      createdAt: 5000,
    });
  });

  it('renames a version it names by number, keeping its entry, time, actor and note', () => {
    const actor = { kind: 'user', id: 'user_1', name: 'Ada' } as const;
    const held = { ...version(2, 'Base', { createdAt: 1000 }), note: 'First fit', actor };
    expect(versionTagWrite([held], { number: 2, name: 'Ready for print', revisionId: entry }, 9000)).toStrictEqual({
      ...held,
      name: 'Ready for print',
    });
  });

  it('refuses to move a version to another entry', () => {
    expect(() =>
      versionTagWrite([version(2, 'Base', { createdAt: 1000 })], { number: 2, name: 'Base', revisionId: other }, 0),
    ).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_OPERATION' }));
  });
});

describe('planVersionRenumbering', () => {
  it('moves only the version the remote holds another of, to the highest known plus one', () => {
    const local = [
      version(4, 'Lid fit', { createdAt: 1000 }),
      version(3, 'Base', { createdAt: 500 }),
      version(5, 'Mine', { createdAt: 3000 }),
    ];
    const remote = [version(4, 'Hinge', { createdAt: 2000 }), version(3, 'Base', { createdAt: 500 })];
    expect(planVersionRenumbering(local, remote)).toStrictEqual([{ name: 'Lid fit', from: 4, to: 6 }]);
  });

  it('keeps a renamed version: the same entry and time is the same version', () => {
    expect(
      planVersionRenumbering([version(2, 'Renamed', { createdAt: 1000 })], [version(2, 'Base', { createdAt: 1000 })]),
    ).toStrictEqual([]);
    expect(
      isSameVersion(version(2, 'A', { createdAt: 1000 }), version(2, 'B', { createdAt: 1000, revision: other })),
    ).toBe(false);
  });

  it('moves two colliding versions in creation order, each to its own next number', () => {
    const local = [version(3, 'Later', { createdAt: 2000 }), version(2, 'Earlier', { createdAt: 1000 })];
    const remote = [version(2, 'Theirs', { createdAt: 1500 }), version(3, 'Theirs too', { createdAt: 1600 })];
    expect(planVersionRenumbering(local, remote)).toStrictEqual([
      { name: 'Earlier', from: 2, to: 4 },
      { name: 'Later', from: 3, to: 5 },
    ]);
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

  it('gives each new version the highest known plus one, and a renamed version keeps its number and ref', async () => {
    const { port, head } = await store();
    const first = await port.tag({ name: 'Ready for print', revisionId: head, createdAt: 1000 });
    const second = await port.tag({ name: 'Ready for print', revisionId: head, createdAt: 2000 });
    expect([first.number, second.number]).toStrictEqual([2, 3]);
    const renamed = await port.tag({ number: 2, name: 'Lid fit', revisionId: head });
    expect(renamed).toStrictEqual({ ...first, name: 'Lid fit' });
    const listed = await port.listTags();
    expect(listed.map((tag) => [tag.number, tag.name])).toStrictEqual([
      [2, 'Lid fit'],
      [3, 'Ready for print'],
    ]);
    const tagReferences = await port.listRefs('refs/tags');
    expect(tagReferences.map((ref) => ref.name)).toStrictEqual(['refs/tags/v2', 'refs/tags/v3']);
    const rows = await readRevisionLog(port, { branch: 'main' });
    expect(rows[0]?.versions).toStrictEqual([
      { name: 'Lid fit', number: 2 },
      { name: 'Ready for print', number: 3 },
    ]);
  });

  it('reads no version from a tag under a name, a lightweight tag, or v1 (I7)', async () => {
    const { provider, port, head } = await store();
    const body = [
      `object ${head}`,
      'type commit',
      'tag lid',
      'tagger Tau <noreply@tau.new> 1790000100 +0000',
      '',
      'lid\n\nTau-Tag: {"version":1,"note":"lid","number":2}\n',
    ].join('\n');
    const oid = await writeLooseTag(provider, body);
    await provider.writeFile('.git/refs/tags/lid', `${oid}\n`);
    await provider.writeFile('.git/refs/tags/v1', `${oid}\n`);
    await provider.writeFile('.git/refs/tags/v4', `${head}\n`);
    expect(await port.listTags()).toStrictEqual([]);
    const created = await port.tag({ name: 'print', revisionId: head });
    expect(created.number).toBe(2);
  });

  it('names a tag Tau did not write at a version ref by its message', async () => {
    const { provider, port, head } = await store();
    const body = [
      `object ${head}`,
      'type commit',
      'tag v5',
      'tagger Someone <someone@example.com> 1790000100 +0000',
      '',
      'Release candidate\n',
    ].join('\n');
    await provider.writeFile('.git/refs/tags/v5', `${await writeLooseTag(provider, body)}\n`);
    const listed = await port.listTags();
    expect(listed.map((tag) => [tag.number, tag.name])).toStrictEqual([[5, 'Release candidate']]);
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

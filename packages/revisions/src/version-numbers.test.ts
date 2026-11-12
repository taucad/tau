import { createHash } from 'node:crypto';
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
  newVersionId,
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
/* A stable 32-hex id per seed: the same seed is the same version. */
const idOf = (seed: string): string => createHash('md5').update(seed).digest('hex');
const version = (
  number: number,
  name: string,
  {
    createdAt,
    revision = entry,
    id = idOf(`${name}@${String(createdAt)}`),
  }: Readonly<{ createdAt: number; revision?: RevisionTag['revisionId']; id?: string }>,
): RevisionTag =>
  Object.freeze({ id, number, name, revisionId: revision, note: undefined, actor: undefined, createdAt });
const holders = (versions: readonly RevisionTag[], held: readonly number[] = []) => ({
  versions,
  held: [...versions.map((tag) => tag.number), ...held],
});

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

  it('mints a fresh 32-hex id for every new version', () => {
    const ids = new Set(Array.from({ length: 64 }, () => newVersionId()));
    expect(ids.size).toBe(64);
    for (const id of ids) {
      expect(id).toMatch(/^[\da-f]{32}$/u);
    }
  });
});

describe('versionTagWrite', () => {
  it('gives a new version a fresh id, the next number and the store’s clock', () => {
    const written = versionTagWrite({
      tags: [version(2, 'Base', { createdAt: 1000 })],
      held: [2],
      input: { name: 'Lid', revisionId: entry },
      now: 5000,
    });
    expect(written).toStrictEqual({
      id: written.id,
      number: 3,
      name: 'Lid',
      revisionId: entry,
      note: undefined,
      actor: undefined,
      createdAt: 5000,
    });
    expect(written.id).toMatch(/^[\da-f]{32}$/u);
    expect(written.id).not.toBe(version(2, 'Base', { createdAt: 1000 }).id);
  });

  it('counts a number a tag that is not a version holds, and never gives it out (R2)', () => {
    const tags = [version(2, 'Base', { createdAt: 1000 })];
    expect(versionTagWrite({ tags, held: [2, 6], input: { name: 'Lid', revisionId: entry }, now: 0 }).number).toBe(7);
    expect(() =>
      versionTagWrite({ tags, held: [2, 6], input: { number: 6, name: 'Lid', revisionId: entry }, now: 0 }),
    ).toThrow(/v6 is held by a tag that is not a version/u);
  });

  it('renames a version it names by number, keeping its id, entry, time, actor and note', () => {
    const actor = { kind: 'user', id: 'user_1', name: 'Ada' } as const;
    const held = { ...version(2, 'Base', { createdAt: 1000 }), note: 'First fit', actor };
    expect(
      versionTagWrite({
        tags: [held],
        held: [2],
        input: { number: 2, name: 'Ready for print', revisionId: entry },
        now: 9000,
      }),
    ).toStrictEqual({ ...held, name: 'Ready for print' });
  });

  it('moves a version to a free number with its own id', () => {
    const id = idOf('moved');
    expect(
      versionTagWrite({
        tags: [version(2, 'Base', { createdAt: 1000 })],
        held: [2],
        input: { id, number: 5, name: 'Lid', revisionId: entry, createdAt: 3000 },
        now: 9000,
      }),
    ).toStrictEqual({
      id,
      number: 5,
      name: 'Lid',
      revisionId: entry,
      note: undefined,
      actor: undefined,
      createdAt: 3000,
    });
  });

  it.each([
    ['another entry', { number: 2, name: 'Base', revisionId: other }],
    ['another version’s id', { number: 2, name: 'Base', revisionId: entry, id: idOf('someone else') }],
    ['an empty name', { name: '', revisionId: entry }],
    ['a blank name', { name: '   ', revisionId: entry }],
    ['V1, which Start holds', { number: 1, name: 'Lid', revisionId: entry }],
    ['a number below 1', { number: 0, name: 'Lid', revisionId: entry }],
    ['a fractional number', { number: 2.5, name: 'Lid', revisionId: entry }],
    ['an unsafe number', { number: Number.MAX_SAFE_INTEGER + 1, name: 'Lid', revisionId: entry }],
    ['a malformed id', { name: 'Lid', revisionId: entry, id: 'ABC' }],
  ] as const)('refuses %s before anything is written', (_label, input) => {
    expect(() =>
      versionTagWrite({ tags: [version(2, 'Base', { createdAt: 1000 })], held: [2], input, now: 0 }),
    ).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_OPERATION' }));
  });
});

describe('planVersionRenumbering', () => {
  it('moves only the version the remote holds another of, to one above every held number', () => {
    const local = [
      version(4, 'Lid fit', { createdAt: 1000 }),
      version(3, 'Base', { createdAt: 500 }),
      version(5, 'Mine', { createdAt: 3000 }),
    ];
    const remote = [version(4, 'Hinge', { createdAt: 2000 }), version(3, 'Base', { createdAt: 500 })];
    expect(planVersionRenumbering(holders(local), holders(remote))).toStrictEqual([
      { name: 'Lid fit', from: 4, to: 6 },
    ]);
  });

  it('keeps a renamed version: the same id is the same version', () => {
    const id = idOf('base');
    expect(
      planVersionRenumbering(
        holders([version(2, 'Renamed', { createdAt: 1000, id })]),
        holders([version(2, 'Base', { createdAt: 1000, id })]),
      ),
    ).toStrictEqual([]);
  });

  it('tells two versions apart by id, even on the same entry in the same second (R1)', () => {
    const mine = version(2, 'Lid fit', { createdAt: 1000, id: idOf('mine') });
    const theirs = version(2, 'Hinge', { createdAt: 1000, id: idOf('theirs') });
    expect(isSameVersion(mine, theirs)).toBe(false);
    expect(planVersionRenumbering(holders([mine]), holders([theirs]))).toStrictEqual([
      { name: 'Lid fit', from: 2, to: 3 },
    ]);
  });

  it('moves two colliding versions in creation order, each to its own next number', () => {
    const local = [version(3, 'Later', { createdAt: 2000 }), version(2, 'Earlier', { createdAt: 1000 })];
    const remote = [version(2, 'Theirs', { createdAt: 1500 }), version(3, 'Theirs too', { createdAt: 1600 })];
    expect(planVersionRenumbering(holders(local), holders(remote))).toStrictEqual([
      { name: 'Earlier', from: 2, to: 4 },
      { name: 'Later', from: 3, to: 5 },
    ]);
  });

  it('counts a number a remote tag that is not a version holds as taken (R2)', () => {
    const mine = version(2, 'Lid fit', { createdAt: 1000 });
    /* The remote holds a lightweight v2 and v7: no version there, but both numbers are taken. */
    expect(planVersionRenumbering(holders([mine]), { versions: [], held: [2, 7] })).toStrictEqual([
      { name: 'Lid fit', from: 2, to: 8 },
    ]);
  });

  it('counts a number a local tag that is not a version holds when it chooses the next one (R2)', () => {
    const mine = version(2, 'Lid fit', { createdAt: 1000 });
    const theirs = version(2, 'Hinge', { createdAt: 900 });
    expect(planVersionRenumbering(holders([mine], [9]), holders([theirs]))).toStrictEqual([
      { name: 'Lid fit', from: 2, to: 10 },
    ]);
  });

  it('finishes an interrupted move: the number that already holds the version keeps it, and no other is taken (R6)', () => {
    const id = idOf('lid fit');
    /* A move to v3 was written, and the process stopped before v2 was let go. */
    const source = version(2, 'Lid fit', { createdAt: 1000, id });
    const landed = version(3, 'Lid fit', { createdAt: 1000, id });
    const theirs = version(2, 'Hinge', { createdAt: 900 });
    expect(planVersionRenumbering(holders([source, landed]), holders([theirs]))).toStrictEqual([
      { name: 'Lid fit', from: 2, to: 3 },
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

  it('gives each new version the next number, and a renamed version keeps its id, number and ref', async () => {
    const { port, head } = await store();
    const first = await port.tag({ name: 'Ready for print', revisionId: head, createdAt: 1000 });
    const second = await port.tag({ name: 'Ready for print', revisionId: head, createdAt: 2000 });
    expect([first.number, second.number]).toStrictEqual([2, 3]);
    expect(first.id).not.toBe(second.id);
    const renamed = await port.tag({ number: 2, name: 'Lid fit', revisionId: head });
    expect(renamed).toStrictEqual({ ...first, name: 'Lid fit' });
    const listed = await port.listTags();
    expect(listed.map((tag) => [tag.number, tag.name, tag.id])).toStrictEqual([
      [2, 'Lid fit', first.id],
      [3, 'Ready for print', second.id],
    ]);
    const tagReferences = await port.listRefs('refs/tags');
    expect(tagReferences.map((ref) => ref.name)).toStrictEqual(['refs/tags/v2', 'refs/tags/v3']);
    const rows = await readRevisionLog(port, { branch: 'main' });
    expect(rows[0]?.versions).toStrictEqual([
      { name: 'Lid fit', number: 2 },
      { name: 'Ready for print', number: 3 },
    ]);
  });

  it('gives two versions made at once two numbers (R3)', async () => {
    const { port, head } = await store();
    const made = await Promise.all([
      port.tag({ name: 'One', revisionId: head }),
      port.tag({ name: 'Two', revisionId: head }),
      port.tag({ name: 'Three', revisionId: head }),
    ]);
    expect(made.map((tag) => tag.number).toSorted((left, right) => left - right)).toStrictEqual([2, 3, 4]);
    const listed = await port.listTags();
    expect(listed.map((tag) => tag.name).toSorted()).toStrictEqual(['One', 'Three', 'Two']);
  });

  it('reads no version from a tag under a name, a lightweight tag, or v1, and never takes a number one holds (I7, R2)', async () => {
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
    /* The lightweight v4 holds its number: the new version takes V5, and v4 is untouched. */
    const created = await port.tag({ name: 'print', revisionId: head });
    expect(created.number).toBe(5);
    expect(await port.readRef('refs/tags/v4')).toBe(head);
    await expect(port.tag({ number: 4, name: 'print', revisionId: head })).rejects.toMatchObject({
      code: 'UNSUPPORTED_OPERATION',
    });
    expect(await port.readRef('refs/tags/v4')).toBe(head);
  });

  it('reads no version from a tag another tool wrote at a version ref, and keeps its number held (R2)', async () => {
    const { provider, port, head } = await store();
    const body = [
      `object ${head}`,
      'type commit',
      'tag v5',
      'tagger Someone <someone@example.com> 1790000100 +0000',
      '',
      'Release candidate\n',
    ].join('\n');
    const foreign = await writeLooseTag(provider, body);
    await provider.writeFile('.git/refs/tags/v5', `${foreign}\n`);
    expect(await port.listTags()).toStrictEqual([]);
    const created = await port.tag({ name: 'Lid', revisionId: head });
    expect(created.number).toBe(6);
    const tagReferences = await port.listRefs('refs/tags');
    expect(tagReferences.find((ref) => ref.name === 'refs/tags/v5')?.head).toBe(foreign);
  });

  it('refuses an empty name and a number below V2 before writing anything (R10)', async () => {
    const { port, head } = await store();
    await expect(port.tag({ name: '', revisionId: head })).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    await expect(port.tag({ number: 1, name: 'Lid', revisionId: head })).rejects.toMatchObject({
      code: 'UNSUPPORTED_OPERATION',
    });
    expect(await port.listRefs('refs/tags')).toStrictEqual([]);
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

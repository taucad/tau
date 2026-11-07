import { describe, expect, it } from 'vitest';

import {
  createIndexMirror,
  indexMirrorCovers,
  tauIndexMirrorMessageSchema,
  toIndexMirrorWireEntry,
} from '#sync/index-mirror.js';
import type { TauIndexMirrorMessage } from '#sync/index-mirror.js';

const reset = (entries: TauIndexMirrorMessage['entries'], generation = 1): TauIndexMirrorMessage => ({
  tau: 'index-mirror',
  kind: 'reset',
  generation,
  entries,
  removed: [],
});

describe('createIndexMirror', () => {
  it('knows nothing, and applies no change, until its first whole index', () => {
    const mirror = createIndexMirror();
    mirror.receive({
      tau: 'index-mirror',
      kind: 'changes',
      generation: 2,
      entries: [['a.ts', 'f', 1, 1, 2]],
      removed: [],
    });

    expect(mirror.ready()).toBe(false);
    expect(mirror.entry('a.ts')).toBeUndefined();

    mirror.receive(reset([['b.ts', 'f', 3, 4, 1]]));

    expect(mirror.ready()).toBe(true);
    expect(mirror.entry('a.ts')).toBeUndefined();
    expect(mirror.entry('b.ts')).toEqual({ path: 'b.ts', kind: 'file', size: 3, mtimeMs: 4, generation: 1 });
  });

  it('lists one directory level sorted by name, and nothing below a file or a missing path', () => {
    const mirror = createIndexMirror();
    mirror.receive(
      reset([
        ['src', 'd', 0, 0, 1],
        ['src/b.ts', 'f', 1, 1, 1],
        ['src/a.ts', 'f', 1, 1, 1],
        ['src/lib', 'd', 0, 0, 1],
        ['main.ts', 'f', 1, 1, 1],
      ]),
    );

    expect(mirror.children('src').map((entry) => entry.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/lib']);
    expect(mirror.children('').map((entry) => entry.path)).toEqual(['main.ts', 'src']);
    expect(mirror.children('main.ts')).toEqual([]);
    expect(mirror.children('missing')).toEqual([]);
    expect(mirror.size()).toBe(5);
  });

  it('removes a directory with everything below it, then applies the entries of the same change', () => {
    const mirror = createIndexMirror();
    mirror.receive(
      reset([
        ['src', 'd', 0, 0, 1],
        ['src/lib', 'd', 0, 0, 1],
        ['src/lib/a.ts', 'f', 1, 1, 1],
      ]),
    );

    mirror.receive({
      tau: 'index-mirror',
      kind: 'changes',
      generation: 3,
      entries: [['src/lib', 'f', 7, 9, 3]],
      removed: ['src/lib'],
    });

    expect(mirror.entry('src/lib/a.ts')).toBeUndefined();
    expect(mirror.entry('src/lib')?.kind).toBe('file');
    expect(mirror.children('src').map((entry) => entry.path)).toEqual(['src/lib']);
  });

  it('replaces a directory written over by a file of the same path, dropping its subtree', () => {
    const mirror = createIndexMirror();
    mirror.receive(
      reset([
        ['out', 'd', 0, 0, 1],
        ['out/a.js', 'f', 1, 1, 1],
      ]),
    );

    mirror.apply([
      { op: 'written', path: 'out', entry: { path: 'out', kind: 'file', size: 2, mtimeMs: 2, generation: 2 } },
    ]);

    expect(mirror.entry('out/a.js')).toBeUndefined();
    expect(mirror.children('out')).toEqual([]);
  });

  it('moves an entry, dropping the old path', () => {
    const mirror = createIndexMirror();
    mirror.receive(reset([['old.ts', 'f', 1, 1, 1]]));

    mirror.apply([
      {
        op: 'moved',
        oldPath: 'old.ts',
        path: 'new.ts',
        entry: { path: 'new.ts', kind: 'file', size: 1, mtimeMs: 1, generation: 2 },
      },
      { op: 'metadata', path: 'gone.ts' },
    ]);

    expect(mirror.entry('old.ts')).toBeUndefined();
    expect(mirror.entry('new.ts')?.generation).toBe(2);
    expect(mirror.entry('gone.ts')).toBeUndefined();
  });

  it('changes a version whenever the generation, size or mtime does', () => {
    const mirror = createIndexMirror();
    mirror.receive(reset([['a.ts', 'f', 1, 5, 1]]));
    const before = mirror.version('a.ts');

    mirror.receive({
      tau: 'index-mirror',
      kind: 'changes',
      generation: 2,
      entries: [['a.ts', 'f', 1, 5, 2]],
      removed: [],
    });

    expect(mirror.version('a.ts')).not.toBe(before);
    expect(mirror.version('missing.ts')).toBe('');
  });

  it('forgets everything on stale, so the slot answers until the next reset', () => {
    const mirror = createIndexMirror();
    mirror.receive(reset([['a.ts', 'f', 1, 1, 1]]));
    mirror.receive({ tau: 'index-mirror', kind: 'stale', generation: 1, entries: [], removed: [] });

    expect(mirror.ready()).toBe(false);
    expect(mirror.entry('a.ts')).toBeUndefined();

    mirror.receive({
      tau: 'index-mirror',
      kind: 'changes',
      generation: 2,
      entries: [['b.ts', 'f', 1, 1, 2]],
      removed: [],
    });
    expect(mirror.entry('b.ts')).toBeUndefined();

    mirror.receive(reset([['a.ts', 'f', 1, 1, 3]], 3));
    expect(mirror.ready()).toBe(true);
    expect(mirror.entry('a.ts')?.generation).toBe(3);
  });

  it('does not cover the reserved paths and nested mounts the feed names, nor the unwatched rows', () => {
    const mirror = createIndexMirror();
    mirror.receive({ ...reset([['a.ts', 'f', 1, 1, 1]]), excluded: ['.tau/index', '.tau-staging', 'vendor/lib'] });

    expect(mirror.covers('')).toBe(true);
    expect(mirror.covers('a.ts')).toBe(true);
    expect(mirror.covers('missing.ts')).toBe(true);
    expect(mirror.covers('.tau/index')).toBe(false);
    expect(mirror.covers('.tau/index/snapshot.bin')).toBe(false);
    expect(mirror.covers('.tau-staging/import/a.ts')).toBe(false);
    expect(mirror.covers('vendor/lib')).toBe(false);
    expect(mirror.covers('vendor/lib/index.ts')).toBe(false);
    expect(mirror.covers('vendor/library.ts')).toBe(true);
    expect(mirror.covers('node_modules/x/index.d.ts')).toBe(false);

    /* A message without the list keeps it; one with it replaces it. */
    mirror.receive({ tau: 'index-mirror', kind: 'changes', generation: 2, entries: [], removed: [] });
    expect(mirror.covers('vendor/lib/index.ts')).toBe(false);
    mirror.receive({ tau: 'index-mirror', kind: 'changes', generation: 3, entries: [], removed: [], excluded: [] });
    expect(mirror.covers('vendor/lib/index.ts')).toBe(true);
  });

  it('starts over on a second reset', () => {
    const mirror = createIndexMirror();
    mirror.receive(reset([['a.ts', 'f', 1, 1, 1]]));
    mirror.receive(reset([['b.ts', 'f', 1, 1, 4]], 4));

    expect(mirror.entry('a.ts')).toBeUndefined();
    expect(mirror.entry('b.ts')).toBeDefined();
  });
});

describe('indexMirrorCovers', () => {
  it('says the index never holds what nothing watches', () => {
    expect(indexMirrorCovers('')).toBe(true);
    expect(indexMirrorCovers('src/main.ts')).toBe(true);
    expect(indexMirrorCovers('node_modules/replicad/package.json')).toBe(false);
    expect(indexMirrorCovers('lib/node_modules/x/index.d.ts')).toBe(false);
    expect(indexMirrorCovers('.git/HEAD')).toBe(false);
  });
});

describe('the mirror wire', () => {
  it('encodes an index entry as one row, and parses only a well-formed message', () => {
    expect(toIndexMirrorWireEntry({ path: 'src', kind: 'dir', size: 0, mtimeMs: 3, generation: 2 })).toEqual([
      'src',
      'd',
      0,
      3,
      2,
    ]);
    expect(toIndexMirrorWireEntry({ path: 'a.ts', kind: 'file', size: 1, mtimeMs: 3, generation: 2 })[1]).toBe('f');
    expect(tauIndexMirrorMessageSchema.safeParse(reset([['a.ts', 'f', 1, 1, 1]])).success).toBe(true);
    expect(tauIndexMirrorMessageSchema.safeParse({ tau: 'sync-fs', op: 'readFile' }).success).toBe(false);
  });
});

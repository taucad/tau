import { describe, expect, it } from 'vitest';
import {
  array,
  assert,
  constant,
  constantFrom,
  dictionary,
  integer,
  oneof,
  option,
  property,
  record,
  tuple,
} from 'fast-check';
import type { Arbitrary } from 'fast-check';
import type { WorkbenchEntries } from '@taucad/workbench';
import { authoredFields, entriesPolicy, matchesPath, movePaths } from '#workbench-records/entries-policy.js';
import type { EntriesRecord, EntryPathChange } from '#workbench-records/entries-policy.js';

type Entry = WorkbenchEntries['entries'][string];

const optional = <T>(arbitrary: Arbitrary<T>): Arbitrary<T | undefined> => option(arbitrary, { nil: undefined });

/** Paths with one directory, so a path change can move a path and the paths under it. */
const paths = ['a.ts', 'b.ts', 'src', 'src/c.ts', 'src/d.ts'] as const;

const entryArbitrary: Arbitrary<Entry> = record(
  {
    renderTimeout: optional(constantFrom(0, 15_000, 180_000)),
    components: optional(
      record({
        hidden: array(constantFrom('x', 'y'), { maxLength: 2 }),
        isolated: array(constantFrom('x', 'y'), { maxLength: 1 }),
        opacity: array(record({ id: constantFrom('x', 'y'), opacity: constantFrom(0, 0.5) }), { maxLength: 1 }),
      }),
    ),
  },
  { requiredKeys: [] },
  // An entry with no settings is the defaults, which no entry means too: the store never writes one, and a path change
  // of a path with no entry moves nothing, so an empty one would make the record mean what its file does not.
).filter(
  (entry) =>
    entry.renderTimeout !== undefined ||
    (entry.components !== undefined &&
      entry.components.hidden.length + entry.components.isolated.length + entry.components.opacity.length > 0),
);

const entriesArbitrary: Arbitrary<WorkbenchEntries> = record({
  version: constant<1>(1),
  entries: dictionary(constantFrom(...paths), entryArbitrary, { maxKeys: 4 }),
});

/** One path change: a rename onto a free or a taken path, never into or out of its own directory. */
const pathChangeArbitrary: Arbitrary<EntryPathChange> = oneof(
  record({
    type: constant<'rename'>('rename'),
    oldPath: constantFrom(...paths),
    newPath: oneof(
      constantFrom(...paths),
      integer({ min: 0, max: 3 }).map((n) => `moved-${n}`),
    ),
  }).filter((change) => !matchesPath(change.newPath, change.oldPath) && !matchesPath(change.oldPath, change.newPath)),
  record({ type: constant<'delete'>('delete'), path: constantFrom(...paths) }),
);

/** A person's next record from a base: some path changes, then some entries set. */
const nextArbitrary = (base: WorkbenchEntries | undefined): Arbitrary<EntriesRecord> =>
  tuple(
    array(pathChangeArbitrary, { maxLength: 2 }),
    dictionary(constantFrom(...paths), entryArbitrary, { maxKeys: 2 }),
  ).map(([moves, set]) => ({
    version: 1,
    entries: { ...movePaths(base?.entries ?? {}, moves), ...set },
    ...(moves.length > 0 ? { moves } : {}),
  }));

/** A base and a history of three next records from it. */
const historyArbitrary = optional(entriesArbitrary).chain((base) =>
  nextArbitrary(base).chain((first) =>
    nextArbitrary(first).chain((second) =>
      nextArbitrary(second).map((third) => ({ base, first, second, third }) as const),
    ),
  ),
);

/**
 * The entries as the file means them: an empty entry and empty component lists are the defaults, which is what a
 * missing entry or missing components mean.
 */
const entriesValue = (value: WorkbenchEntries): string =>
  JSON.stringify(
    Object.entries(value.entries)
      .map(([path, entry]): [string, Entry] => {
        const { components, ...rest } = entry;
        const empty =
          components === undefined ||
          (components.hidden.length === 0 && components.isolated.length === 0 && components.opacity.length === 0);
        return [
          path,
          {
            ...(rest.renderTimeout === undefined ? {} : { renderTimeout: rest.renderTimeout }),
            ...(empty ? {} : { components }),
          },
        ];
      })
      .filter(([, entry]) => Object.keys(entry).length > 0)
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );

const { diff, combine, merge, isEmpty, read, serialize } = entriesPolicy;

describe('entriesPolicy patch algebra', () => {
  it('should rebuild the next record from a base and the diff to it', () => {
    assert(
      property(historyArbitrary, ({ base, first }) => {
        expect(entriesValue(merge(base, first, diff(base, first)))).toBe(entriesValue(first));
      }),
    );
  });

  it('should find no difference between a record and itself', () => {
    assert(
      property(entriesArbitrary, (entries) => {
        expect(isEmpty(diff(entries, entries))).toBe(true);
      }),
    );
  });

  it('should combine the patches of one edit history into the patch of the whole history', () => {
    assert(
      property(historyArbitrary, ({ base, first, second }) => {
        const combined = combine(diff(base, first), diff(first, second));
        expect(entriesValue(merge(base, second, combined))).toBe(entriesValue(second));
      }),
    );
  });

  it('should combine the patches of one edit history associatively: either grouping merges to the same record', () => {
    assert(
      property(optional(entriesArbitrary), historyArbitrary, (current, { base, first, second, third }) => {
        const patches = [diff(base, first), diff(first, second), diff(second, third)] as const;
        const left = combine(combine(patches[0], patches[1]), patches[2]);
        const right = combine(patches[0], combine(patches[1], patches[2]));
        expect(entriesValue(merge(current, third, left))).toBe(entriesValue(merge(current, third, right)));
      }),
    );
  });

  it('should merge a combined patch as the patches one after the other', () => {
    assert(
      property(optional(entriesArbitrary), historyArbitrary, (current, { base, first, second }) => {
        const earlier = diff(base, first);
        const later = diff(first, second);
        expect(entriesValue(merge(current, second, combine(earlier, later)))).toBe(
          entriesValue(merge(merge(current, first, earlier), second, later)),
        );
      }),
    );
  });

  it('should treat a missing earlier patch as no change', () => {
    assert(
      property(optional(entriesArbitrary), historyArbitrary, (current, { base, first }) => {
        const patch = diff(base, first);
        expect(entriesValue(merge(current, first, combine(undefined, patch)))).toBe(
          entriesValue(merge(current, first, patch)),
        );
        expect(isEmpty(combine(undefined, patch))).toBe(isEmpty(patch));
      }),
    );
  });

  it('should change nothing when a patch is applied to the text it produced', () => {
    // Path changes are not idempotent on their own (a delete and a rename onto the deleted path); the writer applies
    // a patch again to its own bytes after a lost reply, and the policy knows the text the patch produced.
    assert(
      property(optional(entriesArbitrary), historyArbitrary, (current, { base, first }) => {
        const patch = diff(base, first);
        const once = merge(current, first, patch);
        expect(entriesValue(merge(once, first, patch))).toBe(entriesValue(once));
      }),
    );
  });

  it('should apply only the later patch of a combined one whose earlier patch produced the text', () => {
    assert(
      property(optional(entriesArbitrary), historyArbitrary, (current, { base, first, second, third }) => {
        const earlier = diff(base, first);
        const middle = diff(first, second);
        const later = diff(second, third);
        const once = merge(current, first, earlier);
        expect(entriesValue(merge(once, third, combine(combine(earlier, middle), later)))).toBe(
          entriesValue(merge(merge(once, second, middle), third, later)),
        );
      }),
    );
  });

  it('should change nothing when a patch is applied to its own result after another party changed another entry', () => {
    assert(
      property(
        optional(entriesArbitrary),
        historyArbitrary,
        entryArbitrary,
        (current, { base, first, second }, foreign) => {
          const patch = combine(diff(base, first), diff(first, second));
          const once = merge(current, second, patch);
          // `z.ts` is a path no history touches.
          const changed = { ...once, entries: { ...once.entries, 'z.ts': foreign } };
          expect(entriesValue(merge(changed, second, patch))).toBe(entriesValue(changed));
        },
      ),
    );
  });

  it('should keep a patch small however many times it is written and combined with a later edit', () => {
    let patch = diff(undefined, { version: 1, entries: { 'a.ts': { renderTimeout: 0 } } });
    let record: WorkbenchEntries | undefined;
    for (let edit = 1; edit <= 20_000; edit++) {
      record = merge(undefined, { version: 1, entries: {} }, patch);
      patch = combine(patch, [
        {
          moves: edit % 1000 === 0 ? [{ type: 'delete', path: 'b.ts' }] : [],
          fields: { 'a.ts': { renderTimeout: edit % 600_000 } },
        },
      ]);
    }
    expect(record).toBeDefined();
    expect(patch.length).toBeLessThanOrEqual(30);
    expect(merge(undefined, { version: 1, entries: {} }, patch).entries['a.ts']).toEqual({ renderTimeout: 20_000 });
  });

  it("should carry a person's changes onto a record another party changed", () => {
    assert(
      property(historyArbitrary, entriesArbitrary, ({ base, first }, foreign) => {
        const patch = diff(base, first);
        const merged = merge(foreign, first, patch);
        const fields = authoredFields(patch);
        // The person's fields hold in the merged record, and every entry they did not touch is the foreign one.
        for (const [path, changed] of Object.entries(fields)) {
          if (Object.hasOwn(changed, 'renderTimeout')) {
            expect(merged.entries[path]?.renderTimeout).toBe(changed.renderTimeout);
          }
        }
        const moved = movePaths(
          foreign.entries,
          patch.flatMap((step) => step.moves),
        );
        for (const [path, entry] of Object.entries(moved)) {
          if (!Object.hasOwn(fields, path)) {
            expect(merged.entries[path]).toEqual(entry);
          }
        }
      }),
    );
  });

  it('should never write the path changes a record carries', () => {
    assert(
      property(historyArbitrary, ({ first }) => {
        const result = read(new TextEncoder().encode(serialize(first)));
        expect(result.status).toBe('current');
        if (result.status === 'current') {
          expect(result.record).not.toHaveProperty('moves');
          expect(entriesValue(result.record)).toBe(entriesValue(first));
        }
      }),
    );
  });
});

describe('entriesPolicy path changes', () => {
  it('should move a renamed directory with every entry under it and leave a sibling with a shared prefix', () => {
    const current: WorkbenchEntries = {
      version: 1,
      entries: { src: { renderTimeout: 1 }, 'src/c.ts': { renderTimeout: 2 }, 'srcx.ts': { renderTimeout: 3 } },
    };
    const next: EntriesRecord = {
      version: 1,
      entries: movePaths(current.entries, [{ type: 'rename', oldPath: 'src', newPath: 'lib' }]),
      moves: [{ type: 'rename', oldPath: 'src', newPath: 'lib' }],
    };
    expect(merge(current, next, diff(current, next)).entries).toEqual({
      lib: { renderTimeout: 1 },
      'lib/c.ts': { renderTimeout: 2 },
      'srcx.ts': { renderTimeout: 3 },
    });
  });

  it('should name the fields an earlier change left on a path that a later rename moved, and none a delete removed', () => {
    const earlier = [{ moves: [], fields: { 'a.ts': { renderTimeout: 15_000 }, 'b.ts': { renderTimeout: 7000 } } }];
    const later = [
      {
        moves: [
          { type: 'rename', oldPath: 'a.ts', newPath: 'c.ts' },
          { type: 'delete', path: 'b.ts' },
        ] satisfies EntryPathChange[],
        fields: {},
      },
    ];
    expect(authoredFields(combine(earlier, later))).toEqual({ 'c.ts': { renderTimeout: 15_000 } });
  });

  it('should give a path renamed onto an edited one the renamed entry', () => {
    const current: WorkbenchEntries = {
      version: 1,
      entries: { 'a.ts': { renderTimeout: 1 }, 'b.ts': { renderTimeout: 2 } },
    };
    const edited: EntriesRecord = { version: 1, entries: { ...current.entries, 'b.ts': { renderTimeout: 3 } } };
    const change: EntryPathChange = { type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' };
    const renamed: EntriesRecord = { version: 1, entries: movePaths(edited.entries, [change]), moves: [change] };
    const patch = combine(diff(current, edited), diff(edited, renamed));
    expect(merge(current, renamed, patch).entries).toEqual({ 'b.ts': { renderTimeout: 1 } });
  });
});

import { describe, expect, it } from 'vitest';
import { assert, boolean, constant, constantFrom, option, property, record, tuple } from 'fast-check';
import type { Arbitrary } from 'fast-check';
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout } from '@taucad/workbench';
import { layoutPolicy } from '#workbench-records/layout-policy.js';

const optional = <T>(arbitrary: Arbitrary<T>): Arbitrary<T | undefined> => option(arbitrary, { nil: undefined });

const viewers: ViewerNode[] = [
  { kind: 'group', tabs: [] },
  { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
  {
    kind: 'split',
    direction: 'row',
    children: [
      { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
      { kind: 'group', size: 2, tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
    ],
  },
];

const workbenches: WorkbenchLaneNode[] = [
  { kind: 'group', tabs: [] },
  { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
  {
    kind: 'group',
    active: 0,
    tabs: [
      { kind: 'pane', pane: 'parameters' },
      { kind: 'file', path: 'main.ts' },
    ],
  },
];

const layoutArbitrary: Arbitrary<WorkbenchLayout> = record({
  version: constant(1),
  lanes: record({ chat: boolean(), workbench: boolean() }),
  viewer: constantFrom(...viewers),
  workbench: constantFrom(...workbenches),
});

/** A layout as the file means it. */
const layoutValue = (layout: WorkbenchLayout): string => layoutPolicy.serialize(layout);

const { diff, combine, merge, isEmpty } = layoutPolicy;

describe('layoutPolicy codec', () => {
  it('should read back the record it serializes', () => {
    assert(
      property(layoutArbitrary, (layout) => {
        expect(layoutPolicy.read(new TextEncoder().encode(layoutPolicy.serialize(layout)))).toEqual({
          status: 'current',
          record: layout,
        });
      }),
    );
  });

  it('should refuse bytes that do not parse as invalid and bytes a newer Tau wrote as newer', () => {
    const invalid = layoutPolicy.read(new TextEncoder().encode('{broken'));
    const newer = layoutPolicy.read(new TextEncoder().encode('{"version":2}'));

    expect(invalid).toMatchObject({ status: 'invalid', code: 'INVALID_RECORD' });
    expect(newer).toMatchObject({ status: 'newer', code: 'NEWER_RECORD' });
  });
});

describe('layoutPolicy patch algebra', () => {
  it('should rebuild the next record from a base and the diff to it', () => {
    assert(
      property(optional(layoutArbitrary), layoutArbitrary, (base, next) => {
        expect(layoutValue(merge(base, next, diff(base, next)))).toBe(layoutValue(next));
      }),
    );
  });

  it('should find no difference between a record and itself', () => {
    assert(
      property(layoutArbitrary, (layout) => {
        expect(isEmpty(diff(layout, layout))).toBe(true);
      }),
    );
  });

  it('should combine the patches of one edit history into the patch of the whole history', () => {
    assert(
      property(optional(layoutArbitrary), layoutArbitrary, layoutArbitrary, (base, middle, last) => {
        const combined = combine(diff(base, middle), diff(middle, last));
        expect(layoutValue(merge(base, last, combined))).toBe(layoutValue(last));
      }),
    );
  });

  it('should combine the patches of one edit history associatively: either grouping merges to the same record', () => {
    assert(
      property(
        tuple(optional(layoutArbitrary), optional(layoutArbitrary)),
        tuple(layoutArbitrary, layoutArbitrary, layoutArbitrary),
        ([current, base], [first, second, third]) => {
          const patches = [diff(base, first), diff(first, second), diff(second, third)] as const;
          const left = combine(combine(patches[0], patches[1]), patches[2]);
          const right = combine(patches[0], combine(patches[1], patches[2]));
          expect(left).toEqual(right);
          expect(layoutValue(merge(current, third, left))).toBe(layoutValue(merge(current, third, right)));
        },
      ),
    );
  });

  it('should treat a missing earlier patch as no change', () => {
    assert(
      property(optional(layoutArbitrary), layoutArbitrary, layoutArbitrary, (current, base, next) => {
        const patch = diff(base, next);
        expect(layoutValue(merge(current, next, combine(undefined, patch)))).toBe(
          layoutValue(merge(current, next, patch)),
        );
        expect(isEmpty(combine(undefined, patch))).toBe(isEmpty(patch));
      }),
    );
  });

  it('should change nothing when a patch is applied to its own result', () => {
    assert(
      property(optional(layoutArbitrary), layoutArbitrary, layoutArbitrary, (current, base, next) => {
        const patch = diff(base, next);
        const once = merge(current, next, patch);
        expect(layoutValue(merge(once, next, patch))).toBe(layoutValue(once));
      }),
    );
  });

  it("should carry a person's fields onto a record another party changed, and only those", () => {
    assert(
      property(layoutArbitrary, layoutArbitrary, layoutArbitrary, (base, next, foreign) => {
        const patch = diff(base, next);
        const merged = merge(foreign, next, patch);
        const changed = diff(foreign, merged);
        // A second diff from the foreign record names no tree or lane the person did not change.
        expect(changed.viewer === undefined || patch.viewer !== undefined).toBe(true);
        expect(changed.workbench === undefined || patch.workbench !== undefined).toBe(true);
        for (const lane of Object.keys(changed.lanes ?? {})) {
          expect(Object.keys(patch.lanes ?? {})).toContain(lane);
        }
      }),
    );
  });
});

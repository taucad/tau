import { describe, expect, it } from 'vitest';
import {
  array,
  assert,
  boolean,
  constant,
  constantFrom,
  dictionary,
  integer,
  oneof,
  option,
  property,
  record,
  tuple,
  uniqueArray,
} from 'fast-check';
import type { Arbitrary } from 'fast-check';
import type { WorkbenchView } from '@taucad/workbench';
import { viewRecordPolicy } from '#workbench-records/view-record-policy.js';

type KernelView = NonNullable<WorkbenchView['kernelViews']>[number];

const optional = <T>(arbitrary: Arbitrary<T>): Arbitrary<T | undefined> => option(arbitrary, { nil: undefined });

const cameraArbitrary: Arbitrary<WorkbenchView['camera']> = oneof(
  record({ kind: constant('preset' as const), preset: constantFrom('isometric' as const, 'front' as const) }),
  record({
    kind: constant('look' as const),
    direction: tuple(integer({ min: 1, max: 2 }), constant(0), constant(1)),
  }),
);

const kernelViewArbitrary = (id: string): Arbitrary<KernelView> =>
  record({
    id: constant(id),
    options: optional(dictionary(constantFrom('a', 'b', 'c'), oneof(boolean(), integer({ min: 0, max: 2 })))),
    authoredInstance: optional(constantFrom('one', 'two')),
    camera: optional(cameraArbitrary),
  });

const viewArbitrary: Arbitrary<WorkbenchView> = record({
  version: constant(1 as const),
  entryPath: constantFrom(null, 'main.ts', 'part.ts'),
  name: optional(constantFrom('Front', 'Joint')),
  camera: cameraArbitrary,
  fieldOfView: constantFrom(0, 45, 60),
  upDirection: constantFrom('y' as const, 'z' as const),
  display: record({
    surfaces: boolean(),
    lines: boolean(),
    gizmo: boolean(),
    grid: boolean(),
    axes: boolean(),
    matcap: boolean(),
    postProcessing: boolean(),
  }),
  grid: record({ unit: constantFrom('mm' as const, 'in' as const) }),
  section: constant({ active: false, cuts: [] }),
  measurements: array(
    record({
      id: constantFrom('m1', 'm2'),
      frameId: constant('tau:root'),
      startPoint: constant([0, 0, 0] as [number, number, number]),
      endPoint: constant([1, 0, 0] as [number, number, number]),
      distance: constant(1),
    }),
    { maxLength: 2 },
  ),
  selectedKernelView: optional(constantFrom('k1', 'k2')),
  kernelViews: optional(
    uniqueArray(constantFrom('k1', 'k2', 'k3'), { maxLength: 3 }).chain((ids) =>
      tuple(...ids.map((id) => kernelViewArbitrary(id))),
    ),
  ),
});

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sorted(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, item === undefined ? '<undefined>' : sorted(item)]),
    );
  }
  return value;
};

/**
 * A view as the file means it. The record lists kernel views in the order they were added, and a kernel view with no
 * options or a view with no kernel views may be written either way; none of that is a person's change.
 */
const viewValue = (view: WorkbenchView): string =>
  JSON.stringify(
    sorted(
      JSON.parse(
        JSON.stringify({
          ...view,
          kernelViews:
            view.kernelViews === undefined || view.kernelViews.length === 0
              ? undefined
              : view.kernelViews
                  .map((kernelView) => ({
                    ...kernelView,
                    options:
                      kernelView.options && Object.keys(kernelView.options).length > 0 ? kernelView.options : undefined,
                  }))
                  .toSorted((left, right) => left.id.localeCompare(right.id)),
        }),
      ),
    ),
  );

const { diff, combine, merge, isEmpty } = viewRecordPolicy;

describe('viewRecordPolicy patch algebra', () => {
  it('should rebuild the next record from a base and the diff to it', () => {
    assert(
      property(optional(viewArbitrary), viewArbitrary, (base, next) => {
        expect(viewValue(merge(base, next, diff(base, next)))).toBe(viewValue(next));
      }),
    );
  });

  it('should find no difference between a record and itself', () => {
    assert(
      property(viewArbitrary, (view) => {
        expect(isEmpty(diff(view, view))).toBe(true);
      }),
    );
  });

  it('should combine the patches of one edit history into the patch of the whole history', () => {
    assert(
      property(optional(viewArbitrary), viewArbitrary, viewArbitrary, (base, middle, last) => {
        const combined = combine(diff(base, middle), diff(middle, last));
        expect(viewValue(merge(base, last, combined))).toBe(viewValue(last));
      }),
    );
  });

  it('should combine the patches of one edit history associatively: either grouping merges to the same record', () => {
    assert(
      property(
        optional(viewArbitrary),
        optional(viewArbitrary),
        viewArbitrary,
        viewArbitrary,
        viewArbitrary,
        (current, base, first, second, third) => {
          const patches = [diff(base, first), diff(first, second), diff(second, third)] as const;
          const left = combine(combine(patches[0], patches[1]), patches[2]);
          const right = combine(patches[0], combine(patches[1], patches[2]));
          expect(viewValue(merge(current, third, left))).toBe(viewValue(merge(current, third, right)));
        },
      ),
    );
  });

  it('should treat a missing earlier patch as no change', () => {
    assert(
      property(optional(viewArbitrary), viewArbitrary, viewArbitrary, (current, base, next) => {
        const patch = diff(base, next);
        expect(viewValue(merge(current, next, combine(undefined, patch)))).toBe(viewValue(merge(current, next, patch)));
        expect(isEmpty(combine(undefined, patch))).toBe(isEmpty(patch));
      }),
    );
  });

  it('should change nothing when a patch is applied to its own result', () => {
    assert(
      property(optional(viewArbitrary), viewArbitrary, viewArbitrary, (current, base, next) => {
        const patch = diff(base, next);
        const once = merge(current, next, patch);
        expect(viewValue(merge(once, next, patch))).toBe(viewValue(once));
      }),
    );
  });

  it("should carry a person's fields onto a record another party changed", () => {
    assert(
      property(viewArbitrary, viewArbitrary, viewArbitrary, (base, next, foreign) => {
        const patch = diff(base, next);
        const merged = merge(foreign, next, patch);
        // A second diff from the foreign record names no field the person did not change.
        for (const field of Object.keys(diff(foreign, merged))) {
          expect(Object.keys(patch)).toContain(field);
        }
      }),
    );
  });
});

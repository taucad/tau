import { expect, it } from 'vitest';
import { flatActionNativeOracle } from '#support/parts-assemblies-occurrence-actions.js';

it('keeps source placement once and authored mm corners separate from canonical render transforms', () => {
  const rows = ['flat-a', 'flat-b', 'flat-c', 'flat-d'].map((id) => ({
    ancestry: [id],
    component: { id: 'actual-canonical-' + id },
  }));
  const expected = flatActionNativeOracle(rows);
  expect(expected[0]?.min).toEqual([20, 0, -7]);
  expect(expected[0]?.max).toEqual([40, 4, 7]);
  expect(expected[0]?.corners).toHaveLength(8);
  expect((expected[1]?.min[0] ?? Number.NaN) - (expected[0]?.max[0] ?? Number.NaN)).toBe(10);
});
it('denies duplicate, nested and absent canonical mappings before independent native admission', () => {
  const rows = ['flat-a', 'flat-b', 'flat-c', 'flat-d'].map((id) => ({ ancestry: [id], component: { id } }));
  expect(() => flatActionNativeOracle([...rows, rows[0]!])).toThrow('Exactly one');
  expect(() => flatActionNativeOracle(rows.slice(1))).toThrow('Exactly one');
  expect(() => flatActionNativeOracle(rows.map((row) => ({ ...row, ancestry: ['group', ...row.ancestry] })))).toThrow(
    'Exactly one',
  );
});

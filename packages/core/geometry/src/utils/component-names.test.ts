import { describe, expect, it } from 'vitest';

import {
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
  uniqueComponentId,
} from '#utils/component-names.js';

describe('component names', () => {
  it('formats component IDs and selectors', () => {
    expect(formatComponentId(12)).toBe('component:node-12');
    expect(formatNodeSelector(2)).toBe('node/2');
    expect(formatPrimitiveSelector(2, 'surface')).toBe('node/2/surface');
    expect(formatPrimitiveSelector(2, 'edges')).toBe('node/2/edges');
  });

  it('rejects invalid node indexes', () => {
    expect(() => formatComponentId(-1)).toThrow(RangeError);
    expect(() => formatNodeSelector(1.5)).toThrow(RangeError);
  });

  it('uses semantic names but omits generated names', () => {
    expect(formatNamedComponentId('Planet Gear 4', 3)).toBe('component:planet-gear-4');
    expect(formatNamedComponentId('Shape 1', 0)).toBeUndefined();
    expect(formatNamedComponentId('Shape_1', 0)).toBeUndefined();
    expect(formatNamedComponentId('***', 0)).toBeUndefined();
  });

  it('keeps the first ID and suffixes later collisions, skipping IDs already emitted', () => {
    const usedIds = new Map<string, number>();
    const ids = ['Bolt +X', 'Bolt -X', 'Bolt X 3', 'Bolt x'].map((name, index) =>
      uniqueComponentId(formatNamedComponentId(name, index)!, usedIds),
    );

    expect(ids).toEqual(['component:bolt-x', 'component:bolt-x-2', 'component:bolt-x-3', 'component:bolt-x-4']);
  });
});

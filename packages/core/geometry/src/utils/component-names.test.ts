import { describe, expect, it } from 'vitest';

import {
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
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
});

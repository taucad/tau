import { describe, expect, it } from 'vitest';
import {
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
} from '#utils/component-names.utils.js';

describe('component names', () => {
  it('should format component IDs and selectors as payload addresses', () => {
    expect(formatComponentId(0)).toBe('component:node-0');
    expect(formatComponentId(12)).toBe('component:node-12');
    expect(formatNodeSelector(2)).toBe('node/2');
    expect(formatPrimitiveSelector(2, 'surface')).toBe('node/2/surface');
    expect(formatPrimitiveSelector(2, 'edges')).toBe('node/2/edges');
  });

  it('should reject invalid component and selector indexes', () => {
    expect(() => formatComponentId(-1)).toThrow(RangeError);
    expect(() => formatNodeSelector(1.5)).toThrow(RangeError);
  });

  it('should format named component IDs from semantic shape names', () => {
    expect(formatNamedComponentId('Cover', 0)).toBe('component:cover');
    expect(formatNamedComponentId('Planet Gear 4', 3)).toBe('component:planet-gear-4');
    expect(formatNamedComponentId('  Ring/Gear  ', 1)).toBe('component:ring-gear');
  });

  it('should omit named component IDs for generated labels', () => {
    expect(formatNamedComponentId('', 0)).toBeUndefined();
    expect(formatNamedComponentId('Shape 1', 0)).toBeUndefined();
    expect(formatNamedComponentId('Shape_1', 0)).toBeUndefined();
    expect(formatNamedComponentId('***', 0)).toBeUndefined();
  });
});

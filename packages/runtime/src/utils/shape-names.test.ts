import { describe, expect, it } from 'vitest';
import {
  formatShapeName,
  isLegacyGeneratedShapeName,
  normalizeShapeName,
  resolveShapeName,
  uniqueShapeName,
} from '#utils/shape-names.js';

describe('shape names', () => {
  it('should format generated shape names with one-indexed ordinals', () => {
    expect(formatShapeName(0)).toBe('Shape 1');
    expect(formatShapeName(1)).toBe('Shape 2');
    expect(formatShapeName(12)).toBe('Shape 13');
  });

  it('should reject invalid generated shape indexes', () => {
    expect(() => formatShapeName(-1)).toThrow(RangeError);
    expect(() => formatShapeName(1.5)).toThrow(RangeError);
  });

  it('should trim explicit shape names and ignore blanks', () => {
    expect(normalizeShapeName('  Housing  ')).toBe('Housing');
    expect(normalizeShapeName('   ')).toBeUndefined();
    expect(normalizeShapeName(undefined)).toBeUndefined();
  });

  it('should preserve authored names even when they look like old generated names', () => {
    expect(resolveShapeName({ index: 0, name: 'Shape_0', source: 'authored' })).toBe('Shape_0');
    expect(resolveShapeName({ index: 1, name: 'Geometry', source: 'authored' })).toBe('Geometry');
    expect(resolveShapeName({ index: 2, name: 'Mesh', source: 'authored' })).toBe('Mesh');
  });

  it('should replace generated legacy names with canonical shape names', () => {
    expect(resolveShapeName({ index: 0, name: 'AnyShape', source: 'generated' })).toBe('Shape 1');
    expect(resolveShapeName({ index: 1, name: 'AnyShape 0', source: 'generated' })).toBe('Shape 2');
    expect(resolveShapeName({ index: 2, name: 'Shape_2', source: 'generated' })).toBe('Shape 3');
    expect(resolveShapeName({ index: 3, name: 'Geometry', source: 'external-generated' })).toBe('Shape 4');
    expect(resolveShapeName({ index: 4, name: 'Mesh', source: 'external-generated' })).toBe('Shape 5');
  });

  it('should detect legacy generated shape names', () => {
    expect(isLegacyGeneratedShapeName('Shape_0')).toBe(true);
    expect(isLegacyGeneratedShapeName('AnyShape 1')).toBe(true);
    expect(isLegacyGeneratedShapeName('Geometry')).toBe(true);
    expect(isLegacyGeneratedShapeName('Mesh')).toBe(true);
    expect(isLegacyGeneratedShapeName('Shape 1')).toBe(false);
    expect(isLegacyGeneratedShapeName('Housing')).toBe(false);
  });

  it('should add stable suffixes for duplicate names', () => {
    const usedNames = new Map<string, number>();
    expect(uniqueShapeName('Planet Gear', usedNames)).toBe('Planet Gear');
    expect(uniqueShapeName('Planet Gear', usedNames)).toBe('Planet Gear 2');
    expect(uniqueShapeName('Planet Gear', usedNames)).toBe('Planet Gear 3');
  });
});

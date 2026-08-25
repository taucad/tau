import { describe, expect, it } from 'vitest';
import {
  isGeneratedMaterialName,
  isGeneratedSceneName,
  normalizeGeometryName,
  resolveMaterialName,
  resolveSceneName,
} from '#utils/geometry-names.js';

describe('geometry names', () => {
  it('should trim names and collapse blank names', () => {
    expect(normalizeGeometryName('  Bracket  ')).toBe('Bracket');
    expect(normalizeGeometryName('   ')).toBeUndefined();
    expect(normalizeGeometryName(undefined)).toBeUndefined();
  });

  it('should preserve authored and imported material names', () => {
    const importedGeneratedLookingName = ['Material', 'Default'].join('_');
    expect(resolveMaterialName({ name: '  brushed aluminum ', source: 'authored' })).toBe('brushed aluminum');
    expect(resolveMaterialName({ name: importedGeneratedLookingName, source: 'imported' })).toBe(
      importedGeneratedLookingName,
    );
  });

  it('should omit Tau-generated material names unless they are semantic roles', () => {
    const defaultMaterialName = 'default';
    expect(resolveMaterialName({ name: defaultMaterialName, source: 'generated' })).toBeUndefined();
    expect(resolveMaterialName({ name: 'surface paint', source: 'generated' })).toBeUndefined();
    expect(resolveMaterialName({ name: 'cutting plane cap', source: 'generated', semanticRole: true })).toBe(
      'cutting plane cap',
    );
  });

  it('should clear known externally generated material names only', () => {
    expect(isGeneratedMaterialName('default')).toBe(true);
    expect(isGeneratedMaterialName(['rg', 'ba(51,102,204,1.00)'].join(''))).toBe(true);
    expect(isGeneratedMaterialName(['outline', 'Shape 1'].join('-'))).toBe(true);

    const generatedMaterialName = ['Material', 'Default'].join('_');
    expect(isGeneratedMaterialName(generatedMaterialName)).toBe(true);
    expect(resolveMaterialName({ name: generatedMaterialName, source: 'external-generated' })).toBeUndefined();
    expect(resolveMaterialName({ name: 'brass', source: 'external-generated' })).toBe('brass');
  });

  it('should preserve authored scene names and omit generated scene fallbacks', () => {
    expect(resolveSceneName({ name: 'Presentation Scene', source: 'authored' })).toBe('Presentation Scene');
    expect(resolveSceneName({ name: 'Scene', source: 'external-generated' })).toBeUndefined();
    expect(resolveSceneName({ name: 'Scene', source: 'generated' })).toBeUndefined();
    expect(isGeneratedSceneName('Scene')).toBe(true);
  });
});

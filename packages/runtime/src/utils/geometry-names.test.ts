import { describe, expect, it } from 'vitest';
import {
  formatAssemblyArtifactName,
  formatComponentId,
  formatNamedComponentId,
  formatModelArtifactName,
  formatNodeSelector,
  formatPrimitiveSelector,
  isGeneratedMaterialName,
  isGeneratedSceneName,
  normalizeGeometryName,
  resolveMaterialName,
  resolveSceneName,
  uniqueArtifactName,
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

  it('should format artifact names by export intent', () => {
    expect(formatModelArtifactName('glb')).toBe('model.glb');
    expect(formatModelArtifactName('.gltf')).toBe('model.gltf');
    expect(formatAssemblyArtifactName()).toBe('assembly');
    expect(formatAssemblyArtifactName('step')).toBe('assembly.step');
  });

  it('should sanitize and deduplicate per-shape artifact names', () => {
    const usedNames = new Map<string, number>();
    expect(uniqueArtifactName({ basename: 'Left/Bracket', extension: 'stl' }, usedNames)).toBe('Left_Bracket.stl');
    expect(uniqueArtifactName({ basename: 'Left/Bracket', extension: 'stl' }, usedNames)).toBe('Left_Bracket 2.stl');
    expect(uniqueArtifactName({ basename: '   ', extension: 'stl' }, usedNames)).toBe('Shape.stl');
  });
});

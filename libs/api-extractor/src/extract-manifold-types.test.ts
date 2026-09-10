import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBundledTypes, manifoldDeclarationSubpaths, resolveManifoldFile } from '#extract-manifold-types.js';

describe('resolveManifoldFile', () => {
  it('should resolve every declaration this extractor reads to an installed file', () => {
    // The previous hard-coded path pointed at a directory that does not exist,
    // and the Nx input glob matched nothing, so the break never invalidated.
    for (const subpath of manifoldDeclarationSubpaths) {
      expect(existsSync(resolveManifoldFile(subpath)), subpath).toBe(true);
    }
  });
});

describe('buildBundledTypes', () => {
  it('should bundle the root module and the manifoldCAD subpath', () => {
    const bundledTypes = buildBundledTypes();

    expect(Object.keys(bundledTypes)).toEqual(['manifold-3d', 'manifold-3d/manifoldCAD']);
    expect(bundledTypes['manifold-3d']).toContain('export interface ManifoldToplevel {');
    expect(bundledTypes['manifold-3d']).not.toContain("from './manifold-global-types'");
    expect(bundledTypes['manifold-3d/manifoldCAD']).not.toMatch(/\nexport\s*{\s*}\s*$/);
  });
});

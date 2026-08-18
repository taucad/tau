/**
 * Type-level tests for the manifold-3d bundled type declarations.
 *
 * Verifies that the generated .d.ts resolves correctly when registered
 * at file:///node_modules/manifold-3d/index.d.ts via Monaco's addExtraLib.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type {
  Manifold,
  CrossSection,
  Mesh,
  Vec2,
  Vec3,
  Box,
  Rect,
  ManifoldToplevel,
  triangulate,
} from 'manifold-3d';
import type initManifold from 'manifold-3d';

describe('manifold-3d module resolution', () => {
  it('default export is a module init function', () => {
    expectTypeOf<typeof initManifold>().toBeFunction();
    expectTypeOf<ReturnType<typeof initManifold>>().toMatchTypeOf<Promise<ManifoldToplevel>>();
  });

  it('exports core geometry classes', () => {
    expectTypeOf<Manifold>().toBeObject();
    expectTypeOf<CrossSection>().toBeObject();
    expectTypeOf<Mesh>().toBeObject();
  });

  it('exports vector types', () => {
    expectTypeOf<Vec2>().not.toBeAny();
    expectTypeOf<Vec3>().not.toBeAny();
  });

  it('exports bounding types', () => {
    expectTypeOf<Box>().not.toBeAny();
    expectTypeOf<Rect>().not.toBeAny();
  });

  it('triangulate function exists', () => {
    expectTypeOf<typeof triangulate>().toBeFunction();
  });

  it('ManifoldToplevel has expected members', () => {
    expectTypeOf<ManifoldToplevel>().toHaveProperty('Manifold');
    expectTypeOf<ManifoldToplevel>().toHaveProperty('CrossSection');
    expectTypeOf<ManifoldToplevel>().toHaveProperty('triangulate');
  });
});

describe('manifold-3d/manifoldCAD subpath resolution', () => {
  it('resolves the manifoldCAD subpath module', async () => {
    type ManifoldCAD = typeof import('manifold-3d/manifoldCAD');
    expectTypeOf<ManifoldCAD>().toBeObject();
  });
});

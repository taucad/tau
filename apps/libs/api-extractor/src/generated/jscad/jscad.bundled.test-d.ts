/**
 * Type-level tests for the @jscad/modeling bundled type declarations.
 *
 * Verifies that the generated .d.ts resolves correctly when registered
 * at file:///node_modules/@jscad/modeling/index.d.ts via Monaco's addExtraLib.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { primitives, booleans, transforms, extrusions, measurements, colors, hulls } from '@jscad/modeling';
import type { Geom2, Geom3, Vec2, Vec3, Mat4 } from '@jscad/modeling';
import type { cube, sphere, cylinder } from '@jscad/modeling/primitives';
import type { union, subtract, intersect } from '@jscad/modeling/booleans';
import type { translate, rotate, scale } from '@jscad/modeling/transforms';

describe('@jscad/modeling main module resolution', () => {
  it('exports namespace objects for each submodule', () => {
    expectTypeOf<typeof primitives>().toBeObject();
    expectTypeOf<typeof booleans>().toBeObject();
    expectTypeOf<typeof transforms>().toBeObject();
    expectTypeOf<typeof extrusions>().toBeObject();
    expectTypeOf<typeof measurements>().toBeObject();
    expectTypeOf<typeof colors>().toBeObject();
    expectTypeOf<typeof hulls>().toBeObject();
  });

  it('exports foundation geometry types', () => {
    expectTypeOf<Geom2>().toBeObject();
    expectTypeOf<Geom3>().toBeObject();
  });

  it('exports foundation math types', () => {
    expectTypeOf<Vec2>().not.toBeAny();
    expectTypeOf<Vec3>().not.toBeAny();
    expectTypeOf<Mat4>().not.toBeAny();
  });
});

describe('@jscad/modeling/primitives subpath resolution', () => {
  it('exports primitive functions', () => {
    expectTypeOf<typeof cube>().toBeFunction();
    expectTypeOf<typeof sphere>().toBeFunction();
    expectTypeOf<typeof cylinder>().toBeFunction();
  });

  it('cube returns Geom3', () => {
    expectTypeOf<ReturnType<typeof cube>>().toMatchTypeOf<Geom3>();
  });
});

describe('@jscad/modeling/booleans subpath resolution', () => {
  it('exports boolean operation functions', () => {
    expectTypeOf<typeof union>().toBeFunction();
    expectTypeOf<typeof subtract>().toBeFunction();
    expectTypeOf<typeof intersect>().toBeFunction();
  });
});

describe('@jscad/modeling/transforms subpath resolution', () => {
  it('exports transform functions', () => {
    expectTypeOf<typeof translate>().toBeFunction();
    expectTypeOf<typeof rotate>().toBeFunction();
    expectTypeOf<typeof scale>().toBeFunction();
  });
});

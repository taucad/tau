/**
 * Type-level tests for the SMLib bundled type declarations.
 *
 * Verifies that the generated declarations resolve as the editor mounts them at
 * `/node_modules/@classcad/smlibwasm` and `/node_modules/@taucad/smlib`.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { Edge, Face, Locations, Mesh, Part, ShapeList, Sketch, Wire } from '@classcad/smlibwasm';
import type { Material, Model, ShapeConfig, SmlibShape } from '@taucad/smlib/model';

describe('@classcad/smlibwasm module resolution', () => {
  it('exports the body, face, curve and mesh classes', () => {
    expectTypeOf<Part>().toBeObject();
    expectTypeOf<Sketch>().toBeObject();
    expectTypeOf<Face>().toBeObject();
    expectTypeOf<Edge>().toBeObject();
    expectTypeOf<Wire>().toBeObject();
    expectTypeOf<Mesh>().toBeObject();
  });

  it('gives parts boolean, fillet and selector methods', () => {
    expectTypeOf<Part>().toHaveProperty('fuse');
    expectTypeOf<Part>().toHaveProperty('cut');
    expectTypeOf<Part>().toHaveProperty('intersect');
    expectTypeOf<Part>().toHaveProperty('fillet');
    expectTypeOf<ReturnType<Part['edges']>>().toEqualTypeOf<ShapeList<Edge>>();
  });

  it('patterns shapes through Locations.mul', () => {
    expectTypeOf<Locations>().toHaveProperty('mul');
  });
});

describe('@taucad/smlib/model module resolution', () => {
  it('resolves the return contract without any', () => {
    expectTypeOf<ShapeConfig>().not.toBeAny();
    expectTypeOf<Model>().toHaveProperty('shapes');
    expectTypeOf<Material>().not.toBeAny();
    expectTypeOf<Part>().toExtend<SmlibShape>();
  });
});

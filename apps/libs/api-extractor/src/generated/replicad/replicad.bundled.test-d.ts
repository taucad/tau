/**
 * Type-level tests for the replicad bundled type declarations.
 *
 * Verifies that the generated .d.ts resolves correctly when registered
 * at file:///node_modules/replicad/index.d.ts via Monaco's addExtraLib.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type {
  Solid,
  Face,
  Edge,
  Wire,
  Blueprint,
  BlueprintSketcher,
  AnyShape,
  Sketcher,
  Drawing,
} from 'replicad';

describe('replicad module resolution', () => {
  it('exports core shape classes', () => {
    expectTypeOf<Solid>().toBeObject();
    expectTypeOf<Face>().toBeObject();
    expectTypeOf<Edge>().toBeObject();
    expectTypeOf<Wire>().toBeObject();
  });

  it('exports sketching classes', () => {
    expectTypeOf<Blueprint>().toBeObject();
    expectTypeOf<BlueprintSketcher>().toBeObject();
    expectTypeOf<Sketcher>().toBeObject();
  });

  it('exports Drawing class', () => {
    expectTypeOf<Drawing>().toBeObject();
  });

  it('AnyShape union type resolves without any', () => {
    expectTypeOf<AnyShape>().not.toBeAny();
  });

  it('Solid has boolean operation methods', () => {
    expectTypeOf<Solid>().toHaveProperty('fuse');
    expectTypeOf<Solid>().toHaveProperty('cut');
    expectTypeOf<Solid>().toHaveProperty('fillet');
  });
});

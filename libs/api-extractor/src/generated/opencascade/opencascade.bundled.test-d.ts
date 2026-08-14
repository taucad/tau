/**
 * Type-level tests for the libcascade bundled type declarations.
 *
 * Verifies that the generated .d.ts resolves correctly when registered
 * at file:///node_modules/libcascade/index.d.ts via Monaco's addExtraLib.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { BRepPrimAPI_MakeBox, gp_Pnt, TopExp_Explorer, type OpenCascadeInstance, type TopoDS_Shape } from 'libcascade';
import oc from 'libcascade';

describe('libcascade module resolution', () => {
  it('default export is the initialized OpenCascade instance', () => {
    expectTypeOf<typeof oc>().toEqualTypeOf<OpenCascadeInstance>();
  });

  it('exports key OCCT class types', () => {
    expectTypeOf<gp_Pnt>().toBeObject();
    expectTypeOf<BRepPrimAPI_MakeBox>().toBeObject();
    expectTypeOf<TopExp_Explorer>().toBeObject();
    expectTypeOf<TopoDS_Shape>().toBeObject();
  });

  it('exports initialized OCCT classes as named runtime values', () => {
    expectTypeOf<typeof gp_Pnt>().toBeConstructibleWith();
    expectTypeOf<typeof BRepPrimAPI_MakeBox>().toBeConstructibleWith();
    expectTypeOf<typeof TopExp_Explorer>().toBeConstructibleWith();
  });

  it('OpenCascadeInstance has FS property', () => {
    expectTypeOf<OpenCascadeInstance>().toHaveProperty('FS');
  });

  it('class types have delete() method', () => {
    expectTypeOf<gp_Pnt>().toHaveProperty('delete');
    expectTypeOf<BRepPrimAPI_MakeBox>().toHaveProperty('delete');
    expectTypeOf<TopoDS_Shape>().toHaveProperty('delete');
  });

  it('class types have Symbol.dispose for using declarations', () => {
    expectTypeOf<gp_Pnt>().toHaveProperty(Symbol.dispose);
    expectTypeOf<BRepPrimAPI_MakeBox>().toHaveProperty(Symbol.dispose);
    expectTypeOf<TopoDS_Shape>().toHaveProperty(Symbol.dispose);
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys use standardized names. */
import { expectTypeOf, it } from 'vitest';
import { makeCylinder } from 'replicad';
import type { Material, Model, ShapeConfig } from '@taucad/replicad/model';

it('should expose the standard glTF material vocabulary at the authoring subpath', () => {
  const material = { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } } } satisfies Material;
  const model = { shapes: [{ shape: makeCylinder(10, 20), material }] } satisfies Model;
  expectTypeOf(model).toExtend<Model>();
  // @ts-expect-error Standard materials and legacy color overrides are mutually exclusive.
  const ambiguous: ShapeConfig = { shape: makeCylinder(10, 20), material, metalness: 1 };
  expectTypeOf(ambiguous).toExtend<ShapeConfig>();
  // @ts-expect-error Anisotropy strength is a number, not a CSS color.
  const invalid: Material = { extensions: { KHR_materials_anisotropy: { anisotropyStrength: '#888' } } };
  expectTypeOf(invalid).toExtend<Material>();
});

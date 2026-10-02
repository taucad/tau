import { expectTypeOf, test } from 'vitest';
import type { SpatialMatrix } from '@taucad/spatial';
import { writeGlb, writeGltfJson } from '#index.js';
import type { GlbNode, GlbPrimitive } from '#index.js';

test('should retain the inline public writer surface with compact indices and typed placements', () => {
  const primitive: GlbPrimitive = {
    mode: 4,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2]),
    material: {},
  };
  const matrix: SpatialMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1];
  const primitives = [primitive];
  const nodes: GlbNode[] = [
    { primitives, matrix },
    { primitives, matrix },
  ];
  expectTypeOf(writeGlb({ nodes })).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
  expectTypeOf(writeGltfJson({ nodes })).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
  primitive.indices = new Uint32Array([0, 1, 2]);
  expectTypeOf(primitive.indices).toEqualTypeOf<Uint32Array>();

  // @ts-expect-error index components must use a supported unsigned integer width
  primitive.indices = new Float32Array([0, 1, 2]);
  // @ts-expect-error placement uses the existing sixteen-element SpatialMatrix contract
  const shortPlacement: GlbNode = { primitives, matrix: [1, 0, 0, 1] };
  // @ts-expect-error author input remains inline and does not expose a mesh-reference facade
  const meshReference: GlbNode = { mesh: 0, matrix };
  expectTypeOf(shortPlacement).toEqualTypeOf<GlbNode>();
  expectTypeOf(meshReference).toEqualTypeOf<GlbNode>();
});

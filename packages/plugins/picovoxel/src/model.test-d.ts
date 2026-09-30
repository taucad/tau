import { expectTypeOf } from 'vitest';
import type { Pico } from 'picovoxel';
import type { Image, Material, PicovoxelModel, PicovoxelPart, PicovoxelResult, Resources } from '@taucad/picovoxel';
import type { GlbImage, GlbMaterial, GlbResources } from '@taucad/geometry-core';

declare const pico: Pico;
const shape = pico.createVoxels({ shape: 'sphere', radius: 10 });
const mesh = shape.toMesh();
const named = { shape, name: 'Housing' };
const mixed = [named, mesh, { shape: mesh }] as const;
expectTypeOf(shape).toExtend<PicovoxelResult>();
expectTypeOf(mesh).toExtend<PicovoxelResult>();
expectTypeOf(named).toExtend<PicovoxelResult>();
expectTypeOf(mixed).toExtend<PicovoxelResult>();
expectTypeOf([] as const).toExtend<PicovoxelResult>();
expectTypeOf<Material>().toEqualTypeOf<GlbMaterial>();
expectTypeOf<Image>().toEqualTypeOf<GlbImage>();
expectTypeOf<Resources>().toEqualTypeOf<GlbResources>();
const appearance: Material = {
  pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1], metallicFactor: 1 },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Standard glTF material extension.
  extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.5 } },
};
const part: PicovoxelPart = { shape, name: 'Metal', material: appearance };
const model: PicovoxelModel = {
  shapes: [part, mesh] as const,
  images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }],
  textures: [{ source: 0 }],
};
expectTypeOf(model).toExtend<PicovoxelResult>();
// @ts-expect-error material factors use the shared numeric vocabulary
const badMaterial: PicovoxelResult = { shape, material: { pbrMetallicRoughness: { metallicFactor: 'metal' } } };
// @ts-expect-error resources are model-level, not part-local
const localImages: PicovoxelPart = { shape, images: [] };
// @ts-expect-error model resource envelopes contain flat part lists
const nestedModel: PicovoxelModel = { shapes: [[shape]] };
// @ts-expect-error descriptors require their own shape
const noShape: PicovoxelPart = { material: appearance };
// @ts-expect-error names are strings
const badName: PicovoxelResult = { shape, name: 42 };
// @ts-expect-error name alone is not a part
const missing: PicovoxelResult = { name: 'Missing' };
// @ts-expect-error output lists are flat
const nested: PicovoxelResult = [[shape]];
// @ts-expect-error naming does not introduce assembly children
const assembly: PicovoxelResult = { shape, name: 'Assembly', children: [shape] };
void [badName, missing, nested, assembly, badMaterial, localImages, nestedModel, noShape];

import { expectTypeOf } from 'vitest';
import type { Pico } from 'picovoxel';
import type { PicovoxelResult } from '@taucad/picovoxel';

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
// @ts-expect-error names are strings
const badName: PicovoxelResult = { shape, name: 42 };
// @ts-expect-error name alone is not a part
const missing: PicovoxelResult = { name: 'Missing' };
// @ts-expect-error output lists are flat
const nested: PicovoxelResult = [[shape]];
// @ts-expect-error naming does not introduce assembly children
const assembly: PicovoxelResult = { shape, name: 'Assembly', children: [shape] };
void [badName, missing, nested, assembly];

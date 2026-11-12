# PicoVoxel stylised characters reference

Use this reference when a request is a stylised, toy-like character: a mascot, a chess piece, a low-detail creature or figurine. Build it in PicoVoxel from blended signed-distance shapes and say in one sentence that it is stylised. A realistic sculpt (a likeness, fine anatomy, hair, cloth, a textured game asset) is not built here: state that plainly and offer the stylised version first.

## Method

Write every part as an `SdfExpression`, join the parts with a smooth union so they melt into one body, carve details with a sharp subtraction, and fill the whole field with one `createVoxels({ shape: 'implicit' })` call. One field gives one watertight body with no internal faces, which is what a print or an export needs. Size the bounds to the parts plus the blend width, and choose `voxelSize` from the thinnest feature (an ear, a beak) as the kernel rules say.

## Helpers

PicoVoxel has no smooth-union operator or ellipsoid primitive of its own. Copy these into `lib/sdf.ts` and import them with `./lib/sdf.js`. They name each operand once, because the expression compiler does not share repeated subtrees and a fold of the polynomial `smin` doubles the expression at every step.

```typescript
import type { SdfExpression, Vec3 } from 'picovoxel';

const square = (value: SdfExpression): SdfExpression => ['*', value, value];
const offset = ([cx, cy, cz]: Vec3): readonly [SdfExpression, SdfExpression, SdfExpression] => [
  ['-', 'x', cx],
  ['-', 'y', cy],
  ['-', 'z', cz],
];

export const sphere = (center: Vec3, radius: number): SdfExpression => {
  const [x, y, z] = offset(center);
  return ['-', ['sqrt', ['+', square(x), square(y), square(z)]], radius];
};

/** Axis-aligned ellipsoid (Quílez bound): exact on the axes, close elsewhere. */
export const ellipsoid = (center: Vec3, [rx, ry, rz]: Vec3): SdfExpression => {
  const [x, y, z] = offset(center);
  const k0: SdfExpression = ['sqrt', ['+', square(['/', x, rx]), square(['/', y, ry]), square(['/', z, rz])]];
  const k1: SdfExpression = [
    'sqrt',
    ['+', square(['/', x, rx * rx]), square(['/', y, ry * ry]), square(['/', z, rz * rz])],
  ];
  return ['/', ['*', k0, ['-', k0, 1]], ['max', k1, 1e-9]];
};

/** Smooth union (exponential smin): seams filleted over about `blend` mm; each operand appears once. */
export const smoothUnion = (blend: number, first: SdfExpression, ...rest: SdfExpression[]): SdfExpression => {
  if (rest.length === 0 || blend <= 0) return rest.length === 0 ? first : ['min', first, ...rest];
  const k = blend / (4 * Math.LN2);
  const term = (field: SdfExpression): SdfExpression => ['exp', ['/', ['-', 0, field], k]];
  return ['*', -k, ['log', ['+', term(first), ...rest.map(term)]]];
};

/** Sharp subtraction: eye sockets, a mouth. */
export const subtract = (body: SdfExpression, cut: SdfExpression): SdfExpression => ['max', body, ['-', 0, cut]];
```

A capsule (limbs, ears, tails) and a mirror helper are in the `picovoxel.stylised-character` example's `lib/sdf.ts`.

## Example

```typescript
import type { Pico } from 'picovoxel';
import type { PicovoxelResult } from '@taucad/picovoxel';
import { ellipsoid, smoothUnion, sphere, subtract } from './lib/sdf.js';

export const defaultParams = { voxelSize: 0.5, blend: 4 };

export default function main(pico: Pico, params = defaultParams): PicovoxelResult {
  const body = ellipsoid([0, 0, 22], [17, 15, 21]);
  const head = ellipsoid([0, 0, 46], [15, 13, 12]);
  const eyes = ['min', sphere([6, -12, 47], 3.5), sphere([-6, -12, 47], 3.5)] as const;
  const shape = pico.createVoxels({
    shape: 'implicit',
    boundsMin: [-24, -20, -1],
    boundsMax: [24, 20, 62],
    sdf: subtract(smoothUnion(params.blend, body, head), eyes),
  });
  return { shape, name: 'Owl' };
}
```

Keep the blend under about a third of the smallest part's radius, or small parts dissolve into their neighbours. Use a sharp `['min', …]` for parts that must stay crisp, such as a mirrored pair joined before the blend.

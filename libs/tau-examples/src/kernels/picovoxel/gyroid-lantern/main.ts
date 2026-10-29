/**
 * A gyroid tea-light lantern.
 *
 * The wall is the gyroid isosurface, clipped to a cylinder and sat on a solid
 * foot. A boundary-representation kernel has no gyroid; it would mesh one
 * after the fact. The field below is the solid.
 */
import type { Pico, SdfExpression, Voxels } from 'picovoxel';

export const defaultParams = {
  /** OpenVDB voxel size. Coarser is faster; finer keeps the gyroid skin. */
  voxelSize: 0.7,
  /** Outside radius of the cylinder. */
  radius: 18,
  /** Lattice height, not counting the foot. */
  height: 32,
  /** Gyroid cell period. */
  period: 11,
  /** Half-thickness of the gyroid sheet. */
  wall: 0.85,
  /** Solid foot under the lattice. */
  baseThickness: 3,
  /** Foot radius past the cylinder. */
  baseLip: 1.5,
};

type Params = typeof defaultParams;

const add = (...terms: SdfExpression[]): SdfExpression => ['+', ...terms];
const mul = (left: SdfExpression, right: SdfExpression): SdfExpression => [
  '*',
  left,
  right,
];
const max = (...terms: SdfExpression[]): SdfExpression => ['max', ...terms];
const min = (...terms: SdfExpression[]): SdfExpression => ['min', ...terms];
const abs = (term: SdfExpression): SdfExpression => ['abs', term];
const sin = (term: SdfExpression): SdfExpression => ['sin', term];
const cos = (term: SdfExpression): SdfExpression => ['cos', term];
const sqrt = (term: SdfExpression): SdfExpression => ['sqrt', term];

const requireLantern = (params: Params): void => {
  const fields = [
    params.voxelSize,
    params.radius,
    params.height,
    params.period,
    params.wall,
    params.baseThickness,
  ];
  if (fields.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Lantern dimensions must be positive.');
  }
  if (!Number.isFinite(params.baseLip) || params.baseLip < 0) {
    throw new RangeError('baseLip must be zero or positive.');
  }
  if (params.wall * 2 >= params.period / 2) {
    throw new RangeError('wall closes the gyroid cells.');
  }
};

/**
 * Cylindrical gyroid shell on a solid foot.
 * @param pico - PicoVoxel session.
 * @param params - Cell size, radius and voxel size.
 * @returns The lantern voxels.
 */
export default function main(
  pico: Pico,
  params: Params = defaultParams,
): Voxels {
  requireLantern(params);
  const scale = (2 * Math.PI) / params.period;
  const axis = (name: 'x' | 'y' | 'z'): SdfExpression => mul(name, scale);
  const field = add(
    mul(sin(axis('x')), cos(axis('y'))),
    mul(sin(axis('y')), cos(axis('z'))),
    mul(sin(axis('z')), cos(axis('x'))),
  );
  const radial = sqrt(add(mul('x', 'x'), mul('y', 'y')));
  const shell = add(abs(field), -params.wall);
  const tube = max(
    shell,
    add(radial, -params.radius),
    add(abs('z'), -params.height / 2),
  );
  const half = params.height / 2;
  // The foot bites 1.2 mm into the lattice so the two fields weld instead of kissing.
  const foot = max(
    add(radial, -(params.radius + params.baseLip)),
    add('z', half - 1.2),
    add(mul('z', -1), -(half + params.baseThickness)),
  );
  const pad = params.radius + params.baseLip + 1;
  return pico.createVoxels({
    shape: 'implicit',
    boundsMin: [-pad, -pad, -(half + params.baseThickness + 1)],
    boundsMax: [pad, pad, half + 1],
    sdf: min(tube, foot),
  });
}

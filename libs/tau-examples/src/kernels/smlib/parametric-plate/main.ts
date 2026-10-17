/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Pos), as in build123d. */
import { Align, Box, Cylinder, GridLocations, Z } from '@classcad/smlibwasm';
import type { ShapeConfig } from '@taucad/smlib/model';

export const defaultParams = {
  length: 80,
  width: 60,
  thickness: 8,
  cornerRadius: 8,
  edgeRadius: 1,
  holeDiameter: 6,
  holeColumns: 3,
  holeRows: 2,
  holeSpacing: 24,
};

const validate = (p: typeof defaultParams): void => {
  const positive = [
    p.length,
    p.width,
    p.thickness,
    p.cornerRadius,
    p.holeDiameter,
    p.holeSpacing,
  ];
  if (!positive.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError(
      'Plate dimensions, radii and spacing must be positive.',
    );
  }
  if (!Number.isInteger(p.holeColumns) || !Number.isInteger(p.holeRows)) {
    throw new RangeError('holeColumns and holeRows must be whole numbers.');
  }
  if (p.holeColumns < 1 || p.holeRows < 1) {
    throw new RangeError('Use at least one hole column and one hole row.');
  }
  if (p.cornerRadius * 2 >= Math.min(p.length, p.width)) {
    throw new RangeError(
      'cornerRadius must be less than half the shorter side.',
    );
  }
  if (p.edgeRadius < 0 || p.edgeRadius * 2 >= p.thickness) {
    throw new RangeError('edgeRadius must be in [0, thickness / 2).');
  }
  const margin = p.holeDiameter / 2 + p.edgeRadius + 2;
  const spanX = (p.holeColumns - 1) * p.holeSpacing;
  const spanY = (p.holeRows - 1) * p.holeSpacing;
  if (spanX / 2 + margin > p.length / 2 || spanY / 2 + margin > p.width / 2) {
    throw new RangeError('The hole grid does not fit on the plate.');
  }
  if (p.holeSpacing <= p.holeDiameter + 2) {
    throw new RangeError('holeSpacing must leave at least 2 mm between holes.');
  }
};

/**
 * A mounting plate: rounded corners, a grid of through holes and softened top edges.
 */
export default function main(p = defaultParams): ShapeConfig {
  validate(p);
  const standing = [Align.CENTER, Align.CENTER, Align.MIN];
  let plate = Box(p.length, p.width, p.thickness, { align: standing });
  plate = plate.fillet(plate.edges().parallelTo(Z), p.cornerRadius);

  const drill = Cylinder(p.holeDiameter / 2, p.thickness, { align: standing });
  plate = plate.cut(
    GridLocations(p.holeSpacing, p.holeSpacing, p.holeColumns, p.holeRows).mul(
      drill,
    ),
  );

  if (p.edgeRadius > 0) {
    plate = plate.fillet(plate.edges().maxBy(Z), p.edgeRadius);
  }

  return {
    name: 'Mounting plate',
    shape: plate,
    material: {
      pbrMetallicRoughness: {
        baseColorFactor: [0.6, 0.63, 0.66, 1],
        metallicFactor: 1,
        roughnessFactor: 0.35,
      },
    },
  };
}

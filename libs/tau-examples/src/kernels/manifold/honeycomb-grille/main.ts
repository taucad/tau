/**
 * Circular honeycomb grille.
 *
 * Every cell is its own hexagonal boolean. Manifold's mesh booleans stay
 * watertight when the cuts share no sliver faces; the same count is where
 * OpenCascade and a CSG preview start to sweat.
 */
import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = {
  /** Outside diameter. */
  diameter: 96,
  /** Plate thickness. */
  thickness: 3.2,
  /** Distance between hex centres. */
  cellSize: 9,
  /** Solid rim inside the outside radius. */
  border: 7,
  /** Hex opening as a fraction of the cell pitch. */
  opening: 0.72,
};

type Params = typeof defaultParams;

const requireGrille = (params: Params): void => {
  if (
    [params.diameter, params.thickness, params.cellSize, params.border].some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  ) {
    throw new RangeError('Grille dimensions must be positive.');
  }
  if (
    !Number.isFinite(params.opening) ||
    params.opening <= 0.2 ||
    params.opening >= 0.95
  ) {
    throw new RangeError(
      'opening must sit between 0.2 and 0.95 so the webs stay.',
    );
  }
  if (params.border * 2 >= params.diameter) {
    throw new RangeError('border consumes the disc.');
  }
};

/**
 * Speaker or vent grille: a disc minus a hex lattice that stops short of the rim.
 * @param params - Diameter, cell pitch, rim and opening fraction.
 * @returns The grille, in a dark metal material.
 */
export default function main(params: Params = defaultParams): GLTFNode {
  requireGrille(params);
  const radius = params.diameter / 2;
  const disc = Manifold.cylinder(params.thickness, radius, -1, 96, true);
  const holeRadius = (params.cellSize * params.opening) / 2;
  const inner = radius - params.border;
  const rowPitch = (params.cellSize * Math.sqrt(3)) / 2;
  const rowCount = Math.ceil(inner / rowPitch);
  const colCount = Math.ceil(inner / params.cellSize);
  const holes: Manifold[] = [];

  for (let row = -rowCount; row <= rowCount; row += 1) {
    for (let col = -colCount; col <= colCount; col += 1) {
      const x =
        col * params.cellSize +
        (Math.abs(row) % 2 === 0 ? 0 : params.cellSize / 2);
      const y = row * rowPitch;
      if (Math.hypot(x, y) + holeRadius > inner) {
        continue;
      }
      holes.push(
        Manifold.cylinder(
          params.thickness + 2,
          holeRadius,
          -1,
          6,
          true,
        ).translate([x, y, 0]),
      );
    }
  }

  const node = new GLTFNode();
  node.manifold =
    holes.length > 0 ? disc.subtract(Manifold.union(holes)) : disc;
  node.material = {
    name: 'Grille',
    baseColorFactor: [0.17, 0.18, 0.19],
    metallic: 0.82,
    roughness: 0.36,
  };
  return node;
}

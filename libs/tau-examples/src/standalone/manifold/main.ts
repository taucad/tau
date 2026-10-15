import { Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = { width: 20, depth: 10, height: 5, hole: 4 };

export default function main(p = defaultParams) {
  const block = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cube([p.hole, p.hole, p.height * 2], true).translate([3, 0, 0]);
  return block.subtract(hole);
}

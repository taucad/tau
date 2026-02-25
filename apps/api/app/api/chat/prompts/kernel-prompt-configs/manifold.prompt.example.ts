import { Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = {
  width: 80,
  depth: 40,
  height: 20,
  holeRadius: 6,
};

export default function main(p = defaultParams) {
  const body = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cylinder(p.height + 2, p.holeRadius, -1, 64, true);

  const leftHole = hole.translate([-p.width * 0.25, 0, 0]);
  const rightHole = hole.translate([p.width * 0.25, 0, 0]);

  return body.subtract(Manifold.union([leftHole, rightHole]));
}

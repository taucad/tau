import type { geometries } from '@jscad/modeling';
import { primitives } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { cylinder } = primitives;

export const defaultParams = {
  height: 20,
  radius: 8,
  segments: 48,
};

export default function main(
  p = defaultParams,
): Geom3 {
  return cylinder({
    height: p.height,
    radius: p.radius,
    segments: p.segments,
  });
}
